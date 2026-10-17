// forge:worktree/* 装配面单测（worktree-branch-management fix-2）：
//   · createWorktreeRpcService——挂靠事件唯一写入口（ignorable 信封 + seq 自管理）/
//     建会话 meta.cwd 注入单门 / 封存判定快照（在场性比对）/ 非 git 零清单；
//   · registerWorktreeChannels——九通道 allowlist 注册（键键对应 contracts WORKTREE_CHANNELS）；
//   · interceptSessionSends——assertSendable 接入 host 消息处理链（封存拒绝 + 明确错误；
//     未绑定/未封存放行；判读异常 fail-open）。
// ops 真机 git 面归独立模式走查（1.8 e2e 记录）——本文件全 fake 注入，零 git 依赖。
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  WORKTREE_CHANNELS,
  type WorktreeAttachRequest,
  type WorktreeListRequest,
  type WorktreeSealRequest,
} from '@dsh-forge/contracts'
import { SessionCwdMismatchError, SessionSealedError } from '@dsh-forge/git-worktree'
import type { ForgeIpc } from './forge-channels.js'
import {
  createWorktreeRpcService,
  interceptRequiredBinding,
  interceptSessionSends,
  registerWorktreeChannels,
  type SessionControllerFace,
  type SessionPersistenceFace,
} from './worktree-rpc.js'

/** 插件域扩展点桩（resolveProject 恒命中 C:/repo 主项目；worktreeDir 默认式样） */
const fakeExt = {
  getExtensionPoints: () => ({
    resolveProject: async (cwd: string) =>
      cwd.includes('foreign') ? null : { projectId: 'p1', projectRoot: 'C:/repo', isGit: true },
    getWorktreeDir: (root: string) => `${root}/.forge/worktrees`,
  }),
}

/** 会话持久化桩：events 表驱动（sessionId → 尾部事件集）；append 捕获写面；create 预铸捕获；
 *  headers 表驱动（sessionId → SessionHeader.cwd——读句柄 header 消费切片）；
 *  opts.countOpens = open 调用计数器（G7② 性能钉：非 git 判读零日志读）。 */
function fakePersistence(
  events: Record<string, readonly unknown[]>,
  headers: Record<string, { cwd: string }> = {},
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

/** 官方 workspaceRegistry 消费窄面桩（find-or-create + attachSession 捕获） */
function fakeWorkspaceRegistry(attachError?: Error) {
  const created: string[] = []
  const attached: Array<{ path: string; sessionId: string }> = []
  const registry = {
    create: async (path: string) => {
      created.push(path)
      return {
        attachSession: async (sessionId: string) => {
          if (attachError !== undefined) throw attachError
          attached.push({ path, sessionId })
        },
      }
    },
  }
  return { registry, created, attached }
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
    expect(created, '树路径未 find-or-create 工作区（bug 在场）').toEqual(['C:/repo/.forge/worktrees/wt-a'])
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
    expect(created).toEqual(['C:/repo/.forge/worktrees/wt-a'])
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

  it('attach：唯一写入口信封（type forge/worktree-attach + ignorable true + seq 自管理）且分支缺省自查透传', async () => {
    const { persistence, appended } = fakePersistence({
      's1': [{ type: 'user', seq: 3 }],
    })
    const service = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionPersistence: persistence,
    })
    const request: WorktreeAttachRequest = { sessionId: 's1', worktreePath: 'C:/repo/.forge/worktrees/wt-a', branch: 'feat/a' }
    const result = await service.attach(request)
    expect(result).toEqual({ attached: true, branch: 'feat/a', seq: 4 })
    expect(appended).toHaveLength(1)
    const event = appended[0]!.events[0] as { type: string; seq: number; ignorable?: boolean; data: unknown }
    expect(event.type).toBe('forge/worktree-attach')
    expect(event.ignorable).toBe(true)
    expect(event.seq).toBe(4)
    expect(event.data).toEqual({ worktreePath: 'C:/repo/.forge/worktrees/wt-a', branch: 'feat/a' })
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
})

describe('registerWorktreeChannels（main 侧 ipc 注册）', () => {
  it('九通道键键对应 contracts WORKTREE_CHANNELS 且全部注册', () => {
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
    expect(registered).toHaveLength(10) // 九通道 + 1.30 select（选中树推送缝）
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
    headers: Record<string, { cwd: string }>
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
    const { persistence } = fakePersistence(input.events, input.headers, opens)
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
    return { service, controller, prompts, calls, opens, resolveCallsOf: () => resolveCalls }
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

    const used = guardRig({ events: { s2: [{ type: 'user', seq: 1 }] }, headers: { s2: { cwd: 'C:/repo' } } })
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
