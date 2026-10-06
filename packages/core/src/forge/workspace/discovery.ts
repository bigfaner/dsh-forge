// 发现面只读扫描协作者（任务 1.3；tech-design §交互三/§交互二 + db-schema §2.1 发现面契约骨架）。
// 注册新建径与存量库缺席补建径共用（store onFirstCreate / project-service onRegistered 同构
// 接线——1.4/3.4 装配）：docs/features/<slug>/ 目录扫描 → features 行（manifest frontmatter
// title/status/summary 初值·单向阀门）+ feature_documents 行（目录约定七类全收，不止 SC4 四类）；
// docs/proposals/<slug>/proposal.md → proposals 行（frontmatter 初值）。行此后稳定
// （悬空 ≠ 缺行）；显式刷新 M2 不做（用户裁决——禁刷新入口）。
//
// 纪律：
// - 扫描对 forge_dir 只读零写入（SC3 Hard Rule——仅 readdir/readFile/stat 只读调用）；
// - 扫描结果写入经 store 产出句柄单事务（行吸收 + 容错 warn 记账同事务全成全败）；
// - 单向阀门：INSERT OR IGNORE——重扫不覆写既有行（DB 为 SoT；SC8 零迁移·单向吸收白名单），
//   缺席文档行可补建（行级阀门：加缺不覆写）；
// - 逐目录隔离容错：非 UTF-8 / frontmatter 畸形 / 非法目录名 → 跳过该文件/目录 + 工作区
//   app_key_logs（warn，scope=tasks），不阻断注册整体；
// - frontmatter 薄解析自实现（import 边纪律禁 import knowledge 内部实现——forge/ ↛ knowledge/
//   oxlint 铁律③；manifest/proposal 均纯标量键值面，不引 gray-matter；status 缺省与词汇经
//   @dsh-forge/contracts 常量对齐）。
// post-ingestion 挂点：对新入库 feature 逐个送校（2.5 validateFeatureTasks 接线）；失败
// fail-soft 记账（warn）不抛不断链。
import { randomUUID } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import {
  DOC_KINDS,
  FEATURE_STATUSES,
  FRONTMATTER_STATUS_DEFAULT,
  PROPOSAL_STATUSES,
  type DocKind,
  type FeatureStatus,
  type ProposalStatus,
} from '@dsh-forge/contracts'
import { withTransaction } from '../../db/transaction.js'
import { errMessage } from '../../util.js'
import { recordWorkspaceKeyLog } from './app-key-logs.js'
import type { WorkspaceFirstCreateHook } from './store.js'

/**
 * 目录约定七类文档 → feature 目录内相对路径（正斜杠；manifest Documents 表口径——
 * prd 三件 + design 四件；非标准位置不自动发现，错误索引比缺失索引贵）。
 */
export const DOC_KIND_FILES: Readonly<Record<DocKind, string>> = {
  'prd-spec': 'prd/prd-spec.md',
  'user-stories': 'prd/prd-user-stories.md',
  'ui-functions': 'prd/prd-ui-functions.md',
  'tech-design': 'design/tech-design.md',
  'er-diagram': 'design/er-diagram.md',
  'sql-schema': 'design/schema.sql',
  'page-map': 'design/page-map.md',
}

/** features.feature_status 吸收缺省（schema DEFAULT 同值；非 knowledge 域 draft） */
const DEFAULT_FEATURE_STATUS: FeatureStatus = 'prd'

/** 扫描入参（projectId 中央行标识 + forge_dir 工作区根 + store 产出的工作区库句柄） */
export interface DiscoveryScanInput {
  readonly projectId: string
  /** forge_dir（工作区根——docs/features 与 docs/proposals 所在地） */
  readonly forgeDir: string
  readonly db: Database.Database
}

/** 容错跳过清单项（每条已各记工作区 app_key_logs warn） */
export interface DiscoverySkippedEntry {
  /** 相对 forge_dir 的定位（正斜杠；目录以 '/' 结尾） */
  readonly target: string
  /** 跳过原因（人类可读） */
  readonly reason: string
  /** 处置结果（跳过该文件后吸收面如何降级） */
  readonly disposition: string
}

/** 扫描报告（测试与记账消费；featuresIngested = post-ingestion 送校面） */
export interface DiscoveryScanReport {
  /** 新入库 feature slug 清单（排序确定性；既有行不在此列） */
  readonly featuresIngested: readonly string[]
  /** 新入库 proposal slug 清单（排序确定性） */
  readonly proposalsIngested: readonly string[]
  /** 本次建档的 feature_documents 行数（含为既有 feature 补建的缺席行） */
  readonly documentsIndexed: number
  /** 容错跳过清单 */
  readonly skipped: readonly DiscoverySkippedEntry[]
}

/** post-ingestion 挂点入参 */
export interface FeatureIngestedInput {
  readonly projectId: string
  readonly featureSlug: string
}

/** 扫描协作者依赖（挂点可选——2.5 validateFeatureTasks 接线） */
export interface DiscoveryDeps {
  /** 对新入库 feature 逐个送校（事务提交后回调；失败 fail-soft 记账不抛不断链） */
  readonly onFeatureIngested?: (input: FeatureIngestedInput) => void
}

// ───────────────────────── 只读文件面助手（SC3：零写入） ─────────────────────────

/** 列子目录名（字母序确定性；符号链接不跟随——目录形态才算约定条目；缺席/不可读 → 空集静默） */
function listDirs(absDir: string): string[] {
  try {
    return readdirSync(absDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
  } catch {
    return []
  }
}

/** 常规文件在场判定 */
function fileExists(absPath: string): boolean {
  try {
    return statSync(absPath).isFile()
  } catch {
    return false
  }
}

/** 严格 UTF-8 解码器（非 UTF-8 → fatal 抛错） */
const utf8Fatal = new TextDecoder('utf-8', { fatal: true })

function readUtf8(absPath: string): { ok: true; text: string } | { ok: false; reason: string } {
  try {
    return { ok: true, text: utf8Fatal.decode(readFileSync(absPath)) }
  } catch {
    return { ok: false, reason: '非 UTF-8 编码（解码失败）' }
  }
}

/** slug 自然键卫生：禁隐藏前导点/首尾空白/尾点/路径分隔与保留字面/控制字符 */
function isLegalSlugDirName(name: string): boolean {
  if (name === '' || name.startsWith('.')) return false
  if (name !== name.trim() || name.endsWith('.')) return false
  if (/[\\/:*?"<>|]/.test(name)) return false
  for (const ch of name) {
    const code = ch.codePointAt(0) ?? 0
    if (code < 0x20 || code === 0x7f) return false
  }
  return true
}

// ───────────────────────── frontmatter 薄解析（自实现——铁律③ 禁 import knowledge） ─────────────────────────

/** 吸收面关注的纯标量键（键名经 contracts frontmatter 契约对齐） */
const FRONTMATTER_KEYS = ['title', 'status', 'summary', 'author'] as const
type ThinFrontmatter = Partial<Record<(typeof FRONTMATTER_KEYS)[number], string>>

const FRONTMATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---/

/** 剥离成对包裹引号（"…" / '…'） */
function stripQuotes(value: string): string {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1).trim()
  }
  return value
}

/**
 * 薄解析：`---` 分隔块内纯标量键值行（manifest/proposal 实际形态）。无分隔块/未闭合 →
 * { ok: false }（畸形）；非键值行与面外键宽容忽略；空值视为缺省。
 */
function parseThinFrontmatter(text: string): { ok: true; data: ThinFrontmatter } | { ok: false; reason: string } {
  const matched = text.match(FRONTMATTER_RE)
  if (matched === null) return { ok: false, reason: 'frontmatter 畸形：无 --- 分隔块或未闭合' }
  const data: ThinFrontmatter = {}
  for (const line of (matched[1] ?? '').split(/\r?\n/)) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue
    const kv = line.match(/^([A-Za-z][A-Za-z0-9_-]*):[ \t]*(.*)$/)
    if (kv === null) continue // 列表/嵌套等非标量行宽容忽略——吸收面仅纯标量键
    const key = kv[1] as (typeof FRONTMATTER_KEYS)[number]
    if (!FRONTMATTER_KEYS.includes(key)) continue
    const value = stripQuotes((kv[2] ?? '').trim())
    if (value !== '') data[key] = value
  }
  return { ok: true, data }
}

/** 状态词汇归一（大小写宽容；未知/缺席 → 缺省——容错面仅 AC 三类，词汇外值不计 warn） */
function normalizeStatus<T extends string>(raw: string | undefined, vocab: readonly T[], fallback: T): T {
  if (raw === undefined) return fallback
  const value = raw.trim().toLowerCase()
  return (vocab as readonly string[]).includes(value) ? (value as T) : fallback
}

// ───────────────────────── 阶段一：只读扫描（零写入） ─────────────────────────

interface ScannedProposal {
  readonly slug: string
  readonly title: string
  readonly status: ProposalStatus
  readonly author?: string
}

interface ScannedFeature {
  readonly slug: string
  readonly title: string
  readonly status: FeatureStatus
  readonly summary?: string
  readonly docs: readonly DocKind[]
}

/** docs/proposals/<slug>/proposal.md 扫描：畸形/非 UTF-8 → 跳过该文件（提案不建档）+ warn */
function scanProposals(forgeDir: string, warn: (e: DiscoverySkippedEntry) => void): ScannedProposal[] {
  const out: ScannedProposal[] = []
  const proposalsRoot = join(forgeDir, 'docs', 'proposals')
  for (const name of listDirs(proposalsRoot)) {
    if (!isLegalSlugDirName(name)) {
      warn({ target: `docs/proposals/${name}/`, reason: '非法目录名', disposition: '跳过该目录（不阻断其余吸收）' })
      continue
    }
    const rel = `docs/proposals/${name}/proposal.md`
    if (!fileExists(join(proposalsRoot, name, 'proposal.md'))) continue // 无约定锚点文件 = 非约定形态，静默不计
    const text = readUtf8(join(proposalsRoot, name, 'proposal.md'))
    if (!text.ok) {
      warn({ target: rel, reason: text.reason, disposition: '跳过该文件（提案未建档）' })
      continue
    }
    const fm = parseThinFrontmatter(text.text)
    if (!fm.ok) {
      warn({ target: rel, reason: fm.reason, disposition: '跳过该文件（提案未建档）' })
      continue
    }
    out.push({
      slug: name,
      title: fm.data.title ?? name, // title 缺省 = slug（proposal frontmatter 无 title 为常态）
      status: normalizeStatus(fm.data.status, PROPOSAL_STATUSES, FRONTMATTER_STATUS_DEFAULT),
      author: fm.data.author,
    })
  }
  return out
}

/**
 * docs/features/<slug>/ 目录扫描：目录在场 = 特性行建档依据（manifest 只供初值，best-effort——
 * 畸形/非 UTF-8 → 跳过该文件记 warn，特性行按缺省建档）；七类文档按精确路径在场判定（不解析内容）。
 */
function scanFeatures(forgeDir: string, warn: (e: DiscoverySkippedEntry) => void): ScannedFeature[] {
  const out: ScannedFeature[] = []
  const featuresRoot = join(forgeDir, 'docs', 'features')
  for (const name of listDirs(featuresRoot)) {
    if (!isLegalSlugDirName(name)) {
      warn({ target: `docs/features/${name}/`, reason: '非法目录名', disposition: '跳过该目录（不阻断其余吸收）' })
      continue
    }
    const rel = `docs/features/${name}/manifest.md`
    let fm: ThinFrontmatter = {}
    if (fileExists(join(featuresRoot, name, 'manifest.md'))) {
      const text = readUtf8(join(featuresRoot, name, 'manifest.md'))
      const parsed = text.ok ? parseThinFrontmatter(text.text) : { ok: false as const, reason: text.reason }
      if (parsed.ok) {
        fm = parsed.data
      } else {
        warn({ target: rel, reason: parsed.reason, disposition: '跳过该文件（特性行按缺省值建档）' })
      }
    }
    const docs = DOC_KINDS.filter((kind) => fileExists(join(featuresRoot, name, ...DOC_KIND_FILES[kind].split('/'))))
    out.push({
      slug: name,
      title: fm.title ?? name, // title 缺省 = slug（manifest 无 title 为常态）
      status: normalizeStatus(fm.status, FEATURE_STATUSES, DEFAULT_FEATURE_STATUS),
      summary: fm.summary,
      docs,
    })
  }
  return out
}

// ───────────────────────── 阶段二：单事务吸收（单向阀门） ─────────────────────────

interface IngestStatements {
  readonly proposal: Database.Statement
  readonly feature: Database.Statement
  readonly doc: Database.Statement
  readonly proposalIdBySlug: Database.Statement<unknown[], { id: string }>
  readonly featureIdBySlug: Database.Statement<unknown[], { id: string }>
}

function prepareIngest(db: Database.Database): IngestStatements {
  return {
    proposal: db.prepare(
      `INSERT OR IGNORE INTO proposals (id, slug, title, proposal_status, rel_path, author, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    feature: db.prepare(
      `INSERT OR IGNORE INTO features (id, slug, title, feature_status, summary, proposal_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    doc: db.prepare(
      `INSERT OR IGNORE INTO feature_documents (feature_id, doc_kind, rel_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ),
    proposalIdBySlug: db.prepare<unknown[], { id: string }>(`SELECT id FROM proposals WHERE slug = ?`),
    featureIdBySlug: db.prepare<unknown[], { id: string }>(`SELECT id FROM features WHERE slug = ?`),
  }
}

/**
 * 单事务吸收：提案先行（同事务内可见——feature 谱系回填 §6-31）→ features（UNIQUE 阀门，
 * 命中既有 = 不覆写，docs 挂既有行 id）→ feature_documents（行级阀门：加缺不覆写）；
 * 容错 warn 记账同事务落库。
 */
function ingest(
  db: Database.Database,
  stmts: IngestStatements,
  projectId: string,
  now: string,
  proposals: readonly ScannedProposal[],
  features: readonly ScannedFeature[],
  skipped: readonly DiscoverySkippedEntry[],
): { featuresIngested: string[]; proposalsIngested: string[]; documentsIndexed: number } {
  const proposalsIngested: string[] = []
  for (const p of proposals) {
    const res = stmts.proposal.run(randomUUID(), p.slug, p.title, p.status, `docs/proposals/${p.slug}/proposal.md`, p.author ?? null, now, now)
    if (res.changes === 1) proposalsIngested.push(p.slug) // 既有行 = 阀门命中，不覆写不计新
  }
  const featuresIngested: string[] = []
  let documentsIndexed = 0
  for (const f of features) {
    // 谱系回填：同名提案在库（含同事务先吸收者）→ 按 slug 查 id；既有 feature 行不回填（阀门）
    const proposalId = stmts.proposalIdBySlug.get(f.slug)?.id ?? null
    const newId = randomUUID()
    const res = stmts.feature.run(newId, f.slug, f.title, f.status, f.summary ?? null, proposalId, now, now)
    const featureId = res.changes === 1 ? newId : (stmts.featureIdBySlug.get(f.slug)?.id ?? newId)
    if (res.changes === 1) featuresIngested.push(f.slug)
    for (const kind of f.docs) {
      documentsIndexed += stmts.doc.run(featureId, kind, `docs/features/${f.slug}/${DOC_KIND_FILES[kind]}`, now, now).changes
    }
  }
  for (const s of skipped) {
    recordWorkspaceKeyLog(db, { level: 'warn', scope: 'tasks', data: { projectId, target: s.target, reason: s.reason, disposition: s.disposition } })
  }
  return { featuresIngested, proposalsIngested, documentsIndexed }
}

// ───────────────────────── 入口：扫描 + 吸收 + post-ingestion 挂点 ─────────────────────────

/**
 * 发现面只读扫描（永不因单目录/单文件缺陷抛出——逐项隔离；意外异常上抛归调用方 fail-soft 包装）。
 * 三段：只读扫描 → 单事务吸收（行 + warn 记账）→ post-ingestion 挂点（提交后逐 feature 回调）。
 */
export function runDiscoveryScan(input: DiscoveryScanInput, deps: DiscoveryDeps = {}): DiscoveryScanReport {
  const skipped: DiscoverySkippedEntry[] = []
  const warn = (e: DiscoverySkippedEntry): void => {
    skipped.push(e)
  }

  // 阶段一：只读扫描（SC3——本段对 forge_dir 零写入）
  const proposals = scanProposals(input.forgeDir, warn)
  const features = scanFeatures(input.forgeDir, warn)

  // 阶段二：单事务吸收（store 产出句柄；行 + 容错记账全成全败）
  const stmts = prepareIngest(input.db)
  const counts = withTransaction(input.db, () =>
    ingest(input.db, stmts, input.projectId, new Date().toISOString(), proposals, features, skipped),
  )

  // 阶段三：post-ingestion 挂点（提交后回调——读面送校；失败 fail-soft 记账不抛不断链）
  for (const featureSlug of counts.featuresIngested) {
    try {
      deps.onFeatureIngested?.({ projectId: input.projectId, featureSlug })
    } catch (cause) {
      try {
        recordWorkspaceKeyLog(input.db, {
          level: 'warn',
          scope: 'tasks',
          data: {
            projectId: input.projectId,
            featureSlug,
            error: errMessage(cause),
            disposition: 'post-ingestion 送校失败——已跳过（fail-soft，不阻断吸收）',
          },
        })
      } catch (logCause) {
        console.warn(
          `post-ingestion 送校失败记账降级（库不可写）：${input.projectId} / ${featureSlug}——${errMessage(cause)}；记账失败：${errMessage(logCause)}`,
        )
      }
    }
  }

  return {
    featuresIngested: counts.featuresIngested,
    proposalsIngested: counts.proposalsIngested,
    documentsIndexed: counts.documentsIndexed,
    skipped,
  }
}

/** 首建协作者适配器入参（forge_dir 解析归装配层——中央 projects 行 ws_path） */
export interface DiscoveryFirstCreateDeps extends DiscoveryDeps {
  /** projectId → forge_dir（工作区根）解析 */
  readonly resolveForgeDir: (projectId: string) => string
}

/**
 * 适配 store 首建挂点（交互二「库文件缺席 → 新建 v1 + 发现面扫描」；注册新建径交互三由
 * 1.4/3.4 以同构闭包接线）——协作者失败由 store runFirstCreate fail-soft 包装（scope=workspace）。
 */
export function createDiscoveryFirstCreateHook(deps: DiscoveryFirstCreateDeps): WorkspaceFirstCreateHook {
  return (projectId, db) => {
    runDiscoveryScan({ projectId, forgeDir: deps.resolveForgeDir(projectId), db }, deps)
  }
}
