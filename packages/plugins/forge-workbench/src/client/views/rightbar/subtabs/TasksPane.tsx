/**
 * The 项目概览 → 任务 sub-tab (M4 task 2.3, layout §4.4③): the pane's task
 * list — the 执行中分组 (BIZ-workbench-008's exact matrix via the ONE
 * judgeExecuting authority, each row carrying the ⟞ 直达会话 entry over the
 * Interface 6 open seam 2.7 landed) above the 全量列表, plus the pane's
 * SINGLE [依赖图] button (the depgraph tab's only entry, §4.6 — the kind 2.4
 * owns; the openTab seam carries the open today).
 *
 * Row click = 任务详情 dock (AC3): the C6 「查看任务」 shape verbatim — the
 * shared board-session selection opens the dock, ensureBoardActive brings the
 * board pane forward (the seam arrives wired; the pane never reaches for the
 * controller itself). 归档只读 (AC4/Story 5): an archived project HIDES the
 * 执行中 group (the rows would promise a running session the archive froze).
 *
 * 零缩水 discipline: the row language rides the M3 vocabularies — the task
 * status short label (i18n/task-status) and the same `{ task, links }`
 * sources the C6 bar reads. The M3 board (full table/kanban + dock) stays
 * the board tab's own face — this pane is the overview's light list.
 */
import type { ReactNode } from 'react'
import type { WorkbenchKey } from '../../../locale/en'
import { taskStatusShortLabel } from '../../../i18n/task-status'
import { fillTemplate } from '../../overview/format'
import { isThenable, type EnterSessionSeam } from '../../tasks/detail/LinkHistory'
import { activeLinkOf, deriveExecutingTasks, type OverviewTaskSource } from '../overview-model'

/** The sources read's phase (OverviewTab owns the read; the pane renders it). */
export type TaskSourcesPhase = 'loading' | 'ready'

/** Inputs of {@link TasksPane}. */
export interface TasksPaneProps {
  /** The locale seat (the plugin's bound `t`). */
  t: (key: WorkbenchKey) => string
  /** The `{ task, links }` rows (the C6 source twin); undefined = in flight. */
  sources: readonly OverviewTaskSource[] | undefined
  /** The shared read's phase (loading 骨架 / ready). */
  phase: TaskSourcesPhase
  /** The derived 活跃 feature slug (the header row's qualifier). */
  activeFeatureSlug?: string | undefined
  /** 归档只读: true HIDES the 执行中 group (概览转只读, AC4). */
  archived?: boolean | undefined
  /** The row-click → 任务详情 dock seam (the C6 查看任务 shape). */
  onOpenTask: (taskKey: string) => void
  /**
   * The ⟞ 直达会话 seam (Interface 6, 2.7's openSessionTarget — the ACTIVE
   * link's top session id); absent = the entry point stays hidden, never a
   * dead button.
   */
  onEnterSession?: EnterSessionSeam | undefined
  /** The 唯一 [依赖图] button's open seam (the depgraph tab, §4.6). */
  onOpenDepgraph: () => void
}

/** The pane's column (the pane family's shared geometry). */
const rootStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  minWidth: 0,
  padding: '10px 8px',
} as const

/** The header row: 全部任务 · slug + the 唯一 [依赖图] button. */
const headerStyle = {
  alignItems: 'center',
  display: 'flex',
  gap: '8px',
  minWidth: 0,
  padding: '4px 6px 8px',
} as const

const headerTitleStyle = {
  flex: '1 1 auto',
  fontSize: '13px',
  fontWeight: 500,
  lineHeight: '20px',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

/** sm primary pill (the [依赖图] CTA — the M3 retry pill's geometry). */
const depButtonStyle = {
  background: 'var(--dsw-alias-link, rgb(65, 118, 230))',
  border: 'none',
  borderRadius: '14px',
  color: '#fff',
  cursor: 'pointer',
  flex: '0 0 auto',
  font: 'inherit',
  fontSize: '12px',
  lineHeight: '18px',
  padding: '4px 12px',
} as const

/** The section label (执行中(N) / 任务列表): 12/18 secondary. */
const sectionStyle = {
  color: 'var(--dsw-alias-label-secondary, rgb(97, 102, 107))',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0',
  padding: '8px 6px 4px',
} as const

/** One task row: full-width activation target (the ProposalList div-row
 * pattern — a plain div keeps the ⟞ a REAL button, no nested interactive). */
const rowStyle = {
  alignItems: 'center',
  borderRadius: '8px',
  cursor: 'pointer',
  display: 'flex',
  gap: '6px',
  minWidth: 0,
  padding: '6px 6px',
} as const

/** The mono task key slot (the 看板限定地址, 代码栈 treatment). */
const keyStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  flex: '0 1 auto',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '12px',
  lineHeight: '18px',
  maxWidth: '45%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

/** The title slot: 13/20, 单行截断. */
const titleStyle = {
  flex: '1 1 auto',
  fontSize: '13px',
  lineHeight: '20px',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

/** The status/⟞ trailing slot. */
const trailingStyle = {
  color: 'var(--dsw-alias-label-secondary, rgb(97, 102, 107))',
  flex: '0 0 auto',
  fontSize: '12px',
  lineHeight: '18px',
  whiteSpace: 'nowrap',
} as const

/** The ⟞ 直达会话 entry (a link-styled sm button; brand blue). */
const gotoStyle = {
  ...trailingStyle,
  background: 'transparent',
  border: 'none',
  color: 'var(--dsw-alias-link, rgb(65, 118, 230))',
  cursor: 'pointer',
  flex: '0 0 auto',
  font: 'inherit',
  fontSize: '12px',
  lineHeight: '18px',
  padding: '0',
} as const

/** The running dot (执行中 rows): a breathing accent (§4.4③'s ●). */
const runningDotStyle = {
  background: 'var(--dsw-alias-state-success-primary, rgb(34, 197, 94))',
  borderRadius: '50%',
  flex: '0 0 auto',
  height: '6px',
  width: '6px',
} as const

/** Skeleton gray rows (the family's loading 态). */
const skeletonRowStyle = {
  background: 'var(--dsh-interactive-bg-hover, rgba(128, 128, 128, 0.2))',
  borderRadius: '8px',
  height: '28px',
} as const

const auxStyle = {
  ...sectionStyle,
  padding: '0 6px 8px',
} as const

/**
 * The 任务 list pane: 执行中分组 + 全量列表 + the 唯一 [依赖图] button.
 */
export function TasksPane(props: TasksPaneProps): ReactNode {
  const t = props.t
  const sources = props.sources ?? []
  const executing = deriveExecutingTasks(sources)

  const headerTitle = props.activeFeatureSlug === undefined
    ? t('rightbar.overview.tasks.all')
    : `${t('rightbar.overview.tasks.all')} · ${props.activeFeatureSlug}`

  return (
    <div data-dsh-forge-overview-tasks="" style={rootStyle}>
      <div style={headerStyle}>
        <span data-dsh-forge-overview-tasks-title="" title={headerTitle} style={headerTitleStyle}>
          {headerTitle}
        </span>
        <button
          type="button"
          data-dsh-forge-overview-depgraph-open=""
          style={depButtonStyle}
          onClick={props.onOpenDepgraph}
        >
          {t('rightbar.tab.depgraph')}
        </button>
      </div>

      {/* 执行中分组 — hidden on an archived project (AC4). */}
      {!props.archived && (
        <>
          <p style={sectionStyle}>
            {fillTemplate(t('rightbar.overview.tasks.executing'), { count: String(executing.length) })}
          </p>
          {props.phase === 'loading' && props.sources === undefined && (
            <div role="status" aria-label={t('rightbar.overview.tasks.all')} data-dsh-forge-overview-tasks-skeleton="">
              {[0, 1].map(index => <div key={index} aria-hidden="true" style={skeletonRowStyle} />)}
            </div>
          )}
          {props.phase === 'ready' && executing.length === 0 && (
            <p data-dsh-forge-overview-tasks-idle="" style={auxStyle}>{t('rightbar.overview.tasks.idle')}</p>
          )}
          {executing.map((source) => {
            const link = activeLinkOf(source.links)
            return (
              <div
                key={`exec-${source.task.key}`}
                role="button"
                tabIndex={0}
                data-dsh-forge-overview-task-exec={source.task.key}
                aria-label={`${source.task.key} · ${source.task.title}`}
                style={rowStyle}
                onClick={() => { props.onOpenTask(source.task.key) }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    props.onOpenTask(source.task.key)
                  }
                }}
              >
                <span aria-hidden="true" data-dsh-forge-overview-running-dot="" style={runningDotStyle} />
                <span title={source.task.key} style={keyStyle}>{source.task.key}</span>
                <span title={source.task.title} style={titleStyle}>{source.task.title}</span>
                {props.onEnterSession !== undefined && link !== undefined && (
                  <button
                    type="button"
                    data-dsh-forge-overview-goto-session={link.sessionId}
                    style={gotoStyle}
                    title={t('rightbar.overview.tasks.gotoSession')}
                    onClick={(event) => {
                      event.stopPropagation()
                      // Fire-and-forget enter: the seam may return the open
                      // channel's REJECTING promise — swallow per-site (this
                      // affordance's own toast face rides the M6 收口; the C5
                      // dock's [打开] rows are the seam's toast-carrying face).
                      const entering = props.onEnterSession?.(link.sessionId)
                      if (isThenable(entering)) entering.catch(() => {})
                    }}
                  >
                    ⟞ {t('rightbar.overview.tasks.gotoSession')}
                  </button>
                )}
              </div>
            )
          })}
        </>
      )}

      {/* 全量列表 (the M3 short-status vocabulary). */}
      <p style={sectionStyle}>{t('rightbar.overview.tasks.list')}</p>
      {props.phase === 'loading' && props.sources === undefined && (
        <div role="status" aria-label={t('rightbar.overview.tasks.list')} data-dsh-forge-overview-tasks-skeleton="">
          {[0, 1, 2, 3].map(index => <div key={index} aria-hidden="true" style={skeletonRowStyle} />)}
        </div>
      )}
      {props.phase === 'ready' && sources.length === 0 && (
        <p data-dsh-forge-overview-tasks-empty="" style={auxStyle}>{t('rightbar.overview.tasks.empty')}</p>
      )}
      {sources.map(source => (
        <div
          key={source.task.key}
          role="button"
          tabIndex={0}
          data-dsh-forge-overview-task={source.task.key}
          aria-label={`${source.task.key} · ${source.task.title}`}
          style={rowStyle}
          onClick={() => { props.onOpenTask(source.task.key) }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              props.onOpenTask(source.task.key)
            }
          }}
        >
          <span title={source.task.key} style={keyStyle}>{source.task.key}</span>
          <span title={source.task.title} style={titleStyle}>{source.task.title}</span>
          <span style={trailingStyle}>{taskStatusShortLabel(source.task.status, t)}</span>
        </div>
      ))}
    </div>
  )
}
