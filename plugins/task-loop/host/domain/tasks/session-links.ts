// sessionLinks——挂接双源分型读（core forge/tasks/session-links.ts 直迁——plugin-task-loop
// 1.7 内联）。只读 prepared statements 零事件；分型呈现不做合并解释：link = task_session_links
// 行（派发会话——claim 唯一写源）/ record = task_records.session_id（执行会话）。
import type { SessionTaskLinkCard, TasksVerbDeps } from "./types.js";

/** 读面装配依赖 */
export interface SessionLinksDeps {
  readonly db: import("@dsh-forge/lib-db").Database;
}

/** EQP 锚 ③：会话挂接查询（session_id 定位 → idx_task_tsl_session）；加性读列 claimedAt */
export const LINKS_BY_SESSION_SQL = `SELECT t.id AS taskId, t.slug AS slug, t.local_id AS localId,
  t.title AS title, t.task_status AS taskStatus, l.created_at AS claimedAt
FROM task_session_links l JOIN task_tasks t ON t.id = l.task_id
WHERE l.session_id = ? ORDER BY t.slug, t.local_id`;

/** 双源之二：records 执行会话挂接（同任务多记录去重——GROUP BY 任务；idx_task_records_session 面） */
const RECORD_LINKS_BY_SESSION_SQL = `SELECT t.id AS taskId, t.slug AS slug, t.local_id AS localId,
  t.title AS title, t.task_status AS taskStatus
FROM task_records r JOIN task_tasks t ON t.id = r.task_id
WHERE r.session_id = ? GROUP BY t.id ORDER BY t.slug, t.local_id`;

export interface SessionLinksQuery {
  readonly projectKey: string;
  readonly sessionId: string;
}

/** Interface 1 sessionLinks：双源分型卡（link 源在前、record 源在后；各按自然键稳定序） */
export async function sessionLinks(deps: SessionLinksDeps, q: SessionLinksQuery): Promise<SessionTaskLinkCard[]> {
  const db = deps.db;
  const cards: SessionTaskLinkCard[] = db
    .prepare<unknown[], Omit<SessionTaskLinkCard, "sessionId" | "source">>(LINKS_BY_SESSION_SQL)
    .all(q.sessionId)
    .map((r) => ({ ...r, sessionId: q.sessionId, source: "link" as const }));
  for (const r of db
    .prepare<unknown[], Omit<SessionTaskLinkCard, "sessionId" | "source">>(RECORD_LINKS_BY_SESSION_SQL)
    .all(q.sessionId)) {
    cards.push({ ...r, sessionId: q.sessionId, source: "record" as const });
  }
  return cards;
}

export type { TasksVerbDeps };
