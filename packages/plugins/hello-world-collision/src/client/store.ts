/**
 * The collision-replica store seat: same exclusive-factory shape as
 * hello-world's (a structural replica), so every mode's registration carries
 * the identical five-share structure and only the collision axes differ.
 */
import { defineStore } from '@deepseek-ai/dsh-client-store'

/** State of the collision-replica store seat. */
export interface CollisionState {
  /** How many times this session's replica panel button was clicked. */
  hellos: number
}

/**
 * Mint the replica store handle. Exclusive-factory form on purpose: the
 * handle must not exist at module level (module-cache identity would be a
 * disguised singleton across plugin reloads).
 * @returns a fresh store handle for the registering entry.
 */
export function createCollisionStore() {
  return defineStore({
    init: (): CollisionState => ({ hellos: 0 }),
    actions: {
      /** Record one more hello (the replica panel button's whole write set). */
      sayHello(draft: CollisionState): void {
        draft.hellos += 1
      },
    },
  })
}

/** The store handle type backing the replica register call's store seat. */
export type CollisionStoreHandle = ReturnType<typeof createCollisionStore>
