/**
 * The UF1 工作台级审批指示 pair (task 3.7, ui-design UF1 工具栏追加 +
 * 工作台级审批指示): both count faces of the pending-approval signal —
 *
 *   ApprovalCountBadge   — the 任务 tab 标签右上 warn 计数徽标 (12/18·
 *                          aria-label「N 项待审批」; N = 0 NOT rendered —
 *                          hidden, not disabled) so the signal stays visible
 *                          from the 概览/提案/Feature tabs;
 *   ApprovalToolbarButton — the toolbar's「审批 N」warn 填充 Pill 按钮 +
 *                          StateDot 呼吸点 (md h36 r18, N = 待审批数, N = 0
 *                          hidden). Hard Rule: the Pill acts as a button with
 *                          the FULL Button contract — a native button, so
 *                          Tab reachable + Enter/Space activation for free,
 *                          and the ChromeButton focus ring — no new component
 *                          category.
 *
 * Both are CONTROLLED counts (the 3.9 board integration feeds the approval
 * machine's pending count; the click opens the dock).
 */
import { fillTemplate } from '../../overview/format'
import { ChromeButton } from '../../../components/chrome/ChromeButton'
import type { DispatchTranslate } from './DispatchBadge'
import { BreathDot } from './DispatchBadge'

/** The warn tone's token pair (prototype .tab-badge / .btn.warn-pill). */
const WARN = 'var(--dsw-alias-state-warn-primary, rgb(245, 158, 11))'

/** Inputs of {@link ApprovalCountBadge}. */
export interface ApprovalCountBadgeProps {
  /** The locale seat (the shell's `t`). */
  readonly t: DispatchTranslate
  /** The live pending-approval count (N = 0 → the badge renders NOTHING). */
  readonly count: number
}

/**
 * The tab-label count badge (`data-dsh-forge-approval-tab-badge`): absolute
 * top-right warn capsule over the 任务 tab label, `aria-label` = the 全称
 * (N 项待审批). Rendering is the CALLER's positioning context (the badge is
 * position:absolute; 3.9 mounts it inside the tab's relative label box).
 */
export function ApprovalCountBadge(props: ApprovalCountBadgeProps) {
  if (props.count <= 0) return null
  return (
    <span
      aria-label={fillTemplate(props.t('tasks.approval.tabBadge.aria'), { count: String(props.count) })}
      data-dsh-forge-approval-tab-badge={String(props.count)}
      style={{
        background: WARN,
        borderRadius: '8px',
        color: '#fff',
        fontSize: '11px',
        fontWeight: 500,
        height: '16px',
        lineHeight: '16px',
        minWidth: '16px',
        padding: '0 4px',
        position: 'absolute',
        right: '2px',
        textAlign: 'center',
        top: '0',
      }}
    >
      {props.count}
    </span>
  )
}

/** Inputs of {@link ApprovalToolbarButton}. */
export interface ApprovalToolbarButtonProps {
  /** The locale seat (the shell's `t`). */
  readonly t: DispatchTranslate
  /** The live pending-approval count (N = 0 → the button renders NOTHING — hidden, not disabled). */
  readonly count: number
  /** Open the approval dock (the M2 toolbar's right-side seat, 3.9 wires). */
  readonly onOpen: () => void
}

/**
 * The「审批 N」warn Pill button (`data-dsh-forge-approval-entry`): warn fill
 * + white breathing dot + count — native button semantics with the Chrome
 * focus ring (the Hard-Rule Button contract), `aria-label` carrying the
 * 全称 (审批:N 项待审批) over the visible 「审批 N」 label.
 */
export function ApprovalToolbarButton(props: ApprovalToolbarButtonProps) {
  const { t } = props
  if (props.count <= 0) return null
  return (
    <ChromeButton
      type="button"
      aria-label={fillTemplate(t('tasks.approval.toolbar.aria'), { count: String(props.count) })}
      data-dsh-forge-approval-entry=""
      data-dsh-forge-approval-entry-count={String(props.count)}
      style={{
        alignItems: 'center',
        background: WARN,
        border: 'none',
        borderRadius: '18px',
        color: '#fff',
        cursor: 'pointer',
        display: 'inline-flex',
        font: 'inherit',
        gap: '8px',
        height: '36px',
        padding: '0 16px',
      }}
      onClick={props.onOpen}
    >
      <BreathDot color="#fff" />
      {fillTemplate(t('tasks.approval.toolbar'), { count: String(props.count) })}
    </ChromeButton>
  )
}
