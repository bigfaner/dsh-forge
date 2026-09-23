/**
 * One UF6 plugin row (task 5.12, ui-design 插件管理区 Layout): the two-tier
 * form is driven SOLELY by `PluginRow.mandatory` (Interface 1 — the flag
 * derives from the product manifest, Interface 4):
 *
 *   mandatory row  — name + 「必备」Pill + StateDot status, and ZERO action
 *                    control: the disable affordance is NOT RENDERED (not
 *                    rendered-disabled — SC6 行为口径 / task Hard Rule; the
 *                    host-side guard is defense-in-depth, never the UI's
 *                    business);
 *   third-party    — name + StateDot status + the 启停 action (「禁用」sm
 *                    ghost while enabled — it opens the double-confirm — /
 *                    「启用」sm primary-ghost while disabled — a direct verb),
 *                    plus the sketch's second line: 第三方插件 · 禁用仅退出其
 *                    注入内容.
 *
 * The row itself is presentation-only: toggling routes through the section's
 * `onDisable` (the confirm dialog) / `onEnable` (direct) callbacks. The
 * transitioning spinner (ui-design States) renders INSIDE the action button
 * while the verb is in flight.
 *
 * Keyboard/a11y: the action is a native button (Enter/Space for free) and the
 * StateDot always sits beside its full text label (全局规则: 状态携带文字冗余,
 * never color-only). Styles stay inline (no stylesheet pipeline — Hard Rule).
 */
import type { PluginRow } from '../../../ipc-types'
import type { WorkbenchKey } from '../../../locale/en'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import { ChromeButton } from '../../../components/chrome/ChromeButton'
import { LaunchSpinner, ghostButtonStyle } from '../../tasks/launch/LaunchStates'
import { MandatoryBadge } from './MandatoryBadge'

/** Inputs of {@link PluginRowView}. */
export interface PluginRowViewProps {
  /** The locale seat (the shell's `t`). */
  t: (key: WorkbenchKey) => string
  /** The Interface 1 PluginRow DTO — `mandatory` drives the row's whole form. */
  row: PluginRow
  /** True while THIS row's verb is in flight (the transitioning 态's spinner). */
  pending: boolean
  /** The disable leg — opens the section's double-confirm dialog (ui-design). */
  onDisable: (row: PluginRow) => void
  /** The enable leg — the direct verb (no confirmation, ui-design). */
  onEnable: (row: PluginRow) => void
}

const rowStyle = {
  alignItems: 'center',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
  minWidth: '0',
} as const

/** The second line under a third-party row (12/18 secondary, full row width). */
const hintStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0',
} as const

const cellStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  minWidth: '0',
} as const

/** 插件名 14/22 (the sketch's ● placeholder becomes a quiet neutral glyph). */
const iconStyle = {
  background: 'var(--dsh-interactive-bg-hover, rgba(128, 128, 128, 0.2))',
  borderRadius: '5px',
  display: 'inline-block',
  flex: '0 0 auto',
  height: '14px',
  width: '14px',
} as const

const nameStyle = {
  fontSize: '14px',
  fontWeight: 600,
  lineHeight: '22px',
  margin: '0',
  minWidth: '0',
  overflowWrap: 'anywhere',
} as const

/** The status cell (StateDot + 文案 12/18) — pushed to the row's right end. */
const statusStyle = {
  alignItems: 'center',
  color: 'var(--dsw-alias-label-secondary, inherit)',
  display: 'inline-flex',
  flex: '0 0 auto',
  fontSize: '12px',
  gap: '6px',
  lineHeight: '18px',
  marginLeft: 'auto',
} as const

/** disabled 态 renders the status as 次文字 (ui-design States) — dimmed dot text. */
const statusDisabledStyle = {
  ...statusStyle,
  opacity: '0.7',
} as const

/** sm ghost pill (h28 r14) — the 「禁用」action (ui-design 第三方 enabled 态). */
const disableButtonStyle = {
  ...ghostButtonStyle,
  alignItems: 'center',
  display: 'inline-flex',
  flex: '0 0 auto',
  gap: '6px',
} as const

/** 「启用」sm 主 ghost — the same ghost geometry with the brand action color. */
const enableButtonStyle = {
  ...ghostButtonStyle,
  alignItems: 'center',
  color: 'var(--dsw-alias-link, rgb(65, 118, 230))',
  display: 'inline-flex',
  flex: '0 0 auto',
  gap: '6px',
} as const

/**
 * One row. `data-tier` / `data-enabled` carry the two-tier + runtime state
 * for the observation contract (tests + the 6.5 e2e SC6-1 DOM discipline).
 */
export function PluginRowView(props: PluginRowViewProps) {
  const { row, pending } = props
  const t = props.t
  return (
    <div
      data-dsh-forge-plugin-row={row.name}
      data-tier={row.mandatory ? 'mandatory' : 'third-party'}
      data-enabled={row.enabled ? 'true' : 'false'}
      style={cellStyle}
    >
      <div style={rowStyle}>
        <span aria-hidden="true" style={iconStyle} />
        <p style={nameStyle} title={row.name}>{row.name}</p>
        {row.mandatory && <MandatoryBadge t={t} />}
        <span
          data-dsh-forge-plugin-status=""
          aria-label={t(row.enabled ? 'overview.plugins.status.enabled' : 'overview.plugins.status.disabled')}
          style={row.enabled ? statusStyle : statusDisabledStyle}
        >
          <StateDot state={row.enabled ? 'ongoing' : 'idle'} />
          <span>{t(row.enabled ? 'overview.plugins.status.enabled' : 'overview.plugins.status.disabled')}</span>
        </span>
        {/* Third-party only — a mandatory row renders NO action element at all
            (Hard Rule); the section's pending spinner lives inside this button. */}
        {!row.mandatory && (
          <ChromeButton
            type="button"
            data-dsh-forge-plugin-action={row.enabled ? 'disable' : 'enable'}
            aria-busy={pending ? 'true' : undefined}
            style={row.enabled ? disableButtonStyle : enableButtonStyle}
            onClick={() => { (row.enabled ? props.onDisable : props.onEnable)(row) }}
          >
            {pending && <LaunchSpinner label={t('overview.plugins.transitioning')} />}
            {t(row.enabled ? 'overview.plugins.action.disable' : 'overview.plugins.action.enable')}
          </ChromeButton>
        )}
      </div>
      {!row.mandatory && <p style={hintStyle}>{t('overview.plugins.thirdPartyHint')}</p>}
    </div>
  )
}
