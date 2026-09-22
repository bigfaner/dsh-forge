/**
 * The UF1 项目注册向导, BUILD half (task 5.4): the `workbench/dialog/register`
 * overlay (page-map view-key family, mounted by the workbench shell from the
 * addProject / repoint seams). Three steps — ① codeRoot + forge-detection
 * instant feedback, ② docs location (仓内默认 / 仓外 + 显式授权), ③ summary
 * confirm + displayName (缺省 = codeRoot 目录名) — with back-navigation that
 * never drops state. Edit mode reuses the SAME dialog (标题「重新指向项目」,
 * prefilled from the registered row): the submit walks updateProject's
 * ProjectPatch semantics (rename + repoint; 重指向校验同链 — the same probe
 * and conflict guards run over the prefilled root).
 *
 * Dialog discipline (ui-design 全局规则 + page-map): the shared DialogFrame —
 * focus lands on the first field, Tab/Shift+Tab trap, Esc / mask / ✕ dismiss
 * with a DIRTY guard (any input → the 放弃确认 sub-dialog first; clean closes
 * immediately), dismissal disarmed while the submit is in flight. Enter
 * advances: each step is one form whose submit IS the forward action.
 *
 * Hard Rule: 向导提交前不得写入任何持久状态 — steps ①/② read probes only;
 * the registerProject / updateProject verb fires solely from the step-③
 * confirm.
 *
 * Data layering (the OverviewFace precedent): the face defaults to the
 * build-stage mock twin (mocks/workbench.createMockRegisterWizardFace); the
 * 5.14 assembly spreads the IPC-backed members over it. Error copy routes
 * through the centralized i18n/errors.ts table.
 */
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import type {
  DocLocationType, Project, ProjectPatch, RegisterProjectInput,
} from '../../ipc-types'
import type { RegisterWizardFace } from '../../contract'
import type { WorkbenchKey } from '../../locale/en'
import { ChromeButton } from '../../components/chrome/ChromeButton'
import {
  DialogBody, DialogFooter, DialogFrame, DialogHeader, LaunchSpinner,
  ghostButtonStyle, primaryButtonStyle,
} from '../tasks/launch/LaunchStates'
import { directoryNameOf, normalizePathForCompare, samePath } from '../../paths'
import { createMockRegisterWizardFace } from '../../mocks/workbench'
import { StepPath } from './wizard/StepPath'
import { StepExternal } from './wizard/StepExternal'
import { StepSummary } from './wizard/StepSummary'
import { verbErrorCode } from './OverviewPage'

// ---------------------------------------------------------------------------
// Draft model (pure — exported for direct unit tests)
// ---------------------------------------------------------------------------

/** The wizard's collected input, one field per UI control (verbatim text). */
export interface WizardDraft {
  readonly codeRoot: string
  readonly docLocationType: DocLocationType
  readonly docLocationPath: string
  readonly externalAuthorized: boolean
  readonly displayName: string
}

/** The register mode's pristine draft (step ① empty, 仓内 default — AC1 可跳过). */
export const EMPTY_WIZARD_DRAFT: WizardDraft = Object.freeze({
  codeRoot: '',
  docLocationType: 'in_repo',
  docLocationPath: '',
  externalAuthorized: false,
  displayName: '',
})

/**
 * The edit mode's prefilled draft. The authorization prefills TRUE for the
 * CURRENT external path only — the 2.4 persisted authorization store covers
 * exactly that path; any path edit resets the flag (re-authorize the new
 * path explicitly).
 */
export function draftOfProject(project: Project): WizardDraft {
  return {
    codeRoot: project.codeRoot,
    docLocationType: project.docLocationType,
    docLocationPath: project.docLocationPath ?? '',
    externalAuthorized: project.docLocationType === 'external',
    displayName: project.displayName,
  }
}

/** Field-by-field dirtiness (the discard guard's input). */
export function isWizardDraftDirty(draft: WizardDraft, baseline: WizardDraft): boolean {
  return draft.codeRoot !== baseline.codeRoot
    || draft.docLocationType !== baseline.docLocationType
    || draft.docLocationPath !== baseline.docLocationPath
    || draft.externalAuthorized !== baseline.externalAuthorized
    || draft.displayName !== baseline.displayName
}

/** Step ③'s registerProject payload (Interface 1 RegisterProjectInput). */
export function buildRegisterInput(draft: WizardDraft): RegisterProjectInput {
  const displayName = draft.displayName.trim()
  return {
    codeRoot: normalizePathForCompare(draft.codeRoot),
    docLocationType: draft.docLocationType,
    docLocationPath: draft.docLocationType === 'external' ? normalizePathForCompare(draft.docLocationPath) : null,
    // exactOptionalPropertyTypes: an absent name IS the 缺省 signal — never
    // an explicit undefined.
    ...(displayName === '' ? {} : { displayName }),
  }
}

/** Step ③'s updateProject patch (rename + repoint; ProjectPatch semantics). */
export function buildProjectPatch(draft: WizardDraft): ProjectPatch {
  const displayName = draft.displayName.trim()
  return {
    ...(displayName === '' ? {} : { displayName }),
    docLocationType: draft.docLocationType,
    docLocationPath: draft.docLocationType === 'external' ? normalizePathForCompare(draft.docLocationPath) : null,
  }
}

// ---------------------------------------------------------------------------
// Probe machine states
// ---------------------------------------------------------------------------

/** Step ① detection feedback (ui-design States: 校验中 / 检出 / 未检出). */
export type CodeRootProbe =
  | { readonly status: 'empty' }
  | { readonly status: 'checking' }
  | { readonly status: 'detected'; readonly taskTotal: number; readonly featureTotal: number }
  | { readonly status: 'failed'; readonly reasonCode: 'ERR_CODE_ROOT_UNREADABLE' | 'ERR_FORGE_NOT_DETECTED' }

/** Step ② external-path probe state. */
export type ExternalProbe =
  | { readonly status: 'idle' }
  | { readonly status: 'checking' }
  | { readonly status: 'ok' }
  | { readonly status: 'failed' }

/** Step ②'s derived blocking issue (order = the validation chain). */
export type Step2Issue = undefined | 'required' | 'conflict' | 'checking' | 'unreadable' | 'authorize'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** The close result — the completed verb's row, handed to the shell (5.14 toasts/activates). */
export interface RegisterWizardResult {
  readonly project: Project
  readonly action: 'register' | 'update'
}

/** Inputs of {@link RegisterWizard}. */
export interface RegisterWizardProps {
  /** The locale seat (the shell's `t`). */
  readonly t: (key: WorkbenchKey) => string
  /** register = fresh 3-step flow; edit = the repoint/rename reuse (prefilled). */
  readonly mode: 'register' | 'edit'
  /** The registered row being repointed — required when mode='edit'. */
  readonly project: Project | undefined
  /** The current registry (the ERR_PROJECT_EXISTS locate lookup). */
  readonly projects: readonly Project[]
  /** Face members override the build-stage mock twin (5.14 injects the IPC verbs). */
  readonly face?: Partial<RegisterWizardFace> | undefined
  /** ERR_PROJECT_EXISTS locate notification — the wizard closes itself after firing. */
  readonly onLocate?: ((project: Project) => void) | undefined
  /** Every close path funnels here (success carries the result; cancel/discard carries none). */
  readonly onClose: ((result?: RegisterWizardResult) => void) | undefined
}

/** Destructive fill for the discard confirm (the RemoveConfirm precedent). */
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

/** The step form wraps body + footer so Enter (implicit submit) advances. */
const formStyle = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0,
} as const

/** ui-design 步骤点: current = link fill, past = success fill, future = 1.5px border. */
const dotBaseStyle = {
  borderRadius: '50%',
  flex: '0 0 auto',
  height: '12px',
  width: '12px',
} as const

const connectorStyle = {
  background: 'var(--dsh-border-color, CanvasText)',
  flex: '1 1 auto',
  height: '2px',
  opacity: 0.5,
} as const

const stepTextStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0',
} as const

/**
 * The register wizard overlay (`data-dsh-forge-dialog="register-wizard"`).
 * Mount = open (the shell owns the open/close decision); unmount = closed.
 */
export function RegisterWizard(props: RegisterWizardProps) {
  const { t } = props
  const generatedId = useId().replace(/[^a-zA-Z0-9-]/g, '')
  const titleId = `dsh-forge-wizard-title-${generatedId}`

  // Build-stage default face: one isolated mock twin per mount (5.14 spreads
  // the IPC-backed members over it — the OverviewPage precedent).
  const [defaultFace] = useState(() => createMockRegisterWizardFace())
  const face: RegisterWizardFace = { ...defaultFace, ...props.face }

  const baseline = useMemo(
    () => (props.mode === 'edit' && props.project !== undefined ? draftOfProject(props.project) : EMPTY_WIZARD_DRAFT),
    [props.mode, props.project],
  )
  const [draft, setDraft] = useState<WizardDraft>(baseline)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [codeRootProbe, setCodeRootProbe] = useState<CodeRootProbe>({ status: 'empty' })
  const [externalProbe, setExternalProbe] = useState<ExternalProbe>({ status: 'idle' })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<{ code: string; message: string } | undefined>(undefined)
  const [discardOpen, setDiscardOpen] = useState(false)

  const pathInputRef = useRef<HTMLInputElement>(null)
  const discardCancelRef = useRef<HTMLButtonElement | null>(null)
  const probeSeq = useRef(0)
  const externalSeq = useRef(0)

  // Step ① probe: fires on every codeRoot change (mount included — the edit
  // prefill probes the registered root through the same chain).
  useEffect(() => {
    const codeRoot = draft.codeRoot.trim()
    if (codeRoot === '') {
      setCodeRootProbe({ status: 'empty' })
      return
    }
    setCodeRootProbe({ status: 'checking' })
    const seq = (probeSeq.current += 1)
    void face.probeCodeRoot({ codeRoot }).then((result) => {
      if (seq !== probeSeq.current) return // stale — a newer probe superseded
      setCodeRootProbe(result.available
        ? { status: 'detected', taskTotal: result.taskTotal, featureTotal: result.featureTotal }
        : { status: 'failed', reasonCode: result.reasonCode })
    })
  }, [draft.codeRoot, face.probeCodeRoot])

  // Step ② probe: only the external branch, never for a conflicting/empty
  // path (the conflict guard is client-side + deterministic — paths.ts).
  useEffect(() => {
    if (draft.docLocationType !== 'external') {
      setExternalProbe({ status: 'idle' })
      return
    }
    const path = draft.docLocationPath.trim()
    if (path === '' || samePath(path, draft.codeRoot)) {
      setExternalProbe({ status: 'idle' })
      return
    }
    setExternalProbe({ status: 'checking' })
    const seq = (externalSeq.current += 1)
    void face.probeExternalPath({ codeRoot: draft.codeRoot.trim(), docLocationPath: path }).then((result) => {
      if (seq !== externalSeq.current) return
      setExternalProbe(result.ok ? { status: 'ok' } : { status: 'failed' })
    })
  }, [draft.docLocationType, draft.docLocationPath, draft.codeRoot, face.probeExternalPath])

  // ---- derived step guards -------------------------------------------------

  const step1BlockedReason = codeRootProbe.status === 'empty'
    ? t('wizard.step1.required')
    : codeRootProbe.status === 'checking'
      ? t('wizard.step1.checking')
      : codeRootProbe.status === 'failed'
        ? t(codeRootProbe.reasonCode === 'ERR_CODE_ROOT_UNREADABLE'
          ? 'wizard.err.codeRootUnreadable' : 'wizard.err.forgeNotDetected')
        : undefined
  const canAdvanceStep1 = codeRootProbe.status === 'detected'

  const step2Issue: Step2Issue = draft.docLocationType === 'in_repo'
    ? undefined
    : draft.docLocationPath.trim() === ''
      ? 'required'
      : samePath(draft.docLocationPath, draft.codeRoot)
        ? 'conflict'
        : externalProbe.status === 'checking'
          ? 'checking'
          : externalProbe.status === 'failed'
            ? 'unreadable'
            : !draft.externalAuthorized
              ? 'authorize'
              : undefined
  const step2BlockedReason = step2Issue === 'required'
    ? t('wizard.step2.required')
    : step2Issue === 'conflict'
      ? t('wizard.err.docPathConflict')
      : step2Issue === 'checking'
        ? t('wizard.step2.checking')
        : step2Issue === 'unreadable'
          ? t('wizard.err.externalPathUnreadable')
          : step2Issue === 'authorize'
            ? t('wizard.step2.needAuthorize')
            : undefined
  const canAdvanceStep2 = draft.docLocationType === 'in_repo'
    || (draft.docLocationPath.trim() !== ''
      && !samePath(draft.docLocationPath, draft.codeRoot)
      && externalProbe.status === 'ok'
      && draft.externalAuthorized)

  const dirty = isWizardDraftDirty(draft, baseline)
  const defaultName = directoryNameOf(draft.codeRoot.trim())
  const existingProject = props.projects.find(project => samePath(project.codeRoot, draft.codeRoot.trim()))

  // ---- actions ---------------------------------------------------------------

  const advance = (): void => {
    if (step === 3) return
    if (step === 1 && !canAdvanceStep1) return
    if (step === 2 && !canAdvanceStep2) return
    setStep(current => (current === 3 ? current : (current + 1) as 2 | 3))
  }

  /** The only persistent-write call site (task Hard Rule): step ③ confirm. */
  const submit = async (): Promise<void> => {
    if (submitting) return
    setSubmitting(true)
    setSubmitError(undefined)
    try {
      // 6.4: an external draft's step-② explicit authorization lands FIRST —
      // the registry validation chain reads the persisted record (2.4's single
      // write path; the register/repoint input itself carries no bypass flag).
      // The SAME path normalization the verb payload uses keeps the record and
      // the registered docLocationPath comparable.
      if (draft.docLocationType === 'external' && draft.externalAuthorized) {
        await face.authorizeExternalDocPath(normalizePathForCompare(draft.docLocationPath))
      }
      if (props.mode === 'register') {
        const project = await face.registerProject(buildRegisterInput(draft))
        props.onClose?.({ project, action: 'register' })
      } else if (props.project !== undefined) {
        const updated = await face.updateProject(props.project.id, buildProjectPatch(draft))
        props.onClose?.({ project: updated, action: 'update' })
      }
    } catch (error) {
      const message = typeof error === 'object' && error !== null && 'message' in error
        && typeof (error as { message: unknown }).message === 'string'
        ? (error as { message: string }).message
        : String(error)
      setSubmitError({ code: verbErrorCode(error) ?? 'ERR_WORKBENCH_DB', message })
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (step < 3) advance()
    else void submit()
  }

  /** Esc / mask / ✕: dirty → the discard confirm; clean → immediate close; in-flight → disarmed. */
  const requestClose = (): void => {
    if (submitting || discardOpen) return
    if (dirty) {
      setDiscardOpen(true)
      return
    }
    props.onClose?.()
  }

  const closeAfterLocate = (): void => {
    if (existingProject !== undefined) props.onLocate?.(existingProject)
    props.onClose?.()
  }

  const stepLabel = t('wizard.stepLabel')
    .replace('{current}', String(step))
    .replace('{total}', '3')

  return (
    <>
      <DialogFrame
        role="dialog"
        ariaLabelledBy={titleId}
        initialFocus={pathInputRef}
        onDismiss={submitting ? undefined : requestClose}
        dialogDataKey="register-wizard"
      >
        <DialogHeader
          id={titleId}
          title={t(props.mode === 'edit' ? 'wizard.editTitle' : 'wizard.title')}
          closeLabel={submitting ? undefined : t('wizard.close')}
          onClose={submitting ? undefined : requestClose}
        />
        <form style={formStyle} noValidate data-dsh-forge-wizard-step={step} onSubmit={handleSubmit}>
          <DialogBody>
            {/* 步骤点 + 步骤 N/3 (ui-design Layout; the stepper carries the label). */}
            <div role="group" aria-label={stepLabel} data-dsh-forge-wizard-stepper="" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {[1, 2, 3].map((index) => {
                const state = index < step ? 'past' : index === step ? 'current' : 'future'
                return (
                  <span key={index} style={{ display: 'contents' }}>
                    {index > 1 && <span aria-hidden="true" style={connectorStyle} />}
                    <span
                      aria-hidden="true"
                      data-dsh-forge-wizard-dot={state}
                      style={{
                        ...dotBaseStyle,
                        ...(state === 'current'
                          ? { background: 'var(--dsw-alias-link, rgb(65, 118, 230))' }
                          : state === 'past'
                            ? { background: 'var(--dsw-alias-state-success-primary, rgb(34, 197, 94))' }
                            : { border: '1.5px solid var(--dsh-border-color, CanvasText)' }),
                      }}
                    />
                  </span>
                )
              })}
              <span aria-hidden="true" style={stepTextStyle}>{stepLabel}</span>
            </div>

            {step === 1 && (
              <StepPath
                t={t}
                value={draft.codeRoot}
                editable={props.mode === 'register'}
                probe={codeRootProbe}
                inputRef={pathInputRef}
                onChange={(value) => { setDraft(current => ({ ...current, codeRoot: value })) }}
              />
            )}
            {step === 2 && (
              <StepExternal
                t={t}
                codeRoot={draft.codeRoot.trim()}
                docLocationType={draft.docLocationType}
                docLocationPath={draft.docLocationPath}
                externalAuthorized={draft.externalAuthorized}
                externalProbe={externalProbe}
                issue={step2Issue}
                onTypeChange={(type) => { setDraft(current => ({ ...current, docLocationType: type })) }}
                onPathChange={(path) => {
                  // Any real path edit re-authorizes nothing: the explicit
                  // confirm targets THIS path (the 2.4 persisted authorization
                  // covered the previous one only). A no-op change (same text)
                  // keeps the state as-is.
                  setDraft(current => (path === current.docLocationPath
                    ? current
                    : { ...current, docLocationPath: path, externalAuthorized: false }))
                }}
                onAuthorizeChange={(authorized) => { setDraft(current => ({ ...current, externalAuthorized: authorized })) }}
              />
            )}
            {step === 3 && (
              <StepSummary
                t={t}
                codeRoot={draft.codeRoot.trim()}
                docLocationType={draft.docLocationType}
                docLocationPath={draft.docLocationPath}
                displayName={draft.displayName}
                defaultName={defaultName}
                submitError={submitError}
                existingProject={existingProject}
                onNameChange={(value) => { setDraft(current => ({ ...current, displayName: value })) }}
                onLocate={closeAfterLocate}
              />
            )}
          </DialogBody>
          <DialogFooter>
            {step > 1 && (
              <ChromeButton
                type="button"
                data-dsh-forge-wizard-back=""
                style={ghostButtonStyle}
                onClick={() => { setStep(current => (current === 1 ? current : (current - 1) as 1 | 2)) }}
              >
                {t('wizard.back')}
              </ChromeButton>
            )}
            {step < 3 && (
              <ChromeButton
                type="submit"
                disabled={!canAdvanceStep1 && step === 1 || !canAdvanceStep2 && step === 2}
                title={step === 1 ? step1BlockedReason : step2BlockedReason}
                data-dsh-forge-wizard-next=""
                style={primaryButtonStyle}
              >
                {t('wizard.next')}
              </ChromeButton>
            )}
            {step === 3 && (
              <ChromeButton
                type="submit"
                disabled={submitting}
                data-dsh-forge-wizard-finish=""
                style={primaryButtonStyle}
              >
                {submitting && <LaunchSpinner label={t(props.mode === 'edit' ? 'wizard.submittingEdit' : 'wizard.submitting')} />}
                <span style={{ marginLeft: submitting ? '6px' : undefined }}>
                  {t(props.mode === 'edit' ? 'wizard.finishEdit' : 'wizard.finish')}
                </span>
              </ChromeButton>
            )}
          </DialogFooter>
        </form>
      </DialogFrame>

      {/* The dirty-discard confirm: a sibling overlay (same z, later in DOM
          paints above); its own trap + safe-cancel default focus. */}
      {discardOpen && (
        <DialogFrame
          role="alertdialog"
          ariaLabelledBy={`dsh-forge-wizard-discard-title-${generatedId}`}
          initialFocus={discardCancelRef}
          onDismiss={() => { setDiscardOpen(false) }}
          dialogDataKey="register-wizard-discard"
        >
          <DialogHeader
            id={`dsh-forge-wizard-discard-title-${generatedId}`}
            title={t(props.mode === 'edit' ? 'wizard.discard.editTitle' : 'wizard.discard.title')}
            closeLabel={t('wizard.discard.cancel')}
            onClose={() => { setDiscardOpen(false) }}
          />
          <DialogBody>
            <p style={{ fontSize: '14px', lineHeight: '22px', margin: '0' }}>{t('wizard.discard.body')}</p>
          </DialogBody>
          <DialogFooter>
            <ChromeButton
              ref={discardCancelRef}
              type="button"
              data-dsh-forge-wizard-discard-cancel=""
              style={ghostButtonStyle}
              onClick={() => { setDiscardOpen(false) }}
            >
              {t('wizard.discard.cancel')}
            </ChromeButton>
            <ChromeButton
              type="button"
              data-dsh-forge-wizard-discard-confirm=""
              style={destructiveButtonStyle}
              onClick={() => {
                setDiscardOpen(false)
                props.onClose?.()
              }}
            >
              {t('wizard.discard.confirm')}
            </ChromeButton>
          </DialogFooter>
        </DialogFrame>
      )}
    </>
  )
}
