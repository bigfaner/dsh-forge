// forge:worktree/* 装配面单测（worktree-branch-management fix-2）：
//   · createWorktreeRpcService——挂靠事件唯一写入口（ignorable 信封 + seq 自管理）/
//     建会话 meta.cwd 注入单门 / 封存判定快照（在场性比对）/ 非 git 零清单；
//   · registerWorktreeChannels——九通道 allowlist 注册（键键对应 contracts WORKTREE_CHANNELS）；
//   · interceptSessionSends——assertSendable 接入 host 消息处理链（封存拒绝 + 明确错误；
//     未绑定/未封存放行；判读异常 fail-open）。
// ops 真机 git 面归独立模式走查（1.8 e2e 记录）——本文件全 fake 注入，零 git 依赖。
import { describe, expect, it } from 'vitest'
import {
  WORKTREE_CHANNELS,
  type WorktreeAttachRequest,
  type WorktreeListRequest,
  type WorktreeSealRequest,
} from '@dsh-forge/contracts'
import { SessionSealedError } from '@dsh-forge/git-worktree'
import type { ForgeIpc } from './forge-channels.js'
import {
  createWorktreeRpcService,
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

/** 会话持久化桩：events 表驱动（sessionId → 尾部事件集）；append 捕获写面；create 预铸捕获 */
function fakePersistence(events: Record<string, readonly unknown[]>) {
  const appended: Array<{ id: string; events: readonly unknown[] }> = []
  const created: Array<{ header: Record<string, unknown> }> = []
  const closedFor: Record<string, boolean> = {}
  const makeHandle = (id: string, access: 'read' | 'write') => ({
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
    open: (async (id: string, access: 'read' | 'write') => makeHandle(id, access)) as SessionPersistenceFace['open'],
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
    expect(registered).toHaveLength(9)
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
