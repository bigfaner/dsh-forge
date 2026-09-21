import { describe, expect, it } from 'vitest'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import type { Context } from '@deepseek-ai/cordis'
import { apply as helloWorldApply } from '../../hello-world/src/client/index.ts'
import { apply, registerMode, ReplicaPanelShared, ReplicaPanelOwn, TARGET_SLOT } from '../src/client/index.ts'

// Task 3: the collision matrix against the real upstream SlotCore
// (npm 0.1.6-alpha.2) with the real hello-world client apply as the collision
// partner. Each mode isolates one ui-slots collision mechanism:
//   replica  — same contributed child key, distinct id  -> declaration throw
//   coexist  — own child key, distinct id               -> merge coexistence
//   shadow   — same cell id, lower priority             -> layered takeover
//   tie      — same cell id, same priority              -> explicit throw
// The live official-`dsh web` observations (what the host does with the throw)
// are archived in docs/features/ui-plugin-foundation/dsh-web-assembly-evidence.md.

/** Minimal declaration-lifetime facade over the real core, mirroring SlotRegistry.inject semantics. */
function makeFakeCtx(core: SlotCore, localeRegistry: Map<string, unknown>): Context {
  const ctx = {
    effect(fn: () => (() => void) | undefined | void): () => void {
      const dispose = fn()
      return () => dispose?.()
    },
    locale: {
      register(ns: string, dicts: unknown): () => void {
        localeRegistry.set(ns, dicts)
        return () => localeRegistry.delete(ns)
      },
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
    },
  }
  return ctx as unknown as Context
}

/** Declare the ui-chat core slot the way the Chat view does: a parent children table. */
function declareTargetSlot(core: SlotCore): () => void {
  return core.register(
    { name: 'root', children: { [TARGET_SLOT]: { kind: 'list', scope: 'session' } } },
    () => null,
  )
}

describe('collision fixture solo: independent assembly (AC2)', () => {
  it('applies alone: declares the replicated child key itself and registers its entry', () => {
    const core = new SlotCore()
    const localeRegistry = new Map<string, unknown>()
    apply(makeFakeCtx(core, localeRegistry))
    const disposeParent = declareTargetSlot(core)

    const entries = core.entries(TARGET_SLOT)
    expect(entries).toHaveLength(1)
    expect(entries[0]?.options.id).toBe('hello-world-replica')
    expect(entries[0]?.component).toBe(ReplicaPanelShared)
    // The replica becomes the first (and only) declarer of the shared key.
    expect(core.specDynamic('hello-world.panel')).toEqual({ kind: 'single', scope: 'session' })
    expect(localeRegistry.has('collision')).toBe(true)
    disposeParent()
  })

  it('collapses the replicated declaration when the consumed slot declaration collapses', () => {
    const core = new SlotCore()
    apply(makeFakeCtx(core, new Map()))
    const disposeParent = declareTargetSlot(core)
    expect(core.specDynamic('hello-world.panel')).toBeDefined()

    disposeParent()
    expect(core.specDynamic('hello-world.panel')).toBeUndefined()
    expect(core.entries(TARGET_SLOT)).toHaveLength(0)
  })
})

describe('replica probe: same contributed child key as hello-world', () => {
  it('throws at registration time when hello-world declared the key first, naming the first declarer', () => {
    const core = new SlotCore()
    const fixtureCtx = makeFakeCtx(core, new Map())
    const helloCtx = makeFakeCtx(core, new Map())
    declareTargetSlot(core)
    helloWorldApply(helloCtx)

    expect(() => registerMode(fixtureCtx, 'replica'))
      .toThrowError(/slot "hello-world\.panel" is already declared/)
  })

  it('is order-dependent: with the replica first, hello-world is the one that throws', () => {
    const core = new SlotCore()
    const fixtureCtx = makeFakeCtx(core, new Map())
    const helloCtx = makeFakeCtx(core, new Map())
    declareTargetSlot(core)
    registerMode(fixtureCtx, 'replica')

    expect(() => helloWorldApply(helloCtx))
      .toThrowError(/slot "hello-world\.panel" is already declared/)
  })
})

describe('coexist probe: own child key, distinct id (merge coexistence type)', () => {
  it('coexists with hello-world: both list entries live, both child keys declared', () => {
    const core = new SlotCore()
    const fixtureCtx = makeFakeCtx(core, new Map())
    const helloCtx = makeFakeCtx(core, new Map())
    declareTargetSlot(core)
    helloWorldApply(helloCtx)
    expect(() => registerMode(fixtureCtx, 'coexist')).not.toThrow()

    const ids = core.entries(TARGET_SLOT).map(entry => entry.options.id)
    expect(ids).toEqual(['hello-world', 'hello-world-replica'])
    // The list slot's shadowing read keeps both cells occupied.
    expect(core.entriesOfSlot(TARGET_SLOT)).toHaveLength(2)
    expect(core.specDynamic('hello-world.panel')).toBeDefined()
    expect(core.specDynamic('collision-replica.panel')).toEqual({ kind: 'single', scope: 'session' })
  })
})

describe('shadow probe: same cell id, lower priority (layered-shadowing type)', () => {
  it('takes over the cell without throwing; both entries stay on the ledger, lowest priority renders', () => {
    const core = new SlotCore()
    const fixtureCtx = makeFakeCtx(core, new Map())
    const helloCtx = makeFakeCtx(core, new Map())
    declareTargetSlot(core)
    helloWorldApply(helloCtx)
    expect(() => registerMode(fixtureCtx, 'shadow')).not.toThrow()

    // Raw ledger: both registrations recorded (the loser stays observable).
    expect(core.entries(TARGET_SLOT)).toHaveLength(2)
    // Shadowing projection: one cell (id "hello-world"), the fixture's
    // priority -1 entry wins the ascending order.
    const winners = core.entriesOfSlot(TARGET_SLOT)
    expect(winners).toHaveLength(1)
    expect(winners[0]?.options.id).toBe('hello-world')
    expect(winners[0]?.options.priority).toBe(-1)
    expect(winners[0]?.component).toBe(ReplicaPanelOwn)
  })
})

describe('tie probe: same cell id, same priority (explicit-error type, cell form)', () => {
  it('throws naming the occupied cell and the exact priority', () => {
    const core = new SlotCore()
    const fixtureCtx = makeFakeCtx(core, new Map())
    const helloCtx = makeFakeCtx(core, new Map())
    declareTargetSlot(core)
    helloWorldApply(helloCtx)

    expect(() => registerMode(fixtureCtx, 'tie'))
      .toThrowError(/already has an entry with id "hello-world" at priority 0/)
  })
})
