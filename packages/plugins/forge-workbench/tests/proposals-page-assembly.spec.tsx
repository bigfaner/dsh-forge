// @vitest-environment jsdom
// Task 5.5 — the UF5 proposals PAGE units; M4 task 1.7 re-hosted (the shell
// no longer mounts the board — its main-panel key retired with Integration 6;
// the P2 rightbar pane becomes the host). AC map:
//   AC1 装配/互跳 — ProposalsPage composes the 5.4 list/detail; detail
//      open/back ride the page's own routing props (proposalSlug +
//      onOpenProposal/onBack — the contract the retired view-key machine
//      drove from the shell, now pinned at the page boundary); the feature
//      badge's 互跳 fires onOpenFeature; the list seat STAYS MOUNTED while
//      the detail is open (返回不重拉)
//   AC3 项目上下文 — the board data follows the project (loading skeleton on
//      a keyed project switch)
//   AC6 主路径 — not-found card, docsLost lost-card seams, skeleton
//
// Discipline note: render() ONCE per view, then waitFor(assertion) — never
// render() inside waitFor's polling callback.
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProposalsPage } from '../src/client/views/ProposalsPage.tsx'
import type { ProposalsPageProps } from '../src/client/views/ProposalsPage.tsx'
import { en, type WorkbenchKey } from '../src/client/locale/en.ts'
import {
  MOCK_PROPOSAL_BOARD, MOCK_WORKBENCH_STATE, createMockProposalsFace,
} from '../src/client/mocks/workbench.ts'

// The upstream icons/dots resolve through the module table at runtime; the
// jsdom unit render stubs them (the shell.spec convention).
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconBranchOutline16: () => null,
  StateDot: (props: { state: string }) => <span data-mock-state-dot={props.state} />,
}))

// The tasks tab's DEFAULT view is the DAG — the real ReactFlow needs jsdom's
// missing deps, so the shell renders that mount through the standin.
vi.mock('@xyflow/react', async () => await import('./helpers/xyflow-standin'))

type Dict = Record<WorkbenchKey, string>
const bind = (dict: Dict) => (key: WorkbenchKey): string => dict[key]
const t = { en: bind(en) }

const PROJECT_ID = MOCK_WORKBENCH_STATE.activeProjectId as string

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/**
 * A page-level routing harness (the 1.7 re-host): local slug state drives
 * list⇄detail through the page's own routing props — the contract the
 * retired view-key machine drove from the shell, now pinned at the page
 * boundary (the P2 rightbar pane becomes the host that owns this state).
 */
function ProposalsRoutingHarness(props: {
  initialSlug?: string
  onOpenFeature?: (featureSlug: string) => void
  seat?: ProposalsPageProps['seat']
}) {
  const [slug, setSlug] = useState<string | undefined>(props.initialSlug)
  return (
    <ProposalsPage
      t={t.en as (key: WorkbenchKey) => string}
      projectId={PROJECT_ID}
      proposalSlug={slug}
      onOpenProposal={setSlug}
      onBack={() => { setSlug(undefined) }}
      onOpenFeature={props.onOpenFeature}
      seat={props.seat}
    />
  )
}

/** A manually-gated board read (deterministic skeleton windows). */
function gatedBoard() {
  let release: ((board: typeof MOCK_PROPOSAL_BOARD) => void) | undefined
  const promise = new Promise<typeof MOCK_PROPOSAL_BOARD>((resolve) => {
    release = resolve
  })
  return { promise, release: (board = MOCK_PROPOSAL_BOARD) => release?.(board) }
}

// ---------------------------------------------------------------------------
// AC1: the round trips — detail enter/return, feature 互跳 (page-level, the
// 1.7 re-host: the page's own routing props carry what the retired shell
// machine drove)
// ---------------------------------------------------------------------------

describe('ProposalsPage navigation round trips (AC1/AC3, re-hosted)', () => {
  it('detail enter → breadcrumb back returns to the board; the list seat stayed mounted (返回不重拉)', async () => {
    render(<ProposalsRoutingHarness />)
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-proposal-row="dsh-forge-m2"]')).not.toBeNull()
    })
    // Enter the detail through the row (the page's open seam).
    fireEvent.click(document.querySelector('[data-dsh-forge-proposal-row="dsh-forge-m2"]') as HTMLElement)
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-proposal-detail="dsh-forge-m2"]')).not.toBeNull()
    })
    // The LIST seat stays mounted (hidden) while the detail is open — the
    // board data survives the round trip by construction.
    const seat = document.querySelector('[data-dsh-forge-proposal-list-seat]')
    expect(seat).not.toBeNull()
    expect(seat?.hasAttribute('hidden')).toBe(true)
    expect(seat?.querySelector('[data-dsh-forge-proposal-row="dsh-forge-m2"]')).not.toBeNull()
    // The breadcrumb return clears the slug through the page's back seam.
    fireEvent.click(document.querySelector('[data-dsh-forge-proposal-back]') as HTMLButtonElement)
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-proposal-detail="dsh-forge-m2"]')).toBeNull()
    })
    expect(document.querySelector('[data-dsh-forge-proposal-list-seat]')?.hasAttribute('hidden')).toBe(false)
  })

  it('the :slug initial mount addresses the detail subview directly', async () => {
    render(<ProposalsRoutingHarness initialSlug="dsh-forge-m2" />)
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-proposal-detail="dsh-forge-m2"]')).not.toBeNull()
    })
  })

  it('feature 徽标 互跳: the badge routes through the onOpenFeature seam without opening the row detail', async () => {
    const onOpenFeature = vi.fn()
    render(<ProposalsRoutingHarness onOpenFeature={onOpenFeature} />)
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-proposal-row="dsh-forge-m3"]')).not.toBeNull()
    })
    // The row's feature badge (dsh-forge-m3's association) jumps WITHOUT
    // opening the row's own detail (stopPropagation, the 5.4 contract).
    fireEvent.click(document.querySelector('[data-dsh-forge-proposal-feature-jump="dsh-forge-m3"]') as HTMLButtonElement)
    expect(onOpenFeature).toHaveBeenCalledWith('dsh-forge-m3')
    // The jump never opened the row's own detail subview.
    expect(document.querySelector('[data-dsh-forge-proposal-detail="dsh-forge-m3"]')).toBeNull()
  })

  it('a project switch re-keys the board (loading skeleton first, then the new board)', async () => {
    // Page level, the keyed-remount semantics the shell applies on the real
    // path (key={activeProjectKey}): a NEW project is a FRESH board session —
    // the list's own loading skeleton precedes the new board (never stale
    // rows). Deterministic via a face that never settles the second project.
    const seatFor = (projectId: string, settle: boolean) => ({
      face: {
        loadBoard: () =>
          settle
            ? Promise.resolve(MOCK_PROPOSAL_BOARD)
            : new Promise<typeof MOCK_PROPOSAL_BOARD>(() => {}),
      },
    })
    const first = render(
      <ProposalsPage
        t={t.en as (key: WorkbenchKey) => string}
        projectId="p-1"
        seat={seatFor('p-1', true)}
      />,
    )
    await waitFor(() => {
      expect(first.container.querySelector('[data-dsh-forge-proposal-row]')).not.toBeNull()
    })
    // Remount with the next project (the shell's keyed form): skeleton first.
    first.unmount()
    const next = render(
      <ProposalsPage
        t={t.en as (key: WorkbenchKey) => string}
        projectId="p-2"
        seat={seatFor('p-2', false)}
      />,
    )
    expect(next.container.querySelector('[data-dsh-forge-proposal-skeleton]')).not.toBeNull()
    expect(next.container.querySelector('[data-dsh-forge-proposal-row]')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// AC6: the page-level state machine legs (seat form, deterministic gates)
// ---------------------------------------------------------------------------

describe('ProposalsPage state legs (AC6)', () => {
  const base = {
    t: t.en as (key: WorkbenchKey) => string,
    projectId: 'p-1',
    onOpenProposal: vi.fn(),
    onBack: vi.fn(),
    onOpenFeature: vi.fn(),
  }

  it('holds the skeleton until the first board read settles, then the rows', async () => {
    const gate = gatedBoard()
    const view = render(
      <ProposalsPage {...base} seat={{ face: { loadBoard: () => gate.promise } }} />,
    )
    expect(view.container.querySelector('[data-dsh-forge-proposal-skeleton]')).not.toBeNull()
    gate.release()
    await waitFor(() => {
      expect(view.container.querySelector('[data-dsh-forge-proposal-row]')).not.toBeNull()
    })
  })

  it('a slug missing from the settled board renders the not-found card + back', async () => {
    const view = render(
      <ProposalsPage
        {...base}
        proposalSlug="gone-away"
        seat={{ face: { loadBoard: async () => MOCK_PROPOSAL_BOARD } }}
      />,
    )
    await waitFor(() => {
      expect(view.container.querySelector('[data-dsh-forge-proposal-notfound]')).not.toBeNull()
    })
    fireEvent.click(view.container.querySelector('[data-dsh-forge-proposal-notfound-back]') as HTMLButtonElement)
    expect(base.onBack).toHaveBeenCalledTimes(1)
  })

  it('docsLost renders the lost guidance card; the repoint/remove seams route out (5.5 wiring)', () => {
    const onRepoint = vi.fn()
    const onRemove = vi.fn()
    const view = render(
      <ProposalsPage {...base} seat={{ docsLost: true, onRepoint, onRemove }} />,
    )
    expect(view.container.querySelector('[data-dsh-forge-proposal-lost]')).not.toBeNull()
    fireEvent.click(view.container.querySelector('[data-dsh-forge-proposal-lost-repoint]') as HTMLButtonElement)
    expect(onRepoint).toHaveBeenCalledTimes(1)
    fireEvent.click(view.container.querySelector('[data-dsh-forge-proposal-lost-remove]') as HTMLButtonElement)
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('the page-level detail feed re-reads on reflux and keeps the last good board while in flight', async () => {
    // The page's own read feeds the detail's summary. THREE subscribers ride
    // the face's channel (the list, the page feed, the detail's doc leg) —
    // the driver fans the push to ALL of them (the channel's own discipline).
    let calls = 0
    const gates: Array<ReturnType<typeof gatedBoard>> = []
    const listeners: Array<(events: readonly unknown[]) => void> = []
    const push = (events: readonly unknown[]): void => {
      for (const listener of [...listeners]) listener(events)
    }
    const view = render(
      <ProposalsPage
        {...base}
        proposalSlug="dsh-forge-m2"
        seat={{
          face: {
            loadBoard: () => {
              calls += 1
              const gate = gatedBoard()
              gates.push(gate)
              return gate.promise
            },
            subscribeEvents: (listener: (events: readonly never[]) => void) => {
              listeners.push(listener as (events: readonly unknown[]) => void)
              return () => {}
            },
          },
        }}
      />,
    )
    // First settles: the list AND the detail feed both read; release all.
    await waitFor(() => { expect(gates.length).toBeGreaterThanOrEqual(2) })
    for (const gate of gates) gate.release()
    await waitFor(() => {
      expect(view.container.querySelector('[data-dsh-forge-proposal-detail="dsh-forge-m2"]')).not.toBeNull()
    })
    // A project-scoped sync push re-fires the readers (gates pending again)
    // while the CURRENT detail KEEPS rendering off the last good board.
    const before = calls
    push([{ type: 'sync', projectId: 'p-1', sync: { state: 'idle', lastScanAt: null } }])
    await waitFor(() => { expect(calls).toBeGreaterThan(before) })
    expect(view.container.querySelector('[data-dsh-forge-proposal-detail="dsh-forge-m2"]')).not.toBeNull()
    for (const gate of gates) gate.release()
    await waitFor(() => {
      expect(view.container.querySelector('[data-dsh-forge-proposal-detail="dsh-forge-m2"]')).not.toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------
// The seat-vs-mock-twin discipline (the assembly's DI switch)
// ---------------------------------------------------------------------------

describe('ProposalsPage face resolution (the DI switch)', () => {
  it('the build form seeds its mock twin with the ACTIVE project (the board serves the chrome registry)', async () => {
    const view = render(
      <ProposalsPage t={t.en as (key: WorkbenchKey) => string} projectId={PROJECT_ID} />,
    )
    await waitFor(() => {
      expect(view.container.querySelector('[data-dsh-forge-proposal-row]')).not.toBeNull()
    })
  })

  it('the mock twin pokes flow through the shared face (the seat overrides the same members)', async () => {
    const twin = createMockProposalsFace({ projectId: 'p-x' })
    const view = render(
      <ProposalsPage
        t={t.en as (key: WorkbenchKey) => string}
        projectId="p-x"
        seat={{ face: twin }}
      />,
    )
    await waitFor(() => {
      expect(view.container.querySelector('[data-dsh-forge-proposal-row]')).not.toBeNull()
    })
    twin.failNextBoard()
    twin.emit([{ type: 'sync', projectId: 'p-x', sync: { state: 'idle', lastScanAt: null } }])
    // A failed refresh keeps the last good board rendered (不打断).
    await waitFor(() => {
      expect(view.container.querySelector('[data-dsh-forge-proposal-row]')).not.toBeNull()
    })
  })
})
