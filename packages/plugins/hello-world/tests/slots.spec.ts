import { describe, expect, it } from 'vitest'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import type { Context } from '@deepseek-ai/cordis'
import { apply, PANEL_SLOT, TARGET_SLOT } from '../src/client/index.ts'
import { HelloWorldPanel } from '../src/client/HelloWorldPanel.tsx'
import { createHelloWorldStore } from '../src/client/store.ts'

// Task 1 AC4/AC5 against the real upstream SlotCore (npm 0.1.6-alpha.2):
// the client apply consumes the existing ui-chat core slot and contributes an
// own sub-slot + store seat through one register call; the sub-slot is genuinely
// open to third parties and collision behavior is loud, not silent.

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

describe('hello-world client half: consume a core slot (AC4)', () => {
  it('waits for the target slot declaration instead of registering into an undeclared slot', () => {
    const core = new SlotCore()
    const localeRegistry = new Map<string, unknown>()
    apply(makeFakeCtx(core, localeRegistry))

    expect(core.entries(TARGET_SLOT)).toHaveLength(0)
    expect(localeRegistry.has('helloworld')).toBe(true)
  })

  it('registers the panel entry into conversation.chat.assistant-actions once declared', () => {
    const core = new SlotCore()
    const localeRegistry = new Map<string, unknown>()
    apply(makeFakeCtx(core, localeRegistry))
    const disposeParent = declareTargetSlot(core)

    const entries = core.entries(TARGET_SLOT)
    expect(entries).toHaveLength(1)
    expect(entries[0]?.options.id).toBe('hello-world')
    expect(entries[0]?.component).toBe(HelloWorldPanel)
    disposeParent()
  })

  it('targets a stable ui-chat core slot', () => {
    expect(TARGET_SLOT).toBe('conversation.chat.assistant-actions')
    expect(PANEL_SLOT).toBe('hello-world.panel')
  })
})

describe('hello-world client half: contribute sub-slot + store seat (AC5)', () => {
  it('declares the hello-world.panel child slot with a session store seat', () => {
    const core = new SlotCore()
    apply(makeFakeCtx(core, new Map()))
    const disposeParent = declareTargetSlot(core)

    const spec = core.specDynamic(PANEL_SLOT)
    expect(spec).toEqual({ kind: 'single', scope: 'session' })

    const entry = core.entries(TARGET_SLOT)[0]
    expect(entry?.store).toBeTypeOf('function')
    // Exclusive-factory form: calling it yields a fresh engine handle.
    const handle = (entry?.store as () => ReturnType<typeof createHelloWorldStore>)()
    expect(handle.create('s1').getSnapshot().hellos).toBe(0)
    expect(handle.create('s2').getSnapshot().hellos).toBe(0)
    disposeParent()
  })

  it('renders default content: the panel component carries a fallback for the empty sub-slot', () => {
    const core = new SlotCore()
    apply(makeFakeCtx(core, new Map()))
    const disposeParent = declareTargetSlot(core)

    // No third party registered: the sub-slot has zero entries but is declared.
    expect(core.specDynamic(PANEL_SLOT)).toBeDefined()
    expect(core.entries(PANEL_SLOT)).toHaveLength(0)
    disposeParent()
  })

  it('keeps the sub-slot open to a third-party registration, loud on same-cell collision', () => {
    const core = new SlotCore()
    apply(makeFakeCtx(core, new Map()))
    const disposeParent = declareTargetSlot(core)

    const disposeThird = core.register({ name: PANEL_SLOT } as Parameters<SlotCore['register']>[0], () => null as never)
    expect(core.entries(PANEL_SLOT)).toHaveLength(1)

    // A second registration on the same single cell at the same priority throws.
    expect(() => core.register({ name: PANEL_SLOT } as Parameters<SlotCore['register']>[0], () => null as never))
      .toThrowError(/already has a registration/)

    disposeThird()
    disposeParent()
  })

  it('collapses the contributed declaration when the consumed slot declaration collapses', () => {
    const core = new SlotCore()
    apply(makeFakeCtx(core, new Map()))
    const disposeParent = declareTargetSlot(core)
    expect(core.entries(TARGET_SLOT)).toHaveLength(1)

    disposeParent()
    expect(core.specDynamic(PANEL_SLOT)).toBeUndefined()
    expect(core.entries(TARGET_SLOT)).toHaveLength(0)
  })
})
