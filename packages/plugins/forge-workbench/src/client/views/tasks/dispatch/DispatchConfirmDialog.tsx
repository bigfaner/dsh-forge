/**
 * The UF1 dispatch confirming dialog (task 3.6, ui-design UF1 States
 * confirming 行): the pre-flight summary — 所选任务列表 (mono key + title,
 * one line each) + the presynth three-element note (任务类型协议 + feature
 * 目标/摘要 + 生效偏好; subagent 启动预算 ≤3s) + [派发(md 主)] / [取消].
 *
 * Reached either directly (artifacts satisfied) or through the warning
 * door's acknowledgeMissing leg. Default focus = the 派发 primary (the launch
 * family's ConfirmPanel precedent: the confirm button is the default focus,
 * so Enter alone dispatches). 取消 / Esc / ✕ / mask return to selection mode
 * with the selection kept.
 */
import { useId, useRef } from 'react'
import { fillTemplate } from '../../overview/format'
import { ChromeButton } from '../../../components/chrome/ChromeButton'
import { DialogBody, DialogFooter, DialogFrame, DialogHeader, ghostButtonStyle, primaryButtonStyle } from '../launch/LaunchStates'
import type { DispatchTranslate } from './SelectionLayer'

const introStyle = {
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0',
} as const

/** The selected-task list shell (r14 · interactive-bg-hover). */
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

const keyStyle = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '12px',
  lineHeight: '18px',
} as const

const titleStyle = {
  fontSize: '14px',
  lineHeight: '22px',
} as const

const noteStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0',
} as const

/** One selected task of the batch (the layer resolves entries → key + title). */
export interface DispatchConfirmTask {
  readonly key: string
  readonly title: string
}

/** Inputs of {@link DispatchConfirmDialog}. */
export interface DispatchConfirmDialogProps {
  /** The locale seat (the shell's `t`). */
  readonly t: DispatchTranslate
  /** The batch under confirmation (pendingKeys resolved against the entries). */
  readonly tasks: readonly DispatchConfirmTask[]
  /** 派发 — the dispatchTasks leg (acknowledgeMissing rides the machine). */
  readonly onConfirm: () => void
  /** 取消 / Esc / ✕ / mask — back to selection mode, selection kept. */
  readonly onCancel: () => void
}

/**
 * The confirming dialog (`data-dsh-forge-dialog="dispatch-confirm"`): the
 * count intro + one line per selected task + the presynth three-element
 * note.
 */
export function DispatchConfirmDialog(props: DispatchConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement | null>(null)
  const generatedId = useId().replace(/[^a-zA-Z0-9-]/g, '')
  const titleId = `dsh-forge-dispatch-confirm-title-${generatedId}`

  return (
    <DialogFrame
      role="dialog"
      ariaLabelledBy={titleId}
      initialFocus={confirmRef}
      onDismiss={props.onCancel}
      dialogDataKey="dispatch-confirm"
    >
      <DialogHeader
        id={titleId}
        title={props.t('tasks.dispatch.confirm.title')}
        closeLabel={props.t('tasks.dispatch.confirm.cancel')}
        onClose={props.onCancel}
      />
      <DialogBody>
        <p data-dsh-forge-dispatch-confirm-intro="" style={introStyle}>
          {fillTemplate(props.t('tasks.dispatch.confirm.intro'), { count: String(props.tasks.length) })}
        </p>
        <ul data-dsh-forge-dispatch-confirm-list="" style={listStyle}>
          {props.tasks.map(task => (
            <li key={task.key} data-dsh-forge-dispatch-confirm-item="" data-dsh-forge-dispatch-confirm-key={task.key} style={itemStyle}>
              <span style={keyStyle}>{task.key}</span>
              <span style={titleStyle}>{task.title}</span>
            </li>
          ))}
        </ul>
        <p data-dsh-forge-dispatch-confirm-note="" style={noteStyle}>
          {props.t('tasks.dispatch.confirm.presynth')}
        </p>
      </DialogBody>
      <DialogFooter>
        <ChromeButton
          type="button"
          data-dsh-forge-dispatch-confirm-cancel=""
          style={ghostButtonStyle}
          onClick={props.onCancel}
        >
          {props.t('tasks.dispatch.confirm.cancel')}
        </ChromeButton>
        <ChromeButton
          ref={confirmRef}
          type="button"
          data-dsh-forge-dispatch-confirm-go=""
          style={primaryButtonStyle}
          onClick={props.onConfirm}
        >
          {props.t('tasks.dispatch.confirm.go')}
        </ChromeButton>
      </DialogFooter>
    </DialogFrame>
  )
}
