// workbench/repos/snapshot-rebuild — 派生缓存全量重建入口(任务 2.3)。
//
// 重建语义(er-diagram 派生缓存纪律):task_snapshot / feature_snapshot /
// sync_state 三表整体可弃。本入口在单事务内「清空三表 → rescan 钩子重放
// 全量 upsert」,原子切换——读者要么见全旧快照、要么见全新快照;钩子
// 抛错整体回滚,不留清空后/半扫的中间态。自有 SoT(projects / app_state /
// session_links)一行不动:本模块对自有表零 SQL,快照内容全部来自 rescan
// 钩子(indexer 对 forge 文件的重扫产物——Hard Rule:重建不伪造快照数据)。
//
// 钩子约定:运行于重建事务内——单笔 upsert 语句自动加入外层事务,批量
// 写路径以 SAVEPOINT 嵌套(upsertTaskSnapshots);钩子不得另开 BEGIN
// (自有表写路径本就不应出现在重建里)。

import type { RepoDb } from './types.ts'

/**
 * 全量重建:单事务内清空三张派生表,再执行 rescan 钩子重放快照。
 * @param rescan 重扫钩子——在重建事务内对派生表重放全量 upsert(indexer
 *   供给;逐任务/逐 feature 调用快照 repos 写路径)。抛错即整体回滚。
 */
export function rebuildDerivedSnapshots(db: RepoDb, rescan: (db: RepoDb) => void): void {
  db.exec('BEGIN IMMEDIATE')
  try {
    db.exec('DELETE FROM task_snapshot')
    db.exec('DELETE FROM feature_snapshot')
    db.exec('DELETE FROM sync_state')
    rescan(db)
    db.exec('COMMIT')
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // The connection may already be unusable; prefer rethrowing the original error.
    }
    throw error
  }
}
