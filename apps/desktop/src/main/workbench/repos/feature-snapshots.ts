// workbench/repos/feature-snapshots — 派生 feature 快照(任务 2.3)。
//
// feature_snapshot = 派生缓存(er-diagram §feature_snapshot):status 为
// forge manifest 词表**透传**(含连字符形 'in-progress')——SQL 层不设
// CHECK、本层不枚举校验、不改写(词表归 forge;Hard Rule 禁止快照层补写
// 语义)。doc_kinds 为 JSON 数组往返;task_total / task_completed 为时点
// 派生计数——upsert 语句内直接对 task_snapshot 计数,与任务快照一致
// by construction(任务集变化后重放本 upsert 即收敛,重扫天然如此)。

import {
  assertProjectExists,
  toFeatureSnapshot,
  type DocKind,
  type FeatureSnapshot,
  type FeatureSnapshotRow,
  type FeatureStatus,
  type RepoDb,
} from './types.ts'

export interface UpsertFeatureSnapshotInput {
  readonly projectId: string
  readonly featureSlug: string
  /** manifest 原词直通(不改写;存储层无 CHECK 是设计使然)。 */
  readonly status: FeatureStatus
  /** 实际存在的文档类(⊂ 五类;驱动 UF4 tab disabled)。 */
  readonly docKinds: readonly DocKind[]
  /** manifest/任务集最近变更(调用方供给,派生自 forge 文件)。 */
  readonly updatedAt: string
}

// task_total / task_completed 由子查询对 task_snapshot 计数(时点派生):
// 输入不携带计数,杜绝快照层手写第二份任务账。
const UPSERT_FEATURE_SNAPSHOT_SQL = `INSERT INTO feature_snapshot
  (project_id, feature_slug, status, doc_kinds, task_total, task_completed, updated_at)
  VALUES (?, ?, ?, ?,
    (SELECT COUNT(*) FROM task_snapshot WHERE project_id = ? AND feature_slug = ?),
    (SELECT COUNT(*) FROM task_snapshot WHERE project_id = ? AND feature_slug = ? AND status = 'completed'),
    ?)
  ON CONFLICT (project_id, feature_slug) DO UPDATE SET
    status = excluded.status,
    doc_kinds = excluded.doc_kinds,
    task_total = excluded.task_total,
    task_completed = excluded.task_completed,
    updated_at = excluded.updated_at`

/** 复合主键读:按 (project_id, feature_slug) 取单行;不存在 → null。 */
export function getFeatureSnapshot(db: RepoDb, projectId: string, featureSlug: string): FeatureSnapshot | null {
  const row = db
    .prepare('SELECT * FROM feature_snapshot WHERE project_id = ? AND feature_slug = ?')
    .get(projectId, featureSlug) as FeatureSnapshotRow | undefined
  return row === undefined ? null : toFeatureSnapshot(row)
}

/**
 * 单笔 upsert:同 (project_id, feature_slug) 重复写入走更新不炸;计数随
 * 当前 task_snapshot 重算(维护一致)。返回写入后的快照 DTO。
 */
export function upsertFeatureSnapshot(db: RepoDb, input: UpsertFeatureSnapshotInput): FeatureSnapshot {
  assertProjectExists(db, input.projectId)
  db.prepare(UPSERT_FEATURE_SNAPSHOT_SQL).run(
    input.projectId,
    input.featureSlug,
    input.status,
    JSON.stringify(input.docKinds),
    input.projectId,
    input.featureSlug,
    input.projectId,
    input.featureSlug,
    input.updatedAt,
  )
  const snapshot = getFeatureSnapshot(db, input.projectId, input.featureSlug)
  if (snapshot === null) {
    // Defensive only: the row was just written by the statement above.
    throw new Error(`feature snapshot ${input.featureSlug} vanished right after upsert`)
  }
  return snapshot
}

/** 项目 feature 全量(UF4 列表;updated_at 倒序,命中 idx_feature_snapshot_updated)。 */
export function listFeatureSnapshots(db: RepoDb, projectId: string): FeatureSnapshot[] {
  const rows = db
    .prepare('SELECT * FROM feature_snapshot WHERE project_id = ? ORDER BY updated_at DESC, feature_slug')
    .all(projectId) as FeatureSnapshotRow[]
  return rows.map(toFeatureSnapshot)
}

/**
 * 结构性删除(任务 2.5 indexer):feature 目录消失 → 快照行删除。不存在
 * 即 no-op;返回是否实际删除。任务行的级联清理由 indexer 写事务显式执行
 * (先删任务行再删 feature 行,计数一致性由重放 upsert 维护)。
 */
export function deleteFeatureSnapshot(db: RepoDb, projectId: string, featureSlug: string): boolean {
  const result = db.prepare('DELETE FROM feature_snapshot WHERE project_id = ? AND feature_slug = ?').run(projectId, featureSlug)
  return result.changes > 0
}

// ---------------------------------------------------------------------------
// feature 级偏离标记(任务 4.2;v2 增列 deviated/last_external_at 的唯一写面)
// ---------------------------------------------------------------------------

/**
 * 偏离置位 + 检出时戳(4.2 deviation-watcher 调用):非内核 manifest
 * status 变更被检出。独立于扫描写事务(upsert 不触碰两列,标记恒存续 ——
 * 「偏离标记保持」直到内核合法推进清除)。返回是否命中既有行。
 */
export function markFeatureDeviation(db: RepoDb, projectId: string, featureSlug: string, at: string): boolean {
  return (
    db
      .prepare('UPDATE feature_snapshot SET deviated = 1, last_external_at = ? WHERE project_id = ? AND feature_slug = ?')
      .run(at, projectId, featureSlug).changes > 0
  )
}

/**
 * 偏离清除(advance-service 内核合法推进成功后调用):仅翻 deviated,
 * last_external_at 保留(审计痕迹 —— 最近一次外部变更时戳可回查)。
 * 返回是否实际发生 1 → 0 翻转(门拒绝/终态 no-op 不调用 = 不清除)。
 */
export function clearFeatureDeviation(db: RepoDb, projectId: string, featureSlug: string): boolean {
  return (
    db
      .prepare('UPDATE feature_snapshot SET deviated = 0 WHERE project_id = ? AND feature_slug = ? AND deviated = 1')
      .run(projectId, featureSlug).changes > 0
  )
}
