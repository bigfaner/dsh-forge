/**
 * The shared 5.x build-stage workbench mock (task 5.1; the 5.3+ build tasks
 * reuse this file per the breakdown's data-stub note). UI dependency
 * layering: every 5.x BUILD task renders against DTO types + this data — no
 * IPC runtime — and the 5.14-5.16 assembly tasks swap the mock for the real
 * workbench.getState() read.
 *
 * The populated variant mirrors the approved prototype's demo registry (two
 * projects, first active); the empty variant exercises the chrome's state
 * gate (page-map: 无激活项目 → tasks/features guide to registration).
 */
import type { WorkbenchState } from '../ipc-types'
import type { SessionLaunchServices } from '../contract'

/** The demo mandatory core row (UF6 consumes the same rows in 5.12). */
const MOCK_PLUGINS = Object.freeze([
  Object.freeze({ name: '@dsh-forge/plugin-forge-workbench', mandatory: true, enabled: true }),
  Object.freeze({ name: '@dsh-forge/plugin-hello-world', mandatory: false, enabled: true }),
])

/** Populated registry: two projects, the first active (prototype fidelity). */
export const MOCK_WORKBENCH_STATE: WorkbenchState = Object.freeze({
  projects: Object.freeze([
    Object.freeze({
      id: '6f1a2d3e-8b44-4c9a-9d01-3c7f5a2b9e10',
      displayName: 'dsh-forge',
      codeRoot: 'Z:\\project\\dsh\\dsh-forge',
      docLocationType: 'in_repo',
      docLocationPath: null,
      createdAt: '2026-09-20T08:12:00.000Z',
      lastActivatedAt: '2026-09-22T06:40:00.000Z',
    }),
    Object.freeze({
      id: 'b2c93f57-1e6a-4d88-8f0c-2a9d4e7b1c53',
      displayName: 'electron-course',
      codeRoot: 'Z:\\project\\github\\electron-course',
      docLocationType: 'in_repo',
      docLocationPath: null,
      createdAt: '2026-09-21T10:02:00.000Z',
      lastActivatedAt: '2026-09-21T18:22:00.000Z',
    }),
  ]),
  activeProjectId: '6f1a2d3e-8b44-4c9a-9d01-3c7f5a2b9e10',
  plugins: MOCK_PLUGINS,
})

/** The state-gate fixture: no projects, no active pointer (single-activation invariant: null ⟺ empty registry). */
export const MOCK_EMPTY_WORKBENCH_STATE: WorkbenchState = Object.freeze({
  projects: Object.freeze([]),
  activeProjectId: null,
  plugins: MOCK_PLUGINS,
})

/**
 * The demo task prompt (task 5.10): deliberately carries leading blank lines,
 * indentation, a fenced block, and a TRAILING newline — the shapes that prove
 * the preview and the launch call are byte-faithful (SC3: no trimming, no
 * re-wrapping anywhere on the client path).
 */
export const MOCK_TASK_PROMPT = `# Task 5.10 — UF5 session launch entry

Execute task \`5.10\` from \`docs/features/dsh-forge-m2/tasks/5.10-session-launch-entry-build.md\`.

    indented detail line that must survive verbatim

- bullet one
- bullet two

End of prompt.` + '\n'

/** The sessionId the mock tier-1 channel "creates" (stable for assertions). */
export const MOCK_LAUNCHED_SESSION_ID = 'session-mock-5f0c1d2e'

/**
 * The UF5 launch services, build-stage default (task 5.10): the happy probe +
 * a tier-1 that always succeeds. The 5.11 integrate task replaces these
 * members with the real remote calls (`ctx.remote.forgeBridge` /
 * `ctx.remote.sessionLaunch` / `ctx.remote.session` / M1 session-focus form).
 */
export const MOCK_SESSION_LAUNCH_SERVICES: SessionLaunchServices = {
  probe: async () => ({ available: true, promptText: MOCK_TASK_PROMPT }),
  launch: async () => ({ ok: true, sessionId: MOCK_LAUNCHED_SESSION_ID }),
  launchViaClientChannel: async () => ({
    ok: false,
    reasonCode: 'ERR_SESSION_CHANNEL_UNAVAILABLE',
    detail: 'build-stage mock: the tier-2 client channel is wired by 5.11',
  }),
  copyPromptToClipboard: async () => true,
  bringMainWindowToFront: () => {
    // Build-stage no-op (the M1 session-focus focusMainWindow form lands with 5.11).
  },
  recordSessionLink: async input => ({
    id: 'link-mock-0001',
    projectId: input.projectId,
    taskKey: input.taskKey,
    sessionId: input.sessionId,
    status: 'active',
    startedAt: '2026-09-22T08:00:00.000Z',
    endedAt: null,
  }),
}
