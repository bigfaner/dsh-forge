// @vitest-environment jsdom
// M4 task 4.3 — the C10 DETACHED assembly (AC1/AC2, jsdom): the board
// panel (the [收回] bar over the SAME pinned TasksView window form), the
// conversation leg (the utilities-row [收回] + the ONE openSession(target)
// write over the late-booting service), the installers over the real
// SlotCore (the fresh `main` keyed panel + the bounded layout poll), and
// the aside tab-menu [拆出为窗口] entry (the conversation origin).
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import type { Context } from '@deepseek-ai/cordis'
import { en } from '../src/client/locale/en.ts'
import type { WorkbenchKey } from '../src/client/locale/en.ts'
import { subagentChatAddressOf } from '../src/client/session-open.ts'
import type { WindowVerbFaceClient } from '../src/client/window-role/boot.ts'
import {
  DETACHED_PANEL_ID, DETACHED_RECALL_ID, DetachedBoardPanel, installDetachedWindow,
} from '../src/client/window-role/detached-view.tsx'
import type { DetachedWindowRole } from '../src/client/window-role/boot.ts'
import { DetachMenuEntry } from '../src/client/views/rightbar/RightbarTabs.tsx'
import {
  CONVERSATION_HEADER_UTILITIES_SLOT,
} from '../src/client/views/rightbar/SplitControls.tsx'

// The assembled TasksView stub (the rightbar-container pattern): the mount
// captures the HOST contract — host='window' + the PINNED project id.
const boardStub = vi.hoisted(() => ({ mounts: 0, props: [] as Array<Record<string, unknown>> }))
vi.mock('../src/client/views/tasks/TasksView.tsx', () => ({
  TasksView: (props: Record<string, unknown>) => {
    boardStub.mounts += 1
    boardStub.props.push({ projectId: props.projectId, host: props.host })
    return <div data-mock-tasks-view={String(props.host)} />
  },
}))

// The upstream glyphs resolve through the module table at runtime (the
// rightbar-container precedent — the jsdom mount stubs them).
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconFolderClose16: () => <span data-mock-icon="folder" />,
  IconGlobeOutline14: () => <span data-mock-icon="globe" />,
}))

const t = (key: WorkbenchKey): string => en[key]

/** Flush the detach promise chain (one macrotask drains every pending microtask). */
const flush = async (): Promise<void> => {
  await new Promise((resolve) => { setTimeout(resolve, 0) })
}

const BOARD_ROLE: DetachedWindowRole = {
  kind: 'detached', windowId: 'detached-1', projectId: 'proj-a', view: 'board',
}
const CONVERSATION_ROLE: DetachedWindowRole = {
  kind: 'detached', windowId: 'detached-2', projectId: 'proj-a', view: 'conversation',
  target: { parentSessionId: 'parent-1', childSessionId: 'child-1', mode: 'continuable' },
}

/** A full stub window verb face. */
function makeFace(overrides: Partial<WindowVerbFaceClient> = {}): WindowVerbFaceClient {
  return {
    openDetached: vi.fn(async () => ({ windowId: 'detached-9' })),
    getRole: vi.fn(async () => null),
    recall: vi.fn(async () => {}),
    onChanged: vi.fn(() => () => {}),
    ...overrides,
  } as WindowVerbFaceClient
}

/** Fake client ctx over the real SlotCore + a service map for ctx.get. */
function makeFakeCtx(core: SlotCore, services: Record<string, unknown> = {}): Context {
  return {
    effect(fn: () => (() => void) | undefined | void): () => void {
      const dispose = fn()
      return () => dispose?.()
    },
    get: (name: string) => services[name],
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
  } as unknown as Context
}

/** Declare the `main` keyed slot the way ui-layout does. */
function declareMainSlot(core: SlotCore): void {
  core.register({ name: 'root', children: { main: { kind: 'keyed', scope: 'root' } } }, () => null)
}

/** Declare the utilities slot the way ui-conversation's factory does. */
function declareUtilitiesSeat(core: SlotCore): void {
  core.register(
    { name: 'root', children: { 'conversation.stub': { kind: 'single', scope: 'root' } } },
    () => null,
  )
  core.register(
    { name: 'conversation.stub', children: { [CONVERSATION_HEADER_UTILITIES_SLOT]: { kind: 'list', scope: 'session' } } },
    () => null,
  )
}

beforeEach(() => {
  boardStub.mounts = 0
  boardStub.props = []
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// AC1 — the board panel (TasksView 绑定来源项目)
// ---------------------------------------------------------------------------

describe('DetachedBoardPanel (AC1: board 视图 = TasksView 绑定来源项目)', () => {
  it('renders the [收回] bar over the SAME TasksView in its WINDOW form, project PINNED', () => {
    const onRecall = vi.fn()
    const view = render(<DetachedBoardPanel t={t} role={BOARD_ROLE} onRecall={onRecall} />)
    expect(view.container.querySelector('[data-dsh-forge-detached-board]')).not.toBeNull()
    expect(view.container.querySelector('[data-dsh-forge-detached-bar]')).not.toBeNull()
    expect(view.container.querySelector('[data-dsh-forge-detached-project]')?.getAttribute('data-dsh-forge-detached-project'))
      .toBe('proj-a')
    // The view below: host='window' (the M2/M3 geometry) + the pinned id.
    expect(boardStub.mounts).toBe(1)
    expect(boardStub.props[0]).toEqual({ projectId: 'proj-a', host: 'window' })
  })

  it('the [收回] click fires the recall commit', () => {
    const onRecall = vi.fn()
    const view = render(<DetachedBoardPanel t={t} role={BOARD_ROLE} onRecall={onRecall} />)
    const button = view.container.querySelector<HTMLButtonElement>('[data-dsh-forge-detached-recall]')
    expect(button?.textContent).toBe(t('window.detached.recall'))
    act(() => { fireEvent.click(button as HTMLButtonElement) })
    expect(onRecall).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// AC2 — the installers (单视图渲染;无工作台头,区导航不可用)
// ---------------------------------------------------------------------------

describe('installDetachedWindow: the BOARD assembly', () => {
  it('registers the fresh `main` keyed panel and presents it once the layout service is live', () => {
    const core = new SlotCore()
    declareMainSlot(core)
    const selectPanel = vi.fn()
    const dispose = installDetachedWindow(makeFakeCtx(core, {
      layout: { selectPanel },
    }), { t, role: BOARD_ROLE, face: makeFace() })
    const entries = core.entriesOfSlot('main')
    expect(entries.map(entry => entry.options.key)).toEqual([DETACHED_PANEL_ID])
    expect(selectPanel).toHaveBeenCalledTimes(1)
    expect(selectPanel).toHaveBeenCalledWith(DETACHED_PANEL_ID)
    dispose()
    expect(core.entriesOfSlot('main')).toEqual([])
  })

  it('the layout poll retries until the service lands (the bounded late-boot race)', () => {
    vi.useFakeTimers()
    const core = new SlotCore()
    declareMainSlot(core)
    const selectPanel = vi.fn()
    let live = false
    const dispose = installDetachedWindow(makeFakeCtx(core, {
      get layout() { return live ? { selectPanel } : undefined },
    }), { t, role: BOARD_ROLE, face: makeFace() })
    expect(selectPanel).not.toHaveBeenCalled()
    live = true
    act(() => { vi.advanceTimersByTime(250) })
    expect(selectPanel).toHaveBeenCalledTimes(1)
    dispose()
  })

  it('the inject face\'s onRecall rides the windowRecall verb (a rejection stays inert)', async () => {
    const core = new SlotCore()
    declareMainSlot(core)
    const face = makeFace()
    installDetachedWindow(makeFakeCtx(core, { layout: { selectPanel: vi.fn() } }), { t, role: BOARD_ROLE, face })
    const entry = core.entriesOfSlot('main')[0]
    const injected = (entry?.inject as () => { onRecall: () => void })?.()
    injected.onRecall()
    await Promise.resolve()
    expect(face.recall).toHaveBeenCalledWith('detached-1')
  })
})

describe('installDetachedWindow: the CONVERSATION assembly (原生 conversation + openSession(target))', () => {
  it('registers the utilities-row [收回]; its click rides the recall verb', async () => {
    const core = new SlotCore()
    declareUtilitiesSeat(core)
    const face = makeFace()
    const dispose = installDetachedWindow(makeFakeCtx(core), { t, role: CONVERSATION_ROLE, face })
    const entries = core.entriesOfSlot(CONVERSATION_HEADER_UTILITIES_SLOT)
    expect(entries.map(entry => entry.options.id)).toEqual([DETACHED_RECALL_ID])
    const injected = (entries[0]?.inject as () => { onRecall: () => void })?.()
    injected.onRecall()
    await Promise.resolve()
    expect(face.recall).toHaveBeenCalledWith('detached-2')
    dispose()
  })

  it('drives the ONE openSession(target) once the uiWorkspace service lands (the bounded poll)', () => {
    vi.useFakeTimers()
    const core = new SlotCore()
    declareUtilitiesSeat(core)
    const openSession = vi.fn()
    let live = false
    const dispose = installDetachedWindow(makeFakeCtx(core), {
      t,
      role: CONVERSATION_ROLE,
      face: makeFace(),
      getOpenSession: () => (live ? { openSession } : undefined),
    })
    expect(openSession).not.toHaveBeenCalled()
    live = true
    act(() => { vi.advanceTimersByTime(250) })
    // The subagent target rides the SAME native API (Interface 6: 原生收参
    // SubagentAddress — the address triple verbatim).
    expect(openSession).toHaveBeenCalledTimes(1)
    expect(openSession).toHaveBeenCalledWith({
      parentSessionId: 'parent-1', childSessionId: 'child-1', mode: 'continuable',
    })
    // The poll retires after the hit — no second open.
    act(() => { vi.advanceTimersByTime(1_000) })
    expect(openSession).toHaveBeenCalledTimes(1)
    dispose()
  })

  it('a top session-id target rides openSession(sessionId)', () => {
    vi.useFakeTimers()
    const core = new SlotCore()
    declareUtilitiesSeat(core)
    const openSession = vi.fn()
    installDetachedWindow(makeFakeCtx(core), {
      t,
      role: { kind: 'detached', windowId: 'detached-3', projectId: 'p', view: 'conversation', target: { sessionId: 's1' } },
      face: makeFace(),
      getOpenSession: () => ({ openSession }),
    })
    expect(openSession).toHaveBeenCalledWith('s1')
  })

  it('a throwing open degrades silently (the native empty conversation stays)', () => {
    const core = new SlotCore()
    declareUtilitiesSeat(core)
    expect(() => {
      installDetachedWindow(makeFakeCtx(core), {
        t,
        role: CONVERSATION_ROLE,
        face: makeFace(),
        getOpenSession: () => ({ openSession: () => { throw new Error('unknown session') } }),
      })
    }).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// AC1 — the aside tab-menu [拆出为窗口] entry (the conversation origin)
// ---------------------------------------------------------------------------

describe('DetachMenuEntry (the subagentchat tab\'s actions-menu row)', () => {
  const subagentTab = {
    id: 'tab-1',
    kind: 'subagentchat',
    contentId: subagentChatAddressOf({ parentSessionId: 'parent-1', childSessionId: 'child-1', mode: 'continuable' }),
  }

  it('renders ONLY for a subagentchat tab', () => {
    const face = makeFace()
    const { container } = render(
      <DetachMenuEntry
        tab={{ id: 'tab-2', kind: 'board', contentId: 'board' }}
        dismiss={() => {}}
        t={t}
        getProjectId={() => 'p1'}
        windowVerb={face}
        closeTab={() => {}}
      />,
    )
    expect(container.querySelector('[data-dsh-forge-detach-menu-item]')).toBeNull()
  })

  it('the pick: dismiss → openDetached({ view: "conversation", target }) → closeTab ONLY on the resolved open', async () => {
    const face = makeFace()
    const dismiss = vi.fn()
    const closeTab = vi.fn()
    const { container } = render(
      <DetachMenuEntry
        tab={subagentTab}
        dismiss={dismiss}
        t={t}
        getProjectId={() => 'p1'}
        windowVerb={face}
        closeTab={closeTab}
      />,
    )
    const row = container.querySelector<HTMLButtonElement>('[data-dsh-forge-detach-menu-item]')
    expect(row?.textContent).toBe(t('rightbar.split.pane.detach'))
    act(() => { fireEvent.click(row as HTMLButtonElement) })
    expect(dismiss).toHaveBeenCalledTimes(1)
    expect(face.openDetached).toHaveBeenCalledWith({
      projectId: 'p1',
      view: 'conversation',
      target: { parentSessionId: 'parent-1', childSessionId: 'child-1', mode: 'continuable' },
    })
    await flush()
    expect(closeTab).toHaveBeenCalledWith('tab-1')
  })

  it('a failed open keeps the tab (closeTab never fires)', async () => {
    const face = makeFace({ openDetached: vi.fn(async () => { throw new Error('open failed') }) })
    const closeTab = vi.fn()
    const { container } = render(
      <DetachMenuEntry
        tab={subagentTab}
        dismiss={() => {}}
        t={t}
        getProjectId={() => 'p1'}
        windowVerb={face}
        closeTab={closeTab}
      />,
    )
    act(() => { fireEvent.click(container.querySelector('[data-dsh-forge-detach-menu-item]') as HTMLElement) })
    await flush()
    expect(closeTab).not.toHaveBeenCalled()
  })

  it('no resolved project = no dead click (the verb never fires)', () => {
    const face = makeFace()
    const { container } = render(
      <DetachMenuEntry
        tab={subagentTab}
        dismiss={() => {}}
        t={t}
        getProjectId={() => undefined}
        windowVerb={face}
        closeTab={() => {}}
      />,
    )
    act(() => { fireEvent.click(container.querySelector('[data-dsh-forge-detach-menu-item]') as HTMLElement) })
    expect(face.openDetached).not.toHaveBeenCalled()
  })
})
