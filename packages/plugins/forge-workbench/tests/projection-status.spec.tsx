// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  FeatureBoardData, ProjectionState, Project, ProjectionStatusRow as ProjectionStatusRowDto, WorkbenchState,
} from '../src/client/ipc-types.ts'
import type { WorkbenchIpcBridge } from '../src/client/ipc/workbench.ts'
import type { ActiveProjectSnapshot, ActiveProjectStore } from '../src/client/store/active-project.ts'
import { DeviationList } from '../src/client/components/projection/DeviationList.tsx'
import {
  PROJECTION_DOT_STATE, PROJECTION_STATUS_TEXT_KEYS, ProjectionStatusRow,
} from '../src/client/components/projection/ProjectionStatusRow.tsx'
import { OverviewTab } from '../src/client/views/rightbar/OverviewTab.tsx'
import type { OverviewTabProps } from '../src/client/views/rightbar/OverviewTab.tsx'
import { zh } from '../src/client/locale/zh.ts'
import type { WorkbenchKey } from '../src/client/locale/en.ts'

// M4 task 3.5 — C8 归宿①: the 概览 projection status row (ui-design C8
// 投影状态行, mounted into 2.3's OverviewHeader). AC map:
//   AC1 三态 — healthy 成功色「与 dsh 侧一致」/ degraded 警示 + [重试投影]
//      (成功 toast / 保留降级态) / deviation 警示 + [偏差明细 N] 折叠
//      (类型 Pill 改名/删除/乱序 + 条目名 + 处理建议只读文字)
//   Hard Rule BIZ-006 — the deviation list carries ZERO write affordances
//      (偏差仅提示, 任何入口不得触发反向写)
//   Hard Rule BIZ-005 — [重试投影] is the ONLY projection retry action, and
//      it exists ONLY on the degraded row (healthy/deviation/pending never
//      render one)
//   AC5 事件驱动刷新 — projection_updated → the row re-reads immediately
//      (bridge-live form over the shared single-subscriber channel)

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  StateDot: (props: { state: string }) => <span data-mock-state-dot={props.state} />,
}))

const t = (key: WorkbenchKey): string => zh[key]

afterEach(() => {
  cleanup()
  delete (globalThis as { dshForge?: unknown }).dshForge
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const statusRow = (over: Partial<ProjectionStatusRowDto> = {}): ProjectionStatusRowDto => ({
  projectId: 'p1',
  displayName: 'dsh-forge',
  path: 'Z:\\project\\dsh\\dsh-forge',
  orderIdx: 0,
  archived: false,
  state: 'healthy',
  workspaceId: 'ws-1',
  pushedAt: '2026-09-29T08:00:00.000Z',
  lastError: null,
  deviations: [],
  ...over,
})

/** A hand-rolled active-project store (the rightbar-overview.spec twin). */
function makeProjectStore(projects: ProjectionStatusRow[] | Array<{ id: string }>, activeId: string | null) {
  let snapshot = { phase: 'ready', projects, activeProjectId: activeId } as unknown as ActiveProjectSnapshot
  const listeners = new Set<() => void>()
  return {
    subscribe: (fn: () => void): (() => void) => {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    },
    getSnapshot: (): ActiveProjectSnapshot => snapshot,
  } as unknown as ActiveProjectStore
}

const FEATURES_BOARD: FeatureBoardData = {
  features: [],
  generatedAt: '2026-09-29T08:00:00.000Z',
}

/** The minimal full-surface bridge fake (the task-board-assembly twin). */
function baseBridge(overrides: Partial<WorkbenchIpcBridge> = {}): WorkbenchIpcBridge {
  return {
    getState: async () => ({}) as WorkbenchState,
    registerProject: async () => ({}) as never,
    updateProject: async () => ({}) as never,
    removeProject: async () => undefined,
    activateProject: async () => undefined,
    getTaskBoard: async () => ({}) as never,
    getTaskDetail: async () => ({}) as never,
    getFeatureBoard: async () => FEATURES_BOARD,
    readFeatureDoc: async () => ({}) as never,
    listPlugins: async () => [],
    setPluginEnabled: async () => [],
    recordSessionLink: async () => ({}) as never,
    endSessionLink: async () => undefined,
    authorizeExternalDocPath: async () => undefined,
    getMigrationStatus: async () => ({ authority: 'files', deviated: false, migratedAt: null, lastEvent: null, indexJsonDetected: false }),
    startMigration: async () => ({ started: true }),
    probeCodeRoot: async () => ({ available: true, taskTotal: 0, featureTotal: 0, indexJsonDetected: false }),
    getWorkbenchPaths: async () => ({ docsRoot: 'Z:/userData/workbench/docs', backupsRoot: 'Z:/userData/workbench/backups' }),
    taskAdd: async () => ({}) as never,
    taskClaim: async () => ({}) as never,
    taskTransition: async () => ({}) as never,
    taskSubmit: async () => ({}) as never,
    taskReopen: async () => ({}) as never,
    taskGet: async () => ({}) as never,
    taskQuery: async () => [],
    knowledgeFact: async () => ({}) as never,
    knowledgeLesson: async () => ({}) as never,
    knowledgeResearch: async () => ({}) as never,
    knowledgeForensic: async () => ({}) as never,
    featureList: async () => [],
    featureStatus: async () => ({}) as never,
    getPrefs: async () => [],
    setPrefs: async () => undefined,
    clearPrefOverride: async () => undefined,
    receiveApproval: async () => ({}) as never,
    decideApproval: async () => ({}) as never,
    notifySessionStarted: async () => ({}) as never,
    notifyLaunchFailed: async () => ({}) as never,
    checkStageArtifacts: async () => ({}) as never,
    dispatchTasks: async () => ({ dispatched: [] }),
    redispatch: async () => ({ dispatched: [] }),
    getDispatches: async () => [],
    listApprovals: async () => [],
    advanceStage: async () => ({}) as never,
    stageSummarize: async () => ({}) as never,
    getStageGate: async () => ({}) as never,
    listStageAssets: async () => [],
    getProposalBoard: async () => ({ proposals: [], generatedAt: '', proposalsRoot: 'Z:/docs/proposals' }),
    readProposalDoc: async () => ({ kind: 'proposal', markdown: '' }),
    probeProjectPath: async () => ({}) as never,
    renameProject: async () => ({}) as never,
    archiveProject: async () => ({}) as never,
    restoreProject: async () => ({}) as never,
    listProjects: async () => [],
    retryProjection: async () => ({ state: 'pending' }),
    getProjectionStatus: async () => [],
    submitWorkspaceSnapshot: async () => undefined,
    reportProjectionOutcome: async () => undefined,
    // M4 v3 ui-state 段(任务 4.1;presence check 全员可调;值面 4.5 前无消费)。
    getProjectUiState: async () => ({
      layout: {
        version: 1, sidebar: { collapsed: false },
        tree: { expandedProjects: [], expandedSessions: [], overflowOpen: [] },
        rightbar: { panes: [] }, detached: [],
      },
    }),
    setProjectUiState: async () => undefined,
    onEvents: () => () => {},
    ...overrides,
  } as WorkbenchIpcBridge
}

const project = (over: Partial<Project> = {}): Project => ({
  id: 'p1',
  displayName: 'dsh-forge',
  codeRoot: 'Z:\project\dsh\dsh-forge',
  docLocationType: 'in_repo',
  docLocationPath: null,
  createdAt: '2026-09-20T08:00:00.000Z',
  lastActivatedAt: null,
  archived: false,
  sortOrder: 0,
  projectionState: 'pending',
  docsPlacement: 'repo-existing',
  ...over,
})

// ---------------------------------------------------------------------------
// AC1 — the pure row: three states + the deviation fold
// ---------------------------------------------------------------------------

describe('ProjectionStatusRow: the three states (AC1)', () => {
  it('healthy — success dot + 「与 dsh 侧一致」; NO retry, NO deviation affordance (唯一重试纪律)', () => {
    const view = render(<ProjectionStatusRow t={t} status={statusRow({ state: 'healthy' })} />)
    expect(view.container.querySelector('[data-mock-state-dot="done"]')).not.toBeNull()
    expect(view.container.textContent).toContain('与 dsh 侧一致')
    expect(view.container.querySelector('[data-dsh-forge-projection-retry]')).toBeNull()
    expect(view.container.querySelector('[data-dsh-forge-projection-details]')).toBeNull()
  })

  it('pending — idle dot + 待对账; no actions', () => {
    const view = render(<ProjectionStatusRow t={t} status={statusRow({ state: 'pending' })} />)
    expect(view.container.querySelector('[data-mock-state-dot="idle"]')).not.toBeNull()
    expect(view.container.textContent).toContain('待对账')
    expect(view.container.querySelector('button')).toBeNull()
  })

  it('degraded — warn dot + [重试投影]; the click fires onRetry (the ONLY retry action, BIZ-005)', () => {
    const onRetry = vi.fn()
    const view = render(
      <ProjectionStatusRow t={t} status={statusRow({ state: 'degraded', lastError: 'ERR_PROJECTION_CHANNEL_UNAVAILABLE' })} onRetry={onRetry} />,
    )
    expect(view.container.querySelector('[data-mock-state-dot="warning"]')).not.toBeNull()
    const retry = view.container.querySelector('[data-dsh-forge-projection-retry]') as HTMLElement
    expect(retry).not.toBeNull()
    expect(retry.textContent).toBe('重试投影')
    fireEvent.click(retry)
    expect(onRetry).toHaveBeenCalledTimes(1)
    // Degraded rows never carry the deviation fold (single-valued state machine).
    expect(view.container.querySelector('[data-dsh-forge-projection-details]')).toBeNull()
  })

  it('deviation — warn dot + [偏差明细 N] toggles the fold; the retry button NEVER appears (BIZ-006 偏差仅提示)', () => {
    const onRetry = vi.fn()
    const view = render(
      <ProjectionStatusRow
        t={t}
        status={statusRow({
          state: 'deviation',
          deviations: [
            { type: 'renamed', detail: "title drift: pushed 'old' vs dsh 'new'" },
            { type: 'deleted', detail: 'workspace gone: ws-1 no longer reported' },
            { type: 'reordered', detail: 'order drift: expected [a, b] vs dsh [b, a]' },
          ],
        })}
        onRetry={onRetry}
      />,
    )
    expect(view.container.querySelector('[data-mock-state-dot="warning"]')).not.toBeNull()
    expect(view.container.querySelector('[data-dsh-forge-projection-retry]')).toBeNull()
    // Folded by default.
    expect(view.container.querySelector('[data-dsh-forge-projection-deviations]')).toBeNull()
    const toggle = view.container.querySelector('[data-dsh-forge-projection-details]') as HTMLElement
    expect(toggle.textContent).toBe('偏差明细 3')
    fireEvent.click(toggle)
    const list = view.container.querySelector('[data-dsh-forge-projection-deviations]')!
    expect(list).not.toBeNull()
    // Type pills carry the three-class vocabulary.
    const pills = Array.from(list.querySelectorAll('[data-dsh-forge-deviation-pill]')).map(el => el.textContent)
    expect(pills).toEqual(['改名', '删除', '乱序'])
    // Entry names (the kernel detail) render verbatim.
    expect(list.textContent).toContain("title drift: pushed 'old' vs dsh 'new'")
    // The read-only advice lines — one per class (处理建议, 无反向写入口).
    expect(list.textContent).toContain('下次对账按 dsh 侧新名重建索引')
    expect(list.textContent).toContain('快照重建后不再呈现该条目')
    expect(list.textContent).toContain('按 dsh 侧实际顺序重排')
    // BIZ-006 Hard Rule: the fold carries ZERO buttons/links (no reverse write).
    expect(list.querySelectorAll('button')).toHaveLength(0)
    expect(list.querySelectorAll('a')).toHaveLength(0)
    // Toggle again collapses.
    fireEvent.click(toggle)
    expect(view.container.querySelector('[data-dsh-forge-projection-deviations]')).toBeNull()
  })

  it('the state→visual/label tables cover the state machine (the exported mapping surface)', () => {
    expect(PROJECTION_DOT_STATE).toEqual({
      pending: 'idle', healthy: 'done', degraded: 'warning', deviation: 'warning',
    })
    expect(PROJECTION_STATUS_TEXT_KEYS.healthy).toBe('rightbar.overview.projection.healthy')
    expect(PROJECTION_STATUS_TEXT_KEYS.degraded).toBe('rightbar.overview.projection.degraded')
    expect(PROJECTION_STATUS_TEXT_KEYS.deviation).toBe('rightbar.overview.projection.deviation')
    expect(PROJECTION_STATUS_TEXT_KEYS.pending).toBe('rightbar.overview.projection.pending')
  })
})

describe('DeviationList: read-only presentation (AC1 / BIZ-006)', () => {
  it('an empty list renders nothing; the advice label pairs every row class', () => {
    const empty = render(<DeviationList t={t} deviations={[]} />)
    expect(empty.container.textContent).toBe('')
    const view = render(
      <DeviationList t={t} deviations={[{ type: 'renamed', detail: 'drift x' }]} />,
    )
    expect(view.container.textContent).toContain('处理建议')
    expect(view.container.textContent).toContain('下次对账按 dsh 侧新名重建索引')
    expect(view.container.querySelector('button')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// AC1/AC5 — the assembled OverviewTab (seat + bridge-live forms)
// ---------------------------------------------------------------------------

describe('OverviewTab integration: the status row mount + retry leg (AC1)', () => {
  it('the row rides the header below the 状态 line; retry success → healthy + toast; still-degraded keeps the row (保留降级态)', async () => {
    let current: ProjectionStatusRowDto = statusRow({ state: 'degraded', lastError: 'ERR_PROJECTION_OP_FAILED' })
    const retry = vi.fn(async (): Promise<{ state: ProjectionState }> => {
      current = statusRow({ state: 'healthy' })
      return { state: 'healthy' }
    })
    const view = render(
      <OverviewTab
        t={t}
        activeProject={makeProjectStore([project()], 'p1')}
        seat={{
          proposalsFace: { loadBoard: async () => ({ proposals: [], generatedAt: '', proposalsRoot: 'Z:/p' }) },
          featureBoardFace: { loadFeatureBoard: async () => FEATURES_BOARD },
          projectionStatus: async () => current,
          retryProjection: retry,
        }}
        useTabInfo={() => ({ tab: { actions: { openTab: vi.fn() } } }) as never}
      />,
    )
    await waitFor(() => {
      expect(view.container.querySelector('[data-dsh-forge-projection-status]')?.textContent).toContain('投影同步降级')
    })
    fireEvent.click(view.container.querySelector('[data-dsh-forge-projection-retry]')!)
    expect(retry).toHaveBeenCalledWith({ projectId: 'p1' })
    await waitFor(() => {
      // Success toast + the row flips to the healthy copy.
      expect(view.container.querySelector('[data-dsh-forge-overview-toast]')?.textContent).toContain('投影已恢复一致')
      expect(view.container.querySelector('[data-dsh-forge-projection-status]')?.textContent).toContain('与 dsh 侧一致')
    })
  })

  it('a retry that stays degraded keeps the degraded row and posts NO success toast', async () => {
    const current = statusRow({ state: 'degraded' })
    const view = render(
      <OverviewTab
        t={t}
        activeProject={makeProjectStore([project()], 'p1')}
        seat={{
          proposalsFace: { loadBoard: async () => ({ proposals: [], generatedAt: '', proposalsRoot: 'Z:/p' }) },
          featureBoardFace: { loadFeatureBoard: async () => FEATURES_BOARD },
          projectionStatus: async () => current,
          retryProjection: async () => ({ state: 'degraded' }),
        }}
        useTabInfo={() => ({ tab: { actions: { openTab: vi.fn() } } }) as never}
      />,
    )
    await waitFor(() => {
      expect(view.container.querySelector('[data-dsh-forge-projection-status]')?.textContent).toContain('投影同步降级')
    })
    fireEvent.click(view.container.querySelector('[data-dsh-forge-projection-retry]')!)
    await waitFor(() => { expect(view.container.querySelector('[data-dsh-forge-projection-retrying]')).toBeNull() })
    expect(view.container.querySelector('[data-dsh-forge-overview-toast]')).toBeNull()
    expect(view.container.querySelector('[data-dsh-forge-projection-status]')?.textContent).toContain('投影同步降级')
    expect(view.container.querySelector('[data-dsh-forge-projection-retry]')).not.toBeNull()
  })

  it('an archived project renders NO projection row (概览转只读; the ⚠ 已归档 line carries the state)', async () => {
    const view = render(
      <OverviewTab
        t={t}
        activeProject={makeProjectStore([project({ archived: true })], 'p1')}
        seat={{
          proposalsFace: { loadBoard: async () => ({ proposals: [], generatedAt: '', proposalsRoot: 'Z:/p' }) },
          featureBoardFace: { loadFeatureBoard: async () => FEATURES_BOARD },
          projectionStatus: async () => statusRow({ archived: true }),
        }}
        useTabInfo={() => ({ tab: { actions: { openTab: vi.fn() } } }) as never}
      />,
    )
    await waitFor(() => {
      expect(view.container.querySelector('[data-dsh-forge-overview-archived]')).not.toBeNull()
    })
    expect(view.container.querySelector('[data-dsh-forge-projection-status]')).toBeNull()
  })
})

describe('OverviewTab bridge-live: projection_updated drives the immediate re-read (AC5, BIZ-005 失效-重建)', () => {
  it('a projection_updated push re-fires getProjectionStatus and the row text flips', async () => {
    let pushed: ((events: ReadonlyArray<{ type: string; projectId?: string }>) => void) | undefined
    let state: ProjectionState = 'degraded'
    const statusReads = vi.fn(async (): Promise<ProjectionStatusRowDto[]> => [statusRow({ state })])
    const bridge = baseBridge({
      getProjectionStatus: statusReads,
      retryProjection: async () => ({ state: 'pending' }),
      onEvents: (dispatch: (events: ReadonlyArray<{ type: string; projectId?: string }>) => void) => {
        pushed = dispatch
        return () => { pushed = undefined }
      },
    })
    ;(globalThis as { dshForge?: { workbench?: unknown } }).dshForge = { workbench: bridge }
    const props: OverviewTabProps = {
      t,
      activeProject: makeProjectStore([project()], 'p1'),
      useTabInfo: () => ({ tab: { actions: { openTab: vi.fn() } } }) as never,
    }
    const view = render(<OverviewTab {...props} />)
    await waitFor(() => {
      expect(view.container.querySelector('[data-dsh-forge-projection-status]')?.textContent).toContain('投影同步降级')
    })
    const readsBefore = statusReads.mock.calls.length
    state = 'healthy'
    pushed?.([{ type: 'projection_updated', projectId: 'p1', state: 'healthy' }])
    await waitFor(() => {
      expect(view.container.querySelector('[data-dsh-forge-projection-status]')?.textContent).toContain('与 dsh 侧一致')
    })
    expect(statusReads.mock.calls.length).toBeGreaterThan(readsBefore)
  })
})
