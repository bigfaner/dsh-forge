/**
 * The UF2 gate hint, BUILD half (task 4.3, ui-design UF2 gate-pending 态 /
 * page-map「stepper = StatusStepper + GateHint」): the 12/18 warn hint line
 * rendered BELOW the stepper when the current stage's gate is pending, plus
 * the advance-rejection guidance face (可推进/拒绝态与缺失清单引导 — the
 * ERR_STAGE_GATE_UNSATISFIED presentation the advance action lands in).
 *
 * Two data faces, one component:
 *   - `gatePending` (the passive face): the stepper's verdict line 「▲ 总结
 *     未生成——推进需先生成阶段总结」, hover tooltip = the generation path
 *     guidance. No click affordance (hover 引导 only, the ui-design
 *     Interactions row: hover 门提示行 → tooltip 生成引导,无点击动作).
 *   - `rejection` (the advance-rejected face): the verb's normalized
 *     rejection envelope. ERR_STAGE_GATE_UNSATISFIED renders the guidance
 *     block — title line + the kernel's own detail string (引导文案 + 缺失
 *     清单: the missing asset path + the forge_stage_summarize generation
 *     path, mono so the path reads as an address); any other code renders
 *     the generic error line (the 兜底 discipline — classified errors only).
 *
 * The rejection detail is the KERNEL's own copy (advance-service.ts mints it;
 * tech-design §Error Types: 推进拒绝 + 缺失清单引导 = UF2 gate-hint) — this
 * component never recomposes it, so the guidance can never drift from what
 * the tool面 surfaces in-session.
 */
import type { FeatureStatusTranslate } from '../../../i18n/feature-status'
import { normalizeWorkbenchVerbError } from '../../../ipc/workbench'

/** Inputs of {@link GateHint}. */
export interface GateHintProps {
  /** The locale seat (the shell's `t`). */
  readonly t: FeatureStatusTranslate
  /** The gate verdict: current stage summary NOT generated (the stepper line renders). */
  readonly gatePending?: boolean | undefined
  /** The advance verb's rejection (either envelope form; the guidance block renders). */
  readonly rejection?: unknown
}

/** 12/18 warn hint line (ui-design 提示行;warn tint = the gate-pending accent). */
const hintLineStyle = {
  color: 'var(--dsw-alias-state-warn-primary, rgb(245, 158, 11))',
  fontSize: '12px',
  lineHeight: '18px',
  margin: 0,
} as const

/** The rejection guidance block: warn-tinted title + the kernel detail verbatim. */
const guidanceStyle = {
  border: '1px solid var(--dsw-alias-state-warn-primary, rgb(245, 158, 11))',
  borderRadius: '8px',
  color: 'var(--dsw-alias-label-primary, inherit)',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  margin: 0,
  padding: '8px 10px',
} as const

const guidanceTitleStyle = {
  color: 'var(--dsw-alias-state-warn-primary, rgb(245, 158, 11))',
  fontSize: '13px',
  fontWeight: 500,
  lineHeight: '20px',
} as const

/** The kernel's missing-list guidance line — mono (it carries a file address). */
const guidanceDetailStyle = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '12px',
  lineHeight: '18px',
  margin: 0,
  overflowWrap: 'anywhere',
  whiteSpace: 'pre-wrap',
} as const

/**
 * The gate hint line + rejection guidance. Renders nothing when neither face
 * is armed (gate satisfied and no rejection — the normal 态 stays quiet).
 */
export function GateHint(props: GateHintProps) {
  const normalized = props.rejection === undefined ? undefined : normalizeWorkbenchVerbError(props.rejection)
  if (props.gatePending !== true && normalized === undefined) return null
  return (
    <div data-dsh-forge-gate-hint="">
      {props.gatePending === true && (
        <p
          data-dsh-forge-gate-hint-line=""
          title={props.t('features.stages.gateHint.tooltip')}
          style={hintLineStyle}
        >
          {props.t('features.stages.gateHint')}
        </p>
      )}
      {normalized !== undefined && (
        <div data-dsh-forge-gate-hint-rejected={normalized.code} role="alert" style={guidanceStyle}>
          <span style={guidanceTitleStyle}>
            {normalized.code === 'ERR_STAGE_GATE_UNSATISFIED'
              ? props.t('features.stages.advance.rejected.title')
              : normalized.code}
          </span>
          {normalized.detail !== undefined && normalized.detail !== '' && (
            <p style={guidanceDetailStyle}>{normalized.detail}</p>
          )}
          {normalized.detail === undefined && (
            <p style={guidanceDetailStyle}>{normalized.message}</p>
          )}
        </div>
      )}
    </div>
  )
}
