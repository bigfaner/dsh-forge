// workbench/repos/task-snapshots — 派生任务快照(任务 2.3)。
//
// task_snapshot = 派生缓存(er-diagram §task_snapshot):整体可弃,由
// forge 文件全量重扫重建。Hard Rule:本模块只透传 forge 文件提供的字段做
// 存储映射(JSON 数组/布尔 ↔ TEXT/INTEGER),不补写、不改写语义——7 态
// 词表由 SQL CHECK 原样拒绝越界值,而非本层枚举改写。
//
// Interface 1 读路径落位(getTaskBoard 仓储支撑):复合 PK (project_id,
// task_key) upsert 供 indexer 全量重扫/增量回流共用;feature/status 查询
// 命中 idx_task_snapshot_* 索引,看板列表按 updated_at 倒序(最近变更在前)。

import {
  assertProjectExists,
  toTaskSnapshot,
  type ChangeSource,
  type RepoDb,
  type TaskSnapshot,
  type TaskSnapshotRow,
  type TaskStatus,
} from './types.ts'

/** 单笔 upsert 入参:全字段必填——快照行是 forge 文件某次扫描的完整投影。 */
export interface UpsertTaskSnapshotInput {
  readonly projectId: string
  readonly taskKey: string
  readonly featureSlug: string
  readonly title: string
  readonly status: TaskStatus
  /** 直接上游 blocker 的 task_key 列表(JSON 编码往返)。 */
  readonly blockers: readonly string[]
  /** 任务执行 git 分支(执行痕迹;forge 文件无则 null)。 */
  readonly branch: string | null
  readonly worktree: boolean
  /** 最近一笔变更来源(Interface 3 判定序产物;无则 null)。 */
  readonly source: ChangeSource | null
  /** 最近变更时间戳(调用方供给——派生自 forge 文件,本层不自行造时)。 */
  readonly updatedAt: string
}

/** 批量行形态(同项目批量的单行;projectId 由批量入参统一承载)。 */
export type UpsertTaskBatchRow = Omit<UpsertTaskSnapshotInput, 'projectId'>

const UPSERT_TASK_SNAPSHOT_SQL = `INSERT INTO task_snapshot
  (project_id, task_key, feature_slug, title, status, blockers, branch, worktree, source, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (project_id, task_key) DO UPDATE SET
    feature_slug = excluded.feature_slug,
    title = excluded.title,
    status = excluded.status,
    blockers = excluded.blockers,
    branch = excluded.branch,
    worktree = excluded.worktree,
    source = excluded.source,
    updated_at = excluded.updated_at`

/** 统一的参数绑定(JSON 编码 + 布尔→INTEGER 均在此发生,读写对称)。 */
function bindTaskRow(projectId: string, row: UpsertTaskBatchRow): unknown[] {
  return [
    projectId,
    row.taskKey,
    row.featureSlug,
    row.title,
    row.status,
    JSON.stringify(row.blockers),
    row.branch,
    row.worktree ? 1 : 0,
    row.source,
    row.updatedAt,
  ]
}

/** 复合主键读:按 (project_id, task_key) 取单行;不存在 → null。 */
export function getTaskSnapshot(db: RepoDb, projectId: string, taskKey: string): TaskSnapshot | null {
  const row = db
    .prepare('SELECT * FROM task_snapshot WHERE project_id = ? AND task_key = ?')
    .get(projectId, taskKey) as TaskSnapshotRow | undefined
  return row === undefined ? null : toTaskSnapshot(row)
}

/**
 * 单笔 upsert:同 (project_id, task_key) 重复写入走更新不炸(整体字段
 * 替换)。越界 status/source 由 SQL CHECK 原样拒绝(单语句原子,拒绝即
 * 未写入)。返回写入后的快照 DTO。
 */
export function upsertTaskSnapshot(db: RepoDb, input: UpsertTaskSnapshotInput): TaskSnapshot {
  assertProjectExists(db, input.projectId)
  db.prepare(UPSERT_TASK_SNAPSHOT_SQL).run(...bindTaskRow(input.projectId, input))
  const snapshot = getTaskSnapshot(db, input.projectId, input.taskKey)
  if (snapshot === null) {
    // Defensive only: the row was just written by the statement above.
    throw new Error(`task snapshot ${input.taskKey} vanished right after upsert`)
  }
  return snapshot
}

/**
 * 批量 upsert(indexer 全量重扫写路径):全部行同属一个项目,单事务提交
 * ——SAVEPOINT 承载,独立调用即自持事务,嵌套于 rebuild 重建事务内时安全
 * 降级为子事务;任一行失败(CHECK 越界等)整体回滚,不留半批快照。
 */
export function upsertTaskSnapshots(db: RepoDb, projectId: string, tasks: readonly UpsertTaskBatchRow[]): void {
  assertProjectExists(db, projectId)
  db.exec('SAVEPOINT dsh_forge_task_snapshot_batch')
  try {
    const statement = db.prepare(UPSERT_TASK_SNAPSHOT_SQL)
    for (const row of tasks) {
      statement.run(...bindTaskRow(projectId, row))
    }
    db.exec('RELEASE dsh_forge_task_snapshot_batch')
  } catch (error) {
    try {
      db.exec('ROLLBACK TO dsh_forge_task_snapshot_batch')
      db.exec('RELEASE dsh_forge_task_snapshot_batch')
    } catch {
      // The connection may already be unusable; prefer rethrowing the original error.
    }
    throw error
  }
}

/** 项目任务全量(看板列表;updated_at 倒序 = 最近变更在前,task_key 兜底同刻)。 */
export function listTaskSnapshots(db: RepoDb, projectId: string): TaskSnapshot[] {
  const rows = db
    .prepare('SELECT * FROM task_snapshot WHERE project_id = ? ORDER BY updated_at DESC, task_key')
    .all(projectId) as TaskSnapshotRow[]
  return rows.map(toTaskSnapshot)
}

/**
 * 按 feature 聚合查询(UF2 筛选器/UF4 计数;命中 idx_task_snapshot_feature)。
 * 排序与看板主列表同口径(updated_at 倒序 = 最近变更在前)——不按 task_key
 * 排序,否则优化器会改走复合 PK 索引换取免费排序,弃用设计索引。
 */
export function listTaskSnapshotsByFeature(db: RepoDb, projectId: string, featureSlug: string): TaskSnapshot[] {
  const rows = db
    .prepare('SELECT * FROM task_snapshot WHERE project_id = ? AND feature_slug = ? ORDER BY updated_at DESC, task_key')
    .all(projectId, featureSlug) as TaskSnapshotRow[]
  return rows.map(toTaskSnapshot)
}

/** 按状态过滤(状态分组视图 B 列;命中 idx_task_snapshot_status;排序同上)。 */
export function listTaskSnapshotsByStatus(db: RepoDb, projectId: string, status: TaskStatus): TaskSnapshot[] {
  const rows = db
    .prepare('SELECT * FROM task_snapshot WHERE project_id = ? AND status = ? ORDER BY updated_at DESC, task_key')
    .all(projectId, status) as TaskSnapshotRow[]
  return rows.map(toTaskSnapshot)
}

/**
 * 结构性删除(任务 2.5 indexer):任务在 forge 文件侧消失(文件删除/移
 * 相位)→ 快照行删除,不留孤儿行。不存在即 no-op;返回是否实际删除。
 * 派生缓存语义:删除不级联任何自有表(session_links.task_key 为自由 TEXT,
 * 挂接历史与任务实体解耦)。
 */
export function deleteTaskSnapshot(db: RepoDb, projectId: string, taskKey: string): boolean {
  const result = db.prepare('DELETE FROM task_snapshot WHERE project_id = ? AND task_key = ?').run(projectId, taskKey)
  return result.changes > 0
}

/** 批量结构性删除(单事务语义由调用方承载——indexer 写事务内逐行执行)。 */
export function deleteTaskSnapshots(db: RepoDb, projectId: string, taskKeys: readonly string[]): number {
  let deleted = 0
  const statement = db.prepare('DELETE FROM task_snapshot WHERE project_id = ? AND task_key = ?')
  for (const taskKey of taskKeys) {
    const result = statement.run(projectId, taskKey)
    if (result.changes > 0) deleted += 1
  }
  return deleted
}
