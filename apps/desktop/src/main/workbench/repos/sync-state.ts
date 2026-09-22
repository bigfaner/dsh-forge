// workbench/repos/sync-state — 快照健康度 1:1(任务 2.3)。
//
// sync_state = 派生缓存的运行簿记(er-diagram §sync_state):项目 1:1,
// 不承载任务域语义。读写面:indexer 事务外置位 scanning → 成功回 idle 并
// 推进感知游标(last_scan_at)/失败置 error(原因 ≤120 字符,对齐 M1
// failure.detail 口径)。两种复位:游标复位(markScanSucceeded——保留行、
// last_scan_at 推进至本次成功时点)与全量重建复位(resetSyncState 删行
// 回「从未扫描」初态;rebuild 入口整体清表亦走删除语义)。

import { assertProjectExists, toSyncState, type RepoDb, type SyncState, type SyncStateRow } from './types.ts'

/** error 态原因上限(er-diagram sync_state.error:≤120 字符)。 */
const MAX_ERROR_LENGTH = 120

function selectSyncStateRow(db: RepoDb, projectId: string): SyncStateRow | undefined {
  return db.prepare('SELECT * FROM sync_state WHERE project_id = ?').get(projectId) as SyncStateRow | undefined
}

function readBack(db: RepoDb, projectId: string): SyncState {
  const row = selectSyncStateRow(db, projectId)
  if (row === undefined) {
    // Defensive only: the row was just written by the statement above.
    throw new Error(`sync state for project ${projectId} vanished right after write`)
  }
  return toSyncState(row)
}

/** 1:1 读:行不存在(从未扫描/重建后未扫)→ null,不抛错。 */
export function getSyncState(db: RepoDb, projectId: string): SyncState | null {
  const row = selectSyncStateRow(db, projectId)
  return row === undefined ? null : toSyncState(row)
}

/** 进入扫描(er-diagram:scanning 由 indexer 事务外置位;既有游标/错误保留)。 */
export function markScanStarted(db: RepoDb, projectId: string): SyncState {
  assertProjectExists(db, projectId)
  db.prepare(
    `INSERT INTO sync_state (project_id, last_scan_at, status, error) VALUES (?, NULL, 'scanning', NULL)
     ON CONFLICT (project_id) DO UPDATE SET status = 'scanning'`,
  ).run(projectId)
  return readBack(db, projectId)
}

/** 游标复位:扫描成功——回 idle、last_scan_at 推进至完成时点、清 error。 */
export function markScanSucceeded(db: RepoDb, projectId: string): SyncState {
  assertProjectExists(db, projectId)
  db.prepare(
    `INSERT INTO sync_state (project_id, last_scan_at, status, error) VALUES (?, ?, 'idle', NULL)
     ON CONFLICT (project_id) DO UPDATE SET last_scan_at = excluded.last_scan_at, status = 'idle', error = NULL`,
  ).run(projectId, new Date().toISOString())
  return readBack(db, projectId)
}

/** 扫描失败:置 error 并记原因(截断 ≤120 字符);last_scan_at 保留上次成功值。 */
export function markScanFailed(db: RepoDb, projectId: string, reason: string): SyncState {
  assertProjectExists(db, projectId)
  const detail = reason.length > MAX_ERROR_LENGTH ? reason.slice(0, MAX_ERROR_LENGTH) : reason
  db.prepare(
    `INSERT INTO sync_state (project_id, last_scan_at, status, error) VALUES (?, NULL, 'error', ?)
     ON CONFLICT (project_id) DO UPDATE SET status = 'error', error = excluded.error`,
  ).run(projectId, detail)
  return readBack(db, projectId)
}

/**
 * 全量重建复位:删行回「从未扫描」初态(游标不复存在,下次按全量扫描
 * 处理)。幂等——行不存在时为 no-op。
 */
export function resetSyncState(db: RepoDb, projectId: string): void {
  assertProjectExists(db, projectId)
  db.prepare('DELETE FROM sync_state WHERE project_id = ?').run(projectId)
}
