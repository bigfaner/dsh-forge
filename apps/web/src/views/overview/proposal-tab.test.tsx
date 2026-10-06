// ProposalsTab 单测 —— AC4 提案子 tab：父行 ▸ 展开元数据（slug/作者/创建/裁决/谱系）
// + proposal.md 文档行（名称 + 状态标签紧贴 + › 行尾）+ 多开并存 + 点击回调。
// 摘要行缺席 = contracts ProposalRow 无 summary 字段（Interface 3 数据形状权威——文档 tab 承载）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FeatureCard, ProposalCard, ProposalStatus, TaskStatus } from '@dsh-forge/contracts'
import { ProposalsTab, proposalLineage, proposalVerdict } from './proposal-tab.js'

const NOW = Date.parse('2026-10-06T12:00:00.000Z')
const CREATED = '2026-10-01T08:00:00.000Z'

function proposal(id: string, slug: string, status: ProposalStatus, decidedAt?: string): ProposalCard {
  return {
    proposalId: id,
    slug,
    title: `提案 ${slug}`,
    proposalStatus: status,
    relPath: `docs/proposals/${slug}/proposal.md`,
    author: 'faner',
    decidedAt,
    createdAt: CREATED,
    updatedAt: CREATED,
  }
}

function feature(slug: string, proposalSlug?: string): FeatureCard {
  return {
    featureId: `fid-${slug}`,
    slug,
    title: slug,
    featureStatus: 'in-progress',
    createdAt: CREATED,
    updatedAt: CREATED,
    byStatus: { pending: 1, in_progress: 0, completed: 0, blocked: 0, suspended: 0, skipped: 0, rejected: 0 } as Record<TaskStatus, number>,
    docCount: 2,
    proposalSlug,
  }
}

const PROPOSALS = [
  proposal('pr-1', 'm2-pipeline', 'under-review'),
  proposal('pr-2', 'legacy-import', 'accepted', '2026-10-03T08:00:00.000Z'),
]
const FEATURES = [feature('m2-pipeline', 'm2-pipeline')]

const base = {
  proposals: PROPOSALS,
  features: FEATURES,
  onToggleRow: () => {},
  onOpenDoc: () => {},
  now: NOW,
}

describe('ProposalsTab 父行（AC4）', () => {
  it('父行呈现标题 + 状态标签；默认折叠（元数据块缺席）', () => {
    const markup = renderToStaticMarkup(<ProposalsTab {...base} openRows={new Set()} />)
    expect(markup).toContain('data-dswf-ov-proposals')
    expect(markup).toContain('提案 m2-pipeline')
    expect(markup).toContain('评审中')
    expect(markup).toContain('已接受')
    expect(markup).not.toContain('dswf-ov-meta')
    expect(markup).toContain('▸')
  })

  it('展开元数据：slug/作者/创建/裁决/谱系（多开并存——两行同时展开）', () => {
    const markup = renderToStaticMarkup(
      <ProposalsTab {...base} openRows={new Set(['prop:pr-1', 'prop:pr-2'])} />,
    )
    expect(markup).toContain('data-dswf-ov-meta="prop:pr-1"')
    expect(markup).toContain('data-dswf-ov-meta="prop:pr-2"')
    expect(markup).toContain('m2-pipeline') // slug 行
    expect(markup).toContain('faner') // 作者行
    expect(markup).toContain('创建') // 创建行
    expect(markup).toContain('裁决') // 裁决行
    expect(markup).toContain('谱系') // 谱系行
    expect(markup).toContain('▾')
  })

  it('空列表 = 空态；搜索态空标题注入（服务端过滤不可自判——帧侧注入）', () => {
    const empty = renderToStaticMarkup(<ProposalsTab {...base} proposals={[]} openRows={new Set()} />)
    expect(empty).toContain('暂无提案')
    const noMatch = renderToStaticMarkup(
      <ProposalsTab {...base} proposals={[]} openRows={new Set()} emptyTitle="无匹配「网关」的提案" />,
    )
    expect(noMatch).toContain('无匹配「网关」的提案')
  })
})

describe('ProposalsTab 文档行（AC4 + UF-2 入口）', () => {
  it('proposal.md 文档行：名称 + 状态标签紧贴 + › 行尾 + relPath 数据锚', () => {
    const markup = renderToStaticMarkup(<ProposalsTab {...base} openRows={new Set()} />)
    expect(markup).toContain('data-dswf-ov-doc="docs/proposals/m2-pipeline/proposal.md"')
    expect(markup).toContain('proposal.md')
    expect(markup).toContain('›')
    // 名称与标签同现于文档行（紧贴呈现——CSS 同行布局）
    const docRow = markup.slice(
      markup.indexOf('data-dswf-ov-doc="docs/proposals/m2-pipeline'),
      markup.indexOf('data-dswf-ov-doc="docs/proposals/legacy-import'),
    )
    expect(docRow).toContain('proposal.md')
    expect(docRow).toContain('评审中')
    expect(docRow).toContain('›')
  })

  it('relPath 缺席提案 = 无文档行（未挂文档提案零渲染）', () => {
    const noDoc: ProposalCard = { ...proposal('pr-9', 'bare', 'draft'), relPath: undefined }
    const markup = renderToStaticMarkup(<ProposalsTab {...base} proposals={[noDoc]} openRows={new Set()} />)
    expect(markup).not.toContain('data-dswf-ov-doc=')
  })

  it('仓内只读脚注在场（docs/proposals/）', () => {
    const markup = renderToStaticMarkup(<ProposalsTab {...base} openRows={new Set()} />)
    expect(markup).toContain('docs/proposals/ · 仓内只读')
  })
})

describe('元数据纯函数', () => {
  it('proposalLineage：feature.proposalSlug 反查谱系串；无 feature = —', () => {
    expect(proposalLineage(proposal('pr-1', 'm2-pipeline', 'under-review'), FEATURES)).toBe(
      '→ m2-pipeline（进行中）',
    )
    expect(proposalLineage(proposal('pr-2', 'legacy-import', 'accepted'), FEATURES)).toBe('—（无 feature）')
  })

  it('proposalVerdict：decidedAt 缺席 = 评审中；在场 = 相对时间 → 状态', () => {
    expect(proposalVerdict(proposal('pr-1', 'a', 'under-review'), NOW)).toBe('—（评审中）')
    expect(proposalVerdict(proposal('pr-2', 'b', 'accepted', '2026-10-06T10:00:00.000Z'), NOW)).toBe(
      '2 小时前 → 已接受',
    )
  })
})
