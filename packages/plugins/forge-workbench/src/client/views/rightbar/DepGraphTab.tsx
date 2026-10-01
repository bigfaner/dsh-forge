/**
 * The 依赖图 tab BODY (M4 task 2.4, layout §4.6 + 裁决 #19-②/#21): the whole
 * feature's dependency graph behind a two-part header — the feature 名即下拉
 * (可选项仅本项目 feature, 名称旁状态徽标 pill = 状态 + done/total; 裁决
 * #19-②) and the DAG/泳道图 分段钮 (默认 DAG, 模式随会话保留) — over the two
 * mode views (DagView / SwimlaneView), which share the ONE node card
 * (DepNodeCard: 状态点/标题/ID/「会话中」pill, 点击开任务详情 dock through the
 * C6 select + ensureBoardActive seam).
 *
 * Data (零新读侧 + BIZ-005 失效-重建): the EXISTING verbs — getFeatureBoard
 * (the dropdown's rows + pills) and getTaskBoard (the graph's tasks; the
 * `blockers` field IS the structured deps parse) — plus the SAME shared
 * task-sources read the C6 bar consumes (the 会话中 pill's active-link map).
 * Project-scoped pushes (sync / task_updated / feature_updated / stage /
 * deviation) re-fire all three reads through the task-board face's event
 * channel (the real chain's single-subscriber shared source; the seat form
 * rides the mock twin's channel so the reflux is testable in jsdom).
 *
 * The tab follows the ACTIVE project (its scoped kind CLOSES on a project
 * switch — the 2.2 §4.7 linkage), and the `depgraph` navigation params may
 * pin the initial feature (`featureSlug`; absent = the derived 活跃 feature,
 * the same deriveActiveFeature the overview header reads).
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { UseSidebarRightTabInfo } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { FeatureBoardFace, TaskBoardFace } from '../../contract'
import type { FeatureBoardData, FeatureSummary, TaskSummary } from '../../ipc-types'
import { featureStatusLabel } from '../../i18n/feature-status'
import { ChromeButton } from '../../components/chrome/ChromeButton'
import { getWorkbenchIpcBridge, createIpcFeatureBoardFace, createIpcTaskBoardFace } from '../../ipc/workbench'
import type { WorkbenchIpcBridge } from '../../ipc/workbench'
import { createMockFeatureBoardFace, createMockTaskBoardFace } from '../../mocks/workbench'
import { INITIAL_ACTIVE_PROJECT_SNAPSHOT } from '../../store/active-project'
import type { ActiveProjectStore } from '../../store/active-project'
import { activeLinkOf, deriveActiveFeature, type OverviewTaskSource } from './overview-model'
import { DagView } from './DagView'
import { SwimlaneView } from './SwimlaneView'
import type { TabKindTranslate } from './tab-kinds'

/** The two view modes (裁决 #21 双模式; DAG is the default). */
export type DepGraphMode = 'dag' | 'lane'

/**
 * The mode's session memory (模式随会话保留): the module lives as long as the
 * plugin's page session, so a closed-and-reopened depgraph tab (or a pane
 * switch) finds the mode where the session left it — the prototype's
 * top-level `depView` in pane form. A factory exists for tests; the component
 * rides the ONE module instance.
 */
export interface DepGraphModeMemory {
  get(): DepGraphMode
  set(mode: DepGraphMode): void
}

/** Create an isolated mode memory (the test form of the module instance). */
export function createDepGraphModeMemory(): DepGraphModeMemory {
  let mode: DepGraphMode = 'dag'
  return { get: () => mode, set: (next) => { mode = next } }
}

const depGraphModeMemory: DepGraphModeMemory = createDepGraphModeMemory()

/** The test/build-stage injection seat (the M3 page-seat discipline). */
export interface DepGraphTabSeat {
  /** The feature-board face override (absent members fall back to the mock twin). */
  readonly featureBoardFace?: Partial<FeatureBoardFace> | undefined
  /** The task-board face override (the events channel rides the same face). */
  readonly taskBoardFace?: Partial<TaskBoardFace> | undefined
  /** The task-sources read override (the 会话中 pill source). */
  readonly taskSources?: (() => Promise<readonly OverviewTaskSource[] | undefined>) | undefined
}

/** Inputs of {@link DepGraphTab} (all optional so the bare hostless render
 * degrades to the resolving skeleton). */
export interface DepGraphTabProps {
  /** The locale seat (the plugin's bound `t`). */
  readonly t: TabKindTranslate
  /** The plugin-lifetime active-project store — the tab's ONLY project source. */
  readonly activeProject?: ActiveProjectStore | undefined
  /** The 节点点击 → 任务详情 dock seam (C6 select + ensureBoardActive, wired 2.3). */
  readonly onOpenTask?: ((taskKey: string) => void) | undefined
  /**
   * The shared task-sources read (real chain — the SAME builder the C6 bar
   * consumes; absent = the 会话中 pills degrade silently, never a mock).
   */
  readonly readTaskSources?: (() => Promise<readonly OverviewTaskSource[] | undefined>) | undefined
  /** The test/build-stage seat — present wins over the bridge (one rule). */
  readonly seat?: DepGraphTabSeat | undefined
  /** The slot runtime's tab-info hook (the `featureSlug` params carrier). */
  readonly useTabInfo?: UseSidebarRightTabInfo | undefined
  /**
   * The mode memory override (test isolation): absent = the ONE module
   * instance (the session retention the product ships).
   */
  readonly modeMemory?: DepGraphModeMemory | undefined
}

/** The tab's column. */
const rootStyle = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  minWidth: 0,
} as const

/** The head: 依赖图 · [feature ▾ pill] … [DAG | 泳道图] (§4.6 wireframe row 1-2). */
const headStyle = {
  alignItems: 'center',
  borderBottom: '0.5px solid var(--dsh-border-color, rgba(128, 128, 128, 0.35))',
  display: 'flex',
  flex: '0 0 auto',
  gap: '8px',
  minWidth: 0,
  padding: '8px 12px',
} as const

const headLabelStyle = {
  flex: '0 0 auto',
  fontSize: '13px',
  fontWeight: 500,
  lineHeight: '20px',
} as const

/** The feature 名即下拉 trigger (ghost pill, ▾ suffix). */
const featureButtonStyle = {
  alignItems: 'center',
  background: 'transparent',
  border: 'none',
  borderRadius: '8px',
  color: 'inherit',
  cursor: 'pointer',
  display: 'flex',
  flex: '0 1 auto',
  font: 'inherit',
  fontSize: '13px',
  gap: '6px',
  lineHeight: '20px',
  minWidth: 0,
  padding: '4px 6px',
} as const

/** The 状态徽标 pill: 状态 + done/total (裁决 #19-②, border capsule). */
const featurePillStyle = {
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '8px',
  flex: '0 0 auto',
  fontSize: '12px',
  lineHeight: '18px',
  padding: '0 6px',
  whiteSpace: 'nowrap',
} as const

/** The 分段钮 (two small pills; the active one filled). */
const segStyle = {
  background: 'transparent',
  border: 'none',
  borderRadius: '8px',
  color: 'inherit',
  cursor: 'pointer',
  flex: '0 0 auto',
  font: 'inherit',
  fontSize: '12px',
  lineHeight: '18px',
  padding: '4px 10px',
} as const

const segActiveStyle = {
  ...segStyle,
  background: 'var(--dsh-interactive-bg-hover, rgba(128, 128, 128, 0.2))',
  fontWeight: 500,
} as const

/** The dropdown menu card (absolute under the trigger). */
const menuStyle = {
  background: 'var(--dsw-alias-bg-layer-2, var(--dsh-bg, Canvas))',
  borderRadius: '12px',
  border: '0.5px solid var(--dsh-border-color, rgba(128, 128, 128, 0.35))',
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.14)',
  display: 'flex',
  flexDirection: 'column',
  left: '0',
  maxHeight: '260px',
  minWidth: '220px',
  overflowY: 'auto',
  padding: '4px',
  position: 'absolute',
  top: '100%',
  zIndex: 20,
} as const

const menuItemStyle = {
  alignItems: 'center',
  background: 'transparent',
  border: 'none',
  borderRadius: '8px',
  color: 'inherit',
  cursor: 'pointer',
  display: 'flex',
  font: 'inherit',
  fontSize: '13px',
  gap: '8px',
  lineHeight: '20px',
  minWidth: 0,
  padding: '6px 8px',
  textAlign: 'left',
} as const

const menuSlugStyle = {
  flex: '1 1 auto',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '13px',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

/** The mode bodies' shared scroller shell. */
const bodyStyle = {
  display: 'flex',
  flex: '1 1 auto',
  flexDirection: 'column',
  minWidth: 0,
  minHeight: 0,
  padding: '8px 12px',
} as const

/** Skeleton gray rows (the family's resolving 态 twin). */
const skeletonRowStyle = {
  background: 'var(--dsh-interactive-bg-hover, rgba(128, 128, 128, 0.2))',
  borderRadius: '8px',
  height: '28px',
} as const

/** Shared card face for the error state (the M3 board page precedent). */
const errorCardStyle = {
  background: 'var(--dsw-alias-bg-layer-2, var(--dsh-bg, Canvas))',
  border: '1.5px solid var(--dsw-alias-state-error-primary, rgb(236, 19, 19))',
  borderRadius: '14px',
  padding: '14px',
} as const

const cardTitleStyle = {
  fontSize: '14px',
  fontWeight: 500,
  lineHeight: '22px',
  margin: '0 0 8px',
} as const

const primaryButtonStyle = {
  background: 'var(--dsw-alias-link, rgb(65, 118, 230))',
  border: 'none',
  borderRadius: '14px',
  color: '#fff',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: '12px',
  lineHeight: '18px',
  padding: '4px 12px',
} as const

const auxStyle = {
  color: 'var(--dsw-alias-label-secondary, rgb(97, 102, 107))',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0',
  padding: '8px 2px',
} as const

/** The noop subscription every optional store falls back to (never a throw). */
const NOOP_SUBSCRIBE = (): (() => void) => () => {}

/** The status-pill text: 状态 + done/total (the wireframe's `in-progress 12/41`). */
const featurePillText = (feature: FeatureSummary, t: TabKindTranslate): string =>
  `${featureStatusLabel(feature.status, t)} ${feature.taskCompleted}/${feature.taskTotal}`

/**
 * The 依赖图 tab body. An unresolved project pointer renders the resolving
 * skeleton; the dropdown rows and the graph derive from the ACTIVE project's
 * board only (仅本项目 — AC3).
 */
export function DepGraphTab(props: DepGraphTabProps): ReactNode {
  const t = props.t
  // 模式随会话保留: seeded from the session memory, written back on change
  // (the module instance by default; tests may inject an isolated one).
  const memory = props.modeMemory ?? depGraphModeMemory
  const [mode, setMode] = useState<DepGraphMode>(() => memory.get())
  const onMode = (next: DepGraphMode): void => {
    memory.set(next)
    setMode(next)
  }

  // The params may pin the initial feature (2.2's `depgraph` params seam).
  const params = props.useTabInfo?.().tab.navigation.params as { featureSlug?: unknown } | undefined
  const paramsFeatureSlug
    = params !== undefined && typeof params === 'object' && typeof params.featureSlug === 'string' && params.featureSlug !== ''
      ? params.featureSlug
      : undefined

  const snapshot = useSyncExternalStore(
    props.activeProject?.subscribe ?? NOOP_SUBSCRIBE,
    props.activeProject?.getSnapshot ?? (() => INITIAL_ACTIVE_PROJECT_SNAPSHOT),
  )
  const projectId = snapshot.activeProjectId ?? undefined

  // Form selection: bridge presence is fixed for the tab's life (the
  // OverviewTab rule verbatim).
  const [bridge] = useState<WorkbenchIpcBridge | undefined>(() => getWorkbenchIpcBridge())
  const seatForm = props.seat !== undefined || bridge === undefined
  const [featureFace] = useState<FeatureBoardFace>(() => {
    if (!seatForm && bridge !== undefined) return createIpcFeatureBoardFace(bridge)
    return { ...createMockFeatureBoardFace(), ...props.seat?.featureBoardFace }
  })
  const [boardFace] = useState<TaskBoardFace>(() => {
    if (!seatForm && bridge !== undefined) return createIpcTaskBoardFace(bridge)
    return { ...createMockTaskBoardFace(), ...props.seat?.taskBoardFace }
  })

  // The three reads, each per (project, reload nonce).
  const [featureBoard, setFeatureBoard] = useState<FeatureBoardData | undefined>(undefined)
  const [featurePhase, setFeaturePhase] = useState<'loading' | 'ready' | 'load-error'>('loading')
  const [featureReload, setFeatureReload] = useState(0)
  const [taskBoardData, setTaskBoardData] = useState<{ readonly tasks: readonly TaskSummary[] } | undefined>(undefined)
  const [taskPhase, setTaskPhase] = useState<'loading' | 'ready' | 'load-error'>('loading')
  const [taskReload, setTaskReload] = useState(0)
  const [sources, setSources] = useState<readonly OverviewTaskSource[] | undefined>(undefined)
  const [sourcesReload, setSourcesReload] = useState(0)
  const projectIdRef = useRef(projectId)
  projectIdRef.current = projectId

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

  const boardFaceRef = useRef(boardFace)
  boardFaceRef.current = boardFace
  useEffect(() => {
    if (projectId === undefined) return
    let alive = true
    setTaskPhase('loading')
    setTaskBoardData(undefined)
    boardFaceRef.current.loadBoard(projectId).then(
      (board) => {
        if (!alive) return
        setTaskBoardData(board)
        setTaskPhase('ready')
      },
      () => {
        if (alive) setTaskPhase('load-error')
      },
    )
    return () => { alive = false }
  }, [projectId, taskReload])

  // The sources read (会话中 pills): rejection = silent degrade (the C6 rule).
  const readSources = seatForm ? props.seat?.taskSources : props.readTaskSources
  const readSourcesRef = useRef(readSources)
  readSourcesRef.current = readSources
  useEffect(() => {
    if (projectId === undefined || readSourcesRef.current === undefined) return
    let alive = true
    readSourcesRef.current().then(
      (rows) => {
        if (!alive) return
        setSources(rows)
      },
      () => {
        if (alive) setSources(undefined)
      },
    )
    return () => { alive = false }
  }, [projectId, sourcesReload])

  // BIZ-005 失效-重建: project-scoped pushes re-fire ALL three reads (节点
  // 状态随会话运行态刷新). Both forms ride the SAME channel shape — the real
  // chain's face routes through the shared single-subscriber source; the seat
  // form's mock twin carries the test driver's emit.
  useEffect(() => {
    return boardFace.subscribeEvents((events) => {
      const mine = events.some(event => 'projectId' in event && event.projectId === projectIdRef.current)
      if (!mine) return
      setFeatureReload(nonce => nonce + 1)
      setTaskReload(nonce => nonce + 1)
      setSourcesReload(nonce => nonce + 1)
    })
  }, [boardFace])

  // The selection: params pin wins at seed; afterwards the DERIVED active
  // feature covers both the seed (no pin) and a vanished selection (a board
  // refresh that dropped the feature — fall back, never a dangling scope).
  const features = featureBoard?.features
  const [selected, setSelected] = useState<string | undefined>(paramsFeatureSlug)
  useEffect(() => {
    if (features === undefined) return
    if (selected !== undefined && features.some(feature => feature.slug === selected)) return
    setSelected(deriveActiveFeature(features)?.slug)
  }, [features, selected])

  const [menuOpen, setMenuOpen] = useState(false)
  const onPickFeature = (slug: string): void => {
    setSelected(slug)
    setMenuOpen(false)
  }

  // The graph inputs: the selected feature's tasks + the active-link map.
  const tasks = useMemo(
    () => (taskBoardData === undefined || selected === undefined
      ? []
      : taskBoardData.tasks.filter(task => task.featureSlug === selected)),
    [taskBoardData, selected],
  )
  const activeLinks = useMemo(() => {
    const map = new Map<string, string>()
    for (const source of sources ?? []) {
      const link = activeLinkOf(source.links)
      if (link !== undefined) map.set(source.task.key, link.sessionId)
    }
    return map
  }, [sources])

  const onOpenTask = props.onOpenTask ?? (() => {})
  const current = features?.find(feature => feature.slug === selected)

  // Unresolved pointer = the resolving skeleton (the family discipline).
  if (projectId === undefined) {
    return (
      <div data-dsh-forge-depgraph="" aria-busy="true" style={{ ...rootStyle, padding: '12px', gap: '8px' }}>
        {[0, 1, 2, 3].map(index => <div key={index} aria-hidden="true" style={skeletonRowStyle} />)}
      </div>
    )
  }

  return (
    <div data-dsh-forge-depgraph={selected ?? ''} style={rootStyle}>
      {/* 头部: 依赖图 · [feature ▾ pill] + 分段钮. */}
      <div style={headStyle}>
        <span style={headLabelStyle}>{t('rightbar.tab.depgraph')}</span>
        <span aria-hidden="true" style={headLabelStyle}>·</span>
        <div style={{ flex: '1 1 auto', minWidth: 0, position: 'relative' }}>
          <button
            type="button"
            data-dsh-forge-depgraph-feature={selected ?? ''}
            aria-haspopup="menu"
            aria-expanded={menuOpen ? 'true' : 'false'}
            title={t('rightbar.depgraph.feature.label')}
            style={featureButtonStyle}
            onClick={() => { setMenuOpen(open => !open) }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setMenuOpen(false)
            }}
          >
            <span style={menuSlugStyle}>{selected ?? t('rightbar.depgraph.feature.none')}</span>
            {current !== undefined && (
              <span data-dsh-forge-depgraph-feature-pill={current.slug} style={featurePillStyle} title={featurePillText(current, t)}>
                {featurePillText(current, t)}
              </span>
            )}
            <span aria-hidden="true">▾</span>
          </button>
          {menuOpen && features !== undefined && (
            <div role="menu" aria-label={t('rightbar.depgraph.feature.label')} data-dsh-forge-depgraph-feature-menu="" style={menuStyle}>
              {features.map(feature => (
                <button
                  key={feature.slug}
                  type="button"
                  role="menuitem"
                  data-dsh-forge-depgraph-feature-option={feature.slug}
                  aria-selected={feature.slug === selected ? 'true' : 'false'}
                  style={menuItemStyle}
                  onClick={() => { onPickFeature(feature.slug) }}
                >
                  <span style={menuSlugStyle} title={feature.slug}>{feature.slug}</span>
                  <span style={featurePillStyle}>{featurePillText(feature, t)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div role="tablist" aria-label={t('rightbar.depgraph.mode.label')} data-dsh-forge-depgraph-modes="">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'dag' ? 'true' : 'false'}
            data-dsh-forge-depgraph-mode="dag"
            style={mode === 'dag' ? segActiveStyle : segStyle}
            onClick={() => { onMode('dag') }}
          >
            {t('rightbar.depgraph.mode.dag')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'lane' ? 'true' : 'false'}
            data-dsh-forge-depgraph-mode="lane"
            style={mode === 'lane' ? segActiveStyle : segStyle}
            onClick={() => { onMode('lane') }}
          >
            {t('rightbar.depgraph.mode.lane')}
          </button>
        </div>
      </div>

      {/* The mode bodies (the same inputs; the segmented pick switches). */}
      <div style={bodyStyle}>
        {featurePhase === 'loading' && featureBoard === undefined && (
          <div role="status" aria-label={t('rightbar.depgraph.loading')} data-dsh-forge-depgraph-skeleton="">
            {[0, 1, 2].map(index => <div key={index} aria-hidden="true" style={skeletonRowStyle} />)}
          </div>
        )}
        {featurePhase === 'load-error' && (
          <div data-dsh-forge-depgraph-error="" role="alert" style={errorCardStyle}>
            <h3 style={cardTitleStyle}>{t('rightbar.depgraph.loadError.title')}</h3>
            <div>
              <ChromeButton
                type="button"
                data-dsh-forge-depgraph-retry=""
                style={primaryButtonStyle}
                onClick={() => { setFeatureReload(nonce => nonce + 1) }}
              >
                {t('rightbar.depgraph.loadError.retry')}
              </ChromeButton>
            </div>
          </div>
        )}
        {featurePhase === 'ready' && features !== undefined && features.length === 0 && (
          <p data-dsh-forge-depgraph-no-features="" style={auxStyle}>{t('rightbar.depgraph.feature.none')}</p>
        )}
        {featurePhase === 'ready' && features !== undefined && features.length > 0 && selected === undefined && (
          <div role="status" aria-label={t('rightbar.depgraph.loading')} data-dsh-forge-depgraph-skeleton="">
            {[0, 1, 2].map(index => <div key={index} aria-hidden="true" style={skeletonRowStyle} />)}
          </div>
        )}
        {featurePhase === 'ready' && selected !== undefined && taskPhase === 'loading' && taskBoardData === undefined && (
          <div role="status" aria-label={t('rightbar.depgraph.loading')} data-dsh-forge-depgraph-skeleton="">
            {[0, 1, 2].map(index => <div key={index} aria-hidden="true" style={skeletonRowStyle} />)}
          </div>
        )}
        {featurePhase === 'ready' && selected !== undefined && taskPhase === 'load-error' && (
          <div data-dsh-forge-depgraph-error="" role="alert" style={errorCardStyle}>
            <h3 style={cardTitleStyle}>{t('rightbar.depgraph.loadError.title')}</h3>
            <div>
              <ChromeButton
                type="button"
                data-dsh-forge-depgraph-retry=""
                style={primaryButtonStyle}
                onClick={() => { setTaskReload(nonce => nonce + 1) }}
              >
                {t('rightbar.depgraph.loadError.retry')}
              </ChromeButton>
            </div>
          </div>
        )}
        {featurePhase === 'ready' && selected !== undefined && taskPhase === 'ready' && tasks.length === 0 && (
          <p data-dsh-forge-depgraph-tasks-empty="" style={auxStyle}>{t('rightbar.depgraph.tasks.empty')}</p>
        )}
        {featurePhase === 'ready' && selected !== undefined && taskPhase === 'ready' && tasks.length > 0 && (
          mode === 'dag'
            ? <DagView t={t} tasks={tasks} activeLinks={activeLinks} onOpenTask={onOpenTask} />
            : <SwimlaneView t={t} tasks={tasks} activeLinks={activeLinks} onOpenTask={onOpenTask} />
        )}
      </div>
    </div>
  )
}
