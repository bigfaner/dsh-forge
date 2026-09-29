/**
 * The 「项目概览」tab BODY (M4 task 2.3, layout §4.3/§4.4 + tech-design
 * §Integration #5 / 交付线 1): 标题栏 + 概要信息区 (OverviewHeader — project
 * name 随联动切换, paths 超长省略 + title 全称, 活跃 feature · 任务 done/total ·
 * 运行中 N, archived ⚠) over the THREE sub-tabs (提案/feature/任务 — 默认
 * feature, §4.3; the 设置 sub-tab was REMOVED, 裁决 #16-⑤) whose panes re-home
 * the M3 faces zero-loss as the directory trees / task list the wireframe
 * pins (§4.4①②③ — see the pane modules).
 *
 * Data (Implementation Notes): the v3 project rows through the plugin's
 * active-project store (listProjects 1.3 client half) + the EXISTING
 * feature_snapshot/task verbs — the feature board ONE read shared by the
 * header (活跃 feature · done/total) and the feature pane, the task sources
 * ONE read shared by the header (运行中 N) and the tasks pane (the C6
 * metadata source twin — one bridge-side builder feeds both faces). 管线入口
 * (M7) is out of M4 scope — no entry is rendered.
 *
 * Form selection (the TasksView/ProposalsPage one-rule): seat present or
 * bridge ABSENT (jsdom / hostless) → the build-stage form over the injected
 * seat / mock twins; bridge live → the real IPC chain below, keyed on the
 * ACTIVE project (a project switch is a NEW mount — the host re-keys, the
 * BoardTabBody precedent). Sub-tab switches NEVER remount the panes (the
 * M3 返回不重拉 discipline: all three stay mounted, the inactive ones
 * hidden), so the 概要信息区 stays live across switches by construction.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { UseSidebarRightTabInfo } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { FeatureBoardData, ProjectionState, ProjectionStatusRow } from '../../ipc-types'
import type { FeatureBoardFace, ProposalFace } from '../../contract'
import type { WorkbenchKey } from '../../locale/en'
import { getWorkbenchIpcBridge, createIpcFeatureBoardFace, createIpcProposalFace } from '../../ipc/workbench'
import type { WorkbenchIpcBridge } from '../../ipc/workbench'
import { getWorkbenchEventSource } from '../../ipc/workbench-events'
import { createMockFeatureBoardFace, createMockProposalsFace } from '../../mocks/workbench'
import { INITIAL_ACTIVE_PROJECT_SNAPSHOT } from '../../store/active-project'
import type { ActiveProjectStore } from '../../store/active-project'
import type { EnterSessionSeam } from '../tasks/detail/LinkHistory'
import type { TabKindTranslate } from './tab-kinds'
import { OverviewHeader } from './OverviewHeader'
import { ProposalsPane } from './subtabs/ProposalsPane'
import { FeaturesPane } from './subtabs/FeaturesPane'
import { TasksPane } from './subtabs/TasksPane'
import { deriveActiveFeature, type OverviewTaskSource } from './overview-model'

/** The three sub-tabs (§4.3 — 设置已移除, 裁决 #16-⑤). */
export type OverviewSubtab = 'proposals' | 'features' | 'tasks'

const SUBTABS: readonly OverviewSubtab[] = ['proposals', 'features', 'tasks']

/** One 点文档名开文档 tab open (§4.5): the doc kind's identity, 2.4's seam. */
export interface DocOpenInput {
  /** The document's project-relative path (the read verb's argument form). */
  readonly path: string
  /** The tab-name form `slug/产物名称` (title = 全路径口径). */
  readonly displayName: string
}

/** The test/build-stage injection seat (the M3 page-seat discipline). */
export interface OverviewTabSeat {
  /** The proposals face override (absent members fall back to the mock twin). */
  readonly proposalsFace?: Partial<ProposalFace> | undefined
  /** The feature-board face override (absent members fall back to the mock twin). */
  readonly featureBoardFace?: Partial<FeatureBoardFace> | undefined
  /** The task-sources read override (the C6 source twin). */
  readonly taskSources?: (() => Promise<readonly OverviewTaskSource[] | undefined>) | undefined
  /** The projection status read override (C8 归宿①; absent = the row stays away). */
  readonly projectionStatus?: (() => Promise<ProjectionStatusRow | undefined>) | undefined
  /** The [重试投影] seam override (the retryProjection verb twin). */
  readonly retryProjection?: ((input: { projectId: string }) => Promise<{ state: ProjectionState }>) | undefined
}

/** Inputs of {@link OverviewTab} (the legs the container threads; all optional
 * so the bare hostless render degrades to the resolving skeleton). */
export interface OverviewTabProps {
  /** The locale seat (the plugin's bound `t`). */
  readonly t: TabKindTranslate
  /** The plugin-lifetime active-project store — the tab's ONLY project source. */
  readonly activeProject?: ActiveProjectStore | undefined
  /** The row-click → 任务详情 dock seam (the C6 查看任务 shape, wired 2.3). */
  readonly onOpenTask?: ((taskKey: string) => void) | undefined
  /** The ⟞ 直达会话 seam (Interface 6, 2.7's openSessionTarget). */
  readonly onEnterSession?: EnterSessionSeam | undefined
  /**
   * The task-sources read (real chain — one bridge-side builder shared with
   * the C6 metadata bar; absent = the 运行中 segment and the tasks pane's
   * rows degrade silently, never a mock).
   */
  readonly readTaskSources?: (() => Promise<readonly OverviewTaskSource[] | undefined>) | undefined
  /** The test/build-stage seat — present wins over the bridge (one rule). */
  readonly seat?: OverviewTabSeat | undefined
  /** The slot runtime's tab-info hook (the openTab seam's carrier). */
  readonly useTabInfo?: UseSidebarRightTabInfo | undefined
  /**
   * The 点文档名 → 文档 tab open seam (M4 2.4): present wins over the built-in
   * openTab route — the container wires the dedupe-aware focus-or-open here
   * (AC1 重复打开激活既有). Absent = the built-in route (the 2.3 form).
   */
  readonly openDocTab?: ((input: DocOpenInput) => void) | undefined
}

/** The tab's column. */
const rootStyle = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  minWidth: 0,
} as const

/** The sub-tab strip: 标签 max-width 140 省略 + 溢出横滚 (§4.3, AC4). */
const SUBTAB_LABEL_MAX_WIDTH = '140px'
const subtabStripStyle = {
  display: 'flex',
  gap: '4px',
  minWidth: 0,
  overflowX: 'auto',
  padding: '8px 12px 0',
} as const

/** One sub-tab chip: bare text when inactive, filled pill when active. */
const subtabStyle = {
  background: 'transparent',
  border: 'none',
  borderRadius: '8px',
  color: 'inherit',
  cursor: 'pointer',
  flex: '0 1 auto',
  font: 'inherit',
  fontSize: '13px',
  lineHeight: '20px',
  maxWidth: SUBTAB_LABEL_MAX_WIDTH,
  minWidth: 0,
  overflow: 'hidden',
  padding: '4px 10px',
  textAlign: 'left',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

const subtabActiveStyle = {
  ...subtabStyle,
  background: 'var(--dsh-interactive-bg-hover, rgba(128, 128, 128, 0.2))',
  fontWeight: 500,
} as const

/** The sub-tab content scroller (the panes stay MOUNTED; hidden ≠ unmounted). */
const bodyStyle = {
  flex: '1 1 auto',
  minWidth: 0,
  overflowY: 'auto',
  paddingTop: '2px',
} as const

/** Skeleton gray rows (the family's resolving 态 twin). */
const skeletonRowStyle = {
  background: 'var(--dsh-interactive-bg-hover, rgba(128, 128, 128, 0.2))',
  borderRadius: '8px',
  height: '28px',
} as const

/** The retry-feedback toast (the seat-toast geometry, z1100 under dialogs). */
const toastStyle = {
  background: 'var(--dsh-bg, Canvas)',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '14px',
  bottom: '16px',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
  left: '16px',
  maxWidth: '300px',
  padding: '10px 12px',
  position: 'fixed',
  zIndex: 1100,
} as const

const SUBTAB_LABEL_KEYS: Record<OverviewSubtab, WorkbenchKey> = {
  proposals: 'rightbar.overview.subtab.proposals',
  features: 'rightbar.overview.subtab.features',
  tasks: 'rightbar.overview.subtab.tasks',
}

/** The noop subscription every optional store falls back to (never a throw). */
const NOOP_SUBSCRIBE = (): (() => void) => () => {}

/**
 * The 项目概览 tab body. The whole face follows the ACTIVE project; an
 * unresolved pointer (boot read in flight, or a hostless mount with no
 * store) renders the resolving skeleton — the page OWNS its loading branch,
 * never an error flash, never a silent mock project.
 */
export function OverviewTab(props: OverviewTabProps): ReactNode {
  const { t } = props
  // §4.3: 默认 feature sub-tab.
  const [subtab, setSubtab] = useState<OverviewSubtab>('features')
  // The 提案 pane's feature 互跳: switch to the feature sub-tab AND expand
  // the target dir (the M3 badge-jump's pane form).
  const [featuresFocus, setFeaturesFocus] = useState<string | undefined>(undefined)

  const snapshot = useSyncExternalStore(
    props.activeProject?.subscribe ?? NOOP_SUBSCRIBE,
    props.activeProject?.getSnapshot ?? (() => INITIAL_ACTIVE_PROJECT_SNAPSHOT),
  )
  const projectId = snapshot.activeProjectId ?? undefined
  const project = projectId === undefined
    ? undefined
    : snapshot.projects.find(row => row.id === projectId)

  // The openTab seam (§4.5/§4.6): the slot runtime's own actions — doc opens
  // carry the document identity in the `doc` params, depgraph rides the
  // kind's bare open. Absent hook (hostless render) = inert seams. The 2.4
  // container overrides the DOC route with its dedupe-aware seam (openDocTab)
  // when one rides (重复打开激活既有); absent = this built-in route.
  const openTabAction = props.useTabInfo?.().tab.actions.openTab
  const openDoc = props.openDocTab ?? ((input: DocOpenInput): void => {
    openTabAction?.('doc', { params: { path: input.path, displayName: input.displayName } })
  })
  const openDepgraph = (): void => { openTabAction?.('depgraph') }

  // Form selection: bridge presence is fixed for the tab's life.
  const [bridge] = useState<WorkbenchIpcBridge | undefined>(() => getWorkbenchIpcBridge())
  const seatForm = props.seat !== undefined || bridge === undefined

  // The proposals face (the pane owns its board load; the mock twin is seeded
  // with the mount-time project — the host re-keys per project switch).
  const [proposalsFace] = useState<ProposalFace>(() => {
    if (!seatForm && bridge !== undefined) return createIpcProposalFace(bridge)
    return createMockProposalsFace(projectId === undefined ? {} : { projectId })
  })
  // The feature board (ONE read, header + feature pane share it).
  const [featureFace] = useState<FeatureBoardFace>(() => {
    if (seatForm) return { ...createMockFeatureBoardFace(), ...props.seat?.featureBoardFace }
    // seatForm false ⇒ bridge present (the one rule); the mock arm below is
    // the unreachable-but-typed fallback.
    return bridge === undefined ? createMockFeatureBoardFace() : createIpcFeatureBoardFace(bridge)
  })
  const [featureBoard, setFeatureBoard] = useState<FeatureBoardData | undefined>(undefined)
  const [featurePhase, setFeaturePhase] = useState<'loading' | 'ready' | 'load-error'>('loading')
  const [featureReload, setFeatureReload] = useState(0)

  // The task sources (ONE read, header 运行中 + tasks pane share it; the C6
  // source twin). Failure degrades silently (undefined rows, the C6 rule).
  const readSources = seatForm ? props.seat?.taskSources : props.readTaskSources
  const readSourcesRef = useRef(readSources)
  readSourcesRef.current = readSources
  const [taskSources, setTaskSources] = useState<readonly OverviewTaskSource[] | undefined>(undefined)
  const [sourcesPhase, setSourcesPhase] = useState<'loading' | 'ready'>('loading')
  const [sourcesReload, setSourcesReload] = useState(0)
  const projectIdRef = useRef(projectId)
  projectIdRef.current = projectId

  // The feature board read: one per (project, reload) — the FeaturesPage
  // discipline (a fresh project drops the old board; a reload keeps the last
  // good one rendered while in flight).
  const featureFaceRef = useRef(featureFace)
  featureFaceRef.current = featureFace
  useEffect(() => {
    if (projectId === undefined) return
    let alive = true
    setFeaturePhase('loading')
    setFeatureBoard(undefined)
    featureFaceRef.current.loadFeatureBoard(projectId).then(
      (board) => {
        if (!alive) return
        setFeatureBoard(board)
        setFeaturePhase('ready')
      },
      () => {
        if (alive) setFeaturePhase('load-error')
      },
    )
    return () => { alive = false }
  }, [projectId, featureReload])

  // The task-sources read: one per (project, reload); rejection = degrade.
  useEffect(() => {
    if (projectId === undefined || readSourcesRef.current === undefined) return
    let alive = true
    readSourcesRef.current().then(
      (rows) => {
        if (!alive) return
        setTaskSources(rows)
        setSourcesPhase('ready')
      },
      () => {
        if (alive) setSourcesPhase('ready')
      },
    )
    return () => { alive = false }
  }, [projectId, sourcesReload])

  // ———— C8 归宿① (task 3.5): the projection status row's data leg ————
  // ONE read per (project, reload) shared with the retry re-read; the event
  // leg below re-fires it on every project-scoped push — projection_updated
  // included (BIZ-005 失效-重建: the relay's outcome backfill lands the
  // state machine transition ≤500ms after the batch).
  const [projectionStatus, setProjectionStatus] = useState<ProjectionStatusRow | undefined>(undefined)
  const [projectionReload, setProjectionReload] = useState(0)
  const [projectionRetrying, setProjectionRetrying] = useState(false)
  const [toast, setToast] = useState<string | undefined>(undefined)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => {
    if (toastTimer.current !== undefined) clearTimeout(toastTimer.current)
  }, [])
  /** The 4s feedback toast (retry success); role=status per the a11y baseline. */
  const showToast = (message: string): void => {
    setToast(message)
    if (toastTimer.current !== undefined) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => { setToast(undefined) }, 4000)
  }
  const readProjection = seatForm
    ? props.seat?.projectionStatus
    : bridge === undefined
      ? undefined
      : async (): Promise<ProjectionStatusRow | undefined> => {
        // The verb answers the full table; the ACTIVE project's row is the tab's.
        const id = projectIdRef.current
        if (id === undefined) return undefined
        const rows = await bridge.getProjectionStatus({ projectId: id })
        return rows.find(row => row.projectId === id)
      }
  const readProjectionRef = useRef(readProjection)
  readProjectionRef.current = readProjection
  useEffect(() => {
    if (projectId === undefined) return
    let alive = true
    setProjectionStatus(undefined) // a fresh project drops the old row
    readProjectionRef.current?.().then(
      (row) => { if (alive) setProjectionStatus(row) },
      () => { if (alive) setProjectionStatus(undefined) }, // degrade silently
    )
    return () => { alive = false }
  }, [projectId, projectionReload])
  const retryProjection = seatForm
    ? props.seat?.retryProjection
    : bridge === undefined
      ? undefined
      : async (input: { projectId: string }): Promise<{ state: ProjectionState }> =>
        bridge.retryProjection(input)
  const retryProjectionRef = useRef(retryProjection)
  retryProjectionRef.current = retryProjection
  /**
   * [重试投影] — the design's ONE projection retry action (BIZ-005: re-run
   * the sync, not a view refresh). The verb re-pushes the idempotent plan;
   * the immediate re-read decides the feedback — healthy → 成功 toast,
   * anything else keeps the degraded presentation (保留降级态; a late
   * relay backfill lands through the projection_updated event leg above).
   */
  const onRetryProjection = (): void => {
    const face = retryProjectionRef.current
    if (face === undefined || projectId === undefined || projectionRetrying) return
    setProjectionRetrying(true)
    face({ projectId }).then(
      async () => {
        const row = await readProjectionRef.current?.().catch(() => undefined)
        setProjectionRetrying(false)
        setProjectionStatus(row)
        if (row?.state === 'healthy') showToast(t('rightbar.overview.projection.toastHealthy'))
      },
      () => {
        // A shape/ERR_PROJECT_NOT_FOUND rejection keeps the row as-is (quiet).
        setProjectionRetrying(false)
      },
    )
  }

  // The live leg (real chain): project-scoped pushes (sync / task_updated /
  // feature_updated / stage / deviation / projection_updated) re-fire ALL
  // THREE shared reads — the header's 随数据实时 (AC1). projection_updated
  // rides the same filter (the C8 status row's 失效-重建 leg, task 3.5).
  // The proposals pane rides its OWN face's reflux channel (the M3 contract
  // verbatim).
  useEffect(() => {
    if (seatForm || bridge === undefined) return
    return getWorkbenchEventSource(bridge).subscribe((events) => {
      const mine = events.some(event => 'projectId' in event && event.projectId === projectIdRef.current)
      if (!mine) return
      setFeatureReload(nonce => nonce + 1)
      setSourcesReload(nonce => nonce + 1)
      setProjectionReload(nonce => nonce + 1)
    })
  }, [seatForm, bridge])

  const activeFeature = featureBoard === undefined ? undefined : deriveActiveFeature(featureBoard.features)

  // Unresolved pointer = the resolving skeleton (the family discipline).
  if (projectId === undefined || project === undefined) {
    return (
      <div
        data-dsh-forge-overview=""
        aria-busy="true"
        style={{ ...rootStyle, padding: '12px', gap: '8px' }}
      >
        {[0, 1, 2, 3].map(index => <div key={index} aria-hidden="true" style={skeletonRowStyle} />)}
      </div>
    )
  }

  return (
    <div data-dsh-forge-overview="" style={rootStyle}>
      {/* 标题栏 + 概要信息区 (常显,三子 tab 共享,不随子 tab 切换变化) —
          the 投影状态行 rides the header (C8 归宿①; archived → absent). */}
      <OverviewHeader
        t={t}
        project={project}
        features={featureBoard?.features}
        taskSources={taskSources}
        projection={projectionStatus}
        projectionRetrying={projectionRetrying}
        onRetryProjection={onRetryProjection}
      />

      {/* 子 tab 行: 提案/feature/任务 (设置已移除 #16-⑤). */}
      <div role="tablist" aria-label={t('rightbar.overview.subtabs.label')} data-dsh-forge-overview-subtabs="" style={subtabStripStyle}>
        {SUBTABS.map((kind) => {
          const label = t(SUBTAB_LABEL_KEYS[kind])
          return (
            <button
              key={kind}
              type="button"
              role="tab"
              aria-selected={subtab === kind ? 'true' : 'false'}
              data-dsh-forge-overview-subtab={kind}
              title={label}
              style={subtab === kind ? subtabActiveStyle : subtabStyle}
              onClick={() => { setSubtab(kind) }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* 子 tab 内容: all three stay MOUNTED (返回不重拉 — board data + scroll
          survive switches by construction); the inactive ones stay hidden. */}
      <div data-dsh-forge-overview-body="" style={bodyStyle}>
        <div hidden={subtab !== 'proposals' ? true : undefined}>
          <ProposalsPane
            t={t}
            projectId={projectId}
            face={seatForm ? props.seat?.proposalsFace : proposalsFace}
            onOpenDoc={openDoc}
            onOpenFeature={(featureSlug) => {
              setFeaturesFocus(featureSlug)
              setSubtab('features')
            }}
          />
        </div>
        <div hidden={subtab !== 'features' ? true : undefined}>
          <FeaturesPane
            t={t}
            board={featureBoard}
            phase={featurePhase}
            onRetry={() => { setFeatureReload(nonce => nonce + 1) }}
            onOpenDoc={openDoc}
            focusSlug={featuresFocus}
          />
        </div>
        <div hidden={subtab !== 'tasks' ? true : undefined}>
          <TasksPane
            t={t}
            sources={taskSources}
            phase={sourcesPhase}
            activeFeatureSlug={activeFeature?.slug}
            archived={project.archived}
            onOpenTask={props.onOpenTask ?? (() => {})}
            {...(props.onEnterSession === undefined ? {} : { onEnterSession: props.onEnterSession })}
            onOpenDepgraph={openDepgraph}
          />
        </div>
      </div>

      {/* The [重试投影] success toast (4s, role=status 播报). */}
      {toast !== undefined && (
        <div role="status" aria-live="polite" data-dsh-forge-overview-toast="" style={toastStyle}>
          {toast}
        </div>
      )}
    </div>
  )
}
