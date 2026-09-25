// workbench/migration/reingest-watcher — 外部写自动重摄入与偏离标记(任务 1.5,Interface 4 第 7 步 / T3)。
//
// 裁决背景(tech-design §Interface 4.7 + §Error Handling·感知面,PRD
// G8/Story 8):已迁移项目(data_authority='sqlite')上,外部 CLI 过渡期
// 仍以 `tasks/index.json` 为权威写目标 —— 迁移归档后该文件的复现/变更即
// 非内核发起的外部写。本模块挂接 M2 watcher 感知基座(watch.ts 的 scan
// seam + services rescan,每轮感知扫描后同步调用 afterScan):
//
//   检出   已迁移项目文档树下存在任一 `tasks/index.json`(迁移已将全部
//          index.json 归档 → 存在即外部复现;内核在 sqlite 项目上零文件写,
//          故存在性即充分判据,零宿主侵入);
//   去重   复现集内容指纹(sha256,slug 集合)与最近一笔 reingest 审计
//          (无论成败)一致 → 静默跳过 —— 同一外部写被感知 N 轮只回收一次,
//          失败态也不逐轮重试刷屏(文件再变 → 指纹变 → 再回收);
//   偏离   projects.deviated=1(独立语句,先于重摄入提交 —— 失败路径
//          标记保持,AC-3)+ deviation_detected 事件(tech-design
//          §Interface 1;feature 级形态归 4.2);
//   重摄入 单事务:逐复现 feature 先删后插(task-repo 唯一写入口,
//          行集 = collectFeatureIngestRows,与 1.4 摄入同一映射)→
//          verifyMigrationParity 同一对拍校验(task vs task_snapshot,
//          快照已由同轮 M2 扫描更新为外部内容)→ ok 审计随事务提交;
//          失败 → 整体 ROLLBACK(零半摄入)+ 事务外 fail 审计携带原因
//          (对拍差异携带全报告)+ migration_progress(reingest/fail);
//   纪律   不阻断外部会话:复现的 index.json 留在原位不归档不清除(双
//          形态互不破坏);回收失败仅可观察(标记 + 日志 + 审计,禁弹窗,
//          M2 sync_state 感知面模式延续)—— afterScan 永不抛错。
//
// 幂等性(AC-2):先删后插为整组替换,同一内容重复回收收敛到同一行集;
// 指纹去重挡住「同一外部写多轮感知」的重复回收;未迁移(files)项目
// 直接短路返回(AC-4:M2 感知路径零行为变化)。

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { shellLog } from '../../log.ts'
import type { WorkbenchEvent } from '../indexer/diff.ts'
import { resolveFeaturesDir, type ScanTarget } from '../indexer/scan.ts'
import type { RepoDb } from '../repos/types.ts'
import { deleteTasksByFeature, getProjectTaskAuthority, insertTask } from '../tasks/task-repo.ts'
import { recordMigrationEvent, MigrationDomainError, type MigrationEventRecord } from './pipeline.ts'
import { collectFeatureIngestRows } from './ingest.ts'
import { summarizeVerifyReport, verifyMigrationParity, type MigrationVerifyReport } from './verify.ts'

/** 感知面 log code(M1 口径:非致命回收失败收敛于本地结构化 log,不弹 UI)。 */
const LOG_CODE_REINGEST = 'WORKBENCH_REINGEST'
const LOG_CODE_REINGEST_ERROR = 'ERR_WORKBENCH_REINGEST'

type WatchLog = Pick<typeof shellLog, 'info' | 'warn'>

/** 复现 index.json 的内容指纹(reingest 审计 detail.indexes 载荷形态)。 */
export interface ReingestIndexPrint {
  readonly slug: string
  readonly sha256: string
}

/** ok 相 detail 载荷(migration_event.detail_json)。 */
export interface ReingestOkDetail {
  readonly rows: number
  readonly features: readonly { readonly slug: string; readonly taskCount: number }[]
  readonly indexes: readonly ReingestIndexPrint[]
  readonly verifyReport: MigrationVerifyReport
}

/** fail 相 detail 载荷(对拍差异携带全报告)。 */
export interface ReingestFailDetail {
  readonly reason: string
  readonly indexes: readonly ReingestIndexPrint[]
  readonly verifyReport?: MigrationVerifyReport
}

export interface ReingestHookDeps {
  readonly db: RepoDb
  /** 时钟缝(缺省真实时钟;测试注入定值)。 */
  readonly now?: () => Date
  /** 日志缝(缺省 shellLog;测试注入观测)。 */
  readonly log?: WatchLog
}

/** 挂接 M2 感知基座的回收钩子(每轮感知扫描后调用;同步、永不抛错)。 */
export interface ReingestHook {
  afterScan(target: ScanTarget): WorkbenchEvent[]
}

/** 文档树下复现了 index.json 的 feature slug(字典序;存在即外部写)。 */
function listReproducedIndexSlugs(featuresRoot: string): string[] {
  let dirents: ReadonlyArray<{ readonly name: string; readonly isDirectory: () => boolean }>
  try {
    dirents = readdirSync(featuresRoot, { withFileTypes: true })
  } catch {
    return []
  }
  return dirents
    .filter(dirent => dirent.isDirectory() && existsSync(join(featuresRoot, dirent.name, 'tasks', 'index.json')))
    .map(dirent => dirent.name)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

function sha256OfFile(path: string): string {
  try {
    return createHash('sha256').update(readFileSync(path)).digest('hex')
  } catch {
    return '<unreadable>' // 读取失败:指纹仍稳定(参与去重),摄入相给出显式失败
  }
}

/** 最近一笔 reingest 审计行(无论成败;去重判据的数据源)。 */
function getLatestReingestEvent(db: RepoDb, projectId: string): MigrationEventRecord | null {
  const row = db
    .prepare("SELECT * FROM migration_event WHERE project_id = ? AND phase = 'reingest' ORDER BY at DESC, rowid DESC LIMIT 1")
    .get(projectId) as
    | {
      readonly id: string
      readonly project_id: string
      readonly phase: 'reingest'
      readonly result: 'ok' | 'fail'
      readonly detail_json: string | null
      readonly at: string
    }
    | undefined
  if (row === undefined) return null
  return { id: row.id, projectId: row.project_id, phase: row.phase, result: row.result, detailJson: row.detail_json, at: row.at }
}

/** 指纹集比较(detail 解析失败 → 恒不等,即不跳过)。 */
function sameIndexPrints(recorded: string | null, current: readonly ReingestIndexPrint[]): boolean {
  if (recorded === null) return false
  let detail: unknown
  try {
    detail = JSON.parse(recorded)
  } catch {
    return false
  }
  if (detail === null || typeof detail !== 'object') return false
  const indexes = (detail as { indexes?: unknown }).indexes
  if (!Array.isArray(indexes) || indexes.length !== current.length) return false
  return indexes.every(
    (entry, i) =>
      entry !== null &&
      typeof entry === 'object' &&
      (entry as { slug?: unknown }).slug === current[i]?.slug &&
      (entry as { sha256?: unknown }).sha256 === current[i]?.sha256,
  )
}

export function createReingestHook(deps: ReingestHookDeps): ReingestHook {
  const { db } = deps
  const log = deps.log ?? shellLog
  const clock = deps.now ?? (() => new Date())

  return {
    afterScan(target: ScanTarget): WorkbenchEvent[] {
      // 双形态门(AC-4):未迁移(files)项目零行为变化 —— 纯 M2 感知路径。
      if (getProjectTaskAuthority(db, target.id) !== 'sqlite') return []

      const featuresRoot = resolveFeaturesDir(target)
      const reproduced = listReproducedIndexSlugs(featuresRoot)
      if (reproduced.length === 0) return []

      const indexes: ReingestIndexPrint[] = reproduced.map(slug => ({
        slug,
        sha256: sha256OfFile(join(featuresRoot, slug, 'tasks', 'index.json')),
      }))
      // 幂等去重(AC-2):同一外部写(指纹集不变)不重复回收、不重发事件。
      if (sameIndexPrints(getLatestReingestEvent(db, target.id)?.detailJson ?? null, indexes)) return []

      const events: WorkbenchEvent[] = []
      // 偏离标记:独立提交(先于重摄入)—— 外部写是既成事实,重摄入失败
      // 也不回退标记(AC-3「偏离标记保持」);事件仅呈现,不承载阻断。
      db.prepare('UPDATE projects SET deviated = 1 WHERE id = ?').run(target.id)
      events.push({ type: 'deviation_detected', projectId: target.id })

      const failDetail = (reason: string, verifyReport?: MigrationVerifyReport): ReingestFailDetail => ({
        reason,
        indexes,
        ...(verifyReport !== undefined ? { verifyReport } : {}),
      })

      try {
        db.exec('BEGIN IMMEDIATE')
        const features: Array<{ slug: string; taskCount: number }> = []
        let rowCount = 0
        for (const slug of reproduced) {
          // 整组替换:先删后插(同一映射 collectFeatureIngestRows)—— 重复
          // 回收收敛到同一行集,外部删除任务不残留孤儿行。
          const rows = collectFeatureIngestRows({ projectId: target.id, featuresRoot, slug })
          deleteTasksByFeature(db, target.id, slug)
          for (const row of rows) insertTask(db, row)
          features.push({ slug, taskCount: rows.length })
          rowCount += rows.length
        }
        // 同一对拍校验(1.4 verify 复用):task vs task_snapshot 四字段零差异。
        const verifyReport = verifyMigrationParity(db, target.id)
        if (!verifyReport.ok) {
          throw new MigrationDomainError('ERR_MIGRATION_VERIFY', summarizeVerifyReport(verifyReport), verifyReport)
        }
        const okDetail: ReingestOkDetail = {
          rows: rowCount,
          features,
          indexes,
          verifyReport,
        }
        // ok 审计随重摄入同事务提交(与迁移管线同生共死口径)。
        recordMigrationEvent(db, {
          projectId: target.id,
          phase: 'reingest',
          result: 'ok',
          detail: okDetail,
          at: clock().toISOString(),
        })
        db.exec('COMMIT')
        events.push({ type: 'migration_progress', projectId: target.id, phase: 'reingest', result: 'ok' })
        log.info({
          code: LOG_CODE_REINGEST,
          message: `reingested external index.json write(s) for project ${target.id} (${String(features.map(feature => feature.slug).join(', '))})`,
          data: { projectId: target.id, features: features.map(feature => feature.slug), rows: rowCount },
        })
      } catch (error) {
        // 整体回滚(零半摄入);fail 审计事务外补记(不被回滚吞掉)。
        try {
          db.exec('ROLLBACK')
        } catch {
          // 连接可能已不可用;继续走可观察面(事件 + 审计 + 日志)。
        }
        const reason = String(error instanceof Error ? error.message : error)
        const verifyReport = error instanceof MigrationDomainError ? error.report : undefined
        try {
          recordMigrationEvent(db, {
            projectId: target.id,
            phase: 'reingest',
            result: 'fail',
            detail: failDetail(reason, verifyReport),
            at: clock().toISOString(),
          })
        } catch {
          // 审计写失败不再放大(日志面已兜底)。
        }
        events.push({ type: 'migration_progress', projectId: target.id, phase: 'reingest', result: 'fail' })
        log.warn({
          code: LOG_CODE_REINGEST_ERROR,
          message: `reingest failed for project ${target.id}: ${reason}`,
          data: { projectId: target.id, reason },
        })
      }
      return events
    },
  }
}
