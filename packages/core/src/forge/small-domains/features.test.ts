// 任务 2.7 测试 —— forgeFeatures 域五法（tech-design §Interface 2）：registerFeature
// （slug UNIQUE → ERR_FEATURE_EXISTS / 谱系 FK 预检 ERR_PROPOSAL_NOT_FOUND）、
// transitionFeature（reason 必带 + from≠to 同源 ERR_INVALID_TRANSITION）、upsertFeatureDoc
// （登记即推进——单事务内聚相位推进/单调只进/slug→id 解析/漂移防护回滚）、listFeatures
// （七态分布/文档统计/谱系 + search/sort）、listFeatureDocs（fix-2 列举读面——文档行数据源）
// + 写动词 emitTasksChanged 接线。临时 SQLite 夹具。
import { afterEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import type { FeatureCard, TaskStatus } from '@dsh-forge/contracts'
import { PhaseInvariantViolationError } from '../tasks/phase-deriver.js'
import { assertPhaseInvariant, deriveFeaturePhase } from '../tasks/phase-deriver.js'
import { createHarness, type SmallDomainHarness } from './harness.js'
import { createFeaturesService } from './features.js'
import {
  FeatureExistsError,
  FeatureNotFoundError,
  ProposalNotFoundError,
  ReasonRequiredError,
  SmallDomainInvalidTransitionError,
} from './errors.js'

/** 生产装配同构注入（2.1 推导机单源纯函数——四域互禁 import，测试经装配同径传入） */
const PHASE = { derivePhase: deriveFeaturePhase, assertPhaseInvariant }


let h: SmallDomainHarness | undefined
afterEach(() => {
  vi.useRealTimers()
  h?.dispose()
  h = undefined
})

function svc() {
  h ??= createHarness()
  return createFeaturesService({ store: h.store, events: h.events, phase: PHASE })
}

/** 种 feature 行（直写库——受控初值：漂移/终态/谱系场景） */
function seedFeature(
  db: Database.Database,
  o: { id?: string; slug?: string; status?: string; createdAt?: string; proposalId?: string | null },
): string {
  const id = o.id ?? `f-${Math.random().toString(36).slice(2, 8)}`
  db.prepare(
    `INSERT INTO features (id, slug, title, feature_status, summary, proposal_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`,
  ).run(id, o.slug ?? `slug-${id}`, `特性 ${id}`, o.status ?? 'prd', o.proposalId ?? null, o.createdAt ?? '2026-01-01T00:00:00.000Z', o.createdAt ?? '2026-01-01T00:00:00.000Z')
  return id
}

/** 种 task 行（feature 谱系 + 状态受控） */
function seedTask(db: Database.Database, featureId: string, slug: string, localId: string, status: TaskStatus): void {
  db.prepare(
    `INSERT INTO tasks (id, slug, local_id, title, task_type, task_status, feature_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'coding.feature', ?, ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
  ).run(`t-${Math.random().toString(36).slice(2, 8)}`, slug, localId, `任务 ${localId}`, status, featureId)
}

describe('AC1 registerFeature：slug UNIQUE + 谱系 FK 预检', () => {
  it('新建缺省 prd：FeatureRow 全字段（featureStatus=prd、proposalId 缺省）', async () => {
    const s = svc()
    const row = await s.registerFeature({ projectId: h!.projectId, slug: 'demo-feature', title: '演示特性' })
    expect(row.featureId).toMatch(/^[0-9a-f-]{36}$/)
    expect(row).toMatchObject({ slug: 'demo-feature', title: '演示特性', featureStatus: 'prd' })
    expect(row.proposalId).toBeUndefined()
    expect(row.summary).toBeUndefined()
  })

  it('slug UNIQUE 冲突 → ERR_FEATURE_EXISTS（data 带 slug/projectId）', async () => {
    const s = svc()
    await s.registerFeature({ projectId: h!.projectId, slug: 'dup', title: '一' })
    const err = await s
      .registerFeature({ projectId: h!.projectId, slug: 'dup', title: '二' })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(FeatureExistsError)
    expect((err as FeatureExistsError).code).toBe('ERR_FEATURE_EXISTS')
    expect((err as FeatureExistsError).data).toEqual({ projectId: h!.projectId, slug: 'dup' })
  })

  it('proposalId 未命中 → ERR_PROPOSAL_NOT_FOUND（校验先于写——features 表零行）', async () => {
    const s = svc()
    const err = await s
      .registerFeature({ projectId: h!.projectId, slug: 'f1', title: 'x', proposalId: 'missing-proposal' })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ProposalNotFoundError)
    expect((err as ProposalNotFoundError).code).toBe('ERR_PROPOSAL_NOT_FOUND')
    expect(h!.wsDb.prepare(`SELECT COUNT(*) AS n FROM features`).get()).toEqual({ n: 0 })
  })

  it('proposalId 命中 → 谱系回填 FeatureRow.proposalId + summary 存储', async () => {
    const s = svc()
    h!.wsDb
      .prepare(`INSERT INTO proposals (id, slug, title, proposal_status, created_at, updated_at) VALUES (?, ?, ?, 'draft', ?, ?)`)
      .run('p1', 'demo-proposal', '提案一', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
    const row = await s.registerFeature({
      projectId: h!.projectId,
      slug: 'linked-feature',
      title: '链接特性',
      summary: '一句话',
      proposalId: 'p1',
    })
    expect(row.proposalId).toBe('p1')
    expect(row.summary).toBe('一句话')
  })
})

describe('AC1 transitionFeature：from≠to 同源校验 + reason 必带', () => {
  it('合法转移（prd → design）：状态落库 + updatedAt 推进', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-06T08:00:00.000Z'))
    const s = svc()
    const created = await s.registerFeature({ projectId: h!.projectId, slug: 'f', title: 'x' })
    vi.setSystemTime(new Date('2026-10-06T09:00:00.000Z'))
    const row = await s.transitionFeature({
      projectId: h!.projectId,
      featureId: created.featureId,
      toStatus: 'design',
      reason: '设计定稿',
    })
    expect(row.featureStatus).toBe('design')
    expect(row.updatedAt).toBe('2026-10-06T09:00:00.000Z')
    expect(row.createdAt).toBe(created.createdAt)
  })

  it('to === current → ERR_INVALID_TRANSITION（allowed = 六态 − 当前态，机械排除自身）', async () => {
    const s = svc()
    const created = await s.registerFeature({ projectId: h!.projectId, slug: 'f', title: 'x' })
    const err = await s
      .transitionFeature({ projectId: h!.projectId, featureId: created.featureId, toStatus: 'prd', reason: '原地' })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(SmallDomainInvalidTransitionError)
    const data = (err as SmallDomainInvalidTransitionError).data
    expect(data.current).toBe('prd')
    expect(data.to).toBe('prd')
    expect(data.allowed).toEqual(['design', 'tasks', 'in-progress', 'completed', 'archived'])
  })

  it('词汇外目标 → ERR_INVALID_TRANSITION（运行期越词汇值同路拒绝）', async () => {
    const s = svc()
    const created = await s.registerFeature({ projectId: h!.projectId, slug: 'f', title: 'x' })
    const err = await s
      .transitionFeature({
        projectId: h!.projectId,
        featureId: created.featureId,
        // @ts-expect-error 运行期越词汇注入（RPC 边界不设防面的服务端守卫断言）
        toStatus: 'bogus',
        reason: 'r',
      })
      .catch((e: unknown) => e)
    expect((err as SmallDomainInvalidTransitionError).code).toBe('ERR_INVALID_TRANSITION')
  })

  it('非终态 → archived 放开（弃案收纳）+ 空因拒绝 ERR_REASON_REQUIRED', async () => {
    const s = svc()
    const created = await s.registerFeature({ projectId: h!.projectId, slug: 'f', title: 'x' })
    const archived = await s.transitionFeature({
      projectId: h!.projectId,
      featureId: created.featureId,
      toStatus: 'archived',
      reason: '弃案',
    })
    expect(archived.featureStatus).toBe('archived')
    const other = await s.registerFeature({ projectId: h!.projectId, slug: 'g', title: 'y' })
    const err = await s
      .transitionFeature({ projectId: h!.projectId, featureId: other.featureId, toStatus: 'design', reason: '   ' })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ReasonRequiredError)
    expect((err as ReasonRequiredError).code).toBe('ERR_REASON_REQUIRED')
  })

  it('featureId 未命中 → ERR_FEATURE_NOT_FOUND（data 带 featureId）', async () => {
    const s = svc()
    const err = await s
      .transitionFeature({ projectId: h!.projectId, featureId: 'missing', toStatus: 'design', reason: 'r' })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(FeatureNotFoundError)
    expect((err as FeatureNotFoundError).code).toBe('ERR_FEATURE_NOT_FOUND')
    expect((err as FeatureNotFoundError).data.featureId).toBe('missing')
  })
})

describe('AC2 upsertFeatureDoc：登记即推进（单事务内聚相位推进，单调只进）', () => {
  it('doc 行登记 + 同 feature 无回退：prd 段文档不推相位，design 段推进 prd → design', async () => {
    const s = svc()
    const created = await s.registerFeature({ projectId: h!.projectId, slug: 'f', title: 'x' })
    const prdDoc = await s.upsertFeatureDoc({
      projectId: h!.projectId,
      featureSlug: 'f',
      docKind: 'prd-spec',
      relPath: 'docs/features/f/prd/prd-spec.md',
      summary: '规格',
    })
    expect(prdDoc).toMatchObject({
      featureId: created.featureId,
      docKind: 'prd-spec',
      relPath: 'docs/features/f/prd/prd-spec.md',
      summary: '规格',
    })
    expect(h!.wsDb.prepare<unknown[], { feature_status: string }>(`SELECT feature_status FROM features WHERE id = ?`).get(created.featureId)).toEqual({ feature_status: 'prd' })
    await s.upsertFeatureDoc({ projectId: h!.projectId, featureSlug: 'f', docKind: 'tech-design', relPath: 'docs/features/f/design/tech-design.md' })
    expect(h!.wsDb.prepare<unknown[], { feature_status: string }>(`SELECT feature_status FROM features WHERE id = ?`).get(created.featureId)).toEqual({ feature_status: 'design' })
  })

  it('单调只进：design 后补登记 prd-spec 不回退；同 kind 再 upsert 覆写 rel_path、summary 非破坏', async () => {
    const s = svc()
    await s.registerFeature({ projectId: h!.projectId, slug: 'f', title: 'x' })
    await s.upsertFeatureDoc({ projectId: h!.projectId, featureSlug: 'f', docKind: 'tech-design', relPath: 'a.md', summary: '首登' })
    // 后补低阶段文档不回退（§6-28 max 单调式）
    await s.upsertFeatureDoc({ projectId: h!.projectId, featureSlug: 'f', docKind: 'prd-spec', relPath: 'b.md' })
    expect(h!.wsDb.prepare<unknown[], { feature_status: string }>(`SELECT feature_status FROM features WHERE slug = 'f'`).get()).toEqual({ feature_status: 'design' })
    // 同 kind 再 upsert：rel_path 覆写为最新；summary 缺省不抹既有值（COALESCE 非破坏）
    const doc = await s.upsertFeatureDoc({ projectId: h!.projectId, featureSlug: 'f', docKind: 'tech-design', relPath: 'moved.md' })
    expect(doc.relPath).toBe('moved.md')
    expect(doc.summary).toBe('首登')
  })

  it('有任务时 taskDerived 覆盖 docPhase（追加文档不动 tasks 相位）；archived 豁免不推导', async () => {
    const s = svc()
    // 有 pending 任务 → 推导机 taskDerived = 'tasks'；doc 面登记不改相位
    const fid = seedFeature(h!.wsDb, { slug: 'with-tasks', status: 'tasks' })
    seedTask(h!.wsDb, fid, 'with-tasks', '1.1', 'pending')
    await s.upsertFeatureDoc({ projectId: h!.projectId, featureSlug: 'with-tasks', docKind: 'tech-design', relPath: 'd.md' })
    expect(h!.wsDb.prepare<unknown[], { feature_status: string }>(`SELECT feature_status FROM features WHERE id = ?`).get(fid)).toEqual({ feature_status: 'tasks' })
    // archived = 人类收纳决策，推导机永不覆盖
    const aid = seedFeature(h!.wsDb, { slug: 'archived-one', status: 'archived' })
    await s.upsertFeatureDoc({ projectId: h!.projectId, featureSlug: 'archived-one', docKind: 'prd-spec', relPath: 'e.md' })
    expect(h!.wsDb.prepare<unknown[], { feature_status: string }>(`SELECT feature_status FROM features WHERE id = ?`).get(aid)).toEqual({ feature_status: 'archived' })
  })

  it('slug→id 服务内解析未命中 → ERR_FEATURE_NOT_FOUND（data 带 featureSlug）', async () => {
    const s = svc()
    const err = await s
      .upsertFeatureDoc({ projectId: h!.projectId, featureSlug: 'ghost', docKind: 'prd-spec', relPath: 'x.md' })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(FeatureNotFoundError)
    expect((err as FeatureNotFoundError).data.featureSlug).toBe('ghost')
  })

  it('写时增量断言（漂移防护）：既有行相位漂移 → 事务整体回滚（doc 行零写入）', async () => {
    const s = svc()
    // 漂移预置：completed + pending 任务（taskDerived 应为 tasks——存储 ≠ 推导）
    const fid = seedFeature(h!.wsDb, { slug: 'drifted', status: 'completed' })
    seedTask(h!.wsDb, fid, 'drifted', '1.1', 'pending')
    const err = await s
      .upsertFeatureDoc({ projectId: h!.projectId, featureSlug: 'drifted', docKind: 'prd-spec', relPath: 'x.md' })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(PhaseInvariantViolationError)
    expect(h!.wsDb.prepare(`SELECT COUNT(*) AS n FROM feature_documents`).get()).toEqual({ n: 0 })
    expect(h!.wsDb.prepare<unknown[], { feature_status: string }>(`SELECT feature_status FROM features WHERE id = ?`).get(fid)).toEqual({ feature_status: 'completed' })
  })
})

describe('AC3 listFeatures：七态分布 / 文档统计 / 谱系 + search/sort', () => {
  it('byStatus 七态零填充分布 + docCount + proposalSlug 谱系水化', async () => {
    const s = svc()
    h!.wsDb
      .prepare(`INSERT INTO proposals (id, slug, title, proposal_status, created_at, updated_at) VALUES ('p1', 'src-proposal', '提案', 'draft', ?, ?)`)
      .run('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
    const fid = seedFeature(h!.wsDb, { slug: 'rich', proposalId: 'p1', status: 'tasks' })
    seedTask(h!.wsDb, fid, 'rich', '1.1', 'pending')
    seedTask(h!.wsDb, fid, 'rich', '1.2', 'pending')
    seedTask(h!.wsDb, fid, 'rich', '1.3', 'completed')
    seedFeature(h!.wsDb, { slug: 'bare' })
    await s.upsertFeatureDoc({ projectId: h!.projectId, featureSlug: 'rich', docKind: 'prd-spec', relPath: 'r.md' })
    await s.upsertFeatureDoc({ projectId: h!.projectId, featureSlug: 'rich', docKind: 'er-diagram', relPath: 'r2.md' })

    const cards = await s.listFeatures({ projectId: h!.projectId })
    const byslug = new Map(cards.map((c) => [c.slug, c]))
    const rich = byslug.get('rich') as FeatureCard
    expect(rich.byStatus).toEqual({
      pending: 2,
      in_progress: 0,
      completed: 1,
      blocked: 0,
      suspended: 0,
      skipped: 0,
      rejected: 0,
    })
    expect(rich.docCount).toBe(2)
    expect(rich.proposalSlug).toBe('src-proposal')
    const bare = byslug.get('bare') as FeatureCard
    expect(bare.docCount).toBe(0)
    expect(bare.proposalSlug).toBeUndefined()
    expect(bare.byStatus.pending).toBe(0)
  })

  it('search：slug / title / 状态中英标签匹配，大小写不敏感；空 search 全量', async () => {
    const s = svc()
    seedFeature(h!.wsDb, { slug: 'alpha', status: 'design' })
    seedFeature(h!.wsDb, { slug: 'beta' })
    expect((await s.listFeatures({ projectId: h!.projectId, search: 'alp' })).map((c) => c.slug)).toEqual(['alpha'])
    expect((await s.listFeatures({ projectId: h!.projectId, search: 'beta' })).map((c) => c.slug)).toEqual(['beta'])
    expect((await s.listFeatures({ projectId: h!.projectId, search: '设计阶段' })).map((c) => c.slug)).toEqual(['alpha'])
    expect((await s.listFeatures({ projectId: h!.projectId, search: 'design' })).map((c) => c.slug)).toEqual(['alpha'])
    expect((await s.listFeatures({ projectId: h!.projectId, search: 'DESIGN' })).map((c) => c.slug)).toEqual(['alpha'])
    expect(await s.listFeatures({ projectId: h!.projectId, search: 'zzz' })).toEqual([])
    expect((await s.listFeatures({ projectId: h!.projectId })).length).toBe(2)
  })

  it('sort：active（活跃优先，组内创建降序）/ created（最新创建在前）', async () => {
    const s = svc()
    seedFeature(h!.wsDb, { slug: 'old-active', createdAt: '2026-01-01T00:00:00.000Z' })
    seedFeature(h!.wsDb, { slug: 'new-active', createdAt: '2026-02-01T00:00:00.000Z' })
    seedFeature(h!.wsDb, { slug: 'old-done', status: 'completed', createdAt: '2026-01-02T00:00:00.000Z' })
    seedFeature(h!.wsDb, { slug: 'new-done', status: 'archived', createdAt: '2026-03-01T00:00:00.000Z' })
    expect((await s.listFeatures({ projectId: h!.projectId, sort: 'active' })).map((c) => c.slug)).toEqual([
      'new-active',
      'old-active',
      'new-done',
      'old-done',
    ])
    expect((await s.listFeatures({ projectId: h!.projectId, sort: 'created' })).map((c) => c.slug)).toEqual([
      'new-done',
      'new-active',
      'old-done',
      'old-active',
    ])
  })
})

describe('fix-2 listFeatureDocs：feature_documents 列举读面（文档行数据源）', () => {
  it('全行返回（FeatureDocumentRow 全字段）+ 确定性序（feature_id × doc_kind）；空库 = []', async () => {
    const s = svc()
    seedFeature(h!.wsDb, { slug: 'feat-a' })
    seedFeature(h!.wsDb, { slug: 'feat-b' })
    await s.upsertFeatureDoc({
      projectId: h!.projectId,
      featureSlug: 'feat-b',
      docKind: 'tech-design',
      relPath: 'docs/features/feat-b/design/tech-design.md',
      summary: '设计摘要',
    })
    await s.upsertFeatureDoc({
      projectId: h!.projectId,
      featureSlug: 'feat-b',
      docKind: 'prd-spec',
      relPath: 'docs/features/feat-b/prd/prd-spec.md',
    })
    const fidB = (h!.wsDb.prepare<unknown[], { id: string }>(`SELECT id FROM features WHERE slug = 'feat-b'`).get() as { id: string }).id
    const docs = await s.listFeatureDocs({ projectId: h!.projectId })
    // 确定性序：feature_id × doc_kind 字典序（feat-a 无行 → feat-b 两行 prd-spec 在前）
    expect(docs.map((d) => [d.featureId, d.docKind])).toEqual([
      [fidB, 'prd-spec'],
      [fidB, 'tech-design'],
    ])
    expect(docs[1]).toMatchObject({
      featureId: fidB,
      docKind: 'tech-design',
      relPath: 'docs/features/feat-b/design/tech-design.md',
      summary: '设计摘要',
    })
    expect(docs[0]?.summary).toBeUndefined()
    // 纯读面：与 listFeatures docCount 同源对账（feat-a 无行、feat-b 2 行）
    const cards = await s.listFeatures({ projectId: h!.projectId })
    const byslug = new Map(cards.map((c) => [c.slug, c.docCount]))
    expect(byslug.get('feat-a')).toBe(0)
    expect(byslug.get('feat-b')).toBe(2)
  })

  it('纯读零事件（emitTasksChanged 不发射）', async () => {
    const s = svc()
    seedFeature(h!.wsDb, { slug: 'dang' })
    await s.upsertFeatureDoc({
      projectId: h!.projectId,
      featureSlug: 'dang',
      docKind: 'ui-functions',
      relPath: 'docs/features/dang/ui/ui-functions.md',
    })
    h!.events.emitted.length = 0
    const docs = await s.listFeatureDocs({ projectId: h!.projectId })
    expect(docs).toHaveLength(1)
    expect(h!.events.emitted).toEqual([])
  })
})

describe('AC6 features 写动词 emitTasksChanged 接线（事务提交后单发）', () => {
  it('registerFeature / transitionFeature / upsertFeatureDoc 各发 {projectId} 恰一次', async () => {
    const s = svc()
    const created = await s.registerFeature({ projectId: h!.projectId, slug: 'f', title: 'x' })
    await s.transitionFeature({ projectId: h!.projectId, featureId: created.featureId, toStatus: 'design', reason: 'r' })
    await s.upsertFeatureDoc({ projectId: h!.projectId, featureSlug: 'f', docKind: 'prd-spec', relPath: 'p.md' })
    expect(h!.events.emitted).toEqual([
      { projectId: h!.projectId },
      { projectId: h!.projectId },
      { projectId: h!.projectId },
    ])
  })

  it('拒绝面不发射（UNIQUE 冲突零事件）', async () => {
    const s = svc()
    await s.registerFeature({ projectId: h!.projectId, slug: 'dup', title: 'x' })
    h!.events.emitted.length = 0
    await s.registerFeature({ projectId: h!.projectId, slug: 'dup', title: 'y' }).catch(() => undefined)
    expect(h!.events.emitted).toEqual([])
  })
})
