/**
 * The UF4 feature 详情子视图, BUILD half (task 5.9): the subview the features
 * tab carries once the view-key machine holds a slug (ui-design UF4 详情子视图
 * — 面包屑返回 / slug + 状态 Pill + 仓外角标 / 状态机 stepper / 五类文档 tab).
 *
 * Addressing (3.3's machine owns it — no second router): entering was the
 * machine's openFeatureDetail(slug); the breadcrumb's root crumb fires the
 * RETURN seam (onBack), which the shell wires to selectWorkbenchTab(
 * 'workbench/features') — the transition that clears the slug. The page above
 * stays mounted through the swap, so the list's data/scroll survive the round
 * trip (返回保留列表态).
 *
 * The 完成徽标 reuses the list's exact judgment (taskCompleted === taskTotal,
 * never recomputed); the 仓外角标 derives from the project registration
 * (docLocationType='external', DF005 — the shell passes the boolean in).
 */
import type { DocKind, FeatureSummary } from '../../ipc-types'
import type { FeatureDocFace } from '../../contract'
import type { FeatureDocsCache } from '../../store/feature-board'
import { featureStatusLabel } from '../../i18n/feature-status'
import type { FeatureStatusTranslate } from '../../i18n/feature-status'
import { ChromeButton } from '../../components/chrome/ChromeButton'
import { fillTemplate, formatTimestamp } from '../overview/format'
import { FeatureStepper } from './FeatureStepper'
import { FeatureDocs } from './FeatureDocs'

/** Inputs of {@link FeatureDetail}. */
export interface FeatureDetailProps {
  /** The locale seat (the shell's `t`). */
  t: FeatureStatusTranslate
  /** The active project — the readFeatureDoc verb argument. */
  projectId?: string | undefined
  /** The feature being detailed. */
  feature: FeatureSummary
  /** 仓外角标 premise: the project's docs live at an authorized external path (DF005). */
  externalDocs?: boolean | undefined
  /** The doc face passthrough (5.16 injects the IPC face). */
  docFace?: Partial<FeatureDocFace> | undefined
  /**
   * The page-session doc cache passthrough (task 5.16): the page owns it; a
   * detail remount re-reads through it (already-read docs render without
   * re-firing the verb).
   */
  docsCache?: FeatureDocsCache | undefined
  /** The return seam — the shell routes it to the machine's tab action (slug cleared). */
  onBack: () => void
}

const rootStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  minWidth: 0,
} as const

/** The breadcrumb row (ui-design: 面包屑「feature 看板 / <slug>」, root clickable). */
const breadcrumbStyle = {
  alignItems: 'center',
  display: 'flex',
  gap: '6px',
} as const

const crumbButtonStyle = {
  background: 'transparent',
  border: 'none',
  borderRadius: '8px',
  color: 'var(--dsw-alias-link, inherit)',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: '14px',
  lineHeight: '22px',
  padding: '2px 4px',
} as const

/** The current crumb: 14/22, mono — an ID. */
const crumbCurrentStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '14px',
  lineHeight: '22px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

const headerStyle = {
  alignItems: 'center',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
  minWidth: 0,
} as const

/** The detail title: 16/24 w500 (ui-design layout row 1). */
const titleStyle = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '16px',
  fontWeight: 500,
  lineHeight: '24px',
  margin: '0',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

/** 状态 Pill (the list's twin — same vocab, same capsule). */
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

/** 仓外角标 (ui-design ⌂仓外): the external-docs location badge. */
const externalBadgeStyle = {
  ...statusPillStyle,
  color: 'var(--dsw-alias-label-secondary, inherit)',
} as const

/** The m1-completed 样板 badge (success-tinted, the list's twin). */
const completedBadgeStyle = {
  ...statusPillStyle,
  borderColor: 'var(--dsw-alias-state-success-primary, rgb(34, 197, 94))',
  color: 'var(--dsw-alias-state-success-primary, rgb(34, 197, 94))',
} as const

/** 12/18 secondary meta (the task-progress summary line). */
const metaStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
  whiteSpace: 'nowrap',
} as const

/** The task-progress summary (ui-design detail: 进度条 + 计数 + 时间). */
const progressRowStyle = {
  alignItems: 'center',
  display: 'flex',
  gap: '8px',
  minWidth: 0,
} as const

const progressTrackStyle = {
  borderRadius: '2px',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  flex: '0 1 160px',
  height: '4px',
  overflow: 'hidden',
} as const

const progressFillStyle = {
  background: 'var(--dsw-alias-state-success-primary, rgb(34, 197, 94))',
  height: '100%',
} as const

/**
 * The feature-detail subview. Pure presentation over the FeatureSummary —
 * the data assembly (board + docs over IPC) is 5.16's; every interactive
 * element here is navigation (breadcrumb back, doc tabs).
 */
export function FeatureDetail(props: FeatureDetailProps) {
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
    <div data-dsh-forge-feature-detail={feature.slug} style={rootStyle}>
      <nav aria-label={t('features.breadcrumb')} data-dsh-forge-feature-breadcrumb="" style={breadcrumbStyle}>
        <ChromeButton
          type="button"
          data-dsh-forge-feature-back=""
          style={crumbButtonStyle}
          onClick={props.onBack}
        >
          {t('features.breadcrumb.root')}
        </ChromeButton>
        <span aria-hidden="true" style={metaStyle}>/</span>
        <span aria-current="page" title={feature.slug} style={crumbCurrentStyle}>{feature.slug}</span>
      </nav>

      <header data-dsh-forge-feature-header="" style={headerStyle}>
        <h2 title={feature.slug} style={titleStyle}>{feature.slug}</h2>
        <span data-dsh-forge-feature-status={feature.status} style={statusPillStyle}>
          {featureStatusLabel(feature.status, t)}
        </span>
        {props.externalDocs === true && (
          <span data-dsh-forge-badge="external-docs" style={externalBadgeStyle}>
            ⌂ {t('features.externalDocs')}
          </span>
        )}
        {complete && (
          <span data-dsh-forge-feature-completed="" style={completedBadgeStyle}>
            {t('features.completedBadge')}
          </span>
        )}
      </header>

      <div style={progressRowStyle}>
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
      </div>

      <FeatureStepper t={props.t} status={feature.status} />

      <FeatureDocs
        t={props.t}
        projectId={props.projectId}
        featureSlug={feature.slug}
        docKinds={feature.docKinds as readonly DocKind[]}
        face={props.docFace}
        docsCache={props.docsCache}
      />
    </div>
  )
}
