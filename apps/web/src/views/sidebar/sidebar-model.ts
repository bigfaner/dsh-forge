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
import { relativeTime } from '@deepseek-ai/dsh-client-ui-primitives'

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

/** 相对时间标签（桶化 = 官方 relativeTime；文案 zh——P1 单语，多语归 M 系列主题化） */
export function relativeTimeLabel(updatedAt: number, now: number): string {
  const bucket = relativeTime(updatedAt, now)
  switch (bucket.unit) {
    case 'now':
      return '刚刚'
    case 'minutes':
      return `${bucket.n} 分钟前`
    case 'hours':
      return `${bucket.n} 小时前`
    case 'days':
      return `${bucket.n} 天前`
    case 'months':
      return `${bucket.n} 个月前`
    case 'years':
      return `${bucket.n} 年前`
    default: {
      const exhaustive: never = bucket.unit
      throw new Error(`dsh-forge web: 未知相对时间桶：${String(exhaustive)}`)
    }
  }
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
