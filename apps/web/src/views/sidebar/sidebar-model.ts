// 左栏面板派生模型（定位：业务——UF-1 项目树 + 会话列表的纯派生层）。
// 数据纪律（SC2 无投影——零缓存零副本）：
//   - 会话行不落地副本：每次渲染从注入的 dsh 账本快照源直读（getSnapshot），
//     本模块只做「当次快照 → 当次视图行」的纯映射，不存快照、不写回流；
//   - dsh 行形状取消费切片的窄结构类型（结构同型镜像上游 SessionSummary /
//     SessionListState / WorkspaceSnapshot——插件侧真身注入，禁 import dsh 运行期包，
//     与 shell/dsh-globals.d.ts 同一镜像纪律）。
// 状态点四态 = 官方 StateDot 语义（warning 用户注意 / done 完成 / ongoing 进行 / idle 静默）。
import type { ProjectSummary } from '@dsh-forge/contracts'
import type { StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import { timeLabelZh } from '../../components/index.js'

/** 快照源窄形状（dsh ObservableSnapshot 结构同型；React useSyncExternalStore 直连） */
export interface SnapshotSource<T> {
  getSnapshot(): T
  subscribe(fn: () => void): () => void
}

/** dsh 会话账本行窄形状（上游 SessionSummary 消费切片） */
export interface LedgerSessionRow {
  readonly id: string
  /** 人面标签：持久标题，缺省回退项目名/会话 id（上游 displayTitle 契约） */
  readonly displayTitle: string
  readonly updatedAt: number
  readonly running?: boolean
  /** 在场 = 有等待用户的交互（官方 amber-dot 语义） */
  readonly pendingInteraction?: unknown
  /** 完成且未查看（官方 green「done」提醒点） */
  readonly completed?: boolean
  /** 空白会话（官方浏览器只显示被选中的那一个空白行） */
  readonly blank?: boolean
  /** 父会话在场 = 子代理行，不入顶层列表（官方顶层行口径） */
  readonly parentId?: string
}

/** dsh 会话账本快照窄形状（上游 SessionListState 消费切片） */
export interface LedgerSessionsSnapshot {
  /** Host 列表序（面包屑专用行已被上游排除） */
  readonly ids: readonly string[]
  readonly byId: Readonly<Record<string, LedgerSessionRow>>
  readonly current?: string
  /** 'pending' = 账本尚未就绪（行级骨架相位） */
  readonly phase: 'pending' | 'ready'
}

/** dsh workspace 行窄形状（会话归属 = workspace.sessionIds，上游 WorkspaceView 消费切片） */
export interface LedgerWorkspaceRow {
  readonly workspaceId: string
  readonly sessionIds: readonly string[]
}

/** dsh workspace 归属快照窄形状（上游 WorkspaceSnapshot 消费切片） */
export interface LedgerWorkspacesSnapshot {
  readonly items: readonly LedgerWorkspaceRow[]
}

/** 会话行状态（UF-1 行语言·状态点；官方 StateDot 四态的语义名） */
export type SidebarSessionStatus = 'attention' | 'done' | 'running' | 'idle'

/** 面板会话行（视图行——当次快照派生，不落地） */
export interface SidebarSessionRow {
  readonly sessionId: string
  readonly title: string
  readonly status: SidebarSessionStatus
  readonly updatedAt: number
}

/** 面板项目节点（项目 = forge projects 行；会话 = 该项目 workspace 名下账本行） */
export interface SidebarProjectNode {
  readonly projectId: string
  /** dsh workspace id（新会话钮 → 官方 startSession(workspaceId) 的寻址面，fix-42） */
  readonly workspaceId: string
  readonly name: string
  readonly archived: boolean
  readonly sessions: readonly SidebarSessionRow[]
}

/**
 * 会话行状态推导（优先级：用户注意 > 完成提醒 > 进行中 > 静默）。
 * 上游语义：pendingInteraction = amber 用户注意；completed = green 完成提醒；running = spinner。
 */
export function sessionStatus(row: LedgerSessionRow): SidebarSessionStatus {
  if (row.pendingInteraction !== undefined) return 'attention'
  if (row.completed === true) return 'done'
  if (row.running === true) return 'running'
  return 'idle'
}

/** 状态 → 官方 StateDot 态（attention→warning / done→done / running→ongoing / idle→idle） */
export function sessionDotState(status: SidebarSessionStatus): StateDotState {
  if (status === 'attention') return 'warning'
  if (status === 'done') return 'done'
  if (status === 'running') return 'ongoing'
  return 'idle'
}

/** 相对时间标签（桶化 = 官方 relativeTime；zh 文案切换 = components/time-label 共享源，fix-36 收敛） */
export function relativeTimeLabel(updatedAt: number, now: number): string {
  return timeLabelZh(updatedAt, now)
}

/** 会话行可见判据：在账本 byId、顶层行（无父）、空白行仅显示被选中者（官方浏览器口径） */
function sessionVisible(row: LedgerSessionRow, currentSessionId: string | null): boolean {
  if (row.parentId !== undefined) return false
  if (row.blank === true && row.id !== currentSessionId) return false
  return true
}

/** buildSidebarTree 输出（tree + 账本相位切片——loading = phase 'pending'） */
export interface SidebarTree {
  readonly tree: readonly SidebarProjectNode[]
  /** 账本未就绪（UF-1 States「会话加载中」→ 行级骨架） */
  readonly loading: boolean
  readonly currentSessionId: string | null
}

/**
 * 派生左栏树（纯函数，零快照持有）：项目序 = forge:projects/list 返回序；
 * 每项目会话 = 其 workspaceId 的 sessionIds 顺序（workspace 自有排列序）∩ 账本 byId。
 * 未注册为项目的 workspace 的会话不入树（产品面 = 注册项目口径；dsh 侧裸 workspace 非产品对象）。
 */
export function buildSidebarTree(input: {
  readonly projects: readonly ProjectSummary[]
  readonly sessions: LedgerSessionsSnapshot
  readonly workspaces: LedgerWorkspacesSnapshot
}): SidebarTree {
  const currentSessionId = input.sessions.current ?? null
  const rowsByWorkspace = new Map<string, readonly string[]>()
  for (const workspace of input.workspaces.items) {
    rowsByWorkspace.set(workspace.workspaceId, workspace.sessionIds)
  }
  const tree: SidebarProjectNode[] = []
  for (const project of input.projects) {
    const memberIds = rowsByWorkspace.get(project.workspaceId) ?? []
    const rows: SidebarSessionRow[] = []
    for (const sessionId of memberIds) {
      const row = input.sessions.byId[sessionId]
      if (row === undefined) continue
      if (!sessionVisible(row, currentSessionId)) continue
      rows.push({
        sessionId: row.id,
        title: row.displayTitle,
        status: sessionStatus(row),
        updatedAt: row.updatedAt,
      })
    }
    tree.push({
      projectId: project.id,
      workspaceId: project.workspaceId,
      name: project.name,
      archived: project.archived,
      sessions: rows,
    })
  }
  return {
    tree,
    loading: input.sessions.phase === 'pending',
    currentSessionId,
  }
}

/**
 * 项目/会话过滤（UF-1 Validation：P1 最简 = 前缀/子串匹配，不区分大小写——原型
 * renderProjects 同型语义）：项目名命中 → 项目在场，会话行仍按标题过滤（非命中行
 * 滤除——项目名命中而会话全不命中时项目在场、会话为空，视图层呈现「无匹配会话」）；
 * 任一会话标题命中 → 项目在场且仅留命中行；全不命中 → 项目离场。
 * 纯视图投影（SC2 直读纪律不破——快照数据源不变）：空/纯空白查询 = 不过滤
 * （原树原样引用返回）；不触碰选中态——currentSessionId 不入参，过滤隐藏当前
 * 选中行不重置锚，清过滤即恢复可见；不改写输入树（节点复用——命中行为空差集
 * 时才派生新节点）。
 */
export function sidebarFilterOf(
  query: string,
  tree: readonly SidebarProjectNode[],
): readonly SidebarProjectNode[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return tree
  const visible: SidebarProjectNode[] = []
  for (const node of tree) {
    const nameMatch = node.name.toLowerCase().includes(needle)
    const sessions = node.sessions.filter((row) => row.title.toLowerCase().includes(needle))
    if (!nameMatch && sessions.length === 0) continue
    visible.push(sessions.length === node.sessions.length ? node : { ...node, sessions })
  }
  return visible
}

/**
 * 头部钮容器选择器（fix-22 blur 守卫契约）：SidebarProjectsZone 头部
 * （label + 搜索钮 + 视图选项钮 + ＋）的 class 钉面——选择器与该 class 由单测互钉。
 */
export const SIDEBAR_SECTIONHEAD_SELECTOR = '.dswf-sidebar-sectionhead'

/** blur relatedTarget 窄形状（Element.closest 切片——结构兼容 EventTarget，Node 单测可伪造） */
export type FilterBlurTarget = { readonly closest?: unknown } | null

/**
 * 过滤行 blur 收起裁决（fix-22，走查人规格演进——超原型：原型本无 blur 收起）：
 * 焦点移出输入即收起（与 Esc 同缝 onCollapse——收起即清空查询，原型 S.pj 语义保持）；
 * 例外＝焦点移入头部钮容器（SIDEBAR_SECTIONHEAD_SELECTOR：搜索钮/视图选项钮/＋）——
 * 头部交互保持搜索态不收起（竞态守卫口径 a：否则行展开时点头部钮，mousedown 先触发
 * input blur → 收起+清空，随后 click 到达搜索钮 toggle 再翻转 searchOpen → 行意外重开）。
 * 判据：null / 非 Element 目标 / closest 不命中容器（BODY/树行/其他区域）＝收起；
 * closest 命中容器＝不收起。纯裁决（无 DOM 依赖——close 鸭型探测）。
 */
export function shouldCollapseFilterOnBlur(relatedTarget: FilterBlurTarget): boolean {
  if (relatedTarget === null) return true
  if (typeof relatedTarget.closest !== 'function') return true
  const host = (relatedTarget.closest as (selector: string) => Element | null)(SIDEBAR_SECTIONHEAD_SELECTOR)
  return host === null
}

// ── 视图态（fix-42：官方 ViewOptionsMenu P1 裁剪实装——母本 dsh.workspace.view.v5 的
//    groupBy/archivedFilter 二面；orderBy/手动换序/工作区树嵌套不做（菜单项不出现）。） ──

/** 排列二值（tree = 现行项目树 / flat = 全会话平铺按 updatedAt 降序） */
export type SidebarGroupBy = 'tree' | 'flat'

/**
 * 归档过滤三态（项目行 archived 口径——会话 archive 态未入账本镜像窄面，P1 不消费）：
 * default = 全显（归档行弱化，现行行为）/ hide = 不含归档 / only = 仅归档。
 */
export type SidebarArchivedFilter = 'default' | 'hide' | 'only'

/** 侧栏视图态（纯视图微观态——同 collapsedIds 口径，不属 SC2 副本纪律；P1 不持久化） */
export interface SidebarView {
  readonly groupBy: SidebarGroupBy
  readonly archivedFilter: SidebarArchivedFilter
}

/** 缺省视图（按项目树 + 含归档——现行行为，官方菜单切换才偏离） */
export const SIDEBAR_VIEW_DEFAULT: SidebarView = { groupBy: 'tree', archivedFilter: 'default' }

/**
 * 视图菜单项 id → 视图态投影（纯函数，fix-42）。菜单项 id 与官方 ViewOptionsMenu 同名面
 * 裁剪：'tree' | 'flat' → groupBy；'default' | 'hide' | 'only' → archivedFilter；
 * 其它 id（separator/label 行）→ 原引用返回（态机层可据引用相等免触发）。
 */
export function sidebarViewOfPick(view: SidebarView, id: string): SidebarView {
  if (id === 'tree' || id === 'flat') {
    return view.groupBy === id ? view : { ...view, groupBy: id }
  }
  if (id === 'default' || id === 'hide' || id === 'only') {
    return view.archivedFilter === id ? view : { ...view, archivedFilter: id }
  }
  return view
}

/**
 * 归档过滤投影（纯函数——数据源不变，视图行差集）：default = 原树引用返回（零派生）；
 * hide = 滤除归档项目；only = 仅归档项目。会话行随项目行同进退（P1 无会话级归档口径）。
 */
export function sidebarArchivedFilterOf(
  filter: SidebarArchivedFilter,
  tree: readonly SidebarProjectNode[],
): readonly SidebarProjectNode[] {
  if (filter === 'default') return tree
  if (filter === 'hide') return tree.filter((node) => !node.archived)
  return tree.filter((node) => node.archived)
}

/** 平铺视图行（flat 排列——跨项目全会话行；projectName 随行 = 过滤命中面 + 归属可辨） */
export interface SidebarFlatRow {
  readonly projectId: string
  readonly projectName: string
  readonly sessionId: string
  readonly title: string
  readonly status: SidebarSessionStatus
  readonly updatedAt: number
}

/**
 * 平铺投影（纯函数）：全会话行跨项目摊平，按 updatedAt 降序（官方 FlatList updated 序
 * 同型；稳定排序保时序平手时的工作区序）。不落地副本——行字段自树节点当次派生。
 */
export function sidebarFlatRowsOf(tree: readonly SidebarProjectNode[]): readonly SidebarFlatRow[] {
  const rows: SidebarFlatRow[] = []
  for (const node of tree) {
    for (const session of node.sessions) {
      rows.push({
        projectId: node.projectId,
        projectName: node.name,
        title: session.title,
        sessionId: session.sessionId,
        status: session.status,
        updatedAt: session.updatedAt,
      })
    }
  }
  return rows.sort((a, b) => b.updatedAt - a.updatedAt)
}

/**
 * 平铺行过滤（纯函数——sidebarFilterOf 的平铺同型）：空/纯空白查询 = 原引用返回；
 * 会话标题或项目名命中 → 行在场，全不命中 → 空集（视图层行内空提示）。
 */
export function sidebarFlatFilterOf(
  query: string,
  rows: readonly SidebarFlatRow[],
): readonly SidebarFlatRow[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return rows
  return rows.filter(
    (row) =>
      row.title.toLowerCase().includes(needle) || row.projectName.toLowerCase().includes(needle),
  )
}

/**
 * 段头标签（官方 sectionLabel 同型：groupBy=flat → 「会话」，否则「工作区」——产品口径
 * 项目树 → 「项目」）。
 */
export function sidebarSectionLabelOf(view: SidebarView): string {
  return view.groupBy === 'flat' ? '会话' : '项目'
}
