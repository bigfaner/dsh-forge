/**
 * The UF4 层级 segmented, BUILD half (task 5.1, ui-design 偏好编辑面
 * Layout/States): 全局 | 项目 | Feature — pad 8 14 · r14, 选中态同 tab 形态
 * (interactive-bg-hover fill + label-primary), the M2 tab geometry.
 *
 * Disabled contract (ui-design States project-tier / feature-tier rows +
 * AC1): a tier without its premise renders DISABLED with the reason as the
 * native `title` tooltip — 「项目」 needs an active project (无激活项目时仅
 * 「全局」可用), 「Feature」 needs an active project AND ≥1 feature. The label
 * carries the binding context when present (「项目 · {name}」), the bare tier
 * name otherwise (the tooltip explains why it is dim).
 */
import type { WorkbenchKey } from '../../../locale/en'

/** The three preference tiers (the segmented's closed set). */
export type PrefTier = 'global' | 'project' | 'feature'

/** Inputs of {@link ScopeSegmented}. */
export interface ScopeSegmentedProps {
  /** The locale seat (the shell's `t`). */
  readonly t: (key: WorkbenchKey) => string
  /** The selected tier (parent-owned; click handlers fire onTierChange). */
  readonly tier: PrefTier
  /** Selection seam — only ENABLED tiers fire this (disabled is terminal). */
  readonly onTierChange: (tier: PrefTier) => void
  /** No active project → the 项目 tier is disabled + tooltip (仅「全局」可用). */
  readonly projectDisabled: boolean
  /** No active project or no features → the Feature tier is disabled + tooltip. */
  readonly featureDisabled: boolean
  /** The bound project's display name (the 项目 tier's label context). */
  readonly projectLabel?: string | undefined
}

/** ui-design segmented: pad 8 14 · r14 (the tab form), group wrap. */
const groupStyle = {
  display: 'inline-flex',
  gap: '2px',
} as const

const segmentStyle = {
  background: 'transparent',
  border: 'none',
  borderRadius: '14px',
  color: 'inherit',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: '14px',
  lineHeight: '22px',
  padding: '8px 14px',
} as const

/** 选中态同 tab 形态:interactive-bg-hover fill (the M2 selected-tab token). */
const selectedStyle = {
  ...segmentStyle,
  background: 'var(--dsh-interactive-bg-hover, rgba(128, 128, 128, 0.2))',
  color: 'var(--dsw-alias-label-primary, inherit)',
} as const

const disabledStyle = {
  ...segmentStyle,
  color: 'var(--dsw-alias-label-secondary, inherit)',
  cursor: 'default',
  opacity: 0.5,
} as const

/**
 * The three-tier segmented. Selected = the tab-form fill; disabled tiers
 * carry the reason tooltip and never fire (ui-design: disabled 是唯一形态,
 * 无隐藏入口)。`aria-pressed` carries the selection (a segmented control of
 * toggle buttons, the M3 例外先例's Button focus contract — native buttons,
 * no extra chrome).
 */
export function ScopeSegmented(props: ScopeSegmentedProps) {
  const t = props.t
  const projectTitle = props.projectDisabled ? t('overview.prefs.tier.projectDisabled') : undefined
  const featureTitle = props.featureDisabled ? t('overview.prefs.tier.featureDisabled') : undefined
  const projectText = props.projectDisabled || props.projectLabel === undefined
    ? t('overview.prefs.tier.project')
    : t('overview.prefs.tier.projectNamed').replace('{name}', props.projectLabel)

  const segment = (
    tier: PrefTier,
    label: string,
    disabled: boolean,
    title: string | undefined,
  ): React.ReactElement => {
    const style = props.tier === tier ? selectedStyle : disabled ? disabledStyle : segmentStyle
    return (
      <button
        key={tier}
        type="button"
        data-dsh-forge-pref-tier={tier}
        data-dsh-forge-pref-tier-selected={props.tier === tier ? 'true' : 'false'}
        aria-pressed={props.tier === tier ? 'true' : 'false'}
        disabled={disabled}
        title={title}
        style={style}
        onClick={() => { if (!disabled && props.tier !== tier) props.onTierChange(tier) }}
      >
        {label}
      </button>
    )
  }

  return (
    <div role="group" aria-label={t('overview.prefs.title')} data-dsh-forge-pref-tiers="" style={groupStyle}>
      {segment('global', t('overview.prefs.tier.global'), false, undefined)}
      {segment('project', projectText, props.projectDisabled, projectTitle)}
      {segment('feature', t('overview.prefs.tier.feature'), props.featureDisabled, featureTitle)}
    </div>
  )
}
