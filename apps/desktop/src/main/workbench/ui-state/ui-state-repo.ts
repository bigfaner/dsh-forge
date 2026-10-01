// workbench/ui-state/ui-state-repo — project_ui_state 仓储(任务 4.1;
// er-diagram §project_ui_state 行级契约:T4 裁决 —— 布局记忆 = SQLite 项目
// 域,FK CASCADE = 项目删除即清除)。
//
// 表语义:project_id PK(1:1)· layout_json TEXT NOT NULL DEFAULT '{}'
// (ProjectLayout v1;读侧经 layout-schema 白名单校验 —— 违规 blob → 默认
// 布局 + reset 标记,ERR_LAYOUT_INVALID 的 log 由动词装配层落地)·
// updated_at TEXT NOT NULL(客户端 debounce 写入的每笔落库时戳,ISO 8601)。
//
// Hard Rule(repos 单写者):本层只写 project_ui_state;行清除 = projects
// 删除的 FK cascade(schema-v3 DDL 既置,db.ts 逐连接 PRAGMA foreign_keys=
// ON 承载),不另写清除 SQL。写侧 schema 二次校验(非法 blob 落库为默认
// 布局)在动词装配层(ipc/services.ts)—— 本层收恒为合法形态。

import { assertProjectExists, type RepoDb } from '../repos/types.ts'
import { sanitizeProjectLayout, type ProjectLayout } from './layout-schema.ts'

/** project_ui_state 行 DTO(读侧;layout 已过 schema 校验)。 */
export interface ProjectUiStateRow {
  readonly layout: ProjectLayout
  /** 最近写入时戳(ISO 8601)。 */
  readonly updatedAt: string
  /** 读侧校验:false = blob 合法;true = 违规已重置默认(调用方 log)。 */
  readonly reset: boolean
  /** 违规原因(reset = false 时恒 null)。 */
  readonly reason: string | null
}

interface ProjectUiStateStorageRow {
  readonly layout_json: string
  readonly updated_at: string
}

/**
 * 单行读取(无行 = null —— v3 存量项目不回填本表,调用方以默认布局应答;
 * er-diagram「无行 = 默认布局」)。行内 blob 经白名单校验:违规(含损坏
 * JSON)→ 默认布局 + reset 标记 —— 读取面不放大存储损伤,log 归装配层。
 */
export function getProjectUiStateRow(db: RepoDb, projectId: string): ProjectUiStateRow | null {
  const row = db
    .prepare('SELECT layout_json, updated_at FROM project_ui_state WHERE project_id = ?')
    .get(projectId) as ProjectUiStateStorageRow | undefined
  if (row === undefined) return null
  let parsed: unknown = undefined
  try {
    parsed = JSON.parse(row.layout_json)
  } catch {
    parsed = undefined // 损坏 JSON → 违规路径(默认布局)
  }
  const sanitized = sanitizeProjectLayout(parsed)
  return { layout: sanitized.layout, updatedAt: row.updated_at, reset: sanitized.reset, reason: sanitized.reason }
}

/**
 * 布局写入(UPSERT:同项目重复写 = 整体覆盖 + updated_at 刷新)。layout
 * 须为已过校验的合法形态(动词装配层二次校验之后的产物);未知项目 →
 * ERR_PROJECT_NOT_FOUND(优于裸 FK 错误,对齐 repos 前置校验惯例)。
 */
export function saveProjectLayout(db: RepoDb, projectId: string, layout: ProjectLayout, updatedAt: string): void {
  assertProjectExists(db, projectId)
  db
    .prepare(
      'INSERT INTO project_ui_state (project_id, layout_json, updated_at) VALUES (?, ?, ?) '
        + 'ON CONFLICT (project_id) DO UPDATE SET layout_json = excluded.layout_json, updated_at = excluded.updated_at',
    )
    .run(projectId, JSON.stringify(layout), updatedAt)
}
