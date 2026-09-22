/**
 * The remove double-confirm (task 5.3, task Hard Rule): 移除 MUST pass a
 * two-step confirmation, and the confirmation copy MUST promise — never
 * imply the opposite — that repository files are untouched
 * (`overview.remove.promise`: 仅移除工作台内的注册信息,不删除仓库内的任何文件).
 * The dialog rides the SAME DialogFrame the UF5 overlays use (launch/
 * LaunchStates): one focus contract — focus-in on open, Tab/Shift+Tab trap,
 * Esc/mask/✕ dismiss — with the DIALOG-SAFE default focus: the CANCEL
 * button, never the destructive confirm (ui-design dialog rules; contrast
 * the launch confirm, whose primary IS the safe action and takes focus).
 *
 * Geometry per ui-design: r24 dialog over mask-1 + blur, z1200 (the frame's
 * own constants); the confirm button uses the error-state action color so
 * the destructive verb reads as such in both themes.
 */
import { useId, useRef } from 'react'
import type { Project } from '../../ipc-types'
import type { WorkbenchKey } from '../../locale/en'
import { ChromeButton } from '../../components/chrome/ChromeButton'
import {
  DialogBody, DialogFooter, DialogFrame, DialogHeader, ghostButtonStyle,
} from '../tasks/launch/LaunchStates'

const rowLabelStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
} as const

const monoStyle = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '12px',
  lineHeight: '18px',
  overflowWrap: 'anywhere',
} as const

const nameStyle = {
  fontSize: '14px',
  fontWeight: 600,
  lineHeight: '22px',
  margin: '0',
} as const

/** The promise copy: 12/18 secondary — it is the point of the dialog, render it prominent enough to read. */
const promiseStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0',
} as const

const hintStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0',
} as const

/** The destructive confirm: error-state fill (both themes), md pill geometry. */
const destructiveButtonStyle = {
  background: 'var(--dsw-alias-state-error-primary, rgb(236, 19, 19))',
  border: 'none',
  borderRadius: '18px',
  color: '#fff',
  cursor: 'pointer',
  font: 'inherit',
  fontWeight: 500,
  height: '36px',
  padding: '0 16px',
} as const

/** Inputs of {@link RemoveConfirm}. */
export interface RemoveConfirmProps {
  /** The locale seat (the shell's `t`). */
  t: (key: WorkbenchKey) => string
  /** The project whose REGISTRATION is being removed (identity shown verbatim). */
  project: Project
  /** Confirm — fires the Interface 1 removeProject verb (the page's owner). */
  onConfirm: () => void
  /** Cancel / close (focus returns to the card's 移除 button via the page). */
  onCancel: () => void
}

/**
 * The double-confirm dialog. `data-dsh-forge-dialog="overview-remove-confirm"`
 * joins the launch dialog family's observation contract.
 */
export function RemoveConfirm(props: RemoveConfirmProps) {
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  const generatedId = useId().replace(/[^a-zA-Z0-9-]/g, '')
  const titleId = `dsh-forge-overview-remove-title-${generatedId}`

  return (
    <DialogFrame
      role="alertdialog"
      ariaLabelledBy={titleId}
      initialFocus={cancelRef}
      onDismiss={props.onCancel}
      dialogDataKey="overview-remove-confirm"
    >
      <DialogHeader
        id={titleId}
        title={props.t('overview.remove.title')}
        closeLabel={props.t('overview.remove.cancel')}
        onClose={props.onCancel}
      />
      <DialogBody>
        <div>
          <div style={rowLabelStyle}>{props.t('overview.rename.label')}</div>
          <p style={nameStyle}>{props.project.displayName}</p>
        </div>
        <div>
          <div style={rowLabelStyle}>{props.t('overview.meta.codeRoot')}</div>
          <div style={monoStyle} data-dsh-forge-remove-coderoot="">{props.project.codeRoot}</div>
        </div>
        {/* The Hard-Rule copy: the promise that repo files are NEVER deleted. */}
        <p data-dsh-forge-remove-promise="" style={promiseStyle}>
          {props.t('overview.remove.promise')}
        </p>
        <p style={hintStyle}>{props.t('overview.remove.hint')}</p>
      </DialogBody>
      <DialogFooter>
        <ChromeButton
          ref={cancelRef}
          type="button"
          data-dsh-forge-remove-cancel=""
          style={ghostButtonStyle}
          onClick={props.onCancel}
        >
          {props.t('overview.remove.cancel')}
        </ChromeButton>
        <ChromeButton
          type="button"
          data-dsh-forge-remove-confirm=""
          style={destructiveButtonStyle}
          onClick={props.onConfirm}
        >
          {props.t('overview.remove.confirm')}
        </ChromeButton>
      </DialogFooter>
    </DialogFrame>
  )
}
