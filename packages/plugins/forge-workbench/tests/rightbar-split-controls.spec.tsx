// @vitest-environment jsdom
// M4 task 4.4 — the C9 分屏 CONTROLS (jsdom): the 工作台头 [分屏] menu (view
// picks; the aside row's availability gating), the pane 头 (区名 + the
// reserved [拆出为窗口] 动作位 + [关闭]), the 分隔条 (role=separator + the aria
// ratio contract, the keyboard model, the clamped drag, the ≥28px hit band),
// the board body's split chrome (AC5: the SAME TasksView instance rides under
// it), and the utilities-seat installer over the real SlotCore.
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import type { Context } from '@deepseek-ai/cordis'
import { en } from '../src/client/locale/en.ts'
import type { WorkbenchKey } from '../src/client/locale/en.ts'
import type { LineageSubagentAddress } from '../src/client/lineage/index.ts'
import { BoardTabBody } from '../src/client/views/rightbar/RightbarTabs.tsx'
import { PaneHeader } from '../src/client/views/rightbar/PaneControls.tsx'
import {
  CONVERSATION_HEADER_UTILITIES_SLOT, installSplitControls, SplitControlSeat, SPLIT_CONTROL_ID,
  SplitMenuControl, SplitSeparator,
} from '../src/client/views/rightbar/SplitControls.tsx'
import { createSplitPaneStore } from '../src/client/views/rightbar/tabs-model.ts'

// The board body test stubs the assembled TasksView (the rightbar-container
// pattern) — the stub captures the HOST contract, asserting AC5 (the pane
// chrome wraps AROUND the view; the view below stays the same instance).
const boardStub = vi.hoisted(() => ({ mounts: 0, props: [] as Array<Record<string, unknown>> }))
vi.mock('../src/client/views/tasks/TasksView.tsx', () => ({
  TasksView: (props: Record<string, unknown>) => {
    boardStub.mounts += 1
    boardStub.props.push({ projectId: props.projectId, host: props.host })
    return <div data-mock-tasks-view={String(props.host)} />
  },
}))

// The upstream glyphs resolve through the module table at runtime (the
// jsdom mount stubs them — the rightbar-container precedent).
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconFolderClose16: () => <span data-mock-icon="folder" />,
  IconGlobeOutline14: () => <span data-mock-icon="globe" />,
}))

const t = (key: WorkbenchKey): string => en[key]

const ADDRESS: LineageSubagentAddress = {
  parentSessionId: 'parent-1',
  childSessionId: 'child-1',
  mode: 'continuable',
}

afterEach(cleanup)

// ---------------------------------------------------------------------------
// AC1 — the 工作台头 [分屏] menu
// ---------------------------------------------------------------------------

describe('SplitMenuControl: [分屏] → 添加 pane 并选视图 (Menu: 会话旁置/看板)', () => {
  const openMenu = (view: ReturnType<typeof render>): HTMLElement => {
    const trigger = view.container.querySelector<HTMLButtonElement>('[data-dsh-forge-split-trigger]')
    expect(trigger).not.toBeNull()
    act(() => { fireEvent.click(trigger as HTMLButtonElement) })
    const list = view.container.querySelector('[data-dsh-forge-split-menu-list]')
    expect(list?.getAttribute('role')).toBe('menu')
    return list as HTMLElement
  }

  it('the trigger opens the two-entry view menu; the board pick fires its handler', () => {
    const onOpenBoard = vi.fn()
    const view = render(
      <SplitMenuControl t={t} onOpenBoard={onOpenBoard} onOpenAside={() => {}} asideAvailable={false} />,
    )
    const list = openMenu(view)
    const items = list.querySelectorAll('[role="menuitem"]')
    expect(items).toHaveLength(2)
    expect(items[0]?.getAttribute('data-dsh-forge-split-menu-item')).toBe('session-aside')
    expect(items[1]?.getAttribute('data-dsh-forge-split-menu-item')).toBe('board')
    act(() => { fireEvent.click(items[1] as HTMLElement) })
    expect(onOpenBoard).toHaveBeenCalledTimes(1)
    // The pick closes the menu.
    expect(view.container.querySelector('[data-dsh-forge-split-menu-list]')).toBeNull()
  })

  it('the aside row is DISABLED without a resolvable subagent target (never a dead click)', () => {
    const onOpenAside = vi.fn()
    const view = render(
      <SplitMenuControl t={t} onOpenBoard={() => {}} onOpenAside={onOpenAside} asideAvailable={false} />,
    )
    const list = openMenu(view)
    const aside = list.querySelector<HTMLButtonElement>('[data-dsh-forge-split-menu-item="session-aside"]')
    expect(aside?.disabled).toBe(true)
    expect(aside?.getAttribute('aria-disabled')).toBe('true')
    expect(aside?.title).toBe(t('rightbar.split.menu.asideUnavailable'))
    act(() => { fireEvent.click(aside as HTMLButtonElement) })
    expect(onOpenAside).not.toHaveBeenCalled()
  })

  it('the aside pick fires its handler while a target resolves', () => {
    const onOpenAside = vi.fn()
    const view = render(
      <SplitMenuControl t={t} onOpenBoard={() => {}} onOpenAside={onOpenAside} asideAvailable />,
    )
    const list = openMenu(view)
    const aside = list.querySelector<HTMLButtonElement>('[data-dsh-forge-split-menu-item="session-aside"]')
    expect(aside?.disabled).toBe(false)
    act(() => { fireEvent.click(aside as HTMLButtonElement) })
    expect(onOpenAside).toHaveBeenCalledTimes(1)
  })
})

describe('SplitControlSeat: the picks ride the store through the LAZY legs', () => {
  it('board → store.openPane(getSplitFace(), { view: "board" }); aside → the address leg', () => {
    const store = createSplitPaneStore()
    const face = {
      openTab: vi.fn(),
      openResource: vi.fn(),
    }
    const view = render(
      <SplitControlSeat
        t={t}
        store={store}
        getSplitFace={() => face}
        getAsideAddress={() => ADDRESS}
      />,
    )
    const trigger = view.container.querySelector<HTMLButtonElement>('[data-dsh-forge-split-trigger]')
    act(() => { fireEvent.click(trigger as HTMLButtonElement) })
    const items = view.container.querySelectorAll('[role="menuitem"]')
    act(() => { fireEvent.click(items[1] as HTMLElement) }) // 看板
    expect(face.openTab).toHaveBeenCalledWith('board', { preferNewPane: true })
    act(() => { fireEvent.click(trigger as HTMLButtonElement) })
    const itemsAgain = view.container.querySelectorAll('[role="menuitem"]')
    act(() => { fireEvent.click(itemsAgain[0] as HTMLElement) }) // 会话旁置
    expect(face.openResource).toHaveBeenCalledTimes(1)
    expect(face.openResource.mock.calls[0]?.[0]).toContain('child-1')
    expect(face.openResource.mock.calls[0]?.[1]).toEqual({ kind: 'subagentchat', preferNewPane: true })
    expect(store.getSnapshot().panes).toEqual([{ view: 'board' }, { view: 'session-aside' }])
  })

  it('an absent face leg degrades the pick to a no-op (never a throw)', () => {
    const store = createSplitPaneStore()
    const view = render(<SplitControlSeat t={t} store={store} />)
    const trigger = view.container.querySelector<HTMLButtonElement>('[data-dsh-forge-split-trigger]')
    act(() => { fireEvent.click(trigger as HTMLButtonElement) })
    const board = view.container.querySelector('[data-dsh-forge-split-menu-item="board"]')
    expect(() => act(() => { fireEvent.click(board as HTMLElement) })).not.toThrow()
    expect(store.getSnapshot().panes).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// AC1 — the pane 头 (区名 + [拆出为窗口] 动作位 + [关闭])
// ---------------------------------------------------------------------------

describe('PaneHeader: the h32 pane 头', () => {
  it('renders the 区名, the RESERVED detach 动作位 (disabled, 4.3), and the wired [关闭]', () => {
    const onClose = vi.fn()
    const view = render(<PaneHeader t={t} view="board" onClose={onClose} />)
    expect(view.container.querySelector('[data-dsh-forge-pane-region]')?.textContent)
      .toBe(t('rightbar.split.pane.board'))
    const detach = view.container.querySelector<HTMLButtonElement>('[data-dsh-forge-pane-detach]')
    expect(detach?.disabled).toBe(true)
    expect(detach?.title).toBe(t('rightbar.split.pane.detachReserved'))
    const close = view.container.querySelector<HTMLButtonElement>('[data-dsh-forge-pane-close]')
    expect(close?.getAttribute('aria-label')).toBe(t('rightbar.split.pane.close'))
    act(() => { fireEvent.click(close as HTMLButtonElement) })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('the aside 区名 labels the session-aside pane; a wired onDetach activates the 动作位', () => {
    const onDetach = vi.fn()
    const view = render(<PaneHeader t={t} view="session-aside" onClose={() => {}} onDetach={onDetach} />)
    expect(view.container.querySelector('[data-dsh-forge-pane-region]')?.textContent)
      .toBe(t('rightbar.split.pane.sessionAside'))
    const detach = view.container.querySelector<HTMLButtonElement>('[data-dsh-forge-pane-detach]')
    expect(detach?.disabled).toBe(false)
    act(() => { fireEvent.click(detach as HTMLButtonElement) })
    expect(onDetach).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// AC3/AC4 — the 分隔条 (aria contract, keyboard model, clamped drag)
// ---------------------------------------------------------------------------

describe('SplitSeparator: the a11y separator', () => {
  // The CONTROLLED harness: every commit feeds the next render's ratio (the
  // board body's shape — the store's committed state is the prop).
  const setup = (initial: number, measureContainer?: () => number) => {
    const changes: number[] = []
    let current = initial
    function Harness(): ReactElement {
      const [ratio, setRatio] = useState(initial)
      current = ratio
      return (
        <SplitSeparator
          t={t}
          ratio={ratio}
          onRatioChange={(next) => { changes.push(next); setRatio(next) }}
          {...(measureContainer === undefined ? {} : { measureContainer })}
        />
      )
    }
    const view = render(<Harness />)
    const separator = view.container.querySelector<HTMLElement>('[data-dsh-forge-split-separator]')
    expect(separator).not.toBeNull()
    return {
      separator: separator as HTMLElement,
      changes,
      view,
      readRatio: () => current,
    }
  }

  it('carries the slider semantics: role=separator + the clamped aria ratio band', () => {
    const { separator } = setup(0.55, () => 1000)
    expect(separator.getAttribute('role')).toBe('separator')
    expect(separator.getAttribute('aria-orientation')).toBe('vertical')
    expect(separator.getAttribute('aria-valuemin')).toBe('30')
    expect(separator.getAttribute('aria-valuemax')).toBe('70')
    expect(separator.getAttribute('aria-valuenow')).toBe('55')
    expect(separator.getAttribute('aria-valuetext')).toBe('55%')
    expect(separator.getAttribute('aria-label')).toBe(t('rightbar.split.separator'))
    expect(separator.tabIndex).toBe(0)
    // The hit band is ≥28px wide (the a11y 命中区 baseline).
    expect(separator.style.width).toBe('28px')
  })

  it('the keyboard model: ←/→ ±2%, Shift ±10%, Home/End 复位 50/50, clamped like the drag', () => {
    const { separator, changes, readRatio } = setup(0.5, () => 1000)
    act(() => { fireEvent.keyDown(separator, { key: 'ArrowRight' }) })
    expect(changes.at(-1)).toBeCloseTo(0.52)
    act(() => { fireEvent.keyDown(separator, { key: 'ArrowRight', shiftKey: true }) })
    expect(changes.at(-1)).toBeCloseTo(0.62)
    act(() => { fireEvent.keyDown(separator, { key: 'ArrowLeft', shiftKey: true }) })
    expect(changes.at(-1)).toBeCloseTo(0.52)
    act(() => { fireEvent.keyDown(separator, { key: 'Home' }) })
    expect(changes.at(-1)).toBe(0.5)
    act(() => { fireEvent.keyDown(separator, { key: 'End' }) })
    expect(changes.at(-1)).toBe(0.5)
    expect(readRatio()).toBe(0.5)
    // The aria readout rides the committed ratio.
    expect(separator.getAttribute('aria-valuenow')).toBe('50')
    // 钳制同拖拽: a banded start clamps at the edge.
    const edge = setup(0.69, () => 1000)
    act(() => { fireEvent.keyDown(edge.separator, { key: 'ArrowRight', shiftKey: true }) })
    expect(edge.changes.at(-1)).toBe(0.7)
  })

  it('Enter/Space 无激活语义 — consumed, changing nothing', () => {
    const { separator, changes } = setup(0.5, () => 1000)
    const before = changes.length
    act(() => { fireEvent.keyDown(separator, { key: 'Enter' }) })
    act(() => { fireEvent.keyDown(separator, { key: ' ' }) })
    expect(changes.length).toBe(before)
  })

  it('a pointer drag commits EVERY move through the clamp (即时存)', () => {
    const { separator, changes } = setup(0.5, () => 1000)
    act(() => { fireEvent.pointerDown(separator, { pointerId: 1, clientX: 500 }) })
    expect(separator.getAttribute('data-dragging')).toBe('true')
    act(() => { fireEvent.pointerMove(separator, { pointerId: 1, clientX: 560 }) })
    expect(changes.at(-1)).toBeCloseTo(0.56)
    act(() => { fireEvent.pointerMove(separator, { pointerId: 1, clientX: 900 }) })
    expect(changes.at(-1)).toBe(0.7) // clamped at the band edge
    act(() => { fireEvent.pointerUp(separator, { pointerId: 1, clientX: 900 }) })
    expect(separator.getAttribute('data-dragging')).toBeNull()
    // The gesture ended — a further move without a press changes nothing.
    const settled = changes.length
    act(() => { fireEvent.pointerMove(separator, { pointerId: 1, clientX: 400 }) })
    expect(changes.length).toBe(settled)
  })

  it('a zero-measured container (a mount without measurement) degrades the drag safely', () => {
    const { separator, changes } = setup(0.5)
    act(() => { fireEvent.pointerDown(separator, { pointerId: 1, clientX: 500 }) })
    act(() => { fireEvent.pointerMove(separator, { pointerId: 1, clientX: 700 }) })
    expect(changes).toEqual([]) // no commit from an unmeasurable drag
    // The keyboard path still works on the same mount.
    act(() => { fireEvent.keyDown(separator, { key: 'ArrowRight' }) })
    expect(changes.at(-1)).toBeCloseTo(0.52)
  })
})

// ---------------------------------------------------------------------------
// AC1/AC5 — the board pane body's split chrome (the SAME TasksView underneath)
// ---------------------------------------------------------------------------

describe('BoardTabBody: the C9 chrome wraps, never into (AC5)', () => {
  it('no split store / an inactive split renders the plain pane body (单 pane 默认)', () => {
    boardStub.props = []
    const store = createSplitPaneStore()
    const plain = render(<BoardTabBody t={t} />)
    expect(plain.container.querySelector('[data-dsh-forge-pane-header]')).toBeNull()
    expect(plain.container.querySelector('[data-dsh-forge-split-separator]')).toBeNull()
    const single = render(<BoardTabBody t={t} split={store} />)
    store.reconcile([{ tabId: 'b1', kind: 'board' }]) // one pane — not a split
    expect(single.container.querySelector('[data-dsh-forge-pane-header]')).toBeNull()
    expect(single.container.querySelector('[data-mock-tasks-view]')?.getAttribute('data-mock-tasks-view')).toBe('pane')
  })

  it('an ACTIVE split (≥ 2 C9 panes) mounts the pane 头 + the 分隔条 over the SAME TasksView', () => {
    boardStub.props = []
    boardStub.mounts = 0
    const store = createSplitPaneStore()
    const view = render(<BoardTabBody t={t} split={store} />)
    act(() => {
      store.reconcile([
        { tabId: 'b1', kind: 'board' },
        { tabId: 'a1', kind: 'subagentchat' },
      ])
    })
    expect(view.container.querySelector('[data-dsh-forge-pane-header="board"]')).not.toBeNull()
    expect(view.container.querySelector('[data-dsh-forge-split-separator]')).not.toBeNull()
    expect(view.container.querySelector('[data-dsh-forge-pane-detach]')?.hasAttribute('disabled')).toBe(true)
    // AC5: the view below is the same board instance — one mount, host='pane'.
    expect(view.container.querySelector('[data-mock-tasks-view]')?.getAttribute('data-mock-tasks-view')).toBe('pane')
    expect(boardStub.props.at(-1)).toMatchObject({ host: 'pane' })

    // The separator's commits land in the store (比例即时存 → the seam).
    const separator = view.container.querySelector<HTMLElement>('[data-dsh-forge-split-separator]')
    act(() => { fireEvent.keyDown(separator as HTMLElement, { key: 'ArrowRight', shiftKey: true }) })
    expect(store.getSnapshot().ratio).toBeCloseTo(0.6)

    // 全部 pane 关闭 → the chrome leaves with the split (回活跃区单视图).
    act(() => { store.reconcile([{ tabId: 'guide-1', kind: 'guide' }]) })
    expect(view.container.querySelector('[data-dsh-forge-pane-header]')).toBeNull()
    expect(view.container.querySelector('[data-dsh-forge-split-separator]')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// The utilities-seat installer
// ---------------------------------------------------------------------------

/** Fake client ctx over the real SlotCore (the rightbar-container pattern). */
function makeFakeCtx(core: SlotCore): Context {
  return {
    effect(fn: () => (() => void) | undefined | void): () => void {
      const dispose = fn()
      return () => dispose?.()
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
  } as unknown as Context
}

/** Declare the utilities slot the way ui-conversation's factory does (a list child under a session-scoped parent). */
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

describe('installSplitControls: the conversation header utilities seat', () => {
  it('registers ONE list entry; dispose removes it', () => {
    const core = new SlotCore()
    declareUtilitiesSeat(core)
    const dispose = installSplitControls(makeFakeCtx(core), { t, store: createSplitPaneStore() })
    const entries = core.entriesOfSlot(CONVERSATION_HEADER_UTILITIES_SLOT)
    expect(entries.map(entry => entry.options.id)).toEqual([SPLIT_CONTROL_ID])
    dispose()
    expect(core.entriesOfSlot(CONVERSATION_HEADER_UTILITIES_SLOT)).toEqual([])
  })

  it('waits for the upstream declaration (arrival-order; nothing registered before)', () => {
    const core = new SlotCore()
    const dispose = installSplitControls(makeFakeCtx(core), { t, store: createSplitPaneStore() })
    expect(core.entriesOfSlot(CONVERSATION_HEADER_UTILITIES_SLOT)).toEqual([])
    declareUtilitiesSeat(core)
    expect(core.entriesOfSlot(CONVERSATION_HEADER_UTILITIES_SLOT).map(entry => entry.options.id))
      .toEqual([SPLIT_CONTROL_ID])
    dispose()
  })

  it('the inject face carries the store and the lazy legs', () => {
    const core = new SlotCore()
    declareUtilitiesSeat(core)
    const store = createSplitPaneStore()
    const face = { openTab: vi.fn(), openResource: vi.fn() }
    installSplitControls(makeFakeCtx(core), {
      t,
      store,
      getSplitFace: () => face,
      getAsideAddress: () => ADDRESS,
    })
    const entry = core.entriesOfSlot(CONVERSATION_HEADER_UTILITIES_SLOT)[0]
    const injected = (entry?.inject as () => Record<string, unknown>)?.() as Record<string, unknown>
    expect(injected).toMatchObject({ t, store })
    expect((injected.getSplitFace as () => unknown)()).toBe(face)
  })
})
