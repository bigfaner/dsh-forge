// feature 子 tab 升级单测 —— 4.6 UF-4（AC2/AC6）：阶段 chips 插入点（列表之上）+
// 父行行头（远征 mode chip 只读 + 阶段 tag + 打开新会话→固定远征）+ 展开元数据
// （MetaGrid 两列网格 + DocGroupList 分层文档）+ 预填请求组装（固定远征 + 真实路径
// 清单 + 不自动发送）+ 阶段并集过滤与零命中空态。MetaGrid/DocGroupList 本体已归 4.3
// 组件测试——本文件只断言接线位置。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FeatureCard, FeatureDocumentRow, FeatureStatus, ProposalCard, ProposalStatus, TaskStatus } from '@dsh-forge/contracts'
import { FeaturesTab, featurePrefillDocs, featurePrefillRequest, featureTaskTotal } from './feature-tab.js'

const NOW = Date.parse('2026-10-06T12:00:00.000Z')
const CREATED = '2026-10-01T08:00:00.000Z'

function feature(slug: string, byStatus: Partial<Record<TaskStatus, number>> = {}, status: FeatureStatus = 'in-progress'): FeatureCard {
  return {
    featureId: `fid-${slug}`,
    slug,
    title: `特性 ${slug}`,
    featureStatus: status,
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
    docCount: 2,
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

const DOCS: readonly FeatureDocumentRow[] = [
  { featureId: 'fid-m2-pipeline', docKind: 'prd-spec', relPath: 'docs/features/m2-pipeline/prd/prd-spec.md', createdAt: CREATED, updatedAt: CREATED },
  { featureId: 'fid-m2-pipeline', docKind: 'tech-design', relPath: 'docs/features/m2-pipeline/design/tech-design.md', createdAt: CREATED, updatedAt: CREATED },
]

const COUNTS: Record<FeatureStatus, number> = { 'in-progress': 2, prd: 0, design: 0, tasks: 0, completed: 0, archived: 0 }

const base = {
  features: FEATURES,
  counts: COUNTS,
  activePhases: new Set<FeatureStatus>(),
  onTogglePhase: () => {},
  onClearPhases: () => {},
  proposals: PROPOSALS,
  docs: DOCS,
  openRows: new Set<string>(),
  onToggleRow: () => {},
  onOpenDoc: () => {},
  now: NOW,
}

describe('FeaturesTab · 阶段 chips 插入点与父行行头（AC2/AC6）', () => {
  it('阶段 chips 行在列表之上（DOM 序）+ 六态计数 + 0 计数 disabled', () => {
    const markup = renderToStaticMarkup(<FeaturesTab {...base} />)
    const chipsAt = markup.indexOf('data-dswf-ov-phchips=""')
    const listAt = markup.indexOf('data-dswf-ov-features=""')
    expect(chipsAt).toBeGreaterThan(-1)
    expect(listAt).toBeGreaterThan(chipsAt)
    expect(markup).toContain('data-dswf-ov-phchip="in-progress"')
    const at = markup.indexOf('data-dswf-ov-phchip="completed"')
    expect(markup.slice(markup.lastIndexOf('<button', at), markup.indexOf('</button>', at))).toContain('disabled')
  })

  it('父行行头：toggle 命中面 + 远征 mode chip 只读 + 阶段 tag（done/total）+ 打开新会话', () => {
    const markup = renderToStaticMarkup(<FeaturesTab {...base} onStartSession={() => {}} />)
    expect(markup).toContain('data-dswf-ov-parent-toggle="feat:m2-pipeline"')
    expect(markup).toContain('data-dswf-mode-chip="expedition"') // 固定远征只读（无 onOpenChangeMode → disabled 只读呈现）
    expect(markup).toContain('进行中 3/5')
    expect(markup).toContain('data-dswf-ov-opensession="m2-pipeline"')
    expect(markup).toContain('打开新会话')
  })

  it('打开新会话入口缺席 = 按钮不呈现（SSR/非壳载体面）', () => {
    const markup = renderToStaticMarkup(<FeaturesTab {...base} />)
    expect(markup).not.toContain('data-dswf-ov-opensession')
  })

  it('展开 = MetaGrid（两列网格：标识|阶段 / 模式|谱系）+ DocGroupList（分组标题 + 真实路径行）', () => {
    const markup = renderToStaticMarkup(<FeaturesTab {...base} openRows={new Set(['feat:m2-pipeline'])} />)
    expect(markup).toContain('data-dswf-ov-fmeta="m2-pipeline"')
    expect(markup).toContain('dswf-ov-fmeta-grid')
    expect(markup).toContain('成链自 m2-pipeline（已接受）') // MetaGrid 谱系（4.3）
    expect(markup).toContain('data-dswf-ov-dgroups="m2-pipeline"') // DocGroupList（4.3）
    expect(markup).toContain('文档（2 篇）')
    expect(markup).toContain('需求文档（1）')
    expect(markup).toContain('📄 prd/prd-spec.md') // 真实路径（v17 ㉙）
    expect(markup).toContain('data-dswf-ov-doc="docs/features/m2-pipeline/design/tech-design.md"')
  })

  it('阶段并集过滤：激活 in-progress → 该阶段行；零命中 = 空态', () => {
    const markup = renderToStaticMarkup(
      <FeaturesTab {...base} features={[feature('done-x', {}, 'completed')]} counts={{ ...COUNTS, 'in-progress': 0, completed: 1 }} activePhases={new Set<FeatureStatus>(['in-progress'])} />,
    )
    expect(markup).toContain('无匹配当前阶段过滤的 feature')
    expect(markup).toContain('✕ 清过滤')
  })

  it('零 feature = 一等空态', () => {
    const markup = renderToStaticMarkup(
      <FeaturesTab {...base} features={[]} counts={{ 'in-progress': 0, prd: 0, design: 0, tasks: 0, completed: 0, archived: 0 }} />,
    )
    expect(markup).toContain('暂无 feature')
  })
})

describe('预填请求组装（AC2——固定远征 + 不自动发送）', () => {
  it('mode 恒 expedition + formatPrefill（@path features/ → 名称 → 摘要 → 阶段 → 文档真实路径清单）', () => {
    const request = featurePrefillRequest(M2_FEATURE, DOCS)
    expect(request.mode).toBe('expedition')
    expect(request.autosend).toBeUndefined()
    expect(request.prefill).toContain('@docs/features/m2-pipeline/')
    expect(request.prefill).toContain('名称：特性 m2-pipeline')
    expect(request.prefill).toContain('摘要：管线接管状态层')
    expect(request.prefill).toContain('阶段：进行中')
    expect(request.prefill).toContain('· prd/prd-spec.md')
    expect(request.prefill.endsWith('我的意图：')).toBe(true)
  })

  it('featurePrefillDocs：featureId 归属过滤 + 前缀裁剪', () => {
    const other: FeatureDocumentRow = { featureId: 'fid-other', docKind: 'prd-spec', relPath: 'docs/features/other/prd/x.md', createdAt: CREATED, updatedAt: CREATED }
    const docs = featurePrefillDocs(M2_FEATURE, [...DOCS, other])
    expect(docs.map((doc) => doc.path)).toEqual(['prd/prd-spec.md', 'design/tech-design.md'])
  })
})

describe('featureTaskTotal（M2 沿袭）', () => {
  it('七态求和', () => {
    expect(featureTaskTotal(M2_FEATURE.byStatus)).toBe(5)
  })
})
