import { describe, expect, it, vi } from 'vitest'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import type { Context } from '@deepseek-ai/cordis'
import { apply, MAIN_SLOT, NS, PANEL_ID, SIDEBAR_ORDER, SIDEBAR_SLOT } from '../src/client/index.ts'
import { WorkbenchPanelIcon } from '../src/client/WorkbenchPanelIcon.tsx'
import { WorkbenchShell } from '../src/client/WorkbenchShell.tsx'
import { en, zh } from '../src/client/index.ts'

// The upstream icon resolves through the module table at runtime (browser
// bundle); the npm node entry carries undeclared transitive deps that only
// the upstream monorepo supplies, so the Node-context unit stubs the glyph.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({ IconBranchOutline16: () => null }))

// Task 3.2 AC2 against the real upstream SlotCore (npm 0.1.6-alpha.2): the
// client apply contributes the upstream navigation pair — the `main` keyed
// slot's fresh `workbench` key plus the `sidebar.panellist` icon row entry —
// exactly the registration contract the spike-1 §3 verbatim precedent
// (ui-plugin-manager) established, and registers the bilingual dictionary.

/** Captured locale registrations (ns → dicts). */
const localeRegistry = new Map<string, Record<string, Record<string, string>>>()

/** Minimal declaration-lifetime facade over the real core, mirroring SlotRegistry.inject semantics. */
function makeFakeCtx(core: SlotCore): Context {
  const ctx = {
    effect(fn: () => (() => void) | undefined | void): () => void {
      const dispose = fn()
      return () => dispose?.()
    },
    get: (): undefined => undefined,
    locale: {
      register(ns: string, dicts: Record<string, Record<string, string>>): () => void {
        localeRegistry.set(ns, dicts)
        return () => localeRegistry.delete(ns)
      },
      bind: (ns: string): ((key: string) => string) =>
        (key: string) => String((localeRegistry.get(ns)?.en as Record<string, string> | undefined)?.[key] ?? key),
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

/**
 * Declare the navigation slots the way the upstream frame does (ui-layout's
 * root registration owns `main`; ui-sidebar's sidebar registration owns
 * `sidebar.panellist`): one parent registration carrying both children.
 */
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

describe('forge-workbench client half: the navigation slot pair (AC2, spike §3)', () => {
  it('targets the spike-resolved contract names, not placeholders', () => {
    expect(MAIN_SLOT).toBe('main')
    expect(SIDEBAR_SLOT).toBe('sidebar.panellist')
    expect(PANEL_ID).toBe('workbench')
    expect(SIDEBAR_ORDER).toBe(10)
  })

  it('waits for the slot declarations instead of registering into undeclared slots', () => {
    const core = new SlotCore()
    localeRegistry.clear()
    apply(makeFakeCtx(core))

    expect(core.entries(MAIN_SLOT)).toHaveLength(0)
    expect(core.entries(SIDEBAR_SLOT)).toHaveLength(0)
    // The dictionary registers unconditionally — it waits for no arrival.
    expect(localeRegistry.has(NS)).toBe(true)
  })

  it('claims the main slot\'s fresh workbench key with the shell component', () => {
    const core = new SlotCore()
    apply(makeFakeCtx(core))
    const disposeParent = declareNavigationSlots(core)

    const entries = core.entries(MAIN_SLOT)
    expect(entries).toHaveLength(1)
    // SlotCore normalizes the keyed entry down to its claim: the key. The
    // locale option rides the registration (label resolution input), not the
    // normalized entry.
    expect(entries[0]?.options.key).toBe('workbench')
    expect(entries[0]?.component).toBe(WorkbenchShell)
    disposeParent()
  })

  it('adds the sidebar row: id workbench, order 10, icon component, locale-aware label', () => {
    const core = new SlotCore()
    apply(makeFakeCtx(core))
    const disposeParent = declareNavigationSlots(core)

    const entries = core.entries(SIDEBAR_SLOT)
    expect(entries).toHaveLength(1)
    // SlotCore normalizes the list entry to {id, order}; the label thunk and
    // locale resolve into the row's presentation metadata upstream.
    expect(entries[0]?.options.id).toBe('workbench')
    expect(entries[0]?.options.order).toBe(10)
    expect(entries[0]?.component).toBe(WorkbenchPanelIcon)
    disposeParent()
  })
})

describe('forge-workbench client half: navigation co-existence (AC2/AC5)', () => {
  it('sits beside the shipped plugins panel: fresh key adds a column, replaces nothing', () => {
    const core = new SlotCore()
    apply(makeFakeCtx(core))
    const disposeParent = declareNavigationSlots(core)

    // The shipped precedent occupant: ui-plugin-manager's `plugins` keyed entry.
    const disposePlugins = core.register(
      { name: MAIN_SLOT, key: 'plugins', order: 0 } as Parameters<SlotCore['register']>[0],
      () => null as never,
    )

    const keys = core.entries(MAIN_SLOT).map(entry => entry.options.key)
    expect(keys).toEqual(expect.arrayContaining(['workbench', 'plugins']))
    expect(core.entries(MAIN_SLOT)).toHaveLength(2)
    disposePlugins()
    disposeParent()
  })
})

describe('forge-workbench client half: bilingual dictionary (AC2)', () => {
  it('registers the workbench NS with zh and en carrying the identical key set', () => {
    const core = new SlotCore()
    localeRegistry.clear()
    apply(makeFakeCtx(core))

    const dicts = localeRegistry.get(NS)
    expect(dicts).toBeDefined()
    expect(Object.keys(dicts?.zh ?? {})).toEqual(Object.keys(dicts?.en ?? {}))
    expect(Object.keys(dicts?.en ?? {}).length).toBeGreaterThan(0)
    // Spot copy: the fallback-locale (en) and zh strings differ but key onto the same ids.
    for (const key of Object.keys(dicts?.en ?? {})) {
      expect(typeof dicts?.en[key]).toBe('string')
      expect(typeof dicts?.zh[key]).toBe('string')
    }
    expect(en['panel']).toBe('Workbench')
    expect(zh['panel']).toBe('工作台')
  })
})
