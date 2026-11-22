// BugsRepo——project_bugs 行级读写门（plugin-project 1.9）。裸 SQL 白名单位；
// 弱引用列（source_task_id / recurrence_of / container_slug）零 FK，行级归属键 project_key
// NOT NULL（I5 派生失败拒写在 DDL 层兜底）。
import type Database from '@dsh-forge/lib-db'
import type { ProjectDbTables } from '../migrations.js'
import type { BugRow, BugStatus } from '../row-types.js'

interface BugDbRow {
  id: string
  project_key: string
  summary: string
  bug_desc: string
  trigger_desc: string
  expected: string
  actual: string
  suspected: string | null
  error_type: string | null
  bug_status: string
  commit_hash: string | null
  worktree: string | null
  branch: string | null
  unresolved_reason: string | null
  fix_approach: string | null
  source_task_id: string | null
  recurrence_of: string | null
  container_slug: string | null
  report_session_id: string | null
  fix_session_id: string | null
  fixer: string | null
  reporter: string
  created_at: string
  updated_at: string
}

function toStatus(s: string): BugStatus {
  if (s !== 'open' && s !== 'fixed' && s !== 'unresolved') throw new Error(`bug_status 越界: ${s}`)
  return s
}

function toRow(r: BugDbRow): BugRow {
  return {
    id: r.id,
    projectKey: r.project_key,
    summary: r.summary,
    bugDesc: r.bug_desc,
    triggerDesc: r.trigger_desc,
    expected: r.expected,
    actual: r.actual,
    suspected: r.suspected,
    errorType: r.error_type,
    bugStatus: toStatus(r.bug_status),
    commitHash: r.commit_hash,
    worktree: r.worktree,
    branch: r.branch,
    unresolvedReason: r.unresolved_reason,
    fixApproach: r.fix_approach,
    sourceTaskId: r.source_task_id,
    recurrenceOf: r.recurrence_of,
    containerSlug: r.container_slug,
    reportSessionId: r.report_session_id,
    fixSessionId: r.fix_session_id,
    fixer: r.fixer,
    reporter: r.reporter,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

const COLUMNS = `id, project_key, summary, bug_desc, trigger_desc, expected, actual, suspected, error_type, bug_status, commit_hash, worktree, branch, unresolved_reason, fix_approach, source_task_id, recurrence_of, container_slug, report_session_id, fix_session_id, fixer, reporter, created_at, updated_at`

export interface BugResolvePatch {
  bugStatus: BugStatus
  commitHash?: string
  worktree?: string
  branch?: string
  fixApproach?: string
  unresolvedReason?: string
  fixer?: string
  fixSessionId?: string
  updatedAt: string
}

export class BugsRepo {
  readonly #db: Database.Database
  readonly #tables: ProjectDbTables

  constructor(db: Database.Database, tables: ProjectDbTables) {
    this.#db = db
    this.#tables = tables
  }

  insert(row: BugRow): void {
    this.#db
      .prepare(
        `INSERT INTO ${this.#tables.bugs} (${COLUMNS})
         VALUES (@id, @projectKey, @summary, @bugDesc, @triggerDesc, @expected, @actual, @suspected, @errorType, @bugStatus, @commitHash, @worktree, @branch, @unresolvedReason, @fixApproach, @sourceTaskId, @recurrenceOf, @containerSlug, @reportSessionId, @fixSessionId, @fixer, @reporter, @createdAt, @updatedAt)`,
      )
      .run(row)
  }

  get(id: string): BugRow | undefined {
    const r = this.#db
      .prepare<[string], BugDbRow>(`SELECT ${COLUMNS} FROM ${this.#tables.bugs} WHERE id = ?`)
      .get(id)
    return r ? toRow(r) : undefined
  }

  /** 弱引用格式层校验消费面：recurrence_of 前驱在场性（悬空拒写在域服务，此处行级读门）。 */
  exists(id: string): boolean {
    return this.get(id) !== undefined
  }

  listByStatus(status: BugStatus): BugRow[] {
    return (
      this.#db
        .prepare<[string], BugDbRow>(
          `SELECT ${COLUMNS} FROM ${this.#tables.bugs} WHERE bug_status = ? ORDER BY created_at ASC, id ASC`,
        )
        .all(status) ?? []
    ).map(toRow)
  }

  listByProject(projectKey: string): BugRow[] {
    return (
      this.#db
        .prepare<[string], BugDbRow>(
          `SELECT ${COLUMNS} FROM ${this.#tables.bugs} WHERE project_key = ? ORDER BY created_at ASC, id ASC`,
        )
        .all(projectKey) ?? []
    ).map(toRow)
  }

  resolve(id: string, patch: BugResolvePatch): void {
    this.#db
      .prepare(
        `UPDATE ${this.#tables.bugs}
         SET bug_status = @bugStatus,
             commit_hash = COALESCE(@commitHash, commit_hash),
             fix_approach = COALESCE(@fixApproach, fix_approach),
             unresolved_reason = COALESCE(@unresolvedReason, unresolved_reason),
             fixer = COALESCE(@fixer, fixer),
             updated_at = @updatedAt
         WHERE id = @id`,
      )
      .run({
        id,
        bugStatus: patch.bugStatus,
        commitHash: patch.commitHash ?? null,
        fixApproach: patch.fixApproach ?? null,
        unresolvedReason: patch.unresolvedReason ?? null,
        fixer: patch.fixer ?? null,
        updatedAt: patch.updatedAt,
      })
  }

  /**
   * open 态守卫回填（plugin-project 1.11 归拢——并发窗口收口）：`WHERE id = ? AND bug_status = 'open'`
   * 单语句守卫，零行更新（终态竞争）返回 false，域服务据此拒 ERR_BUG_ALREADY_RESOLVED——
   * 证据/身份 await 窗口的并发防护由数据库层承担（core 同事务复检口径的 repo 等价面）。
   */
  resolveIfOpen(id: string, patch: BugResolvePatch): boolean {
    return (
      this.#db
        .prepare(
          `UPDATE ${this.#tables.bugs}
           SET bug_status = @bugStatus,
               commit_hash = COALESCE(@commitHash, commit_hash),
               worktree = COALESCE(@worktree, worktree),
               branch = COALESCE(@branch, branch),
               fix_approach = COALESCE(@fixApproach, fix_approach),
               unresolved_reason = COALESCE(@unresolvedReason, unresolved_reason),
               fixer = COALESCE(@fixer, fixer),
               fix_session_id = COALESCE(@fixSessionId, fix_session_id),
               updated_at = @updatedAt
           WHERE id = @id AND bug_status = 'open'`,
        )
        .run({
          id,
          bugStatus: patch.bugStatus,
          commitHash: patch.commitHash ?? null,
          worktree: patch.worktree ?? null,
          branch: patch.branch ?? null,
          fixApproach: patch.fixApproach ?? null,
          unresolvedReason: patch.unresolvedReason ?? null,
          fixer: patch.fixer ?? null,
          fixSessionId: patch.fixSessionId ?? null,
          updatedAt: patch.updatedAt,
        }).changes > 0
    )
  }

  /** 聚合：三态计数（project_key 可选圈定）。 */
  countsByStatus(projectKey?: string): Record<BugStatus, number> {
    const rows = (
      projectKey
        ? this.#db
            .prepare<[string], { s: string; n: number }>(
              `SELECT bug_status AS s, COUNT(*) AS n FROM ${this.#tables.bugs} WHERE project_key = ? GROUP BY bug_status`,
            )
            .all(projectKey)
        : this.#db
            .prepare<[], { s: string; n: number }>(
              `SELECT bug_status AS s, COUNT(*) AS n FROM ${this.#tables.bugs} GROUP BY bug_status`,
            )
            .all()
    ) ?? []
    const out: Record<BugStatus, number> = { open: 0, fixed: 0, unresolved: 0 }
    for (const r of rows) out[toStatus(r.s)] = r.n
    return out
  }
}
