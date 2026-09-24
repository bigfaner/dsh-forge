// @vitest-environment jsdom
// Task 5.4 — the UF5 proposal-board component family BUILD units (mock verbs;
// 5.5 wires the page assembly + tab registration). AC map:
//   AC1 列表 — 状态 Pill 色谱 + 双语 label(zh 草稿/已接受/已拒绝/被取代;
//      en Draft/Accepted/Rejected/Superseded);未知 status 兜底 = 数据原值
//      中性 Pill;feature 徽标无关联不渲染;排序 created/slug/状态(默认
//      created 倒序 = 内核基线序)
//   AC2 详情 — proposal/eval 双 tab 只读渲染(MarkdownView 白名单,渲染区
//      零交互元素);eval 缺失 disabled + tooltip;面包屑返回(onBack 回调,
//      列表不重拉 = 保列表态/滚动)
//   AC3 互跳 — feature 徽标点击/Enter → onOpenFeature(slug),不触发行详情;
//      无关联不渲染
//   AC4 回流 — sync 事件驱动列表/详情更新(列表:新行/变更行 flow 高亮 +
//      aria-live 聚合播报,他项目事件忽略;详情:重渲染保滚动位置)
//   AC5 空态 — proposals 为空 → 空态卡 + 文档根路径说明(mono)
//   AC6 状态机 — loading 骨架 / error 卡 + 重试 / 仓外路径失效引导
//      (docsLost → 重新指向/移除回调)
//
// Discipline note: every mount uses the codebase convention — render() ONCE,
// then waitFor(assertion) — never render() inside waitFor's polling callback
// (that shape deadlocks the act queue against async-effect components).
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { en, type WorkbenchKey } from '../src/client/locale/en.ts'
import { zh } from '../src/client/locale/zh.ts'
import type { ProposalBoardData, ProposalSummary } from '../src/client/ipc-types.ts'
import { ProposalList } from '../src/client/views/proposals/ProposalList.tsx'
import { ProposalDetail } from '../src/client/views/proposals/ProposalDetail.tsx'
import {
  ProposalStatusPill,
  PROPOSAL_STATUSES,
  proposalStatusLabel,
} from '../src/client/views/proposals/ProposalStatusPill.tsx'
import {
  createMockProposalsFace,
  MOCK_PROPOSAL_BOARD,
  type MockProposalsFace,
} from '../src/client/mocks/workbench.ts'

type Dict = Record<WorkbenchKey, string>
const bind = (dict: Dict) => (key: WorkbenchKey): string => dict[key]
const t = { en: bind(en), zh: bind(zh) }

const PROJECT_ID = 'mock-project'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** A board with ONLY the rows a test cares about (baseline order preserved). */
function boardOf(rows: readonly ProposalSummary[]): ProposalBoardData {
  return { ...MOCK_PROPOSAL_BOARD, proposals: rows }
}

/** The seeded rows keyed by slug (the mock's own vocabulary). */
const seeded = new Map(MOCK_PROPOSAL_BOARD.proposals.map(row => [row.slug, row]))

/** Default-created-order slugs of the SEED board (created desc, tie slug asc). */
const SEED_ORDER = MOCK_PROPOSAL_BOARD.proposals.map(row => row.slug)

/** Mount a populated list the standard way; resolves once rows are present. */
async function mountList(overrides: Partial<Parameters<typeof ProposalList>[0]> = {}) {
  const view = render(<ProposalList t={t.zh} projectId={PROJECT_ID} face={createMockProposalsFace()} {...overrides} />)
  await waitFor(() => {
    expect(view.container.querySelector('[data-dsh-forge-proposal-row]')).not.toBeNull()
  })
  return view
}

// ---------------------------------------------------------------------------
// AC1: status pill spectrum + bilingual labels + unknown fallback
// ---------------------------------------------------------------------------

describe('ProposalStatusPill — 色谱 + 双语 label + 未知兜底 (AC1)', () => {
  it('four known statuses: bilingual labels route through the locale seat', () => {
    const zhLabels: Record<string, string> = {
      draft: '草稿', accepted: '已接受', rejected: '已拒绝', superseded: '被取代',
    }
    const enLabels: Record<string, string> = {
      draft: 'Draft', accepted: 'Accepted', rejected: 'Rejected', superseded: 'Superseded',
    }
    for (const status of PROPOSAL_STATUSES) {
      expect(proposalStatusLabel(status, t.zh)).toBe(zhLabels[status])
      expect(proposalStatusLabel(status, t.en)).toBe(enLabels[status])
      const { container } = render(<ProposalStatusPill status={status} t={t.zh} />)
      const pill = container.querySelector('[data-dsh-forge-proposal-status]')
      expect(pill?.textContent).toBe(zhLabels[status])
    }
  })

  it('tone spectrum: draft 中性填充 / accepted success / rejected error / superseded 中性描边', () => {
    const { container } = render(
      <div>
        {PROPOSAL_STATUSES.map(status => <ProposalStatusPill key={status} status={status} t={t.en} />)}
      </div>,
    )
    const byStatus = (status: string): HTMLElement =>
      container.querySelector(`[data-dsh-forge-proposal-status="${status}"]`) as HTMLElement
    // draft: 中性填充 — hover-fill background, no colored border/text.
    const draft = byStatus('draft')
    expect(draft.style.background).not.toBe('')
    expect(draft.style.borderColor).toBe('')
    // accepted: success tint (border + text).
    const accepted = byStatus('accepted')
    expect(accepted.style.borderColor).toContain('34, 197, 94')
    expect(accepted.style.color).toContain('34, 197, 94')
    expect(accepted.style.background).toBe('')
    // rejected: error tint.
    const rejected = byStatus('rejected')
    expect(rejected.style.borderColor).toContain('236, 19, 19')
    expect(rejected.style.color).toContain('236, 19, 19')
    // superseded: 中性描边 — plain border, secondary text, no fill.
    const superseded = byStatus('superseded')
    expect(superseded.style.background).toBe('')
    expect(superseded.style.color).toBe('var(--dsw-alias-label-secondary, inherit)')
  })

  it('unknown status: raw value verbatim + neutral (outline) pill — the 兜底 leg', () => {
    const { container } = render(<ProposalStatusPill status="mystery-state" t={t.zh} />)
    const pill = container.querySelector('[data-dsh-forge-proposal-status]') as HTMLElement
    expect(pill.textContent).toBe('mystery-state')
    expect(pill.getAttribute('data-dsh-forge-proposal-tone')).toBe('neutral-outline')
    expect(pill.style.background).toBe('')
  })
})

// ---------------------------------------------------------------------------
// AC1: list rows + feature badge + sort
// ---------------------------------------------------------------------------

describe('ProposalList — 行/徽标/排序 (AC1, AC3)', () => {
  it('populated: rows render pill + slug + author + created in the kernel baseline order', async () => {
    const { container } = await mountList()
    const rows = Array.from(container.querySelectorAll('[data-dsh-forge-proposal-row]'))
    expect(rows.map(row => row.getAttribute('data-dsh-forge-proposal-row'))).toEqual(SEED_ORDER)
    const first = rows[0] as HTMLElement
    expect(first.textContent).toContain('dsh-forge-m2') // 09-22 tie → slug asc
    expect(first.textContent).toContain('faner')
    expect(first.textContent).toContain('2026-09-22')
    // rows carry the full aria-label (slug/status/author/date).
    expect(first.getAttribute('aria-label')).toContain('dsh-forge-m2')
    expect(first.getAttribute('aria-label')).toContain('已接受')
  })

  it('feature badge: rendered (and jumps) only for associated rows — 无关联不渲染 (AC1, AC3)', async () => {
    const onOpenFeature = vi.fn()
    const onOpenProposal = vi.fn()
    const { container } = await mountList({ onOpenFeature, onOpenProposal })
    const badges = Array.from(container.querySelectorAll('[data-dsh-forge-proposal-feature-jump]'))
    // seed: 3 associated of 6 rows, in the kernel baseline order (09-22 tie → slug asc).
    expect(badges.map(badge => badge.getAttribute('data-dsh-forge-proposal-feature-jump')))
      .toEqual(['dsh-forge-m2', 'dsh-forge-m3', 'ui-plugin-foundation'])
    // click → the jump seam fires with the FEATURE slug; the row detail does not.
    fireEvent.click(badges[1])
    expect(onOpenFeature).toHaveBeenCalledWith('dsh-forge-m3')
    expect(onOpenProposal).not.toHaveBeenCalled()
    // Enter on the badge → same jump (keyboard parity with the prototype).
    fireEvent.keyDown(badges[1], { key: 'Enter' })
    expect(onOpenFeature).toHaveBeenCalledTimes(2)
  })

  it('row click/Enter → onOpenProposal(slug) (detail entry seam)', async () => {
    const onOpenProposal = vi.fn()
    const { container } = await mountList({ onOpenProposal })
    const row = container.querySelector('[data-dsh-forge-proposal-row="dsh-forge-m3"]') as HTMLElement
    fireEvent.click(row)
    expect(onOpenProposal).toHaveBeenCalledWith('dsh-forge-m3')
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(onOpenProposal).toHaveBeenCalledTimes(2)
  })

  it('sort: default created 倒序 (kernel baseline); slug asc; status = vocabulary order', async () => {
    const view = await mountList()
    const container = view.container
    const slugs = (): string[] =>
      Array.from(container.querySelectorAll('[data-dsh-forge-proposal-row]'))
        .map(row => row.getAttribute('data-dsh-forge-proposal-row') ?? '')
    // default = baseline order.
    expect(slugs()).toEqual(SEED_ORDER)
    // open the sort menu, pick slug.
    fireEvent.click(container.querySelector('[data-dsh-forge-menu-trigger="proposal-sort"]') as HTMLElement)
    fireEvent.click(container.querySelector('[data-dsh-forge-proposal-sort="slug"]') as HTMLElement)
    await waitFor(() => { expect(slugs()).toEqual([...SEED_ORDER].sort((a, b) => a.localeCompare(b))) })
    // pick status: draft(dsh-forge-m3, skill-marketplace) before accepted(dsh-forge-m2, ui-plugin-foundation)…
    fireEvent.click(container.querySelector('[data-dsh-forge-menu-trigger="proposal-sort"]') as HTMLElement)
    fireEvent.click(container.querySelector('[data-dsh-forge-proposal-sort="status"]') as HTMLElement)
    await waitFor(() => {
      const statuses = slugs().map(slug => seeded.get(slug)?.status)
      const rank = (status: string): number => Math.max(0, (PROPOSAL_STATUSES as readonly string[]).indexOf(status))
      for (let index = 1; index < statuses.length; index += 1) {
        expect(rank(statuses[index - 1]!)).toBeLessThanOrEqual(rank(statuses[index]!))
      }
    })
  })
})

// ---------------------------------------------------------------------------
// AC2: detail — dual tabs / read-only render / eval-missing / breadcrumb
// ---------------------------------------------------------------------------

const ADVERSARIAL_MARKDOWN = [
  '# Proposal — adversarial corpus',
  '',
  '[external link](https://evil.example/x)',
  '[script link](javascript:alert(1))',
  '<script>window.pwned = true</script>',
  '<img src="https://evil.example/px" onerror="window.pwned = true" />',
  '',
  '- body item one',
  '- body item two',
].join('\n')

describe('ProposalDetail — 双 tab 只读 + eval 缺失 + 面包屑 (AC2)', () => {
  const detailOf = async (slug: string, face: MockProposalsFace = createMockProposalsFace()) => {
    const proposal = seeded.get(slug)!
    const view = render(
      <ProposalDetail t={t.zh} projectId={PROJECT_ID} proposal={proposal} face={face} onBack={() => {}} />,
    )
    await waitFor(() => {
      expect(view.container.querySelector('[data-dsh-forge-proposal-doc-panel]')).not.toBeNull()
    })
    return view
  }

  it('breadcrumb + header: root crumb button, slug crumb, 16/24 slug, pill, author · created', async () => {
    const { container } = await detailOf('dsh-forge-m3')
    const back = container.querySelector('[data-dsh-forge-proposal-back]') as HTMLElement
    expect(back.textContent).toBe('提案看板')
    const crumb = container.querySelector('[data-dsh-forge-proposal-crumb]') as HTMLElement
    expect(crumb.textContent).toBe('dsh-forge-m3')
    const title = container.querySelector('[data-dsh-forge-proposal-detail-title]') as HTMLElement
    expect(title.style.fontSize).toBe('16px')
    expect(title.style.lineHeight).toBe('24px')
    expect(container.textContent).toContain('草稿')
    expect(container.textContent).toContain('faner · 2026-09-22')
  })

  it('proposal tab: markdown renders read-only — 渲染区零交互元素 (whitelist)', async () => {
    const face = createMockProposalsFace()
    face.setDoc('dsh-forge-m3', 'proposal', ADVERSARIAL_MARKDOWN)
    const { container } = await detailOf('dsh-forge-m3', face)
    const panel = container.querySelector('[data-dsh-forge-proposal-doc-panel]') as HTMLElement
    await waitFor(() => { expect(panel.textContent).toContain('body item one') })
    // ZERO interactive elements inside the render area: no a/img/button/script/iframe.
    expect(panel.querySelectorAll('a, img, button, script, iframe, input, select, textarea')).toHaveLength(0)
    // The raw-HTML/script payload degrades to visible inert text, never executes.
    expect(panel.textContent).toContain('window.pwned = true')
  })

  it('eval 缺失 → tab disabled + tooltip 无评估报告; proposal tab stays active', async () => {
    const { container } = await detailOf('skill-marketplace') // hasEval: false
    const evalTab = container.querySelector('[data-dsh-forge-proposal-doc-tab="eval"]') as HTMLButtonElement
    expect(evalTab.disabled).toBe(true)
    expect(evalTab.getAttribute('aria-disabled')).toBe('true')
    expect(evalTab.title).toBe('无评估报告')
    const proposalTab = container.querySelector('[data-dsh-forge-proposal-doc-tab="proposal"]') as HTMLButtonElement
    expect(proposalTab.disabled).toBe(false)
    expect(proposalTab.getAttribute('aria-selected')).toBe('true')
    // A disabled click is a no-op: no loading churn, selection unchanged.
    fireEvent.click(evalTab)
    expect(evalTab.getAttribute('aria-selected')).toBe('false')
  })

  it('eval 在场 → 切 tab 渲染 eval 文档 (loading → content)', async () => {
    const { container } = await detailOf('dsh-forge-m3') // hasEval: true
    const evalTab = container.querySelector('[data-dsh-forge-proposal-doc-tab="eval"]') as HTMLButtonElement
    expect(evalTab.disabled).toBe(false)
    fireEvent.click(evalTab)
    const panel = container.querySelector('[data-dsh-forge-proposal-doc-panel]') as HTMLElement
    await waitFor(() => { expect(panel.textContent).toContain('Eval 报告') })
    expect(evalTab.getAttribute('aria-selected')).toBe('true')
  })

  it('tab strip keyboard: ArrowRight/Home move focus AND select among enabled tabs (WAI-ARIA)', async () => {
    const { container } = await detailOf('dsh-forge-m3') // both tabs enabled
    const tabs = container.querySelector('[data-dsh-forge-proposal-doc-tabs]') as HTMLElement
    const proposalTab = container.querySelector('[data-dsh-forge-proposal-doc-tab="proposal"]') as HTMLButtonElement
    const evalTab = container.querySelector('[data-dsh-forge-proposal-doc-tab="eval"]') as HTMLButtonElement
    // ArrowRight: proposal → eval (selection + focus move together).
    fireEvent.keyDown(tabs, { key: 'ArrowRight' })
    expect(evalTab.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(evalTab)
    await waitFor(() => {
      expect(container.querySelector('[data-dsh-forge-proposal-doc-panel]')?.textContent).toContain('Eval 报告')
    })
    // Home returns to the first tab.
    fireEvent.keyDown(tabs, { key: 'Home' })
    expect(proposalTab.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(proposalTab)
    await waitFor(() => {
      expect(container.querySelector('[data-dsh-forge-proposal-doc-panel]')?.textContent).toContain('流程即产品')
    })
  })

  it('doc read failure → error card + retry leg', async () => {
    const face = createMockProposalsFace()
    const { container } = await detailOf('dsh-forge-m3', face)
    face.failNextDoc('ERR_PROPOSAL_NOT_FOUND', 'mock: doc gone')
    fireEvent.click(container.querySelector('[data-dsh-forge-proposal-doc-tab="eval"]') as HTMLElement)
    await waitFor(() => {
      expect(container.querySelector('[data-dsh-forge-proposal-doc-error]')).not.toBeNull()
    })
    fireEvent.click(container.querySelector('[data-dsh-forge-proposal-doc-retry]') as HTMLElement)
    await waitFor(() => {
      expect(container.querySelector('[data-dsh-forge-proposal-doc-error]')).toBeNull()
      expect(container.querySelector('[data-dsh-forge-proposal-doc-panel]')?.textContent).toContain('Eval 报告')
    })
  })

  it('breadcrumb root → onBack fires (the return seam 5.5 routes to the list)', async () => {
    const onBack = vi.fn()
    const proposal = seeded.get('dsh-forge-m3')!
    const view = render(
      <ProposalDetail t={t.zh} projectId={PROJECT_ID} proposal={proposal} face={createMockProposalsFace()} onBack={onBack} />,
    )
    await waitFor(() => {
      expect(view.container.querySelector('[data-dsh-forge-proposal-doc-panel]')).not.toBeNull()
    })
    fireEvent.click(view.container.querySelector('[data-dsh-forge-proposal-back]') as HTMLElement)
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('返回保列表态: list stays mounted beside the detail → NO board re-fire on the round trip', async () => {
    const face = createMockProposalsFace()
    const loadSpy = vi.spyOn(face, 'loadBoard')
    // The 5.5 page form: the list stays MOUNTED (hidden) while the detail is
    // open — the FeaturesPage precedent. The board never re-fires, so the
    // page-level scroll container is never reset (保滚动 by construction).
    function Harness(props: { slug?: string | undefined }) {
      return (
        <div>
          <div hidden={props.slug !== undefined}>
            <ProposalList t={t.zh} projectId={PROJECT_ID} face={face} />
          </div>
          {props.slug !== undefined && (
            <ProposalDetail t={t.zh} projectId={PROJECT_ID} proposal={seeded.get(props.slug)!} face={face} onBack={() => {}} />
          )}
        </div>
      )
    }
    const first = render(<Harness />)
    await waitFor(() => {
      expect(first.container.querySelector('[data-dsh-forge-proposal-row]')).not.toBeNull()
    })
    expect(loadSpy).toHaveBeenCalledTimes(1)
    first.rerender(<Harness slug="dsh-forge-m3" />)
    await waitFor(() => {
      expect(first.container.querySelector('[data-dsh-forge-proposal-detail-title]')).not.toBeNull()
    })
    first.rerender(<Harness />)
    await waitFor(() => {
      expect(first.container.querySelector('[data-dsh-forge-proposal-detail-title]')).toBeNull()
      // rows instantly present again — no skeleton, no re-fire.
      expect(first.container.querySelector('[data-dsh-forge-proposal-row]')).not.toBeNull()
      expect(first.container.querySelector('[data-dsh-forge-proposal-skeleton]')).toBeNull()
    })
    expect(loadSpy).toHaveBeenCalledTimes(1)
    first.unmount()
  })
})

// ---------------------------------------------------------------------------
// AC4: reflux — sync events drive list/detail updates (≤5s on the real chain)
// ---------------------------------------------------------------------------

describe('回流 — sync 事件驱动列表/详情更新 (AC4)', () => {
  it('list: sync (this project) → board re-read, changed/new rows flow-marked + aggregated aria-live', async () => {
    const face = createMockProposalsFace()
    const view = render(<ProposalList t={t.zh} projectId={PROJECT_ID} face={face} />)
    await waitFor(() => {
      expect(view.container.querySelector('[data-dsh-forge-proposal-row]')).not.toBeNull()
    })
    const container = view.container
    const next = boardOf([
      { ...seeded.get('dsh-forge-m3')!, status: 'accepted' },
      ...MOCK_PROPOSAL_BOARD.proposals.filter(row => row.slug !== 'dsh-forge-m3'),
      {
        slug: 'forge-cli-retirement', status: 'draft', author: 'terminal-agent', created: '2026-09-24',
        featureSlug: null, hasEval: false, updatedAt: '2026-09-24T08:00:00.000Z',
      },
    ])
    face.setBoard(next)
    face.emit([{ type: 'sync', projectId: PROJECT_ID, sync: { state: 'idle', lastScanAt: '2026-09-24T08:00:01.000Z' } }])
    await waitFor(() => {
      expect(container.querySelector('[data-dsh-forge-proposal-row="forge-cli-retirement"]')).not.toBeNull()
    })
    // changed + new rows carry the transient flow mark (0.2s fade-in budget).
    expect(container.querySelector('[data-dsh-forge-proposal-row="dsh-forge-m3"]')?.hasAttribute('data-dsh-forge-proposal-flow')).toBe(true)
    expect(container.querySelector('[data-dsh-forge-proposal-row="dsh-forge-m2"]')?.hasAttribute('data-dsh-forge-proposal-flow')).toBe(false)
    // status pill migrated with the re-read.
    expect(container.querySelector('[data-dsh-forge-proposal-row="dsh-forge-m3"]')?.textContent).toContain('已接受')
    // ONE aggregated polite announcement (批量聚合为一条计数播报).
    const live = container.querySelector('[data-dsh-forge-proposal-live]') as HTMLElement
    expect(live.getAttribute('aria-live')).toBe('polite')
    expect(live.textContent).toContain('2')
  })

  it('list: foreign-project sync events are ignored', async () => {
    const face = createMockProposalsFace()
    const loadSpy = vi.spyOn(face, 'loadBoard')
    const view = render(<ProposalList t={t.en} projectId={PROJECT_ID} face={face} />)
    await waitFor(() => {
      expect(view.container.querySelector('[data-dsh-forge-proposal-row]')).not.toBeNull()
    })
    loadSpy.mockClear()
    face.emit([{ type: 'sync', projectId: 'other-project', sync: { state: 'idle', lastScanAt: null } }])
    face.emit([{ type: 'feature_updated', projectId: PROJECT_ID, featureSlug: 'dsh-forge-m3' }])
    await new Promise(resolve => { setTimeout(resolve, 30) })
    expect(loadSpy).not.toHaveBeenCalled()
    expect(view.container.querySelector('[data-dsh-forge-proposal-live]')?.textContent).toBe('')
  })

  it('detail: sync → the OPEN doc re-renders with fresh content, panel scroll position preserved', async () => {
    const face = createMockProposalsFace()
    const proposal = seeded.get('dsh-forge-m3')!
    const view = render(
      <ProposalDetail t={t.zh} projectId={PROJECT_ID} proposal={proposal} face={face} onBack={() => {}} />,
    )
    await waitFor(() => {
      expect(view.container.querySelector('[data-dsh-forge-proposal-doc-panel]')?.textContent).toContain('M3 流程即产品')
    })
    const panel = view.container.querySelector('[data-dsh-forge-proposal-doc-panel]') as HTMLElement
    panel.scrollTop = 80
    face.setDoc('dsh-forge-m3', 'proposal', '# M3 流程即产品\n\n刷新后的正文(revision 2)。')
    face.emit([{ type: 'sync', projectId: PROJECT_ID, sync: { state: 'idle', lastScanAt: '2026-09-24T08:00:02.000Z' } }])
    await waitFor(() => {
      expect(panel.textContent).toContain('revision 2')
    })
    // 保滚动: the SAME panel node kept its offset across the reflux re-render.
    expect(panel.scrollTop).toBe(80)
    expect(view.container.querySelector('[data-dsh-forge-proposal-doc-skeleton]')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// AC5 + AC6: empty / loading / error / lost 状态机
// ---------------------------------------------------------------------------

describe('状态机 — empty/loading/error/lost (AC5, AC6)', () => {
  it('empty board → 空态卡 + 文档根路径说明 (mono, from proposalsRoot)', async () => {
    const face = createMockProposalsFace({ board: { ...MOCK_PROPOSAL_BOARD, proposals: [] } })
    const view = render(<ProposalList t={t.zh} projectId={PROJECT_ID} face={face} />)
    await waitFor(() => {
      expect(view.container.querySelector('[data-dsh-forge-proposal-empty]')).not.toBeNull()
    })
    const empty = view.container.querySelector('[data-dsh-forge-proposal-empty]') as HTMLElement
    expect(empty.textContent).toContain('暂无提案')
    const path = empty.querySelector('[data-dsh-forge-proposal-root]') as HTMLElement
    expect(path.textContent).toBe(MOCK_PROPOSAL_BOARD.proposalsRoot)
    expect(path.style.fontFamily).toContain('monospace')
  })

  it('loading: pending first load → skeleton (aria-busy)', async () => {
    const face = createMockProposalsFace()
    vi.spyOn(face, 'loadBoard').mockImplementation(() => new Promise(() => {}))
    const view = render(<ProposalList t={t.zh} projectId={PROJECT_ID} face={face} />)
    expect(view.container.querySelector('[data-dsh-forge-proposal-skeleton]')).not.toBeNull()
    expect((view.container.firstChild as HTMLElement).getAttribute('aria-busy')).toBe('true')
  })

  it('load failure → error card + retry recovers', async () => {
    const face = createMockProposalsFace()
    face.failNextBoard('ERR_WORKBENCH_DB', 'mock: board read failed')
    const view = render(<ProposalList t={t.zh} projectId={PROJECT_ID} face={face} />)
    await waitFor(() => {
      expect(view.container.querySelector('[data-dsh-forge-proposal-error]')).not.toBeNull()
    })
    fireEvent.click(view.container.querySelector('[data-dsh-forge-proposal-retry]') as HTMLElement)
    await waitFor(() => {
      expect(view.container.querySelector('[data-dsh-forge-proposal-error]')).toBeNull()
      expect(view.container.querySelector('[data-dsh-forge-proposal-row]')).not.toBeNull()
    })
  })

  it('docsLost → 仓外路径失效引导卡: 重新指向/移除 fire their seams (同 M2 UF4 口径)', async () => {
    const onRepoint = vi.fn()
    const onRemove = vi.fn()
    const view = render(
      <ProposalList
        t={t.zh} projectId={PROJECT_ID} face={createMockProposalsFace()}
        docsLost onRepoint={onRepoint} onRemove={onRemove}
      />,
    )
    const lost = view.container.querySelector('[data-dsh-forge-proposal-lost]') as HTMLElement
    expect(lost).not.toBeNull()
    expect(lost.textContent).toContain('文档位置不可访问')
    fireEvent.click(view.container.querySelector('[data-dsh-forge-proposal-lost-repoint]') as HTMLElement)
    fireEvent.click(view.container.querySelector('[data-dsh-forge-proposal-lost-remove]') as HTMLElement)
    expect(onRepoint).toHaveBeenCalledTimes(1)
    expect(onRemove).toHaveBeenCalledTimes(1)
  })
})
