// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TaskBoardPage } from '../src/client/views/TaskBoardPage.tsx'
import type { TaskBoardPageProps } from '../src/client/views/TaskBoardPage.tsx'
import { en, type WorkbenchKey } from '../src/client/locale/en.ts'
import {
  createMockDispatchFace, createMockTaskBoardFace, MOCK_TASK_BOARD,
  type MockDispatchFace,
} from '../src/client/mocks/workbench.ts'
import type {
  ApprovalRow, DispatchRow, DispatchState, MissingItem, TaskBoardData, WorkbenchEvent,
} from '../src/client/ipc-types.ts'

// Task 3.9 — the UF1 integration units (mock board face + mock dispatch
// face over the REAL page; the IPC face is the same seam one layer down).
// AC map:
//   AC1 toolbar(M2 控件不动/右侧追加/审批 N 计数/选择模式下 M2 浏览可用)
//   AC2 三视图接线(checkbox overlay/inline、⤢、整面勾选、disabled 原因、
//       角标谱、awaiting 角标 → dock 定位)
//   AC3 侧板编排(派发执行同位演进、编排分区于执行记录之上、dock 互斥 +
//       往返恢复)
//   AC4 事件回流(dispatch_updated/approval_received 驱动角标与计数;过滤
//       不重置;播报节流)
//   AC5 选择模式 → 勾选 → warning/confirm 链 → 派发 → 角标呈现
//   AC6 回归 = 本套 + 既有全套绿(M2 build-stage 形态由既有用例持有)

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  StateDot: (props: { state: string }) => <span data-mock-state-dot={props.state} />,
}))
vi.mock('@xyflow/react', async () => await import('./helpers/xyflow-standin'))

type Dict = Record<WorkbenchKey, string>
const bind = (dict: Dict) => (key: WorkbenchKey): string => dict[key]
const t = bind(en)

// jsdom does not implement scrollIntoView (the approval locate leg calls it).
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROJECT = 'p1'

/** One dispatch row fixture (the seed set is the mock face's initial rows). */
function row(key: string, state: DispatchState, overrides: Partial<DispatchRow> = {}): DispatchRow {
  return {
    id: `dsp-${key}`,
    batchId: 'batch-seed',
    projectId: PROJECT,
    featureSlug: key.slice(0, key.lastIndexOf('/')),
    taskKey: key,
    state,
    sessionId: state === 'running' || state === 'awaiting' ? `session-${key}` : null,
    promptHash: `hash-${key}`,
    actor: 'workbench',
    dispatchedAt: '2026-09-24T07:00:00.000Z',
    endedAt: null,
    error: null,
    ...overrides,
  }
}

function approval(id: string, taskKey: string, dispatchId: string): ApprovalRow {
  return {
    id,
    dispatchId,
    projectId: PROJECT,
    taskKey,
    sessionId: `session-${taskKey}`,
    payload: '执行 git commit(工作区写入)—— 请审批。',
    state: 'pending',
    createdAt: '2026-09-24T07:00:00.000Z',
    decidedAt: null,
    decidedBy: null,
  }
}

const MISSING: readonly MissingItem[] = Object.freeze([
  Object.freeze({
    stage: 'tasks', rule: 'file-missing',
    artifact: 'docs/features/demo/design/tech-design.md',
    detail: 'expected file missing',
  }),
])

/**
 * The board face facade: the mock twin with a MULTI-listener emit poke (the
 * page's presentation leg AND the approval dock's reflux leg both subscribe
 * since 3.9 — the real channel multiplexes over one preload subscription).
 */
function makeBoardFace(initial: TaskBoardData = MOCK_TASK_BOARD) {
  const base = createMockTaskBoardFace(initial)
  const listeners = new Set<(events: readonly WorkbenchEvent[]) => void>()
  const face = {
    loadBoard: vi.fn(base.loadBoard),
    subscribeEvents: vi.fn((callback: (events: readonly WorkbenchEvent[]) => void) => {
      listeners.add(callback)
      return () => { listeners.delete(callback) }
    }),
  }
  return Object.assign(face, {
    emit: (events: readonly WorkbenchEvent[]) => { for (const listener of listeners) listener(events) },
  })
}

type BoardFace = ReturnType<typeof makeBoardFace>

/** Render the page with the dispatch face live; wires the twin's reflux. */
async function renderBoard(options: {
  board?: BoardFace
  dispatch?: MockDispatchFace
  props?: Partial<TaskBoardPageProps>
  /** The view to settle into after the load (the page boots on 视图 A, the DAG). */
  view?: 'tree' | 'grouped' | 'list'
} = {}) {
  const board = options.board ?? makeBoardFace()
  const dispatch = options.dispatch ?? createMockDispatchFace({ projectId: PROJECT })
  dispatch.pipe(events => board.emit(events))
  const props: TaskBoardPageProps = {
    t,
    projectId: PROJECT,
    face: board,
    dispatchFace: dispatch,
    ...options.props,
  }
  render(<TaskBoardPage {...props} />)
  await waitFor(() => {
    expect(document.querySelector('[data-dsh-forge-task-toolbar]')).not.toBeNull()
  })
  const view = options.view ?? 'grouped'
  switchView(view)
  await waitFor(() => {
    expect(document.querySelector(`[data-dsh-forge-board-panel="${view}"]`)).not.toBeNull()
  })
  return { board, dispatch }
}

const q = <E extends Element = HTMLElement>(selector: string): E =>
  document.querySelector(selector) as E
const qa = (selector: string): Element[] => Array.from(document.querySelectorAll(selector))

const card = (key: string): HTMLElement => q(`[data-dsh-forge-task-card="${key}"]`)
const chk = (key: string): HTMLInputElement =>
  q(`[data-dsh-forge-select-chk="${key}"] [data-dsh-forge-select-chk-input]`) as HTMLInputElement
const listRow = (key: string): HTMLElement => q(`[data-dsh-forge-task-row="${key}"]`)

function switchView(view: 'tree' | 'grouped' | 'list'): void {
  fireEvent.click(q(`[data-dsh-forge-board-view="${view}"]`))
}

async function settleList(): Promise<void> {
  switchView('list')
  await waitFor(() => {
    expect(document.querySelector('[data-dsh-forge-task-list]')).not.toBeNull()
  })
}

/** Enter selection mode through the toolbar entry. */
function enterSelection(): void {
  fireEvent.click(q('[data-dsh-forge-dispatch-entry]'))
}

// ---------------------------------------------------------------------------
// AC1 — the toolbar
// ---------------------------------------------------------------------------

describe('AC1: toolbar — M2 controls untouched, 派发/审批 N appended', () => {
  it('without a dispatch face the 派发 entry is disabled + tooltip; the M2 controls and single search input are untouched', async () => {
    const board = makeBoardFace()
    render(<TaskBoardPage t={t} projectId={PROJECT} face={board} />)
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-task-toolbar]')).not.toBeNull()
    })
    const entry = q<HTMLButtonElement>('[data-dsh-forge-dispatch-entry]')
    expect(entry.disabled).toBe(true)
    expect(entry.getAttribute('title')).toBe(en['tasks.dispatch.entry.disabledTooltip'])
    expect(entry.getAttribute('data-dsh-forge-dispatch-entry-active')).toBe('false')
    // The M2 controls render beside it; the toolbar still owns exactly ONE
    // input (the search box — the read-only discipline's toolbar face).
    expect(qa('[data-dsh-forge-task-toolbar] button[role="tab"]')).toHaveLength(3)
    expect(qa('[data-dsh-forge-task-toolbar] input, [data-dsh-forge-task-toolbar] select, [data-dsh-forge-task-toolbar] textarea')).toHaveLength(1)
    // The dispatch verbs never fire on this form.
    expect(board.loadBoard).toHaveBeenCalledTimes(1)
  })

  it('a live face enables 派发 (a dispatchable task exists); 审批 N appears with the seeded count and opens the dock', async () => {
    const rows = [row('dsh-forge-m2/6.1', 'awaiting')]
    const dispatch = createMockDispatchFace({
      projectId: PROJECT, rows, approvals: [approval('ap-1', 'dsh-forge-m2/6.1', 'dsp-dsh-forge-m2/6.1')],
    })
    await renderBoard({ dispatch })
    const entry = q<HTMLButtonElement>('[data-dsh-forge-dispatch-entry]')
    expect(entry.disabled).toBe(false)
    await waitFor(() => {
      expect(q('[data-dsh-forge-approval-entry]')).not.toBeNull()
    })
    expect(q('[data-dsh-forge-approval-entry]').getAttribute('data-dsh-forge-approval-entry-count')).toBe('1')
    fireEvent.click(q('[data-dsh-forge-approval-entry]'))
    await waitFor(() => {
      expect(q('[data-dsh-forge-approval-panel]')).not.toBeNull()
    })
  })

  it('M2 read-only browsing stays usable INSIDE selection mode (view switch + live filter)', async () => {
    await renderBoard()
    enterSelection()
    expect(q('[data-dsh-forge-dispatch-float-bar]')).not.toBeNull()
    // View switch keeps working (Hard Rule: no state reset).
    await settleList()
    expect(q('[data-dsh-forge-task-list]')).not.toBeNull()
    // The search filter applies live (the no-match card, not an error).
    fireEvent.change(q('[data-dsh-forge-tasks-search]'), { target: { value: 'zzz-no-such-task' } })
    await waitFor(() => {
      expect(q('[data-dsh-forge-task-board-nomatch]')).not.toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------
// AC2 — the three views
// ---------------------------------------------------------------------------

describe('AC2: selection mode covers the three views; badges ride cards/rows', () => {
  it('checkboxes mount per view: B card overlay, C row-first inline cell, A node card', async () => {
    await renderBoard()
    enterSelection()
    // B: overlay checkbox on the card.
    expect(chk('dsh-forge-m1/7.2')).not.toBeNull()
    switchView('list')
    await waitFor(() => {
      expect(chk('dsh-forge-m1/7.2')).not.toBeNull()
    })
    // The C cell is the row's FIRST cell (checkbox 内嵌行首).
    expect(listRow('dsh-forge-m1/7.2').querySelector('td')?.contains(chk('dsh-forge-m1/7.2'))).toBe(true)
    switchView('tree')
    await waitFor(() => {
      expect(q('[data-dsh-forge-node-card="dsh-forge-m1/7.2"] [data-dsh-forge-select-chk-input]')).not.toBeNull()
    })
    // Exit: every face self-hides.
    fireEvent.keyDown(q('[data-dsh-forge-node-card="dsh-forge-m1/7.2"]'), { key: 'Escape', bubbles: true })
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-select-chk-input]')).toBeNull()
    })
  })

  it('whole-surface click toggles (never opens the detail); ⤢ opens the dock WITHOUT leaving the mode', async () => {
    await renderBoard()
    enterSelection()
    fireEvent.click(card('dsh-forge-m1/7.2'))
    expect(q('[data-dsh-forge-dispatch-count]').textContent).toContain('1')
    expect(document.querySelector('[data-dsh-forge-task-detail]')).toBeNull()
    // A disabled entry's surface click is a no-op (the controller guards it).
    fireEvent.click(card('dsh-forge-m2/5.6'))
    expect(q('[data-dsh-forge-dispatch-count]').textContent).toContain('1')
    // ⤢ = the detail entry; the mode STAYS live.
    fireEvent.click(q('[data-dsh-forge-select-detail="dsh-forge-m2/5.6"]'))
    await waitFor(() => {
      expect(q('[data-dsh-forge-task-detail="dsh-forge-m2/5.6"]')).not.toBeNull()
    })
    expect(q('[data-dsh-forge-dispatch-float-bar]')).not.toBeNull()
    expect(chk('dsh-forge-m2/5.6')).not.toBeNull()
  })

  it('deps-unsatisfied and terminal entries carry disabled checkboxes + the reason tooltip', async () => {
    await renderBoard()
    enterSelection()
    const deps = chk('dsh-forge-m2/5.6') // blocker 5.5 in_progress
    expect(deps.disabled).toBe(true)
    expect(deps.getAttribute('title')).toBe(en['tasks.dispatch.disabled.deps'])
    const terminal = chk('dsh-forge-m2/5.2') // completed
    expect(terminal.disabled).toBe(true)
    expect(terminal.getAttribute('title')).toBe(en['tasks.dispatch.disabled.terminal'])
  })

  it('keyboard: Space toggles the focused card (M2 semantics overridden), Enter opens its detail', async () => {
    await renderBoard()
    enterSelection()
    const target = card('dsh-forge-m1/7.2')
    target.focus()
    fireEvent.keyDown(target, { key: ' ' })
    expect(q('[data-dsh-forge-dispatch-count]').textContent).toContain('1')
    expect(document.querySelector('[data-dsh-forge-task-detail]')).toBeNull()
    fireEvent.keyDown(target, { key: 'Enter' })
    await waitFor(() => {
      expect(q('[data-dsh-forge-task-detail="dsh-forge-m1/7.2"]')).not.toBeNull()
    })
    expect(q('[data-dsh-forge-dispatch-float-bar]')).not.toBeNull()
  })

  it('the badge spectrum rides the seeded cards/rows; the awaiting pill opens the dock LOCATED at its entry', async () => {
    const rows = [
      row('dsh-forge-m2/5.5', 'running'),
      row('dsh-forge-m2/6.1', 'awaiting'),
      row('dsh-forge-m2/3.9', 'failed', { error: 'subagent 退出码 1' }),
    ]
    const dispatch = createMockDispatchFace({
      projectId: PROJECT, rows, approvals: [approval('ap-1', 'dsh-forge-m2/6.1', 'dsp-dsh-forge-m2/6.1')],
    })
    await renderBoard({ dispatch })
    await waitFor(() => {
      expect(card('dsh-forge-m2/5.5').querySelector('[data-dsh-forge-orch-badge="running"]')).not.toBeNull()
    })
    expect(card('dsh-forge-m2/6.1').querySelector('[data-dsh-forge-orch-badge="awaiting"]')).not.toBeNull()
    expect(card('dsh-forge-m2/3.9').querySelector('[data-dsh-forge-orch-badge="failed"]')).not.toBeNull()
    // No row, no badge (the pure M2 card).
    expect(card('dsh-forge-m1/7.2').querySelector('[data-dsh-forge-orch-badge]')).toBeNull()
    // The awaiting pill = the card-side approval entry (locate face).
    fireEvent.click(card('dsh-forge-m2/6.1').querySelector('[data-dsh-forge-orch-jump]') as HTMLElement)
    await waitFor(() => {
      expect(q('[data-dsh-forge-approval-panel]')).not.toBeNull()
    })
    await waitFor(() => {
      expect(q('[data-dsh-forge-approval-located="true"]').getAttribute('data-dsh-forge-approval-task')).toBe('dsh-forge-m2/6.1')
    })
  })
})

// ---------------------------------------------------------------------------
// AC3 — the detail dock's orchestration + the dock mutex
// ---------------------------------------------------------------------------

describe('AC3: detail orchestration + the approval/detail mutex', () => {
  it('the dispatch form replaces the launch entry; the 编排 partition sits above 执行记录', async () => {
    const rows = [row('dsh-forge-m2/6.1', 'awaiting')]
    const dispatch = createMockDispatchFace({
      projectId: PROJECT, rows, approvals: [approval('ap-1', 'dsh-forge-m2/6.1', 'dsp-dsh-forge-m2/6.1')],
    })
    await renderBoard({ dispatch })
    fireEvent.click(card('dsh-forge-m2/6.1'))
    const dock = q('[data-dsh-forge-task-detail="dsh-forge-m2/6.1"]')
    await waitFor(() => {
      expect(dock.querySelector('[data-dsh-forge-orch-execute]')).not.toBeNull()
    })
    // ONE door: the M2 launch trigger is gone in the dispatch form.
    expect(dock.querySelector('[data-dsh-forge-launch-trigger][data-mount="panel-primary"]')).toBeNull()
    // The orchestration partition renders above the records section.
    const sections = Array.from(dock.querySelectorAll('[data-dsh-forge-detail-section]'))
      .map(section => section.getAttribute('data-dsh-forge-detail-section'))
    expect(sections.indexOf('orchestration')).toBeGreaterThan(-1)
    expect(sections.indexOf('orchestration')).toBeLessThan(sections.indexOf('records'))
    // The awaiting face carries 去审批 (the side-panel approval entry).
    expect(dock.querySelector('[data-dsh-forge-orch-go-approval]')).not.toBeNull()
  })

  it('派发执行 is disabled + tooltip on un-dispatchable tasks; the single-task chain runs check → confirm → dispatchTasks', async () => {
    const dispatch = createMockDispatchFace({ projectId: PROJECT })
    const spiedDispatchTasks = vi.fn(dispatch.dispatchTasks)
    dispatch.dispatchTasks = spiedDispatchTasks
    await renderBoard({ dispatch })
    // 6.1: blocker 5.15 pending → disabled + deps tooltip.
    fireEvent.click(card('dsh-forge-m2/6.1'))
    let dock = q('[data-dsh-forge-task-detail="dsh-forge-m2/6.1"]')
    await waitFor(() => {
      expect(dock.querySelector('[data-dsh-forge-orch-execute]')).not.toBeNull()
    })
    const blockedButton = dock.querySelector('[data-dsh-forge-orch-execute]') as HTMLButtonElement
    expect(blockedButton.disabled).toBe(true)
    expect(blockedButton.getAttribute('title')).toBe(en['tasks.dispatch.disabled.deps'])
    fireEvent.click(q('[data-dsh-forge-detail-close]'))
    // 7.2: dispatchable → the chain runs to the verb.
    fireEvent.click(card('dsh-forge-m1/7.2'))
    dock = q('[data-dsh-forge-task-detail="dsh-forge-m1/7.2"]')
    await waitFor(() => {
      expect((dock.querySelector('[data-dsh-forge-orch-execute]') as HTMLButtonElement).disabled).toBe(false)
    })
    fireEvent.click(dock.querySelector('[data-dsh-forge-orch-execute]') as HTMLButtonElement)
    await waitFor(() => {
      expect(q('[data-dsh-forge-dialog="dispatch-confirm"]')).not.toBeNull()
    })
    fireEvent.click(q('[data-dsh-forge-dispatch-confirm-go]'))
    await waitFor(() => {
      expect(spiedDispatchTasks).toHaveBeenCalledTimes(1)
    })
    expect(spiedDispatchTasks.mock.calls[0]![0]).toEqual({ projectId: PROJECT, taskKeys: ['dsh-forge-m1/7.2'] })
    expect(spiedDispatchTasks.mock.calls[0]![1]).toBe('workbench')
    // The dialog closes; the starting badge lands on the card (rows refresh).
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-dialog="dispatch-confirm"]')).toBeNull()
    })
    await waitFor(() => {
      expect(card('dsh-forge-m1/7.2').querySelector('[data-dsh-forge-orch-badge="starting"]')).not.toBeNull()
    })
  })

  it('the dock mutex + the 详情 ↗ round-trip: open-one-closes-other, 返回审批 restores entries', async () => {
    const rows = [row('dsh-forge-m2/6.1', 'awaiting')]
    const dispatch = createMockDispatchFace({
      projectId: PROJECT, rows, approvals: [approval('ap-1', 'dsh-forge-m2/6.1', 'dsp-dsh-forge-m2/6.1')],
    })
    await renderBoard({ dispatch })
    // Detail open first.
    fireEvent.click(card('dsh-forge-m2/6.1'))
    await waitFor(() => {
      expect(q('[data-dsh-forge-task-detail="dsh-forge-m2/6.1"]')).not.toBeNull()
    })
    // 审批 N → the dock; the detail closes (同层互斥).
    await waitFor(() => {
      expect(q('[data-dsh-forge-approval-entry]')).not.toBeNull()
    })
    fireEvent.click(q('[data-dsh-forge-approval-entry]'))
    await waitFor(() => {
      expect(q('[data-dsh-forge-approval-panel]')).not.toBeNull()
    })
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-task-detail]')).toBeNull()
    })
    // 详情 ↗ → the detail side, with the 返回审批 head; the dock hides.
    fireEvent.click(q('[data-dsh-forge-approval-detail="dsh-forge-m2/6.1"]'))
    await waitFor(() => {
      expect(q('[data-dsh-forge-task-detail="dsh-forge-m2/6.1"]')).not.toBeNull()
    })
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-approval-panel]')).toBeNull()
    })
    const backButton = q('[data-dsh-forge-approval-return]')
    expect(backButton.getAttribute('data-dsh-forge-approval-return-count')).toBe('1')
    // Return → the dock reopens with its entry preserved (往返恢复对侧状态).
    fireEvent.click(backButton)
    await waitFor(() => {
      expect(q('[data-dsh-forge-approval-panel]')).not.toBeNull()
    })
    await waitFor(() => {
      expect(q('[data-dsh-forge-approval-item="ap-1"]')).not.toBeNull()
    })
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-task-detail]')).toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------
// AC4 — the reflux
// ---------------------------------------------------------------------------

describe('AC4: dispatch_updated / approval_received drive badges + counts in place', () => {
  it('a decision refluxes the badge in place: filter preserved, board NOT reloaded', async () => {
    const rows = [row('dsh-forge-m2/6.1', 'awaiting')]
    const dispatch = createMockDispatchFace({
      projectId: PROJECT, rows, approvals: [approval('ap-1', 'dsh-forge-m2/6.1', 'dsp-dsh-forge-m2/6.1')],
    })
    const { board } = await renderBoard({ dispatch })
    const loadCallsAfterMount = (board.loadBoard as ReturnType<typeof vi.fn>).mock.calls.length
    await settleList()
    // A live filter that must survive the reflux.
    fireEvent.change(q('[data-dsh-forge-tasks-search]'), { target: { value: '6.1' } })
    await waitFor(() => {
      expect(listRow('dsh-forge-m2/6.1')).not.toBeNull()
    })
    // Reject the pending approval → the twin flips the row to failed + emits
    // dispatch_updated through the wired channel (the reflux under test).
    fireEvent.click(q('[data-dsh-forge-approval-entry]'))
    await waitFor(() => {
      expect(q('[data-dsh-forge-approval-reject="ap-1"]')).not.toBeNull()
    })
    fireEvent.click(q('[data-dsh-forge-approval-reject="ap-1"]'))
    await waitFor(() => {
      expect(listRow('dsh-forge-m2/6.1').querySelector('[data-dsh-forge-orch-badge="failed"]')).not.toBeNull()
    })
    // In place: the filter input survives; no board reload happened.
    expect(q('[data-dsh-forge-tasks-search]').value).toBe('6.1')
    expect((board.loadBoard as ReturnType<typeof vi.fn>).mock.calls.length).toBe(loadCallsAfterMount)
  })

  it('approval_received re-fires the dock refresh (subscription-driven counts)', async () => {
    const rows = [row('dsh-forge-m2/6.1', 'awaiting')]
    const dispatch = createMockDispatchFace({
      projectId: PROJECT, rows, approvals: [approval('ap-1', 'dsh-forge-m2/6.1', 'dsp-dsh-forge-m2/6.1')],
    })
    const spiedList = vi.fn(dispatch.listApprovals)
    dispatch.listApprovals = spiedList
    const { board } = await renderBoard({ dispatch })
    await waitFor(() => {
      expect(q('[data-dsh-forge-approval-entry-count="1"]')).not.toBeNull()
    })
    const callsBefore = spiedList.mock.calls.length
    act(() => {
      board.emit([{ type: 'approval_received', projectId: PROJECT, approvalId: 'ap-2', taskKey: 'dsh-forge-m2/5.6' }])
    })
    await waitFor(() => {
      expect(spiedList.mock.calls.length).toBeGreaterThan(callsBefore)
    })
  })

  it('the throttled announce region: batch reflux aggregates into ONE line after the window', async () => {
    const rows = [row('dsh-forge-m2/5.5', 'running'), row('dsh-forge-m2/3.9', 'failed')]
    const dispatch = createMockDispatchFace({ projectId: PROJECT, rows })
    const { board } = await renderBoard({ dispatch })
    await waitFor(() => {
      expect(card('dsh-forge-m2/5.5').querySelector('[data-dsh-forge-orch-badge="running"]')).not.toBeNull()
    })
    vi.useFakeTimers()
    act(() => {
      board.emit([
        { type: 'dispatch_updated', projectId: PROJECT, dispatchId: 'dsp-a', taskKey: 'dsh-forge-m2/5.5', state: 'done' },
        { type: 'dispatch_updated', projectId: PROJECT, dispatchId: 'dsp-b', taskKey: 'dsh-forge-m2/3.9', state: 'starting' },
      ])
    })
    const region = q('[data-dsh-forge-board-orch-announce]')
    expect(region.getAttribute('aria-live')).toBe('polite')
    // Inside the 2s window: nothing announced yet (终态 wins aggregation).
    act(() => { vi.advanceTimersByTime(1000) })
    expect(region.textContent).toBe('')
    act(() => { vi.advanceTimersByTime(1200) })
    expect(region.textContent).toBe(en['tasks.orch.announce.batchMixed'].replace('{count}', '2'))
  })
})

// ---------------------------------------------------------------------------
// AC5 — the selection chain end-to-end
// ---------------------------------------------------------------------------

describe('AC5: the selection chain — enter → check → warning/confirm → dispatch → badges', () => {
  it('runs the whole chain with the missing-artifacts warning door (acknowledge face) and exits selection on success', async () => {
    const dispatch = createMockDispatchFace({ projectId: PROJECT, missing: MISSING })
    const spiedDispatchTasks = vi.fn(dispatch.dispatchTasks)
    dispatch.dispatchTasks = spiedDispatchTasks
    await renderBoard({ dispatch })
    enterSelection()
    fireEvent.click(card('dsh-forge-m1/7.2'))
    expect(q('[data-dsh-forge-dispatch-count]').textContent).toContain('1')
    fireEvent.click(q('[data-dsh-forge-dispatch-go]'))
    // The armed missing list → the WARNING door first (warn, never block).
    await waitFor(() => {
      expect(q('[data-dsh-forge-dialog="dispatch-warning"]')).not.toBeNull()
    })
    expect(q('[data-dsh-forge-dispatch-missing-item]').textContent).toContain(MISSING[0]!.artifact)
    // Esc on the dialog keeps the selection (分层).
    fireEvent.keyDown(q('[data-dsh-forge-dialog="dispatch-warning"]'), { key: 'Escape' })
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-dialog="dispatch-warning"]')).toBeNull()
    })
    expect(q('[data-dsh-forge-dispatch-float-bar]')).not.toBeNull()
    expect(q('[data-dsh-forge-dispatch-count]').textContent).toContain('1')
    // Again → 继续派发 (acknowledgeMissing) → confirming → 派发.
    fireEvent.click(q('[data-dsh-forge-dispatch-go]'))
    await waitFor(() => {
      expect(q('[data-dsh-forge-dialog="dispatch-warning"]')).not.toBeNull()
    })
    fireEvent.click(q('[data-dsh-forge-dispatch-warning-continue]'))
    await waitFor(() => {
      expect(q('[data-dsh-forge-dialog="dispatch-confirm"]')).not.toBeNull()
    })
    fireEvent.click(q('[data-dsh-forge-dispatch-confirm-go]'))
    await waitFor(() => {
      expect(spiedDispatchTasks).toHaveBeenCalledTimes(1)
    })
    expect(spiedDispatchTasks.mock.calls[0]![0]).toEqual({
      projectId: PROJECT, taskKeys: ['dsh-forge-m1/7.2'], acknowledgeMissing: true,
    })
    // Success exits selection (ui-design) and the starting badge lands.
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-dispatch-float-bar]')).toBeNull()
    })
    await waitFor(() => {
      expect(card('dsh-forge-m1/7.2').querySelector('[data-dsh-forge-orch-badge="starting"]')).not.toBeNull()
    })
  })
})
