// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_TREE_VIEW_OPTIONS, TREE_OVERFLOW_LIMIT, ancestorChainOf,
  deriveTree, normalizeSearch, projectMatches, relativeTimePart, sessionMatches,
} from '../src/client/components/project-tree/tree-derive.ts'
import { ProjectTreeBrowser } from '../src/client/components/project-tree/ProjectTreeBrowser.tsx'
import type {
  SessionDotState, TreeSession, TreeViewOptions, TreeWorkspace,
} from '../src/client/components/project-tree/tree-derive.ts'
import type { Project } from '../src/client/ipc-types.ts'
import { en, type WorkbenchKey } from '../src/client/locale/en.ts'
import { zh } from '../src/client/locale/zh.ts'

// Task 1.4 — the C3 left-rail project tree BUILD units (mock data; the 1.6
// assembly wires the sidebar.workspaces seat). AC map:
//   AC1 three-tier rows + dot priority + hover ⋯ 三项 + subagent ↳ recursion
//      + SC7 top-level never carries origin=subagent
//   AC2 分组×排序 trio + localStorage persistence
//   AC3 per-group overflow >5 + active ancestor chain + layout exposure
//   AC4 archived read-only partition (恢复/删除 mock) + 未分组组头纳管
//   AC5 header 🔍 in-place search (250ms debounce, Esc) / ⚙ popover / ＋ C7
//      + 56px collapsed rail
//   AC6 this suite itself (vitest + jsdom)

// The upstream glyphs resolve through the module table at runtime (browser
// bundle); the npm node entry carries undeclared transitive deps only the
// upstream monorepo supplies — the jsdom mount stubs them (rail.spec
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
const tEn = bind(en)

/** The frozen clock every relative-time assertion runs against. */
const NOW = Date.parse('2026-09-29T10:00:00.000Z')
const minutesAgo = (n: number): string => new Date(NOW - n * 60_000).toISOString()

function makeProject(id: string, overrides: Partial<Project> = {}): Project {
  return {
    id,
    displayName: id,
    codeRoot: `Z:\\project\\${id}`,
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

const P1 = makeProject('p1', { displayName: 'dsh-forge', sortOrder: 0, codeRoot: 'Z:\\project\\dsh\\dsh-forge' })
const P2 = makeProject('p2', { displayName: 'forge', sortOrder: 1, codeRoot: 'Z:\\project\\ai\\forge' })
const P3 = makeProject('p3', {
  displayName: 'dsh-desktop', sortOrder: 2, archived: true, codeRoot: 'Z:\\project\\dsh\\dsh-desktop',
})

const WORKSPACES: readonly TreeWorkspace[] = [
  { workspaceId: 'ws1', path: 'Z:\\project\\dsh\\dsh-forge', title: 'dsh-forge' },
  { workspaceId: 'ws2', path: 'Z:/project/ai/forge', title: 'forge' },
  { workspaceId: 'ws3', path: 'Z:\\project\\dsh\\dsh-desktop', title: 'dsh-desktop' },
]

interface SessionInit {
  id: string
  title: string
  workspaceId?: string | null
  origin?: 'top' | 'subagent'
  parent?: string | null
  updatedAt?: string
  running?: boolean
  awaitingInput?: boolean
  blank?: boolean
}

function makeSession(init: SessionInit): TreeSession {
  return {
    sessionId: init.id,
    // `null` is a MEANINGFUL value here (未分组) — only `undefined` defaults.
    workspaceId: init.workspaceId === undefined ? 'ws1' : init.workspaceId,
    title: init.title,
    updatedAt: init.updatedAt ?? minutesAgo(5),
    origin: init.origin ?? 'top',
    parentSessionId: init.parent ?? null,
    running: init.running ?? false,
    awaitingInput: init.awaitingInput ?? false,
    ...(init.blank === undefined ? {} : { blank: init.blank }),
  }
}

/**
 * p1 carries the lineage fixture (top → subagent → sub-subagent), the dot
 * matrix and the overflow mass (7 top sessions); p2 the sibling project;
 * p3 the archived partition; plus the ungrouped pair and the orphan.
 * Top-session ages (minutes): s-await 1, s-run 3, s1 5, u1 8, u2 9, s6 15,
 * f1 30, s7 45, s3 1560, s2 4680 — the recency ladder the ordering
 * assertions below are written against.
 */
function makeSessions(): TreeSession[] {
  return [
    makeSession({ id: 's1', title: '派发4.2.1', updatedAt: minutesAgo(5) }),
    makeSession({ id: 's1a', title: '4.2.1 实现会话列表增强', origin: 'subagent', parent: 's1', updatedAt: minutesAgo(2), running: true }),
    makeSession({ id: 's1a1', title: '4.2.1 会话列表单测', origin: 'subagent', parent: 's1a', updatedAt: minutesAgo(1) }),
    makeSession({ id: 's1b', title: '4.2.1 样式令牌对齐', origin: 'subagent', parent: 's1', updatedAt: minutesAgo(70) }),
    makeSession({ id: 's-await', title: '等待补充信息', updatedAt: minutesAgo(1), awaitingInput: true }),
    makeSession({ id: 's-run', title: '长跑会话', updatedAt: minutesAgo(3), running: true }),
    makeSession({ id: 's3', title: '探索:知识区 spike', updatedAt: minutesAgo(1560) }),
    makeSession({ id: 's2', title: '对账排查5.1.2', updatedAt: minutesAgo(4680) }),
    makeSession({ id: 's6', title: '会话六', updatedAt: minutesAgo(15) }),
    makeSession({ id: 's7', title: '会话七', updatedAt: minutesAgo(45) }),
    makeSession({ id: 'f1', title: 'forge 会话A', workspaceId: 'ws2', updatedAt: minutesAgo(30) }),
    makeSession({ id: 'f1a', title: 'forge 子代理', workspaceId: 'ws2', origin: 'subagent', parent: 'f1', updatedAt: minutesAgo(20) }),
    // Archived project's session: 归档分区不挂会话 — dropped from display.
    makeSession({ id: 'd1', title: '已归档项目的会话', workspaceId: 'ws3', updatedAt: minutesAgo(10) }),
    // Ungrouped pair: null workspace + unmatched workspace id.
    makeSession({ id: 'u1', title: '游离会话', workspaceId: null, updatedAt: minutesAgo(8) }),
    makeSession({ id: 'u2', title: '未知工作区会话', workspaceId: 'ws-none', updatedAt: minutesAgo(9) }),
    // Orphan subagent (parent missing): must NEVER surface at top level (SC7).
    makeSession({ id: 'orphan', title: '孤儿子代理', origin: 'subagent', parent: 'gone', updatedAt: minutesAgo(4) }),
  ]
}

/** p1 top sessions in recent-first order (the overflow-ladder reference). */
const P1_TOPS_RECENT = ['s-await', 's-run', 's1', 's6', 's7', 's3', 's2'] as const

const PROJECTS: readonly Project[] = [P1, P2, P3]
const VIEW_STORAGE_KEY = 'dsh-forge.project-tree.view.v1'

/** The zh copy with {n} interpolated the way the rows format it. */
function zhN(key: WorkbenchKey, n: number): string {
  return t(key).replace('{n}', String(n))
}

function renderTree(props: Partial<Parameters<typeof ProjectTreeBrowser>[0]> = {}) {
  const onOpenProject = vi.fn()
  const onNewSession = vi.fn()
  const onOpenSession = vi.fn()
  const onSessionCommand = vi.fn()
  const onProjectCommand = vi.fn()
  const onRename = vi.fn()
  const onArchivedCommand = vi.fn()
  const onAdoptUngrouped = vi.fn()
  const onAddProject = vi.fn()
  const onLayoutChange = vi.fn()
  const onToggleCollapse = vi.fn()
  render(
    <ProjectTreeBrowser
      t={t}
      projects={PROJECTS}
      workspaces={WORKSPACES}
      sessions={makeSessions()}
      activeProjectId="p1"
      now={() => new Date(NOW)}
      onOpenProject={onOpenProject}
      onNewSession={onNewSession}
      onOpenSession={onOpenSession}
      onSessionCommand={onSessionCommand}
      onProjectCommand={onProjectCommand}
      onRename={onRename}
      onArchivedCommand={onArchivedCommand}
      onAdoptUngrouped={onAdoptUngrouped}
      onAddProject={onAddProject}
      onLayoutChange={onLayoutChange}
      onToggleCollapse={onToggleCollapse}
      {...props}
    />,
  )
  return {
    onOpenProject, onNewSession, onOpenSession, onSessionCommand, onProjectCommand, onRename,
    onArchivedCommand, onAdoptUngrouped, onAddProject, onLayoutChange, onToggleCollapse,
  }
}

const sessionRow = (id: string): HTMLElement | null =>
  document.querySelector(`[data-dsh-forge-tree-session="${id}"]`)
const projectRow = (id: string): HTMLElement | null =>
  document.querySelector(`[data-dsh-forge-tree-project="${id}"]`)

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// tree-derive: the pure derivation model
// ---------------------------------------------------------------------------

describe('tree-derive: lineage + SC7', () => {
  it('top-level lists never carry origin=subagent entries — orphan subagents vanish instead of leaking', () => {
    const derived = deriveTree(PROJECTS, WORKSPACES, makeSessions(), DEFAULT_TREE_VIEW_OPTIONS)
    const tops = [
      ...derived.projects.flatMap(group => group.sessions.map(node => node.session)),
      ...derived.ungrouped.map(node => node.session),
      ...derived.flat.filter(row => !row.isSubagent).map(row => row.session),
    ]
    expect(tops.some(session => session.origin === 'subagent')).toBe(false)
    expect(tops.some(session => session.sessionId === 'orphan')).toBe(false)
  })

  it('attaches subagent children under their parent with depth and recursive collapse order', () => {
    const derived = deriveTree(PROJECTS, WORKSPACES, makeSessions(), DEFAULT_TREE_VIEW_OPTIONS)
    const group1 = derived.projects.find(group => group.project.id === 'p1')
    expect(group1).toBeDefined()
    const s1 = group1!.sessions.find(node => node.session.sessionId === 's1')
    expect(s1!.children.map(child => child.session.sessionId).sort()).toEqual(['s1a', 's1b'])
    const s1a = s1!.children.find(child => child.session.sessionId === 's1a')
    expect(s1a!.depth).toBe(1)
    expect(s1a!.children.map(child => child.session.sessionId)).toEqual(['s1a1'])
    expect(s1a!.children[0]!.depth).toBe(2)
  })
})

describe('tree-derive: dot priority (待输入 > 运行中 > subagent 运行中 > 空闲)', () => {
  const dotOf = (id: string, sessions: TreeSession[]): SessionDotState => {
    const derived = deriveTree(PROJECTS, WORKSPACES, sessions, DEFAULT_TREE_VIEW_OPTIONS)
    for (const group of [...derived.projects, { sessions: derived.ungrouped }]) {
      const hit = group.sessions.find(node => node.session.sessionId === id)
      if (hit !== undefined) return hit.dot
    }
    throw new Error(`no top node ${id}`)
  }
  const base = makeSessions()

  it('idle row has no dot; descendant-running maps to subagent-running with the count', () => {
    expect(dotOf('s2', base)).toBe('idle')
    const s1 = deriveTree(PROJECTS, WORKSPACES, base, DEFAULT_TREE_VIEW_OPTIONS)
      .projects.flatMap(group => group.sessions).find(node => node.session.sessionId === 's1')
    expect(s1!.dot).toBe('subagent-running')
    expect(s1!.runningDescendantCount).toBe(1)
    expect(s1!.descendantCount).toBe(3)
  })

  it('awaiting-input outranks running; running outranks subagent-running', () => {
    const both = base.map(s =>
      s.sessionId === 's-run' ? { ...s, awaitingInput: true } : s,
    )
    expect(dotOf('s-run', both)).toBe('awaiting-input')
    // s1 itself idle + running descendant → subagent-running; make s1 itself
    // running and the dot must upgrade to 'running'.
    const running = base.map(s => (s.sessionId === 's1' ? { ...s, running: true } : s))
    expect(dotOf('s1', running)).toBe('running')
  })
})

describe('tree-derive: 分组 × 排序', () => {
  it('tree grouping: active projects ordered by sort (manual) with sessions per workspace', () => {
    const derived = deriveTree(PROJECTS, WORKSPACES, makeSessions(), { grouping: 'tree', sorting: 'manual' })
    expect(derived.projects.map(group => group.project.id)).toEqual(['p1', 'p2'])
    const p2 = derived.projects.find(group => group.project.id === 'p2')!
    expect(p2.sessions.map(node => node.session.sessionId)).toEqual(['f1'])
    // Archived projects never ride the active groups.
    expect(derived.projects.some(group => group.project.id === 'p3')).toBe(false)
  })

  it('recent sorting orders sessions new→old; manual keeps the input order (blank draft pinned top in both)', () => {
    const recent = deriveTree(PROJECTS, WORKSPACES, makeSessions(), { grouping: 'tree', sorting: 'recent' })
    const p1 = recent.projects.find(group => group.project.id === 'p1')!
    expect(p1.sessions.map(node => node.session.sessionId)).toEqual([...P1_TOPS_RECENT])
    const manual = deriveTree(PROJECTS, WORKSPACES, makeSessions(), { grouping: 'tree', sorting: 'manual' })
    const p1m = manual.projects.find(group => group.project.id === 'p1')!
    expect(p1m.sessions.map(node => node.session.sessionId))
      .toEqual(['s1', 's-await', 's-run', 's3', 's2', 's6', 's7'])
    const withBlank = [...makeSessions(), makeSession({ id: 'draft', title: '新会话', blank: true, updatedAt: minutesAgo(0) })]
    for (const sorting of ['manual', 'recent'] as const) {
      const derived = deriveTree(PROJECTS, WORKSPACES, withBlank, { grouping: 'tree', sorting })
      const first = derived.projects.find(group => group.project.id === 'p1')!.sessions[0]!
      expect(first.session.sessionId).toBe('draft')
    }
  })

  it('flat grouping: all sessions mixed new→old, subagent rows inline (↳ 紧随其父), project name attached', () => {
    const derived = deriveTree(PROJECTS, WORKSPACES, makeSessions(), { grouping: 'flat', sorting: 'recent' })
    const ids = derived.flat.map(row => row.session.sessionId)
    // Tops merged across projects + ungrouped, newest first; each parent
    // immediately followed by its own descendants (newest first within).
    expect(ids).toEqual([
      's-await', 's-run', 's1', 's1a1', 's1a', 's1b', 'u1', 'u2',
      's6', 'f1', 'f1a', 's7', 's3', 's2',
    ])
    const f1 = derived.flat.find(row => row.session.sessionId === 'f1')!
    expect(f1.project?.id).toBe('p2')
    const f1a = derived.flat.find(row => row.session.sessionId === 'f1a')!
    expect(f1a.isSubagent).toBe(true)
    expect(ids.indexOf('f1a')).toBe(ids.indexOf('f1') + 1)
    // Archived-project sessions and the orphan never join the flat list.
    expect(ids).not.toContain('d1')
    expect(ids).not.toContain('orphan')
  })

  it('manual flat sorting keeps the per-group input order merged group by group', () => {
    const derived = deriveTree(PROJECTS, WORKSPACES, makeSessions(), { grouping: 'flat', sorting: 'manual' })
    const ids = derived.flat.map(row => row.session.sessionId)
    expect(ids.slice(0, 4)).toEqual(['s1', 's1a', 's1a1', 's1b'])
  })
})

describe('tree-derive: archived partition / ungrouped / ancestors / time / search', () => {
  it('archived projects land in the read-only partition and their sessions are dropped', () => {
    const derived = deriveTree(PROJECTS, WORKSPACES, makeSessions(), DEFAULT_TREE_VIEW_OPTIONS)
    expect(derived.archived.map(project => project.id)).toEqual(['p3'])
    expect(JSON.stringify(derived)).not.toContain('"d1"')
  })

  it('ungrouped sessions (null or unmatched workspace) form their own group', () => {
    const derived = deriveTree(PROJECTS, WORKSPACES, makeSessions(), DEFAULT_TREE_VIEW_OPTIONS)
    expect(derived.ungrouped.map(node => node.session.sessionId).sort()).toEqual(['u1', 'u2'])
  })

  it('ancestorChainOf walks the lineage nearest-first (self excluded), cycle/missing safe', () => {
    const sessions = makeSessions()
    expect(ancestorChainOf('s1a1', sessions)).toEqual(['s1a', 's1'])
    expect(ancestorChainOf('s1', sessions)).toEqual([])
    expect(ancestorChainOf(null, sessions)).toEqual([])
  })

  it('relativeTimePart follows the 刚刚/N分钟/N小时/N天 ladder', () => {
    expect(relativeTimePart(minutesAgo(0.4), NOW)).toEqual({ kind: 'just-now' })
    expect(relativeTimePart(minutesAgo(5), NOW)).toEqual({ kind: 'minutes', value: 5 })
    expect(relativeTimePart(minutesAgo(59), NOW)).toEqual({ kind: 'minutes', value: 59 })
    expect(relativeTimePart(minutesAgo(60 * 5), NOW)).toEqual({ kind: 'hours', value: 5 })
    expect(relativeTimePart(minutesAgo(4680), NOW)).toEqual({ kind: 'days', value: 3 })
  })

  it('search predicates are case-insensitive on titles and project names', () => {
    expect(normalizeSearch('  SpIkE ')).toBe('spike')
    expect(sessionMatches(makeSession({ id: 'x', title: '探索:知识区 spike' }), 'spike')).toBe(true)
    expect(sessionMatches(makeSession({ id: 'x', title: '对账排查' }), 'spike')).toBe(false)
    expect(projectMatches(P1, 'dsh-forge')).toBe(true)
    expect(projectMatches(P2, 'dsh-forge')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// The browser component (jsdom render)
// ---------------------------------------------------------------------------

describe('ProjectTreeBrowser: three-tier render + states', () => {
  it('renders project rows; the active project is expanded by default, others collapsed', () => {
    renderTree()
    expect(projectRow('p1')).not.toBeNull()
    expect(projectRow('p2')).not.toBeNull()
    // p1 expanded → its top sessions render; p2 collapsed → nothing under it.
    expect(sessionRow('s1')).not.toBeNull()
    expect(sessionRow('f1')).toBeNull()
  })

  it('subagent rows default collapsed; the caret expands them and reports the layout change', () => {
    const { onLayoutChange } = renderTree()
    expect(sessionRow('s1a')).toBeNull()
    fireEvent.click(document.querySelector('[data-dsh-forge-tree-caret="s1"]')!)
    expect(sessionRow('s1a')).not.toBeNull()
    // ↳ prefix marks the lineage row; recursion still collapsed one level down.
    expect(sessionRow('s1a')!.textContent).toContain('↳')
    expect(sessionRow('s1a1')).toBeNull()
    expect(onLayoutChange).toHaveBeenCalled()
    const last = onLayoutChange.mock.calls.at(-1)![0] as { expandedSessions: string[] }
    expect(last.expandedSessions).toContain('s1')
  })

  it('the active session ancestor chain is default-expanded', () => {
    renderTree({ activeSessionId: 's1a1' })
    expect(sessionRow('s1a')).not.toBeNull()
    expect(sessionRow('s1a1')).not.toBeNull()
  })

  it('session rows show the dot slot + relative time; hover swaps time for the ⋯ menu (three verbatim items)', () => {
    const { onSessionCommand } = renderTree()
    const row = sessionRow('s1')!
    expect(row.textContent).toContain('5 分钟')
    expect(row.querySelector('[data-mock-state-dot="ongoing"]')).not.toBeNull() // subagent 运行中
    expect(row.textContent).not.toContain('⋯')
    fireEvent.mouseEnter(row)
    const more = row.querySelector('[data-dsh-forge-tree-session-more="s1"]') as HTMLElement
    expect(more).not.toBeNull()
    fireEvent.click(more)
    const menu = document.querySelector('[data-dsh-forge-tree-session-menu="s1"]')!
    const items = Array.from(menu.querySelectorAll('[role="menuitem"]')).map(el => el.textContent)
    expect(items).toEqual(['✎ 重命名', '⑂ 分叉会话', '🗄 归档会话'])
    fireEvent.click(menu.querySelectorAll('[role="menuitem"]')[2]!)
    expect(onSessionCommand).toHaveBeenCalledWith('s1', 'archive')
  })

  it('clicking a session row opens it; project row click switches workbench; ＋ opens a session in-place', () => {
    const { onOpenSession, onOpenProject, onNewSession } = renderTree()
    fireEvent.click(sessionRow('s1')!)
    expect(onOpenSession).toHaveBeenCalledWith('s1')
    fireEvent.click(projectRow('p2')!)
    expect(onOpenProject).toHaveBeenCalledWith('p2')
    fireEvent.mouseEnter(projectRow('p1')!)
    fireEvent.click(projectRow('p1')!.querySelector('[data-dsh-forge-tree-project-new="p1"]')!)
    expect(onNewSession).toHaveBeenCalledWith('p1')
  })

  it('project hover ⋯ menu offers the C8 lifecycle trio (task 3.5): 重命名行内编辑 / 归档 / 删除', () => {
    const { onProjectCommand, onRename } = renderTree()
    fireEvent.mouseEnter(projectRow('p1')!)
    fireEvent.click(projectRow('p1')!.querySelector('[data-dsh-forge-tree-project-more="p1"]')!)
    const menu = document.querySelector('[data-dsh-forge-tree-project-menu="p1"]')!
    const items = Array.from(menu.querySelectorAll('[role="menuitem"]')).map(el => el.textContent)
    expect(items).toEqual(['✎ 重命名', '🗄 归档项目', '🗑 删除项目'])
    // 重命名 stays in the row (行内编辑): the input appears, Enter commits onRename.
    fireEvent.click(menu.querySelectorAll('[role="menuitem"]')[0]!)
    const input = projectRow('p1')!.querySelector('[data-dsh-forge-tree-project-rename-input="p1"]') as HTMLInputElement
    expect(input).not.toBeNull()
    fireEvent.change(input, { target: { value: 'renamed' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRename).toHaveBeenCalledWith('p1', 'renamed')
    expect(onProjectCommand).not.toHaveBeenCalledWith('p1', 'rename')
    // 归档/删除 bubble (the dialogs live at the seat).
    fireEvent.mouseEnter(projectRow('p1')!)
    fireEvent.click(projectRow('p1')!.querySelector('[data-dsh-forge-tree-project-more="p1"]')!)
    const menu2 = document.querySelector('[data-dsh-forge-tree-project-menu="p1"]')!
    fireEvent.click(menu2.querySelectorAll('[role="menuitem"]')[1]!)
    expect(onProjectCommand).toHaveBeenCalledWith('p1', 'archive')
    fireEvent.mouseEnter(projectRow('p1')!)
    fireEvent.click(projectRow('p1')!.querySelector('[data-dsh-forge-tree-project-more="p1"]')!)
    const menu3 = document.querySelector('[data-dsh-forge-tree-project-menu="p1"]')!
    fireEvent.click(menu3.querySelectorAll('[role="menuitem"]')[2]!)
    expect(onProjectCommand).toHaveBeenCalledWith('p1', 'remove')
  })

  it('an empty expanded project group shows the 暂无会话 guidance wired to onNewSession', () => {
    const { onNewSession } = renderTree({ sessions: makeSessions().filter(s => s.workspaceId !== 'ws2') })
    fireEvent.click(document.querySelector('[data-dsh-forge-tree-project-toggle="p2"]')!)
    const empty = document.querySelector('[data-dsh-forge-tree-empty="p2"]')!
    expect(empty.textContent).toContain('暂无会话')
    fireEvent.click(empty.querySelector('button')!)
    expect(onNewSession).toHaveBeenCalledWith('p2')
  })

  it('lineageDegraded renders the degraded note and keeps descendants hidden even when expanded', () => {
    renderTree({ lineageDegraded: true, layout: { expandedProjects: [], expandedSessions: ['s1'], overflowOpen: [] } })
    expect(document.querySelector('[data-dsh-forge-tree-degraded]')!.textContent).toContain('血缘推断不可用')
    expect(sessionRow('s1a')).toBeNull()
  })
})

describe('ProjectTreeBrowser: overflow folding (每组 >5)', () => {
  it('shows the first five plus 「⋯ 展开其余 N 个会话」; toggling reveals all + 收起 and reports overflowOpen', () => {
    const { onLayoutChange } = renderTree()
    const visible = () => P1_TOPS_RECENT.filter(id => sessionRow(id) !== null)
    expect(visible()).toEqual(P1_TOPS_RECENT.slice(0, TREE_OVERFLOW_LIMIT))
    const overflow = document.querySelector('[data-dsh-forge-tree-overflow="p1"]') as HTMLElement
    expect(overflow.textContent).toContain(zhN('tree.overflow.expand', 2))
    fireEvent.click(overflow)
    expect(visible()).toEqual([...P1_TOPS_RECENT])
    expect(document.querySelector('[data-dsh-forge-tree-overflow="p1"]')!.textContent)
      .toContain(t('tree.overflow.collapse'))
    const last = onLayoutChange.mock.calls.at(-1)![0] as { overflowOpen: string[] }
    expect(last.overflowOpen).toContain('p1')
  })
})

describe('ProjectTreeBrowser: ungrouped + archived partition', () => {
  it('renders the 未分组 group header with the 纳管 entry; sessions listed beneath', () => {
    const { onAdoptUngrouped } = renderTree()
    const header = document.querySelector('[data-dsh-forge-tree-ungrouped]')!
    expect(header.textContent).toContain('未分组')
    fireEvent.click(header.querySelector('[data-dsh-forge-tree-adopt]')!)
    expect(onAdoptUngrouped).toHaveBeenCalled()
    expect(sessionRow('u1')).not.toBeNull()
    expect(sessionRow('u2')).not.toBeNull()
  })

  it('archived projects render in the read-only partition: ⚠ badge, no sessions, 恢复/删除 menu', () => {
    const { onArchivedCommand, onOpenProject } = renderTree({ activeProjectId: 'p2' })
    const partition = document.querySelector('[data-dsh-forge-tree-archived]')!
    expect(partition.textContent).toContain('已归档')
    const row = document.querySelector('[data-dsh-forge-tree-archived-row="p3"]') as HTMLElement
    expect(row).not.toBeNull()
    expect(row.textContent).toContain('⚠')
    // Archived rows carry no session children at all (d1 dropped in derive).
    expect(sessionRow('d1')).toBeNull()
    // Read-only: the row itself never triggers a workbench switch.
    fireEvent.click(row)
    expect(onOpenProject).not.toHaveBeenCalledWith('p3')
    fireEvent.mouseEnter(row)
    fireEvent.click(row.querySelector('[data-dsh-forge-tree-project-more="p3"]')!)
    const menu = document.querySelector('[data-dsh-forge-tree-project-menu="p3"]')!
    const items = Array.from(menu.querySelectorAll('[role="menuitem"]')).map(el => el.textContent)
    expect(items).toEqual(['⤺ 恢复项目', '🗑 删除项目'])
    fireEvent.click(menu.querySelectorAll('[role="menuitem"]')[0]!)
    expect(onArchivedCommand).toHaveBeenCalledWith('p3', 'restore')
  })
})

describe('ProjectTreeBrowser: header — search / view options / add entry', () => {
  it('🔍 expands in place; filtering debounces 250ms over project names + session titles; Esc clears and exits', () => {
    vi.useFakeTimers()
    renderTree()
    // In-place: the label yields to the input.
    expect(document.querySelector('[data-dsh-forge-tree-search-input]')).toBeNull()
    fireEvent.click(document.querySelector('[data-dsh-forge-tree-search-btn]')!)
    const input = document.querySelector('[data-dsh-forge-tree-search-input]') as HTMLInputElement
    expect(input).not.toBeNull()
    expect(document.activeElement).toBe(input)
    // "对账" matches s2 (the overflow-hidden 7th session) — search bypasses the fold.
    fireEvent.change(input, { target: { value: '对账' } })
    act(() => { vi.advanceTimersByTime(249) })
    expect(sessionRow('s2')).toBeNull()
    act(() => { vi.advanceTimersByTime(1) })
    expect(sessionRow('s2')).not.toBeNull()
    expect(sessionRow('s1')).toBeNull()
    // Project-name match keeps the project row itself visible.
    fireEvent.change(input, { target: { value: 'dsh-forge' } })
    act(() => { vi.advanceTimersByTime(250) })
    expect(projectRow('p1')).not.toBeNull()
    expect(sessionRow('s1')).toBeNull()
    // Esc clears the query AND exits the in-place search.
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(document.querySelector('[data-dsh-forge-tree-search-input]')).toBeNull()
    expect(sessionRow('s1')).not.toBeNull()
  })

  it('⚙ popover switches 分组×排序 and persists the choice to localStorage (user-level)', () => {
    window.localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify({ grouping: 'flat', sorting: 'manual' }))
    renderTree()
    // Restored: flat rows render (no project rows in the flat list body).
    expect(projectRow('p1')).toBeNull()
    expect(sessionRow('s1a1')).not.toBeNull()
    expect(sessionRow('s1a')!.textContent).toContain('↳')
    // Open the popover and flip back to 按项目树 + 最近更新.
    fireEvent.click(document.querySelector('[data-dsh-forge-tree-view-btn]')!)
    const menu = document.querySelector('[data-dsh-forge-tree-viewmenu]')!
    fireEvent.click(menu.querySelector('[data-dsh-forge-tree-viewopt="grouping:tree"]')!)
    fireEvent.click(document.querySelector('[data-dsh-forge-tree-view-btn]')!)
    fireEvent.click(document.querySelector('[data-dsh-forge-tree-viewopt="sorting:recent"]')!)
    expect(JSON.parse(window.localStorage.getItem(VIEW_STORAGE_KEY)!))
      .toEqual({ grouping: 'tree', sorting: 'recent' })
    expect(projectRow('p1')).not.toBeNull()
  })

  it('＋ (folder-plus) is the C7 entry seat; the rail carries ◂/⊕/🔍/＋/⚙', () => {
    const { onAddProject, onToggleCollapse, onNewSession } = renderTree({ collapsed: true })
    expect(document.querySelector('[data-dsh-forge-tree-list]')).toBeNull()
    const rail = document.querySelector('[data-dsh-forge-tree-rail]')!
    for (const part of ['rail-collapse', 'rail-new-session', 'rail-search', 'rail-add', 'rail-settings']) {
      expect(rail.querySelector(`[data-dsh-forge-tree-${part}]`)).not.toBeNull()
    }
    fireEvent.click(rail.querySelector('[data-dsh-forge-tree-rail-add]')!)
    expect(onAddProject).toHaveBeenCalledTimes(1)
    fireEvent.click(rail.querySelector('[data-dsh-forge-tree-rail-collapse]')!)
    expect(onToggleCollapse).toHaveBeenCalledTimes(1)
    fireEvent.click(rail.querySelector('[data-dsh-forge-tree-rail-new-session]')!)
    expect(onNewSession).toHaveBeenCalledWith('p1')
    // Expanded mode: the header ＋ is the same C7 entry.
    cleanup()
    const expanded = renderTree()
    fireEvent.click(document.querySelector('[data-dsh-forge-tree-add-btn]')!)
    expect(expanded.onAddProject).toHaveBeenCalledTimes(1)
  })
})

describe('ProjectTreeBrowser: locale parity surface', () => {
  it('every tree.* key resolves in both halves (the typed registration balance)', () => {
    expect(tEn('tree.label')).toBe('Projects')
    expect(t('tree.label')).toBe('项目')
    expect(t('tree.overflow.expand')).toContain('{n}')
  })
})
