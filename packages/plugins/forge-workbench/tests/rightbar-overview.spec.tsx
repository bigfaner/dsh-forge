// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Project, ProposalBoardData, FeatureBoardData, FeatureSummary, ProposalSummary, SessionLink, TaskStatus } from '../src/client/ipc-types.ts'
import type { ActiveProjectSnapshot, ActiveProjectStore } from '../src/client/store/active-project.ts'
import { OverviewHeader } from '../src/client/views/rightbar/OverviewHeader.tsx'
import { OverviewTab } from '../src/client/views/rightbar/OverviewTab.tsx'
import type { OverviewTabProps } from '../src/client/views/rightbar/OverviewTab.tsx'
import {
  activeLinkOf, countRunningSessions, deriveActiveFeature, deriveExecutingTasks, workspaceRootOf,
} from '../src/client/views/rightbar/overview-model.ts'
import { proposalStatusLabel } from '../src/client/views/proposals/ProposalStatusPill.tsx'
import { featureStatusLabel } from '../src/client/i18n/feature-status.ts'
import { taskStatusShortLabel } from '../src/client/i18n/task-status.ts'
import { en } from '../src/client/locale/en.ts'
import type { WorkbenchKey } from '../src/client/locale/en.ts'

// M4 task 2.3 — the 「项目概览」tab interior (layout §4.3/§4.4): the pure
// derivation model (概要信息区派生), the header (paths 超长省略 + title 全称,
// archived ⚠), the three-sub-tab assembly (默认 feature; sub-tab switches
// never remount), the M3-face panes re-homed zero-loss in the pane host
// (提案/feature directory trees + 点文档名开文档 tab through the openTab
// seam; 任务 list: 执行中分组 + 全量列表 + ⟞ 直达会话 + the 唯一 [依赖图]
// button), and the 归档只读 state (执行中 hidden).

// M4 task 3.5: the header's 投影状态行 (ProjectionStatusRow) pulls the real
// StateDot into this graph — the jsdom mount stubs the primitives module
// (the task-board-assembly precedent; the real glyphs ride the e2e).
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  StateDot: (props: { state: string }) => <span data-mock-state-dot={props.state} />,
}))

const t = (key: WorkbenchKey): string => en[key]

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const project = (over: Partial<Project> = {}): Project => ({
  id: 'p1',
  displayName: 'dsh-forge',
  codeRoot: 'Z:\\project\\dsh\\dsh-forge',
  docLocationType: 'in_repo',
  docLocationPath: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  lastActivatedAt: null,
  archived: false,
  sortOrder: 0,
  projectionState: 'pending',
  docsPlacement: 'repo-existing',
  ...over,
})

/** A hand-rolled active-project store (the rightbar-container.spec twin). */
function makeProjectStore(initial: Project, activeId: string | null = initial.id) {
  let snapshot = { phase: 'ready', projects: [initial], activeProjectId: activeId } as unknown as ActiveProjectSnapshot
  const listeners = new Set<() => void>()
  return {
    subscribe: (fn: () => void): (() => void) => {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    },
    getSnapshot: (): ActiveProjectSnapshot => snapshot,
    set: (next: ActiveProjectSnapshot): void => {
      snapshot = next
      for (const fn of listeners) fn()
    },
  } as unknown as ActiveProjectStore & { set: (next: ActiveProjectSnapshot) => void }
}

const proposal = (slug: string, over: Partial<ProposalSummary> = {}): ProposalSummary => ({
  slug,
  status: 'draft',
  author: null,
  created: '2026-09-01',
  featureSlug: null,
  hasEval: false,
  updatedAt: '2026-09-20T08:00:00.000Z',
  ...over,
})

const PROPOSALS_BOARD: ProposalBoardData = {
  proposals: [
    proposal('dsh-forge-m4', { status: 'accepted', featureSlug: 'dsh-forge-m4', hasEval: true }),
    proposal('dsh-forge-m5', { status: 'draft' }),
  ],
  generatedAt: '2026-09-28T08:00:00.000Z',
  proposalsRoot: 'Z:\\project\\dsh\\dsh-forge\\docs\\proposals',
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
    feature('dsh-forge-m4', { status: 'in-progress', docKinds: ['manifest', 'prd', 'ui'], taskTotal: 41, taskCompleted: 12, updatedAt: '2026-09-28T10:00:00.000Z' }),
    feature('dsh-forge-m2', { status: 'completed', taskTotal: 53, taskCompleted: 53, updatedAt: '2026-08-01T00:00:00.000Z' }),
  ],
  generatedAt: '2026-09-28T10:00:00.000Z',
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

const taskOf = (key: string, status: TaskStatus) => ({ key, title: `title of ${key}`, status })

const SOURCES = [
  { task: taskOf('dsh-forge-m4/2.1', 'in_progress'), links: [link('s-1', 'dsh-forge-m4/2.1')] },
  { task: taskOf('dsh-forge-m4/2.2', 'in_progress'), links: [] },
  { task: taskOf('dsh-forge-m4/1.1', 'completed'), links: [link('s-2', 'dsh-forge-m4/1.1', 'ended')] },
]

/** Mount the assembled tab in the SEAT form (jsdom: no bridge → build stage). */
function mountOverview(over: Partial<OverviewTabProps> = {}) {
  const openTab = vi.fn()
  const onOpenTask = vi.fn()
  const onEnterSession = vi.fn(() => Promise.resolve())
  const loadFeatureBoard = vi.fn(async (): Promise<FeatureBoardData> => FEATURES_BOARD)
  const props: OverviewTabProps = {
    t,
    activeProject: makeProjectStore(project()),
    seat: {
      proposalsFace: { loadBoard: async () => PROPOSALS_BOARD },
      featureBoardFace: { loadFeatureBoard },
      taskSources: async () => SOURCES,
    },
    onOpenTask,
    onEnterSession,
    useTabInfo: () => ({ tab: { actions: { openTab } } }) as never,
    ...over,
  }
  const view = render(<OverviewTab {...props} />)
  return { view, openTab, onOpenTask, onEnterSession, loadFeatureBoard, props }
}

const query = (view: ReturnType<typeof render>, selector: string): HTMLElement =>
  view.container.querySelector(selector) as HTMLElement

afterEach(cleanup)

// ---------------------------------------------------------------------------
// AC5a — the pure derivation model (概要信息区派生)
// ---------------------------------------------------------------------------

describe('overview-model: the 概要信息区 derivations', () => {
  it('workspaceRootOf: the code root\'s parent (win/posix/drive-root/edge matrix)', () => {
    expect(workspaceRootOf('Z:\\project\\dsh\\dsh-forge')).toBe('Z:\\project\\dsh')
    expect(workspaceRootOf('Z:\\dsh-forge')).toBe('Z:\\')
    expect(workspaceRootOf('/home/user/proj')).toBe('/home/user')
    expect(workspaceRootOf('/proj')).toBe('')
    expect(workspaceRootOf('relative')).toBe('')
    expect(workspaceRootOf('Z:\\project\\dsh\\')).toBe('Z:\\project')
  })

  it('deriveActiveFeature: the LATEST in-progress feature wins; no in-progress falls back to the latest row', () => {
    const rows = [
      feature('a', { status: 'completed', updatedAt: '2026-09-28T00:00:00.000Z' }),
      feature('b', { status: 'in-progress', updatedAt: '2026-09-01T00:00:00.000Z' }),
      feature('c', { status: 'in-progress', updatedAt: '2026-09-02T00:00:00.000Z' }),
    ]
    expect(deriveActiveFeature(rows)?.slug).toBe('c')
    expect(deriveActiveFeature([rows[0]!, feature('d', { status: 'prd', updatedAt: '2026-09-29T00:00:00.000Z' })])?.slug).toBe('d')
    expect(deriveActiveFeature([])).toBeUndefined()
  })

  it('countRunningSessions: DISTINCT active-link sessions, ended links excluded', () => {
    const rows = [
      { task: taskOf('k/1', 'in_progress'), links: [link('s-1', 'k/1'), link('s-2', 'k/1')] },
      { task: taskOf('k/2', 'in_progress'), links: [link('s-1', 'k/2')] },
      { task: taskOf('k/3', 'completed'), links: [link('s-3', 'k/3', 'ended')] },
    ]
    expect(countRunningSessions(rows)).toBe(2)
    expect(countRunningSessions([])).toBe(0)
  })

  it('activeLinkOf: the first active link (新→旧 kernel order)', () => {
    expect(activeLinkOf([link('s-2', 'k', 'ended'), link('s-1', 'k')])?.sessionId).toBe('s-1')
    expect(activeLinkOf([link('s-2', 'k', 'ended')])).toBeUndefined()
    expect(activeLinkOf([])).toBeUndefined()
  })

  it('deriveExecutingTasks: BIZ-workbench-008 exact — in_progress × active link only', () => {
    const executing = deriveExecutingTasks(SOURCES)
    expect(executing.map(row => row.task.key)).toEqual(['dsh-forge-m4/2.1'])
  })
})

// ---------------------------------------------------------------------------
// AC1 — the 标题栏 + 概要信息区
// ---------------------------------------------------------------------------

describe('AC1: OverviewHeader (标题栏 + 概要信息区常显)', () => {
  it('renders the project name over the two path rows with title=全称 (超长省略口径)', () => {
    const view = render(
      <OverviewHeader
        t={t}
        project={project()}
        features={FEATURES_BOARD.features}
        taskSources={SOURCES}
      />,
    )
    expect(query(view, '[data-dsh-forge-overview-title]')?.textContent).toBe('dsh-forge')
    const workspace = query(view, '[data-dsh-forge-overview-workspace]')
    expect(workspace?.getAttribute('title')).toBe('Z:\\project\\dsh')
    expect(workspace?.textContent).toBe('Z:\\project\\dsh')
    const codeRoot = query(view, '[data-dsh-forge-overview-coderoot]')
    expect(codeRoot?.getAttribute('title')).toBe('Z:\\project\\dsh\\dsh-forge')
    expect(codeRoot?.textContent).toBe('Z:\\project\\dsh\\dsh-forge')
  })

  it('the status line: 活跃 feature · 任务 done/total · 运行中 N (derived, · joined)', () => {
    const view = render(
      <OverviewHeader t={t} project={project()} features={FEATURES_BOARD.features} taskSources={SOURCES} />,
    )
    expect(query(view, '[data-dsh-forge-overview-status]')?.textContent).toBe('Active dsh-forge-m4 · Tasks 12/41 · Running 1')
  })

  it('pending members omit their segments (no placeholder flash)', () => {
    const view = render(<OverviewHeader t={t} project={project()} features={undefined} taskSources={undefined} />)
    expect(query(view, '[data-dsh-forge-overview-status]')?.textContent).toBe('')
  })

  it('an archived project swaps the status line for the ⚠ mark beside the title (AC4)', () => {
    const view = render(
      <OverviewHeader t={t} project={project({ archived: true })} features={FEATURES_BOARD.features} taskSources={SOURCES} />,
    )
    expect(query(view, '[data-dsh-forge-overview-archived]')?.textContent).toBe('⚠ Archived')
    expect(query(view, '[data-dsh-forge-overview-status]')?.textContent).toBe('⚠ Archived')
  })
})

// ---------------------------------------------------------------------------
// AC1/AC2/AC3/AC4 — the assembled tab
// ---------------------------------------------------------------------------

describe('OverviewTab: the assembly', () => {
  it('an unresolved pointer renders the resolving skeleton (never an error flash, never a mock project)', () => {
    const view = render(<OverviewTab t={t} />)
    expect(view.container.querySelector('[data-dsh-forge-overview]')?.getAttribute('aria-busy')).toBe('true')
    expect(view.container.textContent).not.toContain('dsh-forge')
  })

  it('the sub-tab strip: THREE tabs, 默认 feature, labels max-width 140 + 溢出横滚 hooks', async () => {
    const { view } = mountOverview()
    await waitFor(() => { expect(query(view, '[data-dsh-forge-overview-subtab="features"]')).toBeTruthy() })
    const strip = query(view, '[data-dsh-forge-overview-subtabs]')
    expect(strip.getAttribute('role')).toBe('tablist')
    expect(strip.style.overflowX).toBe('auto')
    const tabs = Array.from(strip.querySelectorAll('button'))
    expect(tabs.map(tab => tab.textContent)).toEqual(['Proposals', 'Features', 'Tasks'])
    for (const tab of tabs) {
      expect(tab.style.maxWidth).toBe('140px')
      expect(tab.style.textOverflow).toBe('ellipsis')
    }
    expect(query(view, '[data-dsh-forge-overview-subtab="features"]')?.getAttribute('aria-selected')).toBe('true')
    expect(query(view, '[data-dsh-forge-overview-subtab="proposals"]')?.getAttribute('aria-selected')).toBe('false')
    // The 设置 sub-tab is REMOVED (裁决 #16-⑤) — exactly three.
    expect(tabs.length).toBe(3)
  })

  it('sub-tab switching keeps the panes MOUNTED (返回不重拉) and the header unchanged', async () => {
    const { view } = mountOverview()
    await waitFor(() => { expect(query(view, '[data-dsh-forge-overview-feature-dir="dsh-forge-m4"]')).toBeTruthy() })
    const headerBefore = query(view, '[data-dsh-forge-overview-header]').outerHTML
    fireEvent.click(query(view, '[data-dsh-forge-overview-subtab="tasks"]'))
    expect(query(view, '[data-dsh-forge-overview-subtab="tasks"]')?.getAttribute('aria-selected')).toBe('true')
    // The feature pane stays mounted (hidden, not unmounted).
    expect(query(view, '[data-dsh-forge-overview-feature-dir="dsh-forge-m4"]')).toBeTruthy()
    expect(query(view, '[data-dsh-forge-overview-header]').outerHTML).toBe(headerBefore)
  })

  it('the header renders over the seat feeds (title + paths + status)', async () => {
    const { view } = mountOverview()
    await waitFor(() => {
      expect(query(view, '[data-dsh-forge-overview-status]')?.textContent).toBe('Active dsh-forge-m4 · Tasks 12/41 · Running 1')
    })
    expect(query(view, '[data-dsh-forge-overview-title]')?.textContent).toBe('dsh-forge')
  })
})

// ---------------------------------------------------------------------------
// AC2 — the 提案 sub-tab (M3 提案板面零缩水收纳: 目录树 slug 起 + 状态徽标 + 点文档名开文档 tab)
// ---------------------------------------------------------------------------

describe('AC2: the 提案 pane (M3 face, directory-tree form)', () => {
  async function mountProposals() {
    const mounted = mountOverview()
    await waitFor(() => { expect(query(mounted.view, '[data-dsh-forge-overview-feature-dir="dsh-forge-m4"]')).toBeTruthy() })
    fireEvent.click(query(mounted.view, '[data-dsh-forge-overview-subtab="proposals"]'))
    await waitFor(() => { expect(query(mounted.view, '[data-dsh-forge-overview-prop-dir="dsh-forge-m4"]')).toBeTruthy() })
    return mounted
  }

  it('dir rows start at the slug (隐藏 docs/proposals/ 前缀) with the ONE status vocabulary', async () => {
    const { view } = await mountProposals()
    const dir = query(view, '[data-dsh-forge-overview-prop-dir="dsh-forge-m4"]')
    expect(dir.textContent).toContain('dsh-forge-m4/')
    expect(dir.textContent).not.toContain('docs/proposals')
    // 零缩水冒烟: the badge text routes through proposalStatusLabel (the M3
    // face's single vocabulary — no second copy).
    expect(dir.textContent).toContain(proposalStatusLabel('accepted', t))
    expect(query(view, '[data-dsh-forge-overview-prop-dir="dsh-forge-m5"]')?.textContent)
      .toContain(proposalStatusLabel('draft', t))
  })

  it('the FIRST dir rides expanded; 点文档名 opens the DOC tab (proposal + eval, hasEval matrix)', async () => {
    const { view, openTab } = await mountProposals()
    // m4 (first) expanded: proposal + eval rows (hasEval=true).
    const proposalDoc = query(view, '[data-dsh-forge-overview-doc="proposals/dsh-forge-m4/proposal"]')
    const evalDoc = query(view, '[data-dsh-forge-overview-doc="proposals/dsh-forge-m4/eval"]')
    expect(proposalDoc).toBeTruthy()
    expect(evalDoc).toBeTruthy()
    fireEvent.click(proposalDoc)
    expect(openTab).toHaveBeenCalledWith('doc', {
      params: { path: 'docs/proposals/dsh-forge-m4/proposal.md', displayName: 'dsh-forge-m4/proposal' },
    })
    fireEvent.click(evalDoc)
    expect(openTab).toHaveBeenCalledWith('doc', {
      params: { path: 'docs/proposals/dsh-forge-m4/eval', displayName: 'dsh-forge-m4/eval' },
    })
    // m5 (collapsed, hasEval=false): expanding yields the proposal row ONLY.
    fireEvent.click(query(view, '[data-dsh-forge-overview-prop-dir="dsh-forge-m5"]'))
    expect(query(view, '[data-dsh-forge-overview-doc="proposals/dsh-forge-m5/proposal"]')).toBeTruthy()
    expect(query(view, '[data-dsh-forge-overview-doc="proposals/dsh-forge-m5/eval"]')).toBeNull()
  })

  it('the feature chip 互跳 switches to the feature sub-tab AND expands the target dir', async () => {
    const { view } = await mountProposals()
    fireEvent.click(query(view, '[data-dsh-forge-overview-prop-feature="dsh-forge-m4"]'))
    expect(query(view, '[data-dsh-forge-overview-subtab="features"]')?.getAttribute('aria-selected')).toBe('true')
    await waitFor(() => {
      expect(query(view, '[data-dsh-forge-overview-doc="features/dsh-forge-m4/prd"]')).toBeTruthy()
    })
  })
})

// ---------------------------------------------------------------------------
// AC2 — the feature sub-tab (M3 feature 浏览面零缩水: 目录树 + in-progress N/N)
// ---------------------------------------------------------------------------

describe('AC2: the feature pane (M3 face, directory-tree form)', () => {
  it('dir rows carry the manifest status VERBATIM + the DTO counters; the first rides expanded', async () => {
    const { view } = mountOverview()
    await waitFor(() => { expect(query(view, '[data-dsh-forge-overview-feature-status="dsh-forge-m4"]')).toBeTruthy() })
    const status = query(view, '[data-dsh-forge-overview-feature-status="dsh-forge-m4"]')
    // 词表直透 (the M3 vocabulary): 'in-progress' intact + the DTO counters
    // through the M3 features.progress template.
    expect(status.textContent).toBe('in-progress 12/41 tasks')
    expect(status.textContent).toContain(featureStatusLabel('in-progress', t))
    expect(query(view, '[data-dsh-forge-overview-feature-dir="dsh-forge-m2"]')?.getAttribute('aria-expanded'))
      .toBe('false')
  })

  it('点文档名 opens the DOC tab in CANONICAL doc-kind order (existing kinds only)', async () => {
    const { view, openTab } = mountOverview()
    await waitFor(() => { expect(query(view, '[data-dsh-forge-overview-doc="features/dsh-forge-m4/manifest"]')).toBeTruthy() })
    const docs = Array.from(view.container.querySelectorAll('[data-dsh-forge-overview-doc^="features/dsh-forge-m4/"]'))
    expect(docs.map(doc => doc.getAttribute('data-dsh-forge-overview-doc')))
      .toEqual(['features/dsh-forge-m4/manifest', 'features/dsh-forge-m4/prd', 'features/dsh-forge-m4/ui'])
    fireEvent.click(query(view, '[data-dsh-forge-overview-doc="features/dsh-forge-m4/prd"]'))
    expect(openTab).toHaveBeenCalledWith('doc', {
      params: { path: 'docs/features/dsh-forge-m4/prd', displayName: 'dsh-forge-m4/prd' },
    })
  })

  it('a failed board read shows the M3 error card and retry re-fires the shared read', async () => {
    let calls = 0
    const failing = vi.fn(async (): Promise<FeatureBoardData> => {
      calls += 1
      if (calls === 1) throw new Error(JSON.stringify({ code: 'ERR_WORKBENCH_DB', message: 'mock' }))
      return FEATURES_BOARD
    })
    const { view } = mountOverview({ seat: { featureBoardFace: { loadFeatureBoard: failing } } })
    await waitFor(() => { expect(query(view, '[data-dsh-forge-overview-features-error]')).toBeTruthy() })
    fireEvent.click(query(view, '[data-dsh-forge-overview-features-retry]'))
    await waitFor(() => { expect(query(view, '[data-dsh-forge-overview-feature-dir="dsh-forge-m4"]')).toBeTruthy() })
    expect(calls).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// AC3 — the 任务 sub-tab (执行中分组 + 全量列表 + ⟞ 直达会话 + 唯一 [依赖图])
// ---------------------------------------------------------------------------

describe('AC3: the 任务 pane', () => {
  async function mountTasks() {
    const mounted = mountOverview()
    await waitFor(() => { expect(query(mounted.view, '[data-dsh-forge-overview-feature-dir="dsh-forge-m4"]')).toBeTruthy() })
    fireEvent.click(query(mounted.view, '[data-dsh-forge-overview-subtab="tasks"]'))
    await waitFor(() => { expect(query(mounted.view, '[data-dsh-forge-overview-task="dsh-forge-m4/2.1"]')).toBeTruthy() })
    return mounted
  }

  it('执行中分组: the BIZ-workbench-008 rows with the ⟞ 直达会话 entry (Interface 6 seam)', async () => {
    const { view, onEnterSession } = await mountTasks()
    const executing = query(view, '[data-dsh-forge-overview-task-exec="dsh-forge-m4/2.1"]')
    expect(executing).toBeTruthy()
    expect(view.container.textContent).toContain('Executing (1)')
    // The unlinked in_progress task stays OUT of the 执行中 group…
    expect(query(view, '[data-dsh-forge-overview-task-exec="dsh-forge-m4/2.2"]')).toBeNull()
    // …but rides the 全量列表.
    expect(query(view, '[data-dsh-forge-overview-task="dsh-forge-m4/2.2"]')).toBeTruthy()
    fireEvent.click(query(view, '[data-dsh-forge-overview-goto-session="s-1"]'))
    expect(onEnterSession).toHaveBeenCalledWith('s-1')
  })

  it('行点击开任务详情 dock (the onOpenTask seam) + the M3 short-status vocabulary', async () => {
    const { view, onOpenTask } = await mountTasks()
    const row = query(view, '[data-dsh-forge-overview-task="dsh-forge-m4/1.1"]')
    expect(row.textContent).toContain(taskStatusShortLabel('completed', t))
    fireEvent.click(row)
    expect(onOpenTask).toHaveBeenCalledWith('dsh-forge-m4/1.1')
    // Keyboard activation is the row's whole surface (Enter / Space — the
    // ProposalList div-row contract).
    fireEvent.keyDown(row, { key: 'Enter' })
    fireEvent.keyDown(query(view, '[data-dsh-forge-overview-task="dsh-forge-m4/2.2"]'), { key: ' ' })
    expect(onOpenTask).toHaveBeenCalledTimes(3)
  })

  it('the 唯一 [依赖图] button opens the depgraph tab kind', async () => {
    const { view, openTab } = await mountTasks()
    const buttons = view.container.querySelectorAll('[data-dsh-forge-overview-depgraph-open]')
    expect(buttons.length).toBe(1)
    fireEvent.click(buttons[0] as HTMLElement)
    expect(openTab).toHaveBeenCalledWith('depgraph')
  })

  it('the header qualifier rides the derived 活跃 feature slug', async () => {
    const { view } = await mountTasks()
    expect(query(view, '[data-dsh-forge-overview-tasks-title]')?.textContent).toBe('All tasks · dsh-forge-m4')
  })

  it('an in-flight sources read renders the 执行中/全量 skeletons (never an error flash)', async () => {
    const { view } = mountOverview({
      seat: {
        proposalsFace: { loadBoard: async () => PROPOSALS_BOARD },
        featureBoardFace: { loadFeatureBoard: async () => FEATURES_BOARD },
        taskSources: () => new Promise<never>(() => {}),
      },
    })
    await waitFor(() => { expect(query(view, '[data-dsh-forge-overview-feature-dir="dsh-forge-m4"]')).toBeTruthy() })
    fireEvent.click(query(view, '[data-dsh-forge-overview-subtab="tasks"]'))
    const skeletons = view.container.querySelectorAll('[data-dsh-forge-overview-tasks-skeleton]')
    expect(skeletons.length).toBe(2)
    expect(query(view, '[data-dsh-forge-overview-task="dsh-forge-m4/2.1"]')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// AC4 — 归档只读
// ---------------------------------------------------------------------------

describe('AC4: 归档项目概览转只读', () => {
  it('the ⚠ mark in the header and the 执行中 group HIDDEN in the tasks pane', async () => {
    const { view, onEnterSession } = mountOverview({ activeProject: makeProjectStore(project({ archived: true })) })
    await waitFor(() => { expect(query(view, '[data-dsh-forge-overview-archived]')).toBeTruthy() })
    fireEvent.click(query(view, '[data-dsh-forge-overview-subtab="tasks"]'))
    await waitFor(() => { expect(query(view, '[data-dsh-forge-overview-task="dsh-forge-m4/2.1"]')).toBeTruthy() })
    expect(view.container.textContent).not.toContain('Executing')
    expect(query(view, '[data-dsh-forge-overview-task-exec="dsh-forge-m4/2.1"]')).toBeNull()
    expect(query(view, '[data-dsh-forge-overview-goto-session="s-1"]')).toBeNull()
    expect(onEnterSession).not.toHaveBeenCalled()
    // The 全量列表 stays (归档不丢历史 — read-only, not empty).
    expect(query(view, '[data-dsh-forge-overview-task="dsh-forge-m4/2.2"]')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// AC5b — the M3 face zero-loss smoke in the new host
// ---------------------------------------------------------------------------

describe('AC5: M3 face zero-loss smoke (the vocabularies ride the M3 single sources)', () => {
  it('the panes render the M3 vocabularies verbatim (proposal/feature/task status single copies)', async () => {
    const { view } = mountOverview()
    await waitFor(() => { expect(query(view, '[data-dsh-forge-overview-feature-dir="dsh-forge-m4"]')).toBeTruthy() })
    // feature: the manifest token verbatim (hyphen intact).
    expect(query(view, '[data-dsh-forge-overview-feature-status="dsh-forge-m4"]')?.textContent)
      .toContain(featureStatusLabel('in-progress', t))
    fireEvent.click(query(view, '[data-dsh-forge-overview-subtab="tasks"]'))
    await waitFor(() => { expect(query(view, '[data-dsh-forge-overview-task="dsh-forge-m4/1.1"]')).toBeTruthy() })
    expect(query(view, '[data-dsh-forge-overview-task="dsh-forge-m4/1.1"]')?.textContent)
      .toContain(taskStatusShortLabel('completed', t))
    fireEvent.click(query(view, '[data-dsh-forge-overview-subtab="proposals"]'))
    await waitFor(() => { expect(query(view, '[data-dsh-forge-overview-prop-dir="dsh-forge-m4"]')).toBeTruthy() })
    expect(query(view, '[data-dsh-forge-overview-prop-dir="dsh-forge-m4"]')?.textContent)
      .toContain(proposalStatusLabel('accepted', t))
  })
})
