/**
 * The UF2 advance action, BUILD half (task 4.3, page-map「推进动作 =
 * AdvanceStageButton → workbench.advanceStage」): the md-primary 「推进阶段」
 * entry the feature detail header carries (4.4 places it). The advance is an
 * ORCHESTRATION write (PRD UF2 Permissions: 阶段推进 = 编排面,任务写仍零
 * UI) — the kernel internalizes the manifest write, so this button is the
 * ONLY stage write affordance the workbench has.
 *
 * Chain semantics (tech-design §Interface 5 / 4.1 kernel):
 *   - click → face.advanceStage(projectId, featureSlug); busy while in flight;
 *   - rejection ERR_STAGE_GATE_UNSATISFIED → the GateHint guidance face
 *     (引导文案 + the kernel's missing-list detail verbatim) — the refusal is
 *     OBSERVABLE, never swallowed (拒绝可观察);
 *   - success → the post-advance FeatureSummary reaches the assembly through
 *     `onAdvanced`, and the stage_advanced reflux (≤5s) rides the face's own
 *     event channel — the button itself re-arms against the NEW stage (whose
 *     gate is pending until its summary generates);
 *   - terminal 'completed' renders NOTHING (nothing left to advance — the
 *     completed badge is the terminal presentation).
 *
 * Inert discipline (the dispatch-face precedent — advanceStage is a WRITE
 * surface, so no silent mock twin): an absent face member disables the entry
 * with the unavailable tooltip; the component is mounted by 4.4's assembly
 * with the IPC-backed face, tests inject the mock twin.
 */
import { useState } from 'react'
import type { FeatureStatus, FeatureSummary } from '../../../ipc-types'
import type { StageFace } from '../../../contract'
import type { FeatureStatusTranslate } from '../../../i18n/feature-status'
import { ChromeButton } from '../../../components/chrome/ChromeButton'
import { GateHint } from './GateHint'

/** Inputs of {@link AdvanceStageButton}. */
export interface AdvanceStageButtonProps {
  /** The locale seat (the shell's `t`). */
  readonly t: FeatureStatusTranslate
  /** The active project — the advanceStage verb argument. */
  readonly projectId?: string | undefined
  /** The feature being advanced. */
  readonly featureSlug: string
  /** The feature's current stage (terminal 'completed' renders nothing). */
  readonly status: FeatureStatus
  /** The stage face — an absent advanceStage member keeps the entry inert (disabled + tooltip). */
  readonly face?: Partial<StageFace> | undefined
  /** The success seam: the assembly refreshes the board/detail from the post-advance summary. */
  readonly onAdvanced?: ((summary: FeatureSummary) => void) | undefined
}

/** md primary pill (the dispatch entry / retry CTA precedent). */
const primaryButtonStyle = {
  background: 'var(--dsw-alias-link, rgb(65, 118, 230))',
  border: 'none',
  borderRadius: '18px',
  color: '#fff',
  cursor: 'pointer',
  font: 'inherit',
  height: '36px',
  padding: '0 16px',
} as const

const rowStyle = {
  alignItems: 'flex-start',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
} as const

/** The advance entry + its rejection guidance (the GateHint composition). */
export function AdvanceStageButton(props: AdvanceStageButtonProps) {
  const [busy, setBusy] = useState(false)
  const [rejection, setRejection] = useState<unknown>(undefined)
  const [advanced, setAdvanced] = useState<FeatureStatus | undefined>(undefined)
  const stage = advanced ?? props.status
  // 终态:无物可推(completed 徽标即终态呈现)。
  if (stage === 'completed') return null
  const verb = props.face?.advanceStage
  const advance = (): void => {
    if (verb === undefined || busy) return
    setBusy(true)
    setRejection(undefined)
    verb(props.projectId ?? '', props.featureSlug)
      .then((summary) => {
        setBusy(false)
        setAdvanced(summary.status)
        props.onAdvanced?.(summary)
      })
      .catch((error: unknown) => {
        // 拒绝可观察:envelope 折归 GateHint 引导面(引导文案 + 缺失清单)。
        setBusy(false)
        setRejection(error)
      })
  }
  return (
    <div data-dsh-forge-advance="" style={rowStyle}>
      <ChromeButton
        type="button"
        disabled={verb === undefined || busy}
        title={verb === undefined ? props.t('features.stages.advance.unavailable') : undefined}
        data-dsh-forge-advance-entry=""
        data-dsh-forge-advance-state={verb === undefined ? 'unavailable' : busy ? 'busy' : advanced !== undefined ? 'advanced' : 'idle'}
        style={primaryButtonStyle}
        onClick={advance}
      >
        {busy ? props.t('features.stages.advance.busy') : props.t('features.stages.advance')}
      </ChromeButton>
      <GateHint t={props.t} rejection={rejection} />
    </div>
  )
}
