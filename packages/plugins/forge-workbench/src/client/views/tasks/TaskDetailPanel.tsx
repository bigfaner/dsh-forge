/**
 * The UF3 任务详情侧板, BUILD half (task 5.7): the right-edge dock the task
 * board's selection seam opens — summary header (status pill via the ONE
 * shared vocabulary, key/branch mono, worktree/来源 徽标), the UF5
 * panel-primary launch entry (or its reserved disabled placeholder until
 * 5.11 wires the real channel), and the four accordion sections: 描述
 * (MarkdownView read-only) / 依赖链 (topological, same blocker path as the
 * DAG) / 执行记录 (timeline with per-entry 来源 badges) / 挂接历史 (active/
 * ended links, 新→旧). The 5.8 integrate task mounts this dock into the
 * board page (TasksView + the selection store); the 5.15 assembly swaps
 * the mock face for the Interface 1 getTaskDetail verb.
 *
 * Dock contract (tech-design §Integration UF3 / ui-design UF3): absolutely
 * positioned at the container's right edge — `min(440px, 45vw)`, bg-layer-2,
 * left border, slide-in 0.2s, z100, NO mask (the board stays interactive).
 * Focus contract (the DialogFrame precedent, non-modal geometry): focus
 * enters the dock on open, Tab/Shift+Tab cycle inside (focus trap — the
 * dock is a 模态焦点区), Esc / ✕ / pointerdown outside close it, and the
 * focus returns to the trigger element on close.
 *
 * Load contract: first open shows the 分区骨架; a task SWITCH keeps the
 * rendered detail up with aria-busy (无闪烁, 5.8's selection-churn demand);
 * a rejection shows the error card + retry (rejections carry the serialized
 * WorkbenchVerbError shape — the IPC runtime's real form).
 *
 * Read-only discipline (BIZ-task-ops-001): every interaction here is
 * navigation (dep-chain jump, 进入会话 seam) or panel control — no task
 * write affordance exists in this file by construction.
 */
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import type { TaskDetail } from '../../ipc-types'
import type { SessionLaunchServices, TaskDetailFace } from '../../contract'
import type { WorkbenchKey } from '../../locale/en'
import { ChromeButton } from '../../components/chrome/ChromeButton'
import { MarkdownView } from '../../components/common/MarkdownView'
import { createMockTaskDetailFace } from '../../mocks/workbench'
import { localIdOf } from '../TaskBoardPage'
import { SessionLaunchEntry } from './SessionLaunchEntry'
import { focusablesOf, primaryButtonStyle } from './launch/LaunchStates'
import { badgeStyle, sourceBadgeStyle } from './TaskRow'
import { DepChain } from './detail/DepChain'
import { DetailStatusPill } from './detail/ProgressDots'
import { LinkHistory } from './detail/LinkHistory'
import { RecordsTimeline } from './detail/RecordsTimeline'

/** ui-design 层叠: the detail dock rides z100 (dialogs z1200, toasts z1100). */
export const DETAIL_DOCK_Z = 100

/**
 * The dock's width (ui-design UF3 Placement: min(440px, 45vw)). Exported so
 * the 5.8 integration insets the board's flow layout by EXACTLY this strip
 * (dock open ⇒ the views yield, close ⇒ bounce back — one constant, no drift).
 */
export const DETAIL_DOCK_WIDTH = 'min(440px, 45vw)'

/** Inputs of {@link TaskDetailPanel}. */
export interface TaskDetailPanelProps {
  /** The locale seat (the shell's `t`). */
  t: (key: WorkbenchKey) => string
  /**
   * The selected task's QUALIFIED key (`<featureSlug>/<localId>`); null /
   * undefined = closed (the panel renders nothing). The 5.8 selection
   * store drives this; switching keys swaps the detail in place.
   */
  taskKey?: string | null | undefined
  /** The active project — the loadDetail verb argument + the launch ref. */
  projectId?: string | undefined
  /**
   * The project codeRoot — present mounts the UF5 panel-primary entry;
   * absent renders the reserved disabled placeholder (AC: 按钮位预留).
   */
  codeRoot?: string | undefined
  /** The detail face — absent members fall back to the build-stage mock (5.15 injects the IPC face). */
  face?: Partial<TaskDetailFace> | undefined
  /** Service seam passed through to the UF5 entry (5.11 injects the real remotes). */
  services?: Partial<SessionLaunchServices> | undefined
  /** Close (Esc / ✕ / outer pointerdown); the parent clears the selection. */
  onClose: () => void
  /** Dep-chain item activation — re-target the selection to that task (AC: 可点击跳转选中). */
  onNavigate?: ((taskKey: string) => void) | undefined
  /** 「进入会话」 seam — absent link rows stay informational (SC3-3/6.3 wire the jump). */
  onEnterSession?: ((sessionId: string) => void) | undefined
}

/** The dock geometry (ui-design UF3 Placement): right edge, min(440px, 45vw), bg-layer-2, left border. */
const dockStyle = {
  background: 'var(--dsw-alias-bg-layer-2, var(--dsh-bg, Canvas))',
  borderLeft: '1px solid var(--dsh-border-color, CanvasText)',
  bottom: '0',
  boxShadow: '-8px 0 24px rgba(0, 0, 0, 0.12)',
  color: 'inherit',
  display: 'flex',
  flexDirection: 'column',
  font: 'inherit',
  gap: '12px',
  overflowY: 'auto',
  padding: '16px',
  position: 'absolute',
  right: '0',
  top: '0',
  width: DETAIL_DOCK_WIDTH,
  zIndex: DETAIL_DOCK_Z,
} as const

/** The header title: 16/24 single-line truncated (ui-design layout row 1). */
const titleStyle = {
  fontSize: '16px',
  fontWeight: 500,
  lineHeight: '24px',
  margin: '0',
  minWidth: '0',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

/** 12/18 mono secondary (the qualified key — ID mono per ui-design). */
const monoSecondaryStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '12px',
  lineHeight: '18px',
} as const

/** The ✕ close control (the DialogHeader ✕ geometry). */
const closeButtonStyle = {
  alignItems: 'center',
  background: 'transparent',
  border: 'none',
  borderRadius: '8px',
  color: 'inherit',
  cursor: 'pointer',
  display: 'inline-flex',
  flex: '0 0 auto',
  font: 'inherit',
  height: '28px',
  justifyContent: 'center',
  marginLeft: 'auto',
  width: '28px',
} as const

/** Skeleton gray rows (ui-design loading 态: 分区骨架). */
const skeletonRowStyle = {
  background: 'var(--dsh-interactive-bg-hover, rgba(128, 128, 128, 0.2))',
  borderRadius: '8px',
  height: '32px',
} as const

/** Section heading row: the accordion toggle (分区手风琴, 默认全展开). */
const sectionToggleStyle = {
  alignItems: 'center',
  background: 'transparent',
  border: 'none',
  color: 'inherit',
  cursor: 'pointer',
  display: 'inline-flex',
  font: 'inherit',
  fontSize: '14px',
  fontWeight: 500,
  gap: '6px',
  lineHeight: '22px',
  padding: '0',
} as const

/** 空分区 hint: one 12/18 secondary line (ui-design UF3 空分区). */
const emptyHintStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0',
} as const

/** The accordion section ids (also the data-dsh-forge-detail-section values). */
type DetailSectionId = 'description' | 'depChain' | 'records' | 'links'

/**
 * One accordion section: a heading toggle (aria-expanded + aria-controls)
 * over the section body. Default expanded (ui-design: 默认全展开).
 */
function DetailSection(props: {
  t: (key: WorkbenchKey) => string
  id: DetailSectionId
  titleKey: WorkbenchKey
  children: ReactNode
}) {
  const [expanded, setExpanded] = useState(true)
  const bodyId = `dsh-forge-detail-section-body-${props.id}`
  return (
    <section data-dsh-forge-detail-section={props.id}>
      <h3 style={{ margin: '0' }}>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={bodyId}
          data-dsh-forge-detail-toggle={props.id}
          style={sectionToggleStyle}
          onClick={() => { setExpanded(previous => !previous) }}
        >
          <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
          {props.t(props.titleKey)}
        </button>
      </h3>
      {expanded && <div id={bodyId} style={{ paddingTop: '4px' }}>{props.children}</div>}
    </section>
  )
}

/**
 * The UF3 detail dock. Controlled by {@link TaskDetailPanelProps.taskKey}:
 * a present key opens the dock and loads the detail; null/undefined closes
 * it (the parent's onClose clears the selection — the panel never writes
 * the selection itself).
 */
export function TaskDetailPanel(props: TaskDetailPanelProps) {
  // Build-stage default face: one isolated mock twin per mount (the 5.15
  // assembly spreads the IPC-backed members over it).
  const [defaultFace] = useState(() => createMockTaskDetailFace())
  const face: TaskDetailFace = { ...defaultFace, ...props.face }

  const open = props.taskKey !== null && props.taskKey !== undefined
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [detail, setDetail] = useState<TaskDetail | undefined>(undefined)
  const [retryNonce, setRetryNonce] = useState(0)
  const [entered, setEntered] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  // The load: one effect run per (taskKey, retry) — the alive flag drops
  // stale resolutions when the key switches mid-flight. A close resets the
  // cached detail so the next open starts from the skeleton.
  useEffect(() => {
    if (!open || props.taskKey === undefined || props.taskKey === null) {
      setDetail(undefined)
      setPhase('loading')
      return
    }
    let alive = true
    setPhase('loading')
    void face.loadDetail(props.projectId ?? '', props.taskKey)
      .then((next) => {
        if (!alive) return
        setDetail(next)
        setPhase('ready')
      })
      .catch(() => {
        if (alive) setPhase('error')
      })
    return () => { alive = false }
    // The face identity is fixed for the dock's life (the page precedents'
    // load-effect discipline).
  }, [open, props.taskKey, retryNonce])

  // Focus-in on open (capturing the trigger for the return trip) + the
  // slide-in flip; the cleanup returns focus to the trigger on close or
  // unmount and rearms the slide for the next open.
  useEffect(() => {
    if (!open) return
    const active = document.activeElement
    returnFocusRef.current = active instanceof HTMLElement ? active : null
    rootRef.current?.focus()
    const frame = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame(() => { setEntered(true) })
      : undefined
    return () => {
      if (frame !== undefined && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame)
      setEntered(false)
      returnFocusRef.current?.focus()
    }
  }, [open])

  // 外点关闭 (ui-design Interactions: Esc / ✕ / 点击侧板外): a capture-phase
  // pointerdown landing outside the dock closes it. The board stays
  // interactive by design — its next click re-opens the dock through the
  // selection seam (5.8's wiring).
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent): void => {
      const root = rootRef.current
      if (root !== null && event.target instanceof Node && !root.contains(event.target)) props.onClose()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => { document.removeEventListener('pointerdown', onPointerDown, true) }
  }, [open, props.onClose])

  // The non-modal trap: Esc closes; Tab/Shift+Tab cycle the dock's own
  // focusables (the DialogFrame cycle set — collapsed sections simply drop
  // out of the live query).
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      props.onClose()
      return
    }
    if (event.key !== 'Tab' || rootRef.current === null) return
    const focusables = focusablesOf(rootRef.current)
    if (focusables.length === 0) {
      event.preventDefault()
      return
    }
    const first = focusables[0] as HTMLElement
    const last = focusables[focusables.length - 1] as HTMLElement
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  if (!open) return null
  const taskKey = props.taskKey as string
  const busy = phase === 'loading'
  // A task switch keeps the rendered detail up (aria-busy, no flicker); the
  // skeleton shows only when there is nothing rendered yet; an error always
  // wins over stale content.
  const showSkeleton = busy && detail === undefined
  const showError = phase === 'error'
  const showContent = !showError && detail !== undefined

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dsh-forge-detail-title"
      aria-busy={busy ? 'true' : 'false'}
      data-dsh-forge-task-detail={taskKey}
      tabIndex={-1}
      style={{
        ...dockStyle,
        transform: entered ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
      onKeyDown={onKeyDown}
    >
      {showSkeleton && (
        <div
          role="status"
          aria-label={props.t('detail.loading')}
          data-dsh-forge-detail-skeleton=""
          style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
        >
          {[0, 1, 2, 3, 4].map(index => <div key={index} aria-hidden="true" style={skeletonRowStyle} />)}
        </div>
      )}

      {showError && (
        <div data-dsh-forge-detail-error="" role="alert" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 500, lineHeight: '24px', margin: '0' }}>
            {props.t('detail.error.title')}
          </h3>
          <div>
            <ChromeButton
              type="button"
              data-dsh-forge-detail-retry=""
              style={primaryButtonStyle}
              onClick={() => { setRetryNonce(nonce => nonce + 1) }}
            >
              {props.t('detail.error.retry')}
            </ChromeButton>
          </div>
        </div>
      )}

      {showContent && detail !== undefined && (
        <>
          <header data-dsh-forge-detail-header="" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ alignItems: 'center', display: 'flex', gap: '8px', minWidth: 0 }}>
              <h2 id="dsh-forge-detail-title" title={detail.summary.title} style={titleStyle}>
                {detail.summary.title}
              </h2>
              <ChromeButton
                type="button"
                aria-label={props.t('detail.close')}
                data-dsh-forge-detail-close=""
                style={closeButtonStyle}
                onClick={props.onClose}
              >
                <span aria-hidden="true">✕</span>
              </ChromeButton>
            </div>
            <div>
              <span title={detail.summary.key} style={monoSecondaryStyle}>{detail.summary.key}</span>
            </div>
            <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '4px', minWidth: 0 }}>
              <DetailStatusPill t={props.t} status={detail.summary.status} />
              {detail.summary.branch !== null && (
                <span title={detail.summary.branch} style={monoSecondaryStyle}>{detail.summary.branch}</span>
              )}
              {detail.summary.worktree && (
                <span data-dsh-forge-badge="worktree" style={badgeStyle}>{props.t('tasks.badge.worktree')}</span>
              )}
              {detail.summary.source !== null && (
                <span data-dsh-forge-badge={`source:${detail.summary.source}`} style={sourceBadgeStyle}>
                  {props.t(detail.summary.source === 'session' ? 'tasks.source.session' : 'tasks.source.terminal')}
                </span>
              )}
            </div>
          </header>

          {props.projectId !== undefined && props.codeRoot !== undefined
            ? (
              <SessionLaunchEntry
                variant="panel-primary"
                t={props.t}
                {...(props.services !== undefined ? { services: props.services } : {})}
                task={{
                  projectId: props.projectId,
                  codeRoot: props.codeRoot,
                  featureSlug: detail.summary.featureSlug,
                  localId: localIdOf(detail.summary.key),
                  title: detail.summary.title,
                }}
              />
            )
            : (
              // AC 按钮位预留: the reserved disabled placeholder — the same
              // md-primary geometry the UF5 entry uses, inert until the
              // mounting context can hand over the project ref (5.8/5.11).
              <ChromeButton
                type="button"
                disabled
                data-dsh-forge-detail-launch-reserved=""
                title={props.t('detail.launch.reserved')}
                style={{
                  ...primaryButtonStyle,
                  alignItems: 'center',
                  cursor: 'default',
                  display: 'inline-flex',
                  gap: '6px',
                  justifyContent: 'center',
                  width: '100%',
                }}
              >
                <span aria-hidden="true">▶</span>
                <span>{props.t('launch.primary')}</span>
              </ChromeButton>
            )}

          <DetailSection t={props.t} id="description" titleKey="detail.section.description">
            {detail.descriptionMarkdown.trim() !== ''
              ? <MarkdownView markdown={detail.descriptionMarkdown} />
              : <p data-dsh-forge-detail-description-empty="" style={emptyHintStyle}>{props.t('detail.description.empty')}</p>}
          </DetailSection>
          <DetailSection t={props.t} id="depChain" titleKey="detail.section.depChain">
            <DepChain t={props.t} entries={detail.depChain} onNavigate={props.onNavigate} />
          </DetailSection>
          <DetailSection t={props.t} id="records" titleKey="detail.section.records">
            <RecordsTimeline t={props.t} records={detail.records} />
          </DetailSection>
          <DetailSection t={props.t} id="links" titleKey="detail.section.links">
            <LinkHistory t={props.t} links={detail.links} onEnterSession={props.onEnterSession} />
          </DetailSection>
        </>
      )}
    </div>
  )
}
