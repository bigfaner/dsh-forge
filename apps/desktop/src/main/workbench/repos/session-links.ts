// workbench/repos/session-links — 任务↔会话挂接索引(任务 2.2)。
//
// Interface 1 动词落位:recordSessionLink / endSessionLink / 历史查询。
// 行级契约(er-diagram §session_links):UNIQUE(project_id, task_key,
// session_id) 防重复挂接;同一任务多次会话 = 多行(挂接历史);status
// active|ended 为事件驱动迁移——endSessionLink 置 ended 不删行;ended 后
// 同一 session 再登记 = 复挂恢复 active(语义 = 刷新:started_at 重置、
// ended_at 清空、行 id 稳定)。

import { toSessionLink, WorkbenchRepoError, type RecordSessionLinkInput, type RepoDb, type SessionLink, type SessionLinkRow } from './types.ts'

function selectByNaturalKey(db: RepoDb, input: RecordSessionLinkInput): SessionLinkRow | undefined {
  return db
    .prepare('SELECT * FROM session_links WHERE project_id = ? AND task_key = ? AND session_id = ?')
    .get(input.projectId, input.taskKey, input.sessionId) as SessionLinkRow | undefined
}

/**
 * 挂接登记(幂等):目标项目必须存在(ERR_PROJECT_NOT_FOUND),随后对
 * UNIQUE(project_id, task_key, session_id) 做 upsert——
 *
 *   - 首次:新行(id = uuid,status = 'active',started_at = now);
 *   - 重复登记(含 ended 后同 session 复挂):不炸 UNIQUE,刷新既有行
 *     (started_at = now、status 回 'active'、ended_at 清空、id 不变)。
 *
 * 返回登记后的挂接行(DTO)。
 */
export function recordSessionLink(db: RepoDb, input: RecordSessionLinkInput): SessionLink {
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(input.projectId)
  if (project === undefined) {
    throw new WorkbenchRepoError('ERR_PROJECT_NOT_FOUND', `cannot record session link: project ${input.projectId} does not exist`)
  }
  db.prepare(
    `INSERT INTO session_links (id, project_id, task_key, session_id, status, started_at, ended_at)
     VALUES (?, ?, ?, ?, 'active', ?, NULL)
     ON CONFLICT (project_id, task_key, session_id) DO UPDATE SET
       started_at = excluded.started_at,
       status = 'active',
       ended_at = NULL`,
  ).run(crypto.randomUUID(), input.projectId, input.taskKey, input.sessionId, new Date().toISOString())
  const row = selectByNaturalKey(db, input)
  if (row === undefined) {
    throw new WorkbenchRepoError('ERR_SESSION_LINK_NOT_FOUND', `session link for task ${input.taskKey} vanished right after recording`)
  }
  return toSessionLink(row)
}

/**
 * 结束挂接:置 ended(ended_at = now),不删行。已 ended 的行重复结束为
 * 幂等 no-op(保留原 ended_at);未知 linkId → ERR_SESSION_LINK_NOT_FOUND。
 */
export function endSessionLink(db: RepoDb, linkId: string): void {
  const changes = db
    .prepare("UPDATE session_links SET status = 'ended', ended_at = ? WHERE id = ? AND status = 'active'")
    .run(new Date().toISOString(), linkId)
  if (Number(changes.changes) === 1) return
  const row = db.prepare('SELECT id FROM session_links WHERE id = ?').get(linkId)
  if (row === undefined) {
    throw new WorkbenchRepoError('ERR_SESSION_LINK_NOT_FOUND', `session link ${linkId} does not exist`)
  }
  // changes = 0 且行存在 → 已是 ended:幂等 no-op。
}

/**
 * 发起侧收敛(4.2):同任务换会话再发起时,结束该任务其余 active 挂接行
 * (keepSessionId 行除外),历史行保留。ended 迁移的两个触发都来自发起侧
 * ——显式 endSessionLink 与本收敛;spike-1 §5 证明无会话终态信号
 * (AgentStatus 二态、dispose=宿主卸载非完成),故不做 agent-status 启发,
 * 也不在应用退出时收敛(Story2 AC3:重启后挂接关系仍在)。返回收敛行数。
 */
export function supersedeActiveSessionLinks(db: RepoDb, projectId: string, taskKey: string, keepSessionId: string): number {
  const changes = db
    .prepare(
      `UPDATE session_links SET status = 'ended', ended_at = ?
       WHERE project_id = ? AND task_key = ? AND status = 'active' AND session_id <> ?`,
    )
    .run(new Date().toISOString(), projectId, taskKey, keepSessionId)
  return Number(changes.changes)
}

/** 按项目查询挂接历史(含 ended,新→旧:started_at 倒序,rowid 兜底同刻)。 */
export function listSessionLinks(db: RepoDb, projectId: string): SessionLink[] {
  const rows = db
    .prepare('SELECT * FROM session_links WHERE project_id = ? ORDER BY started_at DESC, rowid DESC')
    .all(projectId) as SessionLinkRow[]
  return rows.map(toSessionLink)
}

/** 按项目+任务查询挂接历史(含 ended;UF3 详情「挂接历史」与来源推断兜底共用)。 */
export function listSessionLinksByTask(db: RepoDb, projectId: string, taskKey: string): SessionLink[] {
  const rows = db
    .prepare('SELECT * FROM session_links WHERE project_id = ? AND task_key = ? ORDER BY started_at DESC, rowid DESC')
    .all(projectId, taskKey) as SessionLinkRow[]
  return rows.map(toSessionLink)
}
