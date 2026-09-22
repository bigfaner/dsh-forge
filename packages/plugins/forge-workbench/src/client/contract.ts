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
import type { Project, ProjectPatch, RecordSessionLinkInput, SessionLink, WorkbenchState } from './ipc-types'
import type { GetTaskPromptResult } from './services'
import type { SessionLaunchInput, SessionLaunchResult } from './session-launch'

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
 * The chrome's data + action face (task 5.1, UI dependency layering): the
 * 5.x BUILD stage renders against DTO types + the shared mock (the shell
 * defaults to mocks/workbench.ts when the face is absent), and the 5.14-5.16
 * ASSEMBLY tasks inject the IPC-backed implementation — the seam is these
 * three members, no shell rewrite.
 */
export interface WorkbenchChromeFace {
  /** Interface 1 workbench.getState()'s assembly (projects + single activation + plugin rows). */
  readonly workbenchState: WorkbenchState
  /** Interface 1 activateProject(id) — single activation; build stage = local stub. */
  readonly activateProject: (id: string) => void
  /** The register entry — the 5.4 wizard owns the dialog; stubbed until it lands. */
  readonly addProject: () => void
}

/**
 * The overview page's data + action face (task 5.3, UI dependency layering —
 * the same seam shape as WorkbenchChromeFace / SessionLaunchServices): the
 * BUILD stage renders against the shared mock twin
 * (mocks/workbench.createMockOverviewFace), the 5.14 assembly task injects
 * the Interface 1 IPC verbs. Every member mirrors its §Interface 1 verb
 * one-to-one — rejections surface the serialized {@link WorkbenchVerbError}
 * shape so the page's code mapping is the real one from day one.
 */
export interface OverviewFace {
  /** Interface 1 workbench.getState() — the page's data load (loading/ready phases). */
  loadState(): Promise<WorkbenchState>
  /** Interface 1 activateProject(id) — single activation (the transaction lives main-side). */
  activateProject(id: string): Promise<void>
  /** Interface 1 updateProject(id, patch) — the rename action's verb (displayName patch). */
  updateProject(id: string, patch: ProjectPatch): Promise<Project>
  /** Interface 1 removeProject(id) — registration-only; project files are never touched. */
  removeProject(id: string): Promise<void>
}

/**
 * The shell's passthrough seat for the overview page (task 5.3): one optional
 * prop object the 5.14 assembly uses to hand the page its IPC-backed face and
 * the sync-derived signals — absent entirely in the build stage (the page
 * then runs on its own mock twin).
 */
export interface WorkbenchOverviewSeat {
  /** The page face — absent members fall back to the build-stage mock (5.14 injects the IPC face). */
  readonly face?: Partial<OverviewFace>
  /**
   * Project ids whose codeRoot/docLocation re-validation failed (5.14 derives
   * from sync_state): drives the per-card 失联徽标 and, for the active
   * project, the error card with 重新指向/移除 (ui-design UF1 error 态).
   */
  readonly lostProjectIds?: readonly string[]
  /** The repoint seam — the 5.4 wizard edit mode owns the dialog this fires. */
  readonly onRepoint?: (project: Project) => void
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
  /** The chrome face is partial: absent members fall back to the build-stage mock (task 5.1). */
  & Partial<WorkbenchChromeFace>
  /** The overview page's assembly seat (task 5.3): absent = the page-local mock twin. */
  & { overview?: WorkbenchOverviewSeat }

/** Composed props of the sidebar icon (the sidebar's icon share). */
export type WorkbenchPanelIconProps = PropsRuntime<typeof SIDEBAR_SLOT>

/**
 * The task identity the UF5 launch entry needs (task 5.10): the project the
 * task belongs to (link persistence + launch cwd), and the workbench dialect
 * address — the entry derives the QUALIFIED key `<featureSlug>/<localId>`
 * (task 2.5) for both the prompt probe and recordSessionLink.
 */
export interface SessionLaunchTaskRef {
  readonly projectId: string
  /** Registered project codeRoot — the DF004 create-cwd (Interface 2 / spike-1 §2.1). */
  readonly codeRoot: string
  readonly featureSlug: string
  readonly localId: string
  /** Display title (the launch input's `title`). */
  readonly title: string
}

/**
 * The UF5 launch entry's service face (task 5.10, UI dependency layering —
 * same seam shape as WorkbenchChromeFace): the BUILD stage renders against
 * mocks/workbench.ts defaults, the 5.11 integrate task swaps the members for
 * the real `ctx.remote.forgeBridge` / `ctx.remote.sessionLaunch` /
 * `ctx.remote.session` / M1 session-focus form calls. Every remote-shaped
 * member returns the host-half result types verbatim (reasonCode convention).
 */
export interface SessionLaunchServices {
  /** Availability probe: `ctx.remote.forgeBridge.getTaskPrompt` (Interface 2). */
  probe(input: { projectRoot: string; taskKey: string }): Promise<GetTaskPromptResult>
  /** Tier 1 (DF004 main channel): `ctx.remote.sessionLaunch.launch`. */
  launch(input: SessionLaunchInput): Promise<SessionLaunchResult>
  /**
   * Tier 2 (Interface 5 candidate 2): `ctx.remote.session` create+prompt with
   * the SAME semantics — a renderer-side retry carrying the tier-1 recovery
   * sessionId when the failed result provided one.
   */
  launchViaClientChannel(input: SessionLaunchInput): Promise<SessionLaunchResult>
  /** Tier 3 leg 1: copy the verbatim prompt to the clipboard. Resolves false when denied/failed. */
  copyPromptToClipboard(text: string): Promise<boolean>
  /** Tier 3 leg 2: bring the main window to front (M1 session-focus fallback form). */
  bringMainWindowToFront(): void
  /** Success-chain persist leg: `workbench.recordSessionLink` (qualified taskKey). */
  recordSessionLink(input: RecordSessionLinkInput): Promise<SessionLink>
}
