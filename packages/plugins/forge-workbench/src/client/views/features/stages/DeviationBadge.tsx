/**
 * The UF2 deviation badge, BUILD half (task 4.3, ui-design UF2 偏离徽标 /
 * PRD UF2 deviated 态): the warn Pill 「⚠ 偏离」 the feature card AND the
 * detail header carry once a deviation watcher verdict lands (4.2's
 * `deviation_detected` event → the assembly's board state, wired by 4.4).
 *
 * Hard Rule (task 4.3): 偏离标识仅为呈现,不产生阻断交互 — the badge is a
 * plain `<span>` by construction: no onClick, no role, no tabIndex, no
 * pointer cursor. The ONLY affordance is the native `title` tooltip
 * (「外部会话存在跨阶段操作」); the PRD's 不阻断 discipline means there is
 * nothing to click through to — zero click actions.
 *
 * Render rule (ui-design States deviated row): `deviated === true` renders;
 * any other value renders NOTHING (a non-deviated feature carries no badge,
 * never a muted placeholder).
 */
import type { FeatureStatusTranslate } from '../../../i18n/feature-status'

/** Inputs of {@link DeviationBadge}. */
export interface DeviationBadgeProps {
  /** The locale seat (the shell's `t`). */
  readonly t: FeatureStatusTranslate
  /** The deviation verdict (feature_snapshot.deviated via the assembly). */
  readonly deviated: boolean | undefined
}

/** ui-design 徽标 Pill geometry (the detail status pill's twin), warn-tinted. */
const badgeStyle = {
  borderRadius: '8px',
  border: '1px solid var(--dsw-alias-state-warn-primary, rgb(245, 158, 11))',
  color: 'var(--dsw-alias-state-warn-primary, rgb(245, 158, 11))',
  flex: '0 0 auto',
  fontSize: '12px',
  lineHeight: '18px',
  padding: '0 6px',
  whiteSpace: 'nowrap',
} as const

/**
 * The 「⚠ 偏离」 warn Pill — presentation only. Both mount points (the list
 * card's title row beside the status Pill, the detail header) render the
 * SAME component so the verdict can never fork visually between them
 * (ui-design: deviated 态 = 卡 + 详情).
 */
export function DeviationBadge(props: DeviationBadgeProps) {
  if (props.deviated !== true) return null
  return (
    <span
      data-dsh-forge-badge="deviation"
      title={props.t('features.stages.deviation.tooltip')}
      style={badgeStyle}
    >
      {props.t('features.stages.deviation')}
    </span>
  )
}
