// Task 5.3 kernel legs — the proposals domain (proposal_snapshot frontmatter
// index + board/doc read verbs + perception reflux). AC groups:
//
//   AC-1 索引矩阵 — proposals/<slug>/proposal.md frontmatter 解析落
//            proposal_snapshot(status 4 态归一 / author / created 回退 /
//            feature 关联 = slug 同一性 + manifest 在场);eval 存在性可查;
//            越界/缺失/损坏语料跳过不炸扫描;派生可重建(清空重建零差异
//            + 感知路径与重建路径零漂移)。语料 = proposals/__fixtures__/
//            corpus.json(frontmatter 矩阵,spec 落 tmp 树)。
//   AC-2 读动词 — getProposalBoard 全量列表 + 排序基线(created 降序,
//            平局 slug 升序)+ hasEval 活性拼接 + 无关联 feature = NULL;
//            readProposalDoc 两 kind markdown 原文(eval 确定性选锚 =
//            final-report.md 优先/字典序回退);缺失 → ERR_PROPOSAL_NOT_FOUND;
//            段形态 → ERR_PROPOSAL_PATH_INVALID。
//   AC-3 回流 — 外部新增/修改/删除提案文件 → scanForgeFiles 重扫 → 快照
//            与列表更新(感知链 = proposals/ 感知根 + 每轮扫描同步;
//            ≤5s 预算由 watcher debounce 400ms + 批窗 ≤500ms 承载,e2e 面
//            断言);管线早期(仅 proposals/,features/ 不存在)感知仍建链
//            且索引落地。
//   AC-4 只读硬约束 + IPC 面 — 域服务面零写动词(结构断言);两动词
//            白名单通道路由 + 域错误原码透传。
//
// Everything below runs against the real migrated db (node:sqlite) + tmp doc
// trees — no spawn, no CLI, no network.

import { mkdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase, type DatabaseSyncLike } from '../src/main/workbench/store/db.ts'
import type { RepoDb } from '../src/main/workbench/repos/types.ts'
import { scanForgeFiles, type ScanTarget } from '../src/main/workbench/indexer/scan.ts'
import {
  PROPOSAL_STATUS_VOCAB,
  collectProposalIndex,
  listProposalRows,
  parseProposalFrontmatter,
  pickEvalReport,
  rebuildProposalIndex,
} from '../src/main/workbench/proposals/proposal-indexer.ts'
import {
  ProposalDomainError,
  boardSortBaseline,
  createProposalsVerbService,
  type ProposalsVerbService,
} from '../src/main/workbench/proposals/proposals-service.ts'
import { createWorkbenchWatcher } from '../src/main/workbench/watcher/watch.ts'
import { authorizeExternalDocPath } from '../src/main/workbench/registry/authorize.ts'
import { WORKBENCH_VERB_CHANNELS } from '../src/main/workbench/ipc/channel-allowlist.ts'
import {
  createWorkbenchEventSubscriptions,
  installWorkbenchVerbs,
  type WorkbenchHandleRegistrar,
} from '../src/main/workbench/ipc/handlers.ts'
import type { WorkbenchVerbServices } from '../src/main/workbench/ipc/types.ts'
import type { WorkbenchVerbEvent } from '../src/main/workbench/ipc/sender-validate.ts'

// ---------------------------------------------------------------------------
// Corpus — proposals/__fixtures__/corpus.json(frontmatter 矩阵)
// ---------------------------------------------------------------------------

const fixturesUrl = new URL('../src/main/workbench/proposals/__fixtures__/corpus.json', import.meta.url)
const corpus = JSON.parse(readFileSync(fileURLToPath(fixturesUrl), 'utf8')) as {
  readonly proposalDocs: Record<string, string>
  readonly brokenDocs: Record<string, string>
  readonly evalFiles: Record<string, readonly string[]>
  readonly features: readonly string[]
  readonly expect: {
    readonly indexed: readonly string[]
    readonly skipped: readonly string[]
    readonly rows: Record<string, {
      readonly status: string
      readonly author: string | null
      readonly created: string | null
      readonly featureSlug: string | null
      readonly hasEval: boolean
    }>
    readonly boardOrder: readonly string[]
    readonly evalPick: Record<string, string>
  }
}

const FIXED_AT = '2026-09-20T10:00:00.000Z'

const scratches: string[] = []
const openDbs: DatabaseSyncLike[] = []

function makeScratch(): string {
  const dir = join(tmpdir(), `dsh-forge-proposals-${String(process.pid)}-${String(scratches.length)}`)
  rmSync(dir, { recursive: true, force: true, maxRetries: 10 })
  mkdirSync(dir, { recursive: true })
  scratches.push(dir)
  return dir
}

afterEach(() => {
  for (const db of openDbs.splice(0)) db.close() // win32 句柄锁:先关库再删树
  for (const dir of scratches.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 10 })
})

/** 语料 → tmp 文档树 + db 种子(external 文档根;scanForgeFiles 直接可跑)。 */
interface Materialized {
  readonly db: DatabaseSyncLike
  readonly projectId: string
  readonly root: string
  readonly proposalsRoot: string
  readonly featuresRoot: string
  readonly service: ProposalsVerbService
  readonly target: ScanTarget
  readonly scan: () => void
}

function writeDoc(root: string, rel: string, content: string): void {
  const path = join(root, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

async function materialize(options: { readonly withFeatures?: boolean } = {}): Promise<Materialized> {
  const root = makeScratch()
  const userData = join(root, 'user')
  mkdirSync(userData, { recursive: true })
  const { db } = await openDatabase(userData)
  openDbs.push(db)
  const projectId = 'p-1'
  db.prepare(
    `INSERT INTO projects (id, display_name, code_root, doc_location_type, doc_location_path, created_at)
     VALUES (?, ?, ?, 'external', ?, ?)`,
  ).run(projectId, 'demo', join(root, 'code'), root, FIXED_AT)

  const proposalsRoot = join(root, 'docs', 'proposals')
  const featuresRoot = join(root, 'docs', 'features')
  for (const [slug, markdown] of Object.entries(corpus.proposalDocs)) {
    writeDoc(proposalsRoot, join(slug, 'proposal.md'), markdown)
  }
  for (const [slug, markdown] of Object.entries(corpus.brokenDocs)) {
    writeDoc(proposalsRoot, join(slug, 'proposal.md'), markdown)
  }
  for (const [slug, files] of Object.entries(corpus.evalFiles)) {
    for (const file of files) {
      writeDoc(proposalsRoot, join(slug, 'eval', file), `# eval ${file}\n\nreport body of ${slug}\n`)
    }
  }
  if (options.withFeatures !== false) {
    for (const slug of corpus.features) {
      writeDoc(featuresRoot, join(slug, 'manifest.md'), `---\nstatus: "tasks"\ncreated: "2026-09-01"\n---\n\n# ${slug}\n`)
    }
  }
  // p-minimal 无 frontmatter created → 索引回退 mtime 本地日期;钉定固定
  // mtime 使排序基线断言确定性(语料最旧 → 降序基线末位)。
  {
    const minimal = join(proposalsRoot, 'p-minimal', 'proposal.md')
    utimesSync(minimal, new Date('2026-09-15T08:00:00Z'), new Date('2026-09-15T08:00:00Z'))
  }

  const service = createProposalsVerbService({
    db,
    resolveProposalsRoot: id => (id === projectId ? proposalsRoot : null),
  })
  const target: ScanTarget = { id: projectId, codeRoot: join(root, 'code'), docLocationPath: root }
  return {
    db,
    projectId,
    root,
    proposalsRoot,
    featuresRoot,
    service,
    target,
    scan: () => { scanForgeFiles(db as RepoDb, target) },
  }
}

// ---------------------------------------------------------------------------
// AC-1: frontmatter 矩阵索引
// ---------------------------------------------------------------------------

describe('proposals index: frontmatter matrix (AC-1)', () => {
  it('indexes the parseable corpus and skips out-of-vocab / broken files without failing the scan', async () => {
    const m = await materialize()
    m.scan()

    const rows = listProposalRows(m.db, m.projectId)
    expect(rows.map(row => row.slug).sort()).toEqual([...corpus.expect.indexed].sort())
    for (const slug of corpus.expect.skipped) {
      expect(rows.some(row => row.slug === slug)).toBe(false)
    }
  })

  it('normalizes status case-insensitively into the 4-state CHECK vocabulary', async () => {
    const m = await materialize()
    m.scan()
    const bySlug = new Map(listProposalRows(m.db, m.projectId).map(row => [row.slug, row]))
    expect(bySlug.get('p-full')?.status).toBe('draft') // frontmatter `Draft`
    expect(bySlug.get('p-multi-eval')?.status).toBe('rejected') // frontmatter `Rejected`
    expect(bySlug.get('p-lowercase')?.status).toBe('superseded') // lowercase 原词
    expect(bySlug.get('p-minimal')?.status).toBe('accepted')
    for (const row of bySlug.values()) {
      expect(PROPOSAL_STATUS_VOCAB).toContain(row.status)
    }
  })

  it('derives author/created per the forge data plane (missing created → mtime local date; missing author → null)', async () => {
    const m = await materialize()
    m.scan()
    const bySlug = new Map(listProposalRows(m.db, m.projectId).map(row => [row.slug, row]))
    expect(bySlug.get('p-full')).toMatchObject({ author: 'faner', created: '2026-09-22' })
    // created 回退 = proposal.md mtime 的本地日期(Go modTime.Format 同义)。
    const expected = new Date(statSync(join(m.proposalsRoot, 'p-minimal', 'proposal.md')).mtime)
    const localDate = `${expected.getFullYear()}-${String(expected.getMonth() + 1).padStart(2, '0')}-${String(expected.getDate()).padStart(2, '0')}`
    expect(bySlug.get('p-minimal')).toMatchObject({ author: null, created: localDate })
    expect(bySlug.get('p-minimal')?.updatedAt).toBeTruthy()
  })

  it('associates features by slug identity (manifest presence) and stores NULL when unassociated', async () => {
    const m = await materialize()
    m.scan()
    const bySlug = new Map(listProposalRows(m.db, m.projectId).map(row => [row.slug, row]))
    expect(bySlug.get('p-full')?.featureSlug).toBe('p-full') // features/p-full/manifest.md 在场
    expect(bySlug.get('p-lowercase')?.featureSlug).toBe('p-lowercase')
    expect(bySlug.get('p-minimal')?.featureSlug).toBeNull() // 无关联 = 管线早期
    expect(bySlug.get('p-multi-eval')?.featureSlug).toBeNull()
  })

  it('is derived-rebuildable: clear + rebuild reproduces the scanned row set with zero drift', async () => {
    const m = await materialize()
    m.scan()
    const scanned = listProposalRows(m.db, m.projectId).map(row => ({ ...row })).sort((a, b) => a.slug.localeCompare(b.slug))

    m.db.prepare('DELETE FROM proposal_snapshot').run()
    expect(listProposalRows(m.db, m.projectId)).toHaveLength(0)
    const count = rebuildProposalIndex(m.db, m.projectId, m.proposalsRoot, m.featuresRoot)
    expect(count).toBe(scanned.length)
    const rebuilt = listProposalRows(m.db, m.projectId).map(row => ({ ...row })).sort((a, b) => a.slug.localeCompare(b.slug))
    expect(rebuilt).toEqual(scanned) // 清空重建零差异(AC1)

    // 感知路径与重建路径零漂移:collectProposalIndex 即两路径共用实现。
    const recollected = collectProposalIndex(m.proposalsRoot, m.featuresRoot)
      .map(row => ({ ...row })).sort((a, b) => a.slug.localeCompare(b.slug))
    expect(recollected).toEqual(scanned)
  })

  it('parseProposalFrontmatter / pickEvalReport unit legs (matrix anchors)', () => {
    expect(parseProposalFrontmatter('---\nstatus: Draft\nauthor: "a"\ncreated: "2026-01-01"\n---\nbody')).toEqual({
      status: 'draft', author: 'a', created: '2026-01-01',
    })
    expect(parseProposalFrontmatter('no frontmatter at all')).toBeNull()
    expect(parseProposalFrontmatter('---\nstatus: on-hold\n---\nb')).toBeNull()
    expect(parseProposalFrontmatter('---\nstatus: 42\n---\nb')).toBeNull() // 非字符串
    expect(parseProposalFrontmatter('---\nauthor: "a"\n---\nb')).toBeNull() // status 缺失
    expect(pickEvalReport(['freeform-review.md', 'final-report.md', 'baseline.md'])).toBe('final-report.md')
    expect(pickEvalReport(['freeform-review.md', 'baseline-score.md'])).toBe('baseline-score.md') // 字典序首位
    expect(pickEvalReport(['baseline-snapshot', 'notes.txt'])).toBeNull() // 无 .md
  })
})

// ---------------------------------------------------------------------------
// AC-2: board / doc read verbs
// ---------------------------------------------------------------------------

describe('proposal verbs: getProposalBoard / readProposalDoc (AC-2)', () => {
  it('returns the full board with the created-descending sort baseline and live-joined hasEval', async () => {
    const m = await materialize()
    m.scan()
    const board = m.service.getProposalBoard(m.projectId)
    expect(board.proposals.map(row => row.slug)).toEqual([...corpus.expect.boardOrder])
    expect(board.proposalsRoot).toBe(m.proposalsRoot)
    expect(board.generatedAt).toBeTruthy()
    for (const [slug, expected] of Object.entries(corpus.expect.rows)) {
      const row = board.proposals.find(entry => entry.slug === slug)
      expect(row).toMatchObject({
        status: expected.status, author: expected.author,
        featureSlug: expected.featureSlug, hasEval: expected.hasEval,
      })
    }
  })

  it('returns the raw proposal markdown (kind: proposal)', async () => {
    const m = await materialize()
    m.scan()
    const doc = m.service.readProposalDoc({ projectId: m.projectId, slug: 'p-full', kind: 'proposal' })
    expect(doc.kind).toBe('proposal')
    expect(doc.markdown).toBe(corpus.proposalDocs['p-full'] as string) // 原文逐字符
  })

  it('returns the eval report markdown with the deterministic anchor pick (kind: eval)', async () => {
    const m = await materialize()
    m.scan()
    // final-report.md 优先锚。
    const preferred = m.service.readProposalDoc({ projectId: m.projectId, slug: 'p-full', kind: 'eval' })
    expect(preferred.kind).toBe('eval')
    expect(preferred.markdown).toContain('final-report.md')
    // 无 final-report → 字典序首位回退。
    const fallback = m.service.readProposalDoc({ projectId: m.projectId, slug: 'p-multi-eval', kind: 'eval' })
    expect(fallback.markdown).toContain('baseline-score.md')
  })

  it('rejects unknown projects, malformed slugs, and missing docs with domain codes', async () => {
    const m = await materialize()
    m.scan()
    expect(() => m.service.getProposalBoard('nope')).toThrowError(expect.objectContaining({ code: 'ERR_PROJECT_NOT_FOUND' }))
    for (const slug of ['a/b', 'bad\\slug', '', '..']) {
      expect(() => m.service.readProposalDoc({ projectId: m.projectId, slug, kind: 'proposal' })).toThrowError(
        expect.objectContaining({ code: 'ERR_PROPOSAL_PATH_INVALID' }),
      )
    }
    expect(() => m.service.readProposalDoc({ projectId: m.projectId, slug: 'ghost', kind: 'proposal' })).toThrowError(
      expect.objectContaining({ code: 'ERR_PROPOSAL_NOT_FOUND' }),
    )
    // eval 无报告(p-lowercase 无 eval 目录)。
    expect(() => m.service.readProposalDoc({ projectId: m.projectId, slug: 'p-lowercase', kind: 'eval' })).toThrowError(
      expect.objectContaining({ code: 'ERR_PROPOSAL_NOT_FOUND' }),
    )
  })

  it('boardSortBaseline: null created sinks to the end; ties break by slug ascending', () => {
    const sorted = boardSortBaseline([
      { slug: 'b', status: 'draft', author: null, created: null, featureSlug: null, updatedAt: 't' },
      { slug: 'z', status: 'draft', author: null, created: '2026-01-01', featureSlug: null, updatedAt: 't' },
      { slug: 'a', status: 'draft', author: null, created: '2026-01-01', featureSlug: null, updatedAt: 't' },
      { slug: 'c', status: 'draft', author: null, created: '2026-02-02', featureSlug: null, updatedAt: 't' },
    ])
    expect(sorted.map(row => row.slug)).toEqual(['c', 'a', 'z', 'b'])
  })
})

// ---------------------------------------------------------------------------
// AC-3: perception reflux(外部变更 → 感知 → 快照与列表更新)
// ---------------------------------------------------------------------------

describe('proposals perception: external changes flow back through the scan (AC-3)', () => {
  it('add / modify / delete proposal files → rescan → snapshot and board update', async () => {
    const m = await materialize()
    m.scan()
    expect(m.service.getProposalBoard(m.projectId).proposals).toHaveLength(corpus.expect.indexed.length)

    // 新增(外部新建提案目录;created 取语料最大日期,降序基线首位无歧义)。
    writeDoc(m.proposalsRoot, join('p-new', 'proposal.md'), '---\ncreated: "2026-12-31"\nauthor: "new"\nstatus: Draft\n---\n\n# new\n')
    m.scan()
    let board = m.service.getProposalBoard(m.projectId)
    expect(board.proposals.map(row => row.slug)).toContain('p-new')
    expect(board.proposals[0]?.slug).toBe('p-new') // created 降序基线:最新在前

    // 修改(状态流转 → 归一词表更新)。
    writeDoc(m.proposalsRoot, join('p-new', 'proposal.md'), '---\ncreated: "2026-12-31"\nauthor: "new"\nstatus: Accepted\n---\n\n# new\n')
    m.scan()
    board = m.service.getProposalBoard(m.projectId)
    expect(board.proposals.find(row => row.slug === 'p-new')?.status).toBe('accepted')

    // 删除(结构性删除 → 行清理,不留尸行)。
    rmSync(join(m.proposalsRoot, 'p-new'), { recursive: true, force: true })
    m.scan()
    board = m.service.getProposalBoard(m.projectId)
    expect(board.proposals.some(row => row.slug === 'p-new')).toBe(false)
    expect(board.proposals).toHaveLength(corpus.expect.indexed.length)
  })

  it('watches the proposals root (perception chain builds even with no features directory — 管线早期)', async () => {
    const m = await materialize({ withFeatures: false })
    rmSync(m.featuresRoot, { recursive: true, force: true })
    // external 文档根的持久授权(Hard Rule:未授权仓外根不 watch;真实链 =
    // 注册向导步骤②登记,此处直写同一 2.4 单写路径)。
    authorizeExternalDocPath(m.db as RepoDb, m.root)

    // 感知链:仅 proposals/ 在场(.forge/features 均缺)也能建 watch。
    const watcher = createWorkbenchWatcher(m.db as RepoDb, {})
    watcher.rebuild(m.target)
    expect(watcher.strategy).not.toBeNull()
    watcher.stop()

    // 管线早期索引:features/ 缺失不阻断 proposal_snapshot 同步(独立行集替换)。
    m.scan()
    const rows = listProposalRows(m.db, m.projectId)
    expect(rows.map(row => row.slug).sort()).toEqual([...corpus.expect.indexed].sort())
    // 关联判定回退:manifest 全缺 → 全部 NULL。
    expect(rows.every(row => row.featureSlug === null)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// AC-4: read-only hard rule + IPC face
// ---------------------------------------------------------------------------

describe('proposals IPC face + read-only hard rule (AC-4)', () => {
  const OWNED: WorkbenchVerbEvent = { senderFrame: { url: 'dsh-app://app/' } }

  function fakeServices(service: ProposalsVerbService): WorkbenchVerbServices {
    return {
      getProposalBoard: (projectId: string) => service.getProposalBoard(projectId),
      readProposalDoc: (input: Parameters<ProposalsVerbService['readProposalDoc']>[0]) => service.readProposalDoc(input),
    } as unknown as WorkbenchVerbServices
  }

  it('service surface carries exactly the two read verbs (零写动词 structural assertion)', () => {
    const service = createProposalsVerbService({ db: null as unknown as RepoDb, resolveProposalsRoot: () => null })
    expect(Object.keys(service).sort()).toEqual(['getProposalBoard', 'readProposalDoc'])
  })

  it('routes both verbs through their whitelisted channels with envelope-passthrough rejections', async () => {
    const m = await materialize()
    m.scan()
    const handlers = new Map<string, (event: WorkbenchVerbEvent, ...args: unknown[]) => unknown>()
    const registrar: WorkbenchHandleRegistrar = (channel, listener) => { handlers.set(channel, listener) }
    installWorkbenchVerbs(registrar, fakeServices(m.service), createWorkbenchEventSubscriptions())

    expect(WORKBENCH_VERB_CHANNELS.getProposalBoard).toBe('dsh-forge:workbench-get-proposal-board')
    expect(WORKBENCH_VERB_CHANNELS.readProposalDoc).toBe('dsh-forge:workbench-read-proposal-doc')

    const board = handlers.get(WORKBENCH_VERB_CHANNELS.getProposalBoard)?.(OWNED, m.projectId) as ReturnType<ProposalsVerbService['getProposalBoard']>
    expect(board.proposals).toHaveLength(corpus.expect.indexed.length)

    const doc = handlers.get(WORKBENCH_VERB_CHANNELS.readProposalDoc)?.(OWNED, { projectId: m.projectId, slug: 'p-full', kind: 'eval' }) as { kind: string; markdown: string }
    expect(doc.markdown).toContain('final-report.md')

    // 形状校验:kind 词表外 → 契约错(不到服务)。
    expect(() => handlers.get(WORKBENCH_VERB_CHANNELS.readProposalDoc)?.(OWNED, { projectId: m.projectId, slug: 'p-full', kind: 'summary' })).toThrowError(/kind/)
    // 域错误 → 封装原码透传(ERR_PROPOSAL_NOT_FOUND)。
    try {
      handlers.get(WORKBENCH_VERB_CHANNELS.readProposalDoc)?.(OWNED, { projectId: m.projectId, slug: 'ghost', kind: 'proposal' })
      expect.unreachable('expected the domain rejection')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      const envelope = JSON.parse((error as Error).message) as { code: string }
      expect(envelope.code).toBe('ERR_PROPOSAL_NOT_FOUND')
    }
  })
})

// ProposalDomainError 形态(域错误码表成员)。
describe('ProposalDomainError', () => {
  it('carries its code for the IPC envelope mapping', () => {
    const error = new ProposalDomainError('ERR_PROPOSAL_NOT_FOUND', 'missing')
    expect(error.code).toBe('ERR_PROPOSAL_NOT_FOUND')
    expect(error.name).toBe('ProposalDomainError')
  })
})
