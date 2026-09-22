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
 * Task 5.5 adds the UF2 task-board fixtures (MOCK_TASK_BOARD — multi-status,
 * qualified keys, one deliberately dangling blocker, branch/worktree/source
 * variety — plus the sync-error and empty variants) and the board's verb
 * twin (createMockTaskBoardFace: loadBoard + the onEvents channel with a
 * test-facing emit poke). Task 5.7 adds the UF3 detail fixtures
 * (MOCK_TASK_DETAILS — rich multi-hop chain / header matrix / sparse) and
 * the dock's verb twin (createMockTaskDetailFace). Task 5.9 adds the UF4
 * feature-family fixtures (MOCK_FEATURE_BOARD — the SAME feature slugs the
 * board fixture's tasks reference: dsh-forge-m2 in-progress with a missing
 * ui doc kind + dsh-forge-m1 completed 48/48 with all five kinds; the empty
 * variant; MOCK_FEATURE_DOCS keyed `<slug>/<kind>`) and the verb twins
 * (createMockFeatureBoardFace / createMockFeatureDocFace, the latter with a
 * test-facing failWith poke for the doc error/stale branches).
 */
import type {
  DocKind, FeatureBoardData, FeatureDoc, Project, ProjectPatch, RegisterProjectInput, TaskBoardData,
  TaskDetail, TaskSummary, WorkbenchEvent, WorkbenchState,
} from '../ipc-types'
import type {
  FeatureBoardFace, FeatureDocFace, OverviewFace, RegisterWizardFace, SessionLaunchServices,
  TaskBoardFace, TaskDetailFace,
} from '../contract'
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

// ---------------------------------------------------------------------------
// Task board, UF2 (task 5.5)
// ---------------------------------------------------------------------------

/**
 * The populated UF2 fixture (task 5.5): 15 tasks across BOTH mock features,
 * covering every dimension the B/C views render —
 *   status    all 7 态 present (4 pending / 1 in_progress / 5 completed /
 *             2 blocked / 1 suspended / 1 skipped / 1 rejected);
 *   key       QUALIFIED `<featureSlug>/<localId>` addresses (task 2.5
 *             dialect) over two features (dsh-forge-m2, dsh-forge-m1);
 *   blockers  same-feature LOCAL keys — 5.9 blocks on a '5.8' that is
 *             DELIBERATELY absent (the dangling-blocker case 6.2's
 *             consistency expectations mark), 6.1 and 5.15 resolve;
 *   branch    null + named branches; worktree true/false; source
 *             session/terminal/null.
 */
const MOCK_BOARD_TASKS: readonly TaskSummary[] = Object.freeze([
  Object.freeze({
    key: 'dsh-forge-m2/5.5', title: 'UF2 task board build: toolbar + status-grouped and list views',
    status: 'in_progress', featureSlug: 'dsh-forge-m2', blockers: [],
    branch: 'dsh-forge-m2', worktree: true, source: 'session',
    updatedAt: '2026-09-22T09:12:00.000Z',
  }),
  Object.freeze({
    key: 'dsh-forge-m2/5.6', title: 'UF2 dependency-tree view (DAG)',
    status: 'pending', featureSlug: 'dsh-forge-m2', blockers: ['5.5'],
    branch: null, worktree: false, source: null,
    updatedAt: '2026-09-22T07:30:00.000Z',
  }),
  Object.freeze({
    key: 'dsh-forge-m2/5.7', title: 'UF3 task detail dock',
    status: 'pending', featureSlug: 'dsh-forge-m2', blockers: ['5.5'],
    branch: null, worktree: false, source: 'terminal',
    updatedAt: '2026-09-22T08:05:00.000Z',
  }),
  Object.freeze({
    key: 'dsh-forge-m2/5.15', title: 'Task board IPC assembly',
    status: 'pending', featureSlug: 'dsh-forge-m2', blockers: ['5.5', '5.6'],
    branch: null, worktree: false, source: null,
    updatedAt: '2026-09-21T16:00:00.000Z',
  }),
  Object.freeze({
    key: 'dsh-forge-m2/5.2', title: 'MarkdownView read-only renderer',
    status: 'completed', featureSlug: 'dsh-forge-m2', blockers: [],
    branch: 'feat/5.2-markdown', worktree: false, source: 'session',
    updatedAt: '2026-09-21T10:20:00.000Z',
  }),
  Object.freeze({
    key: 'dsh-forge-m2/5.3', title: 'UF1 overview page build',
    status: 'completed', featureSlug: 'dsh-forge-m2', blockers: [],
    branch: 'feat/5.3-overview', worktree: false, source: 'terminal',
    updatedAt: '2026-09-21T08:40:00.000Z',
  }),
  Object.freeze({
    key: 'dsh-forge-m2/5.4', title: 'UF1 register wizard build',
    status: 'completed', featureSlug: 'dsh-forge-m2', blockers: ['5.3'],
    branch: 'feat/5.4-wizard', worktree: false, source: 'session',
    updatedAt: '2026-09-21T09:00:00.000Z',
  }),
  Object.freeze({
    // The dangling case: '5.8' resolves to dsh-forge-m2/5.8, absent on purpose.
    key: 'dsh-forge-m2/5.9', title: 'UF4 feature board',
    status: 'blocked', featureSlug: 'dsh-forge-m2', blockers: ['5.8'],
    branch: null, worktree: false, source: null,
    updatedAt: '2026-09-20T15:45:00.000Z',
  }),
  Object.freeze({
    key: 'dsh-forge-m2/6.1', title: 'Indexer dialect guard',
    status: 'blocked', featureSlug: 'dsh-forge-m2', blockers: ['5.15'],
    branch: null, worktree: false, source: 'terminal',
    updatedAt: '2026-09-20T17:10:00.000Z',
  }),
  Object.freeze({
    key: 'dsh-forge-m2/3.9', title: 'Fallback rail polish',
    status: 'suspended', featureSlug: 'dsh-forge-m2', blockers: [],
    branch: 'spike/3.9-rail', worktree: false, source: 'terminal',
    updatedAt: '2026-09-20T12:00:00.000Z',
  }),
  Object.freeze({
    key: 'dsh-forge-m2/3.11', title: 'Alternate rail experiment',
    status: 'skipped', featureSlug: 'dsh-forge-m2', blockers: [],
    branch: null, worktree: false, source: null,
    updatedAt: '2026-09-19T18:30:00.000Z',
  }),
  Object.freeze({
    key: 'dsh-forge-m2/3.12', title: 'Deep-link channel probe',
    status: 'rejected', featureSlug: 'dsh-forge-m2', blockers: [],
    branch: 'rejected/3.12-deeplink', worktree: false, source: 'terminal',
    updatedAt: '2026-09-19T11:00:00.000Z',
  }),
  Object.freeze({
    key: 'dsh-forge-m1/4.3', title: 'Update channel',
    status: 'completed', featureSlug: 'dsh-forge-m1', blockers: [],
    branch: 'release/v1', worktree: false, source: 'session',
    updatedAt: '2026-09-17T10:00:00.000Z',
  }),
  Object.freeze({
    key: 'dsh-forge-m1/4.4', title: 'Installer signing matrix',
    status: 'completed', featureSlug: 'dsh-forge-m1', blockers: ['4.3'],
    branch: 'release/v1', worktree: true, source: 'terminal',
    updatedAt: '2026-09-18T14:00:00.000Z',
  }),
  Object.freeze({
    key: 'dsh-forge-m1/7.2', title: 'Crash recovery e2e leg',
    status: 'pending', featureSlug: 'dsh-forge-m1', blockers: [],
    branch: null, worktree: true, source: null,
    updatedAt: '2026-09-16T09:30:00.000Z',
  }),
])

/** The idle-sync populated board (the build-stage default the page loads). */
export const MOCK_TASK_BOARD: TaskBoardData = Object.freeze({
  tasks: MOCK_BOARD_TASKS,
  generatedAt: MOCK_NOW,
  sync: Object.freeze({ state: 'idle', lastScanAt: MOCK_NOW }),
})

/**
 * The sync-error variant (tech-design §Error Handling: watcher/indexer 感知
 * 失败不弹 UI — 看板顶栏轻量态 + 重试). Same tasks: a sync error NEVER
 * blanks the board (sync error ≠ view error).
 */
export const MOCK_TASK_BOARD_SYNC_ERROR: TaskBoardData = Object.freeze({
  tasks: MOCK_BOARD_TASKS,
  generatedAt: MOCK_NOW,
  sync: Object.freeze({
    state: 'error',
    lastScanAt: '2026-09-22T08:55:00.000Z',
    error: 'build-stage mock: watcher degraded to polling',
  }),
})

/** The empty board (ui-design UF2 empty 态: 空态卡 + forge 初始化引导). */
export const MOCK_TASK_BOARD_EMPTY: TaskBoardData = Object.freeze({
  tasks: [],
  generatedAt: MOCK_NOW,
  sync: Object.freeze({ state: 'idle', lastScanAt: null }),
})

/**
 * The UF2 board's build-stage face, task 5.5 (UI dependency layering): the
 * Interface 1 verb pair as a closure-held twin — `loadBoard` answers the
 * fixture, `subscribeEvents` registers into a listener set with the verb's
 * unsubscribe semantics. The returned `emit` is MOCK-ONLY (the test driver
 * that pushes WorkbenchEvent batches through the channel the 5.15 assembly
 * replaces with the real dsh-forge:workbench-events push).
 */
export function createMockTaskBoardFace(
  initial: TaskBoardData = MOCK_TASK_BOARD,
): TaskBoardFace & { emit(events: readonly WorkbenchEvent[]): void } {
  const listeners = new Set<(events: readonly WorkbenchEvent[]) => void>()
  return {
    loadBoard: async () => initial,
    subscribeEvents: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    emit: (events) => {
      for (const listener of listeners) listener(events)
    },
  }
}

// ---------------------------------------------------------------------------
// Task detail dock, UF3 (task 5.7)
// ---------------------------------------------------------------------------

/**
 * The UF3 detail fixtures (task 5.7): three details keyed by the SAME
 * qualified addresses the board fixture uses (the detail summary is the
 * board row's twin — SC1's 板/详情一致性 from day one):
 *
 *   dsh-forge-m2/6.1  RICH — the multi-hop depChain (5.5 → 5.6 → 5.15, the
 *                     same blocker path the DAG fixture draws), multi-record
 *                     history (session/terminal/null 来源), an active + an
 *                     ended link (新→旧), and a description that exercises
 *                     the MarkdownView subset (headings/list/code/link);
 *   dsh-forge-m1/4.4  header matrix — branch(mono)/worktree/source all set,
 *                     single-hop completed chain, one ended link;
 *   dsh-forge-m1/7.2  SPARSE — every section empty (the 空态 fixture).
 */
export const MOCK_TASK_DETAIL_RICH: TaskDetail = Object.freeze({
  summary: Object.freeze({
    key: 'dsh-forge-m2/6.1', title: 'Indexer dialect guard',
    status: 'blocked', featureSlug: 'dsh-forge-m2', blockers: ['5.15'],
    branch: null, worktree: false, source: 'terminal',
    updatedAt: '2026-09-20T17:10:00.000Z',
  }),
  descriptionMarkdown: [
    '# 6.1 — Indexer dialect guard',
    '',
    'Locks the task 2.5 dialect (`task_key` = qualified `<featureSlug>/<localId>`)',
    'behind fixture-driven assertions so the indexer and the board cannot drift.',
    '',
    '- qualified-address mapping for every snapshot row',
    '- blocker resolution stays inside the feature namespace',
    '- records keep their frontmatter timestamps verbatim',
    '',
    '```ts',
    "expect(localIdOf('dsh-forge-m2/5.5')).toBe('5.5')",
    '```',
    '',
    'See the [dialect notes](https://example.com/dialect) for the full table.',
    '',
  ].join('\n'),
  depChain: Object.freeze([
    Object.freeze({
      key: 'dsh-forge-m2/5.5', title: 'UF2 task board build: toolbar + status-grouped and list views',
      status: 'in_progress',
    }),
    Object.freeze({ key: 'dsh-forge-m2/5.6', title: 'UF2 dependency-tree view (DAG)', status: 'pending' }),
    Object.freeze({ key: 'dsh-forge-m2/5.15', title: 'Task board IPC assembly', status: 'pending' }),
  ]),
  records: Object.freeze([
    Object.freeze({
      at: '2026-09-22T09:05:00.000Z', kind: 'coding.feature', source: 'session',
      summary: '## Summary\n\nRe-ran the dialect suite after the 2.5 amendment — **all green**.',
    }),
    Object.freeze({
      at: '2026-09-21T18:40:00.000Z', kind: 'coding.feature', source: 'terminal',
      summary: '## Summary\n\nAdded the qualified-address fixtures and locked `task_key` mapping.',
    }),
    Object.freeze({
      at: '2026-09-20T17:10:00.000Z', kind: 'coding.feature', source: null,
      summary: '## Summary\n\nTask opened with the guard skeleton.',
    }),
  ]),
  links: Object.freeze([
    Object.freeze({
      id: 'link-mock-0107', projectId: '6f1a2d3e-8b44-4c9a-9d01-3c7f5a2b9e10',
      taskKey: 'dsh-forge-m2/6.1', sessionId: 'session-a3f2c9d1', status: 'active',
      startedAt: '2026-09-22T08:05:00.000Z', endedAt: null,
    }),
    Object.freeze({
      id: 'link-mock-0102', projectId: '6f1a2d3e-8b44-4c9a-9d01-3c7f5a2b9e10',
      taskKey: 'dsh-forge-m2/6.1', sessionId: 'session-7b2e4f60', status: 'ended',
      startedAt: '2026-09-21T14:02:00.000Z', endedAt: '2026-09-21T16:40:00.000Z',
    }),
  ]),
})

/** The header-matrix twin: every summary dimension present (branch/worktree/source). */
export const MOCK_TASK_DETAIL_HEADER: TaskDetail = Object.freeze({
  summary: Object.freeze({
    key: 'dsh-forge-m1/4.4', title: 'Installer signing matrix',
    status: 'completed', featureSlug: 'dsh-forge-m1', blockers: ['4.3'],
    branch: 'release/v1', worktree: true, source: 'terminal',
    updatedAt: '2026-09-18T14:00:00.000Z',
  }),
  descriptionMarkdown: 'Sign the installer across the release matrix and verify each channel.',
  depChain: Object.freeze([
    Object.freeze({ key: 'dsh-forge-m1/4.3', title: 'Update channel', status: 'completed' }),
  ]),
  records: Object.freeze([
    Object.freeze({
      at: '2026-09-18T14:00:00.000Z', kind: 'coding.feature', source: 'terminal',
      summary: '## Summary\n\nAll channels signed and verified.',
    }),
  ]),
  links: Object.freeze([
    Object.freeze({
      id: 'link-mock-0144', projectId: '6f1a2d3e-8b44-4c9a-9d01-3c7f5a2b9e10',
      taskKey: 'dsh-forge-m1/4.4', sessionId: 'session-0c55e2a8', status: 'ended',
      startedAt: '2026-09-17T09:00:00.000Z', endedAt: '2026-09-17T13:20:00.000Z',
    }),
  ]),
})

/** The empty-state twin: no description, no chain, no records, no links. */
export const MOCK_TASK_DETAIL_SPARSE: TaskDetail = Object.freeze({
  summary: Object.freeze({
    key: 'dsh-forge-m1/7.2', title: 'Crash recovery e2e leg',
    status: 'pending', featureSlug: 'dsh-forge-m1', blockers: [],
    branch: null, worktree: true, source: null,
    updatedAt: '2026-09-16T09:30:00.000Z',
  }),
  descriptionMarkdown: '',
  depChain: Object.freeze([]),
  records: Object.freeze([]),
  links: Object.freeze([]),
})

/** The dock's fixture map (keyed by the qualified task address). */
export const MOCK_TASK_DETAILS: ReadonlyMap<string, TaskDetail> = new Map([
  [MOCK_TASK_DETAIL_RICH.summary.key, MOCK_TASK_DETAIL_RICH],
  [MOCK_TASK_DETAIL_HEADER.summary.key, MOCK_TASK_DETAIL_HEADER],
  [MOCK_TASK_DETAIL_SPARSE.summary.key, MOCK_TASK_DETAIL_SPARSE],
])

/**
 * The UF3 dock's build-stage face, task 5.7 (UI dependency layering): the
 * Interface 1 getTaskDetail verb as a closure-held twin over the fixture
 * map — known keys resolve their detail, unknown keys reject with the
 * serialized WorkbenchVerbError shape (ERR_TASK_NOT_FOUND), the form the
 * IPC runtime sends. The 5.15 assembly replaces the whole face.
 */
export function createMockTaskDetailFace(
  initial: ReadonlyMap<string, TaskDetail> = MOCK_TASK_DETAILS,
): TaskDetailFace {
  return {
    loadDetail: async (_projectId, taskKey) => {
      const detail = initial.get(taskKey)
      if (detail === undefined) {
        throw {
          code: 'ERR_TASK_NOT_FOUND',
          message: `build-stage mock: no task detail for ${taskKey}`,
        }
      }
      return detail
    },
  }
}

// ---------------------------------------------------------------------------
// Feature board + doc tabs, UF4 (task 5.9)
// ---------------------------------------------------------------------------

/**
 * The populated UF4 fixture (task 5.9): two features over the SAME slugs the
 * UF2 board fixture's tasks reference (dsh-forge-m2 / dsh-forge-m1), covering
 * every dimension the list/detail views render —
 *   status    manifest 词表透传 VERBATIM: 'in-progress' keeps its hyphen;
 *   docKinds  dsh-forge-m2 lacks 'ui' (the disabled-tab case: missing kinds
 *             disable, never hide), dsh-forge-m1 carries all five;
 *   progress  m2 partial (4/15), m1 fully complete (48/48 — the 完成徽标 case,
 *             judged on taskCompleted=taskTotal exactly like the view does).
 */
export const MOCK_FEATURE_BOARD: FeatureBoardData = Object.freeze({
  features: Object.freeze([
    Object.freeze({
      slug: 'dsh-forge-m2', status: 'in-progress',
      docKinds: ['manifest', 'prd', 'design', 'tasks'] as DocKind[],
      taskTotal: 15, taskCompleted: 4, updatedAt: '2026-09-22T09:12:00.000Z',
    }),
    Object.freeze({
      slug: 'dsh-forge-m1', status: 'completed',
      docKinds: ['manifest', 'prd', 'design', 'ui', 'tasks'] as DocKind[],
      taskTotal: 48, taskCompleted: 48, updatedAt: '2026-09-20T14:00:00.000Z',
    }),
  ]),
  generatedAt: MOCK_NOW,
})

/** The empty board (ui-design UF4 empty 态: 空态 + forge 初始化引导). */
export const MOCK_FEATURE_BOARD_EMPTY: FeatureBoardData = Object.freeze({
  features: Object.freeze([]),
  generatedAt: MOCK_NOW,
})

/**
 * The doc-tab fixtures, keyed `<featureSlug>/<kind>` — every kind the board
 * rows declare (and nothing else, so unknown-kind reads reject). The markdown
 * exercises the MarkdownView subset (heading/list/code) and names its feature
 * so tab-content assertions can tell docs apart.
 */
export const MOCK_FEATURE_DOCS: ReadonlyMap<string, FeatureDoc> = new Map<string, FeatureDoc>([
  ['dsh-forge-m2/manifest', {
    kind: 'manifest',
    markdown: '# dsh-forge-m2 manifest\n\n- status: in-progress\n- tasks: 15\n',
  }],
  ['dsh-forge-m2/prd', {
    kind: 'prd',
    markdown: '# dsh-forge-m2 PRD\n\nThe M2 requirements and session workbench.\n',
  }],
  ['dsh-forge-m2/design', {
    kind: 'design',
    markdown: '# dsh-forge-m2 tech design\n\n```ts\ninterface FeatureSummary { slug: string }\n```\n',
  }],
  ['dsh-forge-m2/tasks', {
    kind: 'tasks',
    markdown: '# dsh-forge-m2 tasks\n\n- 5.5 UF2 board\n- 5.9 UF4 feature board\n',
  }],
  ['dsh-forge-m1/manifest', {
    kind: 'manifest',
    markdown: '# dsh-forge-m1 manifest\n\n- status: completed\n- tasks: 48\n',
  }],
  ['dsh-forge-m1/prd', {
    kind: 'prd',
    markdown: '# dsh-forge-m1 PRD\n\nThe M1 shell requirements.\n',
  }],
  ['dsh-forge-m1/design', {
    kind: 'design',
    markdown: '# dsh-forge-m1 tech design\n\nThe shell, tray, and update channel.\n',
  }],
  ['dsh-forge-m1/ui', {
    kind: 'ui',
    markdown: '# dsh-forge-m1 UI design\n\nThe M1 visual language.\n',
  }],
  ['dsh-forge-m1/tasks', {
    kind: 'tasks',
    markdown: '# dsh-forge-m1 tasks\n\n- 4.3 update channel\n- 4.4 installer signing\n',
  }],
])

/**
 * The UF4 board's build-stage face, task 5.9 (UI dependency layering): the
 * Interface 1 getFeatureBoard verb as a closure-held twin over the fixture —
 * a stateless read, like the dock's twin. The 5.16 assembly replaces the
 * whole face with the IPC verb.
 */
export function createMockFeatureBoardFace(
  initial: FeatureBoardData = MOCK_FEATURE_BOARD,
): FeatureBoardFace {
  return {
    loadFeatureBoard: async () => initial,
  }
}

/**
 * The UF4 doc tabs' build-stage face, task 5.9 (UI dependency layering): the
 * Interface 1 readFeatureDoc verb as a closure-held twin over the fixture
 * map. Known `<slug>/<kind>` entries resolve; unknown entries reject with the
 * serialized WorkbenchVerbError shape under the spec's 兜底 code
 * (ERR_WORKBENCH_DB — an unknown read is a generic failure, exactly the
 * runtime's unknown-exception mapping). The returned `failWith` is MOCK-ONLY
 * (the test driver that arms a rejection — e.g. ERR_SNAPSHOT_STALE — for the
 * doc branches' error/stale states).
 */
export function createMockFeatureDocFace(
  initial: ReadonlyMap<string, FeatureDoc> = MOCK_FEATURE_DOCS,
): FeatureDocFace & {
  /** Arm a rejection for the next read(s) of one doc (the test driver). */
  failWith(slug: string, kind: DocKind, error: { code: string; message: string }): void
} {
  const armed = new Map<string, { code: string; message: string }>()
  return {
    readFeatureDoc: async (_projectId, featureSlug, kind) => {
      const failure = armed.get(`${featureSlug}/${kind}`)
      if (failure !== undefined) throw failure
      const doc = initial.get(`${featureSlug}/${kind}`)
      if (doc === undefined) {
        throw {
          code: 'ERR_WORKBENCH_DB',
          message: `build-stage mock: no ${kind} doc for ${featureSlug}`,
        }
      }
      return doc
    },
    failWith: (slug, kind, error) => { armed.set(`${slug}/${kind}`, error) },
  }
}
