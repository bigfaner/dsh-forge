// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createIpcOverviewFace, createIpcPluginFace, createIpcRegisterWizardVerbs,
} from '../src/client/ipc/workbench.ts'
import {
  createWorkbenchStateStore, INITIAL_WORKBENCH_STATE_SNAPSHOT,
} from '../src/client/store/workbench-state.ts'
import { OverviewView } from '../src/client/views/overview/OverviewView.tsx'
import { WorkbenchShell } from '../src/client/WorkbenchShell.tsx'
import { en, type WorkbenchKey } from '../src/client/locale/en.ts'
import type {
  PluginRow, Project, RegisterProjectInput, WorkbenchState,
} from '../src/client/ipc-types.ts'
import type { WorkbenchIpcBridge } from '../src/client/ipc/workbench.ts'
import type { WorkbenchShellProps } from '../src/client/contract.ts'
import type { ViewKeySnapshot, WorkbenchTabKey } from '../src/client/store/view-key.ts'

// Task 5.14 — the UF1 overview ASSEMBLY units (real IPC over the
// window.dshForge.workbench boundary; jsdom fakes, no Electron):
//   AC2 真数据链路 — the IPC faces forward the qualified verb args and fold
//       rejections to the plain envelope; register → refresh → activate →
//       rename → remove all ride the bridge through the shell.
//   AC3 getState 单次 — the store coalesces the mount kicks (chrome + page
//       = ONE round trip); the registry is the single source the chrome,
//       page, and wizard read.
//   AC4 注册闭环 — the completed wizard refreshes the store (the new card
//       is immediately visible) and toasts 提示可切换.
//   AC1 四要素 — the store form renders the page's four-state machine over
//       the bridge data (the build legs ride overview.spec.tsx).
// The wizard's step-①/② probes deliberately stay on the build-stage twin
// (no Interface 1 probe verb) — the register leg below exercises exactly
// that composition: mock-permissive probe, REAL submit verb.

// The shell integration renders the real WorkbenchShell — the task-board.spec
// standins for the ui-primitives / ReactFlow lib boundaries.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconBranchOutline16: () => null,
  StateDot: (props: { state: string }) => <span data-mock-state-dot={props.state} />,
}))
vi.mock('@xyflow/react', async () => await import('./helpers/xyflow-standin'))

type Dict = Record<WorkbenchKey, string>
const bind = (dict: Dict) => (key: WorkbenchKey): string => dict[key]
const t = bind(en)

const $ = (selector: string): HTMLElement => document.querySelector(selector) as HTMLElement
const $$ = (selector: string): HTMLElement[] =>
  [...document.querySelectorAll(selector)] as HTMLElement[]

/** The mock twin's registry ids — must NEVER render on the real path. */
const MOCK_IDS = ['6f1a2d3e-8b44-4c9a-9d01-3c7f5a2b9e10', 'b2c93f57-1e6a-4d88-8f0c-2a9d4e7b1c53']

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  delete (globalThis as { dshForge?: unknown }).dshForge
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const project = (id: string, displayName: string, codeRoot: string): Project => ({
  id, displayName, codeRoot, docLocationType: 'in_repo', docLocationPath: null,
  createdAt: '2026-09-22T08:00:00.000Z', lastActivatedAt: null,
  // M4 v3 columns (task 1.3).
  archived: false, sortOrder: 0, projectionState: 'pending', docsPlacement: 'repo-existing',
})

const REAL_PROJECTS: Project[] = [
  project('real-p1', 'real-one', 'Z:\\real\\one'),
  project('real-p2', 'real-two', 'Z:\\real\\two'),
]

const REAL_PLUGIN_ROWS: PluginRow[] = [
  { name: '@deepseek-ai/dsh-base', mandatory: true, enabled: true },
  { name: '@dsh-forge/plugin-forge-workbench', mandatory: true, enabled: true },
  { name: '@dsh-forge/plugin-hello-world', mandatory: false, enabled: true },
]

/**
 * A STATEFUL registry bridge: the verbs mutate a closure-held WorkbenchState
 * with the main-process transaction semantics (single activation, remove
 * migrates the pointer), so refresh-consistency assertions run against the
 * real verb→getState chain shape.
 */
function registryBridge(initial: WorkbenchState = {
  projects: [...REAL_PROJECTS],
  activeProjectId: 'real-p1',
  plugins: [...REAL_PLUGIN_ROWS],
}) {
  let state = initial
  const calls = {
    getState: 0, registerProject: [] as RegisterProjectInput[], activateProject: [] as string[],
    updateProject: [] as Array<[string, object]>, removeProject: [] as string[],
    listPlugins: 0, setPluginEnabled: [] as Array<[string, boolean]>,
  }
  let eventsCallback: ((events: readonly object[]) => void) | undefined
  const unsubscribe = vi.fn()
  const notFound = (id: string): never => {
    throw new Error(JSON.stringify({ code: 'ERR_PROJECT_NOT_FOUND', message: `no project ${id}` }))
  }
  const fake = {
    getState: async (): Promise<WorkbenchState> => {
      calls.getState += 1
      return state
    },
    registerProject: async (input: RegisterProjectInput): Promise<Project> => {
      calls.registerProject.push(input)
      const row = project(`real-new-${calls.registerProject.length}`,
        input.displayName ?? 'new-project', input.codeRoot)
      state = { ...state, projects: [...state.projects, row] }
      return row
    },
    updateProject: async (id: string, patch: { displayName?: string }): Promise<Project> => {
      calls.updateProject.push([id, patch])
      const row = state.projects.find(candidate => candidate.id === id)
      if (row === undefined) notFound(id)
      const updated = { ...row, displayName: patch.displayName ?? row.displayName }
      state = { ...state, projects: state.projects.map(candidate => (candidate.id === id ? updated : candidate)) }
      return updated
    },
    removeProject: async (id: string): Promise<void> => {
      calls.removeProject.push(id)
      const projects = state.projects.filter(candidate => candidate.id !== id)
      if (projects.length === state.projects.length) notFound(id)
      // The REAL verb's semantics (repos/projects.ts): removing the row
      // CLEARS the active pointer — no first-remaining migration (a ui-design
      // UF1 divergence the main-side owns; the assembly reflects the verb).
      state = {
        ...state,
        projects,
        activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
      }
    },
    activateProject: async (id: string): Promise<void> => {
      calls.activateProject.push(id)
      if (!state.projects.some(candidate => candidate.id === id)) notFound(id)
      state = { ...state, activeProjectId: id }
    },
    listPlugins: async (): Promise<PluginRow[]> => {
      calls.listPlugins += 1
      return state.plugins
    },
    setPluginEnabled: async (name: string, enabled: boolean): Promise<PluginRow[]> => {
      calls.setPluginEnabled.push([name, enabled])
      state = {
        ...state,
        plugins: state.plugins.map(row => (row.name === name
          ? { ...row, enabled: row.mandatory && !enabled ? row.enabled : enabled }
          : row)),
      }
      return state.plugins
    },
    onEvents: (callback: (events: readonly object[]) => void): (() => void) => {
      eventsCallback = callback
      return unsubscribe
    },
  } as unknown as WorkbenchIpcBridge
  return {
    fake, calls, unsubscribe,
    get state(): WorkbenchState { return state },
    emit: (events: readonly object[]): void => { eventsCallback?.(events) },
  }
}

/** Install a full bridge fake over the jsdom boundary. */
function installBridge(overrides: Partial<WorkbenchIpcBridge> = {}): WorkbenchIpcBridge {
  const fake = {
    getState: async () => ({}) as WorkbenchState,
    registerProject: async () => ({}),
    updateProject: async () => ({}),
    removeProject: async () => undefined,
    activateProject: async () => undefined,
    getTaskBoard: async () => ({}),
    getTaskDetail: async () => ({}),
    getFeatureBoard: async () => ({}),
    readFeatureDoc: async () => ({}),
    listPlugins: async () => [],
    setPluginEnabled: async () => [],
    recordSessionLink: async () => ({}),
    endSessionLink: async () => undefined,
    authorizeExternalDocPath: async () => undefined,
    // M3 migration pair + UF3 integration reads (task 1.7): the presence
    // check walks every declared bridge member.
    getMigrationStatus: async () => ({ authority: 'files', deviated: false, migratedAt: null, lastEvent: null, indexJsonDetected: false }),
    startMigration: async () => ({ started: true }),
    probeCodeRoot: async () => ({ available: true, taskTotal: 0, featureTotal: 0, indexJsonDetected: false }),
    getWorkbenchPaths: async () => ({ docsRoot: 'Z:/userData/workbench/docs', backupsRoot: 'Z:/userData/workbench/backups' }),
    // M3 task verbs (task 2.1): the presence check walks every declared member.
    taskAdd: async () => ({}) as never,
    taskClaim: async () => ({}) as never,
    taskTransition: async () => ({}) as never,
    taskSubmit: async () => ({}) as never,
    taskReopen: async () => ({}) as never,
    taskGet: async () => ({}) as never,
    taskQuery: async () => [],
    // M3 knowledge + feature-read verbs (task 2.2): same presence walk.
    knowledgeFact: async () => ({}) as never,
    knowledgeLesson: async () => ({}) as never,
    knowledgeResearch: async () => ({}) as never,
    knowledgeForensic: async () => ({}) as never,
    featureList: async () => [],
    featureStatus: async () => ({}) as never,
    // M3 prefs verbs (task 3.1): same presence walk.
    getPrefs: async () => [],
    setPrefs: async () => undefined,
    clearPrefOverride: async () => undefined,
    // 任务 3.5 host 回调 relay 段(BRIDGE_MEMBERS presence check 全员可调)。
    receiveApproval: async () => ({ id: 'a-1', dispatchId: 'd-1', projectId: 'p1', taskKey: 'demo/1.1', sessionId: 'session-x', payload: {}, state: 'pending', createdAt: '', decidedAt: null, decidedBy: null }),
    decideApproval: async () => ({ id: 'a-1', dispatchId: 'd-1', projectId: 'p1', taskKey: 'demo/1.1', sessionId: 'session-x', payload: {}, state: 'approved', createdAt: '', decidedAt: null, decidedBy: null }),
    notifySessionStarted: async () => ({ id: 'd-1', batchId: 'b-1', projectId: 'p1', featureSlug: 'demo', taskKey: 'demo/1.1', state: 'running', sessionId: 'session-x', promptHash: 'h', actor: 'workbench', dispatchedAt: '', endedAt: null, error: null }),
    notifyLaunchFailed: async () => ({ id: 'd-1', batchId: 'b-1', projectId: 'p1', featureSlug: 'demo', taskKey: 'demo/1.1', state: 'failed', sessionId: null, promptHash: 'h', actor: 'workbench', dispatchedAt: '', endedAt: null, error: 'boom' }),
    // 任务 3.9 UF1 人侧编排段(BRIDGE_MEMBERS presence check 全员可调)。
    checkStageArtifacts: async () => ({ stage: 'tasks', satisfied: true, missing: [] }),
    dispatchTasks: async () => ({ dispatched: [] }),
    redispatch: async () => ({ dispatched: [] }),
    getDispatches: async () => [],
    listApprovals: async () => [],
    // M3 stages 写段(任务 4.1;BRIDGE_MEMBERS presence check 全员可调)。
    advanceStage: async () => ({ slug: 'demo', status: 'tasks', docKinds: [], taskTotal: 0, taskCompleted: 0, updatedAt: '' }),
    stageSummarize: async () => ({ stage: 'tasks', path: 'demo/stages/tasks.md', generatedAt: '', featureStage: 'tasks', gateOpen: true }),
    // M3 stages 读段(任务 4.3;preload 面自 3.2/4.1 已携带)。
    getStageGate: async () => ({ featureSlug: 'demo', stage: 'tasks', summaryGenerated: false, gateAssetPath: null, assets: [] }),
    listStageAssets: async () => [],
    // M3 proposals 读段(任务 5.3;BRIDGE_MEMBERS presence check 全员可调)。
    getProposalBoard: async () => ({ proposals: [], generatedAt: '', proposalsRoot: 'Z:/docs/proposals' }),
    readProposalDoc: async () => ({ kind: 'proposal', markdown: '' }),
    // M4 v3 项目中心段(任务 1.3;presence check 全员可调)。
    probeProjectPath: async () => ({}) as never,
    renameProject: async () => ({}) as never,
    archiveProject: async () => ({}) as never,
    restoreProject: async () => ({}) as never,
    listProjects: async () => [],
    onEvents: () => () => {},
    ...overrides,
  } as unknown as WorkbenchIpcBridge
  ;(globalThis as { dshForge?: unknown }).dshForge = { workbench: fake }
  return fake
}

// ---------------------------------------------------------------------------
// The IPC faces (AC2): qualified args + normalized rejections
// ---------------------------------------------------------------------------

describe('the IPC faces: 1:1 verb mapping with QUALIFIED args + normalized rejections', () => {
  it('the overview face forwards every verb in the Interface 1 argument order', async () => {
    const getState = vi.fn(async () => ({}) as WorkbenchState)
    const activateProject = vi.fn(async () => undefined)
    const updateProject = vi.fn(async () => ({}))
    const removeProject = vi.fn(async () => undefined)
    const face = createIpcOverviewFace(
      installBridge({ getState, activateProject, updateProject, removeProject }),
    )
    await face.loadState()
    await face.activateProject('real-p2')
    await face.updateProject('real-p1', { displayName: 'renamed' })
    await face.removeProject('real-p2')
    expect(getState).toHaveBeenCalledTimes(1)
    expect(activateProject).toHaveBeenCalledWith('real-p2')
    expect(updateProject).toHaveBeenCalledWith('real-p1', { displayName: 'renamed' })
    expect(removeProject).toHaveBeenCalledWith('real-p2')
  })

  it('a serialized-envelope rejection re-throws as the PLAIN shape; unknowns take the ERR_WORKBENCH_DB 兜底', async () => {
    const updateProject = vi.fn(async (): Promise<Project> => {
      throw new Error(JSON.stringify({ code: 'ERR_PROJECT_NOT_FOUND', message: 'removed concurrently' }))
    })
    const removeProject = vi.fn(async (): Promise<void> => { throw new Error('ENOENT: gone') })
    const face = createIpcOverviewFace(installBridge({ updateProject, removeProject }))
    await expect(face.updateProject('gone', { displayName: 'x' })).rejects.toMatchObject({
      code: 'ERR_PROJECT_NOT_FOUND',
      message: 'removed concurrently',
    })
    await expect(face.removeProject('gone')).rejects.toMatchObject({ code: 'ERR_WORKBENCH_DB' })
  })

  it('the plugin face forwards listPlugins and setPluginEnabled(name, enabled); the mandatory guard envelope stays plain', async () => {
    const listPlugins = vi.fn(async () => [] as PluginRow[])
    const setPluginEnabled = vi.fn(async (): Promise<PluginRow[]> => {
      throw new Error(JSON.stringify({ code: 'ERR_PLUGIN_MANDATORY', message: 'cannot disable' }))
    })
    const face = createIpcPluginFace(installBridge({ listPlugins, setPluginEnabled }))
    await face.listPlugins()
    await expect(face.setPluginEnabled('@dsh-forge/plugin-hello-world', false)).rejects.toMatchObject({
      code: 'ERR_PLUGIN_MANDATORY',
    })
    expect(listPlugins).toHaveBeenCalledTimes(1)
    expect(setPluginEnabled).toHaveBeenCalledWith('@dsh-forge/plugin-hello-world', false)
  })

  it('the wizard WRITE pair forwards registerProject(input) / updateProject(id, patch)', async () => {
    const registerProject = vi.fn(async () => project('x', 'x', 'Z:\\x'))
    const updateProject = vi.fn(async () => project('x', 'x', 'Z:\\x'))
    const verbs = createIpcRegisterWizardVerbs(installBridge({ registerProject, updateProject }))
    const input: RegisterProjectInput = { codeRoot: 'Z:\\new', docLocationType: 'in_repo' }
    await verbs.registerProject(input)
    await verbs.updateProject('x', { displayName: 'renamed' })
    expect(registerProject).toHaveBeenCalledWith(input)
    expect(updateProject).toHaveBeenCalledWith('x', { displayName: 'renamed' })
    await expect(verbs.registerProject({ codeRoot: 'Z:\\dup', docLocationType: 'in_repo' })
      .then(() => {
        registerProject.mockImplementationOnce(async (): Promise<Project> => {
          throw new Error(JSON.stringify({ code: 'ERR_PROJECT_EXISTS', message: 'dup' }))
        })
        return verbs.registerProject({ codeRoot: 'Z:\\dup', docLocationType: 'in_repo' })
      })).rejects.toMatchObject({ code: 'ERR_PROJECT_EXISTS' })
  })

  it('fix-1 defect C: the wizard\'s ERR_PROJECT_EXISTS branch stays reachable over the real-IPC wire form', async () => {
    // Over a real ipcMain.handle, Electron 44 re-wraps the rejection as
    // `Error invoking remote method '<channel>': WorkbenchIpcError: {json}` —
    // the envelope only survives as a trailing substring of the message
    // (experimentally verified on this repo's chain, T-test-run). The
    // code-keyed [data-dsh-forge-wizard-exists] submit face rides exactly
    // this leg; with the strict whole-message parse it degraded to
    // ERR_WORKBENCH_DB and the face was unreachable over real IPC.
    const mainSide = new Error(JSON.stringify({ code: 'ERR_PROJECT_EXISTS', message: 'code root already registered' }))
    mainSide.name = 'WorkbenchIpcError'
    const registerProject = vi.fn(async (): Promise<Project> => {
      throw new Error(`Error invoking remote method 'dsh-forge:workbench-register-project': ${String(mainSide)}`)
    })
    const verbs = createIpcRegisterWizardVerbs(installBridge({ registerProject }))
    await expect(verbs.registerProject({ codeRoot: 'Z:\\dup', docLocationType: 'in_repo' }))
      .rejects.toMatchObject({ code: 'ERR_PROJECT_EXISTS' })
  })
})

// ---------------------------------------------------------------------------
// The store (AC3): one getState, 失联 signals, refresh consistency
// ---------------------------------------------------------------------------

describe('createWorkbenchStateStore', () => {
  it('starts unresolved; refresh resolves the state and notifies (loading → ready)', async () => {
    const registry = registryBridge()
    const store = createWorkbenchStateStore(registry.fake)
    expect(store.getSnapshot()).toBe(INITIAL_WORKBENCH_STATE_SNAPSHOT)
    const listener = vi.fn()
    store.subscribe(listener)
    const state = await store.refresh()
    expect(state.activeProjectId).toBe('real-p1')
    expect(store.getSnapshot()).toMatchObject({ phase: 'ready', state })
    expect(listener).toHaveBeenCalledTimes(1)
    store.dispose()
  })

  it('coalesces concurrent refreshes into ONE getState (首屏单次拉取)', async () => {
    const registry = registryBridge()
    const store = createWorkbenchStateStore(registry.fake)
    const [a, b] = await Promise.all([store.refresh(), store.refresh()])
    expect(a).toBe(b)
    expect(registry.calls.getState).toBe(1)
    // A later (sequential) refresh is a fresh read — mutations re-pull.
    await store.refresh()
    expect(registry.calls.getState).toBe(2)
    store.dispose()
  })

  it('a refresh failure rejects the normalized envelope, keeps the last good state, and recovers', async () => {
    const registry = registryBridge()
    let fail = false
    const flaky: WorkbenchIpcBridge = {
      ...registry.fake,
      getState: async (): Promise<WorkbenchState> => {
        if (fail) throw new Error(JSON.stringify({ code: 'ERR_WORKBENCH_DB', message: 'down' }))
        return registry.fake.getState()
      },
    }
    const store = createWorkbenchStateStore(flaky)
    await store.refresh()
    fail = true
    await expect(store.refresh()).rejects.toMatchObject({ code: 'ERR_WORKBENCH_DB', message: 'down' })
    expect(store.getSnapshot()).toMatchObject({ phase: 'error', state: { activeProjectId: 'real-p1' } })
    fail = false
    await store.refresh()
    expect(store.getSnapshot().phase).toBe('ready')
    store.dispose()
  })

  it('sync events drive the 失联 signals: error marks lost, recovery clears; task events are none of this store\'s concern', async () => {
    const registry = registryBridge()
    const store = createWorkbenchStateStore(registry.fake)
    await store.refresh()
    const listener = vi.fn()
    store.subscribe(listener)
    registry.emit([{ type: 'task_updated', projectId: 'real-p1', taskKey: 'demo/1.1', source: null, changeKind: 'attribute' }])
    expect(listener).not.toHaveBeenCalled()
    registry.emit([{ type: 'sync', projectId: 'real-p2', sync: { state: 'error', lastScanAt: null, error: 'watch degraded' } }])
    expect(store.getSnapshot().lostProjectIds).toEqual(['real-p2'])
    registry.emit([{ type: 'sync', projectId: 'real-p2', sync: { state: 'idle', lastScanAt: 'now' } }])
    expect(store.getSnapshot().lostProjectIds).toEqual([])
    store.dispose()
  })

  it('dispose tears the event subscription down (the single-subscriber verb\'s unsubscribe)', async () => {
    const registry = registryBridge()
    const store = createWorkbenchStateStore(registry.fake)
    await store.refresh()
    store.dispose()
    expect(registry.unsubscribe).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// OverviewView (AC1/AC2): the real chain vs the seat/build forms
// ---------------------------------------------------------------------------

describe('OverviewView: form selection + the real chain', () => {
  it('the store form renders the BRIDGE registry + the IPC plugin face (mock fixtures never render)', async () => {
    const registry = registryBridge()
    const store = createWorkbenchStateStore(registry.fake)
    render(<OverviewView t={t} store={store} />)
    await waitFor(() => { expect($$('[data-dsh-forge-project-card]')).toHaveLength(2) })
    expect($('[data-dsh-forge-project-card="real-p1"]')).not.toBeNull()
    expect($('[data-dsh-forge-project-card="real-p2"]')).not.toBeNull()
    for (const id of MOCK_IDS) {
      expect(document.querySelector(`[data-dsh-forge-project-card="${id}"]`)).toBeNull()
    }
    await waitFor(() => { expect(registry.calls.listPlugins).toBe(1) })
    expect($$('[data-dsh-forge-plugin-row]')).toHaveLength(3)
    store.dispose()
  })

  it('the seat form wins over the store (the explicit test seam)', async () => {
    const registry = registryBridge()
    const store = createWorkbenchStateStore(registry.fake)
    const loadState = vi.fn(async () => ({
      projects: [project('seat-p', 'seat-project', 'Z:\\seat')],
      activeProjectId: 'seat-p',
      plugins: [],
    }))
    render(<OverviewView t={t} seat={{ face: { loadState } }} store={store} />)
    await waitFor(() => { expect($('[data-dsh-forge-project-card="seat-p"]')).not.toBeNull() })
    expect(loadState).toHaveBeenCalledTimes(1)
    expect(registry.calls.getState).toBe(0) // the store's chain never ran
    store.dispose()
  })

  it('a store-absent mount is the 5.3 build-stage form (its own mock twin)', async () => {
    render(<OverviewView t={t} />)
    await waitFor(() => { expect($$('[data-dsh-forge-project-card]')).toHaveLength(2) })
    expect($(`[data-dsh-forge-project-card="${MOCK_IDS[0]}"]`)).not.toBeNull()
  })

  it('the store\'s sync-error events drive the 失联 badge + the active-project error card', async () => {
    const registry = registryBridge()
    const store = createWorkbenchStateStore(registry.fake)
    render(<OverviewView t={t} store={store} />)
    await waitFor(() => { expect($$('[data-dsh-forge-project-card]')).toHaveLength(2) })
    registry.emit([{ type: 'sync', projectId: 'real-p1', sync: { state: 'error', lastScanAt: null, error: 'lost' } }])
    await waitFor(() => {
      expect($('[data-dsh-forge-overview-lost]')).not.toBeNull()
      expect($('[data-dsh-forge-card-lost-badge]')).not.toBeNull()
    })
    store.dispose()
  })
})

// ---------------------------------------------------------------------------
// Shell integration (AC2/AC3/AC4): the whole family over the real bridge
// ---------------------------------------------------------------------------

/** The view-key machine harness (the feature-board-assembly precedent). */
function makeViewFace(initial: Partial<ViewKeySnapshot> = {}) {
  let snapshot: ViewKeySnapshot = {
    view: 'workbench', workbenchTab: 'workbench/overview', featureSlug: undefined, ...initial,
  }
  const selectWorkbenchTab = vi.fn((tab: WorkbenchTabKey) => {
    snapshot = { ...snapshot, workbenchTab: tab, featureSlug: undefined }
  })
  const openFeatureDetail = vi.fn((slug: string) => {
    snapshot = { view: 'workbench', workbenchTab: 'workbench/features', featureSlug: slug }
  })
  return {
    props: {
      useViewKey: (selector: (current: ViewKeySnapshot) => ViewKeySnapshot) => selector(snapshot),
      selectWorkbenchTab,
      openFeatureDetail,
    } satisfies Pick<WorkbenchShellProps, 'useViewKey' | 'selectWorkbenchTab' | 'openFeatureDetail'>,
    selectWorkbenchTab,
  }
}

async function renderShell(registry: ReturnType<typeof registryBridge>) {
  installBridge(registry.fake)
  const viewFace = makeViewFace()
  render(<WorkbenchShell t={t as WorkbenchShellProps['t']} {...viewFace.props} />)
  await waitFor(() => { expect($$('[data-dsh-forge-project-card]')).toHaveLength(2) })
  return { viewFace }
}

describe('shell integration: the overview family over the real bridge', () => {
  it('mock 全撤: the chrome switcher AND the grid render the bridge registry; ONE getState serves the first paint', async () => {
    const registry = registryBridge()
    await renderShell(registry)
    // The grid: real rows, never the mock fixtures.
    expect($('[data-dsh-forge-project-card="real-p1"]')).not.toBeNull()
    for (const id of MOCK_IDS) {
      expect(document.querySelector(`[data-dsh-forge-project-card="${id}"]`)).toBeNull()
    }
    // The chrome: the switcher trigger names the REAL active project.
    expect($('[data-dsh-forge-switcher-trigger]').textContent).toContain('real-one')
    // AC3: the chrome kick + the page's first loadState coalesced into one read.
    expect(registry.calls.getState).toBe(1)
  })

  it('AC4: register through the wizard → the new card is immediately visible + the 提示可切换 toast', async () => {
    const registry = registryBridge()
    await renderShell(registry)
    fireEvent.click($('[data-dsh-forge-add-project]'))
    await waitFor(() => { expect($('[data-dsh-forge-wizard-path-input]')).not.toBeNull() })
    // Step ①: the build-stage probe twin is permissive for unknown paths —
    // the REAL validation is the submit verb below.
    fireEvent.change($('[data-dsh-forge-wizard-path-input]'), { target: { value: 'Z:\\brand\\new' } })
    await waitFor(() => { expect($('[data-dsh-forge-wizard-probe="detected"]')).not.toBeNull() })
    fireEvent.click($('[data-dsh-forge-wizard-next]'))
    await waitFor(() => { expect($('[data-dsh-forge-wizard-doc-external]')).not.toBeNull() })
    // M3 flip (task 1.7): 仓外应用管理路径 is now the DEFAULT — this
    // registration opts back IN-REPO explicitly (the bridge probe reports no
    // index.json, so the form stays three-step).
    fireEvent.click($('[data-dsh-forge-wizard-doc-in-repo]'))
    fireEvent.click($('[data-dsh-forge-wizard-next]'))
    await waitFor(() => { expect($('[data-dsh-forge-wizard-finish]')).not.toBeNull() })
    fireEvent.click($('[data-dsh-forge-wizard-finish]'))
    // The REAL verb fired with the built RegisterProjectInput…
    await waitFor(() => { expect(registry.calls.registerProject.length).toBe(1) })
    expect(registry.calls.registerProject).toEqual([
      { codeRoot: 'Z:/brand/new', docLocationType: 'in_repo', docLocationPath: null },
    ])
    // …the registry refreshed (the new card is immediately visible) and the
    // toast names the project + carries the 提示可切换 guidance (AC4).
    await waitFor(() => { expect($('[data-dsh-forge-project-card="real-new-1"]')).not.toBeNull() })
    await waitFor(() => {
      expect($('[data-dsh-forge-shell-toast]').textContent).toContain('new-project')
    })
    expect($('[data-dsh-forge-shell-toast]').textContent)
      .toContain(en['overview.toast.registered'].replace('{name}', 'new-project'))
  })

  it('activate through the card fires the real verb and re-reads the registry (single activation)', async () => {
    const registry = registryBridge()
    await renderShell(registry)
    expect($('[data-dsh-forge-project-card="real-p1"]').getAttribute('data-active')).toBe('true')
    fireEvent.click($('[data-dsh-forge-project-card="real-p2"] [data-dsh-forge-card-action="activate"]'))
    await waitFor(() => { expect(registry.calls.activateProject).toEqual(['real-p2']) })
    await waitFor(() => {
      expect($('[data-dsh-forge-project-card="real-p2"]').getAttribute('data-active')).toBe('true')
      expect($('[data-dsh-forge-project-card="real-p1"]').getAttribute('data-active')).toBe('false')
    })
    // The chrome marker moved with the same read model.
    expect($('[data-dsh-forge-switcher-trigger]').textContent).toContain('real-two')
  })

  it('rename through the card fires updateProject(id, { displayName }) and refreshes', async () => {
    const registry = registryBridge()
    await renderShell(registry)
    fireEvent.click($('[data-dsh-forge-project-card="real-p1"] [data-dsh-forge-card-action="rename"]'))
    const input = $('[data-dsh-forge-card-rename-input]') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'real-one-renamed' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(registry.calls.updateProject).toEqual([['real-p1', { displayName: 'real-one-renamed' }]])
    })
    await waitFor(() => {
      expect($('[data-dsh-forge-project-card="real-p1"]').textContent).toContain('real-one-renamed')
    })
  })

  it('remove through the card + confirm fires removeProject; the real verb clears the active pointer (no migration toast)', async () => {
    const registry = registryBridge()
    await renderShell(registry)
    fireEvent.click($('[data-dsh-forge-project-card="real-p1"] [data-dsh-forge-card-action="remove"]'))
    fireEvent.click($('[data-dsh-forge-remove-confirm]'))
    await waitFor(() => { expect(registry.calls.removeProject).toEqual(['real-p1']) })
    await waitFor(() => { expect($('[data-dsh-forge-project-card="real-p1"]')).toBeNull() })
    // The REAL verb's pointer semantics: removing the ACTIVE row cleared the
    // pointer (repos/projects.ts) — no card holds the marker, no migration
    // toast (the mock twin's migrate behavior is the build-stage demo's).
    await waitFor(() => {
      expect($('[data-dsh-forge-project-card="real-p2"]').getAttribute('data-active')).toBe('false')
    })
    expect($('[data-dsh-forge-overview-toast]')).toBeNull()
    expect($('[data-dsh-forge-switcher-trigger]').textContent).not.toContain('real-one')
  })

  it('the chrome switcher activation goes through the real verb too', async () => {
    const registry = registryBridge()
    await renderShell(registry)
    fireEvent.click($('[data-dsh-forge-switcher-trigger]'))
    fireEvent.click($('[data-dsh-forge-switcher-item="real-p2"]'))
    await waitFor(() => { expect(registry.calls.activateProject).toEqual(['real-p2']) })
    await waitFor(() => {
      expect($('[data-dsh-forge-switcher-trigger]').textContent).toContain('real-two')
    })
  })

  it('AC1: a failing first getState surfaces the page\'s retryable load-error card (boundary end-to-end)', async () => {
    let fail = true
    const registry = registryBridge()
    installBridge({
      ...registry.fake,
      getState: async (): Promise<WorkbenchState> => {
        if (fail) throw new Error(JSON.stringify({ code: 'ERR_WORKBENCH_DB', message: 'down' }))
        return registry.fake.getState()
      },
    })
    const viewFace = makeViewFace()
    render(<WorkbenchShell t={t as WorkbenchShellProps['t']} {...viewFace.props} />)
    await waitFor(() => { expect($('[data-dsh-forge-overview-load-error]')).not.toBeNull() })
    // The chrome never fell back to the mock fixtures while unresolved.
    expect($('[data-dsh-forge-switcher-trigger]').textContent).not.toContain('dsh-forge')
    fail = false
    fireEvent.click($('[data-dsh-forge-overview-retry]'))
    await waitFor(() => { expect($$('[data-dsh-forge-project-card]')).toHaveLength(2) })
  })
})
