/**
 * The UF6 tier badge (task 5.12, ui-design 插件管理区 行结构): the 「必备」
 * 中性填充 Pill a mandatory row carries — the ONLY tier marker in the section
 * (third-party rows never wear one). Purely informational: the badge is a
 * passive span, never a control (a mandatory row renders zero writable
 * elements — SC6 行为口径 / task Hard Rule).
 *
 * Styles stay inline (no stylesheet pipeline — Hard Rule): the neutral fill
 * rides the host interactive-bg var, light/dark alike.
 */
import type { WorkbenchKey } from '../../../locale/en'

/** ui-design 徽标用 Pill geometry: 12/18, r9 filled (neutral fill for 必备). */
const badgeStyle = {
  alignItems: 'center',
  background: 'var(--dsh-interactive-bg-hover, rgba(128, 128, 128, 0.2))',
  borderRadius: '9px',
  display: 'inline-flex',
  flex: '0 0 auto',
  fontSize: '12px',
  lineHeight: '18px',
  padding: '1px 8px',
  whiteSpace: 'nowrap',
} as const

/** Inputs of {@link MandatoryBadge}. */
export interface MandatoryBadgeProps {
  /** The locale seat (the shell's `t`) — `overview.plugins.mandatoryBadge`. */
  t: (key: WorkbenchKey) => string
}

/** The 「必备」Pill — passive by construction (a span, not a control). */
export function MandatoryBadge(props: MandatoryBadgeProps) {
  return (
    <span data-dsh-forge-plugin-mandatory-badge="" style={badgeStyle}>
      {props.t('overview.plugins.mandatoryBadge')}
    </span>
  )
}
