/**
 * The hello-world store seat: an exclusive per-entry store factory. The
 * framework calls it per entry x scope (one engine instance per session), so
 * every session counts its own hellos — the observable state of the plugin's
 * interaction loop.
 */
import { defineStore } from '@deepseek-ai/dsh-client-store'

/** State of the hello-world store seat. */
export interface HelloWorldState {
  /** How many times this session's panel button was clicked. */
  hellos: number
}

/**
 * Mint the hello-world store handle. Exclusive-factory form on purpose: the
 * handle must not exist at module level (module-cache identity would be a
 * disguised singleton across plugin reloads).
 * @returns a fresh store handle for the registering entry.
 */
export function createHelloWorldStore() {
  return defineStore({
    init: (): HelloWorldState => ({ hellos: 0 }),
    actions: {
      /** Record one more hello (the panel button's whole write set). */
      sayHello(draft: HelloWorldState): void {
        draft.hellos += 1
      },
    },
  })
}

/** The store handle type backing the register call's store seat. */
export type HelloWorldStoreHandle = ReturnType<typeof createHelloWorldStore>
