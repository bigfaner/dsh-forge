/**
 * The 会话运行中 badge (task 5.11, AC3): the ONE shared renderer every
 * surface — 视图 A node card / 视图 B card / 视图 C row / UF3 侧板 header —
 * mounts when the task carries an ACTIVE session_link. Same shape family as
 * TaskBadges' cluster (badgeStyle capsule, 12/18) with the live tint
 * (--dsw-alias-link border) so 运行中 reads as the brand-active state, not a
 * warning. Pure presentation: the data source (active link map) is the board
 * session store's, threaded down as a controlled prop — this file owns no
 * state, so the four mounts cannot drift.
 */
import type { WorkbenchKey } from '../../locale/en'

/**
 * The capsule geometry (TaskBadges' badgeStyle twin, inlined DELIBERATELY:
 * importing it from TaskRow would create a module-evaluation cycle — TaskRow
 * imports this component for its cluster — whose TDZ the browser bundle
 * trips over; the geometry is 8 frozen lines, the cycle is a boot crash).
 */
const liveBadgeStyle = {
  borderRadius: '8px',
  border: '1px solid var(--dsw-alias-link, rgb(65, 118, 230))',
  color: 'var(--dsw-alias-link, rgb(65, 118, 230))',
  flex: '0 0 auto',
  fontSize: '12px',
  lineHeight: '18px',
  padding: '0 6px',
  whiteSpace: 'nowrap',
} as const

/** Inputs of {@link SessionBadge}. */
export interface SessionBadgeProps {
  /** The locale seat (the shell's `t`). */
  t: (key: WorkbenchKey) => string
  /** The active link's session id; undefined = no live session (renders nothing). */
  sessionId: string | undefined
}

/**
 * The 运行中 badge. Renders NOTHING without an active link — the badge's
 * absence is the ended/never-launched state (结束事件 drops it via the store).
 */
export function SessionBadge(props: SessionBadgeProps) {
  if (props.sessionId === undefined) return null
  return (
    <span
      data-dsh-forge-badge="session-live"
      data-dsh-forge-session-id={props.sessionId}
      style={liveBadgeStyle}
      title={props.sessionId}
    >
      {props.t('tasks.badge.sessionLive')}
    </span>
  )
}
