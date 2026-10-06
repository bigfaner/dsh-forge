// sessionLinks——挂接双源分型读（任务 2.6；tech-design §Interface 1 sessionLinks：links ∪
// records.session_id——SC6③ 数据源，卡片含 taskId）。定位：业务（forge/tasks 子域）——只读
// prepared statements 零事件。会话头 pill 查询（Integration #2）；「查询天然单库」的会话→
// 工作区解析归 web 侧（sessions/workspaces 账本），core 面恒显式 projectId。
//
// 分型呈现不做合并解释（§6-24④ 诚实审计）：link = task_session_links 行（派发会话——claim
// upsert-ignore 唯一写源）/ record = task_records.session_id（执行会话——submit/transition
// 记录）；同任务同会话双侧参与 → 两卡并存。
import type { SessionLinksQuery, SessionTaskLinkCard } from '@dsh-forge/contracts'
import type { ForgeWorkspaceStore } from '../workspace/store.js'

/** 读面装配依赖（service.ts 装配面结构传入） */
export interface SessionLinksDeps {
  /** 每工作区任务库惰性句柄（projectId → ensureOpen） */
  readonly store: ForgeWorkspaceStore
}

/** EQP 锚 ③：会话挂接查询（session_id 定位 → idx_tsl_session——list.test 断言） */
export const LINKS_BY_SESSION_SQL = `SELECT t.id AS taskId, t.slug AS slug, t.local_id AS localId,
  t.title AS title, t.task_status AS taskStatus
FROM task_session_links l JOIN tasks t ON t.id = l.task_id
WHERE l.session_id = ? ORDER BY t.slug, t.local_id`

/** 双源之二：records 执行会话挂接（同任务多记录去重——GROUP BY 任务；idx_records_session 面） */
const RECORD_LINKS_BY_SESSION_SQL = `SELECT t.id AS taskId, t.slug AS slug, t.local_id AS localId,
  t.title AS title, t.task_status AS taskStatus
FROM task_records r JOIN tasks t ON t.id = r.task_id
WHERE r.session_id = ? GROUP BY t.id ORDER BY t.slug, t.local_id`

/** Interface 1 sessionLinks：双源分型卡（link 源在前、record 源在后；各按自然键稳定序） */
export async function sessionLinks(deps: SessionLinksDeps, q: SessionLinksQuery): Promise<SessionTaskLinkCard[]> {
  const db = deps.store.ensureOpen(q.projectId)
  const cards: SessionTaskLinkCard[] = db
    .prepare<unknown[], Omit<SessionTaskLinkCard, 'sessionId' | 'source'>>(LINKS_BY_SESSION_SQL)
    .all(q.sessionId)
    .map((r) => ({ ...r, sessionId: q.sessionId, source: 'link' as const }))
  for (const r of db
    .prepare<unknown[], Omit<SessionTaskLinkCard, 'sessionId' | 'source'>>(RECORD_LINKS_BY_SESSION_SQL)
    .all(q.sessionId)) {
    cards.push({ ...r, sessionId: q.sessionId, source: 'record' as const })
  }
  return cards
}
