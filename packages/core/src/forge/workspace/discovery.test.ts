// 任务 1.3 测试 —— 发现面只读扫描协作者（AC1 features 初值·单向阀门 / AC2 feature_documents
// 全类索引 / AC3 proposals 初值 / AC4 逐目录隔离容错 / AC5 S9① 口径夹具 + post-ingestion 挂点）。
// 夹具沿 S9① spike 口径：真实目录树临时夹具（docs/features/<slug>/ + docs/proposals/<slug>/
// proposal.md），断言走工作区库直查（WORKSPACE_MIGRATIONS 直开，db.test.ts 形制）。
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { DOC_KINDS, type DocKind } from '@dsh-forge/contracts'
import { openDatabase } from '../../db/index.js'
import { createDiscoveryFirstCreateHook, DOC_KIND_FILES, runDiscoveryScan } from './discovery.js'
import { FORGE_DB_SCHEMA_VERSION, WORKSPACE_MIGRATIONS } from './migrations.js'
import { createWorkspaceStore } from './store.js'

// ───────────────────────── 夹具基建（真实目录树 + 独立工作区库） ─────────────────────────

let root: string
let seq = 0
afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true })
})

/** 独占夹具目录（forge_dir 本体；库文件另行落独立 db 目录——SC3 快照对照不污染） */
const fixtureForgeDir = (): string => {
  root ??= mkdtempSync(join(tmpdir(), 'dsh-forge-disc-'))
  return join(root, `ws-${String(++seq).padStart(3, '0')}`)
}

/** 独立库目录（每用例独库——迁移直开） */
const openWorkspaceDb = (): { db: Database.Database; file: string } => {
  root ??= mkdtempSync(join(tmpdir(), 'dsh-forge-disc-'))
  const dir = join(root, `db-${String(++seq).padStart(3, '0')}`)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'forge.db')
  return { db: openDatabase(file, { migrations: WORKSPACE_MIGRATIONS, schemaVersion: FORGE_DB_SCHEMA_VERSION }), file }
}

const manifestOf = (slug: string, fm: string): string => `---\nfeature: "${slug}"\ncreated: "2026-10-05"\n${fm}---\n\n# Feature: ${slug}\n`

function writeFeatureManifest(forgeDir: string, slug: string, content: string | Buffer): void {
  const dir = join(forgeDir, 'docs', 'features', slug)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'manifest.md'), content)
}

function writeFeatureDocs(forgeDir: string, slug: string, kinds: readonly DocKind[]): void {
  for (const kind of kinds) {
    const abs = join(forgeDir, 'docs', 'features', slug, ...DOC_KIND_FILES[kind].split('/'))
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, `<!-- ${kind} placeholder -->\n`)
  }
}

function writeProposalFile(forgeDir: string, slug: string, frontmatter: string): void {
  const dir = join(forgeDir, 'docs', 'proposals', slug)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'proposal.md'), `---\ncreated: "2026-10-05"\nauthor: "faner"\n${frontmatter}---\n\n# Proposal: ${slug}\n`)
}

function makeIllegalDirs(forgeDir: string, names: readonly string[]): void {
  for (const name of names) mkdirSync(join(forgeDir, 'docs', 'features', name), { recursive: true })
}

/** 种入既有 feature 行（单向阀门负样例：DB 已是 SoT） */
function seedFeature(db: Database.Database, slug: string, title: string, status: string): string {
  const id = `seed-${slug}`
  db.prepare(
    `INSERT INTO features (id, slug, title, feature_status, created_at, updated_at) VALUES (?, ?, ?, ?, '2026-10-06T00:00:00.000Z', '2026-10-06T00:00:00.000Z')`,
  ).run(id, slug, title, status)
  return id
}

// ───────────────────────── 查询助手 ─────────────────────────

interface FeatureRow {
  id: string
  slug: string
  title: string
  feature_status: string
  summary: string | null
  proposal_id: string | null
  created_at: string
  updated_at: string
}
interface DocRow {
  doc_kind: string
  rel_path: string
}
interface ProposalRow {
  id: string
  slug: string
  title: string
  proposal_status: string
  rel_path: string | null
  author: string | null
}
interface KeyLogRow {
  level: string
  scope: string
  data_json: string
}

const featureBySlug = (db: Database.Database, slug: string): FeatureRow | undefined =>
  db.prepare<unknown[], FeatureRow>(`SELECT * FROM features WHERE slug = ?`).get(slug)
const docsOf = (db: Database.Database, featureId: string): DocRow[] =>
  db.prepare<unknown[], DocRow>(`SELECT doc_kind, rel_path FROM feature_documents WHERE feature_id = ? ORDER BY doc_kind`).all(featureId)
const proposalBySlug = (db: Database.Database, slug: string): ProposalRow | undefined =>
  db.prepare<unknown[], ProposalRow>(`SELECT * FROM proposals WHERE slug = ?`).get(slug)
const keyLogs = (db: Database.Database): KeyLogRow[] =>
  db.prepare<unknown[], KeyLogRow>(`SELECT level, scope, data_json FROM app_key_logs ORDER BY id`).all()

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const ALL_KINDS: readonly DocKind[] = DOC_KINDS

// ───────────────────────── AC1：features 子目录扫描落行 + 初值·单向阀门 ─────────────────────────

describe('AC1 features 子目录扫描落行：manifest frontmatter title/status 初值', () => {
  it('frontmatter 初值吸收（引号剥离/summary），manifest 缺席走缺省（title=slug、status=prd）', () => {
    const forgeDir = fixtureForgeDir()
    writeFeatureManifest(forgeDir, 'feat-alpha', manifestOf('feat-alpha', 'status: completed\ntitle: "特性 甲"\nsummary: "一句话摘要"\n'))
    writeFeatureManifest(forgeDir, 'feat-bare', manifestOf('feat-bare', ''))
    const { db } = openWorkspaceDb()

    const report = runDiscoveryScan({ projectId: 'p1', forgeDir, db })

    expect(report.featuresIngested).toEqual(['feat-alpha', 'feat-bare'])
    expect(report.skipped).toEqual([])
    const alpha = featureBySlug(db, 'feat-alpha')
    expect(alpha).toBeDefined()
    expect(alpha?.title).toBe('特性 甲') // 引号剥离
    expect(alpha?.feature_status).toBe('completed')
    expect(alpha?.summary).toBe('一句话摘要')
    expect(alpha?.proposal_id).toBeNull()
    expect(alpha?.id).not.toBe('')
    expect(alpha?.created_at).toMatch(ISO_RE)
    const bare = featureBySlug(db, 'feat-bare')
    expect(bare?.title).toBe('feat-bare') // title 缺省 = slug
    expect(bare?.feature_status).toBe('prd') // status 缺省 = schema 缺省
    expect(bare?.summary).toBeNull()
    db.close()
  })

  it('单向阀门（DB 为 SoT）：既有行不覆写；重扫不覆写人工改写值；缺席文档行可补建', () => {
    const forgeDir = fixtureForgeDir()
    writeFeatureManifest(forgeDir, 'feat-alpha', manifestOf('feat-alpha', 'status: completed\ntitle: "文件侧新标题"\n'))
    writeFeatureDocs(forgeDir, 'feat-alpha', ['tech-design'])
    const { db } = openWorkspaceDb()
    const seededId = seedFeature(db, 'feat-alpha', '库内旧标题', 'design')

    const report = runDiscoveryScan({ projectId: 'p1', forgeDir, db })

    expect(report.featuresIngested).toEqual([]) // 既有行 = 非新入库（post-ingestion 不触发）
    const row = featureBySlug(db, 'feat-alpha')
    expect(row?.id).toBe(seededId)
    expect(row?.title).toBe('库内旧标题') // 不覆写
    expect(row?.feature_status).toBe('design')
    // 缺席文档行补建（行级阀门：加缺不覆写既有）——挂既有行 id
    expect(docsOf(db, seededId).map((d) => d.doc_kind)).toEqual(['tech-design'])
    expect(report.documentsIndexed).toBe(1)

    // 人工纠偏后再扫（文件侧再变）：库内值保持
    db.prepare(`UPDATE features SET title = '人工纠偏标题' WHERE slug = ?`).run('feat-alpha')
    writeFeatureManifest(forgeDir, 'feat-alpha', manifestOf('feat-alpha', 'status: archived\ntitle: "又一版文件标题"\n'))
    runDiscoveryScan({ projectId: 'p1', forgeDir, db })
    const after = featureBySlug(db, 'feat-alpha')
    expect(after?.title).toBe('人工纠偏标题')
    expect(after?.feature_status).toBe('design')
    db.close()
  })

  it('manifest status 未知词汇 → 容错走缺省 prd（不计 warn——容错面仅 AC4 三类）', () => {
    const forgeDir = fixtureForgeDir()
    writeFeatureManifest(forgeDir, 'feat-weird', manifestOf('feat-weird', 'status: bogus-stage\n'))
    const { db } = openWorkspaceDb()

    runDiscoveryScan({ projectId: 'p1', forgeDir, db })

    expect(featureBySlug(db, 'feat-weird')?.feature_status).toBe('prd')
    expect(keyLogs(db)).toEqual([])
    db.close()
  })
})

// ───────────────────────── AC2：feature_documents 全类文档索引 ─────────────────────────

describe('AC2 feature_documents 全类文档索引落行', () => {
  it('七类皆收（不止 SC4 四类）；rel_path 相对 forge_dir 正斜杠', () => {
    const forgeDir = fixtureForgeDir()
    writeFeatureManifest(forgeDir, 'feat-full', manifestOf('feat-full', 'status: design\n'))
    writeFeatureDocs(forgeDir, 'feat-full', ALL_KINDS)
    const { db } = openWorkspaceDb()

    const report = runDiscoveryScan({ projectId: 'p1', forgeDir, db })

    expect(report.documentsIndexed).toBe(7)
    const id = featureBySlug(db, 'feat-full')?.id
    expect(id).toBeDefined()
    const docs = docsOf(db, id as string)
    expect(docs.map((d) => d.doc_kind)).toEqual([...ALL_KINDS].sort())
    for (const kind of ALL_KINDS) {
      const row = docs.find((d) => d.doc_kind === kind)
      expect(row?.rel_path).toBe(`docs/features/feat-full/${DOC_KIND_FILES[kind]}`)
      expect(row?.rel_path.includes('\\')).toBe(false) // 正斜杠纪律
    }
    db.close()
  })

  it('部分文档只建在场行（目录约定精确路径映射：schema.sql → sql-schema）', () => {
    const forgeDir = fixtureForgeDir()
    writeFeatureManifest(forgeDir, 'feat-partial', manifestOf('feat-partial', ''))
    writeFeatureDocs(forgeDir, 'feat-partial', ['tech-design', 'sql-schema'])
    const { db } = openWorkspaceDb()

    runDiscoveryScan({ projectId: 'p1', forgeDir, db })

    const docs = docsOf(db, featureBySlug(db, 'feat-partial')?.id as string)
    expect(docs).toEqual([
      { doc_kind: 'sql-schema', rel_path: 'docs/features/feat-partial/design/schema.sql' },
      { doc_kind: 'tech-design', rel_path: 'docs/features/feat-partial/design/tech-design.md' },
    ])
    db.close()
  })

  it('悬空容忍：行落库后文件删除 → 行仍在（悬空 ≠ 缺行）', () => {
    const forgeDir = fixtureForgeDir()
    writeFeatureManifest(forgeDir, 'feat-dangle', manifestOf('feat-dangle', ''))
    writeFeatureDocs(forgeDir, 'feat-dangle', ALL_KINDS)
    const { db } = openWorkspaceDb()
    const id = (runDiscoveryScan({ projectId: 'p1', forgeDir, db }), featureBySlug(db, 'feat-dangle')?.id)

    unlinkSync(join(forgeDir, 'docs', 'features', 'feat-dangle', 'prd', 'prd-spec.md'))

    expect(docsOf(db, id as string)).toHaveLength(7) // 行稳定，不因文件消失而缺行
    db.close()
  })
})

// ───────────────────────── AC3：proposals proposal.md 初值落行 ─────────────────────────

describe('AC3 proposals proposal.md frontmatter 初值落行', () => {
  it('status 归一（Accepted → accepted）/ author / rel_path / title 缺省 = slug', () => {
    const forgeDir = fixtureForgeDir()
    writeProposalFile(forgeDir, 'prop-a', 'status: Accepted\nintent: "new-feature"\n')
    writeProposalFile(forgeDir, 'prop-b', 'status: Draft\ntitle: "提案 乙"\n')
    const { db } = openWorkspaceDb()

    const report = runDiscoveryScan({ projectId: 'p1', forgeDir, db })

    expect(report.proposalsIngested).toEqual(['prop-a', 'prop-b'])
    const a = proposalBySlug(db, 'prop-a')
    expect(a?.proposal_status).toBe('accepted') // 大小写归一
    expect(a?.author).toBe('faner')
    expect(a?.rel_path).toBe('docs/proposals/prop-a/proposal.md')
    expect(a?.title).toBe('prop-a') // title 缺省 = slug
    const b = proposalBySlug(db, 'prop-b')
    expect(b?.proposal_status).toBe('draft')
    expect(b?.title).toBe('提案 乙')
    db.close()
  })

  it('proposal_id 回填：同名提案在库 → feature 行回填（单向阀门同族：既有 feature 不回填）', () => {
    const forgeDir = fixtureForgeDir()
    writeProposalFile(forgeDir, 'duo', 'status: Accepted\n')
    writeFeatureManifest(forgeDir, 'duo', manifestOf('duo', ''))
    writeProposalFile(forgeDir, 'solo', 'status: Draft\n')
    writeFeatureManifest(forgeDir, 'solo', manifestOf('solo', ''))
    const { db } = openWorkspaceDb()
    seedFeature(db, 'solo', '既有 solo', 'completed') // 既有 feature：提案后吸收也不回填

    runDiscoveryScan({ projectId: 'p1', forgeDir, db })

    const proposalId = proposalBySlug(db, 'duo')?.id
    expect(proposalId).toBeDefined()
    expect(featureBySlug(db, 'duo')?.proposal_id).toBe(proposalId) // 同事务先吸收提案 → 回填
    expect(featureBySlug(db, 'solo')?.proposal_id).toBeNull() // 阀门：既有行不动
    db.close()
  })
})

// ───────────────────────── AC4：逐目录隔离容错 ─────────────────────────

describe('AC4 逐目录隔离容错（跳过 + 工作区 app_key_logs warn，不阻断整体）', () => {
  it('非 UTF-8 manifest：特性行按缺省建档 + warn；其余 feature 照常', () => {
    const forgeDir = fixtureForgeDir()
    writeFeatureManifest(forgeDir, 'feat-bad', Buffer.from([0xff, 0xfe, 0x00, 0x41, 0x42, 0x43]))
    writeFeatureManifest(forgeDir, 'feat-good', manifestOf('feat-good', 'status: tasks\n'))
    const { db } = openWorkspaceDb()

    const report = runDiscoveryScan({ projectId: 'p1', forgeDir, db })

    expect([...report.featuresIngested].sort()).toEqual(['feat-bad', 'feat-good']) // 整体不阻断
    expect(featureBySlug(db, 'feat-bad')?.title).toBe('feat-bad') // 缺省建档
    expect(featureBySlug(db, 'feat-bad')?.feature_status).toBe('prd')
    expect(featureBySlug(db, 'feat-good')?.feature_status).toBe('tasks')
    const logs = keyLogs(db)
    expect(logs).toHaveLength(1)
    expect(logs[0]?.level).toBe('warn')
    expect(logs[0]?.scope).toBe('tasks')
    const data = JSON.parse(logs[0]?.data_json ?? '{}') as Record<string, unknown>
    expect(data.target).toBe('docs/features/feat-bad/manifest.md')
    expect(data.projectId).toBe('p1')
    db.close()
  })

  it('frontmatter 畸形：manifest 无分隔块 → 缺省行 + warn；proposal.md 无分隔块 → 不建档 + warn', () => {
    const forgeDir = fixtureForgeDir()
    writeFeatureManifest(forgeDir, 'feat-x', '# 只有正文没有分隔块\n')
    writeProposalFile(forgeDir, 'prop-y', '') // frontmatter 体为空（无键值）——status 走缺省
    writeFeatureManifest(forgeDir, 'feat-z', '---\nstatus: completed\n') // 未闭合分隔块
    const { db } = openWorkspaceDb()

    const report = runDiscoveryScan({ projectId: 'p1', forgeDir, db })

    expect(featureBySlug(db, 'feat-x')?.feature_status).toBe('prd') // manifest 跳过、行按缺省
    expect(featureBySlug(db, 'feat-z')?.feature_status).toBe('prd') // 未闭合 = 畸形 → 同上
    expect(proposalBySlug(db, 'prop-y')).toBeDefined() // 空体合法（无必填键）——正常建档 draft
    expect(report.proposalsIngested).toEqual(['prop-y'])
    const logs = keyLogs(db)
    expect(logs).toHaveLength(2)
    const targets = logs.map((l) => (JSON.parse(l.data_json) as Record<string, unknown>).target)
    expect(targets).toContain('docs/features/feat-x/manifest.md')
    expect(targets).toContain('docs/features/feat-z/manifest.md')
    db.close()
  })

  it('proposal.md 畸形（正文伪装无分隔块）→ 不建档 + warn', () => {
    const forgeDir = fixtureForgeDir()
    const dir = join(forgeDir, 'docs', 'proposals', 'prop-bad')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'proposal.md'), '正文伪装：无 frontmatter 分隔块\n')
    const { db } = openWorkspaceDb()

    const report = runDiscoveryScan({ projectId: 'p1', forgeDir, db })

    expect(report.proposalsIngested).toEqual([])
    expect(proposalBySlug(db, 'prop-bad')).toBeUndefined()
    expect(keyLogs(db)).toHaveLength(1)
    db.close()
  })

  it('非法目录名（隐藏前导点/首尾空白）→ 跳过该目录 + warn；合法邻居照常', () => {
    const forgeDir = fixtureForgeDir()
    makeIllegalDirs(forgeDir, ['.hidden-feat', ' lead-space-feat'])
    writeFeatureManifest(forgeDir, 'ok-feat', manifestOf('ok-feat', ''))
    const { db } = openWorkspaceDb()

    const report = runDiscoveryScan({ projectId: 'p1', forgeDir, db })

    expect(report.featuresIngested).toEqual(['ok-feat'])
    expect(featureBySlug(db, '.hidden-feat')).toBeUndefined()
    expect(featureBySlug(db, ' lead-space-feat')).toBeUndefined()
    const logs = keyLogs(db)
    expect(logs).toHaveLength(2)
    const targets = logs.map((l) => (JSON.parse(l.data_json) as Record<string, unknown>).target)
    expect(targets).toContain('docs/features/.hidden-feat/')
    expect(targets).toContain('docs/features/ lead-space-feat/')
    db.close()
  })

  it('非 UTF-8 proposal.md → 不建档 + warn', () => {
    const forgeDir = fixtureForgeDir()
    const dir = join(forgeDir, 'docs', 'proposals', 'prop-enc')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'proposal.md'), Buffer.from([0x81, 0x82, 0x83, 0x00]))
    const { db } = openWorkspaceDb()

    const report = runDiscoveryScan({ projectId: 'p1', forgeDir, db })

    expect(report.proposalsIngested).toEqual([])
    expect(proposalBySlug(db, 'prop-enc')).toBeUndefined()
    expect(keyLogs(db)).toHaveLength(1)
    db.close()
  })

  it('零命中仓（docs 缺席 / 空 docs/features）→ 零行零异常零 warn（空态 = 一等态）', () => {
    const emptyForge = fixtureForgeDir()
    const { db } = openWorkspaceDb()

    const r1 = runDiscoveryScan({ projectId: 'p1', forgeDir: emptyForge, db }) // docs 全缺席
    mkdirSync(join(emptyForge, 'docs', 'features'), { recursive: true })
    mkdirSync(join(emptyForge, 'docs', 'proposals'), { recursive: true })
    const r2 = runDiscoveryScan({ projectId: 'p1', forgeDir: emptyForge, db }) // 空目录

    for (const r of [r1, r2]) {
      expect(r.featuresIngested).toEqual([])
      expect(r.proposalsIngested).toEqual([])
      expect(r.documentsIndexed).toBe(0)
      expect(r.skipped).toEqual([])
    }
    expect(keyLogs(db)).toEqual([])
    db.close()
  })
})

// ───────────────────────── AC5：S9① 口径夹具 + post-ingestion 挂点 ─────────────────────────

describe('AC5 S9① 口径夹具 + post-ingestion 挂点', () => {
  /** 旧线仓形态：多 feature（全套/quick 无文档/部分文档）+ 多 proposal（Draft/Accepted） */
  const buildS9Fixture = (): string => {
    const forgeDir = fixtureForgeDir()
    writeFeatureManifest(forgeDir, 'f-full', manifestOf('f-full', 'status: completed\n'))
    writeFeatureDocs(forgeDir, 'f-full', ALL_KINDS)
    writeFeatureManifest(forgeDir, 'f-quick', `---\nfeature: "f-quick"\ncreated: "2026-06-08"\nstatus: tasks\nmode: quick\n---\n\n# Feature\n`)
    writeFeatureManifest(forgeDir, 'f-partial', manifestOf('f-partial', 'status: design\n'))
    writeFeatureDocs(forgeDir, 'f-partial', ['prd-spec', 'er-diagram'])
    writeProposalFile(forgeDir, 'f-full', 'status: Draft\n')
    writeProposalFile(forgeDir, 'sidecar', 'status: Accepted\n')
    return forgeDir
  }

  it('真实目录树全发现：3 feature + 2 proposal，文档 7/0/2，状态映射正确', () => {
    const forgeDir = buildS9Fixture()
    const { db } = openWorkspaceDb()

    const report = runDiscoveryScan({ projectId: 'p9', forgeDir, db })

    expect(report.featuresIngested).toEqual(['f-full', 'f-partial', 'f-quick']) // 排序确定性
    expect(report.proposalsIngested).toEqual(['f-full', 'sidecar'])
    expect(report.documentsIndexed).toBe(9)
    expect(docsOf(db, featureBySlug(db, 'f-full')?.id as string)).toHaveLength(7)
    expect(docsOf(db, featureBySlug(db, 'f-quick')?.id as string)).toHaveLength(0)
    expect(docsOf(db, featureBySlug(db, 'f-partial')?.id as string)).toHaveLength(2)
    expect(featureBySlug(db, 'f-quick')?.feature_status).toBe('tasks') // 旧线 manifest 状态直映
    expect(featureBySlug(db, 'f-full')?.proposal_id).toBe(proposalBySlug(db, 'f-full')?.id) // 谱系回填
    expect(proposalBySlug(db, 'sidecar')?.proposal_status).toBe('accepted')
    db.close()
  })

  it('post-ingestion 挂点：对新入库 feature 逐个回调（排序序）；既有行不回调', () => {
    const forgeDir = buildS9Fixture()
    const { db } = openWorkspaceDb()
    seedFeature(db, 'f-quick', '既有 f-quick', 'tasks') // 既有行 → 不回调
    const ingested: Array<{ projectId: string; featureSlug: string }> = []

    runDiscoveryScan({ projectId: 'p9', forgeDir, db }, { onFeatureIngested: (x) => ingested.push(x) })

    expect(ingested).toEqual([
      { projectId: 'p9', featureSlug: 'f-full' },
      { projectId: 'p9', featureSlug: 'f-partial' },
    ])
    db.close()
  })

  it('挂点失败 fail-soft：warn 记账不抛不断（后续 feature 照常送校）', () => {
    const forgeDir = buildS9Fixture()
    const { db } = openWorkspaceDb()
    const hook = vi.fn((x: { featureSlug: string }) => {
      if (x.featureSlug === 'f-full') throw new Error('送校失败')
    })

    expect(() => runDiscoveryScan({ projectId: 'p9', forgeDir, db }, { onFeatureIngested: hook })).not.toThrow()

    expect(hook).toHaveBeenCalledTimes(3) // 三个新入库 feature 全送（f-full 失败不断链）
    const logs = keyLogs(db)
    expect(logs).toHaveLength(1)
    expect(logs[0]?.level).toBe('warn')
    const data = JSON.parse(logs[0]?.data_json ?? '{}') as Record<string, unknown>
    expect(data.featureSlug).toBe('f-full')
    expect(String(data.error)).toContain('送校失败')
    db.close()
  })

  it('store 集成（交互二形态）：onFirstCreate 接线 → 库缺席首开即吸收', () => {
    const forgeDir = buildS9Fixture()
    root ??= mkdtempSync(join(tmpdir(), 'dsh-forge-disc-'))
    const wsDir = join(root, `ws-${String(++seq).padStart(3, '0')}`)
    const store = createWorkspaceStore({
      resolveDir: () => wsDir,
      onFirstCreate: createDiscoveryFirstCreateHook({ resolveForgeDir: () => forgeDir }),
    })

    const db = store.ensureOpen('p-int') // 库文件缺席 → 新建 v1 + 发现面扫描
    expect(featureBySlug(db, 'f-full')?.feature_status).toBe('completed')
    expect(docsOf(db, featureBySlug(db, 'f-full')?.id as string)).toHaveLength(7)
    expect(proposalBySlug(db, 'sidecar')?.proposal_status).toBe('accepted')
    store.dispose()
  })

  it('只读零写入（SC3 Hard Rule）：扫描前后 forge_dir 目录树与内容恒等', () => {
    const forgeDir = buildS9Fixture()
    const { db } = openWorkspaceDb()
    const snapshot = (dir: string): Record<string, string> => {
      const out: Record<string, string> = {}
      const walk = (d: string): void => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
          const abs = join(d, e.name)
          if (e.isDirectory()) walk(abs)
          else if (e.isFile()) {
            out[relative(dir, abs).split(sep).join('/')] = createHash('sha256').update(readFileSync(abs)).digest('hex')
          }
        }
      }
      walk(dir)
      return out
    }
    const before = snapshot(forgeDir)

    runDiscoveryScan({ projectId: 'p9', forgeDir, db })

    expect(snapshot(forgeDir)).toEqual(before) // 零新增文件、零内容改动
    db.close()
  })
})
