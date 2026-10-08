// 任务 2.7 测试 —— forgeProposals 域三法（tech-design §Interface 3）：createProposal
// （缺省 draft / slug UNIQUE 预检）、transitionProposal（from≠to 同源 + 裁决写 decided_at：
// → accepted/rejected 写、打回/superseded 不改写）、listProposals（search/sort）+
// 写动词 emitTasksChanged 接线。临时 SQLite 夹具。
// 任务 2.3 增读面两法：listProposals（mode 直出 + taskCount 容器维度 JOIN 分组）+
// listProposalDocs（docs/proposals/<slug>/ 只读扫描——目录夹具/越界容错/零状态）。
// 任务 2.2 增写径三面：transitionProposal 成链分叉内聚（图 6 全分支表 + 幂等 + 原子回滚锚）+
// superseded 必带 supersededBy 谱系取代链 + setProposalMode（图 7·律三快照不回溯）+
// createProposal mode 透传。
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import type { ProposalStatus } from '@dsh-forge/contracts'
import { registerFeatureInTx } from './features.js'
import { createHarness, type SmallDomainHarness } from './harness.js'
import { createProposalsService } from './proposals.js'
import {
  FeatureExistsError,
  ProposalNotFoundError,
  ReasonRequiredError,
  SmallDomainInvalidTransitionError,
} from './errors.js'

let h: SmallDomainHarness | undefined
afterEach(() => {
  vi.useRealTimers()
  h?.dispose()
  h = undefined
})

/** 生产装配同构注入（2.2 成链内聚——四域互禁 import，测试经装配同径传入；features.test.ts PHASE 先例） */
const REGISTER_IN_TX = registerFeatureInTx

function svc() {
  h ??= createHarness()
  return createProposalsService({
    store: h.store,
    events: h.events,
    resolveForgeDir: h.routing.forgeDir,
    registerFeatureInTx: REGISTER_IN_TX,
  })
}

/** 种 proposal 行（直写库——受控初值/创建时间；2.3 增 mode 受控初值；2.2 增 title 受控——成链继承断言） */
function seedProposal(
  db: Database.Database,
  o: {
    id?: string
    slug?: string
    title?: string
    status?: ProposalStatus
    decidedAt?: string | null
    createdAt?: string
    mode?: string | null
  },
): string {
  const id = o.id ?? `p-${Math.random().toString(36).slice(2, 8)}`
  db.prepare(
    `INSERT INTO proposals (id, slug, title, proposal_status, rel_path, author, mode, decided_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?)`,
  ).run(id, o.slug ?? `slug-${id}`, o.title ?? `提案 ${id}`, o.status ?? 'draft', o.mode ?? null, o.decidedAt ?? null, o.createdAt ?? '2026-01-01T00:00:00.000Z', o.createdAt ?? '2026-01-01T00:00:00.000Z')
  return id
}

/** 种 feature 行（2.3 taskCount 双轨夹具——proposal_id 谱系受控） */
function seedFeature(db: Database.Database, o: { id: string; slug: string; proposalId?: string | null }): string {
  db.prepare(
    `INSERT INTO features (id, slug, title, feature_status, summary, proposal_id, created_at, updated_at)
     VALUES (?, ?, ?, 'prd', NULL, ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
  ).run(o.id, o.slug, `特性 ${o.slug}`, o.proposalId ?? null)
  return o.id
}

/** 种容器任务行（2.3 taskCount 夹具——source 双列直写；slug ≡ 容器 slug 不变量；
 *  2.2 增 mode 受控初值——快照不回溯断言夹具） */
function seedContainerTask(
  db: Database.Database,
  o: { containerId: string; kind: 'feature' | 'proposal'; slug: string; localId: string; mode?: string | null },
): string {
  db.prepare(
    `INSERT INTO tasks (id, slug, local_id, title, task_type, task_status, source_kind, source_id, mode, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'coding-feature', 'pending', ?, ?, ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
  ).run(`t-${o.localId}`, o.slug, o.localId, `任务 ${o.localId}`, o.kind, o.containerId, o.mode ?? null)
  return `t-${o.localId}`
}

describe('AC3 createProposal：缺省 draft + slug UNIQUE 预检', () => {
  it('新建：缺省 draft / relPath 可选 / decidedAt 缺省（裁决未发生）', async () => {
    const s = svc()
    const row = await s.createProposal({ projectId: h!.projectId, slug: 'demo-proposal', title: '演示提案' })
    expect(row.proposalId).toMatch(/^[0-9a-f-]{36}$/)
    expect(row).toMatchObject({ slug: 'demo-proposal', title: '演示提案', proposalStatus: 'draft' })
    expect(row.decidedAt).toBeUndefined()
    expect(row.relPath).toBeUndefined()
    const withPath = await s.createProposal({ projectId: h!.projectId, slug: 'p2', title: '二', relPath: 'docs/proposals/p2/proposal.md', status: 'under-review' })
    expect(withPath.relPath).toBe('docs/proposals/p2/proposal.md')
    expect(withPath.proposalStatus).toBe('under-review')
  })

  it('slug UNIQUE 冲突 → fail-loud 普通 Error（15 码面无 proposal-exists 专属码——不私扩 typed 面）', async () => {
    const s = svc()
    await s.createProposal({ projectId: h!.projectId, slug: 'dup', title: '一' })
    const err = await s.createProposal({ projectId: h!.projectId, slug: 'dup', title: '二' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toContain('dup')
    // 幂等冲突零副作用：仍一行
    expect(h!.wsDb.prepare(`SELECT COUNT(*) AS n FROM proposals`).get()).toEqual({ n: 1 })
  })
})

describe('AC3 transitionProposal：from≠to 同源 + 裁决写 decided_at', () => {
  it('非裁决转移（draft → under-review）不改写 decided_at', async () => {
    const s = svc()
    const created = await s.createProposal({ projectId: h!.projectId, slug: 'p', title: 'x' })
    const row = await s.transitionProposal({ projectId: h!.projectId, proposalId: created.proposalId, toStatus: 'under-review' })
    expect(row.proposalStatus).toBe('under-review')
    expect(row.decidedAt).toBeUndefined()
  })

  it('裁决写：→ accepted 写 decided_at；→ superseded 不改写（裁决时刻保持——2.2 起必带 supersededBy 谱系目标）', async () => {
    vi.useFakeTimers()
    const s = svc()
    const created = await s.createProposal({ projectId: h!.projectId, slug: 'p', title: 'x' })
    const target = seedProposal(h!.wsDb, { slug: 'p-successor' }) // 取代链目标（在场）
    vi.setSystemTime(new Date('2026-10-06T08:00:00.000Z'))
    const accepted = await s.transitionProposal({ projectId: h!.projectId, proposalId: created.proposalId, toStatus: 'accepted' })
    expect(accepted.proposalStatus).toBe('accepted')
    expect(accepted.decidedAt).toBe('2026-10-06T08:00:00.000Z')
    vi.setSystemTime(new Date('2026-10-06T09:00:00.000Z'))
    const superseded = await s.transitionProposal({
      projectId: h!.projectId,
      proposalId: created.proposalId,
      toStatus: 'superseded',
      supersededBy: target,
    })
    expect(superseded.proposalStatus).toBe('superseded')
    expect(superseded.decidedAt).toBe('2026-10-06T08:00:00.000Z') // 不改写
  })

  it('→ rejected 同写 decided_at；再裁决（rejected → accepted）覆盖式更新为最新裁决时刻', async () => {
    vi.useFakeTimers()
    const s = svc()
    const id = seedProposal(h!.wsDb, { slug: 'r', status: 'under-review' })
    vi.setSystemTime(new Date('2026-10-06T08:00:00.000Z'))
    const rejected = await s.transitionProposal({ projectId: h!.projectId, proposalId: id, toStatus: 'rejected' })
    expect(rejected.decidedAt).toBe('2026-10-06T08:00:00.000Z')
    vi.setSystemTime(new Date('2026-10-06T10:00:00.000Z'))
    const accepted = await s.transitionProposal({ projectId: h!.projectId, proposalId: id, toStatus: 'accepted' })
    expect(accepted.decidedAt).toBe('2026-10-06T10:00:00.000Z')
  })

  it('from ≠ to 校验：to === current → ERR_INVALID_TRANSITION（allowed = 五态 − 当前态）', async () => {
    const s = svc()
    const id = seedProposal(h!.wsDb, { slug: 'p', status: 'under-review' })
    const err = await s
      .transitionProposal({ projectId: h!.projectId, proposalId: id, toStatus: 'under-review' })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(SmallDomainInvalidTransitionError)
    const data = (err as SmallDomainInvalidTransitionError).data
    expect(data.kind).toBe('proposal')
    expect(data.allowed).toEqual(['draft', 'accepted', 'rejected', 'superseded'])
  })

  it('proposalId 未命中 → ERR_PROPOSAL_NOT_FOUND', async () => {
    const s = svc()
    const err = await s
      .transitionProposal({ projectId: h!.projectId, proposalId: 'missing', toStatus: 'accepted' })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ProposalNotFoundError)
    expect((err as ProposalNotFoundError).code).toBe('ERR_PROPOSAL_NOT_FOUND')
  })
})

describe('AC3 listProposals：search / sort', () => {
  it('search：slug / title / 状态中英标签匹配；sort active（终态在后）/ created', async () => {
    const s = svc()
    seedProposal(h!.wsDb, { slug: 'alpha', status: 'under-review', createdAt: '2026-01-01T00:00:00.000Z' })
    seedProposal(h!.wsDb, { slug: 'beta', createdAt: '2026-02-01T00:00:00.000Z' })
    seedProposal(h!.wsDb, { slug: 'old-done', status: 'accepted', createdAt: '2026-01-02T00:00:00.000Z' })
    expect((await s.listProposals({ projectId: h!.projectId, search: 'alp' })).map((c) => c.slug)).toEqual(['alpha'])
    expect((await s.listProposals({ projectId: h!.projectId, search: '评审中' })).map((c) => c.slug)).toEqual(['alpha'])
    expect((await s.listProposals({ projectId: h!.projectId, search: 'UNDER REVIEW' })).map((c) => c.slug)).toEqual(['alpha'])
    expect(await s.listProposals({ projectId: h!.projectId, search: '草稿不存在此词' })).toEqual([])
    expect((await s.listProposals({ projectId: h!.projectId, sort: 'active' })).map((c) => c.slug)).toEqual([
      'beta',
      'alpha',
      'old-done',
    ])
    expect((await s.listProposals({ projectId: h!.projectId, sort: 'created' })).map((c) => c.slug)).toEqual([
      'beta',
      'old-done',
      'alpha',
    ])
  })
})

describe('AC6 proposals 写动词 emitTasksChanged 接线（proposals 为 tool 写——提案子 tab 刷新唯一源）', () => {
  it('createProposal / transitionProposal 各发 {projectId} 恰一次；拒绝面零发射', async () => {
    const s = svc()
    const created = await s.createProposal({ projectId: h!.projectId, slug: 'p', title: 'x' })
    await s.transitionProposal({ projectId: h!.projectId, proposalId: created.proposalId, toStatus: 'under-review' })
    expect(h!.events.emitted).toEqual([{ projectId: h!.projectId }, { projectId: h!.projectId }])
    h!.events.emitted.length = 0
    await s
      .transitionProposal({ projectId: h!.projectId, proposalId: created.proposalId, toStatus: 'under-review' })
      .catch(() => undefined)
    expect(h!.events.emitted).toEqual([])
  })
})

describe('2.3 listProposals：mode 直出 + taskCount 容器维度单查询 JOIN 分组', () => {
  it('mode 直出：NULL → 键缺席（UI 缺省占位判据）；expedition/blitz 透传；supersededBy NULL 同缺席', async () => {
    const s = svc()
    seedProposal(h!.wsDb, { slug: 'null-mode' })
    seedProposal(h!.wsDb, { slug: 'exp', mode: 'expedition' })
    seedProposal(h!.wsDb, { slug: 'blz', mode: 'blitz' })
    const bySlug = new Map((await s.listProposals({ projectId: h!.projectId })).map((c) => [c.slug, c]))
    expect(bySlug.get('null-mode')!.mode).toBeUndefined() // NULL 直出 = 键缺席
    expect(bySlug.get('exp')!.mode).toBe('expedition')
    expect(bySlug.get('blz')!.mode).toBe('blitz')
    expect(bySlug.get('null-mode')!.supersededBy).toBeUndefined()
  })

  it('taskCount 双轨容器计数：proposal 直挂 + 成链 feature（proposal_id 谱系）任务并入同计；无任务提案 = 0（pill 判据）', async () => {
    const s = svc()
    const pa = seedProposal(h!.wsDb, { slug: 'demo-a' })
    seedProposal(h!.wsDb, { slug: 'demo-b' })
    // 直挂 ×2（突击任务直挂提案——source_kind='proposal'）
    seedContainerTask(h!.wsDb, { containerId: pa, kind: 'proposal', slug: 'demo-a', localId: '1.1' })
    seedContainerTask(h!.wsDb, { containerId: pa, kind: 'proposal', slug: 'demo-a', localId: '1.2' })
    // 成链 feature（proposal_id = pa）名下任务 ×1 → 并入 demo-a 同计（容器维度口径）
    const fa = seedFeature(h!.wsDb, { id: 'f-a', slug: 'demo-a', proposalId: pa })
    seedContainerTask(h!.wsDb, { containerId: fa, kind: 'feature', slug: 'demo-a', localId: '2.1' })
    const bySlug = new Map((await s.listProposals({ projectId: h!.projectId })).map((c) => [c.slug, c]))
    expect(bySlug.get('demo-a')!.taskCount).toBe(3) // 2 直挂 + 1 成链并入
    expect(bySlug.get('demo-b')!.taskCount).toBe(0) // 无任务 → 0（「有任务的提案」pill 不亮）
  })

  it('判别口径 = kind + source_id（非 slug 计）：未成链同 slug feature 任务不串计', async () => {
    const s = svc()
    const px = seedProposal(h!.wsDb, { slug: 'shared-slug' })
    // 同 slug feature 但 proposal_id NULL（未成链——独立容器）名下任务不计入提案
    const fx = seedFeature(h!.wsDb, { id: 'f-x', slug: 'shared-slug', proposalId: null })
    seedContainerTask(h!.wsDb, { containerId: fx, kind: 'feature', slug: 'shared-slug', localId: '3.1' })
    const before = (await s.listProposals({ projectId: h!.projectId })).find((c) => c.slug === 'shared-slug')
    expect(before!.taskCount).toBe(0) // 旧 GROUP BY slug 口径会误计 1——source_id 分组语义 pin
    seedContainerTask(h!.wsDb, { containerId: px, kind: 'proposal', slug: 'shared-slug', localId: '3.2' })
    const after = (await s.listProposals({ projectId: h!.projectId })).find((c) => c.slug === 'shared-slug')
    expect(after!.taskCount).toBe(1)
  })
})

describe('2.3 listProposalDocs：docs/proposals/<slug>/ 只读扫描（零状态零写径）', () => {
  /** 目录夹具：多文档 / frontmatter 缺席 / 子目录 / 非 .md / 非 UTF-8 */
  function seedDocDir(forgeDir: string, slug: string): void {
    const dir = join(forgeDir, 'docs', 'proposals', slug)
    mkdirSync(join(dir, 'spikes'), { recursive: true })
    writeFileSync(
      join(dir, 'proposal.md'),
      `---\ntitle: 演示提案\nstatus: under-review\n---\n\n# 演示提案\n\n正文。\n`,
    )
    writeFileSync(join(dir, 'tech-research.md'), `# 技术调研\n\n无 frontmatter 文档——title/status 缺席（行恒立）。\n`)
    writeFileSync(
      join(dir, 'spikes', 's5-preset-base.md'),
      `---\ntitle: S5 预设底座 spike\nstatus: done\n---\n\nspike 正文。`,
    )
    writeFileSync(join(dir, 'spikes', 's6-skill-provisioning.md'), `# S6\n\n子目录内 frontmatter 缺席。`)
    writeFileSync(join(dir, 'notes.txt'), `非 markdown 忽略`)
    writeFileSync(join(dir, 'diagram.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    writeFileSync(join(dir, 'readme.MD'), `大写扩展名非 .md——忽略`)
    writeFileSync(join(dir, 'legacy-bad-utf8.md'), Buffer.from([0xff, 0xfe, 0x00, 0x2d]))
  }

  it('多文档 + 子目录递归：行 = {fileName, relPath(正斜杠 rel forge_dir), title?, status?}——relPath 字典序确定性', async () => {
    const s = svc()
    seedDocDir(h!.forgeDir, 'demo-slug')
    const rows = await s.listProposalDocs({ projectId: h!.projectId, slug: 'demo-slug' })
    expect(rows.map((r) => r.relPath)).toEqual([
      'docs/proposals/demo-slug/legacy-bad-utf8.md', // 非 UTF-8 → 行恒立（可选字段缺席）
      'docs/proposals/demo-slug/proposal.md',
      'docs/proposals/demo-slug/spikes/s5-preset-base.md',
      'docs/proposals/demo-slug/spikes/s6-skill-provisioning.md',
      'docs/proposals/demo-slug/tech-research.md',
    ])
    const byRel = new Map(rows.map((r) => [r.relPath, r]))
    // frontmatter 可选初值：title/status 透传（status 原文——doc 区显示初值，不做词汇归一）
    expect(byRel.get('docs/proposals/demo-slug/proposal.md')).toMatchObject({
      fileName: 'proposal.md',
      title: '演示提案',
      status: 'under-review',
    })
    expect(byRel.get('docs/proposals/demo-slug/spikes/s5-preset-base.md')).toMatchObject({
      fileName: 's5-preset-base.md',
      title: 'S5 预设底座 spike',
      status: 'done',
    })
    // frontmatter 缺席 → 可选字段缺席（fileName/relPath 恒有）；title 只取 frontmatter（非 H1）
    expect(byRel.get('docs/proposals/demo-slug/tech-research.md')).toEqual({
      fileName: 'tech-research.md',
      relPath: 'docs/proposals/demo-slug/tech-research.md',
    })
    expect(byRel.get('docs/proposals/demo-slug/legacy-bad-utf8.md')).toEqual({
      fileName: 'legacy-bad-utf8.md',
      relPath: 'docs/proposals/demo-slug/legacy-bad-utf8.md',
    })
  })

  it('越界容错：目录缺席 → 空列表（非错误）；非 .md（txt/图片/大写 .MD）忽略；frontmatter 缺席可选字段缺席', async () => {
    const s = svc()
    seedDocDir(h!.forgeDir, 'demo-slug')
    await expect(s.listProposalDocs({ projectId: h!.projectId, slug: 'no-such-dir' })).resolves.toEqual([])
    const rows = await s.listProposalDocs({ projectId: h!.projectId, slug: 'demo-slug' })
    expect(rows.some((r) => !r.relPath.endsWith('.md'))).toBe(false)
    expect(rows.map((r) => r.fileName)).not.toContain('notes.txt')
    expect(rows.map((r) => r.fileName)).not.toContain('diagram.png')
    expect(rows.map((r) => r.fileName)).not.toContain('readme.MD')
    const noFm = rows.find((r) => r.fileName === 's6-skill-provisioning.md')
    expect(noFm).toEqual({
      fileName: 's6-skill-provisioning.md',
      relPath: 'docs/proposals/demo-slug/spikes/s6-skill-provisioning.md',
    })
  })

  it('非法 slug（路径穿越/隐藏/分隔符）→ 空列表——slug 卫生守卫', async () => {
    const s = svc()
    for (const slug of ['..', '../escape', '.hidden', 'a/b', 'trailing.']) {
      await expect(s.listProposalDocs({ projectId: h!.projectId, slug })).resolves.toEqual([])
    }
  })

  it('零状态零写径：不触工作区库（store.ensureOpen 零调用——文件系统为事实源）', async () => {
    h ??= createHarness()
    let ensureOpenCalls = 0
    const guardedStore = {
      ...h.store,
      ensureOpen: (pid: string) => {
        ensureOpenCalls += 1
        return h!.store.ensureOpen(pid)
      },
    }
    const s = createProposalsService({
      store: guardedStore,
      events: h.events,
      resolveForgeDir: h.routing.forgeDir,
      registerFeatureInTx: REGISTER_IN_TX,
    })
    seedDocDir(h.forgeDir, 'demo-slug')
    await expect(s.listProposalDocs({ projectId: h!.projectId, slug: 'demo-slug' })).resolves.toHaveLength(5)
    expect(ensureOpenCalls).toBe(0)
  })
})

// ─────────────────────────── 2.2 写径三面（图 6 / 图 7） ───────────────────────────

describe('2.2 成链分叉内聚（图 6·裁决⑤）：accepted·expedition 单事务原子成链', () => {
  it('expedition × accepted：proposals 行 + features 行（同名 slug/title/proposal_id 谱系）+ feature_records(register) 三行原子；返回 chained', async () => {
    const s = svc()
    const pa = seedProposal(h!.wsDb, { slug: 'demo-chain', title: '演示成链提案', status: 'under-review', mode: 'expedition' })
    const row = await s.transitionProposal({ projectId: h!.projectId, proposalId: pa, toStatus: 'accepted' })
    expect(row.proposalStatus).toBe('accepted')
    expect(row.decidedAt).toBeTruthy() // 裁决时刻随成链同事务落
    // chained = 同名 slug/title 继承 + proposal_id 谱系 + 新行缺省 'prd'
    expect(row.chained).toMatchObject({
      slug: 'demo-chain',
      title: '演示成链提案',
      featureStatus: 'prd',
      proposalId: pa,
    })
    expect(row.chained!.featureId).toMatch(/^[0-9a-f-]{36}$/)
    expect(row.chained!.summary).toBeUndefined() // proposals 无 summary 列——继承面天然缺席
    // 三行原子锚（不变量 5）：features 行 + feature_records(register·actor='core') 恰各一
    const feature = h!.wsDb
      .prepare(`SELECT id, slug, title, proposal_id FROM features WHERE proposal_id = ?`)
      .get(pa) as { id: string; slug: string; title: string; proposal_id: string }
    expect(feature).toMatchObject({ slug: 'demo-chain', title: '演示成链提案', proposal_id: pa })
    expect(feature.id).toBe(row.chained!.featureId)
    const records = h!.wsDb
      .prepare(`SELECT verb, from_status, to_status, actor FROM feature_records WHERE feature_id = ?`)
      .all(feature.id) as { verb: string; from_status: string | null; to_status: string | null; actor: string }[]
    expect(records).toEqual([{ verb: 'register', from_status: null, to_status: 'prd', actor: 'core' }])
  })

  it('分叉边界：blitz × accepted → 不成链（直接任务阶段）；NULL × accepted → 不成链（先 setProposalMode，补链 = 显式 registerFeature）', async () => {
    const s = svc()
    const blitz = seedProposal(h!.wsDb, { slug: 'blitz-p', status: 'under-review', mode: 'blitz' })
    const blitzed = await s.transitionProposal({ projectId: h!.projectId, proposalId: blitz, toStatus: 'accepted' })
    expect(blitzed.proposalStatus).toBe('accepted')
    expect('chained' in blitzed && blitzed.chained !== undefined).toBe(false) // 无链
    const nul = seedProposal(h!.wsDb, { slug: 'null-p', status: 'under-review', mode: null }) // 扫描吸收旧行 = NULL 占位
    const nulled = await s.transitionProposal({ projectId: h!.projectId, proposalId: nul, toStatus: 'accepted' })
    expect(nulled.proposalStatus).toBe('accepted')
    expect('chained' in nulled && nulled.chained !== undefined).toBe(false) // 无链——边界注记
    expect(h!.wsDb.prepare(`SELECT COUNT(*) AS n FROM features`).get()).toEqual({ n: 0 })
    expect(h!.wsDb.prepare(`SELECT COUNT(*) AS n FROM feature_records`).get()).toEqual({ n: 0 })
  })

  it('图 6 全分支表：mode × 非 accepted 转移（superseded / rejected / 打回 under-review→draft）恒不成链', async () => {
    const s = svc()
    const target = seedProposal(h!.wsDb, { slug: 'branch-target' }) // superseded 行目标
    const cases: ReadonlyArray<{ slug: string; mode: string | null; toStatus: ProposalStatus }> = [
      { slug: 'b-exp-sup', mode: 'expedition', toStatus: 'superseded' },
      { slug: 'b-exp-rej', mode: 'expedition', toStatus: 'rejected' },
      { slug: 'b-exp-back', mode: 'expedition', toStatus: 'draft' }, // 打回
      { slug: 'b-blz-sup', mode: 'blitz', toStatus: 'superseded' },
      { slug: 'b-blz-back', mode: 'blitz', toStatus: 'draft' }, // 打回
      { slug: 'b-nul-rej', mode: null, toStatus: 'rejected' },
      { slug: 'b-nul-back', mode: null, toStatus: 'draft' }, // 打回
    ]
    for (const c of cases) {
      const pid = seedProposal(h!.wsDb, { slug: c.slug, status: 'under-review', mode: c.mode })
      const row = await s.transitionProposal({
        projectId: h!.projectId,
        proposalId: pid,
        toStatus: c.toStatus,
        ...(c.toStatus === 'superseded' ? { supersededBy: target } : {}),
      })
      expect(row.proposalStatus, c.slug).toBe(c.toStatus)
      expect(row.chained, `${c.slug} 非 accepted 转移不成链`).toBeUndefined()
    }
    expect(h!.wsDb.prepare(`SELECT COUNT(*) AS n FROM features`).get()).toEqual({ n: 0 })
    expect(h!.wsDb.prepare(`SELECT COUNT(*) AS n FROM feature_records`).get()).toEqual({ n: 0 })
  })

  it('幂等：同 proposal_id 已有 feature 不重复建链（chained 缺席——成链事实由谱系 JOIN 读面承载）', async () => {
    const s = svc()
    const pa = seedProposal(h!.wsDb, { slug: 'idem', status: 'under-review', mode: 'expedition' })
    seedFeature(h!.wsDb, { id: 'f-idem', slug: 'idem', proposalId: pa }) // 既有同谱系 feature（如打回后再裁决）
    const row = await s.transitionProposal({ projectId: h!.projectId, proposalId: pa, toStatus: 'accepted' })
    expect(row.proposalStatus).toBe('accepted')
    expect(row.chained).toBeUndefined() // 不重复建链
    expect(h!.wsDb.prepare(`SELECT COUNT(*) AS n FROM features`).get()).toEqual({ n: 1 })
    expect(h!.wsDb.prepare(`SELECT COUNT(*) AS n FROM feature_records`).get()).toEqual({ n: 0 }) // 无第二次 register
  })

  it('异谱系同 slug feature 在场 → 成链预检 typed 409（ERR_FEATURE_EXISTS）+ 整体回滚（提案保持原态）', async () => {
    const s = svc()
    seedFeature(h!.wsDb, { id: 'f-clash', slug: 'clash', proposalId: null }) // 独立容器同 slug
    const pa = seedProposal(h!.wsDb, { slug: 'clash', status: 'under-review', mode: 'expedition' })
    const err = await s
      .transitionProposal({ projectId: h!.projectId, proposalId: pa, toStatus: 'accepted' })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(FeatureExistsError)
    expect((err as FeatureExistsError).code).toBe('ERR_FEATURE_EXISTS')
    // 单事务全回滚：提案未被裁决 + 无新增 feature/审计行
    const after = h!.wsDb
      .prepare(`SELECT proposal_status FROM proposals WHERE id = ?`)
      .get(pa) as { proposal_status: string }
    expect(after.proposal_status).toBe('under-review')
    expect(h!.wsDb.prepare(`SELECT COUNT(*) AS n FROM features`).get()).toEqual({ n: 1 })
    expect(h!.wsDb.prepare(`SELECT COUNT(*) AS n FROM feature_records`).get()).toEqual({ n: 0 })
  })

  it('原子回滚锚（不变量 5·全成全败）：成链事务中途失败 → proposals/features/feature_records 三面零残留', async () => {
    h ??= createHarness()
    const s = createProposalsService({
      store: h.store,
      events: h.events,
      resolveForgeDir: h.routing.forgeDir,
      registerFeatureInTx: () => {
        throw new Error('boom: 成链中断（注入失败）')
      },
    })
    const pa = seedProposal(h.wsDb, { slug: 'rollback', status: 'under-review', mode: 'expedition' })
    await expect(s.transitionProposal({ projectId: h.projectId, proposalId: pa, toStatus: 'accepted' })).rejects.toThrow(
      '成链中断',
    )
    const after = h.wsDb
      .prepare(`SELECT proposal_status, decided_at FROM proposals WHERE id = ?`)
      .get(pa) as { proposal_status: string; decided_at: string | null }
    expect(after).toEqual({ proposal_status: 'under-review', decided_at: null }) // 裁决回滚
    expect(h.wsDb.prepare(`SELECT COUNT(*) AS n FROM features`).get()).toEqual({ n: 0 })
    expect(h.wsDb.prepare(`SELECT COUNT(*) AS n FROM feature_records`).get()).toEqual({ n: 0 })
    expect(h.events.emitted).toEqual([]) // 失败面零事件
  })
})

describe('2.2 superseded 谱系取代链：必带目标 + 在场校验 + 写 superseded_by', () => {
  it('必带 supersededBy：缺席 → fail-loud 拒绝（typed 面无专属码——createProposal slug 冲突同口径）+ 库零变更', async () => {
    const s = svc()
    const pa = seedProposal(h!.wsDb, { slug: 'sup-plain', status: 'under-review' })
    const err = await s
      .transitionProposal({ projectId: h!.projectId, proposalId: pa, toStatus: 'superseded' })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(ProposalNotFoundError) // 普通 Error（非 typed 私扩）
    expect((err as Error).message).toContain('supersededBy')
    const after = h!.wsDb
      .prepare(`SELECT proposal_status, superseded_by FROM proposals WHERE id = ?`)
      .get(pa) as { proposal_status: string; superseded_by: string | null }
    expect(after).toEqual({ proposal_status: 'under-review', superseded_by: null })
  })

  it('目标提案在场校验：supersededBy 未命中 → ERR_PROPOSAL_NOT_FOUND（typed）', async () => {
    const s = svc()
    const pa = seedProposal(h!.wsDb, { slug: 'sup-miss', status: 'under-review' })
    const err = await s
      .transitionProposal({ projectId: h!.projectId, proposalId: pa, toStatus: 'superseded', supersededBy: 'missing-target' })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ProposalNotFoundError)
    expect((err as ProposalNotFoundError).data.proposalId).toBe('missing-target') // 载荷 = 取代目标（非转移主体）
    expect(
      (h!.wsDb.prepare(`SELECT superseded_by FROM proposals WHERE id = ?`).get(pa) as { superseded_by: string | null })
        .superseded_by,
    ).toBeNull()
  })

  it('superseded 转移写 superseded_by（返回行透出）+ decided_at 不改写；非 superseded 转移不改写既有谱系（打回保留取代事实）', async () => {
    const s = svc()
    const pa = seedProposal(h!.wsDb, { slug: 'sup-write', status: 'under-review' })
    const target = seedProposal(h!.wsDb, { slug: 'sup-write-target' })
    const row = await s.transitionProposal({
      projectId: h!.projectId,
      proposalId: pa,
      toStatus: 'superseded',
      supersededBy: target,
    })
    expect(row.supersededBy).toBe(target) // 返回行透出（UF-1 谱系右列数据面）
    expect(
      (h!.wsDb.prepare(`SELECT superseded_by FROM proposals WHERE id = ?`).get(pa) as { superseded_by: string | null })
        .superseded_by,
    ).toBe(target)
    // 打回（superseded → draft）不改写既有谱系——取代链事实保留，可再裁决走向
    const back = await s.transitionProposal({ projectId: h!.projectId, proposalId: pa, toStatus: 'draft' })
    expect(back.supersededBy).toBe(target)
  })
})

describe('2.2 setProposalMode（图 7·律三）：mode 唯一写径 + 快照不回溯', () => {
  it('单事务只写 proposals.mode + reason 必填（空因 → ERR_REASON_REQUIRED）+ 返回行透出', async () => {
    const s = svc()
    const pa = seedProposal(h!.wsDb, { slug: 'mode-write', status: 'under-review', mode: null })
    const row = await s.setProposalMode({ projectId: h!.projectId, proposalId: pa, mode: 'expedition', reason: '评审定为远征' })
    expect(row.mode).toBe('expedition')
    expect((h!.wsDb.prepare(`SELECT mode FROM proposals WHERE id = ?`).get(pa) as { mode: string | null }).mode).toBe(
      'expedition',
    )
    const err = await s
      .setProposalMode({ projectId: h!.projectId, proposalId: pa, mode: 'blitz', reason: '   ' })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ReasonRequiredError)
    expect((err as ReasonRequiredError).code).toBe('ERR_REASON_REQUIRED')
    // 空因拒绝零变更
    expect((h!.wsDb.prepare(`SELECT mode FROM proposals WHERE id = ?`).get(pa) as { mode: string | null }).mode).toBe(
      'expedition',
    )
  })

  it('快照不回溯（不变量 3）：setProposalMode 后 tasks.mode 快照不变——容器任务留创建时事实', async () => {
    const s = svc()
    const pa = seedProposal(h!.wsDb, { slug: 'mode-snap', status: 'under-review', mode: 'expedition' })
    seedContainerTask(h!.wsDb, { containerId: pa, kind: 'proposal', slug: 'mode-snap', localId: '9.1', mode: 'expedition' })
    await s.setProposalMode({ projectId: h!.projectId, proposalId: pa, mode: 'blitz', reason: '降级突击——快照不回溯明示' })
    expect((h!.wsDb.prepare(`SELECT mode FROM proposals WHERE id = ?`).get(pa) as { mode: string | null }).mode).toBe('blitz')
    const task = h!.wsDb
      .prepare(`SELECT mode FROM tasks WHERE source_kind = 'proposal' AND source_id = ?`)
      .get(pa) as { mode: string | null }
    expect(task.mode).toBe('expedition') // tasks.mode 永不触碰
  })

  it('proposalId 未命中 → ERR_PROPOSAL_NOT_FOUND', async () => {
    const s = svc()
    const err = await s
      .setProposalMode({ projectId: h!.projectId, proposalId: 'missing', mode: 'blitz', reason: 'x' })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ProposalNotFoundError)
  })
})

describe('2.2 createProposal：mode 透传（创建技能写入；缺省 NULL 占位）', () => {
  it('mode 可选透传落库：expedition/blitz 写入 / 缺省 = NULL（键缺席——扫描吸收旧行同形）', async () => {
    const s = svc()
    const exp = await s.createProposal({ projectId: h!.projectId, slug: 'cp-exp', title: '一', mode: 'expedition' })
    expect(exp.mode).toBe('expedition')
    const blz = await s.createProposal({ projectId: h!.projectId, slug: 'cp-blz', title: '二', mode: 'blitz' })
    expect(blz.mode).toBe('blitz')
    const none = await s.createProposal({ projectId: h!.projectId, slug: 'cp-none', title: '三' })
    expect(none.mode).toBeUndefined()
    expect(
      (h!.wsDb.prepare(`SELECT mode FROM proposals WHERE slug = ?`).get('cp-none') as { mode: string | null }).mode,
    ).toBeNull()
  })
})

describe('2.2 新写动词事件接线：成链单发 / setProposalMode 写后单发 / 拒绝面零发射', () => {
  it('transitionProposal 成链 = 恰一次 {projectId}（内聚 registerFeature 非二次提交——无第二次发射）', async () => {
    const s = svc()
    const pa = seedProposal(h!.wsDb, { slug: 'evt-chain', status: 'under-review', mode: 'expedition' })
    await s.transitionProposal({ projectId: h!.projectId, proposalId: pa, toStatus: 'accepted' })
    expect(h!.events.emitted).toEqual([{ projectId: h!.projectId }])
  })

  it('setProposalMode 写后恰一次；reason 空因拒绝零发射', async () => {
    const s = svc()
    const pa = seedProposal(h!.wsDb, { slug: 'evt-mode', status: 'under-review' })
    h!.events.emitted.length = 0
    await s.setProposalMode({ projectId: h!.projectId, proposalId: pa, mode: 'blitz', reason: 'r' })
    expect(h!.events.emitted).toEqual([{ projectId: h!.projectId }])
    h!.events.emitted.length = 0
    await s
      .setProposalMode({ projectId: h!.projectId, proposalId: pa, mode: 'expedition', reason: '' })
      .catch(() => undefined)
    expect(h!.events.emitted).toEqual([])
  })
})

// ─────────────────────────── tool-row-lossless-json-fix：tool 返回面 lossless 走查 ───────────────────────────
// harness 输出快照边界（@deepseek-ai/dsh-util-values snapshotJsonValue）对显式 undefined
// 属性整值拒绝（Reflect.ownKeys 收录该键、遍历遇 undefined 即拒）——createProposal 的
// author 恒 NULL 曾使 tool 面 100% 报 INVALID_TOOL_OUTPUT（写已落库、返回面假错）。
// 回归口径：镜像该规则的走查断言（自实现递归，零 DSH 运行时依赖）。

/** 走查：值内不得有任何 own enumerable 显式 undefined 属性（返回路径 = 键缺席式可选字段） */
function assertNoExplicitUndefined(value: unknown, path = '$'): void {
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertNoExplicitUndefined(item, `${path}[${i}]`))
    return
  }
  if (value === null || typeof value !== 'object') return
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') continue
    const v = (value as Record<string, unknown>)[key]
    if (v === undefined) throw new Error(`显式 undefined 属性：${path}.${key}（tool 返回面非 lossless JSON）`)
    assertNoExplicitUndefined(v, `${path}.${key}`)
  }
}

describe('tool-row-lossless-json-fix：行映射 NULL 列 = 键缺席（显式 undefined 整值拒绝）', () => {
  it('createProposal（author 恒 NULL + 可选全缺席）：返回 DTO 走查零显式 undefined 键', async () => {
    const s = svc()
    const row = await s.createProposal({ projectId: h!.projectId, slug: 'lz-create', title: '走查' })
    expect(() => assertNoExplicitUndefined(row)).not.toThrow()
    // 语义不变：可选字段缺席 = undefined（键缺席式访问）
    expect(row.author).toBeUndefined()
    expect(row.decidedAt).toBeUndefined()
  })

  it('transitionProposal accepted（decidedAt 写入 / supersededBy 缺席）：返回 DTO 走查通过', async () => {
    const s = svc()
    const created = await s.createProposal({ projectId: h!.projectId, slug: 'lz-accept', title: '裁决', mode: 'blitz' })
    const row = await s.transitionProposal({ projectId: h!.projectId, proposalId: created.proposalId, toStatus: 'accepted' })
    expect(() => assertNoExplicitUndefined(row)).not.toThrow()
    expect(row.decidedAt).toBeTruthy() // 裁决时刻写入
    expect(row.supersededBy).toBeUndefined() // 非谱系转移键缺席
  })

  it('transitionProposal superseded（supersededBy 在场）：返回 DTO 走查通过', async () => {
    const s = svc()
    const target = await s.createProposal({ projectId: h!.projectId, slug: 'lz-target', title: '取代者' })
    const victim = await s.createProposal({ projectId: h!.projectId, slug: 'lz-victim', title: '被取代' })
    const row = await s.transitionProposal({
      projectId: h!.projectId,
      proposalId: victim.proposalId,
      toStatus: 'superseded',
      supersededBy: target.proposalId,
    })
    expect(() => assertNoExplicitUndefined(row)).not.toThrow()
    expect(row.supersededBy).toBe(target.proposalId)
  })

  it('transitionProposal 成链分支（chained.summary NULL）：整返回含 chained 走查通过', async () => {
    const s = svc()
    const pa = seedProposal(h!.wsDb, { slug: 'lz-chain', status: 'under-review', mode: 'expedition' })
    const row = await s.transitionProposal({ projectId: h!.projectId, proposalId: pa, toStatus: 'accepted' })
    expect(row.chained).toBeDefined() // expedition 成链
    expect(() => assertNoExplicitUndefined(row)).not.toThrow() // 含 chained（summary/proposalId 缺席路）
    expect(row.chained?.summary).toBeUndefined()
  })
})
