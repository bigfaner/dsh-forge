// workbench/proposals/proposal-indexer — proposal_snapshot 感知索引(任务 5.3)。
//
// proposal_snapshot 表(schema-v2.sql §8)= 提案派生快照:(project_id,
// slug) PK + status(4 态 CHECK)+ author/created/feature_slug(可空)+
// updated_at。TECH-data-kernel-001:快照/索引类表派生可重建,不承载权威
// 语义 —— 本模块是 proposal_snapshot 的唯一写入口,行集 = 文档根
// proposals/ 目录(连同 features/ 关联判定)的纯函数(清空重建零差异;
// 感知扫描路径与重建路径共用同一同步实现,stage-asset-index 同款纪律)。
//
// 数据方言(移植基准 = forge-cli `pkg/proposal/proposal.go` +
// `pkg/infocmd/infocmd.go` Discover,Go 权威):
//   - 目录布局:proposals/<slug>/proposal.md(feature.ProposalBaseDir/
//     ProposalFileName);frontmatter 字段 = created/author/status/intent
//     (intent 不入快照,schema 闭合);
//   - created 缺失 → proposal.md mtime 的本地日期(Go modTime.Format
//     ("2006-01-02") 同义回退,非虚构 —— forge 数据面定义的派生);
//   - proposal ↔ feature 关联 = **slug 同一性**(Go 源无 feature_slug
//     frontmatter 字段;FeatureStatus 读 features/<slug>/manifest.md):
//     features/<slug>/manifest.md 存在(含 manifest.md 才是 feature 目录,
//     parse-feature 方言)→ feature_slug = slug;否则 NULL(管线早期)。
//
// SPEC CONTRADICTION 裁决(任务 5.3):live 语料 status = 首字母大写
// (`Draft`/`Superseded`),schema CHECK = 小写 4 态词表 → 解析时大小写
// 不敏感归一存小写规范形;status 缺失/类型不合/越界词表/YAML 损坏 →
// 该文件跳过不炸扫描(stage-asset-index 降级纪律;Go Discover 的
// ParseEntry 失败跳过同义)。
//
// eval 报告锚点(spec 未钉定,live 语料 = eval/ 多文件):确定性偏好链 =
// eval/final-report.md(评估终产物)优先,否则字典序首位 .md。存在性
// 判定归服务层活性 fs(镜像 getStageGate 门态活性判定,schema 无列)。

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { RepoDb } from '../repos/types.ts'
import { parseFrontmatterObject, readStringField } from '../knowledge/frontmatter.ts'

/** 提案状态词表(schema-v2.sql §8 CHECK 同源;4 态)。 */
export const PROPOSAL_STATUS_VOCAB = ['draft', 'accepted', 'rejected', 'superseded'] as const

/** 提案状态(schema CHECK 小写规范形)。 */
export type ProposalStatus = (typeof PROPOSAL_STATUS_VOCAB)[number]

const STATUS_VOCAB: ReadonlySet<string> = new Set(PROPOSAL_STATUS_VOCAB)

/** eval 报告偏好锚点(评估终产物文件名;live 语料 ui-plugin-foundation 先例)。 */
export const EVAL_REPORT_PREFERRED = 'final-report.md'

/** proposal_snapshot 行(索引写入与读取共用形态)。 */
export interface ProposalIndexRow {
  readonly slug: string
  readonly status: ProposalStatus
  /** frontmatter author 原词;缺失/类型不合 → null(不虚构)。 */
  readonly author: string | null
  /** frontmatter created 原词;缺失 → mtime 本地日期(Go 回退同义)。 */
  readonly created: string | null
  /** 关联 feature slug(slug 同一性 + manifest 在场);无关联 → null。 */
  readonly featureSlug: string | null
  /** proposal.md mtime(ISO)。 */
  readonly updatedAt: string
}

/**
 * 状态归一:大小写不敏感词表匹配 → 小写规范形;越界/空 → null(调用方
 * 跳过该文件 —— schema CHECK 不可承载越界值,SPEC CONTRADICTION 裁决)。
 */
export function normalizeProposalStatus(raw: string): ProposalStatus | null {
  const normalized = raw.toLowerCase()
  return STATUS_VOCAB.has(normalized) ? normalized as ProposalStatus : null
}

/**
 * 解析 proposal.md frontmatter(status/author/created)。不可索引(无
 * frontmatter / YAML 损坏 / status 缺失或越界)→ null —— 调用方跳过。
 * created 缺失时的 mtime 回退由 collect 层承(解析层无 fs 语义)。
 */
export function parseProposalFrontmatter(markdown: string): {
  readonly status: ProposalStatus
  readonly author: string | null
  readonly created: string | null
} | null {
  const fields = parseFrontmatterObject(markdown)
  if (fields === null) return null
  const rawStatus = readStringField(fields, 'status')
  if (rawStatus === '') return null
  const status = normalizeProposalStatus(rawStatus)
  if (status === null) return null
  const author = readStringField(fields, 'author')
  const created = readStringField(fields, 'created')
  return { status, author: author === '' ? null : author, created: created === '' ? null : created }
}

/** Date → 本地日期串(Go modTime.Format("2006-01-02") 同义)。 */
function localDateString(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${String(date.getFullYear())}-${month}-${day}`
}

/** 单文件 mtime(ISO);不可读 → null(调用方跳过,Go os.Stat 失败同义)。 */
function mtimeIsoOrNull(path: string): { readonly iso: string; readonly localDate: string } | null {
  try {
    const mtime = statSync(path).mtime
    return { iso: mtime.toISOString(), localDate: localDateString(mtime) }
  } catch {
    return null
  }
}

/**
 * eval 报告确定性选锚:eval/ 目录 .md 文件名(已排序)→ final-report.md
 * 优先,否则字典序首位。无 .md → null(eval 缺失;快照不承载,服务层
 * 活性判定共用本函数)。
 */
export function pickEvalReport(names: readonly string[]): string | null {
  const mds = names.filter(name => name.endsWith('.md')).sort()
  if (mds.length === 0) return null
  return mds.includes(EVAL_REPORT_PREFERRED) ? EVAL_REPORT_PREFERRED : mds[0] as string
}

/** 关联判定:features/<slug>/manifest.md 在场(slug 同一性;Go 权威)。 */
function associatedFeatureSlug(featuresRoot: string, slug: string): string | null {
  try {
    return statSync(join(featuresRoot, slug, 'manifest.md')).isFile() ? slug : null
  } catch {
    return null
  }
}

/**
 * 扫描 proposals/ 目录 → 期望行集。目录缺失/不可读 → 空集(无提案 =
 * 合法状态;结构性删除经行集替换语义清行)。子目录字典序遍历(确定性,
 * 不依赖 readdir 顺序)。
 */
export function collectProposalIndex(proposalsRoot: string, featuresRoot: string): ProposalIndexRow[] {
  let slugs: string[]
  try {
    slugs = readdirSync(proposalsRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort()
  } catch {
    return []
  }
  const rows: ProposalIndexRow[] = []
  for (const slug of slugs) {
    const docPath = join(proposalsRoot, slug, 'proposal.md')
    let markdown: string
    try {
      markdown = readFileSync(docPath, 'utf8')
    } catch {
      continue // proposal.md 不存在/不可读:跳过(Go ReadFile 失败同义)
    }
    const parsed = parseProposalFrontmatter(markdown)
    if (parsed === null) continue // 无 frontmatter/status 越界:跳过不炸扫描
    const mtime = mtimeIsoOrNull(docPath)
    if (mtime === null) continue
    rows.push({
      slug,
      status: parsed.status,
      author: parsed.author,
      created: parsed.created ?? mtime.localDate,
      featureSlug: associatedFeatureSlug(featuresRoot, slug),
      updatedAt: mtime.iso,
    })
  }
  return rows
}

// ---------------------------------------------------------------------------
// 表 CRUD(proposal_snapshot 唯一写入口;同步语义 = 项目级行集替换)
// ---------------------------------------------------------------------------

/** 行集替换:该项目现有行整组删除后按期望行集重写(派生纯函数语义)。 */
export function replaceProposalSnapshots(db: RepoDb, projectId: string, rows: readonly ProposalIndexRow[]): void {
  db.prepare('DELETE FROM proposal_snapshot WHERE project_id = ?').run(projectId)
  const insert = db.prepare(
    'INSERT INTO proposal_snapshot (project_id, slug, status, author, created, feature_slug, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
  for (const row of rows) {
    insert.run(projectId, row.slug, row.status, row.author, row.created, row.featureSlug, row.updatedAt)
  }
}

/**
 * 全项目重建(「派生可重建,清空重建零差异」的执行面):清本项目全部行 →
 * 重扫 proposals/ → 重写。返回重建行数。重建与感知扫描共用
 * collectProposalIndex + replaceProposalSnapshots,两路径零漂移。
 */
export function rebuildProposalIndex(db: RepoDb, projectId: string, proposalsRoot: string, featuresRoot: string): number {
  const rows = collectProposalIndex(proposalsRoot, featuresRoot)
  replaceProposalSnapshots(db, projectId, rows)
  return rows.length
}

/** proposal_snapshot 存储行形态(snake_case 列)。 */
interface ProposalSnapshotStorageRow {
  readonly slug: string
  readonly status: ProposalStatus
  readonly author: string | null
  readonly created: string | null
  readonly feature_slug: string | null
  readonly updated_at: string
}

/** 行集读取(板动词数据源;排序基线归服务层)。 */
export function listProposalRows(db: RepoDb, projectId: string): ProposalIndexRow[] {
  const rows = db
    .prepare('SELECT slug, status, author, created, feature_slug, updated_at FROM proposal_snapshot WHERE project_id = ?')
    .all(projectId) as ProposalSnapshotStorageRow[]
  return rows.map(row => ({
    slug: row.slug,
    status: row.status,
    author: row.author,
    created: row.created,
    featureSlug: row.feature_slug,
    updatedAt: row.updated_at,
  }))
}
