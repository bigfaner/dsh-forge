/**
 * Wizard step ② (task 5.4, ui-design UF1): the docs-location choice — 仓内
 * (default, nothing to configure) or 仓外本地路径. The external branch rides
 * the full validation chain: path required → ≠ codeRoot (ERR_DOC_PATH_CONFLICT,
 * 「下一步」 disabled) → readable (ERR_EXTERNAL_PATH_UNREADABLE, rides the
 * 授权说明块) → the EXPLICIT authorization confirm without which 「下一步」
 * stays disabled (未授权不可进入下一步). Error copy routes through
 * i18n/errors.ts; the conflict guard itself is the shared paths.ts equality,
 * the same primitive the verb chain applies.
 */
import { useId } from 'react'
import type { DocLocationType } from '../../../ipc-types'
import type { ExternalProbe, Step2Issue } from '../RegisterWizard.tsx'
import type { WorkbenchKey } from '../../../locale/en'
import { wizardErrorGuidance, wizardErrorMessage } from '../../../i18n/errors'
import { LaunchSpinner } from '../../tasks/launch/LaunchStates'

const groupLabelStyle = {
  fontSize: '14px',
  fontWeight: 500,
  lineHeight: '22px',
} as const

const optionRowStyle = {
  alignItems: 'flex-start',
  display: 'flex',
  gap: '8px',
  margin: '0',
} as const

const optionTextStyle = {
  fontSize: '14px',
  lineHeight: '22px',
} as const

const optionHintStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  display: 'block',
  fontSize: '12px',
  lineHeight: '18px',
} as const

const inputStyle = {
  background: 'transparent',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '8px',
  color: 'inherit',
  font: 'inherit',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '13px',
  height: '32px',
  minWidth: '0',
  padding: '0 10px',
  width: '100%',
} as const

/** ui-design 未检出/输入下错误文案: error 色 12/18. */
const errorStyle = {
  color: 'var(--dsw-alias-state-error-primary, rgb(236, 19, 19))',
  display: 'flex',
  flexDirection: 'column',
  fontSize: '12px',
  gap: '2px',
  lineHeight: '18px',
  margin: '0',
} as const

/** ui-design 仓外选中: 授权说明块 (warn 色 12/18, r14 卡). */
const authBlockStyle = {
  border: '1.5px solid var(--dsw-alias-state-warn-primary, rgb(245, 158, 11))',
  borderRadius: '14px',
  color: 'var(--dsw-alias-state-warn-primary, rgb(245, 158, 11))',
  display: 'flex',
  flexDirection: 'column',
  fontSize: '12px',
  gap: '8px',
  lineHeight: '18px',
  margin: '0',
  padding: '10px 12px',
} as const

const authRowStyle = {
  alignItems: 'flex-start',
  color: 'inherit',
  display: 'flex',
  gap: '8px',
} as const

const checkingStyle = {
  alignItems: 'center',
  color: 'var(--dsw-alias-label-secondary, inherit)',
  display: 'flex',
  fontSize: '12px',
  gap: '6px',
  lineHeight: '18px',
  margin: '0',
} as const

/** Inputs of {@link StepExternal}. */
export interface StepExternalProps {
  /** The locale seat (the shell's `t`). */
  readonly t: (key: WorkbenchKey) => string
  /** The registered/entered codeRoot — the conflict guard's other side. */
  readonly codeRoot: string
  /** The draft's docs-location choice. */
  readonly docLocationType: DocLocationType
  /** The draft's external path text (verbatim). */
  readonly docLocationPath: string
  /** The explicit authorization flag (per-path; edits reset it). */
  readonly externalAuthorized: boolean
  /** The external probe machine's state. */
  readonly externalProbe: ExternalProbe
  /** The derived blocking issue of the step (drives the inline copy). */
  readonly issue: Step2Issue
  /** Choice update. */
  readonly onTypeChange: (type: DocLocationType) => void
  /** Path update — the owner resets the authorization on every edit. */
  readonly onPathChange: (path: string) => void
  /** Authorization update (the explicit confirm interaction). */
  readonly onAuthorizeChange: (authorized: boolean) => void
}

/**
 * Step ② content: 文档位置. The group + radios carry the a11y semantics
 * (radiogroup + labels); the error block is role=alert so screen readers
 * hear the blocking reason when it appears.
 */
export function StepExternal(props: StepExternalProps) {
  const groupName = `dsh-forge-wizard-doc-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`
  const external = props.docLocationType === 'external'
  const issue = props.issue
  return (
    <section data-dsh-forge-wizard-step-doc="">
      <div role="radiogroup" aria-label={props.t('overview.meta.docLocation')} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <span style={groupLabelStyle}>{props.t('overview.meta.docLocation')}</span>
        <label style={optionRowStyle}>
          <input
            type="radio"
            name={groupName}
            checked={props.docLocationType === 'in_repo'}
            data-dsh-forge-wizard-doc-in-repo=""
            onChange={() => { props.onTypeChange('in_repo') }}
          />
          <span style={optionTextStyle}>
            {props.t('wizard.step2.inRepo')}
            <span style={optionHintStyle}>{props.t('wizard.step2.inRepoHint')}</span>
          </span>
        </label>
        <label style={optionRowStyle}>
          <input
            type="radio"
            name={groupName}
            checked={external}
            data-dsh-forge-wizard-doc-external=""
            onChange={() => { props.onTypeChange('external') }}
          />
          <span style={optionTextStyle}>{props.t('wizard.step2.external')}</span>
        </label>
      </div>

      {external && (
        <>
          <input
            type="text"
            style={inputStyle}
            placeholder={props.t('wizard.step2.externalPlaceholder')}
            value={props.docLocationPath}
            data-dsh-forge-wizard-external-input=""
            onChange={(event) => { props.onPathChange(event.target.value) }}
          />

          {issue === 'required' && (
            <div role="alert" data-dsh-forge-wizard-external-error="required" style={errorStyle}>
              <span>{props.t('wizard.step2.required')}</span>
            </div>
          )}
          {issue === 'conflict' && (
            <div role="alert" data-dsh-forge-wizard-external-error="conflict" style={errorStyle}>
              <span>{wizardErrorMessage('ERR_DOC_PATH_CONFLICT', props.t)}</span>
              <span>{wizardErrorGuidance('ERR_DOC_PATH_CONFLICT', props.t)}</span>
            </div>
          )}
          {issue === 'unreadable' && (
            <div role="alert" data-dsh-forge-wizard-external-error="unreadable" style={errorStyle}>
              <span>{wizardErrorMessage('ERR_EXTERNAL_PATH_UNREADABLE', props.t)}</span>
              <span>{wizardErrorGuidance('ERR_EXTERNAL_PATH_UNREADABLE', props.t)}</span>
            </div>
          )}
          {props.externalProbe.status === 'checking' && (
            <p data-dsh-forge-wizard-external-probe="checking" style={checkingStyle}>
              <LaunchSpinner label={props.t('wizard.step2.checking')} />
              <span>{props.t('wizard.step2.checking')}</span>
            </p>
          )}

          {/* The explicit-authorization block — visible whenever 仓外 is the
              choice; 未授权 keeps 「下一步」 disabled (ui-design Interactions). */}
          <div data-dsh-forge-wizard-auth-block="" style={authBlockStyle}>
            <p style={{ margin: '0' }}>{props.t('wizard.step2.warn')}</p>
            <label style={authRowStyle}>
              <input
                type="checkbox"
                checked={props.externalAuthorized}
                data-dsh-forge-wizard-authorize=""
                onChange={(event) => { props.onAuthorizeChange(event.target.checked) }}
              />
              <span>{props.t('wizard.step2.authorize')}</span>
            </label>
          </div>
        </>
      )}
    </section>
  )
}
