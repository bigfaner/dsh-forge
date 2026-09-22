// @vitest-environment jsdom
import { act } from '@testing-library/react'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import type { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAIN_SLOT, RAIL_GRACE_MS, SIDEBAR_SLOT, apply, createLocalStoragePersistence,
} from '../src/client/index.ts'

// The upstream icon resolves through the module table at runtime (browser
// bundle); the npm node entry carries undeclared transitive deps only the
// upstream monorepo supplies — the jsdom mount stubs the glyphs.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconBranchOutline16: () => null,
  IconNewChatOutline16: () => null,
  // Task 5.12: the overview page's UF6 plugin section renders StateDot rows.
  StateDot: () => null,
}))

// Task 3.3 AC2 fallback trigger (槽位不可用时自动启用) at the coordinator
// level: apply() assembles BOTH navigation forms around the real SlotCore —
// the preferred slot path on declaration arrival, the rail after the boot
// grace expires without them, and the rail standing down when the preferred
// path completes (including mid-boot, after the grace had already engaged).

const railPresent = (): boolean => document.querySelector('[data-dsh-forge-rail]') !== null
const overlayPresent = (): boolean => document.querySelector('[data-dsh-forge-rail-overlay]') !== null
const shellRegistered = (core: SlotCore): boolean =>
  core.entries(MAIN_SLOT).some(entry => entry.options.key === 'workbench')
const rowRegistered = (core: SlotCore): boolean =>
  core.entries(SIDEBAR_SLOT).some(entry => entry.options.id === 'workbench')

/** Fake client ctx over the real core, tracking effect disposers for teardown assertions. */
function makeCtx(core: SlotCore): Context {
  const disposers: (() => void)[] = []
  const ctx = {
    effect(fn: () => (() => void) | undefined | void): () => void {
      const dispose = fn()
      const wrapped = () => { dispose?.() }
      disposers.push(wrapped)
      return wrapped
    },
    get: () => undefined,
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
    disposeAll: () => { for (const dispose of disposers.splice(0)) dispose() },
  }
  return ctx as unknown as Context
}

/** Declare the navigation slots the way the upstream frame does. */
function declareNavSlots(core: SlotCore): () => void {
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

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('form coordinator: the preferred path (AC1)', () => {
  it('declared slots → registrations commit and the rail NEVER engages, grace included', () => {
    const core = new SlotCore()
    const disposeParent = declareNavSlots(core)
    apply(makeCtx(core))
    expect(shellRegistered(core)).toBe(true)
    expect(rowRegistered(core)).toBe(true)
    expect(railPresent()).toBe(false)
    vi.advanceTimersByTime(RAIL_GRACE_MS + 1)
    expect(railPresent()).toBe(false)
    disposeParent()
  })

  it('first boot defaults to the session view (no persisted workbench selection leaks in)', () => {
    const core = new SlotCore()
    const disposeParent = declareNavSlots(core)
    apply(makeCtx(core))
    expect(createLocalStoragePersistence().read()).toBeUndefined()
    disposeParent()
  })
})

describe('form coordinator: the fallback trigger (AC2)', () => {
  it('grace expiry without declarations → the rail engages in overlay mode (the plugin owns the surface)', async () => {
    const core = new SlotCore()
    apply(makeCtx(core))
    expect(railPresent()).toBe(false)
    vi.advanceTimersByTime(RAIL_GRACE_MS + 1)
    await act(async () => {})
    expect(railPresent()).toBe(true)
    expect(overlayPresent()).toBe(true)
  })

  it('mid-boot declaration arrival stands the engaged rail back down and completes the slot path', async () => {
    const core = new SlotCore()
    apply(makeCtx(core))
    vi.advanceTimersByTime(RAIL_GRACE_MS + 1)
    await act(async () => {})
    expect(railPresent()).toBe(true)
    const disposeParent = declareNavSlots(core)
    expect(shellRegistered(core)).toBe(true)
    expect(rowRegistered(core)).toBe(true)
    expect(railPresent()).toBe(false)
    expect(overlayPresent()).toBe(false)
    disposeParent()
  })

  it('mixed drift (main declared, sidebar missing) → the rail engages in chrome mode beside the slot registration', async () => {
    const core = new SlotCore()
    apply(makeCtx(core))
    // ui-layout declares main only (ui-sidebar reworked away upstream):
    const disposeMain = core.register(
      { name: 'root', children: { [MAIN_SLOT]: { kind: 'keyed', scope: 'root' } } },
      () => null,
    )
    expect(shellRegistered(core)).toBe(true)
    expect(rowRegistered(core)).toBe(false)
    vi.advanceTimersByTime(RAIL_GRACE_MS + 1)
    await act(async () => {})
    expect(railPresent()).toBe(true)
    expect(overlayPresent()).toBe(false) // the keyed slot presents; the rail is the visible toggle
    disposeMain()
  })

  it('mid-boot main arrival rebuilds an engaged overlay rail as chrome (no zombie plugin surface)', async () => {
    const core = new SlotCore()
    apply(makeCtx(core))
    vi.advanceTimersByTime(RAIL_GRACE_MS + 1)
    await act(async () => {})
    expect(overlayPresent()).toBe(true)
    const disposeMain = core.register(
      { name: 'root', children: { [MAIN_SLOT]: { kind: 'keyed', scope: 'root' } } },
      () => null,
    )
    await act(async () => {})
    expect(shellRegistered(core)).toBe(true)
    expect(railPresent()).toBe(true)
    expect(overlayPresent()).toBe(false)
    disposeMain()
  })
})
