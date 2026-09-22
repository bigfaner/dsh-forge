/**
 * Wizard step ① (task 5.4, ui-design UF1 注册向导): the code-root input with
 * the forge-detection instant feedback — checking spinner, detected overview
 * (task/feature counts), or the inline error + correction guidance that
 * KEEPS the wizard on step ① (「下一步」 stays disabled; the copy routes
 * through the centralized i18n/errors.ts table). Edit mode renders the same
 * step read-only: ProjectPatch cannot change codeRoot, so the prefill shows
 * the registered root and its current detection state (重指向校验同链).
 */
import { useId, type RefObject } from 'react'

import type { CodeRootProbe } from '../RegisterWizard.tsx'
import type { WorkbenchKey } from '../../../locale/en'
import { wizardErrorGuidance, wizardErrorMessage } from '../../../i18n/errors'
import { LaunchSpinner } from '../../tasks/launch/LaunchStates'

const fieldLabelStyle = {
  fontSize: '14px',
  fontWeight: 500,
  lineHeight: '22px',
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

/** ui-design 12/18 inline copy: success/detection line. */
const noteStyle = {
  alignItems: 'center',
  display: 'flex',
  fontSize: '12px',
  gap: '6px',
  lineHeight: '18px',
  margin: '0',
} as const

const detectedStyle = {
  ...noteStyle,
  color: 'var(--dsw-alias-state-success-primary, rgb(34, 197, 94))',
} as const

/** ui-design 未检出: 输入下错误文案 (error 色 12/18) + 引导. */
const errorStyle = {
  ...noteStyle,
  color: 'var(--dsw-alias-state-error-primary, rgb(236, 19, 19))',
  flexDirection: 'column',
  gap: '2px',
} as const

const hintStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0',
} as const

/** Inputs of {@link StepPath}. */
export interface StepPathProps {
  /** The locale seat (the shell's `t`). */
  readonly t: (key: WorkbenchKey) => string
  /** The draft's codeRoot value (verbatim input text). */
  readonly value: string
  /** false in edit mode: ProjectPatch carries no codeRoot, so the field is fixed. */
  readonly editable: boolean
  /** The probe machine's current state (idle / checking / detected / failed). */
  readonly probe: CodeRootProbe
  /** Attach point for the dialog's initial focus (the first field owns it). */
  readonly inputRef: RefObject<HTMLInputElement>
  /** Draft update (register mode only). */
  readonly onChange: (value: string) => void
}

/** Step ① content: 选择代码根目录 + probe feedback. */
export function StepPath(props: StepPathProps) {
  const generatedId = useId().replace(/[^a-zA-Z0-9-]/g, '')
  const labelId = `dsh-forge-wizard-coderoot-label-${generatedId}`
  const inputId = `dsh-forge-wizard-coderoot-input-${generatedId}`
  return (
    <section data-dsh-forge-wizard-step-path="" aria-labelledby={labelId}>
      <label id={labelId} style={fieldLabelStyle} htmlFor={inputId}>{props.t('wizard.step1.title')}</label>
      <input
        id={inputId}
        ref={props.inputRef}
        type="text"
        style={inputStyle}
        placeholder={props.t('wizard.step1.placeholder')}
        value={props.value}
        readOnly={!props.editable}
        data-dsh-forge-wizard-path-input=""
        onChange={(event) => { props.onChange(event.target.value) }}
      />
      {!props.editable && <p style={hintStyle}>{props.t('wizard.step1.readonlyHint')}</p>}

      {props.probe.status === 'checking' && (
        <p data-dsh-forge-wizard-probe="checking" style={noteStyle}>
          <LaunchSpinner label={props.t('wizard.step1.checking')} />
          <span>{props.t('wizard.step1.checking')}</span>
        </p>
      )}
      {props.probe.status === 'detected' && (
        <p data-dsh-forge-wizard-probe="detected" style={detectedStyle}>
          {props.t('wizard.step1.detected')
            .replace('{tasks}', String(props.probe.taskTotal))
            .replace('{features}', String(props.probe.featureTotal))}
        </p>
      )}
      {props.probe.status === 'failed' && (
        <div data-dsh-forge-wizard-probe="failed" role="alert" style={errorStyle}>
          <span>{wizardErrorMessage(props.probe.reasonCode, props.t)}</span>
          <span data-dsh-forge-wizard-probe-guide="">{wizardErrorGuidance(props.probe.reasonCode, props.t)}</span>
        </div>
      )}
    </section>
  )
}
