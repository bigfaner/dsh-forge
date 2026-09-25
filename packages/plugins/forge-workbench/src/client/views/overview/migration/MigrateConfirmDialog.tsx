/**
 * The UF3 migration confirm dialog (task 1.6, ui-design 迁移确认对话框):
 * the ONE door of the explicit migration (Hard Rule: 迁移必须显式确认,无
 * 自动/静默路径) — a r24 dialog over the shared DialogFrame at the width the
 * spec pins (`min(520px, 100vw - 48px)`, the frame's own geometry), carrying
 * the mono backup location and the four-line step description:
 *
 *   · 任务结构化状态 → 应用数据内核(SQLite)
 *   · 迁移前自动备份(零半迁移:任一步失败整体回滚)+ 备份位置(mono)
 *   · 完成后 tasks/index.json 退役归档(*.migrated 保留 — Interface 4 §6
 *     归档改名,不是删除;ui-design 的「移除」按 tech-design 归档口径措辞)
 *   · 任务与记录 md 文件不动
 *
 * Default focus = CANCEL (the RemoveConfirm DIALOG-SAFE precedent: the
 * confirm-side action is the irreversible one, so focus never starts on it).
 * Esc / mask / ✕ cancel. A start-side guard rejection (ERR_MIGRATION_GUARD /
 * ERR_MIGRATION_IN_PROGRESS — the flow routes those BACK here rather than
 * into the failed-rollback presentation, because nothing ran) renders inline
 * as the guard note instead of an error dialog.
 */
import { useId, useRef } from 'react'
import type { WorkbenchVerbError } from '../../../ipc-types'
import type { WorkbenchKey } from '../../../locale/en'
import { fillTemplate } from '../format'
import { ChromeButton } from '../../../components/chrome/ChromeButton'
import {
  DialogBody, DialogFooter, DialogFrame, DialogHeader, ghostButtonStyle,
} from '../../tasks/launch/LaunchStates'

/** The translate seat shape this module's consumers pass through. */
export type MigrationTranslate = (key: WorkbenchKey) => string

/**
 * The confirm door's inline note for a pre-flight start rejection (code →
 * copy routing, the i18n/errors.ts wizard precedent — the COPY stays in the
 * locale halves): guard / in-progress get their specific guidance, anything
 * else folds into the generic note with the raw code. Non-guard rejections
 * never reach this door (they render the failed-rollback terminal instead).
 */
export function migrationStartErrorText(rejection: WorkbenchVerbError, t: MigrationTranslate): string {
  if (rejection.code === 'ERR_MIGRATION_GUARD') return t('migration.err.guard')
  if (rejection.code === 'ERR_MIGRATION_IN_PROGRESS') return t('migration.err.inProgress')
  return fillTemplate(t('migration.err.generic'), { code: rejection.code })
}

const bulletStyle = {
  margin: '0',
  paddingLeft: '18px',
} as const

const bulletListStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  margin: '0',
  padding: '0',
} as const

const introStyle = {
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0',
} as const

const backupRowStyle = {
  alignItems: 'baseline',
  borderRadius: '14px',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
  padding: '10px 12px',
  background: 'var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.1))',
} as const

const backupLabelStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
} as const

const backupPathStyle = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '12px',
  lineHeight: '18px',
  overflowWrap: 'anywhere',
} as const

/** ui-design md primary pill (h36 r18) — the confirm verb. */
const migrateButtonStyle = {
  background: 'var(--dsw-alias-link, rgb(65, 118, 230))',
  border: 'none',
  borderRadius: '18px',
  color: '#fff',
  cursor: 'pointer',
  font: 'inherit',
  fontWeight: 500,
  height: '36px',
  padding: '0 16px',
} as const

const guardNoteStyle = {
  border: '1px solid var(--dsw-alias-state-warn-primary, rgb(245, 158, 11))',
  borderRadius: '14px',
  color: 'var(--dsw-alias-state-warn-primary, rgb(245, 158, 11))',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0',
  padding: '8px 12px',
} as const

/** Inputs of {@link MigrateConfirmDialog}. */
export interface MigrateConfirmDialogProps {
  /** The locale seat (the shell's `t`). */
  readonly t: (key: WorkbenchKey) => string
  /** The backup location shown in the description (root or known run path; mono). */
  readonly backupPath: string
  /**
   * The start-side rejection's inline note (guard / in-progress routing);
   * null/undefined = no note. Raw locale text — the flow renders
   * {@link migrationStartErrorText}'s answer here.
   */
  readonly startError?: string | null | undefined
  /** Confirm — the flow fires startMigration (the explicit door). */
  readonly onConfirm: () => void
  /** Cancel / close (Esc, mask, ✕ ride the same leg). */
  readonly onCancel: () => void
}

/**
 * The confirm dialog. `data-dsh-forge-dialog="migrate-confirm"` joins the
 * dialog family's observation contract; the mono path carries
 * `data-dsh-forge-migrate-backup-path`, the guard note
 * `data-dsh-forge-migrate-guard-note`.
 */
export function MigrateConfirmDialog(props: MigrateConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  const generatedId = useId().replace(/[^a-zA-Z0-9-]/g, '')
  const titleId = `dsh-forge-migrate-confirm-title-${generatedId}`

  return (
    <DialogFrame
      role="alertdialog"
      ariaLabelledBy={titleId}
      initialFocus={cancelRef}
      onDismiss={props.onCancel}
      dialogDataKey="migrate-confirm"
    >
      <DialogHeader
        id={titleId}
        title={props.t('migration.confirm.title')}
        closeLabel={props.t('migration.confirm.cancel')}
        onClose={props.onCancel}
      />
      <DialogBody>
        <p style={introStyle}>{props.t('migration.confirm.intro')}</p>
        <ul style={bulletListStyle}>
          <li style={bulletStyle}>{props.t('migration.confirm.bullet.tasks')}</li>
          <li style={bulletStyle}>{props.t('migration.confirm.bullet.backup')}</li>
          <li style={bulletStyle}>{props.t('migration.confirm.bullet.archive')}</li>
          <li style={bulletStyle}>{props.t('migration.confirm.bullet.md')}</li>
        </ul>
        <div style={backupRowStyle}>
          <span style={backupLabelStyle}>{props.t('migration.confirm.backupLabel')}</span>
          <span data-dsh-forge-migrate-backup-path="" title={props.backupPath} style={backupPathStyle}>
            {props.backupPath}
          </span>
        </div>
        {(props.startError ?? '') !== '' && (
          <p data-dsh-forge-migrate-guard-note="" role="status" style={guardNoteStyle}>
            {props.startError}
          </p>
        )}
      </DialogBody>
      <DialogFooter>
        <ChromeButton
          ref={cancelRef}
          type="button"
          data-dsh-forge-migrate-cancel=""
          style={ghostButtonStyle}
          onClick={props.onCancel}
        >
          {props.t('migration.confirm.cancel')}
        </ChromeButton>
        <ChromeButton
          type="button"
          data-dsh-forge-migrate-confirm=""
          style={migrateButtonStyle}
          onClick={props.onConfirm}
        >
          {props.t('migration.confirm.migrate')}
        </ChromeButton>
      </DialogFooter>
    </DialogFrame>
  )
}
