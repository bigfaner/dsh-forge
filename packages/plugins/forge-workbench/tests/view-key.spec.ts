import { describe, expect, it, vi } from 'vitest'
import {
  INITIAL_VIEW_KEY, VIEW_KEY_STORAGE_KEY, WORKBENCH_DIALOG_PREFIX, WORKBENCH_TABS,
  createLocalStoragePersistence, createViewKeyStore, hydratePersistedViewKey, isWorkbenchTabKey,
} from '../src/client/store/view-key.ts'
import type { PersistedViewKey, ViewKeyPersistence } from '../src/client/store/view-key.ts'

// Task 3.3 AC4 + page-map 视图键寻址, M4 task 1.7 收口后: the state machine
// owns the dual-view addressing both navigation forms share — the top-level
// 会话⇄工作台 switch over an interior that is the overview ESCAPE DOOR
// alone (Integration 6 retired the tasks/features/proposals `[:slug]` tab
// family). Persistence (restart 回到上次视图), first-boot default (首次启动
// 默认会话视图), and the retire-in-place hydration guard (old localStorage
// naming a retired tab must reset, never throw, never resurrect the view)
// are machine-level contracts.

/** In-memory persistence double with readable written values. */
function memoryPersistence(initial?: PersistedViewKey): ViewKeyPersistence & { written: PersistedViewKey[] } {
  let stored = initial
  const written: PersistedViewKey[] = []
  return {
    read: () => stored,
    write: (value) => { stored = value; written.push(value) },
    written,
  }
}

describe('view-key machine: first boot and the retired grammar (AC4 / Integration 6)', () => {
  it('defaults to the session view on the overview escape door when nothing is persisted', () => {
    const store = createViewKeyStore(memoryPersistence())
    expect(store.getSnapshot()).toEqual(INITIAL_VIEW_KEY)
    expect(store.getSnapshot().view).toBe('session')
  })

  it('reserves the shrunk key grammar: the escape door alone plus the dialog prefix — no retired tab keys', () => {
    // 孤儿视图清零 (unit-level assertion口径, 供 1.8 e2e 消费): the machine's
    // interior state space is exactly the escape door; every M2/M3 tab key
    // is a non-member.
    expect(WORKBENCH_TABS).toEqual(['workbench/overview'])
    expect(WORKBENCH_DIALOG_PREFIX).toBe('workbench/dialog/')
    expect(isWorkbenchTabKey('workbench/overview')).toBe(true)
    for (const retired of ['workbench/tasks', 'workbench/features', 'workbench/proposals']) {
      expect(isWorkbenchTabKey(retired)).toBe(false)
    }
    expect(isWorkbenchTabKey('workbench/dialog/wizard')).toBe(false)
    expect(isWorkbenchTabKey('session')).toBe(false)
  })
})

describe('view-key machine: transitions (AC1/AC2 domain)', () => {
  it('switches 会话⇄工作台 and persists the projection on every transition', () => {
    const persistence = memoryPersistence()
    const store = createViewKeyStore(persistence)
    store.selectWorkbench()
    expect(store.getSnapshot().view).toBe('workbench')
    expect(persistence.written.at(-1)).toEqual({ view: 'workbench', workbenchTab: 'workbench/overview' })
    store.selectSession()
    expect(store.getSnapshot().view).toBe('session')
    expect(persistence.written.at(-1)).toEqual({ view: 'session', workbenchTab: 'workbench/overview' })
  })

  it('the workbench interior is the escape door single page on every entry', () => {
    const store = createViewKeyStore(memoryPersistence())
    store.selectWorkbench()
    expect(store.getSnapshot().workbenchTab).toBe('workbench/overview')
    store.selectSession()
    store.selectWorkbench()
    expect(store.getSnapshot()).toEqual({ view: 'workbench', workbenchTab: 'workbench/overview' })
  })

  it('adopts an external top-level view through the same transition path', () => {
    const persistence = memoryPersistence()
    const store = createViewKeyStore(persistence)
    store.adoptView('workbench')
    expect(store.getSnapshot().view).toBe('workbench')
    expect(persistence.written.at(-1)?.view).toBe('workbench')
  })

  it('notifies subscribers on transitions only (no-op transitions stay silent)', () => {
    const store = createViewKeyStore(memoryPersistence())
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    store.selectSession()
    expect(listener).not.toHaveBeenCalled()
    store.selectWorkbench()
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    store.selectSession()
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('view-key machine: restart persistence and hostile input (AC4 + the 1.7 retire guard)', () => {
  it('hydrates a valid persisted projection: 重启回到上次视图', () => {
    const store = createViewKeyStore(memoryPersistence({ view: 'workbench', workbenchTab: 'workbench/overview' }))
    expect(store.getSnapshot()).toEqual({ view: 'workbench', workbenchTab: 'workbench/overview' })
  })

  it('retire-in-place: a stored tab naming a RETIRED M2/M3 key resets to the escape door, never resurrects the view', () => {
    // localStorage 兼容 under the shrunk grammar (Integration 6): old stored
    // projections ({view:'workbench', workbenchTab:'workbench/tasks'} from an
    // M2/M3 session) hydrate to the overview escape door — the whole
    // projection never resets when the view itself is valid.
    for (const retired of ['workbench/tasks', 'workbench/features', 'workbench/proposals']) {
      expect(hydratePersistedViewKey({ view: 'workbench', workbenchTab: retired }))
        .toEqual({ view: 'workbench', workbenchTab: 'workbench/overview' })
    }
  })

  it('resets hostile input safely: unknown view resets the whole projection; unknown tab defaults the tab', () => {
    expect(hydratePersistedViewKey({ view: 'plugins', workbenchTab: 'workbench/tasks' })).toEqual(INITIAL_VIEW_KEY)
    // A VALID view with an unknown/corrupt tab recovers the closest safe
    // state: the workbench view on the escape door, never a half-reset.
    expect(hydratePersistedViewKey({ view: 'workbench', workbenchTab: 'workbench/dialog/wizard' })).toEqual(
      { ...INITIAL_VIEW_KEY, view: 'workbench' },
    )
    expect(hydratePersistedViewKey('not-an-object')).toEqual(INITIAL_VIEW_KEY)
    expect(hydratePersistedViewKey(null)).toEqual(INITIAL_VIEW_KEY)
  })

  it('persists through localStorage under the dsh.* key, surviving store recreation', () => {
    const persistence = createLocalStoragePersistence()
    // Node context: no localStorage — the in-memory shadow still round-trips.
    createViewKeyStore(persistence).selectWorkbench()
    const reborn = createViewKeyStore(persistence)
    expect(reborn.getSnapshot()).toEqual({ view: 'workbench', workbenchTab: 'workbench/overview' })
    expect(VIEW_KEY_STORAGE_KEY).toBe('dsh.forge.workbench.view')
  })
})
