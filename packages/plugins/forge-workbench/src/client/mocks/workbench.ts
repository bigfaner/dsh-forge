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
 * the dock's verb twin (createMockTaskDetailFace). Task 5.8 adds the dep-chain
 * JUMP target (MOCK_TASK_DETAIL_MID — dsh-forge-m2/5.6, a hop on the RICH
 * chain the selection tests retarget onto). Task 5.9 adds the UF4
 * feature-family fixtures (MOCK_FEATURE_BOARD — the SAME feature slugs the
 * board fixture's tasks reference: dsh-forge-m2 in-progress with a missing
 * ui doc kind + dsh-forge-m1 completed 48/48 with all five kinds; the empty
 * variant; MOCK_FEATURE_DOCS keyed `<slug>/<kind>`) and the verb twins
 * (createMockFeatureBoardFace / createMockFeatureDocFace, the latter with a
 * test-facing failWith poke for the doc error/stale branches). Task 5.12
 * widens the plugin fixture to the real product-manifest shape (MOCK_PLUGIN_
 * ROWS) and adds the UF6 section's verb twin (createMockPluginFace: the
 * mandatory guard rejects ERR_PLUGIN_MANDATORY for real; failWith /
 * failListWith arm the failure branches).
 */
import type {
  ApprovalRow, DispatchRow, DispatchState, DocKind, FeatureBoardData, FeatureDoc,
  FeatureStatus, FeatureSummary,
  MigrationPhase, MigrationPhaseResult, MigrationStatus,
  WorkbenchPaths,
  MissingItem, PluginRow, PrefEntry, PrefRow, PrefScope, Project, ProjectPatch,
  ProposalBoardData, ProposalDoc, RegisterProjectInput, StageAssetRow,
  StageGateInfo, TaskBoardData, TaskDetail,
  TaskSummary,
  WorkbenchEvent, WorkbenchState,
} from '../ipc-types'
import type {
  DispatchFace, FeatureBoardFace, FeatureDocFace, MigrationFace, MigrationGuardSnapshot,
  OverviewFace,
  PluginFace, PrefsFace, ProposalFace, RegisterWizardFace, StageFace,
  TaskBoardFace, TaskDetailFace,
} from '../contract'
import { directoryNameOf, normalizePathForCompare, samePath } from '../paths'

/**
 * The two-tier plugin fixture (task 5.12 widens it to the REAL product-
 * manifest shape — apps/desktop/resources/plugin-bundles.json landed by 3.1/
 * 3.2): three mandatory rows (the two upstream platform bundles + this
 * workbench plugin) and the togglable third-party fixture (hello-world).
 * The same rows serve both the getState assembly and the UF6 mock twin.
 * M3 task 1.6 adds the UF3 migration family's fixtures + verb twin
 * (MOCK_MIGRATION_* / createMockMigrationFace: phase-disciplined event
 * pushes mirroring migration/pipeline.ts, with failAtPhase / rejectGuard /
 * guard knobs for the dialog family's scenario matrix).
 */
export const MOCK_PLUGIN_ROWS: readonly PluginRow[] = Object.freeze([
  Object.freeze({ name: '@deepseek-ai/dsh-base', mandatory: true, enabled: true }),
  Object.freeze({ name: '@deepseek-ai/dsh-web-app', mandatory: true, enabled: true }),
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
  plugins: MOCK_PLUGIN_ROWS,
})

/** The state-gate fixture: no projects, no active pointer (single-activation invariant: null ⟺ empty registry). */
export const MOCK_EMPTY_WORKBENCH_STATE: WorkbenchState = Object.freeze({
  projects: Object.freeze([]),
  activeProjectId: null,
  plugins: MOCK_PLUGIN_ROWS,
})

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
  options: { indexJsonDetected?: boolean } = {},
): RegisterWizardFace {
  let projects: readonly Project[] = initial.projects
  let seq = 0
  /** 6.4: the authorization records the mock twin keeps (test-observable). */
  const authorizedExternalPaths = new Set<string>()
  const verbError = (code: string, message: string): never => {
    throw { code, message }
  }
  const findByRoot = (codeRoot: string): Project | undefined =>
    projects.find(project => samePath(project.codeRoot, codeRoot))
  return {
    authorizeExternalDocPath: async (path: string) => {
      // 6.4: mirror the registry's persisted record (idempotent upsert, no fs).
      authorizedExternalPaths.add(normalizePathForCompare(path))
    },
    probeCodeRoot: async ({ codeRoot }) => {
      const root = codeRoot.trim()
      if (samePath(root, MOCK_WIZARD_UNREADABLE_ROOT)) {
        return { available: false, reasonCode: 'ERR_CODE_ROOT_UNREADABLE', detail: `mock fixture: ${MOCK_WIZARD_UNREADABLE_ROOT}` }
      }
      if (samePath(root, MOCK_WIZARD_NO_FORGE_ROOT)) {
        return { available: false, reasonCode: 'ERR_FORGE_NOT_DETECTED', detail: `mock fixture: ${MOCK_WIZARD_NO_FORGE_ROOT}` }
      }
      return {
        available: true,
        taskTotal: MOCK_WIZARD_TASK_TOTAL,
        featureTotal: MOCK_WIZARD_FEATURE_TOTAL,
        indexJsonDetected: options.indexJsonDetected === true,
      }
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

/**
 * The dep-chain JUMP target (task 5.8): dsh-forge-m2/5.6 — a hop on the
 * RICH detail's chain AND a board row, so the dock's 依赖链 onNavigate can
 * retarget onto a task the selection tests can also reach from every view
 * (the board twin of this summary is the fixture row above).
 */
export const MOCK_TASK_DETAIL_MID: TaskDetail = Object.freeze({
  summary: Object.freeze({
    key: 'dsh-forge-m2/5.6', title: 'UF2 dependency-tree view (DAG)',
    status: 'pending', featureSlug: 'dsh-forge-m2', blockers: ['5.5'],
    branch: null, worktree: false, source: null,
    updatedAt: '2026-09-22T07:30:00.000Z',
  }),
  descriptionMarkdown: 'The layered DAG canvas with keyboard traversal over the task_snapshot graph.',
  depChain: Object.freeze([
    Object.freeze({
      key: 'dsh-forge-m2/5.5', title: 'UF2 task board build: toolbar + status-grouped and list views',
      status: 'in_progress',
    }),
  ]),
  records: Object.freeze([]),
  links: Object.freeze([]),
})

/** The dock's fixture map (keyed by the qualified task address). */
export const MOCK_TASK_DETAILS: ReadonlyMap<string, TaskDetail> = new Map([
  [MOCK_TASK_DETAIL_RICH.summary.key, MOCK_TASK_DETAIL_RICH],
  [MOCK_TASK_DETAIL_HEADER.summary.key, MOCK_TASK_DETAIL_HEADER],
  [MOCK_TASK_DETAIL_SPARSE.summary.key, MOCK_TASK_DETAIL_SPARSE],
  [MOCK_TASK_DETAIL_MID.summary.key, MOCK_TASK_DETAIL_MID],
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
      deviated: false,
    }),
    Object.freeze({
      slug: 'dsh-forge-m1', status: 'completed',
      docKinds: ['manifest', 'prd', 'design', 'ui', 'tasks'] as DocKind[],
      taskTotal: 48, taskCompleted: 48, updatedAt: '2026-09-20T14:00:00.000Z',
      deviated: false,
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

// ---------------------------------------------------------------------------
// Plugin section, UF6 (task 5.12)
// ---------------------------------------------------------------------------

/**
 * The UF6 section's build-stage face, task 5.12 (UI dependency layering): the
 * Interface 1 verb pair as a STATEFUL closure twin — a factory, not a
 * singleton, so every mount/test gets isolated state (the createMockOverview
 * Face precedent). Verb semantics mirror the main-process pair (tech-design
 * §Interface 1 / §Interface 4):
 *
 *   listPlugins        — the current rows (a one-shot list failure can be
 *                        armed for the load-error branch via failListWith);
 *   setPluginEnabled   — patches the row and resolves the FULL current
 *                        PluginRow[] (the verb's contract); a mandatory name
 *                        targeted for disable rejects the serialized
 *                        WorkbenchVerbError shape ERR_PLUGIN_MANDATORY — the
 *                        REAL guard semantics, so the section's
 *                        defense-in-depth mapping runs against the genuine
 *                        rejection; an unknown name falls to the generic
 *                        ERR_WORKBENCH_DB 兜底 (Propagation Strategy).
 *
 * The returned `failWith` / `failListWith` are MOCK-ONLY (the test drivers
 * that arm rejections — failListWith arms exactly the NEXT load — for the
 * section's error/failure branches).
 */
export function createMockPluginFace(
  initial: readonly PluginRow[] = MOCK_PLUGIN_ROWS,
): PluginFace & {
  /** Arm a rejection for the next setPluginEnabled of one plugin (the test driver). */
  failWith(name: string, error: { code: string; message: string }): void
  /** Arm a rejection for exactly the NEXT listPlugins (the test driver). */
  failListWith(error: { code: string; message: string }): void
} {
  let rows: PluginRow[] = [...initial]
  let armedList: { code: string; message: string } | undefined
  const armed = new Map<string, { code: string; message: string }>()
  return {
    listPlugins: async () => {
      if (armedList !== undefined) {
        const failure = armedList
        armedList = undefined
        throw failure
      }
      return rows
    },
    setPluginEnabled: async (name, enabled) => {
      const failure = armed.get(name)
      if (failure !== undefined) throw failure
      const row = rows.find(candidate => candidate.name === name)
      if (row === undefined) {
        throw { code: 'ERR_WORKBENCH_DB', message: `build-stage mock: no plugin row ${name}` }
      }
      if (row.mandatory && !enabled) {
        throw {
          code: 'ERR_PLUGIN_MANDATORY',
          message: `build-stage mock: ${name} is mandatory and cannot be disabled`,
        }
      }
      rows = rows.map(candidate => candidate.name === name ? { ...candidate, enabled } : candidate)
      return rows
    },
    failWith: (name, error) => { armed.set(name, error) },
    failListWith: (error) => { armedList = error },
  }
}


// ---------------------------------------------------------------------------
// Migration family, UF3 (task 1.6)
// ---------------------------------------------------------------------------

/** The mock backup directory (the confirm copy's mono 备份位置). */
export const MOCK_MIGRATION_BACKUP_PATH = 'Z:/userData/workbench/backups/demo-20260924T080000Z'

/** The migratable status fixture (authority 'files' + index.json detected — the card's 可迁移 premise). */
export const MOCK_MIGRATION_STATUS_FILES: MigrationStatus = Object.freeze({
  authority: 'files',
  deviated: false,
  migratedAt: null,
  lastEvent: null,
  indexJsonDetected: true,
})

/** The migrated status fixture (authority 'sqlite', audit trail behind it). */
export const MOCK_MIGRATION_STATUS_SQLITE: MigrationStatus = Object.freeze({
  authority: 'sqlite',
  deviated: false,
  migratedAt: '2026-09-24T08:00:05.000Z',
  indexJsonDetected: false,
  lastEvent: {
    id: 'ev-archive-ok',
    projectId: 'demo',
    phase: 'archive',
    result: 'ok',
    detailJson: null,
    at: '2026-09-24T08:00:05.000Z',
  } as const,
})

/**
 * The kernel-managed locations fixture (task 1.7): the flipped wizard default's
 * 应用管理路径 root + the migration confirm's 备份位置 root (mock userData).
 */
export const MOCK_WORKBENCH_PATHS: WorkbenchPaths = Object.freeze({
  docsRoot: 'Z:/userData/workbench/docs',
  backupsRoot: 'Z:/userData/workbench/backups',
})

/** The mock twin's knobs (the spec's scenario matrix: 成功 / 相位注错 / 守卫). */
export interface MockMigrationFaceOptions {
  /** Success (default): backup→ingest→verify→switch→archive ok, verb resolves. */
  readonly failAtPhase?: MigrationPhase | undefined
  /** startMigration rejects ERR_MIGRATION_GUARD pre-flight (zero events). */
  readonly rejectGuard?: boolean
  /** The initial entry-guard snapshot (在跑编排守卫态). */
  readonly guard?: MigrationGuardSnapshot | undefined
  /** The initial migration status (Pill 判定面). */
  readonly status?: MigrationStatus | undefined
  /** The project the twin serves (event projectId); default 'demo'. */
  readonly projectId?: string | undefined
}

/**
 * The UF3 migration family's build-stage verb twin (task 1.6): the Interface 1
 * migration verbs + the guard read as closure-held mocks whose event pushes
 * mirror the kernel pipeline's discipline (migration/pipeline.ts): backup ok
 * BEFORE the transaction opens; ingest/verify/switch/archive ok together
 * after COMMIT; a failure pushes the failed phase + rollback ok and THEN the
 * verb rejects; a pre-flight guard rejection pushes nothing. The returned
 * pokes are MOCK-ONLY (the createMockTaskBoardFace emit precedent):
 * `emit`/`setGuard`/`settleNextAsSuccess` retune the twin mid-test, and
 * `startCalls`/`guardReads` count the verb legs for the zero-verb assertions.
 */
export function createMockMigrationFace(
  options: MockMigrationFaceOptions = {},
): {
  readonly face: MigrationFace
  emit(events: readonly WorkbenchEvent[]): void
  setGuard(snapshot: MigrationGuardSnapshot): void
  settleNextAsSuccess(): void
  readonly startCalls: number
  readonly guardReads: number
} {
  const projectId = options.projectId ?? 'demo'
  const listeners = new Set<(events: readonly WorkbenchEvent[]) => void>()
  let guard = options.guard ?? { blocked: false, runningCount: 0 }
  let status = options.status ?? MOCK_MIGRATION_STATUS_FILES
  let failAtPhase: MigrationPhase | undefined = options.failAtPhase
  let nextRejectsGuard = options.rejectGuard === true
  let startCalls = 0
  let guardReads = 0
  const emit = (events: readonly WorkbenchEvent[]): void => {
    for (const listener of [...listeners]) listener(events)
  }
  const push = (phase: MigrationPhase, result: MigrationPhaseResult): void => {
    emit([{ type: 'migration_progress', projectId, phase, result }])
  }
  const face: MigrationFace = {
    getMigrationStatus: async () => status,
    startMigration: async () => {
      startCalls += 1
      if (nextRejectsGuard) {
        nextRejectsGuard = false
        throw {
          code: 'ERR_MIGRATION_GUARD',
          message: 'build-stage mock: running dispatch(es) block migration',
        }
      }
      const failAt = failAtPhase
      push('backup', 'ok')
      // backup ok 落 lastEvent(进度行「备份完成 → 路径」的回读面)。
      status = {
        ...status,
        lastEvent: {
          id: `ev-backup-${String(startCalls)}`,
          projectId,
          phase: 'backup',
          result: 'ok',
          detailJson: JSON.stringify({ backupPath: MOCK_MIGRATION_BACKUP_PATH }),
          at: '2026-09-24T08:00:01.000Z',
        },
      }
      if (failAt === 'backup') {
        push('backup', 'fail')
        throw { code: 'ERR_WORKBENCH_DB', message: 'build-stage mock: injected backup failure' }
      }
      for (const phase of ['ingest', 'verify', 'switch', 'archive'] as const) {
        if (failAt === phase) {
          push(phase, 'fail')
          push('rollback', 'ok')
          throw {
            code: phase === 'verify' ? 'ERR_MIGRATION_VERIFY' : 'ERR_WORKBENCH_DB',
            message: `build-stage mock: injected ${phase} failure`,
          }
        }
        push(phase, 'ok')
      }
      status = { ...MOCK_MIGRATION_STATUS_SQLITE, lastEvent: status.lastEvent }
      return { started: true }
    },
    subscribeEvents: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    loadGuard: async () => {
      guardReads += 1
      return guard
    },
    getWorkbenchPaths: async () => MOCK_WORKBENCH_PATHS,
  }
  return {
    face,
    emit,
    setGuard: (snapshot: MigrationGuardSnapshot) => { guard = snapshot },
    settleNextAsSuccess: () => {
      failAtPhase = undefined
      nextRejectsGuard = false
    },
    get startCalls(): number { return startCalls },
    get guardReads(): number { return guardReads },
  }
}

// ---------------------------------------------------------------------------
// UF1 dispatch face, M3 (task 3.9)
// ---------------------------------------------------------------------------

/**
 * The UF1 orchestration family's build-stage twin (task 3.9): the six verbs
 * of contract.ts's DispatchFace as a closure-held state machine over
 * in-memory rows — the page's UF1 wiring and the 3.9 integration suite drive
 * the whole chain (selection → check → confirm → dispatch → reflux badges /
 * approval decide / redispatch) against it, mirroring the kernel's own edge
 * semantics small:
 *
 *   - dispatchTasks mints one `starting` row per key (a fresh batchId per
 *     call, promptHash deterministic per mint) — `blocked` when the armed
 *     missing list is non-empty and acknowledgeMissing is absent (零落行);
 *   - redispatch re-runs the armed check against a FAILED row and mints its
 *     successor (the original row stays as the audit trail);
 *   - decideApproval is the only decision path (pending rows only — an
 *     already-decided row rejects ERR_APPROVAL_DECIDED, the stale-entry face)
 *     and flips the row's dispatch to running/failed with the reflux event;
 *   - the test-facing pokes (failNextDispatch / setMissing / emit) arm the
 *     error/blocked/reflux branches.
 *
 * The twin is TEST/BUILD-ONLY: the page never defaults to it (the real host
 * gets the IPC face; absent verbs keep the UF1 entries inert — mock 全撤).
 */
export interface MockDispatchFaceOptions {
  /** The project the rows/approvals address (defaults to the mock project id). */
  readonly projectId?: string
  /** Pre-seeded dispatch rows (the badge spectrum's initial data). */
  readonly rows?: readonly DispatchRow[]
  /** Pre-seeded approval rows (pending entries the dock lists). */
  readonly approvals?: readonly ApprovalRow[]
  /** The armed missing list checkStageArtifacts answers (the warning door). */
  readonly missing?: readonly MissingItem[]
}

/** Everything the dispatch mock twin exposes beyond the face (the pokes). */
export interface MockDispatchFace extends DispatchFace {
  /** Arm the missing list (checkStageArtifacts + the blocked dispatch leg). */
  setMissing(missing: readonly MissingItem[]): void
  /** Arm the NEXT dispatchTasks/redispatch call to reject (the error dialog leg). */
  failNextDispatch(code?: string, message?: string): void
  /** The test-facing event poke (pushes through the board's own channel). */
  emit(events: readonly WorkbenchEvent[]): void
  /** Wire the twin's internal reflux emits into the BOARD face's emit poke. */
  pipe(sink: (events: readonly WorkbenchEvent[]) => void): void
  /** The live rows (post-mutation reads). */
  readonly rows: readonly DispatchRow[]
  /** The live approvals (post-mutation reads). */
  readonly approvals: readonly ApprovalRow[]
}

/** One seeded row's counter (ids stay stable + unique per mint). */
let mockDispatchSeq = 0

/** The UF1 dispatch/approval verb twin (see {@link MockDispatchFaceOptions}). */
export function createMockDispatchFace(options: MockDispatchFaceOptions = {}): MockDispatchFace {
  const projectId = options.projectId ?? 'mock-project'
  let rows: DispatchRow[] = (options.rows ?? []).map(row => ({ ...row }))
  let approvals: ApprovalRow[] = (options.approvals ?? []).map(row => ({ ...row }))
  let missing: readonly MissingItem[] = options.missing ?? []
  let failNext: { code: string; message: string } | undefined
  const listeners = new Set<(events: readonly WorkbenchEvent[]) => void>()
  const mint = (taskKey: string, batchId: string, state: DispatchState, sessionId: string | null, actor: string): DispatchRow => {
    mockDispatchSeq += 1
    return {
      id: `dsp-${mockDispatchSeq}`,
      batchId,
      projectId,
      featureSlug: taskKey.slice(0, taskKey.lastIndexOf('/')) || taskKey,
      taskKey,
      state,
      sessionId,
      promptHash: `hash-${taskKey.replaceAll('/', '-')}-${mockDispatchSeq}`,
      actor,
      dispatchedAt: new Date().toISOString(),
      endedAt: null,
      error: null,
    }
  }
  const emit = (events: readonly WorkbenchEvent[]): void => {
    for (const listener of listeners) listener(events)
  }
  return {
    checkStageArtifacts: async () => ({ stage: 'tasks', satisfied: missing.length === 0, missing }),
    dispatchTasks: async (input, actor) => {
      if (failNext !== undefined) {
        const envelope = failNext
        failNext = undefined
        throw new Error(JSON.stringify(envelope))
      }
      if (missing.length > 0 && input.acknowledgeMissing !== true) {
        return { blocked: 'artifacts-missing', missing }
      }
      const batchId = `batch-${mockDispatchSeq + 1}`
      const minted = input.taskKeys.map(taskKey => mint(taskKey, batchId, 'starting', null, actor))
      rows = [...rows, ...minted]
      emit(minted.map(row => ({
        type: 'dispatch_updated' as const, projectId, dispatchId: row.id, taskKey: row.taskKey, state: row.state,
      })))
      return { dispatched: minted }
    },
    redispatch: async (dispatchId, actor) => {
      if (failNext !== undefined) {
        const envelope = failNext
        failNext = undefined
        throw new Error(JSON.stringify(envelope))
      }
      const target = rows.find(row => row.id === dispatchId)
      if (target === undefined) {
        throw new Error(JSON.stringify({ code: 'ERR_DISPATCH_NOT_FOUND', message: 'mock: unknown dispatch' }))
      }
      if (target.state !== 'failed') {
        throw new Error(JSON.stringify({ code: 'ERR_DISPATCH_STATE_INVALID', message: 'mock: only failed rows redispatch' }))
      }
      if (missing.length > 0) return { blocked: 'artifacts-missing', missing }
      const successor = mint(target.taskKey, `batch-${mockDispatchSeq + 1}`, 'starting', null, actor)
      rows = [...rows, successor]
      emit([{ type: 'dispatch_updated', projectId, dispatchId: successor.id, taskKey: successor.taskKey, state: successor.state }])
      return { dispatched: [successor] }
    },
    getDispatches: async () => rows,
    listApprovals: async () => [...approvals].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    decideApproval: async (input) => {
      const target = approvals.find(row => row.id === input.approvalId)
      if (target === undefined) {
        throw new Error(JSON.stringify({ code: 'ERR_APPROVAL_NOT_FOUND', message: 'mock: unknown approval' }))
      }
      if (target.state !== 'pending') {
        throw new Error(JSON.stringify({ code: 'ERR_APPROVAL_DECIDED', message: 'mock: approval already decided' }))
      }
      const decided: ApprovalRow = {
        ...target,
        state: input.approve ? 'approved' : 'rejected',
        decidedAt: new Date().toISOString(),
        decidedBy: 'workbench',
      }
      approvals = approvals.map(row => (row.id === decided.id ? decided : row))
      const dispatch = rows.find(row => row.id === decided.dispatchId && row.state === 'awaiting')
      if (dispatch !== undefined) {
        const next: DispatchState = input.approve ? 'running' : 'failed'
        rows = rows.map(row => (row.id === dispatch.id
          ? { ...row, state: next, endedAt: new Date().toISOString(), error: input.approve ? null : '审批请求被拒绝' }
          : row))
        emit([{ type: 'dispatch_updated', projectId, dispatchId: dispatch.id, taskKey: dispatch.taskKey, state: next }])
      }
      return decided
    },
    setMissing: (next) => { missing = next },
    failNextDispatch: (code = 'ERR_DISPATCH_LAUNCH_FAILED', message = 'mock: dispatch rejected') => {
      failNext = { code, message }
    },
    emit,
    pipe: (sink: (events: readonly WorkbenchEvent[]) => void) => { listeners.add(sink) },
    get rows(): readonly DispatchRow[] { return rows },
    get approvals(): readonly ApprovalRow[] { return approvals },
  }
}

// ---------------------------------------------------------------------------
// UF2 stage face, M3 (task 4.3)
// ---------------------------------------------------------------------------

/**
 * The UF2 stage family's seeded assets (task 4.3): the dsh-forge-m2 fixture
 * carries two content-joined rows (the SAME stage vocabulary/order the real
 * verb answers — pipeline order, goal + summary from the doc-root asset
 * files' frontmatter/body). Content-joined = the 4.3 verb-row shape
 * (goal/summary optional on the DTO; the tab degrades missing legs to '').
 */
export const MOCK_STAGE_ASSETS: readonly StageAssetRow[] = Object.freeze([
  Object.freeze({
    stage: 'prd',
    path: 'dsh-forge-m2/stages/prd.md',
    generatedAt: '2026-09-22T10:00:00.000Z',
    goal: '把 forge 项目装进工作台。',
    summary: '三看板 + 会话挂接定形;偏好与编排留 M3。',
  }),
  Object.freeze({
    stage: 'design',
    path: 'dsh-forge-m2/stages/design.md',
    generatedAt: '2026-09-22T11:00:00.000Z',
    goal: 'SQLite 快照与感知链路。',
    summary: '快照可重建;回流 ≤5s;actor 来源序。',
  }),
])

/** The seeded gate (the mock feature sits in the tasks stage, gate open). */
export const MOCK_STAGE_GATE: StageGateInfo = Object.freeze({
  featureSlug: 'dsh-forge-m2',
  stage: 'tasks',
  summaryGenerated: true,
  gateAssetPath: 'dsh-forge-m2/stages/tasks.md',
  assets: MOCK_STAGE_ASSETS,
})

/**
 * The UF2 stage family's build-stage twin (task 4.3): the four members of
 * contract.ts's StageFace as a closure-held state machine mirroring the
 * kernel's own edge semantics small (advance-service.ts 4.1):
 *
 *   - getStageGate answers the seeded gate (setGate re-arms it — the
 *     gate-pending leg seeds summaryGenerated=false + gateAssetPath=null);
 *   - listStageAssets answers the seeded rows (setAssets re-arms);
 *   - advanceStage: gate unsatisfied → the serialized ERR_STAGE_GATE_
 *     UNSATISFIED envelope with the SAME guidance detail string shape the
 *     kernel throws (引导文案 + 缺失清单 leg); satisfied → the stage moves
 *     one pipeline step, the gate re-arms against the NEW stage (fresh
 *     stage's summary not generated — 推进成功后的重复请求 = 新门未满足),
 *     stage_advanced rides the twin's own channel, and the post-advance
 *     FeatureSummary resolves; terminal 'completed' = idempotent no-op
 *     (zero writes, zero events);
 *   - subscribeEvents is the twin's own listener set (emit pokes +
 *     advance reflux).
 *
 * The twin is TEST/BUILD-ONLY (the dispatch-face discipline: advanceStage is
 * a WRITE surface, so the components never default to this twin — absent
 * face members stay inert; tests inject it, 4.4's assembly injects the
 * IPC-backed face).
 */
export interface MockStageFaceOptions {
  /** The project the rows address (defaults to the mock project id). */
  readonly projectId?: string
  /** The feature the gate/rows address (defaults to the mock feature slug). */
  readonly featureSlug?: string
  /** The seeded gate (defaults to MOCK_STAGE_GATE, gate open). */
  readonly gate?: StageGateInfo
  /** The seeded asset rows (defaults to MOCK_STAGE_ASSETS; pipeline-sorted on read). */
  readonly assets?: readonly StageAssetRow[]
}

/** Everything the stage mock twin exposes beyond the face (the pokes). */
export interface MockStageFace extends StageFace {
  /** Re-arm the gate verdict (the gate-pending / re-open legs). */
  setGate(gate: StageGateInfo): void
  /** Re-arm the asset row set (the new-card fade-in leg feeds this). */
  setAssets(assets: readonly StageAssetRow[]): void
  /** Arm the NEXT advanceStage call to reject with an arbitrary envelope (the error leg). */
  failNextAdvance(code?: string, message?: string): void
  /** The test-facing event poke (pushes through the twin's own channel). */
  emit(events: readonly WorkbenchEvent[]): void
  /** The live gate (post-advance reads). */
  readonly gate: StageGateInfo
}

const MOCK_STAGE_PIPELINE: readonly FeatureStatus[] = ['prd', 'design', 'tasks', 'in-progress', 'completed']

/** The UF2 stage verb twin (see {@link MockStageFaceOptions}). */
export function createMockStageFace(options: MockStageFaceOptions = {}): MockStageFace {
  const projectId = options.projectId ?? 'mock-project'
  const featureSlug = options.featureSlug ?? 'dsh-forge-m2'
  let gate: StageGateInfo = { ...(options.gate ?? MOCK_STAGE_GATE), featureSlug }
  let assets: readonly StageAssetRow[] = options.assets ?? MOCK_STAGE_ASSETS
  let failNext: { code: string; message: string } | undefined
  const listeners = new Set<(events: readonly WorkbenchEvent[]) => void>()
  const emit = (events: readonly WorkbenchEvent[]): void => {
    for (const listener of listeners) listener(events)
  }
  const pipelineIndex = (stage: FeatureStatus): number => MOCK_STAGE_PIPELINE.indexOf(stage)
  return {
    getStageGate: async () => ({ ...gate, assets: [...assets] }),
    listStageAssets: async () =>
      [...assets].sort((a, b) => pipelineIndex(a.stage) - pipelineIndex(b.stage)),
    advanceStage: async (_projectId: string, slug: string): Promise<FeatureSummary> => {
      if (failNext !== undefined) {
        const envelope = failNext
        failNext = undefined
        throw new Error(JSON.stringify(envelope))
      }
      const stage = gate.stage
      // 终态幂等 no-op(零写入、零事件)—— 4.1 kernel 口径。
      if (stage === 'completed') {
        return {
          slug, status: 'completed', docKinds: ['manifest', 'prd', 'design', 'ui', 'tasks'],
          taskTotal: 52, taskCompleted: 52, updatedAt: '2026-09-24T08:00:00.000Z',
          deviated: false,
        }
      }
      if (!gate.summaryGenerated) {
        // 与内核同形:code + 引导文案,detail = 缺失清单引导(缺失路径 + 生成路径)。
        throw new Error(JSON.stringify({
          code: 'ERR_STAGE_GATE_UNSATISFIED',
          message: `stage gate unsatisfied: the summary asset of the current stage '${stage}' has not been generated yet`,
          detail: `missing: features/${slug}/stages/${stage}.md — generate it first with the forge_stage_summarize tool (frontmatter { stage: "${stage}", goal } + summary body), then advance again`,
        }))
      }
      const next = MOCK_STAGE_PIPELINE[pipelineIndex(stage) + 1]
      if (next === undefined) {
        throw new Error(JSON.stringify({ code: 'ERR_STAGE_GATE_UNSATISFIED', message: `mock: stage '${stage}' has no successor` }))
      }
      // 推进:门态换新阶段(新阶段总结未生成),资产集不变,事件回流。
      gate = { ...gate, stage: next, summaryGenerated: false, gateAssetPath: null }
      emit([{ type: 'stage_advanced', projectId, featureSlug: slug }])
      return {
        slug, status: next, docKinds: ['manifest', 'prd', 'design', 'ui', 'tasks'],
        taskTotal: 38, taskCompleted: 12, updatedAt: '2026-09-24T08:00:00.000Z',
        // 4.2 口径:内核合法推进 = 偏离标记清除点 → 推进后恒 false。
        deviated: false,
      }
    },
    subscribeEvents: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    setGate: (next) => { gate = { ...next, featureSlug } },
    setAssets: (next) => { assets = next },
    failNextAdvance: (code = 'ERR_WORKBENCH_DB', message = 'mock: advance rejected') => {
      failNext = { code, message }
    },
    emit,
    get gate(): StageGateInfo { return gate },
  }
}


// ---------------------------------------------------------------------------
// Prefs family, UF4 (task 5.1)
// ---------------------------------------------------------------------------

/**
 * The mock forge pref registry — a REPRESENTATIVE projection of the real
 * kernel registry (task 3.1 workbench/prefs/registry.ts), not a parity twin:
 * every group (auto/worktree/coverage/eval) and every type/control pair the
 * UI must render (toggle / number-input / text-input / list-as-text /
 * coverage-input) appears exactly so the component layer is exercised across
 * the whole metadata surface. surfaces.* stays absent BY CONSTRUCTION (PRD
 * D3: structural facts never enter the inheritance chain).
 */
export interface MockPrefKeyDef {
  readonly key: string
  readonly group: PrefRow['group']
  readonly type: PrefRow['type']
  readonly control: PrefRow['control']
  readonly defaultValue?: unknown
}

export const MOCK_PREF_REGISTRY: readonly MockPrefKeyDef[] = Object.freeze([
  Object.freeze({ key: 'auto.test.quick', group: 'auto', type: 'boolean', control: 'toggle', defaultValue: false }),
  Object.freeze({ key: 'auto.test.full', group: 'auto', type: 'boolean', control: 'toggle', defaultValue: true }),
  Object.freeze({ key: 'auto.gitPush', group: 'auto', type: 'boolean', control: 'toggle', defaultValue: false }),
  Object.freeze({ key: 'auto.eval.prd', group: 'auto', type: 'boolean', control: 'toggle', defaultValue: false }),
  Object.freeze({ key: 'worktree.source-branch', group: 'worktree', type: 'text', control: 'text-input' }),
  Object.freeze({ key: 'worktree.includes', group: 'worktree', type: 'list', control: 'text-input' }),
  Object.freeze({
    key: 'coverage.coding.feature', group: 'coverage', type: 'coverage', control: 'coverage-input',
    defaultValue: Object.freeze({ type: 'percentage', percentage: 80 }),
  }),
  Object.freeze({
    key: 'coverage.coding.refactor', group: 'coverage', type: 'coverage', control: 'coverage-input',
    defaultValue: Object.freeze({ type: 'maintain' }),
  }),
  Object.freeze({ key: 'eval.proposal.target', group: 'eval', type: 'number', control: 'number-input', defaultValue: 900 }),
  Object.freeze({ key: 'eval.proposal.iterations', group: 'eval', type: 'number', control: 'number-input', defaultValue: 3 }),
])

/** The build-stage seed: a global + a project override the section inherits from. */
const MOCK_PREF_SEED: Readonly<Record<string, unknown>> = Object.freeze({
  'global:auto.test.full': false,
  'global:worktree.source-branch': 'main',
  'project:mock-project:auto.test.quick': true,
})

/** Classify a PrefScope the way the mock's override store keys it. */
function mockPrefScopeKey(scope: PrefScope): { kind: 'global' | 'project' | 'feature'; id: string } {
  if (scope === 'global') return { kind: 'global', id: '' }
  if ('project' in scope) return { kind: 'project', id: scope.project }
  return { kind: 'feature', id: scope.feature }
}

/** The tier chain a scope resolves through (feature > project > global > default). */
function mockPrefTierKeys(scope: PrefScope): readonly { tier: PrefRow['source']; storeKey: string }[] {
  const { kind, id } = mockPrefScopeKey(scope)
  if (kind === 'global') return [{ tier: 'global', storeKey: 'global:' }]
  if (kind === 'project') {
    return [
      { tier: 'project', storeKey: 'project:' + id + ':' },
      { tier: 'global', storeKey: 'global:' },
    ]
  }
  // feature scopeId = '<projectId>/<featureSlug>' (tech-design Data Models).
  const projectId = id.slice(0, Math.max(0, id.indexOf('/')))
  return [
    { tier: 'feature', storeKey: 'feature:' + id + ':' },
    { tier: 'project', storeKey: 'project:' + projectId + ':' },
    { tier: 'global', storeKey: 'global:' },
  ]
}

/** The serialized rejection the kernel prefs verbs send (plain envelope form). */
const prefEnvelope = (code: string, message: string): { code: string; message: string } => ({ code, message })

/**
 * The UF4 prefs section's verb twin (task 5.1): in-memory per-tier override
 * store + three-tier resolution mirroring workbench/prefs/resolve.ts's shape
 * (feature > project > global > registry default; source null ⟺ no value).
 *
 *   getPrefs          — every MOCK_PREF_REGISTRY key resolved for the scope
 *                      (effective value + source + override/localValue), the
 *                      real verb's every-key contract;
 *   setPrefs          — per-entry key-known + type-shape validation
 *                      (ERR_PREF_KEY_UNKNOWN / ERR_PREF_VALUE_INVALID
 *                      envelopes); entries apply atomically (a rejected
 *                      entry leaves the store untouched);
 *   clearPrefOverride — idempotent own-tier delete (a missing row is a no-op).
 *
 * The returned failGetWith / failSetWith / failClearWith are MOCK-ONLY test
 * drivers arming the NEXT call of that verb with a rejection.
 */
export function createMockPrefsFace(): PrefsFace & {
  /** Arm a rejection for exactly the NEXT getPrefs (the load-error driver). */
  failGetWith(error: { code: string; message: string }): void
  /** Arm a rejection for the next setPrefs of one key (the save-error driver). */
  failSetWith(key: string, error: { code: string; message: string }): void
  /** Arm a rejection for the next clearPrefOverride of one key. */
  failClearWith(key: string, error: { code: string; message: string }): void
} {
  const overrides = new Map<string, unknown>()
  for (const [seedKey, value] of Object.entries(MOCK_PREF_SEED)) overrides.set(seedKey, value)
  let armedGet: { code: string; message: string } | undefined
  const armedSet = new Map<string, { code: string; message: string }>()
  const armedClear = new Map<string, { code: string; message: string }>()

  const ownStoreKey = (scope: PrefScope): string => {
    const { kind, id } = mockPrefScopeKey(scope)
    return kind === 'global' ? 'global:' : kind + ':' + id + ':'
  }

  const validate = (key: string, value: unknown): void => {
    const def = MOCK_PREF_REGISTRY.find(candidate => candidate.key === key)
    if (def === undefined) {
      throw prefEnvelope(
        'ERR_PREF_KEY_UNKNOWN',
        'build-stage mock: preference key ' + JSON.stringify(key) + ' is not in the mock registry',
      )
    }
    const bad = (reason: string): never => {
      throw prefEnvelope(
        'ERR_PREF_VALUE_INVALID',
        'build-stage mock: preference value for ' + JSON.stringify(key) + ' is invalid: ' + reason,
      )
    }
    switch (def.type) {
      case 'boolean':
        if (typeof value !== 'boolean') bad('expected a boolean, got ' + typeof value)
        return
      case 'number':
        if (typeof value !== 'number' || !Number.isInteger(value)) {
          bad('expected an integer, got ' + JSON.stringify(value))
        }
        return
      case 'text':
        if (typeof value !== 'string' || value.trim() === '') {
          bad('expected a non-empty string, got ' + JSON.stringify(value))
        }
        return
      case 'list': {
        const items = typeof value === 'string'
          ? value.split(',')
          : Array.isArray(value) ? value : undefined
        if (items === undefined || items.some(item => typeof item !== 'string')) {
          bad('expected a comma-separated string or a string array, got ' + JSON.stringify(value))
        }
        return
      }
      case 'coverage': {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          const strategy = value as { type?: unknown; percentage?: unknown }
          if (strategy.type === 'maintain') return
          if (
            strategy.type === 'percentage' && typeof strategy.percentage === 'number'
            && Number.isInteger(strategy.percentage) && strategy.percentage >= 0 && strategy.percentage <= 100
          ) return
        }
        bad('expected a CoverageStrategy, got ' + JSON.stringify(value))
      }
    }
  }

  return {
    getPrefs: async (scope: PrefScope): Promise<PrefRow[]> => {
      if (armedGet !== undefined) {
        const failure = armedGet
        armedGet = undefined
        throw failure
      }
      const own = ownStoreKey(scope)
      const chain = mockPrefTierKeys(scope)
      return MOCK_PREF_REGISTRY.map((def): PrefRow => {
        let value: unknown = undefined
        let source: PrefRow['source'] = null
        for (const link of chain) {
          const hit = overrides.get(link.storeKey + def.key)
          if (hit !== undefined) {
            value = hit
            source = link.tier
            break
          }
        }
        if (value === undefined && def.defaultValue !== undefined) {
          value = def.defaultValue
          source = 'default'
        }
        const localRaw = overrides.get(own + def.key)
        return {
          key: def.key,
          group: def.group,
          type: def.type,
          control: def.control,
          value: value ?? null,
          source,
          override: localRaw !== undefined,
          localValue: localRaw ?? null,
          defaultValue: def.defaultValue ?? null,
        }
      })
    },
    setPrefs: async (scope: PrefScope, entries: readonly PrefEntry[]): Promise<void> => {
      const pending = entries.map((entry) => {
        const failure = armedSet.get(entry.key)
        if (failure !== undefined) {
          armedSet.delete(entry.key) // one-shot (the documented NEXT-call arm)
          throw failure
        }
        validate(entry.key, entry.value)
        return entry
      })
      // Atomic: validation of the whole batch precedes any write (no half-batch).
      for (const entry of pending) overrides.set(ownStoreKey(scope) + entry.key, entry.value)
    },
    clearPrefOverride: async (scope: PrefScope, key: string): Promise<void> => {
      const failure = armedClear.get(key)
      if (failure !== undefined) {
        armedClear.delete(key) // one-shot
        throw failure
      }
      overrides.delete(ownStoreKey(scope) + key)
    },
    failGetWith: (error) => { armedGet = error },
    failSetWith: (key, error) => { armedSet.set(key, error) },
    failClearWith: (key, error) => { armedClear.set(key, error) },
  }
}


// ---------------------------------------------------------------------------
// Proposals family, UF5 (task 5.4)
// ---------------------------------------------------------------------------

/**
 * The seeded proposal board (task 5.4 — the approved prototype's registry in
 * the KERNEL's own baseline order): created desc with slug-asc ties, the full
 * four-status spectrum, one feature-less early-pipeline pair (徽标不渲染),
 * and hasEval true exactly where the eval fixture map carries a report.
 */
export const MOCK_PROPOSAL_BOARD: ProposalBoardData = Object.freeze({
  proposals: Object.freeze([
    Object.freeze({
      slug: 'dsh-forge-m2', status: 'accepted', author: 'faner', created: '2026-09-22',
      featureSlug: 'dsh-forge-m2', hasEval: true, updatedAt: '2026-09-22T10:00:00.000Z',
    }),
    Object.freeze({
      slug: 'dsh-forge-m3', status: 'draft', author: 'faner', created: '2026-09-22',
      featureSlug: 'dsh-forge-m3', hasEval: true, updatedAt: '2026-09-22T11:00:00.000Z',
    }),
    Object.freeze({
      slug: 'ui-plugin-foundation', status: 'accepted', author: 'faner', created: '2026-09-21',
      featureSlug: 'ui-plugin-foundation', hasEval: true, updatedAt: '2026-09-21T09:00:00.000Z',
    }),
    Object.freeze({
      slug: 'skill-marketplace', status: 'draft', author: 'faner', created: '2026-09-20',
      featureSlug: null, hasEval: false, updatedAt: '2026-09-20T09:00:00.000Z',
    }),
    Object.freeze({
      slug: 'forge-tui', status: 'rejected', author: 'faner', created: '2026-09-18',
      featureSlug: null, hasEval: true, updatedAt: '2026-09-18T09:00:00.000Z',
    }),
    Object.freeze({
      slug: 'gen-and-run', status: 'superseded', author: 'faner', created: '2026-09-15',
      featureSlug: null, hasEval: false, updatedAt: '2026-09-15T09:00:00.000Z',
    }),
  ]),
  generatedAt: '2026-09-24T08:00:00.000Z',
  proposalsRoot: 'Z:/docs/demo/docs/proposals',
})

/** The seeded proposal documents, keyed `<slug>/<kind>` (readProposalDoc's twin). */
export const MOCK_PROPOSAL_DOCS: ReadonlyMap<string, ProposalDoc> = new Map<string, ProposalDoc>([
  ['dsh-forge-m3/proposal', Object.freeze({
    kind: 'proposal',
    markdown: '# M3 流程即产品\n\n任务执行 subagent 化(派发时预合成三要素 systemPrompt + 并行 + 看板编排审批);任务 CRUD 应用 API + SoT 分治(SQLite 权威);CLI 退役收口;强制阶段化;偏好三级;提案看板。\n\n- 决策日志:显式迁移 / customSkillDirs / 偏好三级化\n',
  })],
  ['dsh-forge-m3/eval', Object.freeze({
    kind: 'eval',
    markdown: '# Eval 报告 — proposal\n\nSCORE: 902/1000(达标);基线 848 → 终值 902。\n',
  })],
  ['dsh-forge-m2/proposal', Object.freeze({
    kind: 'proposal',
    markdown: '# M2 需求与会话工作台\n\n项目注册(仓内/仓外文档位置)、任务/feature/文档三看板、会话挂接与发起链、插件基座落地。\n',
  })],
  ['dsh-forge-m2/eval', Object.freeze({
    kind: 'eval',
    markdown: '# Eval 报告 — proposal\n\nSCORE: 886/1000(达标)。\n',
  })],
  ['ui-plugin-foundation/proposal', Object.freeze({
    kind: 'proposal',
    markdown: '# UI 插件工程基座\n\n两级插件模型(forge 核心 = 必备不可禁用);SQLite 数据内核入壳方向声明;插件清单迁出壳代码为产品级配置。\n',
  })],
  ['ui-plugin-foundation/eval', Object.freeze({
    kind: 'eval',
    markdown: '# Eval 报告 — proposal\n\nSCORE: 871/1000(达标)。\n',
  })],
  ['skill-marketplace/proposal', Object.freeze({
    kind: 'proposal',
    markdown: '# Skill 市场(草案)\n\n第三方技能发现与安装;依赖 customSkillDirs 承载。管线早期形态:尚无关联 feature(正常态,徽标不渲染)。\n',
  })],
  ['forge-tui/proposal', Object.freeze({
    kind: 'proposal',
    markdown: '# forge CLI TUI 化\n\n以终端 UI 承载看板。评审结论:与「应用化 + CLI 退役」路线冲突,拒绝。\n',
  })],
  ['forge-tui/eval', Object.freeze({
    kind: 'eval',
    markdown: '# Eval 报告 — proposal\n\nSCORE: 620/1000(未达标,路线冲突)。\n',
  })],
  ['gen-and-run/proposal', Object.freeze({
    kind: 'proposal',
    markdown: '# gen-and-run 一体化命令\n\n已被 dsh-forge-m3「流程即产品」方案取代(subagent 派发取代命令直跑)。\n',
  })],
])

/** Everything the proposals mock twin exposes beyond the face (the pokes). */
export interface MockProposalsFace extends ProposalFace {
  /** Re-arm the board (the reflux legs feed this; the next loadBoard serves it). */
  setBoard(board: ProposalBoardData): void
  /** Overwrite one document's markdown (the detail reflux legs). */
  setDoc(slug: string, kind: 'proposal' | 'eval', markdown: string): void
  /** Arm the NEXT loadBoard call to reject (the error/retry branch). */
  failNextBoard(code?: string, message?: string): void
  /** Arm the NEXT readProposalDoc call to reject (the doc error/retry branch). */
  failNextDoc(code?: string, message?: string): void
  /** The test-facing event poke (pushes through the twin's own channel). */
  emit(events: readonly WorkbenchEvent[]): void
}

/** The UF5 proposals verb twin (see {@link MockProposalsFace}). */
export function createMockProposalsFace(options: { projectId?: string; board?: ProposalBoardData } = {}): MockProposalsFace {
  const projectId = options.projectId ?? 'mock-project'
  let board = options.board ?? MOCK_PROPOSAL_BOARD
  const docs = new Map<string, ProposalDoc>(MOCK_PROPOSAL_DOCS)
  let failNextBoard: { code: string; message: string } | undefined
  let failNextDoc: { code: string; message: string } | undefined
  const listeners = new Set<(events: readonly WorkbenchEvent[]) => void>()
  const envelopeError = (failure: { code: string; message: string }): never => {
    throw new Error(JSON.stringify(failure))
  }
  return {
    loadBoard: async (requestProjectId: string): Promise<ProposalBoardData> => {
      if (requestProjectId !== projectId) {
        throw new Error(JSON.stringify({
          code: 'ERR_PROJECT_NOT_FOUND',
          message: `mock: unknown project '${requestProjectId}'`,
        }))
      }
      if (failNextBoard !== undefined) {
        const failure = failNextBoard
        failNextBoard = undefined
        envelopeError(failure)
      }
      return board
    },
    readProposalDoc: async (input: { projectId: string; slug: string; kind: 'proposal' | 'eval' }): Promise<ProposalDoc> => {
      if (failNextDoc !== undefined) {
        const failure = failNextDoc
        failNextDoc = undefined
        envelopeError(failure)
      }
      const doc = docs.get(`${input.slug}/${input.kind}`)
      if (doc === undefined) {
        throw new Error(JSON.stringify({
          code: 'ERR_PROPOSAL_NOT_FOUND',
          message: `mock: no ${input.kind} document for proposal '${input.slug}'`,
        }))
      }
      return doc
    },
    subscribeEvents: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    setBoard: (next) => { board = next },
    setDoc: (slug, kind, markdown) => { docs.set(`${slug}/${kind}`, { kind, markdown }) },
    failNextBoard: (code = 'ERR_WORKBENCH_DB', message = 'mock: board read rejected') => {
      failNextBoard = { code, message }
    },
    failNextDoc: (code = 'ERR_PROPOSAL_NOT_FOUND', message = 'mock: doc read rejected') => {
      failNextDoc = { code, message }
    },
    emit: (events) => {
      for (const listener of listeners) listener(events)
    },
  }
}
