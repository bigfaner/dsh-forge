// 五态 chips 单测 —— 4.2 AC4：draft/under-review/accepted/rejected/superseded 中文标签 + 计数；
// 0 计数 disabled、多选并集（filterProposalsByStatuses 纯函数）、清过滤入口。
// 受控语义（子 tab 切换清空）归帧侧 overview-model（switchSubtab 沿 M2 机制——4.6 接线）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ProposalCard, ProposalStatus } from '@dsh-forge/contracts'
import {
  PROPOSAL_STATUS_TAG_TONE,
  ProposalStatusChips,
  filterProposalsByStatuses,
  proposalStatusCounts,
} from './ProposalStatusChips.js'

const CREATED = '2026-10-01T08:00:00.000Z'

function card(id: string, slug: string, status: ProposalStatus, mode?: 'expedition' | 'blitz'): ProposalCard {
  return {
    proposalId: id,
    slug,
    title: `提案 ${slug}`,
    proposalStatus: status,
    relPath: `docs/proposals/${slug}/proposal.md`,
    author: 'faner',
    taskCount: 0,
    ...(mode !== undefined ? { mode } : {}),
    createdAt: CREATED,
    updatedAt: CREATED,
  }
}

const PROPOSALS = [
  card('pr-1', 'm3-bootstrap', 'under-review', 'expedition'),
  card('pr-2', 'ui-polish', 'under-review', 'blitz'),
  card('pr-3', 'legacy-import', 'accepted', 'expedition'),
  card('pr-4', 'old-eval', 'rejected', 'blitz'),
  card('pr-5', 'trace-matrix', 'superseded'),
]

const COUNTS: Record<ProposalStatus, number> = {
  draft: 0,
  'under-review': 2,
  accepted: 1,
  rejected: 1,
  superseded: 1,
}

const NONE = new Set<ProposalStatus>()

describe('计数聚合与并集过滤（AC4 纯函数面）', () => {
  it('proposalStatusCounts：五态聚合（contracts PROPOSAL_STATUSES 键全集）', () => {
    expect(proposalStatusCounts(PROPOSALS)).toEqual(COUNTS)
    expect(proposalStatusCounts([])).toEqual({ draft: 0, 'under-review': 0, accepted: 0, rejected: 0, superseded: 0 })
  })

  it('filterProposalsByStatuses：空集 = 全部（chips 未激活不过滤）', () => {
    expect(filterProposalsByStatuses(PROPOSALS, NONE)).toHaveLength(5)
  })

  it('多选并集：两态激活 = 两态命中合集（under-review ∪ accepted = 3 行）', () => {
    const out = filterProposalsByStatuses(PROPOSALS, new Set<ProposalStatus>(['under-review', 'accepted']))
    expect(out.map((p) => p.proposalId)).toEqual(['pr-1', 'pr-2', 'pr-3'])
  })

  it('单态过滤与零命中（过滤零命中 = 空列表——空态呈现归帧侧）', () => {
    expect(filterProposalsByStatuses(PROPOSALS, new Set<ProposalStatus>(['draft']))).toEqual([])
    expect(filterProposalsByStatuses(PROPOSALS, new Set<ProposalStatus>(['rejected']))).toHaveLength(1)
  })
})

describe('五态 chips 行（AC4 渲染面）', () => {
  it('五态全呈现（contracts PROPOSAL_STATUSES 行序）+ 中文标签 + 计数', () => {
    const markup = renderToStaticMarkup(
      <ProposalStatusChips counts={COUNTS} active={NONE} onToggle={() => {}} />,
    )
    const order = ['draft', 'under-review', 'accepted', 'rejected', 'superseded'].map((s) =>
      markup.indexOf(`data-dswf-ov-pschip="${s}"`),
    )
    expect(order.every((p) => p >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    for (const zh of ['草稿', '评审中', '已接受', '已拒绝', '已取代']) {
      expect(markup).toContain(zh)
    }
    expect(markup).toContain('>2</span>') // under-review 计数
  })

  it('0 计数 chip disabled（不可点出空态）+ 淡化类 + 悬停说明（官方 Tooltip label——D30 原生 title 退役）', () => {
    const markup = renderToStaticMarkup(
      <ProposalStatusChips counts={COUNTS} active={NONE} onToggle={() => {}} />,
    )
    const chipOf = (status: string): string => {
      const at = markup.indexOf(`data-dswf-ov-pschip="${status}"`)
      expect(at).toBeGreaterThanOrEqual(0)
      return markup.slice(markup.lastIndexOf('<button', at), markup.indexOf('</button>', at))
    }
    expect(chipOf('draft')).toContain('disabled')
    expect(chipOf('draft')).toContain('is-zero')
    expect(chipOf('draft')).not.toContain('title=') // D30：「无此状态提案」归官方 Tooltip label（结构 pin tests/structure/d30）
    expect(chipOf('accepted')).not.toContain('disabled')
  })

  it('激活态：aria-pressed + is-on；清过滤入口在场（任一激活时）；零激活缺席', () => {
    const active = new Set<ProposalStatus>(['accepted'])
    const markup = renderToStaticMarkup(
      <ProposalStatusChips counts={COUNTS} active={active} onToggle={() => {}} onClear={() => {}} />,
    )
    const at = markup.indexOf('data-dswf-ov-pschip="accepted"')
    const chip = markup.slice(markup.lastIndexOf('<button', at), markup.indexOf('</button>', at))
    expect(chip).toContain('aria-pressed="true"')
    expect(chip).toContain('is-on')
    expect(markup).toContain('data-dswf-ov-pschip-clear')
    expect(markup).toContain('✕ 清过滤')

    const idle = renderToStaticMarkup(<ProposalStatusChips counts={COUNTS} active={NONE} onToggle={() => {}} />)
    expect(idle).not.toContain('aria-pressed="true"')
    expect(idle).not.toContain('data-dswf-ov-pschip-clear')
  })

  it('五态点色语义封闭（每 chip 一枚 data-status 点——蓝/绿/红/中性令牌承载归 CSS）', () => {
    const markup = renderToStaticMarkup(
      <ProposalStatusChips counts={COUNTS} active={NONE} onToggle={() => {}} />,
    )
    expect(markup.match(/data-status="/g)?.length).toBe(5)
  })

  it('状态 tag tone 单源：五态封闭映射（4.6 行 tag 消费——under-review=info/accepted=success/rejected=danger）', () => {
    expect(PROPOSAL_STATUS_TAG_TONE).toEqual({
      draft: 'neutral',
      'under-review': 'info',
      accepted: 'success',
      rejected: 'danger',
      superseded: 'quiet',
    } satisfies typeof PROPOSAL_STATUS_TAG_TONE)
  })
})
