// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TaskBoardPage } from '../src/client/views/TaskBoardPage.tsx'
import type { TaskBoardPageProps } from '../src/client/views/TaskBoardPage.tsx'
import { DETAIL_DOCK_WIDTH } from '../src/client/views/tasks/TaskDetailPanel.tsx'
import {
  createSelectedTaskStore, INITIAL_SELECTED_TASK,
} from '../src/client/store/selected-task.ts'
import { en, type WorkbenchKey } from '../src/client/locale/en.ts'
import { zh } from '../src/client/locale/zh.ts'
import {
  MOCK_TASK_BOARD, createMockTaskBoardFace,
} from '../src/client/mocks/workbench.ts'
import type { TaskBoardData, TaskSummary, WorkbenchEvent } from '../src/client/ipc-types.ts'

// Task 5.8 — the UF3 INTEGRATE units: the 5.7 dock mounted into the board
// page over the single-source selection store (mocked faces; 5.15 wires the
// IPC verbs). AC map:
//   AC1 三来源(B 行/C 行/A 节点)点击均打开侧板 + 原视图高亮
//   AC2 选中切换无闪烁(不卸载重挂)+ 关闭后再开恢复上次选中(页内会话期)
//   AC3 dock 开合布局收缩回弹(右缘 inset 与 dock 宽一致, 无横向滚动破版)
//   AC4 键盘路径: A 焦点节点 Enter / B·C 行 Enter·Space 打开侧板
//   AC5 本套件: 三来源联动矩阵 + 布局收缩断言 (+ 共存: 看板在侧板开启时
//   仍可交互, 视图切换保持选中, 外部 onSelect 观察面不破)。
// Hard Rule: 联动选中态单一来源(一处 store)——三视图只收 controlled
// selectedKey, 绝不自持副本(store 单测直接锁死这一契约)。

// The upstream StateDot resolves through the module table at runtime; jsdom
// renders stub it (task-board.spec precedent — the real dot rides the e2e).
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  StateDot: (props: { state: string }) => <span data-mock-state-dot={props.state} />,
}))

// The board's DEFAULT view is 视图 A — the real ReactFlow needs d3-zoom +
// ResizeObserver (absent in jsdom), so every render goes through the
// lib-boundary standin (task-board.spec precedent).
vi.mock('@xyflow/react', async () => await import('./helpers/xyflow-standin'))

type Dict = Record<WorkbenchKey, string>
const bind = (dict: Dict) => (key: WorkbenchKey): string => dict[key]
const t = { en: bind(en), zh: bind(zh) }

/** Tasks the detail mock covers (a selection test's safe population). */
const RICH_KEY = 'dsh-forge-m2/6.1'
const HEADER_KEY = 'dsh-forge-m1/4.4'
const SPARSE_KEY = 'dsh-forge-m1/7.2'

/** A spied board face with the emit poke exposed (task-board.spec precedent). */
function makeFace(initial: TaskBoardData = MOCK_TASK_BOARD) {
  const base = createMockTaskBoardFace(initial)
  let listener: ((events: readonly WorkbenchEvent[]) => void) | undefined
  const face = {
    loadBoard: vi.fn(base.loadBoard),
    subscribeEvents: vi.fn((callback: (events: readonly WorkbenchEvent[]) => void) => {
      listener = callback
      return () => {}
    }),
  }
  return Object.assign(face, { emit: (events: readonly WorkbenchEvent[]) => { listener?.(events) } })
}

/** Render the page, settle the load, and land on a view (default = A/tree). */
async function renderBoard(props: Partial<TaskBoardPageProps> = {}, view: 'raw' | 'grouped' | 'list' = 'raw') {
  const face = makeFace()
  render(<TaskBoardPage t={t.en} face={face} {...props} />)
  await waitFor(() => {
    expect(document.querySelector('[data-dsh-forge-task-toolbar]')).not.toBeNull()
  })
  if (view !== 'raw') {
    fireEvent.click(document.querySelector(`[data-dsh-forge-board-view="${view}"]`) as HTMLElement)
  }
  return face
}

const q = (selector: string): HTMLElement => document.querySelector(selector) as HTMLElement

/** The dock root (null while closed). */
const dock = (): HTMLElement | null => document.querySelector('[data-dsh-forge-task-detail]')

/** Activate a task from one of the three sources (mouse path). */
function activateFrom(source: 'a' | 'b' | 'c', key: string): void {
  if (source === 'a') {
    fireEvent.click(q(`[data-dsh-forge-dep-tree] [data-id="${key}"]`))
  } else if (source === 'b') {
    fireEvent.click(q(`[data-dsh-forge-task-card="${key}"]`))
  } else {
    fireEvent.click(q(`[data-dsh-forge-task-row="${key}"]`))
  }
}

/** The selected marker element inside one view (null when the row is absent). */
const selectedIn = (scope: string): HTMLElement | null =>
  document.querySelector(`${scope} [data-dsh-forge-selected]`)

/** Full pointer press + release + click (real-gesture parity for the swallow arbitration). */
function pressAndActivate(el: HTMLElement): void {
  fireEvent.pointerDown(el)
  fireEvent.pointerUp(el)
  fireEvent.click(el)
}

afterEach(() => {
  cleanup()
})

// ---------------------------------------------------------------------------
// The selection store — the single source (Hard Rule)
// ---------------------------------------------------------------------------

describe('selected-task store: the single selection source', () => {
  it('boots unselected and commits frozen snapshots', () => {
    const store = createSelectedTaskStore()
    expect(store.getSnapshot()).toBe(INITIAL_SELECTED_TASK)
    expect(Object.isFrozen(store.getSnapshot())).toBe(true)
  })

  it('select opens + retargets; close keeps the key for the reopen-restore', () => {
    const store = createSelectedTaskStore()
    store.select('f/a')
    expect(store.getSnapshot()).toEqual({ taskKey: 'f/a', open: true })
    store.select('f/b')
    expect(store.getSnapshot()).toEqual({ taskKey: 'f/b', open: true })
    store.close()
    expect(store.getSnapshot()).toEqual({ taskKey: 'f/b', open: false })
    // 页内会话期: reopening the SAME task restores the last selection.
    store.select('f/b')
    expect(store.getSnapshot()).toEqual({ taskKey: 'f/b', open: true })
  })

  it('no-op transitions never notify; real transitions notify exactly once', () => {
    const store = createSelectedTaskStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    store.select('f/a') // transition
    store.select('f/a') // same key, already open — no-op
    store.close() // transition
    store.close() // already closed — no-op
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    store.select('f/z')
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('snapshots are stable references between transitions', () => {
    const store = createSelectedTaskStore()
    const before = store.getSnapshot()
    store.select('f/a')
    const open = store.getSnapshot()
    store.close()
    expect(store.getSnapshot()).not.toBe(open)
    expect(before).not.toBe(open)
  })
})

// ---------------------------------------------------------------------------
// AC1 — 三来源联动矩阵: every source opens the dock and highlights its origin
// ---------------------------------------------------------------------------

describe('AC1: three-source selection matrix', () => {
  it('view A node activation opens the dock and highlights the node (link border)', async () => {
    await renderBoard({}, 'raw')
    activateFrom('a', RICH_KEY)
    const root = dock()
    expect(root).not.toBeNull()
    expect(root!.getAttribute('data-dsh-forge-task-detail')).toBe(RICH_KEY)
    // 焦点任务 node: the selected marker + the ui-design link border on the card.
    const card = q(`[data-dsh-forge-node-card="${RICH_KEY}"]`)
    expect(card.hasAttribute('data-dsh-forge-selected')).toBe(true)
    expect(card.style.border).toContain('var(--dsw-alias-link')
    await waitFor(() => { expect(q('[data-dsh-forge-detail-header]').textContent).toContain('Indexer dialect guard') })
  })

  it('view B card activation opens the dock and highlights the card', async () => {
    await renderBoard({}, 'grouped')
    activateFrom('b', HEADER_KEY)
    const root = dock()
    expect(root).not.toBeNull()
    expect(root!.getAttribute('data-dsh-forge-task-detail')).toBe(HEADER_KEY)
    const card = q(`[data-dsh-forge-task-card="${HEADER_KEY}"]`)
    expect(card.hasAttribute('data-dsh-forge-selected')).toBe(true)
    expect(card.style.backgroundColor).not.toBe('')
    // Only the origin row carries the mark — one selection, not a column.
    expect(document.querySelectorAll('[data-dsh-forge-task-card][data-dsh-forge-selected]')).toHaveLength(1)
  })

  it('view C row activation opens the dock and highlights the row', async () => {
    await renderBoard({}, 'list')
    activateFrom('c', SPARSE_KEY)
    const root = dock()
    expect(root).not.toBeNull()
    expect(root!.getAttribute('data-dsh-forge-task-detail')).toBe(SPARSE_KEY)
    const row = q(`[data-dsh-forge-task-row="${SPARSE_KEY}"]`)
    expect(row.hasAttribute('data-dsh-forge-selected')).toBe(true)
    expect(row.style.backgroundColor).not.toBe('')
  })

  it('the shell-facing onSelect seat still observes every activation', async () => {
    const onSelect = vi.fn()
    await renderBoard({ onSelect }, 'list')
    activateFrom('c', SPARSE_KEY)
    expect(onSelect).toHaveBeenCalledTimes(1)
    const handed: TaskSummary = onSelect.mock.calls[0][0]
    expect(handed.key).toBe(SPARSE_KEY)
  })
})

// ---------------------------------------------------------------------------
// AC2 — 切换无闪烁 + 关闭后恢复上次选中
// ---------------------------------------------------------------------------

describe('AC2: churn-free switching and the reopen-restore', () => {
  it('a row-to-row switch keeps the dock MOUNTED (aria-busy repaint, no unmount flicker)', async () => {
    await renderBoard({}, 'list')
    activateFrom('c', RICH_KEY)
    await waitFor(() => { expect(q('[data-dsh-forge-detail-header]').textContent).toContain('Indexer dialect guard') })
    const before = dock()
    // A full press on another row: the outside-pointerdown close is arbitrated
    // away (a selectable press is mid-selection, not an outside click), so the
    // click SWITCHES the selection in place.
    pressAndActivate(q(`[data-dsh-forge-task-row="${HEADER_KEY}"]`))
    const after = dock()
    expect(after).not.toBeNull()
    expect(after).toBe(before) // same DOM node: the panel never unmounted
    expect(after!.getAttribute('data-dsh-forge-task-detail')).toBe(HEADER_KEY)
    await waitFor(() => { expect(q('[data-dsh-forge-detail-header]').textContent).toContain('Installer signing matrix') })
    // The highlight followed the selection to the new row.
    expect(selectedIn('[data-dsh-forge-task-list]')!.getAttribute('data-dsh-forge-task-row')).toBe(HEADER_KEY)
  })

  it('the dep-chain jump retargets the dock in place (onNavigate → same mount)', async () => {
    await renderBoard({}, 'raw')
    activateFrom('a', RICH_KEY)
    await waitFor(() => { expect(q('[data-dsh-forge-detail-header]').textContent).toContain('Indexer dialect guard') })
    const before = dock()
    // 6.1's chain: 5.5 → 5.6 → 5.15; jumping to 5.6 keeps the dock mounted.
    fireEvent.click(q('[data-dsh-forge-detail-dep="dsh-forge-m2/5.6"] button'))
    const after = dock()
    expect(after).toBe(before)
    expect(after!.getAttribute('data-dsh-forge-task-detail')).toBe('dsh-forge-m2/5.6')
    // The view-A highlight follows the retargeted selection.
    await waitFor(() => {
      expect(q('[data-dsh-forge-node-card="dsh-forge-m2/5.6"]').hasAttribute('data-dsh-forge-selected')).toBe(true)
    })
  })

  it('close keeps the origin highlight; re-activating the same row restores the last selection', async () => {
    await renderBoard({}, 'list')
    activateFrom('c', RICH_KEY)
    await waitFor(() => { expect(dock()).not.toBeNull() })
    fireEvent.keyDown(dock()!, { key: 'Escape' })
    expect(dock()).toBeNull()
    // 页内会话期: the selection memory survives the close — the row stays marked.
    expect(selectedIn('[data-dsh-forge-task-list]')!.getAttribute('data-dsh-forge-task-row')).toBe(RICH_KEY)
    activateFrom('c', RICH_KEY)
    expect(dock()!.getAttribute('data-dsh-forge-task-detail')).toBe(RICH_KEY)
  })

  it('an outside press on a NON-selectable area closes the dock (Esc/✕/外点 contract intact)', async () => {
    await renderBoard({}, 'list')
    activateFrom('c', RICH_KEY)
    await waitFor(() => { expect(dock()).not.toBeNull() })
    fireEvent.pointerDown(document.body)
    expect(dock()).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// AC3 — dock 开合布局收缩回弹
// ---------------------------------------------------------------------------

describe('AC3: layout shrink and bounce-back', () => {
  it('the board root insets by the dock width while open and bounces back on close', async () => {
    await renderBoard({}, 'list')
    const root = q('[data-dsh-forge-task-board]')
    expect(root.style.paddingRight).toBe('')
    activateFrom('c', RICH_KEY)
    await waitFor(() => { expect(dock()).not.toBeNull() })
    // The inset equals the dock's own width — the flow layout yields exactly
    // the dock's strip (无横向滚动破版: content shrinks, never slides under).
    expect(root.style.paddingRight).toBe(DETAIL_DOCK_WIDTH)
    expect(dock()!.style.width).toBe(DETAIL_DOCK_WIDTH)
    expect(root.style.minWidth).toBe('0px')
    fireEvent.keyDown(dock()!, { key: 'Escape' })
    expect(root.style.paddingRight).toBe('')
  })

  it('view B keeps its own horizontal scroller intact beside the open dock', async () => {
    await renderBoard({}, 'grouped')
    activateFrom('b', HEADER_KEY)
    await waitFor(() => { expect(dock()).not.toBeNull() })
    const board = q('[data-dsh-forge-status-board]')
    expect(board.style.overflowX).toBe('auto')
    // The columns' fixed min width survives the inset (收缩回弹的前提).
    expect(q('[data-dsh-forge-status-column="completed"]').style.minWidth).toBe('280px')
  })

  it('view A keeps its canvas container while the dock is open', async () => {
    await renderBoard({}, 'raw')
    activateFrom('a', RICH_KEY)
    await waitFor(() => { expect(dock()).not.toBeNull() })
    expect(q('[data-dsh-forge-dep-tree]').style.minWidth).toBe('0px')
  })
})

// ---------------------------------------------------------------------------
// AC4 — 键盘路径
// ---------------------------------------------------------------------------

describe('AC4: keyboard paths from all three views', () => {
  it('view A: a focused node + Enter opens the dock (5.6 traversal hand-off)', async () => {
    await renderBoard({}, 'raw')
    const node = q(`[data-dsh-forge-dep-tree] [data-id="${RICH_KEY}"]`)
    node.focus()
    expect(document.activeElement).toBe(node)
    fireEvent.keyDown(node, { key: 'Enter' })
    expect(dock()!.getAttribute('data-dsh-forge-task-detail')).toBe(RICH_KEY)
  })

  it('view B: the focused card is a native button — activation opens the dock (Enter/Space ride the platform)', async () => {
    await renderBoard({}, 'grouped')
    const card = q(`[data-dsh-forge-task-card="${HEADER_KEY}"]`)
    // The card IS a <button>: Enter / Space activate it per the platform's
    // own button semantics (jsdom cannot synthesize that activation — the
    // component deliberately carries no duplicate key handler — so the unit
    // asserts the element contract + the activation path; the real key rides
    // the e2e lane).
    expect(card.tagName).toBe('BUTTON')
    card.focus()
    expect(document.activeElement).toBe(card)
    fireEvent.click(card)
    expect(dock()!.getAttribute('data-dsh-forge-task-detail')).toBe(HEADER_KEY)
  })

  it('view C: Enter AND Space on a focused row both open the dock', async () => {
    await renderBoard({}, 'list')
    const row = q(`[data-dsh-forge-task-row="${SPARSE_KEY}"]`)
    row.focus()
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(dock()!.getAttribute('data-dsh-forge-task-detail')).toBe(SPARSE_KEY)
    fireEvent.keyDown(dock()!, { key: 'Escape' })
    const other = q(`[data-dsh-forge-task-row="${RICH_KEY}"]`)
    other.focus()
    fireEvent.keyDown(other, { key: ' ' })
    expect(dock()!.getAttribute('data-dsh-forge-task-detail')).toBe(RICH_KEY)
  })

  it('focus returns to the originating trigger on close (all three view types)', async () => {
    // View B card
    await renderBoard({}, 'grouped')
    const card = q(`[data-dsh-forge-task-card="${HEADER_KEY}"]`)
    card.focus()
    fireEvent.click(card)
    await waitFor(() => { expect(dock()).not.toBeNull() })
    fireEvent.keyDown(dock()!, { key: 'Escape' })
    expect(document.activeElement).toBe(card)

    // View C row (switch into the list view first)
    fireEvent.click(q('[data-dsh-forge-board-view="list"]'))
    const row = q(`[data-dsh-forge-task-row="${SPARSE_KEY}"]`)
    row.focus()
    fireEvent.click(row)
    await waitFor(() => { expect(dock()).not.toBeNull() })
    fireEvent.keyDown(dock()!, { key: 'Escape' })
    expect(document.activeElement).toBe(row)

    // View A node wrapper (the DAG node focus target)
    fireEvent.click(q('[data-dsh-forge-board-view="tree"]'))
    const node = q(`[data-dsh-forge-dep-tree] [data-id="${RICH_KEY}"]`)
    node.focus()
    fireEvent.keyDown(node, { key: 'Enter' })
    await waitFor(() => { expect(dock()).not.toBeNull() })
    fireEvent.keyDown(dock()!, { key: 'Escape' })
    expect(document.activeElement).toBe(node)
  })
})

// ---------------------------------------------------------------------------
// AC5 — 共存 (non-modal contract): the board stays interactive while open
// ---------------------------------------------------------------------------

describe('coexistence: the board stays interactive beside the open dock', () => {
  it('switching views keeps the dock open and the highlight follows into the new view', async () => {
    await renderBoard({}, 'grouped')
    activateFrom('b', HEADER_KEY)
    await waitFor(() => { expect(dock()).not.toBeNull() })
    fireEvent.click(q('[data-dsh-forge-board-view="list"]'))
    // The dock survived the view switch (board interaction must not close it).
    expect(dock()!.getAttribute('data-dsh-forge-task-detail')).toBe(HEADER_KEY)
    expect(selectedIn('[data-dsh-forge-task-list]')!.getAttribute('data-dsh-forge-task-row')).toBe(HEADER_KEY)
    // ... and back into view B.
    fireEvent.click(q('[data-dsh-forge-board-view="grouped"]'))
    expect(dock()).not.toBeNull()
    expect(selectedIn('[data-dsh-forge-status-board]')!.getAttribute('data-dsh-forge-task-card')).toBe(HEADER_KEY)
  })

  it('filters/search keep working while the dock is open', async () => {
    await renderBoard({}, 'list')
    activateFrom('c', RICH_KEY)
    await waitFor(() => { expect(dock()).not.toBeNull() })
    const search = q('[data-dsh-forge-tasks-search]')
    fireEvent.change(search, { target: { value: 'Installer' } })
    await waitFor(() => {
      expect(document.querySelectorAll('[data-dsh-forge-task-row]').length).toBe(1)
    })
    expect(dock()).not.toBeNull()
  })

  it('a filter hiding the selected task keeps the dock keyed open (selection ≠ visibility)', async () => {
    await renderBoard({}, 'list')
    activateFrom('c', RICH_KEY)
    await waitFor(() => { expect(dock()).not.toBeNull() })
    fireEvent.change(q('[data-dsh-forge-tasks-search]'), { target: { value: 'Installer' } })
    await waitFor(() => {
      expect(document.querySelector(`[data-dsh-forge-task-row="${RICH_KEY}"]`)).toBeNull()
    })
    // The task still exists (only filtered out) — the dock stays on its key.
    expect(dock()!.getAttribute('data-dsh-forge-task-detail')).toBe(RICH_KEY)
  })

  it('the launch entry mounts panel-primary once projectId + codeRoot are present', async () => {
    await renderBoard({ projectId: 'p-1', codeRoot: 'Z:\\project\\dsh\\dsh-forge' }, 'list')
    activateFrom('c', RICH_KEY)
    await waitFor(() => { expect(dock()).not.toBeNull() })
    expect(document.querySelector('[data-dsh-forge-detail-launch-reserved]')).toBeNull()
    expect(document.querySelector('[data-dsh-forge-launch-trigger]')).not.toBeNull()
  })

  it('without a codeRoot the reserved placeholder keeps the button slot', async () => {
    await renderBoard({ projectId: 'p-1' }, 'list')
    activateFrom('c', RICH_KEY)
    await waitFor(() => { expect(dock()).not.toBeNull() })
    expect(document.querySelector('[data-dsh-forge-detail-launch-reserved]')).not.toBeNull()
    expect(document.querySelector('[data-dsh-forge-launch-trigger]')).toBeNull()
  })
})
