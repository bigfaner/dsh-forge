/**
 * The UF3 挂接历史 section body (task 5.7; M4 2.6 增强 — ui-design §Component
 * C5, 裁决 #27: the enhancement lands INSIDE this section, no new panel, the
 * four accordion sections stay untouched): the task's SessionLink rows in the
 * DTO's 新→旧 order — sessionId (mono), the active/ended 徽标 (active = the
 * brand-blue 会话中 pill, ended = the neutral 已结束 pill), the deterministic
 * time range (startedAt, endedAt when present; the full ISOs ride `title`) —
 * now with the C5 enhancements:
 *
 *   行展开    EVERY row (active AND ended) carries a disclosure toggle — the
 *             linked TOP session's origin='subagent' descendants (the lineage
 *             service's deriveSessionLineage product, 点击时计算, 不落库);
 *             active = the CURRENT tree, ended = the historical snapshot
 *             (PRD UF5 查看历史). A session DISPOSED from the upstream byId
 *             stays expandable — its lineage slot reads 「不可用」.
 *   [打开]    the row-tail ghost (sm), DUAL channel (Interface 6): a TOP row
 *             rides its bare sessionId (the session-focus channel); a
 *             descendant entry rides the hit's address triple
 *             (SubagentAddress). The M3 onEnterSession seam is EXTENDED over
 *             both shapes — 2.7's session-open.ts lands the channel itself;
 *             a rejecting (promise) return surfaces the Open-failed toast
 *             (打开失败不静默).
 *   No-link   「未挂接会话」+ [发起] sm primary (the M3 dispatch chain through
 *             the panel's controller); TERMINAL task states (completed/
 *             skipped/rejected) disable it (todo#30).
 *   degraded  the lineage seat present but its snapshot absent =
 *             inference-degraded — 仅顶层 rows (no expansion), the 血缘位
 *             reads 「不可用」 inline, the top [打开] stays live.
 *
 * Seam discipline (5.7's, kept): rows carry [打开] only when onEnterSession
 * is present; the expansion/degraded presentation mounts only when the
 * `lineage` seat is present; [发起] mounts only when onLaunch is — absent
 * seams keep the section's M2/M3 informational form verbatim.
 */
import { useState } from 'react'
import { ChromeButton } from '../../../components/chrome/ChromeButton'
import type { SessionLink } from '../../../ipc-types'
import { badgeStyle } from '../TaskRow'
import { ghostButtonStyle } from '../launch/LaunchStates'
import { formatTimestamp } from '../../overview/format'
import type { TaskStatusTranslate } from '../../../i18n/task-status'
import { deriveSessionLineage } from '../../../lineage'
import type { LineageSessionsSnapshot, LineageSubagentAddress } from '../../../lineage'
import { LinkDescendants } from './LinkDescendants'

/**
 * Interface 6's target union, the C5 form (tech-design §Interfaces·Interface
 * 6): a TOP link row rides its bare sessionId (the session-focus channel);
 * a subagent descendant rides the lineage hit's address triple verbatim.
 * 2.6 hosts the SEAM only — the channel implementation (openSessionTarget)
 * is 2.7's session-open.ts.
 */
export type SessionOpenTarget = string | LineageSubagentAddress

/** The dual-channel open seam's shape (a promise return lets failures toast). */
export type EnterSessionSeam = (target: SessionOpenTarget) => void | Promise<unknown>

/** The C5 lineage seat (M4 2.6): see {@link LinkHistoryProps.lineage}. */
export interface LinkHistoryLineageSeat {
  /**
   * The upstream sessions snapshot (the guarded adapter's read). ABSENT within
   * a present seat = inference-degraded (仅顶层 + 血缘位「不可用」).
   */
  readonly snapshot?: LineageSessionsSnapshot | undefined
}

/** 空分区 hint: one 12/18 secondary line (ui-design UF3 空分区). */
const emptyHintStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0',
} as const

/** The active-挂接 badge: brand blue (the UF5 会话中 pill form). */
const activeBadgeStyle = {
  ...badgeStyle,
  border: '1px solid var(--dsw-alias-link, rgb(65, 118, 230))',
  color: 'var(--dsw-alias-link, rgb(65, 118, 230))',
} as const

/** 12/18 mono secondary (session ids — the ui-design 代码栈 text). */
const monoSecondaryStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  flex: '0 0 auto',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '12px',
  lineHeight: '18px',
} as const

/** The time range: 12/18 secondary, ISO originals on `title`. */
const timeStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  flex: '0 0 auto',
  fontSize: '12px',
  lineHeight: '18px',
  whiteSpace: 'nowrap',
} as const

/** The 血缘位 「不可用」 次文字 (degraded inline + the disposed expansion slot). */
const unavailableStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  flex: '0 0 auto',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0',
  whiteSpace: 'nowrap',
} as const

/** The 行展开 disclosure toggle (the C3 caret geometry: ▸ rotating 0.2s). */
const toggleStyle = {
  alignItems: 'center',
  background: 'transparent',
  border: 'none',
  borderRadius: '6px',
  color: 'var(--dsw-alias-label-secondary, inherit)',
  cursor: 'pointer',
  display: 'inline-flex',
  flex: '0 0 auto',
  font: 'inherit',
  height: '24px',
  justifyContent: 'center',
  padding: '0 4px',
  width: '24px',
} as const

/** ui-design sm primary pill (h28 r14, brand fill — the 去审批 precedent). */
const smPrimaryButtonStyle = {
  background: 'var(--dsw-alias-link, rgb(65, 118, 230))',
  border: 'none',
  borderRadius: '14px',
  color: '#fff',
  cursor: 'pointer',
  font: 'inherit',
  height: '28px',
  padding: '0 12px',
} as const

/** The Open-failed toast (the overview toast precedent: status + live region + ✕). */
const toastStyle = {
  alignItems: 'center',
  background: 'var(--dsh-bg, Canvas)',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '12px',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
  display: 'flex',
  gap: '8px',
  margin: '6px 0 0',
  padding: '8px 12px',
} as const

/** Inputs of {@link LinkHistory}. */
export interface LinkHistoryProps {
  /** The locale seat (the shell's `t`). */
  t: TaskStatusTranslate
  /** 挂接历史, 新→旧 (the DTO's order — rendered verbatim). */
  links: readonly SessionLink[]
  /**
   * The C5 lineage seat (M4 2.6): PRESENT = the lineage capability is wired
   * behind the board — rows gain the 行展开 toggle; `snapshot` ABSENT within
   * the seat = inference-degraded (仅顶层 rows + the 血缘位 「不可用」).
   */
  lineage?: LinkHistoryLineageSeat | undefined
  /**
   * The No-link state's [发起] seam (ui-design C5 States·No-link): the M3
   * dispatch chain — the panel wires its controller's startDispatch. Absent =
   * the empty hint stays informational (the seam discipline).
   */
  onLaunch?: (() => void) | undefined
  /** todo#30: the task's TERMINAL state (completed/skipped/rejected) → [发起] disabled. */
  launchDisabled?: boolean | undefined
  /**
   * 「打开」 dual-channel seam (M3's 进入会话 seam, EXTENDED to both target
   * shapes — tech-design §Integration #2): top rows pass the sessionId
   * string; descendant entries pass the address triple. A rejecting
   * (promise) return surfaces the Open-failed toast — never silent.
   */
  onEnterSession?: EnterSessionSeam | undefined
}

/** The row's time range: `start — end` (ended) or `start` (active). */
function linkRangeLabel(link: SessionLink): string {
  return link.endedAt === null
    ? formatTimestamp(link.startedAt)
    : `${formatTimestamp(link.startedAt)} — ${formatTimestamp(link.endedAt)}`
}

/** The row's `title`: the full ISO originals (nothing lost to formatting). */
function linkRangeTitle(link: SessionLink): string {
  return link.endedAt === null ? link.startedAt : `${link.startedAt} — ${link.endedAt}`
}

/**
 * A promise-like return of the open seam (void implementations never toast).
 * Exported for the seam's fire-and-forget consumers (TasksPane's ⟞, the
 * board's enter handler): they run the same guard to swallow a rejecting
 * return per-site, mirroring this section's own toast discipline.
 */
export const isThenable = (value: void | Promise<unknown>): value is Promise<unknown> =>
  typeof (value as Promise<unknown> | undefined)?.then === 'function'

/**
 * The link list — the C5 挂接历史 增强 face. Empty input renders the
 * section's No-link state (无挂接 is a normal unlaunched-task state, not an
 * error): the 「未挂接会话」 hint + the [发起] sm primary when the seam rides.
 */
export function LinkHistory(props: LinkHistoryProps) {
  // The 行展开 set (session ids) + the Open-failed toast bit — both LOCAL to
  // this section; a task switch simply addresses different ids (stale ids in
  // the set are inert — rows not rendered never read them).
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  const [openFailed, setOpenFailed] = useState(false)

  /** Fire the dual-channel seam; a rejecting return degrades to the toast. */
  const openTarget = (target: SessionOpenTarget): void => {
    const result = props.onEnterSession?.(target)
    if (result !== undefined && isThenable(result)) {
      void result.catch(() => { setOpenFailed(true) })
    }
  }

  const toggleExpanded = (sessionId: string): void => {
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      return next
    })
  }

  if (props.links.length === 0) {
    return (
      <div data-dsh-forge-detail-links-empty-block="" style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        <p data-dsh-forge-detail-links-empty="" style={{ ...emptyHintStyle, margin: '0' }}>{props.t('detail.links.empty')}</p>
        {props.onLaunch !== undefined && (
          <ChromeButton
            type="button"
            disabled={props.launchDisabled === true}
            {...(props.launchDisabled === true
              ? { title: props.t('detail.links.launch.terminal') }
              : {})}
            data-dsh-forge-detail-links-launch=""
            style={smPrimaryButtonStyle}
            onClick={() => { props.onLaunch?.() }}
          >
            {props.t('detail.links.launch')}
          </ChromeButton>
        )}
      </div>
    )
  }

  const seat = props.lineage
  const snapshot = seat?.snapshot
  // The seat's presence gates the whole expansion face; a seat WITHOUT a
  // snapshot is the inference-degraded form (仅顶层 — no toggles, the inline
  // 「不可用」 血缘位, the top [打开] stays live).
  const degraded = seat !== undefined && snapshot === undefined

  return (
    <>
      <ul data-dsh-forge-detail-links="" style={{ display: 'flex', flexDirection: 'column', gap: '6px', listStyle: 'none', margin: '0', padding: '0' }}>
        {props.links.map((link) => {
          const isExpanded = expanded.has(link.sessionId)
          const bodyId = `dsh-forge-detail-link-body-${link.sessionId}`
          // byId 缺席 = the session is disposed — the row stays expandable but
          // its lineage slot reads 「不可用」 (the 2.5 lineageAvailable contract).
          const lineageLive = snapshot !== undefined && snapshot.byId[link.sessionId] !== undefined
          return (
            <li
              key={link.id}
              data-dsh-forge-detail-link={link.sessionId}
              data-link-status={link.status}
              style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}
            >
              <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '8px', minWidth: 0 }}>
                {seat !== undefined && !degraded && (
                  <ChromeButton
                    type="button"
                    aria-expanded={isExpanded}
                    aria-controls={bodyId}
                    aria-label={props.t(isExpanded ? 'detail.links.lineage.collapse' : 'detail.links.lineage.expand')}
                    title={props.t(isExpanded ? 'detail.links.lineage.collapse' : 'detail.links.lineage.expand')}
                    data-dsh-forge-detail-link-toggle={link.sessionId}
                    style={toggleStyle}
                    onClick={() => { toggleExpanded(link.sessionId) }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        display: 'inline-block',
                        transform: isExpanded ? 'rotate(90deg)' : 'none',
                        transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      }}
                    >
                      ▸
                    </span>
                  </ChromeButton>
                )}
                <span title={link.sessionId} style={monoSecondaryStyle}>{link.sessionId}</span>
                <span data-dsh-forge-badge={`link:${link.status}`} style={link.status === 'active' ? activeBadgeStyle : badgeStyle}>
                  {props.t(link.status === 'active' ? 'detail.links.active' : 'detail.links.ended')}
                </span>
                <time dateTime={link.startedAt} title={linkRangeTitle(link)} style={timeStyle}>
                  {linkRangeLabel(link)}
                </time>
                {degraded && (
                  // 血缘位 「不可用」 次文字 — the inference-degraded inline slot.
                  <span data-dsh-forge-detail-lineage-off={link.sessionId} style={unavailableStyle}>
                    {props.t('detail.links.lineage.unavailable')}
                  </span>
                )}
                {props.onEnterSession !== undefined && (
                  <ChromeButton
                    type="button"
                    data-dsh-forge-detail-enter={link.sessionId}
                    style={ghostButtonStyle}
                    onClick={() => { openTarget(link.sessionId) }}
                  >
                    {props.t('detail.links.open')}
                  </ChromeButton>
                )}
              </div>
              {seat !== undefined && !degraded && isExpanded && (
                <div
                  id={bodyId}
                  data-dsh-forge-detail-link-body={link.sessionId}
                  style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '32px' }}
                >
                  {lineageLive
                    ? (
                      () => {
                        // 点击时计算 (2.5's discipline): the row's OWN tree — active
                        // = the current tree, ended = the historical snapshot.
                        const derived = deriveSessionLineage(link.sessionId, snapshot)
                        if (derived.timedOut) {
                          return (
                            <p data-dsh-forge-detail-lineage-unavailable={link.sessionId} style={unavailableStyle}>
                              {props.t('detail.links.lineage.unavailable')}
                            </p>
                          )
                        }
                        return (
                          <LinkDescendants
                            t={props.t}
                            hits={derived.hits}
                            total={derived.total}
                            openEnabled={props.onEnterSession !== undefined}
                            onOpen={(hit) => { openTarget(hit.address) }}
                          />
                        )
                      }
                    )()
                    : (
                      <p data-dsh-forge-detail-lineage-unavailable={link.sessionId} style={unavailableStyle}>
                        {props.t('detail.links.lineage.unavailable')}
                      </p>
                    )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {openFailed && (
        // Open-failed 态 (ui-design C5 States): toast 错误,不静默 — a rejecting
        // open seam lands here whichever channel fired it (top or subagent).
        <div role="status" aria-live="polite" data-dsh-forge-detail-links-toast="" style={toastStyle}>
          <p style={{ ...emptyHintStyle, margin: '0' }}>{props.t('detail.links.openFailed')}</p>
          <ChromeButton
            type="button"
            aria-label={props.t('detail.links.openFailed.dismiss')}
            data-dsh-forge-detail-links-toast-dismiss=""
            style={{ ...ghostButtonStyle, height: '24px', padding: '0 8px' }}
            onClick={() => { setOpenFailed(false) }}
          >
            <span aria-hidden="true">✕</span>
          </ChromeButton>
        </div>
      )}
    </>
  )
}
