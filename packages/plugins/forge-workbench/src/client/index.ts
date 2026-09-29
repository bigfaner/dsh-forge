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
 *
 * M4 task 1.6 added the P1 project-center seats on the same carrier: the boot
 * default lands on the conversation (the `project` workbench, 裁决 #26), the
 * panellist「项目」row registers first, and — bridge-gated — the
 * `sidebar.workspaces` shadowing seat swaps the native browser for the forge
 * project tree over the active-project pointer store + the C7 confirm card.
 *
 * M4 task 1.7 retired the old view family (Integration 6): the `workbench`
 * main panel is now the OVERVIEW ESCAPE DOOR single page, the M2/M3 chrome
 * (TopBar/TabBar/ProjectSwitcher) is deleted, and the view-key machine's
 * interior collapsed to `workbench/overview` — the boards re-home into the
 * rightbar pane family in P2 (their components survive, unmounted from this
 * shell).
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the renderer-owned slots service (ctx.slots) Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import {
  createLocalStoragePersistence, createViewKeyStore,
} from './store/view-key'
import { installToolBridgeClient } from './ipc/tool-bridge'
import { installDispatchLaunchRelay } from './ipc/dispatch-relay'
import { installApprovalAnswerRelay } from './ipc/approval-answer'
import { installProjectionRelay } from './projection'
import { getWorkbenchIpcBridge } from './ipc/workbench'
import { createIpcConfirmCardFace } from './ipc/workbench'
import { ViewSwitchController } from './nav/view-switch'
import { installRailNav } from './nav/rail'
import {
  installProjectPanelRow, installSlotNav, installWorkspacesSeat, normalizeBootDefaultView,
} from './nav/slot-inject'
import {
  toSessionsFace, toSidebarRightFace, toUiWorkspaceFace, toWorkspacesSource,
} from './nav/project-seat'
import { createActiveProjectStore } from './store/active-project'
import { createBoardSessionStore } from './store/board-session'
import { createSessionOpenChannel } from './session-open'
import type { SessionOpenTarget } from './session-open'
import { getWindowVerbFace, routeWindowBoot } from './window-role/boot'
import type { WindowVerbFaceClient } from './window-role/boot'
import { installDetachedWindow } from './window-role/detached-view'
import type { DetachedSessionOpenFace } from './window-role/detached-view'
import { detachBoardToWindow, installWindowRecallSync } from './window-role/recall'
import { toLineageSessionsSource } from './lineage'
import { installMetadataBar } from './components/task-metadata/MetadataBar'
import type { MetadataTaskSource } from './components/task-metadata/MetadataBar'
import { installArchiveBanner } from './components/archive-banner/ArchiveBanner'
import { ensureBoardActive, createSplitPaneStore, toRightbarTabsFace } from './views/rightbar/tabs-model'
import { installRightbarTabs } from './views/rightbar/RightbarTabs'
import { installSplitControls } from './views/rightbar/SplitControls'
import { MAIN_SLOT, NS, SIDEBAR_SLOT } from './contract'
import { en } from './locale/en'
import { zh } from './locale/zh'
import type { WorkbenchKey } from './locale/en'

export { MAIN_SLOT, NS, PANEL_ID, SIDEBAR_ORDER, SIDEBAR_SLOT, WORKSPACES_SLOT, PROJECT_SEAT_PRIORITY, RIGHTBAR_TAB_SLOT, RIGHTBAR_TAB_TITLE_SLOT, CONVERSATION_DOCK_SLOT } from './contract'
export { WorkbenchPanelIcon } from './WorkbenchPanelIcon'
export { WorkbenchShell, VIEW_MOUNT_TABLE, resolveViewMount } from './WorkbenchShell'
export type {
  WorkbenchPanelIconProps, WorkbenchShellProps, WorkbenchPanelLifecycle,
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
export { createSessionHandover, uiWorkspaceOf } from './session-handover'
export type { SessionHandover } from './session-handover'
// M4 task 2.7 — the Interface 6 会话打开通道 (tech-design §Interface 6):
// 顶层/subagent 双通路 over the ONE openSession write path (switch-first,
// the handover discipline) + 旁置 over sidebarRight.openResource
// (subagentChatAddress, the ui-subagent precedent); rejections surface the
// C5 open-failed toast (2.6's contract). The M1 sessionFocus main-process
// channel stays the frozen fallback, outside the M4 chain.
export {
  createSessionOpenChannel, isSubagentAddressTarget, SESSION_OPEN_ERROR,
  SUBAGENT_CHAT_ADDRESS_PREFIX, subagentChatAddressOf,
} from './session-open'
export type { SessionOpenChannel, SessionOpenTarget } from './session-open'
// M4 task 2.7 — Component C6, the subagent 会话·任务元数据条 (ui-design
// §Component C6 / UF6): the derived three-state binding (血缘为准), the pure
// bar, and the conversation.input.dock seat host + installer (the resolved
// fallback seat — conversation.session single-slot shadowing would replace
// the native panel, the forbidden form; see contract.ts's CONVERSATION_DOCK_SLOT).
export {
  deriveMetadataBinding, installMetadataBar, METADATA_BAR_DOCK_ID, METADATA_BAR_DOCK_ORDER,
  MetadataBar, MetadataBarDock,
} from './components/task-metadata/MetadataBar'
export type {
  MetadataBarBinding, MetadataBarDockProps, MetadataBarFace, MetadataBarProps,
  MetadataDockZone, MetadataTaskSource,
} from './components/task-metadata/MetadataBar'
// M4 task 3.5 — C8 归宿②③: the lifecycle confirm dialogs + the shared
// lifecycle actions, and Component C2's 归档横幅只读态 (the derived warn band
// over the resolved conversation dock seat).
export {
  ArchiveConfirmDialog, RemoveProjectConfirmDialog,
} from './components/confirm-dialog/ArchiveDeleteDialogs'
export type { ArchiveConfirmDialogProps, RemoveProjectConfirmDialogProps } from './components/confirm-dialog/ArchiveDeleteDialogs'
export {
  archiveProjectNow, commitProjectRename, removeProjectNow, restoreProjectNow,
} from './lifecycle-actions'
export type { LifecycleActionDeps } from './lifecycle-actions'
export {
  ArchiveBanner, ArchiveBannerDock, ARCHIVE_BANNER_DOCK_ID, ARCHIVE_BANNER_DOCK_ORDER,
  installArchiveBanner,
} from './components/archive-banner/ArchiveBanner'
export type { ArchiveBannerDockProps, ArchiveBannerFace, ArchiveBannerProps } from './components/archive-banner/ArchiveBanner'
// M4 task 3.5 — C8 归宿①: the 概览 projection status row (mounted into
// OverviewHeader) + the deviation fold.
export {
  DeviationList, DEVIATION_ADVICE_KEYS, DEVIATION_TYPE_KEYS,
} from './components/projection/DeviationList'
export type { DeviationListProps } from './components/projection/DeviationList'
export {
  ProjectionStatusRow, PROJECTION_DOT_STATE, PROJECTION_STATUS_TEXT_KEYS,
} from './components/projection/ProjectionStatusRow'
export type { ProjectionStatusRowProps } from './components/projection/ProjectionStatusRow'
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
// M4 task 3.3 — the client projection relay (tech-design §Interface 2): the
// duck-typed upstream workspace channel declaration (vendored types.ts is the
// compile-time authority), the snapshot follow-flow reporter (submitWorkspaceSnapshot
// boot + debounced), and the plan-execution/outcome-backfill/boot-replay relay
// over the 3.2 verb face.
export {
  applyRegistryOrder, applyWorkspaceRow, canonicalOpsOf, createProjectionRelay,
  createSnapshotReporter, defaultProjectionRelayLog, dropWorkspaceId, executeProjectionPlan,
  insertBeforeLinksOf, installProjectionRelay, PROJECTION_CHANNEL_UNAVAILABLE, PROJECTION_LOG_PREFIX,
  snapshotEntriesOf, WORKSPACES_SERVICE_KEY, workspacesSourceOf, WORKSPACE_NOT_FOUND,
  WORKSPACE_REMOTE_KEY, workspaceChannelOf,
} from './projection'
export type {
  PlanExecutionResult, ProjectionRelayDeps, ProjectionRelayLog, SnapshotReporter,
  SnapshotReporterDeps, WorkspaceChannel, WorkspaceOpFailure, WorkspaceOpResult,
  WorkspaceRow, WorkspaceSnapshotSource,
} from './projection'
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
// The UF2 task board page (task 5.5; M4 2.1 re-homed): the board's interior
// page TasksView mounts in either host; exported with its pure board model
// (filter/sort/dangling) for the assembly + its tests. View A (依赖树 DAG) is
// 5.6's — the switcher's tree tab is its placeholder.
export { TaskBoardPage } from './views/TaskBoardPage'
export type { TaskBoardPageProps } from './views/TaskBoardPage'
// The 任务看板 assembled view (task 5.15; M4 2.1 dual-host): the HOST-AGNOSTIC
// component the rightbar pane (2.2's TabKind='board', host='pane') and the
// detached window (4.3's view='board', host='window' + a pinned source
// project) both mount — real bridge → the store-backed board chain (ONE
// getTaskBoard first paint + the 回流 coalesce-then-fetch event loop) + the
// IPC detail face; the seat / hostless forms reproduce the 5.5/5.8
// build-stage page. The width breakpoint is INJECTED (零宿主探测).
export { TasksView } from './views/tasks/TasksView'
export type { TasksViewProps } from './views/tasks/TasksView'
export { detailDockWidthOf } from './views/tasks/launch/LaunchStates'
export type { BoardHostForm } from './views/tasks/launch/LaunchStates'
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
// M4 task 1.6 — the P1 integration seats: the boot default normalization, the
// panellist「项目」row (address model + installer), and the sidebar.workspaces
// shadowing seat (component + face + guarded service adapters).
export {
  normalizeBootDefaultView, installProjectPanelRow, installWorkspacesSeat,
} from './nav/slot-inject'
export type { ProjectPanelRowOptions } from './nav/slot-inject'
export {
  PROJECT_PANEL_ID, PROJECT_PANEL_ORDER, isProjectPanelActive,
} from './nav/panel-info'
export {
  ProjectPanelGlyph, ProjectSidebarSeat,
  toSessionsFace, toSidebarRightFace, toUiWorkspaceFace, toWorkspacesSource,
} from './nav/project-seat'
export type {
  ProjectSeatFace, ProjectSidebarSeatProps, RetainInfoSource, SessionSummaryLike,
  SessionsFace, SessionsListSource, SidebarRightFace, UiWorkspaceFace, WorkspacesListSource,
} from './nav/project-seat'
export { PROJECT_SWITCH_CLASS, PROJECT_SWITCH_TRANSITION_MS } from './nav/project-seat'
// M4 task 2.5 — the lineage derivation service (tech-design §Interface 3,
// client half, pure read-only): the upstream sessions snapshot (guarded
// duck-typed adapters, no api-* imports) ⊕ the M3 get-task-detail
// session_links joined into TaskBinding — 执行中判定 (BIZ-workbench-008),
// ≤100ms cooperative budget with silent 仅顶层 degrade (BIZ-resilience-001),
// 不落库 (recompute anytime). C5 (2.6) / C6 (2.7) consume; C3's copy seat
// stays 1.4's.
export {
  createLineageDeadline, defaultLineageLog, deriveSessionLineage, deriveTaskBinding,
  judgeExecuting, lineageSnapshotOf, LINEAGE_BUDGET_MS, LINEAGE_CHECK_INTERVAL,
  LINEAGE_DESCENDANT_LIMIT, LINEAGE_LOG_PREFIX, logLineageDegraded, toLineageSessionsSource,
} from './lineage'
export type {
  DeriveTaskBindingInput, ExecutionJudgment, LineageCatalog, LineageCatalogChild,
  LineageCatalogEntry, LineageDeadline, LineageDegradedReason, LineageLog, LineageSessionRow,
  LineageSessionsSnapshot, LineageSessionsSource, LineageSubagentAddress, LineageTaskRef,
  SessionLink, SessionLineageResult, SessionTaskBadge, SubagentHit, TaskBinding, TaskLinkRow,
} from './lineage'
// The active-project pointer store (app_state active_project_id, client half).
export {
  createActiveProjectStore, INITIAL_ACTIVE_PROJECT_SNAPSHOT,
} from './store/active-project'
export type { ActiveProjectSnapshot, ActiveProjectStore } from './store/active-project'
// M4 task 2.2 — the rightbar forge tabs (tech-design §Integration #5): the
// five-kind table (Interface 4's TabKind whitelist; guide = the extension
// take-over of the native door page), the 开始页 body + chip title, the
// container installer (definitions + keyed bodies + the §4.7 linkage
// watcher), and the lifecycle/linkage model (§4.7/§4.8 + 裁决 #28-④'s
// 右栏回默认 — the pure functions project-seat's 换台重置 seam consumes).
export {
  forgeTabDefinitions, forgeTabId, FORGE_TAB_ID_PREFIX, isTabKind,
  PROJECT_SCOPED_TAB_KINDS, RIGHTBAR_TAB_KINDS,
} from './views/rightbar/tab-kinds'
export type { TabKind, TabKindTranslate } from './views/rightbar/tab-kinds'
export { CompassGlyph, GuideTab, GuideTabTitle } from './views/rightbar/GuideTab'
export type { ForgeTabFace, GuideTabProps, GuideTabTitleProps } from './views/rightbar/GuideTab'
export {
  BoardTabBody, DepgraphTabBody, DocTabBody, installRightbarTabs, OverviewTabBody, toTabRegistryFace,
} from './views/rightbar/RightbarTabs'
export type {
  BoardTabFace, DepgraphTabBodyProps, DepgraphTabFace, DocTabBodyProps, DocTabFace,
  OverviewTabBodyProps, OverviewTabFace, RightbarTabsOptions, TabRegistryFace,
} from './views/rightbar/RightbarTabs'
// M4 task 2.3 — the 项目概览 tab interior: the assembled body (标题栏 + 概要信息
// 区 + the 提案/feature/任务 sub-tab panes re-homing the M3 faces zero-loss),
// the header, the three panes, and the pure derivation model.
export { OverviewTab } from './views/rightbar/OverviewTab'
export type { DocOpenInput, OverviewSubtab, OverviewTabProps, OverviewTabSeat } from './views/rightbar/OverviewTab'
export { OverviewHeader } from './views/rightbar/OverviewHeader'
export type { OverviewHeaderProps } from './views/rightbar/OverviewHeader'
export {
  activeLinkOf, countRunningSessions, deriveActiveFeature, deriveExecutingTasks, workspaceRootOf,
} from './views/rightbar/overview-model'
export type { OverviewTaskSource } from './views/rightbar/overview-model'
export { ProposalsPane } from './views/rightbar/subtabs/ProposalsPane'
export type { ProposalsPaneProps } from './views/rightbar/subtabs/ProposalsPane'
export { FeaturesPane } from './views/rightbar/subtabs/FeaturesPane'
export type { FeatureBoardPhase, FeaturesPaneProps } from './views/rightbar/subtabs/FeaturesPane'
export { TasksPane } from './views/rightbar/subtabs/TasksPane'
export type { TaskSourcesPhase, TasksPaneProps } from './views/rightbar/subtabs/TasksPane'
// M4 task 2.4 — the 文档 tab + 依赖图 tab interiors: the doc-tree identity
// model + registry (the AC1 dedupe) + chip title, the doc body (路径栏 h38 +
// ↻ + 只读正文), the depgraph body (feature 下拉 + DAG/泳道双模式) and the
// two mode views (the pure DAG build + the 7-态 lane grouping).
export {
  createDocTabsRegistry, docDisplayName, docEntryName, DocTabTitle, focusOrOpenDoc, parseDocPath,
} from './views/rightbar/DocTree'
export type { DocOpenOutcome, DocTabTitleProps, DocTabsRegistry, DocTarget } from './views/rightbar/DocTree'
export { DocTab } from './views/rightbar/DocTab'
export type { DocTabProps, DocTabSeat } from './views/rightbar/DocTab'
export { createDepGraphModeMemory, DepGraphTab } from './views/rightbar/DepGraphTab'
export type { DepGraphMode, DepGraphModeMemory, DepGraphTabProps, DepGraphTabSeat } from './views/rightbar/DepGraphTab'
export {
  buildDepGraph, DEP_COLUMN_GAP, DEP_NODE_HEIGHT, DEP_NODE_WIDTH,
} from './views/rightbar/DagView'
export type { DepGraphEdge, DepGraphLayout, DepGraphNode, DagViewProps, DepNodeCardProps } from './views/rightbar/DagView'
export { groupDepLanes } from './views/rightbar/SwimlaneView'
export type { DepLane, SwimlaneViewProps } from './views/rightbar/SwimlaneView'
export {
  ensureBoardActive, ensureOverviewActive, followProjectSwitch, resetRightbarToDefault, toRightbarTabsFace,
} from './views/rightbar/tabs-model'
export type { OpenTabRow, ProjectSwitchOutcome, RightbarTabsFace } from './views/rightbar/tabs-model'
// M4 task 4.4 — Component C9, the 分屏: the multi-pane split model (pane-set
// + clamped ratio + keyboard stepping + the onLayoutChange report seam over
// the public controller face), the pane 头 (区名 + [拆出为窗口] 动作位 +
// [关闭]), and the 工作台头 [分屏] menu + the a11y 分隔条 (the conversation
// header utilities seat host + installer).
export {
  clampSplitRatio, createSplitPaneStore, deriveSplitPanes, INITIAL_SPLIT_LAYOUT, isSplitActive,
  openSplitPane, ratioFromDrag, stepSplitRatio,
  SPLIT_RATIO_MAX, SPLIT_RATIO_MIN, SPLIT_RATIO_RESET, SPLIT_RATIO_STEP, SPLIT_RATIO_STEP_LARGE,
} from './views/rightbar/tabs-model'
export type {
  RightbarCloseFace, RightbarSplitFace, SplitLayoutState, SplitPaneRow, SplitPaneSelection,
  SplitPaneStore, SplitPaneStoreOptions, SplitPaneView, SplitStepKey,
} from './views/rightbar/tabs-model'
export { PaneHeader } from './views/rightbar/PaneControls'
export type { PaneControlsTranslate, PaneHeaderProps } from './views/rightbar/PaneControls'
export {
  CONVERSATION_HEADER_UTILITIES_SLOT, installSplitControls, SplitControlSeat, SPLIT_CONTROL_ID,
  SPLIT_CONTROL_ORDER, SplitMenuControl, SplitSeparator,
} from './views/rightbar/SplitControls'
export type {
  ConversationHeaderUtilitiesZone, SplitControlSeatProps, SplitControlsFace, SplitControlsTranslate,
  SplitMenuControlProps, SplitSeparatorProps,
} from './views/rightbar/SplitControls'
// M4 task 4.3 — Component C10, the 多窗口 client face: the window-role boot
// (the typed handshake consumer + the renderer routing), the detached
// single-view assembly (board = the pinned TasksView panel + [收回]; the
// conversation = the native panel + openSession(target) + the utilities-row
// [收回]), and the 拆出/收回 actions + the main window's window-changed
// reaction (pane restores, the delete-flow marks/counts).
export {
  getWindowVerbFace, isDetachedRole, routeWindowBoot, subagentTargetOf,
} from './window-role/boot'
export type {
  DetachedViewKind, DetachedWindowRole, OpenDetachedInputClient, SessionTargetClient,
  WindowBootRole, WindowBootHandlers, WindowChangedEventClient, WindowVerbFaceClient,
} from './window-role/boot'
export {
  DETACHED_PANEL_ID, DETACHED_POLL_CEILING_MS, DETACHED_POLL_MS, DETACHED_RECALL_ID,
  DETACHED_RECALL_ORDER, DetachedBoardPanel, DetachedRecallSeat, installDetachedWindow,
} from './window-role/detached-view'
export type {
  DetachedBoardPanelProps, DetachedRecallSeatProps, DetachedSessionOpenFace,
  DetachedViewTranslate, DetachedWindowOptions,
} from './window-role/detached-view'
export {
  detachBoardToWindow, detachConversationToWindow, installWindowRecallSync,
  parseSubagentChatAddress, restoreDetachedPane,
} from './window-role/recall'
export type {
  DetachedWindowRegistryFace, OpenDetachedRect, PaneRestoreOutcome, RecallSessionFace,
  RecallSidebarFace, WindowRecallSyncOptions,
} from './window-role/recall'
export {
  DETACH_MENU_ID, DETACH_MENU_ORDER, DetachMenuEntry,
} from './views/rightbar/RightbarTabs'
export type { DetachMenuFace, DetachMenuItemProps, DetachMenuOwnerShare } from './views/rightbar/RightbarTabs'
export { DETACH_TAB_MENU_SLOT } from './contract'
export { createIpcConfirmCardFace } from './ipc/workbench'
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
 * Client plugin body: register the bilingual dictionary, then route the
 * renderer's WINDOW ROLE before any heavy seat registers (M4 task 4.3,
 * boot.ts): every window of the single-instance shell loads the same SPA,
 * so the assembly asks the shell who it is — a detached window mounts its
 * single view (无工作台头,区导航不可用), the main window (or a hostless
 * world) assembles the full workbench below.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'forge-workbench: dictionaries')
  const t = ctx.locale.bind(NS)

  // M4 task 4.3 — the C10 window-role boot (Interface 5's typed handshake
  // over the preload verb face; the role never travels the URL). A hostless
  // world (no dshForge) routes main SYNCHRONOUSLY — the boot contract the
  // nav-form/slots specs assert; the real shell costs one IPC roundtrip.
  const windowVerb = getWindowVerbFace()
  const disposeBoot = routeWindowBoot(windowVerb, {
    main: () => applyMainWindow(ctx, windowVerb),
    detached: role => installDetachedWindow(ctx, {
      t,
      role,
      // routeWindowBoot only reaches the detached arm with a live face.
      face: windowVerb as WindowVerbFaceClient,
      // The conversation leg's ONE openSession write path, resolved lazily
      // (the upstream service registers after this plugin's apply). The
      // narrow is minimal on purpose: the native API takes SessionId |
      // SubagentAddress (Interface 6) — the 1.6 face narrows to string only.
      getOpenSession: () => detachedOpenSessionFace(optionalServiceRead(ctx, 'uiWorkspace')),
    }),
  })
  ctx.effect(() => () => { disposeBoot() }, 'forge-workbench: window-role boot')
}

/** A guarded optional service read (the apply body's own helper, detached-side twin). */
function optionalServiceRead(ctx: ClientContext, name: string): unknown {
  try {
    return ctx.get(name, false)
  } catch {
    return undefined
  }
}

/** The detached conversation leg's minimal openSession narrow (never a load gate). */
function detachedOpenSessionFace(candidate: unknown): DetachedSessionOpenFace | undefined {
  if (candidate === null || typeof candidate !== 'object') return undefined
  return typeof (candidate as { openSession?: unknown }).openSession === 'function'
    ? candidate as DetachedSessionOpenFace
    : undefined
}

/**
 * The MAIN-window workbench assembly (the pre-4.3 apply body + the 4.3
 * window legs): view-key machine + controller, the renderer relays, the P1
 * seats, the rightbar family, the C9 split store — and the C10 recall sync
 * (window-changed → pane restores) + the [拆出为窗口] verb seams.
 * @param ctx - client root context.
 * @param windowVerb - the preload window verb face (absent = the C10 legs
 * stay inert — hostless worlds keep the exact pre-4.3 shape).
 * @returns the combined disposer.
 */
function applyMainWindow(ctx: ClientContext, windowVerb: WindowVerbFaceClient | undefined): () => void {
  const t = ctx.locale.bind(NS)
  const store = createViewKeyStore(createLocalStoragePersistence())
  const controller = new ViewSwitchController(store)
  // M4 task 1.6 (裁决 #26 / page-map 启动默认落点): the boot lands on the
  // CONVERSATION panel — the `project` workbench — so a machine persisted on
  // the old `workbench` escape-hatch panel is normalized BEFORE the slot
  // carrier's attach-time projection could re-select it.
  normalizeBootDefaultView(store, controller)
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
  // M4 task 3.3 — the projection relay (tech-design §Interface 2): subscribes
  // projection_push_required (the subscription IS the kernel's relay-presence
  // marker), executes plans over the duck-typed upstream workspace remote face,
  // backfills per-project outcomes, reports the native workspace snapshot
  // follow-flow (boot + debounced), and replays channel-absent plans once the
  // remote namespace lands. Bridge-gated like the launch relay; degraded
  // upstream services never gate the plugin load.
  const disposeProjectionRelay = workbenchBridge === undefined
    ? () => {}
    : installProjectionRelay(ctx, workbenchBridge)

  // M4 task 1.6 — the P1 integration seats. The active-project pointer store
  // (app_state active_project_id, client half) exists only on the real chain
  // (a hostless world keeps the native sidebar browser: the shadowing seat is
  // bridge-gated so a degraded boot never swaps in an empty tree); its boot
  // read is kicked here so the pointer restores before the first seat render.
  // The upstream data/action services are guarded reads (base-tier plugins
  // precede app-tier apply in a healthy boot; an absent service leaves that
  // leg degraded — never a throw, never a load gate).
  const optionalService = (name: string): unknown => {
    try {
      return ctx.get(name, false)
    } catch {
      return undefined
    }
  }
  const activeProjectStore = workbenchBridge === undefined
    ? undefined
    : createActiveProjectStore(workbenchBridge)
  activeProjectStore?.refresh().catch(() => {
    // The boot restore keeps the loading snapshot; the seat's first action
    // or push-driven refresh retries.
  })
  // The panellist「项目」row — order 首项, null-addressed (nav/panel-info).
  const disposeProjectPanelRow = installProjectPanelRow(ctx, { label: () => t('panel.project') })
  // M4 task 2.7 — the Interface 6 会话打开通道 + the C6 metadata bar (tech-
  // design §Interface 6 / §Integration #3). The channel is plugin-lifetime
  // over the guarded upstream seams (顶层/subagent = the one openSession
  // write path + switch-first; 旁置 = sidebarRight.openResource); the C5
  // 挂接历史 rows' [打开] rides it through the board seam below, and the
  // orchestration section's 「进入会话」 falls back to it when no hand-over
  // seat rides (the pane host). The board-session store is 5.11's designed
  // client-apply tier (selection/scroll/badge memory) — threaded into the
  // board pane so the C6 「查看任务」 jump opens the detail dock in it.
  const sessionOpen = createSessionOpenChannel(ctx, controller)
  const enterSession = (target: SessionOpenTarget): Promise<void> => sessionOpen.openSessionTarget(target)
  const boardSession = createBoardSessionStore()
  // The C6 bar's data read (bridge-gated): the ACTIVE project's task list
  // with each task's session_links — one batched read per subagent session
  // view (点击时计算 discipline, 不落库); a failed detail read degrades that
  // task to no-links (never a failed bar).
  const metadataReadSources
    = workbenchBridge === undefined || activeProjectStore === undefined
      ? undefined
      : async (): Promise<readonly MetadataTaskSource[] | undefined> => {
        const snapshot = activeProjectStore.getSnapshot()
        const projectId = snapshot.activeProjectId
        if (projectId === null) return undefined
        const board = await workbenchBridge.getTaskBoard(projectId)
        const details = await Promise.all(board.tasks.map(async (task) => {
          try {
            return await workbenchBridge.getTaskDetail(projectId, task.key)
          } catch {
            return undefined
          }
        }))
        return board.tasks.map((task, index) => ({
          task: { key: task.key, title: task.title, status: task.status },
          links: details[index]?.links ?? [],
        }))
      }
  // The C6 → C5 双向跳转 leg: select FIRST (the shared board-session store —
  // the dock opens with the pane when it mounts), then bring the board pane
  // forward (focus-or-open, the ensureOverviewActive shape).
  const metadataOpenTask = (taskKey: string): void => {
    boardSession.selection.select(taskKey)
    ensureBoardActive(toRightbarTabsFace(optionalService('sidebarRight')))
  }

  // M4 task 2.2 — the rightbar forge tabs (tech-design §Integration #5): the
  // five kinds mount into the native right column through the upstream public
  // seams (guarded throughout: an absent sidebarRightTabs keeps the family
  // unregistered; the linkage/board legs ride the active-project store).
  // M4 task 2.3 adds the overview body's legs: the tasks row's dock seam (the
  // C6 「查看任务」 shape — select through the shared board-session, then bring
  // the board pane forward) and the shared task-sources read (the SAME builder
  // the C6 metadata bar consumes — one bridge-side read feeds both faces).
  const overviewOpenTask = (taskKey: string): void => {
    boardSession.selection.select(taskKey)
    ensureBoardActive(toRightbarTabsFace(optionalService('sidebarRight')))
  }

  // M4 2.9 correction (SC7 消费点 wiring): the app-tier upstream services
  // register AFTER this plugin's apply (the boot roster loads the api
  // controllers at its tail), so a face captured ONCE at apply read
  // `undefined` forever — the 1.6/2.7 upstream legs (the C3 tree's
  // workspace/session rows, the C6 bar's snapshot) were silently dead on the
  // real chain. The legs below resolve LAZILY (per face read, i.e. at render
  // time — post-boot the services are live), memoized on the service's OWN
  // stable member identity (the snapshot store / a stable method): cordis
  // wraps every ctx.get answer in a fresh traceable proxy, so the SERVICE
  // identity churns per read — keying on the stable member keeps the adapter
  // identity stable across renders (React's subscription machinery requires
  // that). Still never a load gate: an absent service keeps the leg degraded.
  //
  // M4 fix-1: the memo is keyed on (narrow, member) — the SAME service member
  // feeds DIFFERENT faces (sessions.list narrows onto both toSessionsFace and
  // toLineageSessionsSource), and a member-only key let whichever face was
  // built first answer EVERY consumer of that member (the C6 bar received the
  // FLAT SessionsFace where the lineage source was due — `.list` reads
  // undefined on it, the bar silently unbound; which face won followed the
  // boot render order, the fix-1 ledger's run-to-run coin flip).
  const adapterMemo = new WeakMap<object, WeakMap<object, unknown>>()
  const lazyUpstreamFace = <T>(
    name: string,
    stableMember: string,
    narrow: (service: unknown) => T | undefined,
  ): (() => T | undefined) => () => {
    const service = optionalService(name) as Record<string, unknown> | undefined
    const member = service?.[stableMember]
    if (typeof member !== 'object' && typeof member !== 'function') return undefined
    if (member === null) return undefined
    let perNarrow = adapterMemo.get(narrow as unknown as object)
    if (perNarrow === undefined) {
      perNarrow = new WeakMap()
      adapterMemo.set(narrow as unknown as object, perNarrow)
    }
    const cached = perNarrow.get(member)
    if (cached !== undefined) return cached as T
    const face = narrow(service)
    if (face !== undefined) perNarrow.set(member, face as unknown as object)
    return face
  }
  const liveWorkspaces = lazyUpstreamFace('workspaces', 'list', toWorkspacesSource)
  const liveSessionsFace = lazyUpstreamFace('sessions', 'list', toSessionsFace)
  const liveSessionsSource = lazyUpstreamFace('sessions', 'list', toLineageSessionsSource)
  const liveUiWorkspace = lazyUpstreamFace('uiWorkspace', 'openSession', toUiWorkspaceFace)
  const liveSidebarRight = lazyUpstreamFace('sidebarRight', 'openTab', toSidebarRightFace)

  // M4 task 4.3 — the C10 recall sync: the MAIN window's window-changed
  // reaction ([收回] / OS title-bar close → the pane returns HERE, 不待重启;
  // a deleted project's closing windows never restore panes). Hostless (no
  // window verb face) = the whole leg inert, the pre-4.3 shape exactly.
  const windowRecall = windowVerb === undefined
    ? undefined
    : installWindowRecallSync({
      face: windowVerb,
      getSidebarRight: () => toRightbarTabsFace(optionalService('sidebarRight')),
      getOpenSession: () => liveUiWorkspace(),
    })

  // M4 task 4.4 — the C9 分屏 state home: ONE plugin-lifetime split store
  // shared by the 工作台头 [分屏] control (the conversation header utilities
  // seat) and the board pane body's chrome (pane 头 + 分隔条). The
  // onLayoutChange seam stays UNWIRED here (比例态经接口暴露 — the store's
  // option surface IS the interface; 4.5's layout-memory collection is its
  // consumer; nothing persists in this task).
  const splitStore = createSplitPaneStore()
  // The 工作台头 [分屏] control: the [分屏] menu's picks resolve the controller
  // face LAZILY (the late-boot lesson — an apply-time read freezes an absent
  // service for the plugin's lifetime). The aside target resolver is ABSENT
  // on this wiring: the 会话旁置 row renders disabled until the subagent
  // context (the C5/C6 jump seams) supplies a live target — never a dead
  // click; the model + control carry the full flow (specs assert it).
  const disposeSplitControls = installSplitControls(ctx, {
    t,
    store: splitStore,
    getSplitFace: () => toRightbarTabsFace(optionalService('sidebarRight')),
  })

  // The registrations themselves stay AT APPLY (the slot/seat lifecycles are
  // service-independent — deferring them behind ctx.inject tied the seat to
  // cordis fiber re-evaluation, which unregisters/re-registers on every
  // service notify and can strand the seat mid-boot).
  const disposeWorkspacesSeat = activeProjectStore === undefined || workbenchBridge === undefined
    ? () => {}
    : installWorkspacesSeat(ctx, {
      t,
      store: activeProjectStore,
      cardFace: createIpcConfirmCardFace(workbenchBridge),
      get workspaces() { return liveWorkspaces() },
      get sessions() { return liveSessionsFace() },
      get uiWorkspace() { return liveUiWorkspace() },
      get sidebarRight() { return liveSidebarRight() },
      // M4 4.3 (AC4): the delete flow's detached-window marks + counts.
      get detachedWindows() { return windowRecall },
    })
  const disposeMetadataBar = installMetadataBar(ctx, {
    t,
    get sessions() { return liveSessionsSource() },
    ...metadataReadSources === undefined ? {} : { readSources: metadataReadSources },
    onOpenTask: metadataOpenTask,
  })
  // M4 task 3.5 — Component C2's 归档横幅只读态: the derived warn band over
  // the SAME resolved conversation dock seat (the C6 precedent — see
  // ArchiveBanner's module doc); store-driven, so it renders exactly while
  // the ACTIVE project carries the archived flag (hostless = inert).
  const disposeArchiveBanner = installArchiveBanner(ctx, {
    t,
    ...activeProjectStore === undefined ? {} : { store: activeProjectStore },
  })

  // The rightbar tab FAMILY's registration needs the `sidebarRightTabs`
  // registry SERVICE — which is itself absent at apply (the same late-boot
  // ordering; discovered by the 2.9 SC7 leg: the shipped door page stayed in
  // force). Registrations cannot be lazy (they need the registry handle), so
  // this leg installs on a BOUNDED AVAILABILITY POLL — the approval-answer
  // relay's own precedent in this plugin (250ms cadence, ~60s ceiling; absent
  // = the family never registers, the degrade the guard already owned).
  const disposeRightbarTabs = (() => {
    let stopped = false
    let installed: (() => void) | undefined
    const install = (): boolean => {
      const tabs = optionalService('sidebarRightTabs')
      if (tabs === undefined) return false
      installed = installRightbarTabs(ctx, {
        t,
        ...activeProjectStore === undefined ? {} : { activeProjectStore },
        boardSession,
        // The open-failed contract (ui-design C5 States: open 失败不静默):
        // the C5 LinkHistory rows catch the channel's ERR_SESSION_OPEN_FAILED
        // and toast; the board's own enter affordances (orchestration
        // 「进入会话」, the pane host's hand-over fallback) route the SAME
        // rejection through this catch — a dead session id keeps the board
        // state instead of surfacing an unhandled renderer rejection. The
        // affordance-level toast face rides the M6 收口 (2.10 盘点开放项).
        onEnterSession: (target: SessionOpenTarget) => {
          enterSession(target).catch(() => {})
        },
        onOpenTask: overviewOpenTask,
        ...metadataReadSources === undefined ? {} : { readTaskSources: metadataReadSources },
        // The C5 lineage seat's data leg (SC7 消费点): the SAME guarded
        // `ctx.sessions` read the metadata bar rides, threaded into the board
        // pane so the detail dock's 挂接历史 rows gain the 行展开 face.
        get sessions() { return liveSessionsFace() },
        // M4 4.4: the C9 split store (the pane 头 + 分隔条 chrome + the
        // pane-set watcher over the open-tab inventory).
        splitStore,
        // M4 4.3 (C10 ①): the [拆出为窗口] seams — the pane 头 动作位 (the
        // board origin) and the tab-menu entry (the aside origin). Both need
        // the window verb face; the menu entry also needs the project source.
        ...(windowVerb === undefined || activeProjectStore === undefined
          ? {}
          : {
            onDetachBoard: (projectId: string) => detachBoardToWindow(windowVerb, projectId),
            windowVerb,
            getActiveProjectId: () => activeProjectStore.getSnapshot().activeProjectId,
          }),
      })
      return true
    }
    if (!install()) {
      const startedAt = Date.now()
      const timer = setInterval(() => {
        if (stopped) { clearInterval(timer); return }
        if (install() || Date.now() - startedAt > 60_000) clearInterval(timer)
      }, 250)
      return () => {
        stopped = true
        clearInterval(timer)
        installed?.()
      }
    }
    return () => { installed?.() }
  })()

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

  // The combined disposer (the pre-4.3 effect cleanup + the 4.3 legs): the
  // boot routing hands it to the plugin-lifetime effect in apply().
  return () => {
    windowRecall?.dispose()
    clearTimeout(graceTimer)
    disableRail()
    disposeToolBridge()
    disposeLaunchRelay()
    disposeAnswerRelay()
    disposeProjectionRelay()
    disposeWorkspacesSeat()
    disposeMetadataBar()
    disposeArchiveBanner()
    disposeSplitControls()
    disposeRightbarTabs()
    disposeProjectPanelRow()
    activeProjectStore?.dispose()
    disposeSlotNav()
  }
}
