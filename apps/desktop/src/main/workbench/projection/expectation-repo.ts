// workbench/projection/expectation-repo — workspace_projection 期望快照仓储
// (任务 3.1;er-diagram §workspace_projection 行级契约)。
//
// 表语义:project_id PK(1:1,FK CASCADE = 项目删除即清除)· workspace_id
// NOT NULL(最近成功投影的 dsh WorkspaceId——注册期无真值,占位写 '' 哨兵,
// DTO 映射 null)· path(= anchor canonical,ensure 定位/复连键)· title
// (最近成功 title,改名偏差 diff 基线)· order_idx(期望序 = sort_order)·
// pushed_at NOT NULL(最近成功 push 时间;占位 '')· last_error(degraded
// 原因,健康 = NULL)。
//
// Hard Rule(repos 单写者):本层只写 workspace_projection;projects 表的
// projection_state/workspace_id 信息位经 repos/projects.ts 写入函数回写,
// 不手写越层 SQL。偏差明细不落表(对账重算物化,er-diagram 注记)。

import { setProjectWorkspaceId } from '../repos/projects.ts'
import { assertProjectExists, type RepoDb } from '../repos/types.ts'
import type { ProjectionExpectation } from './plan.ts'

/** workspace_projection 行 DTO(snake_case 行 → camelCase;'' 哨兵 → null)。 */
export interface WorkspaceProjectionRow {
  readonly projectId: string
  /** 最近成功投影的 dsh WorkspaceId(占位 = null)。 */
  readonly workspaceId: string | null
  /** 期望投影路径(= anchor canonical)。 */
  readonly path: string
  /** 最近成功 title(偏差 diff 基线)。 */
  readonly title: string
  /** 期望序(= projects.sort_order)。 */
  readonly orderIdx: number
  /** 最近成功 push 时间(ISO 8601;占位 = null)。 */
  readonly pushedAt: string | null
  /** degraded 原因(健康 = null)。 */
  readonly lastError: string | null
}

/** 最近成功投影回写入参(reportProjectionOutcome ok 路径;3.2 接线)。 */
export interface RecordSuccessfulPushInput {
  readonly projectId: string
  readonly workspaceId: string
  /** 期望投影路径(anchor canonical;ensure 定位键)。 */
  readonly path: string
  readonly title: string
  readonly orderIdx: number
  /** ISO 8601。 */
  readonly pushedAt: string
}

/** NOT NULL 列的占位哨兵(注册即占位,尚无成功 push 真值)。 */
const PLACEHOLDER = ''

interface WorkspaceProjectionStorageRow {
  readonly project_id: string
  readonly workspace_id: string
  readonly path: string
  readonly title: string
  readonly order_idx: number
  readonly pushed_at: string
  readonly last_error: string | null
}

function toWorkspaceProjectionRow(row: WorkspaceProjectionStorageRow): WorkspaceProjectionRow {
  return {
    projectId: row.project_id,
    workspaceId: row.workspace_id === PLACEHOLDER ? null : row.workspace_id,
    path: row.path,
    title: row.title,
    orderIdx: row.order_idx,
    pushedAt: row.pushed_at === PLACEHOLDER ? null : row.pushed_at,
    lastError: row.last_error,
  }
}

/** 单行读取(无行 = null:v3 存量项目迁移不回填本表,收数前无行)。 */
export function getWorkspaceProjectionRow(db: RepoDb, projectId: string): WorkspaceProjectionRow | null {
  const row = db
    .prepare('SELECT * FROM workspace_projection WHERE project_id = ?')
    .get(projectId) as WorkspaceProjectionStorageRow | undefined
  return row === undefined ? null : toWorkspaceProjectionRow(row)
}

/** 全表读取(审计/测试面)。 */
export function listWorkspaceProjectionRows(db: RepoDb): WorkspaceProjectionRow[] {
  return (db
    .prepare('SELECT * FROM workspace_projection ORDER BY project_id')
    .all() as WorkspaceProjectionStorageRow[]).map(toWorkspaceProjectionRow)
}

/**
 * 注册即占位(er-diagram:「1:1 期望快照,注册即占位」;1.3 registerProject
 * hook 就绪——3.4 接线):从 projects 行取 path/title/order_idx 基线值,
 * INSERT OR IGNORE 幂等(重复调用/收数回补不覆盖既有审计)。未知项目 →
 * ERR_PROJECT_NOT_FOUND(优于裸 FK 错误,对齐 repos 前置校验惯例)。
 */
export function insertExpectationPlaceholder(db: RepoDb, projectId: string): void {
  assertProjectExists(db, projectId)
  const project = db
    .prepare('SELECT code_root, display_name, sort_order FROM projects WHERE id = ?')
    .get(projectId) as { code_root: string; display_name: string; sort_order: number }
  db
    .prepare(
      'INSERT OR IGNORE INTO workspace_projection (project_id, workspace_id, path, title, order_idx, pushed_at, last_error) '
        + 'VALUES (?, ?, ?, ?, ?, ?, NULL)',
    )
    .run(projectId, PLACEHOLDER, project.code_root, project.display_name, project.sort_order, PLACEHOLDER)
}

/**
 * 最近成功投影回写(AC:「workspace_id/title/order_idx/pushed_at」):
 * UPSERT 全量四列 + last_error 清位(恢复即净);同一事务内镜像
 * projects.workspace_id 信息位(er-diagram:「dsh 侧删除重建后由 ensure
 * 更新」——path 复连的新 id 在此落账)。未知项目 → ERR_PROJECT_NOT_FOUND。
 */
export function recordSuccessfulPush(db: RepoDb, input: RecordSuccessfulPushInput): void {
  assertProjectExists(db, input.projectId)
  db.exec('BEGIN IMMEDIATE')
  try {
    db
      .prepare(
        'INSERT INTO workspace_projection (project_id, workspace_id, path, title, order_idx, pushed_at, last_error) '
          + 'VALUES (?, ?, ?, ?, ?, ?, NULL) '
          + 'ON CONFLICT (project_id) DO UPDATE SET '
          + 'workspace_id = excluded.workspace_id, path = excluded.path, title = excluded.title, '
          + 'order_idx = excluded.order_idx, pushed_at = excluded.pushed_at, last_error = NULL',
      )
      .run(input.projectId, input.workspaceId, input.path, input.title, input.orderIdx, input.pushedAt)
    setProjectWorkspaceId(db, input.projectId, input.workspaceId)
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

/**
 * degraded 原因落 last_error(AC;reportProjectionOutcome error 路径,3.2
 * 接线):先幂等占位(从未推送即失败的场景有行可落),再 UPDATE last_error;
 * 最近成功 push 的审计列(workspace_id/pushed_at 等)原样保留(降级不清账)。
 * 未知项目 → ERR_PROJECT_NOT_FOUND。
 */
export function recordProjectionDegraded(db: RepoDb, projectId: string, error: string): void {
  assertProjectExists(db, projectId)
  db.exec('BEGIN IMMEDIATE')
  try {
    insertExpectationPlaceholder(db, projectId)
    db
      .prepare('UPDATE workspace_projection SET last_error = ? WHERE project_id = ?')
      .run(error, projectId)
    db.exec('COMMIT')
  } catch (err) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // The connection may already be unusable; prefer rethrowing the original error.
    }
    throw err
  }
}

/**
 * 期望并集读(diff/plan 的统一输入):projects LEFT JOIN workspace_projection
 * ——v3 存量项目无快照行时按 projects 权威列合成待推送期望(pending 收数
 * 语义),有行时以行内最近成功 push 值为偏差基线。输出按
 * (sort_order, id) 升序(注册序 = 投影顺序权威)。
 */
export function listProjectionExpectations(db: RepoDb): ProjectionExpectation[] {
  const rows = db
    .prepare(
      'SELECT p.id, p.display_name, p.code_root, p.sort_order, p.archived, '
        + 'w.workspace_id, w.title AS pushed_title, w.pushed_at, w.last_error '
        + 'FROM projects p LEFT JOIN workspace_projection w ON w.project_id = p.id '
        + 'ORDER BY p.sort_order, p.id',
    )
    .all() as Array<{
    id: string
    display_name: string
    code_root: string
    sort_order: number
    archived: number
    workspace_id: string | null
    pushed_title: string | null
    pushed_at: string | null
    last_error: string | null
  }>
  return rows.map(row => ({
    projectId: row.id,
    path: row.code_root,
    expectedTitle: row.display_name,
    orderIdx: row.sort_order,
    archived: row.archived === 1,
    pushedWorkspaceId: row.workspace_id === null || row.workspace_id === '' ? null : row.workspace_id,
    pushedTitle: row.pushed_title,
    pushedAt: row.pushed_at === '' ? null : row.pushed_at,
    lastError: row.last_error,
  }))
}
