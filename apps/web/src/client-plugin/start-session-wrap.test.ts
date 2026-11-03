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
  /** 会话 cwd（INV-B cwd 绑定判据源——官方 byId 行字段镜像） */
  sessionCwd?: Record<string, string>
}) {
  const byId: Record<string, unknown> = {}
  for (const item of options?.items ?? []) {
    for (const sessionId of item.sessionIds) {
      byId[sessionId] = {
        id: sessionId,
        updatedAt: options?.sessionUpdatedAt ?? 100,
        retainedBy: sessionId === options?.currentSessionId ? { mainView: 1 } : {},
        ...(options?.sessionCwd?.[sessionId] !== undefined ? { cwd: options.sessionCwd[sessionId] } : {}),
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
  /** 会话 cwd（INV-B cwd 绑定判据源——直通 snapshotFaces） */
  sessionCwd?: Record<string, string>
  /** 显示真源（chip 本地投影同源——bug 05c712a4 根治面）；缺省 = 未设 */
  displayed?: string | undefined
  resolveRoot?: string | null
  resolveRootThrows?: boolean
  /** 输入敏感 resolveRoot（新测试用——按入参 path 裁决；缺省 = 常量 stub） */
  resolveRootFn?: (path: string) => Promise<string | null>
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
    resolveRoot: async (path) => {
      if (options?.resolveRootFn) return options.resolveRootFn(path)
      if (options?.resolveRootThrows) throw new Error('resolve 失败')
      return options?.resolveRoot !== undefined ? options.resolveRoot : ROOT
    },
    displayedTree: () => options?.displayed,
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
      displayed: TREE_B,
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
      displayed: TREE_B,
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
      displayed: TREE_B,
      dtoWorkspaceId: async () => undefined, // DTO 行缺席（漂移/旧 host）
    })
    await f.deps.uiWorkspace.startSession!()
    expect(f.original).toHaveBeenCalledWith(TREE_B_WS_ID) // 回退源命中同一树
  })

  it('④ chip 显示主根 → 直通根 workspace（官方 blank 复用即主树，非占位）', async () => {
    const f = fixture({
      currentSessionId: 'S1',
      items: WS_ROWS([{ workspaceId: 'x', path: TREE_A, sessionIds: ['S1'] }]),
      displayed: ROOT,
      dtoWorkspaceId: DTO_ROWS([{ path: ROOT, workspaceId: ROOT_WS_ID }]),
    })
    await f.deps.uiWorkspace.startSession!()
    expect(f.original).toHaveBeenCalledWith(ROOT_WS_ID)
  })

  it('⑤ 显示 ≡ 当前锚：workspaceId 解析在场仍显式直通（与官方原流同效——既有 blank 复用即所见）', async () => {
    const f = fixture({
      currentSessionId: 'S1',
      items: WS_ROWS([{ workspaceId: 'x', path: TREE_A, sessionIds: ['S1'] }]),
      displayed: TREE_A,
      dtoWorkspaceId: DTO_ROWS([{ path: TREE_A, workspaceId: TREE_A_WS_ID }]),
    })
    await f.deps.uiWorkspace.startSession!()
    expect(f.original).toHaveBeenCalledWith(TREE_A_WS_ID)
  })

  it('⑥ 零介入矩阵：未注册项目 / 显示缺席回落主根 / 官方锚缺席 / workspaceId 解析缺席 → 官方原流', async () => {
    // 未注册项目（resolveRoot null）
    const foreign = fixture({
      currentSessionId: 'S1',
      items: [{ workspaceId: 'x', path: 'C:/foreign', sessionIds: ['S1'] }],
      resolveRoot: null,
      displayed: TREE_A,
    })
    await foreign.deps.uiWorkspace.startSession!()
    expect(foreign.original).toHaveBeenCalledWith(undefined)
    // 显示选中缺席 → 回落项目根；DTO 与官方行集均未命中（无 workspace 行）→ 官方原流
    const noHit = fixture({ currentSessionId: 'S1', items: [], displayed: undefined })
    await noHit.deps.uiWorkspace.startSession!()
    expect(noHit.original).toHaveBeenCalledWith(undefined)
    // 显示缺席 + 回落主根命中官方行集 → 直通根 workspace（显示 ≡ chip 缺省主行同判）
    const memoryAbsent = fixture({
      currentSessionId: undefined,
      items: WS_ROWS([{ workspaceId: 'x', path: TREE_A, sessionIds: ['S9'] }]),
      displayed: undefined,
    })
    await memoryAbsent.deps.uiWorkspace.startSession!()
    expect(memoryAbsent.original).toHaveBeenCalledWith(ROOT_WS_ID)
    expect(foreign.worktreeWorkspaceId).not.toHaveBeenCalled() // 未注册项目零解析
  })

  it('⑦ fail-open：DTO 抛错回退官方行集 / DTO 与回退双缺席 / 判定链异常 → 官方原流', async () => {
    const base = {
      currentSessionId: 'S1',
      items: WS_ROWS([{ workspaceId: 'x', path: TREE_A, sessionIds: ['S1'] }]),
      displayed: TREE_B,
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
    // resolveRoot 抛错 = 意图不可知 → 静默官方原流
    const resolveThrow = fixture({ ...base, resolveRootThrows: true })
    await resolveThrow.deps.uiWorkspace.startSession!()
    expect(resolveThrow.original).toHaveBeenCalledWith(undefined)
    expect(resolveThrow.warn).not.toHaveBeenCalled()
  })

  it('⑧ 路由链意外异常 fail-loud → warn 一行 + 官方原流', async () => {
    const f = fixture({
      currentSessionId: 'S1',
      items: WS_ROWS([{ workspaceId: 'x', path: TREE_A, sessionIds: ['S1'] }]),
      displayed: TREE_B,
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
    const f = fixture({ currentSessionId: 'S1', displayed: ROOT })
    f.dispose()
    f.dispose()
    expect(f.deps.uiWorkspace.startSession).toBe(f.original)
    const bare = { uiWorkspace: {} as { startSession?: (id?: string) => void } }
    expect(() => installStartSessionWrap(bare as unknown as StartSessionWrapDeps)).not.toThrow()
  })

  it('⑩ bug 05c712a4：创建路由只消费显示真源——displayedTree=a 即落 a（host 选中记忆不在依赖面，分叉不可能影响归属）', async () => {
    const f = fixture({
      currentSessionId: 'S1',
      items: WS_ROWS([{ workspaceId: 'x', path: TREE_A, sessionIds: ['S1'] }]),
      displayed: TREE_A, // 用户所见（chip 本地显示真源）= a
      dtoWorkspaceId: DTO_ROWS([{ path: TREE_A, workspaceId: TREE_A_WS_ID }]),
    })
    await f.deps.uiWorkspace.startSession!()
    expect(f.original).toHaveBeenCalledWith(TREE_A_WS_ID)
    // 根治钉：deps 无任何 host 选中记忆读面（selectedTree 已从依赖面移除）——
    // 记忆陈旧/清空/多窗覆写与创建归属彻底无关
    expect('selectedTree' in f.deps).toBe(false)
  })

  it('⑪ bug 38d80c5b：显示锚残留他项目树路径 → 归属门视同未选回落主行（回退径不得命中他项目 workspace）', async () => {
    const FOREIGN_TREE = 'C:/other/.forge/worktrees/wt-x'
    const f = fixture({
      currentSessionId: 'S1',
      items: WS_ROWS([{ workspaceId: 'ws-foreign-tree', path: FOREIGN_TREE, sessionIds: ['S1'] }]),
      displayed: FOREIGN_TREE, // 全局锚残留：他项目树路径，官方全局行集可命中
      // DTO 径按 projectRoot 过滤——外来路径天然 miss（对位发现 1 的洞在回退径）
    })
    await f.deps.uiWorkspace.startSession!()
    // 归属门：displayed 不归属 projectRoot → 视同未选回落主行 → 直通根 workspace（非他项目树）
    expect(f.original).toHaveBeenCalledWith(ROOT_WS_ID)
    expect(f.worktreeWorkspaceId).toHaveBeenCalledWith(ROOT, ROOT)
  })

  // ── bug 8c7e847f 三件套（家族链 #6——wrap 锚消费面 INV-L/INV-U/INV-B）──
  // 定谳：官方 W 清单不干净（残留行在场、成员位滞后）＋消费面首命中劫持（E1 离线复现红）。
  describe('bug 8c7e847f：清单仲裁三件套（INV-L 活性过滤 / INV-U 选主 / INV-B cwd 绑定）', () => {
    it('INV-B cwd 绑定：mainView 会话锚 = cwd 同锚行（成员位滞后残留行不得劫持 targetPath）', async () => {
      const f = fixture({
        currentSessionId: 'S1',
        sessionCwd: { S1: ROOT },
        items: [
          // 残留行（旧路径）成员位仍声明 S1（滞后投影缓存）——裸 find 首命中即劫持
          { workspaceId: 'ws-stale', path: 'C:/repo-old', sessionIds: ['S1'], createdAt: '2026-01-01T00:00:00Z' },
          { workspaceId: ROOT_WS_ID, path: ROOT, sessionIds: [], createdAt: '2026-06-01T00:00:00Z' },
        ],
        resolveRootFn: async (path) => (path === ROOT ? ROOT : null),
        displayed: undefined,
      })
      await f.deps.uiWorkspace.startSession!()
      // cwd 同锚行（ROOT）被选中 → 回落主行径命中根 workspace；残留旧路径不得进命中集
      expect(f.original).toHaveBeenCalledWith(ROOT_WS_ID)
    })

    it('INV-U 选主：同锚多行回退径禁裸 find 首命中（createdAt 最新主行胜）', async () => {
      const f = fixture({
        currentSessionId: 'S1',
        sessionCwd: { S1: ROOT },
        items: [
          // 同锚（TREE_A）双行：残留旧行前置——首命中即劫持（E1 形态）
          { workspaceId: 'ws-stale', path: TREE_A, sessionIds: ['S1'], createdAt: '2026-01-01T00:00:00Z' },
          { workspaceId: ROOT_WS_ID, path: ROOT, sessionIds: [], createdAt: '2026-05-01T00:00:00Z' },
          { workspaceId: 'ws-tree-a-new', path: TREE_A, sessionIds: [], createdAt: '2026-06-01T00:00:00Z' },
        ],
        displayed: TREE_A,
      })
      await f.deps.uiWorkspace.startSession!()
      expect(f.original).toHaveBeenCalledWith('ws-tree-a-new')
    })

    it('INV-B 退路：会话行 cwd 缺席（旧面形状漂移）退成员位投影缓存径——既有行为零回归', async () => {
      const f = fixture({
        currentSessionId: 'S1',
        items: WS_ROWS([{ workspaceId: 'x', path: TREE_A, sessionIds: ['S1'] }]),
        displayed: TREE_B,
        dtoWorkspaceId: DTO_ROWS([{ path: TREE_B, workspaceId: TREE_B_WS_ID }]),
      })
      await f.deps.uiWorkspace.startSession!()
      expect(f.original).toHaveBeenCalledWith(TREE_B_WS_ID)
    })
  })
})
