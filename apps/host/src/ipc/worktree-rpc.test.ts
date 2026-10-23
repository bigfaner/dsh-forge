// forge:worktree/* 装配面单测：
//   · createWorktreeRpcService——预铸采纳（persistence.create 自铸 id + cwd/agentPreset 头 +
//     挂靠事件 seq 0）/ 封存判定快照（在场性比对）/ 非 git 零清单 / 必绑拦截 guard；
//   · registerWorktreeChannels——allowlist 注册（键键对应 contracts WORKTREE_CHANNELS）；
//   · interceptSessionSends——assertSendable 接入 host 消息处理链（封存拒绝 + 明确错误；
//     未绑定/未封存放行；判读异常 fail-open）。
// ops 真机 git 面归独立模式走查（1.8 e2e 记录）——本文件全 fake 注入，零 git 依赖。
import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  WORKTREE_CHANNELS,
  type WorktreeListRequest,
  type WorktreeSealRequest,
  type WorktreeSessionCreateRequest,
} from '@dsh-forge/contracts'
import { SessionCwdMismatchError, SessionSealedError } from '@dsh-forge/git-worktree'
import type { ForgeIpc } from './forge-channels.js'
import { rpcEnvelope } from './rpc-envelope.js'
import {
  createWorktreeRpcService,
  defaultEnsureDirAcl,
  interceptRequiredBinding,
  interceptSessionSends,
  invalidateResolveCaches,
  registerWorktreeChannels,
  verifySendGuardInstalled,
  WorktreeCapabilityAbsentError,
  type SessionControllerFace,
  type SessionPersistenceFace,
} from './worktree-rpc.js'
import { createDiagContextStore, runWithDiagContext } from '../telemetry/diag-context.js'

/** 插件域扩展点桩（resolveProject 恒命中 C:/repo 主项目；worktreeDir 默认式样） */
const fakeExt = {
  getExtensionPoints: () => ({
    resolveProject: async (cwd: string) =>
      cwd.includes('foreign') ? null : { projectId: 'p1', projectRoot: 'C:/repo', isGit: true, projectName: 'dsh-forge' },
    getWorktreeDir: (root: string) => `${root}/.forge/worktrees`,
  }),
}

/** 会话持久化桩：events 表驱动（sessionId → 尾部事件集）；append 捕获写面；create 预铸捕获；
 *  headers 表驱动（sessionId → SessionHeader 消费切片：cwd + agentPreset/parentSession 选填）；
 *  opts.countOpens = open 调用计数器（G7② 性能钉：非 git 判读零日志读）。 */
function fakePersistence(
  events: Record<string, readonly unknown[]>,
  headers: Record<string, { cwd: string; agentPreset?: string; parentSession?: string }> = {},
  countOpens?: { value: number },
) {
  const appended: Array<{ id: string; events: readonly unknown[] }> = []
  const created: Array<{ header: Record<string, unknown> }> = []
  const closedFor: Record<string, boolean> = {}
  const makeHandle = (id: string, access: 'read' | 'write') => ({
    header: headers[id],
    read: async () => ({ events: events[id] ?? [] }),
    append: async (batch: readonly unknown[]) => {
      if (access !== 'write') throw new Error('read-only handle')
      appended.push({ id, events: batch })
    },
    flush: async () => {},
    close: async () => {
      closedFor[`${id}:${access}`] = true
    },
  })
  const persistence = {
    open: (async (id: string, access: 'read' | 'write') => {
      if (countOpens !== undefined) countOpens.value += 1
      return makeHandle(id, access)
    }) as SessionPersistenceFace['open'],
    create: (async (header: Parameters<SessionPersistenceFace['create']>[0]) => {
      created.push({ header: { ...header } })
      return makeHandle(header.id, 'write')
    }) as SessionPersistenceFace['create'],
    // 官方 SessionPersistence.list 返回 SessionPersistenceSnapshot[]（header.id）——运行期
    // 探测缝（attachedSessionsOf as {list?}），不在 SessionPersistenceFace 类型面
    list: (async () => Object.keys(events).map((id) => ({ header: { id } }))) as never,
  } as unknown as SessionPersistenceFace
  return { persistence, appended, created, closedFor }
}

function fakeController() {
  const calls: Array<{ sessionId?: string; cwd?: string }> = []
  const prompts: Array<unknown> = []
  const promptSignals: Array<unknown> = []
  const controller: SessionControllerFace = {
    create: async (request) => {
      calls.push({ sessionId: request.sessionId, cwd: request.cwd })
      return { sessionId: request.sessionId ?? 's-created' }
    },
    prompt: async (request, signal) => {
      prompts.push(request)
      promptSignals.push(signal)
      return { accepted: true }
    },
  }
  return { controller, calls, prompts, promptSignals }
}

/** 官方 workspaceRegistry 消费窄面桩（find-or-create + attachSession/setTitle 捕获；
 *  titles = resolveByPath 项目 title 映射——继承命名面；archive 可选档 = 归档集 +
 *  unarchive 捕获——bug ff324cad 占位回收面） */
function fakeWorkspaceRegistry(attachError?: Error, titles: Record<string, string> = {}) {
  const created: Array<{ path: string; title?: string }> = []
  const attached: Array<{ path: string; sessionId: string }> = []
  const titled: Array<{ path: string; title: string }> = []
  const archived: string[] = []
  const unarchived: string[] = []
  const registry = {
    archivedSessionIds: archived,
    unarchiveSession: async (sessionId: string) => {
      unarchived.push(sessionId)
      const at = archived.indexOf(sessionId)
      if (at >= 0) archived.splice(at, 1)
    },
    resolveByPath: async (path: string) => {
      const title = titles[path]
      if (title === undefined) return undefined
      return {
        title,
        setTitle: async (next: string): Promise<void> => {
          titled.push({ path, title: next })
        },
      }
    },
    create: async (path: string, title?: string) => {
      created.push({ path, title })
      return {
        attachSession: async (sessionId: string) => {
          if (attachError !== undefined) throw attachError
          attached.push({ path, sessionId })
        },
        setTitle: async (next: string) => {
          titled.push({ path, title: next })
        },
      }
    },
  }
  return { registry, created, attached, titled, archived, unarchived }
}

describe('createWorktreeRpcService（child 侧服务本体——透传插件域）', () => {
  it('list：非 git / 未注册路径 → isGit false 零清单（能力位条件渲染单源）', async () => {
    const service = createWorktreeRpcService({ gitWorktree: fakeExt })
    const result = await service.list({ projectRoot: 'C:/foreign' } satisfies WorktreeListRequest)
    expect(result).toEqual({ isGit: false, entries: [] })
  })

  it('bug 925c96d5 / G8：list isGit:false 结果按 projectRoot 会话期缓存——二次调用不再起 git 探测（resolveProject 只跑一次）', async () => {
    let resolveCalls = 0
    const countingExt = {
      getExtensionPoints: () => ({
        resolveProject: async (_cwd: string) => {
          resolveCalls += 1
          return null
        },
        getWorktreeDir: (root: string) => `${root}/.forge/worktrees`,
      }),
    }
    const service = createWorktreeRpcService({ gitWorktree: countingExt })
    const first = await service.list({ projectRoot: 'C:/plain' } satisfies WorktreeListRequest)
    const second = await service.list({ projectRoot: 'C:/plain' } satisfies WorktreeListRequest)
    expect(first).toEqual({ isGit: false, entries: [] })
    expect(second).toEqual({ isGit: false, entries: [] })
    expect(resolveCalls, '非 git 结果未缓存——弹窗/挂载每次白跑 git 子进程（bug 在场）').toBe(1)
  })

  // ── bug 9eb9d6cb 后续收口：解析缓存失效缝（G7② null 记忆化保留——失效代自愈）──
  it('G8 失效缝：invalidateResolveCaches 后负结果重探（registerProject 陈旧自愈）', async () => {
    let resolveCalls = 0
    const countingExt = {
      getExtensionPoints: () => ({
        resolveProject: async (_cwd: string) => {
          resolveCalls += 1
          return null
        },
        getWorktreeDir: (root: string) => `${root}/.forge/worktrees`,
      }),
    }
    invalidateResolveCaches() // 用例隔离：清其他用例残留缓存
    const service = createWorktreeRpcService({ gitWorktree: countingExt })
    await service.list({ projectRoot: 'C:/plain' } satisfies WorktreeListRequest)
    await service.list({ projectRoot: 'C:/plain' } satisfies WorktreeListRequest)
    expect(resolveCalls, 'G8 负缓存未命中（缓存语义回归）').toBe(1)
    invalidateResolveCaches('C:/plain')
    await service.list({ projectRoot: 'C:/plain' } satisfies WorktreeListRequest)
    expect(resolveCalls, '失效缝未清缓存——注册后清单停在 isGit:false（bug 在场）').toBe(2)
  })

  it('bug 925c96d5：sessionCreate 后 find-or-create 树路径工作区 + attachSession（官方 registry 面——composer 门控/侧栏归属单源）', async () => {
    const { controller } = fakeController()
    const { persistence } = fakePersistence({})
    const { registry, created, attached } = fakeWorkspaceRegistry()
    const service = createWorktreeRpcService({
      sessionController: controller,
      sessionPersistence: persistence,
      listWorktreeEntries: async () => [{ path: 'C:/repo/.forge/worktrees/wt-a', branch: 'feat/a' }],
      workspaceRegistry: registry,
      pathPresent: () => true, // fake 路径无盘上实体——前置活性守卫恒真（缺席专测单独表驱动）
    })
    const result = await service.sessionCreate({ worktreePath: 'C:/repo/.forge/worktrees/wt-a' })
    expect(created.map((row) => row.path), '树路径未 find-or-create 工作区（bug 在场）').toEqual([
      'C:/repo/.forge/worktrees/wt-a',
    ])
    expect(attached, '预铸会话无工作区归属（bug 在场）').toEqual([
      { path: 'C:/repo/.forge/worktrees/wt-a', sessionId: result.sessionId },
    ])
  })

  it('bug 925c96d5：workspace attach 失败 fail-soft——sessionCreate 仍返回 sessionId（不因归属面阻断预铸采纳主链）', async () => {
    const { controller } = fakeController()
    const { persistence } = fakePersistence({})
    const { registry, created } = fakeWorkspaceRegistry(new Error('cwd 漂移'))
    const service = createWorktreeRpcService({
      sessionController: controller,
      sessionPersistence: persistence,
      listWorktreeEntries: async () => [{ path: 'C:/repo/.forge/worktrees/wt-a', branch: 'feat/a' }],
      workspaceRegistry: registry,
      pathPresent: () => true, // fake 路径无盘上实体——前置活性守卫恒真（缺席专测单独表驱动）
    })
    const result = await service.sessionCreate({ worktreePath: 'C:/repo/.forge/worktrees/wt-a' })
    expect(result.sessionId).toMatch(/^session-[0-9a-f-]{36}$/)
    expect(created.map((row) => row.path)).toEqual(['C:/repo/.forge/worktrees/wt-a'])
  })

  it('树工作区标题继承项目命名（resolveByPath(项目根).title 单源）——hero 项目 chip 恒显项目名；映射缺席回退树名', async () => {
    const { controller } = fakeController()
    const { persistence } = fakePersistence({})
    const { registry, created } = fakeWorkspaceRegistry(undefined, { 'C:/repo': 'dsh-forge' })
    const service = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionController: controller,
      sessionPersistence: persistence,
      listWorktreeEntries: async () => [{ path: 'C:/repo/.forge/worktrees/wt-a', branch: 'feat/a' }],
      workspaceRegistry: registry,
      pathPresent: () => true, // fake 路径无盘上实体——前置活性守卫恒真（缺席专测单独表驱动）
    })
    await service.sessionCreate({ worktreePath: 'C:/repo/.forge/worktrees/wt-a' })
    expect(created[0]!.title, '树工作区未继承项目名（hero 项目 chip 跟随树名）').toBe('dsh-forge')
  })

  it('bug 4209c531：编排链预防性 ACL 补权——attachWorkspace 对树路径调 ensureDirAcl（沙箱授权链需有效 WRITE_DAC/WRITE_OWNER；失败 fail-soft 不阻断）', async () => {
    const { controller } = fakeController()
    const { persistence } = fakePersistence({})
    const { registry } = fakeWorkspaceRegistry()
    const aclPaths: string[] = []
    const service = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionController: controller,
      sessionPersistence: persistence,
      listWorktreeEntries: async () => [{ path: 'C:/repo/.forge/worktrees/wt-a', branch: 'feat/a' }],
      workspaceRegistry: registry,
      ensureDirAcl: async (path) => {
        aclPaths.push(path)
      },
      pathPresent: () => true, // fake 路径无盘上实体——前置活性守卫恒真（缺席专测单独表驱动）
    })
    await service.sessionCreate({ worktreePath: 'C:/repo/.forge/worktrees/wt-a' })
    expect(aclPaths, '编排链未做 ACL 补权（新树首条命令必撞沙箱拒绝）').toEqual(['C:/repo/.forge/worktrees/wt-a'])
  })

  it('bug 4209c531：ensureDirAcl 拒绝 → 编排链 fail-soft 照常产出会话（不因 ACL 面阻断预铸采纳）', async () => {
    const { controller } = fakeController()
    const { persistence } = fakePersistence({})
    const { registry } = fakeWorkspaceRegistry()
    const service = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionController: controller,
      sessionPersistence: persistence,
      listWorktreeEntries: async () => [{ path: 'C:/repo/.forge/worktrees/wt-a', branch: 'feat/a' }],
      workspaceRegistry: registry,
      ensureDirAcl: async () => {
        throw new Error('icacls failed')
      },
      pathPresent: () => true, // fake 路径无盘上实体——前置活性守卫恒真（缺席专测单独表驱动）
    })
    await expect(service.sessionCreate({ worktreePath: 'C:/repo/.forge/worktrees/wt-a' })).resolves.toMatchObject({
      sessionId: expect.stringMatching(/^session-[0-9a-f-]{36}$/),
    })
  })

  it('存量树工作区 healing：create 复用不改 title（官方语义）→ setTitle 显式回写项目名', async () => {
    const { controller } = fakeController()
    const { persistence } = fakePersistence({})
    const { registry, titled } = fakeWorkspaceRegistry(undefined, { 'C:/repo': 'dsh-forge' })
    const service = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionController: controller,
      sessionPersistence: persistence,
      listWorktreeEntries: async () => [{ path: 'C:/repo/.forge/worktrees/wt-a', branch: 'feat/a' }],
      workspaceRegistry: registry,
      pathPresent: () => true, // fake 路径无盘上实体——前置活性守卫恒真（缺席专测单独表驱动）
    })
    await service.sessionCreate({ worktreePath: 'C:/repo/.forge/worktrees/wt-a' })
    expect(titled).toEqual([{ path: 'C:/repo/.forge/worktrees/wt-a', title: 'dsh-forge' }])
  })

  it('存量 healing 第二触发点：list 顺带对齐树工作区 title（主行跳过；已在途打开/选择的旧工作区自愈）', async () => {
    const { registry, titled } = fakeWorkspaceRegistry(undefined, {
      'C:/repo/.forge/worktrees/wt-a': 'redesign', // 旧工作区残留错误 title
    })
    const service = createWorktreeRpcService({
      gitWorktree: fakeExt,
      listWorktreeRows: async () => [
        { path: 'C:/repo', branch: 'main', detached: false, bare: false },
        { path: 'C:/repo/.forge/worktrees/wt-a', branch: 'feat/a', detached: false, bare: false },
      ],
      pathPresent: () => true, // 本测专查 healing 触发面——活性恒真（缺席跳过归 bug 63180253 专测）
      workspaceRegistry: registry,
    })
    const result = await service.list({ projectRoot: 'C:/repo' })
    expect(result.isGit).toBe(true)
    await new Promise<void>((resolve) => setTimeout(resolve, 0)) // heal 为 fire-and-forget——让微任务排空
    expect(titled, '旧工作区未随 list 自愈（存量边界）').toEqual([
      { path: 'C:/repo/.forge/worktrees/wt-a', title: 'dsh-forge' },
    ])
  })

  it('bug 63180253：heal 跳过盘上缺席陈旧行（present=false）——零 resolveByPath 空转（ENOENT 噪音根治）', async () => {
    const resolvedPaths: string[] = []
    const registry = {
      resolveByPath: async (path: string) => {
        resolvedPaths.push(path)
        return undefined
      },
      create: async (_path: string, _title?: string) => ({ attachSession: async () => {} }),
    }
    const service = createWorktreeRpcService({
      gitWorktree: fakeExt,
      listWorktreeRows: async () => [
        { path: 'C:/repo', branch: 'main', detached: false, bare: false },
        { path: 'C:/repo/.forge/worktrees/gone', branch: 'feat/gone', detached: false, bare: false },
      ],
      pathPresent: (p) => p === 'C:/repo', // gone 树已被外部删除（git prune 前陈旧行）
      workspaceRegistry: registry,
    })
    await service.list({ projectRoot: 'C:/repo' })
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    // 主行 isMain 跳过 + 缺席行 present=false 跳过 → resolveByPath 零触达（现场 26 次/天 ENOENT warn 根治）
    expect(resolvedPaths).toEqual([])
  })

  it('bug 4eab48ea：registry 无 resolveByPath（旧替身/降级面）→ 树工作区标题回退树名（零抛错）', async () => {
    const { controller } = fakeController()
    const { persistence } = fakePersistence({})
    const bare = {
      create: async (_path: string, _title?: string) => ({ attachSession: async () => {} }),
    }
    const service = createWorktreeRpcService({
      sessionController: controller,
      sessionPersistence: persistence,
      listWorktreeEntries: async () => [{ path: 'C:/repo/.forge/worktrees/wt-a', branch: 'feat/a' }],
      workspaceRegistry: bare,
      pathPresent: () => true, // fake 路径无盘上实体——前置活性守卫恒真（缺席专测单独表驱动）
    })
    await expect(service.sessionCreate({ worktreePath: 'C:/repo/.forge/worktrees/wt-a' })).resolves.toMatchObject({
      sessionId: expect.stringMatching(/^session-[0-9a-f-]{36}$/),
    })
  })

  it('bug eae18b5c：预铸头携带默认 agentPreset（官方 composeAgent 同源——模式标签只读自 SessionHeader.agentPreset）；resolver 缺席 = 头缺席零猜测', async () => {
    const { controller } = fakeController()
    const { persistence, created } = fakePersistence({})
    const service = createWorktreeRpcService({
      sessionController: controller,
      sessionPersistence: persistence,
      listWorktreeEntries: async () => [{ path: 'C:/repo/.forge/worktrees/wt-a', branch: 'feat/a' }],
      resolveDefaultPreset: async () => 'expedition',
      pathPresent: () => true, // fake 路径无盘上实体——前置活性守卫恒真（缺席专测单独表驱动）
    })
    const result = await service.sessionCreate({ worktreePath: 'C:/repo/.forge/worktrees/wt-a' })
    expect(created[0]!.header, '预铸头缺 agentPreset（bug 在场——模式标签消失）').toMatchObject({
      id: result.sessionId,
      agentPreset: 'expedition',
    })
  })

  it('bug eae18b5c：resolveDefaultPreset 缺席/拒绝 → 预铸头零 agentPreset（零猜测，不阻断预铸主链）', async () => {
    const { controller } = fakeController()
    const { persistence, created } = fakePersistence({})
    const service = createWorktreeRpcService({
      sessionController: controller,
      sessionPersistence: persistence,
      listWorktreeEntries: async () => [{ path: 'C:/repo/.forge/worktrees/wt-a', branch: 'feat/a' }],
      resolveDefaultPreset: async () => {
        throw new Error('registry absent')
      },
      pathPresent: () => true, // fake 路径无盘上实体——前置活性守卫恒真（缺席专测单独表驱动）
    })
    await expect(service.sessionCreate({ worktreePath: 'C:/repo/.forge/worktrees/wt-a' })).resolves.toMatchObject({
      sessionId: expect.stringMatching(/^session-/),
    })
    expect(created[0]!.header.agentPreset).toBeUndefined()
  })

  it('workspaceRegistry 缺席（旧环境）→ sessionCreate 照常（零归属面降级，不抛错）', async () => {
    const { controller } = fakeController()
    const { persistence } = fakePersistence({})
    const service = createWorktreeRpcService({
      sessionController: controller,
      sessionPersistence: persistence,
      listWorktreeEntries: async () => [{ path: 'C:/repo/.forge/worktrees/wt-a', branch: 'feat/a' }],
      pathPresent: () => true, // fake 路径无盘上实体——前置活性守卫恒真（缺席专测单独表驱动）
    })
    const result = await service.sessionCreate({ worktreePath: 'C:/repo/.forge/worktrees/wt-a' })
    expect(result.sessionId).toMatch(/^session-[0-9a-f-]{36}$/)
  })

  it('sessionCreate：预铸（persistence.create 自铸 id + cwd 头 → 句柄写挂靠事件 seq 0 + flush + close）→ controller.create({sessionId, cwd}) 采纳——写句柄生命周期零交叠', async () => {
    const { controller, calls } = fakeController()
    const { persistence, appended, created, closedFor } = fakePersistence({})
    const order: string[] = []
    const trackingPersistence: SessionPersistenceFace = {
      ...persistence,
      create: (async (header: Parameters<SessionPersistenceFace['create']>[0]) => {
        order.push('precast')
        return (persistence.create as (h: Parameters<SessionPersistenceFace['create']>[0]) => Promise<unknown>)(header)
      }) as SessionPersistenceFace['create'],
    }
    const trackingController: SessionControllerFace = {
      ...controller,
      create: async (request) => {
        order.push('adopt')
        // 单写者铁律：controller.create 起句柄归 agent loop——此刻预铸写句柄必须已关闭
        expect(closedFor[`${request.sessionId}:write`]).toBe(true)
        return (controller.create as (r: { sessionId: string; cwd?: string }) => Promise<{ sessionId: string }>)({ sessionId: request.sessionId as string, cwd: request.cwd })
      },
    }
    const service = createWorktreeRpcService({
      sessionController: trackingController,
      sessionPersistence: trackingPersistence,
      listWorktreeEntries: async () => [{ path: 'C:/repo/.forge/worktrees/wt-a', branch: 'feat/a' }],
      pathPresent: () => true, // fake 路径无盘上实体——前置活性守卫恒真（缺席专测单独表驱动）
    })
    const result = await service.sessionCreate({ worktreePath: 'C:/repo/.forge/worktrees/wt-a' })
    // 自铸 id（session-<uuid> 形态）且 header 极薄契约（id/createdAt/cwd）
    expect(result.sessionId).toMatch(/^session-[0-9a-f-]{36}$/)
    expect(created).toHaveLength(1)
    expect(created[0]!.header).toMatchObject({ id: result.sessionId, cwd: 'C:/repo/.forge/worktrees/wt-a' })
    expect(typeof created[0]!.header.createdAt).toBe('number')
    // 挂靠事件在预铸句柄上落盘：seq 0 + ignorable:true
    expect(appended).toHaveLength(1)
    expect(appended[0]!.id).toBe(result.sessionId)
    const event = appended[0]!.events[0] as { type: string; seq: number; ignorable?: boolean; data: unknown }
    expect(event).toMatchObject({
      type: 'forge/worktree-attach',
      seq: 0,
      ignorable: true,
      data: { worktreePath: 'C:/repo/.forge/worktrees/wt-a', branch: 'feat/a' },
    })
    // 编排序：预铸在前、采纳在后（单写者零交叠）
    expect(order).toEqual(['precast', 'adopt'])
    expect(calls).toEqual([{ sessionId: result.sessionId, cwd: 'C:/repo/.forge/worktrees/wt-a' }])
    expect(result.branch).toBe('feat/a')
  })

  it('A12：sessionCreate 预铸头 cwd realpath 归一（第四维——链接/短名/../拼写形态收敛磁盘真值，controller.create 同口径；不可达 fail-soft 回退原拼写）', async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'wt-a12-')))
    try {
      const variant = `${join(dir, 'sub')}${sep}..` // 可达但非磁盘真值拼写（join 不折叠尾 '..'——realpath 收敛）
      const { persistence, created } = fakePersistence({})
      const { controller, calls } = fakeController()
      const service = createWorktreeRpcService({
        gitWorktree: fakeExt,
        sessionController: controller,
        sessionPersistence: persistence,
        // git worktree list 本就返回 canonical 拼写——realpath 归一前置使变体拼写也能命中清单分支
        listWorktreeEntries: async () => [{ path: dir, branch: 'feat/a' }],
      })
      const result = await service.sessionCreate({ worktreePath: variant })
      expect(created[0]!.header.cwd).toBe(dir)
      expect(calls[0]!.cwd).toBe(dir)
      expect(result.sessionId).toBe(created[0]!.header.id)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('sessionCreate：sessionPersistence 缺席 / 无 create 面 → 明确错误（不做半截预铸）', async () => {
    const { controller } = fakeController()
    const bare = createWorktreeRpcService({
      sessionController: controller,
      pathPresent: () => true, // fake 路径无盘上实体——前置活性守卫恒真（缺席专测单独表驱动）
    })
    await expect(bare.sessionCreate({ worktreePath: 'C:/repo/.forge/worktrees/wt-a' })).rejects.toThrow('sessionPersistence')
    const legacy = createWorktreeRpcService({
      sessionController: controller,
      // 无 create 面桩（运行期契约探测面——1.16 预铸缝缺席即明确错误；类型断言豁免编译面）
      sessionPersistence: { open: (async () => ({})) as SessionPersistenceFace['open'] } as unknown as SessionPersistenceFace,
      pathPresent: () => true, // fake 路径无盘上实体——前置活性守卫恒真（缺席专测单独表驱动）
    })
    await expect(legacy.sessionCreate({ worktreePath: 'C:/repo/.forge/worktrees/wt-a' })).rejects.toThrow('sessionPersistence')
  })

  it('bug b6b88f49：分支解析落空（detached HEAD）→ 边界显式拒绝（可读错误含 worktree 路径），不预铸半截会话', async () => {
    const { persistence, created } = fakePersistence({})
    const { controller } = fakeController()
    const service = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionController: controller,
      sessionPersistence: persistence,
      listWorktreeEntries: async () => [{ path: 'C:/repo/.forge/worktrees/wt-a', branch: null }], // detached 检出
      pathPresent: () => true, // fake 路径无盘上实体——前置活性守卫恒真（缺席专测单独表驱动）
    })
    await expect(service.sessionCreate({ worktreePath: 'C:/repo/.forge/worktrees/wt-a' })).rejects.toThrow(
      /分支解析失败.*wt-a/s,
    )
    expect(created).toHaveLength(0) // 未落半截预铸会话
  })

  it('bug 878192ec：非 git 目录（resolveProject null）cwd 直建回退——controller.create({cwd}) 零预铸零分支，sessionId 返回（远程域非 git 项目建会话正门）', async () => {
    const WT_A = 'C:/repo/.forge/worktrees/wt-a'
    const { controller, calls } = fakeController()
    const { persistence, created } = fakePersistence({})
    const service = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionController: controller,
      sessionPersistence: persistence,
      listWorktreeEntries: async () => [{ path: WT_A, branch: 'main' }],
      pathPresent: () => true,
      ensureDirAcl: async () => {},
    })
    const result = await service.sessionCreate({ worktreePath: 'C:/foreign-dir' })
    expect(result.branch).toBe('')
    expect(calls[0]?.cwd).toBe('C:/foreign-dir')
    expect(calls[0]?.sessionId).toBeUndefined() // 官方 create 自铸 id（缺省不传）
    expect(result.sessionId).toBe('s-created')
    expect(created).toHaveLength(0) // 非 git 零预铸（无挂靠事件语义）
  })

  it('bug 488e860d 存量选中自愈（host 侧）：分支解析落空拒绝即摘 lastSelection 记忆——后续 selected() 不再回传不可挂靠树', async () => {
    const { persistence } = fakePersistence({})
    const { controller } = fakeController()
    const service = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionController: controller,
      sessionPersistence: persistence,
      listWorktreeEntries: async () => [{ path: 'C:/repo/.forge/worktrees/wt-a', branch: null }], // detached 检出
      pathPresent: () => true,
    })
    await service.select({ projectRoot: 'C:/repo', path: 'C:/repo/.forge/worktrees/wt-a' })
    expect(await service.selected({ projectRoot: 'C:/repo' })).toEqual({ path: 'C:/repo/.forge/worktrees/wt-a' })
    await expect(service.sessionCreate({ worktreePath: 'C:/repo/.forge/worktrees/wt-a' })).rejects.toThrow(/分支解析失败/)
    expect(await service.selected({ projectRoot: 'C:/repo' })).toEqual({}) // 记忆摘除——create-wrap 后续不再携该树
  })

  it('bug b6b88f49：worktree list 清单失配（查无该树条目）→ 同径边界显式拒绝，不抛预铸深处 TypeError', async () => {
    const { persistence } = fakePersistence({})
    const { controller } = fakeController()
    const service = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionController: controller,
      sessionPersistence: persistence,
      listWorktreeEntries: async () => [{ path: 'C:/repo/.forge/worktrees/wt-other', branch: 'feat/x' }],
      pathPresent: () => true, // fake 路径无盘上实体——前置活性守卫恒真（缺席专测单独表驱动）
    })
    await expect(service.sessionCreate({ worktreePath: 'C:/repo/.forge/worktrees/wt-a' })).rejects.toThrow(
      /分支解析失败.*wt-a/s,
    )
  })

  it('checks：attachedSessions 反查（snapshot list 形态 header.id + 挂靠事件归并）', async () => {
    const { persistence } = fakePersistence({
      's-pre': [{ type: 'forge/worktree-attach', seq: 0, data: { worktreePath: 'C:/repo/.forge/worktrees/wt-a', branch: 'feat/a' } }],
    })
    const service = createWorktreeRpcService({ gitWorktree: fakeExt, sessionPersistence: persistence })
    const result = await service.checks({ projectRoot: 'C:/repo', path: 'C:/repo/.forge/worktrees/wt-a' })
    expect(result.attachedSessions).toBe(1)
  })

  it('seal：挂靠 worktree 不在场 → sealed（worktree-missing）；在场 → false；无绑定 → 零注入面', async () => {
    const binding = (path: string) => [{ type: 'forge/worktree-attach', seq: 0, data: { worktreePath: path, branch: 'feat/a' } }]
    const sealedSvc = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionPersistence: fakePersistence({ s1: binding('C:/repo/.forge/worktrees/gone') }).persistence,
      pathPresent: () => true, // fake 路径无盘上实体——前置活性守卫恒真（缺席专测单独表驱动）
    })
    expect(await sealedSvc.seal({ sessionId: 's1' } satisfies WorktreeSealRequest)).toMatchObject({
      isGit: true,
      sealed: true,
      worktreeName: 'gone',
    })
    const liveSvc = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionPersistence: fakePersistence({ s1: binding('C:/repo') }).persistence,
      listPresent: async () => ['C:/repo', 'C:/repo/.forge/worktrees/wt-a'],
      pathPresent: () => true, // fake 路径无盘上实体——前置活性守卫恒真（缺席专测单独表驱动）
    })
    expect(await liveSvc.seal({ sessionId: 's1' })).toMatchObject({ isGit: true, sealed: false })
    const unboundSvc = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionPersistence: fakePersistence({}).persistence,
      pathPresent: () => true, // fake 路径无盘上实体——前置活性守卫恒真（缺席专测单独表驱动）
    })
    expect(await unboundSvc.seal({ sessionId: 's1' })).toEqual({ isGit: false, sealed: false, binding: null })
  })

  it('resolve：批量归属解析（身份归并单点）——命中带 projectId/projectName，未命中不进结果', async () => {
    const service = createWorktreeRpcService({ gitWorktree: fakeExt })
    const result = await service.resolve({
      paths: ['C:/repo/.forge/worktrees/wt-a', 'C:/foreign/x', 'C:/repo/.forge/worktrees/wt-b'],
    })
    expect(result.resolved).toEqual([
      { path: 'C:/repo/.forge/worktrees/wt-a', projectId: 'p1', projectRoot: 'C:/repo', projectName: 'dsh-forge' },
      { path: 'C:/repo/.forge/worktrees/wt-b', projectId: 'p1', projectRoot: 'C:/repo', projectName: 'dsh-forge' },
    ])
  })

  it('bug 4a30b193：list present 兑现盘上事实——已删树陈旧行（git prune 前）present=false', async () => {
    const service = createWorktreeRpcService({
      gitWorktree: fakeExt,
      listWorktreeRows: async () => [
        { path: 'C:/repo', branch: 'main', detached: false, bare: false },
        { path: 'C:/repo/.forge/worktrees/gone', branch: 'feat/gone', detached: false, bare: false },
      ],
      pathPresent: (p) => p === 'C:/repo', // gone 目录已被外部强制删除
    })
    const result = await service.list({ projectRoot: 'C:/repo' })
    expect(result.entries.map((entry) => [entry.worktreeName, entry.present])).toEqual([
      ['repo', true],
      ['gone', false], // 恒 true = UI 陈旧选中无法识别（bug 在场）
    ])
  })
})

describe('registerWorktreeChannels（main 侧 ipc 注册）', () => {
  it('通道键键对应 contracts WORKTREE_CHANNELS 且全部注册', () => {
    const registered: string[] = []
    const ipc: ForgeIpc = {
      register: (channel) => {
        registered.push(channel)
      },
      registered: () => registered,
      unregisterAll: () => {},
    }
    const service = createWorktreeRpcService({})
    registerWorktreeChannels(ipc, service)
    expect(registered.sort()).toEqual(Object.values(WORKTREE_CHANNELS).sort())
    expect(registered).toHaveLength(11) // 十通道 + selected（选中态读镜像——host 唯一事实源）
  })
})

describe('interceptSessionSends（发送拦截——「不可发送」硬保证）', () => {
  it('封存会话 prompt → SessionSealedError（原方法零调用——host 拒绝）', async () => {
    const { controller, prompts } = fakeController()
    interceptSessionSends(controller, async () => ({ isGit: true, sealed: true, binding: { worktreePath: 'x', branch: 'b' } }))
    await expect(controller.prompt({ sessionId: 's1' })).rejects.toThrow(SessionSealedError)
    expect(prompts).toHaveLength(0)
  })

  it('未封存会话放行；判读失败 fail-open 放行；无 sessionId 请求直通', async () => {
    const live = fakeController()
    interceptSessionSends(live.controller, async () => ({ isGit: true, sealed: false, binding: null }))
    await expect(live.controller.prompt({ sessionId: 's1' })).resolves.toEqual({ accepted: true })
    expect(live.prompts).toHaveLength(1)

    const broken = fakeController()
    interceptSessionSends(broken.controller, async () => {
      throw new Error('seal read failed')
    })
    await expect(broken.controller.prompt({ sessionId: 's1' })).resolves.toEqual({ accepted: true })

    const bare = fakeController()
    interceptSessionSends(bare.controller, async () => ({ isGit: true, sealed: true, binding: null }))
    await expect(bare.controller.prompt({})).resolves.toEqual({ accepted: true })
  })

  it('补撤销面：dispose 后恢复原方法（封存不再拦截）', async () => {
    const { controller, prompts } = fakeController()
    const dispose = interceptSessionSends(controller, async () => ({ isGit: true, sealed: true, binding: null }))
    dispose()
    await expect(controller.prompt({ sessionId: 's1' })).resolves.toEqual({ accepted: true })
    expect(prompts).toHaveLength(1)
  })
})

// ───────────── 1.30 host 必绑拦截 + 重路由（A2/A5 + G2/G3/G7）─────────────
describe('requiredBindingGuard + interceptRequiredBinding（第二层 prompt 拦截）', () => {
  const attachEvent = (path: string) => [{ type: 'forge/worktree-attach', seq: 0, data: { worktreePath: path, branch: 'feat/a' } }]
  const WT_A = 'C:/repo/.forge/worktrees/wt-a'

  /** 被测装配桩：git 项目（resolveProject 计数）+ 会话持久化 + 控制器 + 归档面捕获 */
  function guardRig(input: {
    events: Record<string, readonly unknown[]>
    headers: Record<string, { cwd: string; agentPreset?: string; parentSession?: string }>
  }) {
    const opens = { value: 0 }
    let resolveCalls = 0
    const countingExt = {
      getExtensionPoints: () => ({
        resolveProject: async (cwd: string) => {
          resolveCalls += 1
          return cwd.includes('foreign') ? null : { projectId: 'p1', projectRoot: 'C:/repo', isGit: true }
        },
        getWorktreeDir: (root: string) => `${root}/.forge/worktrees`,
      }),
    }
    const { persistence, created } = fakePersistence(input.events, input.headers, opens)
    const { controller, calls, prompts, promptSignals } = fakeController()
    const archiveCalls: Array<{ sessionId: string; options?: { readonly stopActivity?: boolean } }> = []
    const registry = {
      ...fakeWorkspaceRegistry().registry,
      archiveSession: async (sessionId: string, options?: { readonly stopActivity?: boolean }) => {
        archiveCalls.push({ sessionId, options })
      },
    }
    const service = createWorktreeRpcService({
      gitWorktree: countingExt,
      sessionController: controller,
      sessionPersistence: persistence,
      workspaceRegistry: registry,
      ensureDirAcl: async () => {},
      pathPresent: () => true, // fake 路径无盘上实体——活性探测恒真（bug 4a30b193 缝专测单独表驱动）
      listWorktreeEntries: async () => [
        { path: 'C:/repo', branch: 'main' },
        { path: WT_A, branch: 'feat/a' },
      ],
    })
    return { service, controller, prompts, promptSignals, calls, opens, created, resolveCallsOf: () => resolveCalls, archiveCalls }
  }

  it('A2 竞速败窗：git 项目无绑定 blank 会话 prompt → 原发送拒绝 + 编排产物重路由（原消息内容保真）', async () => {
    const rig = guardRig({ events: { blank: [] }, headers: { blank: { cwd: 'C:/repo' } } })
    const guard = rig.service.requiredBindingGuard()
    expect(guard).toBeDefined()
    const dispose = interceptRequiredBinding(rig.controller, guard!)
    await expect(rig.controller.prompt({ sessionId: 'blank', text: 'hello' })).resolves.toEqual({ accepted: true })
    dispose()
    // 原会话零直发；产物会话收到原消息内容（sessionId 换绑）
    expect(rig.prompts).toHaveLength(1)
    expect(rig.prompts[0]).toMatchObject({ sessionId: expect.not.stringContaining('blank'), text: 'hello' })
    // 产物 = 预铸采纳的挂靠会话（cwd = 重路由目标树）
    expect(rig.calls).toHaveLength(1)
  })

  it('bug dcdc1b4d 回归：重路由透传调用方 signal（官方 prompt 契约 (request, signal) 首行 throwIfAborted）', async () => {
    const rig = guardRig({ events: { blank: [] }, headers: { blank: { cwd: 'C:/repo' } } })
    const dispose = interceptRequiredBinding(rig.controller, rig.service.requiredBindingGuard()!)
    const sentinel = new AbortController().signal
    await rig.controller.prompt({ sessionId: 'blank', text: 'hi' }, sentinel)
    dispose()
    expect(rig.prompts).toHaveLength(1)
    expect(
      rig.promptSignals[0],
      '重路由内层 prompt 必须收到调用方 signal——漏传 = 官方 prompt 首行 signal.throwIfAborted() 崩溃（gateway/internal toast + 无回复）',
    ).toBe(sentinel)
  })

  it('G2 同树也不放行：无选中（selection 缺席）无绑定 blank → 重路由目标 = 会话 cwd 树（主行绑定）', async () => {
    const rig = guardRig({ events: { blank: [] }, headers: { blank: { cwd: 'C:/repo' } } })
    const dispose = interceptRequiredBinding(rig.controller, rig.service.requiredBindingGuard()!)
    await rig.controller.prompt({ sessionId: 'blank', text: 'hi' })
    dispose()
    expect(rig.calls[0]?.cwd).toBe('C:/repo')
  })

  it('重路由目标 = hero 选中树（select 推送 → 编排目标树随选中）', async () => {
    const rig = guardRig({ events: { blank: [] }, headers: { blank: { cwd: 'C:/repo' } } })
    await rig.service.select({ projectRoot: 'C:/repo', path: WT_A })
    const dispose = interceptRequiredBinding(rig.controller, rig.service.requiredBindingGuard()!)
    await rig.controller.prompt({ sessionId: 'blank', text: 'hi' })
    dispose()
    expect(rig.calls[0]?.cwd).toBe(WT_A)
  })

  it('bug ac0246f5：W3 预铸 blank（绑定 ≡ 项目根）首条消息仍重路由选中树——根绑定占位 ≠ 绑定决定', async () => {
    const rig = guardRig({
      events: {
        blank: [{ type: 'forge/worktree-attach', seq: 0, data: { worktreePath: 'C:/repo', branch: 'main' } }],
      },
      headers: { blank: { cwd: 'C:/repo' } },
    })
    await rig.service.select({ projectRoot: 'C:/repo', path: WT_A })
    const dispose = interceptRequiredBinding(rig.controller, rig.service.requiredBindingGuard()!)
    await rig.controller.prompt({ sessionId: 'blank', text: 'hi' })
    dispose()
    expect(rig.calls[0]?.cwd, '产物应预铸在选中树上（W3 改道产物 blank 仍可重路由）').toBe(WT_A)
    expect(rig.prompts[0]).toMatchObject({ sessionId: expect.not.stringContaining('blank'), text: 'hi' })
  })

  it('bug ac0246f5 伴例：绑定项目根但已非 blank（真实使用过）→ pass 零打扰', async () => {
    const rig = guardRig({
      events: {
        s1: [
          { type: 'forge/worktree-attach', seq: 0, data: { worktreePath: 'C:/repo', branch: 'main' } },
          { type: 'turn/start', seq: 1, data: { turn: 1 } },
        ],
      },
      headers: { s1: { cwd: 'C:/repo' } },
    })
    const verdict = await rig.service.requiredBindingGuard()!.judge('s1')
    expect(verdict).toBe('pass')
  })

  it('bug ac0246f5 伴例：根绑定 blank × 目标 ≡ 自身树 → reuse-self 恰一次投递不重入', async () => {
    const rig = guardRig({
      events: {
        blank: [{ type: 'forge/worktree-attach', seq: 0, data: { worktreePath: 'C:/repo', branch: 'main' } }],
      },
      headers: { blank: { cwd: 'C:/repo' } },
    })
    const dispose = interceptRequiredBinding(rig.controller, rig.service.requiredBindingGuard()!)
    await rig.controller.prompt({ sessionId: 'blank', text: 'hi' })
    dispose()
    expect(rig.prompts).toHaveLength(1)
    expect(rig.prompts[0]).toMatchObject({ sessionId: 'blank', text: 'hi' })
  })

  // ── bug ff324cad 后半：重路由弃置的 blank 源会话就地归档（官方 registry durable 归档集）──
  it('重路由弃置归档：根绑定占位 blank × 目标 ≠ 自身树 → 产物投递成功后源会话 archiveSession({stopActivity:true}) 恰一次', async () => {
    const rig = guardRig({
      events: {
        blank: [{ type: 'forge/worktree-attach', seq: 0, data: { worktreePath: 'C:/repo', branch: 'main' } }],
      },
      headers: { blank: { cwd: 'C:/repo' } },
    })
    await rig.service.select({ projectRoot: 'C:/repo', path: WT_A })
    const dispose = interceptRequiredBinding(rig.controller, rig.service.requiredBindingGuard()!)
    await rig.controller.prompt({ sessionId: 'blank', text: 'hi' })
    dispose()
    expect(rig.prompts[0]).toMatchObject({ sessionId: expect.not.stringContaining('blank') })
    expect(rig.archiveCalls, '弃置占位未归档——侧栏残留「未命名」会话（bug 在场）').toEqual([
      { sessionId: 'blank', options: { stopActivity: true } },
    ])
  })

  it('重路由弃置归档：无绑定官方 blank（wrap fail-open 世界）走产物径 → 源会话同归档', async () => {
    const rig = guardRig({ events: { blank: [] }, headers: { blank: { cwd: 'C:/repo' } } })
    await rig.service.select({ projectRoot: 'C:/repo', path: WT_A })
    const dispose = interceptRequiredBinding(rig.controller, rig.service.requiredBindingGuard()!)
    await rig.controller.prompt({ sessionId: 'blank', text: 'hi' })
    dispose()
    expect(rig.prompts[0]).toMatchObject({ sessionId: expect.not.stringContaining('blank') })
    expect(rig.archiveCalls).toEqual([{ sessionId: 'blank', options: { stopActivity: true } }])
  })

  it('重路由弃置归档：reuse-self（目标 ≡ 自身树）零归档——会话仍是在用主体', async () => {
    const rig = guardRig({
      events: {
        blank: [{ type: 'forge/worktree-attach', seq: 0, data: { worktreePath: 'C:/repo', branch: 'main' } }],
      },
      headers: { blank: { cwd: 'C:/repo' } },
    })
    const dispose = interceptRequiredBinding(rig.controller, rig.service.requiredBindingGuard()!)
    await rig.controller.prompt({ sessionId: 'blank', text: 'hi' })
    dispose()
    expect(rig.prompts[0]).toMatchObject({ sessionId: 'blank' })
    expect(rig.archiveCalls).toEqual([])
  })

  it('重路由弃置归档：产物 prompt 失败 → 零归档（源会话保留供重试），失败原样上抛', async () => {
    const rig = guardRig({
      events: {
        blank: [{ type: 'forge/worktree-attach', seq: 0, data: { worktreePath: 'C:/repo', branch: 'main' } }],
      },
      headers: { blank: { cwd: 'C:/repo' } },
    })
    rig.controller.prompt = (async (request: { sessionId?: string }) => {
      if (request.sessionId !== 'blank') throw new Error('product prompt boom')
      return { accepted: true }
    }) as SessionControllerFace['prompt']
    await rig.service.select({ projectRoot: 'C:/repo', path: WT_A })
    const dispose = interceptRequiredBinding(rig.controller, rig.service.requiredBindingGuard()!)
    await expect(rig.controller.prompt({ sessionId: 'blank', text: 'hi' })).rejects.toThrow('product prompt boom')
    dispose()
    expect(rig.archiveCalls).toEqual([])
  })

  it('bug 4a30b193：hero 选中树目录已被强制删除（陈旧 lastSelection）→ 回落会话 cwd 编排，绝不在已删路径上预铸', async () => {
    const GHOST = 'C:/repo/.forge/worktrees/gone'
    const { persistence, created } = fakePersistence({ blank: [] }, { blank: { cwd: 'C:/repo' } })
    const { controller, calls, prompts } = fakeController()
    const service = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionController: controller,
      sessionPersistence: persistence,
      listWorktreeEntries: async () => [
        { path: 'C:/repo', branch: 'main' },
        { path: GHOST, branch: 'feat/gone' }, // git 未 prune 的陈旧清单行——分支解析仍可「成功」
      ],
      pathPresent: (p) => p === 'C:/repo', // 选中树目录已被强制删除，仅主根在场
    })
    await service.select({ projectRoot: 'C:/repo', path: GHOST })
    const dispose = interceptRequiredBinding(controller, service.requiredBindingGuard()!)
    await expect(controller.prompt({ sessionId: 'blank', text: 'hello' })).resolves.toEqual({ accepted: true })
    dispose()
    expect(calls, '编排在已删路径上预铸采纳（bug 在场）').toHaveLength(1)
    expect(calls[0]!.cwd, '产物 cwd 应回落会话 cwd（主根）').toBe('C:/repo')
    expect(created[0]!.header.cwd).toBe('C:/repo')
    expect(prompts[0]).toMatchObject({ sessionId: created[0]!.header.id, text: 'hello' })
  })

  it('bug 4a30b193：会话 cwd 树目录亦不在场 → 显式报错（可读错误含路径），不静默编排半截会话', async () => {
    const GHOST = 'C:/repo/.forge/worktrees/gone'
    const { persistence, created } = fakePersistence({ blank: [] }, { blank: { cwd: GHOST } })
    const { controller, calls } = fakeController()
    const service = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionController: controller,
      sessionPersistence: persistence,
      listWorktreeEntries: async () => [{ path: GHOST, branch: 'feat/gone' }],
      pathPresent: () => false,
    })
    const dispose = interceptRequiredBinding(controller, service.requiredBindingGuard()!)
    await expect(controller.prompt({ sessionId: 'blank', text: 'hi' })).rejects.toMatchObject({
      name: 'WorktreeTargetAbsentError',
      code: 'ERR_WORKTREE_TARGET_ABSENT',
      targetPath: GHOST,
      message: expect.stringContaining('已不存在'),
    })
    dispose()
    expect(calls, 'controller.create 被调用（半截预铸在场）').toHaveLength(0)
    expect(created).toHaveLength(0)
  })

  it('有绑定会话放行（原 prompt 直通，零重路由）；非 blank 无绑定既有会话零打扰放行', async () => {
    const bound = guardRig({ events: { s1: attachEvent(WT_A) }, headers: { s1: { cwd: WT_A } } })
    const disposeBound = interceptRequiredBinding(bound.controller, bound.service.requiredBindingGuard()!)
    await expect(bound.controller.prompt({ sessionId: 's1', text: 'hi' })).resolves.toEqual({ accepted: true })
    disposeBound()
    expect(bound.prompts).toEqual([{ sessionId: 's1', text: 'hi' }])
    expect(bound.calls).toHaveLength(0)

    const used = guardRig({
      events: { s2: [{ type: 'turn/start', seq: 1, data: { turn: 1 } }, { type: 'user/message', seq: 2, data: {} }] },
      headers: { s2: { cwd: 'C:/repo' } },
    })
    const disposeUsed = interceptRequiredBinding(used.controller, used.service.requiredBindingGuard()!)
    await expect(used.controller.prompt({ sessionId: 's2', text: 'hi' })).resolves.toEqual({ accepted: true })
    disposeUsed()
    expect(used.prompts).toEqual([{ sessionId: 's2', text: 'hi' }])
    expect(used.calls).toHaveLength(0)
  })

  it('G7② 性能钉：非 git 项目 prompt 零 git 探测扩散、会话日志读只有 cwd 探测一次（逐会话记忆后零读）', async () => {
    const rig = guardRig({ events: { f1: [] }, headers: { f1: { cwd: 'C:/foreign/plain' } } })
    const dispose = interceptRequiredBinding(rig.controller, rig.service.requiredBindingGuard()!)
    await rig.controller.prompt({ sessionId: 'f1', text: 'a' })
    await rig.controller.prompt({ sessionId: 'f1', text: 'b' })
    dispose()
    expect(rig.prompts).toHaveLength(2) // 非 git 零行为差异：两次都原会话直发
    expect(rig.resolveCallsOf(), '非 git 判读未按 projectRoot 记忆化（每消息 git 子进程固定税）').toBe(1)
    expect(rig.opens.value, '非 git 项目会话日志被反复读（cwd 记忆缺席）').toBe(1)
  })

  it('A5：SessionCwdMismatchError 拦截面拒绝不放行（不再 fail-open）', async () => {
    const rig = guardRig({ events: { s1: attachEvent(WT_A) }, headers: { s1: { cwd: 'C:/elsewhere' } } })
    const dispose = interceptRequiredBinding(rig.controller, rig.service.requiredBindingGuard()!)
    await expect(rig.controller.prompt({ sessionId: 's1', text: 'hi' })).rejects.toThrow(SessionCwdMismatchError)
    dispose()
    expect(rig.prompts).toHaveLength(0)
  })

  it('重路由失败显式报错（编排失败不静默丢消息）', async () => {
    const opens = { value: 0 }
    const { persistence } = fakePersistence({ blank: [] }, { blank: { cwd: 'C:/repo' } }, opens)
    const { controller, prompts } = fakeController()
    const service = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionController: controller,
      sessionPersistence: persistence,
      pathPresent: () => true, // fake 路径无盘上实体——本测专查编排失败径，活性恒真
      listWorktreeEntries: async () => {
        throw new Error('git crashed')
      },
    })
    const dispose = interceptRequiredBinding(controller, service.requiredBindingGuard()!)
    await expect(controller.prompt({ sessionId: 'blank', text: 'hi' })).rejects.toThrow()
    dispose()
    expect(prompts as unknown[]).toHaveLength(0) // 原会话零直发（失败显式报错，不静默丢消息）
  })

  // ── bug 82cab5fe：官方直建会话（首回合前种子事件非 ignorable）blank 判据 + 模式随档 ──
  const officialSeedEvents = [
    { type: 'permission/preset', seq: 0, data: { preset: 'danger-full-access' } },
    { type: 'sandbox/mode', seq: 1, data: { mode: 'danger-full-access' } },
    { type: 'approval/policy', seq: 2, data: { policy: 'never' } },
  ]

  it('bug 82cab5fe：官方直建会话（种子事件非 ignorable、无 turn/start）→ 必绑重路由进预铸链（官方投影 blank 语义：种子事件 ≠ 已用）', async () => {
    const rig = guardRig({ events: { seeded: officialSeedEvents }, headers: { seeded: { cwd: 'C:/repo' } } })
    const dispose = interceptRequiredBinding(rig.controller, rig.service.requiredBindingGuard()!)
    await rig.controller.prompt({ sessionId: 'seeded', text: '你好' })
    dispose()
    expect(rig.calls, '官方直建 blank 会话应重路由绑定（bug 在场 = blankOf 恒 false 恒 pass 永无绑定）').toHaveLength(1)
    expect(rig.prompts[0]).toMatchObject({ sessionId: expect.not.stringContaining('seeded'), text: '你好' })
  })

  it('bug 82cab5fe 模式随档：源会话 selected 事件 blitz → 产物预铸头随 blitz（registry 默认不覆盖源档）', async () => {
    const rig = guardRig({
      events: { src: [{ type: 'agent-preset/selected', seq: 0, data: { agentPreset: 'blitz' } }] },
      headers: { src: { cwd: 'C:/repo', agentPreset: 'expedition' } },
    })
    const dispose = interceptRequiredBinding(rig.controller, rig.service.requiredBindingGuard()!)
    await rig.controller.prompt({ sessionId: 'src', text: 'hi' })
    dispose()
    expect(rig.created[0]?.header, '重路由产物丢源档 = 模式 chip 顾此失彼').toMatchObject({ agentPreset: 'blitz' })
  })

  it('bug 82cab5fe 模式随档：源会话头 agentPreset（无 selected 事件）→ 产物预铸头随同值', async () => {
    const rig = guardRig({ events: { src: [] }, headers: { src: { cwd: 'C:/repo', agentPreset: 'expedition' } } })
    const dispose = interceptRequiredBinding(rig.controller, rig.service.requiredBindingGuard()!)
    await rig.controller.prompt({ sessionId: 'src', text: 'hi' })
    dispose()
    expect(rig.created[0]?.header).toMatchObject({ agentPreset: 'expedition' })
  })

  it('子会话（header.parentSession 在场——worker/fork）恒放行零重路由（官方子代理机械所有，非 hero 人口）', async () => {
    const rig = guardRig({
      events: { child: [] },
      headers: { child: { cwd: 'C:/repo', parentSession: 'session-parent' } },
    })
    const dispose = interceptRequiredBinding(rig.controller, rig.service.requiredBindingGuard()!)
    await rig.controller.prompt({ sessionId: 'child', text: 'hi' })
    dispose()
    expect(rig.calls, '子会话不得被重路由绑树').toHaveLength(0)
    expect(rig.prompts).toEqual([{ sessionId: 'child', text: 'hi' }])
  })

  it('显式 agentPreset 请求覆盖 registry 默认（sessionCreate 请求面——源档 > 默认单源）', async () => {
    const { controller } = fakeController()
    const { persistence, created } = fakePersistence({})
    const service = createWorktreeRpcService({
      sessionController: controller,
      sessionPersistence: persistence,
      listWorktreeEntries: async () => [{ path: WT_A, branch: 'feat/a' }],
      resolveDefaultPreset: async () => 'expedition',
      pathPresent: () => true, // fake 路径无盘上实体——前置活性守卫恒真（缺席专测单独表驱动）
    })
    await service.sessionCreate({ worktreePath: WT_A, agentPreset: 'blitz' })
    expect(created[0]?.header, '请求显式档缺席 = 重路由随档面无处落地').toMatchObject({ agentPreset: 'blitz' })
  })

  it('G3 双建互斥：并发 sessionCreate 同 cwd 单产物；后续调用复用产物（每 cwd 至多一个 blank 产物）', async () => {
    const { controller } = fakeController()
    const { persistence, created } = fakePersistence({})
    const service = createWorktreeRpcService({
      sessionController: controller,
      sessionPersistence: persistence,
      listWorktreeEntries: async () => [{ path: WT_A, branch: 'feat/a' }],
      pathPresent: () => true, // fake 路径无盘上实体——前置活性守卫恒真（缺席专测单独表驱动）
    })
    const [a, b] = await Promise.all([
      service.sessionCreate({ worktreePath: WT_A }),
      service.sessionCreate({ worktreePath: WT_A }),
    ])
    expect(a.sessionId).toBe(b.sessionId)
    expect(created, '并发双建：同一 cwd 产出两个预铸会话').toHaveLength(1)
    const c = await service.sessionCreate({ worktreePath: WT_A })
    expect(c.sessionId).toBe(a.sessionId)
    expect(created).toHaveLength(1)
  })

  // ── bug ff324cad 根治级：创建即绑选中树（hero 选中记忆消费前移到 sessionCreate——
  //    wrap 请求项目根时直接预铸选中树会话，零主树占位双建）──
  it('创建即绑选中树：select 推送在场 → sessionCreate(项目根) 直接预铸选中树会话（预铸头 cwd / adopt cwd / 工作区归属三面全落选中树，零主树占位）', async () => {
    const { controller, calls } = fakeController()
    const { persistence, created } = fakePersistence({})
    const { registry, created: wsCreated } = fakeWorkspaceRegistry()
    const service = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionController: controller,
      sessionPersistence: persistence,
      listWorktreeEntries: async () => [
        { path: 'C:/repo', branch: 'main' },
        { path: WT_A, branch: 'feat/a' },
      ],
      workspaceRegistry: registry,
      pathPresent: () => true,
      ensureDirAcl: async () => {},
    })
    await service.select({ projectRoot: 'C:/repo', path: WT_A })
    const result = await service.sessionCreate({ worktreePath: 'C:/repo' })
    expect(created, '预铸头 cwd 未落选中树——创建即绑选中树未兑现（bug 在场）').toEqual([
      { header: expect.objectContaining({ cwd: WT_A, id: result.sessionId }) },
    ])
    expect(calls, 'controller.create adopt 未落选中树').toEqual([
      { sessionId: result.sessionId, cwd: WT_A },
    ])
    expect(wsCreated.map((row) => row.path), '工作区归属未落选中树（主树占位会话出现）').toEqual([WT_A])
  })

  it('创建即绑选中树：选中记忆为陈旧树（盘上缺席）→ 记忆摘除回落项目根（不对已删路径预铸）', async () => {
    const { controller, calls } = fakeController()
    const { persistence, created } = fakePersistence({})
    const ghost = 'C:/repo/.forge/worktrees/ghost'
    const service = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionController: controller,
      sessionPersistence: persistence,
      listWorktreeEntries: async () => [{ path: 'C:/repo', branch: 'main' }],
      pathPresent: (path) => path !== ghost,
      ensureDirAcl: async () => {},
    })
    await service.select({ projectRoot: 'C:/repo', path: ghost })
    const result = await service.sessionCreate({ worktreePath: 'C:/repo' })
    expect(created[0]?.header.cwd, '陈旧选中树被用作预铸目标（bug 4a30b193 同族回归）').toBe('C:/repo')
    expect(calls).toEqual([{ sessionId: result.sessionId, cwd: 'C:/repo' }])
  })

  it('创建即绑选中树：选中树 ≡ 项目根（主行锚定）→ 原语义预铸项目根（零行为差异）', async () => {
    const { controller } = fakeController()
    const { persistence, created } = fakePersistence({})
    const service = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionController: controller,
      sessionPersistence: persistence,
      listWorktreeEntries: async () => [{ path: 'C:/repo', branch: 'main' }],
      pathPresent: () => true,
      ensureDirAcl: async () => {},
    })
    await service.select({ projectRoot: 'C:/repo', path: 'C:/repo' })
    await service.sessionCreate({ worktreePath: 'C:/repo' })
    expect(created[0]?.header.cwd).toBe('C:/repo')
  })

  // ── bug ff324cad 占位回收：弃置归档的 blank 占位循环复用——全局至多一个根占位（累积面收口）──
  it('占位回收：归档产物再创建 → unarchive 回活复用同一会话（零新建预铸；时间戳陈旧为单写者边界——bug 8af836eb 撤收刷新）', async () => {
    const { controller } = fakeController()
    const events: Record<string, readonly unknown[]> = {}
    const headers: Record<string, { cwd: string }> = {}
    const { persistence, created } = fakePersistence(events, headers)
    const ws = fakeWorkspaceRegistry()
    const service = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionController: controller,
      sessionPersistence: persistence,
      listWorktreeEntries: async () => [{ path: 'C:/repo', branch: 'main' }],
      workspaceRegistry: ws.registry,
      pathPresent: () => true,
      ensureDirAcl: async () => {},
    })
    const first = await service.sessionCreate({ worktreePath: 'C:/repo' })
    // 交付核验种子：绑定 ≡ 目标树且头 cwd 自洽（1.19 守护面）
    events[first.sessionId] = [{ type: 'forge/worktree-attach', seq: 0, data: { worktreePath: 'C:/repo', branch: 'main' } }]
    headers[first.sessionId] = { cwd: 'C:/repo' }
    ws.archived.push(first.sessionId) // 重路由弃置归档后的世界
    const second = await service.sessionCreate({ worktreePath: 'C:/repo' })
    expect(second.sessionId, '归档占位未回收——每次新会话新增一个 blank（累积面在场）').toBe(first.sessionId)
    expect(ws.unarchived).toEqual([first.sessionId])
    expect(created, '回收必须零新建预铸').toHaveLength(1)
    // 回收后的 live blank 再创建 → 原路复用（G3 原语义）
    const third = await service.sessionCreate({ worktreePath: 'C:/repo' })
    expect(third.sessionId).toBe(first.sessionId)
    expect(created).toHaveLength(1)
  })

  it('占位回收：重启世界（G3 产物内存态不在）→ persistence 扫描归档 blank 复用（零新建）', async () => {
    const { controller } = fakeController()
    const { persistence, created } = fakePersistence({
      arch: [{ type: 'forge/worktree-attach', seq: 0, data: { worktreePath: 'C:/repo', branch: 'main' } }],
    })
    const ws = fakeWorkspaceRegistry()
    ws.archived.push('arch')
    const service = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionController: controller,
      sessionPersistence: persistence,
      listWorktreeEntries: async () => [{ path: 'C:/repo', branch: 'main' }],
      workspaceRegistry: ws.registry,
      pathPresent: () => true,
      ensureDirAcl: async () => {},
    })
    const result = await service.sessionCreate({ worktreePath: 'C:/repo' })
    expect(result.sessionId, '重启后未扫描回收归档占位——新建累积').toBe('arch')
    expect(ws.unarchived).toEqual(['arch'])
    expect(created, '重启世界回收零新建').toHaveLength(0)
  })

  it('占位回收：回收面缺席（registry 无 unarchiveSession）→ 降级新建（现状行为零回归）', async () => {
    const { controller } = fakeController()
    const { persistence, created } = fakePersistence({})
    const base = fakeWorkspaceRegistry()
    const broken: Record<string, unknown> = { ...base.registry }
    delete broken['unarchiveSession']
    const service = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionController: controller,
      sessionPersistence: persistence,
      listWorktreeEntries: async () => [{ path: 'C:/repo', branch: 'main' }],
      workspaceRegistry: broken as never,
      pathPresent: () => true,
      ensureDirAcl: async () => {},
    })
    const first = await service.sessionCreate({ worktreePath: 'C:/repo' })
    base.archived.push(first.sessionId)
    const second = await service.sessionCreate({ worktreePath: 'C:/repo' })
    expect(second.sessionId).not.toBe(first.sessionId)
    expect(created).toHaveLength(2)
  })

  it('占位回收：归档产物 cwd 核验不符（绑定 ≠ 目标树）→ 不回收降级新建（占位漂移不可交付）', async () => {
    const { controller } = fakeController()
    const events: Record<string, readonly unknown[]> = {}
    const headers: Record<string, { cwd: string }> = {}
    const { persistence, created } = fakePersistence(events, headers)
    const ws = fakeWorkspaceRegistry()
    const service = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionController: controller,
      sessionPersistence: persistence,
      listWorktreeEntries: async () => [{ path: 'C:/repo', branch: 'main' }],
      workspaceRegistry: ws.registry,
      pathPresent: () => true,
      ensureDirAcl: async () => {},
    })
    const first = await service.sessionCreate({ worktreePath: 'C:/repo' })
    // 漂移形态一：绑定与头 cwd 自洽但 ≠ 目标树（外部改档/旧世界产物）
    events[first.sessionId] = [{ type: 'forge/worktree-attach', seq: 0, data: { worktreePath: 'C:/elsewhere', branch: 'x' } }]
    headers[first.sessionId] = { cwd: 'C:/elsewhere' }
    ws.archived.push(first.sessionId)
    const second = await service.sessionCreate({ worktreePath: 'C:/repo' })
    expect(second.sessionId, '绑定 ≠ 目标树的归档占位被当目标树产物交付').not.toBe(first.sessionId)
    expect(created).toHaveLength(2)
  })

  it('占位回收：归档产物头 cwd 漂移（header cwd ≠ 绑定树，1.19 强制守护）→ readLatestAttach 拒收降级新建', async () => {
    const { controller } = fakeController()
    const events: Record<string, readonly unknown[]> = {}
    const headers: Record<string, { cwd: string }> = {}
    const { persistence, created } = fakePersistence(events, headers)
    const ws = fakeWorkspaceRegistry()
    const service = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionController: controller,
      sessionPersistence: persistence,
      listWorktreeEntries: async () => [{ path: 'C:/repo', branch: 'main' }],
      workspaceRegistry: ws.registry,
      pathPresent: () => true,
      ensureDirAcl: async () => {},
    })
    const first = await service.sessionCreate({ worktreePath: 'C:/repo' })
    // 漂移形态二：绑定 ≡ 目标树但头 cwd 漂移——readLatestAttach cwd 强制守护抛错 → 拒收
    events[first.sessionId] = [{ type: 'forge/worktree-attach', seq: 0, data: { worktreePath: 'C:/repo', branch: 'main' } }]
    headers[first.sessionId] = { cwd: 'C:/drifted' }
    ws.archived.push(first.sessionId)
    const second = await service.sessionCreate({ worktreePath: 'C:/repo' })
    expect(second.sessionId, '头 cwd 漂移的归档占位被交付（1.19 守护被绕过）').not.toBe(first.sessionId)
    expect(created).toHaveLength(2)
  })

  // ── bug 9eb9d6cb 真机反馈：unborn HEAD 仓库（temp fixture：git init 后零提交）──
  it('unborn HEAD 兜底：清单无 branch 行 → symbolic-ref 取分支短名，预铸成功', async () => {
    const { controller } = fakeController()
    const { persistence, created } = fakePersistence({})
    const FIXTURE = 'C:/Users/panda/AppData/Local/Temp/v2-b-fixture'
    const service = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionController: controller,
      sessionPersistence: persistence,
      listWorktreeEntries: async () => [{ path: FIXTURE, branch: null }], // unborn HEAD：porcelain 无 branch 行
      symbolicRefOf: async () => 'main', // HEAD 指向存在的分支 ref——unborn 也有合法分支名
      pathPresent: () => true,
      ensureDirAcl: async () => {},
    })
    const result = await service.sessionCreate({ worktreePath: FIXTURE })
    expect(created, 'unborn HEAD 兜底缺席 = 每次点击 typed 报错（bug 在场）').toHaveLength(1)
    expect(created[0]?.header.cwd).toBe(FIXTURE)
    expect(result.branch).toBe('main')
  })

  it('unborn HEAD 兜底：symbolic-ref 探测失败（null）→ 落空显式拒原语义（零猜测）', async () => {
    const { controller } = fakeController()
    const { persistence, created } = fakePersistence({})
    const service = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionController: controller,
      sessionPersistence: persistence,
      listWorktreeEntries: async () => [{ path: WT_A, branch: null }],
      symbolicRefOf: async () => null,
      pathPresent: () => true,
      ensureDirAcl: async () => {},
    })
    await expect(service.sessionCreate({ worktreePath: WT_A })).rejects.toThrow('分支解析失败')
    expect(created).toHaveLength(0)
  })

  it('创建即绑选中树：显式树请求不被选中记忆劫持——select 推送他树后 sessionCreate(显式树) 恒预铸显式树（点选即换绑编排前置）', async () => {
    const { controller, calls } = fakeController()
    const { persistence, created } = fakePersistence({})
    const WT_B = 'C:/repo/.forge/worktrees/wt-b'
    const service = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionController: controller,
      sessionPersistence: persistence,
      listWorktreeEntries: async () => [
        { path: 'C:/repo', branch: 'main' },
        { path: WT_A, branch: 'feat/a' },
        { path: WT_B, branch: 'feat/b' },
      ],
      pathPresent: () => true,
      ensureDirAcl: async () => {},
    })
    await service.select({ projectRoot: 'C:/repo', path: WT_B })
    const result = await service.sessionCreate({ worktreePath: WT_A })
    expect(created[0]?.header.cwd, '显式树请求被记忆劫持到选中树').toBe(WT_A)
    expect(calls).toEqual([{ sessionId: result.sessionId, cwd: WT_A }])
  })

  // ── 绑定表失效锚（onWorktreeSetChanged——外部裸建树首次使用即入表的 sessionCreate 锚）──
  it('锚恰一次：全新 sessionCreate 成功后触发 onWorktreeSetChanged 恰一次（进 pending 链——G3 并发等待者不重复触发）；blank 复用不重触发', async () => {
    const { controller } = fakeController()
    const { persistence } = fakePersistence({})
    let fired = 0
    const service = createWorktreeRpcService({
      sessionController: controller,
      sessionPersistence: persistence,
      listWorktreeEntries: async () => [{ path: WT_A, branch: 'feat/a' }],
      onWorktreeSetChanged: async () => {
        fired += 1
      },
      pathPresent: () => true, // fake 路径无盘上实体——前置活性守卫恒真（缺席专测单独表驱动）
    })
    const [a, b] = await Promise.all([
      service.sessionCreate({ worktreePath: WT_A }),
      service.sessionCreate({ worktreePath: WT_A }),
    ])
    expect(a.sessionId).toBe(b.sessionId)
    expect(fired, '并发共享同链——锚恰一次').toBe(1)
    await service.sessionCreate({ worktreePath: WT_A }) // blank 复用径
    expect(fired, '复用不重触发').toBe(1)
  })

  it('锚 fail-soft：onWorktreeSetChanged 抛错不改写 sessionCreate 产物（只记 warn）', async () => {
    const { controller } = fakeController()
    const { persistence, created } = fakePersistence({})
    const warnings: string[] = []
    const service = createWorktreeRpcService({
      sessionController: controller,
      sessionPersistence: persistence,
      listWorktreeEntries: async () => [{ path: WT_A, branch: 'feat/a' }],
      onWorktreeSetChanged: async () => {
        throw new Error('refresh boom')
      },
      warn: (line) => warnings.push(line),
      pathPresent: () => true, // fake 路径无盘上实体——前置活性守卫恒真（缺席专测单独表驱动）
    })
    const result = await service.sessionCreate({ worktreePath: WT_A })
    expect(result.sessionId).toBe(created[0]?.header.id) // 产物原样返回
    expect(warnings.some((line) => line.includes('绑定表刷新锚失败'))).toBe(true)
  })

  // ── 权限补钉锚（bug e5059ee1——adopt 钉档绕过 defaultPreset，装配方经官方 permissionPresets.set 补钉）──
  it('权限补钉：全新 sessionCreate 成功后触发 onSessionAdopted 恰一次（产物已活——controller.create 已返回）；blank 复用不重触发', async () => {
    const { controller } = fakeController()
    const { persistence } = fakePersistence({})
    const adopted: string[] = []
    const service = createWorktreeRpcService({
      sessionController: controller,
      sessionPersistence: persistence,
      listWorktreeEntries: async () => [{ path: WT_A, branch: 'feat/a' }],
      onSessionAdopted: async (sessionId) => {
        adopted.push(sessionId)
      },
      pathPresent: () => true, // fake 路径无盘上实体——前置活性守卫恒真（缺席专测单独表驱动）
    })
    const [a, b] = await Promise.all([
      service.sessionCreate({ worktreePath: WT_A }),
      service.sessionCreate({ worktreePath: WT_A }),
    ])
    expect(a.sessionId).toBe(b.sessionId)
    expect(adopted, '并发共享同链 + 复用不重触发——恰一次').toEqual([a.sessionId])
    await service.sessionCreate({ worktreePath: WT_A })
    expect(adopted).toHaveLength(1)
  })

  it('权限补钉 fail-soft：onSessionAdopted 抛错不改写产物、不阻断绑定表锚（两者独立）', async () => {
    const { controller } = fakeController()
    const { persistence } = fakePersistence({})
    const warnings: string[] = []
    let refreshed = 0
    const service = createWorktreeRpcService({
      sessionController: controller,
      sessionPersistence: persistence,
      listWorktreeEntries: async () => [{ path: WT_A, branch: 'feat/a' }],
      onWorktreeSetChanged: async () => {
        refreshed += 1
      },
      onSessionAdopted: async () => {
        throw new Error('pin boom')
      },
      warn: (line) => warnings.push(line),
      pathPresent: () => true, // fake 路径无盘上实体——前置活性守卫恒真（缺席专测单独表驱动）
    })
    const result = await service.sessionCreate({ worktreePath: WT_A })
    expect(result.sessionId).toMatch(/^session-/)
    expect(warnings.some((line) => line.includes('权限补钉失败'))).toBe(true)
    expect(refreshed).toBe(1) // 绑定表锚不受影响
  })

  it('G7② seal 判序反转：request.cwd 命中非 git 能力缓存 → 零会话日志读', async () => {
    const opens = { value: 0 }
    const { persistence } = fakePersistence({ s1: attachEvent(WT_A) }, { s1: { cwd: 'C:/foreign/x' } }, opens)
    const service = createWorktreeRpcService({ gitWorktree: fakeExt, sessionPersistence: persistence })
    await service.seal({ sessionId: 's1', cwd: 'C:/foreign/x' })
    await service.seal({ sessionId: 's1', cwd: 'C:/foreign/x' })
    expect(opens.value, '非 git 封存判定仍全量读会话日志（判序未反转）').toBe(0)
  })

  it('逆序撤销安全：外层 dispose 后内层封存拦截仍在', async () => {
    const { controller, prompts } = fakeController()
    interceptSessionSends(controller, async () => ({ isGit: true, sealed: true, binding: { worktreePath: 'x', branch: 'b' } }))
    const outer = interceptRequiredBinding(controller, {
      judge: async () => 'pass',
      reroute: async () => undefined,
    })
    outer()
    await expect(controller.prompt({ sessionId: 's1' })).rejects.toThrow(SessionSealedError)
    expect(prompts).toHaveLength(0)
  })
})

describe('W2 能力缺席显式拒绝（fail-closed 收口）', () => {
  const WT_A = 'C:/repo/.forge/worktrees/wt-a'

  /** 缺席装配桩：gitWorktree 能力缺席 + guardState/探针表驱动 + 预铸采纳两缝在场 */
  function absentRig(input: {
    guardState?: 'absent'
    probe?: (dir: string) => Promise<string | null>
    headers?: Record<string, { cwd: string }>
  }) {
    const probes: string[] = []
    const probeGitAnchor = async (dir: string): Promise<string | null> => {
      probes.push(dir)
      return input.probe ? input.probe(dir) : null
    }
    const { persistence } = fakePersistence({}, input.headers ?? {})
    const { controller, calls, prompts } = fakeController()
    const service = createWorktreeRpcService({
      // gitWorktree 能力缺席（不传）+ 60s 放弃位表驱动 + 探针注入桩
      guardState: input.guardState === 'absent' ? (() => 'absent' as const) : undefined,
      probeGitAnchor,
      sessionController: controller,
      sessionPersistence: persistence,
      listWorktreeEntries: async () => [{ path: WT_A, branch: 'feat/a' }],
      pathPresent: () => true, // fake 路径无盘上实体——前置活性守卫恒真（缺席专测单独表驱动）
    })
    return { service, controller, calls, prompts, probesOf: () => probes }
  }

  it('git 拒：能力缺席 + guardState absent + 探针有锚 → sessionCreate typed error 显式拒绝（controller.create 零调用）', async () => {
    const rig = absentRig({ guardState: 'absent', probe: async () => 'C:/repo' })
    await expect(rig.service.sessionCreate({ worktreePath: WT_A })).rejects.toMatchObject({
      name: 'WorktreeCapabilityAbsentError',
      code: 'ERR_WORKTREE_CAPABILITY_ABSENT',
    })
    await expect(rig.service.sessionCreate({ worktreePath: WT_A })).rejects.toThrow(/git 绑定能力缺席/)
    expect(rig.calls).toHaveLength(0)
  })

  it('typed error 经 rpcEnvelope 序列化为 RpcErr 信封（code ∈ ERROR_CODES——前端 RpcClientError 链可达）', async () => {
    const rig = absentRig({ guardState: 'absent', probe: async () => 'C:/repo' })
    const handler = rpcEnvelope((q: WorktreeSessionCreateRequest) => rig.service.sessionCreate(q))
    const result = await handler(undefined, { worktreePath: WT_A })
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'ERR_WORKTREE_CAPABILITY_ABSENT', message: expect.stringContaining('git 绑定能力缺席') },
    })
  })

  it('非 git 照常：探针 null → 官方原流（预铸采纳照常，行为零差异）', async () => {
    const rig = absentRig({ guardState: 'absent', probe: async () => null })
    const result = await rig.service.sessionCreate({ worktreePath: WT_A })
    expect(result).toMatchObject({ sessionId: expect.any(String), branch: 'feat/a' })
    expect(rig.calls).toHaveLength(1)
  })

  it('探针逐次现跑、零缓存：git 仓库移除后下一次创建立刻判非 git（探针两次现跑）', async () => {
    let repoPresent = true
    const rig = absentRig({ guardState: 'absent', probe: async () => (repoPresent ? 'C:/repo' : null) })
    await expect(rig.service.sessionCreate({ worktreePath: WT_A })).rejects.toThrow(WorktreeCapabilityAbsentError)
    repoPresent = false // 模拟 git 仓库被移除
    const result = await rig.service.sessionCreate({ worktreePath: WT_A })
    expect(result).toMatchObject({ sessionId: expect.any(String) })
    expect(rig.probesOf()).toHaveLength(2) // 逐次现跑——判定结果未作会话期记忆
  })

  it('瞬态窗口 fail-open 现状：guardState 未盖位（能力轮询未放弃）→ 探针不跑、sessionCreate 照常（D1 拆分）', async () => {
    const rig = absentRig({ probe: async () => 'C:/repo' })
    const result = await rig.service.sessionCreate({ worktreePath: WT_A })
    expect(result).toMatchObject({ sessionId: expect.any(String) })
    expect(rig.probesOf()).toHaveLength(0)
  })

  it('能力在场零改动：gitWorktree 在场时探针不跑（粘性能力位优先，非介入面零固定税）', async () => {
    const probes: string[] = []
    const { persistence } = fakePersistence({})
    const { controller, calls } = fakeController()
    const service = createWorktreeRpcService({
      gitWorktree: fakeExt,
      guardState: () => 'absent',
      probeGitAnchor: async (dir) => {
        probes.push(dir)
        return 'C:/repo'
      },
      sessionController: controller,
      sessionPersistence: persistence,
      listWorktreeEntries: async () => [{ path: WT_A, branch: 'feat/a' }],
      pathPresent: () => true, // fake 路径无盘上实体——前置活性守卫恒真（缺席专测单独表驱动）
    })
    const result = await service.sessionCreate({ worktreePath: WT_A })
    expect(result).toMatchObject({ sessionId: expect.any(String) })
    expect(calls).toHaveLength(1)
    expect(probes).toHaveLength(0)
  })

  it('prompt 拦截拒：能力缺席 + 探针有锚 → judge 抛稳定 name 错误（显式拒绝不 fail-open）', async () => {
    const rig = absentRig({ guardState: 'absent', probe: async () => 'C:/repo', headers: { blank: { cwd: 'C:/repo' } } })
    const guard = rig.service.requiredBindingGuard()
    expect(guard).toBeDefined()
    await expect(guard!.judge('blank')).rejects.toMatchObject({
      name: 'WorktreeCapabilityAbsentError',
      code: 'ERR_WORKTREE_CAPABILITY_ABSENT',
    })
    await expect(guard!.judge('blank')).rejects.toThrow(/git 绑定能力缺席/)
  })

  it('prompt 拦截非 git 照常：探针 null → judge pass 原流放行', async () => {
    const rig = absentRig({ guardState: 'absent', probe: async () => null, headers: { blank: { cwd: 'C:/repo' } } })
    const { controller, prompts } = rig
    const dispose = interceptRequiredBinding(controller, rig.service.requiredBindingGuard()!)
    await expect(controller.prompt({ sessionId: 'blank', text: 'hi' })).resolves.toEqual({ accepted: true })
    dispose()
    expect(prompts).toEqual([{ sessionId: 'blank', text: 'hi' }])
  })
})

// ── W4 装载自证（session-binding-guarantee §W4）——wrap 换芯读回判读核 ──────────────────
describe('verifySendGuardInstalled（成功路径自证：prompt 已换 + guard 非空，失败 fail-loud）', () => {
  const fakeController = (prompt: unknown): SessionControllerFace =>
    ({ prompt }) as unknown as SessionControllerFace

  it('换芯（prompt ≠ 装配前留底）+ guard 在场 → 通过不抛', () => {
    const original = (): Promise<unknown> => Promise.resolve()
    const wrapped = (): Promise<unknown> => Promise.resolve()
    expect(() =>
      verifySendGuardInstalled(fakeController(wrapped), { promptBefore: original, guardPresent: true }),
    ).not.toThrow()
  })

  it('prompt 未换芯（= 装配前留底）→ 抛 fail-loud（不静默残缺）', () => {
    const original = (): Promise<unknown> => Promise.resolve()
    expect(() =>
      verifySendGuardInstalled(fakeController(original), { promptBefore: original, guardPresent: true }),
    ).toThrow(/未换芯/)
  })

  it('必绑 guard 缺席（sessionPersistence 缺席）→ 抛 fail-loud', () => {
    const original = (): Promise<unknown> => Promise.resolve()
    const wrapped = (): Promise<unknown> => Promise.resolve()
    expect(() =>
      verifySendGuardInstalled(fakeController(wrapped), { promptBefore: original, guardPresent: false }),
    ).toThrow(/guard 缺席/)
  })

  it('装配前留底非函数（prompt 面漂移）→ 抛 fail-loud', () => {
    expect(() =>
      verifySendGuardInstalled(fakeController(undefined), { promptBefore: undefined, guardPresent: true }),
    ).toThrow(/留底缺席/)
  })
})

describe('interceptRequiredBinding trace 缝（app-observability 1.2 链 B——prompt 入口生成 + ALS 包裹）', () => {
  const als = createDiagContextStore()

  function rig(judgeResult: 'route' | 'pass' = 'pass') {
    const seenTraceIds: Array<string | undefined> = []
    const controller = {
      prompt: async (request: { sessionId: string; text: string }) => {
        seenTraceIds.push(als.getStore()?.traceId)
        return { accepted: true, request }
      },
    } as unknown as SessionControllerFace
    const guard = {
      judge: async () => judgeResult,
      reroute: async (sessionId: string) => {
        seenTraceIds.push(als.getStore()?.traceId)
        return { rerouted: sessionId }
      },
    } as unknown as Parameters<typeof interceptRequiredBinding>[1]
    return { controller, guard, seenTraceIds }
  }

  it('prompt 入口生成 trace_id，judge/原发送同链 ALS 可读（一次 prompt 全链同 trace_id）', async () => {
    const rig1 = rig()
    const issued: string[] = []
    const dispose = interceptRequiredBinding(rig1.controller, rig1.guard, console.warn, {
      next: () => {
        const id = `tr-${issued.length}`
        issued.push(id)
        return id
      },
      run: <T,>(traceId: string, _sessionId: string | undefined, fn: () => Promise<T>): Promise<T> =>
        runWithDiagContext(als, { traceId }, fn),
    })
    await rig1.controller.prompt({ sessionId: 's1', text: 'hello' })
    dispose()
    expect(issued).toEqual(['tr-0'])
    expect(rig1.seenTraceIds).toEqual(['tr-0'])
    expect(als.getStore()?.traceId).toBeUndefined() // 链外零残留
  })

  it('重路由派生调用同 trace_id（judge=route 分支）', async () => {
    const rig2 = rig('route')
    const dispose = interceptRequiredBinding(rig2.controller, rig2.guard, console.warn, {
      next: () => 'tr-route',
      run: <T,>(traceId: string, _s: string | undefined, fn: () => Promise<T>): Promise<T> =>
        runWithDiagContext(als, { traceId }, fn),
    })
    await rig2.controller.prompt({ sessionId: 's2', text: 'hi' })
    dispose()
    expect(rig2.seenTraceIds).toEqual(['tr-route']) // route 分支：仅重路由派生调用（原发送被拒）
  })

  it('trace 缝缺席 → 原样零差异（ALS 零注入）', async () => {
    const rig3 = rig()
    const dispose = interceptRequiredBinding(rig3.controller, rig3.guard)
    await rig3.controller.prompt({ sessionId: 's3', text: 'x' })
    dispose()
    expect(rig3.seenTraceIds).toEqual([undefined])
  })

  // ── app-observability fix-3：派生失败处 emit 诊断事件（ALS 上下文内——行带链 B trace_id）──
  it('fix-3 重路由派生失败（sessionCreate 抛错）：显式拒绝语义不变 + warn 通道 emit 于 ALS 上下文内（行带同 trace_id）', async () => {
    const seen: Array<string | undefined> = []
    const controller = {
      prompt: async (): Promise<unknown> => ({ accepted: true }),
    } as unknown as SessionControllerFace
    const guard = {
      judge: async (): Promise<'route'> => 'route',
      reroute: async () => {
        throw new TypeError('forge/worktree-attach: branch 必须为非空字符串')
      },
    } as unknown as Parameters<typeof interceptRequiredBinding>[1]
    const warns: string[] = []
    const dispose = interceptRequiredBinding(controller, guard, (message) => {
      seen.push(als.getStore()?.traceId)
      warns.push(message)
    }, {
      next: () => 'tr-inject',
      run: <T,>(traceId: string, _s: string | undefined, fn: () => Promise<T>): Promise<T> =>
        runWithDiagContext(als, { traceId }, fn),
    })
    await expect(controller.prompt({ sessionId: 's-inject', text: 'hi' })).rejects.toThrow(/branch 必须为非空字符串/)
    dispose()
    expect(warns, '派生失败处诊断 emit 缺席（bug ba763219——重路由失败零日志）').toHaveLength(1)
    expect(seen, 'emit 发生在 ALS 上下文外——trace_id 断链').toEqual(['tr-inject'])
  })

  it('fix-3 judge 判读链异常 fail-open 放行：failOpenDiag emit 于 ALS 上下文内（行带同 trace_id）；放行语义不变', async () => {
    const WT_A = 'C:/repo/.forge/worktrees/wt-a'
    const alsJudge = createDiagContextStore()
    let openCalls = 0
    const persistence = {
      // 第 1 次 open = headerOf（cwd 读）；第 2 次 = readLatestAttach（判读链异常注入点）
      open: (async () => {
        openCalls += 1
        if (openCalls >= 2) throw new Error('attach read crashed')
        return {
          header: { cwd: 'C:/repo' },
          read: async () => ({ events: [] }),
          close: async () => {},
        }
      }) as unknown as SessionPersistenceFace['open'],
    } as unknown as SessionPersistenceFace
    const emits: Array<{ message: string; traceId: string | undefined }> = []
    const service = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionController: fakeController().controller,
      sessionPersistence: persistence,
      listWorktreeEntries: async () => [{ path: WT_A, branch: 'feat/a' }],
      failOpenDiag: (message) => {
        emits.push({ message, traceId: alsJudge.getStore()?.traceId })
      },
      pathPresent: () => true, // fake 路径无盘上实体——前置活性守卫恒真（缺席专测单独表驱动）
    })
    const guard = service.requiredBindingGuard()
    expect(guard).toBeDefined()
    const verdict = await runWithDiagContext(alsJudge, { traceId: 'tr-open' }, () => guard!.judge('s-fix3'))
    expect(verdict, '判读链异常 fail-open 放行语义不变').toBe('pass')
    expect(emits, 'fail-open 判读链异常零诊断 emit（bug ba763219）').toHaveLength(1)
    expect(emits[0]?.traceId, 'emit 发生在 ALS 上下文外——trace_id 断链').toBe('tr-open')
    expect(emits[0]?.message).toContain('fail-open')
  })
})

describe('bug f9a23367：icacls 补权全子树传播阻塞（A′ 预铸时序 / B 幂等短路 / C 主行跳过 / D 超时上界）', () => {
  /** B/D 面注入 runner——记录调用面（args + opts），读查询回 canned DACL */
  const mkRunner = (dacl: string) => {
    const calls: Array<{ file: string; args: string[]; opts?: { timeout?: number } }> = []
    const run = async (file: string, args: string[], opts?: { timeout?: number }): Promise<string> => {
      calls.push({ file, args, opts })
      if (!args.includes('/grant')) return dacl
      return 'Successfully processed 1 files'
    }
    return { run, calls }
  }
  const WITHOUT_ACE = 'Z:\\repo BUILTIN\\Administrators:(I)(F)\nNT AUTHORITY\\Authenticated Users:(I)(M)\n'
  const WITH_ACE = 'Z:\\repo PANDA\\panda:(OI)(CI)(F)\nBUILTIN\\Administrators:(I)(F)\n'
  const withEnv = async (fn: () => Promise<void>): Promise<void> => {
    const backup = { d: process.env.USERDOMAIN, u: process.env.USERNAME }
    process.env.USERDOMAIN = 'PANDA'
    process.env.USERNAME = 'panda'
    try {
      await fn()
    } finally {
      for (const [k, v] of Object.entries(backup)) {
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
      }
    }
  }

  it.skipIf(process.platform !== 'win32')('B：ACE 已在场（含继承式 (I)(OI)(CI)(F)）→ 只读短路、零 grant 调用', async () => {
    const { run, calls } = mkRunner(`${WITH_ACE}PANDA\\panda:(I)(OI)(CI)(F)\n`)
    await withEnv(() => defaultEnsureDirAcl('Z:\\repo', run))
    expect(calls.filter((c) => c.args.includes('/grant')), '无短路——每次编排都触发分钟级全子树传播（bug 在场）').toEqual([])
  })

  it.skipIf(process.platform !== 'win32')('B+D：ACE 缺席 → grant 执行且带超时上界', async () => {
    const { run, calls } = mkRunner(WITHOUT_ACE)
    await withEnv(() => defaultEnsureDirAcl('Z:\\repo', run))
    const grants = calls.filter((c) => c.args.includes('/grant'))
    expect(grants.length).toBe(1)
    expect(grants[0]!.opts?.timeout, '无超时——传播分钟级阻塞无上界（bug 在场）').toBeGreaterThan(0)
  })

  it.skipIf(process.platform !== 'win32')('B：DENY 行不算已补权（拒绝优先语义）', async () => {
    const { run, calls } = mkRunner(`Z:\\repo PANDA\\panda:(DENY)(F)\n${WITHOUT_ACE}`)
    await withEnv(() => defaultEnsureDirAcl('Z:\\repo', run))
    expect(calls.some((c) => c.args.includes('/grant'))).toBe(true)
  })

  it.skipIf(process.platform !== 'win32')('真机冒烟：临时目录两次补权均亚秒级（只读短路生效，无全子树传播阻塞）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dswf-acl-'))
    try {
      const start = Date.now()
      await defaultEnsureDirAcl(dir)
      await defaultEnsureDirAcl(dir)
      expect(Date.now() - start).toBeLessThan(2000)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('C：主行（worktreePath ≡ projectRoot）不做预防性 ACL 补权——非 worktree add 产物零全子树传播', async () => {
    const { controller } = fakeController()
    const { persistence } = fakePersistence({})
    const { registry } = fakeWorkspaceRegistry()
    const aclPaths: string[] = []
    const service = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionController: controller,
      sessionPersistence: persistence,
      listWorktreeEntries: async () => [{ path: 'C:/repo', branch: 'main' }],
      workspaceRegistry: registry,
      ensureDirAcl: async (path) => {
        aclPaths.push(path)
      },
      pathPresent: () => true, // fake 路径无盘上实体——前置活性守卫恒真（缺席专测单独表驱动）
    })
    await service.sessionCreate({ worktreePath: 'C:/repo' })
    expect(aclPaths, '主行补权在场——项目根每次编排都跑分钟级全子树传播（bug 在场）').toEqual([])
  })

  it("A′：create 预铸空目录并先于 worktree add 授权（授权时目录必空——毫秒级，检出文件出生即继承）", async () => {
    const ws = mkdtempSync(join(tmpdir(), 'dswf-preseed-'))
    const wtPath = join(ws, 'wt-a').replaceAll('\\', '/')
    const order: string[] = []
    const aclPaths: string[] = []
    let dirStateAtAcl: string[] | undefined
    try {
      const service = createWorktreeRpcService({
        gitWorktree: fakeExt,
        ensureDirAcl: async (path) => {
          order.push('acl')
          aclPaths.push(path)
          dirStateAtAcl = existsSync(path) ? readdirSync(path) : ['<absent>']
        },
        createWorktreeOp: async () => {
          order.push('add')
          return { path: wtPath, head: 'ab' + '0'.repeat(38), branch: 'feat/a', detached: false, bare: false }
        },
      })
      await service.create({ projectRoot: 'C:/repo', branch: 'feat/a', path: wtPath, base: 'main' })
      expect(order, '授权未先于 worktree add（bug 在场）').toEqual(['acl', 'add'])
      expect(aclPaths).toEqual([wtPath])
      expect(dirStateAtAcl, '授权时目录非空/缺席——预铸时序未成立').toEqual([])
    } finally {
      rmSync(ws, { recursive: true, force: true })
    }
  })
})
