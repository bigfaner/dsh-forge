// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getWorkbenchEventSource } from '../src/client/ipc/workbench-events.ts'
import { createWorkbenchStateStore } from '../src/client/store/workbench-state.ts'
import {
  createTaskBoardStore, INITIAL_TASK_BOARD_SNAPSHOT, TASK_BOARD_REFRESH_DEBOUNCE_MS,
} from '../src/client/store/task-board.ts'
import { TasksView } from '../src/client/views/tasks/TasksView.tsx'
import { TaskBoardPage } from '../src/client/views/TaskBoardPage.tsx'
import { en, type WorkbenchKey } from '../src/client/locale/en.ts'
import type {
  SyncStatus, TaskBoardData, TaskDetail, TaskSummary, WorkbenchEvent, WorkbenchState,
} from '../src/client/ipc-types.ts'
import type { TaskBoardFace } from '../src/client/contract.ts'
import type { WorkbenchIpcBridge } from '../src/client/ipc/workbench.ts'

// Task 5.15 — the UF2 tasks-page ASSEMBLY units (real IPC over the
// window.dshForge.workbench boundary; jsdom fakes, no Electron):
//   AC1/AC2 真数据 + 首屏单次 — the real form renders the bridge's board
//       (mock twins never run), ONE getTaskBoard per first paint; the
//       seat/hostless forms reproduce the 5.5/5.8 build stage exactly.
//   AC3 事件回流 — coalesce-then-fetch over the SINGLE-SUBSCRIBER shared
//       channel: one verb per burst (400ms window), foreign projects
//       filtered, rows updated IN PLACE (filter preserved), sync events
//       merging without a fetch, the sync 重试 landing a FRESH fetch, and
//       the structural deletion of the open dock's task flipping the dock
//       to its error card (ui-design 侧板转错误态).
//   AC4/AC5 ride the build suites (task-board.spec) — kept green by the
//   seat-form passthrough assertions here.

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  StateDot: (props: { state: string }) => <span data-mock-state-dot={props.state} />,
}))
vi.mock('@xyflow/react', async () => await import('./helpers/xyflow-standin'))

type Dict = Record<WorkbenchKey, string>
const bind = (dict: Dict) => (key: WorkbenchKey): string => dict[key]
const t = bind(en)

const $ = (selector: string): HTMLElement => document.querySelector(selector) as HTMLElement

/** The minimal full-surface bridge fake (all 14 members callable). */
function baseBridge(overrides: Partial<WorkbenchIpcBridge> = {}): WorkbenchIpcBridge {
  return {
    getState: async () => ({}) as WorkbenchState,
    registerProject: async () => ({}) as never,
    updateProject: async () => ({}) as never,
    removeProject: async () => undefined,
    activateProject: async () => undefined,
    getTaskBoard: async () => ({}) as TaskBoardData,
    getTaskDetail: async () => ({}) as TaskDetail,
    getFeatureBoard: async () => ({}) as never,
    readFeatureDoc: async () => ({}) as never,
    listPlugins: async () => [],
    setPluginEnabled: async () => [],
    recordSessionLink: async () => ({}) as never,
    endSessionLink: async () => undefined,
    authorizeExternalDocPath: async () => undefined,
    onEvents: () => () => {},
    ...overrides,
  } as WorkbenchIpcBridge
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  delete (globalThis as { dshForge?: unknown }).dshForge
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const task = (key: string, title: string, status: TaskSummary['status']): TaskSummary => ({
  key, title, status, featureSlug: 'demo', blockers: [], branch: null,
  worktree: false, source: null, updatedAt: '2026-09-23T08:00:00.000Z',
})

const IDLE_SYNC: SyncStatus = { state: 'idle', lastScanAt: '2026-09-23T08:00:00.000Z' }
const boardOf = (tasks: readonly TaskSummary[], sync: SyncStatus = IDLE_SYNC): TaskBoardData => ({
  tasks: [...tasks],
  generatedAt: '2026-09-23T08:00:00.000Z',
  sync,
})

const T11 = task('demo/1.1', 'first task', 'pending')
const T12 = task('demo/1.2', 'second task', 'in_progress')
const BOARD_V1 = boardOf([T11, T12])
const BOARD_V2 = boardOf([task('demo/1.1', 'first task', 'completed'), T12])
const BOARD_V1_DELETED = boardOf([T12])

const DETAIL_11: TaskDetail = {
  summary: T11,
  descriptionMarkdown: '# 1.1\n\nThe fixture description.',
  depChain: [],
  records: [],
  links: [],
}

const taskUpdated = (
  taskKey: string, changeKind: 'attribute' | 'structural' = 'attribute', projectId = 'p1',
): WorkbenchEvent => ({ type: 'task_updated', projectId, taskKey, source: 'terminal', changeKind })

/**
 * A sequential board bridge: getTaskBoard serves the fixture list in call
 * order (repeating the last), getTaskDetail resolves only for tasks present
 * in the LAST served board (a deleted key rejects — the dock's error leg).
 */
function boardBridge(boards: readonly TaskBoardData[]) {
  let cursor = 0
  let last = boards[0] as TaskBoardData
  let eventsCallback: ((events: readonly WorkbenchEvent[]) => void) | undefined
  const unsubscribe = vi.fn()
  const calls = { getTaskBoard: 0, getTaskDetail: 0, onEvents: 0 }
  const fake = baseBridge({
    getTaskBoard: async (): Promise<TaskBoardData> => {
      calls.getTaskBoard += 1
      last = boards[Math.min(cursor, boards.length - 1)] as TaskBoardData
      cursor += 1
      return last
    },
    getTaskDetail: async (_projectId: string, taskKey: string): Promise<TaskDetail> => {
      calls.getTaskDetail += 1
      if (!last.tasks.some(row => row.key === taskKey)) {
        throw new Error(JSON.stringify({ code: 'ERR_WORKBENCH_DB', message: `task ${taskKey} not found` }))
      }
      return DETAIL_11
    },
    onEvents: (callback: (events: readonly WorkbenchEvent[]) => void): (() => void) => {
      calls.onEvents += 1
      eventsCallback = callback
      return unsubscribe
    },
  })
  return {
    fake, calls, unsubscribe,
    emit: (events: readonly WorkbenchEvent[]): void => { eventsCallback?.(events) },
  }
}

/** Install a bridge fake over the jsdom boundary (the TasksView real form). */
function installBridge(fake: WorkbenchIpcBridge): void {
  ;(globalThis as { dshForge?: unknown }).dshForge = { workbench: fake }
}


/** Switch the board to view B (cards) — the default view A renders the DAG standin. */
async function toGrouped(): Promise<void> {
  await waitFor(() => { expect($('[data-dsh-forge-task-toolbar]')).not.toBeNull() })
  fireEvent.click($('[data-dsh-forge-board-view="grouped"]'))
  await waitFor(() => { expect($('[data-dsh-forge-board-panel="grouped"]')).not.toBeNull() })
}

// ---------------------------------------------------------------------------
// The single-subscriber channel (ipc/workbench-events.ts)
// ---------------------------------------------------------------------------

describe('getWorkbenchEventSource: the renderer\'s ONE onEvents subscription', () => {
  it('acquires on first listener, keeps it across partial detaches, releases on the LAST', () => {
    const onEvents = vi.fn(() => vi.fn())
    const bridge = baseBridge({ onEvents })
    const source = getWorkbenchEventSource(bridge)
    const detachA = source.subscribe(vi.fn())
    expect(onEvents).toHaveBeenCalledTimes(1)
    const detachB = source.subscribe(vi.fn())
    expect(onEvents).toHaveBeenCalledTimes(1) // multiplexed, never a second verb
    detachA()
    expect(onEvents).toHaveBeenCalledTimes(1) // B still listening — no release
    detachB()
    expect(onEvents).toHaveBeenCalledTimes(1)
    // Re-subscribe re-acquires (the channel follows its audience).
    const detachC = source.subscribe(vi.fn())
    expect(onEvents).toHaveBeenCalledTimes(2)
    detachC()
  })

  it('a batch reaches every live listener; a mid-dispatch detach never breaks the fan-out', () => {
    let push: ((events: readonly WorkbenchEvent[]) => void) | undefined
    const bridge = baseBridge({
      onEvents: (callback) => { push = callback; return () => { push = undefined } },
    })
    const source = getWorkbenchEventSource(bridge)
    const seenA: number[] = []
    const seenB: number[] = []
    const detachA = source.subscribe((events) => {
      seenA.push(events.length)
      detachA() // detaching DURING the dispatch
    })
    source.subscribe((events) => { seenB.push(events.length) })
    push?.([taskUpdated('demo/1.1')])
    expect(seenA).toEqual([1])
    expect(seenB).toEqual([1])
  })

  it('the source identity follows the BRIDGE (shared real host, isolated test fakes)', () => {
    const bridge = baseBridge()
    expect(getWorkbenchEventSource(bridge)).toBe(getWorkbenchEventSource(bridge))
    expect(getWorkbenchEventSource(baseBridge())).not.toBe(getWorkbenchEventSource(bridge))
  })

  it('composition: one family\'s teardown never strands the other\'s push (the 5.14+5.15 coexistence)', async () => {
    // THE reason the module exists: the main-side registry deregisters the
    // whole webContents on ANY unsubscribe, so independent verbs cannot
    // coexist — both families ride the shared source instead.
    const registry = { emit: undefined as ((events: readonly WorkbenchEvent[]) => void) | undefined }
    const unsubscribe = vi.fn()
    const bridge = baseBridge({
      getState: async () => ({ projects: [], activeProjectId: null, plugins: [] }),
      onEvents: (callback) => { registry.emit = callback; return unsubscribe },
    })
    const stateStore = createWorkbenchStateStore(bridge)
    const boardStore = createTaskBoardStore(bridge, 'p1')
    registry.emit?.([{ type: 'sync', projectId: 'px', sync: { state: 'error', lastScanAt: null } }])
    stateStore.dispose() // the overview family tears down (a tab switch away)
    registry.emit?.([taskUpdated('demo/1.1')])
    expect(unsubscribe).not.toHaveBeenCalled() // the board's push survives
    boardStore.dispose()
    expect(unsubscribe).toHaveBeenCalledTimes(1) // released exactly at the last detach
  })
})

// ---------------------------------------------------------------------------
// The board store (快照缓存 + 事件合并)
// ---------------------------------------------------------------------------

describe('createTaskBoardStore: read-through + coalesce-then-fetch', () => {
  it('the first loadBoard is ONE verb; concurrent callers share it (AC2 首屏单次)', async () => {
    const h = boardBridge([BOARD_V1])
    const store = createTaskBoardStore(h.fake, 'p1')
    const [a, b] = await Promise.all([store.loadBoard('p1'), store.loadBoard('p1')])
    expect(a).toBe(b)
    expect(h.calls.getTaskBoard).toBe(1)
    expect(store.getSnapshot()).toMatchObject({ phase: 'ready', board: BOARD_V1 })
    store.dispose()
  })

  it('a page-initiated read does NOT advance the feed (no self-ansowering token bump)', async () => {
    const h = boardBridge([BOARD_V1])
    const store = createTaskBoardStore(h.fake, 'p1')
    await store.loadBoard('p1')
    expect(store.getSnapshot().feed).toBe(0)
    expect(store.getSnapshot().revision).toBe(1)
    store.dispose()
  })

  it('a task_updated burst = ONE refresh after the debounce window; the next loadBoard SERVES it', async () => {
    vi.useFakeTimers()
    const h = boardBridge([BOARD_V1, BOARD_V2])
    const store = createTaskBoardStore(h.fake, 'p1')
    await store.loadBoard('p1')
    store.handleEvents([taskUpdated('demo/1.1'), taskUpdated('demo/1.2')])
    store.handleEvents([taskUpdated('demo/1.1')]) // a second batch INSIDE the window
    await vi.advanceTimersByTimeAsync(TASK_BOARD_REFRESH_DEBOUNCE_MS - 1)
    expect(h.calls.getTaskBoard).toBe(1) // nothing fired early
    await vi.advanceTimersByTimeAsync(1)
    expect(h.calls.getTaskBoard).toBe(2) // exactly ONE refresh for the burst
    expect(store.getSnapshot().board?.tasks[0]?.status).toBe('completed')
    expect(store.getSnapshot().feed).toBe(1)
    await store.loadBoard('p1') // the page's re-feed
    expect(h.calls.getTaskBoard).toBe(2) // SERVED, not re-fetched
    store.dispose()
  })

  it('foreign-project events are none of this board\'s concern', async () => {
    vi.useFakeTimers()
    const h = boardBridge([BOARD_V1])
    const store = createTaskBoardStore(h.fake, 'p1')
    await store.loadBoard('p1')
    store.handleEvents([taskUpdated('demo/1.1', 'attribute', 'other-project')])
    store.handleEvents([{ type: 'sync', projectId: 'other-project', sync: { state: 'error', lastScanAt: null } }])
    await vi.advanceTimersByTimeAsync(TASK_BOARD_REFRESH_DEBOUNCE_MS * 2)
    expect(h.calls.getTaskBoard).toBe(1)
    expect(store.getSnapshot().feed).toBe(0)
    store.dispose()
  })

  it('a sync event merges into the toolbar projection WITHOUT a fetch; the 重试 is a FRESH read', async () => {
    vi.useFakeTimers()
    const h = boardBridge([BOARD_V1, BOARD_V2, boardOf([T11, T12], { state: 'idle', lastScanAt: '2026-09-23T09:00:00.000Z' })])
    const store = createTaskBoardStore(h.fake, 'p1')
    await store.loadBoard('p1')
    store.handleEvents([{ type: 'sync', projectId: 'p1', sync: { state: 'error', lastScanAt: null, error: 'watch degraded' } }])
    expect(h.calls.getTaskBoard).toBe(1) // merged, never fetched
    expect(store.getSnapshot().board?.sync.state).toBe('error')
    expect(store.getSnapshot().feed).toBe(1)
    await store.loadBoard('p1') // the page's re-feed serves the merged sync
    expect(h.calls.getTaskBoard).toBe(1)
    // The toolbar's 重试: every published revision is consumed → a FRESH read
    // (the DTO's sync is authoritative — recovery, not a stale serve).
    const recovered = await store.loadBoard('p1')
    expect(h.calls.getTaskBoard).toBe(2)
    expect(recovered.sync.state).toBe('idle')
    store.dispose()
  })

  it('a failed refresh keeps the last good board and both counters', async () => {
    vi.useFakeTimers()
    const h = boardBridge([BOARD_V1])
    const store = createTaskBoardStore(h.fake, 'p1')
    await store.loadBoard('p1')
    h.fake.getTaskBoard = async (): Promise<TaskBoardData> => {
      throw new Error(JSON.stringify({ code: 'ERR_WORKBENCH_DB', message: 'down' }))
    }
    store.handleEvents([taskUpdated('demo/1.1')])
    await vi.advanceTimersByTimeAsync(TASK_BOARD_REFRESH_DEBOUNCE_MS)
    expect(store.getSnapshot()).toMatchObject({
      phase: 'error',
      board: BOARD_V1,
      revision: 1,
      feed: 0,
    })
    store.dispose()
  })

  it('a project mismatch is a loud caller defect, never a cross-project guess', async () => {
    const h = boardBridge([BOARD_V1])
    const store = createTaskBoardStore(h.fake, 'p1')
    await expect(store.loadBoard('other-project')).rejects.toMatchObject({ code: 'ERR_WORKBENCH_DB' })
    store.dispose()
  })

  it('dispose detaches the event leg and cancels the pending refresh', async () => {
    vi.useFakeTimers()
    const h = boardBridge([BOARD_V1])
    const store = createTaskBoardStore(h.fake, 'p1')
    await store.loadBoard('p1')
    store.handleEvents([taskUpdated('demo/1.1')])
    store.dispose()
    expect(h.unsubscribe).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(TASK_BOARD_REFRESH_DEBOUNCE_MS * 2)
    expect(h.calls.getTaskBoard).toBe(1) // the cancelled timer never fired
  })

  it('the initial snapshot is the pre-read constant', () => {
    const h = boardBridge([BOARD_V1])
    const store = createTaskBoardStore(h.fake, 'p1')
    expect(store.getSnapshot()).toBe(INITIAL_TASK_BOARD_SNAPSHOT)
    store.dispose()
  })
})

// ---------------------------------------------------------------------------
// TasksView: form selection + the real chain
// ---------------------------------------------------------------------------

describe('TasksView: the assembled tasks tab', () => {
  it('the real form renders the BRIDGE board (mock 全撤) with ONE getTaskBoard on first paint', async () => {
    const h = boardBridge([BOARD_V1])
    installBridge(h.fake)
    render(<TasksView t={t} projectId="p1" />)
    await toGrouped()
    // The mock twin's fixture keys never render on the real path.
    expect($('[data-dsh-forge-task-card="demo/1.1"]')).not.toBeNull()
    expect(document.querySelector('[data-dsh-forge-task-card="dsh-forge-m2/5.5"]')).toBeNull()
    expect(h.calls.getTaskBoard).toBe(1)
  })

  it('the real form resolves to a skeleton while the project is unresolved (never the mocks)', async () => {
    const h = boardBridge([BOARD_V1])
    installBridge(h.fake)
    render(<TasksView t={t} projectId={undefined} />)
    expect($('[data-dsh-forge-tasks-resolving]')).not.toBeNull()
    expect(h.calls.getTaskBoard).toBe(0)
  })

  it('the seat form wins over the bridge (the explicit test seam, verbatim 5.5/5.8)', async () => {
    const h = boardBridge([BOARD_V1])
    installBridge(h.fake)
    const loadBoard = vi.fn(async () => BOARD_V2)
    render(<TasksView t={t} projectId="p1" seat={{ face: { loadBoard } }} />)
    await waitFor(() => { expect($('[data-dsh-forge-task-toolbar]')).not.toBeNull() })
    expect(loadBoard).toHaveBeenCalledTimes(1)
    expect(h.calls.getTaskBoard).toBe(0) // the bridge chain never ran
  })

  it('a hostless mount reproduces the build-stage mock twin', async () => {
    render(<TasksView t={t} projectId="any" />)
    await toGrouped()
    expect($('[data-dsh-forge-task-card="dsh-forge-m2/5.5"]')).not.toBeNull()
  })

  it('回流: one burst → rows update IN PLACE (filter preserved) + the announce fires; never a remount', async () => {
    const h = boardBridge([BOARD_V1, BOARD_V2])
    installBridge(h.fake)
    render(<TasksView t={t} projectId="p1" />)
    await waitFor(() => { expect($('[data-dsh-forge-task-toolbar]')).not.toBeNull() })
    // View C (the list) + a filter set BEFORE the event — the refresh must
    // not reset either (the Hard Rule: 回流与筛选/视图共存不冲突).
    fireEvent.click($('[data-dsh-forge-board-view="list"]'))
    await waitFor(() => { expect($('[data-dsh-forge-task-row="demo/1.1"]')).not.toBeNull() })
    fireEvent.change($('[data-dsh-forge-tasks-search]'), { target: { value: 'first' } })
    await waitFor(() => {
      expect(document.querySelectorAll('[data-dsh-forge-task-row]')).toHaveLength(1)
    })
    const rowBefore = $('[data-dsh-forge-task-row="demo/1.1"]')
    expect(rowBefore.textContent).toContain('Pending')

    vi.useFakeTimers()
    act(() => { h.emit([taskUpdated('demo/1.1')]) })
    // The presentation leg lights IMMEDIATELY (event arrival, pre-fetch).
    expect($('[data-dsh-forge-task-row="demo/1.1"]').getAttribute('data-dsh-forge-updating')).toBe('')
    expect($('[data-dsh-forge-board-announce]').textContent).toContain('demo/1.1')
    await act(async () => { await vi.advanceTimersByTimeAsync(TASK_BOARD_REFRESH_DEBOUNCE_MS) })
    // The refreshed row shows the NEW status, same DOM node (in place).
    const rowAfter = $('[data-dsh-forge-task-row="demo/1.1"]')
    expect(rowAfter).toBe(rowBefore)
    expect(rowAfter.textContent).toContain('Completed')
    // The search filter survived the refresh (no reset, no remount).
    expect(document.querySelectorAll('[data-dsh-forge-task-row]')).toHaveLength(1)
    expect(h.calls.getTaskBoard).toBe(2)
  })

  it('回流·结构性: deleting the open dock\'s task flips the dock to its error card', async () => {
    const h = boardBridge([BOARD_V1, BOARD_V1_DELETED])
    installBridge(h.fake)
    render(<TasksView t={t} projectId="p1" />)
    await toGrouped()
    // Open the dock on demo/1.1 (view B card activation — the 5.8 linkage).
    fireEvent.click($('[data-dsh-forge-task-card="demo/1.1"]'))
    await waitFor(() => {
      expect($('[data-dsh-forge-task-detail="demo/1.1"]')).not.toBeNull()
      expect($('[data-dsh-forge-detail-header]').textContent).toContain('first task')
    })
    vi.useFakeTimers()
    act(() => { h.emit([taskUpdated('demo/1.1', 'structural')]) })
    await act(async () => { await vi.advanceTimersByTimeAsync(TASK_BOARD_REFRESH_DEBOUNCE_MS) })
    vi.useRealTimers()
    // The row is gone, and the open dock turned to its error card (the
    // re-read rejects on the deleted key).
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-task-row="demo/1.1"], [data-dsh-forge-task-card="demo/1.1"]')).toBeNull()
    })
    await waitFor(() => { expect($('[data-dsh-forge-detail-error]')).not.toBeNull() })
  })

  it('a structural event whose task SURVIVES keeps the dock populated (structural ≠ deleted)', async () => {
    const h = boardBridge([BOARD_V1, BOARD_V2])
    installBridge(h.fake)
    render(<TasksView t={t} projectId="p1" />)
    await toGrouped()
    fireEvent.click($('[data-dsh-forge-task-card="demo/1.1"]'))
    await waitFor(() => { expect($('[data-dsh-forge-task-detail="demo/1.1"]')).not.toBeNull() })
    vi.useFakeTimers()
    act(() => { h.emit([taskUpdated('demo/1.1', 'structural')]) })
    await act(async () => { await vi.advanceTimersByTimeAsync(TASK_BOARD_REFRESH_DEBOUNCE_MS) })
    vi.useRealTimers()
    // demo/1.1 exists in BOARD_V2 → no dock reload, no error card.
    await waitFor(() => {
      expect($('[data-dsh-forge-task-detail="demo/1.1"]')).not.toBeNull()
      expect(document.querySelector('[data-dsh-forge-detail-error]')).toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------
// The page's reloadToken seam (build-stage DI, consumed by the assembly)
// ---------------------------------------------------------------------------

describe('TaskBoardPage: the reloadToken + structural-deletion coupling', () => {
  function makeFace(boards: readonly TaskBoardData[]) {
    let cursor = 0
    const listeners = new Set<(events: readonly WorkbenchEvent[]) => void>()
    const face: TaskBoardFace & { emit(events: readonly WorkbenchEvent[]): void } = {
      loadBoard: async () => {
        const board = boards[Math.min(cursor, boards.length - 1)] as TaskBoardData
        cursor += 1
        return board
      },
      subscribeEvents: (listener) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
      emit: (events) => { for (const listener of listeners) listener(events) },
    }
    return face
  }

  it('a reloadToken change re-fires load WITHOUT a remount (rows stay mounted)', async () => {
    const face = makeFace([BOARD_V1, BOARD_V2])
    const view = render(<TaskBoardPage t={t} face={face} />)
    await toGrouped()
    const rowBefore = $('[data-dsh-forge-task-card="demo/1.1"]')
    expect(rowBefore.textContent).toContain('Pending')
    const pageRoot = $('[data-dsh-forge-task-board]')
    view.rerender(<TaskBoardPage t={t} face={face} reloadToken={1} />)
    await waitFor(() => {
      expect($('[data-dsh-forge-task-card="demo/1.1"]').textContent).toContain('Done')
    })
    // The PAGE root survived the re-feed (in place, never rebuilt — a card
    // moving status columns is view B's own re-grouping, not a remount).
    expect(document.querySelector('[data-dsh-forge-task-board]')).toBe(pageRoot)
    expect(rowBefore.textContent).toContain('Pending')
  })

  it('the dock reloads (and errors) when a structural event deletes the open key', async () => {
    const face = makeFace([BOARD_V1, BOARD_V1_DELETED])
    let detailLoads = 0
    const detailFace = {
      loadDetail: async (): Promise<TaskDetail> => {
        detailLoads += 1
        if (detailLoads > 1) {
          throw new Error(JSON.stringify({ code: 'ERR_WORKBENCH_DB', message: 'task gone' }))
        }
        return DETAIL_11
      },
    }
    const view = render(<TaskBoardPage t={t} projectId="p1" face={face} detailFace={detailFace} />)
    await toGrouped()
    fireEvent.click($('[data-dsh-forge-task-card="demo/1.1"]'))
    await waitFor(() => { expect($('[data-dsh-forge-task-detail="demo/1.1"]')).not.toBeNull() })
    // The structural event, then the assembly's re-feed token (the store's
    // refresh landed): the settle finds the open key DELETED.
    act(() => { face.emit([taskUpdated('demo/1.1', 'structural')]) })
    view.rerender(<TaskBoardPage t={t} projectId="p1" face={face} detailFace={detailFace} reloadToken={1} />)
    await waitFor(() => { expect(detailLoads).toBe(2) })
    await waitFor(() => { expect($('[data-dsh-forge-detail-error]')).not.toBeNull() })
  })
})
