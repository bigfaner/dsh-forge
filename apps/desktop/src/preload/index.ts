import { contextBridge, ipcRenderer } from 'electron'
import type { RecoveryState } from '../main/crash-recovery/index.ts'
// Preload-local copy of the workbench channel table — the sandboxed preload
// cannot require relative bundle chunks, so it must not share modules with the
// main bundle (see ./channel-allowlist.ts header; sync locked by tests).
import { WORKBENCH_EVENT_CHANNEL, WORKBENCH_VERB_CHANNELS } from './channel-allowlist.ts'
import type {
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
  PrefRow,
  PrefScope,
  ProbeCodeRootInput,
  ProbeCodeRootResult,
  Project,
  RecordSessionLinkInput,
  RegisterProjectInput,
  SessionLink,
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

