// listTasks/taskStats/taskGraph/taskSettlements——任务域读面列表族（core forge/tasks/list.ts
// 直迁——plugin-task-loop 1.7 内联 + 容器语义 slug 化改造）。
// slug 化改造面：ContainerScope 双列（kind+source_id）→ project_key + slug 双列；TaskCard
// 任务源判别面 source{kind,slug} → containerSlug（run-dag 判别词退役）；taskSettlements
// 读源 = task_settlements（success 结算 commit_hash——settlements 单源化前向兼容）。
// search = 服务端过滤（中英双语）；sort：active 活跃度权重序 / created 创建降序。
import type Database from "@dsh-forge/lib-db";
import { TASK_STATUSES, TASK_STATUS_LABELS, TASK_TYPE_LABELS, type TaskStatus } from "@dsh-forge/contracts";
import { TASK_COLUMNS, type TaskStorageRow } from "./query.js";
import { countGatedPending } from "./phase-gate.js";
import type {
  ContainerRef,
  TaskCard,
  TaskEdgeOrigin,
  TaskPrerequisiteSummary,
  TaskRef,
  TasksVerbDeps,
  TaskType,
} from "./types.js";

/** EQP 锚 ①：容器作用域任务扫描（project_key + slug 双列——idx_task_tasks_container 前缀） */
export const SQL_TASKS_BY_CONTAINER = `SELECT ${TASK_COLUMNS} FROM task_tasks WHERE project_key = ? AND slug = ?`;

/** EQP 锚 ①b：容器作用域八态分布（chips 数据面） */
export const SQL_STATS_BY_CONTAINER = `SELECT task_status AS task_status, COUNT(*) AS n FROM task_tasks
  WHERE project_key = ? AND slug = ? GROUP BY task_status`;

/** active 排序活跃度权重（in_progress → blocked → interrupted → pending → suspended →
 *  skipped → rejected → completed） */
export const ACTIVE_STATUS_WEIGHT: Readonly<Record<TaskStatus, number>> = {
  in_progress: 0,
  blocked: 1,
  interrupted: 2,
  pending: 3,
  suspended: 4,
  skipped: 5,
  rejected: 6,
  completed: 7,
};

/** 行读取（slug/statusFilter 动态 WHERE——一切占位参数化） */
function readTaskRows(db: Database.Database, projectKey: string, q: { slug?: string; statusFilter?: readonly TaskStatus[] }): TaskStorageRow[] {
  const clauses: string[] = ["project_key = ?"];
  const params: unknown[] = [projectKey];
  if (q.slug !== undefined) {
    clauses.push("slug = ?");
    params.push(q.slug);
  }
  if (q.statusFilter !== undefined && q.statusFilter.length > 0) {
    clauses.push(`task_status IN (${q.statusFilter.map(() => "?").join(", ")})`);
    params.push(...q.statusFilter);
  }
  return db.prepare<unknown[], TaskStorageRow>(`SELECT ${TASK_COLUMNS} FROM task_tasks WHERE ${clauses.join(" AND ")}`).all(...params);
}

/** search 匹配键集（标题/自然键/复合键 + 类型/状态中英标签 + 类型/状态原始码——标签与码
 * 均为 contracts 单源；界面副行直出原始类型码，码不可搜即「可见词搜不到」） */
export function taskSearchKeys(card: {
  slug: string;
  localId: string;
  title: string;
  taskType: TaskType;
  taskStatus: TaskStatus;
}): readonly string[] {
  return [
    card.title,
    card.slug,
    card.localId,
    `${card.slug}/${card.localId}`,
    card.taskType,
    card.taskStatus,
    TASK_TYPE_LABELS[card.taskType].zh,
    TASK_TYPE_LABELS[card.taskType].en,
    TASK_STATUS_LABELS[card.taskStatus].zh,
    TASK_STATUS_LABELS[card.taskStatus].en,
  ];
}

/** search 过滤（大小写不敏感子串；空/纯空白 = 全量放行） */
function matchesTaskSearch(search: string | undefined, card: Parameters<typeof taskSearchKeys>[0]): boolean {
  const needle = (search ?? "").trim().toLowerCase();
  if (needle === "") return true;
  return taskSearchKeys(card).some((h) => h.toLowerCase().includes(needle));
}

/** 行排序（active 活跃度权重 | created 创建降序 | interrupted 中断序） */
function sortTaskRows(rows: readonly TaskStorageRow[], sort: "active" | "created" | "interrupted"): TaskStorageRow[] {
  const byCreatedDesc = (a: TaskStorageRow, b: TaskStorageRow): number => {
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
  const copy = [...rows];
  if (sort === "created") return copy.sort(byCreatedDesc);
  if (sort === "interrupted") {
    return copy.sort((a, b) => {
      if (a.updated_at !== b.updated_at) return a.updated_at < b.updated_at ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }
  return copy.sort((a, b) => {
    const wa = ACTIVE_STATUS_WEIGHT[a.task_status];
    const wb = ACTIVE_STATUS_WEIGHT[b.task_status];
    if (wa !== wb) return wa - wb;
    return byCreatedDesc(a, b);
  });
}

/** 首 claim → 末 submit 时差（毫秒；记录缺时间/时差 ≤0/非有限 → undefined） */
function durationMs(firstClaim: string | null, lastSubmit: string | null): number | undefined {
  if (firstClaim === null || lastSubmit === null) return undefined;
  const ms = new Date(lastSubmit).getTime() - new Date(firstClaim).getTime();
  return Number.isFinite(ms) && ms > 0 ? ms : undefined;
}

/**
 * TaskCard 副行水化（单源单份——listTasks/taskGraph/taskDetail 三面共用；行序保持）。
 * 聚合读（全表 GROUP BY）：耗时（claim/submit 聚合 → 仅 completed）/ 前置摘要 / 挂接计数
 * （双源 UNION 去重）/ fix 源自然键（fix_of_task_id → TaskRef）。
 *
 * 可选字段缺省 = 键缺席而非键在场值 undefined（toTaskSnapshot 同口径）：list_tasks tool 把
 * TaskCard 原样作为输出值返回，dsh harness 输出边界对显式 undefined 属性值判
 * 「value is not lossless JSON」拒绝整个工具结果。
 */
export function hydrateTaskCards(db: Database.Database, rows: readonly TaskStorageRow[]): TaskCard[] {
  const durations = new Map<string, number>();
  for (const r of db
    .prepare<unknown[], { task_id: string; first_claim: string | null; last_submit: string | null }>(
      `SELECT task_id,
         MIN(CASE WHEN verb = 'claim' THEN created_at END) AS first_claim,
         MAX(CASE WHEN verb = 'submit' THEN created_at END) AS last_submit
       FROM task_records WHERE verb IN ('claim', 'submit') GROUP BY task_id`,
    )
    .all()) {
    const ms = durationMs(r.first_claim, r.last_submit);
    if (ms !== undefined) durations.set(r.task_id, ms);
  }

  const prerequisites = new Map<string, TaskPrerequisiteSummary[]>();
  for (const r of db
    .prepare<unknown[], { task_id: string; slug: string; local_id: string; task_status: TaskStatus }>(
      `SELECT e.task_id AS task_id, t.slug AS slug, t.local_id AS local_id, t.task_status AS task_status
       FROM task_edges e JOIN task_tasks t ON t.id = e.prerequisite_id
       ORDER BY e.task_id, t.slug, t.local_id`,
    )
    .all()) {
    const list = prerequisites.get(r.task_id);
    if (list === undefined) prerequisites.set(r.task_id, [{ slug: r.slug, localId: r.local_id, taskStatus: r.task_status }]);
    else list.push({ slug: r.slug, localId: r.local_id, taskStatus: r.task_status });
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
  );

  const sourceRefs = new Map<string, TaskRef>();
  const sourceIds = [...new Set(rows.map((r) => r.fix_of_task_id).filter((id): id is string => id !== null))];
  if (sourceIds.length > 0) {
    const placeholders = sourceIds.map(() => "?").join(", ");
    for (const r of db
      .prepare<unknown[], { id: string; slug: string; local_id: string }>(
        `SELECT id, slug, local_id FROM task_tasks WHERE id IN (${placeholders})`,
      )
      .all(...sourceIds)) {
      sourceRefs.set(r.id, { slug: r.slug, localId: r.local_id });
    }
  }

  return rows.map((row) => ({
    taskId: row.id,
    slug: row.slug,
    localId: row.local_id,
    title: row.title,
    taskType: row.task_type,
    taskStatus: row.task_status,
    ...(row.priority !== null ? { priority: row.priority as TaskCard["priority"] } : {}),
    ...(row.estimated_time !== null ? { estimatedTime: row.estimated_time } : {}),
    ...(row.task_status === "completed" && durations.has(row.id) ? { actualDurationMs: durations.get(row.id) } : {}),
    prerequisites: prerequisites.get(row.id) ?? [],
    sessionCount: sessionCounts.get(row.id) ?? 0,
    ...(row.fix_of_task_id !== null && sourceRefs.has(row.fix_of_task_id)
      ? { sourceTask: sourceRefs.get(row.fix_of_task_id) }
      : {}),
    // run-dag 判别面终态（slug 容器——source_kind 判别词退役）
    containerSlug: row.slug,
  }));
}

export interface ListTasksQuery {
  readonly projectKey: string;
  /** 容器限定（缺席 = 全库） */
  readonly slug?: string;
  readonly statusFilter?: readonly TaskStatus[];
  readonly search?: string;
  readonly sort?: "active" | "created" | "interrupted";
}

/** Interface 1 listTasks：search 中英过滤 + sort + TaskCard 副行水化 */
export async function listTasks(deps: TasksVerbDeps, q: ListTasksQuery): Promise<TaskCard[]> {
  const db = deps.db;
  const rows = readTaskRows(db, q.projectKey, q);
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
        );
  return hydrateTaskCards(db, sortTaskRows(matched, q.sort ?? "active"));
}

export interface TaskStats {
  readonly total: number;
  readonly byStatus: Record<TaskStatus, number>;
  readonly unmetPending: number;
  readonly gatedPending: number;
}

export interface TaskStatsQuery {
  readonly projectKey: string;
  readonly slug?: string;
}

/** Interface 1 taskStats：total + 八态分布 + unmetPending + gatedPending（零计数态含 0 键） */
export async function taskStats(deps: TasksVerbDeps, q: TaskStatsQuery): Promise<TaskStats> {
  const db = deps.db;
  const byStatus = Object.fromEntries(TASK_STATUSES.map((s) => [s, 0])) as Record<TaskStatus, number>;
  const scope = q.slug === undefined ? undefined : { slug: q.slug };
  const rows = db
    .prepare<unknown[], { task_status: TaskStatus; n: number }>(
      scope === undefined
        ? `SELECT task_status AS task_status, COUNT(*) AS n FROM task_tasks WHERE project_key = ? GROUP BY task_status`
        : SQL_STATS_BY_CONTAINER,
    )
    .all(...(scope === undefined ? [q.projectKey] : [q.projectKey, q.slug]));
  let total = 0;
  for (const r of rows) {
    if (r.task_status in byStatus) byStatus[r.task_status] = r.n;
    total += r.n;
  }
  const unmetPending = countUnmetPending(db, q.projectKey, scope);
  const gatedPending = countGatedPending(db, q.projectKey, scope);
  return { total, byStatus, unmetPending, gatedPending };
}

/** unmetPending 计数（pending 且存在未终态前置——EXISTS 半连接单查询；scope 可选） */
function countUnmetPending(db: Database.Database, projectKey: string, scope: { slug: string } | undefined): number {
  const scopeSql = scope === undefined ? "" : ` AND t.slug = ?`;
  const args = scope === undefined ? [projectKey] : [projectKey, scope.slug];
  const row = db
    .prepare<unknown[], { n: number }>(
      `SELECT COUNT(*) AS n FROM task_tasks t
       WHERE t.project_key = ? AND t.task_status = 'pending'${scopeSql}
         AND EXISTS (
           SELECT 1 FROM task_edges e JOIN task_tasks p ON p.id = e.prerequisite_id
           WHERE e.task_id = t.id AND p.task_status NOT IN ('completed', 'skipped')
         )`,
    )
    .get(...args);
  return row?.n ?? 0;
}

export interface TaskSettlementRow {
  readonly slug: string;
  readonly localId: string;
  readonly taskType: TaskType;
  readonly fixDerived: boolean;
  readonly commitHashes: string[];
  readonly evidenceDebtCount: number;
}

/** 行组装可变形（TaskSettlementRow readonly 面的组装载体） */
interface MutableSettlementRow {
  slug: string;
  localId: string;
  taskType: TaskType;
  fixDerived: boolean;
  commitHashes: string[];
  evidenceDebtCount: number;
}

export interface TaskSettlementsQuery {
  readonly projectKey: string;
  readonly slug: string;
}

/**
 * taskSettlements——容器 completed 任务结算面批量读（wave 快照单批数据源）：
 * 读源 = task_settlements（success 结算 commit_hash；fix 派生判别 = fix_of_task_id；
 * evidenceDebt 计数 = evidence_json.fields.evidenceDebt）。跨任务 commit 去重与
 * fixes/commits/evidenceDebts 计数口径单源落消费面。
 */
export async function taskSettlements(deps: TasksVerbDeps, q: TaskSettlementsQuery): Promise<TaskSettlementRow[]> {
  const db = deps.db;
  const rows = db
    .prepare<
      unknown[],
      {
        slug: string;
        local_id: string;
        task_type: TaskType;
        fix_of_task_id: string | null;
        commit_hash: string | null;
        evidence_json: string | null;
      }
    >(
      `SELECT t.slug AS slug, t.local_id AS local_id, t.task_type AS task_type,
         t.fix_of_task_id AS fix_of_task_id, s.commit_hash AS commit_hash, s.evidence_json AS evidence_json
       FROM task_tasks t LEFT JOIN task_settlements s ON s.task_id = t.id AND s.result = 'success'
       WHERE t.project_key = ? AND t.slug = ? AND t.task_status = 'completed'
       ORDER BY t.created_at, t.id, s.created_at, s.seq`,
    )
    .all(q.projectKey, q.slug);
  const byTask = new Map<string, MutableSettlementRow>();
  for (const r of rows) {
    let row = byTask.get(r.local_id);
    if (row === undefined) {
      row = {
        slug: r.slug,
        localId: r.local_id,
        taskType: r.task_type,
        fixDerived: r.fix_of_task_id !== null,
        commitHashes: [],
        evidenceDebtCount: 0,
      };
      byTask.set(r.local_id, row);
    }
    if (r.commit_hash !== null && r.commit_hash !== "" && !row.commitHashes.includes(r.commit_hash)) {
      row.commitHashes.push(r.commit_hash);
    }
    if (r.evidence_json !== null) {
      try {
        const evidence = JSON.parse(r.evidence_json) as { evidenceDebt?: unknown; fields?: { evidenceDebt?: unknown } };
        const debt = evidence.evidenceDebt ?? evidence.fields?.evidenceDebt;
        if (debt !== undefined) row.evidenceDebtCount += 1;
      } catch {
        // 畸形 evidence_json = 计 0（降级不炸读面）
      }
    }
  }
  return [...byTask.values()];
}

export interface TaskGraphEdge {
  readonly taskId: string;
  readonly prerequisiteId: string;
  readonly origin: TaskEdgeOrigin;
}

export interface TaskGraphQuery {
  readonly projectKey: string;
  readonly slug: string;
}

export interface TaskGraph {
  readonly tasks: TaskCard[];
  readonly edges: TaskGraphEdge[];
}

/** Interface 1 taskGraph：容器子图（TaskCard 全量水化 + 边三元组——DAG/泳道渲染源） */
export async function taskGraph(deps: TasksVerbDeps, q: TaskGraphQuery): Promise<TaskGraph> {
  const db = deps.db;
  const rows = db.prepare<unknown[], TaskStorageRow>(SQL_TASKS_BY_CONTAINER).all(q.projectKey, q.slug);
  const tasks = hydrateTaskCards(db, sortTaskRows(rows, "created"));
  const edges = db
    .prepare<unknown[], TaskGraphEdge>(
      `SELECT e.task_id AS taskId, e.prerequisite_id AS prerequisiteId, e.origin AS origin
       FROM task_edges e JOIN task_tasks t ON t.id = e.task_id
       WHERE t.project_key = ? AND t.slug = ? ORDER BY e.task_id, e.prerequisite_id`,
    )
    .all(q.projectKey, q.slug);
  return { tasks, edges };
}

export type { ContainerRef };
