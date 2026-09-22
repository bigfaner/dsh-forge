// workbench/repos/app-state — 单激活指针(任务 2.2)。
//
// Interface 1 动词落位:activateProject(写)/ getActiveProjectId /
// getActiveProject(读)。行级契约(er-diagram §app_state):key-value 单行,
// value 为 JSON 编码;单激活不变量为应用层事务纪律,不是 SQL 约束——
// app_state 无 FK(value 为 JSON 无法引用),「清旧 + 立新 + 引用有效性断言」
// 必须在同一 BEGIN IMMEDIATE 事务内完成,任何时刻至多一个 active_project_id
// 由 key 主键的单行性承载。移除激活项目的指针清空在 projects.removeProject
// 内完成;本模块的读取面对悬空指针防御性回退空,不抛 FK 错。

import { toProject, WorkbenchRepoError, type Project, type ProjectRow, type RepoDb } from './types.ts'

/** 保留键:单激活指针(er-diagram app_state.key)。 */
export const ACTIVE_PROJECT_KEY = 'active_project_id'

interface AppStateRow {
  readonly key: string
  readonly value: string
}

/** 解码 app_state.value(防御读:损坏 JSON 不炸读取路径,回退 null)。 */
function decodeActiveProjectId(value: string): string | null {
  try {
    const parsed: unknown = JSON.parse(value)
    return typeof parsed === 'string' ? parsed : null
  } catch {
    return null
  }
}

/** 当前激活项目 id;未激活(无行/空值/损坏值)→ null。 */
export function getActiveProjectId(db: RepoDb): string | null {
  const row = db.prepare('SELECT value FROM app_state WHERE key = ?').get(ACTIVE_PROJECT_KEY) as
    | Pick<AppStateRow, 'value'>
    | undefined
  return row === undefined ? null : decodeActiveProjectId(row.value)
}

/**
 * 当前激活项目(含 join 校验):指针悬空(项目已被移除而指针未随行清理的
 * 损坏态)时回退 null,不抛 FK 错——app_state 无 FK,读取面不放大存储损伤。
 */
export function getActiveProject(db: RepoDb): Project | null {
  const id = getActiveProjectId(db)
  if (id === null) return null
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined
  return row === undefined ? null : toProject(row)
}

/**
 * 激活(单事务内「引用有效性断言 + 清旧立新 + last_activated_at 迁移」):
 *
 *   1. 断言目标项目存在——不存在即 ERR_PROJECT_NOT_FOUND,事务回滚,
 *      原指针原样保留(违反序列不产生半迁移状态);
 *   2. app_state 单行 upsert(key 主键承载「至多一个 active_project_id」);
 *   3. projects.last_activated_at 置为本次激活时间(激活迁移时间)。
 */
export function activateProject(db: RepoDb, id: string): void {
  db.exec('BEGIN IMMEDIATE')
  try {
    const exists = db.prepare('SELECT id FROM projects WHERE id = ?').get(id)
    if (exists === undefined) {
      throw new WorkbenchRepoError('ERR_PROJECT_NOT_FOUND', `cannot activate project ${id}: it does not exist`)
    }
    db.prepare('INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(ACTIVE_PROJECT_KEY, JSON.stringify(id))
    db.prepare('UPDATE projects SET last_activated_at = ? WHERE id = ?').run(new Date().toISOString(), id)
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
