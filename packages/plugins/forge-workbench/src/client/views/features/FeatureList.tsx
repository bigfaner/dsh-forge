/**
 * The UF4 feature-card grid, BUILD half (task 5.9): the list view the
 * features tab mounts — one card per FeatureSummary (ui-design UF4 列表视图:
 * feature 卡 grid min 300 gap 12; slug + 状态 Pill / 进度条 + 计数 + 更新时间).
 *
 * Hard Rules honored here:
 *   - status 词表直透: the badge text routes through the ONE feature-status
 *     vocabulary (i18n/feature-status.ts — the raw manifest token, 'in-progress'
 *     hyphen intact); no second copy exists in this file by construction;
 *   - 完成徽标判定: taskCompleted === taskTotal (taskTotal > 0), the DTO's own
 *     counters — NEVER recomputed from task data (m1 completed 样板语义).
 *
 * The whole card is ONE navigation trigger (click / Enter / Space → the
 * onOpenFeature seam, which the shell routes into the view-key machine's
 * openFeatureDetail) — the read-only discipline: no write affordance exists.
 */
import type { FeatureSummary } from '../../ipc-types'
import { featureStatusLabel } from '../../i18n/feature-status'
import type { FeatureStatusTranslate } from '../../i18n/feature-status'
import { fillTemplate, formatTimestamp } from '../overview/format'

/** Inputs of {@link FeatureList}. */
export interface FeatureListProps {
  /** The locale seat (the shell's `t`). */
  t: FeatureStatusTranslate
  /** Every feature of the active project (board order). */
  features: readonly FeatureSummary[]
  /**
   * The enter-detail seam — the shell routes this into the view-key machine's
   * openFeatureDetail(slug); absent renders plain cards (defensive).
   */
  onOpenFeature?: ((slug: string) => void) | undefined
}

/** ui-design UF4: feature 卡 grid(min 300,auto-fill,gap 12). */
const gridStyle = {
  display: 'grid',
  gap: '12px',
  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
} as const

/** ui-design 项目卡 geometry: r14 · bg-layer-2 · pad 14 · border-l1. */
const cardStyle = {
  alignItems: 'flex-start',
  background: 'var(--dsw-alias-bg-layer-2, var(--dsh-bg, Canvas))',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '14px',
  color: 'inherit',
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  font: 'inherit',
  gap: '8px',
  padding: '14px',
  textAlign: 'left',
} as const

const cardTitleRowStyle = {
  alignItems: 'center',
  display: 'flex',
  gap: '8px',
  minWidth: 0,
  width: '100%',
} as const

/** slug 14/22 — an ID, so the 代码栈 mono treatment (ui-design 字体). */
const slugStyle = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '14px',
  lineHeight: '22px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

/** 状态 Pill (ui-design 徽标用 Pill): 12/18 capsule, nowrap. */
const statusPillStyle = {
  borderRadius: '8px',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  color: 'var(--dsw-alias-label-primary, inherit)',
  flex: '0 0 auto',
  fontSize: '12px',
  lineHeight: '18px',
  padding: '0 6px',
  whiteSpace: 'nowrap',
} as const

/** The m1-completed 样板 badge: success-tinted (全部任务完成). */
const completedBadgeStyle = {
  ...statusPillStyle,
  borderColor: 'var(--dsw-alias-state-success-primary, rgb(34, 197, 94))',
  color: 'var(--dsw-alias-state-success-primary, rgb(34, 197, 94))',
} as const

/** ui-design 进度条: h4 r2, 完成段 success / 总槽 border-l2. */
const progressTrackStyle = {
  borderRadius: '2px',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  flex: '1 1 auto',
  height: '4px',
  minWidth: '48px',
  overflow: 'hidden',
} as const

const progressFillStyle = {
  background: 'var(--dsw-alias-state-success-primary, rgb(34, 197, 94))',
  height: '100%',
} as const

const cardMetaRowStyle = {
  alignItems: 'center',
  display: 'flex',
  gap: '8px',
  minWidth: 0,
} as const

/** 12/18 secondary (counts + updated time). */
const metaStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
  whiteSpace: 'nowrap',
} as const

/**
 * The feature card: the completed badge judges on the DTO counters ONLY
 * (taskCompleted === taskTotal with a non-empty board — never recomputed).
 */
export function FeatureCard(props: {
  t: FeatureStatusTranslate
  feature: FeatureSummary
  onOpenFeature?: ((slug: string) => void) | undefined
}) {
  const { feature, t } = props
  const complete = feature.taskTotal > 0 && feature.taskCompleted === feature.taskTotal
  const percent = feature.taskTotal > 0
    ? Math.round((feature.taskCompleted / feature.taskTotal) * 100)
    : 0
  const progressText = fillTemplate(t('features.progress'), {
    completed: String(feature.taskCompleted),
    total: String(feature.taskTotal),
  })
  return (
    <button
      type="button"
      data-dsh-forge-feature-card={feature.slug}
      data-dsh-forge-feature-complete={complete ? '' : undefined}
      aria-label={fillTemplate(t('features.openDetail'), { slug: feature.slug })}
      style={cardStyle}
      onClick={() => { props.onOpenFeature?.(feature.slug) }}
    >
      <span style={cardTitleRowStyle}>
        <span title={feature.slug} style={slugStyle}>{feature.slug}</span>
        <span data-dsh-forge-feature-status={feature.status} style={statusPillStyle}>
          {featureStatusLabel(feature.status, t)}
        </span>
        {complete && (
          <span data-dsh-forge-feature-completed="" style={completedBadgeStyle}>
            {t('features.completedBadge')}
          </span>
        )}
      </span>
      <span style={cardMetaRowStyle}>
        <span
          role="progressbar"
          aria-label={fillTemplate(t('features.progressAria'), {
            completed: String(feature.taskCompleted),
            total: String(feature.taskTotal),
          })}
          aria-valuemin={0}
          aria-valuemax={feature.taskTotal}
          aria-valuenow={feature.taskCompleted}
          aria-valuetext={progressText}
          style={progressTrackStyle}
        >
          <span style={{ ...progressFillStyle, width: `${percent}%` }} />
        </span>
        <span style={metaStyle}>{progressText}</span>
        <span title={feature.updatedAt} style={{ ...metaStyle, marginLeft: 'auto' }}>
          {formatTimestamp(feature.updatedAt)}
        </span>
      </span>
    </button>
  )
}

/** The grid of feature cards (ui-design UF4 列表视图). */
export function FeatureList(props: FeatureListProps) {
  return (
    <div data-dsh-forge-feature-grid="" style={gridStyle}>
      {props.features.map(feature => (
        <FeatureCard
          key={feature.slug}
          t={props.t}
          feature={feature}
          onOpenFeature={props.onOpenFeature}
        />
      ))}
    </div>
  )
}
