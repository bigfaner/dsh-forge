// workbench/repos/projects — 注册表 CRUD(任务 2.2)。
//
// Interface 1 动词落位:registerProject / updateProject / removeProject /
// listProjects。行级契约(er-diagram §projects):code_root UNIQUE + 注册时
// 规范化(分隔符/尾斜杠统一,保证 UNIQUE 比对可靠);in_repo/external 的
// 相干性由 schema-v1.sql 行级 CHECK 兜底(路径语义校验 = registry 层,任务 2.3)。
//
// removeProject:FK CASCADE 在引擎层波及 session_links 与三张派生快照表
// (本层对快照表零手写删除——「快照表不动」);app_state 无 FK,激活指针由
// 本函数在事务内显式清空(er-diagram §app_state 注记),保证
// removeProject 后 getActiveProject 不再返回被删项目、不抛 FK 错。

import { resolve } from 'node:path'
import {
  isUniqueViolation,
  toProject,
  WorkbenchRepoError,
  type Project,
  type ProjectPatch,
  type ProjectRow,
  type RegisterProjectInput,
  type RepoDb,
} from './types.ts'

/**
 * code_root 规范化:resolve 后统一为正斜杠、去尾斜杠(盘符根/POSIX 根保留
 * 原形)。UNIQUE(code_root) 的可比性依赖这一步——同一目录的不同分隔符/
 * 尾斜杠写法必须折叠为同一存储值。
 */
function normalizeCodeRoot(codeRoot: string): string {
  const resolved = resolve(codeRoot).replaceAll('\\', '/')
  if (resolved === '/' || /^[A-Za-z]:\/$/.test(resolved)) return resolved
  return resolved.replace(/\/+$/, '')
}

/** 缺省显示名 = 规范化 code_root 的最后一段目录名。 */
function defaultDisplayName(codeRoot: string): string {
  const idx = codeRoot.lastIndexOf('/')
  const base = idx === -1 ? codeRoot : codeRoot.slice(idx + 1)
  return base === '' ? codeRoot : base
}

function selectProjectRow(db: RepoDb, id: string): ProjectRow | undefined {
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined
}

/**
 * 注册项目:生成 uuid 主键、规范化 code_root、落缺省显示名。
 * UNIQUE 冲突 → ERR_PROJECT_EXISTS;行级 CHECK 失败(in_repo 带 path /
 * external 缺 path)原样上抛——该输入相干性应由 registry 层前置校验。
 */
export function registerProject(db: RepoDb, input: RegisterProjectInput): Project {
  const id = crypto.randomUUID()
  const codeRoot = normalizeCodeRoot(input.codeRoot)
  const displayName = input.displayName?.trim() || defaultDisplayName(codeRoot)
  try {
    db.prepare(
      'INSERT INTO projects (id, display_name, code_root, doc_location_type, doc_location_path, created_at, last_activated_at) VALUES (?, ?, ?, ?, ?, ?, NULL)',
    ).run(id, displayName, codeRoot, input.docLocationType, input.docLocationPath ?? null, new Date().toISOString())
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new WorkbenchRepoError('ERR_PROJECT_EXISTS', `code root ${codeRoot} is already registered`)
    }
    throw error
  }
  const row = selectProjectRow(db, id)
  if (row === undefined) {
    throw new WorkbenchRepoError('ERR_PROJECT_NOT_FOUND', `project ${id} vanished right after registration`)
  }
  return toProject(row)
}

/** 列表查询(注册序稳定输出:id 升序兜底同刻创建)。 */
export function listProjects(db: RepoDb): Project[] {
  const rows = db.prepare('SELECT * FROM projects ORDER BY created_at, id').all() as ProjectRow[]
  return rows.map(toProject)
}

/**
 * patch 更新:rename(displayName)与 repoint(docLocationType+Path 成对)。
 * patch 与现行行合并后不相干(in_repo 留 path 等)由行级 CHECK 原样上抛,
 * UPDATE 原子回滚;未知 id → ERR_PROJECT_NOT_FOUND。
 */
export function updateProject(db: RepoDb, id: string, patch: ProjectPatch): Project {
  const current = selectProjectRow(db, id)
  if (current === undefined) {
    throw new WorkbenchRepoError('ERR_PROJECT_NOT_FOUND', `project ${id} does not exist`)
  }
  const displayName = patch.displayName !== undefined ? patch.displayName : current.display_name
  const docLocationType = patch.docLocationType ?? current.doc_location_type
  const docLocationPath = patch.docLocationPath !== undefined ? patch.docLocationPath : current.doc_location_path
  const changes = db
    .prepare('UPDATE projects SET display_name = ?, doc_location_type = ?, doc_location_path = ? WHERE id = ?')
    .run(displayName, docLocationType, docLocationPath, id)
  if (Number(changes.changes) !== 1) {
    throw new WorkbenchRepoError('ERR_PROJECT_NOT_FOUND', `project ${id} does not exist`)
  }
  const row = selectProjectRow(db, id)
  if (row === undefined) {
    throw new WorkbenchRepoError('ERR_PROJECT_NOT_FOUND', `project ${id} vanished right after update`)
  }
  return toProject(row)
}

/**
 * 按 id 移除:单事务内「显式清激活指针 + 删项目行」;session_links 与三张
 * 快照表由 FK CASCADE 波及(本层不手写快照删除)。移除不动项目磁盘文件,
 * 也移除非激活项目的指针语义之外的任何状态。未知 id → ERR_PROJECT_NOT_FOUND。
 */
export function removeProject(db: RepoDb, id: string): void {
  db.exec('BEGIN IMMEDIATE')
  try {
    // app_state 无 FK(value 为 JSON):指向被删项目的激活指针必须显式清空。
    db.prepare("DELETE FROM app_state WHERE key = 'active_project_id' AND value = ?").run(JSON.stringify(id))
    const changes = db.prepare('DELETE FROM projects WHERE id = ?').run(id)
    if (Number(changes.changes) !== 1) {
      throw new WorkbenchRepoError('ERR_PROJECT_NOT_FOUND', `project ${id} does not exist`)
    }
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
