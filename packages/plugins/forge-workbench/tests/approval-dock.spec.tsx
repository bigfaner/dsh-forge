// @vitest-environment jsdom
// Task 3.7 — the UF1 审批 dock + 编排角标谱 BUILD units (mock verbs; 3.9
// wires the TaskBoardPage integration + the detail-dock mutex). AC map:
//   AC1 角标谱:五态与 dispatch.state 一一对应(映射表)+ 未知值兜底 = 数据
//      原值透出中性 Pill;「待审批」可点 = 打开 dock 并滚动定位对应条目
//   AC2 审批操作:批准/拒绝仅显式点击;批准 → 条目滑出 + 播报回执行中;
//      拒绝 → 播报转失败;N-1 同步(工具栏按钮 + tab 徽标 via onCountChange)
//   AC3 「详情 ↗」/「◂ 返回审批(N)」往返:关闭期状态保留(剩余条目 +
//      滚动位置恢复),上下文不断路
//   AC4 approval_received 事件 → 订阅驱动刷新(dock 关闭时计数仍更新,
//      免手动刷新);aria-live 播报节流口径(2s 窗口终态 + 批量聚合计数
//      + 审批计数单列)
//   AC5 失效/已决条目操作 → 刷新 + toast(ERR_APPROVAL_DECIDED 路径)
//   AC6 = 本件本身(vitest + jsdom,mock 动词)
// Plus the pure-machine units (approvalDockReducer / approvalRequestText /
// createDispatchAnnouncer / ORCH_BADGE_SPECS).
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkbenchEvent } from '../src/client/ipc-types.ts'

// The upstream StateDot resolves through the module table at runtime; the
// npm node entry carries undeclared transitive deps only the upstream
// monorepo supplies, so jsdom renders a stub (task-detail-panel.spec
// precedent — the real dot rides the e2e). The dock reuses TaskDetailPanel's
// DETAIL_DOCK_* constants, and that module graph reaches the real ReactFlow
// (d3-zoom + ResizeObserver, absent in jsdom) — the standin keeps it inert.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  StateDot: (props: { state: string }) => <span data-mock-state-dot={props.state} />,
}))
vi.mock('@xyflow/react', async () => await import('./helpers/xyflow-standin'))

import { en, type WorkbenchKey } from '../src/client/locale/en.ts'
import { zh } from '../src/client/locale/zh.ts'
import {
  createDispatchAnnouncer, DispatchBadge, isDispatchState, ORCH_BADGE_SPECS, orchAnnounceText,
  ORCH_DONE_FLASH_MS,
} from '../src/client/views/tasks/dispatch/DispatchBadge.tsx'
import {
  ApprovalCountBadge, ApprovalToolbarButton,
} from '../src/client/views/tasks/dispatch/ApprovalCountBadge.tsx'
import {
  ApprovalPanel, ApprovalReturnButton, approvalDockReducer, approvalRequestText, APPROVAL_ACTOR,
  INITIAL_APPROVAL_DOCK, localIdOfTaskKey, pendingApprovals, useApprovals,
  type ApprovalRow, type ApprovalVerbs, type DecideApprovalInput,
} from '../src/client/views/tasks/dispatch/ApprovalPanel.tsx'

type Dict = Record<WorkbenchKey, string>
const bind = (dict: Dict) => (key: WorkbenchKey): string => dict[key]
const t = { en: bind(en), zh: bind(zh) }

const PROJECT_ID = 'proj-approval-1'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const approvalRow = (over: Partial<ApprovalRow> = {}): ApprovalRow => ({
  id: 'ap-1',
  dispatchId: 'd-1',
  projectId: PROJECT_ID,
  taskKey: 'alpha/2.3',
  sessionId: 'sess-1',
  payload: '执行 git commit —— 需写入工作区并创建提交(工作区写入),请审批。',
  state: 'pending',
  createdAt: '2026-09-24T08:00:00.000Z',
  decidedAt: null,
  decidedBy: null,
  ...over,
})

const ROWS: readonly ApprovalRow[] = [
  approvalRow(),
  approvalRow({ id: 'ap-2', dispatchId: 'd-2', taskKey: 'alpha/2.5', createdAt: '2026-09-24T08:01:00.000Z' }),
]

/** The programmable mock verbs: rows swap per test, every call recorded. */
function makeVerbs(initial: readonly ApprovalRow[]) {
  const calls = {
    list: [] as string[],
    decide: [] as Array<{ input: DecideApprovalInput; actor: string }>,
  }
  let rows = initial.slice()
  let decideReject: unknown = null
  return {
    calls,
    setRows: (next: readonly ApprovalRow[]): void => { rows = next.slice() },
    /** Program the decide leg to reject (the ERR_APPROVAL_* path). */
    setDecideReject: (error: unknown): void => { decideReject = error },
    verbs: {
      listApprovals: async (projectId: string): Promise<ApprovalRow[]> => {
        calls.list.push(projectId)
        return rows.filter(row => row.state === 'pending')
      },
      decideApproval: async (input: DecideApprovalInput, actor: string): Promise<ApprovalRow> => {
        calls.decide.push({ input, actor })
        if (decideReject !== null) throw decideReject
        const row = rows.find(candidate => candidate.id === input.approvalId)
        if (row === undefined) throw { code: 'ERR_APPROVAL_NOT_FOUND', message: '审批条目不存在' }
        const decided: ApprovalRow = {
          ...row,
          state: input.approve ? 'approved' : 'rejected',
          decidedAt: '2026-09-24T09:00:00.000Z',
          decidedBy: actor,
        }
        rows = rows.map(candidate => (candidate.id === decided.id ? decided : candidate))
        return decided
      },
    } satisfies ApprovalVerbs,
  }
}

/** The events seam double (the contract's subscribeEvents shape). */
function makeEvents() {
  const listeners = new Set<(events: readonly WorkbenchEvent[]) => void>()
  return {
    emit: (events: readonly WorkbenchEvent[]): void => {
      for (const listener of listeners) listener(events)
    },
    subscribe: (callback: (events: readonly WorkbenchEvent[]) => void): (() => void) => {
      listeners.add(callback)
      return () => { listeners.delete(callback) }
    },
  }
}

const byHook = (selector: string): Element | null => document.querySelector(selector)
const hook = (selector: string): Element => {
  const found = byHook(selector)
  if (found === null) throw new Error(`missing ${selector}`)
  return found
}

/** Await the mount-time count load, then open the dock through the toolbar. */
async function openDock(): Promise<void> {
  await waitFor(() => { expect(byHook('[data-dsh-forge-approval-entry]')).not.toBeNull() })
  fireEvent.click(hook('[data-dsh-forge-approval-entry]'))
}

/** The standalone harness: toolbar entry + tab badge + dock + return button. */
function Harness(props: {
  verbs: ApprovalVerbs
  events?: ReturnType<typeof makeEvents> | undefined
  titleOf?: ((taskKey: string) => string | undefined) | undefined
  onDecided?: (row: ApprovalRow, approve: boolean) => void
  onCountChange?: (count: number) => void
  onOpenDetail?: (taskKey: string) => void
  onClose?: () => void
}) {
  const controller = useApprovals({
    projectId: PROJECT_ID,
    verbs: props.verbs,
    ...(props.events !== undefined ? { subscribeEvents: props.events.subscribe } : {}),
    ...(props.onDecided !== undefined ? { onDecided: props.onDecided } : {}),
    ...(props.onCountChange !== undefined ? { onCountChange: props.onCountChange } : {}),
  })
  // The 3.9 mutex stand-in: entering a detail from the dock closes the dock
  // (同层互斥) — the round-trip's detour leg the return button reverses.
  const openDetail = (taskKey: string): void => {
    props.onOpenDetail?.(taskKey)
    controller.close()
  }
  return (
    <div>
      <ApprovalToolbarButton t={t.zh} count={controller.pendingCount} onOpen={() => { controller.open() }} />
      <span style={{ position: 'relative' }}>
        <span>任务</span>
        <ApprovalCountBadge t={t.zh} count={controller.pendingCount} />
      </span>
      <DispatchBadge t={t.zh} taskKey="alpha/2.5" state="awaiting" onOpenApproval={(key) => { controller.open(key) }} />
      <ApprovalPanel
        controller={controller}
        t={t.zh}
        {...(props.titleOf !== undefined ? { titleOf: props.titleOf } : {})}
        onOpenDetail={openDetail}
        onClose={props.onClose}
      />
      <ApprovalReturnButton t={t.zh} count={controller.pendingCount} onReturn={() => { controller.open() }} />
    </div>
  )
}

beforeEach(() => {
  // jsdom does not implement scrollIntoView (the locate leg calls it).
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Pure units — the 角标谱 mapping table + the announce throttle (AC1/AC4)
// ---------------------------------------------------------------------------

describe('orch badge spectrum (AC1)', () => {
  it('maps the five dispatch states one-to-one (tones + breathing + clickable + flash)', () => {
    expect(ORCH_BADGE_SPECS.starting).toMatchObject({ tone: 'outline', breathing: false, clickable: false })
    expect(ORCH_BADGE_SPECS.running).toMatchObject({ tone: 'blue', breathing: true, clickable: false })
    expect(ORCH_BADGE_SPECS.awaiting).toMatchObject({ tone: 'warn', breathing: false, clickable: true })
    expect(ORCH_BADGE_SPECS.failed).toMatchObject({ tone: 'error', breathing: false, clickable: false })
    expect(ORCH_BADGE_SPECS.done).toMatchObject({ tone: 'success', flashThenFallback: true })
    expect(isDispatchState('running')).toBe(true)
    expect(isDispatchState('mystery')).toBe(false)
  })

  it('renders each state with its label; running carries the breathing dot', () => {
    const { rerender } = render(<DispatchBadge t={t.zh} taskKey="alpha/2.3" state="starting" />)
    expect(hook('[data-dsh-forge-orch-badge="starting"]').textContent).toBe('待启动')
    rerender(<DispatchBadge t={t.zh} taskKey="alpha/2.3" state="running" />)
    expect(hook('[data-dsh-forge-orch-badge="running"]').textContent).toBe('执行中')
    expect(byHook('[data-dsh-forge-orch-dot]')).not.toBeNull()
    rerender(<DispatchBadge t={t.zh} taskKey="alpha/2.3" state="failed" />)
    expect(hook('[data-dsh-forge-orch-badge="failed"]').textContent).toBe('失败')
    expect(byHook('[data-dsh-forge-orch-dot]')).toBeNull()
    rerender(<DispatchBadge t={t.zh} taskKey="alpha/2.3" state="running" />)
    // en dictionary routes through the same table (上游 locale 机制).
    rerender(<DispatchBadge t={t.en} taskKey="alpha/2.3" state="running" />)
    expect(hook('[data-dsh-forge-orch-badge="running"]').textContent).toBe('Running')
  })

  it('unknown states render the RAW value in a neutral pill (数据原值透出)', () => {
    render(<DispatchBadge t={t.zh} taskKey="alpha/2.3" state="mystery-state" />)
    const badge = hook('[data-dsh-forge-orch-badge="mystery-state"]')
    expect(badge.textContent).toBe('mystery-state')
    expect(badge.getAttribute('data-dsh-forge-orch-unknown')).toBe('true')
  })

  it('awaiting is a NATIVE button: click opens the dock locator; aria-label carries the 全称', () => {
    const onOpen = vi.fn()
    render(<DispatchBadge t={t.zh} taskKey="alpha/2.5" state="awaiting" onOpenApproval={onOpen} />)
    const badge = hook('[data-dsh-forge-orch-badge="awaiting"]')
    expect(badge.tagName).toBe('BUTTON')
    expect(badge.getAttribute('aria-label')).toContain('alpha/2.5')
    expect(badge.getAttribute('aria-label')).toContain('待审批')
    fireEvent.click(badge)
    expect(onOpen).toHaveBeenCalledWith('alpha/2.5')
  })

  it('done flashes success 0.3s then falls back to the normal status pill (回落)', () => {
    vi.useFakeTimers()
    const { rerender } = render(
      <DispatchBadge t={t.zh} taskKey="alpha/2.3" state="done" fallback={<span data-fallback="">已完成</span>} />,
    )
    expect(hook('[data-dsh-forge-orch-badge="done"]').textContent).toBe('已提交')
    act(() => { vi.advanceTimersByTime(ORCH_DONE_FLASH_MS) })
    expect(byHook('[data-dsh-forge-orch-badge="done"]')).toBeNull()
    expect(hook('[data-fallback]').textContent).toBe('已完成')
    // Without a fallback the badge renders nothing after the flash.
    rerender(<DispatchBadge t={t.zh} taskKey="alpha/2.3" state="done" />)
    act(() => { vi.advanceTimersByTime(ORCH_DONE_FLASH_MS) })
    expect(byHook('[data-dsh-forge-orch-badge="done"]')).toBeNull()
  })
})

describe('aria-live 播报节流 (AC4 口径)', () => {
  it('announces ONLY the final state inside the 2s window (per task)', () => {
    const announcer = createDispatchAnnouncer()
    announcer.pushState('alpha/1.2', 'starting')
    expect(announcer.drain(0)).toEqual([]) // anchors the window, emits nothing
    announcer.pushState('alpha/1.2', 'running')
    announcer.pushState('alpha/1.2', 'awaiting')
    expect(announcer.drain(1999)).toEqual([]) // still inside the window
    expect(announcer.drain(2000)).toEqual([{ kind: 'task', taskKey: 'alpha/1.2', state: 'awaiting' }])
    // The window does NOT restart on later pushes (no starvation): a fresh
    // push re-anchors only once drained.
    announcer.pushState('alpha/1.2', 'done')
    announcer.drain(4000)
    expect(announcer.drain(6000)).toEqual([{ kind: 'task', taskKey: 'alpha/1.2', state: 'done' }])
  })

  it('aggregates a batch into ONE count line; single tasks stay per-task', () => {
    const announcer = createDispatchAnnouncer()
    announcer.pushState('alpha/1.2', 'running')
    announcer.pushState('alpha/1.3', 'running')
    announcer.drain(0)
    expect(announcer.drain(2000)).toEqual([{ kind: 'batch', count: 2, state: 'running' }])
    const mixed = createDispatchAnnouncer()
    mixed.pushState('alpha/1.2', 'running')
    mixed.pushState('alpha/1.3', 'failed')
    mixed.drain(0)
    expect(mixed.drain(2000)).toEqual([{ kind: 'batch', count: 2, state: null }])
  })

  it('approval count changes ride as their own single line (不并入批量)', () => {
    const announcer = createDispatchAnnouncer()
    announcer.pushApprovalCount(2)
    announcer.pushState('alpha/1.2', 'running')
    announcer.pushState('alpha/1.3', 'running')
    // The count line is NOT window-gated (no 2s wait): it emits at the first
    // drain after the change — its own single line, separate from any batch.
    expect(announcer.drain(0)).toEqual([{ kind: 'approval-count', count: 2 }])
    expect(announcer.drain(2000)).toEqual([{ kind: 'batch', count: 2, state: 'running' }])
    // An unchanged count announces nothing further.
    announcer.pushApprovalCount(2)
    announcer.drain(4000)
    expect(announcer.drain(6000)).toEqual([])
  })

  it('assembles the line copy through the locale halves', () => {
    expect(orchAnnounceText({ kind: 'task', taskKey: 'alpha/1.2', state: 'running' }, t.zh))
      .toBe('任务 alpha/1.2 进入执行中')
    expect(orchAnnounceText({ kind: 'batch', count: 3, state: 'running' }, t.zh))
      .toBe('3 个任务进入执行中')
    expect(orchAnnounceText({ kind: 'batch', count: 3, state: null }, t.en))
      .toBe('3 task orchestration states updated')
    expect(orchAnnounceText({ kind: 'approval-count', count: 2 }, t.zh)).toBe('2 项待审批')
  })
})

// ---------------------------------------------------------------------------
// Pure units — the approval dock machine
// ---------------------------------------------------------------------------

describe('approval machine (pure)', () => {
  it('approvalRequestText: strings verbatim, JSON pretty, null → null', () => {
    expect(approvalRequestText('执行 git commit')).toBe('执行 git commit')
    expect(approvalRequestText({ toolName: 'bash', arguments: { cmd: 'git commit' } })).toContain('"toolName"')
    expect(approvalRequestText(42)).toBe('42')
    expect(approvalRequestText(null)).toBeNull()
    expect(approvalRequestText(undefined)).toBeNull()
  })

  it('pendingApprovals filters to pending; localIdOfTaskKey splits the qualified key', () => {
    expect(pendingApprovals(ROWS)).toHaveLength(2)
    expect(pendingApprovals([...ROWS, approvalRow({ id: 'ap-3', state: 'approved', decidedAt: 'x' })])).toHaveLength(2)
    expect(localIdOfTaskKey('alpha/2.3')).toBe('2.3')
  })

  it('open → loading + locate; refreshResolved lands ready (open) or stays closed', () => {
    let state = approvalDockReducer(INITIAL_APPROVAL_DOCK, { type: 'open', locateTaskKey: 'alpha/2.5' })
    expect(state.phase).toBe('loading')
    expect(state.locateTaskKey).toBe('alpha/2.5')
    state = approvalDockReducer(state, { type: 'refreshResolved', rows: ROWS })
    expect(state.phase).toBe('ready')
    expect(state.entries).toHaveLength(2)
    state = approvalDockReducer(state, { type: 'close' })
    expect(state.phase).toBe('closed')
    // A refresh while closed keeps the dock closed but swaps the entries.
    state = approvalDockReducer(state, { type: 'refreshResolved', rows: [ROWS[0]!] })
    expect(state.phase).toBe('closed')
    expect(state.entries).toHaveLength(1)
  })

  it('the arrived announcement fires only when the pending set GROWS', () => {
    let state = approvalDockReducer(INITIAL_APPROVAL_DOCK, { type: 'open' })
    state = approvalDockReducer(state, { type: 'refreshResolved', rows: ROWS })
    expect(state.announcement).toEqual({ type: 'arrived', count: 2 })
    state = approvalDockReducer(state, { type: 'refreshResolved', rows: [ROWS[0]!] })
    expect(state.announcement).toEqual({ type: 'arrived', count: 2 }) // unchanged
  })

  it('decide: entry slides out (leaving) then prunes; reject keeps the failure envelope', () => {
    let state = approvalDockReducer(INITIAL_APPROVAL_DOCK, { type: 'open' })
    state = approvalDockReducer(state, { type: 'refreshResolved', rows: ROWS })
    state = approvalDockReducer(state, { type: 'decideStarted', approvalId: 'ap-1', approve: true })
    // decideStarted is ignored while not ready — here we ARE ready.
    expect(state.deciding).toEqual({ id: 'ap-1', approve: true })
    const decided = { ...ROWS[0]!, state: 'approved' as const }
    state = approvalDockReducer(state, { type: 'decideResolved', row: decided, approve: true })
    expect(state.entries).toHaveLength(1)
    expect(state.leaving.map(row => row.id)).toEqual(['ap-1'])
    expect(state.announcement).toEqual({ type: 'decided', taskKey: 'alpha/2.3', approve: true })
    state = approvalDockReducer(state, { type: 'pruneLeaving' })
    expect(state.leaving).toHaveLength(0)
    state = approvalDockReducer(state, { type: 'decideStarted', approvalId: 'ap-2', approve: false })
    state = approvalDockReducer(state, {
      type: 'decideFailed',
      error: { code: 'ERR_APPROVAL_DECIDED', message: '已决定' },
    })
    expect(state.error).toEqual({ code: 'ERR_APPROVAL_DECIDED', message: '已决定' })
    // Phase guards: decideStarted from loading is a no-op.
    let busy = approvalDockReducer(INITIAL_APPROVAL_DOCK, { type: 'open' })
    busy = approvalDockReducer(busy, { type: 'decideStarted', approvalId: 'ap-1', approve: true })
    expect(busy.deciding).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Components (jsdom) — the dock main path
// ---------------------------------------------------------------------------

describe('approval dock (jsdom)', () => {
  it('renders the pending entries with the 裁决对象优先 hierarchy; expand toggles the clamp (AC2/AC6)', async () => {
    const seat = makeVerbs(ROWS)
    render(
      <Harness
        verbs={seat.verbs}
        titleOf={key => (key === 'alpha/2.3' ? '实现 SQLite 迁移原子性' : undefined)}
      />,
    )
    await openDock()
    await waitFor(() => { expect(hook('[data-dsh-forge-approval-item="ap-1"]')).toBeTruthy() })
    // Header count + the discipline note (Hard Rule surfaces in copy).
    expect(hook('[data-dsh-forge-approval-header]').textContent).toContain('待审批(2)')
    expect(hook('[data-dsh-forge-approval-header]').textContent).toContain('无默认自动批准')
    // Task line: mono ID + resolved title (次文字); body 14/22 clamped.
    const first = hook('[data-dsh-forge-approval-item="ap-1"]')
    expect(first.textContent).toContain('2.3')
    expect(first.textContent).toContain('实现 SQLite 迁移原子性')
    expect(hook('[data-dsh-forge-approval-body]').getAttribute('data-dsh-forge-approval-clamped')).toBe('true')
    fireEvent.click(hook('[data-dsh-forge-approval-expand="ap-1"]'))
    expect(hook('[data-dsh-forge-approval-body]').getAttribute('data-dsh-forge-approval-clamped')).toBe('false')
    // An unresolved title falls back to the local id (never blocks).
    expect(hook('[data-dsh-forge-approval-item="ap-2"]').textContent).toContain('2.5')
  })

  it('批准 is an EXPLICIT click: verb carries the actor, entry slides out, N-1 syncs, announcement lands (AC2)', async () => {
    const seat = makeVerbs(ROWS)
    const onDecided = vi.fn()
    const onCountChange = vi.fn()
    render(<Harness verbs={seat.verbs} onDecided={onDecided} onCountChange={onCountChange} />)
    await openDock()
    await waitFor(() => { expect(hook('[data-dsh-forge-approval-approve="ap-1"]')).toBeTruthy() })
    fireEvent.click(hook('[data-dsh-forge-approval-approve="ap-1"]'))
    expect(seat.calls.decide).toEqual([{ input: { approvalId: 'ap-1', approve: true }, actor: APPROVAL_ACTOR }])
    await waitFor(() => {
      expect(hook('[data-dsh-forge-approval-item="ap-1"]').getAttribute('data-dsh-forge-approval-leaving')).toBe('true')
    })
    expect(onDecided).toHaveBeenCalledTimes(1)
    expect(onDecided.mock.calls[0]![0].id).toBe('ap-1')
    expect(onDecided.mock.calls[0]![1]).toBe(true)
    await waitFor(() => { expect(hook('[data-dsh-forge-approval-header]').textContent).toContain('待审批(1)') })
    // 审批计数单列播报 + 决策播报(arrived 2 → decided approved).
    const announced = hook('[data-dsh-forge-approval-announce]').textContent ?? ''
    expect(announced).toContain('已批准')
    expect(announced).toContain('回到执行中')
    // N-1 同步: the count seat observed 2 then 1.
    expect(onCountChange).toHaveBeenLastCalledWith(1)
    // The slide-out dwell (0.2s) then prunes the row entirely.
    await waitFor(() => { expect(byHook('[data-dsh-forge-approval-item="ap-1"]')).toBeNull() }, { timeout: 1500 })
  })

  it('拒绝 → verb approve:false + 转入失败 announcement (AC2)', async () => {
    const seat = makeVerbs(ROWS)
    render(<Harness verbs={seat.verbs} />)
    await openDock()
    await waitFor(() => { expect(hook('[data-dsh-forge-approval-reject="ap-1"]')).toBeTruthy() })
    fireEvent.click(hook('[data-dsh-forge-approval-reject="ap-1"]'))
    expect(seat.calls.decide[0]!.input).toEqual({ approvalId: 'ap-1', approve: false })
    await waitFor(() => {
      expect(hook('[data-dsh-forge-approval-announce]').textContent).toContain('转入失败')
    })
  })

  it('详情 ↗ / ◂ 返回审批(N) round-trip: closed-phase entries + scroll restore, context unbroken (AC3)', async () => {
    // jsdom has no layout: scrollTop reads clamp to 0. Back it with a real
    // per-element store so the capture/restore round-trip is observable.
    const scrolls = new WeakMap<object, number>()
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop')
    Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
      configurable: true,
      get(this: HTMLElement): number { return scrolls.get(this) ?? 0 },
      set(this: HTMLElement, value: number): void { scrolls.set(this, value) },
    })
    try {
      const seat = makeVerbs(ROWS)
      const events = makeEvents()
      const onOpenDetail = vi.fn()
      render(<Harness verbs={seat.verbs} events={events} onOpenDetail={onOpenDetail} />)
      await openDock()
      await waitFor(() => { expect(hook('[data-dsh-forge-approval-item="ap-1"]')).toBeTruthy() })
      // Detour: 详情 ↗ closes the dock (the harness's mutex stand-in).
      const dock = hook('[data-dsh-forge-approval-panel]') as HTMLElement
      dock.scrollTop = 120
      fireEvent.scroll(dock) // the live capture rides onScroll (jsdom has no layout)
      fireEvent.click(hook('[data-dsh-forge-approval-detail="alpha/2.3"]'))
      expect(onOpenDetail).toHaveBeenCalledWith('alpha/2.3')
      await waitFor(() => { expect(byHook('[data-dsh-forge-approval-panel]')).toBeNull() })
      // While closed, approval_received still refreshes (订阅驱动 ≤5s):
      const grown = [...ROWS, approvalRow({ id: 'ap-3', dispatchId: 'd-3', taskKey: 'alpha/2.7' })]
      seat.setRows(grown)
      const listsBefore = seat.calls.list.length
      events.emit([{ type: 'approval_received', projectId: PROJECT_ID, approvalId: 'ap-3', taskKey: 'alpha/2.7' }])
      await waitFor(() => {
        expect(hook('[data-dsh-forge-approval-entry]').textContent).toContain('3')
      })
      expect(seat.calls.list.length).toBeGreaterThan(listsBefore)
      // A foreign project's events never refresh.
      const before = seat.calls.list.length
      events.emit([{ type: 'approval_received', projectId: 'proj-other', approvalId: 'x', taskKey: 'y' }])
      await act(async () => { await Promise.resolve() })
      expect(seat.calls.list.length).toBe(before)
      // Return: the return button reopens with the remaining (grown) entries
      // and the captured scroll position.
      fireEvent.click(hook('[data-dsh-forge-approval-return]'))
      await waitFor(() => {
        expect(hook('[data-dsh-forge-approval-header]').textContent).toContain('待审批(3)')
        expect(hook('[data-dsh-forge-approval-item="ap-3"]')).toBeTruthy()
      })
      await waitFor(() => {
        expect((hook('[data-dsh-forge-approval-panel]') as HTMLElement).scrollTop).toBe(120)
      })
    } finally {
      if (descriptor !== undefined) Object.defineProperty(HTMLElement.prototype, 'scrollTop', descriptor)
    }
  })

  it('ERR_APPROVAL_DECIDED → toast with the code + automatic refresh (AC5)', async () => {
    const seat = makeVerbs(ROWS)
    seat.setDecideReject({ code: 'ERR_APPROVAL_DECIDED', message: '审批条目已被决定' })
    render(<Harness verbs={seat.verbs} />)
    await openDock()
    await waitFor(() => { expect(hook('[data-dsh-forge-approval-approve="ap-1"]')).toBeTruthy() })
    const decidesBefore = seat.calls.decide.length
    fireEvent.click(hook('[data-dsh-forge-approval-approve="ap-1"]'))
    expect(seat.calls.decide.length).toBe(decidesBefore + 1)
    await waitFor(() => { expect(hook('[data-dsh-forge-approval-toast]').textContent).toContain('ERR_APPROVAL_DECIDED') })
    expect(hook('[data-dsh-forge-approval-toast]').textContent).toContain('已刷新')
    // The failure leg re-fires listApprovals (刷新) — the stale row drops
    // from the face once the refreshed list no longer carries it.
    await waitFor(() => { expect(seat.calls.list.length).toBeGreaterThanOrEqual(2) })
  })

  it('decide failure → refresh + dismissible toast; stale entry disappears after the refresh (AC5, complete path)', async () => {
    const seat = makeVerbs(ROWS)
    const events = makeEvents()
    seat.setDecideReject({ code: 'ERR_APPROVAL_NOT_FOUND', message: '审批条目不存在' })
    render(<Harness verbs={seat.verbs} events={events} />)
    await openDock()
    await waitFor(() => { expect(hook('[data-dsh-forge-approval-approve="ap-1"]')).toBeTruthy() })
    fireEvent.click(hook('[data-dsh-forge-approval-approve="ap-1"]'))
    await waitFor(() => { expect(hook('[data-dsh-forge-approval-toast]').textContent).toContain('ERR_APPROVAL_NOT_FOUND') })
    // The auto-refresh fired; simulate the kernel's decision having landed —
    // the next event-driven refresh drops the stale row from the list.
    seat.setRows([ROWS[1]!])
    events.emit([{ type: 'approval_received', projectId: PROJECT_ID, approvalId: 'ap-x', taskKey: 'alpha/9.9' }])
    await waitFor(() => { expect(byHook('[data-dsh-forge-approval-item="ap-1"]')).toBeNull() })
    expect(hook('[data-dsh-forge-approval-header]').textContent).toContain('待审批(1)')
    // The toast dismisses explicitly.
    fireEvent.click(hook('[data-dsh-forge-approval-toast-dismiss]'))
    await waitFor(() => { expect(byHook('[data-dsh-forge-approval-toast]')).toBeNull() })
  })

  it('Esc closes the dock (the 同构 focus contract) (AC6)', async () => {
    const seat = makeVerbs(ROWS)
    const onClose = vi.fn()
    render(<Harness verbs={seat.verbs} onClose={onClose} />)
    await openDock()
    await waitFor(() => { expect(hook('[data-dsh-forge-approval-panel]')).toBeTruthy() })
    fireEvent.keyDown(hook('[data-dsh-forge-approval-panel]'), { key: 'Escape' })
    await waitFor(() => { expect(byHook('[data-dsh-forge-approval-panel]')).toBeNull() })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('「待审批」badge click opens the dock AND locates that entry (AC1)', async () => {
    const seat = makeVerbs(ROWS)
    render(<Harness verbs={seat.verbs} />)
    fireEvent.click(hook('[data-dsh-forge-orch-jump="alpha/2.5"]'))
    await waitFor(() => {
      expect(hook('[data-dsh-forge-approval-panel]')).toBeTruthy()
      expect(hook('[data-dsh-forge-approval-item="ap-2"]').getAttribute('data-dsh-forge-approval-located'))
        .toBe('true')
    })
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    // The located emphasis clears after the 0.3s dwell.
    await waitFor(() => {
      expect(hook('[data-dsh-forge-approval-item="ap-2"]').getAttribute('data-dsh-forge-approval-located'))
        .toBe('false')
    }, { timeout: 1500 })
  })

  it('counts: toolbar button + tab badge hide at N=0 and carry the 全称 at N≥1 (AC2)', async () => {
    const standalone = render(
      <div>
        <ApprovalToolbarButton t={t.zh} count={0} onOpen={() => {}} />
        <ApprovalCountBadge t={t.zh} count={0} />
      </div>,
    )
    expect(byHook('[data-dsh-forge-approval-entry]')).toBeNull()
    expect(byHook('[data-dsh-forge-approval-tab-badge]')).toBeNull()
    standalone.rerender(
      <div>
        <ApprovalToolbarButton t={t.zh} count={2} onOpen={() => {}} />
        <ApprovalCountBadge t={t.zh} count={2} />
      </div>,
    )
    expect(hook('[data-dsh-forge-approval-entry]').getAttribute('aria-label')).toBe('审批:2 项待审批')
    expect(hook('[data-dsh-forge-approval-entry]').textContent).toContain('审批 2')
    expect(hook('[data-dsh-forge-approval-tab-badge]').getAttribute('aria-label')).toBe('2 项待审批')
    standalone.unmount()
    // The wired harness: draining the last entry hides both count faces.
    const single = makeVerbs([ROWS[0]!])
    render(<Harness verbs={single.verbs} />)
    await openDock()
    await waitFor(() => { expect(hook('[data-dsh-forge-approval-approve="ap-1"]')).toBeTruthy() })
    fireEvent.click(hook('[data-dsh-forge-approval-approve="ap-1"]'))
    await waitFor(() => { expect(byHook('[data-dsh-forge-approval-entry]')).toBeNull() }, { timeout: 1500 })
    expect(byHook('[data-dsh-forge-approval-tab-badge]')).toBeNull()
    await waitFor(() => { expect(hook('[data-dsh-forge-approval-empty]').textContent).toContain('已无待审批请求') })
  })

  it('payload fallback: a corrupted (null) payload shows 请求正文不可用 (AC6)', async () => {
    const seat = makeVerbs([approvalRow({ payload: null })])
    render(<Harness verbs={seat.verbs} />)
    await openDock()
    await waitFor(() => { expect(hook('[data-dsh-forge-approval-body]').textContent).toContain('请求正文不可用') })
    expect(byHook('[data-dsh-forge-approval-expand]')).toBeNull()
  })
})
