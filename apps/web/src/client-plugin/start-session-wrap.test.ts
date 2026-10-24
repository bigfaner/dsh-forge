// installStartSessionWrap 单测（绑定推导制·入口锚定 workspaceId 直通——binding-derivation §2.3）：
// 官方壳「新建会话」无参 startSession 锚点 = currentWorkspaceId/recent，可落在树工作区而绕过
// hero chip 显示。修复：无参径按 chip 显示选中（forge:worktree/selected）解析所选树 workspaceId
// （chip 双发数据源 WorktreeEntryDto.workspaceId 优先，官方 workspaces.list path 匹配回退），
// 直通官方 startSession(workspaceId)——官方内部 session.create({workspaceId}) 原生 blank 复用，
// 桌面创建零 forge 改道（预铸采纳单门已退役，依赖面无 forge 建会话通道）。
// 显示 ≡ 当前锚 / 未注册 / 判定链异常 → 官方原流零漂移。
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
  /** chip 双发数据源（WorktreeEntryDto.workspaceId）：path → workspaceId；缺省 = 行缺席（undefined） */
  dtoWorkspaceId?: (worktreePath: string, projectRoot: string) => Promise<string | undefined>
  dtoThrows?: boolean
}) {
  const { sessionsList, workspacesList } = snapshotFaces(options)
  const original = vi.fn()
  const worktreeWorkspaceId = vi.fn((path: string, root: string) => {
    if (options?.dtoThrows) return Promise.reject(new Error('list 失败'))
    return (options?.dtoWorkspaceId ?? (async () => undefined))(path, root)
  })
  const deps: StartSessionWrapDeps = {
    uiWorkspace: { startSession: original },
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
    worktreeWorkspaceId: worktreeWorkspaceId as unknown as StartSessionWrapDeps['worktreeWorkspaceId'],
    warn: vi.fn(),
  }
  const dispose = installStartSessionWrap(deps)
  return { original, worktreeWorkspaceId, warn: deps.warn as (m: string) => void, dispose, deps }
}

/** 官方 workspaces.list 行集（workspaceId 回退解析源——DTO 缺席时的对位） */
const WS_ROWS = (extra: ItemShape[] = []): ItemShape[] => [
  { workspaceId: ROOT_WS_ID, path: ROOT, sessionIds: [] },
  { workspaceId: TREE_A_WS_ID, path: TREE_A, sessionIds: [] },
  { workspaceId: TREE_B_WS_ID, path: TREE_B, sessionIds: [] },
  ...extra,
]

/** DTO 数据源（WorktreeEntryDto.workspaceId——forge:worktree/list 行集窄镜像） */
const DTO_ROWS = (extra: Array<{ path: string; workspaceId: string }> = []) => {
  const rows = new Map(extra.map((row) => [row.path, row.workspaceId]))
  return async (worktreePath: string): Promise<string | undefined> => rows.get(worktreePath)
}

describe('installStartSessionWrap（绑定推导制：入口锚定 workspaceId 直通 + 显示源路由保留）', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('① 显式 workspaceId = 官方直通零介入（chip 双发径显式传参——判定链零触发）', async () => {
    const f = fixture({
      currentSessionId: 'S1',
      items: WS_ROWS([{ workspaceId: 'x', path: TREE_A, sessionIds: ['S1'] }]),
      selected: TREE_B,
    })
    await f.deps.uiWorkspace.startSession!(TREE_B_WS_ID)
    expect(f.original).toHaveBeenCalledTimes(1)
    expect(f.original).toHaveBeenCalledWith(TREE_B_WS_ID)
    expect(f.worktreeWorkspaceId).not.toHaveBeenCalled()
  })

  it('② 核心语义：锚在树 A、chip 显示树 B → 按显示选中的 workspaceId 直通官方（零 forge 改道）', async () => {
    const f = fixture({
      currentSessionId: 'S1',
      items: WS_ROWS([{ workspaceId: 'x', path: TREE_A, sessionIds: ['S1'] }]),
      selected: TREE_B,
      dtoWorkspaceId: DTO_ROWS([{ path: TREE_B, workspaceId: TREE_B_WS_ID }]),
    })
    await f.deps.uiWorkspace.startSession!()
    // 调用形态钉：官方 startSession 收到显式 workspaceId（官方内部 session.create({workspaceId})）
    expect(f.original).toHaveBeenCalledTimes(1)
    expect(f.original).toHaveBeenCalledWith(TREE_B_WS_ID)
    // 数据源钉：workspaceId 取自 chip 双发 DTO（WorktreeEntryDto.workspaceId）
    expect(f.worktreeWorkspaceId).toHaveBeenCalledWith(TREE_B, ROOT)
  })

  it('③ DTO 回退：chip 双发数据源行缺席 → 官方 workspaces.list path 归一匹配直通', async () => {
    const f = fixture({
      currentSessionId: 'S1',
      items: WS_ROWS([{ workspaceId: 'x', path: TREE_A, sessionIds: ['S1'] }]),
      selected: TREE_B,
      dtoWorkspaceId: async () => undefined, // DTO 行缺席（漂移/旧 host）
    })
    await f.deps.uiWorkspace.startSession!()
    expect(f.original).toHaveBeenCalledWith(TREE_B_WS_ID) // 回退源命中同一树
  })

  it('④ chip 显示主根 → 直通根 workspace（官方 blank 复用即主树，非占位）', async () => {
    const f = fixture({
      currentSessionId: 'S1',
      items: WS_ROWS([{ workspaceId: 'x', path: TREE_A, sessionIds: ['S1'] }]),
      selected: ROOT,
      dtoWorkspaceId: DTO_ROWS([{ path: ROOT, workspaceId: ROOT_WS_ID }]),
    })
    await f.deps.uiWorkspace.startSession!()
    expect(f.original).toHaveBeenCalledWith(ROOT_WS_ID)
  })

  it('⑤ 显示 ≡ 当前锚：workspaceId 解析在场仍显式直通（与官方原流同效——既有 blank 复用即所见）', async () => {
    const f = fixture({
      currentSessionId: 'S1',
      items: WS_ROWS([{ workspaceId: 'x', path: TREE_A, sessionIds: ['S1'] }]),
      selected: TREE_A,
      dtoWorkspaceId: DTO_ROWS([{ path: TREE_A, workspaceId: TREE_A_WS_ID }]),
    })
    await f.deps.uiWorkspace.startSession!()
    expect(f.original).toHaveBeenCalledWith(TREE_A_WS_ID)
  })

  it('⑥ 零介入矩阵：未注册项目 / 记忆缺席回落主根 / 官方锚缺席 / workspaceId 解析缺席 → 官方原流', async () => {
    // 未注册项目（resolveRoot null）
    const foreign = fixture({
      currentSessionId: 'S1',
      items: [{ workspaceId: 'x', path: 'C:/foreign', sessionIds: ['S1'] }],
      resolveRoot: null,
      selected: TREE_A,
    })
    await foreign.deps.uiWorkspace.startSession!()
    expect(foreign.original).toHaveBeenCalledWith(undefined)
    // 显示选中缺席 → 回落项目根；DTO 与官方行集均未命中（无 workspace 行）→ 官方原流
    const noHit = fixture({ currentSessionId: 'S1', items: [], selected: undefined })
    await noHit.deps.uiWorkspace.startSession!()
    expect(noHit.original).toHaveBeenCalledWith(undefined)
    // 记忆缺席 + 回落主根命中官方行集 → 直通根 workspace（显示 ≡ chip 缺省主行同判）
    const memoryAbsent = fixture({
      currentSessionId: undefined,
      items: WS_ROWS([{ workspaceId: 'x', path: TREE_A, sessionIds: ['S9'] }]),
      selected: undefined,
    })
    await memoryAbsent.deps.uiWorkspace.startSession!()
    expect(memoryAbsent.original).toHaveBeenCalledWith(ROOT_WS_ID)
    expect(foreign.worktreeWorkspaceId).not.toHaveBeenCalled() // 未注册项目零解析
  })

  it('⑦ fail-open：DTO 抛错回退官方行集 / DTO 与回退双缺席 / 判定链异常 → 官方原流', async () => {
    const base = {
      currentSessionId: 'S1',
      items: WS_ROWS([{ workspaceId: 'x', path: TREE_A, sessionIds: ['S1'] }]),
      selected: TREE_B,
    }
    // DTO 抛错 → 回退官方行集命中 → 直通
    const dtoThrow = fixture({ ...base, dtoThrows: true })
    await dtoThrow.deps.uiWorkspace.startSession!()
    expect(dtoThrow.original).toHaveBeenCalledWith(TREE_B_WS_ID)
    expect(dtoThrow.warn).not.toHaveBeenCalled()
    // 双缺席 → 官方原流（零 warn——解析缺席 = 现状同判）
    const bothAbsent = fixture({ ...base, dtoWorkspaceId: async () => undefined, items: [] })
    await bothAbsent.deps.uiWorkspace.startSession!()
    expect(bothAbsent.original).toHaveBeenCalledWith(undefined)
    // resolveRoot/selectedTree 抛错 = 意图不可知 → 静默官方原流
    const resolveThrow = fixture({ ...base, resolveRootThrows: true })
    await resolveThrow.deps.uiWorkspace.startSession!()
    expect(resolveThrow.original).toHaveBeenCalledWith(undefined)
    const selThrow = fixture({ ...base, selectedThrows: true })
    await selThrow.deps.uiWorkspace.startSession!()
    expect(selThrow.original).toHaveBeenCalledWith(undefined)
    expect(selThrow.warn).not.toHaveBeenCalled()
  })

  it('⑧ 路由链意外异常 fail-loud → warn 一行 + 官方原流', async () => {
    const f = fixture({
      currentSessionId: 'S1',
      items: WS_ROWS([{ workspaceId: 'x', path: TREE_A, sessionIds: ['S1'] }]),
      selected: TREE_B,
    })
    // workspacesList 快照抛错（官方面漂移）→ then/catch 兜底
    ;(f.deps.workspacesList as { getSnapshot: () => unknown }).getSnapshot = () => {
      throw new Error('快照漂移')
    }
    await f.deps.uiWorkspace.startSession!()
    expect(f.original).toHaveBeenCalledWith(undefined)
    expect(f.warn).toHaveBeenCalledTimes(1)
  })

  it('⑨ dispose 恢复原方法且幂等；缺席 startSession 面 = no-op 安装', async () => {
    const f = fixture({ currentSessionId: 'S1', selected: ROOT })
    f.dispose()
    f.dispose()
    expect(f.deps.uiWorkspace.startSession).toBe(f.original)
    const bare = { uiWorkspace: {} as { startSession?: (id?: string) => void } }
    expect(() => installStartSessionWrap(bare as unknown as StartSessionWrapDeps)).not.toThrow()
  })
})
