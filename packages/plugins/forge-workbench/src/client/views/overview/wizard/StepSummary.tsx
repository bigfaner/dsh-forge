/**
 * Wizard step ③ (task 5.4, ui-design UF1): the read-only summary of the two
 * collected choices + the displayName confirm (缺省 = codeRoot 目录名 shown as
 * the placeholder) — the ONLY step whose action calls a verb (task Hard
 * Rule: 向导提交前不得写入任何持久状态). The submit rejections render here:
 * ERR_PROJECT_EXISTS → 已注册提示 + 定位既有项目卡片 CTA (spec Error
 * Handling), anything else → the generic failed line with the serialized
 * message.
 */
import { useId } from 'react'
import type { Project } from '../../../ipc-types'
import type { WorkbenchKey } from '../../../locale/en'
import { ChromeButton } from '../../../components/chrome/ChromeButton'
import { ghostButtonStyle } from '../../tasks/launch/LaunchStates'

const titleStyle = {
  fontSize: '14px',
  fontWeight: 500,
  lineHeight: '22px',
} as const

const rowLabelStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
} as const

const monoStyle = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '13px',
  lineHeight: '20px',
  margin: '0',
  overflowWrap: 'anywhere',
} as const

const plainStyle = {
  fontSize: '13px',
  lineHeight: '20px',
  margin: '0',
  overflowWrap: 'anywhere',
} as const

const inputStyle = {
  background: 'transparent',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '8px',
  color: 'inherit',
  font: 'inherit',
  height: '32px',
  minWidth: '0',
  padding: '0 10px',
  width: '100%',
} as const

const hintStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0',
} as const

/** ui-design error 态 12/18; the exists block carries its locate CTA inline. */
const errorStyle = {
  alignItems: 'center',
  border: '1.5px solid var(--dsw-alias-state-error-primary, rgb(236, 19, 19))',
  borderRadius: '14px',
  color: 'var(--dsw-alias-state-error-primary, rgb(236, 19, 19))',
  display: 'flex',
  flexWrap: 'wrap',
  fontSize: '12px',
  gap: '8px',
  lineHeight: '18px',
  margin: '0',
  padding: '10px 12px',
} as const

/** Inputs of {@link StepSummary}. */
export interface StepSummaryProps {
  /** The locale seat (the shell's `t`). */
  readonly t: (key: WorkbenchKey) => string
  /** The collected codeRoot (read-only row). */
  readonly codeRoot: string
  /** The collected docs-location choice (read-only row). */
  readonly docLocationType: 'in_repo' | 'external'
  /** The collected external path, when external (read-only row). */
  readonly docLocationPath: string
  /** The draft's displayName text (verbatim; empty = the default). */
  readonly displayName: string
  /** The placeholder default — the codeRoot directory name. */
  readonly defaultName: string
  /** The in-flight submit's serialized rejection, when the verb failed. */
  readonly submitError: { readonly code: string; readonly message: string } | undefined
  /** The already-registered row for ERR_PROJECT_EXISTS (locate target). */
  readonly existingProject: Project | undefined
  /**
   * Task 1.7: the conditional ③'s collected choice, shown as a read-only row
   * (undefined = the step never offered — no row, the classic three-step form).
   */
  readonly migrationChoice: 'now' | 'defer' | undefined
  /** Draft update. */
  readonly onNameChange: (value: string) => void
  /** The locate CTA — the wizard closes itself right after firing it. */
  readonly onLocate: () => void
}

/** Fill the submitFailed template's `{message}` slot. */
function fill(template: string, message: string): string {
  return template.replace('{message}', message)
}

/**
 * Step ③ content: 确认 + the submit-rejection surfaces. The ERR_PROJECT_EXISTS
 * block is role=alert (its CTA changes what the user can do); the generic
 * failure rides the same role.
 */
export function StepSummary(props: StepSummaryProps) {
  const generatedId = useId().replace(/[^a-zA-Z0-9-]/g, '')
  const nameInputId = `dsh-forge-wizard-name-${generatedId}`
  const exists = props.submitError !== undefined && props.submitError.code === 'ERR_PROJECT_EXISTS'
  return (
    <section data-dsh-forge-wizard-step-summary="">
      <h3 style={titleStyle}>{props.t('wizard.step3.title')}</h3>
      <div>
        <div style={rowLabelStyle}>{props.t('overview.meta.codeRoot')}</div>
        <p data-dsh-forge-wizard-summary-coderoot="" style={monoStyle}>{props.codeRoot}</p>
      </div>
      <div>
        <div style={rowLabelStyle}>{props.t('overview.meta.docLocation')}</div>
        <p data-dsh-forge-wizard-summary-doc="" style={plainStyle}>
          {props.t(props.docLocationType === 'in_repo' ? 'overview.doc.inRepo' : 'overview.doc.external')}
          {props.docLocationType === 'external' && props.docLocationPath.trim() !== '' && (
            <span style={monoStyle}>{` · ${props.docLocationPath.trim()}`}</span>
          )}
        </p>
      </div>
      {props.migrationChoice !== undefined && (
        <div>
          <div style={rowLabelStyle}>{props.t('wizard.stepMigrate.title')}</div>
          <p data-dsh-forge-wizard-summary-migrate="" style={plainStyle}>
            {props.t(props.migrationChoice === 'now' ? 'wizard.summary.migrateNow' : 'wizard.summary.migrateDefer')}
          </p>
        </div>
      )}
      <div>
        <label style={rowLabelStyle} htmlFor={nameInputId}>{props.t('overview.rename.label')}</label>
        <input
          id={nameInputId}
          type="text"
          style={inputStyle}
          placeholder={props.defaultName}
          value={props.displayName}
          data-dsh-forge-wizard-name-input=""
          onChange={(event) => { props.onNameChange(event.target.value) }}
        />
        <p style={hintStyle}>{props.t('wizard.step3.nameHint')}</p>
      </div>

      {exists && (
        <div role="alert" data-dsh-forge-wizard-exists="" style={errorStyle}>
          <span>{props.t('wizard.err.projectExists')}</span>
          {props.existingProject !== undefined && (
            <ChromeButton
              type="button"
              data-dsh-forge-wizard-locate=""
              style={{ ...ghostButtonStyle, height: '24px', padding: '0 8px' }}
              onClick={() => { props.onLocate() }}
            >
              {props.t('wizard.locate')}
            </ChromeButton>
          )}
        </div>
      )}
      {props.submitError !== undefined && !exists && (
        <div role="alert" data-dsh-forge-wizard-submit-error="" style={errorStyle}>
          <span>{fill(props.t('wizard.submitFailed'), props.submitError.message)}</span>
        </div>
      )}
    </section>
  )
}
