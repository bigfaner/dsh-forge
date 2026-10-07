// 任务 2.7 测试 —— forgeProposals 域三法（tech-design §Interface 3）：createProposal
// （缺省 draft / slug UNIQUE 预检）、transitionProposal（from≠to 同源 + 裁决写 decided_at：
// → accepted/rejected 写、打回/superseded 不改写）、listProposals（search/sort）+
// 写动词 emitTasksChanged 接线。临时 SQLite 夹具。
// 任务 2.3 增读面两法：listProposals（mode 直出 + taskCount 容器维度 JOIN 分组）+
// listProposalDocs（docs/proposals/<slug>/ 只读扫描——目录夹具/越界容错/零状态）。
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import type { ProposalStatus } from '@dsh-forge/contracts'
import { createHarness, type SmallDomainHarness } from './harness.js'
import { createProposalsService } from './proposals.js'
import { ProposalNotFoundError, SmallDomainInvalidTransitionError } from './errors.js'

let h: SmallDomainHarness | undefined
afterEach(() => {
  vi.useRealTimers()
  h?.dispose()
  h = undefined
})

function svc() {
  h ??= createHarness()
  return createProposalsService({ store: h.store, events: h.events, resolveForgeDir: h.routing.forgeDir })
}

/** 种 proposal 行（直写库——受控初值/创建时间；2.3 增 mode 受控初值） */
function seedProposal(
  db: Database.Database,
  o: {
    id?: string
    slug?: string
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
  ).run(id, o.slug ?? `slug-${id}`, `提案 ${id}`, o.status ?? 'draft', o.mode ?? null, o.decidedAt ?? null, o.createdAt ?? '2026-01-01T00:00:00.000Z', o.createdAt ?? '2026-01-01T00:00:00.000Z')
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

/** 种容器任务行（2.3 taskCount 夹具——source 双列直写；slug ≡ 容器 slug 不变量） */
function seedContainerTask(
  db: Database.Database,
  o: { containerId: string; kind: 'feature' | 'proposal'; slug: string; localId: string },
): string {
  db.prepare(
    `INSERT INTO tasks (id, slug, local_id, title, task_type, task_status, source_kind, source_id, mode, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'coding-feature', 'pending', ?, ?, NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
  ).run(`t-${o.localId}`, o.slug, o.localId, `任务 ${o.localId}`, o.kind, o.containerId)
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

  it('裁决写：→ accepted 写 decided_at；→ superseded 不改写（裁决时刻保持）', async () => {
    vi.useFakeTimers()
    const s = svc()
    const created = await s.createProposal({ projectId: h!.projectId, slug: 'p', title: 'x' })
    vi.setSystemTime(new Date('2026-10-06T08:00:00.000Z'))
    const accepted = await s.transitionProposal({ projectId: h!.projectId, proposalId: created.proposalId, toStatus: 'accepted' })
    expect(accepted.proposalStatus).toBe('accepted')
    expect(accepted.decidedAt).toBe('2026-10-06T08:00:00.000Z')
    vi.setSystemTime(new Date('2026-10-06T09:00:00.000Z'))
    const superseded = await s.transitionProposal({ projectId: h!.projectId, proposalId: created.proposalId, toStatus: 'superseded' })
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
    const s = createProposalsService({ store: guardedStore, events: h.events, resolveForgeDir: h.routing.forgeDir })
    seedDocDir(h.forgeDir, 'demo-slug')
    await expect(s.listProposalDocs({ projectId: h!.projectId, slug: 'demo-slug' })).resolves.toHaveLength(5)
    expect(ensureOpenCalls).toBe(0)
  })
})
