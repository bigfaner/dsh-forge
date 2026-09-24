// workbench/migration/pipeline — 一次性显式迁移管线(任务 1.4,Interface 4 第 1-6 步内核侧)。
//
// 相位序(tech-design §Interface 4;顺序钉定,禁重排):
//   ①守卫  dispatch.ended_at IS NULL 计数 >0 → ERR_MIGRATION_GUARD(UI 列
//          在跑清单);同项目迁移中重复发起 → ERR_MIGRATION_IN_PROGRESS;
//          已迁移项目(data_authority='sqlite')再发起 → ERR_MIGRATION_GUARD
//          (一次性语义;设计错误表无专属码,折入守卫、消息显式说明)。
//   ②备份  backup.ts:库文件三件套 + 文档树 tasks/ 拷贝 →
//          <userData>/workbench/backups/<projectId>-<ts>/(默认权限路径)。
//   ③摄入  ingest.ts:单事务内全量 index.json → task 权威行。
//   ④对拍  verify.ts:task 表 vs task_snapshot 派生投影四字段零差异;
//          差异 → ERR_MIGRATION_VERIFY + 整体回滚。
//   ⑤切读  同事务 UPDATE projects SET data_authority='sqlite'(+migrated_at/
//          backup_path)—— Hard Rule:置位与全量摄入同事务。
//   ⑥归档  index.json → index.json.migrated-<ts>(改名,零内容改写)。
//   COMMIT 在归档成功之后:归档改名失败或 COMMIT 失败 → 事务 ROLLBACK
//   (库回迁移前态)+ 文档树恢复(改名回滚,备份兜底)—— 任何路径都
//   不出现半迁移中间态;重试幂等可成功(失败后状态 ≡ 迁移前态)。
//
// 事务边界:迁移大事务 = task 行摄入 + projects 增列置位(仅此两表);
// migration_event 审计行不进大事务 —— backup 相在事务开启前落档(成败
// 均留痕),ingest/verify/switch/archive 相在大事务内落档(随迁移原子
// 提交),失败路径在 ROLLBACK 之后补记「失败相 + rollback」两行(失败
// 审计不被事务回滚吞掉;成功路径 audit 与迁移同生共死)。
//
// migration_progress 事件(WorkbenchEvent v2):每相位完成即推
// { projectId, phase, result };终态对话框/进度呈现归消费面(1.7/向导)。
// getMigrationStatus(Interface 1):authority/deviated/migratedAt/lastEvent。

import { existsSync, readdirSync } from 'node:fs'
import { rename } from 'node:fs/promises'
import { join } from 'node:path'
import type { WorkbenchEvent, MigrationPhase } from '../indexer/diff.ts'
import type { Project, RepoDb } from '../repos/types.ts'
import { WorkbenchRepoError } from '../repos/types.ts'
import { resolveWorkbenchDbPath } from '../store/db.ts'
import { createMigrationBackup, fileStampOf, restoreDocTreeAfterFailure } from './backup.ts'
import { ingestTaskIndexes } from './ingest.ts'
import { summarizeVerifyReport, verifyMigrationParity, type MigrationVerifyReport } from './verify.ts'

/** 迁移域错误码(tech-design §Error Types & Codes 迁移段;封闭三码)。 */
export type MigrationErrorCode = 'ERR_MIGRATION_GUARD' | 'ERR_MIGRATION_VERIFY' | 'ERR_MIGRATION_IN_PROGRESS'

/** 迁移域错误;`report` 仅 ERR_MIGRATION_VERIFY 携带(对拍全文,IPC detail 面)。 */
export class MigrationDomainError extends Error {
  constructor(
    readonly code: MigrationErrorCode,
    message: string,
    readonly report?: MigrationVerifyReport,
  ) {
    super(message)
    this.name = 'MigrationDomainError'
  }
}

// ---------------------------------------------------------------------------
// migration_event 审计面(schema-v2.sql §9;行形态 = 表形态,零映射)
// ---------------------------------------------------------------------------

/** migration_event 行 DTO(Interface 1 lastEvent / MigrationEvent 载荷)。 */
export interface MigrationEventRecord {
  readonly id: string
  readonly projectId: string
  readonly phase: MigrationPhase
  readonly result: 'ok' | 'fail'
  readonly detailJson: string | null
  readonly at: string
}

interface MigrationEventRow {
  readonly id: string
  readonly project_id: string
  readonly phase: MigrationPhase
  readonly result: 'ok' | 'fail'
  readonly detail_json: string | null
  readonly at: string
}

/** 审计留档(单行 INSERT;事务归属由调用相位决定,见模块头)。 */
export function recordMigrationEvent(
  db: RepoDb,
  input: {
    readonly projectId: string
    readonly phase: MigrationPhase
    readonly result: 'ok' | 'fail'
    readonly detail: unknown
    readonly at: string
  },
): void {
  db.prepare('INSERT INTO migration_event (id, project_id, phase, result, detail_json, at) VALUES (?, ?, ?, ?, ?, ?)').run(
    crypto.randomUUID(),
    input.projectId,
    input.phase,
    input.result,
    JSON.stringify(input.detail),
    input.at,
  )
}

function toEventRecord(row: MigrationEventRow): MigrationEventRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    phase: row.phase,
    result: row.result,
    detailJson: row.detail_json,
    at: row.at,
  }
}

/** 项目迁移审计全量(时间正序;可回查面)。 */
export function listMigrationEvents(db: RepoDb, projectId: string): MigrationEventRecord[] {
  const rows = db
    .prepare('SELECT * FROM migration_event WHERE project_id = ? ORDER BY at, rowid')
    .all(projectId) as MigrationEventRow[]
  return rows.map(toEventRecord)
}

/** 最近一笔审计行(无 → null;同刻多行取后写者)。 */
function getLatestMigrationEvent(db: RepoDb, projectId: string): MigrationEventRecord | null {
  const row = db
    .prepare('SELECT * FROM migration_event WHERE project_id = ? ORDER BY at DESC, rowid DESC LIMIT 1')
    .get(projectId) as MigrationEventRow | undefined
  return row === undefined ? null : toEventRecord(row)
}

// ---------------------------------------------------------------------------
// 状态读取(getMigrationStatus 装配面)
// ---------------------------------------------------------------------------

/** Interface 1 getMigrationStatus 返回形态。 */
export interface MigrationStatus {
  readonly authority: 'files' | 'sqlite'
  readonly deviated: boolean
  readonly migratedAt: string | null
  readonly lastEvent: MigrationEventRecord | null
}

interface ProjectMigrationRow {
  readonly data_authority: 'files' | 'sqlite'
  readonly deviated: number
  readonly migrated_at: string | null
}

function readProjectMigrationRow(db: RepoDb, projectId: string): ProjectMigrationRow {
  const row = db
    .prepare('SELECT data_authority, deviated, migrated_at FROM projects WHERE id = ?')
    .get(projectId) as ProjectMigrationRow | undefined
  if (row === undefined) {
    throw new WorkbenchRepoError('ERR_PROJECT_NOT_FOUND', `project ${projectId} does not exist`)
  }
  return row
}

export function getMigrationStatus(db: RepoDb, projectId: string): MigrationStatus {
  const row = readProjectMigrationRow(db, projectId)
  return {
    authority: row.data_authority,
    deviated: row.deviated !== 0,
    migratedAt: row.migrated_at,
    lastEvent: getLatestMigrationEvent(db, projectId),
  }
}

// ---------------------------------------------------------------------------
// 管线服务(startMigration 守卫/相位编排)
// ---------------------------------------------------------------------------

/** 测试注错缝(仅 AC-2 回滚矩阵消费;生产面恒缺省)。 */
export interface MigrationFaults {
  /** 摄入第 N 行后抛错(模拟「摄入中」失败)。 */
  readonly failIngestAfterRows?: number
  /** 归档指定(或任一)feature 的 index.json 改名时抛错(「归档失败」)。 */
  readonly failArchiveForSlug?: string | true
}

export interface MigrationPipelineDeps {
  readonly db: RepoDb
  readonly userDataPath: string
  /** 库文件路径(缺省 = resolveWorkbenchDbPath(userDataPath),boot 落位同源)。 */
  readonly dbPath?: string
  /** 项目行读取(services 注入 findProjectRow;不存在 → null)。 */
  readonly loadProject: (projectId: string) => Project | null
  /** migration_progress 事件推送端(相位完成即推)。 */
  readonly onEvent: (event: WorkbenchEvent) => void
  /** 时钟缝(缺省真实时钟;测试注入定值)。 */
  readonly now?: () => Date
  /**
   * 注错缝(测试)。静态对象或逐次解析器:解析器在每次 startMigration
   * 入口重新求值(单次运行内恒定;重试 = 新调用 = 新求值 —— 6.4 SC2 的
   * 「注错 → 回滚 → 清错 → 重试成功」旅程契约,env 缝族见 faults-stub.ts)。
   */
  readonly faults?: MigrationFaults | (() => MigrationFaults | undefined)
}

/** 本模块装配产物(Interface 1 迁移动词对)。 */
export interface MigrationService {
  getMigrationStatus(projectId: string): MigrationStatus
  startMigration(projectId: string): Promise<{ started: true }>
}

/** 迁移中的项目集合(单进程内核;startMigration 异步 IO 窗口内生效)。 */
const migrationsInFlight = new Set<string>()

/** 在跑编排计数(Interface 4 ①守卫判据:dispatch.ended_at IS NULL)。 */
function countRunningDispatches(db: RepoDb, projectId: string): number {
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM dispatch WHERE project_id = ? AND ended_at IS NULL')
    .get(projectId) as { readonly n: number | bigint }
  return Number(row.n)
}

/** 归档:index.json → index.json.migrated-<stamp>(逐 feature 改名;注错缝在内)。 */
async function archiveIndexes(
  featuresRoot: string,
  stamp: string,
  failArchiveForSlug?: string | true,
): Promise<Record<string, string>> {
  const renamed: Record<string, string> = {}
  let dirents: ReadonlyArray<{ readonly name: string; readonly isDirectory: () => boolean }>
  try {
    dirents = readdirSync(featuresRoot, { withFileTypes: true })
  } catch {
    return renamed
  }
  // 字典序钉定(与 backup/ingest 的 feature 枚举同口径):失败注入与恢复
  // 断言不依赖平台 readdir 顺序。
  const ordered = [...dirents].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  for (const dirent of ordered) {
    if (!dirent.isDirectory()) continue
    const indexPath = join(featuresRoot, dirent.name, 'tasks', 'index.json')
    if (!existsSync(indexPath)) continue
    if (failArchiveForSlug === true || failArchiveForSlug === dirent.name) {
      throw new Error(`injected archive failure for feature ${dirent.name} (test fault)`)
    }
    const archivedName = `index.json.migrated-${stamp}`
    await rename(indexPath, join(featuresRoot, dirent.name, 'tasks', archivedName))
    renamed[dirent.name] = archivedName
  }
  return renamed
}

export function createMigrationService(deps: MigrationPipelineDeps): MigrationService {
  const { db } = deps
  const dbPath = deps.dbPath ?? resolveWorkbenchDbPath(deps.userDataPath)
  const clock = deps.now ?? (() => new Date())

  const pushProgress = (projectId: string, phase: MigrationPhase, result: 'ok' | 'fail'): void => {
    deps.onEvent({ type: 'migration_progress', projectId, phase, result })
  }

  return {
    getMigrationStatus(projectId: string): MigrationStatus {
      return getMigrationStatus(db, projectId)
    },

    async startMigration(projectId: string): Promise<{ started: true }> {
      // ①守卫(全同步面):项目存在 → 在跑判定 → 一次性判定 → 编排在跑计数。
      const project = deps.loadProject(projectId)
      if (project === null) {
        throw new WorkbenchRepoError('ERR_PROJECT_NOT_FOUND', `project ${projectId} does not exist`)
      }
      if (migrationsInFlight.has(projectId)) {
        throw new MigrationDomainError(
          'ERR_MIGRATION_IN_PROGRESS',
          `project ${projectId} already has a migration in flight (progress events carry the current phase; retry after it settles)`,
        )
      }
      const migrationRow = readProjectMigrationRow(db, projectId)
      if (migrationRow.data_authority === 'sqlite') {
        throw new MigrationDomainError(
          'ERR_MIGRATION_GUARD',
          `project ${projectId} is already migrated (data_authority='sqlite', migrated_at=${String(migrationRow.migrated_at)}) — migration is one-shot; restore the doc tree from ${'<userData>'}/workbench/backups/ before re-migrating`,
        )
      }
      const running = countRunningDispatches(db, projectId)
      if (running > 0) {
        throw new MigrationDomainError(
          'ERR_MIGRATION_GUARD',
          `project ${projectId} has ${String(running)} running dispatch(es) (dispatch.ended_at IS NULL) — let them settle before migrating (PRD 硬约束:在跑编排阻断迁移)`,
        )
      }

      migrationsInFlight.add(projectId)
      // 注错缝求值(入口一次,单次运行内恒定):静态对象原样;解析器逐次
      // startMigration 重新求值 —— 重试腿清错后同服务可成功(6.4 SC2)。
      const faults = typeof deps.faults === 'function' ? deps.faults() : deps.faults
      // 文档根解析口径同 indexer/scan.resolveFeaturesDir(docBase = 仓外文档
      // 路径 ?? codeRoot;三分模型,BIZ-workbench-001)。
      const featuresRoot = join(project.docLocationPath ?? project.codeRoot, 'docs', 'features')
      try {
        const stamp = fileStampOf(clock())

        // ②备份(相位内失败:零库写零文档改动,留档即抛,无 rollback 相)。
        let backupPath = ''
        try {
          const outcome = await createMigrationBackup({
            userDataPath: deps.userDataPath,
            projectId,
            dbPath,
            featuresRoot,
            stamp,
          })
          backupPath = outcome.backupPath
          recordMigrationEvent(db, {
            projectId,
            phase: 'backup',
            result: 'ok',
            detail: { backupPath: outcome.backupPath, dbFiles: outcome.dbFiles, taskDirs: outcome.taskDirs },
            at: clock().toISOString(),
          })
          pushProgress(projectId, 'backup', 'ok')
        } catch (error) {
          recordMigrationEvent(db, {
            projectId,
            phase: 'backup',
            result: 'fail',
            detail: { reason: String(error instanceof Error ? error.message : error) },
            at: clock().toISOString(),
          })
          pushProgress(projectId, 'backup', 'fail')
          throw error
        }

        // ③④⑤⑥同事务(摄入 → 对拍 → 切读 → 归档),COMMIT 收口在归档后。
        let failedPhase: 'ingest' | 'verify' | 'switch' | 'archive' = 'ingest'
        let verifyReport: MigrationVerifyReport | null = null
        let txOpen = true
        try {
          db.exec('BEGIN IMMEDIATE')
          const ingestOutcome = ingestTaskIndexes({
            db,
            projectId,
            featuresRoot,
            afterRow: (rowsSoFar) => {
              if (faults?.failIngestAfterRows === rowsSoFar) {
                throw new Error(`injected ingest failure after ${String(rowsSoFar)} row(s) (test fault)`)
              }
            },
          })
          recordMigrationEvent(db, {
            projectId,
            phase: 'ingest',
            result: 'ok',
            detail: ingestOutcome,
            at: clock().toISOString(),
          })

          failedPhase = 'verify'
          verifyReport = verifyMigrationParity(db, projectId)
          if (!verifyReport.ok) {
            // 对拍差异:verify 相以 fail 留档(rollback 相 detail 携带全报告),
            // 随后统一走整体回滚路径。
            throw new MigrationDomainError('ERR_MIGRATION_VERIFY', summarizeVerifyReport(verifyReport), verifyReport)
          }
          recordMigrationEvent(db, {
            projectId,
            phase: 'verify',
            result: 'ok',
            detail: verifyReport,
            at: clock().toISOString(),
          })

          failedPhase = 'switch'
          const switchedAt = clock().toISOString()
          db.prepare("UPDATE projects SET data_authority = 'sqlite', migrated_at = ?, backup_path = ? WHERE id = ?").run(
            switchedAt,
            backupPath,
            projectId,
          )
          recordMigrationEvent(db, {
            projectId,
            phase: 'switch',
            result: 'ok',
            detail: { authority: 'sqlite', migratedAt: switchedAt, backupPath },
            at: clock().toISOString(),
          })

          failedPhase = 'archive'
          const renamed = await archiveIndexes(featuresRoot, stamp, faults?.failArchiveForSlug)
          recordMigrationEvent(db, {
            projectId,
            phase: 'archive',
            result: 'ok',
            detail: { renamed, stamp },
            at: clock().toISOString(),
          })

          db.exec('COMMIT')
          txOpen = false
          for (const phase of ['ingest', 'verify', 'switch', 'archive'] as const) {
            pushProgress(projectId, phase, 'ok')
          }
          return { started: true }
        } catch (error) {
          // 整体回滚:事务 ROLLBACK(库回迁移前态)→ 文档树恢复(改名回滚,
          // 备份兜底)→ 失败相 + rollback 补记(事务外,审计不被吞)。
          if (txOpen) {
            try {
              db.exec('ROLLBACK')
            } catch {
              // 连接可能已不可用;优先重抛原始错误。
            }
            txOpen = false
          }
          let restore: { renamedBack: string[]; restoredFromBackup: string[] } = { renamedBack: [], restoredFromBackup: [] }
          try {
            restore = await restoreDocTreeAfterFailure({ featuresRoot, backupPath })
          } catch {
            // 恢复失败也必须让原始错误先达调用方;restore 空值如实入档。
          }
          const reason = String(error instanceof Error ? error.message : error)
          try {
            recordMigrationEvent(db, {
              projectId,
              phase: failedPhase,
              result: 'fail',
              detail: failedPhase === 'verify' && verifyReport !== null ? { reason, verifyReport } : { reason },
              at: clock().toISOString(),
            })
            recordMigrationEvent(db, {
              projectId,
              phase: 'rollback',
              result: 'ok',
              detail: { failedPhase, reason, docTree: restore, verifyReport: verifyReport ?? undefined },
              at: clock().toISOString(),
            })
          } catch {
            // 审计写失败不吞原始错误(shellLog 侧由 handlers 兜底)。
          }
          pushProgress(projectId, failedPhase, 'fail')
          pushProgress(projectId, 'rollback', 'ok')
          throw error
        }
      } finally {
        migrationsInFlight.delete(projectId)
      }
    },
  }
}
