/**
 * The shared 5.x build-stage workbench mock (task 5.1; the 5.3+ build tasks
 * reuse this file per the breakdown's data-stub note). UI dependency
 * layering: every 5.x BUILD task renders against DTO types + this data — no
 * IPC runtime — and the 5.14-5.16 assembly tasks swap the mock for the real
 * workbench.getState() read.
 *
 * The populated variant mirrors the approved prototype's demo registry (two
 * projects, first active); the empty variant exercises the chrome's state
 * gate (page-map: 无激活项目 → tasks/features guide to registration). Task
 * 5.3 adds the card-data variety (external docs / never-activated) and the
 * overview page's mock verb twin (createMockOverviewFace). Task 5.4 adds the
 * register wizard's fixtures + verb twin (createMockRegisterWizardFace).
 */
import type { Project, ProjectPatch, RegisterProjectInput, WorkbenchState } from '../ipc-types'
import type { OverviewFace, RegisterWizardFace, SessionLaunchServices } from '../contract'
import { directoryNameOf, normalizePathForCompare, samePath } from '../paths'

/** The demo mandatory core row (UF6 consumes the same rows in 5.12). */
const MOCK_PLUGINS = Object.freeze([
  Object.freeze({ name: '@dsh-forge/plugin-forge-workbench', mandatory: true, enabled: true }),
  Object.freeze({ name: '@dsh-forge/plugin-hello-world', mandatory: false, enabled: true }),
])

/**
 * The fixed "now" the overview mock stamps (task 5.3): a frozen ISO so
 * activation side effects (`lastActivatedAt`) stay deterministic in tests —
 * the page's date rendering is injected/pure for the same reason.
 */
export const MOCK_NOW = '2026-09-22T09:00:00.000Z'

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
    // Task 5.3 widens the fixture for the project-card field matrix: an
    // external doc location (the 仓外 badge) and a never-activated project.
    Object.freeze({
      id: 'b2c93f57-1e6a-4d88-8f0c-2a9d4e7b1c53',
      displayName: 'electron-course',
      codeRoot: 'Z:\\project\\github\\electron-course',
      docLocationType: 'external',
      docLocationPath: 'Z:\\docs\\electron-course',
      createdAt: '2026-09-21T10:02:00.000Z',
      lastActivatedAt: null,
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

/**
 * The overview page's build-stage face, task 5.3 (UI dependency layering): a
 * STATEFUL local twin of the Interface 1 verbs over a closure-held registry —
 * a factory, not a singleton, so every mount/test gets isolated state. The
 * verb semantics mirror the main-process transactions (tech-design §Interface
 * 1 / Data Models):
 *
 *   activateProject — single activation, stamps `lastActivatedAt` (MOCK_NOW);
 *   updateProject   — patches the row, returns the updated Project;
 *   removeProject   — drops the row; when the ACTIVE project is removed the
 *                    first remaining row (registration order) is auto-activated,
 *                    the last removal clears the pointer (single-activation
 *                    invariant: null ⟺ empty registry) — exactly what the
 *                    main-side transaction does, so the page's toast logic
 *                    runs against the real semantics;
 *   unknown id      — rejects the serialized WorkbenchVerbError shape
 *                    (ERR_PROJECT_NOT_FOUND), the form the IPC runtime sends.
 *
 * The 5.14 assembly task replaces the whole face with the IPC verbs.
 */
export function createMockOverviewFace(initial: WorkbenchState = MOCK_WORKBENCH_STATE): OverviewFace {
  let state: WorkbenchState = initial
  const notFound = (id: string): { code: string; message: string } => ({
    code: 'ERR_PROJECT_NOT_FOUND',
    message: `build-stage mock: no registered project ${id}`,
  })
  return {
    loadState: async () => state,
    activateProject: async (id: string) => {
      if (!state.projects.some(project => project.id === id)) throw notFound(id)
      state = {
        ...state,
        activeProjectId: id,
        projects: state.projects.map(project =>
          project.id === id ? { ...project, lastActivatedAt: MOCK_NOW } : project,
        ),
      }
    },
    updateProject: async (id: string, patch: ProjectPatch) => {
      const project = state.projects.find(row => row.id === id)
      if (project === undefined) throw notFound(id)
      const updated: Project = { ...project, ...patch }
      state = {
        ...state,
        projects: state.projects.map(row => (row.id === id ? updated : row)),
      }
      return updated
    },
    removeProject: async (id: string) => {
      const projects = state.projects.filter(project => project.id !== id)
      if (projects.length === state.projects.length) throw notFound(id)
      // Removed the active project → the transaction migrates the pointer to
      // the first remaining row (registration order), or clears it when the
      // registry became empty.
      const activeProjectId = state.activeProjectId === id
        ? (projects[0]?.id ?? null)
        : state.activeProjectId
      state = { ...state, projects, activeProjectId }
    },
  }
}

// ---------------------------------------------------------------------------
// Register wizard (task 5.4)
// ---------------------------------------------------------------------------

/**
 * Step-① probe fixtures: deterministic paths the mock twin answers without
 * touching the filesystem (BUILD layering — the real detection read arrives
 * with the 5.14 assembly). Any path outside these fixtures probes as
 * detected with the counts below, so happy-path flows stay writable.
 */
export const MOCK_WIZARD_OK_ROOT = 'Z:\\project\\demo'
export const MOCK_WIZARD_UNREADABLE_ROOT = 'Z:\\project\\gone'
export const MOCK_WIZARD_NO_FORGE_ROOT = 'Z:\\project\\plain'

/** The detected overview counts (ui-design: 检出成功显示任务/feature 概览). */
export const MOCK_WIZARD_TASK_TOTAL = 12
export const MOCK_WIZARD_FEATURE_TOTAL = 3

/** Step-② probe fixtures: one readable external docs path, one unreachable. */
export const MOCK_WIZARD_EXTERNAL_OK = 'Z:\\docs\\demo'
export const MOCK_WIZARD_EXTERNAL_UNREADABLE = 'Z:\\docs\\gone'

/**
 * The register wizard's build-stage face, task 5.4 (UI dependency layering):
 * a STATEFUL local twin over a closure-held registry — a factory, not a
 * singleton, so every mount/test gets isolated state (the createMockOverview
 * Face precedent). Verb semantics mirror the main-process chain
 * (tech-design §Interface 1 / §Error Handling):
 *
 *   probeCodeRoot      — fixture-keyed; unknown non-empty paths detect fine;
 *   probeExternalPath  — samePath(codeRoot) → ERR_DOC_PATH_CONFLICT, the
 *                        unreadable fixture → ERR_EXTERNAL_PATH_UNREADABLE;
 *   registerProject    — UNIQUE(code_root) → ERR_PROJECT_EXISTS; external
 *                        path = codeRoot → ERR_DOC_PATH_CONFLICT; displayName
 *                        缺省 = the codeRoot directory name; deterministic
 *                        mock ids + frozen MOCK_NOW stamps;
 *   updateProject      — patches the row (explicit field merge: an undefined
 *                        patch member never nulls a stored field), unknown id
 *                        → ERR_PROJECT_NOT_FOUND.
 *
 * The 5.14 assembly task replaces the whole face with the IPC verbs + the
 * real detection read.
 */
export function createMockRegisterWizardFace(
  initial: WorkbenchState = MOCK_WORKBENCH_STATE,
): RegisterWizardFace {
  let projects: readonly Project[] = initial.projects
  let seq = 0
  const verbError = (code: string, message: string): never => {
    throw { code, message }
  }
  const findByRoot = (codeRoot: string): Project | undefined =>
    projects.find(project => samePath(project.codeRoot, codeRoot))
  return {
    probeCodeRoot: async ({ codeRoot }) => {
      const root = codeRoot.trim()
      if (samePath(root, MOCK_WIZARD_UNREADABLE_ROOT)) {
        return { available: false, reasonCode: 'ERR_CODE_ROOT_UNREADABLE', detail: `mock fixture: ${MOCK_WIZARD_UNREADABLE_ROOT}` }
      }
      if (samePath(root, MOCK_WIZARD_NO_FORGE_ROOT)) {
        return { available: false, reasonCode: 'ERR_FORGE_NOT_DETECTED', detail: `mock fixture: ${MOCK_WIZARD_NO_FORGE_ROOT}` }
      }
      return { available: true, taskTotal: MOCK_WIZARD_TASK_TOTAL, featureTotal: MOCK_WIZARD_FEATURE_TOTAL }
    },
    probeExternalPath: async ({ codeRoot, docLocationPath }) => {
      const path = docLocationPath.trim()
      if (samePath(path, codeRoot)) {
        return { ok: false, reasonCode: 'ERR_DOC_PATH_CONFLICT', detail: 'external docs path equals the code root' }
      }
      if (samePath(path, MOCK_WIZARD_EXTERNAL_UNREADABLE)) {
        return { ok: false, reasonCode: 'ERR_EXTERNAL_PATH_UNREADABLE', detail: `mock fixture: ${MOCK_WIZARD_EXTERNAL_UNREADABLE}` }
      }
      return { ok: true }
    },
    registerProject: async (input: RegisterProjectInput) => {
      // Interface 1: codeRoot is normalized at registration (绝对路径规范化).
      const codeRoot = normalizePathForCompare(input.codeRoot)
      if (findByRoot(codeRoot) !== undefined) {
        return verbError('ERR_PROJECT_EXISTS', `build-stage mock: ${codeRoot} is already registered`)
      }
      if (input.docLocationType === 'external' && samePath(input.docLocationPath ?? '', codeRoot)) {
        return verbError('ERR_DOC_PATH_CONFLICT', 'build-stage mock: external docs path equals the code root')
      }
      seq += 1
      const project: Project = {
        id: `mock-wizard-project-${String(seq).padStart(4, '0')}`,
        displayName: input.displayName !== undefined && input.displayName.trim() !== ''
          ? input.displayName.trim()
          : directoryNameOf(codeRoot),
        codeRoot,
        docLocationType: input.docLocationType,
        docLocationPath: input.docLocationType === 'external' ? (input.docLocationPath ?? null) : null,
        createdAt: MOCK_NOW,
        lastActivatedAt: null,
      }
      projects = [...projects, project]
      return project
    },
    updateProject: async (id: string, patch: ProjectPatch) => {
      const current = projects.find(project => project.id === id)
      if (current === undefined) {
        return verbError('ERR_PROJECT_NOT_FOUND', `build-stage mock: no registered project ${id}`)
      }
      const docLocationType = patch.docLocationType ?? current.docLocationType
      const docLocationPath = docLocationType === 'external'
        ? (patch.docLocationPath ?? current.docLocationPath)
        : null
      if (docLocationType === 'external' && docLocationPath !== null && samePath(docLocationPath, current.codeRoot)) {
        return verbError('ERR_DOC_PATH_CONFLICT', 'build-stage mock: external docs path equals the code root')
      }
      const updated: Project = {
        ...current,
        displayName: patch.displayName !== undefined && patch.displayName.trim() !== ''
          ? patch.displayName.trim()
          : current.displayName,
        docLocationType,
        docLocationPath,
      }
      projects = projects.map(project => (project.id === id ? updated : project))
      return updated
    },
  }
}
