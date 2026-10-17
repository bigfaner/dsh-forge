// forge:worktree/* 装配面单测：
//   · createWorktreeRpcService——预铸采纳（persistence.create 自铸 id + cwd/agentPreset 头 +
//     挂靠事件 seq 0）/ 封存判定快照（在场性比对）/ 非 git 零清单 / 必绑拦截 guard；
//   · registerWorktreeChannels——allowlist 注册（键键对应 contracts WORKTREE_CHANNELS）；
//   · interceptSessionSends——assertSendable 接入 host 消息处理链（封存拒绝 + 明确错误；
//     未绑定/未封存放行；判读异常 fail-open）。
// ops 真机 git 面归独立模式走查（1.8 e2e 记录）——本文件全 fake 注入，零 git 依赖。
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
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
  interceptRequiredBinding,
  interceptSessionSends,
  registerWorktreeChannels,
  WorktreeCapabilityAbsentError,
  type SessionControllerFace,
  type SessionPersistenceFace,
} from './worktree-rpc.js'

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
  const controller: SessionControllerFace = {
    create: async (request) => {
      calls.push({ sessionId: request.sessionId, cwd: request.cwd })
      return { sessionId: request.sessionId ?? 's-created' }
    },
    prompt: async (request) => {
      prompts.push(request)
      return { accepted: true }
    },
  }
  return { controller, calls, prompts }
}

/** 官方 workspaceRegistry 消费窄面桩（find-or-create + attachSession/setTitle 捕获；
 *  titles = resolveByPath 项目 title 映射——继承命名面） */
function fakeWorkspaceRegistry(attachError?: Error, titles: Record<string, string> = {}) {
  const created: Array<{ path: string; title?: string }> = []
  const attached: Array<{ path: string; sessionId: string }> = []
  const titled: Array<{ path: string; title: string }> = []
  const registry = {
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
  return { registry, created, attached, titled }
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

  it('bug 925c96d5：sessionCreate 后 find-or-create 树路径工作区 + attachSession（官方 registry 面——composer 门控/侧栏归属单源）', async () => {
    const { controller } = fakeController()
    const { persistence } = fakePersistence({})
    const { registry, created, attached } = fakeWorkspaceRegistry()
    const service = createWorktreeRpcService({
      sessionController: controller,
      sessionPersistence: persistence,
      listWorktreeEntries: async () => [{ path: 'C:/repo/.forge/worktrees/wt-a', branch: 'feat/a' }],
      workspaceRegistry: registry,
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
      workspaceRegistry: registry,
    })
    const result = await service.list({ projectRoot: 'C:/repo' })
    expect(result.isGit).toBe(true)
    await new Promise<void>((resolve) => setTimeout(resolve, 0)) // heal 为 fire-and-forget——让微任务排空
    expect(titled, '旧工作区未随 list 自愈（存量边界）').toEqual([
      { path: 'C:/repo/.forge/worktrees/wt-a', title: 'dsh-forge' },
    ])
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
    const bare = createWorktreeRpcService({ sessionController: controller })
    await expect(bare.sessionCreate({ worktreePath: 'C:/repo/.forge/worktrees/wt-a' })).rejects.toThrow('sessionPersistence')
    const legacy = createWorktreeRpcService({
      sessionController: controller,
      // 无 create 面桩（运行期契约探测面——1.16 预铸缝缺席即明确错误；类型断言豁免编译面）
      sessionPersistence: { open: (async () => ({})) as SessionPersistenceFace['open'] } as unknown as SessionPersistenceFace,
    })
    await expect(legacy.sessionCreate({ worktreePath: 'C:/repo/.forge/worktrees/wt-a' })).rejects.toThrow('sessionPersistence')
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
    })
    expect(await liveSvc.seal({ sessionId: 's1' })).toMatchObject({ isGit: true, sealed: false })
    const unboundSvc = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionPersistence: fakePersistence({}).persistence,
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
    expect(registered).toHaveLength(10) // 九通道 + resolve（批量归属解析——身份归并单点）
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

  /** 被测装配桩：git 项目（resolveProject 计数）+ 会话持久化 + 控制器 */
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
    const { controller, calls, prompts } = fakeController()
    const service = createWorktreeRpcService({
      gitWorktree: countingExt,
      sessionController: controller,
      sessionPersistence: persistence,
      listWorktreeEntries: async () => [
        { path: 'C:/repo', branch: 'main' },
        { path: WT_A, branch: 'feat/a' },
      ],
    })
    return { service, controller, prompts, calls, opens, created, resolveCallsOf: () => resolveCalls }
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
