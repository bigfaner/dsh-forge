// workbench/indexer/parse-task — forge 任务方言解析(任务 2.5)。
//
// 方言钉定(事实源 = 本仓 live 结构 + forge CLI 源码 Z:\project\ai\forge,
// spike-1-findings §4.1):任务的可变状态与依赖只活在
// `docs/features/<slug>/tasks/index.json`(claim/transition 仅写该文件;
// submit 覆写同路径记录文件)——index.json 是任务集权威;任务 .md 文件体
// 是详情期数据(getTaskDetail 读取),快照层只消费其 mtime。
//
// 执行记录(TaskRecord DTO 方言适配,tech-design Interface 1 原型
// `{ at, kind, source, summary }` → forge 现实):
//   - forge「执行记录」= 任务记录目录下每次执行一个 write-once .md 文件
//     (submit 覆写同路径:`records/<task-file-stem>.md`,无 CLI 回读);
//   - at     ← 记录 frontmatter `completed`(缺失退化 `started`),原样
//     透传(forge 写的是本地无时区串,不做任何时区虚构);
//   - kind   ← index.json 任务 `type`(记录文件自身不携带类别 —— 降级取
//     任务类型;缺失为空串);
//   - source ← 记录 frontmatter `actor:` 行(FORGE_ACTOR 可选增强槽,
//     现方言恒无 → null;见 source.ts 路径①)。历史记录不做挂接回溯推断
//     —— 当下的 active 挂接不能证明历史执行的来源;
//   - summary ← `## Summary` 节原文(截取,不改写)。
// 不虚构 forge 未写的字段(任务文件无 branch/worktree → 恒 null/false)。
//
// 解析失败纪律(AC4):损坏文件跳过并记 ParseFailure,不炸整轮扫描;
// index.json 不可读 = 该 feature 任务集不可知 → tasks 置 null(调用方保留
// 既有快照行,不做结构性删除)。

import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { ChangeSource, TaskStatus } from '../repos/types.ts'
import { resolveActorSource } from './source.ts'

/** 解析失败记账:跳过的文件 + 原因(sync_state 错误项的来源)。 */
export interface ForgeParseFailure {
  /** 相对 docs/features 的方言内路径(错误信息用)。 */
  readonly file: string
  readonly reason: string
}

/** Interface 1 TaskRecord 的方言适配形态(记录 .md 解析产物)。 */
export interface ParsedTaskRecord {
  /** forge 原写时间串(completed,退化 started)——原样透传。 */
  readonly at: string
  /** 任务 type 降级(记录文件不携带类别);缺失为空串。 */
  readonly kind: string
  /** actor 行可辨来源;槽位为空 → null(不做历史推断)。 */
  readonly source: ChangeSource | null
  /** `## Summary` 节原文(截取首节,trim)。 */
  readonly summary: string
}

/**
 * 解析产物的任务行(快照 upsert 的入参形态)。taskKey = 看板地址
 * `<featureSlug>/<localId>`(跨 feature 本地 ID 碰撞的方言适配,见
 * scan.ts);blockers 为 index.json `dependencies` 原样透传(同 feature
 * 命名空间的本地上游 key —— 上游 blocker 即依赖,tech-design TaskSummary
 * .blockers 语义)。
 */
export interface ParsedTask {
  /** 看板地址:`<featureSlug>/<localId>`。 */
  readonly taskKey: string
  readonly featureSlug: string
  /** forge 原写本地 ID("2.5" / "2.gate" / "T-review-doc" …)。 */
  readonly localId: string
  readonly title: string
  readonly status: TaskStatus
  /** index.json dependencies 原样(悬空引用保留原词,由扫描统计显式标记)。 */
  readonly blockers: string[]
  /** 方言现实:任务文件不携带 branch → 恒 null(Hard Rule:缺失即空)。 */
  readonly branch: string | null
  /** 方言现实:任务文件不携带 worktree → 恒 false。 */
  readonly worktree: boolean
  /** 任务 forge 工件 mtime 派生(index.json / 任务 .md / 记录 .md 的最大值)。 */
  readonly updatedAt: string
  readonly records: ParsedTaskRecord[]
  /** 最新记录的 actor 原值(路径①输入;无记录/无 actor → null)。 */
  readonly latestActor: string | null
}

/** 单 feature 任务集解析结果;tasks = null 表示 index.json 不可读。 */
export interface TaskParseResult {
  readonly tasks: ParsedTask[] | null
  readonly failures: ForgeParseFailure[]
}

/** 快照 7 态词表(schema-v1 task_snapshot.status CHECK 同源)。 */
const TASK_STATUS_VOCAB: ReadonlySet<string> = new Set([
  'pending',
  'in_progress',
  'completed',
  'blocked',
  'suspended',
  'skipped',
  'rejected',
])

/** index.json 单任务条目的最小钉定形状(其余键忽略透传)。 */
interface TaskIndexEntry {
  readonly id?: unknown
  readonly title?: unknown
  readonly status?: unknown
  readonly dependencies?: unknown
  readonly type?: unknown
  readonly file?: unknown
  readonly record?: unknown
}

export type TaskIndexEntries = Record<string, TaskIndexEntry>

/**
 * 读取并 JSON 解析 tasks/index.json。缺失/损坏 → null(由调用方记失败并
 * 保留既有快照);结构非法(tasks 非对象)同样 null。
 */
export function readTaskIndex(indexJsonPath: string): TaskIndexEntries | null {
  let raw: string
  try {
    raw = readFileSync(indexJsonPath, 'utf8')
  } catch {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const tasks = (parsed as { tasks?: unknown }).tasks
  if (tasks === null || typeof tasks !== 'object' || Array.isArray(tasks)) return null
  return tasks as TaskIndexEntries
}

// ---------------------------------------------------------------------------
// 记录 .md 方言(frontmatter + ## Summary 节)
// ---------------------------------------------------------------------------

/** 极简 YAML 标量 frontmatter 解析(钉定 forge 写出的 `key: value` 行方言)。 */
export function parseFrontmatter(markdown: string): Record<string, string> | null {
  if (!markdown.startsWith('---')) return null
  const end = markdown.indexOf('\n---', 3)
  if (end === -1) return null
  const block = markdown.slice(3, end)
  const fields: Record<string, string> = {}
  for (const line of block.split(/\r?\n/)) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (match === null) continue
    const key = match[1]
    if (key === undefined) continue
    let value = match[2] ?? ''
    const trimmed = value.trim()
    if (trimmed.length >= 2 && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
      value = trimmed.slice(1, -1)
    } else {
      value = trimmed
    }
    fields[key] = value
  }
  return fields
}

/** 截取 `## Summary` 节原文(至下一个任意 `## ` 节首;trim;缺失为空串)。 */
export function extractSummarySection(markdown: string): string {
  const lines = markdown.split(/\r?\n/)
  const start = lines.findIndex(line => line.startsWith('## Summary'))
  if (start === -1) return ''
  const collected: string[] = []
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]
    if (line === undefined) continue
    if (line.startsWith('## ')) break
    collected.push(line)
  }
  return collected.join('\n').trim()
}

/** 记录 .md → ParsedTaskRecord(frontmatter 缺失/无时间字段 → null = 损坏)。 */
export function parseRecordMarkdown(
  markdown: string,
  taskType: string,
): { record: ParsedTaskRecord; actor: string | null } | null {
  const frontmatter = parseFrontmatter(markdown)
  if (frontmatter === null) return null
  const at = frontmatter.completed ?? frontmatter.started
  if (at === undefined || at === '') return null
  const actor = frontmatter.actor ?? null
  return {
    record: { at, kind: taskType, source: resolveActorSource(actor), summary: extractSummarySection(markdown) },
    actor,
  }
}

// ---------------------------------------------------------------------------
// mtime 派生(updatedAt 唯一时钟:forge 工件文件 mtime,非本层铸造)
// ---------------------------------------------------------------------------

/** 存在则取 mtime;不存在/不可 stat → null(缺工件不视为错误)。 */
function mtimeIsoOrNull(path: string): string | null {
  try {
    return statSync(path).mtime.toISOString()
  } catch {
    return null
  }
}

function maxIso(...candidates: (string | null)[]): string {
  let latest = candidates[0] ?? ''
  for (const candidate of candidates) {
    if (candidate !== null && candidate > latest) latest = candidate
  }
  return latest
}

/** 排序键:at 原样串(方言同格式,字典序 = 时间序);缺失退 mtime。 */
function recordSortKey(record: ParsedTaskRecord, fallbackMtime: string): string {
  return record.at !== '' ? record.at : fallbackMtime
}

/**
 * 解析单 feature 任务集(含记录与 mtime 派生)。
 *
 * 条目级纪律:条目形状非法(id/title 缺失、status 越出 7 态词表、
 * dependencies 非字符串数组、同 feature 内 id 重复)→ 跳过该条目并记
 * failure;词表越界不枚举改写(Hard Rule),交由 sync_state 错误项呈现。
 */
export function parseFeatureTasks(
  tasksDir: string,
  featureSlug: string,
  entries: TaskIndexEntries,
  indexJsonMtime: string,
): TaskParseResult {
  const tasks: ParsedTask[] = []
  const failures: ForgeParseFailure[] = []
  const seenLocalIds = new Set<string>()
  for (const [stem, entry] of Object.entries(entries)) {
    const dialectFile = `${featureSlug}/tasks/${stem}`
    const id = entry.id
    const title = entry.title
    const status = entry.status
    if (typeof id !== 'string' || id === '') {
      failures.push({ file: dialectFile, reason: 'index entry has no valid id' })
      continue
    }
    if (seenLocalIds.has(id)) {
      failures.push({ file: dialectFile, reason: `duplicate task id ${id} within feature` })
      continue
    }
    seenLocalIds.add(id)
    if (typeof title !== 'string' || title === '') {
      failures.push({ file: dialectFile, reason: `task ${id} has no valid title` })
      continue
    }
    if (typeof status !== 'string' || !TASK_STATUS_VOCAB.has(status)) {
      failures.push({ file: dialectFile, reason: `task ${id} status ${String(status)} outside snapshot vocabulary` })
      continue
    }
    const deps = entry.dependencies ?? []
    if (!Array.isArray(deps) || deps.some(dep => typeof dep !== 'string')) {
      failures.push({ file: dialectFile, reason: `task ${id} dependencies is not a string array` })
      continue
    }
    const taskType = typeof entry.type === 'string' ? entry.type : ''
    const taskFileRelative = typeof entry.file === 'string' && entry.file !== '' ? entry.file : `${stem}.md`
    const taskFilePath = join(tasksDir, taskFileRelative)

    const records: ParsedTaskRecord[] = []
    let latestActor: string | null = null
    let latestSortKey = ''
    let recordMtimeLatest = ''
    const recordRelative = typeof entry.record === 'string' && entry.record !== '' ? entry.record : null
    if (recordRelative !== null) {
      const recordPath = join(tasksDir, recordRelative)
      let recordMarkdown: string | null = null
      try {
        recordMarkdown = readFileSync(recordPath, 'utf8')
      } catch {
        recordMarkdown = null // 从未 submit 或记录被移除:非错误
      }
      if (recordMarkdown !== null) {
        const parsedRecord = parseRecordMarkdown(recordMarkdown, taskType)
        if (parsedRecord === null) {
          failures.push({ file: `${featureSlug}/tasks/${recordRelative}`, reason: `record for task ${id} is corrupt (frontmatter missing)` })
        } else {
          records.push(parsedRecord.record)
          const recordMtime = mtimeIsoOrNull(recordPath) ?? ''
          if (recordMtime > recordMtimeLatest) recordMtimeLatest = recordMtime
          const sortKey = recordSortKey(parsedRecord.record, recordMtime)
          if (sortKey >= latestSortKey) {
            latestSortKey = sortKey
            latestActor = parsedRecord.actor
          }
        }
      }
    }

    const updatedAt = maxIso(indexJsonMtime, mtimeIsoOrNull(taskFilePath), recordMtimeLatest || null)
    tasks.push({
      taskKey: `${featureSlug}/${id}`,
      featureSlug,
      localId: id,
      title,
      status: status as TaskStatus,
      blockers: deps as string[],
      branch: null,
      worktree: false,
      updatedAt,
      records,
      latestActor,
    })
  }
  tasks.sort((a, b) => (a.taskKey < b.taskKey ? -1 : a.taskKey > b.taskKey ? 1 : 0))
  return { tasks, failures }
}
