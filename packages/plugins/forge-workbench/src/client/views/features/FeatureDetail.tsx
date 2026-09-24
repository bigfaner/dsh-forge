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
 *
 * UF2 强化 (task 4.4, Integration #2 — additive, absent stage face = the M2
 * detail form verbatim): the deviation badge (the SAME component the card
 * renders) beside the status Pill; the advance entry pinned to the header
 * row's right edge; the stepper's gate verdict (getStageGate, re-read on
 * stage_advanced reflux) + the GateHint line under the stepper; the sixth
 * 「阶段资产」 tab through FeatureDocs.
 */
import { useEffect, useState } from 'react'
import type { DocKind, FeatureSummary } from '../../ipc-types'
import type { FeatureDocFace, StageFace } from '../../contract'
import type { FeatureDocsCache } from '../../store/feature-board'
import { featureStatusLabel } from '../../i18n/feature-status'
import type { FeatureStatusTranslate } from '../../i18n/feature-status'
import { ChromeButton } from '../../components/chrome/ChromeButton'
import { fillTemplate, formatTimestamp } from '../overview/format'
import { FeatureStepper } from './FeatureStepper'
import { FeatureDocs } from './FeatureDocs'
import { DeviationBadge } from './stages/DeviationBadge'
import { GateHint } from './stages/GateHint'
import { AdvanceStageButton } from './stages/AdvanceStageButton'

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
   * The UF2 stage face passthrough (task 4.4, Integration #2): getStageGate
   * drives the stepper's gate verdict + the hint line, advanceStage the
   * header's advance entry, listStageAssets the sixth 「阶段资产」 tab (via
   * FeatureDocs), subscribeEvents the stage_advanced gate re-read. Absent =
   * the M2 detail form (no gate state, no entry, five tabs — the inert
   * discipline: the advance leg is a WRITE surface).
   */
  stageFace?: Partial<StageFace> | undefined
  /**
   * The page's advance-success seam (task 4.4): the assembly refreshes the
   * board from the post-advance summary (the ≤5s reflux rides the event
   * channel separately — this is the immediate leg).
   */
  onStageAdvanced?: (() => void) | undefined
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

/** The UF2 advance entry's slot: pinned to the header row's right edge. */
const advanceSlotStyle = {
  marginLeft: 'auto',
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

  // —— UF2 门态读(task 4.4):getStageGate 的活性判定驱动 stepper 门态 +
  // 提示行;读失败/缺席 = M2 呈现降级(无门态、无提示行——感知面纪律,
  // 不弹错误卡)。终态 completed 不呈现门态(无可推进,completed 徽标即
  // 终态呈现)。 ——
  const gateVerb = props.stageFace?.getStageGate
  const [gatePending, setGatePending] = useState<boolean | undefined>(undefined)
  const [gateNonce, setGateNonce] = useState(0)
  useEffect(() => {
    if (gateVerb === undefined) return
    let alive = true
    gateVerb(props.projectId ?? '', feature.slug)
      .then((info) => {
        if (!alive) return
        setGatePending(
          info.stage === 'completed' ? false : !info.summaryGenerated,
        )
      })
      .catch(() => {
        if (alive) setGatePending(undefined)
      })
    return () => { alive = false }
  }, [gateVerb, props.projectId, feature.slug, gateNonce])

  // —— UF2 回流(task 4.4):stage_advanced 命中本 feature → 门态重读(外
  // 部推进,如经 dsh tool 的会话;本详情头部按钮的推进同样经此通道)。
  // The board leg (deviation_detected) rides the PAGE's own subscription. ——
  const subscribe = props.stageFace?.subscribeEvents
  useEffect(() => {
    if (subscribe === undefined) return
    return subscribe((events) => {
      for (const event of events) {
        if (event.type === 'stage_advanced' && event.featureSlug === feature.slug) {
          setGateNonce(nonce => nonce + 1)
        }
      }
    })
  }, [subscribe, feature.slug])

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
        <DeviationBadge t={t} deviated={feature.deviated} />
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
        {/* UF2 推进入口(任务 4.4):头部行末位(右缘)——仅在阶段数据面接线
            时挂载(无 stage face = M2 详情形逐字节不变);终态 completed 组件
            自身不渲染;face 缺 advanceStage 成员 = 惰性 disabled + tooltip
            (4.3 惰性纪律)。 */}
        {props.stageFace !== undefined && (
          <div style={advanceSlotStyle}>
            <AdvanceStageButton
              t={t}
              projectId={props.projectId}
              featureSlug={feature.slug}
              status={feature.status}
              face={props.stageFace}
              onAdvanced={() => { props.onStageAdvanced?.() }}
            />
          </div>
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

      <FeatureStepper t={props.t} status={feature.status} gatePending={gatePending} />

      <GateHint t={props.t} gatePending={gatePending} />

      <FeatureDocs
        t={props.t}
        projectId={props.projectId}
        featureSlug={feature.slug}
        docKinds={feature.docKinds as readonly DocKind[]}
        face={props.docFace}
        stageFace={props.stageFace}
        docsCache={props.docsCache}
      />
    </div>
  )
}
