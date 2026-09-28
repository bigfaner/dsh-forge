/**
 * The UF3 任务详情侧板, BUILD half (task 5.7): the right-edge dock the task
 * board's selection seam opens — summary header (status pill via the ONE
 * shared vocabulary, key/branch mono, worktree/来源 徽标), the UF1
 * dispatch primary (3.9's 派发执行; the M2 发起会话 entry retired with
 * the ForgeBridge chain, task 6.1 — absent dispatch mount keeps the
 * reserved disabled placeholder), and the four accordion sections: 描述
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
 * Read-only discipline (BIZ-task-ops-001, M3 修订): every interaction here is
 * navigation (dep-chain jump, 进入会话 seam), panel control, or ORCHESTRATION
 * INITIATION (task 3.9's dispatch mount — 派发执行 / 重派发 / 去审批: the
 * human's 编排发起 face, never a task-status write) — no task write
 * affordance exists in this file by construction.
 */
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import type { DispatchRow, SessionLink, TaskDetail } from '../../ipc-types'
import type { TaskDetailFace } from '../../contract'
import type { WorkbenchKey } from '../../locale/en'
import { ChromeButton } from '../../components/chrome/ChromeButton'
import { MarkdownView } from '../../components/common/MarkdownView'
import { createMockTaskDetailFace } from '../../mocks/workbench'
import { SessionBadge } from './SessionBadge'
import { detailDockWidthOf, DETAIL_DOCK_Z, focusablesOf, primaryButtonStyle, type BoardHostForm } from './launch/LaunchStates'
import { badgeStyle, sourceBadgeStyle } from './TaskRow'
import { DepChain } from './detail/DepChain'
import { DetailStatusPill } from './detail/ProgressDots'
import { LinkHistory } from './detail/LinkHistory'
import { RecordsTimeline } from './detail/RecordsTimeline'
import { ApprovalReturnButton } from './dispatch/ApprovalPanel'
import {
  currentDispatchRow, DispatchExecuteButton, OrchestrationSection, useDetailDispatchChain,
  type DetailDispatchVerbs,
} from './dispatch/OrchestrationSection'
import type { SelectionTaskEntry } from './dispatch/selection-mode'

/** ui-design 层叠: the detail dock rides z100 (dialogs z1200, toasts z1100). */
// Since 3.9 the constants live in launch/LaunchStates.tsx (the dock family's
// acyclic shared home — the approval panel imports this module's components,
// so a same-module declaration would cycle); re-exported for the 5.8-era
// consumers that address them here (the specs — since M4 2.1 the page's inset
// goes through detailDockWidthOf's host mapping instead).
export { DETAIL_DOCK_Z, DETAIL_DOCK_WIDTH } from './launch/LaunchStates'

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
   * The host's width breakpoint (M4 2.1 双宿主, threaded by TaskBoardPage):
   * 'window' (default) = the UF3 dock geometry `min(440px, 45vw)` verbatim;
   * 'pane' = the dock caps at the board's own box. See {@link detailDockWidthOf}.
   */
  host?: BoardHostForm | undefined
  /**
   * The project codeRoot (project context; the M2 launch entry that consumed
   * it retired with the ForgeBridge chain — task 6.1).
   */
  codeRoot?: string | undefined
  /**
   * The external re-read token (5.15): a change re-fires the load for the
   * CURRENT key — the 回流 structural-deletion path (the board's event
   * merge detected the open key was deleted; the re-read rejects and this
   * dock's error card shows — ui-design 侧板转错误态). Unset/stable in the
   * build stage (no real deletions there).
   */
  reloadToken?: number | undefined
  /** The detail face — absent members fall back to the build-stage mock (5.15 injects the IPC face). */
  face?: Partial<TaskDetailFace> | undefined
  /** The task's ACTIVE session link id (5.11 AC3 — the 会话运行中 badge in the header). */
  activeSessionId?: string | undefined
  /**
   * The dock's authoritative link read (5.11): fires after every successful
   * loadDetail with the task's links — the caller reconciles the 运行中徽标
   * (an ended/absent link drops it, the ≤5s end path until a link event kind
   * exists in the WorkbenchEvent vocabulary).
   */
  onLinksLoaded?: ((taskKey: string, links: readonly SessionLink[]) => void) | undefined
  /** Close (Esc / ✕ / outer pointerdown); the parent clears the selection. */
  onClose: () => void
  /** Dep-chain item activation — re-target the selection to that task (AC: 可点击跳转选中). */
  onNavigate?: ((taskKey: string) => void) | undefined
  /** 「进入会话」 seam — absent link rows stay informational (SC3-3/6.3 wire the jump). */
  onEnterSession?: ((sessionId: string) => void) | undefined
  /**
   * The UF1 orchestration mount (task 3.9): present = the M3 dispatch form
   * (派发执行 primary + 编排 partition + the approval round-trip head);
   * absent = the M2 form verbatim.
   */
  dispatch?: TaskDetailDispatchMount | undefined
}

/**
 * The dock geometry (ui-design UF3 Placement): right edge, bg-layer-2, left
 * border. The WIDTH is host-form-dependent (M4 2.1) and applied at the render
 * site through {@link detailDockWidthOf} — the window form's ui-design value
 * `min(440px, 45vw)` verbatim, the pane form capped at the board's own box.
 */
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
type DetailSectionId = 'orchestration' | 'description' | 'depChain' | 'records' | 'links'

/**
 * The UF1 orchestration mount (task 3.9, ui-design 任务详情侧板 M2 UF3 演进):
 * everything the dock's dispatch form needs — the 3.8 chain verbs, the
 * project's dispatch rows (unfiltered — the section picks this task's), the
 * board entries (the dispatchability mirror's lookup set), and the approval
 * round-trip seams. PRESENT = the M3 form: the 「▶ 派发执行」 primary button
 * (the M2 「发起会话」 slot's same-position semantic evolution — Hard Rule:
 * ONE button, one door) + the 编排 partition (置于执行记录之上). ABSENT =
 * the M2 form verbatim (the build-stage/tests keep their launch entry).
 */
export interface TaskDetailDispatchMount {
  /** The 3.8 chain verbs (check / dispatch / redispatch; preload twins). */
  readonly verbs: DetailDispatchVerbs
  /** The project's dispatch rows (unfiltered — currentDispatchRow picks this task's). */
  readonly rows: readonly DispatchRow[]
  /** The board tasks (the 3.6 kernel-semantics mirror's lookup set). */
  readonly entries: readonly SelectionTaskEntry[]
  /** Fired once on a successful dispatch/redispatch (the page refreshes its rows). */
  readonly onDispatched?: ((rows: readonly DispatchRow[]) => void) | undefined
  /** [去审批] / the awaiting badge — switch to the approval dock (the 3.9 mutex). */
  readonly onOpenApproval: (taskKey: string) => void
  /** 「进入会话」 — 切会话视图 + session-focus (the M1 view-switch contract). */
  readonly onEnterSession?: ((sessionId: string) => void) | undefined
  /** Present = the detail was entered FROM the approval dock (详情 ↗) → the 「◂ 返回审批(N)」 head button. */
  readonly approvalReturn?: { readonly count: number } | undefined
  /** The return button's action — reopen the approval dock (entries + scroll restored). */
  readonly onReturnToApproval?: (() => void) | undefined
}

/** The no-op verb twin the chain hook runs against while no mount is present (never invoked). */
const IDLE_DETAIL_VERBS: DetailDispatchVerbs = {
  checkStageArtifacts: async () => { throw new Error('no dispatch mount') },
  dispatchTasks: async () => { throw new Error('no dispatch mount') },
  redispatch: async () => { throw new Error('no dispatch mount') },
}

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
  // The links-read notification rides a ref (the callback identity follows
  // the page's callbacks; the load effect's identity discipline stays).
  const onLinksLoadedRef = useRef(props.onLinksLoaded)
  onLinksLoadedRef.current = props.onLinksLoaded
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
        onLinksLoadedRef.current?.(props.taskKey as string, next.links)
      })
      .catch(() => {
        if (alive) setPhase('error')
      })
    return () => { alive = false }
    // The face identity is fixed for the dock's life (the page precedents'
    // load-effect discipline); reloadToken re-fires the read for the SAME
    // key (the 5.15 structural-deletion path).
  }, [open, props.taskKey, retryNonce, props.reloadToken])

  // The UF1 single-task chain (task 3.9): the 3.8 controller runs on EVERY
  // mount (unconditional hook); without a dispatch mount it sits idle at
  // phase 'idle' — nothing renders its trigger, no leg ever fires.
  const dispatchMount = props.dispatch
  const detailController = useDetailDispatchChain({
    projectId: props.projectId ?? '',
    taskKey: open && props.taskKey !== null && props.taskKey !== undefined ? props.taskKey : '',
    title: detail?.summary.title ?? '',
    featureSlug: detail?.summary.featureSlug ?? '',
    verbs: dispatchMount?.verbs ?? IDLE_DETAIL_VERBS,
    ...(dispatchMount?.onDispatched === undefined ? {} : { onDispatched: dispatchMount.onDispatched }),
  })

  // Focus-in on open (capturing the trigger for the return trip) + the
  // slide-in flip; the cleanup returns focus to the trigger on close or
  // unmount and rearms the slide for the next open.
  useEffect(() => {
    if (!open) return
    const active = document.activeElement
    returnFocusRef.current = active instanceof HTMLElement ? active : null
    // Focus arbitration (SC2-1 确认默认焦点): a MODAL dialog frame mounted in
    // the same commit — the UF5 launch confirm opening off a node-card click
    // that ALSO selected the task into this dock — owns the focus; the dock's
    // non-modal focus-in runs later in the commit and must not steal it
    // (Enter alone has to confirm the launch). The return-trip capture above
    // still records the pre-dock trigger either way.
    if (document.querySelector('[data-dsh-forge-dialog]') === null) {
      rootRef.current?.focus()
    }
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
        width: detailDockWidthOf(props.host ?? 'window'),
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
            {dispatchMount?.approvalReturn !== undefined && (
              // The 审批 round-trip's return leg (task 3.9): the detail was
              // entered from the approval dock (详情 ↗) — 「◂ 返回审批(N)」
              // reopens it (entries + scroll restored by the dock's machine).
              <ApprovalReturnButton
                t={props.t}
                count={dispatchMount.approvalReturn.count}
                onReturn={() => { dispatchMount.onReturnToApproval?.() }}
              />
            )}
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
              <SessionBadge t={props.t} sessionId={props.activeSessionId} />
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

          {dispatchMount !== undefined
            ? (
              // The M3 form (task 3.9): the「▶ 派发执行」primary — the M2
              // 「发起会话」slot's SAME-POSITION semantic evolution (Hard Rule:
              // ONE button, one door); the dispatch chain's dialogs render in
              // the orchestration section below (one controller, one place).
              <DispatchExecuteButton
                t={props.t}
                controller={detailController}
                entry={{
                  key: detail.summary.key,
                  title: detail.summary.title,
                  status: detail.summary.status,
                  featureSlug: detail.summary.featureSlug,
                  blockers: detail.summary.blockers,
                }}
                entries={dispatchMount.entries}
                currentRow={currentDispatchRow(dispatchMount.rows, detail.summary.key)}
              />
            )
            : (
              // AC 按钮位预留 (6.1 口径): the reserved disabled placeholder —
              // the same md-primary geometry the dispatch primary uses; the
              // M2 发起会话 entry retired with the ForgeBridge chain, so a
              // dock without the dispatch mount (seat/build-stage forms)
              // reserves the button slot instead.
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

          {dispatchMount !== undefined && (
            // The 编排 partition (task 3.9, ui-design: 置于执行记录之上) — the
            // FIRST body section (prototype dp-body order: 编排 → 描述 → 依赖链
            // → 执行记录 → 挂接历史), sharing the execute button's ONE controller.
            <DetailSection t={props.t} id="orchestration" titleKey="tasks.orch.section">
              <OrchestrationSection
                t={props.t}
                taskKey={detail.summary.key}
                taskTitle={detail.summary.title}
                rows={dispatchMount.rows}
                controller={detailController}
                {...(dispatchMount.onEnterSession === undefined ? {} : { onEnterSession: dispatchMount.onEnterSession })}
                onOpenApproval={dispatchMount.onOpenApproval}
              />
            </DetailSection>
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
