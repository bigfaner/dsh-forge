// ProjectsRepo——project_projects 行级读写门（plugin-project 1.9）。裸 SQL 白名单位（唯一 SQL 持有处）；
// 归属键谓词（getByKey）与 R2 随动 DAO（updateMainPath 同事务重算 project_key = f(新 main 路径)）单点。
import type Database from '@dsh-forge/lib-db'
import { deriveDirName } from '@dsh-forge/lib-path'
import type { ProjectDbTables } from '../migrations.js'
import type { ProjectRow } from '../row-types.js'

interface ProjectDbRow {
  id: string
  project_key: string
  title: string
  forge_dir: string
  forge_dir_external: number
  worktree_dir: string
  sort_order: number | null
  archived: number
  created_at: string
  updated_at: string
}

function toRow(r: ProjectDbRow): ProjectRow {
  return {
    id: r.id,
    projectKey: r.project_key,
    title: r.title,
    forgeDir: r.forge_dir,
    forgeDirExternal: r.forge_dir_external === 1,
    worktreeDir: r.worktree_dir,
    sortOrder: r.sort_order,
    archived: r.archived === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

const COLUMNS = `id, project_key, title, forge_dir, forge_dir_external, worktree_dir, sort_order, archived, created_at, updated_at`

export class ProjectsRepo {
  readonly #db: Database.Database
  readonly #tables: ProjectDbTables

  constructor(db: Database.Database, tables: ProjectDbTables) {
    this.#db = db
    this.#tables = tables
  }

  /** 归属键纯函数投影 f(wsPath) 单源（lib-path deriveDirName = flatten@hash8）。 */
  projectKeyOf(wsPath: string): string {
    return deriveDirName(wsPath)
  }

  insert(row: ProjectRow): void {
    this.#db
      .prepare(
        `INSERT INTO ${this.#tables.projects} (${COLUMNS})
         VALUES (@id, @projectKey, @title, @forgeDir, @forgeDirExternal, @worktreeDir, @sortOrder, @archived, @createdAt, @updatedAt)`,
      )
      .run({
        ...row,
        forgeDirExternal: row.forgeDirExternal ? 1 : 0,
        archived: row.archived ? 1 : 0,
      })
  }

  get(id: string): ProjectRow | undefined {
    const r = this.#db
      .prepare<[string], ProjectDbRow>(`SELECT ${COLUMNS} FROM ${this.#tables.projects} WHERE id = ?`)
      .get(id)
    return r ? toRow(r) : undefined
  }

  /** 归属键谓词 DAO 单点：project_key → 行（查归属行 / suspected-move 自证）。 */
  getByKey(projectKey: string): ProjectRow | undefined {
    const r = this.#db
      .prepare<[string], ProjectDbRow>(`SELECT ${COLUMNS} FROM ${this.#tables.projects} WHERE project_key = ?`)
      .get(projectKey)
    return r ? toRow(r) : undefined
  }

  /** 读面四键字典序（sort_order→created_at→id，sort_order NULL 垫底）；默认滤归档。 */
  list(opts: { includeArchived?: boolean } = {}): ProjectRow[] {
    const filter = opts.includeArchived ? '' : `WHERE archived = 0`
    const rows = this.#db
      .prepare<[], ProjectDbRow>(
        `SELECT ${COLUMNS} FROM ${this.#tables.projects} ${filter}
         ORDER BY (sort_order IS NULL) ASC, sort_order ASC, created_at ASC, id ASC`,
      )
      .all()
    return rows.map(toRow)
  }

  updateTitle(id: string, title: string, updatedAt: string): void {
    this.#db
      .prepare(`UPDATE ${this.#tables.projects} SET title = ?, updated_at = ? WHERE id = ?`)
      .run(title, updatedAt, id)
  }

  updateWorktreeDir(id: string, worktreeDir: string, updatedAt: string): void {
    this.#db
      .prepare(`UPDATE ${this.#tables.projects} SET worktree_dir = ?, updated_at = ? WHERE id = ?`)
      .run(worktreeDir, updatedAt, id)
  }

  setArchived(id: string, archived: boolean, updatedAt: string): void {
    this.#db
      .prepare(`UPDATE ${this.#tables.projects} SET archived = ?, updated_at = ? WHERE id = ?`)
      .run(archived ? 1 : 0, updatedAt, id)
  }

  delete(id: string): void {
    this.#db.prepare(`DELETE FROM ${this.#tables.projects} WHERE id = ?`).run(id)
  }

  /**
   * R2（RED 锚⑥）：main 路径变更同事务随动——main 行 ws_path 与 project_key（= f(新路径)）
   * 同事务更新；任一步失败（含新路径撞 UNIQUE(ws_path)）整体回滚，key 与路径双双不变。
   */
  updateMainPath(projectId: string, oldWsPath: string, newWsPath: string, updatedAt: string): void {
    const apply = this.#db.transaction(() => {
      const changes = this.#db
        .prepare(
          `UPDATE ${this.#tables.workspaces}
           SET ws_path = ?
           WHERE project_id = ? AND member_role = 'main' AND ws_path = ?`,
        )
        .run(newWsPath, projectId, oldWsPath).changes
      if (changes !== 1) {
        throw new Error(`updateMainPath: main 行缺席或路径不符 (project=${projectId})`)
      }
      this.#db
        .prepare(`UPDATE ${this.#tables.projects} SET project_key = ?, updated_at = ? WHERE id = ?`)
        .run(deriveDirName(newWsPath), updatedAt, projectId)
    })
    apply()
  }
}
