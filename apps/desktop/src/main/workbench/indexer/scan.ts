// workbench/indexer/scan — forge 文件 → 派生快照索引入口(任务 2.5)。
//
// 扫描目标(tech-design §Interface 3,与 registry/forge-detect 同口径):
//   featuresDir = (docLocationPath ?? codeRoot)/docs/features
//   —— 任务的权威数据源 = 各 feature 的 tasks/index.json(claim/transition
//   只写它;任务 .md 与记录 .md 只贡献 mtime/记录内容),.forge/ 目录是
//   CLI 工作状态(state.json),快照层不消费。
//
// 方言适配(tech-design 假设 → 本仓 live 方言,dispatcher 核正):
//   1. task_key 采用看板地址 `<featureSlug>/<localId>`:schema PK
//      (project_id, task_key) 为两列,而真实方言跨 feature 本地 ID 碰撞
//      (本仓 M1∩M2 重叠 33 键;SC1 fixture 的 50 feature 同样必然碰撞)。
//      裸 ID 入库会静默互相覆盖 —— 限定地址是唯一无损形态。blockers 仍
//      原样存本地上游 key(同 feature 命名空间,树视图按行 feature_slug
//      限定解析,悬空检查见 diff.ts findDanglingBlockers)。
//   2. 不做 gate/summary/T-* 排除:forge task list 全量列出这些条目(SC1
//      看板 ≡ list 一致性),且业务任务的依赖直指 "5.gate" 等相位门槛 ——
//      排除即制造全线悬空。快照 = index.json 任务图全量忠实投影。
//   3. branch 恒 null / worktree 恒 false:方言中任务文件不携带这些字段
//      (Hard Rule:缺失即空,不推断)。
//
// 写路径纪律:indexer 只写派生三表(task_snapshot / feature_snapshot /
// sync_state),对 forge 文件与自有 SoT(projects / app_state /
// session_links)零写入(BIZ-task-ops-001 只读纪律)。来源判定读
// session_links(active 挂接 → [会话])但不回写。
//
// 复用契约(AC5):本入口即 2.6 watcher 的「感知触发增量扫」同一入口 ——
// scanForgeFiles(db, target) 幂等可重入;增量语义由 diff 分类承载,不靠
// 调用方传游标。重建(rebuildDerivedSnapshots)经 makeRescanHook 挂接。

import { statSync } from 'node:fs'
import { join } from 'node:path'
import {
  deleteFeatureSnapshot,
  listFeatureSnapshots,
  upsertFeatureSnapshot,
} from '../repos/feature-snapshots.ts'
import { listSessionLinksByTask } from '../repos/session-links.ts'
import type { RepoDb, SyncState, TaskSnapshot, FeatureSnapshot } from '../repos/types.ts'
import {
  deleteTaskSnapshots,
  listTaskSnapshots,
  upsertTaskSnapshots,
} from '../repos/task-snapshots.ts'
import { markScanFailed, markScanStarted, markScanSucceeded } from '../repos/sync-state.ts'
import type { ForgeParseFailure, ParsedTask } from './parse-task.ts'
import { scanFeatures, type FeatureScanResult } from './parse-feature.ts'
import {
  diffFeatures,
  diffTasks,
  findDanglingBlockers,
  toSyncStatusPayload,
  type IncomingFeatureRow,
  type IncomingTaskRow,
  type WorkbenchEvent,
  type DanglingBlocker,
} from './diff.ts'
import { determineSource } from './source.ts'
import { collectStageAssets, deleteStageAssets, replaceStageAssets } from '../stages/stage-asset-index.ts'

/** 扫描目标(projects 行的最小投影;docBase 口径同 registry/forge-detect)。 */
export interface ScanTarget {
  readonly id: string
  readonly codeRoot: string
  readonly docLocationPath: string | null
}

/** 单轮扫描统计(sync_state 之外的簿记,随 ScanOutcome 供调用方消费)。 */
export interface ScanStats {
  readonly featuresScanned: number
  readonly tasksIndexed: number
  readonly taskUpserts: number
  readonly taskDeletes: number
  readonly recordsParsed: number
  /** 解析失败明细(AC4:跳过 + 记录;聚合进 sync_state 错误项)。 */
  readonly skippedFiles: readonly ForgeParseFailure[]
  /** 悬空 blocker 引用(AC1:显式标记,不改写原词)。 */
  readonly danglingBlockers: readonly DanglingBlocker[]
}

/** 扫描产物:事件批(2.6 推送)+ 统计 + 终态 sync_state。 */
export interface ScanOutcome {
  readonly events: readonly WorkbenchEvent[]
  readonly stats: ScanStats
  readonly sync: SyncState
}

/** features 目录解析(docBase = docLocationPath ?? codeRoot,仓外文档三分模型)。 */
export function resolveFeaturesDir(target: ScanTarget): string {
  return join(target.docLocationPath ?? target.codeRoot, 'docs', 'features')
}

/** 解析失败 → sync_state 错误项文案(≤120 截断由 repos 层执行)。 */
function formatSkipReason(failures: readonly ForgeParseFailure[]): string {
  const head = failures
    .slice(0, 2)
    .map(failure => `${failure.file} (${failure.reason})`)
    .join('; ')
  const suffix = failures.length > 2 ? `; +${failures.length - 2} more` : ''
  return `skipped ${String(failures.length)} forge file(s): ${head}${suffix}`
}

interface ApplyOptions {
  /** 库内既有任务/feature 快照(重建钩子传空集)。 */
  readonly previousTasks: readonly TaskSnapshot[]
  readonly previousFeatures: readonly FeatureSnapshot[]
  /** 是否自持事务(rebuild 事务内调用时 false)。 */
  readonly wrapTransaction: boolean
}

/** 写阶段:diff 分类 → 删除/改写 → 事件装配(扫描与重建钩子共用)。 */
function applyScanResult(
  db: RepoDb,
  target: ScanTarget,
  result: FeatureScanResult,
  options: ApplyOptions,
): { events: WorkbenchEvent[]; stats: Omit<ScanStats, 'featuresScanned' | 'skippedFiles'> } {
  const events: WorkbenchEvent[] = []
  const preservedSlugs = new Set(result.features.filter(feature => feature.tasks === null).map(feature => feature.slug))

  // 降级保留:任务集不可知的 feature(tasks = null),其既有任务行不参与
  // diff —— 否则会被误判为结构性删除。
  const previousTasks = options.previousTasks.filter(row => !preservedSlugs.has(row.featureSlug))
  const incomingTasks: ParsedTask[] = result.features.flatMap(feature =>
    feature.tasks === null ? [] : feature.tasks,
  )
  const incomingRows: IncomingTaskRow[] = incomingTasks

  const taskDiff = diffTasks(previousTasks, incomingRows)
  const previousByKey = new Map(previousTasks.map(row => [row.taskKey, row]))
  const parsedByKey = new Map(incomingTasks.map(task => [task.taskKey, task]))

  // 来源判定(Interface 3 序):①最新记录 actor 透传槽 ②active 挂接推断。
  // 只对需要改写的行判定 —— 未变化行的既有 source 是历史事实,不重算。
  const sourceByKey = new Map<string, ReturnType<typeof determineSource>>()
  for (const row of taskDiff.upserts) {
    const parsed = parsedByKey.get(row.taskKey)
    if (parsed === undefined) continue
    sourceByKey.set(
      row.taskKey,
      determineSource({
        actor: parsed.latestActor,
        hasActiveSessionLink: listSessionLinksByTask(db, target.id, row.taskKey).some(link => link.status === 'active'),
      }),
    )
  }

  // feature 侧:完整 feature(manifest 完好且任务集可知)才参与写与变更
  // 判定;计数投影自本轮解析集(与写事务内 SQL 计数一致:任务写先于 feature 写)。
  const incomingFeatures: IncomingFeatureRow[] = []
  for (const feature of result.features) {
    if (!feature.manifestOk || feature.status === null || feature.tasks === null) continue
    incomingFeatures.push({
      featureSlug: feature.slug,
      status: feature.status,
      docKinds: feature.docKinds,
      taskTotal: feature.tasks.length,
      taskCompleted: feature.tasks.filter(task => task.status === 'completed').length,
    })
  }
  const presentSlugs = result.features.map(feature => feature.slug)
  const featureDiff = diffFeatures(options.previousFeatures, incomingFeatures, presentSlugs)
  const featureBySlug = new Map(result.features.map(feature => [feature.slug, feature]))

  // M3 任务 3.2:stage_asset 感知索引 —— 每轮扫描对全部在场 feature 全量同步
  // (stages/*.md 变更不改变 feature_snapshot.updatedAt,按 changed-slug 门控
  // 会漏感知;行集替换 = 派生纯函数,与 rebuildStageAssetIndex 共用实现)。
  // fs 读取置于写事务外(事务内只承写)。
  const featuresDir = resolveFeaturesDir(target)
  const stageAssetsBySlug = new Map(result.features.map(feature => [feature.slug, collectStageAssets(featuresDir, feature.slug)]))

  const runWrites = (): void => {
    deleteTaskSnapshots(db, target.id, taskDiff.deletedKeys)
    const batchRows = taskDiff.upserts.flatMap((row) => {
      const parsed = parsedByKey.get(row.taskKey)
      if (parsed === undefined) return []
      return [
        {
          taskKey: parsed.taskKey,
          featureSlug: parsed.featureSlug,
          title: parsed.title,
          status: parsed.status,
          blockers: parsed.blockers,
          branch: parsed.branch,
          worktree: parsed.worktree,
          source: sourceByKey.get(row.taskKey) ?? null,
          updatedAt: parsed.updatedAt,
        },
      ]
    })
    upsertTaskSnapshots(db, target.id, batchRows)
    for (const slug of featureDiff.deletedSlugs) {
      deleteFeatureSnapshot(db, target.id, slug)
      deleteStageAssets(db, target.id, slug) // M3 3.2:feature 结构性删除 → 派生索引行清理
    }
    for (const row of incomingFeatures) {
      if (!featureDiff.changedSlugs.includes(row.featureSlug)) continue // 未变化不重写:updated_at 不漂移
      const parsedFeature = featureBySlug.get(row.featureSlug)
      if (parsedFeature === undefined) continue
      upsertFeatureSnapshot(db, {
        projectId: target.id,
        featureSlug: row.featureSlug,
        status: row.status,
        docKinds: row.docKinds,
        updatedAt: parsedFeature.updatedAt,
      })
    }
    for (const feature of result.features) {
      replaceStageAssets(db, target.id, feature.slug, stageAssetsBySlug.get(feature.slug) ?? [])
    }
  }

  if (options.wrapTransaction) {
    db.exec('BEGIN IMMEDIATE')
    try {
      runWrites()
      db.exec('COMMIT')
    } catch (error) {
      try {
        db.exec('ROLLBACK')
      } catch {
        // The connection may already be unusable; prefer rethrowing the original error.
      }
      throw error
    }
  } else {
    runWrites()
  }

  for (const row of taskDiff.upserts) {
    events.push({
      type: 'task_updated',
      projectId: target.id,
      taskKey: row.taskKey,
      source: sourceByKey.get(row.taskKey) ?? null,
      changeKind: taskDiff.changeKinds.get(row.taskKey) ?? 'attribute',
    })
  }
  for (const taskKey of taskDiff.deletedKeys) {
    events.push({
      type: 'task_updated',
      projectId: target.id,
      taskKey,
      source: previousByKey.get(taskKey)?.source ?? null,
      changeKind: 'structural',
    })
  }
  for (const slug of featureDiff.changedSlugs) {
    events.push({ type: 'feature_updated', projectId: target.id, featureSlug: slug })
  }
  for (const slug of featureDiff.deletedSlugs) {
    events.push({ type: 'feature_updated', projectId: target.id, featureSlug: slug })
  }

  return {
    events,
    stats: {
      tasksIndexed: incomingTasks.length,
      taskUpserts: taskDiff.upserts.length,
      taskDeletes: taskDiff.deletedKeys.length,
      recordsParsed: incomingTasks.reduce((sum, task) => sum + task.records.length, 0),
      danglingBlockers: findDanglingBlockers(incomingRows),
    },
  }
}

/**
 * 全量重扫入口(2.6 watcher 复用的同一入口;幂等)。
 *
 * sync_state 生命周期:事务外置位 scanning → 写事务提交 → 成功回 idle 并
 * 推进游标;存在解析失败时数据仍落库(AC4 继续其余文件)但按「非全净扫描」
 * 记 error 态、游标不推进(er-diagram:last_scan_at = 最近成功扫描完成
 * 时点)。目录级不可读(features 目录缺失)→ 零数据变更,仅 error 态。
 */
export function scanForgeFiles(db: RepoDb, target: ScanTarget): ScanOutcome {
  markScanStarted(db, target.id)

  const featuresDir = resolveFeaturesDir(target)
  let dirOk = false
  try {
    dirOk = statSync(featuresDir).isDirectory()
  } catch {
    dirOk = false
  }
  if (!dirOk) {
    const sync = markScanFailed(db, target.id, `features directory not found: ${featuresDir}`)
    const stats: ScanStats = {
      featuresScanned: 0,
      tasksIndexed: 0,
      taskUpserts: 0,
      taskDeletes: 0,
      recordsParsed: 0,
      skippedFiles: [{ file: featuresDir, reason: 'features directory not found' }],
      danglingBlockers: [],
    }
    return { events: [{ type: 'sync', projectId: target.id, sync: toSyncStatusPayload(sync) }], stats, sync }
  }

  const result = scanFeatures(featuresDir)
  const applied = applyScanResult(db, target, result, {
    previousTasks: listTaskSnapshots(db, target.id),
    previousFeatures: listFeatureSnapshots(db, target.id),
    wrapTransaction: true,
  })

  const sync =
    result.failures.length > 0 ? markScanFailed(db, target.id, formatSkipReason(result.failures)) : markScanSucceeded(db, target.id)

  const stats: ScanStats = {
    featuresScanned: result.features.length,
    tasksIndexed: applied.stats.tasksIndexed,
    taskUpserts: applied.stats.taskUpserts,
    taskDeletes: applied.stats.taskDeletes,
    recordsParsed: applied.stats.recordsParsed,
    skippedFiles: result.failures,
    danglingBlockers: applied.stats.danglingBlockers,
  }
  const events: WorkbenchEvent[] = [
    ...applied.events,
    { type: 'sync', projectId: target.id, sync: toSyncStatusPayload(sync) },
  ]
  return { events, stats, sync }
}

/**
 * 重建钩子(snapshot-rebuild 的 rescan 供给):运行于重建事务内 —— 清表后
 * previous 为空集(全量结构性新建),不自持事务。forge 文件在钩子内即时
 * 重解析,重建不伪造快照数据(Hard Rule)。
 */
export function makeRescanHook(target: ScanTarget): (db: RepoDb) => void {
  return (db) => {
    const featuresDir = resolveFeaturesDir(target)
    const result = scanFeatures(featuresDir)
    applyScanResult(db, target, result, { previousTasks: [], previousFeatures: [], wrapTransaction: false })
    if (result.failures.length > 0) {
      markScanFailed(db, target.id, formatSkipReason(result.failures))
    } else {
      markScanSucceeded(db, target.id)
    }
  }
}
