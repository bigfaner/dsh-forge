/**
 * forge-workbench plugin, browser half (M2 task 3.3): the dual-view
 * navigation. The apply body is the FORM COORDINATOR (decision D3): the
 * preferred path injects into the upstream navigation slots (nav/slot-inject)
 * as soon as they declare; a grace timer watches for their arrival, and when
 * the boot has settled without them (upstream version drift) the fallback
 * rail (nav/rail) takes over — chrome-only when the main slot is live but the
 * sidebar list is not, full overlay otherwise. Both forms drive the one
 * view-key machine through the one controller (nav/view-switch), so their
 * behavior contracts are identical by construction; view state persists
 * across restarts (store/view-key), first boot defaulting to the session
 * view. The host half's M2 ForgeBridge / session-launch faces were retired by
 * M3 task 6.1 (CLI 退役); the dispatch chain (2.1 tools + 3.5 orchestration
 * pair) is the host face now. Cross-boundary traffic happens exclusively
 * through cordis services (slots, locale) — no shell internals are imported,
 * in either direction.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the renderer-owned slots service (ctx.slots) Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import {
  createLocalStoragePersistence, createViewKeyStore,
} from './store/view-key'
import { createBoardSessionStore } from './store/board-session'
import { installToolBridgeClient } from './ipc/tool-bridge'
import { installDispatchLaunchRelay } from './ipc/dispatch-relay'
import { installApprovalAnswerRelay } from './ipc/approval-answer'
import { getWorkbenchIpcBridge } from './ipc/workbench'
import { createSessionHandover } from './session-handover'
import { ViewSwitchController } from './nav/view-switch'
import { installRailNav } from './nav/rail'
import { installSlotNav } from './nav/slot-inject'
import { MAIN_SLOT, NS, SIDEBAR_SLOT } from './contract'
import { en } from './locale/en'
import { zh } from './locale/zh'
import type { WorkbenchKey } from './locale/en'

export { MAIN_SLOT, NS, PANEL_ID, SIDEBAR_ORDER, SIDEBAR_SLOT } from './contract'
export { WorkbenchPanelIcon } from './WorkbenchPanelIcon'
export { WorkbenchShell, VIEW_MOUNT_TABLE, resolveViewMount } from './WorkbenchShell'
export type {
  WorkbenchPanelIconProps, WorkbenchShellProps, WorkbenchViewFace, WorkbenchPanelLifecycle,
  WorkbenchChromeFace, OverviewFace, WorkbenchOverviewSeat,
  TaskBoardFace, TaskBoardSeat, DispatchFace,
  FeatureBoardFace, FeatureDocFace, WorkbenchFeaturesSeat,
  SessionLaunchHandover,
  MigrationFace, MigrationGuardSnapshot,
} from './contract'
export {
  createLocalStoragePersistence, createViewKeyStore, hydratePersistedViewKey,
  INITIAL_VIEW_KEY, VIEW_KEY_STORAGE_KEY, WORKBENCH_DIALOG_PREFIX, WORKBENCH_TABS,
} from './store/view-key'
export type {
  PersistedViewKey, TopLevelView, ViewKeyPersistence, ViewKeySnapshot, ViewKeyStore, WorkbenchTabKey,
} from './store/view-key'
// The board session store (task 5.11, AC3/AC4): the plugin-lifetime selection/
// scroll/badge memory that survives the UF5 round-trip's shell unmount.
export { createBoardSessionStore, INITIAL_BOARD_SCROLL } from './store/board-session'
export type { BoardScrollMemory, BoardSessionStore } from './store/board-session'
// The session hand-over (M3 task 6.1 — the retired launch seat's surviving
// slice): 切会话视图 + session locating, threaded into the shell by both
// navigation forms.
export { createSessionHandover } from './session-handover'
export type { SessionHandover } from './session-handover'
// Interface 1 DTO types, client half (task 5.1): the structural source the
// 5.x build tasks render against (assembly swaps the mocks for IPC reads).
// Task 5.5 added the board family (TaskStatus/ChangeSource/TaskSummary/
// SyncStatus/TaskBoardData/WorkbenchEvent).
export type {
  ApprovalRow, ApprovalState, ChangeSource, DispatchedRow, DispatchLaunchPayload, DispatchRow,
  DispatchState, DispatchTasksInput,
  DispatchTasksResult, DecideApprovalInput, DocLocationType, MigrationEvent, MigrationPhase,
  MigrationPhaseResult,
  MigrationStarted, MigrationStatus, MissingItem, PluginRow, Project, ProjectPatch,
  StageArtifactsReport, SyncStatus, TaskBoardData,
  TaskSummary, TaskStatus, WorkbenchEvent, WorkbenchState, WorkbenchVerbError,
} from './ipc-types'
export {
  MOCK_EMPTY_WORKBENCH_STATE, MOCK_WORKBENCH_STATE,
  MOCK_TASK_BOARD, MOCK_TASK_BOARD_EMPTY, MOCK_TASK_BOARD_SYNC_ERROR, createMockOverviewFace,
  createMockTaskBoardFace, createMockDispatchFace,
  MOCK_MIGRATION_BACKUP_PATH, MOCK_MIGRATION_STATUS_FILES, MOCK_MIGRATION_STATUS_SQLITE,
  createMockMigrationFace,
} from './mocks/workbench'
// The Interface 1 IPC adapter (task 5.16 — the pattern the 5.14 overview and
// 5.15 task-board assemblies reuse): the guarded preload-bridge read, the
// 1:1 face→verb factories, and the rejection-envelope normalization that
// keeps every view's error mapping form-agnostic. Task 5.14 added the
// overview family's faces (overview/plugin + the wizard's WRITE pair);
// task 5.15 added the tasks family's (board + detail).
export {
  createIpcDispatchFace, createIpcFeatureBoardFace, createIpcFeatureDocFace, createIpcMigrationFace,
  createIpcOverviewFace,
  createIpcPluginFace, createIpcRegisterWizardVerbs, createIpcTaskBoardFace, createIpcTaskDetailFace,
  getWorkbenchIpcBridge,
  normalizeWorkbenchVerbError, requireWorkbenchIpcBridge,
} from './ipc/workbench'
export type { WorkbenchIpcBridge } from './ipc/workbench'
// The renderer's SINGLE-SUBSCRIBER event channel (task 5.15): the one
// multiplexed onEvents subscription every workbench family's event leg
// rides (the verb deregisters the whole webContents on any unsubscribe, so
// independent subscriptions cannot coexist).
export { getWorkbenchEventSource } from './ipc/workbench-events'
export type { WorkbenchEventSource, WorkbenchEventListener } from './ipc/workbench-events'
// The renderer tool bridge (M3 task 2.1, T2): mounts the forgeToolBridge
// remote namespace (calls stream + answer) and pumps host tool calls onto the
// whitelisted workbench IPC verbs (closed verb map). Later tool families ride
// the same bridge — no new channel.
export {
  dispatchToolBridgeCall, FORGE_TOOL_BRIDGE_REMOTE_CONTRIBUTION, installToolBridgeClient,
  runToolBridgePump,
} from './ipc/tool-bridge'
export type { ToolBridgePumpDeps } from './ipc/tool-bridge'
// The renderer launch relay (M3 task 6.3, SC1): the two-stage dispatch chain's
// second stage — dispatched rows' launch payloads ride the host dispatch-launch
// rpc, outcomes backfill through the notify verbs.
export {
  dispatchLaunchRelayOf, installDispatchLaunchRelay,
  launchRequestOf, relayDispatchedRows, setDispatchLaunchRelay,
} from './ipc/dispatch-relay'
export type { DispatchLaunchRelay } from './ipc/dispatch-relay'
// The renderer approval-answer leg (M3 task 6.5, SC3): decided approvals ride
// the host approval-bridge settle face so the subagent's pending ask resolves
// with the human verdict (spike-2 §1.3 ③ 决策送达链).
export {
  approvalAnswerRelayOf, deliverApprovalAnswer, installApprovalAnswerRelay, setApprovalAnswerRelay,
} from './ipc/approval-answer'
export type { ApprovalAnswerRelay } from './ipc/approval-answer'
// The UF4 page-session doc cache (task 5.16): one per FeaturesPage mount,
// cleared on a project switch (Hard Rule: 文档缓存仅在页内会话期).
export { createFeatureDocsCache } from './store/feature-board'
export type { FeatureDocsCache } from './store/feature-board'
// The overview family's single-source read model (task 5.14): one store per
// shell mount over the live bridge — getState coalescing, mutation refreshes,
// and the onEvents-derived 失联 signals (sync-state errors).
export {
  createWorkbenchStateStore, INITIAL_WORKBENCH_STATE_SNAPSHOT,
} from './store/workbench-state'
export type {
  WorkbenchStatePhase, WorkbenchStateSnapshot, WorkbenchStateStore,
} from './store/workbench-state'
// The shared task-status vocabulary (task 5.5 — the first status-rendering
// task): the 7-态 runtime order + the label/short-label/StateDot routing.
// Tasks 5.7 (detail dock) and 5.9 (feature board) consume it as-is — the
// API is contract-stable for them.
export {
  TASK_STATUSES, TASK_STATUS_DOT_STATE, TASK_STATUS_LABEL_KEYS, TASK_STATUS_SHORT_LABEL_KEYS,
  isTaskStatus, taskStatusLabel, taskStatusShortLabel,
} from './i18n/task-status'
export type { TaskStatusTranslate } from './i18n/task-status'
// The UF1 overview page (task 5.3): mounted by the shell into the reserved
// overview seat; exported for the 5.14 assembly + its tests.
export { OverviewPage } from './views/overview/OverviewPage'
export type { OverviewPageProps } from './views/overview/OverviewPage'
// The UF1 overview tab, assembled (task 5.14): the completion view the shell
// mounts — the store form renders the real IPC chain (faces + store-routed
// getState + sync-derived 失联 signals); the seat / store-absent forms
// reproduce the 5.3 build-stage page.
export { OverviewView } from './views/overview/OverviewView'
export type { OverviewViewProps } from './views/overview/OverviewView'
export { formatTimestamp, middleEllipsis } from './views/overview/format'
export { fillTemplate } from './views/overview/format'
// The UF3 migration component family (M3 task 1.6, build stage): the card
// surface (pill + guarded entry), the confirm door, and the progress/result
// family (pure run view-model + hook + wizard-reusable body + dialog + the
// dialog-family flow). The 1.7 assembly wires them into ProjectCard and the
// register wizard's in-place step.
export { MigrationPill, MigrationEntryButton } from './views/overview/migration/MigrationPill'
export type { MigrationPillStatus, MigrationPillProps, MigrationEntryButtonProps } from './views/overview/migration/MigrationPill'
export { MigrateConfirmDialog, migrationStartErrorText } from './views/overview/migration/MigrateConfirmDialog'
export type { MigrateConfirmDialogProps, MigrationTranslate } from './views/overview/migration/MigrateConfirmDialog'
export {
  MIGRATION_STEPS, MigrationDialogs, MigrationProgressBody, MigrateProgressDialog,
  applyMigrationProgressEvent, initialMigrationRunState, stepOfPhase, useMigrationRun,
} from './views/overview/migration/MigrateProgressDialog'
export type {
  MigrationRun, MigrationRunState, MigrationRunStatus, MigrationStepKey, MigrationStepState,
  MigrationDialogsProps, MigrationProgressBodyProps, MigrateProgressDialogProps,
  UseMigrationRunInput,
} from './views/overview/migration/MigrateProgressDialog'
export { useMigrationGuard } from './views/overview/migration/MigrateGuard'
export type { MigrationGuardView, UseMigrationGuardInput } from './views/overview/migration/MigrateGuard'
// 1.7: the per-card guarded entry mount (ProjectCard's action-row host).
export { MigrationCardEntry } from './views/overview/migration/MigrationCardEntry'
export type { MigrationCardEntryProps } from './views/overview/migration/MigrationCardEntry'
// The UF2 task board page (task 5.5): mounted by the shell into the reserved
// tasks seat; exported with its pure board model (filter/sort/dangling) for
// the 5.15 assembly + its tests. View A (依赖树 DAG) is 5.6's — the
// switcher's tree tab is its placeholder.
export { TaskBoardPage } from './views/TaskBoardPage'
export type { TaskBoardPageProps } from './views/TaskBoardPage'
// The UF2 tasks tab, assembled (task 5.15): the completion view the shell
// mounts — real bridge → the store-backed board chain (ONE getTaskBoard
// first paint + the 回流 coalesce-then-fetch event loop) + the IPC detail
// face; the seat / hostless forms reproduce the 5.5/5.8 build-stage page.
export { TasksView } from './views/tasks/TasksView'
export type { TasksViewProps } from './views/tasks/TasksView'
// The tasks tab's page store (task 5.15): the 快照缓存 + 事件合并 read
// model — read-through loadBoard, the debounced event refresh, and the
// event-merged sync projection the view feeds the page through.
export {
  createTaskBoardStore, INITIAL_TASK_BOARD_SNAPSHOT, TASK_BOARD_REFRESH_DEBOUNCE_MS,
} from './store/task-board'
export type {
  TaskBoardPhase, TaskBoardSnapshot, TaskBoardStore,
} from './store/task-board'
// The UF4 features tab, assembled (task 5.16): the completion view the shell
// mounts — real bridge → getState-sourced project + IPC faces; the seat /
// hostless forms reproduce the 5.9 build-stage page (exported with it).
export { FeaturesView } from './views/features/FeaturesView'
export type { FeaturesViewProps } from './views/features/FeaturesView'
export { FeaturesPage } from './views/FeaturesPage'
export type { FeaturesPageProps } from './views/FeaturesPage'
export {
  computeDanglingByTask, featureSlugsOf, filterTasks, localIdOf, resolveBlockerKey, sortTasks,
} from './views/TaskBoardPage'
export { DEFAULT_BOARD_FILTER, TaskToolbar } from './views/tasks/TaskToolbar'
export type {
  BoardFilterState, BoardSortKey, BoardTranslate, BoardViewKey,
} from './views/tasks/TaskToolbar'
export { StatusBoard } from './views/tasks/StatusBoard'
export type { StatusBoardProps } from './views/tasks/StatusBoard'
export { TaskList } from './views/tasks/TaskList'
export type { TaskListProps } from './views/tasks/TaskList'
export { TaskBadges, TaskCard, TaskListRow } from './views/tasks/TaskRow'
export type { TaskRowBaseProps } from './views/tasks/TaskRow'
// The shared read-only markdown renderer (task 5.2, T3 mitigation): every
// prose surface of the 5.x views (task descriptions, execution records, the
// five feature doc kinds) renders through this one sanitized component.
export { MarkdownView } from './components/common/MarkdownView'
export type { MarkdownViewProps } from './components/common/MarkdownView'
export { ViewSwitchController } from './nav/view-switch'
export type { NavForm, ViewCarrier } from './nav/view-switch'
export { installRailNav } from './nav/rail'
export type { RailContentMode, RailNavOptions } from './nav/rail'
export { installSlotNav } from './nav/slot-inject'
export type { SlotNavOptions } from './nav/slot-inject'
export { en } from './locale/en'
export { zh } from './locale/zh'
export type { WorkbenchKey } from './locale/en'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The forge-workbench shell's copy. */
    workbench: WorkbenchKey
  }
}

/**
 * Required services: the renderer-owned slot registry and the locale face.
 * The layout service is consumed OPTIONALLY (ctx.get in nav/slot-inject) — a
 * hard inject would gate this plugin's load on ui-layout and kill the
 * fallback rail.
 */
export const inject = ['slots', 'locale']

/**
 * How long the coordinator waits for the upstream navigation slots before the
 * fallback engages. The slots are declared by base-bundle-tier plugins
 * (ui-layout/ui-sidebar) during boot roster assembly — well inside this
 * window in any healthy boot — so an expired grace means the slots are
 * genuinely unavailable in this build (AC2's 槽位不可用).
 */
export const RAIL_GRACE_MS = 5_000

/**
 * Client plugin body: register the bilingual dictionary, seat the view-key
 * machine + shared controller, then assemble the navigation forms — slot path
 * on arrival, rail on grace expiry, rail standing down when the preferred
 * path completes.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'forge-workbench: dictionaries')
  const t = ctx.locale.bind(NS)

  const store = createViewKeyStore(createLocalStoragePersistence())
  const controller = new ViewSwitchController(store)
  // The session hand-over + the board session store (task 5.11; M3 6.1
  // slimmed the seat to the hand-over): both live at plugin lifetime — ABOVE
  // the shell — because a board round-trip unmounts the shell in the slot
  // path (the keyed main slot) and the hand-over + the selection/scroll/badge
  // memory must survive it.
  const launchSeat = createSessionHandover(ctx, controller)
  const boardSession = createBoardSessionStore()
  // M3 task 2.1 (T2): the renderer tool bridge — plugin-lifetime pump that
  // answers the host's forge_task_* tool calls over the whitelisted IPC verbs.
  // Guarded throughout (hostless worlds stay silent; the host degrades via its
  // grace/budget chain).
  const disposeToolBridge = installToolBridgeClient(ctx)
  // M3 task 6.3 (SC1): the renderer launch relay — the two-stage dispatch
  // chain's driver leg. The IPC dispatch face hands dispatched rows' launch
  // payloads here; absent remote/bridge worlds keep the kernel's
  // rows-stay-starting semantics.
  const workbenchBridge = getWorkbenchIpcBridge()
  const disposeLaunchRelay = workbenchBridge === undefined
    ? () => {}
    : installDispatchLaunchRelay(ctx, workbenchBridge)
  // M3 task 6.5 (SC3): the renderer approval-answer leg — decided approvals
  // ride the host approval-bridge settle face (the subagent's pending ask
  // resolves with the human verdict). No bridge/remote = no-op (kernel-only
  // semantics: the row is decided, delivery waits).
  const disposeAnswerRelay = installApprovalAnswerRelay(ctx)

  let railDispose: (() => void) | undefined
  let mainCommitted = false

  /** Both navigation slots declared (the preferred path can complete). */
  const navSlotsArrived = (): boolean =>
    ctx.slots.spec(MAIN_SLOT) !== undefined && ctx.slots.spec(SIDEBAR_SLOT) !== undefined

  /** Stand the rail up in the mode the slot state dictates (no-op when the preferred path is live). */
  const enableRail = (): void => {
    if (railDispose !== undefined || navSlotsArrived()) return
    railDispose = installRailNav({
      controller,
      store,
      t,
      // The main registration committed → the keyed slot presents the shell;
      // the rail is only the visible toggle. Otherwise the rail owns the
      // workbench surface itself.
      content: mainCommitted ? 'chrome' : 'overlay',
      launch: launchSeat,
      boardSession,
    })
  }

  const disableRail = (): void => {
    railDispose?.()
    railDispose = undefined
  }

  // The grace timer's slot: the slot path can complete SYNCHRONOUSLY inside
  // installSlotNav (slots already declared — the normal boot), before the
  // timer below exists, so the callback must tolerate either state.
  let graceTimer: ReturnType<typeof setTimeout> | undefined

  const disposeSlotNav = installSlotNav(ctx, {
    controller,
    store,
    launch: launchSeat,
    boardSession,
    label: () => t('panel'),
    onMainCommitted: () => {
      mainCommitted = true
      // Mid-boot arrival (rail already up in overlay mode): the keyed slot
      // now presents the shell, so the rail rebuilds as chrome-only — no
      // zombie plugin-owned surface beside the panel.
      if (railDispose !== undefined && !navSlotsArrived()) {
        disableRail()
        enableRail()
      }
    },
    // Both registrations committed: the upstream sidebar row is the entry —
    // the rail (if the grace had engaged it mid-boot) stands down.
    onPathLive: () => {
      if (graceTimer !== undefined) clearTimeout(graceTimer)
      disableRail()
    },
  })

  graceTimer = setTimeout(enableRail, RAIL_GRACE_MS)
  // Node keeps the process reference alive otherwise; browsers have no unref.
  ;(graceTimer as ReturnType<typeof setTimeout> & { unref?: () => void }).unref?.()

  ctx.effect(() => () => {
    clearTimeout(graceTimer)
    disableRail()
    disposeToolBridge()
    disposeLaunchRelay()
    disposeAnswerRelay()
    disposeSlotNav()
  }, 'forge-workbench: navigation forms')
}
