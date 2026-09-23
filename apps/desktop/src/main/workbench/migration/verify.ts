// workbench/migration/verify — 迁移对拍:task 权威表 vs task_snapshot 派生投影(任务 1.4,Interface 4 第 4 步)。
//
// 对拍口径(PRD G2/SC2:迁移前后任务全集(ID/状态/依赖/标题)零差异):
//   - 比较面 = 四字段:限定地址 task_key(键集)、status、blockers(依赖,
//     本地 key 原词、含悬空/通配 —— 逐字比对,顺序敏感:index.json 的
//     dependencies 顺序即原词顺序)、title;
//   - task_snapshot 是 M2 感知面的派生投影(scanForgeFiles 全量重扫产物),
//     迁移时它代表「迁移前看板所见」—— 摄入后的权威表必须与之零差异,
//     否则摄入映射有损(→ ERR_MIGRATION_VERIFY + 整体回滚);
//   - 快照滞后(外部 CLI 改了 index.json、watcher 尚未重扫)同样表现为
//     差异 → 回滚可重试:感知追平后重发起即成功(≤5s 时效基线)。
//
// 纯读路径(库内两表对读,不触 fs):可在迁移事务内调用 —— 摄入行尚未
// 提交,但同连接同事务内可见,对拍即对「将提交的行」负责。

import type { RepoDb } from '../repos/types.ts'
import { listTaskSnapshots } from '../repos/task-snapshots.ts'
import { listTasks } from '../tasks/task-repo.ts'

/** 对拍比较的字段名(报告与错误消息的口径锚)。 */
export type VerifyField = 'status' | 'title' | 'blockers'

/** 单字段差异(值以 JSON 串呈现,数组保序)。 */
export interface VerifyFieldMismatch {
  readonly taskKey: string
  readonly field: VerifyField
  readonly taskValue: string
  readonly snapshotValue: string
}

/** verify 相产物(零差异判定 + 差异全清单;整体落 migration_event.detail_json)。 */
export interface MigrationVerifyReport {
  readonly ok: boolean
  readonly comparedFields: readonly ['taskKey', 'status', 'title', 'blockers']
  readonly taskCount: number
  readonly snapshotCount: number
  /** 仅在 task 表的差异键。 */
  readonly taskOnlyKeys: readonly string[]
  /** 仅在 task_snapshot 的差异键。 */
  readonly snapshotOnlyKeys: readonly string[]
  readonly mismatches: readonly VerifyFieldMismatch[]
}

interface ComparedRow {
  readonly key: string
  readonly status: string
  readonly title: string
  readonly blockers: readonly string[]
}

function valueOf(field: VerifyField, row: { status: string; title: string; blockers: readonly string[] }): string {
  return field === 'blockers' ? JSON.stringify(row.blockers) : row[field]
}

const toComparedRow = (row: { taskKey: string; status: string; title: string; blockers: readonly string[] }): ComparedRow => ({
  key: row.taskKey,
  status: row.status,
  title: row.title,
  blockers: row.blockers,
})

/**
 * 任务全集对拍(限定地址/状态/依赖/标题零差异)。永不抛错 —— 差异以
 * 报告承载,由调用方(pipeline)决定回滚与错误码;报告 ok 字段即判据。
 */
export function verifyMigrationParity(db: RepoDb, projectId: string): MigrationVerifyReport {
  const tasks = listTasks(db, projectId).map(toComparedRow)
  const snapshots = listTaskSnapshots(db, projectId).map(toComparedRow)
  const taskByKey = new Map(tasks.map(row => [row.key, row]))
  const snapshotByKey = new Map(snapshots.map(row => [row.key, row]))
  const taskOnlyKeys = [...taskByKey.keys()].filter(key => !snapshotByKey.has(key)).sort()
  const snapshotOnlyKeys = [...snapshotByKey.keys()].filter(key => !taskByKey.has(key)).sort()
  const mismatches: VerifyFieldMismatch[] = []
  for (const [key, task] of taskByKey) {
    const snapshot = snapshotByKey.get(key)
    if (snapshot === undefined) continue
    for (const field of ['status', 'title', 'blockers'] as const) {
      const taskValue = valueOf(field, task)
      const snapshotValue = valueOf(field, snapshot)
      if (taskValue !== snapshotValue) {
        mismatches.push({ taskKey: key, field, taskValue, snapshotValue })
      }
    }
  }
  mismatches.sort((a, b) => (a.taskKey < b.taskKey ? -1 : a.taskKey > b.taskKey ? 1 : a.field < b.field ? -1 : 1))
  const ok = taskOnlyKeys.length === 0 && snapshotOnlyKeys.length === 0 && mismatches.length === 0
  return {
    ok,
    comparedFields: ['taskKey', 'status', 'title', 'blockers'],
    taskCount: tasks.length,
    snapshotCount: snapshots.length,
    taskOnlyKeys,
    snapshotOnlyKeys,
    mismatches,
  }
}

/** 报告 → 人读摘要(错误消息与 log 用;全文留 detail_json)。 */
export function summarizeVerifyReport(report: MigrationVerifyReport): string {
  if (report.ok) {
    return `verify ok: ${report.taskCount} task(s) match the task_snapshot projection on taskKey/status/title/blockers`
  }
  const parts: string[] = []
  if (report.taskOnlyKeys.length > 0) parts.push(`task-only keys: ${report.taskOnlyKeys.slice(0, 5).join(', ')}${report.taskOnlyKeys.length > 5 ? ', …' : ''}`)
  if (report.snapshotOnlyKeys.length > 0) parts.push(`snapshot-only keys: ${report.snapshotOnlyKeys.slice(0, 5).join(', ')}${report.snapshotOnlyKeys.length > 5 ? ', …' : ''}`)
  if (report.mismatches.length > 0) {
    const head = report.mismatches
      .slice(0, 5)
      .map(mismatch => `${mismatch.taskKey}.${mismatch.field} (task=${mismatch.taskValue} vs snapshot=${mismatch.snapshotValue})`)
      .join('; ')
    parts.push(`field mismatches: ${head}${report.mismatches.length > 5 ? `; +${report.mismatches.length - 5} more` : ''}`)
  }
  return `verify failed (${report.taskCount} task rows vs ${report.snapshotCount} snapshot rows): ${parts.join(' | ')}`
}
