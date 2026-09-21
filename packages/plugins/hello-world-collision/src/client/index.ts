/**
 * hello-world-collision fixture, browser half: a structural replica of the
 * hello-world entry whose registration shape varies by the build-time MODE
 * constant, exercising one ui-slots collision mechanism per assembly:
 *
 * - 'replica'  — same contributed child key `hello-world.panel`, distinct id:
 *                the declaration-collision probe (first declarer wins, the
 *                second register call throws).
 * - 'coexist'  — own child key, distinct id: no collision, both panels merge
 *                into the list slot (the coexistence control).
 * - 'shadow'   — same cell id `hello-world` at lower priority -1: layered
 *                takeover, the previous occupant stays on the ledger.
 * - 'tie'      — same cell id `hello-world` at the same priority 0: the exact
 *                tie the registry rejects with an explicit throw.
 *
 * Cross-plugin collaboration happens exclusively through cordis services
 * (slots, locale); the module table resolves the framework baseline.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the renderer-owned slots service (ctx.slots) Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { replicaPanelFor } from './ReplicaPanel'
import { TARGET_SLOT } from './contract'
import { en, zh, type CollisionKey } from './locales'
import { createCollisionStore } from './store'
import { MODE, type CollisionMode } from './mode'

/**
 * The two panel instantiations (stable identities): one narrowed to the
 * replicated key, one to the fixture's own key — each mode registers the one
 * matching its children declaration.
 */
export const ReplicaPanelShared = replicaPanelFor('hello-world.panel')
export const ReplicaPanelOwn = replicaPanelFor('collision-replica.panel')

export { replicaPanelFor } from './ReplicaPanel'
export { CHILD_SLOT, MODE, OWN_PANEL_SLOT, SHARED_PANEL_SLOT, type CollisionMode } from './mode'
export { TARGET_SLOT } from './contract'
export type { ChildSlotKey, ReplicaPanelProps } from './contract'
export type { CollisionKey } from './locales'
export type { CollisionState, CollisionStoreHandle } from './store'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The collision-replica panel's copy. */
    collision: CollisionKey
  }

  interface SlotMap {
    /**
     * The same-name key hello-world contributes (replicated here verbatim for
     * the 'replica' probe; identical member types keep the merge compatible).
     */
    'hello-world.panel': { kind: 'single'; scope: 'session' }
    /**
     * The fixture's own sub-slot (control modes): structurally identical to
     * the replicated key, used when the probe must NOT collide on the key.
     */
    'collision-replica.panel': { kind: 'single'; scope: 'session' }
  }
}

/** Dictionary namespace owned by this fixture. */
const NS = 'collision'

/** Required services: the renderer-owned slot registry and the locale face. */
export const inject = ['slots', 'locale']

/**
 * Perform this mode's registration against the slot registry. Exported so the
 * unit matrix can drive every mode against the real SlotCore; `apply` always
 * runs the committed MODE.
 * @param ctx - client root context (or test facade over one).
 * @param mode - the collision probe to run.
 * @returns the registration disposer.
 */
export function registerMode(ctx: ClientContext, mode: CollisionMode): () => void {
  switch (mode) {
    case 'replica':
      // Same contributed child key as hello-world, distinct list id: the
      // children-table declaration is the collision axis under test.
      return ctx.slots.register({
        name: TARGET_SLOT,
        id: 'hello-world-replica',
        order: 51,
        locale: NS,
        registrant: 'hello-world-collision',
        children: {
          'hello-world.panel': { kind: 'single', scope: 'session' },
        },
        store: createCollisionStore,
      }, ReplicaPanelShared)
    case 'coexist':
      // Own child key, distinct id: nothing collides; both entries should
      // coexist in the list slot.
      return ctx.slots.register({
        name: TARGET_SLOT,
        id: 'hello-world-replica',
        order: 51,
        locale: NS,
        registrant: 'hello-world-collision',
        children: {
          'collision-replica.panel': { kind: 'single', scope: 'session' },
        },
        store: createCollisionStore,
      }, ReplicaPanelOwn)
    case 'shadow':
      // Same cell (id), lower priority: layered takeover — ascending order,
      // lowest renders; hello-world's entry stays on the ledger, shadowed.
      return ctx.slots.register({
        name: TARGET_SLOT,
        id: 'hello-world',
        priority: -1,
        locale: NS,
        registrant: 'hello-world-collision',
        children: {
          'collision-replica.panel': { kind: 'single', scope: 'session' },
        },
        store: createCollisionStore,
      }, ReplicaPanelOwn)
    case 'tie':
      // Same cell (id), same default priority: the exact tie the registry
      // rejects loudly, naming the occupant and the priority.
      return ctx.slots.register({
        name: TARGET_SLOT,
        id: 'hello-world',
        priority: 0,
        locale: NS,
        registrant: 'hello-world-collision',
        children: {
          'collision-replica.panel': { kind: 'single', scope: 'session' },
        },
        store: createCollisionStore,
      }, ReplicaPanelOwn)
  }
}

/**
 * Client plugin body: registers the bilingual dictionary, then runs this
 * build's collision probe once the consumed core slot is declared.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'hello-world-collision: dictionaries')
  ctx.slots.inject(TARGET_SLOT, () => registerMode(ctx, MODE))
}
