import { describe, expect, it, vi } from 'vitest'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import type { Context } from '@deepseek-ai/cordis'
import type { StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import { ViewSwitchController } from '../src/client/nav/view-switch.ts'
import { installSlotNav } from '../src/client/nav/slot-inject.ts'
import { createViewKeyStore } from '../src/client/store/view-key.ts'
import { MAIN_SLOT, PANEL_ID, SIDEBAR_SLOT } from '../src/client/contract.ts'
import type { PersistedViewKey, WorkbenchTabKey } from '../src/client/store/view-key.ts'

// The shell registration (and through it the upstream icon) resolves through
// the module table at runtime (browser bundle); the npm node entry carries
// undeclared transitive deps only the upstream monorepo supplies, so the
// Node-context unit stubs the glyph chain.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconBranchOutline16: () => null,
  IconNewChatOutline16: () => null,
}))

// Task 3.3 AC1 (上游槽位路径) against the real upstream SlotCore (npm
// 0.1.6-alpha.2): the 3.2 registration pair now carries the view-key machine —
// the main registration's inject face (the store as a hooks source + the tab
// action + panel-lifecycle notifications), the carrier attach on commit (whose
// projection IS the restart restore through ctx.layout.selectPanel), and the
// commit notifications the form coordinator listens to.

/** A minimal layout service double recording selectPanel calls. */
function makeLayout() {
  const calls: (string | null)[] = []
  return { calls, selectPanel: (id: string | null) => { calls.push(id) } }
}

/** Fake client ctx: declaration-lifetime slots facade over the real core + optional services. */
function makeFakeCtx(core: SlotCore, layout?: ReturnType<typeof makeLayout>): Context {
  const ctx = {
    effect(fn: () => (() => void) | undefined | void): () => void {
      const dispose = fn()
      return () => dispose?.()
    },
    get: (name: string): unknown => (name === 'layout' ? layout : undefined),
    locale: {
      register: () => () => {},
      bind: () => (key: string) => key,
    },
    slots: {
      register: (options: object, component: unknown) =>
        core.register(options as Parameters<SlotCore['register']>[0], component as never),
      inject(key: string, callback: () => (() => void) | undefined | void): () => void {
        let disposeActive: (() => void) | undefined
        const reconcile = (): void => {
          if (core.specDynamic(key) === undefined) return
          disposeActive?.()
          const dispose = callback()
          disposeActive = () => dispose?.()
        }
        const unsubscribe = core.subscribeDeclaration(key, reconcile)
        reconcile()
        return () => {
          unsubscribe()
          disposeActive?.()
        }
      },
      spec: (key: string) => core.specDynamic(key),
    },
  }
  return ctx as unknown as Context
}

/** Declare the navigation slots the way the upstream frame does (one parent carrying both children). */
function declareNavigationSlots(core: SlotCore): () => void {
  return core.register(
    {
      name: 'root',
      children: {
        [MAIN_SLOT]: { kind: 'keyed', scope: 'root' },
        [SIDEBAR_SLOT]: { kind: 'list', scope: 'root' },
      },
    },
    () => null,
  )
}

/** The main registration's stored entry (the workbench keyed claim). */
function mainEntry(core: SlotCore): StoredEntry | undefined {
  return core.entries(MAIN_SLOT).find(entry => entry.options.key === PANEL_ID)
}

/** The inject face as the render machinery would call it. */
function faceOf(entry: StoredEntry): Record<string, unknown> {
  expect(entry.inject).toBeDefined()
  return (entry.inject as () => Record<string, unknown>)()
}

function makeNav(initial?: PersistedViewKey) {
  const core = new SlotCore()
  const persistenceWrites: PersistedViewKey[] = []
  const store = createViewKeyStore({
    read: () => initial,
    write: (value) => { persistenceWrites.push(value); initial = value },
  })
  const controller = new ViewSwitchController(store)
  const onMainCommitted = vi.fn()
  const onPathLive = vi.fn()
  return { core, store, controller, persistenceWrites, onMainCommitted, onPathLive }
}

describe('slot nav: registration and the injected view face (AC1)', () => {
  it('waits for the slot declarations — nothing registers, no carrier attaches, no commit fires', () => {
    const nav = makeNav()
    const dispose = installSlotNav(makeFakeCtx(nav.core), {
      controller: nav.controller, store: nav.store, label: () => 'Workbench',
      onMainCommitted: nav.onMainCommitted, onPathLive: nav.onPathLive,
    })
    expect(nav.core.entries(MAIN_SLOT)).toHaveLength(0)
    expect(nav.core.entries(SIDEBAR_SLOT)).toHaveLength(0)
    expect(nav.controller.form).toBeUndefined()
    expect(nav.onMainCommitted).not.toHaveBeenCalled()
    expect(nav.onPathLive).not.toHaveBeenCalled()
    dispose()
  })

  it('commits both registrations and injects the machine face into the main claim', () => {
    const nav = makeNav()
    const layout = makeLayout()
    installSlotNav(makeFakeCtx(nav.core, layout), {
      controller: nav.controller, store: nav.store, label: () => 'Workbench',
      onMainCommitted: nav.onMainCommitted, onPathLive: nav.onPathLive,
    })
    const disposeParent = declareNavigationSlots(nav.core)

    expect(nav.onMainCommitted).toHaveBeenCalledTimes(1)
    expect(nav.onPathLive).toHaveBeenCalledTimes(1)
    const entry = mainEntry(nav.core)
    expect(entry).toBeDefined()
    const face = faceOf(entry as StoredEntry)
    // The store rides the hooks compartment: the framework synthesizes the
    // `useViewKey` selector from it (getSnapshot/subscribe observable).
    const source = (face.hooks as Record<string, { getSnapshot: () => unknown; subscribe: (fn: () => void) => () => void }>).viewKey
    expect(source.getSnapshot()).toEqual(nav.store.getSnapshot())
    expect(typeof source.subscribe).toBe('function')
    expect(typeof face.selectWorkbenchTab).toBe('function')
    expect(typeof face.openFeatureDetail).toBe('function')
    expect(typeof face.notifyPresented).toBe('function')
    expect(typeof face.notifyDismissed).toBe('function')
    // The sidebar row keeps the 3.2 contract.
    const row = nav.core.entries(SIDEBAR_SLOT)[0]
    expect(row?.options.id).toBe('workbench')
    expect(row?.options.order).toBe(10)
    disposeParent()
  })
})

describe('slot nav: the carrier projects through ctx.layout.selectPanel (AC1/AC4)', () => {
  it('attach-on-commit projects the persisted view — 重启回到上次视图 (workbench case)', () => {
    const nav = makeNav({ view: 'workbench', workbenchTab: 'workbench/tasks' })
    const layout = makeLayout()
    installSlotNav(makeFakeCtx(nav.core, layout), {
      controller: nav.controller, store: nav.store, label: () => 'Workbench',
    })
    const disposeParent = declareNavigationSlots(nav.core)
    expect(layout.calls).toEqual(['workbench'])
    disposeParent()
  })

  it('a persisted session view projects selectPanel(null) — the conversation target', () => {
    const nav = makeNav({ view: 'session', workbenchTab: 'workbench/overview' })
    const layout = makeLayout()
    installSlotNav(makeFakeCtx(nav.core, layout), {
      controller: nav.controller, store: nav.store, label: () => 'Workbench',
    })
    const disposeParent = declareNavigationSlots(nav.core)
    expect(layout.calls).toEqual([null])
    disposeParent()
  })

  it('the tab action drives the shared controller: machine transition + persist + projection', () => {
    const nav = makeNav()
    const layout = makeLayout()
    installSlotNav(makeFakeCtx(nav.core, layout), {
      controller: nav.controller, store: nav.store, label: () => 'Workbench',
    })
    const disposeParent = declareNavigationSlots(nav.core)
    const face = faceOf(mainEntry(nav.core) as StoredEntry)
    ;(face.selectWorkbenchTab as (tab: WorkbenchTabKey) => void)('workbench/features')
    expect(nav.store.getSnapshot()).toEqual({
      view: 'workbench', workbenchTab: 'workbench/features', featureSlug: undefined,
    })
    expect(nav.persistenceWrites.at(-1)).toEqual({ view: 'workbench', workbenchTab: 'workbench/features' })
    expect(layout.calls.at(-1)).toBe('workbench')
    disposeParent()
  })

  it('the feature-detail action drives the shared controller: subview slug lands, projection follows (5.9)', () => {
    const nav = makeNav()
    const layout = makeLayout()
    installSlotNav(makeFakeCtx(nav.core, layout), {
      controller: nav.controller, store: nav.store, label: () => 'Workbench',
    })
    const disposeParent = declareNavigationSlots(nav.core)
    const face = faceOf(mainEntry(nav.core) as StoredEntry)
    ;(face.openFeatureDetail as (slug: string) => void)('dsh-forge-m1')
    expect(nav.store.getSnapshot()).toEqual({
      view: 'workbench', workbenchTab: 'workbench/features', featureSlug: 'dsh-forge-m1',
    })
    // The slug stays session-scoped: the persisted projection carries only
    // the tab dimension (3.3 AC4).
    expect(nav.persistenceWrites.at(-1)).toEqual({ view: 'workbench', workbenchTab: 'workbench/features' })
    expect(layout.calls.at(-1)).toBe('workbench')
    disposeParent()
  })

  it('panel-lifecycle notifications adopt the external view WITHOUT re-projecting (no loop)', () => {
    const nav = makeNav()
    const layout = makeLayout()
    installSlotNav(makeFakeCtx(nav.core, layout), {
      controller: nav.controller, store: nav.store, label: () => 'Workbench',
    })
    const disposeParent = declareNavigationSlots(nav.core)
    const callsAfterCommit = layout.calls.length
    const face = faceOf(mainEntry(nav.core) as StoredEntry)
    // The upstream sidebar row selects us (the shell mounts):
    ;(face.notifyPresented as () => void)()
    expect(nav.store.getSnapshot().view).toBe('workbench')
    expect(nav.persistenceWrites.at(-1)?.view).toBe('workbench')
    // 新建会话/conversation returns (the shell unmounts):
    ;(face.notifyDismissed as () => void)()
    expect(nav.store.getSnapshot().view).toBe('session')
    expect(nav.persistenceWrites.at(-1)?.view).toBe('session')
    expect(layout.calls).toHaveLength(callsAfterCommit)
    disposeParent()
  })

  it('a persistence-driven workbench restore arms the hold: the boot bounce re-selects the panel once', () => {
    const nav = makeNav({ view: 'workbench', workbenchTab: 'workbench/overview' })
    const layout = makeLayout()
    installSlotNav(makeFakeCtx(nav.core, layout), {
      controller: nav.controller, store: nav.store, label: () => 'Workbench',
    })
    const disposeParent = declareNavigationSlots(nav.core)
    expect(layout.calls).toEqual(['workbench'])
    const face = faceOf(mainEntry(nav.core) as StoredEntry)
    // The upstream boot session auto-restore deselects us (shell unmounts):
    ;(face.notifyDismissed as () => void)()
    // The hold re-presents the restored view instead of adopting the bounce…
    expect(layout.calls).toEqual(['workbench', 'workbench'])
    expect(nav.store.getSnapshot().view).toBe('workbench')
    // …and is consumed: the next dismissal is real user intent.
    ;(face.notifyDismissed as () => void)()
    expect(layout.calls).toEqual(['workbench', 'workbench'])
    expect(nav.persistenceWrites.at(-1)?.view).toBe('session')
    disposeParent()
  })

  it('presents safely when the layout service is absent (degraded world: the rail owns presentation)', () => {
    const nav = makeNav({ view: 'workbench', workbenchTab: 'workbench/overview' })
    installSlotNav(makeFakeCtx(nav.core), {
      controller: nav.controller, store: nav.store, label: () => 'Workbench',
    })
    const disposeParent = declareNavigationSlots(nav.core)
    expect(nav.controller.form).toBe('slot')
    nav.controller.switchSession()
    expect(nav.store.getSnapshot().view).toBe('session')
    disposeParent()
  })
})

describe('slot nav: commit notifications and teardown', () => {
  it('onPathLive fires only when BOTH registrations committed (mixed drift holds it back)', () => {
    const nav = makeNav()
    installSlotNav(makeFakeCtx(nav.core), {
      controller: nav.controller, store: nav.store, label: () => 'Workbench',
      onMainCommitted: nav.onMainCommitted, onPathLive: nav.onPathLive,
    })
    // ui-layout declares main only (sidebar reworked away upstream):
    const disposeMainDecl = nav.core.register(
      { name: 'root', children: { [MAIN_SLOT]: { kind: 'keyed', scope: 'root' } } },
      () => null,
    )
    expect(nav.onMainCommitted).toHaveBeenCalledTimes(1)
    expect(nav.onPathLive).not.toHaveBeenCalled()
    disposeMainDecl()
  })

  it('dispose removes the registrations and detaches the carrier', () => {
    const nav = makeNav()
    const dispose = installSlotNav(makeFakeCtx(nav.core), {
      controller: nav.controller, store: nav.store, label: () => 'Workbench',
    })
    const disposeParent = declareNavigationSlots(nav.core)
    expect(nav.controller.form).toBe('slot')
    dispose()
    expect(nav.core.entries(MAIN_SLOT)).toHaveLength(0)
    expect(nav.controller.form).toBeUndefined()
    disposeParent()
  })
})
