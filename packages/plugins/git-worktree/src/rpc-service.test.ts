// forge:worktree/* 域单测（worktree-domain-migration 1.1——自 host ipc/worktree-rpc.test.ts 随迁）：
//   · createWorktreeRpcService——forge/worktree-bind 留痕（session/created append / 惰性补写 /
//     fail-soft 诊断）+ 封存判定快照（在场性比对）/ 非 git 零清单 + 流程 A workspace 前移创建；
//   · interceptSessionSends——assertSendable 接入发送链（封存拒绝 + 明确错误；
//     未绑定/未封存放行；判读异常 fail-open）。
// ops 真机 git 面归独立模式走查（1.8 e2e 记录）——本文件全 fake 注入，零 git 依赖。
// registerWorktreeChannels（main 侧 ipc 注册）属 host wiring——用例留 apps/host 侧。
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type {
  WorktreeListRequest,
  WorktreeSealRequest,
} from '@dsh-forge/contracts'
import { SessionSealedError } from './seal-guard.js'
import {
  createWorktreeRpcService,
  defaultEnsureDirAcl,
  invalidateResolveCaches,
  type LiveSessionFace,
  type SessionControllerFace,
  type SessionPersistenceFace,
} from './rpc-service.js'
import { interceptSessionSends } from './session-send-wrap.js'

/** 插件域扩展点桩（resolveProject 恒命中 C:/repo 主项目；worktreeDir 默认式样） */
const fakeExt = {
  getExtensionPoints: () => ({
    resolveProject: async (cwd: string) =>
      cwd.includes('foreign') ? null : { projectId: 'p1', projectRoot: 'C:/repo', isGit: true, projectName: 'dsh-forge' },
    getWorktreeDir: (root: string) => `${root}/.forge/worktrees`,
  }),
}

/** 挂靠事件构造（跨 describe 共享——留痕/孤儿测试区共用） */
const attachEvent = (path: string) => [{ type: 'forge/worktree-attach', seq: 0, data: { worktreePath: path, branch: 'feat/a' } }]
/** 树 A 路径（跨 describe 共享常量——留痕/孤儿测试区共用） */
const WT_A = 'C:/repo/.forge/worktrees/wt-a'

/** 会话持久化桩：events 表驱动（sessionId → 尾部事件集）；append 捕获写面；headers 表驱动
 *  （sessionId → SessionHeader 消费切片：cwd + parentSession 选填）；opts.countOpens = open
 *  调用计数器（G7② 性能钉：非 git 判读零日志读）。 */
function fakePersistence(
  events: Record<string, readonly unknown[]>,
  headers: Record<string, { cwd: string; agentPreset?: string; parentSession?: string }> = {},
  countOpens?: { value: number },
) {
  const appended: Array<{ id: string; events: readonly unknown[] }> = []
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
    // 官方 SessionPersistence.list 返回 SessionPersistenceSnapshot[]（header.id）
    list: (async () => Object.keys(events).map((id) => ({ header: { id } }))) as never,
  } as unknown as SessionPersistenceFace
  return { persistence, appended, closedFor, events }
}

function fakeController() {
  const prompts: Array<unknown> = []
  const promptSignals: Array<unknown> = []
  const controller: SessionControllerFace = {
    prompt: async (request, signal) => {
      prompts.push(request)
      promptSignals.push(signal)
      return { accepted: true }
    },
  }
  return { controller, prompts, promptSignals }
}

/** 官方 workspaceRegistry 消费窄面桩（find-or-create + attachSession/setTitle 捕获；
 *  titles = resolveByPath 项目 title 映射——继承命名面；create 复用不改 title（官方语义）） */
function fakeWorkspaceRegistry(attachError?: Error, titles: Record<string, string> = {}) {
  const created: Array<{ path: string; title?: string }> = []
  const attached: Array<{ path: string; sessionId: string }> = []
  const titled: Array<{ path: string; title: string }> = []
  // find-or-create 复用面（官方语义：同规范路径已存在即复用，title 仅新建时生效）
  const workspaces = new Map<string, { id: string; title?: string; sessions: string[] }>()
  const entityFor = (path: string, ws: { id: string; title?: string; sessions: string[] }) => ({
    id: ws.id,
    title: ws.title ?? '',
    sessionIds: ws.sessions,
    attachSession: async (sessionId: string) => {
      if (attachError !== undefined) throw attachError
      ws.sessions.push(sessionId)
      attached.push({ path, sessionId })
    },
    setTitle: async (next: string) => {
      ws.title = next
      titled.push({ path, title: next })
    },
  })
  const registry = {
    resolveByPath: async (path: string) => {
      const title = titles[path]
      const ws = workspaces.get(path)
      if (title === undefined && ws === undefined) return undefined
      return entityFor(path, ws ?? { id: `ws-${path}`, title, sessions: [] })
    },
    create: async (path: string, title?: string) => {
      created.push({ path, title })
      const existing = workspaces.get(path)
      if (existing !== undefined) return entityFor(path, existing) // 复用不改 title（官方语义）
      const ws = { id: `ws-${path}`, title, sessions: [] }
      workspaces.set(path, ws)
      return entityFor(path, ws)
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
      create: async (_path: string, _title?: string) => ({
        id: 'ws-bare',
        title: '',
        sessionIds: [],
        attachSession: async () => {},
      }),
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
    // workspaceId 解析只触达 present 主行；缺席行 present=false 跳过（workspaceId 解析与
    // heal 同径）→ resolveByPath 零 ENOENT 空转（现场 26 次/天噪音根治）
    expect(resolvedPaths).toEqual(['C:/repo'])
  })

  it('checks：attachedSessions 读官方 workspace record sessionIds（推导制——attachSession 挂账即计数单源，不再遍历 attach 事件）', async () => {
    const { registry, created } = fakeWorkspaceRegistry()
    const service = createWorktreeRpcService({
      gitWorktree: fakeExt,
      listWorktreeEntries: async () => [{ path: WT_A, branch: 'feat/a' }],
      workspaceRegistry: registry,
      pathPresent: () => true, // fake 路径无盘上实体——前置活性守卫恒真（缺席专测单独表驱动）
    })
    // 官方 create（桌面直通/移动端 proxy 中继）attachSession 挂账后的世界
    const ws = await registry.create(WT_A, 'wt-a')
    await ws.attachSession('s-official')
    expect(created).toEqual([{ path: WT_A, title: 'wt-a' }])
    const result = await service.checks({ projectRoot: 'C:/repo', path: WT_A })
    expect(result.attachedSessions).toBe(1)
    expect((await registry.resolveByPath(WT_A))?.sessionIds).toEqual(['s-official'])
  })

  it('checks 降级：registry 缺席 → attachedSessions = 0（零计数不抛）', async () => {
    const service = createWorktreeRpcService({ gitWorktree: fakeExt })
    const result = await service.checks({ projectRoot: 'C:/repo', path: WT_A })
    expect(result.attachedSessions).toBe(0)
  })

  it('seal（推导制读侧）：绑定 = header.cwd——不在场 sealed；在场未封存 + 实时 branch；无 cwd 零注入面', async () => {
    const sealedSvc = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionPersistence: fakePersistence({}, { s1: { cwd: 'C:/repo/.forge/worktrees/gone' } }).persistence,
      listWorktreeEntries: async () => [{ path: 'C:/repo/.forge/worktrees/gone', branch: 'feat/gone' }],
      listPresent: async () => ['C:/repo'], // gone 树已删——不在场
    })
    const sealedResult = await sealedSvc.seal({ sessionId: 's1' } satisfies WorktreeSealRequest)
    expect(sealedResult).toMatchObject({
      isGit: true,
      sealed: true,
      worktreeName: 'gone',
      binding: { worktreePath: 'C:/repo/.forge/worktrees/gone', branch: 'feat/gone' },
    })
    expect(sealedResult.aheadBehind).toBeNull() // fake 路径 git 解析失败 → null 零注入
    expect(sealedResult.blank).toBeUndefined() // seal.blank 事件判读退役
    const liveSvc = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionPersistence: fakePersistence({}, { s1: { cwd: 'C:/repo' } }).persistence,
      listWorktreeEntries: async () => [{ path: 'C:/repo', branch: 'main' }],
      listPresent: async () => ['C:/repo', WT_A],
    })
    expect(await liveSvc.seal({ sessionId: 's1' })).toMatchObject({
      isGit: true,
      sealed: false,
      binding: { worktreePath: 'C:/repo', branch: 'main' },
    })
    const unboundSvc = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionPersistence: fakePersistence({}).persistence,
    })
    expect(await unboundSvc.seal({ sessionId: 's1' })).toEqual({ isGit: false, sealed: false, binding: null })
  })

  it('seal 非零注入短路：request.cwd 命中非 git 能力缓存 → 零会话日志读（G7② 判序）+ bindDiag 零 emit', async () => {
    const opens = { value: 0 }
    const diagLines: string[] = []
    const { persistence } = fakePersistence({ s1: attachEvent(WT_A) }, { s1: { cwd: 'C:/foreign/x' } }, opens)
    const service = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionPersistence: persistence,
      bindDiag: (line) => diagLines.push(line),
    })
    await service.seal({ sessionId: 's1', cwd: 'C:/foreign/x' })
    expect(opens.value, '非 git 封存判定仍全量读会话日志（判序未反转）').toBe(0)
    expect(diagLines).toEqual([])
  })

  it('session-bind 埋点：seal 推导判定结果 bindDiag(info) 缝触发；缺席 = 零 emit 不抛', async () => {
    const diagLines: string[] = []
    const service = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionPersistence: fakePersistence({}, { s1: { cwd: 'C:/repo' } }).persistence,
      listWorktreeEntries: async () => [{ path: 'C:/repo', branch: 'main' }],
      listPresent: async () => ['C:/repo'],
      bindDiag: (line) => diagLines.push(line),
    })
    await service.seal({ sessionId: 's1' })
    expect(diagLines.join('\n')).toContain('session-bind 推导判定')
    expect(diagLines.join('\n')).toContain('C:/repo')
    const bare = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionPersistence: fakePersistence({}, { s1: { cwd: 'C:/repo' } }).persistence,
      listWorktreeEntries: async () => [{ path: 'C:/repo', branch: 'main' }],
      listPresent: async () => ['C:/repo'],
    })
    await expect(bare.seal({ sessionId: 's1' })).resolves.toBeDefined() // 缝缺席零抛
  })

  it('1.19 SessionCwdMismatch 读侧拒绝位退役：推导即真——stale attach 事件不再引发 seal 抛错（绑定 = header.cwd）', async () => {
    const service = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionPersistence: fakePersistence(
        { s1: attachEvent('C:/elsewhere') }, // 陈旧预铸事件指向他树
        { s1: { cwd: WT_A } }, // header.cwd 才是绑定事实
      ).persistence,
      listWorktreeEntries: async () => [{ path: WT_A, branch: 'feat/a' }],
      listPresent: async () => ['C:/repo', WT_A],
    })
    await expect(service.seal({ sessionId: 's1' })).resolves.toMatchObject({
      isGit: true,
      sealed: false,
      binding: { worktreePath: WT_A },
    })
  })

  it('bind-drift 漂移判定（binding-derivation §2.2/§2.6）：实时 ≠ 留痕 → branchDrift + 触发/消除边沿埋点与推送', async () => {
    let listed: readonly { path: string; branch: string }[] = [{ path: 'C:/repo', branch: 'main' }]
    const diagLines: string[] = []
    const pushes: unknown[] = []
    const service = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionPersistence: fakePersistence({}, { s1: { cwd: 'C:/repo' } }).persistence,
      listWorktreeEntries: async () => listed,
      listPresent: async () => ['C:/repo'],
      bindDriftDiag: (line) => diagLines.push(line),
      bindingMismatchEmit: (payload) => pushes.push(payload),
    })
    // 首次 seal：无留痕 → 惰性补写（值 = 实时 branch），无漂移零 emit（初始态不属边沿）
    await service.seal({ sessionId: 's1' })
    expect(diagLines).toEqual([])
    expect(pushes).toEqual([])
    // 手动切分支：实时 feat/x ≠ 留痕 main → 漂移触发（banner 数据源 + 埋点 + 推送各一条）
    listed = [{ path: 'C:/repo', branch: 'feat/x' }]
    const drifted = await service.seal({ sessionId: 's1' })
    expect(drifted.branchDrift).toEqual({ bindBranch: 'main', branch: 'feat/x' })
    expect(diagLines.join('\n')).toContain('bind-drift 触发')
    expect(pushes).toEqual([
      { sessionId: 's1', cwd: 'C:/repo', bindBranch: 'main', branch: 'feat/x', drifted: true },
    ])
    // 漂移持续：边沿不重复 emit
    await service.seal({ sessionId: 's1' })
    expect(diagLines).toHaveLength(1)
    expect(pushes).toHaveLength(1)
    // 切回：branchDrift 归 null + 消除边沿
    listed = [{ path: 'C:/repo', branch: 'main' }]
    const back = await service.seal({ sessionId: 's1' })
    expect(back.branchDrift).toBeNull()
    expect(diagLines.join('\n')).toContain('bind-drift 消除')
    expect(pushes).toHaveLength(2)
    expect(pushes[1]).toMatchObject({ bindBranch: 'main', branch: 'main', drifted: false })
  })

  it('bind-drift 缝缺席零抛；branch 落空不判漂移', async () => {
    let listed: readonly { path: string; branch: string }[] = [{ path: 'C:/repo', branch: 'main' }]
    const service = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionPersistence: fakePersistence({}, { s1: { cwd: 'C:/repo' } }).persistence,
      listWorktreeEntries: async () => listed,
      listPresent: async () => ['C:/repo'],
    })
    await service.seal({ sessionId: 's1' })
    listed = [{ path: 'C:/repo', branch: '' }] // detached/unborn——落空
    const result = await service.seal({ sessionId: 's1' })
    expect(result.branchDrift).toBeNull()
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

// ───────────── forge/worktree-bind 留痕（binding-derivation §2.2——ignorable 事件直写）─────────────
describe('forge/worktree-bind 留痕（session/created 监听 append + 惰性补写 + fail-soft 诊断）', () => {
  const WT_A = 'C:/repo/.forge/worktrees/wt-a'

  /** 留痕装配桩：session/created 处理器捕获 + 活会话表驱动（append 面 = Session.append 切片） */
  function bindRig(input: {
    headers?: Record<string, { cwd: string }>
    append?: (type: string, data: unknown) => void
  }) {
    const appended: Array<{ type: string; data: unknown }> = []
    const live = new Map<string, LiveSessionFace | undefined>()
    let createdHandler: ((sessionId: string) => void) | undefined
    const service = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionPersistence: fakePersistence({}, input.headers ?? {}).persistence,
      listWorktreeEntries: async () => [{ path: 'C:/repo', branch: 'main' }, { path: WT_A, branch: 'feat/a' }],
      listPresent: async () => ['C:/repo', WT_A],
      onSessionCreated: (handler) => {
        createdHandler = handler
        return () => {}
      },
      liveSessions: () => live,
      bindDiag: (line) => void line,
      bindWarnDiag: (line) => appended.push({ type: '__diag__', data: line }),
    })
    const putLive = (id: string, headerCwd: string | undefined) => {
      live.set(id, {
        ...(headerCwd === undefined ? {} : { header: { cwd: headerCwd } }),
        append: (type, data) => {
          if (input.append === undefined) appended.push({ type, data })
          else input.append(type, data)
        },
      })
    }
    const fireCreated = async (id: string): Promise<void> => {
      createdHandler?.(id)
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    return { service, appended, putLive, fireCreated, warnsOf: () => appended.filter((e) => e.type === '__diag__').map((e) => String(e.data)) }
  }

  it('session/created 监听：git 会话 append 留痕快照 {worktreeName, branch}（创建时刻）；非 git 域零介入', async () => {
    const rig = bindRig({})
    rig.putLive('s-new', WT_A)
    rig.putLive('s-foreign', 'C:/foreign/x')
    await rig.fireCreated('s-new')
    await rig.fireCreated('s-foreign')
    expect(rig.appended).toEqual([
      { type: 'forge/worktree-bind', data: { worktreeName: 'wt-a', branch: 'feat/a' } },
    ])
  })

  it('fork 同径：fork 亦发布 session/created——监听面统一 append（零特判）', async () => {
    const rig = bindRig({})
    rig.putLive('s-fork', WT_A)
    await rig.fireCreated('s-fork')
    expect(rig.appended).toHaveLength(1)
  })

  it('append 失败 fail-soft：不抛 + bindWarnDiag(warn) 缝触发（AC 证据）', async () => {
    const rig = bindRig({
      append: () => {
        throw new Error('session closed')
      },
    })
    rig.putLive('s-boom', WT_A)
    await expect(rig.fireCreated('s-boom')).resolves.toBeUndefined() // fail-soft 不抛
    expect(rig.warnsOf().join('\n')).toContain('session-bind 留痕 append 失败')
  })

  it('惰性补写：缺留痕时首次漂移校验（seal 入口）以实时 branch 补写；已留痕会话零重复 append', async () => {
    const rig = bindRig({ headers: { s1: { cwd: 'C:/repo' } } })
    rig.putLive('s1', 'C:/repo')
    await rig.service.seal({ sessionId: 's1' } satisfies WorktreeSealRequest)
    expect(rig.appended).toEqual([
      { type: 'forge/worktree-bind', data: { worktreeName: 'repo', branch: 'main' } },
    ])
    // 第二次 seal：留痕在册（per-session 记忆）——零重复读、零重复 append
    rig.appended.length = 0
    await rig.service.seal({ sessionId: 's1' } satisfies WorktreeSealRequest)
    expect(rig.appended).toEqual([])
  })

  it('惰性补写降级：活会话缺席（无活根）→ 跳过补写不抛（留痕缺失按不警示 fail-soft）', async () => {
    const rig = bindRig({ headers: { s1: { cwd: 'C:/repo' } } }) // 不注入活会话
    await expect(rig.service.seal({ sessionId: 's1' } satisfies WorktreeSealRequest)).resolves.toMatchObject({
      isGit: true,
      sealed: false,
    })
    expect(rig.appended).toEqual([])
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

// ───────────── 1.30 host 绑定哨兵（WYSIWYG：绑定树必须 == chip）─────────────
  it('G7② seal 判序反转：request.cwd 命中非 git 能力缓存 → 零会话日志读', async () => {
    const opens = { value: 0 }
    const { persistence } = fakePersistence({ s1: attachEvent(WT_A) }, { s1: { cwd: 'C:/foreign/x' } }, opens)
    const service = createWorktreeRpcService({ gitWorktree: fakeExt, sessionPersistence: persistence })
    await service.seal({ sessionId: 's1', cwd: 'C:/foreign/x' })
    await service.seal({ sessionId: 's1', cwd: 'C:/foreign/x' })
    expect(opens.value, '非 git 封存判定仍全量读会话日志（判序未反转）').toBe(0)
  })

  // ── bug 9eb9d6cb 真机反馈：unborn HEAD 仓库（git init 后零提交——porcelain 无 branch 行）──
  it('unborn HEAD 兜底（seal 径）：清单无 branch 行 → symbolic-ref 取分支短名（留痕快照有 branch）', async () => {
    const service = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionPersistence: fakePersistence({}, { s1: { cwd: WT_A } }).persistence,
      listWorktreeEntries: async () => [{ path: WT_A, branch: null }], // unborn HEAD：porcelain 无 branch 行
      symbolicRefOf: async () => 'main', // HEAD 指向存在的分支 ref——unborn 也有合法分支名
      listPresent: async () => ['C:/repo', WT_A],
    })
    await expect(service.seal({ sessionId: 's1' } satisfies WorktreeSealRequest)).resolves.toMatchObject({
      isGit: true,
      binding: { worktreePath: WT_A, branch: 'main' },
    })
  })

  it('unborn HEAD 兜底落空（seal 径）：symbolic-ref 探测失败（null）→ branch 落空（零猜测）', async () => {
    const service = createWorktreeRpcService({
      gitWorktree: fakeExt,
      sessionPersistence: fakePersistence({}, { s1: { cwd: WT_A } }).persistence,
      listWorktreeEntries: async () => [{ path: WT_A, branch: null }],
      symbolicRefOf: async () => null,
      listPresent: async () => ['C:/repo', WT_A],
    })
    await expect(service.seal({ sessionId: 's1' } satisfies WorktreeSealRequest)).resolves.toMatchObject({
      isGit: true,
      binding: { worktreePath: WT_A, branch: '' },
    })
  })

describe('bug f9a23367：icacls 补权全子树传播阻塞（A′ 预铸时序 / B 幂等短路 / D 超时上界）', () => {
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

/** 流程 A 前移创建 + workspaceId 携带（binding-derivation §2.4）。
 *  service.create 前置目录预创建走真机 fs——create 类用例统一落 temp 目录（零真机路径污染）。 */
describe('worktree create 前移官方 workspace 幂等创建 + WorktreeEntryDto.workspaceId', () => {
  const withTempWs = async (fn: (ws: string, wt: string) => Promise<void>): Promise<void> => {
    const ws = mkdtempSync(join(tmpdir(), 'dswf-wsid-'))
    const wt = join(ws, 'wt-a').replaceAll('\\', '/')
    try {
      await fn(ws, wt)
    } finally {
      rmSync(ws, { recursive: true, force: true })
    }
  }
  const createRowOf = (wt: string) => async () => ({ path: wt, head: 'ab' + '0'.repeat(38), branch: 'feat/a', detached: false, bare: false })

  it('A4：service.create 在 git worktree add 成功后前移 registry.create(path, worktreeName)——entry.workspaceId 随返回携带', async () => {
    await withTempWs(async (_ws, wt) => {
      const order: string[] = []
      const { registry, created } = fakeWorkspaceRegistry()
      const baseCreate = registry.create.bind(registry)
      const service = createWorktreeRpcService({
        gitWorktree: fakeExt,
        createWorktreeOp: async () => {
          order.push('add')
          return createRowOf(wt)()
        },
        workspaceRegistry: Object.assign(registry, {
          create: async (path: string, title?: string) => {
            order.push('workspace')
            return baseCreate(path, title)
          },
        }),
      })
      const result = await service.create({ projectRoot: 'C:/repo', branch: 'feat/a', path: wt, base: 'main' })
      expect(order, 'workspace 创建未后移于 git worktree add（时序错误）').toEqual(['add', 'workspace'])
      expect(created).toEqual([{ path: wt, title: 'wt-a' }])
      expect(result.entry.workspaceId, 'create 返回未携带 workspaceId').toBe(`ws-${wt}`)
      expect(result.entry.worktreeName).toBe('wt-a')
    })
  })

  it('A4 title 语义：title 仅新建时生效——同路径二次 create 复用既有工作区（id 稳定，title 不被改写）', async () => {
    await withTempWs(async (_ws, wt) => {
      const { registry, created } = fakeWorkspaceRegistry()
      const service = createWorktreeRpcService({
        gitWorktree: fakeExt,
        createWorktreeOp: createRowOf(wt),
        workspaceRegistry: registry,
      })
      const req = { projectRoot: 'C:/repo', branch: 'feat/a', path: wt, base: 'main' }
      const first = await service.create(req)
      const second = await service.create({ ...req, branch: 'feat/b' })
      expect(created.length).toBe(2)
      expect(first.entry.workspaceId).toBe(second.entry.workspaceId)
      expect(created[1]!.path).toBe(wt) // 幂等 find-or-create 仍被调用
      expect(created[1]!.title).toBe('wt-a') // 传入 title，但复用面不生效（官方语义，桩内裁）
    })
  })

  it('A4 fail-soft：registry.create 失败不阻断创建（git 树不回滚）——entry 返回 + warn + emitDiag(worktree-create) 缝触发', async () => {
    await withTempWs(async (_ws, wt) => {
      const diagLines: string[] = []
      const warns: string[] = []
      const service = createWorktreeRpcService({
        gitWorktree: fakeExt,
        createWorktreeOp: createRowOf(wt),
        workspaceRegistry: {
          create: async () => {
            throw new Error('registry boom')
          },
        },
        warn: (line) => warns.push(line),
        createDiag: (line) => diagLines.push(line),
      })
      const result = await service.create({ projectRoot: 'C:/repo', branch: 'feat/a', path: wt, base: 'main' })
      expect(result.entry.branch).toBe('feat/a')
      expect(result.entry.workspaceId, '失败面 workspaceId 应缺席').toBeUndefined()
      expect(warns.join('\n')).toContain('官方 workspace 前移创建失败')
      expect(diagLines.join('\n'), 'worktree-create 诊断缝未触发').toContain('registry boom')
    })
  })

  it('A6：list 行携带 workspaceId——resolveByPath 只读解析；盘上缺席陈旧行 workspaceId 缺席', async () => {
    const { registry } = fakeWorkspaceRegistry(undefined, { 'C:/repo': 'dsh-forge', [WT_A]: 'dsh-forge' })
    const service = createWorktreeRpcService({
      gitWorktree: fakeExt,
      listWorktreeRows: async () => [
        { path: 'C:/repo', branch: 'main', detached: false, bare: false },
        { path: WT_A, branch: 'feat/a', detached: false, bare: false },
        { path: 'C:/repo/.forge/worktrees/gone', branch: 'feat/gone', detached: false, bare: false },
      ],
      pathPresent: (p) => p !== 'C:/repo/.forge/worktrees/gone',
      workspaceRegistry: registry,
    })
    const result = await service.list({ projectRoot: 'C:/repo' })
    expect(result.entries.map((entry) => [entry.worktreeName, entry.workspaceId])).toEqual([
      ['repo', 'ws-C:/repo'],
      ['wt-a', `ws-${WT_A}`],
      ['gone', undefined], // present=false 行零注入
    ])
  })

  it('降级面：registry 缺席 → create/list 照常（workspaceId undefined 零注入，不阻断主链）', async () => {
    await withTempWs(async (_ws, wt) => {
      const service = createWorktreeRpcService({
        gitWorktree: fakeExt,
        createWorktreeOp: createRowOf(wt),
        listWorktreeRows: async () => [{ path: wt, branch: 'feat/a', detached: false, bare: false }],
        pathPresent: (p) => p === wt,
      })
      const created = await service.create({ projectRoot: 'C:/repo', branch: 'feat/a', path: wt, base: 'main' })
      expect(created.entry.workspaceId).toBeUndefined()
      const listed = await service.list({ projectRoot: 'C:/repo' })
      expect(listed.entries[0]!.workspaceId).toBeUndefined()
    })
  })
})

/** 点选时点懒物化（bug 9d2b7e6a）：无 workspace 记录的树（git 手建/流程 A 前老树）点选 →
 *  ensureWorkspace 幂等 find-or-create 拿 id → 官方 openWorkspace 显式传参。
 *  存在性走真机 fs（temp 目录）。 */
describe('worktree ensureWorkspace 点选懒物化（bug 9d2b7e6a）', () => {
  const withTempWs = async (fn: (ws: string, wt: string) => Promise<void>): Promise<void> => {
    const ws = mkdtempSync(join(tmpdir(), 'dswf-ensure-'))
    const wt = join(ws, 'wt-x').replaceAll('\\', '/')
    mkdirSync(wt)
    try {
      await fn(ws, wt)
    } finally {
      rmSync(ws, { recursive: true, force: true })
    }
  }

  it('在场树 → registry.create(path, worktreeName) 幂等物化并返回 workspaceId', async () => {
    await withTempWs(async (_ws, wt) => {
      const { registry, created } = fakeWorkspaceRegistry({ [wt]: 'dsh-forge' })
      const service = createWorktreeRpcService({ gitWorktree: fakeExt, workspaceRegistry: registry })
      const result = await service.ensureWorkspace({ projectRoot: 'C:/repo', path: wt })
      expect(created).toEqual([{ path: wt, title: 'wt-x' }])
      expect(result.workspaceId).toBe(`ws-${wt}`)
      // 幂等复用：二次调用同 id（find-or-create 官方语义）
      const again = await service.ensureWorkspace({ projectRoot: 'C:/repo', path: wt })
      expect(again.workspaceId).toBe(`ws-${wt}`)
    })
  })

  it('盘上缺席树 → 不物化（防幽灵 workspace 记录）——workspaceId undefined', async () => {
    await withTempWs(async (ws) => {
      const { registry, created } = fakeWorkspaceRegistry({ 'C:/repo': 'dsh-forge' })
      const service = createWorktreeRpcService({ gitWorktree: fakeExt, workspaceRegistry: registry })
      const ghost = join(ws, 'not-exists').replaceAll('\\', '/')
      const result = await service.ensureWorkspace({ projectRoot: 'C:/repo', path: ghost })
      expect(created).toEqual([])
      expect(result.workspaceId).toBeUndefined()
    })
  })

  it('registry 缺席 / create 失败 → fail-soft undefined + warn（不阻断点选主链）', async () => {
    await withTempWs(async (_ws, wt) => {
      const warns: string[] = []
      const degraded = createWorktreeRpcService({ gitWorktree: fakeExt, warn: (line) => warns.push(line) })
      expect((await degraded.ensureWorkspace({ projectRoot: 'C:/repo', path: wt })).workspaceId).toBeUndefined()
      const failing = createWorktreeRpcService({
        gitWorktree: fakeExt,
        workspaceRegistry: {
          create: async () => {
            throw new Error('registry boom')
          },
        },
        warn: (line) => warns.push(line),
      })
      expect((await failing.ensureWorkspace({ projectRoot: 'C:/repo', path: wt })).workspaceId).toBeUndefined()
      expect(warns.join('\n')).toContain('registry boom')
    })
  })
})
