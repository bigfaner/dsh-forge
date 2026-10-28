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
import { normalizeFsPath } from '@dsh-forge/path-key'
import { timeLabelZh } from '../../components/index.js'

/** 快照源窄形状（dsh ObservableSnapshot 结构同型；React useSyncExternalStore 直连） */
export interface SnapshotSource<T> {
  getSnapshot(): T
  subscribe(fn: () => void): () => void
}

/** dsh 会话账本行窄形状（上游 SessionSummary 消费切片） */
export interface LedgerSessionRow {
  readonly id: string
  /**
   * 持久标题（上游 SessionSummary 行缺席 = 未命名）。行标题只消费它（trim 后空/缺席
   * = 「未命名」；blank = 「新会话」——官方 ui-workspace sessionTitle 口径），不消费
   * displayTitle 的目录名/id 兜底（bug 3d26a1be）。
   */
  readonly title?: string
  /** 上游 display 投影（持久标题 → 目录名 → id 三级兜底）——目录名兜底不进侧栏行标签 */
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
   * 会话代际保留计数切片（官方 SessionSummary 自带——当前会话判读锚，bug 51e94b84）：
   * mainView > 0 = 主视图在留（ui-session publishMain 同径）。
   */
  readonly retainedBy?: { readonly mainView?: number }
  /**
   * 宿主投影整值（上游账本行 projectionValues 消费切片——session.list 逐行 hints 块
   * 经 ProjectionValueStore 落值；S7 派发循环徽标窄读键 = 'forge-dispatch-events'（§2.4 判据换源——旧 'forge-dispatch-loop' 指令折叠投影已退役）。
   * 键缺席 = 能力缺席（上游既定语义），形状漂移 = 徽标不渲染（sessionLoopBadge 防御读）。
   */
  readonly projectionValues?: Readonly<Record<string, unknown>>
}

/** dsh 会话账本快照窄形状（上游 SessionListState 消费切片） */
export interface LedgerSessionsSnapshot {
  /** Host 列表序（面包屑专用行已被上游排除） */
  readonly ids: readonly string[]
  readonly byId: Readonly<Record<string, LedgerSessionRow>>
  /** 'pending' = 账本尚未就绪（行级骨架相位） */
  readonly phase: 'pending' | 'ready'
}

/** dsh workspace 行窄形状（会话归属 = workspace.sessionIds，上游 WorkspaceView 消费切片；
 *  path = 官方快照字段（client-ui-workspace 消费实证）——树工作区入项目分组的归并键） */
export interface LedgerWorkspaceRow {
  readonly workspaceId: string
  readonly sessionIds: readonly string[]
  readonly path?: string
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
  /** 行显示标签：blank → 「新会话」/ 持久标题（trim）/ 缺席 → 「未命名」——官方行口径（bug 3d26a1be） */
  readonly title: string
  /** 已保存持久标题（trim 后；无 = ''）——改名草稿种子官方同判（无标题留空） */
  readonly savedTitle: string
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
 * 循环状态三态（提案 loop-consol-flywheel-improvement §2.4 派生词汇——
 * running 蓝流光 / suspended 琥珀静态缘 / terminal 持续保留[D2 裁决：终态标识一直
 * 不消失，供用户查找执行过任务循环的会话]）。
 */
export type ForgeLoopPhase = 'running' | 'suspended' | 'terminal'

/**
 * 派发循环徽标（S7 起源；§2.4 判据换源——`forge-dispatch-events` 投影窄读派生三态，
 * 替代断供的 `forge-dispatch-loop` 指令折叠投影[3b 改造后循环正门改为 dispatchTask
 * 工具，指令事件断供 → 旧投影恒 idle]）。slug = 判定事件载荷的 sourceSlug
 * （多容器并行归属锚）。
 */
export interface SessionLoopBadge {
  readonly status: ForgeLoopPhase
  /** 任务源标识（载荷守卫不容空串——null 仅防御兜底） */
  readonly slug: string | null
}

/**
 * 投影键（plugin-forge SESSION_PROJECTION_KEYS.dispatchEvents 字面量同源镜像——
 * 跨包字面量 pin，与旧 FORGE_DISPATCH_LOOP_KEY 镜像纪律同款）。
 */
const FORGE_DISPATCH_EVENTS_KEY = 'forge-dispatch-events'

/**
 * 场景码单源镜像（plugin-forge FORGE_PROGRESS_SCENARIOS 24 值字面量 pin——
 * apps/web 零 plugin-forge 运行期 import 纪律；值漂移由映射表全键覆盖类型兜住）。
 */
const FORGE_PROGRESS_SCENARIOS_MIRROR = [
  'startup/from-scratch',
  'startup/resume-stopped',
  'startup/resume-inflight',
  'claim/new',
  'claim/spawned',
  'claim/interrupted',
  'task/complete',
  'blocked/with-fix',
  'blocked/auto-fixed',
  'blocked/split',
  'blocked/wait-external',
  'blocked/ask-user',
  'retry/spawn-failed',
  'retry/worker-aborted',
  'loop/halt',
  'loop/blocked-pool',
  'loop/timeout',
  'loop/finish-all',
  'loop/stopped',
  'suspend/spawn-rate-limited',
  'suspend/worker-rate-limited',
  'suspend/abort-over-limit',
  'suspend/landing-rejected',
  'pool/pending',
] as const

/** 场景码值域类型（= 单源镜像成员并集） */
type ProgressScenarioMirror = (typeof FORGE_PROGRESS_SCENARIOS_MIRROR)[number]

/**
 * 「场景码 → 三态」映射表（提案 §2.4——FORGE_PROGRESS_SCENARIOS 单源 24 值逐场景落档，
 * 全键覆盖由 Record 类型强制；实现于侧栏状态判定 loopPhaseOfEntry）：
 *   - 终态族（terminal）：loop/finish-all / loop/halt / loop/timeout / loop/stopped——
 *     循环收口四径（无 "settled"）；标识持续保留（D2）。
 *   - suspend 族（suspended）：suspend/spawn-rate-limited / suspend/worker-rate-limited /
 *     suspend/abort-over-limit / suspend/landing-rejected——逐场景断言：四径载荷均携
 *     taskKey（driver.ts suspendWithWakeup progressTaskKey）= 非 loop 级事件，但
 *     emit 后驱动器即挂起退出待处置回流（suspendForVerdict），循环级效果 = 停摆待处置
 *     → 映射挂起态。
 *   - 其余 16 值（startup×3 / claim×3 / task/complete / blocked×5 / retry×2 /
 *     loop/blocked-pool / pool/pending）→ running——循环活跃推进中的常规事件流。
 */
export const FORGE_LOOP_SCENARIO_PHASE: Readonly<Record<ProgressScenarioMirror, ForgeLoopPhase>> = {
  'startup/from-scratch': 'running',
  'startup/resume-stopped': 'running',
  'startup/resume-inflight': 'running',
  'claim/new': 'running',
  'claim/spawned': 'running',
  'claim/interrupted': 'running',
  'task/complete': 'running',
  'blocked/with-fix': 'running',
  'blocked/auto-fixed': 'running',
  'blocked/split': 'running',
  'blocked/wait-external': 'running',
  'blocked/ask-user': 'running',
  'retry/spawn-failed': 'running',
  'retry/worker-aborted': 'running',
  'loop/halt': 'terminal',
  'loop/blocked-pool': 'running',
  'loop/timeout': 'terminal',
  'loop/finish-all': 'terminal',
  'loop/stopped': 'terminal',
  'suspend/spawn-rate-limited': 'suspended',
  'suspend/worker-rate-limited': 'suspended',
  'suspend/abort-over-limit': 'suspended',
  'suspend/landing-rejected': 'suspended',
  'pool/pending': 'running',
}

/**
 * forge/progress 载荷消费切片（plugin-forge ForgeProgressEventData 消费面结构同型镜像
 * ——窄读字段；forge-dispatch-events entries 成员透传该载荷）。
 */
export interface LoopProgressEntry {
  readonly sourceSlug: string
  readonly verb: string
  readonly status: string
  /** 任务键（`slug/localId`——缺席 = loop 级事件；仅注释语义，判定走场景码映射） */
  readonly taskKey?: string
  readonly scenario?: string
  readonly at: number
}

/** forge-dispatch-events wire 值消费切片（{entries 窗口, total 总数}——投影单源） */
export interface LoopEventsProjection {
  readonly entries: readonly LoopProgressEntry[]
  readonly total: number
}

/** 条目守卫（载荷窄读防御——sourceSlug 非空串 + at 有限数；他形条目剔除不猜） */
function isLoopProgressEntry(value: unknown): value is LoopProgressEntry {
  if (typeof value !== 'object' || value === null) return false
  const raw = value as Record<string, unknown>
  return typeof raw['sourceSlug'] === 'string' && typeof raw['verb'] === 'string' && typeof raw['status'] === 'string' && typeof raw['at'] === 'number' && Number.isFinite(raw['at'])
}

/**
 * 单条目 → 循环状态三态（映射表判定单点）：场景码在单源映射表 → 直取；场景码缺席
 * （旧载荷兼容）或未知值 → verb 兜底（halt/timeout/finish-all = 终局动词 → terminal；
 * suspend → suspended；其余 → running）。
 */
export function loopPhaseOfEntry(entry: Pick<LoopProgressEntry, 'scenario' | 'verb'>): ForgeLoopPhase {
  if (entry.scenario !== undefined) {
    const mapped = (FORGE_LOOP_SCENARIO_PHASE as Readonly<Record<string, ForgeLoopPhase>>)[entry.scenario]
    if (mapped !== undefined) return mapped
  }
  if (entry.verb === 'halt' || entry.verb === 'timeout' || entry.verb === 'finish-all') return 'terminal'
  if (entry.verb === 'suspend') return 'suspended'
  return 'running'
}

/**
 * 会话行派发循环徽标派生（纯函数——账本行 projectionValues['forge-dispatch-events']
 * 窄读）：状态 = 最近一枚进度事件的场景码映射；多容器按 sourceSlug 归属（slug 随
 * 判定事件）。窗口（500）空而 total > 0 = 最近 loop 级事件已被挤出——状态推导退化为
 * 「未知」即零徽标，不误报 running（提案 §2.4 兜底口径，与 2.2 实例边界同款）；
 * total = 0 = 从未循环（零徽标）。键缺席/形状漂移 = undefined（capability absence
 * 与防御读同口径）。
 */
export function sessionLoopBadge(row: LedgerSessionRow): SessionLoopBadge | undefined {
  const values = row.projectionValues
  if (typeof values !== 'object' || values === null) return undefined
  const raw = values[FORGE_DISPATCH_EVENTS_KEY]
  if (typeof raw !== 'object' || raw === null) return undefined
  const candidate = raw as { readonly entries?: unknown; readonly total?: unknown }
  if (!Array.isArray(candidate.entries) || typeof candidate.total !== 'number') return undefined
  const entries = candidate.entries.filter(isLoopProgressEntry)
  const latest = entries[entries.length - 1]
  if (latest === undefined) return undefined
  return { status: loopPhaseOfEntry(latest), slug: latest.sourceSlug !== '' ? latest.sourceSlug : null }
}

/**
 * 循环状态词（用户视角三态——扫视层归图形[左缘标记]，语义层退至 aria/hover 文字）。
 */
export function sessionLoopStatusLabel(status: SessionLoopBadge['status']): string {
  return status === 'running' ? '派发循环中' : status === 'suspended' ? '循环挂起' : '循环已结束'
}

/**
 * 循环行语义层 aria（R2·决策 #30——扫视层归图形[左缘标记]，语义层归文字）：
 * 「任务源 slug + 状态词」；无 slug 防御兜底回退状态词。D30 零原生 title 纪律延续——
 * aria 承载、hover 同文本。
 */
export function sessionLoopAriaLabel(loop: SessionLoopBadge): string {
  const word = sessionLoopStatusLabel(loop.status)
  return loop.slug === null ? word : `任务源 ${loop.slug} · 状态 ${word}`
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

/**
 * 行显示标签（bug 3d26a1be——官方 ui-workspace 行 displayTitle 派生同口径）：blank → 「新会话」；
 * 持久标题（trim 后非空）→ 标题；否则「新会话」。不消费上游 displayTitle 的目录名/id
 * 兜底——该投影语义与行标签无关（未命名会话曾因此显示项目目录名，与项目组名重名）。
 * 用户裁决（bug 9eb9d6cb 后续）：空 title 回退词统一「新会话」——title 漂移链收敛为
 * 新会话 → 有意义的名称（「未命名」中间态退役；自动命名到达即替换，savedTitle 恒 ''
 * 不挡自动命名）。
 */
export function sessionRowTitle(row: LedgerSessionRow): string {
  if (row.blank === true) return '新会话'
  const saved = typeof row.title === 'string' ? row.title.trim() : ''
  return saved !== '' ? saved : '新会话'
}

/** 已保存标题（trim；无 = ''）——改名草稿种子（官方：无标题留空，不用显示标签兜底） */
export function sessionSavedTitleOf(row: LedgerSessionRow): string {
  return typeof row.title === 'string' ? row.title.trim() : ''
}

/** buildSidebarTree 输出（tree + 账本相位切片——loading = phase 'pending'） */
export interface SidebarTree {
  readonly tree: readonly SidebarProjectNode[]
  /** 账本未就绪（UF-1 States「会话加载中」→ 行级骨架） */
  readonly loading: boolean
  readonly currentSessionId: string | null
}

/**
 * 当前会话判读（纯函数——bug 51e94b84 修正）：官方 SessionListState 无 current 字段
 * （view selection 在 Controller 之外）；正本 = ui-session publishMain 同径——byId 行
 * `retainedBy.mainView > 0` 即主视图在留。无在留行/形状漂移 = null。
 */
// Root cause: 虚构了快照 current 字段（同 bug 15faa6f0 根因家族）——判读恒 null，
// 空白会话行（含当前正开者）被 sessionVisible 全量隐藏。
export function currentSessionIdOfLedger(sessions: LedgerSessionsSnapshot): string | null {
  for (const row of Object.values(sessions.byId)) {
    const mainView = row.retainedBy?.mainView
    if (typeof row.id === 'string' && typeof mainView === 'number' && mainView > 0) return row.id
  }
  return null
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
  /** 工作区路径（归一键）→ 归属项目 id——host 身份归并单点裁决（forge:worktree/resolve
   *  批量通道，与 hero 编排/必绑拦截同一 resolveProject 基础设施）。客户端零仲裁副本：
   *  只按映射分组渲染；缺席条目（未解析）不入组。 */
  readonly workspaceProject?: ReadonlyMap<string, string>
}): SidebarTree {
  const currentSessionId = currentSessionIdOfLedger(input.sessions)
  const rowsByWorkspace = new Map<string, readonly string[]>()
  for (const workspace of input.workspaces.items) {
    rowsByWorkspace.set(workspace.workspaceId, workspace.sessionIds)
  }
  // 树工作区 → 项目归并（host 裁决映射直读——客户端零仲裁）
  const treeSessionsByProject = new Map<string, readonly string[]>()
  if (input.workspaceProject !== undefined) {
    for (const workspace of input.workspaces.items) {
      if (typeof workspace.path !== 'string' || workspace.path === '') continue
      const projectId = input.workspaceProject.get(normalizeFsPath(workspace.path))
      if (projectId === undefined) continue
      const prev = treeSessionsByProject.get(projectId) ?? []
      treeSessionsByProject.set(projectId, [...prev, ...workspace.sessionIds])
    }
  }
  const pinnedOrder = new Map<string, number>()
  input.workspaces.pinnedSessionIds?.forEach((id, index) => pinnedOrder.set(id, index))
  const archivedIds = new Set(input.workspaces.archivedSessionIds ?? [])
  const tree: SidebarProjectNode[] = []
  for (const project of input.projects) {
    // 成员 = 主工作区会话 ∪ 树工作区会话（主区序在前，树区随快照序；跨源去重保序）
    const seen = new Set<string>()
    const memberIds: string[] = []
    for (const sessionId of rowsByWorkspace.get(project.workspaceId) ?? []) {
      if (seen.has(sessionId)) continue
      seen.add(sessionId)
      memberIds.push(sessionId)
    }
    for (const sessionId of treeSessionsByProject.get(project.id) ?? []) {
      if (seen.has(sessionId)) continue
      seen.add(sessionId)
      memberIds.push(sessionId)
    }
    const rows: SidebarSessionRow[] = []
    for (const sessionId of memberIds) {
      const row = input.sessions.byId[sessionId]
      if (row === undefined) continue
      if (!sessionVisible(row, currentSessionId)) continue
      const loop = sessionLoopBadge(row) // S7——活循环徽标随行（undefined = 零徽标）
      rows.push({
        sessionId: row.id,
        title: sessionRowTitle(row),
        savedTitle: sessionSavedTitleOf(row),
        status: sessionStatus(row),
        updatedAt: row.updatedAt,
        pinned: pinnedOrder.has(sessionId),
        archived: archivedIds.has(sessionId),
        ...(loop !== undefined ? { loop } : {}),
      })
    }
    // 统一更新时间排序（评审裁决：项目组内全部会话——主区/各树不分来源——按 updatedAt
    // 倒序；置顶行仍领先，置顶行间 = 置顶集序）
    rows.sort((a, b) => {
      const pa = pinnedOrder.get(a.sessionId)
      const pb = pinnedOrder.get(b.sessionId)
      if (pa !== undefined || pb !== undefined) {
        if (pa === undefined) return 1
        if (pb === undefined) return -1
        return pa - pb
      }
      return (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
    })
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
  /** 已保存持久标题（改名草稿种子——随树行同源派生，bug 3d26a1be） */
  readonly savedTitle: string
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
        savedTitle: session.savedTitle,
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
