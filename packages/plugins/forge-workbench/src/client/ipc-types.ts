/**
 * The Interface 1 DTO family, client half (task 5.1) — the structural source
 * the 5.x build tasks consume (UI dependency layering: build tasks import DTO
 * TYPES + mock data only; the IPC runtime is wired by the 5.14-5.16 assembly
 * tasks). PURE TYPES, zero runtime code.
 *
 * The plugin package cannot depend on the app (the 4.1 precedent — see
 * host/forge-bridge.ts), so this file is the client-side declaration of the
 * SAME shapes the main process serves: field definitions follow tech-design
 * §Interface 1 as the single authority, the main-side peer being
 * apps/desktop/src/main/workbench/ipc/types.ts (task 2.7). Both halves derive
 * from the spec section; a field drifting from it is a defect on either side.
 *
 * Scope note: this lands with the chrome-relevant subset (getState's
 * assembly). Later 5.x tasks extend the module with the board/detail/doc DTOs
 * they consume — the same incremental growth the main-side module followed.
 */

/**
 * Where a project's feature documents live (Interface 1): inside the repo, or
 * an explicitly authorized external path.
 */
export type DocLocationType = 'in_repo' | 'external'

/**
 * A registered project (workbench-owned state, single source of truth in the
 * main-process store; the renderer only ever sees this DTO).
 */
export interface Project {
  /** crypto.randomUUID(), minted by the main process at registration. */
  readonly id: string
  readonly displayName: string
  /** Absolute, normalized at registration. */
  readonly codeRoot: string
  readonly docLocationType: DocLocationType
  /** Non-null and ≠ codeRoot when external; always null when in_repo. */
  readonly docLocationPath: string | null
  /** ISO 8601 UTC. */
  readonly createdAt: string
  readonly lastActivatedAt: string | null
}

/** One plugin row in the two-level model (mandatory derived from the product manifest). */
export interface PluginRow {
  readonly name: string
  readonly mandatory: boolean
  readonly enabled: boolean
}

/**
 * workbench.getState()'s assembly (Interface 1): the project registry, the
 * single-activation pointer, and the plugin rows. `activeProjectId === null`
 * is the page-map state gate: the tasks/features views guide to registration
 * instead of erroring.
 */
export interface WorkbenchState {
  readonly projects: readonly Project[]
  readonly activeProjectId: string | null
  readonly plugins: readonly PluginRow[]
}
