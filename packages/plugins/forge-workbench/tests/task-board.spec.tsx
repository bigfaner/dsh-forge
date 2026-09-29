// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  computeDanglingByTask, featureSlugsOf, filterTasks, localIdOf, resolveBlockerKey, sortTasks,
} from '../src/client/views/TaskBoardPage.tsx'
import { TaskBoardPage } from '../src/client/views/TaskBoardPage.tsx'
import type { TaskBoardPageProps } from '../src/client/views/TaskBoardPage.tsx'
import { TasksView } from '../src/client/views/tasks/TasksView.tsx'
import { DEFAULT_BOARD_FILTER, type BoardViewKey } from '../src/client/views/tasks/TaskToolbar.tsx'
import { en, type WorkbenchKey } from '../src/client/locale/en.ts'
import { zh } from '../src/client/locale/zh.ts'
import {
  MOCK_TASK_BOARD, MOCK_TASK_BOARD_EMPTY, MOCK_TASK_BOARD_SYNC_ERROR, createMockTaskBoardFace,
  createMockDispatchFace, createMockTaskDetailFace,
} from '../src/client/mocks/workbench.ts'
import type { DispatchRow, TaskBoardData, TaskSummary, WorkbenchEvent } from '../src/client/ipc-types.ts'
import type { TaskBoardFace } from '../src/client/contract.ts'

// Task 5.5 — the UF2 board BUILD units (mocked face; 5.15 wires the IPC
// verbs). AC map:
//   AC1 view B 7-态 columns, card fields, collapse · AC2 view C columns +
//   sort + width budgets · AC3 toolbar (switcher with the 5.6 placeholder
//   tree tab, status filter, search over 标题/任务号) · AC4 read-only (no
//   write affordance anywhere in the data area) · AC5 updating 回流 (row
//   highlight + aria-live) · AC6 this suite itself. Hard Rules: view switch
//   preserves filters (+ collapse, + B horizontal scroll); 人侧只读.

// The upstream StateDot resolves through the module table at runtime; the
// npm node entry carries undeclared transitive deps (clsx/shiki/...) that
// only the upstream monorepo supplies, so the jsdom render stubs it with an
// observable span (the shell.spec precedent — the real dot rides the e2e).
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  StateDot: (props: { state: string }) => <span data-mock-state-dot={props.state} />,
}))

// Since 5.6 the board's DEFAULT view is 视图 A (the DAG) — the real ReactFlow
// needs d3-zoom + ResizeObserver (absent in jsdom), so every board render in
// this file goes through the lib-boundary standin (tests/task-dag.spec.tsx
// owns the view-A units; the real engine rides the e2e lane).
vi.mock('@xyflow/react', async () => await import('./helpers/xyflow-standin'))

type Dict = Record<WorkbenchKey, string>
const bind = (dict: Dict) => (key: WorkbenchKey): string => dict[key]
const t = { en: bind(en), zh: bind(zh) }

const TOTAL = MOCK_TASK_BOARD.tasks.length

/** A spied face over the real mock twin, with the emit poke exposed. */
function makeFace(initial: TaskBoardData = MOCK_TASK_BOARD) {
  const base = createMockTaskBoardFace(initial)
  const unsubscribe = vi.fn()
  // Since 3.9 the page's presentation leg AND the approval dock's
  // subscription leg both register (the real channel multiplexes over one
  // preload subscription) — the facade fans emit into EVERY live listener.
  const listeners = new Set<(events: readonly WorkbenchEvent[]) => void>()
  const face = {
    loadBoard: vi.fn(base.loadBoard),
    subscribeEvents: vi.fn((callback: (events: readonly WorkbenchEvent[]) => void) => {
      listeners.add(callback)
      return unsubscribe
    }),
  }
  return Object.assign(face, {
    base,
    unsubscribe,
    emit: (events: readonly WorkbenchEvent[]) => { for (const listener of listeners) listener(events) },
  })
}

type Face = ReturnType<typeof makeFace>

/**
 * Render the page and settle the initial load into the populated state.
 * The board's default view is 视图 A (tree, since 5.6); `initial` switches to
 * another view after the load settles (the bulk of the 5.5 B/C assertions
 * address their own panels — 'raw' keeps the default for switcher tests).
 */
async function renderBoard(
  props: Partial<TaskBoardPageProps> = {},
  face?: Face,
  initial: 'raw' | BoardViewKey = 'grouped',
) {
  const f = face ?? makeFace()
  render(<TaskBoardPage t={t.en} face={f} {...props} />)
  await waitFor(() => {
    expect(document.querySelector('[data-dsh-forge-task-toolbar]')).not.toBeNull()
  })
  if (initial !== 'raw') switchView(initial)
  return { face: f }
}

/** Switch the board view by clicking its toolbar tab. */
function switchView(view: 'tree' | 'grouped' | 'list'): void {
  fireEvent.click(document.querySelector(`[data-dsh-forge-board-view="${view}"]`) as HTMLElement)
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// The pure board model (filter / sort / dialect / dangling)
// ---------------------------------------------------------------------------

describe('board model: dialect helpers', () => {
  it('localIdOf splits the qualified key; resolveBlockerKey re-qualifies a local blocker', () => {
    expect(localIdOf('dsh-forge-m2/5.5')).toBe('5.5')
    expect(localIdOf('5.5')).toBe('5.5')
    expect(resolveBlockerKey('dsh-forge-m2', '5.5')).toBe('dsh-forge-m2/5.5')
  })
})

describe('board model: filterTasks', () => {
  const tasks = MOCK_TASK_BOARD.tasks

  it('the unrestricted filter passes everything through', () => {
    expect(filterTasks(tasks, DEFAULT_BOARD_FILTER)).toHaveLength(TOTAL)
  })

  it('search matches titles AND task numbers (qualified and local), case-insensitively', () => {
    expect(filterTasks(tasks, { ...DEFAULT_BOARD_FILTER, search: 'wizard' }).map(row => row.key))
      .toEqual(['dsh-forge-m2/5.4'])
    expect(filterTasks(tasks, { ...DEFAULT_BOARD_FILTER, search: '7.2' }).map(row => row.key))
      .toEqual(['dsh-forge-m1/7.2'])
    expect(filterTasks(tasks, { ...DEFAULT_BOARD_FILTER, search: 'dsh-forge-m1/4.4' }).map(row => row.key))
      .toEqual(['dsh-forge-m1/4.4'])
    expect(filterTasks(tasks, { ...DEFAULT_BOARD_FILTER, search: 'INSTALLER SIGNING' }).map(row => row.key))
      .toEqual(['dsh-forge-m1/4.4'])
    expect(filterTasks(tasks, { ...DEFAULT_BOARD_FILTER, search: 'no-such-thing' })).toHaveLength(0)
  })

  it('a non-empty status set restricts to the selected statuses (empty set = all)', () => {
    const blockedOnly = filterTasks(tasks, {
      ...DEFAULT_BOARD_FILTER, statuses: new Set(['blocked']),
    })
    expect(blockedOnly.map(row => row.key).sort()).toEqual(['dsh-forge-m2/5.9', 'dsh-forge-m2/6.1'])
  })

  it('feature + worktreeOnly compose with the rest', () => {
    expect(filterTasks(tasks, { ...DEFAULT_BOARD_FILTER, featureSlug: 'dsh-forge-m1' }))
      .toHaveLength(3)
    expect(filterTasks(tasks, { ...DEFAULT_BOARD_FILTER, worktreeOnly: true }).map(row => row.key).sort())
      .toEqual(['dsh-forge-m1/4.4', 'dsh-forge-m1/7.2', 'dsh-forge-m2/5.5'])
    expect(filterTasks(tasks, {
      ...DEFAULT_BOARD_FILTER, featureSlug: 'dsh-forge-m1', worktreeOnly: true,
    }).map(row => row.key)).toEqual(['dsh-forge-m1/4.4', 'dsh-forge-m1/7.2'])
  })
})

describe('board model: sortTasks', () => {
  const tasks = MOCK_TASK_BOARD.tasks

  it('status sort follows the canonical 7-态 order, ties breaking on the key', () => {
    const keys = sortTasks(tasks, 'status').map(row => row.key)
    expect(keys.slice(0, 4)).toEqual([
      'dsh-forge-m1/7.2', 'dsh-forge-m2/5.15', 'dsh-forge-m2/5.6', 'dsh-forge-m2/5.7',
    ])
    expect(keys[4]).toBe('dsh-forge-m2/5.5')
    expect(keys.slice(5, 10).sort()).toEqual([
      'dsh-forge-m1/4.3', 'dsh-forge-m1/4.4', 'dsh-forge-m2/5.2', 'dsh-forge-m2/5.3', 'dsh-forge-m2/5.4',
    ])
    expect(keys.slice(-3)).toEqual(['dsh-forge-m2/3.9', 'dsh-forge-m2/3.11', 'dsh-forge-m2/3.12'])
  })

  it('updatedAt sort is newest-first, deterministic on ties', () => {
    const keys = sortTasks(tasks, 'updatedAt').map(row => row.key)
    expect(keys[0]).toBe('dsh-forge-m2/5.5')
    expect(keys[1]).toBe('dsh-forge-m2/5.7')
    expect(keys[2]).toBe('dsh-forge-m2/5.6')
    expect(keys[TOTAL - 1]).toBe('dsh-forge-m1/7.2')
  })
})

describe('board model: dangling blockers (6.2 consistency)', () => {
  it('marks same-feature unresolvable blockers and leaves resolvable ones alone', () => {
    const dangling = computeDanglingByTask(MOCK_TASK_BOARD.tasks)
    expect(dangling.get('dsh-forge-m2/5.9')).toEqual(['5.8'])
    expect(dangling.has('dsh-forge-m2/6.1')).toBe(false)
    expect(dangling.has('dsh-forge-m2/5.15')).toBe(false)
    // Cross-feature guard: a local key resolving in ANOTHER feature does not resolve here.
    expect(dangling.has('dsh-forge-m1/4.4')).toBe(false)
  })

  it('a same-local-id blocker in a foreign feature stays dangling', () => {
    const board: TaskSummary[] = [
      { ...MOCK_TASK_BOARD.tasks[0]!, key: 'feature-a/2.1', featureSlug: 'feature-a', blockers: ['1.1'] },
      { ...MOCK_TASK_BOARD.tasks[0]!, key: 'feature-b/1.1', featureSlug: 'feature-b', blockers: [] },
    ]
    // '1.1' resolves to feature-a/1.1 — absent; feature-b/1.1 does not rescue it.
    expect(computeDanglingByTask(board).get('feature-a/2.1')).toEqual(['1.1'])
  })

  it('featureSlugsOf dedupes and sorts', () => {
    expect(featureSlugsOf(MOCK_TASK_BOARD.tasks)).toEqual(['dsh-forge-m1', 'dsh-forge-m2'])
  })
})

// ---------------------------------------------------------------------------
// View B — the 7-column status board (AC1)
// ---------------------------------------------------------------------------

describe('view B: the 状态分组 board', () => {
  it('renders one column per 7 态 in canonical order, empty statuses included, with counts', async () => {
    await renderBoard()
    const columns = Array.from(document.querySelectorAll('[data-dsh-forge-status-column]'))
    expect(columns.map(column => column.getAttribute('data-dsh-forge-status-column'))).toEqual([
      'pending', 'in_progress', 'completed', 'blocked', 'suspended', 'skipped', 'rejected',
    ])
    const countOf = (status: string): string =>
      (document.querySelector(`[data-dsh-forge-status-count="${status}"]`) as HTMLElement).textContent ?? ''
    expect(countOf('pending')).toBe('4')
    expect(countOf('in_progress')).toBe('1')
    expect(countOf('completed')).toBe('5')
    expect(countOf('blocked')).toBe('2')
    expect(countOf('suspended')).toBe('1')
    expect(countOf('skipped')).toBe('1')
    expect(countOf('rejected')).toBe('1')
    // Column heads carry the full status name + dot (mock stub observes the visual).
    const head = document.querySelector('[data-dsh-forge-status-column="in_progress"]') as HTMLElement
    expect(head.textContent).toContain(en['tasks.status.in_progress'])
    expect(head.querySelector('[data-mock-state-dot]')?.getAttribute('data-mock-state-dot')).toBe('ongoing')
  })

  it('cards render 标题/branch/worktree/来源徽标 + short status + the dot (AC1)', async () => {
    await renderBoard()
    const card = document.querySelector('[data-dsh-forge-task-card="dsh-forge-m2/5.5"]') as HTMLElement
    expect(card.textContent).toContain('UF2 task board build')
    expect(card.textContent).toContain('dsh-forge-m2/5.5')
    expect(card.textContent).toContain('dsh-forge-m2') // branch
    expect(card.textContent).toContain(en['tasks.status.short.in_progress'])
    expect(card.querySelector('[data-dsh-forge-badge="worktree"]')?.textContent).toBe(en['tasks.badge.worktree'])
    expect(card.querySelector('[data-dsh-forge-badge="source:session"]')?.textContent).toBe(en['tasks.source.session'])
    expect(card.querySelector('[data-mock-state-dot]')?.getAttribute('data-mock-state-dot')).toBe('ongoing')
    // A null-source card carries no source badge.
    const bare = document.querySelector('[data-dsh-forge-task-card="dsh-forge-m2/5.6"]') as HTMLElement
    expect(bare.querySelector('[data-dsh-forge-badge^="source:"]')).toBeNull()
    expect(bare.querySelector('[data-dsh-forge-badge="worktree"]')).toBeNull()
  })

  it('the dangling blocker renders its 悬空标记 with the missing keys in the title', async () => {
    await renderBoard()
    const card = document.querySelector('[data-dsh-forge-task-card="dsh-forge-m2/5.9"]') as HTMLElement
    const badge = card.querySelector('[data-dsh-forge-badge="dangling"]') as HTMLElement
    expect(badge.textContent).toBe(en['tasks.dangling'])
    expect(badge.getAttribute('title')).toContain('5.8')
    const resolvable = document.querySelector('[data-dsh-forge-task-card="dsh-forge-m2/6.1"]') as HTMLElement
    expect(resolvable.querySelector('[data-dsh-forge-badge="dangling"]')).toBeNull()
  })

  it('columns collapse and re-expand (组可折叠, AC1)', async () => {
    await renderBoard()
    const toggle = document.querySelector('[data-dsh-forge-status-column-toggle="completed"]') as HTMLElement
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(toggle)
    const column = document.querySelector('[data-dsh-forge-status-column="completed"]') as HTMLElement
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(column.querySelector('[data-dsh-forge-status-column-body="completed"]')).toBeNull()
    expect(column.querySelector('[data-dsh-forge-task-card="dsh-forge-m2/5.2"]')).toBeNull()
    fireEvent.click(toggle)
    expect(document.querySelector('[data-dsh-forge-status-column-body="completed"]')).not.toBeNull()
  })

  it('collapse survives a view switch (page-held state — Hard Rule)', async () => {
    await renderBoard()
    fireEvent.click(document.querySelector('[data-dsh-forge-status-column-toggle="pending"]') as HTMLElement)
    switchView('list')
    expect(document.querySelector('[data-dsh-forge-task-list]')).not.toBeNull()
    switchView('grouped')
    expect(
      (document.querySelector('[data-dsh-forge-status-column-toggle="pending"]') as HTMLElement).getAttribute('aria-expanded'),
    ).toBe('false')
  })

  it('a small board (few tasks) keeps the 7-column shape with zero counts', async () => {
    const few: TaskBoardData = {
      tasks: [MOCK_TASK_BOARD.tasks[0]!, MOCK_TASK_BOARD.tasks[12]!],
      generatedAt: MOCK_TASK_BOARD.generatedAt,
      sync: MOCK_TASK_BOARD.sync,
    }
    await renderBoard({}, makeFace(few))
    expect(document.querySelectorAll('[data-dsh-forge-status-column]')).toHaveLength(7)
    expect((document.querySelector('[data-dsh-forge-status-count="pending"]') as HTMLElement).textContent).toBe('0')
    expect(document.querySelectorAll('[data-dsh-forge-task-card]')).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// View C — the flat list (AC2)
// ---------------------------------------------------------------------------

describe('view C: the 列表 view', () => {
  async function renderList(props: Partial<TaskBoardPageProps> = {}, face?: Face) {
    const result = await renderBoard(props, face)
    switchView('list')
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-task-list]')).not.toBeNull()
    })
    return result
  }

  it('renders the full column set with width budgets and every row cell (AC2)', async () => {
    await renderList()
    const headers = Array.from(document.querySelectorAll('[data-dsh-forge-task-column]'))
    expect(headers.map(head => head.getAttribute('data-dsh-forge-task-column'))).toEqual([
      'key', 'title', 'status', 'feature', 'branch', 'worktree', 'source', 'updatedAt',
    ])
    expect(headers.map(head => head.textContent)).toEqual([
      en['tasks.column.key'], en['tasks.column.title'], en['tasks.column.status'],
      en['tasks.column.feature'], en['tasks.column.branch'], en['tasks.column.worktree'],
      en['tasks.column.source'], en['tasks.column.updatedAt'],
    ])
    // 列宽适配: fixed budgets on the mono/enum columns; the title absorbs the slack.
    for (const id of ['key', 'status', 'feature', 'branch', 'worktree', 'source', 'updatedAt']) {
      const head = document.querySelector(`[data-dsh-forge-task-column="${id}"]`) as HTMLElement
      expect(head.style.width).not.toBe('')
    }
    expect((document.querySelector('[data-dsh-forge-task-column="title"]') as HTMLElement).style.width).toBe('')

    const rows = document.querySelectorAll('[data-dsh-forge-task-row]')
    expect(rows).toHaveLength(TOTAL)

    const row = document.querySelector('[data-dsh-forge-task-row="dsh-forge-m2/5.5"]') as HTMLElement
    expect(row.textContent).toContain('dsh-forge-m2/5.5')
    expect(row.textContent).toContain('UF2 task board build')
    expect(row.textContent).toContain(en['tasks.status.in_progress'])
    expect(row.textContent).toContain('dsh-forge-m2') // feature + branch
    expect(row.textContent).toContain('2026-09-22 09:12')
    expect(row.querySelector('[data-dsh-forge-badge="worktree"]')).not.toBeNull()
    expect(row.querySelector('[data-dsh-forge-badge="source:session"]')?.textContent).toBe(en['tasks.source.session'])

    const nullish = document.querySelector('[data-dsh-forge-task-row="dsh-forge-m2/5.6"]') as HTMLElement
    expect(nullish.textContent).toContain('—') // branch/worktree/source placeholders
    expect(nullish.querySelector('[data-dsh-forge-badge="worktree"]')).toBeNull()
  })

  it('default status sort orders rows canonically; updatedAt sort (via the toolbar) flips to newest-first', async () => {
    await renderList()
    const firstKey = (document.querySelector('[data-dsh-forge-task-row]') as HTMLElement).getAttribute('data-dsh-forge-task-row')
    expect(firstKey).toBe('dsh-forge-m1/7.2')

    fireEvent.click(document.querySelector('[data-dsh-forge-menu-trigger="sort"]') as HTMLElement)
    const updatedAtItem = Array.from(document.querySelectorAll('[role="menuitemradio"]'))
      .find(item => item.textContent?.includes(en['tasks.sort.updatedAt'])) as HTMLElement
    fireEvent.click(updatedAtItem)
    await waitFor(() => {
      expect(
        (document.querySelector('[data-dsh-forge-task-row]') as HTMLElement).getAttribute('data-dsh-forge-task-row'),
      ).toBe('dsh-forge-m2/5.5')
    })
  })

  it('renders the full status labels and the count through the locale seat (en)', async () => {
    await renderList()
    const row = document.querySelector('[data-dsh-forge-task-row="dsh-forge-m2/3.9"]') as HTMLElement
    expect(row.textContent).toContain(en['tasks.status.suspended'])
    expect((document.querySelector('[data-dsh-forge-tasks-count]') as HTMLElement).textContent)
      .toBe(en['tasks.count'].replace('{visible}', String(TOTAL)).replace('{total}', String(TOTAL)))
  })
})

// ---------------------------------------------------------------------------
// Toolbar — switcher / search / filters / count (AC3 + Hard Rules)
// ---------------------------------------------------------------------------

describe('toolbar: the view switcher', () => {
  it('renders A/B/C tabs, all enabled; the tree (视图 A) is the default since 5.6', async () => {
    await renderBoard({}, undefined, 'raw')
    const list = document.querySelector('[data-dsh-forge-board-views]') as HTMLElement
    expect(list.getAttribute('role')).toBe('tablist')
    expect(list.getAttribute('aria-label')).toBe(en['tasks.views.label'])
    const tabs = Array.from(list.querySelectorAll('[role="tab"]'))
    expect(tabs.map(tab => tab.getAttribute('data-dsh-forge-board-view'))).toEqual(['tree', 'grouped', 'list'])
    expect(tabs.map(tab => tab.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false'])
    // No placeholder anymore: the tree tab carries no disabled state or hint.
    const tree = tabs[0] as HTMLElement
    expect(tree.getAttribute('aria-disabled')).toBeNull()
    expect(tree.getAttribute('title')).toBeNull()
    expect(tree.getAttribute('tabIndex')).toBe('0')
    // Its panel (the DAG view) is mounted and labelled back by the tab.
    expect(document.querySelector('[data-dsh-forge-board-panel="tree"]')?.getAttribute('aria-labelledby'))
      .toBe('dsh-forge-board-view-tab-tree')
    expect(document.querySelector('[data-dsh-forge-dep-tree]')).not.toBeNull()
  })

  it('switches A/B/C with panels labelled by their tabs; keyboard arrows rotate', async () => {
    await renderBoard({}, undefined, 'raw')
    const treeTab = document.querySelector('[data-dsh-forge-board-view="tree"]') as HTMLElement
    const groupedTab = document.querySelector('[data-dsh-forge-board-view="grouped"]') as HTMLElement
    const listTab = document.querySelector('[data-dsh-forge-board-view="list"]') as HTMLElement
    expect(groupedTab.getAttribute('tabIndex')).toBe('-1')
    expect(listTab.getAttribute('tabIndex')).toBe('-1')
    fireEvent.click(listTab)
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-board-panel="list"]')?.getAttribute('aria-labelledby'))
        .toBe('dsh-forge-board-view-tab-list')
    })
    // ArrowLeft over list → grouped; another ArrowLeft → tree (index wraps
    // over the three ENABLED views — A joined the rotation with 5.6).
    fireEvent.keyDown(document.querySelector('[data-dsh-forge-board-views]') as HTMLElement, { key: 'ArrowLeft' })
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-board-panel="grouped"]')).not.toBeNull()
    })
    fireEvent.keyDown(document.querySelector('[data-dsh-forge-board-views]') as HTMLElement, { key: 'ArrowLeft' })
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-board-panel="tree"]')).not.toBeNull()
    })
    expect(treeTab.getAttribute('aria-selected')).toBe('true')
  })

  it('switching views preserves the filters (Hard Rule: 切换不重置筛选)', async () => {
    await renderBoard()
    fireEvent.change(document.querySelector('[data-dsh-forge-tasks-search]') as HTMLElement, {
      target: { value: 'wizard' },
    })
    await waitFor(() => {
      expect(document.querySelectorAll('[data-dsh-forge-task-card]')).toHaveLength(1)
    })
    switchView('list')
    await waitFor(() => {
      expect(document.querySelectorAll('[data-dsh-forge-task-row]')).toHaveLength(1)
    })
    expect((document.querySelector('[data-dsh-forge-tasks-search]') as HTMLInputElement).value).toBe('wizard')
    switchView('grouped')
    expect(document.querySelectorAll('[data-dsh-forge-task-card]')).toHaveLength(1)
  })

  it('restores view B\'s horizontal scroll across a switch (Hard Rule: 不重置滚动位置)', async () => {
    await renderBoard()
    const board = document.querySelector('[data-dsh-forge-status-board]') as HTMLElement
    board.scrollLeft = 200
    switchView('list')
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-status-board]')).toBeNull()
    })
    switchView('grouped')
    const restored = document.querySelector('[data-dsh-forge-status-board]') as HTMLElement
    expect(restored.scrollLeft).toBe(200)
  })
})

describe('toolbar: search + filters apply to BOTH views (AC3)', () => {
  it('search over 标题 filters B; over 任务号 (local and qualified) filters C', async () => {
    await renderBoard()
    fireEvent.change(document.querySelector('[data-dsh-forge-tasks-search]') as HTMLElement, {
      target: { value: 'signing' },
    })
    await waitFor(() => {
      expect(document.querySelectorAll('[data-dsh-forge-task-card]')).toHaveLength(1)
    })
    fireEvent.change(document.querySelector('[data-dsh-forge-tasks-search]') as HTMLElement, {
      target: { value: '5.15' },
    })
    switchView('list')
    await waitFor(() => {
      const rows = document.querySelectorAll('[data-dsh-forge-task-row]')
      expect(rows).toHaveLength(1)
      expect(rows[0]!.getAttribute('data-dsh-forge-task-row')).toBe('dsh-forge-m2/5.15')
    })
  })

  it('the status menu multi-selects: first uncheck leaves the other six; All statuses resets', async () => {
    await renderBoard()
    fireEvent.click(document.querySelector('[data-dsh-forge-menu-trigger="status"]') as HTMLElement)
    const inProgress = Array.from(document.querySelectorAll('[role="menuitemcheckbox"]'))
      .find(item => item.textContent?.includes(en['tasks.status.in_progress'])) as HTMLElement
    expect(inProgress.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(inProgress)
    await waitFor(() => {
      expect(document.querySelectorAll('[data-dsh-forge-task-card="dsh-forge-m2/5.5"]')).toHaveLength(0)
    })
    expect(document.querySelectorAll('[data-dsh-forge-task-card]')).toHaveLength(TOTAL - 1)
    // The checkbox rows keep the menu open; the All-statuses row resets.
    fireEvent.click(Array.from(document.querySelectorAll('[role="menuitem"]'))
      .find(item => item.textContent?.includes(en['tasks.filter.statusAll'])) as HTMLElement)
    await waitFor(() => {
      expect(document.querySelectorAll('[data-dsh-forge-task-card]')).toHaveLength(TOTAL)
    })
  })

  it('the feature menu filters to one feature\'s tasks', async () => {
    await renderBoard()
    fireEvent.click(document.querySelector('[data-dsh-forge-menu-trigger="feature"]') as HTMLElement)
    fireEvent.click(Array.from(document.querySelectorAll('[role="menuitemradio"]'))
      .find(item => item.textContent?.includes('dsh-forge-m1')) as HTMLElement)
    await waitFor(() => {
      expect(document.querySelectorAll('[data-dsh-forge-task-card]')).toHaveLength(3)
    })
  })

  it('the worktree toggle (aria-pressed) keeps only worktree tasks', async () => {
    await renderBoard()
    const toggle = document.querySelector('[data-dsh-forge-tasks-worktree]') as HTMLElement
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(toggle)
    await waitFor(() => {
      expect(document.querySelectorAll('[data-dsh-forge-task-card]')).toHaveLength(3)
    })
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
  })

  it('the 任务计数 tracks the filter (visible/total)', async () => {
    await renderBoard()
    const count = () => (document.querySelector('[data-dsh-forge-tasks-count]') as HTMLElement).textContent
    expect(count()).toBe(`${TOTAL} of ${TOTAL} tasks`)
    fireEvent.change(document.querySelector('[data-dsh-forge-tasks-search]') as HTMLElement, {
      target: { value: 'wizard' },
    })
    await waitFor(() => {
      expect(count()).toBe(`1 of ${TOTAL} tasks`)
    })
  })
})

// ---------------------------------------------------------------------------
// Read-only discipline (AC4, BIZ-task-ops-001)
// ---------------------------------------------------------------------------

describe('read-only discipline: no write affordance in the data area', () => {
  it('views B and C contain no input/select/textarea/nested control — navigation only', async () => {
    await renderBoard()
    // View B first: a card is itself the (only) button and carries no
    // nested control of any kind.
    const card = document.querySelector('[data-dsh-forge-task-card="dsh-forge-m2/5.5"]') as HTMLElement
    expect(card.querySelectorAll('button, input, select, [role="checkbox"], [role="switch"]')).toHaveLength(0)
    switchView('list')
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-task-list]')).not.toBeNull()
    })
    const writeControls = document.querySelectorAll(
      '[data-dsh-forge-status-board] input, [data-dsh-forge-status-board] select, [data-dsh-forge-status-board] textarea,'
      + ' [data-dsh-forge-task-list] input, [data-dsh-forge-task-list] select, [data-dsh-forge-task-list] textarea,'
      + ' [data-dsh-forge-task-list] [role="checkbox"], [data-dsh-forge-task-list] [role="switch"]',
    )
    expect(writeControls).toHaveLength(0)
    const row = document.querySelector('[data-dsh-forge-task-row="dsh-forge-m2/5.5"]') as HTMLElement
    expect(row.querySelectorAll('button, input, select, [role="checkbox"], [role="switch"]')).toHaveLength(0)
    // The toolbar's ONLY field is the search box; its buttons are view
    // controls, none of them task-scoped.
    const toolbar = document.querySelector('[data-dsh-forge-task-toolbar]') as HTMLElement
    expect(toolbar.querySelectorAll('input, select, textarea')).toHaveLength(1)
    expect(toolbar.querySelector('input')?.getAttribute('type')).toBe('search')
  })
})

// ---------------------------------------------------------------------------
// Updating 态 — the 回流 row-level indication (AC5)
// ---------------------------------------------------------------------------

describe('updating 态: task_updated events light rows, announce politely', () => {
  it('highlights the addressed row only + announces via aria-live; fades out after the window', async () => {
    const face = makeFace()
    render(<TaskBoardPage t={t.en} face={face} />)
    // Settle the load under real timers, THEN freeze the clock: the
    // highlight window's setTimeout is captured at emit time (fake).
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-task-toolbar]')).not.toBeNull()
    })
    switchView('grouped')
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-status-board]')).not.toBeNull()
    })
    vi.useFakeTimers()
    act(() => {
      face.emit([
        { type: 'task_updated', projectId: 'p1', taskKey: 'dsh-forge-m2/5.6', source: 'session', changeKind: 'attribute' },
      ])
    })
    const card = document.querySelector('[data-dsh-forge-task-card="dsh-forge-m2/5.6"]') as HTMLElement
    expect(card.getAttribute('data-dsh-forge-updating')).toBe('')
    expect((document.querySelector('[data-dsh-forge-task-card="dsh-forge-m2/5.5"]') as HTMLElement)
      .getAttribute('data-dsh-forge-updating')).toBeNull()
    const announce = document.querySelector('[data-dsh-forge-board-announce]') as HTMLElement
    expect(announce.getAttribute('aria-live')).toBe('polite')
    expect(announce.textContent).toBe(en['tasks.updated.announce'].replace('{key}', 'dsh-forge-m2/5.6'))
    act(() => { vi.advanceTimersByTime(1600) })
    expect((document.querySelector('[data-dsh-forge-task-card="dsh-forge-m2/5.6"]') as HTMLElement)
      .getAttribute('data-dsh-forge-updating')).toBeNull()
    expect((document.querySelector('[data-dsh-forge-board-announce]') as HTMLElement).textContent).toBe('')
  })

  it('ignores foreign projects and non-task events; subscribes once, unsubscribes on unmount', async () => {
    const face = makeFace()
    const view = render(<TaskBoardPage t={t.en} face={face} projectId="p1" />)
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-task-toolbar]')).not.toBeNull()
    })
    switchView('grouped')
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-status-board]')).not.toBeNull()
    })
    // Since 3.9 the board's presentation leg AND the approval dock's reflux
    // leg both subscribe (two listeners, one channel — the multiplexed
    // real-chain shape); each unsubscribes exactly once on unmount.
    expect(face.subscribeEvents).toHaveBeenCalledTimes(2)
    act(() => {
      face.emit([
        { type: 'task_updated', projectId: 'OTHER', taskKey: 'dsh-forge-m2/5.6', source: null, changeKind: 'attribute' },
        { type: 'sync', projectId: 'p1', sync: { state: 'idle', lastScanAt: null } },
      ])
    })
    expect((document.querySelector('[data-dsh-forge-task-card="dsh-forge-m2/5.6"]') as HTMLElement)
      .getAttribute('data-dsh-forge-updating')).toBeNull()
    view.unmount()
    expect(face.unsubscribe).toHaveBeenCalledTimes(2)
  })
})

// ---------------------------------------------------------------------------
// The four-state machine + sync light + selection seam
// ---------------------------------------------------------------------------

describe('view-state machine: loading / empty / error / populated (+ no-match)', () => {
  it('loading renders the skeleton (role=status) until the load resolves', async () => {
    let resolveLoad: (value: TaskBoardData) => void = () => {}
    const face = makeFace()
    face.loadBoard.mockImplementationOnce(() => new Promise<TaskBoardData>((resolve) => { resolveLoad = resolve }))
    render(<TaskBoardPage t={t.en} face={face} />)
    const skeleton = document.querySelector('[data-dsh-forge-task-board-skeleton]') as HTMLElement
    expect(skeleton.getAttribute('role')).toBe('status')
    expect(skeleton.getAttribute('aria-label')).toBe(en['tasks.loading'])
    expect(document.querySelector('[data-dsh-forge-task-toolbar]')).toBeNull()
    act(() => { resolveLoad(MOCK_TASK_BOARD) })
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-task-toolbar]')).not.toBeNull()
    })
  })

  it('empty board renders the 空态卡 (guidance, never an error)', async () => {
    render(<TaskBoardPage t={t.en} face={makeFace(MOCK_TASK_BOARD_EMPTY)} />)
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-task-board-empty]')).not.toBeNull()
    })
    const empty = document.querySelector('[data-dsh-forge-task-board-empty]') as HTMLElement
    expect(empty.textContent).toContain(en['tasks.empty.title'])
    expect(empty.textContent).toContain(en['tasks.empty.body'])
    expect(document.querySelector('[data-dsh-forge-task-toolbar]')).toBeNull()
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })

  it('a failed first load renders the error card; retry reloads', async () => {
    const face = makeFace()
    face.loadBoard.mockRejectedValueOnce({ code: 'ERR_WORKBENCH_DB', message: 'mock: boom' })
    render(<TaskBoardPage t={t.en} face={face} />)
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-task-board-error]')).not.toBeNull()
    })
    const error = document.querySelector('[data-dsh-forge-task-board-error]') as HTMLElement
    expect(error.getAttribute('role')).toBe('alert')
    expect(error.textContent).toContain(en['tasks.loadError.title'])
    fireEvent.click(document.querySelector('[data-dsh-forge-task-board-retry]') as HTMLElement)
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-task-toolbar]')).not.toBeNull()
    })
    expect(face.loadBoard).toHaveBeenCalledTimes(2)
  })

  it('a filter that matches nothing is a clear-able no-match card, not an error', async () => {
    await renderBoard()
    fireEvent.change(document.querySelector('[data-dsh-forge-tasks-search]') as HTMLElement, {
      target: { value: 'no-such-task' },
    })
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-task-board-nomatch]')).not.toBeNull()
    })
    const nomatch = document.querySelector('[data-dsh-forge-task-board-nomatch]') as HTMLElement
    expect(nomatch.getAttribute('role')).toBeNull()
    expect(nomatch.textContent).toContain(en['tasks.noMatch.title'])
    fireEvent.click(document.querySelector('[data-dsh-forge-task-board-clear-filters]') as HTMLElement)
    await waitFor(() => {
      expect(document.querySelectorAll('[data-dsh-forge-task-card]')).toHaveLength(TOTAL)
    })
  })

  it('zh copy renders the same states (balanced locale spot-check)', async () => {
    render(<TaskBoardPage t={t.zh} face={makeFace(MOCK_TASK_BOARD_EMPTY)} />)
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-task-board-empty]')?.textContent).toContain(zh['tasks.empty.title'])
    })
  })
})

describe('sync 状态指示: a toolbar light, never a view error', () => {
  it('idle shows the synced text + last scan stamp', async () => {
    await renderBoard()
    const sync = document.querySelector('[data-dsh-forge-tasks-sync="idle"]') as HTMLElement
    expect(sync.getAttribute('role')).toBe('status')
    expect(sync.textContent).toContain(en['tasks.sync.idle'])
    expect(sync.textContent).toContain('2026-09-22 09:00')
  })

  it('scanning shows the scanning text', async () => {
    const scanning: TaskBoardData = {
      ...MOCK_TASK_BOARD, sync: { state: 'scanning', lastScanAt: MOCK_TASK_BOARD.sync.lastScanAt },
    }
    render(<TaskBoardPage t={t.en} face={makeFace(scanning)} />)
    await waitFor(() => {
      expect((document.querySelector('[data-dsh-forge-tasks-sync="scanning"]') as HTMLElement).textContent)
        .toContain(en['tasks.sync.scanning'])
    })
  })

  it('error keeps the data rendering beside the light; the retry CTA reloads (ERR_SNAPSHOT_STALE form)', async () => {
    const face = makeFace(MOCK_TASK_BOARD_SYNC_ERROR)
    await renderBoard({}, face)
    expect(document.querySelectorAll('[data-dsh-forge-task-card]')).toHaveLength(TOTAL)
    const light = document.querySelector('[data-dsh-forge-tasks-sync="error"]') as HTMLElement
    expect(light.textContent).toContain(en['tasks.sync.error'])
    expect(light.querySelector('span[title]')?.getAttribute('title')).toContain('watcher degraded')
    fireEvent.click(document.querySelector('[data-dsh-forge-tasks-sync-retry]') as HTMLElement)
    await waitFor(() => {
      expect(face.loadBoard).toHaveBeenCalledTimes(2)
    })
    // The retry kept the last good board — no error wall.
    expect(document.querySelector('[data-dsh-forge-task-board-error]')).toBeNull()
    expect(document.querySelectorAll('[data-dsh-forge-task-card]')).toHaveLength(TOTAL)
  })
})

describe('selection seam: rows navigate, they never write', () => {
  it('a card click and a row Enter both hand the task to the 5.7 seam', async () => {
    const onSelect = vi.fn()
    await renderBoard({ onSelect })
    fireEvent.click(document.querySelector('[data-dsh-forge-task-card="dsh-forge-m2/5.9"]') as HTMLElement)
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect((onSelect.mock.calls[0]![0] as TaskSummary).key).toBe('dsh-forge-m2/5.9')
    switchView('list')
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-task-list]')).not.toBeNull()
    })
    const row = document.querySelector('[data-dsh-forge-task-row="dsh-forge-m2/5.9"]') as HTMLElement
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledTimes(2)
    fireEvent.click(row)
    expect(onSelect).toHaveBeenCalledTimes(3)
  })
})

// ---------------------------------------------------------------------------
// Shell integration — the reserved tasks seat + the assembly seat
// ---------------------------------------------------------------------------

describe('toolbar controls: the dropdown keyboard contract (WAI-ARIA menu, ProjectSwitcher parity)', () => {
  async function openStatusMenu() {
    await renderBoard()
    const trigger = document.querySelector('[data-dsh-forge-menu-trigger="status"]') as HTMLElement
    fireEvent.click(trigger)
    await waitFor(() => {
      expect(trigger.getAttribute('aria-expanded')).toBe('true')
      expect(document.querySelector('[role="menu"]')).not.toBeNull()
    })
    return trigger
  }

  it('ArrowDown on the trigger opens the menu focused on its first item', async () => {
    const trigger = await openStatusMenu()
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    // Open state already; the keyboard path below exercises in-menu arrows.
    const items = Array.from(document.querySelectorAll('[role="menu"] button'))
    expect(document.activeElement).toBe(items[0])
    fireEvent.keyDown(items[0]!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[1])
    fireEvent.keyDown(items[1]!, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(items[0])
  })

  it('Escape closes and returns focus to the trigger; Tab closes behind the focus', async () => {
    const trigger = await openStatusMenu()
    const menu = document.querySelector('[role="menu"]') as HTMLElement
    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.querySelector('[role="menu"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    fireEvent.click(trigger)
    await waitFor(() => {
      expect(document.querySelector('[role="menu"]')).not.toBeNull()
    })
    fireEvent.keyDown(document.querySelector('[role="menu"]') as HTMLElement, { key: 'Tab' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('a pointer-down outside the menu closes it', async () => {
    await openStatusMenu()
    fireEvent.mouseDown(document.body)
    expect(document.querySelector('[role="menu"]')).toBeNull()
  })

  it('re-clicking the open trigger closes without moving focus', async () => {
    const trigger = await openStatusMenu()
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.querySelector('[role="menu"]')).toBeNull()
  })

  it('the switcher keyboard covers Home/End over the three views (Home = tree since 5.6)', async () => {
    await renderBoard()
    switchView('list')
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-task-list]')).not.toBeNull()
    })
    const views = document.querySelector('[data-dsh-forge-board-views]') as HTMLElement
    fireEvent.keyDown(views, { key: 'Home' })
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-board-panel="tree"]')).not.toBeNull()
    })
    fireEvent.keyDown(views, { key: 'End' })
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-board-panel="list"]')).not.toBeNull()
    })
  })

  it('the feature menu returns to All features from a filtered state', async () => {
    await renderBoard()
    fireEvent.click(document.querySelector('[data-dsh-forge-menu-trigger="feature"]') as HTMLElement)
    fireEvent.click(Array.from(document.querySelectorAll('[role="menuitemradio"]'))
      .find(item => item.textContent?.includes('dsh-forge-m1')) as HTMLElement)
    await waitFor(() => {
      expect(document.querySelectorAll('[data-dsh-forge-task-card]')).toHaveLength(3)
    })
    fireEvent.click(Array.from(document.querySelectorAll('[role="menuitemradio"]'))
      .find(item => item.textContent?.includes(en['tasks.filter.featureAll'])) as HTMLElement)
    await waitFor(() => {
      expect(document.querySelectorAll('[data-dsh-forge-task-card]')).toHaveLength(TOTAL)
    })
  })
})

describe('the tasks seat wires the board (re-hosted M4 1.7: the view mounts directly)', () => {
  it('renders the seat-wired board; a card activation hands the task to onSelect', async () => {
    const onSelect = vi.fn()
    const face = makeFace()
    render(
      <TasksView
        t={t.en as (key: WorkbenchKey) => string}
        projectId="p-shell"
        onSelect={onSelect}
        seat={{ face: { loadBoard: face.loadBoard as TaskBoardFace['loadBoard'] } }}
      />,
    )
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-task-toolbar]')).not.toBeNull()
    })
    // The board's default view is the DAG (5.6); switch to view B for the
    // card-click leg of the seat wiring.
    fireEvent.click(document.querySelector('[data-dsh-forge-board-view="grouped"]') as HTMLElement)
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-task-card="dsh-forge-m2/5.5"]')).not.toBeNull()
    })
    fireEvent.click(document.querySelector('[data-dsh-forge-task-card="dsh-forge-m2/5.5"]') as HTMLElement)
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// M4 task 2.7 — the C5 [打开] wiring (props.onEnterSession → the dock's
// LinkHistory rows go live over the Interface 6 channel seam)
// ---------------------------------------------------------------------------

describe('M4 2.7: onEnterSession wires the dock link rows open', () => {
  const KEY = 'dsh-forge-m2/6.1' // MOCK_TASK_DETAIL_RICH: an active + an ended link
  const OPEN = '[data-dsh-forge-detail-enter="session-a3f2c9d1"]'

  async function openDock(props: Partial<TaskBoardPageProps> = {}): Promise<void> {
    await renderBoard({ ...props, detailFace: createMockTaskDetailFace() })
    switchView('list')
    await waitFor(() => {
      expect(document.querySelector(`[data-dsh-forge-task-row="${KEY}"]`)).not.toBeNull()
    })
    fireEvent.click(document.querySelector(`[data-dsh-forge-task-row="${KEY}"]`) as HTMLElement)
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-detail-header]')).not.toBeNull()
    })
  }

  it('present seam: the top link row gains [打开]; the click rides the seam', async () => {
    const onEnterSession = vi.fn(() => Promise.resolve())
    await openDock({ onEnterSession })
    await waitFor(() => { expect(document.querySelector(OPEN)).not.toBeNull() })
    fireEvent.click(document.querySelector(OPEN) as HTMLElement)
    expect(onEnterSession).toHaveBeenCalledWith('session-a3f2c9d1')
  })

  it('the orchestration 「进入会话」 falls back to the channel seam when no hand-over seat rides (the pane host)', async () => {
    const onEnterSession = vi.fn()
    const running: DispatchRow = {
      id: 'dsp-2.7', batchId: 'batch-2.7', projectId: 'p1', featureSlug: 'dsh-forge-m2',
      taskKey: KEY, state: 'running', sessionId: 'session-orch-1', promptHash: 'hash-2.7',
      actor: 'workbench', dispatchedAt: '2026-09-28T07:00:00.000Z', endedAt: null, error: null,
    }
    await openDock({ onEnterSession, projectId: 'p1', codeRoot: 'Z:/code', dispatchFace: createMockDispatchFace({ rows: [running] }) })
    const enter = await waitFor(() => {
      const node = document.querySelector('[data-dsh-forge-orch-enter-session]')
      expect(node).not.toBeNull()
      return node as HTMLElement
    })
    fireEvent.click(enter)
    expect(onEnterSession).toHaveBeenCalledWith('session-orch-1')
  })

  it('absent seam: the rows stay informational (the 2.6 seam discipline)', async () => {
    await openDock()
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-detail-links]')).not.toBeNull()
    })
    expect(document.querySelector(OPEN)).toBeNull()
  })
})
