// workbench/knowledge/fact-table — `.forge/fact-table.json` 数据面(任务 2.2)。
//
// 移植基准 = forge-cli `pkg/facttable/facttable.go`(Go 权威,逐函数对齐):
//   - 条目形态 FactEntry {fact_id, source, kind, subject, value, confidence,
//     updated_at} + 三词表(source: static/runtime/manual;confidence:
//     confirmed/inferred/assumed;kind: signature/output_format/error_code/
//     side_effect/precondition/compilation_error/runtime_crash);
//   - Load:缺文件/空文件 → 空表;JSON 损坏 → CorruptError(带恢复提示)
//     → ERR_KNOWLEDGE_TABLE_CORRUPT;
//   - Save:mkdir .forge + MarshalIndent 两空格(写形态逐字对齐);
//   - Filter(source/confidence 空串 = 不过滤)/ GetByID / Summary(分组
//     计数 + runtime-confirmed 覆盖率)/ SortedEntries(fact_id 升序)/
//     Validate(FactEntry.Validate 同校验序)。
//
// 工具面新增(Go CLI fact 子命令为只读 list/get/summary;D4「读 + 必要写」
// 的写腿 = add:校验后追加,缺省 fact_id 自动铸 `<subject>.<kind>-<nonce>`
// (GenerateNonce 同式 time%100000,铸后查重);撞既有 id → ERR_KNOWLEDGE_
// ENTRY_EXISTS,不覆写)。

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { KnowledgeDomainError } from './knowledge-error.ts'

/** forge 数据模型位置:codeRoot/.forge/fact-table.json(forge-detect 同源)。 */
export const FACT_FILE_NAME = 'fact-table.json'
export const FORGE_DIR_NAME = '.forge'

export type FactSource = 'static' | 'runtime' | 'manual'
export type FactConfidence = 'confirmed' | 'inferred' | 'assumed'
export type FactKind =
  | 'signature' | 'output_format' | 'error_code' | 'side_effect'
  | 'precondition' | 'compilation_error' | 'runtime_crash'

/** Go ValidSources/ValidConfidences/ValidKinds 同词表。 */
export const FACT_SOURCES: readonly FactSource[] = ['static', 'runtime', 'manual']
export const FACT_CONFIDENCES: readonly FactConfidence[] = ['confirmed', 'inferred', 'assumed']
export const FACT_KINDS: readonly FactKind[] = [
  'signature', 'output_format', 'error_code', 'side_effect',
  'precondition', 'compilation_error', 'runtime_crash',
]

/** IPC 投影条目(camelCase;value = 任意 JSON 值,Go json.RawMessage 同义)。 */
export interface FactEntry {
  readonly factId: string
  readonly source: FactSource
  readonly subject: string
  readonly kind: FactKind
  readonly value: unknown
  readonly confidence: FactConfidence
  readonly updatedAt: string
}

/** 磁盘形态(snake_case;Go json tag 逐字对齐)。 */
interface FactEntryRow {
  readonly fact_id: string
  readonly source: string
  readonly subject: string
  readonly kind: string
  readonly value: unknown
  readonly confidence: string
  readonly updated_at: string
}

export function factTablePath(codeRoot: string): string {
  return join(codeRoot, FORGE_DIR_NAME, FACT_FILE_NAME)
}

function toEntry(row: FactEntryRow): FactEntry {
  return {
    factId: row.fact_id,
    source: row.source as FactSource,
    subject: row.subject,
    kind: row.kind as FactKind,
    value: row.value,
    confidence: row.confidence as FactConfidence,
    updatedAt: row.updated_at,
  }
}

function toRow(entry: FactEntry): FactEntryRow {
  return {
    fact_id: entry.factId,
    source: entry.source,
    subject: entry.subject,
    kind: entry.kind,
    value: entry.value,
    confidence: entry.confidence,
    updated_at: entry.updatedAt,
  }
}

/**
 * Go Load:缺文件/空文件 → 空表;JSON 损坏 → CorruptError 同义错误
 * (消息含路径与恢复提示原文口径)。
 */
export function loadFactTable(codeRoot: string): FactEntry[] {
  const path = factTablePath(codeRoot)
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return [] // 缺文件 = 空表(Go os.IsNotExist 同路径)
  }
  if (raw.trim() === '') return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new KnowledgeDomainError(
      'ERR_KNOWLEDGE_TABLE_CORRUPT',
      `corrupted fact table: ${path}: ${String(error)}`,
      `Fix JSON syntax in ${path} or delete it to start fresh`,
    )
  }
  if (!Array.isArray(parsed)) {
    throw new KnowledgeDomainError(
      'ERR_KNOWLEDGE_TABLE_CORRUPT',
      `corrupted fact table: ${path}: root is not a JSON array`,
      `Fix JSON syntax in ${path} or delete it to start fresh`,
    )
  }
  return parsed.filter((row): row is FactEntryRow =>
    row !== null && typeof row === 'object' && !Array.isArray(row))
    .map(toEntry)
}

/** Go Save:mkdir .forge + 两空格缩进写盘。 */
export function saveFactTable(codeRoot: string, entries: readonly FactEntry[]): void {
  const path = factTablePath(codeRoot)
  mkdirSync(join(codeRoot, FORGE_DIR_NAME), { recursive: true })
  writeFileSync(path, `${JSON.stringify(entries.map(toRow), null, 2)}\n`)
}

/** Go Filter:空过滤串 = 不过滤(全匹配)。 */
export function filterFacts(
  entries: readonly FactEntry[],
  source?: string,
  confidence?: string,
): FactEntry[] {
  return entries.filter(entry =>
    (source === undefined || source === '' || entry.source === source)
    && (confidence === undefined || confidence === '' || entry.confidence === confidence))
}

/** Go GetByID:未命中 → undefined。 */
export function findFactById(entries: readonly FactEntry[], factId: string): FactEntry | undefined {
  return entries.find(entry => entry.factId === factId)
}

/** Go SortedEntries:fact_id 升序(Array.prototype.sort 稳定)。 */
export function sortFactsById(entries: readonly FactEntry[]): FactEntry[] {
  return [...entries].sort((a, b) => (a.factId < b.factId ? -1 : a.factId > b.factId ? 1 : 0))
}

/** Go Summary 统计面 + 覆盖率(runtime confirmed / total;total 0 → 0)。 */
export interface FactSummaryStats {
  readonly total: number
  readonly bySource: Readonly<Record<string, number>>
  readonly byConfidence: Readonly<Record<string, number>>
  readonly byKind: Readonly<Record<string, number>>
  readonly runtimeConfirmed: number
  readonly coveragePercent: number
}

export function summarizeFacts(entries: readonly FactEntry[]): FactSummaryStats {
  const bySource: Record<string, number> = {}
  const byConfidence: Record<string, number> = {}
  const byKind: Record<string, number> = {}
  let runtimeConfirmed = 0
  for (const entry of entries) {
    bySource[entry.source] = (bySource[entry.source] ?? 0) + 1
    byConfidence[entry.confidence] = (byConfidence[entry.confidence] ?? 0) + 1
    byKind[entry.kind] = (byKind[entry.kind] ?? 0) + 1
    if (entry.source === 'runtime' && entry.confidence === 'confirmed') runtimeConfirmed += 1
  }
  return {
    total: entries.length,
    bySource,
    byConfidence,
    byKind,
    runtimeConfirmed,
    coveragePercent: entries.length === 0 ? 0 : Number(((runtimeConfirmed / entries.length) * 100).toFixed(1)),
  }
}

/**
 * Go Validate 同校验(必填 + 词表;校验序对齐)。违例 →
 * ERR_KNOWLEDGE_INPUT_INVALID(消息含合法词表,Go 文案口径)。
 */
export function validateFactEntry(entry: FactEntry): void {
  const invalid = (message: string): KnowledgeDomainError =>
    new KnowledgeDomainError('ERR_KNOWLEDGE_INPUT_INVALID', message)
  if (entry.factId === '') throw invalid('fact_id is required')
  if (!FACT_SOURCES.includes(entry.source as FactSource)) {
    throw invalid(`invalid source: ${JSON.stringify(entry.source)} (valid: [${FACT_SOURCES.join(' ')}])`)
  }
  if (entry.subject === '') throw invalid('subject is required')
  if (!FACT_KINDS.includes(entry.kind as FactKind)) {
    throw invalid(`invalid kind: ${JSON.stringify(entry.kind)} (valid: [${FACT_KINDS.join(' ')}])`)
  }
  if (!FACT_CONFIDENCES.includes(entry.confidence as FactConfidence)) {
    throw invalid(`invalid confidence: ${JSON.stringify(entry.confidence)} (valid: [${FACT_CONFIDENCES.join(' ')}])`)
  }
  if (entry.value === undefined || entry.value === null) throw invalid('value is required')
  if (entry.updatedAt === '') throw invalid('updated_at is required')
}

/** Go GenerateNonce 同式(time%100000 短随机)。 */
function mintNonce(): string {
  return `${Date.now() % 100000}`
}

/** 缺省 fact_id 铸造:`<subject>.<kind>-<nonce>`,对既有 id 查重避让。 */
export function mintFactId(subject: string, kind: string, existing: ReadonlySet<string>): string {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const candidate = `${subject}.${kind}-${mintNonce()}${attempt === 0 ? '' : `-${attempt}`}`
    if (!existing.has(candidate)) return candidate
  }
  throw new KnowledgeDomainError(
    'ERR_KNOWLEDGE_INPUT_INVALID',
    `cannot mint a unique fact_id for subject ${JSON.stringify(subject)} (table congested)`,
  )
}

/**
 * add 写腿:校验 → 查重(显式 id 撞既有 → ERR_KNOWLEDGE_ENTRY_EXISTS;
 * 缺省 id 自动铸)→ 追加落盘。返回追加后的条目。
 */
export function addFactEntry(codeRoot: string, draft: {
  readonly factId?: string
  readonly source?: FactSource
  readonly subject: string
  readonly kind: FactKind
  readonly value: unknown
  readonly confidence?: FactConfidence
}): FactEntry {
  const table = loadFactTable(codeRoot)
  const existing = new Set(table.map(entry => entry.factId))
  const entry: FactEntry = {
    factId: draft.factId ?? mintFactId(draft.subject, draft.kind, existing),
    source: draft.source ?? 'manual',
    subject: draft.subject,
    kind: draft.kind,
    value: draft.value,
    confidence: draft.confidence ?? 'inferred',
    updatedAt: new Date().toISOString(),
  }
  validateFactEntry(entry)
  if (existing.has(entry.factId)) {
    throw new KnowledgeDomainError(
      'ERR_KNOWLEDGE_ENTRY_EXISTS',
      `fact ${JSON.stringify(entry.factId)} already exists in the table (facts are append-only; choose a new fact_id)`,
    )
  }
  saveFactTable(codeRoot, [...table, entry])
  return entry
}
