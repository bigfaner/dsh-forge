/**
 * The store seat posture: an exclusive per-entry store factory. The framework
 * calls it per entry x scope (one engine instance per session), so every
 * session owns its own state — the observable state of your plugin's
 * interaction loop. The handle must not exist at module level (module-cache
 * identity would be a disguised singleton across plugin reloads).
 */
import { defineStore } from '@deepseek-ai/dsh-client-store'

/** State of the template's store seat. */
export interface TemplateState {
  /** How many times this session's panel button was clicked. */
  clicks: number
}

/**
 * Mint the store handle. Exclusive-factory form on purpose (see module docs).
 * @returns a fresh store handle for the registering entry.
 */
export function createTemplateStore() {
  return defineStore({
    init: (): TemplateState => ({ clicks: 0 }),
    actions: {
      /** Record one more interaction (the panel button's whole write set). */
      sayHello(draft: TemplateState): void {
        draft.clicks += 1
      },
    },
  })
}

/** The store handle type backing the register call's store seat. */
export type TemplateStoreHandle = ReturnType<typeof createTemplateStore>
