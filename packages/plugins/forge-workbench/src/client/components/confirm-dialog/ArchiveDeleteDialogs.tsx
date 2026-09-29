/**
 * The C8 生命周期确认 Dialog pair (M4 task 3.5; ui-design §Component C8 —
 * 归档/删除确认 Dialog, page-map 浮层「C8 归档/删除确认」). The confirmation
 * copy is the PRD 必答⑤ semantics VERBATIM (task Hard Rule):
 *
 *   归档 —「workspace 保留,会话仍按项目分组」(BIZ-006 归档 ≠ 删除: the dsh
 *           workspace stays, sessions keep their grouping; forge moves the
 *           row into the archived partition and the workbench enters the C2
 *           read-only state).
 *   删除 —「投影移除,会话退未分组(历史不删除)」(the projected workspace is
 *           removed upstream; sessions fall back to dsh's ungrouped semantics
 *           — history is NEVER deleted).
 *
 * Both ride the shared DialogFrame (launch/LaunchStates) — one focus
 * contract (focus-in on open, Tab/Shift+Tab trap, Esc/mask/✕ dismiss) with
 * the DIALOG-SAFE default focus: the CANCEL button, never the destructive
 * confirm (the RemoveConfirm precedent). The delete confirm uses the
 * error-state action color so the destructive verb reads as such in both
 * themes; the archive confirm is a regular primary (reversible by 恢复).
 */
import { useId, useRef } from 'react'
import type { ReactNode } from 'react'
import type { Project } from '../../ipc-types'
import type { WorkbenchKey } from '../../locale/en'
import { ChromeButton } from '../chrome/ChromeButton'
import { ghostButtonStyle } from '../../views/tasks/launch/LaunchStates'
import {
  DialogBody, DialogFooter, DialogFrame, DialogHeader,
} from '../../views/tasks/launch/LaunchStates'

const rowLabelStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
} as const

const nameStyle = {
  fontSize: '14px',
  fontWeight: 600,
  lineHeight: '22px',
  margin: '0',
} as const

/** The 必答⑤ promise: 14/22 secondary — it is the point of the dialog. */
const promiseStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0',
} as const

/** The repo-safety hint (the M2 promise copy reused verbatim). */
const hintStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0',
} as const

/** md primary pill (h36 r18) — the archive confirm (reversible). */
const primaryButtonStyle = {
  background: 'var(--dsw-alias-button-primary-fill, rgb(15, 17, 21))',
  border: 'none',
  borderRadius: '18px',
  color: 'var(--dsw-alias-button-primary-label-primary-foreground, #fff)',
  cursor: 'pointer',
  font: 'inherit',
  fontWeight: 500,
  height: '36px',
  padding: '0 16px',
} as const

/** The destructive confirm: error-state fill (both themes), md pill. */
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

/** The shared body: the project identity row + the 必答⑤ promise + the hint. */
function DialogProjectBody(props: { t: (key: WorkbenchKey) => string; project: Project; promiseKey: WorkbenchKey }): ReactNode {
  const { t, project, promiseKey } = props
  return (
    <DialogBody>
      <div>
        <div style={rowLabelStyle}>{t('overview.rename.label')}</div>
        <p style={nameStyle}>{project.displayName}</p>
      </div>
      {/* The Hard-Rule copy: the 必答⑤ semantics, verbatim. */}
      <p data-dsh-forge-project-promise="" style={promiseStyle}>{t(promiseKey)}</p>
      <p style={hintStyle}>{t('overview.remove.promise')}</p>
    </DialogBody>
  )
}

/** Inputs of {@link ArchiveConfirmDialog}. */
export interface ArchiveConfirmDialogProps {
  /** The locale seat (the plugin's bound `t`). */
  t: (key: WorkbenchKey) => string
  /** The project about to be archived (identity shown verbatim). */
  project: Project
  /** Confirm — fires the Interface 1 archiveProject verb (the seat's owner). */
  onConfirm: () => void
  /** Cancel / close (Esc / mask / ✕ funnel here). */
  onCancel: () => void
}

/**
 * The 归档 double-confirm. `data-dsh-forge-dialog="project-archive-confirm"`
 * joins the launch dialog family's observation contract.
 */
export function ArchiveConfirmDialog(props: ArchiveConfirmDialogProps): ReactNode {
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  const generatedId = useId().replace(/[^a-zA-Z0-9-]/g, '')
  const titleId = `dsh-forge-project-archive-title-${generatedId}`
  return (
    <DialogFrame
      role="alertdialog"
      ariaLabelledBy={titleId}
      initialFocus={cancelRef}
      onDismiss={props.onCancel}
      dialogDataKey="project-archive-confirm"
    >
      <DialogHeader
        id={titleId}
        title={props.t('project.archive.title')}
        closeLabel={props.t('project.dialog.cancel')}
        onClose={props.onCancel}
      />
      <DialogProjectBody t={props.t} project={props.project} promiseKey="project.archive.promise" />
      <DialogFooter>
        <ChromeButton
          ref={cancelRef}
          type="button"
          data-dsh-forge-project-archive-cancel=""
          style={ghostButtonStyle}
          onClick={props.onCancel}
        >
          {props.t('project.dialog.cancel')}
        </ChromeButton>
        <ChromeButton
          type="button"
          data-dsh-forge-project-archive-confirm=""
          style={primaryButtonStyle}
          onClick={props.onConfirm}
        >
          {props.t('project.archive.confirm')}
        </ChromeButton>
      </DialogFooter>
    </DialogFrame>
  )
}

/** Inputs of {@link RemoveProjectConfirmDialog}. */
export interface RemoveProjectConfirmDialogProps {
  /** The locale seat (the plugin's bound `t`). */
  t: (key: WorkbenchKey) => string
  /** The project about to be deleted (identity shown verbatim). */
  project: Project
  /** Confirm — fires the Interface 1 removeProject verb (the seat's owner). */
  onConfirm: () => void
  /** Cancel / close (Esc / mask / ✕ funnel here). */
  onCancel: () => void
}

/**
 * The 删除 double-confirm. `data-dsh-forge-dialog="project-remove-confirm"`
 * joins the launch dialog family's observation contract.
 */
export function RemoveProjectConfirmDialog(props: RemoveProjectConfirmDialogProps): ReactNode {
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  const generatedId = useId().replace(/[^a-zA-Z0-9-]/g, '')
  const titleId = `dsh-forge-project-remove-title-${generatedId}`
  return (
    <DialogFrame
      role="alertdialog"
      ariaLabelledBy={titleId}
      initialFocus={cancelRef}
      onDismiss={props.onCancel}
      dialogDataKey="project-remove-confirm"
    >
      <DialogHeader
        id={titleId}
        title={props.t('project.remove.title')}
        closeLabel={props.t('project.dialog.cancel')}
        onClose={props.onCancel}
      />
      <DialogProjectBody t={props.t} project={props.project} promiseKey="project.remove.promise" />
      <DialogFooter>
        <ChromeButton
          ref={cancelRef}
          type="button"
          data-dsh-forge-project-remove-cancel=""
          style={ghostButtonStyle}
          onClick={props.onCancel}
        >
          {props.t('project.dialog.cancel')}
        </ChromeButton>
        <ChromeButton
          type="button"
          data-dsh-forge-project-remove-confirm=""
          style={destructiveButtonStyle}
          onClick={props.onConfirm}
        >
          {props.t('project.remove.confirm')}
        </ChromeButton>
      </DialogFooter>
    </DialogFrame>
  )
}
