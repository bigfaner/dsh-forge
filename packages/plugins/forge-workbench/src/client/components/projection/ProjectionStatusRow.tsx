/**
 * The C8 投影状态行 (M4 task 3.5; ui-design §Component C8 投影状态行 — the
 * #25 归宿: the settings page was cut and the row homes into the 概览
 * OverviewHeader, page-map Shared Components「投影状态行 | 右栏概览」):
 *
 *   StateDot (healthy 成功色 / degraded 警示 / deviation 警示 / pending 中性)
 *   + 状态文案 — healthy「与 dsh 侧一致」/ degraded「投影同步降级」/
 *   deviation「与 dsh 侧存在偏差」/ pending「待对账」;
 *
 *   degraded → [重试投影] sm primary (re-runs the projection sync — the ONE
 *   retry action in the whole design, BIZ-005: 重跑投影同步,非刷新视图);
 *   deviation → [偏差明细 N] ghost (default collapsed) toggling the
 *   {@link DeviationList} fold (偏差仅提示, 无反向写入口 — BIZ-006).
 *
 * Pure presentation: the status DTO arrives loaded by the OverviewTab (the
 * shared-read discipline — one read, header owns it), the retry seam fires
 * the verb in the owner, and projection_updated pushes re-fire the read
 * (BIZ-005 失效-重建, ≤500ms batched channel). Per-state affordances are
 * mutually exclusive by construction — the state machine is single-valued
 * (tech-design §Interface 1 ProjectionState), so the degraded row never
 * carries the fold and the deviation row never carries the retry button.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ProjectionState, ProjectionStatusRow } from '../../ipc-types'
import type { WorkbenchKey } from '../../locale/en'
import { fillTemplate } from '../../views/overview/format'
import { ChromeButton } from '../chrome/ChromeButton'
import { DeviationList } from './DeviationList'

/** state → StateDot visual (healthy = success color; both warn states share the warning dot — the LABEL carries the precision). */
export const PROJECTION_DOT_STATE: Record<ProjectionState, StateDotState> = {
  pending: 'idle',
  healthy: 'done',
  degraded: 'warning',
  deviation: 'warning',
}

/** state → 状态文案 key (the 12/18 non-color redundancy the a11y baseline demands). */
export const PROJECTION_STATUS_TEXT_KEYS: Record<ProjectionState, WorkbenchKey> = {
  pending: 'rightbar.overview.projection.pending',
  healthy: 'rightbar.overview.projection.healthy',
  degraded: 'rightbar.overview.projection.degraded',
  deviation: 'rightbar.overview.projection.deviation',
}

/** Inputs of {@link ProjectionStatusRow}. */
export interface ProjectionStatusRowProps {
  /** The locale seat (the plugin's bound `t`). */
  t: (key: WorkbenchKey) => string
  /** The kernel's status row (state + deviations; loaded by the OverviewTab). */
  status: ProjectionStatusRow
  /** The retry in flight (the button shows the busy marker; absent = idle). */
  retrying?: boolean | undefined
  /** The [重试投影] seam — fires the Interface 1 retryProjection verb in the owner. */
  onRetry?: (() => void) | undefined
}

/** The row: dot + text on the left, the state's single affordance on the right. */
const rowStyle = {
  alignItems: 'center',
  display: 'flex',
  gap: '8px',
  minWidth: 0,
} as const

/** 状态文案 (12/18, ellipsized; lastError rides the title tooltip when present). */
const textStyle = {
  color: 'var(--dsw-alias-label-secondary, rgb(97, 102, 107))',
  flex: '1 1 auto',
  fontSize: '12px',
  lineHeight: '18px',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

/** ui-design sm primary pill (h28 r14) — the degraded-state [重试投影]. */
const retryButtonStyle = {
  background: 'var(--dsw-alias-link, rgb(65, 118, 230))',
  border: 'none',
  borderRadius: '14px',
  color: '#fff',
  cursor: 'pointer',
  flex: '0 0 auto',
  font: 'inherit',
  fontSize: '12px',
  height: '28px',
  lineHeight: '16px',
  padding: '0 12px',
} as const

/** ui-design sm ghost pill (h28 r14) — the deviation-state [偏差明细 N]. */
const detailsButtonStyle = {
  background: 'transparent',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '14px',
  color: 'inherit',
  cursor: 'pointer',
  flex: '0 0 auto',
  font: 'inherit',
  fontSize: '12px',
  height: '28px',
  lineHeight: '16px',
  padding: '0 12px',
} as const

/** The whole status block: the row over the (conditional) deviation fold. */
const blockStyle = {
  display: 'flex',
  flexDirection: 'column',
  flex: '1 1 auto',
  gap: '4px',
  minWidth: 0,
} as const

/**
 * The 投影状态行. The deviation fold is LOCAL UI state (default collapsed —
 * a view concern, never persisted); every other piece arrives by props.
 */
export function ProjectionStatusRow(props: ProjectionStatusRowProps): ReactNode {
  const { t, status, retrying, onRetry } = props
  const [expanded, setExpanded] = useState(false)
  const text = t(PROJECTION_STATUS_TEXT_KEYS[status.state])
  const busy = retrying === true
  const showRetry = status.state === 'degraded' && onRetry !== undefined
  const showDetails = status.state === 'deviation' && status.deviations.length > 0

  return (
    <div data-dsh-forge-projection-status="" data-state={status.state} style={blockStyle}>
      <div style={rowStyle}>
        <StateDot state={PROJECTION_DOT_STATE[status.state]} />
        <span
          style={textStyle}
          {...(status.lastError === null ? {} : { title: status.lastError })}
        >
          {text}
        </span>
        {showRetry && (
          <ChromeButton
            type="button"
            data-dsh-forge-projection-retry=""
            {...(busy ? { 'data-dsh-forge-projection-retrying': '' } : {})}
            disabled={busy}
            style={retryButtonStyle}
            onClick={() => { onRetry?.() }}
          >
            {`${busy ? '… ' : ''}${t('rightbar.overview.projection.retry')}`}
          </ChromeButton>
        )}
        {showDetails && (
          <ChromeButton
            type="button"
            data-dsh-forge-projection-details=""
            aria-expanded={expanded ? 'true' : 'false'}
            style={detailsButtonStyle}
            onClick={() => { setExpanded(value => !value) }}
          >
            {fillTemplate(t('rightbar.overview.projection.details'), { n: String(status.deviations.length) })}
          </ChromeButton>
        )}
      </div>
      {showDetails && expanded && <DeviationList t={t} deviations={status.deviations} />}
    </div>
  )
}
