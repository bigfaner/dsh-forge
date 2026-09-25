/**
 * The UF1 dispatch toolbar entry (task 3.6, ui-design UF1 工具栏追加): the
 * md primary 「派发」 button on the M2 toolbar's right — 常驻; disabled +
 * tooltip reason when the board has no dispatchable task (依赖未满足/终态);
 * clicking enters the selection mode (3.9 wires it beside the M2 controls).
 *
 * While the chain is live (`active`) the button carries aria-pressed and the
 * click is a no-op at the machine (enter is idle→selecting only) — the exit
 * faces are the float bar's 取消 / Esc, never a toolbar toggle.
 */
import { ChromeButton } from '../../../components/chrome/ChromeButton'
import { primaryButtonStyle } from '../launch/LaunchStates'
import type { DispatchTranslate } from './SelectionLayer'

/** Inputs of {@link DispatchToolbarButton}. */
export interface DispatchToolbarButtonProps {
  /** The locale seat (the shell's `t`). */
  readonly t: DispatchTranslate
  /** 无可派发任务 → disabled + tooltip 原因 (the page computes hasDispatchableEntry). */
  readonly disabled?: boolean
  /** The disabled reason's tooltip copy (rendered only on the disabled face). */
  readonly tooltip?: string | undefined
  /** The chain is live (selection mode or a dialog phase). */
  readonly active?: boolean
  /** Enter the selection mode (the controller's `enter`). */
  readonly onEnter: () => void
}

/** The「派发」entry (`data-dsh-forge-dispatch-entry`). */
export function DispatchToolbarButton(props: DispatchToolbarButtonProps) {
  return (
    <ChromeButton
      type="button"
      aria-pressed={props.active === true ? 'true' : undefined}
      disabled={props.disabled === true}
      title={props.disabled === true ? props.tooltip : undefined}
      data-dsh-forge-dispatch-entry=""
      data-dsh-forge-dispatch-entry-active={props.active === true ? 'true' : 'false'}
      style={primaryButtonStyle}
      onClick={props.onEnter}
    >
      {props.t('tasks.dispatch.entry')}
    </ChromeButton>
  )
}
