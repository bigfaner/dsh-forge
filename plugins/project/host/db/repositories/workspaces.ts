// WorkspacesRepo——project↔workspace 关系表行级读写门（plugin-project 1.9）。裸 SQL 白名单位；
// R4 先行 DAO（insertProjectWithMain 同事务双行）与归属键谓词 DAO（findByWsPath /
// getKeyByMainPath）单点——调用方零裸 SQL。
import type Database from 'better-sqlite3'
import type { ProjectDbTables } from '../migrations.js'
import type { ProjectRow, WorkspaceRow, WorkspaceMemberRole } from '../row-types.js'

interface WorkspaceDbRow {
  id: number
  project_id: string
  workspace_id: string
  ws_path: string
  member_role: string
  bound_at: string
  created_at: string
}

function toRole(r: string): WorkspaceMemberRole {
  if (r !== 'main' && r !== 'worktree') throw new Error(`member_role 越界: ${r}`)
  return r
}

function toRow(r: WorkspaceDbRow): WorkspaceRow {
  return {
    id: r.id,
    projectId: r.project_id,
    workspaceId: r.workspace_id,
    wsPath: r.ws_path,
    memberRole: toRole(r.member_role),
    boundAt: r.bound_at,
    createdAt: r.created_at,
  }
}

const COLUMNS = `id, project_id, workspace_id, ws_path, member_role, bound_at, created_at`

export class WorkspacesRepo {
  readonly #db: Database.Database
  readonly #tables: ProjectDbTables

  constructor(db: Database.Database, tables: ProjectDbTables) {
    this.#db = db
    this.#tables = tables
  }

  insert(row: WorkspaceRow): void {
    this.#db
      .prepare(
        `INSERT INTO ${this.#tables.workspaces} (project_id, workspace_id, ws_path, member_role, bound_at, created_at)
         VALUES (@projectId, @workspaceId, @wsPath, @memberRole, @boundAt, @createdAt)`,
      )
      .run({ ...row, id: undefined })
  }

  /**
   * R4：项目实体行 + main 关系行同事务双写（禁拆两条语句）——拆开即撞约束残留半态。
   * 撞键（UNIQUE(ws_path) / 主行唯一索引）整体回滚，库内零残留。
   */
  insertProjectWithMain(project: ProjectRow, main: WorkspaceRow): void {
    const apply = this.#db.transaction(() => {
      this.#db
        .prepare(
          `INSERT INTO ${this.#tables.projects} (id, project_key, title, forge_dir, forge_dir_external, worktree_dir, sort_order, archived, created_at, updated_at)
           VALUES (@id, @projectKey, @title, @forgeDir, @forgeDirExternal, @worktreeDir, @sortOrder, @archived, @createdAt, @updatedAt)`,
        )
        .run({
          ...project,
          forgeDirExternal: project.forgeDirExternal ? 1 : 0,
          archived: project.archived ? 1 : 0,
        })
      this.#db
        .prepare(
          `INSERT INTO ${this.#tables.workspaces} (project_id, workspace_id, ws_path, member_role, bound_at, created_at)
           VALUES (@projectId, @workspaceId, @wsPath, @memberRole, @boundAt, @createdAt)`,
        )
        .run({ ...main, id: undefined })
    })
    apply()
  }

  get(id: number): WorkspaceRow | undefined {
    const r = this.#db
      .prepare<unknown[], WorkspaceDbRow>(`SELECT ${COLUMNS} FROM ${this.#tables.workspaces} WHERE id = ?`)
      .get(id)
    return r ? toRow(r) : undefined
  }

  /** 对账修引用 DAO 单点（relink/recreate 单向修应用侧——workspace_id 弱引用重锚）。 */
  updateWorkspaceRef(id: number, workspaceId: string): void {
    this.#db
      .prepare(`UPDATE ${this.#tables.workspaces} SET workspace_id = ? WHERE id = ?`)
      .run(workspaceId, id)
  }

  /** 归属键谓词 DAO 单点：ws_path → 关系行（anchor 链 / 防重挂判据消费）。 */
  findByWsPath(wsPath: string): WorkspaceRow | undefined {
    const r = this.#db
      .prepare<unknown[], WorkspaceDbRow>(`SELECT ${COLUMNS} FROM ${this.#tables.workspaces} WHERE ws_path = ?`)
      .get(wsPath)
    return r ? toRow(r) : undefined
  }

  /** 归属键谓词 DAO 单点：main 行 ws_path（git 主树锚）→ project_key；非 main 行不作归属锚。 */
  getKeyByMainPath(mainWsPath: string): string | undefined {
    const r = this.#db
      .prepare<unknown[], { project_key: string }>(
        `SELECT p.project_key AS project_key
         FROM ${this.#tables.projects} p
         JOIN ${this.#tables.workspaces} w ON w.project_id = p.id
         WHERE w.ws_path = ? AND w.member_role = 'main'`,
      )
      .get(mainWsPath)
    return r?.project_key
  }

  getMain(projectId: string): WorkspaceRow | undefined {
    const r = this.#db
      .prepare<unknown[], WorkspaceDbRow>(
        `SELECT ${COLUMNS} FROM ${this.#tables.workspaces} WHERE project_id = ? AND member_role = 'main'`,
      )
      .get(projectId)
    return r ? toRow(r) : undefined
  }

  listByProject(projectId: string): WorkspaceRow[] {
    return (
      this.#db
        .prepare<unknown[], WorkspaceDbRow>(
          `SELECT ${COLUMNS} FROM ${this.#tables.workspaces}
           WHERE project_id = ? ORDER BY created_at ASC, id ASC`,
        )
        .all(projectId) ?? []
    ).map(toRow)
  }

  deleteById(id: number): void {
    this.#db.prepare(`DELETE FROM ${this.#tables.workspaces} WHERE id = ?`).run(id)
  }

  deleteByWsPath(wsPath: string): void {
    this.#db.prepare(`DELETE FROM ${this.#tables.workspaces} WHERE ws_path = ?`).run(wsPath)
  }

  deleteByProject(projectId: string): void {
    this.#db.prepare(`DELETE FROM ${this.#tables.workspaces} WHERE project_id = ?`).run(projectId)
  }
}
