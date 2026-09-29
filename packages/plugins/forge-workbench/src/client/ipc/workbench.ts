/**
 * The Interface 1 IPC adapter, client half (task 5.16 — the FIRST real-IPC
 * assembly: 5.14 overview and 5.15 task board reuse this pattern verbatim):
 *
 *   1. BRIDGE READ — `getWorkbenchIpcBridge()` reads the preload namespace
 *      `window.dshForge.workbench` (task 2.7's contextBridge verbs; one verb
 *      per whitelisted channel). The read is GUARDED: hostless environments
 *      (jsdom unit mounts, tests, the fallback-rail world before the shell
 *      exists) have no `dshForge` — the resolver answers undefined and the
 *      views keep their build-stage defaults instead of throwing at import
 *      time. A bridge counts as present only when EVERY declared member is a
 *      callable (a partial bridge degrades to absent — one rule, no
 *      per-verb presence checks scattered through the views).
 *
 *   2. FACE→VERB MAPPING — one factory per contract.ts face, each member
 *      mirroring its §Interface 1 verb one-to-one with the QUALIFIED argument
 *      order verbatim (getFeatureBoard(projectId), readFeatureDoc(projectId,
 *      featureSlug, kind)). No batching, no caching here — page-session
 *      caches belong to the views' stores (store/feature-board.ts,
 *      store/workbench-state.ts).
 *
 *   3. ERROR NORMALIZATION — main-side verb rejections arrive as an Error
 *      whose `.message` is the serialized `{ code, message, detail? }`
 *      envelope (handlers.ts WorkbenchIpcError; tech-design §Error Handling)
 *      — over REAL ipcMain.handle, Electron prefixes that message
 *      (`Error invoking remote method '<channel>': …`), leaving the envelope
 *      as a trailing substring. `normalizeWorkbenchVerbError` folds every
 *      rejection (either form) into the plain {@link WorkbenchVerbError}
 *      shape the build-stage mocks already throw, so a view's code mapping
 *      (i18n/errors.ts routing, the ERR_SNAPSHOT_STALE branch) is
 *      form-agnostic from day one. Unknown shapes fall to the spec's
 *      ERR_WORKBENCH_DB 兜底 (Propagation Strategy: unclassified → generic
 *      error card).
 */
import type {
  ApprovalRow, DecideApprovalInput, DispatchRow, DispatchTasksInput, DispatchTasksResult,
  DetectReport, DocKind, FeatureBoardData, FeatureDoc,
  FeatureListEntry, FeatureStatusReport,
  KnowledgeFactEntry, KnowledgeFactInput, KnowledgeFactListResult, KnowledgeFactSummaryResult,
  KnowledgeForensicInput, KnowledgeForensicResult, KnowledgeLesson, KnowledgeLessonInput,
  KnowledgeLessonListResult, KnowledgeResearchInput, KnowledgeResearchListResult,
  KnowledgeResearchReport, MigrationStarted, MigrationStatus, PluginRow, PrefEntry, PrefRow,
  PrefScope, ProbeProjectPathInput, Project, ProjectionState, ProjectionStatusRow,
  ProjectRefInput, ProposalBoardData, ProposalDoc,
  ReceiveApprovalInput, RenameProjectInput, ReportProjectionOutcomeInput,
  RetryProjectionInput, SubmitWorkspaceSnapshotInput, GetProjectionStatusInput,
  StageArtifactsReport, FeatureSummary,
  StageAssetRow, StageGateInfo, StageSummarizeInput, StageSummarizeResult,
  ProjectPatch, RecordSessionLinkInput, RegisterProjectInput, RegisterProjectInputV2, SessionLink,
  TaskActor, TaskAddInput,
  TaskBoardData, TaskClaimInput, TaskDetail, TaskGetInput, TaskQueryInput, TaskReopenInput,
  TaskSubmitInput, TaskSummary, TaskTransitionInput, WorkbenchEvent, WorkbenchPaths,
  WorkbenchState, WorkbenchVerbError,
} from '../ipc-types'
import type {
  CodeRootProbeResult, DispatchFace, FeatureBoardFace, FeatureDocFace, MigrationFace, OverviewFace,
  PluginFace, ProposalFace, RegisterWizardFace, StageFace, TaskBoardFace, TaskDetailFace,
} from '../contract'
import type { ConfirmCardFace } from '../components/confirm-card/card-state'
import { getWorkbenchEventSource } from './workbench-events'
import { dispatchLaunchRelayOf } from './dispatch-relay'
import { approvalAnswerRelayOf } from './approval-answer'

/**
 * The preload namespace surface (task 2.7): the 13 data verbs + the
 * single-subscriber event verb. The client DTOs are structural twins of the
 * main-side types (both halves derive from tech-design §Interface 1), so the
 * declaration is local — the plugin cannot depend on the app (4.1 precedent).
 */
export interface WorkbenchIpcBridge {
  getState(): Promise<WorkbenchState>
  registerProject(input: RegisterProjectInput): Promise<Project>
  updateProject(id: string, patch: ProjectPatch): Promise<Project>
  removeProject(id: string): Promise<void>
  activateProject(id: string): Promise<void>
  getTaskBoard(projectId: string): Promise<TaskBoardData>
  getTaskDetail(projectId: string, taskKey: string): Promise<TaskDetail>
  getFeatureBoard(projectId: string): Promise<FeatureBoardData>
  readFeatureDoc(projectId: string, featureSlug: string, kind: DocKind): Promise<FeatureDoc>
  listPlugins(): Promise<PluginRow[]>
  setPluginEnabled(name: string, enabled: boolean): Promise<PluginRow[]>
  recordSessionLink(input: RecordSessionLinkInput): Promise<SessionLink>
  endSessionLink(linkId: string): Promise<void>
  /**
   * 6.4: the wizard step-② explicit authorization record — the persisted
   * external-doc-path consent the register/repoint validation chain reads
   * (registry/authorize.ts's single write path over IPC; zero fs probing).
   */
  authorizeExternalDocPath(path: string): Promise<void>
  /** Batched push (≤500ms main-side); returns the unsubscribe. */
  onEvents(callback: (events: readonly WorkbenchEvent[]) => void): () => void
  /** M3 migration pair (task 1.4 main-side; the 1.7 client wiring). */
  getMigrationStatus(projectId: string): Promise<MigrationStatus>
  startMigration(projectId: string): Promise<MigrationStarted>
  /** M3 UF3 integration reads (task 1.7): the wizard's real probe + kernel paths. */
  probeCodeRoot(input: { codeRoot: string; docLocationPath?: string | null }): Promise<CodeRootProbeResult>
  getWorkbenchPaths(): Promise<WorkbenchPaths>
  /**
   * M3 task verbs (task 2.1 appending; preload/main sides landed with 1.3):
   * the write-set five carry the actor string (`session:<id>` — kernel
   * records it as updated_by on every write) and the read two route by the
   * project's data_authority. Rejections arrive as the same
   * `{ code, message, detail? }` envelope (ERR_TASK_*).
   */
  taskAdd(input: TaskAddInput, actor: TaskActor): Promise<TaskSummary>
  taskClaim(input: TaskClaimInput, actor: TaskActor): Promise<TaskSummary>
  taskTransition(input: TaskTransitionInput, actor: TaskActor): Promise<TaskSummary>
  taskSubmit(input: TaskSubmitInput, actor: TaskActor): Promise<TaskSummary>
  taskReopen(input: TaskReopenInput, actor: TaskActor): Promise<TaskSummary>
  taskGet(input: TaskGetInput): Promise<TaskDetail>
  taskQuery(input: TaskQueryInput): Promise<TaskSummary[]>
  /**
   * M3 knowledge + feature-read verbs (task 2.2, D4): action-dispatched data
   * planes over the registered project's doc root (fact/lesson/research read +
   * append-only write; forensic machine-global read-only — no projectId;
   * feature list/status read). Business rejections arrive as the same
   * `{ code, message, detail? }` envelope (ERR_PROJECT_NOT_FOUND /
   * ERR_KNOWLEDGE_* / ERR_FORENSIC_SOURCE_UNREADABLE / ERR_FEATURE_NOT_FOUND).
   */
  knowledgeFact(input: KnowledgeFactInput): Promise<KnowledgeFactListResult | KnowledgeFactEntry | KnowledgeFactSummaryResult>
  knowledgeLesson(input: KnowledgeLessonInput): Promise<KnowledgeLessonListResult | KnowledgeLesson>
  knowledgeResearch(input: KnowledgeResearchInput): Promise<KnowledgeResearchListResult | KnowledgeResearchReport>
  knowledgeForensic(input: KnowledgeForensicInput): Promise<KnowledgeForensicResult>
  featureList(projectId: string): Promise<FeatureListEntry[]>
  featureStatus(input: { projectId: string; featureSlug: string }): Promise<FeatureStatusReport>
  /**
   * M3 prefs verbs (task 3.1): the three-tier preference family over the
   * closed forge pref registry (auto / worktree / coverage / eval groups,
   * surfaces excluded). getPrefs answers every registered key with its
   * effective value + source tier + type metadata; setPrefs is atomic
   * (ERR_PREF_KEY_UNKNOWN / ERR_PREF_VALUE_INVALID rejections ride the same
   * `{ code, message, detail? }` envelope); clearPrefOverride falls the
   * effective value back to the next tier.
   */
  getPrefs(scope: PrefScope): Promise<PrefRow[]>
  setPrefs(scope: PrefScope, entries: readonly PrefEntry[]): Promise<void>
  clearPrefOverride(scope: PrefScope, key: string): Promise<void>
  /**
   * M3 dispatch host-callback relay verbs (task 3.5): the renderer forwards
   * these ON BEHALF of the plugin host half — the approval-bridge's request
   * arrivals (receiveApproval: pending insert + awaiting flip; the tool-bridge
   * pump maps approval_receive frames here and approval_decide to
   * decideApproval for the cancelled核销 leg) and dispatch-launch's outcome
   * backfill (notifySessionStarted/notifyLaunchFailed move starting rows to
   * running/failed). Rejections ride the same `{ code, message, detail? }`
   * envelope (ERR_DISPATCH_* / ERR_APPROVAL_*).
   */
  receiveApproval(input: ReceiveApprovalInput): Promise<ApprovalRow>
  decideApproval(input: DecideApprovalInput, actor: string): Promise<ApprovalRow>
  notifySessionStarted(dispatchId: string, sessionId: string): Promise<DispatchRow>
  notifyLaunchFailed(dispatchId: string, error: string): Promise<DispatchRow>
  /**
   * M3 UF1 human-side orchestration verbs (task 3.9 wiring; the preload
   * surface carries them since 3.3): the dispatch chain (checkStageArtifacts
   * / dispatchTasks / redispatch — actor = the dispatching human's audit
   * string) and the board/dock reads (getDispatches / listApprovals).
   * decideApproval above is the family's sixth member (shared with the 3.5
   * relay face). Rejections ride the same `{ code, message, detail? }`
   * envelope (ERR_TASK_* / ERR_STAGE_* / ERR_DISPATCH_* / ERR_APPROVAL_*).
   */
  checkStageArtifacts(input: { projectId: string; featureSlug: string }): Promise<StageArtifactsReport>
  dispatchTasks(input: DispatchTasksInput, actor: string): Promise<DispatchTasksResult>
  redispatch(dispatchId: string, actor: string): Promise<DispatchTasksResult>
  getDispatches(projectId: string): Promise<DispatchRow[]>
  listApprovals(projectId: string): Promise<ApprovalRow[]>
  /**
   * M3 stages write verbs (task 4.1, tech-design §Interface 5): advanceStage
   * is the advance gate — unsatisfied (current stage summary missing) →
   * ERR_STAGE_GATE_UNSATISFIED with guidance; satisfied → the kernel writes
   * the manifest status (stage advance internalized), syncs the feature
   * snapshot and pushes stage_advanced. stageSummarize is the
   * forge.stage.summarize kernel write face ((over)writes
   * stages/<stage>.md + syncs the stage_asset index). Rejections ride the
   * same `{ code, message, detail? }` envelope (ERR_STAGE_* /
   * ERR_FEATURE_NOT_FOUND / ERR_PROJECT_NOT_FOUND).
   */
  advanceStage(projectId: string, featureSlug: string): Promise<FeatureSummary>
  stageSummarize(input: StageSummarizeInput): Promise<StageSummarizeResult>
  /**
   * M3 stages read verbs (task 4.3's client wiring; the preload surface has
   * carried them since 3.2/4.1): getStageGate answers the UF2 stepper's gate
   * verdict + the content-joined assets list; listStageAssets answers the
   * sixth 「阶段资产」 tab's rows (pipeline order). Rejections ride the same
   * `{ code, message, detail? }` envelope (ERR_PROJECT_NOT_FOUND /
   * ERR_FEATURE_NOT_FOUND).
   */
  getStageGate(projectId: string, featureSlug: string): Promise<StageGateInfo>
  listStageAssets(projectId: string, featureSlug: string): Promise<StageAssetRow[]>
  /**
   * M3 proposals read verbs (task 5.3, UF5 data plane): getProposalBoard
   * answers the read-only proposal board (derived proposal_snapshot rows in
   * the created-descending baseline order with the live-joined hasEval flag
   * and the proposals root for the empty-state path hint); readProposalDoc
   * answers the raw markdown of proposals/<slug>/proposal.md (kind
   * 'proposal') or the deterministic eval-report pick (kind 'eval' —
   * final-report.md preferred, lexicographic fallback). Rejections ride the
   * same `{ code, message, detail? }` envelope (ERR_PROJECT_NOT_FOUND /
   * ERR_PROPOSAL_PATH_INVALID / ERR_PROPOSAL_NOT_FOUND).
   */
  getProposalBoard(projectId: string): Promise<ProposalBoardData>
  readProposalDoc(input: { projectId: string; slug: string; kind: 'proposal' | 'eval' }): Promise<ProposalDoc>
  /**
   * M4 v3 project-center verbs (task 1.3): probeProjectPath answers the C7
   * detection report (D11 identity + registered fast lane + bounded evidence
   * probes — read-only); the lifecycle four carry the v3 columns
   * (archived / sortOrder / projectionState / docsPlacement). registerProject
   * above additionally accepts the v2 input ({ anchor, docsPlacement, … }).
   * Rejections ride the same `{ code, message, detail? }` envelope
   * (ERR_PROJECT_EXISTS with the registered fast-lane payload in detail /
   * ERR_CODE_ROOT_UNREADABLE / ERR_EXTERNAL_PATH_UNREADABLE /
   * ERR_PROJECT_NOT_FOUND); mutations push project_list_changed (and the
   * projection_push_required placeholder) through onEvents.
   */
  probeProjectPath(input: ProbeProjectPathInput): Promise<DetectReport>
  renameProject(input: RenameProjectInput): Promise<Project>
  archiveProject(input: ProjectRefInput): Promise<Project>
  restoreProject(input: ProjectRefInput): Promise<Project>
  listProjects(): Promise<Project[]>
  /**
   * M4 v3 projection verbs (task 3.2): the reconcile service's verb face —
   * consumed by the projection relay (3.3: the snapshot follow-flow reports
   * here and backfills outcomes; it consumes projection_push_required through
   * onEvents) and the projection status surface (3.5). retryProjection
   * re-pushes the idempotent self-contained plan; getProjectionStatus answers
   * the state rows with live-materialized deviation detail; neither verb
   * rejects on projection failure (only ERR_PROJECT_NOT_FOUND / shape
   * violations — Propagation Strategy).
   */
  retryProjection(input: RetryProjectionInput): Promise<{ state: ProjectionState }>
  getProjectionStatus(input?: GetProjectionStatusInput): Promise<ProjectionStatusRow[]>
  submitWorkspaceSnapshot(input: SubmitWorkspaceSnapshotInput): Promise<void>
  reportProjectionOutcome(input: ReportProjectionOutcomeInput): Promise<void>
}

/** Every member the presence check walks (keep in lockstep with the interface). */
const BRIDGE_MEMBERS: readonly (keyof WorkbenchIpcBridge)[] = [
  'getState', 'registerProject', 'updateProject', 'removeProject', 'activateProject',
  'getTaskBoard', 'getTaskDetail', 'getFeatureBoard', 'readFeatureDoc',
  'listPlugins', 'setPluginEnabled', 'recordSessionLink', 'endSessionLink',
  'authorizeExternalDocPath', 'onEvents',
  'getMigrationStatus', 'startMigration', 'probeCodeRoot', 'getWorkbenchPaths',
  // M3 task verbs (task 2.1): the preload surface carries them since 1.3.
  'taskAdd', 'taskClaim', 'taskTransition', 'taskSubmit', 'taskReopen', 'taskGet', 'taskQuery',
  // M3 knowledge + feature-read verbs (task 2.2, D4).
  'knowledgeFact', 'knowledgeLesson', 'knowledgeResearch', 'knowledgeForensic', 'featureList', 'featureStatus',
  // M3 prefs verbs (task 3.1).
  'getPrefs', 'setPrefs', 'clearPrefOverride',
  // M3 dispatch host-callback relay verbs (task 3.5).
  'receiveApproval', 'decideApproval', 'notifySessionStarted', 'notifyLaunchFailed',
  // M3 UF1 human-side orchestration verbs (task 3.9; preload surface since 3.3).
  'checkStageArtifacts', 'dispatchTasks', 'redispatch', 'getDispatches', 'listApprovals',
  // M3 stages write verbs (task 4.1).
  'advanceStage', 'stageSummarize',
  // M3 stages read verbs (task 4.3; preload surface since 3.2/4.1).
  'getStageGate', 'listStageAssets',
  // M3 proposals read verbs (task 5.3; the tool-bridge pump's proposal legs
  // dispatch here; the UF5 client face lands with 5.4).
  'getProposalBoard', 'readProposalDoc',
  // M4 v3 project-center verbs (task 1.3; C7 card / project tree consume in 2.x).
  'probeProjectPath', 'renameProject', 'archiveProject', 'restoreProject', 'listProjects',
  // M4 v3 projection verbs (task 3.2; the 3.3 relay + 3.5 status surface
  // consume them — the presence check stays whole-surface per the one rule).
  'retryProjection', 'getProjectionStatus', 'submitWorkspaceSnapshot', 'reportProjectionOutcome',
]

/**
 * The guarded preload read. Answers the bridge only when the whole verb
 * surface is callable; undefined in hostless environments — callers then keep
 * their build-stage defaults (the views never throw on a missing host).
 */
export function getWorkbenchIpcBridge(): WorkbenchIpcBridge | undefined {
  let candidate: unknown
  try {
    candidate = (globalThis as { dshForge?: { workbench?: unknown } }).dshForge?.workbench
  } catch {
    return undefined // sandboxed globals can throw on property reads
  }
  if (candidate === null || typeof candidate !== 'object') return undefined
  const bridge = candidate as Record<string, unknown>
  return BRIDGE_MEMBERS.every(member => typeof bridge[member] === 'function')
    ? (candidate as WorkbenchIpcBridge)
    : undefined
}

/**
 * The throwing twin for call sites that REQUIRE a host (explicit error over
 * silent mocks — the dispatcher's hostless guard). Assembly views use the
 * undefined-returning {@link getWorkbenchIpcBridge} instead.
 */
export function requireWorkbenchIpcBridge(): WorkbenchIpcBridge {
  const bridge = getWorkbenchIpcBridge()
  if (bridge === undefined) {
    throw new Error('dshForge.workbench IPC bridge is unavailable (hostless environment?)')
  }
  return bridge
}

/** Is the value shaped like the serialized error envelope? */
function asEnvelope(value: unknown): WorkbenchVerbError | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const { code, message, detail } = value as { code?: unknown; message?: unknown; detail?: unknown }
  if (typeof code !== 'string' || code === '' || typeof message !== 'string') return undefined
  return detail === undefined ? { code, message } : { code, message, detail: String(detail) }
}

/**
 * Fold any verb rejection into the plain {@link WorkbenchVerbError} shape:
 *   ① the plain-object form the build-stage mocks throw (passthrough);
 *   ② the IPC form — an Error whose `.message` is the envelope JSON
 *      (handlers.ts serializes on purpose so the renderer can parse back);
 *   ③ the REAL-ipcMain.handle form (fix-1 defect C): Electron re-wraps every
 *      `ipcMain.handle` rejection renderer-side as
 *      `Error invoking remote method '<channel>': WorkbenchIpcError: {json}`
 *      — the envelope survives only as a TRAILING substring of the message,
 *      so the strict ② parse always throws and every code-keyed renderer
 *      branch (ERR_PROJECT_EXISTS / ERR_SNAPSHOT_STALE / …) degraded to the
 *      ERR_WORKBENCH_DB 兜底 over the real chain. Scan each `{` for a
 *      message SUFFIX that parses into an envelope: the envelope is the
 *      message's last JSON value, so only its own opening brace can
 *      whole-parse — earlier braces run into the trailing text and fail.
 *   ④ anything else → the spec's ERR_WORKBENCH_DB 兜底.
 */
export function normalizeWorkbenchVerbError(error: unknown): WorkbenchVerbError {
  const plain = asEnvelope(error)
  if (plain !== undefined) return plain
  if (error instanceof Error) {
    try {
      const parsed = asEnvelope(JSON.parse(error.message))
      if (parsed !== undefined) return parsed
    } catch {
      // Not a whole-message envelope — the trailing-substring leg below.
    }
    for (
      let at = error.message.indexOf('{')
      ; at !== -1
      ; at = error.message.indexOf('{', at + 1)
    ) {
      try {
        const parsed = asEnvelope(JSON.parse(error.message.slice(at)))
        if (parsed !== undefined) return parsed
      } catch {
        // Not this candidate `{` — keep scanning toward the envelope.
      }
    }
  }
  return {
    code: 'ERR_WORKBENCH_DB',
    message: error instanceof Error ? error.message : String(error),
  }
}

/** Normalize a rejection by re-throwing it (the face wrappers' catch leg). */
function renormalize(error: unknown): never {
  throw normalizeWorkbenchVerbError(error)
}

/**
 * The UF3 migration family's face over the verbs (task 1.7's assembly): the
 * Interface 1 migration pair 1:1 (rejections normalized), the event channel
 * through the SAME shared single-subscriber source every listening family
 * multiplexes over, and the kernel-paths read. `loadGuard` is the
 * never-blocked stub the 1.6 build stage ran — the real dispatch-domain read
 * (dispatch.ended_at IS NULL) lands with the 3.x verbs; until then the
 * kernel's own ERR_MIGRATION_GUARD rejection remains the hard gate and the
 * entry-guard hook merely renders an always-eligible entry.
 */
export function createIpcMigrationFace(bridge: WorkbenchIpcBridge): MigrationFace {
  return {
    getMigrationStatus: async (projectId: string): Promise<MigrationStatus> => {
      try {
        return await bridge.getMigrationStatus(projectId)
      } catch (error) {
        renormalize(error)
      }
    },
    startMigration: async (projectId: string): Promise<MigrationStarted> => {
      try {
        return await bridge.startMigration(projectId)
      } catch (error) {
        renormalize(error)
      }
    },
    subscribeEvents: (callback: (events: readonly WorkbenchEvent[]) => void): (() => void) =>
      getWorkbenchEventSource(bridge).subscribe(callback),
    loadGuard: async () => ({ blocked: false, runningCount: 0 }),
    getWorkbenchPaths: async (): Promise<WorkbenchPaths> => {
      try {
        return await bridge.getWorkbenchPaths()
      } catch (error) {
        renormalize(error)
      }
    },
  }
}

/** The UF4 board face over the verb (task 5.16's consumption; 1:1 mapping). */
export function createIpcFeatureBoardFace(bridge: WorkbenchIpcBridge): FeatureBoardFace {
  return {
    loadFeatureBoard: async (projectId: string): Promise<FeatureBoardData> => {
      try {
        return await bridge.getFeatureBoard(projectId)
      } catch (error) {
        renormalize(error)
      }
    },
  }
}

/** The UF4 doc face over the verb (task 5.16's consumption; 1:1 mapping). */
export function createIpcFeatureDocFace(bridge: WorkbenchIpcBridge): FeatureDocFace {
  return {
    readFeatureDoc: async (
      projectId: string,
      featureSlug: string,
      kind: DocKind,
    ): Promise<FeatureDoc> => {
      try {
        return await bridge.readFeatureDoc(projectId, featureSlug, kind)
      } catch (error) {
        renormalize(error)
      }
    },
  }
}

/** The UF1 overview face over the verbs (task 5.14's consumption; 1:1 mapping). */
export function createIpcOverviewFace(bridge: WorkbenchIpcBridge): OverviewFace {
  return {
    loadState: async (): Promise<WorkbenchState> => {
      try {
        return await bridge.getState()
      } catch (error) {
        renormalize(error)
      }
    },
    activateProject: async (id: string): Promise<void> => {
      try {
        await bridge.activateProject(id)
      } catch (error) {
        renormalize(error)
      }
    },
    updateProject: async (id: string, patch: ProjectPatch): Promise<Project> => {
      try {
        return await bridge.updateProject(id, patch)
      } catch (error) {
        renormalize(error)
      }
    },
    removeProject: async (id: string): Promise<void> => {
      try {
        await bridge.removeProject(id)
      } catch (error) {
        renormalize(error)
      }
    },
  }
}

/** The UF6 plugin-section face over the verbs (task 5.14's consumption; 1:1 mapping). */
export function createIpcPluginFace(bridge: WorkbenchIpcBridge): PluginFace {
  return {
    listPlugins: async (): Promise<PluginRow[]> => {
      try {
        return await bridge.listPlugins()
      } catch (error) {
        renormalize(error)
      }
    },
    setPluginEnabled: async (name: string, enabled: boolean): Promise<PluginRow[]> => {
      try {
        return await bridge.setPluginEnabled(name, enabled)
      } catch (error) {
        renormalize(error)
      }
    },
  }
}

/**
 * The UF2 board face over the verbs (task 5.15's consumption): loadBoard is
 * the raw 1:1 verb mapping (the task-board STORE wraps it with the
 * read-through/serve semantics the page consumes — store/task-board.ts),
 * while subscribeEvents routes through the SINGLE-SUBSCRIBER shared channel
 * (workbench-events.ts) so the page's presentation leg (row highlights +
 * aria-live) and the store's data-merge leg multiplex over ONE preload
 * subscription instead of competing for the verb.
 */
export function createIpcTaskBoardFace(bridge: WorkbenchIpcBridge): TaskBoardFace {
  return {
    loadBoard: async (projectId: string): Promise<TaskBoardData> => {
      try {
        return await bridge.getTaskBoard(projectId)
      } catch (error) {
        renormalize(error)
      }
    },
    subscribeEvents: (callback: (events: readonly WorkbenchEvent[]) => void): (() => void) =>
      getWorkbenchEventSource(bridge).subscribe(callback),
  }
}

/** The UF3 detail-dock face over the verb (task 5.15's consumption; 1:1 mapping). */
export function createIpcTaskDetailFace(bridge: WorkbenchIpcBridge): TaskDetailFace {
  return {
    loadDetail: async (projectId: string, taskKey: string): Promise<TaskDetail> => {
      try {
        return await bridge.getTaskDetail(projectId, taskKey)
      } catch (error) {
        renormalize(error)
      }
    },
  }
}

/**
 * 任务 6.3(SC1):dispatched 应答的 relay 过腿 —— installed launch relay
 * 在场即转交(relay 缺席 = 行留 starting,内核既定语义,不抛错)。
 */
function relayDispatchResult(result: DispatchTasksResult): void {
  if (!('dispatched' in result)) return // blocked:零落行,无 relay 面
  dispatchLaunchRelayOf()?.relayDispatched(result.dispatched)
}

/**
 * The UF1 orchestration face over the verbs (task 3.9's assembly leg; 1:1
 * mapping with error renormalization). The dispatch/approval chains consume
 * the rejections through their own normalizeWorkbenchVerbError folds, so the
 * envelope is re-serialized here into the plain shape every face member
 * answers (the ERROR NORMALIZATION contract above).
 *
 * 任务 6.3(SC1):dispatched 应答经 renderer launch relay 转交 host
 * dispatch-launch(两段式派发链的第二段;relay 缺席 = 行留 starting,内核
 * 既定语义)。本面是看板全部派发链(工具栏多选 + 详情单任务)的单一过点。
 */
export function createIpcDispatchFace(bridge: WorkbenchIpcBridge): DispatchFace {
  return {
    checkStageArtifacts: async (input: { projectId: string; featureSlug: string }): Promise<StageArtifactsReport> => {
      try {
        return await bridge.checkStageArtifacts(input)
      } catch (error) {
        renormalize(error)
      }
    },
    dispatchTasks: async (input: DispatchTasksInput, actor: string): Promise<DispatchTasksResult> => {
      try {
        const result = await bridge.dispatchTasks(input, actor)
        relayDispatchResult(result)
        return result
      } catch (error) {
        renormalize(error)
      }
    },
    redispatch: async (dispatchId: string, actor: string): Promise<DispatchTasksResult> => {
      try {
        const result = await bridge.redispatch(dispatchId, actor)
        relayDispatchResult(result)
        return result
      } catch (error) {
        renormalize(error)
      }
    },
    getDispatches: async (projectId: string): Promise<DispatchRow[]> => {
      try {
        return await bridge.getDispatches(projectId)
      } catch (error) {
        renormalize(error)
      }
    },
    listApprovals: async (projectId: string): Promise<ApprovalRow[]> => {
      try {
        return await bridge.listApprovals(projectId)
      } catch (error) {
        renormalize(error)
      }
    },
    decideApproval: async (input: DecideApprovalInput, actor: string): Promise<ApprovalRow> => {
      try {
        const row = await bridge.decideApproval(input, actor)
        // 任务 6.5(SC3):决策送达腿 —— 内核行已决(权威事实)后,把
        // (approvalId, approve) 对经 host 桥 settle 回注 subagent 的 pending
        // 工具调用(spike-2 §1.3 ③)。fire-and-forget:送达失败不改写已决
        // 事实,不上抛(桥核晚到/重复 settle 幂等)。
        approvalAnswerRelayOf()?.answerDecision(input.approvalId, input.approve)
        return row
      } catch (error) {
        renormalize(error)
      }
    },
  }
}

/**
 * The UF2 stage face over the verbs (task 4.3's assembly leg; 1:1 mapping
 * with error renormalization, the dispatch-face discipline). advanceStage
 * rejections reach the components through their own normalizeWorkbenchVerbError
 * folds, so the ERR_STAGE_GATE_UNSATISFIED guidance leg runs against the same
 * envelope shape the build-stage mock twin throws; subscribeEvents routes
 * through the SINGLE-SUBSCRIBER shared channel (workbench-events.ts) so the
 * stage_advanced reflux multiplexes over ONE preload subscription.
 */
export function createIpcStageFace(bridge: WorkbenchIpcBridge): StageFace {
  return {
    getStageGate: async (projectId: string, featureSlug: string): Promise<StageGateInfo> => {
      try {
        return await bridge.getStageGate(projectId, featureSlug)
      } catch (error) {
        renormalize(error)
      }
    },
    listStageAssets: async (projectId: string, featureSlug: string): Promise<StageAssetRow[]> => {
      try {
        return await bridge.listStageAssets(projectId, featureSlug)
      } catch (error) {
        renormalize(error)
      }
    },
    advanceStage: async (projectId: string, featureSlug: string): Promise<FeatureSummary> => {
      try {
        return await bridge.advanceStage(projectId, featureSlug)
      } catch (error) {
        renormalize(error)
      }
    },
    subscribeEvents: (callback: (events: readonly WorkbenchEvent[]) => void): (() => void) =>
      getWorkbenchEventSource(bridge).subscribe(callback),
  }
}

/**
 * The UF5 proposals face over the verbs (task 5.4's assembly leg, the
 * stage-face discipline): the Interface 1 read pair 1:1 with error
 * renormalization, and the reflux through the SINGLE-SUBSCRIBER shared
 * channel — the proposals board rides the project-scoped `sync` pushes
 * (every scan completion; proposals/ joined the watched roots with 5.3), so
 * the ≤5s reflux multiplexes over ONE preload subscription like every other
 * listening family. The 5.3 verb comment marks this face as 5.4's landing.
 */
export function createIpcProposalFace(bridge: WorkbenchIpcBridge): ProposalFace {
  return {
    loadBoard: async (projectId: string): Promise<ProposalBoardData> => {
      try {
        return await bridge.getProposalBoard(projectId)
      } catch (error) {
        renormalize(error)
      }
    },
    readProposalDoc: async (input: { projectId: string; slug: string; kind: 'proposal' | 'eval' }): Promise<ProposalDoc> => {
      try {
        return await bridge.readProposalDoc(input)
      } catch (error) {
        renormalize(error)
      }
    },
    subscribeEvents: (callback: (events: readonly WorkbenchEvent[]) => void): (() => void) =>
      getWorkbenchEventSource(bridge).subscribe(callback),
  }
}

/**
 * The register wizard's IPC face slice (task 5.14; 6.4 adds the authorization
 * member; 1.7 adds the REAL probe) — registerProject / updateProject /
 * authorizeExternalDocPath / probeCodeRoot. The probe gained a verb in 1.7
 * because the CONDITIONAL migration step's premise must be real on the real
 * chain (a permissive mock would offer the step for every registration);
 * probeExternalPath keeps the build-stage twin (permissive — the real
 * validation is the submit-time main-side chain whose ERR_* rejections land
 * in the wizard's centralized i18n/errors.ts mapping). Returned as a
 * Partial-compatible slice: the shell hands it to the wizard's face seam,
 * which spreads it over the mock twin.
 */
export function createIpcRegisterWizardVerbs(
  bridge: WorkbenchIpcBridge,
): Pick<RegisterWizardFace, 'registerProject' | 'updateProject' | 'authorizeExternalDocPath' | 'probeCodeRoot'> {
  return {
    probeCodeRoot: async (input: { codeRoot: string; docLocationPath?: string | null }): Promise<CodeRootProbeResult> => {
      try {
        return await bridge.probeCodeRoot(input)
      } catch (error) {
        renormalize(error)
      }
    },
    registerProject: async (input: RegisterProjectInput): Promise<Project> => {
      try {
        return await bridge.registerProject(input)
      } catch (error) {
        renormalize(error)
      }
    },
    updateProject: async (id: string, patch: ProjectPatch): Promise<Project> => {
      try {
        return await bridge.updateProject(id, patch)
      } catch (error) {
        renormalize(error)
      }
    },
    authorizeExternalDocPath: async (path: string): Promise<void> => {
      try {
        await bridge.authorizeExternalDocPath(path)
      } catch (error) {
        renormalize(error)
      }
    },
  }
}

/**
 * The C7 confirm card's IPC face (M4 task 1.6 — the 1.5 build stage's real
 * chain): probeProjectPath (the D11 detection report) + registerProject (the
 * v2 face — the card's single write) + authorizeExternalDocPath (the 仓外自
 * 定义 explicit-authorization record, BIZ-001/003 收窄). Every member mirrors
 * its §Interface 1 v3 verb one-to-one with rejections renormalized to the
 * serialized {@link WorkbenchVerbError} shape (ERR_PROJECT_EXISTS with the
 * registered fast-lane payload / ERR_CODE_ROOT_UNREADABLE /
 * ERR_EXTERNAL_PATH_UNREADABLE), so the card's state machine runs against the
 * real codes from day one.
 */
export function createIpcConfirmCardFace(bridge: WorkbenchIpcBridge): ConfirmCardFace {
  return {
    probeProjectPath: async (input: ProbeProjectPathInput): Promise<DetectReport> => {
      try {
        return await bridge.probeProjectPath(input)
      } catch (error) {
        renormalize(error)
      }
    },
    registerProject: async (input: RegisterProjectInputV2): Promise<Project> => {
      try {
        // The v2 face rides the same dual-shaped verb channel main-side
        // ('anchor' in input routes to the D11 lifecycle chain).
        return await bridge.registerProject(input)
      } catch (error) {
        renormalize(error)
      }
    },
    authorizeExternalDocPath: async (path: string): Promise<void> => {
      try {
        await bridge.authorizeExternalDocPath(path)
      } catch (error) {
        renormalize(error)
      }
    },
  }
}
