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
  /**
   * 宿主投影整值（上游账本行 projectionValues 消费切片——session.list 逐行 hints 块
   * 经 ProjectionValueStore 落值；S7 派发循环徽标窄读键 = 'forge-dispatch-loop'）。
   * 键缺席 = 能力缺席（上游既定语义），形状漂移 = 徽标不渲染（sessionLoopBadge 防御读）。
   */
  readonly projectionValues?: Readonly<Record<string, unknown>>
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

/**
 * dsh workspace 归属快照窄形状（上游 WorkspaceSnapshot 消费切片）。D45 增镜像两集合
 * （上游快照恒在场——选项性 = 测试替身/面漂移缺席容忍，缺席 = 无置顶/归档标记）：
 * archivedSessionIds = registry 级归档集（宿主序）；pinnedSessionIds = registry 级置顶
 * 集（最近置顶在前——上游官方口径）。
 */
export interface LedgerWorkspacesSnapshot {
  readonly items: readonly LedgerWorkspaceRow[]
  /** 归档会话 id 集（registry 级——上游 archivedSessionIds 镜像；缺席 = 空集语义） */
  readonly archivedSessionIds?: readonly string[]
  /** 置顶会话 id 集（最近置顶在前——上游 pinnedSessionIds 镜像；缺席 = 空集语义） */
  readonly pinnedSessionIds?: readonly string[]
}

/** 会话行状态（UF-1 行语言·状态点；官方 StateDot 四态的语义名） */
export type SidebarSessionStatus = 'attention' | 'done' | 'running' | 'idle'

/** 面板会话行（视图行——当次快照派生，不落地）。D45：pinned/archived = registry 级
 * 集合成员位（置顶行领先 + 静止位图钉标记；归档行随归档过滤三态进退）。 */
export interface SidebarSessionRow {
  readonly sessionId: string
  readonly title: string
  readonly status: SidebarSessionStatus
  readonly updatedAt: number
  /** 置顶成员位（D45——置顶行项目块内领先 + 24h 折叠让位） */
  readonly pinned: boolean
  /** 归档成员位（D45——默认隐藏；在场时行语言弱化 + 归档钮转取消归档） */
  readonly archived: boolean
  /** 派发循环徽标（S7——活循环族在场；undefined = 零徽标） */
  readonly loop?: SessionLoopBadge
}

/**
 * 派发循环徽标（S7·run-tasks-host-command——SC8 dispatcher 会话可识别）：
 * `forge-dispatch-loop` 投影键的活循环族视图（status ∈ starting/running/stopping）。
 * 徽标只标进行中循环——idle/stopped/failed 历史派发会话零噪声。
 */
export interface SessionLoopBadge {
  readonly status: 'starting' | 'running' | 'stopping'
  /** 任务源标识（无参问询路径 = null——日志不可知零猜测） */
  readonly slug: string | null
}

/** 投影键（plugin-forge FORGE_DISPATCH_LOOP_PROJECTION_KEY 字面量同源镜像——跨包字面量 pin） */
const FORGE_DISPATCH_LOOP_KEY = 'forge-dispatch-loop'

/** 徽标状态词表（活循环族——宿主 ForgeDispatchLoopStatus 折叠词汇的进行中子集） */
const LOOP_BADGE_STATUSES: ReadonlySet<string> = new Set(['starting', 'running', 'stopping'])

/**
 * 会话行派发循环徽标派生（纯函数——账本行 projectionValues 窄读）：
 * 键缺席/非活循环状态/形状漂移 = undefined（零徽标——capability absence 与防御读同口径）。
 */
export function sessionLoopBadge(row: LedgerSessionRow): SessionLoopBadge | undefined {
  const values = row.projectionValues
  if (typeof values !== 'object' || values === null) return undefined
  const raw = values[FORGE_DISPATCH_LOOP_KEY]
  if (typeof raw !== 'object' || raw === null) return undefined
  const candidate = raw as { readonly status?: unknown; readonly sourceSlug?: unknown }
  if (typeof candidate.status !== 'string' || !LOOP_BADGE_STATUSES.has(candidate.status)) return undefined
  const slug =
    typeof candidate.sourceSlug === 'string' && candidate.sourceSlug !== '' ? candidate.sourceSlug : null
  return { status: candidate.status as SessionLoopBadge['status'], slug }
}

/**
 * 循环状态词（用户视角三态——1.8 文字徽标词表沿袭；R2 徽标退役后词不消失，
 * 退至 aria/hover 语义层）。
 */
export function sessionLoopStatusLabel(status: SessionLoopBadge['status']): string {
  return status === 'starting' ? '启动中' : status === 'stopping' ? '停止中' : '派发循环中'
}

/**
 * 循环行语义层 aria（R2·决策 #30——扫视层归图形[左缘流光]，语义层归文字）：
 * 「任务源 slug + 状态词」；无参问询路径（slug null）回退「派发循环 + 状态词」
 * （日志不可知零猜测）。D30 零原生 title 纪律延续——aria 承载、hover 同文本。
 */
export function sessionLoopAriaLabel(loop: SessionLoopBadge): string {
  const word = sessionLoopStatusLabel(loop.status)
  return loop.slug === null ? `派发循环${word}` : `任务源 ${loop.slug} · 状态 ${word}`
}

/** 面板项目节点（项目 = forge projects 行；会话 = 该项目 workspace 名下账本行） */
export interface SidebarProjectNode {
  readonly projectId: string
  /** dsh workspace id（新会话钮 → 官方 startSession(workspaceId) 的寻址面，fix-42） */
  readonly workspaceId: string
  readonly name: string
  /** canonical 路径（ProjectSummary.wsPath 直投影——M3.1 D3：仅名称行 + 路径转 title 悬停提示） */
  readonly wsPath: string
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
 * 每项目会话 = 其 workspaceId 的 sessionIds 顺序（workspace 自有排列序）∩ 账本 byId，
 * D45：置顶行（registry 级 pinned 集）领先置前（置顶集序 = 最近置顶在前，官方
 * 「pin leads its accounts' saved orders」语义的确定性本地重排——宿主 pin 落位与本地
 * 重排恒一致，双保险零冲突），其余行保持 workspace 排列序；行随附 pinned/archived
 * 成员位（归档过滤/行语言消费）。
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
  const pinnedOrder = new Map<string, number>()
  input.workspaces.pinnedSessionIds?.forEach((id, index) => pinnedOrder.set(id, index))
  const archivedIds = new Set(input.workspaces.archivedSessionIds ?? [])
  const tree: SidebarProjectNode[] = []
  for (const project of input.projects) {
    const memberIds = rowsByWorkspace.get(project.workspaceId) ?? []
    const rows: SidebarSessionRow[] = []
    for (const sessionId of memberIds) {
      const row = input.sessions.byId[sessionId]
      if (row === undefined) continue
      if (!sessionVisible(row, currentSessionId)) continue
      const loop = sessionLoopBadge(row) // S7——活循环徽标随行（undefined = 零徽标）
      rows.push({
        sessionId: row.id,
        title: row.displayTitle,
        status: sessionStatus(row),
        updatedAt: row.updatedAt,
        pinned: pinnedOrder.has(sessionId),
        archived: archivedIds.has(sessionId),
        ...(loop !== undefined ? { loop } : {}),
      })
    }
    // D45 置顶领先（稳定排序——置顶行间 = 置顶集序，非置顶行间 = workspace 排列序保持）
    if (pinnedOrder.size > 0) {
      rows.sort((a, b) => {
        const pa = pinnedOrder.get(a.sessionId)
        const pb = pinnedOrder.get(b.sessionId)
        if (pa === undefined) return pb === undefined ? 0 : 1
        if (pb === undefined) return -1
        return pa - pb
      })
    }
    tree.push({
      projectId: project.id,
      workspaceId: project.workspaceId,
      name: project.name,
      wsPath: project.wsPath,
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
 * 归档过滤三态（D45 扩面：项目域 + 会话域双口径——会话归档集已入账本镜像窄面）：
 * default = 全显（归档行弱化，现行行为）/ hide = 不含归档（项目与归档会话行俱滤除——
 * D41-① 缺省）/ only = 仅归档（仅归档项目 + 项目内仅归档会话行）。
 */
export type SidebarArchivedFilter = 'default' | 'hide' | 'only'

/** 侧栏视图态（纯视图微观态——同 collapsedIds 口径，不属 SC2 副本纪律；P1 不持久化） */
export interface SidebarView {
  readonly groupBy: SidebarGroupBy
  readonly archivedFilter: SidebarArchivedFilter
}

/** 缺省视图（D41-①：按项目树 + 归档默认隐藏——2026-10-10 用户裁决；三态菜单可切回 default/only） */
export const SIDEBAR_VIEW_DEFAULT: SidebarView = { groupBy: 'tree', archivedFilter: 'hide' }

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
 * hide = 滤除归档项目 + 各项目内滤除归档会话行（D45 扩面）；only = 仅归档项目 + 项目内
 * 仅归档会话行。全保留快径原引用返回（零派生——sidebarFilterOf 全命中同款）。
 */
export function sidebarArchivedFilterOf(
  filter: SidebarArchivedFilter,
  tree: readonly SidebarProjectNode[],
): readonly SidebarProjectNode[] {
  if (filter === 'default') return tree
  const wantArchived = filter === 'only'
  const visible: SidebarProjectNode[] = []
  for (const node of tree) {
    if (node.archived !== wantArchived) continue
    const sessions = node.sessions.filter((row) => row.archived === wantArchived)
    if (sessions.length === node.sessions.length) visible.push(node)
    else visible.push({ ...node, sessions })
  }
  return visible
}

// ── 会话默认可见性（D41-②：24h 窗口——2026-10-10 用户裁决「默认展示最近 24 小时的
//    会话，其它会话折叠起来」。窗口内默认可见、窗口外折叠进「更早（N）」可展开组；
//    展开态 = 本地微观态不持久化（fix-42 P1 口径沿袭）；搜索在场折叠让位（命中行全展示）；
//    flat（用户显式全量视图）/ rail（恒项目口径）投影不消费本切分。
//    D45 补充：置顶行永不折叠（置顶 = 用户显式「保持可见」语义——窗口外照常 recent，
//    官方 pinned leads 语义一致）。）
//    2026-10-12 用户裁决（两步收敛）：非置顶会话默认可见 = 恰好 10 个（下限 + 封顶）——
//    24h 窗口内非置顶行优先；不足 10 时按 updatedAt 降序补最近的窗口外行；超过 10 时
//    取最近的 10 个（窗口规则让位封顶）。置顶行恒全量可见（D45——置顶 = 保持可见，
//    不占 10 个名额、不计入上限）。展示序 = 输入序（置顶领先 + workspace 序，不重排）。 ──

/** 会话默认可见窗口（24h——D41-② 裁决口径；now 基准 = 渲染时钟，relativeTimeLabel 同源） */
export const SIDEBAR_SESSION_WINDOW_MS = 24 * 3_600_000

/** 每项目非置顶默认可见数（2026-10-12 裁决：恰好 10——下限补足 + 上限封顶双口径） */
export const SIDEBAR_SESSION_MIN_VISIBLE = 10

/** 24h 窗口切分（项目块内会话两组：recent = 窗口内默认可见行 / older = 窗口外折叠组行） */
export interface SidebarSessionSplit {
  readonly recent: readonly SidebarSessionRow[]
  readonly older: readonly SidebarSessionRow[]
}

/**
 * 会话切分（纯函数，D41-② + D45 + 2026-10-12 收敛）：置顶行（pinned）恒 recent（不占
 * 名额）；非置顶可见 = 24h 窗口内行优先、按 updatedAt 降序补最近的窗口外行、封顶取
 * 最近的 SIDEBAR_SESSION_MIN_VISIBLE 个——「更早（N）」的 N = 其余行数。展示序 =
 * 输入序（keep 集过滤，不重排）；全 recent 快径原引用返回（零派生——sidebarFilterOf
 * 全命中同款）。
 */
export function sidebarSessionVisibility(
  sessions: readonly SidebarSessionRow[],
  now: number,
): SidebarSessionSplit {
  const boundary = now - SIDEBAR_SESSION_WINDOW_MS
  const inWindow = (row: SidebarSessionRow): boolean => row.updatedAt >= boundary
  // 非置顶两池：窗口内优先池 + 窗口外补足池（各按 updatedAt 降序取近）
  const inWindowRows: SidebarSessionRow[] = []
  const outRows: SidebarSessionRow[] = []
  for (const row of sessions) {
    if (row.pinned) continue
    ;(inWindow(row) ? inWindowRows : outRows).push(row)
  }
  inWindowRows.sort((a, b) => b.updatedAt - a.updatedAt)
  outRows.sort((a, b) => b.updatedAt - a.updatedAt)
  const keep = new Set<SidebarSessionRow>([
    ...inWindowRows.slice(0, SIDEBAR_SESSION_MIN_VISIBLE),
    ...outRows.slice(0, Math.max(0, SIDEBAR_SESSION_MIN_VISIBLE - inWindowRows.length)),
  ])
  for (const row of sessions) {
    if (row.pinned) keep.add(row)
  }
  const recent: SidebarSessionRow[] = []
  const older: SidebarSessionRow[] = []
  for (const row of sessions) {
    ;(keep.has(row) ? recent : older).push(row)
  }
  if (older.length === 0) return { recent: sessions, older: [] }
  return { recent, older }
}

/** 平铺视图行（flat 排列——跨项目全会话行；projectName 随行 = 过滤命中面 + 归属可辨；
 * D45：pinned/archived 随行——平铺行与会话行同语言（行尾三钮/归档弱化消费）） */
export interface SidebarFlatRow {
  readonly projectId: string
  readonly projectName: string
  readonly sessionId: string
  readonly title: string
  readonly status: SidebarSessionStatus
  readonly updatedAt: number
  /** 置顶成员位（D45——平铺行行尾动作组消费） */
  readonly pinned: boolean
  /** 归档成员位（D45——平铺行行尾动作组消费） */
  readonly archived: boolean
  /** 派发循环徽标（S7——随行携带，树/平铺两视图徽标一致） */
  readonly loop?: SessionLoopBadge
}

/**
 * 平铺投影（纯函数）：全会话行跨项目摊平，按 updatedAt 降序（官方 FlatList updated 序
 * 同型；稳定排序保时序平手时的工作区序）；置顶行领先（D45——跨项目置前；置顶行间序 =
 * 树迭代序[项目序 × 工作区序]——registry 置顶时序不进树，P1 逼近面）。不落地副本——
 * 行字段自树节点当次派生。
 */
export function sidebarFlatRowsOf(tree: readonly SidebarProjectNode[]): readonly SidebarFlatRow[] {
  const rows: SidebarFlatRow[] = []
  const pinnedOrder = new Map<string, number>()
  for (const node of tree) {
    for (const session of node.sessions) {
      rows.push({
        projectId: node.projectId,
        projectName: node.name,
        title: session.title,
        sessionId: session.sessionId,
        status: session.status,
        updatedAt: session.updatedAt,
        pinned: session.pinned,
        archived: session.archived,
        ...(session.loop !== undefined ? { loop: session.loop } : {}),
      })
      if (session.pinned && !pinnedOrder.has(session.sessionId)) {
        pinnedOrder.set(session.sessionId, pinnedOrder.size)
      }
    }
  }
  return rows.sort((a, b) => {
    const pa = pinnedOrder.get(a.sessionId)
    const pb = pinnedOrder.get(b.sessionId)
    if (pa === undefined) return pb === undefined ? b.updatedAt - a.updatedAt : 1
    if (pb === undefined) return -1
    return pa - pb
  })
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
