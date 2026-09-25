// workbench/migration/ingest — index.json 全量摄入 → task 权威行(任务 1.4,Interface 4 第 3 步)。
//
// 事实源与方言(tech-design §Interface 4 第 3 步 + spike-1-findings §4.1):
//   - 摄入范围 = 文档树下每个含 tasks/ 的 feature 的 index.json(全量、
//     不做 gate/summary/T-* 排除 —— 与 task_snapshot 投影口径一致,
//     scan.ts 方言钉定第 2 条);
//   - 解析复用 indexer 同一解析器(parseFeatureTasks):条目级校验(7 态
//     词表/依赖串数组/同 feature id 去重)与快照投影逐字同源 —— 这是
//     第 4 步对拍能「零差异」的结构前提,任何分立实现都会自造漂移;
//   - 字段映射:taskKey = 限定地址合成 `<featureSlug>/<localId>`
//     (TECH-data-kernel-003)、title/status 原词、blockers 本地 key 原词
//     (悬空引用原样入表,er-diagram 不变式)、updatedAt = forge 工件
//     mtime 派生时钟(不重铸)、updatedBy = 'kernel';
//   - task_type / desc_path 推断:entry.type 原词 / `<slug>/tasks/<file>`
//     (file 缺省 = `<stem>.md`;desc_path 相对文档根,task-service 详情
//     装配的既有寻址方言)。
//
// 写入口纪律(1.3 Hard Rule):行写入只经 task-repo insertTask —— 本模块
// 在迁移大事务内逐行调用,不留任何旁路写。事务归属:本模块不自持事务
// (SAVEPOINT/BEGIN 均由 pipeline 承载);摄入失败 = 抛错上交 → 整体回滚。
// 单 feature 行集采集(collectFeatureIngestRows)同时供外部写重摄入
// (1.5 reingest-watcher)复用 —— 两路摄入同一映射,零分立实现。

import { statSync } from 'node:fs'
import { join } from 'node:path'
import { parseFeatureTasks, readTaskIndex, type TaskIndexEntries } from '../indexer/parse-task.ts'
import type { RepoDb } from '../repos/types.ts'
import { insertTask, type InsertTaskInput } from '../tasks/task-repo.ts'
import { listFeatureSlugsWithTasks } from './backup.ts'

/** 单 feature 摄入记账。 */
export interface IngestFeatureOutcome {
  readonly slug: string
  readonly taskCount: number
}

/** ingest 相产物(migration_event.detail_json 载荷形态)。 */
export interface MigrationIngestOutcome {
  readonly rows: number
  readonly features: readonly IngestFeatureOutcome[]
}

/** entry.type / entry.file 的推断面(ParsedTask 不携带,按 id 回查 entries)。 */
interface EntryExtras {
  readonly taskType: string | null
  readonly descPath: string
}

function extrasByLocalId(slug: string, entries: TaskIndexEntries): Map<string, EntryExtras> {
  const extras = new Map<string, EntryExtras>()
  for (const [stem, entry] of Object.entries(entries)) {
    if (typeof entry.id !== 'string' || entry.id === '') continue
    const file = typeof entry.file === 'string' && entry.file !== '' ? entry.file : `${stem}.md`
    extras.set(entry.id, {
      taskType: typeof entry.type === 'string' ? entry.type : null,
      descPath: `${slug}/tasks/${file}`,
    })
  }
  return extras
}

/**
 * 单 feature 摄入行集(纯读 + 映射,零写):迁移摄入(1.4)与外部写重摄入
 * (1.5)共用同一映射 —— 任何分立实现都会自造两边漂移。index.json 不可读/
 * 不可解析 → 抛错(任务集不可知即拒绝,不静默部分摄入)。
 */
export function collectFeatureIngestRows(input: {
  readonly projectId: string
  readonly featuresRoot: string
  readonly slug: string
}): readonly InsertTaskInput[] {
  const tasksDir = join(input.featuresRoot, input.slug, 'tasks')
  const indexPath = join(tasksDir, 'index.json')
  const entries = readTaskIndex(indexPath)
  if (entries === null) {
    throw new Error(
      `migration ingest: ${input.slug}/tasks/index.json is missing or unreadable — the full task set is unknowable, refusing to migrate a partial corpus`,
    )
  }
  const indexMtime = statSync(indexPath).mtime.toISOString()
  const parsed = parseFeatureTasks(tasksDir, input.slug, entries, indexMtime)
  // entries ≠ null 时解析器恒返回数组;null 分支属其「index 不可读」降级
  // 契约(本调用面已在 readTaskIndex 前置排除),防御性显式拒绝。
  if (parsed.tasks === null) {
    throw new Error(
      `migration ingest: ${input.slug}/tasks/index.json could not be parsed — refusing to migrate a partial corpus`,
    )
  }
  const extras = extrasByLocalId(input.slug, entries)
  return parsed.tasks.map((task) => {
    const extra = extras.get(task.localId)
    return {
      projectId: input.projectId,
      taskKey: task.taskKey,
      featureSlug: input.slug,
      title: task.title,
      status: task.status,
      blockers: task.blockers,
      taskType: extra?.taskType ?? null,
      descPath: extra?.descPath ?? `${input.slug}/tasks/${task.localId}.md`,
      updatedBy: 'kernel',
      updatedAt: task.updatedAt,
    }
  })
}

/**
 * 全量摄入(必须在调用方事务内执行):任一 feature 的 index.json 不可读
 * → 抛错(全量不可知即迁移不可行,不静默跳过 —— 静默跳过会把「缺一个
 * feature」留给对拍兜底,错误面反而模糊)。`afterRow` = 测试注错缝
 * (每插入一行回调;抛错即模拟「摄入中」失败,AC-2)。
 */
export function ingestTaskIndexes(input: {
  readonly db: RepoDb
  readonly projectId: string
  readonly featuresRoot: string
  readonly afterRow?: (rowsSoFar: number, taskKey: string) => void
}): MigrationIngestOutcome {
  const features: IngestFeatureOutcome[] = []
  let rows = 0
  for (const slug of listFeatureSlugsWithTasks(input.featuresRoot)) {
    const featureRows = collectFeatureIngestRows({
      projectId: input.projectId,
      featuresRoot: input.featuresRoot,
      slug,
    })
    for (const row of featureRows) {
      insertTask(input.db, row)
      rows += 1
      input.afterRow?.(rows, row.taskKey)
    }
    features.push({ slug, taskCount: featureRows.length })
  }
  return { rows, features }
}
