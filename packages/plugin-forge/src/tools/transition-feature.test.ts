// transitionFeature tool 单测（提案 implicit-stage-approval §2.3）：reason 双前缀 parse
// 强制 + tool 层相位守卫两支（有任务 ≡ deriveTaskPhase / 无任务单调前推或 archived）+
// slug→id 服务内解析透传 + 同步 span 锚定（TOCTOU 关闭条件——宏任务穿插即红）+
// typed 失败 DTO（ERR_FEATURE_NOT_FOUND / ERR_INVALID_TRANSITION）。
import { describe, expect, it } from 'vitest'
import {
  TASK_STATUSES,
  type DocKind,
  type FeatureCard,
  type FeatureDocumentRow,
  type FeatureRow,
  type ListFeaturesQuery,
  type TaskStatus,
  type TransitionFeatureInput,
} from '@dsh-forge/contracts'
import type { ToolExecFace } from '../faces.js'
import {
  createTransitionFeatureTool,
  deriveGuardVerdict,
  DOC_KIND_PHASE,
  parseTransitionFeatureArgs,
} from './transition-feature.js'
import type { ForgeFeaturesToolFace, ForgeToolDeps } from './index.js'

const EXEC: ToolExecFace = { agent: { session: { id: 'sess-1', header: { cwd: 'C:\\ws\\demo' } } } }

function card(partial: Partial<FeatureCard> & { slug: string; featureId: string }): FeatureCard {
  return {
    title: partial.slug,
    featureStatus: 'prd',
    byStatus: Object.fromEntries(TASK_STATUSES.map((s) => [s, 0])),
    docCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  } as FeatureCard
}

interface Harness {
  deps: ForgeToolDeps
  transitioned: TransitionFeatureInput[]
  /** 宏任务穿插哨兵（listFeatures 调用后 setTimeout 置位——transitionFeature 内为 false 才算同 span） */
  setMacrotaskFlag: () => void
}

function harness(fields: {
  featureStatus?: FeatureCard['featureStatus']
  byStatus?: Partial<FeatureCard['byStatus']>
  docKinds?: FeatureDocumentRow['docKind'][]
  slug?: string
  withFeaturesFace?: boolean
}): Harness {
  const transitioned: TransitionFeatureInput[] = []
  let macrotaskRan = false
  const slug = fields.slug ?? 'my-feat'
  const features = {
    listFeatures: async (_q: ListFeaturesQuery) => {
      setTimeout(() => {
        macrotaskRan = true
      }, 0)
      return [
        card({
          slug,
          featureId: 'f-1',
          featureStatus: fields.featureStatus ?? 'prd',
          byStatus: { ...card({ slug, featureId: 'f-1' }).byStatus, ...fields.byStatus },
        }),
      ]
    },
    listFeatureDocs: async () =>
      (fields.docKinds ?? []).map((docKind, i) => ({
        featureId: 'f-1',
        docKind,
        relPath: `docs/${i}.md`,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })),
    transitionFeature: async (input: TransitionFeatureInput) => {
      if (macrotaskRan) throw new Error('TOCTOU window open: macrotask interleaved between snapshot and write')
      transitioned.push(input)
      return {
        featureId: input.featureId,
        slug,
        title: slug,
        featureStatus: input.toStatus,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      } satisfies FeatureRow
    },
  } as unknown as ForgeFeaturesToolFace
  const deps: ForgeToolDeps = {
    tasks: {} as ForgeToolDeps['tasks'],
    proposals: {} as ForgeToolDeps['proposals'],
    bugs: {} as ForgeToolDeps['bugs'],
    checkpoints: {} as ForgeToolDeps['checkpoints'],
    resolveProjectId: (cwd: string) => (cwd.toLowerCase().includes('demo') ? 'p-1' : undefined),
    ...(fields.withFeaturesFace === false ? {} : { features }),
  }
  return { deps, transitioned, setMacrotaskFlag: () => void (macrotaskRan = true) }
}

const ARGS = { slug: 'my-feat', to_status: 'design', reason: '显式指令：进下一段' }

describe('parseTransitionFeatureArgs（reason 双前缀机械强制）', () => {
  it('合规：隐式赞同：/显式指令：全角冒号前缀', () => {
    expect(parseTransitionFeatureArgs({ slug: 'a', to_status: 'prd', reason: '隐式赞同：用户让拆任务' })).toEqual({
      slug: 'a',
      to_status: 'prd',
      reason: '隐式赞同：用户让拆任务',
    })
    expect(parseTransitionFeatureArgs({ slug: 'a', to_status: 'archived', reason: '显式指令：归档' })).toMatchObject({
      reason: '显式指令：归档',
    })
  })
  it('reason 缺席/空 → 拒', () => {
    expect(() => parseTransitionFeatureArgs({ slug: 'a', to_status: 'prd' })).toThrow(/reason/)
    expect(() => parseTransitionFeatureArgs({ slug: 'a', to_status: 'prd', reason: '' })).toThrow(/reason/)
  })
  it('非双前缀（无前缀/半角冒号/未知标签）→ 拒', () => {
    expect(() => parseTransitionFeatureArgs({ slug: 'a', to_status: 'prd', reason: '推进到 in-progress' })).toThrow(
      /隐式赞同|显式指令/,
    )
    expect(() => parseTransitionFeatureArgs({ slug: 'a', to_status: 'prd', reason: '隐式赞同:半角冒号' })).toThrow(
      /隐式赞同|显式指令/,
    )
    expect(() => parseTransitionFeatureArgs({ slug: 'a', to_status: 'prd', reason: '用户要求：推进' })).toThrow(
      /隐式赞同|显式指令/,
    )
  })
  it('slug 必填；to_status 词表收窄（FEATURE_STATUSES）', () => {
    expect(() => parseTransitionFeatureArgs({ to_status: 'prd', reason: '隐式赞同：x' })).toThrow(/slug/)
    expect(() => parseTransitionFeatureArgs({ slug: 'a', to_status: 'done', reason: '隐式赞同：x' })).toThrow(
      /to_status must be one of/,
    )
  })
})

describe('deriveGuardVerdict（tool 层相位守卫两支）', () => {
  const snap = (p: {
    featureStatus: FeatureCard['featureStatus']
    taskStatuses?: TaskStatus[]
    docKinds?: DocKind[]
  }) => ({ featureId: 'f-1', slug: 'my-feat', taskStatuses: p.taskStatuses ?? [], docKinds: p.docKinds ?? [], ...p })
  it('有任务：toStatus ≡ deriveTaskPhase 放行，其余拒（V-1a 复检）', () => {
    const pending = snap({ featureStatus: 'prd', taskStatuses: ['pending'] })
    expect(deriveGuardVerdict(pending, 'tasks').allowed).toBe(true)
    expect(deriveGuardVerdict(pending, 'in-progress').allowed).toBe(false)
    expect(deriveGuardVerdict(pending, 'completed').allowed).toBe(false)
    expect(deriveGuardVerdict(pending, 'archived').allowed).toBe(false)
    const active = snap({ featureStatus: 'tasks', taskStatuses: ['completed', 'in_progress'] })
    expect(deriveGuardVerdict(active, 'in-progress').allowed).toBe(true)
    expect(deriveGuardVerdict(active, 'tasks').allowed).toBe(false)
    const done = snap({ featureStatus: 'in-progress', taskStatuses: ['completed', 'skipped'] })
    expect(deriveGuardVerdict(done, 'completed').allowed).toBe(true)
    expect(deriveGuardVerdict(done, 'in-progress').allowed).toBe(false)
  })
  it('无任务：仅 archived 或 order(to) ≥ max(order(cur), docPhaseMax)（V-1c 复检）', () => {
    const prdWithDesign = snap({ featureStatus: 'prd', docKinds: ['tech-design'] })
    expect(deriveGuardVerdict(prdWithDesign, 'design').allowed).toBe(true)
    expect(deriveGuardVerdict(prdWithDesign, 'archived').allowed).toBe(true)
    expect(deriveGuardVerdict(prdWithDesign, 'prd').allowed).toBe(false)
    // 回拨边：design 文档在场 → 不得落后 docPhaseMax
    expect(deriveGuardVerdict(snap({ featureStatus: 'design', docKinds: ['tech-design'] }), 'prd').allowed).toBe(false)
    // 无文档：线性序单调前推
    const bare = snap({ featureStatus: 'tasks' })
    expect(deriveGuardVerdict(bare, 'in-progress').allowed).toBe(true)
    expect(deriveGuardVerdict(bare, 'design').allowed).toBe(false)
    expect(deriveGuardVerdict(bare, 'archived').allowed).toBe(true)
  })
})

describe('DOC_KIND_PHASE 镜像漂移锚（core phase-deriver DOC_KIND_PHASE 全键 pin）', () => {
  it('键集 = 七 DocKind 全表（加 DocKind 时类型不闭合先红 + 此处键集断言即红）', () => {
    expect(Object.keys(DOC_KIND_PHASE).sort()).toEqual([
      'er-diagram',
      'page-map',
      'prd-spec',
      'sql-schema',
      'tech-design',
      'ui-functions',
      'user-stories',
    ])
    expect(Object.values(DOC_KIND_PHASE).every((v) => v === 'prd' || v === 'design')).toBe(true)
  })
})

describe('transitionFeature execute', () => {
  it('成功：slug→featureId 服务内解析 + reason 透传（转移落 feature_records 由 core 伴随）', async () => {
    const h = harness({ featureStatus: 'prd' })
    const tool = createTransitionFeatureTool(h.deps)
    const out = (await tool.execute(ARGS, EXEC)) as FeatureRow
    expect(out).toMatchObject({ featureId: 'f-1', featureStatus: 'design' })
    expect(h.transitioned).toEqual([{ projectId: 'p-1', featureId: 'f-1', toStatus: 'design', reason: '显式指令：进下一段' }])
  })
  it('有任务 feature：toStatus ≠ deriveTaskPhase → 失败 DTO ERR_INVALID_TRANSITION，零 core 调用', async () => {
    const h = harness({ featureStatus: 'prd', byStatus: { pending: 2 } })
    const tool = createTransitionFeatureTool(h.deps)
    const out = await tool.execute({ ...ARGS, to_status: 'in-progress' }, EXEC)
    expect(out).toMatchObject({ ok: false, code: 'ERR_INVALID_TRANSITION' })
    expect(h.transitioned).toEqual([])
  })
  it('无任务 feature：落后 docPhaseMax 的落点 → 失败 DTO ERR_INVALID_TRANSITION', async () => {
    const h = harness({ featureStatus: 'design', docKinds: ['tech-design'] })
    const tool = createTransitionFeatureTool(h.deps)
    const out = await tool.execute({ ...ARGS, to_status: 'prd' }, EXEC)
    expect(out).toMatchObject({ ok: false, code: 'ERR_INVALID_TRANSITION' })
    expect(h.transitioned).toEqual([])
  })
  it('slug 未命中 → 失败 DTO ERR_FEATURE_NOT_FOUND（upsertFeatureDoc 先例同法）', async () => {
    const h = harness({ slug: 'other-feat' })
    const tool = createTransitionFeatureTool(h.deps)
    const out = await tool.execute(ARGS, EXEC)
    expect(out).toMatchObject({ ok: false, code: 'ERR_FEATURE_NOT_FOUND' })
    expect(h.transitioned).toEqual([])
  })
  it('TOCTOU 关闭条件：快照读取→守卫→core 调用同一同步 span（宏任务穿插即红）', async () => {
    const h = harness({ featureStatus: 'prd' })
    const tool = createTransitionFeatureTool(h.deps)
    await tool.execute(ARGS, EXEC)
    expect(h.transitioned).toHaveLength(1) // 哨兵未触发 = 全程无宏任务穿插
  })
  it('TOCTOU 哨兵负向对照：手动 setMacrotaskFlag 置位后 execute → 宏任务穿插即拒（证明哨兵能红）', async () => {
    const h = harness({ featureStatus: 'prd' })
    h.setMacrotaskFlag()
    const tool = createTransitionFeatureTool(h.deps)
    await expect(tool.execute(ARGS, EXEC)).rejects.toThrow(/TOCTOU window open/)
    expect(h.transitioned).toEqual([])
  })
  it('features 服务缺席 → fail-loud 拒绝（降级不静默代转）', async () => {
    const h = harness({ withFeaturesFace: false })
    const tool = createTransitionFeatureTool(h.deps)
    await expect(tool.execute(ARGS, EXEC)).rejects.toThrow(/forgeFeatures/)
  })
  it('cwd 未命中 → 失败 DTO ERR_WORKSPACE_NOT_REGISTERED', async () => {
    const h = harness({})
    const tool = createTransitionFeatureTool(h.deps)
    const out = await tool.execute(ARGS, { agent: { session: { id: 's', header: { cwd: 'C:\\ws\\x' } } } })
    expect(out).toMatchObject({ ok: false, code: 'ERR_WORKSPACE_NOT_REGISTERED' })
  })
  it('输出渲染（formatOk）：✓ 转移行 + 身份键值行', () => {
    const h = harness({})
    const tool = createTransitionFeatureTool(h.deps)
    const text = tool.output.render({}, { featureId: 'f-1', slug: 'my-feat', title: 't', featureStatus: 'design', createdAt: 'c', updatedAt: 'u' })[0]?.text ?? ''
    expect(text).toContain('✓ Feature my-feat → design')
    expect(text).toContain('- featureId: f-1')
  })
})
