// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import type { Context } from '@deepseek-ai/cordis'
import type { StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import {
  ProjectSidebarSeat, PROJECT_SWITCH_CLASS,
  toSessionsFace, toSidebarRightFace, toUiWorkspaceFace, toWorkspacesSource,
} from '../src/client/nav/project-seat.tsx'
import { installProjectPanelRow, installWorkspacesSeat, normalizeBootDefaultView } from '../src/client/nav/slot-inject.ts'
import { isProjectPanelActive, PROJECT_PANEL_ID, PROJECT_PANEL_ORDER } from '../src/client/nav/panel-info.ts'
import { ViewSwitchController } from '../src/client/nav/view-switch.ts'
import { createViewKeyStore } from '../src/client/store/view-key.ts'
import { createActiveProjectStore } from '../src/client/store/active-project.ts'
import { SIDEBAR_SLOT, WORKSPACES_SLOT } from '../src/client/contract.ts'
import { createMockConfirmCardFace, MOCK_WORKBENCH_STATE } from '../src/client/mocks/workbench.ts'
import type { WorkbenchEvent, Project, WorkbenchState } from '../src/client/ipc-types.ts'
import type { WorkbenchIpcBridge } from '../src/client/ipc/workbench.ts'
import { zh } from '../src/client/locale/zh.ts'
import type { WorkbenchKey } from '../src/client/locale/en.ts'

// Task 1.6 — the P1 integration units (UF1/UF2/UF7):
//   AC1 启动首屏 = conversation 默认落点 + active_project_id 恢复/写入 + 空态引导
//   AC2 panellist「项目」行:order 首项 / selectPanel(null) / activePanelId==null
//      / M1 既有 workbench 行不受影响
//   AC3 sidebar.workspaces 座位注入:shadowing 替换渲染(声明合并纯增量,
//      数据面只读 + listProjects 经 store)/ 上游槽位机制零修改
//   AC4 原位换台 #28:同项目零动作;异项目一次性 0.22s 过渡(reduced-motion
//      降级)+ 换台重置(hero + 右栏收起)
//   AC5 C7 唯一入口:左栏 ＋ / 空态引导同卡;创建成功原位生效(树刷新 +
//      指针切换)
//   AC6 this suite itself (vitest + jsdom)

// The upstream glyphs resolve through the module table at runtime (browser
// bundle); the npm node entry carries undeclared transitive deps only the
// upstream monorepo supplies — the jsdom mount stubs them (project-tree.spec
// precedent; the real glyphs ride the e2e).
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  StateDot: (props: { state: string }) => <span data-mock-state-dot={props.state} />,
  IconFolderClose16: () => null,
  IconFolderOpen16: () => null,
  IconTriangleRightFill14: () => null,
  IconSearchOutline16: () => null,
  IconPersonalizationOutline16: () => null,
  IconPlusOutline16: () => null,
  IconNewChatOutline16: () => null,
  IconSettingsOutline16: () => null,
  IconChevronLeftOutline14: () => null,
}))

const bind = (dict: Record<WorkbenchKey, string>) => (key: WorkbenchKey): string => dict[key]
const t = bind(zh)

const NOW = Date.parse('2026-09-29T10:00:00.000Z')

function makeProject(id: string, overrides: Partial<Project> = {}): Project {
  return {
    id,
    displayName: id,
    codeRoot: `Z:/work/${id}`,
    docLocationType: 'in_repo',
    docLocationPath: null,
    createdAt: '2026-09-20T08:00:00.000Z',
    lastActivatedAt: null,
    archived: false,
    sortOrder: 0,
    projectionState: 'pending',
    docsPlacement: 'repo-existing',
    ...overrides,
  }
}

const PROJECT_A = makeProject('alpha', { sortOrder: 0 })
const PROJECT_B = makeProject('beta', { sortOrder: 1 })

// ---------------------------------------------------------------------------
// Fakes: bridge / upstream snapshot sources / cordis ctx
// ---------------------------------------------------------------------------

/** A scripted fake bridge carrying the verbs this task consumes. */
function makeFakeBridge(initial: { projects: Project[]; activeProjectId: string | null }) {
  const state: { projects: Project[]; activeProjectId: string | null } = { ...initial }
  const calls = { activate: [] as string[], getState: 0 }
  let push: ((events: readonly WorkbenchEvent[]) => void) | undefined
  const bridge = {
    getState: async (): Promise<WorkbenchState> => {
      calls.getState += 1
      return { projects: state.projects, activeProjectId: state.activeProjectId, plugins: [] }
    },
    activateProject: async (id: string): Promise<void> => {
      calls.activate.push(id)
      state.activeProjectId = id
    },
    onEvents: (dispatch: (events: readonly WorkbenchEvent[]) => void): (() => void) => {
      push = dispatch
      return () => { push = undefined }
    },
  }
  return {
    bridge: bridge as unknown as WorkbenchIpcBridge,
    state,
    calls,
    emit: (events: readonly WorkbenchEvent[]): void => { push?.(events) },
  }
}

/** A controllable observable source (the upstream snapshot currency). */
function makeSource<T>(initial: T) {
  let snapshot = initial
  const listeners = new Set<() => void>()
  return {
    source: {
      getSnapshot: (): T => snapshot,
      subscribe: (listener: () => void): (() => void) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    },
    set: (next: T): void => {
      snapshot = next
      for (const listener of [...listeners]) listener()
    },
    listenerCount: (): number => listeners.size,
  }
}

function makeWorkspaces(items: Array<{ workspaceId: string; path: string; title: string; sessionIds: string[] }>) {
  return makeSource<{ items: typeof items; archivedSessionIds: string[] }>({
    items,
    archivedSessionIds: [],
  })
}

interface FakeSummary {
  readonly id: string
  readonly title?: string
  readonly displayTitle: string
  readonly parentId?: string
  readonly origin?: 'subagent'
  readonly running: boolean
  readonly blank: boolean
  readonly updatedAt: number
}

function makeSessions(rows: FakeSummary[], retainedMain?: string) {
  const ids = rows.map(row => row.id)
  const byId: Record<string, FakeSummary | undefined> = {}
  for (const row of rows) byId[row.id] = row
  const retained = makeSource({ retainedBy: retainedMain === undefined ? {} : { mainView: 1 } })
  return {
    ...makeSource<{ ids: string[]; byId: typeof byId }>({ ids, byId }),
    retainInfo: () => retained.source,
    retained,
  }
}

/** Fake client ctx over the real SlotCore (the slot-nav.spec pattern). */
function makeFakeCtx(core: SlotCore): Context {
  const ctx = {
    effect(fn: () => (() => void) | undefined | void): () => void {
      const dispose = fn()
      return () => dispose?.()
    },
    get: (): unknown => undefined,
    locale: {
      register: () => () => {},
      bind: () => (key: string) => key,
    },
    slots: {
      register: (options: object, component: unknown) =>
        core.register(options as Parameters<SlotCore['register']>[0], component as never),
      inject(key: string, callback: () => (() => void) | undefined | void): () => void {
        let disposeActive: (() => void) | undefined
        const reconcile = (): void => {
          if (core.specDynamic(key) === undefined) return
          disposeActive?.()
          const dispose = callback()
          disposeActive = () => dispose?.()
        }
        const unsubscribe = core.subscribeDeclaration(key, reconcile)
        reconcile()
        return () => {
          unsubscribe()
          disposeActive?.()
        }
      },
      spec: (key: string) => core.specDynamic(key),
    },
  }
  return ctx as unknown as Context
}

// ---------------------------------------------------------------------------
// Shared seat mount
// ---------------------------------------------------------------------------

type MockFn = ReturnType<typeof vi.fn>

interface SeatWorld {
  bridgeFake: ReturnType<typeof makeFakeBridge>
  store: ReturnType<typeof createActiveProjectStore>
  workspaces: ReturnType<typeof makeWorkspaces>
  sessions: ReturnType<typeof makeSessions>
  uiWorkspace: {
    startSession: MockFn
    openSession: MockFn
    forkSession: MockFn
    archiveSession: MockFn
  }
  sidebarRight: {
    isExpanded: MockFn
    toggleExpanded: MockFn
    openTab: MockFn
    close: MockFn
    focus: MockFn
    openTabs: { getSnapshot: MockFn }
  }
}

async function makeSeatWorld(initial: { projects: Project[]; activeProjectId: string | null }): Promise<SeatWorld> {
  const bridgeFake = makeFakeBridge(initial)
  const store = createActiveProjectStore(bridgeFake.bridge)
  await act(async () => { await store.refresh() })
  const workspaces = makeWorkspaces([
    { workspaceId: 'ws-alpha', path: 'Z:\\work\\alpha', title: 'alpha', sessionIds: ['s-top'] },
    { workspaceId: 'ws-beta', path: 'Z:\\work\\beta', title: 'beta', sessionIds: [] },
  ])
  const sessions = makeSessions([
    { id: 's-top', displayTitle: '顶层会话', running: false, blank: false, updatedAt: NOW - 60_000 },
    { id: 's-sub', displayTitle: '子代理会话', parentId: 's-top', origin: 'subagent', running: true, blank: false, updatedAt: NOW - 30_000 },
    { id: 's-loose', displayTitle: '未分组会话', running: false, blank: false, updatedAt: NOW - 120_000 },
  ], 's-top')
  const uiWorkspace = {
    startSession: vi.fn(),
    openSession: vi.fn(),
    forkSession: vi.fn(),
    archiveSession: vi.fn(),
  }
  // M4 2.2: the 换台重置 seam consumes the tabs-model face (close/focus/
  // openTab + the open-tab inventory beside the 1.6 collapse pair).
  const sidebarRight = {
    isExpanded: vi.fn(() => false),
    toggleExpanded: vi.fn(),
    openTab: vi.fn(),
    close: vi.fn(),
    focus: vi.fn(),
    openTabs: { getSnapshot: vi.fn(() => [] as Array<{ tabId: string; kind: string }>) },
  }
  return { bridgeFake, store, workspaces, sessions, uiWorkspace, sidebarRight }
}

function mountSeat(world: SeatWorld, overrides: Record<string, unknown> = {}) {
  const props = {
    t,
    wide: true,
    store: world.store,
    cardFace: createMockConfirmCardFace(makeStateOf(world)),
    workspaces: world.workspaces.source,
    sessions: { ...world.sessions.source, retainInfo: world.sessions.retainInfo },
    uiWorkspace: world.uiWorkspace,
    sidebarRight: world.sidebarRight,
    ...overrides,
  }
  return render(<ProjectSidebarSeat {...props} />)
}

const makeStateOf = (world: SeatWorld): WorkbenchState => ({
  projects: world.bridgeFake.state.projects,
  activeProjectId: world.bridgeFake.state.activeProjectId,
  plugins: [],
})

// ---------------------------------------------------------------------------
// AC1 — 启动首屏默认 + 指针
// ---------------------------------------------------------------------------

describe('AC1: boot default + active-project pointer', () => {
  it('normalizeBootDefaultView: a persisted workbench view lands on the conversation (启动首屏)', () => {
    const writes: Array<{ view: string }> = []
    const store = createViewKeyStore({
      read: () => ({ view: 'workbench', workbenchTab: 'workbench/overview' }),
      write: (value) => { writes.push(value) },
    })
    const controller = new ViewSwitchController(store)
    normalizeBootDefaultView(store, controller)
    expect(store.getSnapshot().view).toBe('session')
    expect(writes.at(-1)?.view).toBe('session')
  })

  it('normalizeBootDefaultView: an already-conversation boot is a no-op', () => {
    const store = createViewKeyStore({ read: () => ({ view: 'session', workbenchTab: 'workbench/overview' }), write: () => {} })
    const controller = new ViewSwitchController(store)
    const controllerSpy = vi.spyOn(controller, 'switchSession')
    normalizeBootDefaultView(store, controller)
    expect(controllerSpy).not.toHaveBeenCalled()
  })

  it('the store restores the pointer from getState (恢复上次活跃项目) and re-pulls on project_list_changed', async () => {
    const fake = makeFakeBridge({ projects: [PROJECT_A, PROJECT_B], activeProjectId: PROJECT_B.id })
    const store = createActiveProjectStore(fake.bridge)
    await act(async () => { await store.refresh() })
    expect(store.getSnapshot()).toEqual({
      phase: 'ready', projects: [PROJECT_A, PROJECT_B], activeProjectId: PROJECT_B.id,
    })
    // 树刷新: a register/remove completion push re-pulls the registry.
    fake.state.projects = [PROJECT_A]
    fake.state.activeProjectId = PROJECT_A.id
    await act(async () => { fake.emit([{ type: 'project_list_changed' }]) })
    await waitFor(() => { expect(store.getSnapshot().projects).toHaveLength(1) })
    store.dispose()
  })

  it('switchProject: same project = zero action; different = optimistic pointer + the ONE verb write', async () => {
    const fake = makeFakeBridge({ projects: [PROJECT_A, PROJECT_B], activeProjectId: PROJECT_A.id })
    const store = createActiveProjectStore(fake.bridge)
    await act(async () => { await store.refresh() })
    expect(store.switchProject(PROJECT_A.id)).toEqual({ changed: false })
    expect(fake.calls.activate).toHaveLength(0)
    expect(store.switchProject(PROJECT_B.id)).toEqual({ changed: true })
    expect(store.getSnapshot().activeProjectId).toBe(PROJECT_B.id) // 树即时高亮
    await waitFor(() => { expect(fake.calls.activate).toEqual([PROJECT_B.id]) })
    store.dispose()
  })

  it('switchProject: a rejected verb write reverts the optimistic pointer', async () => {
    const fake = makeFakeBridge({ projects: [PROJECT_A, PROJECT_B], activeProjectId: PROJECT_A.id })
    const failing = { ...fake.bridge, activateProject: () => Promise.reject({ code: 'ERR_PROJECT_NOT_FOUND', message: 'gone' }) } as WorkbenchIpcBridge
    const store = createActiveProjectStore(failing)
    await act(async () => { await store.refresh() })
    store.switchProject(PROJECT_B.id)
    await waitFor(() => { expect(store.getSnapshot().activeProjectId).toBe(PROJECT_A.id) })
    store.dispose()
  })
})

// ---------------------------------------------------------------------------
// AC2 — panellist「项目」行
// ---------------------------------------------------------------------------

describe('AC2: the panellist「项目」row', () => {
  let core: SlotCore
  let disposeAll: Array<() => void>

  beforeEach(() => {
    core = new SlotCore()
    disposeAll = []
    disposeAll.push(core.register(
      {
        name: 'root',
        children: {
          [SIDEBAR_SLOT]: { kind: 'list', scope: 'root' },
          [WORKSPACES_SLOT]: { kind: 'single', scope: 'root' },
        },
      },
      () => null,
    ))
  })
  afterEach(() => {
    for (const dispose of disposeAll) dispose()
    cleanup()
  })

  it('registers FIRST (order 首项) beside the untouched upstream/M1 rows, null-addressed', () => {
    // The upstream plugins row (ui-plugin-manager) and the M1 workbench row.
    disposeAll.push(core.register({ name: SIDEBAR_SLOT, id: 'plugins' as never, order: 0 }, () => null))
    disposeAll.push(core.register({ name: SIDEBAR_SLOT, id: 'workbench' as never, order: 10 }, () => null))
    disposeAll.push(installProjectPanelRow(makeFakeCtx(core), { label: () => '项目' }))

    // ui-sidebar's syncPanels projection verbatim: entriesOfSlot → sorted rows.
    const rows = core.entriesOfSlot(SIDEBAR_SLOT).map(({ options }) => ({
      id: options.id, order: options.order ?? 0,
    })).sort((a, b) => a.order - b.order)
    expect(rows).toEqual([
      { id: null, order: PROJECT_PANEL_ORDER }, // 首项 = the project row
      { id: 'plugins', order: 0 }, // 上游行不受影响
      { id: 'workbench', order: 10 }, // M1 既有行不受影响
    ])
    expect(PROJECT_PANEL_ID).toBeNull()
  })

  it('the upstream PanelRow projection: click = selectPanel(null), selected = activePanelId === null', () => {
    disposeAll.push(installProjectPanelRow(makeFakeCtx(core), { label: () => '项目' }))
    const selected: unknown[] = []
    const layout = { selectPanel: (id: unknown): void => { selected.push(id) } }
    // SidebarRoot's PanelRow, verbatim: active = activePanelId === id; click =
    // selectPanel(id) — with the row's null id both reduce to the AC form.
    const rows = core.entriesOfSlot(SIDEBAR_SLOT).map(({ options }) => options)
    const row = rows.find(options => options.id === null)
    expect(row).toBeDefined()
    const activeAtBoot = (null === row!.id) // usePanelInfo(info => info.activePanelId === id)
    layout.selectPanel(row!.id)
    expect(activeAtBoot).toBe(true)
    expect(selected).toEqual([null]) // 点击 = selectPanel(null)
    expect(isProjectPanelActive(null)).toBe(true) // 选中态 = activePanelId==null
    expect(isProjectPanelActive('workbench' as never)).toBe(false)
  })

  it('dispose removes the row and the raw entry list keeps the other rows intact', () => {
    disposeAll.push(core.register({ name: SIDEBAR_SLOT, id: 'plugins' as never, order: 0 }, () => null))
    const disposeRow = installProjectPanelRow(makeFakeCtx(core), { label: () => '项目' })
    expect(core.entries(SIDEBAR_SLOT)).toHaveLength(2)
    disposeRow()
    expect(core.entries(SIDEBAR_SLOT)).toHaveLength(1)
    expect(core.entries(SIDEBAR_SLOT)[0]?.options.id).toBe('plugins')
  })
})

// ---------------------------------------------------------------------------
// AC3 — sidebar.workspaces 座位注入(shadowing 替换渲染)
// ---------------------------------------------------------------------------

describe('AC3: the sidebar.workspaces shadowing seat', () => {
  let core: SlotCore
  let disposeAll: Array<() => void>

  beforeEach(() => {
    core = new SlotCore()
    disposeAll = []
    disposeAll.push(core.register(
      { name: 'root', children: { [WORKSPACES_SLOT]: { kind: 'single', scope: 'root' } } },
      () => null,
    ))
  })
  afterEach(() => {
    for (const dispose of disposeAll) dispose()
    cleanup()
  })

  it('shadows the native browser at a lower priority (lowest renders), leaving it registered', () => {
    // ui-workspace's native browser registers at the default priority 0.
    const NativeBrowser = (): null => null
    disposeAll.push(core.register({ name: WORKSPACES_SLOT }, NativeBrowser))
    disposeAll.push(installWorkspacesSeat(makeFakeCtx(core), { t }))

    const winners = core.entriesOfSlot(WORKSPACES_SLOT)
    expect(winners).toHaveLength(1)
    expect(winners[0]?.component).toBe(ProjectSidebarSeat)
    expect(winners[0]?.options.priority).toBe(-100)
    // The shadowed native entry stays registered (crash/teardown fallback).
    expect(core.entries(WORKSPACES_SLOT)).toHaveLength(2)
  })

  it('disposing the seat restores the native browser as the winner', () => {
    const NativeBrowser = (): null => null
    disposeAll.push(core.register({ name: WORKSPACES_SLOT }, NativeBrowser))
    const disposeSeat = installWorkspacesSeat(makeFakeCtx(core), { t })
    disposeSeat()
    const winners = core.entriesOfSlot(WORKSPACES_SLOT)
    expect(winners).toHaveLength(1)
    expect(winners[0]?.component).toBe(NativeBrowser)
  })

  it('renders the tree over the read-only data face: registry rows + upstream workspace/session pairing', async () => {
    const world = await makeSeatWorld({ projects: [PROJECT_A, PROJECT_B], activeProjectId: PROJECT_A.id })
    mountSeat(world)
    // 项目行(数据面 = listProjects 经 getState;只读 sources 只被订阅)。
    expect(document.querySelector('[data-dsh-forge-tree-project="alpha"]')).not.toBeNull()
    expect(document.querySelector('[data-dsh-forge-tree-project="beta"]')).not.toBeNull()
    // 会话行归组:ws-alpha ↔ codeRoot Z:/work/alpha 配对;s-loose 未分组。
    await waitFor(() => { expect(document.querySelector('[data-dsh-forge-tree-session="s-top"]')).not.toBeNull() })
    expect(document.querySelector('[data-dsh-forge-tree-ungrouped]')).not.toBeNull()
    expect(world.workspaces.listenerCount()).toBeGreaterThan(0)
    // The main-view retained session drives the highlight + ancestor chain.
    expect(document.querySelector('[data-dsh-forge-tree-session="s-top"]')?.getAttribute('aria-current')).toBe('true')
  })
})

// ---------------------------------------------------------------------------
// AC4 — 原位换台 #28
// ---------------------------------------------------------------------------

describe('AC4: 原位换台 (project row click)', () => {
  afterEach(() => { cleanup() })

  it('same project = zero action, zero animation', async () => {
    const world = await makeSeatWorld({ projects: [PROJECT_A, PROJECT_B], activeProjectId: PROJECT_A.id })
    mountSeat(world)
    fireEvent.click(document.querySelector('[data-dsh-forge-tree-project="alpha"]')!)
    expect(world.bridgeFake.calls.activate).toHaveLength(0)
    expect(document.querySelector(`.${PROJECT_SWITCH_CLASS}`)).toBeNull()
    expect(world.uiWorkspace.startSession).not.toHaveBeenCalled()
  })

  it('different project = pointer write + ONE 0.22s transition + 换台重置 (hero draft + rightbar collapse)', async () => {
    const world = await makeSeatWorld({ projects: [PROJECT_A, PROJECT_B], activeProjectId: PROJECT_A.id })
    world.sidebarRight.isExpanded = vi.fn(() => true)
    mountSeat(world)
    fireEvent.click(document.querySelector('[data-dsh-forge-tree-project="beta"]')!)
    // 切换项目即写指针.
    await waitFor(() => { expect(world.bridgeFake.calls.activate).toEqual([PROJECT_B.id]) })
    // 一次性 0.22s 过渡:the remount wrapper carries the animation class and
    // the scoped keyframes style exists.
    const wrapper = document.querySelector('[data-dsh-forge-switch-count]')
    expect(wrapper?.classList.contains(PROJECT_SWITCH_CLASS)).toBe(true)
    expect(document.querySelector('style[data-dsh-forge-project-switch]')).not.toBeNull()
    // 换台重置:激活会话清空回 hero over the new project's workspace + 右栏收起.
    expect(world.uiWorkspace.startSession).toHaveBeenCalledWith('ws-beta')
    expect(world.sidebarRight.toggleExpanded).toHaveBeenCalledTimes(1)
    // Repeated clicks on the now-active project stay zero-action.
    fireEvent.click(document.querySelector('[data-dsh-forge-tree-project="beta"]')!)
    expect(world.bridgeFake.calls.activate).toHaveLength(1)
  })

  it('prefers-reduced-motion degrades to no animation (no class, no style)', async () => {
    // A sibling test's document-global style tag must not leak in (the
    // injection is idempotent per document, not per test).
    document.querySelector('style[data-dsh-forge-project-switch]')?.remove()
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: true,
      addEventListener: (): void => {},
      removeEventListener: (): void => {},
    }))
    try {
      const world = await makeSeatWorld({ projects: [PROJECT_A, PROJECT_B], activeProjectId: PROJECT_A.id })
      mountSeat(world)
      fireEvent.click(document.querySelector('[data-dsh-forge-tree-project="beta"]')!)
      await waitFor(() => { expect(world.bridgeFake.calls.activate).toEqual([PROJECT_B.id]) })
      expect(document.querySelector(`.${PROJECT_SWITCH_CLASS}`)).toBeNull()
      expect(document.querySelector('style[data-dsh-forge-project-switch]')).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

// ---------------------------------------------------------------------------
// AC5 — C7 唯一入口 + 创建成功原位生效
// ---------------------------------------------------------------------------

describe('AC5: the C7 card behind every entry', () => {
  afterEach(() => cleanup())

  it('无项目 → 空态引导 reaches the SAME card (guide button → card opens)', async () => {
    const world = await makeSeatWorld({ projects: [], activeProjectId: null })
    mountSeat(world)
    const guide = document.querySelector('[data-dsh-forge-project-empty]')
    expect(guide).not.toBeNull()
    expect(document.querySelector('[data-dsh-forge-tree]')).toBeNull()
    fireEvent.click(document.querySelector('[data-dsh-forge-project-empty-add]')!)
    await waitFor(() => { expect(document.querySelector('[data-dsh-forge-confirm-code]')).not.toBeNull() })
  })

  it('the 区头 ＋ opens the card over a populated tree (不跳页 — no panel switch)', async () => {
    const world = await makeSeatWorld({ projects: [PROJECT_A], activeProjectId: PROJECT_A.id })
    mountSeat(world)
    fireEvent.click(document.querySelector('[data-dsh-forge-tree-add-btn]')!)
    await waitFor(() => { expect(document.querySelector('[data-dsh-forge-confirm-code]')).not.toBeNull() })
  })

  it('register success lands 原位生效: card closes, pointer switches, toast shows', async () => {
    const world = await makeSeatWorld({ projects: [PROJECT_A], activeProjectId: PROJECT_A.id })
    mountSeat(world)
    fireEvent.click(document.querySelector('[data-dsh-forge-tree-add-btn]')!)
    const code = await waitFor(() => document.querySelector<HTMLInputElement>('[data-dsh-forge-confirm-code]')!)
    fireEvent.change(code, { target: { value: 'Z:/work/legacy-repo' } })
    const submit = await waitFor(() => {
      const button = document.querySelector<HTMLButtonElement>('[data-dsh-forge-confirm-submit]')!
      expect(button.disabled).toBe(false)
      return button
    })
    fireEvent.click(submit)
    // 原位生效:卡收起 + 活跃指针切换 + 落位 toast。
    await waitFor(() => { expect(world.bridgeFake.calls.activate.at(-1)).toMatch(/^mock-confirm-project-/) })
    await waitFor(() => { expect(document.querySelector('[data-dsh-forge-confirm-code]')).toBeNull() })
    expect(document.querySelector('[data-dsh-forge-project-toast]')?.textContent).toContain('legacy-repo')
  })

  it('已注册快车道: probing a registered root toasts and switches in place', async () => {
    const world = await makeSeatWorld({ projects: [PROJECT_A, PROJECT_B], activeProjectId: PROJECT_B.id })
    mountSeat(world)
    fireEvent.click(document.querySelector('[data-dsh-forge-tree-add-btn]')!)
    const code = await waitFor(() => document.querySelector<HTMLInputElement>('[data-dsh-forge-confirm-code]')!)
    fireEvent.change(code, { target: { value: 'Z:/work/alpha' } })
    await waitFor(() => { expect(world.bridgeFake.calls.activate).toContain(PROJECT_A.id) })
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-project-toast]')?.textContent).toContain('alpha')
    })
  })

  it('hostless (no card face): the ＋ stays inert — no silent mock', async () => {
    const world = await makeSeatWorld({ projects: [PROJECT_A], activeProjectId: PROJECT_A.id })
    mountSeat(world, { cardFace: undefined })
    fireEvent.click(document.querySelector('[data-dsh-forge-tree-add-btn]')!)
    expect(document.querySelector('[data-dsh-forge-confirm-code]')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// The AC3/AC5 record-level guard: the empty state rides the real mock fixture
// ---------------------------------------------------------------------------

describe('integration fixtures sanity', () => {
  it('the shared mock state still carries v3 project columns (the store face contract)', () => {
    expect(MOCK_WORKBENCH_STATE.projects.every(project => typeof project.sortOrder === 'number')).toBe(true)
    expect(MOCK_WORKBENCH_STATE.projects.every(project => typeof project.archived === 'boolean')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Seat behavior seams: rail form, row commands, adapters (AC3/AC4 legs)
// ---------------------------------------------------------------------------

describe('seat behavior seams', () => {
  afterEach(() => cleanup())

  it('collapsed rail (wide=false): the ＋ opens the same card; expand rides expandSidebar', async () => {
    const world = await makeSeatWorld({ projects: [PROJECT_A], activeProjectId: PROJECT_A.id })
    const expandSidebar = vi.fn()
    mountSeat(world, { wide: false, expandSidebar })
    expect(document.querySelector('[data-dsh-forge-tree-rail]')).not.toBeNull()
    fireEvent.click(document.querySelector('[data-dsh-forge-tree-rail-add]')!)
    await waitFor(() => { expect(document.querySelector('[data-dsh-forge-confirm-code]')).not.toBeNull() })
    fireEvent.click(document.querySelector('[data-dsh-forge-tree-rail-collapse]')!)
    expect(expandSidebar).toHaveBeenCalledTimes(1)
  })

  it('session row click opens through uiWorkspace; ⋯ fork/archive ride the public face', async () => {
    const world = await makeSeatWorld({ projects: [PROJECT_A], activeProjectId: PROJECT_A.id })
    mountSeat(world)
    const topRow = document.querySelector('[data-dsh-forge-tree-session="s-top"]')!
    fireEvent.click(topRow)
    expect(world.uiWorkspace.openSession).toHaveBeenCalledWith('s-top')
    // The ⋯ menu (rename/fork/archive): fork is the second item, archive third
    // — the ⋯ seat appears on hover (workbench-layout-v2 §2.2c).
    fireEvent.mouseEnter(topRow)
    fireEvent.click(document.querySelector('[data-dsh-forge-tree-session-more="s-top"]')!)
    const items = document.querySelectorAll('[data-dsh-forge-tree-session-menu="s-top"] [role="menuitem"]')
    expect(items.length).toBe(3)
    fireEvent.click(items[1]!)
    expect(world.uiWorkspace.forkSession).toHaveBeenCalledWith('s-top')
    fireEvent.click(document.querySelector('[data-dsh-forge-tree-session-more="s-top"]')!)
    fireEvent.click(document.querySelectorAll('[data-dsh-forge-tree-session-menu="s-top"] [role="menuitem"]')[2]!)
    expect(world.uiWorkspace.archiveSession).toHaveBeenCalledWith('s-top')
  })

  it('archived partition: read-only rows never switch; restore rides the bridge verb', async () => {
    const restore = vi.fn(async () => makeProject('restored'))
    const world = await makeSeatWorld({
      projects: [PROJECT_A, makeProject('gone', { archived: true, sortOrder: 5 })],
      activeProjectId: PROJECT_A.id,
    })
    const patched = { ...world.store, bridge: { ...world.bridgeFake.bridge, restoreProject: restore } }
    mountSeat(world, { store: patched })
    const archivedRow = document.querySelector('[data-dsh-forge-tree-archived-row="gone"]')
    expect(archivedRow).not.toBeNull()
    fireEvent.click(archivedRow!)
    expect(world.bridgeFake.calls.activate).toHaveLength(0) // 归档行只读,禁入换台
    // ⋯ menu on archived rows = restore/remove; restore is the first item —
    // the only lifecycle leg wired in 1.6 (rename/remove wait on C8's surface).
    fireEvent.mouseEnter(archivedRow)
    fireEvent.click(document.querySelector('[data-dsh-forge-tree-project-more="gone"]')!)
    const items = document.querySelectorAll('[data-dsh-forge-tree-project-menu="gone"] [role="menuitem"]')
    expect(items.length).toBe(2)
    fireEvent.click(items[0]!)
    expect(restore).toHaveBeenCalledWith({ projectId: 'gone' })
  })

  it('未分组纳管 entry opens the SAME C7 card (唯一入口纪律)', async () => {
    const world = await makeSeatWorld({ projects: [PROJECT_A], activeProjectId: PROJECT_A.id })
    mountSeat(world)
    fireEvent.click(document.querySelector('[data-dsh-forge-tree-adopt]')!)
    await waitFor(() => { expect(document.querySelector('[data-dsh-forge-confirm-code]')).not.toBeNull() })
  })

  it('the guarded service adapters narrow unknown candidates onto the seat faces', () => {
    // M4 2.9 bridging: the upstream services NEST their store (`.list`) while
    // the seat face is flat — the adapters must PROJECT (delegate), so the
    // real chain's tree reads live snapshots instead of absent members.
    const workspacesList = { getSnapshot: () => ({ items: [], archivedSessionIds: [] }), subscribe: () => () => {} }
    const bridgedWorkspaces = toWorkspacesSource({ list: workspacesList })
    expect(bridgedWorkspaces).toBeDefined()
    expect(bridgedWorkspaces?.getSnapshot()).toEqual({ items: [], archivedSessionIds: [] })
    expect(toWorkspacesSource({ list: { getSnapshot: () => ({}) } })).toBeUndefined()
    expect(toWorkspacesSource(undefined)).toBeUndefined()
    // An own-field-reading method: the bridge must call THROUGH the service
    // (a detached extraction loses `this` — the SC7 corpus crash's shape: the
    // vendored retainInfo reads private fields and throws unbound).
    const service = {
      marker: true,
      list: { getSnapshot: () => ({ ids: [], byId: {} }), subscribe: () => () => {} },
      retainInfo(this: { marker?: boolean }, id: string) { return `${String(this.marker === true)}:${id}` },
    }
    const bridgedSessions = toSessionsFace(service)
    expect(bridgedSessions).toBeDefined()
    expect(bridgedSessions?.getSnapshot()).toEqual({ ids: [], byId: {} })
    expect((bridgedSessions?.retainInfo as unknown as (id: string) => string)?.('s1')).toBe('true:s1')
    expect(toSessionsFace({ list: service.list, retainInfo: 'nope' })).toBeUndefined()
    const uiWorkspace = {
      startSession: () => {}, openSession: () => {}, forkSession: () => {}, archiveSession: () => {},
    }
    expect(toUiWorkspaceFace(uiWorkspace)).toBe(uiWorkspace)
    expect(toUiWorkspaceFace({ startSession: () => {} })).toBeUndefined()
    const sidebarRight = {
      isExpanded: () => false, toggleExpanded: () => {}, openTab: () => {}, close: () => {},
      focus: () => {}, openTabs: { getSnapshot: () => [] },
    }
    expect(toSidebarRightFace(sidebarRight)).toBe(sidebarRight)
    expect(toSidebarRightFace({ isExpanded: () => false })).toBeUndefined()
    expect(toSidebarRightFace({ ...sidebarRight, openTabs: {} })).toBeUndefined()
  })
})
