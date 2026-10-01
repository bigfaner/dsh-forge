/**
 * The UF1 floating selection bar (task 3.6, ui-design UF1 浮动操作条): the
 * selection mode's action strip — 已选 N 项 count + [取消] ghost + [派发所选
 * N →] md primary — fixed to the view's bottom edge (16px), horizontally
 * centered with ≥16px insets, at z200 (BETWEEN the z100 side panels and the
 * z1100 toasts, so an open dock never covers it; the dialogs' z1200 masks
 * still sit above — the bar is unreachable while a dialog is open, by
 * design).
 *
 * Keyboard (ui-design 键盘契约): the bar joins the tab order on entry —
 * the count text is a focusable status (tabIndex=0) so the strip reads
 * 计数 → 取消 → 派发所选 in DOM order. While a verb leg is in flight the
 * buttons disable and the primary shows the spinner face (dispatching 态 —
 * 全程不打断看板其余交互: the bar never blocks the cards behind it).
 */
import { fillTemplate } from '../../overview/format'
import { ChromeButton } from '../../../components/chrome/ChromeButton'
import { ghostButtonStyle, LaunchSpinner, primaryButtonStyle, type BoardHostForm } from '../launch/LaunchStates'
import type { DispatchTranslate } from './SelectionLayer'

/** ui-design 层叠: the selection float bar sits at z200 (侧板 z100 < 本条 < toast z1100). */
export const FLOAT_BAR_Z = 200

/**
 * The bar's anchoring base (M4 2.1 双宿主): the shared geometry minus the
 * host-dependent members (position + the width cap) — those are composed at
 * the render site from the host form.
 */
const barBaseStyle = {
  alignItems: 'center',
  background: 'var(--dsh-bg, Canvas)',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '14px',
  bottom: '16px',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
  display: 'flex',
  gap: '10px',
  left: '50%',
  padding: '8px 14px',
  transform: 'translateX(-50%)',
  zIndex: FLOAT_BAR_Z,
} as const

/**
 * The host-form overlay: the window form (default) pins the bar to the
 * WINDOW's bottom-center, viewport-capped (the M2/M3 geometry verbatim); the
 * pane form anchors it INSIDE the board's own box — `absolute` resolves
 * against the page root (the nearest positioned ancestor), and the cap
 * follows the board's width (100vw of the surrounding window would let the
 * bar span the conversation panel beside the pane).
 */
function barStyleOf(host: BoardHostForm): Record<string, string | number> {
  return host === 'pane'
    ? { ...barBaseStyle, position: 'absolute', maxWidth: 'calc(100% - 32px)' }
    : { ...barBaseStyle, position: 'fixed', maxWidth: 'calc(100vw - 32px)' }
}

const countStyle = {
  fontSize: '14px',
  lineHeight: '22px',
  whiteSpace: 'nowrap',
} as const

/** Inputs of {@link SelectionFloatBar}. */
export interface SelectionFloatBarProps {
  /** The locale seat (the host's `t`). */
  readonly t: DispatchTranslate
  /**
   * The host's width breakpoint (M4 2.1 双宿主, threaded by SelectionLayer):
   * 'window' (default) = window-fixed, viewport-capped (M2/M3 verbatim);
   * 'pane' = anchored inside the board's own box. See {@link barStyleOf}.
   */
  readonly host?: BoardHostForm | undefined
  /** The live selection count (已选 N 项 — updates in real time). */
  readonly count: number
  /** A verb leg is in flight (spinner face + disabled buttons). */
  readonly busy: boolean
  /** The dispatch button element sink (the dialog chain's focus-return anchor). */
  readonly onGoButtonElement?: (element: HTMLButtonElement | null) => void
  /** 取消 — exit selection mode, selection cleared. */
  readonly onCancel: () => void
  /** 派发所选 N → — the deterministic check, then the dialog chain. */
  readonly onDispatch: () => void
}

/**
 * The bar (role=toolbar). The count text is a focusable status so the tab
 * order reads 计数 → 取消 → 派发所选; observation hooks:
 * `data-dsh-forge-dispatch-float-bar` / `-count` / `-cancel` / `-go`.
 */
export function SelectionFloatBar(props: SelectionFloatBarProps) {
  const { t } = props
  const busyText = t('tasks.dispatch.float.busy')
  return (
    <div
      role="toolbar"
      aria-label={t('tasks.dispatch.float.label')}
      data-dsh-forge-dispatch-float-bar=""
      style={barStyleOf(props.host ?? 'window')}
      onClick={(event) => { event.stopPropagation() }}
    >
      <span tabIndex={0} data-dsh-forge-dispatch-count="" style={countStyle}>
        {fillTemplate(t('tasks.dispatch.float.count'), { count: String(props.count) })}
      </span>
      <ChromeButton
        type="button"
        disabled={props.busy}
        data-dsh-forge-dispatch-cancel=""
        style={ghostButtonStyle}
        onClick={props.onCancel}
      >
        {t('tasks.dispatch.float.cancel')}
      </ChromeButton>
      <ChromeButton
        ref={(element: HTMLButtonElement | null): void => {
          props.onGoButtonElement?.(element)
        }}
        type="button"
        disabled={props.busy || props.count === 0}
        data-dsh-forge-dispatch-go=""
        data-dsh-forge-dispatch-go-busy={props.busy ? 'true' : 'false'}
        style={primaryButtonStyle}
        onClick={props.onDispatch}
      >
        {props.busy
          ? (
            <span style={{ alignItems: 'center', display: 'inline-flex', gap: '8px' }}>
              <LaunchSpinner label={busyText} />
              {busyText}
            </span>
          )
          : fillTemplate(t('tasks.dispatch.float.go'), { count: String(props.count) })}
      </ChromeButton>
    </div>
  )
}
