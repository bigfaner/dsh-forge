// FeaturesTab 单测 —— AC4 feature 子 tab：父行 ▸ 展开元数据（摘要/来源提案/任务七态/
// 文档统计/创建更新）+ 文档行（名称 + docKind 标签紧贴 + › 行尾；feature 不含提案文档）
// + 多开并存 + 点击回调。文档行 = 契约类型 props 注入面（Interface 2 读面无列举 API——
// 3.5 帧不喂；接口在场供装配注入）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FeatureCard, FeatureDocumentRow, ProposalCard, ProposalStatus, TaskStatus } from '@dsh-forge/contracts'
import { FeaturesTab, featureSourceProposal, featureStatusSpread, featureTaskTotal } from './feature-tab.js'

const NOW = Date.parse('2026-10-06T12:00:00.000Z')
const CREATED = '2026-10-01T08:00:00.000Z'

function feature(slug: string, byStatus: Partial<Record<TaskStatus, number>> = {}): FeatureCard {
  return {
    featureId: `fid-${slug}`,
    slug,
    title: `特性 ${slug}`,
    featureStatus: 'in-progress',
    summary: '管线接管状态层',
    createdAt: CREATED,
    updatedAt: '2026-10-05T08:00:00.000Z',
    byStatus: {
      pending: byStatus.pending ?? 0,
      in_progress: byStatus.in_progress ?? 0,
      completed: byStatus.completed ?? 0,
      blocked: byStatus.blocked ?? 0,
      suspended: 0,
      skipped: 0,
      rejected: 0,
    } as Record<TaskStatus, number>,
    docCount: 4,
    proposalSlug: 'm2-pipeline',
  }
}

function proposalCard(slug: string, status: ProposalStatus = 'accepted'): ProposalCard {
  return {
    proposalId: `pr-${slug}`,
    slug,
    title: `提案 ${slug}`,
    proposalStatus: status,
    relPath: `docs/proposals/${slug}/proposal.md`,
    taskCount: 0,
    createdAt: CREATED,
    updatedAt: CREATED,
  }
}

const M2_FEATURE = feature('m2-pipeline', { pending: 2, completed: 3 })
const BRAND_FEATURE = feature('brand-refresh', { blocked: 1 })
const FEATURES = [M2_FEATURE, BRAND_FEATURE]
const PROPOSALS = [proposalCard('m2-pipeline')]

const base = {
  features: FEATURES,
  proposals: PROPOSALS,
  onToggleRow: () => {},
  onOpenDoc: () => {},
  now: NOW,
}

describe('FeaturesTab 父行（AC4）', () => {
  it('父行呈现 slug + 状态标签（状态 + 完成/总数）；默认折叠', () => {
    const markup = renderToStaticMarkup(<FeaturesTab {...base} openRows={new Set()} />)
    expect(markup).toContain('data-dswf-ov-features')
    expect(markup).toContain('m2-pipeline')
    expect(markup).toContain('进行中 3/5')
    expect(markup).not.toContain('dswf-ov-meta')
    expect(markup).toContain('▸')
  })

  it('展开元数据：摘要/来源提案/任务七态/文档统计/创建更新（多开并存）', () => {
    const markup = renderToStaticMarkup(
      <FeaturesTab {...base} openRows={new Set(['feat:m2-pipeline', 'feat:brand-refresh'])} />,
    )
    expect(markup).toContain('data-dswf-ov-meta="feat:m2-pipeline"')
    expect(markup).toContain('data-dswf-ov-meta="feat:brand-refresh"')
    expect(markup).toContain('管线接管状态层') // 摘要
    expect(markup).toContain('来源提案')
    expect(markup).toContain('提案 m2-pipeline（已接受）')
    expect(markup).toContain('3/5 完成 · 待处理 2 · 已完成 3') // 任务七态分布（中文标签）
    expect(markup).toContain('4 篇') // 文档统计
    expect(markup).toContain('创建/更新')
  })

  it('空列表 = 空态；搜索态空标题注入', () => {
    const empty = renderToStaticMarkup(<FeaturesTab {...base} features={[]} openRows={new Set()} />)
    expect(empty).toContain('暂无 feature')
    const noMatch = renderToStaticMarkup(
      <FeaturesTab {...base} features={[]} openRows={new Set()} emptyTitle="无匹配「管线」的 feature" />,
    )
    expect(noMatch).toContain('无匹配「管线」的 feature')
  })
})

describe('FeaturesTab 文档行（AC4——不含提案文档）', () => {
  const PRD_DOC: FeatureDocumentRow = {
    featureId: 'fid-m2-pipeline',
    docKind: 'prd-spec',
    relPath: 'docs/features/m2-pipeline/prd-spec.md',
    summary: 'PRD',
    createdAt: CREATED,
    updatedAt: CREATED,
  }
  const DESIGN_DOC: FeatureDocumentRow = {
    featureId: 'fid-m2-pipeline',
    docKind: 'tech-design',
    relPath: 'docs/features/m2-pipeline/tech-design.md',
    createdAt: CREATED,
    updatedAt: CREATED,
  }
  const DOCS: readonly FeatureDocumentRow[] = [PRD_DOC, DESIGN_DOC]

  it('docs 注入 = 文档行呈现（名称 + docKind 标签紧贴 + › 行尾 + relPath 数据锚）', () => {
    const markup = renderToStaticMarkup(<FeaturesTab {...base} docs={DOCS} openRows={new Set()} />)
    expect(markup).toContain('data-dswf-ov-doc="docs/features/m2-pipeline/prd-spec.md"')
    expect(markup).toContain('prd-spec.md')
    expect(markup).toContain('tech-design')
    expect(markup).toContain('›')
  })

  it('docs 按 featureId 归属分组（他 feature 文档不串行）', () => {
    const foreign: FeatureDocumentRow = {
      featureId: 'fid-brand-refresh',
      docKind: 'prd-spec',
      relPath: 'docs/features/brand-refresh/prd-spec.md',
      createdAt: CREATED,
      updatedAt: CREATED,
    }
    const markup = renderToStaticMarkup(<FeaturesTab {...base} docs={[PRD_DOC, foreign]} openRows={new Set()} />)
    const m2 = markup.slice(markup.indexOf('data-dswf-ov-parent="feat:m2-pipeline"'), markup.indexOf('data-dswf-ov-parent="feat:brand-refresh"'))
    expect(m2).toContain('docs/features/m2-pipeline/prd-spec.md')
    expect(m2).not.toContain('docs/features/brand-refresh/prd-spec.md')
    const brand = markup.slice(markup.indexOf('data-dswf-ov-parent="feat:brand-refresh"'))
    expect(brand).toContain('docs/features/brand-refresh/prd-spec.md')
  })

  it('feature 不含提案文档：docs 集内提案文档（proposals 表来源）天然缺席——文档行仅 feature_documents', () => {
    // feature_documents 行集内不存在 docs/proposals/*（发现面建行归属互斥）——
    // 断言注入面渲染的文档行全部为 feature 文档路径前缀
    const markup = renderToStaticMarkup(<FeaturesTab {...base} docs={DOCS} openRows={new Set()} />)
    expect(markup).not.toContain('data-dswf-ov-doc="docs/proposals/')
  })

  it('docs 缺席（装载失败降级/旧列缓存形态）= 零文档行，展开元数据呈现文档统计', () => {
    const markup = renderToStaticMarkup(
      <FeaturesTab {...base} openRows={new Set(['feat:m2-pipeline'])} />,
    )
    expect(markup).not.toContain('data-dswf-ov-doc=')
    expect(markup).toContain('文档')
    expect(markup).toContain('4 篇')
  })

  it('仓内只读脚注在场（docs/features/）', () => {
    const markup = renderToStaticMarkup(<FeaturesTab {...base} openRows={new Set()} />)
    expect(markup).toContain('docs/features/ · 仓内只读')
  })
})

describe('元数据纯函数', () => {
  it('featureTaskTotal：七态求和', () => {
    expect(featureTaskTotal(M2_FEATURE.byStatus)).toBe(5)
    expect(featureTaskTotal(BRAND_FEATURE.byStatus)).toBe(1)
  })

  it('featureStatusSpread：非零态「中文标签 N」连接；全零 = 暂无任务', () => {
    expect(featureStatusSpread(M2_FEATURE)).toBe('待处理 2 · 已完成 3')
    expect(featureStatusSpread(BRAND_FEATURE)).toBe('已阻塞 1')
    expect(featureStatusSpread(feature('empty'))).toBe('暂无任务')
  })

  it('featureSourceProposal：proposalSlug 反查（title + 状态）；无来源 = —', () => {
    expect(featureSourceProposal(M2_FEATURE, PROPOSALS)).toBe('提案 m2-pipeline（已接受）')
    expect(featureSourceProposal({ ...feature('orphan'), proposalSlug: undefined }, PROPOSALS)).toBe('—')
    expect(featureSourceProposal({ ...feature('ghost'), proposalSlug: 'ghost' }, PROPOSALS)).toBe('ghost')
  })
})
