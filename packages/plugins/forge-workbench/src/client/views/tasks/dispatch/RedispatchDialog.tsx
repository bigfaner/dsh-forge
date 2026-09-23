/**
 * The UF1 redispatch second-confirmation dialog (task 3.8, ui-design UF1
 * Interactions 「重派发」行 + prototype #redispatch-confirm): the failure-
 * recovery door's guard — 标题 + 任务行 (mono key + 标题) + 上次失败原因回显
 * + 重走检查/预合成说明 + [取消(ghost)] / [重派发(md 主)].
 *
 * Pure presentation: the chain (confirm → the redispatch verb → the
 * blocked|dispatched union) lives in OrchestrationSection's controller;
 * THIS component only asks. 取消 / Esc / ✕ / mask all return to the side
 * panel (拒绝路径回侧板 — the orchestration partition stays as it was).
 * Default focus = 重派发 primary (the DispatchConfirmDialog family
 * precedent: the confirm button is the default focus, Enter confirms — the
 * kernel re-validates the whole pre-check chain regardless).
 */
import { useId, useRef } from 'react'
import { fillTemplate } from '../../overview/format'
import { ChromeButton } from '../../../components/chrome/ChromeButton'
import { DialogBody, DialogFooter, DialogFrame, DialogHeader, ghostButtonStyle, primaryButtonStyle } from '../launch/LaunchStates'
import type { DispatchTranslate } from './DispatchBadge'

/** The task line (mono key lead + 14/22 title). */
const taskLineStyle = {
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0',
} as const

const keyStyle = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '12px',
  lineHeight: '18px',
} as const

/** 原因回显 — 12/18 secondary. */
const reasonStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '6px 0 0',
  overflowWrap: 'anywhere',
  whiteSpace: 'pre-wrap',
} as const

/** 重走检查/预合成说明 — 12/18 secondary. */
const noteStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '8px 0 0',
} as const

/** Inputs of {@link RedispatchDialog}. */
export interface RedispatchDialogProps {
  /** The locale seat (the shell's `t`). */
  readonly t: DispatchTranslate
  /** The dialog's subject task (qualified board key — the mono lead). */
  readonly taskKey: string
  /** The task title (the 14/22 line after the key). */
  readonly taskTitle: string
  /** 上次失败原因 (the failed dispatch row's error); null → the none-recorded fallback copy. */
  readonly reason: string | null
  /** 重派发 — confirm (the chain then re-runs the kernel check + presynthesis). */
  readonly onConfirm: () => void
  /** 取消 / Esc / ✕ / mask — back to the side panel, nothing fired. */
  readonly onCancel: () => void
}

/**
 * The redispatch confirmation (`data-dsh-forge-dialog="redispatch-confirm"`):
 * the reason ECHO is the dialog's reason for existing (the user judges
 * whether the failure was transient before re-firing the same task); the
 * note states the re-run semantics (重走检查 + 预合成 — the kernel's
 * redispatch is a full re-entry, not a resume).
 */
export function RedispatchDialog(props: RedispatchDialogProps) {
  const confirmRef = useRef<HTMLButtonElement | null>(null)
  const generatedId = useId().replace(/[^a-zA-Z0-9-]/g, '')
  const titleId = `dsh-forge-redispatch-title-${generatedId}`
  const t = props.t

  return (
    <DialogFrame
      role="alertdialog"
      ariaLabelledBy={titleId}
      initialFocus={confirmRef}
      onDismiss={props.onCancel}
      dialogDataKey="redispatch-confirm"
    >
      <DialogHeader
        id={titleId}
        title={t('tasks.redispatch.title')}
        closeLabel={t('tasks.redispatch.cancel')}
        onClose={props.onCancel}
      />
      <DialogBody>
        <p data-dsh-forge-redispatch-task="" style={taskLineStyle}>
          <span style={keyStyle}>{props.taskKey}</span>
          {' '}
          {props.taskTitle}
        </p>
        <p data-dsh-forge-redispatch-reason="" data-dsh-forge-redispatch-reason-recorded={props.reason === null ? 'false' : 'true'} style={reasonStyle}>
          {props.reason === null
            ? t('tasks.redispatch.reason.none')
            : fillTemplate(t('tasks.redispatch.reason'), { reason: props.reason })}
        </p>
        <p data-dsh-forge-redispatch-note="" style={noteStyle}>
          {t('tasks.redispatch.note')}
        </p>
      </DialogBody>
      <DialogFooter>
        <ChromeButton
          type="button"
          data-dsh-forge-redispatch-cancel=""
          style={ghostButtonStyle}
          onClick={props.onCancel}
        >
          {t('tasks.redispatch.cancel')}
        </ChromeButton>
        <ChromeButton
          ref={confirmRef}
          type="button"
          data-dsh-forge-redispatch-go=""
          style={primaryButtonStyle}
          onClick={props.onConfirm}
        >
          {t('tasks.redispatch.go')}
        </ChromeButton>
      </DialogFooter>
    </DialogFrame>
  )
}
