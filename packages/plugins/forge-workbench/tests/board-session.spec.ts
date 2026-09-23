// Task 5.11 — the board session store units (AC3/AC4): the plugin-lifetime
// selection/scroll/badge memory that survives the UF5 round-trip's shell
// unmount. Covered: the 5.8 selection semantics pass through verbatim; the
// scroll memory's save/restore round-trip; the active-link map's writers
// (launch success mark, the dock's authoritative reconcile, the end seam)
// and the project-switch scoping.
import { describe, expect, it, vi } from 'vitest'
import { createBoardSessionStore, INITIAL_BOARD_SCROLL } from '../src/client/store/board-session.ts'
import { INITIAL_SELECTED_TASK } from '../src/client/store/selected-task.ts'
import type { SessionLink } from '../src/client/ipc-types.ts'

const link = (overrides: Partial<SessionLink> = {}): SessionLink => ({
  id: 'link-1',
  projectId: 'p1',
  taskKey: 'demo/2.1',
  sessionId: 'session-a',
  status: 'active',
  startedAt: '2026-09-23T00:00:00.000Z',
  endedAt: null,
  ...overrides,
})

describe('board session store: selection (AC4)', () => {
  it('passes the 5.8 selection semantics through verbatim', () => {
    const store = createBoardSessionStore()
    expect(store.selection.getSnapshot()).toBe(INITIAL_SELECTED_TASK)
    const notified = vi.fn()
    store.selection.subscribe(notified)
    store.selection.select('demo/2.1')
    expect(store.selection.getSnapshot()).toEqual({ taskKey: 'demo/2.1', open: true })
    expect(notified).toHaveBeenCalledOnce()
    store.selection.close()
    expect(store.selection.getSnapshot()).toEqual({ taskKey: 'demo/2.1', open: false })
    // select() retargets in place (the dock swap path).
    store.selection.select('demo/3.1')
    expect(store.selection.getSnapshot()).toEqual({ taskKey: 'demo/3.1', open: true })
  })

  it('accepts an externally-created selection store (the same instance passes through)', () => {
    const inner = createBoardSessionStore().selection
    const store = createBoardSessionStore(inner)
    store.selection.select('x/1.1')
    expect(inner.getSnapshot()).toEqual({ taskKey: 'x/1.1', open: true })
  })
})

describe('board session store: scroll memory (AC4)', () => {
  it('saves patches and restores them verbatim; untouched fields persist', () => {
    const store = createBoardSessionStore()
    expect(store.getScroll()).toBe(INITIAL_BOARD_SCROLL)
    store.saveScroll({ contentScrollTop: 412 })
    store.saveScroll({ treeViewport: { x: 10, y: -20, zoom: 0.75 } })
    expect(store.getScroll()).toEqual({
      contentScrollTop: 412,
      statusBoardScrollLeft: 0,
      treeViewport: { x: 10, y: -20, zoom: 0.75 },
    })
    store.saveScroll({ contentScrollTop: 0, treeViewport: undefined })
    expect(store.getScroll()).toEqual({
      contentScrollTop: 0,
      statusBoardScrollLeft: 0,
      treeViewport: undefined,
    })
  })
})

describe('board session store: active links (AC3)', () => {
  it('markLinkActive lights the badge and notifies subscribers', () => {
    const store = createBoardSessionStore()
    const notified = vi.fn()
    store.subscribeLinks(notified)
    expect(store.getActiveLinks().size).toBe(0)
    store.markLinkActive('p1', 'demo/2.1', 'session-a')
    expect(store.getActiveLinks().get('demo/2.1')).toBe('session-a')
    expect(notified).toHaveBeenCalledOnce()
    // Same value re-mark is a no-op (no spurious badge churn).
    store.markLinkActive('p1', 'demo/2.1', 'session-a')
    expect(notified).toHaveBeenCalledOnce()
    // A new session supersedes (re-launch of the same task).
    store.markLinkActive('p1', 'demo/2.1', 'session-b')
    expect(store.getActiveLinks().get('demo/2.1')).toBe('session-b')
  })

  it('markLinksEnded drops the badges (the ≤5s end seam)', () => {
    const store = createBoardSessionStore()
    store.markLinkActive('p1', 'demo/2.1', 'session-a')
    store.markLinkActive('p1', 'demo/2.2', 'session-b')
    store.markLinksEnded('p1', ['demo/2.1'])
    expect(store.getActiveLinks().has('demo/2.1')).toBe(false)
    expect(store.getActiveLinks().has('demo/2.2')).toBe(true)
  })

  it('reconcileLinks: the dock\'s authoritative read lights, supersedes, and drops', () => {
    const store = createBoardSessionStore()
    // Lights from a detail load with an active row.
    store.reconcileLinks('p1', 'demo/2.1', [link({ status: 'ended' }), link({ sessionId: 'session-live' })])
    expect(store.getActiveLinks().get('demo/2.1')).toBe('session-live')
    // Drops when the load carries no active row (the ended path).
    store.reconcileLinks('p1', 'demo/2.1', [link({ status: 'ended', endedAt: '2026-09-23T01:00:00.000Z' })])
    expect(store.getActiveLinks().has('demo/2.1')).toBe(false)
    // A no-active-row load on a never-marked task is a no-op (no churn).
    const notified = vi.fn()
    store.subscribeLinks(notified)
    store.reconcileLinks('p1', 'demo/9.9', [])
    expect(notified).not.toHaveBeenCalled()
  })

  it('a project switch clears the map (links are project-scoped rows)', () => {
    const store = createBoardSessionStore()
    store.markLinkActive('p1', 'demo/2.1', 'session-a')
    // A read for ANOTHER project re-scopes the store first: p1's badge drops.
    store.reconcileLinks('p2', 'other/1.1', [])
    expect(store.getActiveLinks().size).toBe(0)
    store.markLinkActive('p2', 'other/1.1', 'session-x')
    expect(store.getActiveLinks().get('other/1.1')).toBe('session-x')
  })
})

describe('board session store: bindProject (6.4 SC5-2 无跨项目残留)', () => {
  it('a DIFFERENT project rebind closes the open selection and drops the link map', () => {
    const store = createBoardSessionStore()
    store.selection.select('demo/2.1')
    store.markLinkActive('p1', 'demo/2.1', 'session-a')
    expect(store.selection.getSnapshot().open).toBe(true)

    store.bindProject('p2')
    // The stale cross-project taskKey retires with the badges — the dock the
    // re-mounted board would render must NOT re-aim at the new project's
    // detail verb with the old key.
    expect(store.selection.getSnapshot()).toEqual({ taskKey: 'demo/2.1', open: false })
    expect(store.getActiveLinks().size).toBe(0)

    // After the rebind the store serves p2: a fresh select opens normally.
    store.bindProject('p2')
    store.selection.select('other/1.1')
    expect(store.selection.getSnapshot()).toEqual({ taskKey: 'other/1.1', open: true })
  })

  it('a SAME project rebind keeps selection and badges (the 5.11 UF5 round trip on one project)', () => {
    const store = createBoardSessionStore()
    store.bindProject('p1')
    store.selection.select('demo/2.1')
    store.markLinkActive('p1', 'demo/2.1', 'session-a')

    store.bindProject('p1')
    store.bindProject('p1')
    expect(store.selection.getSnapshot()).toEqual({ taskKey: 'demo/2.1', open: true })
    expect(store.getActiveLinks().get('demo/2.1')).toBe('session-a')
  })

  it('an undefined rebind is a no-op (unresolved gate/skeleton mounts never scope the store)', () => {
    const store = createBoardSessionStore()
    store.bindProject('p1')
    store.selection.select('demo/2.1')
    store.bindProject(undefined)
    expect(store.selection.getSnapshot()).toEqual({ taskKey: 'demo/2.1', open: true })
  })
})
