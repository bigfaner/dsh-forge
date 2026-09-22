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
  subscribeEvents: 'dsh-forge:workbench-subscribe-events',
  unsubscribeEvents: 'dsh-forge:workbench-unsubscribe-events',
} as const

/**
 * Main → renderer event push channel (preload copy — see module header).
 * Not an invokable verb; the renderer only subscribes.
 */
export const WORKBENCH_EVENT_CHANNEL = 'dsh-forge:workbench-events'
