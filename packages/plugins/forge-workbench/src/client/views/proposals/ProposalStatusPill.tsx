/**
 * The UF5 proposal-status pill, BUILD half (task 5.4, ui-design UF5 列表视图
 * + 全局规则): the ONE status-rendering vocabulary the list rows and the
 * detail header share — 色谱 Draft 中性填充 / Accepted success / Rejected
 * error / Superseded 中性描边(无填充,次文字).
 *
 * 数据衍生枚举 label 映射 (ui-design 全局规则): the label text routes
 * through the upstream locale seat (`proposals.status.*` — zh 草稿/已接受/
 * 已拒绝/被取代,en Draft/Accepted/Rejected/Superseded); 未知值兜底 = 数据
 * 原值原样透出 + 中性 Pill (the mapping keys are the forge data's closed
 * enum; anything else is presentation-only passthrough — 色谱与文案均为呈现
 * 约定,状态语义归 forge 数据).
 *
 * Pure presentation: a span, no interaction (the read-only discipline — the
 * pill is never a control, unlike UF1's clickable 待审批 Pill).
 */
import type { CSSProperties } from 'react'
import type { ProposalStatus } from '../../ipc-types'
import type { WorkbenchKey } from '../../locale/en'

/** The translate seat shape every consumer passes through (the shell's `t`). */
export type ProposalTranslate = (key: WorkbenchKey) => string

/**
 * The proposal-status vocabulary in CANONICAL order (proposal_snapshot.status
 * CHECK twin): the pill spectrum AND the 状态-sort rank both derive from THIS
 * tuple — one order, everywhere (the FEATURE_STATUSES discipline).
 */
export const PROPOSAL_STATUSES = [
  'draft',
  'accepted',
  'rejected',
  'superseded',
] as const

/** Narrow an unknown status string onto the vocabulary (defensive DTO reads). */
export function isProposalStatus(value: unknown): value is ProposalStatus {
  return typeof value === 'string' && (PROPOSAL_STATUSES as readonly string[]).includes(value)
}

/** status → label locale key (zh/en 双语, the typed-dictionary parity). */
const PROPOSAL_STATUS_LABEL_KEYS: Record<ProposalStatus, WorkbenchKey> = {
  draft: 'proposals.status.draft',
  accepted: 'proposals.status.accepted',
  rejected: 'proposals.status.rejected',
  superseded: 'proposals.status.superseded',
}

/**
 * The full label for a proposal status, routed through the locale seat; an
 * UNKNOWN value answers the raw token verbatim (兜底: 数据原值原样透出).
 */
export function proposalStatusLabel(status: string, t: ProposalTranslate): string {
  return isProposalStatus(status) ? t(PROPOSAL_STATUS_LABEL_KEYS[status]) : status
}

/** The pill's tone vocabulary (ui-design UF5 色谱 + the unknown 兜底 leg). */
export type ProposalStatusTone = 'neutral-fill' | 'success' | 'error' | 'neutral-outline'

/** status → tone; anything outside the vocabulary falls to the neutral outline. */
export function proposalStatusTone(status: string): ProposalStatusTone {
  switch (status) {
    case 'draft': return 'neutral-fill'
    case 'accepted': return 'success'
    case 'rejected': return 'error'
    case 'superseded': return 'neutral-outline'
    default: return 'neutral-outline'
  }
}

/** Pill 基底 (the feature-status pill twin): 12/18 capsule, nowrap. */
const pillBaseStyle = {
  borderRadius: '8px',
  flex: '0 0 auto',
  fontSize: '12px',
  lineHeight: '18px',
  padding: '0 6px',
  whiteSpace: 'nowrap',
} as const

/** 中性填充 (Draft): the hover-fill surface, no colored border. */
const neutralFillStyle = {
  ...pillBaseStyle,
  background: 'var(--dsh-interactive-bg-hover, rgba(128, 128, 128, 0.2))',
  color: 'var(--dsw-alias-label-primary, inherit)',
} as const

/** success (Accepted): border + text tint, transparent fill. */
const successStyle = {
  ...pillBaseStyle,
  borderColor: 'var(--dsw-alias-state-success-primary, rgb(34, 197, 94))',
  borderStyle: 'solid',
  borderWidth: '1px',
  color: 'var(--dsw-alias-state-success-primary, rgb(34, 197, 94))',
} as const

/** error (Rejected): border + text tint, transparent fill. */
const errorStyle = {
  ...pillBaseStyle,
  borderColor: 'var(--dsw-alias-state-error-primary, rgb(236, 19, 19))',
  borderStyle: 'solid',
  borderWidth: '1px',
  color: 'var(--dsw-alias-state-error-primary, rgb(236, 19, 19))',
} as const

/** 中性描边 (Superseded + the unknown 兜底): plain border, 次文字, no fill. */
const neutralOutlineStyle = {
  ...pillBaseStyle,
  borderColor: 'var(--dsh-border-color, CanvasText)',
  borderStyle: 'solid',
  borderWidth: '1px',
  color: 'var(--dsw-alias-label-secondary, inherit)',
} as const

const TONE_STYLES: Record<ProposalStatusTone, CSSProperties> = {
  'neutral-fill': neutralFillStyle,
  success: successStyle,
  error: errorStyle,
  'neutral-outline': neutralOutlineStyle,
}

/** Inputs of {@link ProposalStatusPill}. */
export interface ProposalStatusPillProps {
  /** The status token (forge data 原词; unknown values render verbatim). */
  status: string
  /** The locale seat (the shell's `t`). */
  t: ProposalTranslate
}

/**
 * The proposal-status pill: pure presentation over the tone map — the label
 * and the tone both key off the ONE vocabulary above (unknown → raw text +
 * neutral outline, the 兜底 leg).
 */
export function ProposalStatusPill(props: ProposalStatusPillProps) {
  const tone = proposalStatusTone(props.status)
  return (
    <span
      data-dsh-forge-proposal-status={props.status}
      data-dsh-forge-proposal-tone={tone}
      style={TONE_STYLES[tone]}
    >
      {proposalStatusLabel(props.status, props.t)}
    </span>
  )
}
