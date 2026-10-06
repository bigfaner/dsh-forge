// 任务 2.7 测试 —— forgeProposals 域三法（tech-design §Interface 3）：createProposal
// （缺省 draft / slug UNIQUE 预检）、transitionProposal（from≠to 同源 + 裁决写 decided_at：
// → accepted/rejected 写、打回/superseded 不改写）、listProposals（search/sort）+
// 写动词 emitTasksChanged 接线。临时 SQLite 夹具。
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
  return createProposalsService({ store: h.store, events: h.events })
}

/** 种 proposal 行（直写库——受控初值/创建时间） */
function seedProposal(
  db: Database.Database,
  o: { id?: string; slug?: string; status?: ProposalStatus; decidedAt?: string | null; createdAt?: string },
): string {
  const id = o.id ?? `p-${Math.random().toString(36).slice(2, 8)}`
  db.prepare(
    `INSERT INTO proposals (id, slug, title, proposal_status, rel_path, author, decided_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
  ).run(id, o.slug ?? `slug-${id}`, `提案 ${id}`, o.status ?? 'draft', o.decidedAt ?? null, o.createdAt ?? '2026-01-01T00:00:00.000Z', o.createdAt ?? '2026-01-01T00:00:00.000Z')
  return id
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
