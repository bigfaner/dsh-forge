/**
 * The fixture's collision probe selector. One build-time constant picks which
 * ui-slots collision mechanism this assembly exercises; the committed default
 * is 'replica' (the fixture's namesake probe). Switching = edit the constant,
 * rebuild, repack, reinstall — every archived scenario records the mode it
 * used, so each probe is independently reproducible.
 *
 * - 'replica'  — same contributed child key `hello-world.panel`, distinct list
 *                id `hello-world-replica`: the declaration-collision probe.
 *                First declarer wins; the second register call throws.
 * - 'coexist'  — own child key `collision-replica.panel`, distinct id: the
 *                no-collision control; both entries coexist in the list slot.
 * - 'shadow'   — same cell id `hello-world` at lower priority -1: layered
 *                takeover (ascending order, lowest renders); the previous
 *                occupant stays on the ledger, shadowed.
 * - 'tie'      — same cell id `hello-world` at the same default priority 0:
 *                the exact tie the registry rejects with an explicit throw.
 */

/** Which same-key collision mechanism this build probes. */
export type CollisionMode =
  | 'replica'
  | 'coexist'
  | 'shadow'
  | 'tie'

/** The committed probe (see the module doc for switching). */
export const MODE: CollisionMode = 'replica'

/** The same-name key this fixture replicates from hello-world's contribution. */
export const SHARED_PANEL_SLOT = 'hello-world.panel'

/** The fixture's own, non-colliding child-slot key (control modes). */
export const OWN_PANEL_SLOT = 'collision-replica.panel'

/** The child key one mode's registration declares. */
export function childSlotOf(mode: CollisionMode): typeof SHARED_PANEL_SLOT | typeof OWN_PANEL_SLOT {
  return mode === 'replica' ? SHARED_PANEL_SLOT : OWN_PANEL_SLOT
}

/** The child key this build's registration declares (mode-derived). */
export const CHILD_SLOT = childSlotOf(MODE)
