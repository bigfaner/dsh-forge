import { describe, expect, it, vi } from 'vitest'
import { ViewSwitchController } from '../src/client/nav/view-switch.ts'
import { createViewKeyStore } from '../src/client/store/view-key.ts'
import type { PersistedViewKey, ViewKeySnapshot } from '../src/client/store/view-key.ts'
import type { ViewCarrier } from '../src/client/nav/view-switch.ts'

// Task 3.3 Hard Rule (两形态行为契约逐项一致) is structural: BOTH forms call
// the same controller methods, which transition the same machine, persist the
// same projection, and project onto the single live carrier. These tests pin
// the write path, the attach-time projection (the restart restore), carrier
// exclusivity, and the external-adoption no-loop guarantee.

function makeController(initial?: PersistedViewKey): {
  controller: ViewSwitchController
  persist: PersistedViewKey[]
} {
  const persist: PersistedViewKey[] = []
  const store = createViewKeyStore({
    read: () => initial,
    write: (value) => { persist.push(value); initial = value },
  })
  return { controller: new ViewSwitchController(store), persist }
}

function recordingCarrier(form: 'slot' | 'rail'): ViewCarrier & { presented: ViewKeySnapshot[] } {
  const presented: ViewKeySnapshot[] = []
  return {
    form,
    present: (snapshot) => { presented.push(snapshot) },
    presented,
  }
}

describe('ViewSwitchController: the one write path (AC1/AC2)', () => {
  it('switchSession/switchWorkbench transition, persist, and present to the live carrier', () => {
    const { controller, persist } = makeController()
    const carrier = recordingCarrier('slot')
    controller.attach(carrier)
    controller.switchWorkbench()
    expect(carrier.presented.at(-1)?.view).toBe('workbench')
    expect(persist.at(-1)).toEqual({ view: 'workbench', workbenchTab: 'workbench/overview' })
    controller.switchSession()
    expect(carrier.presented.at(-1)?.view).toBe('session')
    expect(persist.at(-1)).toEqual({ view: 'session', workbenchTab: 'workbench/overview' })
  })

  it('switchWorkbenchTab projects and persists the tab (identical action in both forms)', () => {
    const { controller, persist } = makeController()
    const carrier = recordingCarrier('rail')
    controller.attach(carrier)
    controller.switchWorkbenchTab('workbench/features')
    expect(carrier.presented.at(-1)).toEqual({
      view: 'workbench', workbenchTab: 'workbench/features', featureSlug: undefined,
    })
    expect(persist.at(-1)).toEqual({ view: 'workbench', workbenchTab: 'workbench/features' })
  })

  it('openFeatureDetail (5.9) transitions the subview slug and projects it; the slug never persists', () => {
    const { controller, persist } = makeController()
    const carrier = recordingCarrier('slot')
    controller.attach(carrier)
    controller.openFeatureDetail('dsh-forge-m2')
    expect(carrier.presented.at(-1)).toEqual({
      view: 'workbench', workbenchTab: 'workbench/features', featureSlug: 'dsh-forge-m2',
    })
    // Session-scoped slug: the persisted projection keeps only the tab.
    expect(persist.at(-1)).toEqual({ view: 'workbench', workbenchTab: 'workbench/features' })
    // The return trip: the tab action clears the slug (the return stack).
    controller.switchWorkbenchTab('workbench/features')
    expect(carrier.presented.at(-1)).toEqual({
      view: 'workbench', workbenchTab: 'workbench/features', featureSlug: undefined,
    })
  })

  it('openProposalDetail (5.5, UF5) rides the same one write path — transition, projection, no persistence', () => {
    const { controller, persist } = makeController()
    const carrier = recordingCarrier('rail')
    controller.attach(carrier)
    controller.openProposalDetail('dsh-forge-m2')
    expect(carrier.presented.at(-1)).toEqual({
      view: 'workbench', workbenchTab: 'workbench/proposals', featureSlug: undefined, proposalSlug: 'dsh-forge-m2',
    })
    // Session-scoped slug: the persisted projection keeps only the tab.
    expect(persist.at(-1)).toEqual({ view: 'workbench', workbenchTab: 'workbench/proposals' })
    // The breadcrumb return: the tab action clears the slug.
    controller.switchWorkbenchTab('workbench/proposals')
    expect(carrier.presented.at(-1)).toEqual({
      view: 'workbench', workbenchTab: 'workbench/proposals', featureSlug: undefined, proposalSlug: undefined,
    })
  })

  it('presents WITHOUT a live carrier (grace window) — the transition and persist still land', () => {
    const { controller, persist } = makeController()
    controller.switchWorkbench('workbench/tasks')
    expect(controller.form).toBeUndefined()
    expect(persist.at(-1)).toEqual({ view: 'workbench', workbenchTab: 'workbench/tasks' })
  })
})

describe('ViewSwitchController: carrier lifecycle', () => {
  it('attach projects the current snapshot — the attach-time projection IS the restart restore', () => {
    const { controller } = makeController({ view: 'workbench', workbenchTab: 'workbench/tasks' })
    const carrier = recordingCarrier('slot')
    controller.attach(carrier)
    expect(carrier.presented).toEqual([{
      view: 'workbench', workbenchTab: 'workbench/tasks', featureSlug: undefined,
    }])
  })

  it('carriers are exclusive: attaching the rail replaces the slot carrier (never two presenters)', () => {
    const { controller } = makeController()
    const slot = recordingCarrier('slot')
    const rail = recordingCarrier('rail')
    controller.attach(slot)
    controller.attach(rail)
    controller.switchSession()
    expect(slot.presented).toHaveLength(1) // only the attach projection
    expect(rail.presented.at(-1)?.view).toBe('session')
    expect(controller.form).toBe('rail')
  })

  it('detach stops projection; detaching a foreign carrier is a no-op', () => {
    const { controller } = makeController()
    const slot = recordingCarrier('slot')
    const rail = recordingCarrier('rail')
    controller.attach(slot)
    controller.detach(rail)
    expect(controller.form).toBe('slot')
    controller.detach(slot)
    expect(controller.form).toBeUndefined()
  })
})

describe('ViewSwitchController: external selection sync (AC1 slot path)', () => {
  it('adopts an external view WITHOUT re-presenting (no projection loop) but persists it', () => {
    const { controller, persist } = makeController()
    const carrier = recordingCarrier('slot')
    controller.attach(carrier)
    const presentedOnAttach = carrier.presented.length
    controller.adoptExternalView('workbench')
    expect(carrier.presented).toHaveLength(presentedOnAttach)
    expect(persist.at(-1)?.view).toBe('workbench')
  })

  it('same-view adoption is a full no-op', () => {
    const { controller, persist } = makeController({ view: 'workbench', workbenchTab: 'workbench/overview' })
    const listener = vi.fn()
    controller.attach(recordingCarrier('slot'))
    persist.length = 0
    controller.adoptExternalView('workbench')
    expect(persist).toHaveLength(0)
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('ViewSwitchController: the one-shot boot-restore hold (AC4 vs the upstream session auto-restore)', () => {
  it('an armed hold re-presents the restored workbench view on the FIRST external dismissal, then adopts normally', () => {
    const { controller, persist } = makeController({ view: 'workbench', workbenchTab: 'workbench/features' })
    const carrier = recordingCarrier('slot')
    controller.armRestoreHold()
    controller.attach(carrier)
    const presentedOnAttach = carrier.presented.length
    // The upstream boot session auto-restore deselects the panel:
    controller.adoptExternalView('session')
    expect(carrier.presented).toHaveLength(presentedOnAttach + 1)
    expect(carrier.presented.at(-1)?.view).toBe('workbench')
    // The restore held: no adoption happened, so no write landed at all.
    expect(persist).toHaveLength(0)
    // The hold is consumed: a later dismissal (real user intent) adopts.
    controller.adoptExternalView('session')
    expect(persist.at(-1)?.view).toBe('session')
  })

  it('an unarmed controller keeps adopting (the hold only guards persistence-driven restores)', () => {
    const { controller } = makeController({ view: 'workbench', workbenchTab: 'workbench/overview' })
    const carrier = recordingCarrier('slot')
    controller.attach(carrier)
    controller.adoptExternalView('session')
    expect(carrier.presented).toHaveLength(1) // attach projection only
  })
})
