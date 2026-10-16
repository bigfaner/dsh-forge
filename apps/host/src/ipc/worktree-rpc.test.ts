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

/** 会话持久化桩：events 表驱动（sessionId → 尾部事件集）；append 捕获写面 */
function fakePersistence(events: Record<string, readonly unknown[]>) {
  const appended: Array<{ id: string; events: readonly unknown[] }> = []
  const persistence: SessionPersistenceFace = {
    open: (async (id: string, access: 'read' | 'write') => ({
      read: async () => ({ events: events[id] ?? [] }),
      append: async (batch: readonly unknown[]) => {
        if (access !== 'write') throw new Error('read-only handle')
        appended.push({ id, events: batch })
      },
      flush: async () => {},
      close: async () => {},
    })) as SessionPersistenceFace['open'],
  }
  return { persistence, appended }
}

function fakeController() {
  const calls: Array<{ cwd?: string }> = []
  const prompts: Array<unknown> = []
  const controller: SessionControllerFace = {
    create: async (request) => {
      calls.push({ cwd: request.cwd })
      return { sessionId: 's-created' }
    },
    prompt: async (request) => {
      prompts.push(request)
      return { accepted: true }
    },
  }
  return { controller, calls, prompts }
}

describe('createWorktreeRpcService（child 侧服务本体——透传插件域）', () => {
  it('list：非 git / 未注册路径 → isGit false 零清单（能力位条件渲染单源）', async () => {
    const service = createWorktreeRpcService({ gitWorktree: fakeExt })
    const result = await service.list({ projectRoot: 'C:/foreign' } satisfies WorktreeListRequest)
    expect(result).toEqual({ isGit: false, entries: [] })
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

  it('sessionCreate：cwd 单门透传 sessionController.create（meta.cwd 注入——绑定不可切换）', async () => {
    const { controller, calls } = fakeController()
    const service = createWorktreeRpcService({ sessionController: controller })
    const result = await service.sessionCreate({ cwd: 'C:/repo/.forge/worktrees/wt-a' })
    expect(result).toEqual({ sessionId: 's-created' })
    expect(calls).toEqual([{ cwd: 'C:/repo/.forge/worktrees/wt-a' }])
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
