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
  GlobalStandardProps, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the `main` keyed slot declaration + MainPanelId brand into
// this program's SlotMap view (declared by ui-layout).
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the `sidebar.panellist` list declaration + its owner props
// into this program's SlotMap view (declared by ui-sidebar).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {
  ApprovalRow, DecideApprovalInput, DispatchRow, DispatchTasksInput, DispatchTasksResult,
  DocKind, FeatureBoardData, FeatureDoc, FeatureSummary, MigrationStarted, MigrationStatus,
  PluginRow, PrefEntry, PrefRow, PrefScope, Project, ProjectPatch, ProposalBoardData,
  ProposalDoc, RegisterProjectInput,
  StageArtifactsReport, StageAssetRow, StageGateInfo,
  TaskBoardData, TaskDetail, TaskSummary, WorkbenchEvent, WorkbenchPaths, WorkbenchState,
} from './ipc-types'

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
 * The sidebar's workspace/session browsing region (declared by ui-sidebar;
 * single, root scope — ui-workspace registers the native browser at the
 * default priority 0). M4 task 1.6: the forge project tree SHADOWS that
 * occupant (替换渲染) by registering at {@link PROJECT_SEAT_PRIORITY} —
 * SlotCore's single-slot rule: entries sharing the cell coexist at distinct
 * priorities and the LOWEST renders, an entry crash abdicates down to the
 * next (the native browser stays the degradation fallback). 声明合并纯增量,
 * 上游槽位机制零修改 (tech-design §Integration #1; Hard Rule T1/vendored).
 */
export const WORKSPACES_SLOT = 'sidebar.workspaces'

/**
 * The forge project-tree seat's shadowing rank — below ui-workspace's default
 * 0, so the forge browser wins the cell (lowest renders) while the shadowed
 * native entry stays registered (crash/teardown fallback).
 */
export const PROJECT_SEAT_PRIORITY = -100

/**
 * Sidebar row position: ascending, default 0. `plugins` occupies 0, so the
 * workbench takes 10 — beside, not colliding with, the shipped entries
 * (spike §3.3 recommendation).
 */
export const SIDEBAR_ORDER = 10

/**
 * Panel-lifecycle notifications (slot path only: the keyed main slot mounts
 * the shell only while it is the selected panel — mount/unmount IS the
 * external-selection signal). Since M4 1.7 this pair is the registration's
 * whole inject face — the retired view face (useViewKey / tab & subview
 * actions) died with the tab family the escape door collapsed.
 */
export interface WorkbenchPanelLifecycle {
  /** The workbench panel became the active main panel (an external actor selected it). */
  notifyPresented: () => void
  /** The workbench panel left the main area (an external actor selected another panel). */
  notifyDismissed: () => void
}

/**
 * The chrome's data + action face (task 5.1, UI dependency layering; M4 1.7
 * slimmed with the retired project switcher — 项目切换 now lives in the C3
 * left tree): the 5.x BUILD stage renders against DTO types + the shared
 * mock (the shell defaults to mocks/workbench.ts when the face is absent),
 * and the 5.14 ASSEMBLY injects the IPC-backed implementation.
 */
export interface WorkbenchChromeFace {
  /** Interface 1 workbench.getState()'s assembly (projects + single activation + plugin rows). */
  readonly workbenchState: WorkbenchState
  /** The register entry — the 5.4 wizard owns the dialog; stubbed until it lands. */
  readonly addProject: () => void
}

/**
 * The overview page's data + action face (task 5.3, UI dependency layering —
 * the same seam shape as WorkbenchChromeFace): the
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
  /** The UF6 section face — absent members fall back to the build-stage mock (5.13/5.14 inject the IPC verbs). */
  readonly pluginFace?: Partial<PluginFace>
  /**
   * The UF3 migration family's face (task 1.7): PRESENT activates the card
   * migration surface (可迁移 Pill/入口 + MigrationDialogs); absent keeps the
   * M2 page. The real-path view derives it from the store's bridge; tests
   * inject the 1.6 mock twin here.
   */
  readonly migrationFace?: Partial<MigrationFace>
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
 * The register wizard's probe results (task 5.4). The step-① read is the
 * DF003-前置 detection the wizard shows as instant feedback (ui-design UF1
 * States: 检出成功显示任务/feature 概览); failures carry the §Error Handling
 * `ERR_*` codes verbatim so the inline mapping is the real one.
 */
export type CodeRootProbeResult =
  | {
    available: true
    taskTotal: number
    featureTotal: number
    /**
     * Task 1.7: does the probed doc tree carry tasks/index.json? The
     * conditional migration step's premise (Interface 4 §8) — the wizard
     * re-probes with the SETTLED step-② doc location before inserting the
     * step between ② and ③.
     */
    indexJsonDetected: boolean
  }
  | { available: false; reasonCode: 'ERR_CODE_ROOT_UNREADABLE' | 'ERR_FORGE_NOT_DETECTED'; detail?: string }

/** The step-② external doc-path probe: conflict guard + readability (授权前提). */
export type ExternalPathProbeResult =
  | { ok: true }
  | { ok: false; reasonCode: 'ERR_DOC_PATH_CONFLICT' | 'ERR_EXTERNAL_PATH_UNREADABLE'; detail?: string }

/**
 * The register wizard's data + action face (task 5.4, UI dependency layering —
 * the same seam shape as OverviewFace): the BUILD
 * stage renders against mocks/workbench.createMockRegisterWizardFace, the
 * 5.14 assembly task injects the Interface 1 verbs (registerProject /
 * updateProject reject with the serialized {@link WorkbenchVerbError} shape)
 * plus the real detection read behind the probe members.
 */
export interface RegisterWizardFace {
  /**
   * Step ① (and the 1.7 step-②-advance re-probe): does this codeRoot carry
   * forge data (`.forge/` or the chosen docs location)? The 1.7 real chain
   * wires the Interface 1 probe verb over the mock twin (docLocationPath
   * absent/null = 仓内, the probe lands on the codeRoot's own tree).
   */
  probeCodeRoot(input: { codeRoot: string; docLocationPath?: string | null }): Promise<CodeRootProbeResult>
  /** Step ②: external doc-path validation (≠ codeRoot, readable — the authorization's premise). */
  probeExternalPath(input: { codeRoot: string; docLocationPath: string }): Promise<ExternalPathProbeResult>
  /** Interface 1 registerProject — the ONLY write, fired solely from the summary-confirm step (Hard Rule). */
  registerProject(input: RegisterProjectInput): Promise<Project>
  /** Interface 1 updateProject — the edit mode's repoint/rename verb (repoint completes with a rescan). */
  updateProject(id: string, patch: ProjectPatch): Promise<Project>
  /**
   * 6.4: the step-② explicit authorization's persisted record — fired from the
   * SAME summary-confirm submit, BEFORE register/update, whenever the draft is
   * external + authorized (the 2.4 registry gate reads the record; without it
   * the real chain rejects external with ERR_EXTERNAL_PATH_UNREADABLE).
   */
  authorizeExternalDocPath(path: string): Promise<void>
}

/**
 * The shell's passthrough seat for the register wizard (task 5.4): absent
 * entirely in the build stage (the dialog runs on its mock twin); 5.14
 * injects the IPC-backed face and the locate treatment.
 */
export interface RegisterWizardSeat {
  /** The wizard face — absent members fall back to the build-stage mock (5.14 injects the IPC face). */
  readonly face?: Partial<RegisterWizardFace>
  /**
   * ERR_PROJECT_EXISTS terminal (spec Error Handling: 提示已注册并定位既有
   * 项目卡片): the wizard closes itself and hands over the registered row;
   * the assembly scrolls/highlights the overview card.
   */
  readonly onLocate?: ((project: Project) => void) | undefined
}

/**
 * The UF3 migration family's data + action face (task 1.6, UI dependency
 * layering — the same seam shape as OverviewFace / RegisterWizardFace): the
 * BUILD stage renders against the shared mock twin
 * (mocks/workbench.createMockMigrationFace), the 1.7 assembly injects the
 * Interface 1 IPC verbs. Rejections surface the serialized
 * {@link WorkbenchVerbError} shape (ERR_MIGRATION_GUARD / IN_PROGRESS /
 * VERIFY) so the dialog family's code mapping is the real one from day one.
 */
export interface MigrationFace {
  /**
   * Interface 1 getMigrationStatus(projectId) — the Pill 判定 (authority)
   * and the post-backup backup-path read-back (lastEvent.detailJson).
   */
  getMigrationStatus(projectId: string): Promise<MigrationStatus>
  /**
   * Interface 1 startMigration(projectId) — the ONE-SHOT explicit migration
   * (Hard Rule: explicit confirmation only; progress rides migration_progress
   * events over subscribeEvents). Pre-flight guard rejections
   * (ERR_MIGRATION_GUARD / ERR_MIGRATION_IN_PROGRESS) carry no events.
   */
  startMigration(projectId: string): Promise<MigrationStarted>
  /**
   * Interface 1 onEvents — the single-subscriber batched channel (≤500ms
   * main-side): migration_progress drives the step rows; any project-scoped
   * batch re-reads the guard (守卫解除 ≤5s 自动恢复).
   */
  subscribeEvents(callback: (events: readonly WorkbenchEvent[]) => void): () => void
  /**
   * The entry-guard read: does a RUNNING ORCHESTRATION block migration
   * (dispatch.ended_at IS NULL — Interface 4 ①)? The overview-card path
   * consumes it; the wizard path never does (未迁移项目无编排面 — ui-design
   * 裁决). The real verb face lands with the dispatch domain (3.x); the
   * mock twin serves the build stage.
   */
  loadGuard(projectId: string): Promise<MigrationGuardSnapshot>
  /**
   * Interface 1 getWorkbenchPaths() (task 1.7): the kernel-managed locations
   * this integration's two consumers read — the flipped wizard default
   * (docsRoot + the project's directory name = the 仓外应用管理路径 prefill)
   * and the migration confirm's 备份位置 copy (backupsRoot).
   */
  getWorkbenchPaths(): Promise<WorkbenchPaths>
}

/** The entry-guard snapshot: blocked ⟺ running orchestrations exist. */
export interface MigrationGuardSnapshot {
  readonly blocked: boolean
  /** Running-orchestration count (tooltip context; 0 when not blocked). */
  readonly runningCount: number
}

/**
 * The UF2 task board's data + action face (task 5.5, UI dependency layering —
 * the same seam shape as OverviewFace / RegisterWizardFace): the BUILD stage
 * renders against the shared mock twin
 * (mocks/workbench.createMockTaskBoardFace), the 5.15 assembly task injects
 * the Interface 1 verbs — getTaskBoard for the load, the onEvents push
 * channel (single-subscriber, batched ≤500ms main-side) for the 回流
 * updating 态.
 */
export interface TaskBoardFace {
  /** Interface 1 workbench.getTaskBoard(projectId) — the board's data load. */
  loadBoard(projectId: string): Promise<TaskBoardData>
  /** Interface 1 workbench.onEvents(callback) — the 回流 event channel; returns the unsubscribe. */
  subscribeEvents(callback: (events: readonly WorkbenchEvent[]) => void): () => void
}

/**
 * The UF1 orchestration verb face (task 3.9, tech-design §Integration #1 /
 * §Interface 1 编排段): the six human-side dispatch/approval verbs the board
 * page's UF1 wiring consumes — checkStageArtifacts / dispatchTasks /
 * redispatch (the 3.6/3.8 chains) + getDispatches / listApprovals /
 * decideApproval (the badge spectrum, the approval dock). Signatures mirror
 * the preload bridge of task 3.3 one-to-one; the DTO twins are the
 * ipc-types.ts canonical client twins (structural twins of the 3.6-3.8 UI
 * view twins, so the face satisfies DispatchVerbs / DetailDispatchVerbs /
 * ApprovalVerbs structurally). The page runs on its mock twin in tests;
 * the assembly (TasksView) injects the IPC-backed face when the bridge is
 * live — absent members keep the UF1 toolbar entries inert (never a silent
 * mock in the real host).
 */
export interface DispatchFace {
  /** workbench.checkStageArtifacts(input) — the deterministic pre-dispatch check. */
  checkStageArtifacts(input: { readonly projectId: string; readonly featureSlug: string }): Promise<StageArtifactsReport>
  /** workbench.dispatchTasks(input, actor) — mint dispatch rows (blocked = missing & unacknowledged). */
  dispatchTasks(input: DispatchTasksInput, actor: string): Promise<DispatchTasksResult>
  /** workbench.redispatch(dispatchId, actor) — re-run the whole pre-check for a failed row. */
  redispatch(dispatchId: string, actor: string): Promise<DispatchTasksResult>
  /** workbench.getDispatches(projectId) — the board's orchestration rows (the badge spectrum's data). */
  getDispatches(projectId: string): Promise<DispatchRow[]>
  /** workbench.listApprovals(projectId) — the approval dock's rows (pending first, created_at 倒序). */
  listApprovals(projectId: string): Promise<ApprovalRow[]>
  /** workbench.decideApproval(input, actor) — the ONLY decision path (explicit click, decided_by audit). */
  decideApproval(input: DecideApprovalInput, actor: string): Promise<ApprovalRow>
}

/**
 * The UF2 stage family's data face (task 4.3, tech-design §Interface 1 阶段段
 * + §Interface 5): the three stage verbs the UF2 component layer consumes —
 * getStageGate (the stepper's gate verdict + the assets list), listStageAssets
 * (the sixth 「阶段资产」 tab's rows, content-joined), advanceStage (the advance
 * action; unsatisfied gate → ERR_STAGE_GATE_UNSATISFIED riding the serialized
 * WorkbenchVerbError shape, satisfied → the post-advance FeatureSummary +
 * stage_advanced reflux through the SAME shared event source every family
 * multiplexes over). Signatures mirror the preload bridge one-to-one; the
 * component layer builds against the mock twin (mocks/workbench.
 * createMockStageFace — TEST/BUILD-ONLY, the advance leg is a WRITE surface so
 * absent members stay inert, the dispatch-face discipline), 4.4's assembly
 * injects the IPC-backed face.
 */
export interface StageFace {
  /** workbench.getStageGate(projectId, featureSlug) — gate verdict + assets list. */
  getStageGate(projectId: string, featureSlug: string): Promise<StageGateInfo>
  /** workbench.listStageAssets(projectId, featureSlug) — the tab's content-joined rows (pipeline order). */
  listStageAssets(projectId: string, featureSlug: string): Promise<StageAssetRow[]>
  /** workbench.advanceStage(projectId, featureSlug) — the gate-gated advance (terminal stage = idempotent no-op). */
  advanceStage(projectId: string, featureSlug: string): Promise<FeatureSummary>
  /** The shared single-subscriber event channel (stage_advanced / deviation_detected reflux ≤5s). */
  subscribeEvents(callback: (events: readonly WorkbenchEvent[]) => void): () => void
}

/**
 * The shell's passthrough seat for the task board (task 5.5): absent
 * entirely in the build stage (the page runs on its mock twins); the 5.15
 * assembly injects the IPC-backed faces. Since 5.8 the page owns the
 * selection linkage (the single-source store + the mounted detail dock);
 * this seat remains the assembly's observation/injection surface.
 */
export interface TaskBoardSeat {
  /** The board face — absent members fall back to the build-stage mock (5.15 injects the IPC face). */
  readonly face?: Partial<TaskBoardFace>
  /** The detail-dock face — absent members fall back to the build-stage mock (5.15 injects the IPC verb). */
  readonly detailFace?: Partial<TaskDetailFace>
  /**
   * The UF1 orchestration face (task 3.9): absent members keep the UF1
   * toolbar entries inert (no silent mock twin); tests inject the mock twin
   * through here, the assembly injects the IPC-backed face.
   */
  readonly dispatchFace?: Partial<DispatchFace> | undefined
  /**
   * The UF3 selection seam OBSERVATION: a row/card activation (click /
   * Enter / Space — navigation, the ONLY interaction rows carry) hands the
   * task over. Since 5.8 the page's selection store opens the dock itself;
   * this callback observes every activation for the assembly (5.15).
   */
  readonly onSelect?: ((task: TaskSummary) => void) | undefined
}

/**
 * The UF3 detail dock's data face (task 5.7, UI dependency layering — the
 * same seam shape as TaskBoardFace): the BUILD stage renders against the
 * shared mock twin (mocks/workbench.createMockTaskDetailFace), the 5.15
 * assembly injects the Interface 1 verb. The member mirrors
 * workbench.getTaskDetail(projectId, taskKey) one-to-one; rejections carry
 * the serialized {@link WorkbenchVerbError} shape so the dock's error state
 * runs against the real form from day one.
 */
export interface TaskDetailFace {
  /** Interface 1 workbench.getTaskDetail(projectId, taskKey) — the dock's one-shot load. */
  loadDetail(projectId: string, taskKey: string): Promise<TaskDetail>
}

/**
 * The UF4 feature board's data face (task 5.9, UI dependency layering — the
 * same seam shape as TaskBoardFace): the BUILD stage renders against the
 * shared mock twin (mocks/workbench.createMockFeatureBoardFace), the 5.16
 * assembly injects the Interface 1 verb. The member mirrors
 * workbench.getFeatureBoard(projectId) one-to-one; rejections carry the
 * serialized {@link WorkbenchVerbError} shape so the board's error state runs
 * against the real form from day one.
 */
export interface FeatureBoardFace {
  /** Interface 1 workbench.getFeatureBoard(projectId) — the board's data load. */
  loadFeatureBoard(projectId: string): Promise<FeatureBoardData>
}

/**
 * The UF4 doc tabs' data face (task 5.9, UI dependency layering — the same
 * seam shape as TaskDetailFace): the BUILD stage renders against the shared
 * mock twin (mocks/workbench.createMockFeatureDocFace), the 5.16 assembly
 * injects the Interface 1 verb. The member mirrors
 * workbench.readFeatureDoc(projectId, featureSlug, kind) one-to-one — the
 * per-tab one-shot read behind the loading/error/ERR_SNAPSHOT_STALE branches.
 */
export interface FeatureDocFace {
  /** Interface 1 workbench.readFeatureDoc(projectId, featureSlug, kind) — one doc tab's read. */
  readFeatureDoc(projectId: string, featureSlug: string, kind: DocKind): Promise<FeatureDoc>
}

/**
 * The UF6 plugin section's data + action face (task 5.12, UI dependency
 * layering — the same seam shape as OverviewFace, 5.7's 1:1 verb discipline):
 * the BUILD stage renders against the shared mock twin
 * (mocks/workbench.createMockPluginFace), the 5.13/5.14 assembly tasks inject
 * the Interface 1 verbs. Every member mirrors its §Interface 1 verb
 * one-to-one; rejections carry the serialized {@link WorkbenchVerbError}
 * shape. ERR_PLUGIN_MANDATORY is UNREACHABLE from the UI by construction (a
 * mandatory row renders no write control — Hard Rule), so the section's
 * mapping for it is defense-in-depth's visible layer, not a UI-walkable path.
 */
export interface PluginFace {
  /** Interface 1 workbench.listPlugins() — the section's data load. */
  listPlugins(): Promise<PluginRow[]>
  /** Interface 1 workbench.setPluginEnabled(name, enabled) — resolves the current rows. */
  setPluginEnabled(name: string, enabled: boolean): Promise<PluginRow[]>
}

/**
 * The UF4 prefs section's data + action face (task 5.1, UI dependency
 * layering — the same seam shape as PluginFace, the 3.1 verb discipline):
 * the BUILD stage renders against the shared mock twin
 * (mocks/workbench.createMockPrefsFace), the 5.2 assembly task injects the
 * Interface 1 IPC verbs. Every member mirrors its §Interface 1 偏好段 verb
 * one-to-one — getPrefs answers EVERY registered key (closed forge registry,
 * surfaces excluded) with effective value + source tier + type/control/group
 * metadata (the 键→控件映射 authority; the UI never hardcodes the key list);
 * setPrefs is atomic with rejections carrying the serialized
 * {@link WorkbenchVerbError} shape (ERR_PREF_KEY_UNKNOWN /
 * ERR_PREF_VALUE_INVALID); clearPrefOverride deletes this tier's row so the
 * effective value falls back to the next tier.
 */
export interface PrefsFace {
  /** Interface 1 workbench.getPrefs(scope) — every registry key, resolved for the scope. */
  getPrefs(scope: PrefScope): Promise<PrefRow[]>
  /** Interface 1 workbench.setPrefs(scope, entries) — transactional write; type-checked in the kernel. */
  setPrefs(scope: PrefScope, entries: readonly PrefEntry[]): Promise<void>
  /** Interface 1 workbench.clearPrefOverride(scope, key) — idempotent; the value falls back a tier. */
  clearPrefOverride(scope: PrefScope, key: string): Promise<void>
}

/**
 * The shell's passthrough seat for the feature board (task 5.9): absent
 * entirely in the build stage (the page runs on its mock twins); the 5.16
 * assembly injects the IPC-backed faces (the board verb + the doc verb).
 * Task 4.4 adds the UF2 stage face (Integration Spec #2): absent members
 * keep the M2 form (no sixth tab, no gate verdict, no advance entry — the
 * dispatch-face inert discipline: the advance leg is a WRITE surface, so
 * no silent mock twin ever runs); tests inject the mock twin, the assembly
 * injects the IPC-backed face.
 */
export interface WorkbenchFeaturesSeat {
  /** The board face — absent members fall back to the build-stage mock (5.16 injects the IPC face). */
  readonly face?: Partial<FeatureBoardFace>
  /** The doc face — absent members fall back to the build-stage mock (5.16 injects the IPC face). */
  readonly docFace?: Partial<FeatureDocFace>
  /**
   * The UF2 stage face (task 4.4): getStageGate drives the stepper gate
   * verdict, listStageAssets the sixth 「阶段资产」 tab, advanceStage the
   * header's advance entry, subscribeEvents the stage_advanced /
   * deviation_detected board reflux (≤5s).
   */
  readonly stageFace?: Partial<StageFace> | undefined
}

/**
 * The UF5 提案看板's data face (task 5.4, tech-design §Interface 1 提案段 +
 * §Integration #5): the READ-ONLY proposal pair the component layer consumes —
 * loadBoard answers the board rows (proposal_snapshot projection, created-desc
 * baseline) + the proposals root for the empty-state path hint; readProposalDoc
 * answers the raw markdown of one document (kind 'proposal' = proposal.md,
 * 'eval' = the deterministic eval-report pick). subscribeEvents routes through
 * the SAME shared single-subscriber channel every family multiplexes over —
 * the proposals reflux rides the project-scoped `sync` pushes (every scan
 * completion, watcher-driven ≤5s on the real chain; proposals/ is inside the
 * watched roots since 5.3). Signatures mirror the preload bridge one-to-one
 * (the 5.3 verbs); rejections carry the serialized {@link WorkbenchVerbError}
 * shape (ERR_PROJECT_NOT_FOUND / ERR_PROPOSAL_PATH_INVALID /
 * ERR_PROPOSAL_NOT_FOUND). The components build against the mock twin
 * (mocks/workbench.createMockProposalsFace — a pure READ face, so the
 * build-stage default mock is legitimate, the feature-board-face discipline);
 * 5.5's assembly injects the IPC-backed face.
 */
export interface ProposalFace {
  /** Interface 1 workbench.getProposalBoard(projectId) — the board's data load. */
  loadBoard(projectId: string): Promise<ProposalBoardData>
  /** Interface 1 workbench.readProposalDoc(input) — one document's raw markdown. */
  readProposalDoc(input: { readonly projectId: string; readonly slug: string; readonly kind: 'proposal' | 'eval' }): Promise<ProposalDoc>
  /** The shared single-subscriber event channel (sync pushes → reflux ≤5s). */
  subscribeEvents(callback: (events: readonly WorkbenchEvent[]) => void): () => void
}

/**
 * The shell's passthrough seat for the proposals board (task 5.5, UF5
 * assembly): absent entirely on the real path (the shell derives the page's
 * inputs from its store-backed chrome chain and injects the IPC-backed
 * proposal face); tests / the build stage inject the mock twin + seam
 * overrides through here.
 */
export interface WorkbenchProposalsSeat {
  /** The proposals face — absent members fall back to the build-stage mock (5.5 injects the IPC face on the real chain). */
  readonly face?: Partial<ProposalFace> | undefined
  /**
   * 仓外路径失效 override (seat form only): true renders the list's lost
   * guidance card. The real path derives the flag from the store's
   * sync-derived lostProjectIds (the OverviewView 口径).
   */
  readonly docsLost?: boolean | undefined
  /**
   * The lost card's 重新指向 seam override — the shell's default routes it to
   * the register wizard's EDIT mode for the ACTIVE project (the 5.4 repoint
   * treatment); the seam is parameterless (the lost card is the active
   * project's by construction).
   */
  readonly onRepoint?: (() => void) | undefined
  /**
   * The lost card's 移除项目 seam override — the shell's default opens the
   * RemoveConfirm double-confirm over the tab content (the overview remove
   * flow's discipline; 移除 MUST pass the two-step confirmation).
   */
  readonly onRemove?: (() => void) | undefined
}

/**
 * The session success hand-over (task 5.11; M3 6.1 起为 dispatch 链「进入会
 * 话」所消费): the caller fires it with the session (and the task ref it
 * belongs to — the board's badge write needs the qualified key). The real
 * assembly's implementation lives in session-handover.ts: 切会话视图 through
 * the view-switch controller + the `ctx.uiWorkspace.openSession(sessionId)`
 * locator (spike-1 §2.2).
 */
export type SessionLaunchHandover = (sessionId: string, task: SessionLaunchTaskRef) => void

/**
 * Composed props of the main-panel shell component — the M4 1.7 escape-door
 * shape: the runtime/locale shares, the panel-lifecycle notifications, the
 * chrome face, and the overview/wizard assembly seats. The retired members
 * (the view face, the taskBoard/features/proposals seats, the launch
 * hand-over, the board session store) died with the boards' main-panel
 * hosts; their components survive for the P2 rightbar re-homing. The
 * framework standard kit (GlobalStandardProps — `usePanelInfo` & co.) is
 * deliberately omitted from the requirement: the fallback rail mounts the
 * SAME component outside the slot tree, where no framework kit exists, and
 * the shell renders identically in both forms (Hard Rule). The framework
 * still injects its kit in the slot path — extra props a component doesn't
 * read are harmless.
 */
export type WorkbenchShellProps =
  & Omit<PropsRuntime<typeof MAIN_SLOT, typeof PANEL_ID>, keyof GlobalStandardProps>
  & PropsLocale<typeof NS>
  & Partial<WorkbenchPanelLifecycle>
  /** The chrome face is partial: absent members fall back to the build-stage mock (task 5.1). */
  & Partial<WorkbenchChromeFace>
  /** The overview page's assembly seat (task 5.3): absent = the page-local mock twin. */
  & { overview?: WorkbenchOverviewSeat }
  /** The register wizard's assembly seat (task 5.4): absent = the wizard-local mock twin. */
  & { wizard?: RegisterWizardSeat }

/** Composed props of the sidebar icon (the sidebar's icon share). */
export type WorkbenchPanelIconProps = PropsRuntime<typeof SIDEBAR_SLOT>

/**
 * The task identity the session jump needs (task 5.10): the project the
 * task belongs to (badge persistence context), and the workbench dialect
 * address — the caller derives the QUALIFIED key `<featureSlug>/<localId>`
 * (task 2.5).
 */
export interface SessionLaunchTaskRef {
  readonly projectId: string
  /** Registered project codeRoot (project context of the jump). */
  readonly codeRoot: string
  readonly featureSlug: string
  readonly localId: string
  /** Display title. */
  readonly title: string
}

