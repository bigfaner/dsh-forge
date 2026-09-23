// preload/channel-allowlist — the preload-side copy of the dshForge.workbench
// verb channel table (source of truth: src/main/workbench/ipc/channel-allowlist.ts).
//
// WHY a copy instead of an import: the sandboxed preload runs under Electron's
// polyfilled require, which cannot load relative bundle chunks — any module the
// preload shares with the main bundle gets split into a sibling chunk by the
// vite lib build and the preload dies at load ("module not found:
// ./channel-allowlist-*.cjs", first exposed by the first dist rebuild after
// 1ff9cdd). The preload must stay a single self-contained file, so its channel
// table lives here and drift is locked by tests/workbench-ipc.spec.ts, which
// asserts both copies stay deep-equal (plus a built-artifact self-containment
// check on dist/preload.cjs).
//
// Keep this file in lockstep with the main-side table: same keys, same channel
// strings, no additions on either side alone.

/** The complete workbench verb whitelist (preload copy — see module header). */
export const WORKBENCH_VERB_CHANNELS = {
  getState: 'dsh-forge:workbench-get-state',
  registerProject: 'dsh-forge:workbench-register-project',
  updateProject: 'dsh-forge:workbench-update-project',
  removeProject: 'dsh-forge:workbench-remove-project',
  activateProject: 'dsh-forge:workbench-activate-project',
  getTaskBoard: 'dsh-forge:workbench-get-task-board',
  getTaskDetail: 'dsh-forge:workbench-get-task-detail',
  getFeatureBoard: 'dsh-forge:workbench-get-feature-board',
  readFeatureDoc: 'dsh-forge:workbench-read-feature-doc',
  listPlugins: 'dsh-forge:workbench-list-plugins',
  setPluginEnabled: 'dsh-forge:workbench-set-plugin-enabled',
  recordSessionLink: 'dsh-forge:workbench-record-session-link',
  endSessionLink: 'dsh-forge:workbench-end-session-link',
  authorizeExternalDocPath: 'dsh-forge:workbench-authorize-external-doc-path',
  subscribeEvents: 'dsh-forge:workbench-subscribe-events',
  unsubscribeEvents: 'dsh-forge:workbench-unsubscribe-events',
  // M3 tasks 段(任务 1.3 追加;与 main 侧同键同值,drift 锁 =
  // tests/workbench-ipc.spec.ts deep-equal 断言)。
  taskAdd: 'dsh-forge:workbench-task-add',
  taskClaim: 'dsh-forge:workbench-task-claim',
  taskTransition: 'dsh-forge:workbench-task-transition',
  taskSubmit: 'dsh-forge:workbench-task-submit',
  taskReopen: 'dsh-forge:workbench-task-reopen',
  taskGet: 'dsh-forge:workbench-task-get',
  taskQuery: 'dsh-forge:workbench-task-query',
  // M3 migration 段(任务 1.4 追加;与 main 侧同键同值,drift 锁 =
  // tests/workbench-ipc.spec.ts deep-equal 断言)。
  getMigrationStatus: 'dsh-forge:workbench-get-migration-status',
  startMigration: 'dsh-forge:workbench-start-migration',
  // M3 UF3 集成段(任务 1.7 追加;与 main 侧同键同值,drift 锁 =
  // tests/workbench-ipc.spec.ts deep-equal 断言)。
  probeCodeRoot: 'dsh-forge:workbench-probe-code-root',
  getWorkbenchPaths: 'dsh-forge:workbench-get-workbench-paths',
  // M3 知识系 + feature 读段(任务 2.2 追加;与 main 侧同键同值,drift 锁 =
  // tests/workbench-ipc.spec.ts deep-equal 断言)。
  knowledgeFact: 'dsh-forge:workbench-knowledge-fact',
  knowledgeLesson: 'dsh-forge:workbench-knowledge-lesson',
  knowledgeResearch: 'dsh-forge:workbench-knowledge-research',
  knowledgeForensic: 'dsh-forge:workbench-knowledge-forensic',
  featureList: 'dsh-forge:workbench-feature-list',
  featureStatus: 'dsh-forge:workbench-feature-status',
  // M3 prefs 段(任务 3.1 追加;与 main 侧同键同值,drift 锁 =
  // tests/workbench-ipc.spec.ts deep-equal 断言)。
  getPrefs: 'dsh-forge:workbench-get-prefs',
  setPrefs: 'dsh-forge:workbench-set-prefs',
  clearPrefOverride: 'dsh-forge:workbench-clear-pref-override',
  // M3 stages 读段(任务 3.2 追加;与 main 侧同键同值,drift 锁 =
  // tests/workbench-ipc.spec.ts deep-equal 断言)。
  checkStageArtifacts: 'dsh-forge:workbench-check-stage-artifacts',
  getStageGate: 'dsh-forge:workbench-get-stage-gate',
  listStageAssets: 'dsh-forge:workbench-list-stage-assets',
  // M3 dispatch 段(任务 3.3 追加;与 main 侧同键同值,drift 锁 =
  // tests/workbench-ipc.spec.ts deep-equal 断言)。
  dispatchTasks: 'dsh-forge:workbench-dispatch-tasks',
  redispatch: 'dsh-forge:workbench-redispatch',
  getDispatches: 'dsh-forge:workbench-get-dispatches',
  listApprovals: 'dsh-forge:workbench-list-approvals',
  decideApproval: 'dsh-forge:workbench-decide-approval',
} as const

/**
 * Main → renderer event push channel (preload copy — see module header).
 * Not an invokable verb; the renderer only subscribes.
 */
export const WORKBENCH_EVENT_CHANNEL = 'dsh-forge:workbench-events'
