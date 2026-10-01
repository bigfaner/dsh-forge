// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { UseSidebarRightTabInfo } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {
  FeatureBoardData, FeatureSummary, ProposalDoc, SessionLink, TaskBoardData, TaskStatus, TaskSummary,
} from '../src/client/ipc-types.ts'
import type { FeatureDoc } from '../src/client/ipc-types.ts'
import type { ActiveProjectSnapshot, ActiveProjectStore } from '../src/client/store/active-project.ts'
import type { OpenTabRow, RightbarTabsFace } from '../src/client/views/rightbar/tabs-model.ts'
import { followProjectSwitch } from '../src/client/views/rightbar/tabs-model.ts'
import { DocTab } from '../src/client/views/rightbar/DocTab.tsx'
import type { DocTabProps } from '../src/client/views/rightbar/DocTab.tsx'
import {
  createDocTabsRegistry, docDisplayName, docEntryName, DocTabTitle, focusOrOpenDoc, parseDocPath,
} from '../src/client/views/rightbar/DocTree.tsx'
import { DepGraphTab } from '../src/client/views/rightbar/DepGraphTab.tsx'
import type { DepGraphTabProps } from '../src/client/views/rightbar/DepGraphTab.tsx'
import { createDepGraphModeMemory } from '../src/client/views/rightbar/DepGraphTab.tsx'
import { buildDepGraph, DEP_COLUMN_GAP, DEP_NODE_WIDTH } from '../src/client/views/rightbar/DagView.tsx'
import { groupDepLanes } from '../src/client/views/rightbar/SwimlaneView.tsx'
import { featureStatusLabel } from '../src/client/i18n/feature-status.ts'
import { taskStatusLabel } from '../src/client/i18n/task-status.ts'
import { TASK_STATUSES } from '../src/client/i18n/task-status.ts'
import { en } from '../src/client/locale/en.ts'
import type { WorkbenchKey } from '../src/client/locale/en.ts'

// M4 task 2.4 — the 文档 tab + 依赖图 tab interiors (layout §4.5/§4.6):
// the doc-tree identity model (path → slug/产物名 + the M3 read verb), the
// doc-tab registry + focus-or-open dedupe (AC1 可多开 · 重复打开激活既有),
// the doc body (路径栏 h38 + ↻ 重新读取 + 只读正文), the pure DAG build
// (blocker-left columns 列宽 200/间距 24, deps 边解析, 悬空无边), the 7-态
// swimlane grouping, the depgraph assembly (feature 下拉仅本项目 + 状态徽标,
// 双模式分段钮, 模式随会话保留, 节点点击开 dock, BIZ-005 失效-重建), and the
// §4.7 联动 (project switch closes the scoped tabs — AC5).

const t = (key: WorkbenchKey): string => en[key]

// The upstream StateDot resolves through the module table at runtime; the
// npm node entry carries undeclared transitive deps (clsx/…) only the
// upstream monorepo supplies, so the jsdom render stubs it with an
// observable span (the task-board.spec precedent — the real dot rides the e2e).
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  StateDot: (props: { state: string }) => <span data-mock-state-dot={props.state} />,
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A hand-rolled active-project store (the rightbar-container.spec twin). */
function makeProjectStore(activeId: string | null = 'p1') {
  let snapshot = { phase: 'ready', projects: [], activeProjectId: activeId } as unknown as ActiveProjectSnapshot
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

/** A fake tab-info hook carrying one tab's id/title/params (the seam's shape). */
function makeTabInfo(params: unknown, tabId = 'tab-1', actions: Record<string, unknown> = {}) {
  return () => ({
    tab: {
      id: tabId,
      kind: 'doc',
      title: 'fallback-title',
      navigation: { params, revision: 1 },
      actions: { openTab: vi.fn(), ...actions },
    },
  }) as unknown as UseSidebarRightTabInfo
}

const feature = (slug: string, over: Partial<FeatureSummary> = {}): FeatureSummary => ({
  slug,
  status: 'tasks',
  docKinds: ['manifest'],
  taskTotal: 10,
  taskCompleted: 0,
  updatedAt: '2026-08-01T00:00:00.000Z',
  ...over,
})

const FEATURES_BOARD: FeatureBoardData = {
  features: [
    feature('dsh-forge-m4', { status: 'in-progress', docKinds: ['manifest', 'prd'], taskTotal: 41, taskCompleted: 12, updatedAt: '2026-09-28T10:00:00.000Z' }),
    feature('dsh-forge-m2', { status: 'completed', taskTotal: 53, taskCompleted: 53, updatedAt: '2026-08-01T00:00:00.000Z' }),
  ],
  generatedAt: '2026-09-28T10:00:00.000Z',
}

const task = (localId: string, over: Partial<TaskSummary> = {}): TaskSummary => ({
  key: `dsh-forge-m4/${localId}`,
  title: `title of ${localId}`,
  status: 'pending',
  featureSlug: 'dsh-forge-m4',
  blockers: [],
  branch: null,
  worktree: false,
  source: null,
  updatedAt: '2026-09-28T08:00:00.000Z',
  ...over,
})

// The m4 chain: 1.1 → 2.1 → 2.2 → 3.1 (2.2 also直接 blocked by 1.1);
// 2.3 carries a DANGLING blocker (9.9 addresses no task); 5.1 belongs to the
// OTHER feature (the graph never draws it).
const BOARD_TASKS: readonly TaskSummary[] = [
  task('1.1'),
  task('2.1', { status: 'in_progress', blockers: ['1.1'] }),
  task('2.2', { blockers: ['2.1', '1.1'] }),
  task('3.1', { blockers: ['2.2'] }),
  task('2.3', { blockers: ['9.9'] }),
  { ...task('5.1', { status: 'completed' }), key: 'dsh-forge-m2/5.1', featureSlug: 'dsh-forge-m2' },
]

const TASK_BOARD: TaskBoardData = {
  tasks: BOARD_TASKS,
  generatedAt: '2026-09-28T10:00:00.000Z',
  sync: { state: 'idle', lastScanAt: null },
}

const link = (sessionId: string, taskKey: string, status: 'active' | 'ended' = 'active'): SessionLink => ({
  id: `link-${sessionId}-${taskKey}`,
  projectId: 'p1',
  taskKey,
  sessionId,
  status,
  startedAt: '2026-09-28T08:00:00.000Z',
  endedAt: status === 'ended' ? '2026-09-28T10:00:00.000Z' : null,
})

const SOURCES = [
  { task: { key: 'dsh-forge-m4/2.1', title: 'title of 2.1', status: 'in_progress' as TaskStatus }, links: [link('s-1', 'dsh-forge-m4/2.1')] },
  { task: { key: 'dsh-forge-m4/2.2', title: 'title of 2.2', status: 'pending' as TaskStatus }, links: [link('s-2', 'dsh-forge-m4/2.2', 'ended')] },
]

const FEATURE_DOC: FeatureDoc = { kind: 'prd', markdown: '# dsh-forge-m4 PRD\n\n- one\n- two\n' }
const PROPOSAL_DOC: ProposalDoc = { kind: 'proposal', markdown: '# m5 proposal\n\nbody\n' }

const query = (view: ReturnType<typeof render>, selector: string): HTMLElement =>
  view.container.querySelector(selector) as HTMLElement

afterEach(cleanup)

// ---------------------------------------------------------------------------
// AC1 — DocTree: the identity model (parse + slug/产物名)
// ---------------------------------------------------------------------------

describe('DocTree: the directory-tree identity model', () => {
  it('parseDocPath: the three tree path forms onto the M3 read verbs (unknown = undefined)', () => {
    expect(parseDocPath('docs/features/dsh-forge-m4/prd'))
      .toEqual({ area: 'features', slug: 'dsh-forge-m4', kind: 'prd' })
    expect(parseDocPath('docs/features/dsh-forge-m4/manifest'))
      .toEqual({ area: 'features', slug: 'dsh-forge-m4', kind: 'manifest' })
    expect(parseDocPath('docs/proposals/dsh-forge-m5/proposal.md'))
      .toEqual({ area: 'proposals', slug: 'dsh-forge-m5', kind: 'proposal' })
    expect(parseDocPath('docs/proposals/dsh-forge-m5/eval'))
      .toEqual({ area: 'proposals', slug: 'dsh-forge-m5', kind: 'eval' })
    // Unknown shapes never reach the read side.
    expect(parseDocPath('docs/features/dsh-forge-m4/prd/extra')).toBeUndefined()
    expect(parseDocPath('docs/features/dsh-forge-m4')).toBeUndefined()
    expect(parseDocPath('docs/other/x/y')).toBeUndefined()
    expect(parseDocPath('')).toBeUndefined()
  })

  it('docEntryName/docDisplayName: the tab-name form slug/产物名称 (条目名, 含子目录)', () => {
    expect(docEntryName({ area: 'features', slug: 's', kind: 'prd' })).toBe('prd')
    expect(docEntryName({ area: 'proposals', slug: 's', kind: 'proposal' })).toBe('proposal.md')
    expect(docDisplayName({ area: 'proposals', slug: 'dsh-forge-m5', kind: 'eval' })).toBe('dsh-forge-m5/eval')
  })
})

// ---------------------------------------------------------------------------
// AC1 — the doc-tab registry + focus-or-open dedupe (可多开 · 重复打开激活既有)
// ---------------------------------------------------------------------------

describe('DocTabs registry: 可多开 · 重复打开激活既有', () => {
  /** The controller-face fake (the tabs-model contract). */
  function makeFace() {
    const calls = { opened: [] as Array<{ kind: string; params: unknown }>, focused: [] as string[] }
    const face = {
      openTab: (kind: string, options?: { params?: unknown }) => { calls.opened.push({ kind, params: options?.params }) },
      focus: (tabId: string) => { calls.focused.push(tabId) },
      close: () => {},
      isExpanded: () => true,
      toggleExpanded: () => {},
      openTabs: { getSnapshot: (): readonly OpenTabRow[] => [] },
    } as unknown as RightbarTabsFace
    return { face, calls }
  }

  it('a path with NO live tab OPENS a new doc tab carrying the identity params', () => {
    const { face, calls } = makeFace()
    const registry = createDocTabsRegistry()
    const outcome = focusOrOpenDoc(face, registry, { path: 'docs/features/s/prd', displayName: 's/prd' })
    expect(outcome).toBe('opened')
    expect(calls.opened).toEqual([{ kind: 'doc', params: { path: 'docs/features/s/prd', displayName: 's/prd' } }])
    expect(calls.focused).toEqual([])
  })

  it('a re-opened path FOCUSES the live tab (重复打开激活既有); two paths stay two tabs (可多开)', () => {
    const { face, calls } = makeFace()
    const registry = createDocTabsRegistry()
    registry.register('tab-a', 'docs/features/s/prd')
    registry.register('tab-b', 'docs/proposals/s/proposal.md')
    expect(focusOrOpenDoc(face, registry, { path: 'docs/features/s/prd', displayName: 's/prd' })).toBe('focused')
    expect(focusOrOpenDoc(face, registry, { path: 'docs/proposals/s/proposal.md', displayName: 's/proposal' })).toBe('focused')
    expect(calls.focused).toEqual(['tab-a', 'tab-b'])
    expect(calls.opened).toEqual([])
  })

  it('unregister drops a closed tab only when it still owns the path (latest mount wins, stale unregister is a no-op)', () => {
    const registry = createDocTabsRegistry()
    registry.register('tab-a', 'p')
    registry.register('tab-b', 'p')
    registry.unregister('tab-a', 'p')
    expect(registry.tabIdOf('p')).toBe('tab-b')
    registry.unregister('tab-b', 'p')
    expect(registry.tabIdOf('p')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// AC1 — the doc body (路径栏 h38 + ↻ + 只读正文 + the registry mount)
// ---------------------------------------------------------------------------

describe('DocTab: the 文档 tab body', () => {
  function mountDoc(over: Partial<DocTabProps> = {}) {
    const readFeatureDoc = vi.fn(async (): Promise<FeatureDoc> => FEATURE_DOC)
    const readProposalDoc = vi.fn(async (): Promise<ProposalDoc> => PROPOSAL_DOC)
    const registry = createDocTabsRegistry()
    const props: DocTabProps = {
      t,
      activeProject: makeProjectStore(),
      docTabs: registry,
      seat: { featureDocFace: { readFeatureDoc }, proposalsFace: { readProposalDoc } },
      useTabInfo: makeTabInfo({ path: 'docs/features/dsh-forge-m4/prd', displayName: 'dsh-forge-m4/prd' }, 'doc-1'),
      ...over,
    }
    const view = render(<DocTab {...props} />)
    return { view, props, readFeatureDoc, readProposalDoc, registry }
  }

  it('renders the 路径栏 (title=全路径, 只读 mark, ↻ reload) over the read-only MarkdownView body', async () => {
    const { view } = mountDoc()
    await waitFor(() => { expect(query(view, '[data-dsh-forge-markdown]')).toBeTruthy() })
    const pathbar = query(view, '[data-dsh-forge-doc-pathbar]')
    expect(pathbar.style.height).toBe('38px')
    const path = query(view, '[data-dsh-forge-doc-path]')
    expect(path.getAttribute('title')).toBe('docs/features/dsh-forge-m4/prd')
    expect(path.textContent).toBe('docs/features/dsh-forge-m4/prd')
    expect(pathbar.textContent).toContain('Read-only')
    expect(query(view, '[data-dsh-forge-doc-reload]')).toBeTruthy()
    // 只读正文: the ONE MarkdownView, no editing surface anywhere.
    expect(view.container.querySelectorAll('textarea, input')).toHaveLength(0)
    expect(query(view, '[data-dsh-forge-markdown] h1')?.textContent).toBe('dsh-forge-m4 PRD')
  })

  it('routes the read through the M3 verb the path addresses (features vs proposals)', async () => {
    const readFeatureDoc = vi.fn(async (): Promise<FeatureDoc> => FEATURE_DOC)
    const readProposalDoc = vi.fn(async (): Promise<ProposalDoc> => PROPOSAL_DOC)
    render(
      <DocTab
        t={t}
        activeProject={makeProjectStore()}
        seat={{ featureDocFace: { readFeatureDoc }, proposalsFace: { readProposalDoc } }}
        useTabInfo={makeTabInfo({ path: 'docs/features/dsh-forge-m4/prd', displayName: 'dsh-forge-m4/prd' })}
      />,
    )
    await waitFor(() => { expect(readFeatureDoc).toHaveBeenCalledWith('p1', 'dsh-forge-m4', 'prd') })
    expect(readProposalDoc).not.toHaveBeenCalled()
    cleanup()
    render(
      <DocTab
        t={t}
        activeProject={makeProjectStore()}
        seat={{ featureDocFace: { readFeatureDoc }, proposalsFace: { readProposalDoc } }}
        useTabInfo={makeTabInfo({ path: 'docs/proposals/dsh-forge-m5/proposal.md', displayName: 'dsh-forge-m5/proposal' })}
      />,
    )
    await waitFor(() => { expect(readProposalDoc).toHaveBeenCalledWith({ projectId: 'p1', slug: 'dsh-forge-m5', kind: 'proposal' }) })
  })

  it('↻ is the ONLY re-read route (Hard Rule: no auto reload); a failed read shows the error card and ↻ retries', async () => {
    let calls = 0
    const flaky = vi.fn(async (): Promise<FeatureDoc> => {
      calls += 1
      if (calls === 1) throw new Error(JSON.stringify({ code: 'ERR_WORKBENCH_DB', message: 'stale' }))
      return FEATURE_DOC
    })
    const { view } = mountDoc({ seat: { featureDocFace: { readFeatureDoc: flaky } } })
    await waitFor(() => { expect(query(view, '[data-dsh-forge-doc-error]')).toBeTruthy() })
    expect(query(view, '[data-dsh-forge-doc-retry]')).toBeTruthy()
    fireEvent.click(query(view, '[data-dsh-forge-doc-retry]'))
    await waitFor(() => { expect(query(view, '[data-dsh-forge-markdown]')).toBeTruthy() })
    expect(calls).toBe(2)
    // ↻ on the ready body re-reads too (重新读取).
    fireEvent.click(query(view, '[data-dsh-forge-doc-reload]'))
    await waitFor(() => { expect(calls).toBe(3) })
  })

  it('an unparseable path renders the error branch naming the path (never a silent empty pane)', async () => {
    const readFeatureDoc = vi.fn(async (): Promise<FeatureDoc> => FEATURE_DOC)
    const { view } = mountDoc({
      seat: { featureDocFace: { readFeatureDoc } },
      useTabInfo: makeTabInfo({ path: 'docs/features/oops', displayName: 'oops/x' }),
    })
    await waitFor(() => { expect(query(view, '[data-dsh-forge-doc-error]')).toBeTruthy() })
    expect(query(view, '[data-dsh-forge-doc-unparsed]')?.textContent).toBe('docs/features/oops')
    expect(readFeatureDoc).not.toHaveBeenCalled()
  })

  it('registers into the doc-tabs registry on mount and drops on unmount (the dedupe liveness half)', () => {
    const registry = createDocTabsRegistry()
    const props: DocTabProps = {
      t,
      activeProject: makeProjectStore(),
      docTabs: registry,
      seat: { featureDocFace: { readFeatureDoc: async () => FEATURE_DOC } },
      useTabInfo: makeTabInfo({ path: 'docs/features/s/prd', displayName: 's/prd' }, 'doc-9'),
    }
    const view = render(<DocTab {...props} />)
    expect(registry.tabIdOf('docs/features/s/prd')).toBe('doc-9')
    view.unmount()
    expect(registry.tabIdOf('docs/features/s/prd')).toBeUndefined()
  })

  it('the chip title renders the params\' slug/产物名称 (title=全路径); the fallback without params', () => {
    const titled = render(<DocTabTitle useTabInfo={makeTabInfo({ path: 'docs/features/s/prd', displayName: 's/prd' })} />)
    const chip = query(titled, '[data-dsh-forge-doc-title="docs/features/s/prd"]')
    expect(chip.textContent).toBe('s/prd')
    expect(chip.getAttribute('title')).toBe('docs/features/s/prd')
    cleanup()
    const fallback = render(<DocTabTitle useTabInfo={makeTabInfo(undefined)} />)
    expect(query(fallback, '[data-dsh-forge-doc-title="fallback"]')?.textContent).toBe('fallback-title')
  })
})

// ---------------------------------------------------------------------------
// AC2 — the pure DAG build (deps 边解析 + blocker-left geometry)
// ---------------------------------------------------------------------------

describe('buildDepGraph: the DAG build (blocker 在左, 列宽 200/间距 24)', () => {
  it('derives edges from the structured blockers (same-feature 前置 only; 悬空 draws no edge)', () => {
    const layout = buildDepGraph(BOARD_TASKS.filter(row => row.featureSlug === 'dsh-forge-m4'))
    expect(layout.edges.map(edge => `${edge.source}->${edge.target}`)).toEqual([
      'dsh-forge-m4/1.1->dsh-forge-m4/2.1',
      'dsh-forge-m4/2.1->dsh-forge-m4/2.2',
      'dsh-forge-m4/1.1->dsh-forge-m4/2.2',
      'dsh-forge-m4/2.2->dsh-forge-m4/3.1',
    ])
    // The dangling 9.9 and the OTHER feature's task never appear.
    expect(layout.nodes.map(node => node.task.key)).not.toContain('dsh-forge-m2/5.1')
  })

  it('depth columns put blockers LEFT (列宽 200/间距 24; 三级链 fits without wrap-around)', () => {
    const layout = buildDepGraph(BOARD_TASKS.filter(row => row.featureSlug === 'dsh-forge-m4'))
    const byKey = new Map(layout.nodes.map(node => [node.task.key, node] as const))
    expect(byKey.get('dsh-forge-m4/1.1')?.depth).toBe(0)
    expect(byKey.get('dsh-forge-m4/2.1')?.depth).toBe(1)
    // 2.2's deepest blocker is 2.1 (depth 1) → column 2; 3.1 → column 3.
    expect(byKey.get('dsh-forge-m4/2.2')?.depth).toBe(2)
    expect(byKey.get('dsh-forge-m4/3.1')?.depth).toBe(3)
    expect(byKey.get('dsh-forge-m4/3.1')!.x - byKey.get('dsh-forge-m4/2.2')!.x).toBe(DEP_NODE_WIDTH + DEP_COLUMN_GAP)
    // Every blocker sits strictly left of the task it blocks.
    for (const edge of layout.edges) {
      expect(byKey.get(edge.source)!.x).toBeLessThan(byKey.get(edge.target)!.x)
    }
    expect(layout.width).toBeGreaterThanOrEqual(16 + 3 * (DEP_NODE_WIDTH + DEP_COLUMN_GAP) + DEP_NODE_WIDTH + 16)
  })

  it('the cycle guard keeps the walk finite (a back-edge contributes depth 0)', () => {
    const cyclic = [
      task('1.1', { blockers: ['2.2'] }),
      task('2.2', { blockers: ['1.1'] }),
    ]
    const layout = buildDepGraph(cyclic)
    expect(layout.nodes).toHaveLength(2)
    expect(layout.width).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// AC2 — the swimlane grouping (七态横向列)
// ---------------------------------------------------------------------------

describe('groupDepLanes: the 泳道七态 grouping', () => {
  it('every status lane is present in the canonical order, tasks grouped, empty lanes kept', () => {
    const lanes = groupDepLanes(BOARD_TASKS.filter(row => row.featureSlug === 'dsh-forge-m4'))
    expect(lanes.map(lane => lane.status)).toEqual([...TASK_STATUSES])
    expect(lanes.find(lane => lane.status === 'in_progress')?.tasks.map(row => row.key))
      .toEqual(['dsh-forge-m4/2.1'])
    expect(lanes.find(lane => lane.status === 'pending')?.tasks.map(row => row.key))
      .toEqual(['dsh-forge-m4/1.1', 'dsh-forge-m4/2.2', 'dsh-forge-m4/3.1', 'dsh-forge-m4/2.3'])
    for (const lane of lanes.slice(3)) {
      expect(lane.tasks).toEqual([])
    }
  })
})

// ---------------------------------------------------------------------------
// AC2/AC3/AC4 — the depgraph assembly
// ---------------------------------------------------------------------------

describe('DepGraphTab: the assembly (feature 下拉 + 双模式 + 节点卡)', () => {
  function mountDep(over: Partial<DepGraphTabProps> = {}) {
    const loadFeatureBoard = vi.fn(async (): Promise<FeatureBoardData> => FEATURES_BOARD)
    const loadBoard = vi.fn(async (): Promise<TaskBoardData> => TASK_BOARD)
    const onOpenTask = vi.fn()
    const boardFace = { loadBoard }
    const props: DepGraphTabProps = {
      t,
      activeProject: makeProjectStore(),
      onOpenTask,
      seat: {
        featureBoardFace: { loadFeatureBoard },
        taskBoardFace: boardFace,
        taskSources: async () => SOURCES,
      },
      modeMemory: createDepGraphModeMemory(),
      ...over,
    }
    const view = render(<DepGraphTab {...props} />)
    return { view, props, loadFeatureBoard, loadBoard, onOpenTask }
  }

  it('defaults to DAG with the derived 活跃 feature; the header pill = 状态 + done/total', async () => {
    const { view } = mountDep()
    await waitFor(() => { expect(query(view, '[data-dsh-forge-depgraph-dag]')).toBeTruthy() })
    expect(query(view, '[data-dsh-forge-depgraph-mode="dag"]')?.getAttribute('aria-selected')).toBe('true')
    expect(query(view, '[data-dsh-forge-depgraph-mode="lane"]')?.getAttribute('aria-selected')).toBe('false')
    const pill = query(view, '[data-dsh-forge-depgraph-feature-pill="dsh-forge-m4"]')
    expect(pill.textContent).toBe(`${featureStatusLabel('in-progress', t)} 12/41`)
    // DAG canvas: SVG edges + the feature's nodes only (仅本项目 feature 的任务).
    expect(view.container.querySelectorAll('[data-dsh-forge-depgraph-edges] line')).toHaveLength(4)
    expect(view.container.querySelectorAll('[data-dsh-forge-depgraph-node]')).toHaveLength(5)
  })

  it('the 分段钮 switches modes; the node card is the SAME family in both (节点卡复用)', async () => {
    const { view } = mountDep()
    await waitFor(() => { expect(view.container.querySelectorAll('[data-dsh-forge-depgraph-node]').length).toBe(5) })
    fireEvent.click(query(view, '[data-dsh-forge-depgraph-mode="lane"]'))
    expect(query(view, '[data-dsh-forge-depgraph-lanes]')).toBeTruthy()
    expect(query(view, '[data-dsh-forge-depgraph-dag]')).toBeNull()
    expect(view.container.querySelectorAll('[data-dsh-forge-depgraph-node]')).toHaveLength(5)
  })

  it('泳道图: seven lane columns with 状态点+名称+计数 heads and the 空列 placeholder', async () => {
    const { view } = mountDep({ modeMemory: (() => { const memory = createDepGraphModeMemory(); memory.set('lane'); return memory })() })
    await waitFor(() => { expect(query(view, '[data-dsh-forge-depgraph-lanes]')).toBeTruthy() })
    const lanes = view.container.querySelectorAll('[data-dsh-forge-depgraph-lane]')
    expect(lanes).toHaveLength(7)
    const inProgress = query(view, '[data-dsh-forge-depgraph-lane-head="in_progress"]')
    expect(inProgress.textContent).toContain(taskStatusLabel('in_progress', t))
    expect(inProgress.textContent).toContain('1')
    expect(query(view, '[data-dsh-forge-depgraph-lane-empty="blocked"]')?.textContent).toBe('No tasks in this status')
  })

  it('feature 名即下拉: options are THIS project\'s features only, each with the status pill; picking re-scopes the graph', async () => {
    const { view } = mountDep()
    await waitFor(() => { expect(query(view, '[data-dsh-forge-depgraph-feature="dsh-forge-m4"]')).toBeTruthy() })
    fireEvent.click(query(view, '[data-dsh-forge-depgraph-feature="dsh-forge-m4"]'))
    const options = view.container.querySelectorAll('[data-dsh-forge-depgraph-feature-option]')
    // 仅本项目: the board's two features, NOTHING else.
    expect(Array.from(options).map(option => option.getAttribute('data-dsh-forge-depgraph-feature-option')))
      .toEqual(['dsh-forge-m4', 'dsh-forge-m2'])
    expect(query(view, '[data-dsh-forge-depgraph-feature-option="dsh-forge-m2"]')?.textContent)
      .toContain(`${featureStatusLabel('completed', t)} 53/53`)
    fireEvent.click(query(view, '[data-dsh-forge-depgraph-feature-option="dsh-forge-m2"]'))
    await waitFor(() => { expect(query(view, '[data-dsh-forge-depgraph-feature="dsh-forge-m2"]')).toBeTruthy() })
    // The m2 graph: its ONE task, no edges, no m4 rows.
    expect(view.container.querySelectorAll('[data-dsh-forge-depgraph-node]')).toHaveLength(1)
    expect(view.container.querySelectorAll('[data-dsh-forge-depgraph-edges] line')).toHaveLength(0)
    expect(query(view, '[data-dsh-forge-depgraph-node="dsh-forge-m2/5.1"]')).toBeTruthy()
  })

  it('节点卡: 状态点/标题/ID/「会话中」pill; 点击开任务详情 dock (both modes)', async () => {
    const { view, onOpenTask } = mountDep()
    await waitFor(() => { expect(query(view, '[data-dsh-forge-depgraph-node="dsh-forge-m4/2.1"]')).toBeTruthy() })
    const card = query(view, '[data-dsh-forge-depgraph-node="dsh-forge-m4/2.1"]')
    expect(card.textContent).toContain('title of 2.1')
    expect(card.textContent).toContain('dsh-forge-m4/2.1')
    // The ACTIVE link's task carries the shared 会话中 badge; the ended one does not.
    expect(query(view, '[data-dsh-forge-badge="session-live"]')?.getAttribute('data-dsh-forge-session-id')).toBe('s-1')
    fireEvent.click(card)
    expect(onOpenTask).toHaveBeenCalledWith('dsh-forge-m4/2.1')
    // The swimlane card is the same family and the same seam.
    fireEvent.click(query(view, '[data-dsh-forge-depgraph-mode="lane"]'))
    await waitFor(() => { expect(query(view, '[data-dsh-forge-depgraph-lanes]')).toBeTruthy() })
    fireEvent.click(query(view, '[data-dsh-forge-depgraph-node="dsh-forge-m4/3.1"]'))
    expect(onOpenTask).toHaveBeenCalledWith('dsh-forge-m4/3.1')
  })

  it('BIZ-005 失效-重建: a project-scoped push re-fires the reads (节点状态随会话运行态刷新)', async () => {
    const listeners = new Set<(events: unknown[]) => void>()
    const loadBoard = vi.fn(async (): Promise<TaskBoardData> => TASK_BOARD)
    const loadFeatureBoard = vi.fn(async (): Promise<FeatureBoardData> => FEATURES_BOARD)
    const { view } = mountDep({
      seat: {
        featureBoardFace: { loadFeatureBoard },
        taskBoardFace: { loadBoard, subscribeEvents: (cb: (events: unknown[]) => void) => {
          listeners.add(cb as (events: unknown[]) => void)
          return () => { listeners.delete(cb as (events: unknown[]) => void) }
        } },
        taskSources: async () => SOURCES,
      },
    })
    await waitFor(() => { expect(query(view, '[data-dsh-forge-depgraph-node="dsh-forge-m4/2.1"]')).toBeTruthy() })
    const boardCalls = loadBoard.mock.calls.length
    const featureCalls = loadFeatureBoard.mock.calls.length
    for (const listener of listeners) listener([{ type: 'sync', projectId: 'p1', sync: { state: 'idle', lastScanAt: null } }])
    await waitFor(() => { expect(loadBoard.mock.calls.length).toBe(boardCalls + 1) })
    await waitFor(() => { expect(loadFeatureBoard.mock.calls.length).toBe(featureCalls + 1) })
    // A FOREIGN project's push never fires (仅本项目).
    for (const listener of listeners) listener([{ type: 'sync', projectId: 'p-other', sync: { state: 'idle', lastScanAt: null } }])
    await new Promise((resolve) => { setTimeout(resolve, 20) })
    expect(loadBoard.mock.calls.length).toBe(boardCalls + 1)
  })

  it('模式随会话保留: a remount finds the mode where the session left it', async () => {
    const memory = createDepGraphModeMemory()
    const first = mountDep({ modeMemory: memory })
    await waitFor(() => { expect(query(first.view, '[data-dsh-forge-depgraph-dag]')).toBeTruthy() })
    fireEvent.click(query(first.view, '[data-dsh-forge-depgraph-mode="lane"]'))
    await waitFor(() => { expect(query(first.view, '[data-dsh-forge-depgraph-lanes]')).toBeTruthy() })
    first.view.unmount()
    const second = mountDep({ modeMemory: memory })
    await waitFor(() => { expect(query(second.view, '[data-dsh-forge-depgraph-lanes]')).toBeTruthy() })
    expect(query(second.view, '[data-dsh-forge-depgraph-mode="lane"]')?.getAttribute('aria-selected')).toBe('true')
  })

  it('the params may pin the initial feature (the `depgraph` params seam)', async () => {
    const { view } = mountDep({ useTabInfo: makeTabInfo({ featureSlug: 'dsh-forge-m2' }) })
    await waitFor(() => { expect(query(view, '[data-dsh-forge-depgraph-feature="dsh-forge-m2"]')).toBeTruthy() })
    expect(view.container.querySelectorAll('[data-dsh-forge-depgraph-node]')).toHaveLength(1)
  })

  it('an unresolved project pointer renders the resolving skeleton (the family discipline)', () => {
    const view = render(<DepGraphTab t={t} modeMemory={createDepGraphModeMemory()} />)
    expect(view.container.querySelector('[data-dsh-forge-depgraph]')?.getAttribute('aria-busy')).toBe('true')
  })

  it('a feature with no tasks shows the empty copy (never a blank canvas)', async () => {
    const { view } = mountDep({
      seat: {
        featureBoardFace: { loadFeatureBoard: async () => ({ features: [feature('dsh-forge-m9')], generatedAt: '2026-09-28T10:00:00.000Z' }) },
        taskBoardFace: { loadBoard: async () => TASK_BOARD },
        taskSources: async () => SOURCES,
      },
    })
    await waitFor(() => { expect(query(view, '[data-dsh-forge-depgraph-tasks-empty]')).toBeTruthy() })
  })
})

// ---------------------------------------------------------------------------
// AC5 — the §4.7 联动 (project switch closes the scoped tabs)
// ---------------------------------------------------------------------------

describe('AC5: the 联动 (project switch closes 文档/依赖图 tabs)', () => {
  it('followProjectSwitch closes every doc + depgraph row and returns to 项目概览', () => {
    const rows: readonly OpenTabRow[] = [
      { tabId: 'guide-1', kind: 'guide' },
      { tabId: 'overview-1', kind: 'overview' },
      { tabId: 'doc-a', kind: 'doc' },
      { tabId: 'doc-b', kind: 'doc' },
      { tabId: 'depgraph-1', kind: 'depgraph' },
      { tabId: 'board-1', kind: 'board' },
    ]
    const calls = { closed: [] as string[], focused: [] as string[], opened: [] as string[] }
    const face = {
      openTab: (kind: string) => { calls.opened.push(kind) },
      close: (tabId: string) => { calls.closed.push(tabId) },
      focus: (tabId: string) => { calls.focused.push(tabId) },
      isExpanded: () => true,
      toggleExpanded: () => {},
      openTabs: { getSnapshot: () => rows },
    } as unknown as RightbarTabsFace
    const outcome = followProjectSwitch(face, 'p1', 'p2')
    expect(outcome.projectChanged).toBe(true)
    expect(outcome.closedTabIds).toEqual(['doc-a', 'doc-b', 'depgraph-1'])
    // guide/overview/board rows are untouched; the column returns to 概览 —
    // fix-1 会话域 seam: through the MOUNTED-session openTab (the native
    // per-pane page dedupe settles the focus), never the inventory focus.
    expect(calls.closed).toEqual(['doc-a', 'doc-b', 'depgraph-1'])
    expect(calls.opened).toEqual(['overview'])
  })
})
