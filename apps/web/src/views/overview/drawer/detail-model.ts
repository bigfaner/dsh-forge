// TaskDetail → 抽屉投影纯函数（定位：业务——AC1 通用区 chips / AC4 目标·结果与改动范围 /
// AC6 实际耗时格式；数据形状 = contracts TaskDetail——2.6 core taskDetail 水化口径）。
// 载荷语义锚 ui-design v15（实际耗时仅 completed、core 水化 actualDurationMs——UI 只格式化）/
// v10（改动范围：预期声明 ↔ 实际 commit 查找，无提交回退记录语）/ v13（目标/结果上下展示）。
import { TASK_STATUS_LABELS, type TaskDetail, type TaskGateReport, type TaskPriority, type TaskRecordEntry } from '@dsh-forge/contracts'

/** 任务自然键呈现（界面展示 = slug/localId——身份解析约定） */
export function taskKeyLabel(slug: string, localId: string): string {
  return `${slug}/${localId}`
}

/** 实际耗时格式：Xm / XhYm / XdXh（缺省或 ≤0 → undefined = 不显示；仅 completed 由 chips 投影保证） */
export function formatActualDuration(ms: number | undefined): string | undefined {
  if (ms === undefined || !Number.isFinite(ms) || ms <= 0) return undefined
  const minutes = Math.round(ms / 60_000)
  if (minutes < 1) return undefined
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  if (hours < 24) return restMinutes > 0 ? `${hours}h${restMinutes}m` : `${hours}h`
  const days = Math.floor(hours / 24)
  const restHours = hours % 24
  return `${days}d${restHours > 0 ? `${restHours}h` : ''}`
}

/** 复杂度中文映射（高|中|低） */
const COMPLEXITY_ZH: Readonly<Record<TaskDetail['complexity'], string>> = {
  high: '高',
  medium: '中',
  low: '低',
}

/** kv 标签行 chip 描述（AC1：`{key} : {value}`——类别只显类型着族色/优先级/预估耗时/
 *  实际耗时[仅 completed]/复杂度中文/影响 ⚠ breaking） */
export type TaskKvChip =
  | { readonly kind: 'category'; readonly value: string }
  | { readonly kind: 'priority'; readonly value: TaskPriority }
  | { readonly kind: 'estimated'; readonly value: string }
  | { readonly kind: 'actualDuration'; readonly value: string }
  | { readonly kind: 'complexity'; readonly value: string }
  | { readonly kind: 'breaking' }

/** kv chips 投影（缺省字段逐项省略；实际耗时 = v15 仅 completed 且可格式化） */
export function taskKvChips(detail: TaskDetail): readonly TaskKvChip[] {
  const chips: TaskKvChip[] = [{ kind: 'category', value: detail.taskType }]
  if (detail.priority !== undefined) chips.push({ kind: 'priority', value: detail.priority })
  if (detail.estimatedTime !== undefined) chips.push({ kind: 'estimated', value: detail.estimatedTime })
  if (detail.taskStatus === 'completed') {
    const duration = formatActualDuration(detail.actualDurationMs)
    if (duration !== undefined) chips.push({ kind: 'actualDuration', value: duration })
  }
  if (detail.complexity !== undefined) {
    chips.push({ kind: 'complexity', value: COMPLEXITY_ZH[detail.complexity] ?? detail.complexity })
  }
  if (detail.breaking) chips.push({ kind: 'breaking' })
  return chips
}

/** 目标取值序：vars.goal → vars.scenario → taskDesc → title（原型 content.goal|scenario 兜底链） */
export function taskGoalOf(detail: TaskDetail): string {
  return (
    varsText(detail.vars ?? {}, 'goal') ??
    varsText(detail.vars ?? {}, 'scenario') ??
    detail.taskDesc ??
    detail.title
  )
}

/** 终态判据（验收 checklist 全勾口径——原型 TERM：completed | skipped） */
export function isTerminalStatus(status: TaskDetail['taskStatus']): boolean {
  return status === 'completed' || status === 'skipped'
}

/** 结果推导（AC4——综合任务记录：最近 submit/transition 优先，状态兜底） */
export type TaskResultView =
  | { readonly kind: 'eval'; readonly score: string; readonly severity: string }
  | { readonly kind: 'submitted'; readonly summary: string; readonly commitHash?: string }
  | { readonly kind: 'note'; readonly text: string }
  | { readonly kind: 'blocked'; readonly reason: string }
  | { readonly kind: 'running'; readonly text: string }
  | { readonly kind: 'pending' }
  | { readonly kind: 'status'; readonly label: string }

/** 评估得分（M2 自由文本承载——vars.score/vars.severity；缺席 = 无结构化得分。
 *  M3：main_session 砍除（裁决⑦）——🔑 主会话标记随契约面退役） */
export function evalScoreOf(
  detail: TaskDetail,
): { readonly score: string; readonly severity: string } | undefined {
  const score = varsText(detail.vars ?? {}, 'score')
  if (score === undefined) return undefined
  return {
    score,
    severity: varsText(detail.vars ?? {}, 'severity') ?? '—',
  }
}

/** 结果投影（原型 actualResult 口径：评估得分 → 最近 submit/transition → 阻塞 → 执行中 → 未开始 → 状态标签） */
export function taskResultOf(detail: TaskDetail): TaskResultView {
  const score = evalScoreOf(detail)
  if (score !== undefined) return { kind: 'eval', ...score }
  const last = [...detail.records].reverse().find((r) => r.verb === 'submit' || r.verb === 'transition')
  if (last !== undefined) {
    if (last.verb === 'submit') {
      return { kind: 'submitted', summary: last.summary ?? '—', commitHash: last.commitHash }
    }
    return { kind: 'note', text: last.summary ?? last.reason ?? '—' }
  }
  if (detail.taskStatus === 'blocked') {
    return { kind: 'blocked', reason: detail.blockedReason ?? '阻塞中' }
  }
  if (detail.taskStatus === 'in_progress') {
    const latest = detail.records[detail.records.length - 1]
    return { kind: 'running', text: latest?.summary ?? latest?.reason ?? '已领取' }
  }
  if (detail.taskStatus === 'pending') return { kind: 'pending' }
  return { kind: 'status', label: TASK_STATUS_LABELS[detail.taskStatus].zh }
}

/** vars 字符串取值（空串/缺省归一 undefined） */
export function varsText(vars: Readonly<Record<string, string>>, key: string): string | undefined {
  const value = vars[key]
  if (typeof value !== 'string' || value.trim() === '') return undefined
  return value
}

/** vars 列表取值（vars_json 具体化两形态等价：JSON 数组串 | 换行分隔列表；畸形归一空列表） */
export function varsList(vars: Readonly<Record<string, string>>, key: string): readonly string[] {
  const value = varsText(vars, key)
  if (value === undefined) return []
  const trimmed = value.trim()
  if (trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) return parsed as string[]
    } catch {
      // 畸形 JSON → 按换行列表回退（不炸渲染）
    }
  }
  return trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
}

/** vars 评分表取值（[{k, s}] JSON 串——eval 模板 rubric；畸形归一空） */
export interface RubricEntry {
  readonly k: string
  readonly s: number
}

export function varsRubric(vars: Readonly<Record<string, string>>, key: string): readonly RubricEntry[] {
  const value = varsText(vars, key)
  if (value === undefined) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item): RubricEntry[] => {
      if (typeof item === 'object' && item !== null && 'k' in item && 's' in item) {
        const k = (item as { k: unknown }).k
        const s = (item as { s: unknown }).s
        if (typeof k === 'string' && typeof s === 'number') return [{ k, s }]
      }
      return []
    })
  } catch {
    return []
  }
}

/** 最近带 gate 的 submit 记录（现状条 质量门 M/N 与覆盖率实际值同源；无 → undefined） */
export function latestSubmitGateOf(records: readonly TaskRecordEntry[]): TaskGateReport | undefined {
  for (const record of [...records].reverse()) {
    if (record.verb === 'submit' && record.gate !== undefined) return record.gate
  }
  return undefined
}

/** 质量门计数（四项布尔 compile/fmt/lint/test——M/N 呈现） */
export function gateSummary(gate: TaskGateReport): { readonly passed: number; readonly total: number } {
  const items = [gate.compile, gate.fmt, gate.lint, gate.test]
  return { passed: items.filter(Boolean).length, total: items.length }
}

/** 差异摘要计数（预期内 = 实际∩预期；计划外 = 实际−预期；未涉及 = 预期−实际） */
export interface ScopeDiff {
  readonly expected: number
  readonly actual: number
  readonly hit: number
  readonly extra: number
  readonly miss: number
}

export function scopeDiff(expected: readonly string[], actual: readonly string[]): ScopeDiff {
  const expectedSet = new Set(expected)
  let hit = 0
  for (const file of actual) {
    if (expectedSet.has(file)) hit += 1
  }
  const extra = actual.length - hit
  return { expected: expected.length, actual: actual.length, hit, extra, miss: expected.length - hit }
}

/** 实际改动范围投影（AC4：actualFiles → commit 来源 hashes；无提交回退记录语） */
export type ActualScopeView =
  | {
      readonly kind: 'files'
      readonly files: readonly string[]
      readonly commitHashes: readonly string[]
    }
  | { readonly kind: 'fallback'; readonly text: string }

/** 实际范围投影（actualFiles 在场 = 文件列 + submit commit 徽标来源；否则按状态 + 最近记录给语） */
export function actualScopeOf(detail: TaskDetail): ActualScopeView {
  if (detail.actualFiles.length > 0) {
    const commitHashes = detail.records
      .filter((r) => r.verb === 'submit' && (r.commitHash ?? '').trim() !== '')
      .map((r) => r.commitHash as string)
    return { kind: 'files', files: detail.actualFiles, commitHashes }
  }
  const latest = detail.records[detail.records.length - 1]
  if (detail.records.length === 0 && detail.taskStatus === 'pending') {
    return { kind: 'fallback', text: '暂无提交 · 未开始' }
  }
  const label = TASK_STATUS_LABELS[detail.taskStatus].zh
  const note = latest?.summary ?? latest?.reason ?? '—'
  return { kind: 'fallback', text: `暂无提交 · ${label} · ${note}` }
}
