import { contextBridge, ipcRenderer } from 'electron'
import type { RecoveryState } from '../main/crash-recovery/index.ts'
// Preload-local copy of the workbench channel table — the sandboxed preload
// cannot require relative bundle chunks, so it must not share modules with the
// main bundle (see ./channel-allowlist.ts header; sync locked by tests).
import { WORKBENCH_EVENT_CHANNEL, WORKBENCH_VERB_CHANNELS } from './channel-allowlist.ts'
import type {
  ApprovalRow,
  DecideApprovalInput,
  DetectReport,
  DispatchRow,
  DispatchTasksInput,
  DispatchTasksResult,
  ProbeProjectPathInput,
  ProjectRefInput,
  ReceiveApprovalVerbInput,
  RenameProjectInput,
  FeatureBoardData,
  FeatureDoc,
  FeatureListEntry,
  FeatureStatusReport,
  KnowledgeFactEntry,
  KnowledgeFactInput,
  KnowledgeFactListResult,
  KnowledgeFactSummaryResult,
  KnowledgeForensicInput,
  KnowledgeForensicResult,
  KnowledgeLesson,
  KnowledgeLessonInput,
  KnowledgeLessonListResult,
  KnowledgeResearchInput,
  KnowledgeResearchListResult,
  KnowledgeResearchReport,
  MigrationStarted,
  MigrationStatus,
  PluginRow,
  PrefEntry,
  ProposalBoardData,
  ProposalDoc,
  PrefRow,
  PrefScope,
  ProbeCodeRootInput,
  ProbeCodeRootResult,
  Project,
  RecordSessionLinkInput,
  RegisterProjectInput,
  SessionLink,
  StageArtifactsReport,
  StageAssetRow,
  StageGateInfo,
  StageSummarizeInput,
  StageSummarizeResult,
  FeatureSummary,
  TaskAddInput,
  TaskBoardData,
  TaskClaimInput,
  TaskDetail,
  TaskGetInput,
  TaskQueryInput,
  TaskReopenInput,
  TaskSubmitInput,
  TaskSummary,
  TaskTransitionInput,
  WorkbenchEvent,
  WorkbenchPaths,
  WorkbenchState,
} from '../main/workbench/ipc/types.ts'

/** The knowledgeFact verb result union (line-length relief; same members as the interface). */
type KnowledgeFactVerbResult = KnowledgeFactListResult | KnowledgeFactEntry | KnowledgeFactSummaryResult
import type { DocKind, ProjectPatch } from '../main/workbench/ipc/types.ts'

// contextBridge semantic verbs (whitelist). The renderer (upstream client UI
// plugin family) talks to the shell exclusively through these verbs; raw
// ipcRenderer / Node APIs never cross the boundary.

// Carrier-boot verb pair inherited from the upstream desktop shell contract:
// the upstream web entry (apps/web/src/main.ts) probes globalThis.dshDesktopBoot,
// calls ready() to receive { injections, streamBaseUrl }, and then installs
// __DSH_TRANSPORT__ = { ownsHost: true, streamBaseUrl } itself. failed()
// reports renderer-side startup errors back to the shell log.
contextBridge.exposeInMainWorld('dshDesktopBoot', {
  ready: (): Promise<{ injections: unknown[]; streamBaseUrl: string }> =>
    ipcRenderer.invoke('dsh-forge:boot') as Promise<{ injections: unknown[]; streamBaseUrl: string }>,
  failed: (message: string): Promise<void> =>
    ipcRenderer.invoke('dsh-forge:boot-failed', message) as Promise<void>,
})

contextBridge.exposeInMainWorld('__DSH_FORGE_SHELL__', {
  // Skeleton verb: shell version probe. Real verbs land with their features.
  ping: (): string => 'dsh-forge-shell',
  // Interface 5 fallback toast: the main process pushes an already-localized
  // manual-switch message; the shell-ui overlay renders it. Returns an
  // unsubscriber (single-listener semantic verb, sender = shell main only).
  onToast: (callback: (message: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string): void => callback(message)
    ipcRenderer.on('dsh-forge:toast', listener)
    return () => ipcRenderer.removeListener('dsh-forge:toast', listener)
  },
})

// Interface 6: dshForge semantic verbs (IPC whitelist + main-side sender frame
// validation). Each verb maps to exactly one whitelisted channel; the main
// process rejects and logs any invoke from an unowned frame.
contextBridge.exposeInMainWorld('dshForge', {
  update: {
    dismiss: (): Promise<void> => ipcRenderer.invoke('dsh-forge:update-dismiss') as Promise<void>,
    openRelease: (): Promise<void> => ipcRenderer.invoke('dsh-forge:update-open-release') as Promise<void>,
    // UF3 banner state pull (late-mount catch-up) + push subscription.
    // Payload: UpdateBannerState = { phase: 'hidden'|'queued'|'shown'|'dismissed'; version? }.
    getState: (): Promise<{ phase: string; version?: string }> =>
      ipcRenderer.invoke('dsh-forge:update-get-state') as Promise<{ phase: string; version?: string }>,
    onState: (callback: (state: { phase: string; version?: string }) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, state: { phase: string; version?: string }): void => callback(state)
      ipcRenderer.on('dsh-forge:update-state', listener)
      return () => ipcRenderer.removeListener('dsh-forge:update-state', listener)
    },
  },
  recovery: {
    restartApp: (): Promise<void> => ipcRenderer.invoke('dsh-forge:recovery-restart-app') as Promise<void>,
    getState: (): Promise<RecoveryState> => ipcRenderer.invoke('dsh-forge:recovery-get-state') as Promise<RecoveryState>,
    // UF4 state push subscription (the renderer mirrors the main-side machine).
    // Payload: { state: RecoveryState; reason?: string } — reason present only
    // on 'failed' (failure.detail, ≤120 chars, tech-design Data Models).
    onState: (callback: (state: { state: RecoveryState; reason?: string }) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: { state: RecoveryState; reason?: string }): void => callback(payload)
      ipcRenderer.on('dsh-forge:recovery-state', listener)
      return () => ipcRenderer.removeListener('dsh-forge:recovery-state', listener)
    },
  },
  // M2 Interface 1: workbench data-plane semantic verbs (task 2.7). Each verb
  // maps to exactly one whitelisted channel (channel-allowlist.ts is the shared
  // source — no hand-written channel strings, no generic invoke passthrough).
  // Rejections arrive as WorkbenchIpcError whose message is the serialized
  // `{ code, message, detail? }` envelope (tech-design §Error Handling).
  workbench: {
    getState: (): Promise<WorkbenchState> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.getState) as Promise<WorkbenchState>,
    registerProject: (input: RegisterProjectInput): Promise<Project> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.registerProject, input) as Promise<Project>,
    updateProject: (id: string, patch: ProjectPatch): Promise<Project> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.updateProject, id, patch) as Promise<Project>,
    removeProject: (id: string): Promise<void> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.removeProject, id) as Promise<void>,
    activateProject: (id: string): Promise<void> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.activateProject, id) as Promise<void>,
    getTaskBoard: (projectId: string): Promise<TaskBoardData> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.getTaskBoard, projectId) as Promise<TaskBoardData>,
    getTaskDetail: (projectId: string, taskKey: string): Promise<TaskDetail> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.getTaskDetail, projectId, taskKey) as Promise<TaskDetail>,
    getFeatureBoard: (projectId: string): Promise<FeatureBoardData> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.getFeatureBoard, projectId) as Promise<FeatureBoardData>,
    readFeatureDoc: (projectId: string, featureSlug: string, kind: DocKind): Promise<FeatureDoc> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.readFeatureDoc, projectId, featureSlug, kind) as Promise<FeatureDoc>,
    listPlugins: (): Promise<PluginRow[]> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.listPlugins) as Promise<PluginRow[]>,
    setPluginEnabled: (name: string, enabled: boolean): Promise<PluginRow[]> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.setPluginEnabled, name, enabled) as Promise<PluginRow[]>,
    recordSessionLink: (input: RecordSessionLinkInput): Promise<SessionLink> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.recordSessionLink, input) as Promise<SessionLink>,
    endSessionLink: (linkId: string): Promise<void> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.endSessionLink, linkId) as Promise<void>,
    // 6.4: the wizard step-② explicit authorization record (registry/authorize
    // single write path; validation chains read it, nothing here touches fs).
    authorizeExternalDocPath: (path: string): Promise<void> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.authorizeExternalDocPath, path) as Promise<void>,
    // M3 task verbs (task 1.3): the five write-set verbs carry an explicit
    // actor string (session:<id> | external | kernel | dispatcher) — the
    // kernel records it as updated_by on every write (audit discipline);
    // taskGet/taskQuery route by the project's data_authority. Rejections
    // arrive as the same { code, message, detail? } envelope (ERR_TASK_*).
    taskAdd: (input: TaskAddInput, actor: string): Promise<TaskSummary> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.taskAdd, input, actor) as Promise<TaskSummary>,
    taskClaim: (input: TaskClaimInput, actor: string): Promise<TaskSummary> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.taskClaim, input, actor) as Promise<TaskSummary>,
    taskTransition: (input: TaskTransitionInput, actor: string): Promise<TaskSummary> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.taskTransition, input, actor) as Promise<TaskSummary>,
    taskSubmit: (input: TaskSubmitInput, actor: string): Promise<TaskSummary> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.taskSubmit, input, actor) as Promise<TaskSummary>,
    taskReopen: (input: TaskReopenInput, actor: string): Promise<TaskSummary> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.taskReopen, input, actor) as Promise<TaskSummary>,
    taskGet: (input: TaskGetInput): Promise<TaskDetail> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.taskGet, input) as Promise<TaskDetail>,
    taskQuery: (input: TaskQueryInput): Promise<TaskSummary[]> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.taskQuery, input) as Promise<TaskSummary[]>,
    // M3 migration verbs (task 1.4): status read is synchronous-shaped; the
    // one-shot startMigration runs the guard→backup→ingest→verify→switch→
    // archive pipeline in the kernel and reports phase progress through
    // migration_progress events (onEvents). Rejections arrive as the same
    // { code, message, detail? } envelope (ERR_MIGRATION_GUARD /
    // ERR_MIGRATION_IN_PROGRESS / ERR_MIGRATION_VERIFY — verify failures are
    // rolled back wholesale and retryable).
    getMigrationStatus: (projectId: string): Promise<MigrationStatus> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.getMigrationStatus, projectId) as Promise<MigrationStatus>,
    startMigration: (projectId: string): Promise<MigrationStarted> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.startMigration, projectId) as Promise<MigrationStarted>,
    // M3 UF3 integration reads (task 1.7): the register wizard's real step-①
    // probe (forge availability + totals + indexJsonDetected — the conditional
    // migration step's premise) and the kernel-managed locations behind the
    // flipped 仓外 default (docsRoot) and the migration confirm copy
    // (backupsRoot). Both read-only.
    probeCodeRoot: (input: ProbeCodeRootInput): Promise<ProbeCodeRootResult> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.probeCodeRoot, input) as Promise<ProbeCodeRootResult>,
    getWorkbenchPaths: (): Promise<WorkbenchPaths> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.getWorkbenchPaths) as Promise<WorkbenchPaths>,
    // M4 v3 project-center verbs (task 1.3): probeProjectPath answers the C7
    // detection report (D11 identity + registered fast lane + evidence probes —
    // read-only, path-level failures degrade into the report shape); the
    // lifecycle four (rename / archive / restore / listProjects) carry the v3
    // columns (archived / sortOrder / projectionState / docsPlacement). The
    // registerProject verb above now ALSO accepts the v2 input shape
    // ({ anchor, docsPlacement, … }) alongside the M2/M3 v1 shape. Rejections
    // arrive as the same { code, message, detail? } envelope
    // (ERR_PROJECT_EXISTS with the registered fast-lane payload in detail /
    // ERR_CODE_ROOT_UNREADABLE / ERR_EXTERNAL_PATH_UNREADABLE /
    // ERR_PROJECT_NOT_FOUND); successful mutations push
    // project_list_changed (and projection_push_required placeholders) through
    // onEvents.
    probeProjectPath: (input: ProbeProjectPathInput): Promise<DetectReport> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.probeProjectPath, input) as Promise<DetectReport>,
    renameProject: (input: RenameProjectInput): Promise<Project> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.renameProject, input) as Promise<Project>,
    archiveProject: (input: ProjectRefInput): Promise<Project> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.archiveProject, input) as Promise<Project>,
    restoreProject: (input: ProjectRefInput): Promise<Project> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.restoreProject, input) as Promise<Project>,
    listProjects: (): Promise<Project[]> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.listProjects) as Promise<Project[]>,
    // M3 knowledge + feature-read verbs (task 2.2, D4): action-dispatched data
    // planes over the registered project's doc root (fact/lesson/research
    // read + append-only write; forensic machine-global read-only — no
    // projectId; feature list/status read). Rejections arrive as the same
    // { code, message, detail? } envelope (ERR_PROJECT_NOT_FOUND /
    // ERR_KNOWLEDGE_* / ERR_FORENSIC_SOURCE_UNREADABLE / ERR_FEATURE_NOT_FOUND).
    knowledgeFact: (input: KnowledgeFactInput): Promise<KnowledgeFactVerbResult> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.knowledgeFact, input) as Promise<KnowledgeFactVerbResult>,
    knowledgeLesson: (input: KnowledgeLessonInput): Promise<KnowledgeLessonListResult | KnowledgeLesson> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.knowledgeLesson, input) as Promise<KnowledgeLessonListResult | KnowledgeLesson>,
    knowledgeResearch: (input: KnowledgeResearchInput): Promise<KnowledgeResearchListResult | KnowledgeResearchReport> =>
      ipcRenderer.invoke(
        WORKBENCH_VERB_CHANNELS.knowledgeResearch, input,
      ) as Promise<KnowledgeResearchListResult | KnowledgeResearchReport>,
    knowledgeForensic: (input: KnowledgeForensicInput): Promise<KnowledgeForensicResult> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.knowledgeForensic, input) as Promise<KnowledgeForensicResult>,
    featureList: (projectId: string): Promise<FeatureListEntry[]> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.featureList, projectId) as Promise<FeatureListEntry[]>,
    featureStatus: (input: { projectId: string; featureSlug: string }): Promise<FeatureStatusReport> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.featureStatus, input) as Promise<FeatureStatusReport>,
    // M3 prefs verbs (task 3.1): the three-tier preference family
    // (feature > project > global > registry default). setPrefs is atomic
    // (validate-all-then-write inside one transaction); rejections arrive as
    // the same { code, message, detail? } envelope (ERR_PREF_KEY_UNKNOWN /
    // ERR_PREF_VALUE_INVALID / ERR_PREF_SCOPE_INVALID / ERR_PROJECT_NOT_FOUND).
    // Writes that change anything push prefs_updated through onEvents.
    getPrefs: (scope: PrefScope): Promise<PrefRow[]> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.getPrefs, scope) as Promise<PrefRow[]>,
    setPrefs: (scope: PrefScope, entries: readonly PrefEntry[]): Promise<void> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.setPrefs, scope, entries) as Promise<void>,
    clearPrefOverride: (scope: PrefScope, key: string): Promise<void> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.clearPrefOverride, scope, key) as Promise<void>,
    // M3 stages read verbs (task 3.2): deterministic pre-dispatch artifact
    // checklist (missing = warn list, never blocks here — the dispatch layer
    // expresses acknowledgement via acknowledgeMissing) plus the stage gate
    // (current-stage summary generated?) and the derived stage-asset index
    // (pipeline-ordered). Rejections arrive as the same
    // { code, message, detail? } envelope (ERR_PROJECT_NOT_FOUND /
    // ERR_FEATURE_NOT_FOUND).
    checkStageArtifacts: (input: { projectId: string; featureSlug: string }): Promise<StageArtifactsReport> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.checkStageArtifacts, input) as Promise<StageArtifactsReport>,
    getStageGate: (projectId: string, featureSlug: string): Promise<StageGateInfo> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.getStageGate, projectId, featureSlug) as Promise<StageGateInfo>,
    listStageAssets: (projectId: string, featureSlug: string): Promise<StageAssetRow[]> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.listStageAssets, projectId, featureSlug) as Promise<StageAssetRow[]>,
    // M3 stages write verbs (task 4.1): advanceStage is the advance gate —
    // the current stage's summary asset must exist (live fs verdict) or the
    // call rejects ERR_STAGE_GATE_UNSATISFIED with the missing-asset guidance;
    // a satisfied gate flips the manifest status kernel-side (stage advance
    // internalized, feature set/complete's "complete" leg), syncs the feature
    // snapshot and pushes stage_advanced through onEvents. A repeated advance
    // at 'completed' is an idempotent no-op (no write, no event). stageSummarize
    // is the forge.stage.summarize kernel write face: (over)writes
    // stages/<stage>.md (frontmatter { stage, generated, goal } + summary body)
    // and syncs the stage_asset index. Rejections ride the same
    // { code, message, detail? } envelope (ERR_STAGE_* / ERR_FEATURE_NOT_FOUND
    // / ERR_PROJECT_NOT_FOUND).
    advanceStage: (projectId: string, featureSlug: string): Promise<FeatureSummary> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.advanceStage, projectId, featureSlug) as Promise<FeatureSummary>,
    stageSummarize: (input: StageSummarizeInput): Promise<StageSummarizeResult> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.stageSummarize, input) as Promise<StageSummarizeResult>,
    // M3 proposals read verbs (task 5.3, UF5 data plane): getProposalBoard
    // answers the read-only proposal board (derived proposal_snapshot rows in
    // the created-descending baseline order, live-joined hasEval, plus the
    // proposals root for the empty-state path hint); readProposalDoc answers
    // the raw markdown of proposals/<slug>/proposal.md (kind 'proposal') or
    // the deterministic eval-report pick (kind 'eval' — final-report.md
    // preferred, lexicographic fallback). Rejections ride the same
    // { code, message, detail? } envelope (ERR_PROJECT_NOT_FOUND /
    // ERR_PROPOSAL_PATH_INVALID / ERR_PROPOSAL_NOT_FOUND).
    getProposalBoard: (projectId: string): Promise<ProposalBoardData> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.getProposalBoard, projectId) as Promise<ProposalBoardData>,
    readProposalDoc: (input: { projectId: string; slug: string; kind: 'proposal' | 'eval' }): Promise<ProposalDoc> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.readProposalDoc, input) as Promise<ProposalDoc>,
    // M3 dispatch verbs (task 3.3): the orchestration family. dispatchTasks
    // validates the dispatchable set (status allowed + terminal deps — rejections
    // arrive as the same { code, message, detail? } envelope, ERR_TASK_*),
    // consumes checkStageArtifacts (missing & unacknowledged → the blocked
    // union with the missing list) and creates one dispatch row per task
    // sharing a batchId; the actor string is the dispatching human (audit).
    // decideApproval is the only decision path (no auto-approval; decided_by
    // audit); duplicate decisions → ERR_APPROVAL_DECIDED, stale entries →
    // ERR_APPROVAL_NOT_FOUND. State reflux arrives through dispatch_updated /
    // approval_received events (onEvents).
    dispatchTasks: (input: DispatchTasksInput, actor: string): Promise<DispatchTasksResult> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.dispatchTasks, input, actor) as Promise<DispatchTasksResult>,
    redispatch: (dispatchId: string, actor: string): Promise<DispatchTasksResult> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.redispatch, dispatchId, actor) as Promise<DispatchTasksResult>,
    getDispatches: (projectId: string): Promise<DispatchRow[]> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.getDispatches, projectId) as Promise<DispatchRow[]>,
    listApprovals: (projectId: string): Promise<ApprovalRow[]> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.listApprovals, projectId) as Promise<ApprovalRow[]>,
    decideApproval: (input: DecideApprovalInput, actor: string): Promise<ApprovalRow> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.decideApproval, input, actor) as Promise<ApprovalRow>,
    // M3 dispatch host-callback verbs (task 3.5): the renderer RELAYS these on
    // behalf of the plugin host half — dispatch-launch launch outcomes
    // (notifySessionStarted/notifyLaunchFailed move starting rows to running/
    // failed with the session backfill) and approval-bridge request arrivals
    // (receiveApproval inserts the pending row + flips the dispatch awaiting;
    // the T2 tool-bridge pump in the client half maps approval_receive frames
    // here). Same { code, message, detail? } rejection envelope (ERR_DISPATCH_*
    // / ERR_APPROVAL_*).
    receiveApproval: (input: ReceiveApprovalVerbInput): Promise<ApprovalRow> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.receiveApproval, input) as Promise<ApprovalRow>,
    notifySessionStarted: (dispatchId: string, sessionId: string): Promise<DispatchRow> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.notifySessionStarted, dispatchId, sessionId) as Promise<DispatchRow>,
    notifyLaunchFailed: (dispatchId: string, error: string): Promise<DispatchRow> =>
      ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.notifyLaunchFailed, dispatchId, error) as Promise<DispatchRow>,
    // Single-subscriber event verb: batches of WorkbenchEvent pushed by the
    // main process through the 2.6 coalescing batcher (≤500ms). Subscribing
    // registers the renderer with the main-side subscription registry; the
    // returned unsubscriber removes the listener AND deregisters — a destroyed
    // renderer is deregistered main-side via the webContents destroyed hook.
    onEvents: (callback: (events: readonly WorkbenchEvent[]) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, events: readonly WorkbenchEvent[]): void => {
        callback(events)
      }
      ipcRenderer.on(WORKBENCH_EVENT_CHANNEL, listener)
      void ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.subscribeEvents)
      return () => {
        ipcRenderer.removeListener(WORKBENCH_EVENT_CHANNEL, listener)
        void ipcRenderer.invoke(WORKBENCH_VERB_CHANNELS.unsubscribeEvents)
      }
    },
  },
})

