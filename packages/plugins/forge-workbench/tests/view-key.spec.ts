import { describe, expect, it, vi } from 'vitest'
import {
  INITIAL_VIEW_KEY, VIEW_KEY_STORAGE_KEY, WORKBENCH_DIALOG_PREFIX, WORKBENCH_TABS,
  createLocalStoragePersistence, createViewKeyStore, hydratePersistedViewKey, isWorkbenchTabKey,
} from '../src/client/store/view-key.ts'
import type { PersistedViewKey, ViewKeyPersistence } from '../src/client/store/view-key.ts'

// Task 3.3 AC4 + page-map 视图键寻址: the state machine owns the dual-view
// addressing both navigation forms share. Persistence (restart 回到上次视图),
// first-boot default (首次启动默认会话视图), retention (工作台 tab 在切出后保留),
// and the reserved key grammar are all machine-level contracts.

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

describe('view-key machine: first boot and defaults (AC4)', () => {
  it('defaults to the session view on the overview tab when nothing is persisted', () => {
    const store = createViewKeyStore(memoryPersistence())
    expect(store.getSnapshot()).toEqual(INITIAL_VIEW_KEY)
    expect(store.getSnapshot().view).toBe('session')
  })

  it('reserves the key grammar: the four M3 tabs in strip order plus the dialog prefix', () => {
    // M3 revision (task 5.5, PRD Navigation Architecture): 概览/提案/Feature/任务
    // — the proposals board second, Feature third, tasks last.
    expect(WORKBENCH_TABS).toEqual([
      'workbench/overview', 'workbench/proposals', 'workbench/features', 'workbench/tasks',
    ])
    expect(WORKBENCH_DIALOG_PREFIX).toBe('workbench/dialog/')
    expect(isWorkbenchTabKey('workbench/proposals')).toBe(true)
    expect(isWorkbenchTabKey('workbench/tasks')).toBe(true)
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

  it('retains the workbench tab across a switch-out (会话期内存保留, ui-design)', () => {
    const store = createViewKeyStore(memoryPersistence())
    store.selectWorkbench('workbench/tasks')
    store.selectSession()
    expect(store.getSnapshot()).toEqual({ view: 'session', workbenchTab: 'workbench/tasks', featureSlug: undefined })
    store.selectWorkbench()
    expect(store.getSnapshot()).toEqual({ view: 'workbench', workbenchTab: 'workbench/tasks', featureSlug: undefined })
  })

  it('tab switches target the workbench view and clear the feature subview; detail opens set it', () => {
    const store = createViewKeyStore(memoryPersistence())
    store.selectWorkbenchTab('workbench/features')
    expect(store.getSnapshot()).toEqual({ view: 'workbench', workbenchTab: 'workbench/features', featureSlug: undefined })
    store.openFeatureDetail('dsh-forge-m2')
    expect(store.getSnapshot()).toEqual({
      view: 'workbench', workbenchTab: 'workbench/features', featureSlug: 'dsh-forge-m2',
    })
    store.selectWorkbenchTab('workbench/overview')
    expect(store.getSnapshot().featureSlug).toBeUndefined()
  })

  it('proposal detail rides the same subview discipline (5.5): open sets the slug, tab actions clear it', () => {
    const persistence = memoryPersistence()
    const store = createViewKeyStore(persistence)
    store.selectWorkbench('workbench/proposals')
    store.openProposalDetail('dsh-forge-m2')
    expect(store.getSnapshot()).toEqual({
      view: 'workbench',
      workbenchTab: 'workbench/proposals',
      featureSlug: undefined,
      proposalSlug: 'dsh-forge-m2',
    })
    // Session-scoped: the persisted projection keeps only the tab (never the slug).
    expect(persistence.written.at(-1)).toEqual({ view: 'workbench', workbenchTab: 'workbench/proposals' })
    // The breadcrumb return: re-selecting the proposals tab clears the slug.
    store.selectWorkbenchTab('workbench/proposals')
    expect(store.getSnapshot().proposalSlug).toBeUndefined()
    // The 互跳 origin path: a proposal detail survives the session round trip
    // (selectSession keeps the whole interior), and entering the features
    // page pops the proposals subview stack (the 提案 tab is the return path).
    store.openProposalDetail('skill-marketplace')
    store.selectSession()
    store.selectWorkbench()
    expect(store.getSnapshot().proposalSlug).toBe('skill-marketplace')
    store.openFeatureDetail('dsh-forge-m3')
    expect(store.getSnapshot()).toMatchObject({ workbenchTab: 'workbench/features', proposalSlug: undefined })
    // Every tab action clears BOTH subview stacks (the M2 rule, extended).
    store.openProposalDetail('forge-tui')
    store.selectWorkbenchTab('workbench/tasks')
    expect(store.getSnapshot()).toMatchObject({ proposalSlug: undefined, featureSlug: undefined })
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

describe('view-key machine: restart persistence and hostile input (AC4)', () => {
  it('hydrates a valid persisted projection: 重启回到上次视图', () => {
    const store = createViewKeyStore(memoryPersistence({ view: 'workbench', workbenchTab: 'workbench/features' }))
    expect(store.getSnapshot()).toEqual({ view: 'workbench', workbenchTab: 'workbench/features', featureSlug: undefined })
  })

  it('resets hostile input safely: unknown view resets the whole projection; unknown tab defaults the tab', () => {
    expect(hydratePersistedViewKey({ view: 'plugins', workbenchTab: 'workbench/tasks' })).toEqual(INITIAL_VIEW_KEY)
    // A VALID view with an unknown/corrupt tab recovers the closest safe
    // state: the workbench view on the default tab, never a half-reset.
    expect(hydratePersistedViewKey({ view: 'workbench', workbenchTab: 'workbench/dialog/wizard' })).toEqual(
      { ...INITIAL_VIEW_KEY, view: 'workbench' },
    )
    expect(hydratePersistedViewKey('not-an-object')).toEqual(INITIAL_VIEW_KEY)
    expect(hydratePersistedViewKey(null)).toEqual(INITIAL_VIEW_KEY)
    expect(hydratePersistedViewKey({ view: 'workbench', workbenchTab: 'workbench/features' }).view).toBe('workbench')
    // The M3 key set hydrates like any M2 key (localStorage 兼容: old stored
    // values stay valid under the new order — no migration needed).
    expect(hydratePersistedViewKey({ view: 'workbench', workbenchTab: 'workbench/proposals' }))
      .toEqual({ ...INITIAL_VIEW_KEY, view: 'workbench', workbenchTab: 'workbench/proposals' })
    expect(hydratePersistedViewKey({ view: 'workbench', workbenchTab: 'workbench/tasks' }).workbenchTab)
      .toBe('workbench/tasks')
  })

  it('persists through localStorage under the dsh.* key, surviving store recreation', () => {
    const persistence = createLocalStoragePersistence()
    // Node context: no localStorage — the in-memory shadow still round-trips.
    createViewKeyStore(persistence).selectWorkbench('workbench/tasks')
    const reborn = createViewKeyStore(persistence)
    expect(reborn.getSnapshot()).toEqual({ view: 'workbench', workbenchTab: 'workbench/tasks', featureSlug: undefined })
    expect(VIEW_KEY_STORAGE_KEY).toBe('dsh.forge.workbench.view')
  })
})
