// installStartSessionWrap 单测（bug 绑错树·所见即所得契约）：
// 官方壳「新建会话」无参 startSession 锚点 = currentWorkspaceId/recent，可落在树工作区，
// blank 复用采纳/A2 显式树预铸双双绕过 hero chip 选中记忆 → 新会话绑到「上一个活跃的树」。
// 修复（WYSIWYG）：无参径按 host 选中记忆（与 chip 回填同源）直接路由所选树的 workspace
// （复用即所选树 blank；树 workspace 未建 = 直接预铸该树会话并打开）——会话一出生即属于
// 所选树，零中间态。显示 ≡ 当前锚 / 未注册 / 判定链异常 → 官方原流零漂移。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installStartSessionWrap, type StartSessionWrapDeps } from './start-session-wrap.js'

const ROOT = 'C:/repo'
const TREE_A = 'C:/repo/.forge/worktrees/wt-a'
const TREE_B = 'C:/repo/.forge/worktrees/wt-b'
const ROOT_WS_ID = 'ws-root'
const TREE_A_WS_ID = 'ws-tree-a'
const TREE_B_WS_ID = 'ws-tree-b'

interface ItemShape {
  workspaceId: string
  path: string
  sessionIds: string[]
  createdAt?: string
}

/** 官方快照窄面装配（sessions.list/byId 全量行 + workspaces.list/items） */
function snapshotFaces(options?: {
  currentSessionId?: string
  items?: ItemShape[]
  sessionUpdatedAt?: number
}) {
  const byId: Record<string, unknown> = {}
  for (const item of options?.items ?? []) {
    for (const sessionId of item.sessionIds) {
      byId[sessionId] = {
        id: sessionId,
        updatedAt: options?.sessionUpdatedAt ?? 100,
        retainedBy: sessionId === options?.currentSessionId ? { mainView: 1 } : {},
      }
    }
  }
  return {
    sessionsList: { getSnapshot: () => ({ byId }) },
    workspacesList: { getSnapshot: () => ({ items: options?.items ?? [] }) },
  }
}

function fixture(options?: {
  currentSessionId?: string
  items?: ItemShape[]
  selected?: string | undefined
  resolveRoot?: string | null
  resolveRootThrows?: boolean
  selectedThrows?: boolean
  createSession?: (cwd: string) => Promise<string>
  createSessionThrows?: unknown
}) {
  const { sessionsList, workspacesList } = snapshotFaces(options)
  const original = vi.fn()
  const openSession = vi.fn()
  const createSession = vi.fn((cwd: string) => {
    if (options?.createSessionThrows) return Promise.reject(options.createSessionThrows)
    return (options?.createSession ?? (async () => 'S-precast'))(cwd)
  })
  const deps: StartSessionWrapDeps = {
    uiWorkspace: { startSession: original, openSession },
    sessionsList,
    workspacesList,
    resolveRoot: async () => {
      if (options?.resolveRootThrows) throw new Error('resolve 失败')
      return options?.resolveRoot !== undefined ? options.resolveRoot : ROOT
    },
    selectedTree: async () => {
      if (options?.selectedThrows) throw new Error('selected 失败')
      return options?.selected
    },
    createSession: createSession as unknown as StartSessionWrapDeps['createSession'],
    warn: vi.fn(),
  }
  const dispose = installStartSessionWrap(deps)
  return { original, openSession, createSession, warn: deps.warn as (m: string) => void, dispose, deps }
}

const WS_ROWS = (extra: ItemShape[] = []): ItemShape[] => [
  { workspaceId: ROOT_WS_ID, path: ROOT, sessionIds: [] },
  { workspaceId: TREE_A_WS_ID, path: TREE_A, sessionIds: [] },
  { workspaceId: TREE_B_WS_ID, path: TREE_B, sessionIds: [] },
  ...extra,
]

describe('installStartSessionWrap（bug 绑错树·所见即所得：新会话锚定 chip 所选树）', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('① 显式 workspaceId = 官方原流透传（项目行新会话钮径零介入）', async () => {
    const f = fixture({
      currentSessionId: 'S1',
      items: WS_ROWS([{ workspaceId: 'x', path: TREE_A, sessionIds: ['S1'] }]),
      selected: ROOT,
    })
    await f.deps.uiWorkspace.startSession!(ROOT_WS_ID)
    expect(f.original).toHaveBeenCalledWith(ROOT_WS_ID)
    expect(f.createSession).not.toHaveBeenCalled()
  })

  it('② 核心修复：锚在树 A、chip 选中树 B → 路由 B 的 workspace（复用池对齐所见）', async () => {
    const f = fixture({
      currentSessionId: 'S1',
      items: WS_ROWS([{ workspaceId: 'x', path: TREE_A, sessionIds: ['S1'] }]),
      selected: TREE_B,
    })
    await f.deps.uiWorkspace.startSession!()
    expect(f.original).toHaveBeenCalledTimes(1)
    expect(f.original).toHaveBeenCalledWith(TREE_B_WS_ID)
    expect(f.createSession).not.toHaveBeenCalled()
    expect(f.openSession).not.toHaveBeenCalled()
  })

  it('③ chip 选中主根 → 路由根 workspace（复用根 blank = 所选树本体，非占位）', async () => {
    const f = fixture({
      currentSessionId: 'S1',
      items: WS_ROWS([{ workspaceId: 'x', path: TREE_A, sessionIds: ['S1'] }]),
      selected: ROOT,
    })
    await f.deps.uiWorkspace.startSession!()
    expect(f.original).toHaveBeenCalledWith(ROOT_WS_ID)
  })

  it('④ 所选树 workspace 未建（行缺席）→ 直接预铸该树会话 + openSession（所见即所得零中间态）', async () => {
    const f = fixture({
      currentSessionId: 'S1',
      items: [
        { workspaceId: ROOT_WS_ID, path: ROOT, sessionIds: [] },
        { workspaceId: 'x', path: TREE_A, sessionIds: ['S1'] },
      ],
      selected: TREE_B,
    })
    await f.deps.uiWorkspace.startSession!()
    expect(f.createSession).toHaveBeenCalledTimes(1)
    expect(f.createSession).toHaveBeenCalledWith(TREE_B)
    expect(f.openSession).toHaveBeenCalledWith('S-precast')
    expect(f.original).not.toHaveBeenCalled()
  })

  it('⑤ 显示 ≡ 当前锚（用户就在所选树里）→ 官方原流（既有 blank 复用本即所见即所得）', async () => {
    const f = fixture({
      currentSessionId: 'S1',
      items: WS_ROWS([{ workspaceId: 'x', path: TREE_A, sessionIds: ['S1'] }]),
      selected: TREE_A,
    })
    await f.deps.uiWorkspace.startSession!()
    expect(f.original).toHaveBeenCalledTimes(1)
    expect(f.original).toHaveBeenCalledWith(undefined)
    expect(f.createSession).not.toHaveBeenCalled()
  })

  it('⑥ 零介入矩阵：未注册项目 / 判定面漂移 / 记忆缺席回落主根命中当前锚 → 官方原流或同效路由', async () => {
    // 无当前会话 + recent=树 A + 记忆缺席（回落主根 ≠ 锚 → 路由根 workspace）
    const heroMemoryAbsent = fixture({
      currentSessionId: undefined,
      items: WS_ROWS([{ workspaceId: 'x', path: TREE_A, sessionIds: ['S9'] }]),
      selected: undefined,
    })
    await heroMemoryAbsent.deps.uiWorkspace.startSession!()
    expect(heroMemoryAbsent.original).toHaveBeenCalledWith(ROOT_WS_ID)
    // 未注册项目（resolveRoot null）
    const foreign = fixture({
      currentSessionId: 'S1',
      items: [{ workspaceId: 'x', path: 'C:/foreign', sessionIds: ['S1'] }],
      resolveRoot: null,
      selected: TREE_A,
    })
    await foreign.deps.uiWorkspace.startSession!()
    expect(foreign.original).toHaveBeenCalledWith(undefined)
    // 目标 workspace 在快照查无（漂移容错）→ recent 亦无 → 官方原流
    const noPath = fixture({ currentSessionId: 'S1', items: [], selected: TREE_A })
    await noPath.deps.uiWorkspace.startSession!()
    expect(noPath.original).toHaveBeenCalledWith(undefined)
    expect(foreign.createSession).not.toHaveBeenCalled()
    expect(noPath.createSession).not.toHaveBeenCalled()
  })

  it('⑦ 判定链异常 fail-open：selected/resolveRoot/createSession 抛错 → warn + 官方原流', async () => {
    const base = {
      currentSessionId: 'S1',
      items: WS_ROWS([{ workspaceId: 'x', path: TREE_A, sessionIds: ['S1'] }]),
      selected: TREE_B,
    }
    const selThrow = fixture({ ...base, selectedThrows: true })
    await selThrow.deps.uiWorkspace.startSession!()
    expect(selThrow.original).toHaveBeenCalledWith(undefined)
    expect(selThrow.warn).not.toHaveBeenCalled() // 记忆读失败 = 意图不可知 → 静默官方原流
    const resolveThrow = fixture({ ...base, resolveRootThrows: true })
    await resolveThrow.deps.uiWorkspace.startSession!()
    expect(resolveThrow.original).toHaveBeenCalledWith(undefined) // resolve 失败 = 未注册同判（fail-soft 零 warn）
    const createThrow = fixture({
      currentSessionId: 'S1',
      items: [
        { workspaceId: ROOT_WS_ID, path: ROOT, sessionIds: [] },
        { workspaceId: 'x', path: TREE_A, sessionIds: ['S1'] },
      ],
      selected: TREE_B, // 树 B workspace 未建 → 预铸径（抛错 → fail-open）
      createSessionThrows: new Error('预铸失败'),
    })
    await createThrow.deps.uiWorkspace.startSession!()
    expect(createThrow.original).toHaveBeenCalledWith(undefined)
    expect(createThrow.warn).toHaveBeenCalledTimes(1)
  })

  it('⑧ dispose 恢复原方法且幂等；缺席 startSession 面 = no-op 安装', async () => {
    const f = fixture({ currentSessionId: 'S1', selected: ROOT })
    f.dispose()
    f.dispose()
    expect(f.deps.uiWorkspace.startSession).toBe(f.original)
    const bare = { uiWorkspace: {} as { startSession?: (id?: string) => void } }
    expect(() => installStartSessionWrap(bare as unknown as StartSessionWrapDeps)).not.toThrow()
  })
})
