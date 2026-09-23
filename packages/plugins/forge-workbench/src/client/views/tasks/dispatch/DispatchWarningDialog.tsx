/**
 * The UF1 dispatch warning dialog (task 3.6, ui-design UF1 States warning
 * 行): the deterministic pre-dispatch check's missing-artifacts presentation —
 * warn icon + 「当前阶段产物不齐全」 + the missing list (one line per item,
 * mono artifact paths) + the non-blocking note + [继续派发(md 主)] /
 * [取消(ghost)].
 *
 * Hard Rule (PRD): 产物缺失警告不得阻断派发 — the 继续派发 leg IS the
 * acknowledgeMissing face (dispatchTasks then carries acknowledgeMissing:
 * true); 取消 / Esc / ✕ / mask all return to selection mode with the
 * selection KEPT (ui-design Interactions — the float bar's count is
 * unchanged). Default focus = 取消 (the RemoveConfirm DIALOG-SAFE precedent:
 * the continue-side action is the one that proceeds past a warning).
 */
import { useId, useRef } from 'react'
import { ChromeButton } from '../../../components/chrome/ChromeButton'
import { DialogBody, DialogFooter, DialogFrame, ghostButtonStyle, primaryButtonStyle } from '../launch/LaunchStates'
import type { DispatchTranslate } from './SelectionLayer'
import type { MissingItem } from './selection-mode'

const warnTitleStyle = {
  alignItems: 'center',
  color: 'var(--dsw-alias-state-warn-primary, rgb(245, 158, 11))',
  display: 'flex',
  flex: '1',
  fontSize: '16px',
  fontWeight: 600,
  gap: '6px',
  lineHeight: '24px',
  margin: '0',
} as const

const introStyle = {
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0',
} as const

/** The missing list shell (r14 · interactive-bg-hover, the prototype's form). */
const listStyle = {
  background: 'var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.1))',
  borderRadius: '14px',
  listStyle: 'none',
  margin: '0',
  padding: '10px 12px',
} as const

const itemStyle = {
  alignItems: 'baseline',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
  padding: '2px 0',
} as const

/** mono 逐行 — the artifact path/address is the line's lead. */
const artifactStyle = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '12px',
  lineHeight: '18px',
  overflowWrap: 'anywhere',
} as const

const detailStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
} as const

const noteStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0',
} as const

/** The ✕ close (the DialogHeader closeButton geometry, duplicated for the warn-styled title row). */
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

/** Inputs of {@link DispatchWarningDialog}. */
export interface DispatchWarningDialogProps {
  /** The locale seat (the shell's `t`). */
  readonly t: DispatchTranslate
  /** The structured missing list (checkStageArtifacts' merged MissingItem set). */
  readonly missing: readonly MissingItem[]
  /** 继续派发 — the acknowledgeMissing face (never blocked; Hard Rule). */
  readonly onContinue: () => void
  /** 取消 / Esc / ✕ / mask — back to selection mode, selection kept. */
  readonly onCancel: () => void
}

/**
 * The warning dialog (`data-dsh-forge-dialog="dispatch-warning"`). One list
 * line per missing item — the mono artifact + the machine detail; the
 * item's stage/rule ride as data attributes for observation.
 */
export function DispatchWarningDialog(props: DispatchWarningDialogProps) {
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  const generatedId = useId().replace(/[^a-zA-Z0-9-]/g, '')
  const titleId = `dsh-forge-dispatch-warning-title-${generatedId}`

  return (
    <DialogFrame
      role="alertdialog"
      ariaLabelledBy={titleId}
      initialFocus={cancelRef}
      onDismiss={props.onCancel}
      dialogDataKey="dispatch-warning"
    >
      <div style={{ alignItems: 'center', display: 'flex', gap: '8px' }}>
        <h2 id={titleId} style={warnTitleStyle}>
          <span aria-hidden="true">⚠</span>
          {props.t('tasks.dispatch.warning.title')}
        </h2>
        <ChromeButton
          type="button"
          aria-label={props.t('tasks.dispatch.warning.cancel')}
          data-dsh-forge-dialog-close=""
          style={closeButtonStyle}
          onClick={props.onCancel}
        >
          <span aria-hidden="true">✕</span>
        </ChromeButton>
      </div>
      <DialogBody>
        <p style={introStyle}>{props.t('tasks.dispatch.warning.intro')}</p>
        <ul data-dsh-forge-dispatch-missing-list="" style={listStyle} aria-label={props.t('tasks.dispatch.warning.listLabel')}>
          {props.missing.map((item, index) => (
            <li
              key={`${item.stage}/${item.rule}/${item.artifact}/${index}`}
              data-dsh-forge-dispatch-missing-item=""
              data-dsh-forge-dispatch-missing-stage={item.stage}
              data-dsh-forge-dispatch-missing-rule={item.rule}
              style={itemStyle}
            >
              <span style={artifactStyle}>{item.artifact}</span>
              <span style={detailStyle} title={item.detail}>{item.detail}</span>
            </li>
          ))}
        </ul>
        <p data-dsh-forge-dispatch-warning-note="" style={noteStyle}>
          {props.t('tasks.dispatch.warning.note')}
        </p>
      </DialogBody>
      <DialogFooter>
        <ChromeButton
          ref={cancelRef}
          type="button"
          data-dsh-forge-dispatch-warning-cancel=""
          style={ghostButtonStyle}
          onClick={props.onCancel}
        >
          {props.t('tasks.dispatch.warning.cancel')}
        </ChromeButton>
        <ChromeButton
          type="button"
          data-dsh-forge-dispatch-warning-continue=""
          style={primaryButtonStyle}
          onClick={props.onContinue}
        >
          {props.t('tasks.dispatch.warning.continue')}
        </ChromeButton>
      </DialogFooter>
    </DialogFrame>
  )
}
