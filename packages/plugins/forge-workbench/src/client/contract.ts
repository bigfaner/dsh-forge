/**
 * The forge-workbench entry's slot contract (spike-1 §3, D3 落定): the nav
 * injection is one registration into TWO upstream navigation slots —
 *
 *   main               (keyed, root scope, declared by ui-layout) — the
 *                      central panel a fresh key claims; the workbench shell
 *                      renders here beside `conversation` and `plugins`.
 *   sidebar.panellist  (list, root scope, declared by ui-sidebar) — the
 *                      global panel icon row; each list id addresses the
 *                      matching main panel.
 *
 * Verbatim precedent: upstream ui-plugin-manager (PANEL_ID='plugins'). The
 * spike resolved the names against the generated compile-time slot catalog,
 * so these are the contract-stable identifiers, not placeholders.
 */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the `main` keyed slot declaration + MainPanelId brand into
// this program's SlotMap view (declared by ui-layout).
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the `sidebar.panellist` list declaration + its owner props
// into this program's SlotMap view (declared by ui-sidebar).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

/** Dictionary namespace owned by this plugin (LocaleNamespaceMap merge target). */
export const NS = 'workbench'

/**
 * The panel id shared by both registrations: the `main` slot key and the
 * `sidebar.panellist` list id. Fresh key/id — no shipped occupant owns it, so
 * the entry adds a column beside conversation/plugins instead of replacing.
 */
export const PANEL_ID = 'workbench' as MainPanelId

/** The central-panel slot (declared by ui-layout; keyed, root scope). */
export const MAIN_SLOT = 'main'

/** The global panel icon row (declared by ui-sidebar; list, root scope). */
export const SIDEBAR_SLOT = 'sidebar.panellist'

/**
 * Sidebar row position: ascending, default 0. `plugins` occupies 0, so the
 * workbench takes 10 — beside, not colliding with, the shipped entries
 * (spike §3.3 recommendation).
 */
export const SIDEBAR_ORDER = 10

/** Composed props of the main-panel shell component (runtime share + `t` seat). */
export type WorkbenchShellProps =
  & PropsRuntime<typeof MAIN_SLOT, typeof PANEL_ID>
  & PropsLocale<typeof NS>

/** Composed props of the sidebar icon (the sidebar's icon share). */
export type WorkbenchPanelIconProps = PropsRuntime<typeof SIDEBAR_SLOT>
