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
import type {
  GlobalStandardProps, PropsLocale, PropsRuntime, SnapshotSelectorHook,
} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the `main` keyed slot declaration + MainPanelId brand into
// this program's SlotMap view (declared by ui-layout).
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the `sidebar.panellist` list declaration + its owner props
// into this program's SlotMap view (declared by ui-sidebar).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { ViewKeySnapshot, WorkbenchTabKey } from './store/view-key'

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

/**
 * The view face the main registration injects (task 3.3) and the fallback
 * rail reproduces verbatim — the same face in both forms is what makes the
 * two shells behaviorally identical by construction.
 */
export interface WorkbenchViewFace {
  /**
   * Selector hook over the view-key machine — the upstream selector-hook
   * currency (`usePanelInfo` precedent). Framework-synthesized from the
   * registration's inject hooks compartment in the slot path; hand-bound in
   * the rail.
   */
  useViewKey: SnapshotSelectorHook<ViewKeySnapshot>
  /** Switch the workbench interior tab (the shell's tab-strip action). */
  selectWorkbenchTab: (tab: WorkbenchTabKey) => void
}

/**
 * Panel-lifecycle notifications (slot path only: the keyed main slot mounts
 * the shell only while it is the selected panel — mount/unmount IS the
 * external-selection signal).
 */
export interface WorkbenchPanelLifecycle {
  /** The workbench panel became the active main panel (an external actor selected it). */
  notifyPresented: () => void
  /** The workbench panel left the main area (an external actor selected another panel). */
  notifyDismissed: () => void
}

/**
 * Composed props of the main-panel shell component. The framework standard
 * kit (GlobalStandardProps — `usePanelInfo` & co.) is deliberately omitted
 * from the requirement: the fallback rail mounts the SAME component outside
 * the slot tree, where no framework kit exists, and the shell renders
 * identically in both forms (Hard Rule). The framework still injects its kit
 * in the slot path — extra props a component doesn't read are harmless.
 */
export type WorkbenchShellProps =
  & Omit<PropsRuntime<typeof MAIN_SLOT, typeof PANEL_ID>, keyof GlobalStandardProps>
  & PropsLocale<typeof NS>
  & WorkbenchViewFace
  & Partial<WorkbenchPanelLifecycle>

/** Composed props of the sidebar icon (the sidebar's icon share). */
export type WorkbenchPanelIconProps = PropsRuntime<typeof SIDEBAR_SLOT>
