/**
 * The UF3 挂接历史 section body (task 5.7): the task's SessionLink rows in
 * the DTO's 新→旧 order — sessionId (mono), the active/ended 徽标 (active =
 * the brand-blue 会话中 pill, ended = the neutral 已结束 pill), and the
 * deterministic time range (startedAt, endedAt when present; the full ISOs
 * ride `title`). This list is the 回溯 target of SC3-3/6.3 (Story3 挂接
 * 历史可回溯).
 *
 * 「进入会话」 is a seam, not a build-stage behavior: rows carry the button
 * only when {@link LinkHistoryProps.onEnterSession} is present (5.11+ wire
 * the real session-view jump) — absent, rows stay informational.
 */
import { ChromeButton } from '../../../components/chrome/ChromeButton'
import type { SessionLink } from '../../../ipc-types'
import { badgeStyle } from '../TaskRow'
import { ghostButtonStyle } from '../launch/LaunchStates'
import { formatTimestamp } from '../../overview/format'
import type { TaskStatusTranslate } from '../../../i18n/task-status'

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

/** Inputs of {@link LinkHistory}. */
export interface LinkHistoryProps {
  /** The locale seat (the shell's `t`). */
  t: TaskStatusTranslate
  /** 挂接历史, 新→旧 (the DTO's order — rendered verbatim). */
  links: readonly SessionLink[]
  /** 「进入会话」 seam — absent rows stay informational (SC3-3/6.3 wire the jump). */
  onEnterSession?: ((sessionId: string) => void) | undefined
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
 * The link list. Empty input renders the section's empty hint (无挂接 is a
 * normal unlaunched-task state, not an error).
 */
export function LinkHistory(props: LinkHistoryProps) {
  if (props.links.length === 0) {
    return <p data-dsh-forge-detail-links-empty="" style={emptyHintStyle}>{props.t('detail.links.empty')}</p>
  }
  return (
    <ul data-dsh-forge-detail-links="" style={{ display: 'flex', flexDirection: 'column', gap: '6px', listStyle: 'none', margin: '0', padding: '0' }}>
      {props.links.map(link => (
        <li
          key={link.id}
          data-dsh-forge-detail-link={link.sessionId}
          data-link-status={link.status}
          style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '8px', minWidth: 0 }}
        >
          <span title={link.sessionId} style={monoSecondaryStyle}>{link.sessionId}</span>
          <span data-dsh-forge-badge={`link:${link.status}`} style={link.status === 'active' ? activeBadgeStyle : badgeStyle}>
            {props.t(link.status === 'active' ? 'detail.links.active' : 'detail.links.ended')}
          </span>
          <time dateTime={link.startedAt} title={linkRangeTitle(link)} style={timeStyle}>
            {linkRangeLabel(link)}
          </time>
          {props.onEnterSession !== undefined && (
            <ChromeButton
              type="button"
              data-dsh-forge-detail-enter={link.sessionId}
              style={ghostButtonStyle}
              onClick={() => { props.onEnterSession?.(link.sessionId) }}
            >
              {props.t('detail.links.enter')}
            </ChromeButton>
          )}
        </li>
      ))}
    </ul>
  )
}
