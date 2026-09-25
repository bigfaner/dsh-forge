// @vitest-environment jsdom
// Task 5.5 — the UF5 proposals PAGE ASSEMBLY + tab-order revision units. AC map:
//   AC1 装配/互跳 — ProposalsPage composes the 5.4 list/detail on the SECOND
//      tab; detail open/back ride the view-key seams; the feature badge's
//      互跳 fires onOpenFeature (the 提案 tab being the return path); the list
//      seat STAYS MOUNTED while the detail is open (返回不重拉)
//   AC2 tab 序/持久化 — the machine/controller/guard units live in
//      view-key.spec / view-switch.spec; here the SHELL-level strip renders
//      概览/提案/Feature/任务 and the proposals seat reserves its container
//   AC3 项目上下文 — a tab round trip never touches the chrome's project
//      context; the board data follows the project (loading skeleton on a
//      keyed project switch)
//   AC4 审批徽标 — the TabBar badge units live in chrome.spec; the shell
//      feeds the count member (build form: 0 → no badge)
//   AC6 主路径 — not-found card, docsLost lost-card seams, skeleton
//
// Discipline note: render() ONCE per view, then waitFor(assertion) — never
// render() inside waitFor's polling callback.
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkbenchShell } from '../src/client/WorkbenchShell.tsx'
import { ProposalsPage } from '../src/client/views/ProposalsPage.tsx'
import { en, type WorkbenchKey } from '../src/client/locale/en.ts'
import type { WorkbenchShellProps } from '../src/client/contract.ts'
import type { ViewKeySnapshot, WorkbenchTabKey } from '../src/client/store/view-key.ts'
import {
  MOCK_EMPTY_WORKBENCH_STATE, MOCK_PROPOSAL_BOARD, MOCK_WORKBENCH_STATE, createMockProposalsFace,
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
 * A controllable view face (the shell.spec pattern, extended with the 5.5
 * proposal members): `set` mutates the snapshot the selector reads; the
 * action members record the shell's machine transitions.
 */
function makeFace(initial: Partial<ViewKeySnapshot> = {}): {
  props: Pick<WorkbenchShellProps, 'useViewKey' | 'selectWorkbenchTab' | 'openFeatureDetail' | 'openProposalDetail'>
  snapshot: () => ViewKeySnapshot
} {
  let snapshot: ViewKeySnapshot = {
    view: 'workbench',
    workbenchTab: 'workbench/overview',
    featureSlug: undefined,
    proposalSlug: undefined,
    ...initial,
  }
  const props = {
    useViewKey: (selector: (current: ViewKeySnapshot) => ViewKeySnapshot) => selector(snapshot),
    selectWorkbenchTab: (tab: WorkbenchTabKey) => {
      snapshot = { ...snapshot, workbenchTab: tab, featureSlug: undefined, proposalSlug: undefined }
    },
    openFeatureDetail: (slug: string) => {
      snapshot = { ...snapshot, workbenchTab: 'workbench/features', featureSlug: slug, proposalSlug: undefined }
    },
    openProposalDetail: (slug: string) => {
      snapshot = { ...snapshot, workbenchTab: 'workbench/proposals', proposalSlug: slug, featureSlug: undefined }
    },
  }
  return { props, snapshot: () => snapshot }
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
// AC1/AC2: the shell-level assembly — second tab, reserved containers, gate
// ---------------------------------------------------------------------------

describe('WorkbenchShell × proposals tab (AC1/AC2)', () => {
  it('mounts the ProposalsPage on the SECOND tab over the mock registry (build form)', async () => {
    const face = makeFace({ workbenchTab: 'workbench/proposals' })
    render(<WorkbenchShell t={t.en as WorkbenchShellProps['t']} {...face.props} />)
    // The strip order is the M3 revision: 概览/提案/Feature/任务 — 提案 second.
    const tabs = Array.from(document.querySelectorAll('[data-dsh-forge-tab]'))
    expect(tabs.map(tab => tab.getAttribute('data-dsh-forge-tab'))).toEqual([
      'workbench/overview', 'workbench/proposals', 'workbench/features', 'workbench/tasks',
    ])
    expect(document.querySelector('[data-dsh-forge-view="dsh-forge-view-proposals"]')).not.toBeNull()
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-proposal-row="dsh-forge-m2"]')).not.toBeNull()
    })
  })

  it('no active project: the proposals tab presents the guidance card, not an error', () => {
    const face = makeFace({ workbenchTab: 'workbench/proposals' })
    render(
      <WorkbenchShell
        t={t.en as WorkbenchShellProps['t']} {...face.props}
        workbenchState={MOCK_EMPTY_WORKBENCH_STATE}
      />,
    )
    expect(document.querySelector('[data-dsh-forge-gate]')).not.toBeNull()
    expect(document.querySelector('[data-dsh-forge-view="dsh-forge-view-proposals"]')).toBeNull()
  })

  it('the proposal-detail subview addresses its own reserved container (:slug)', async () => {
    const face = makeFace({ workbenchTab: 'workbench/proposals', proposalSlug: 'dsh-forge-m2' })
    render(<WorkbenchShell t={t.en as WorkbenchShellProps['t']} {...face.props} />)
    expect(document.querySelector('[data-dsh-forge-view="dsh-forge-view-proposal-detail"]')).not.toBeNull()
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-proposal-detail="dsh-forge-m2"]')).not.toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------
// AC1/AC3: the round trips — detail enter/return, feature 互跳, project context
// ---------------------------------------------------------------------------

describe('WorkbenchShell × proposals navigation round trips (AC1/AC3)', () => {
  it('detail enter → breadcrumb back returns to the board; the list seat stayed mounted (返回不重拉)', async () => {
    const face = makeFace({ workbenchTab: 'workbench/proposals' })
    const view = render(<WorkbenchShell t={t.en as WorkbenchShellProps['t']} {...face.props} />)
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-proposal-row="dsh-forge-m2"]')).not.toBeNull()
    })
    // Enter the detail through the row (the page's open seam → the machine).
    fireEvent.click(document.querySelector('[data-dsh-forge-proposal-row="dsh-forge-m2"]') as HTMLElement)
    expect(face.snapshot().proposalSlug).toBe('dsh-forge-m2')
    expect(face.snapshot().workbenchTab).toBe('workbench/proposals')
    view.rerender(<WorkbenchShell t={t.en as WorkbenchShellProps['t']} {...face.props} />)
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-proposal-detail="dsh-forge-m2"]')).not.toBeNull()
    })
    // The LIST seat stays mounted (hidden) while the detail is open — the
    // board data survives the round trip by construction.
    const seat = document.querySelector('[data-dsh-forge-proposal-list-seat]')
    expect(seat).not.toBeNull()
    expect(seat?.hasAttribute('hidden')).toBe(true)
    expect(seat?.querySelector('[data-dsh-forge-proposal-row="dsh-forge-m2"]')).not.toBeNull()
    // The breadcrumb return fires the machine's tab action (slug cleared).
    fireEvent.click(document.querySelector('[data-dsh-forge-proposal-back]') as HTMLButtonElement)
    expect(face.snapshot().proposalSlug).toBeUndefined()
    view.rerender(<WorkbenchShell t={t.en as WorkbenchShellProps['t']} {...face.props} />)
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-proposal-detail="dsh-forge-m2"]')).toBeNull()
    })
    expect(document.querySelector('[data-dsh-forge-proposal-list-seat]')?.hasAttribute('hidden')).toBe(false)
  })

  it('feature 徽标 互跳: the badge routes through openFeatureDetail; the 提案 tab is the return path', async () => {
    const face = makeFace({ workbenchTab: 'workbench/proposals' })
    render(<WorkbenchShell t={t.en as WorkbenchShellProps['t']} {...face.props} />)
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-proposal-row="dsh-forge-m3"]')).not.toBeNull()
    })
    // The row's feature badge (dsh-forge-m3's association) jumps WITHOUT
    // opening the row's own detail (stopPropagation, the 5.4 contract).
    fireEvent.click(document.querySelector('[data-dsh-forge-proposal-feature-jump="dsh-forge-m3"]') as HTMLButtonElement)
    expect(face.snapshot()).toMatchObject({
      workbenchTab: 'workbench/features',
      featureSlug: 'dsh-forge-m3',
      proposalSlug: undefined,
    })
  })

  it('a tab round trip never touches the chrome project context (AC3)', async () => {
    const face = makeFace({ workbenchTab: 'workbench/proposals' })
    const view = render(<WorkbenchShell t={t.en as WorkbenchShellProps['t']} {...face.props} />)
    const before = (document.querySelector('[data-dsh-forge-switcher-trigger]') as HTMLElement).textContent
    for (const tab of ['workbench/overview', 'workbench/tasks', 'workbench/proposals'] as const) {
      fireEvent.click(document.querySelector(`[data-dsh-forge-tab="${tab}"]`) as HTMLButtonElement)
      view.rerender(<WorkbenchShell t={t.en as WorkbenchShellProps['t']} {...face.props} />)
    }
    // Same active project after the round trip (tab switching is view-only).
    expect((document.querySelector('[data-dsh-forge-switcher-trigger]') as HTMLElement).textContent).toBe(before)
    expect(before).toContain('dsh-forge')
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-proposal-row]')).not.toBeNull()
    })
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
