// workbench/knowledge/feature-read — `forge feature list/status` 只读数据面(任务 2.2)。
//
// 移植基准 = forge-cli `internal/cmd/feature/feature.go`(Go 权威):
//   - list ← discoverFeatures:遍历 docs/features/*/ 目录;manifest.md
//     frontmatter {status, created};任务进度 = tasks/index.json(completed/
//     total 全量计数);评分 = prd/prd-spec.md · design/tech-design.md ·
//     ui/ui-design.md · testing/results/results.json 各自 frontmatter `score`
//     (缺失 = 空);排序 = created 降序(单侧有 created 在前)→ manifest
//     mtime 降级。features 目录缺失 → 空表。
//   - status ← runFeatureStatus:目录缺失 → ERR_FEATURE_NOT_FOUND;manifest
//     status;任务计数(按状态聚合 + total;无 index.json → total 0);
//     PRD/DESIGN/UI 评分。
//
// 数据源纪律:本模块是 CLI 同口径的「文件数据面」读取(feature list/status
// 归宿 = dsh tool 只读,PRD 归宿表)—— 直接读文档树,不读 SQLite 快照
// (快照投影归看板 GUI;两口径由同一文档树派生)。已迁移(sqlite 权威)
// 项目的 index.json 已归档 → 任务计数读 0,与 forge CLI 自身行为一致
// (CLI 同样只读 index.json),双形态零分叉。

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { readTaskIndex } from '../indexer/parse-task.ts'
import { parseFrontmatterObject, readStringField } from './frontmatter.ts'
import { assertSegment, KnowledgeDomainError } from './knowledge-error.ts'

/** Go featureInfo 同形(mtime 仅排序用,不入投影)。 */
export interface FeatureListEntry {
  readonly slug: string
  readonly status: string
  /** manifest frontmatter created(YYYY-MM-DD);缺失 = 空串。 */
  readonly created: string
  readonly completed: number
  readonly total: number
  readonly scores: { readonly prd: string; readonly design: string; readonly ui: string; readonly tests: string }
}

/** status 动词产物(manifest + 任务聚合 + 评分)。 */
export interface FeatureStatusReport {
  readonly slug: string
  readonly status: string
  readonly tasks: {
    /** 按状态计数(Go 呈现序:pending→in_progress→completed→blocked→skipped→rejected,额外状态殿后)。 */
    readonly byStatus: Readonly<Record<string, number>>
    readonly total: number
    /** index.json 是否在场(缺席 → 计数 0,与 CLI「0 (no index.json)」同义)。 */
    readonly indexPresent: boolean
  }
  readonly scores: { readonly prd: string; readonly design: string; readonly ui: string }
}

/** Go readScoreFromFrontmatter:文件缺失/无 frontmatter → 空串。 */
function readScore(path: string): string {
  try {
    const fields = parseFrontmatterObject(readFileSync(path, 'utf8'))
    return fields === null ? '' : readStringField(fields, 'score')
  } catch {
    return ''
  }
}

function manifestMeta(featureDir: string): { status: string; created: string } {
  try {
    const fields = parseFrontmatterObject(readFileSync(join(featureDir, 'manifest.md'), 'utf8'))
    if (fields === null) return { status: '', created: '' }
    return { status: readStringField(fields, 'status'), created: readStringField(fields, 'created') }
  } catch {
    return { status: '', created: '' }
  }
}

function mtimeSec(path: string): number {
  try {
    return Math.floor(statSync(path).mtimeMs / 1000)
  } catch {
    return 0
  }
}

/** Go readTaskProgress:index.json 缺失/损坏 → 0/0。 */
function readTaskProgress(indexPath: string): { completed: number; total: number } {
  const entries = readTaskIndex(indexPath)
  if (entries === null) return { completed: 0, total: 0 }
  let completed = 0
  let total = 0
  for (const entry of Object.values(entries)) {
    total += 1
    if (entry.status === 'completed') completed += 1
  }
  return { completed, total }
}

/** list:discoverFeatures + Go 排序律(created 降序 → manifest mtime 降级)。 */
export function listFeatures(featuresDir: string): FeatureListEntry[] {
  let slugs: string[]
  try {
    slugs = readdirSync(featuresDir)
  } catch {
    return []
  }
  const items: Array<{ entry: FeatureListEntry; mtime: number }> = []
  for (const slug of slugs) {
    const featureDir = join(featuresDir, slug)
    try {
      if (!statSync(featureDir).isDirectory()) continue
    } catch {
      continue
    }
    const meta = manifestMeta(featureDir)
    const progress = readTaskProgress(join(featureDir, 'tasks', 'index.json'))
    items.push({
      entry: {
        slug,
        status: meta.status,
        created: meta.created,
        completed: progress.completed,
        total: progress.total,
        scores: {
          prd: readScore(join(featureDir, 'prd', 'prd-spec.md')),
          design: readScore(join(featureDir, 'design', 'tech-design.md')),
          ui: readScore(join(featureDir, 'ui', 'ui-design.md')),
          tests: readScore(join(featureDir, 'testing', 'results', 'results.json')),
        },
      },
      mtime: mtimeSec(join(featureDir, 'manifest.md')),
    })
  }
  return items.sort((a, b) => {
    const ca = a.entry.created
    const cb = b.entry.created
    if (ca !== '' && cb !== '') return ca > cb ? -1 : ca < cb ? 1 : 0
    if (ca !== '') return -1
    if (cb !== '') return 1
    return b.mtime - a.mtime
  }).map(item => item.entry)
}

/** Go 状态呈现序(runFeatureStatus 迭代序;suspended 等额外词表殿后)。 */
const STATUS_DISPLAY_ORDER: readonly string[] = [
  'pending', 'in_progress', 'completed', 'blocked', 'skipped', 'rejected',
]

/** status:目录缺失 → ERR_FEATURE_NOT_FOUND(Go ErrFeatureNotFound 同码义)。 */
export function readFeatureStatus(featuresDir: string, slug: string): FeatureStatusReport {
  assertSegment('feature slug', slug)
  const featureDir = join(featuresDir, slug)
  try {
    if (!statSync(featureDir).isDirectory()) {
      throw new KnowledgeDomainError('ERR_FEATURE_NOT_FOUND', `feature not found: ${slug}`, 'List features first to see the existing slugs')
    }
  } catch (error) {
    if (error instanceof KnowledgeDomainError) throw error
    throw new KnowledgeDomainError('ERR_FEATURE_NOT_FOUND', `feature not found: ${slug}`, String(error))
  }

  const meta = manifestMeta(featureDir)
  const indexPath = join(featureDir, 'tasks', 'index.json')
  const entries = readTaskIndex(indexPath)
  const byStatus: Record<string, number> = {}
  let total = 0
  if (entries !== null) {
    for (const entry of Object.values(entries)) {
      const status = typeof entry.status === 'string' ? entry.status : ''
      byStatus[status] = (byStatus[status] ?? 0) + 1
      total += 1
    }
  }
  // Go 呈现序重排(缺失状态不造零;额外状态按字典序殿后)。
  const ordered: Record<string, number> = {}
  for (const status of STATUS_DISPLAY_ORDER) {
    if (byStatus[status] !== undefined) ordered[status] = byStatus[status]
  }
  for (const status of Object.keys(byStatus).sort()) {
    if (ordered[status] === undefined) ordered[status] = byStatus[status] ?? 0
  }

  return {
    slug,
    status: meta.status,
    tasks: { byStatus: ordered, total, indexPresent: entries !== null },
    scores: {
      prd: readScore(join(featureDir, 'prd', 'prd-spec.md')),
      design: readScore(join(featureDir, 'design', 'tech-design.md')),
      ui: readScore(join(featureDir, 'ui', 'ui-design.md')),
    },
  }
}
