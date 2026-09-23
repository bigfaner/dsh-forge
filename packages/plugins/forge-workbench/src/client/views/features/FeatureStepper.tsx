/**
 * The UF4 feature 状态机 stepper, BUILD half (task 5.9): the five-phase
 * progression the detail subview renders (ui-design UF4 详情子视图:
 * `●────●────○────○────○` — 当前/已达态 = 品牌蓝, 未达 = border-l3; 标签一律
 * 全称, 2026-09-22 原型修订统一).
 *
 * Hard Rule: the phase set/order/labels ALL come from the ONE feature-status
 * vocabulary (i18n/feature-status.ts — FEATURE_STATUSES order +
 * FEATURE_STATUS_PHASE mapping + the shared label routing); this file holds
 * no second copy of the vocabulary by construction.
 *
 * Accessibility (ui-design 全局规则: stepper 携带 aria-label 状态全称; 当前态
 * 高亮可达性合规): the list carries an aria-label; every node's label text IS
 * the 状态全称 (the verbatim token); the CURRENT phase marks aria-current
 * ="step" — the screen-reader-visible "you are here".
 */
import type { FeatureStatus } from '../../ipc-types'
import {
  FEATURE_STATUSES, FEATURE_STATUS_PHASE, featureStatusLabel,
} from '../../i18n/feature-status'
import type { FeatureStatusTranslate } from '../../i18n/feature-status'

/** Inputs of {@link FeatureStepper}. */
export interface FeatureStepperProps {
  /** The locale seat (the shell's `t`). */
  t: FeatureStatusTranslate
  /** The feature's manifest status — the phase cursor. */
  status: FeatureStatus
}

const stepperStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
} as const

const trackStyle = {
  alignItems: 'flex-start',
  display: 'flex',
  listStyle: 'none',
  margin: 0,
  padding: 0,
  width: '100%',
} as const

/** One phase cell: dot above its label, both centered (the track's equal columns). */
const phaseStyle = {
  alignItems: 'center',
  display: 'flex',
  flexDirection: 'column',
  flex: '1 1 0',
  gap: '6px',
  minWidth: 0,
} as const

/** The node dot: 10px circle. Reached/current = 品牌蓝 fill; unreached = border-l3 hollow. */
const dotStyle = {
  borderRadius: '50%',
  borderStyle: 'solid',
  borderWidth: '2px',
  flex: '0 0 auto',
  height: '10px',
  width: '10px',
} as const

const dotReachedStyle = {
  ...dotStyle,
  background: 'var(--dsw-alias-link, rgb(65, 118, 230))',
  borderColor: 'var(--dsw-alias-link, rgb(65, 118, 230))',
} as const

const dotPendingStyle = {
  ...dotStyle,
  background: 'transparent',
  borderColor: 'var(--dsh-border-color, CanvasText)',
} as const

/** The current node's ring — the extra current-state signal beyond the fill. */
const currentRing = '0 0 0 3px var(--dsh-interactive-bg-hover, rgba(128, 128, 128, 0.3))'

/** The phase label: 12/18 全称 (verbatim token, never abbreviated). */
const labelStyle = {
  fontSize: '12px',
  lineHeight: '18px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

const labelSecondaryStyle = {
  ...labelStyle,
  color: 'var(--dsw-alias-label-secondary, inherit)',
} as const

/**
 * The five-phase stepper. Reached phases (≤ the status's phase index) fill
 * brand blue; the current one additionally carries aria-current="step" + the
 * ring; unreached phases stay hollow (border-l3).
 */
export function FeatureStepper(props: FeatureStepperProps) {
  const currentPhase = FEATURE_STATUS_PHASE[props.status]
  return (
    <div data-dsh-forge-feature-stepper="" style={stepperStyle}>
      <ol aria-label={props.t('features.stepper.label')} style={trackStyle}>
        {FEATURE_STATUSES.map((phase, index) => {
          const reached = index <= currentPhase
          const current = index === currentPhase
          const label = featureStatusLabel(phase, props.t)
          return (
            <li
              key={phase}
              aria-current={current ? 'step' : undefined}
              data-dsh-forge-stepper-phase={phase}
              data-dsh-forge-stepper-state={current ? 'current' : reached ? 'reached' : 'pending'}
              style={phaseStyle}
            >
              <span
                aria-hidden="true"
                style={{
                  ...(reached ? dotReachedStyle : dotPendingStyle),
                  ...(current ? { boxShadow: currentRing } : {}),
                }}
              />
              <span title={label} style={reached ? labelStyle : labelSecondaryStyle}>{label}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
