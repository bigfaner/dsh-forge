// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import type { Context } from '@deepseek-ai/cordis'
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { RIGHTBAR_TAB_SLOT, RIGHTBAR_TAB_TITLE_SLOT } from '../src/client/contract.ts'
import { forgeTabId, RIGHTBAR_TAB_KINDS } from '../src/client/views/rightbar/tab-kinds.ts'
import {
  BoardTabBody, DepgraphTabBody, DocTabBody, installRightbarTabs, OverviewTabBody, toTabRegistryFace,
} from '../src/client/views/rightbar/RightbarTabs.tsx'
import type { OpenTabRow, RightbarTabsFace } from '../src/client/views/rightbar/tabs-model.ts'
import type { ActiveProjectSnapshot, ActiveProjectStore } from '../src/client/store/active-project.ts'
import { createBoardSessionStore } from '../src/client/store/board-session.ts'
import { en } from '../src/client/locale/en.ts'
import type { WorkbenchKey } from '../src/client/locale/en.ts'

// M4 task 2.2 — AC1/AC4/AC5: the container installer over the REAL SlotCore
// (the project-seat.spec pattern): the five definitions into the tab registry
// face, the keyed bodies under the forge ids (board = the 2.1 dual-host
// TasksView in pane form; overview = 2.3's 项目概览 assembly, asserted here
// only as the container's threading/re-key carrier — its interior has
// rightbar-overview.spec; doc/depgraph = 2.4 placeholder mounts that render
// NOTHING), the guide chip title, the absent-service guards, and the §4.7
// linkage watcher over the active-project pointer.

// The board body test stubs the assembled TasksView (its own assembly has its
// suite — task-board-assembly.spec.tsx); the stub captures the HOST contract
// (host='pane' + the ACTIVE project feed + the per-project re-key).
const boardStub = vi.hoisted(() => ({
  mounts: 0,
  props: [] as Array<Record<string, unknown>>,
}))
vi.mock('../src/client/views/tasks/TasksView.tsx', async () => {
  const { useEffect } = await import('react')
  return {
    TasksView: (props: Record<string, unknown>) => {
      useEffect(() => { boardStub.mounts += 1 }, [])
      boardStub.props.push({
        projectId: props.projectId,
        host: props.host,
        ...('session' in props ? { session: props.session } : {}),
        ...('onEnterSession' in props ? { onEnterSession: props.onEnterSession } : {}),
      })
      return <div data-mock-tasks-view={String(props.host)} />
    },
  }
})

// The upstream glyphs resolve through the module table at runtime (browser
// bundle); the npm node entry carries undeclared transitive deps only the
// upstream monorepo supplies — the jsdom mount stubs them (project-seat.spec
// precedent; the real glyphs ride the e2e).
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconFolderClose16: () => <span data-mock-icon="folder" />,
  IconGlobeOutline14: () => <span data-mock-icon="globe" />,
}))

const t = (key: WorkbenchKey): string => en[key]

/** Fake client ctx over the real SlotCore + a service map for ctx.get (the slot-nav.spec pattern). */
function makeFakeCtx(core: SlotCore, services: Record<string, unknown>): Context {
  const ctx = {
    effect(fn: () => (() => void) | undefined | void): () => void {
      const dispose = fn()
      return () => dispose?.()
    },
    get: (name: string): unknown => services[name],
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

/** Declare the native rightbar seat family (root → rightbar → rightbar.session → the keyed tab seats). */
function declareRightbarTree(core: SlotCore): void {
  core.register(
    { name: 'root', children: { rightbar: { kind: 'single', scope: 'root' } } },
    () => null,
  )
  core.register(
    { name: 'rightbar', children: { 'rightbar.session': { kind: 'single', scope: 'session' } } },
    () => null,
  )
  core.register(
    {
      name: 'rightbar.session',
      children: {
        [RIGHTBAR_TAB_SLOT]: { kind: 'keyed', scope: 'session' },
        [RIGHTBAR_TAB_TITLE_SLOT]: { kind: 'keyed', scope: 'session' },
      },
    },
    () => null,
  )
}

/** The registry face fake: records definitions, tracks live ones for disposal. */
function makeRegistry() {
  const registered: SidebarRightTabDefinition[] = []
  const live = new Set<SidebarRightTabDefinition>()
  return {
    registered,
    liveCount: () => live.size,
    registry: {
      register: (definition: SidebarRightTabDefinition): (() => void) => {
        registered.push(definition)
        live.add(definition)
        return () => { live.delete(definition) }
      },
    },
  }
}

/** A minimal open-tab row set covering every kind family. */
const ROWS: readonly OpenTabRow[] = [
  { tabId: 'guide-1', kind: 'guide' },
  { tabId: 'overview-1', kind: 'overview' },
  { tabId: 'board-1', kind: 'board' },
  { tabId: 'doc-1', kind: 'doc' },
  { tabId: 'depgraph-1', kind: 'depgraph' },
]

/** The controller-face fake (the tabs-model contract). */
function makeFace(rows: readonly OpenTabRow[], expanded: boolean) {
  const calls = { closed: [] as string[], opened: [] as string[], focused: [] as string[], toggles: 0 }
  const face = {
    openTab: (kind: string) => { calls.opened.push(kind) },
    close: (tabId: string) => { calls.closed.push(tabId) },
    focus: (tabId: string) => { calls.focused.push(tabId) },
    isExpanded: () => expanded,
    toggleExpanded: () => { calls.toggles += 1 },
    openTabs: { getSnapshot: () => rows },
  } as unknown as RightbarTabsFace
  return { face, calls }
}

/** A hand-rolled active-project pointer store (the watcher + board feed subset). */
function makeProjectStore(initial: string | null) {
  let snapshot = { phase: 'ready', projects: [], activeProjectId: initial } as unknown as ActiveProjectSnapshot
  const listeners = new Set<() => void>()
  return {
    subscribe: (fn: () => void): (() => void) => {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    },
    getSnapshot: (): ActiveProjectSnapshot => snapshot,
    set: (id: string | null): void => {
      snapshot = { ...snapshot, activeProjectId: id }
      for (const fn of listeners) fn()
    },
  } as unknown as ActiveProjectStore & { set: (id: string | null) => void }
}

afterEach(cleanup)

describe('AC1: the container registers the five kinds + keyed bodies', () => {
  let core: SlotCore
  let registry: ReturnType<typeof makeRegistry>

  beforeEach(() => {
    core = new SlotCore()
    registry = makeRegistry()
    declareRightbarTree(core)
  })

  it('stage one: five definitions into the tab registry (guide = extension take-over)', () => {
    const dispose = installRightbarTabs(makeFakeCtx(core, { sidebarRightTabs: registry.registry }), { t })
    expect(registry.registered.map(def => def.kind)).toEqual([...RIGHTBAR_TAB_KINDS])
    expect(registry.registered.find(def => def.kind === 'guide')?.priority).toBe('extension')
    expect(registry.liveCount()).toBe(5)
    dispose()
    expect(registry.liveCount()).toBe(0)
  })

  it('stage two: the five bodies under the forge ids + the two live chip titles', () => {
    const dispose = installRightbarTabs(makeFakeCtx(core, { sidebarRightTabs: registry.registry }), { t })
    const bodyKeys = core.entriesOfSlot(RIGHTBAR_TAB_SLOT).map(entry => entry.options.key)
    expect(new Set(bodyKeys)).toEqual(new Set(RIGHTBAR_TAB_KINDS.map(kind => forgeTabId(kind))))
    // 2.4 adds the doc chip title (slug/产物名称 from the params) beside the
    // guide's — the depgraph kind keeps the registry's static 「依赖图」 title.
    const titleKeys = core.entriesOfSlot(RIGHTBAR_TAB_TITLE_SLOT).map(entry => entry.options.key)
    expect(titleKeys).toEqual([forgeTabId('guide'), forgeTabId('doc')])
    dispose()
    expect(core.entriesOfSlot(RIGHTBAR_TAB_SLOT)).toEqual([])
    expect(core.entriesOfSlot(RIGHTBAR_TAB_TITLE_SLOT)).toEqual([])
  })

  it('absent sidebarRightTabs = a silent no-op (the native column stays exactly as shipped)', () => {
    const dispose = installRightbarTabs(makeFakeCtx(core, {}), { t })
    expect(registry.registered).toEqual([])
    expect(core.entriesOfSlot(RIGHTBAR_TAB_SLOT)).toEqual([])
    expect(() => dispose()).not.toThrow()
  })

  it('toTabRegistryFace guards the registry candidate', () => {
    expect(toTabRegistryFace(registry.registry)).toBe(registry.registry)
    expect(toTabRegistryFace(undefined)).toBeUndefined()
    expect(toTabRegistryFace({ register: 'not-a-function' })).toBeUndefined()
  })
})

describe('AC1/AC5: board = TasksView pane host; overview = 2.3 body; doc/depgraph = empty mounts', () => {
  it('the board body feeds the ACTIVE project in the pane form and re-keys per project', () => {
    boardStub.mounts = 0
    boardStub.props = []
    const store = makeProjectStore('p1')
    const view = render(<BoardTabBody t={t} activeProject={store} />)
    expect(view.container.querySelector('[data-mock-tasks-view]')?.getAttribute('data-mock-tasks-view')).toBe('pane')
    expect(boardStub.props.at(-1)).toEqual({ projectId: 'p1', host: 'pane' })

    // A project switch is a NEW mount (the 2.1 re-key contract — one board
    // store per project), not an in-place re-point.
    const mountsBefore = boardStub.mounts
    act(() => { store.set('p2') })
    expect(boardStub.props.at(-1)).toEqual({ projectId: 'p2', host: 'pane' })
    expect(boardStub.mounts).toBe(mountsBefore + 1)
  })

  it('the board body without a store stays on its resolving feed (never a silent project)', () => {
    boardStub.props = []
    render(<BoardTabBody t={t} />)
    expect(boardStub.props.at(-1)).toEqual({ projectId: undefined, host: 'pane' })
  })

  it('the overview body (2.3) renders its resolving skeleton without a store; the 2.4 bodies own their resolving branches', () => {
    // 2.3 landed: the overview body is the real 项目概览 assembly — a bare
    // mount (no store) owns its loading branch (the resolving skeleton).
    const overview = render(<OverviewTabBody t={t} />)
    expect(overview.container.querySelector('[data-dsh-forge-overview]')?.getAttribute('aria-busy')).toBe('true')
    // 2.4 landed: the doc/depgraph bodies are the real interiors — a bare
    // mount (no store) owns its loading branch (never an empty pane, the SC2
    // discipline's resolving form).
    const doc = render(<DocTabBody t={t} />)
    expect(doc.container.querySelector('[data-dsh-forge-doc]')?.getAttribute('aria-busy')).toBe('true')
    const depgraph = render(<DepgraphTabBody t={t} />)
    expect(depgraph.container.querySelector('[data-dsh-forge-depgraph]')?.getAttribute('aria-busy')).toBe('true')
  })
})

describe('AC1 (M4 2.7): the board body threads the plugin-lifetime legs', () => {
  it('session + onEnterSession ride through to TasksView (conditional spread, absent = absent)', () => {
    boardStub.props = []
    const boardSession = createBoardSessionStore()
    const onEnterSession = () => Promise.resolve()
    render(<BoardTabBody t={t} session={boardSession} onEnterSession={onEnterSession} />)
    expect(boardStub.props.at(-1)).toMatchObject({ host: 'pane', session: boardSession, onEnterSession })
  })

  it('the installer carries both options into the keyed board body inject face', () => {
    const core = new SlotCore()
    const registry = makeRegistry()
    declareRightbarTree(core)
    const boardSession = createBoardSessionStore()
    const onEnterSession = () => Promise.resolve()
    installRightbarTabs(makeFakeCtx(core, { sidebarRightTabs: registry.registry }), {
      t,
      boardSession,
      onEnterSession,
    })
    const entry = core.entriesOfSlot(RIGHTBAR_TAB_SLOT).find(row => row.options.key === forgeTabId('board'))
    const face = (entry?.inject as () => Record<string, unknown>)?.() as Record<string, unknown>
    expect(face).toMatchObject({ t, session: boardSession, onEnterSession })
    // Absent options stay ABSENT in the face (exactOptionalPropertyTypes discipline).
    const dispose = installRightbarTabs(makeFakeCtx(new SlotCore(), {}), { t })
    expect(dispose).toBeInstanceOf(Function)
    dispose()
  })
})

describe('AC1 (M4 2.3): the overview body threads its plugin-lifetime legs', () => {
  it('the installer carries the overview options into the keyed overview body inject face', () => {
    const core = new SlotCore()
    const registry = makeRegistry()
    declareRightbarTree(core)
    const store = makeProjectStore('p1')
    const onOpenTask = (taskKey: string): void => { void taskKey }
    const onEnterSession = (): Promise<void> => Promise.resolve()
    const readTaskSources = async (): Promise<undefined> => undefined
    installRightbarTabs(makeFakeCtx(core, { sidebarRightTabs: registry.registry }), {
      t,
      activeProjectStore: store,
      onOpenTask,
      onEnterSession,
      readTaskSources,
    })
    const entry = core.entriesOfSlot(RIGHTBAR_TAB_SLOT).find(row => row.options.key === forgeTabId('overview'))
    const face = (entry?.inject as () => Record<string, unknown>)?.() as Record<string, unknown>
    expect(face).toMatchObject({ t, activeProject: store, onOpenTask, onEnterSession, readTaskSources })
  })
})

describe('AC4: the §4.7 linkage watcher (整栏跟随当前项目)', () => {
  let core: SlotCore
  let registry: ReturnType<typeof makeRegistry>

  beforeEach(() => {
    core = new SlotCore()
    registry = makeRegistry()
    declareRightbarTree(core)
  })

  it('a pointer switch closes the scoped tabs and returns the expanded column to 项目概览', () => {
    const { face, calls } = makeFace(ROWS, true)
    const store = makeProjectStore('p1')
    installRightbarTabs(
      makeFakeCtx(core, { sidebarRightTabs: registry.registry, sidebarRight: face }),
      { t, activeProjectStore: store },
    )
    act(() => { store.set('p2') })
    expect(calls.closed).toEqual(['doc-1', 'depgraph-1'])
    expect(calls.focused).toEqual(['overview-1'])
  })

  it('the same project never fires (同项目切会话右栏不动)', () => {
    const { face, calls } = makeFace(ROWS, true)
    const store = makeProjectStore('p1')
    installRightbarTabs(
      makeFakeCtx(core, { sidebarRightTabs: registry.registry, sidebarRight: face }),
      { t, activeProjectStore: store },
    )
    act(() => { store.set('p1') })
    expect(calls.closed).toEqual([])
    expect(calls.focused).toEqual([])
    expect(calls.opened).toEqual([])
  })

  it('the install-time observation is record-only (the boot restore fires no pass)', () => {
    const { face, calls } = makeFace(ROWS, true)
    const store = makeProjectStore('p1')
    installRightbarTabs(
      makeFakeCtx(core, { sidebarRightTabs: registry.registry, sidebarRight: face }),
      { t, activeProjectStore: store },
    )
    expect(calls.closed).toEqual([])
    expect(calls.focused).toEqual([])
  })

  it('absent store or controller face keeps the watcher unmounted (never a throw)', () => {
    const store = makeProjectStore('p1')
    const dispose = installRightbarTabs(makeFakeCtx(core, { sidebarRightTabs: registry.registry }), {
      t,
      activeProjectStore: store,
    })
    expect(() => act(() => { store.set('p2') })).not.toThrow()
    dispose()
  })
})
