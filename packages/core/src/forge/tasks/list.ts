// listTasks/taskStats/taskGraph——任务域读面列表族（任务 2.6；tech-design §Interface 1 读面
// 五法之列表族 + TaskCard 副行承重字段表逐项）。定位：业务（forge/tasks 子域）——只读
// prepared statements，零事务零事件（读面直读 Hard Rule：即时判据 = 单次重取见新值——
// 禁 watch/回流/快照同步，lint-imports 扫描器机械兜底）。
//
// TaskCard 副行水化四件（Interface 1 承重字段表）：
//   · actualDurationMs（仅 completed——core 水化「首 claim → 末 submit 时差」；记录缺时间/
//     时差 ≤0 不显示——XhYm 格式化归 UI）；
//   · prerequisites（自然键 + 当前状态——TaskPrerequisiteSummary）；
//   · sessionCount（links ∪ records 双源去重会话数）；
//   · sourceTask（fix 链源自然键——fix 源标）。
//
// search = 服务端 core 过滤（中英双语——标题/自然键/复合键/类型/状态标签常量匹配；IME 安全
// = 前端仅更新内容区，归 3.5）。sort：active = 活跃度权重序（PRD「in_progress→blocked→
// pending→…→completed」——'…' 展开 = suspended→skipped→rejected，非终态尽前、completed
// 殿后）/ created = created_at 降序；组内同决（created 降序 + id 升序恒稳定决胜）。
//
// 四域互禁 import 彼此（Hard Rule）——small-domains/list-utils 不外溢，search 匹配与排序
// 域内单份同口径落位（行为 pin 于本域测试）。EQP 锚三枚（SC2 数据面——list.test 断言）：
// SQL_TASKS_BY_FEATURE（→ idx_tasks_feature_status）/ RECORDS_BY_TASK_SQL（query.ts →
// idx_records_task）/ LINKS_BY_SESSION_SQL（session-links.ts → idx_tsl_session）。
import type Database from 'better-sqlite3'
import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TASK_TYPE_LABELS,
  type ContainerRef,
  type ListTasksQuery,
  type TaskCard,
  type TaskGraph,
  type TaskGraphEdge,
  type TaskGraphQuery,
  type TaskPrerequisiteSummary,
  type TaskRef,
  type TaskStats,
  type TaskStatsQuery,
  type TaskStatus,
} from '@dsh-forge/contracts'
import type { ForgeWorkspaceStore } from '../workspace/store.js'
import { TASK_COLUMNS, type TaskStorageRow } from './query.js'

/** 读面装配依赖（service.ts 装配面结构传入——与 query.ts TasksQueryDeps 同形） */
export interface TasksListDeps {
  /** 每工作区任务库惰性句柄（projectId → ensureOpen） */
  readonly store: ForgeWorkspaceStore
}

/** EQP 锚 ①：feature 作用域任务扫描（taskGraph.tasks 恒用；listTasks featureSlug 给定同基形） */
export const SQL_TASKS_BY_FEATURE = `SELECT ${TASK_COLUMNS} FROM tasks WHERE feature_id = ?`

/**
 * active 排序活跃度权重（PRD 流程二「in_progress → blocked → pending → … → completed」——
 * '…' 展开 = suspended → skipped → rejected：活跃态尽前（处理中/受阻/待办/挂起），弃置态
 * 居中，completed 殿后（最不活跃））。
 */
export const ACTIVE_STATUS_WEIGHT: Readonly<Record<TaskStatus, number>> = {
  in_progress: 0,
  blocked: 1,
  pending: 2,
  suspended: 3,
  skipped: 4,
  rejected: 5,
  completed: 6,
}

/** featureSlug → featureId 解析（未命中 = undefined → 读面空结果，零 404）。
 *  M3 容器垫片：feature 容器按 slug 解析（M2 语义等价）；proposal 容器 = M2 schema 下
 *  无直挂任务行 → 恒空结果（零 404 读面口径不变），source 双列随 1.2/2.5 泛化。 */
function resolveFeatureId(db: Database.Database, featureSlug: string): string | undefined {
  return db.prepare<unknown[], { id: string }>(`SELECT id FROM features WHERE slug = ?`).get(featureSlug)?.id
}

/** 容器引用 → feature 限定 id（proposal 容器 → undefined → 读面空结果；读面零 404 垫片） */
function resolveContainerFeatureId(db: Database.Database, source: ContainerRef | undefined): string | undefined {
  if (source === undefined) return undefined
  return source.kind === 'feature' ? resolveFeatureId(db, source.slug) : undefined
}

/** 行读取（source/statusFilter 动态 WHERE——一切占位参数化，prepared statements Hard Rule） */
function readTaskRows(db: Database.Database, q: ListTasksQuery): TaskStorageRow[] {
  const clauses: string[] = []
  const params: unknown[] = []
  if (q.source !== undefined) {
    const featureId = resolveContainerFeatureId(db, q.source)
    if (featureId === undefined) return []
    clauses.push('feature_id = ?')
    params.push(featureId)
  }
  if (q.statusFilter !== undefined && q.statusFilter.length > 0) {
    clauses.push(`task_status IN (${q.statusFilter.map(() => '?').join(', ')})`)
    params.push(...q.statusFilter)
  }
  const where = clauses.length === 0 ? '' : ` WHERE ${clauses.join(' AND ')}`
  return db.prepare<unknown[], TaskStorageRow>(`SELECT ${TASK_COLUMNS} FROM tasks${where}`).all(...params)
}

/** search 匹配键集（标题/自然键/复合键 + 类型/状态中英标签——标签常量 = contracts 单源） */
export function taskSearchKeys(card: {
  slug: string
  localId: string
  title: string
  taskType: TaskCard['taskType']
  taskStatus: TaskStatus
}): readonly string[] {
  return [
    card.title,
    card.slug,
    card.localId,
    `${card.slug}/${card.localId}`,
    TASK_TYPE_LABELS[card.taskType].zh,
    TASK_TYPE_LABELS[card.taskType].en,
    TASK_STATUS_LABELS[card.taskStatus].zh,
    TASK_STATUS_LABELS[card.taskStatus].en,
  ]
}

/** search 过滤（大小写不敏感子串；空/纯空白 = 全量放行——small-domains matchesSearch 同口径域内单份） */
function matchesTaskSearch(search: string | undefined, card: Parameters<typeof taskSearchKeys>[0]): boolean {
  const needle = (search ?? '').trim().toLowerCase()
  if (needle === '') return true
  return taskSearchKeys(card).some((h) => h.toLowerCase().includes(needle))
}

/** 行排序（active 活跃度权重 | created 创建降序；组内 created 降序 + id 升序决胜——恒稳定） */
function sortTaskRows(rows: readonly TaskStorageRow[], sort: 'active' | 'created'): TaskStorageRow[] {
  const byCreatedDesc = (a: TaskStorageRow, b: TaskStorageRow): number => {
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  }
  const copy = [...rows]
  if (sort === 'created') return copy.sort(byCreatedDesc)
  return copy.sort((a, b) => {
    const wa = ACTIVE_STATUS_WEIGHT[a.task_status]
    const wb = ACTIVE_STATUS_WEIGHT[b.task_status]
    if (wa !== wb) return wa - wb
    return byCreatedDesc(a, b)
  })
}

/** 首 claim → 末 submit 时差（毫秒；记录缺时间/时差 ≤0/非有限 → undefined 不显示） */
function durationMs(firstClaim: string | null, lastSubmit: string | null): number | undefined {
  if (firstClaim === null || lastSubmit === null) return undefined
  const ms = new Date(lastSubmit).getTime() - new Date(firstClaim).getTime()
  return Number.isFinite(ms) && ms > 0 ? ms : undefined
}

/**
 * TaskCard 副行水化（单源单份——listTasks/taskGraph/taskDetail 三面共用；行序保持）。
 * 聚合读（全表 GROUP BY，SC2 @500 直读预算内——无 IN 动态表）：
 *   耗时（claim/submit 聚合 → 仅 completed 附着）/ 前置摘要 / 挂接计数（双源 UNION 去重）/
 *   fix 源自然键（source_task_id → TaskRef）。
 */
export function hydrateTaskCards(db: Database.Database, rows: readonly TaskStorageRow[]): TaskCard[] {
  const durations = new Map<string, number>()
  for (const r of db
    .prepare<unknown[], { task_id: string; first_claim: string | null; last_submit: string | null }>(
      `SELECT task_id,
         MIN(CASE WHEN verb = 'claim' THEN created_at END) AS first_claim,
         MAX(CASE WHEN verb = 'submit' THEN created_at END) AS last_submit
       FROM task_records WHERE verb IN ('claim', 'submit') GROUP BY task_id`,
    )
    .all()) {
    const ms = durationMs(r.first_claim, r.last_submit)
    if (ms !== undefined) durations.set(r.task_id, ms)
  }

  const prerequisites = new Map<string, TaskPrerequisiteSummary[]>()
  for (const r of db
    .prepare<unknown[], { task_id: string; slug: string; local_id: string; task_status: TaskStatus }>(
      `SELECT e.task_id AS task_id, t.slug AS slug, t.local_id AS local_id, t.task_status AS task_status
       FROM task_edges e JOIN tasks t ON t.id = e.prerequisite_id
       ORDER BY e.task_id, t.slug, t.local_id`,
    )
    .all()) {
    const list = prerequisites.get(r.task_id)
    if (list === undefined) prerequisites.set(r.task_id, [{ slug: r.slug, localId: r.local_id, taskStatus: r.task_status }])
    else list.push({ slug: r.slug, localId: r.local_id, taskStatus: r.task_status })
  }

  const sessionCounts = new Map(
    db
      .prepare<unknown[], { task_id: string; n: number }>(
        `SELECT task_id, COUNT(*) AS n FROM (
           SELECT task_id, session_id FROM task_session_links
           UNION
           SELECT task_id, session_id FROM task_records WHERE session_id IS NOT NULL
         ) GROUP BY task_id`,
      )
      .all()
      .map((r) => [r.task_id, r.n] as const),
  )

  const sourceRefs = new Map<string, TaskRef>()
  const sourceIds = [...new Set(rows.map((r) => r.source_task_id).filter((id): id is string => id !== null))]
  if (sourceIds.length > 0) {
    const placeholders = sourceIds.map(() => '?').join(', ')
    for (const r of db
      .prepare<unknown[], { id: string; slug: string; local_id: string }>(
        `SELECT id, slug, local_id FROM tasks WHERE id IN (${placeholders})`,
      )
      .all(...sourceIds)) {
      sourceRefs.set(r.id, { slug: r.slug, localId: r.local_id })
    }
  }

  return rows.map((row) => ({
    taskId: row.id,
    slug: row.slug,
    localId: row.local_id,
    title: row.title,
    taskType: row.task_type,
    taskStatus: row.task_status,
    priority: (row.priority as TaskCard['priority']) ?? undefined,
    estimatedTime: row.estimated_time ?? undefined,
    actualDurationMs: row.task_status === 'completed' ? durations.get(row.id) : undefined,
    prerequisites: prerequisites.get(row.id) ?? [],
    sessionCount: sessionCounts.get(row.id) ?? 0,
    sourceTask: row.source_task_id !== null ? sourceRefs.get(row.source_task_id) : undefined,
  }))
}

/** Interface 1 listTasks：search 中英过滤 + sort + TaskCard 副行水化 */
export async function listTasks(deps: TasksListDeps, q: ListTasksQuery): Promise<TaskCard[]> {
  const db = deps.store.ensureOpen(q.projectId)
  const rows = readTaskRows(db, q)
  const matched =
    q.search === undefined
      ? rows
      : rows.filter((r) =>
          matchesTaskSearch(q.search, {
            slug: r.slug,
            localId: r.local_id,
            title: r.title,
            taskType: r.task_type,
            taskStatus: r.task_status,
          }),
        )
  return hydrateTaskCards(db, sortTaskRows(matched, q.sort ?? 'active'))
}

/** Interface 1 taskStats：total + 七态分布 + unmetPending（零计数态含 0 键——chips 禁用+淡化数据源） */
export async function taskStats(deps: TasksListDeps, q: TaskStatsQuery): Promise<TaskStats> {
  const db = deps.store.ensureOpen(q.projectId)
  const byStatus = Object.fromEntries(TASK_STATUSES.map((s) => [s, 0])) as Record<TaskStatus, number>
  let featureId: string | undefined
  if (q.source !== undefined) {
    featureId = resolveContainerFeatureId(db, q.source)
    if (featureId === undefined) return { total: 0, byStatus, unmetPending: 0 }
  }
  const rows = db
    .prepare<unknown[], { task_status: TaskStatus; n: number }>(
      featureId === undefined
        ? `SELECT task_status AS task_status, COUNT(*) AS n FROM tasks GROUP BY task_status`
        : `SELECT task_status AS task_status, COUNT(*) AS n FROM tasks WHERE feature_id = ? GROUP BY task_status`,
    )
    .all(...(featureId === undefined ? [] : [featureId]))
  let total = 0
  for (const r of rows) {
    if (r.task_status in byStatus) byStatus[r.task_status] = r.n
    total += r.n
  }
  // M3 池快照派生（Interface 1：pending ∧ 前置未全 ∈ {completed, skipped} 计数——单查询派生；
  // dispatchTask 池快照数据源，与 byStatus 同 scope 口径）
  const unmetPending = countUnmetPending(db, featureId)
  return { total, byStatus, unmetPending }
}

/** unmetPending 计数（pending 且存在未终态前置——EXISTS 半连接单查询；scope 可选） */
function countUnmetPending(db: Database.Database, featureId: string | undefined): number {
  const scope = featureId === undefined ? '' : ' AND t.feature_id = ?'
  const args = featureId === undefined ? [] : [featureId]
  const row = db
    .prepare<unknown[], { n: number }>(
      `SELECT COUNT(*) AS n FROM tasks t
       WHERE t.task_status = 'pending'${scope}
         AND EXISTS (
           SELECT 1 FROM task_edges e JOIN tasks p ON p.id = e.prerequisite_id
           WHERE e.task_id = t.id AND p.task_status NOT IN ('completed', 'skipped')
         )`,
    )
    .get(...args)
  return row?.n ?? 0
}

/** Interface 1 taskGraph：容器子图（TaskCard 全量水化 + 边三元组——DAG/泳道渲染源）。
 *  M3 容器垫片：feature 容器按 slug 解析；proposal 容器 → 空图（M2 无直挂行）。 */
export async function taskGraph(deps: TasksListDeps, q: TaskGraphQuery): Promise<TaskGraph> {
  const db = deps.store.ensureOpen(q.projectId)
  if (q.source.kind !== 'feature') return { tasks: [], edges: [] }
  const featureId = resolveFeatureId(db, q.source.slug)
  if (featureId === undefined) return { tasks: [], edges: [] }
  const rows = db.prepare<unknown[], TaskStorageRow>(SQL_TASKS_BY_FEATURE).all(featureId)
  const tasks = hydrateTaskCards(db, sortTaskRows(rows, 'created')) // created 降序——渲染稳定序
  const edges = db
    .prepare<unknown[], TaskGraphEdge>(
      `SELECT e.task_id AS taskId, e.prerequisite_id AS prerequisiteId, e.origin AS origin
       FROM task_edges e JOIN tasks t ON t.id = e.task_id
       WHERE t.feature_id = ? ORDER BY e.task_id, e.prerequisite_id`,
    )
    .all(featureId)
  return { tasks, edges }
}
