/**
 * The UF1 dispatch error dialog (task 3.6, ui-design UF1 States dispatching
 * 行's timeout branch): 超时 → error 对话框 + 重试. Two faces share the frame —
 *
 *   - timeout — the ≤3s budget expired (the check/dispatch leg never
 *     settled); the body is the budget copy, not a verb message;
 *   - failed — the verb rejected (rejection envelope folded by the
 *     controller); the body is the envelope's message.
 *
 * [重试(md 主, default focus)] re-runs the dispatch leg (retry keeps the
 * acknowledge context — a retry after acknowledge does not re-warn);
 * [关闭] / Esc / ✕ / mask return to selection mode with the selection kept.
 */
import { useId, useRef } from 'react'
import { ChromeButton } from '../../../components/chrome/ChromeButton'
import { DialogBody, DialogFooter, DialogFrame, ghostButtonStyle, primaryButtonStyle } from '../launch/LaunchStates'
import type { DispatchTranslate } from './SelectionLayer'
import type { DispatchFlowError } from './selection-mode'

const errorTitleStyle = {
  color: 'var(--dsw-alias-state-error-primary, rgb(220, 38, 38))',
  flex: '1',
  fontSize: '16px',
  fontWeight: 600,
  lineHeight: '24px',
  margin: '0',
} as const

/** The ✕ close (the DialogHeader closeButton geometry, duplicated for the error-styled title row). */
const closeButtonStyle = {
  alignItems: 'center',
  background: 'transparent',
  border: 'none',
  borderRadius: '8px',
  color: 'inherit',
  cursor: 'pointer',
  display: 'inline-flex',
  flex: '0 0 auto',
  font: 'inherit',
  height: '28px',
  justifyContent: 'center',
  marginLeft: 'auto',
  width: '28px',
} as const

const bodyStyle = {
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0',
  overflowWrap: 'anywhere',
} as const

/** Inputs of {@link DispatchErrorDialog}. */
export interface DispatchErrorDialogProps {
  /** The locale seat (the shell's `t`). */
  readonly t: DispatchTranslate
  /** The failure (timeout = budget copy; failed = the rejection message). */
  readonly error: DispatchFlowError
  /** 重试 — re-run the dispatch leg. */
  readonly onRetry: () => void
  /** 关闭 — back to selection mode, selection kept. */
  readonly onClose: () => void
}

/**
 * The error dialog (`data-dsh-forge-dialog="dispatch-error"`), retry-focused
 * (the LaunchErrorDialog precedent — 重试 is the primary and the default
 * focus; 关闭后可重试 via the float bar too).
 */
export function DispatchErrorDialog(props: DispatchErrorDialogProps) {
  const retryRef = useRef<HTMLButtonElement | null>(null)
  const generatedId = useId().replace(/[^a-zA-Z0-9-]/g, '')
  const titleId = `dsh-forge-dispatch-error-title-${generatedId}`
  const timeout = props.error.kind === 'timeout'

  return (
    <DialogFrame
      role="alertdialog"
      ariaLabelledBy={titleId}
      initialFocus={retryRef}
      onDismiss={props.onClose}
      dialogDataKey="dispatch-error"
    >
      <div style={{ alignItems: 'center', display: 'flex', gap: '8px' }}>
        <h2
          id={titleId}
          data-dsh-forge-dispatch-error-kind={props.error.kind}
          style={errorTitleStyle}
        >
          {props.t(timeout ? 'tasks.dispatch.error.timeoutTitle' : 'tasks.dispatch.error.failedTitle')}
        </h2>
        <ChromeButton
          type="button"
          aria-label={props.t('tasks.dispatch.error.close')}
          data-dsh-forge-dialog-close=""
          style={closeButtonStyle}
          onClick={props.onClose}
        >
          <span aria-hidden="true">✕</span>
        </ChromeButton>
      </div>
      <DialogBody>
        <p data-dsh-forge-dispatch-error-body="" style={bodyStyle}>
          {timeout ? props.t('tasks.dispatch.error.timeoutBody') : props.error.message}
        </p>
      </DialogBody>
      <DialogFooter>
        <ChromeButton
          type="button"
          data-dsh-forge-dispatch-error-close=""
          style={ghostButtonStyle}
          onClick={props.onClose}
        >
          {props.t('tasks.dispatch.error.close')}
        </ChromeButton>
        <ChromeButton
          ref={retryRef}
          type="button"
          data-dsh-forge-dispatch-error-retry=""
          style={primaryButtonStyle}
          onClick={props.onRetry}
        >
          {props.t('tasks.dispatch.error.retry')}
        </ChromeButton>
      </DialogFooter>
    </DialogFrame>
  )
}
