/**
 * The UF1 项目注册向导, BUILD half (tasks 5.4 + 1.7): the `workbench/dialog/
 * register` overlay (page-map view-key family, mounted by the workbench shell
 * from the addProject / repoint seams). Steps — ① codeRoot + forge-detection
 * instant feedback, ② docs location (M3 flip, task 1.7: 仓外应用管理路径
 * DEFAULT + prefilled, 仓内 selectable — G7/SC9), the CONDITIONAL ③ 迁移确认
 * (register mode + the settled doc tree probed `tasks/index.json` — Interface
 * 4 §8; three dots become four), and the summary confirm + displayName
 * (缺省 = codeRoot 目录名) — with back-navigation that never drops state.
 * Edit mode reuses the SAME dialog (标题「重新指向项目」, prefilled from the
 * registered row; the conditional migration step NEVER appears there — the
 * card entry owns a registered project's migration): the submit walks
 * updateProject's ProjectPatch semantics (rename + repoint; 重指向校验同链).
 *
 * 1.7 in-place migration phase (ui-design 向导内迁移): with the toggle ON and
 * registration confirmed, the step content area EVOLVES IN PLACE into the
 * 1.6 progress presentation (MigrationProgressBody — 校验/迁移/对拍 rows +
 * 对拍结论 / 回滚说明; NO nested dialog, the 唯一模态 ruling) and the wizard
 * LOCKS WHOLE (Esc/✕/mask inert for the phase's whole lifetime — closing
 * happens ONLY through the explicit terminals: 完成 = [进入工作台], 失败 =
 * [重试] + [以未迁移态完成注册], pre-flight guard rejection = the inline note
 * + the same pair).
 *
 * Dialog discipline (ui-design 全局规则 + page-map): the shared DialogFrame —
 * focus lands on the first field, Tab/Shift+Tab trap, Esc / mask / ✕ dismiss
 * with a DIRTY guard (any input → the 放弃确认 sub-dialog first; clean closes
 * immediately), dismissal disarmed while the submit is in flight or the
 * migration phase is live. Enter advances: each step is one form whose submit
 * IS the forward action.
 *
 * Hard Rule: 向导提交前不得写入任何持久状态 — steps ①/② (and the conditional
 * ③) read probes and collect choices only; the registerProject / updateProject
 * verb fires solely from the summary confirm, startMigration only AFTER it.
 *
 * Data layering (the OverviewFace precedent): the faces default to the
 * build-stage mock twins (mocks/workbench.createMockRegisterWizardFace /
 * createMockMigrationFace); the assemblies spread the IPC-backed members over
 * them. Error copy routes through the centralized i18n/errors.ts table.
 */
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import type {
  DocLocationType, Project, ProjectPatch, RegisterProjectInput,
} from '../../ipc-types'
import type { MigrationFace, RegisterWizardFace } from '../../contract'
import type { WorkbenchKey } from '../../locale/en'
import { ChromeButton } from '../../components/chrome/ChromeButton'
import {
  DialogBody, DialogFooter, DialogFrame, DialogHeader, LaunchSpinner,
  ghostButtonStyle, primaryButtonStyle,
} from '../tasks/launch/LaunchStates'
import { directoryNameOf, normalizePathForCompare, samePath } from '../../paths'
import { createMockMigrationFace, createMockRegisterWizardFace } from '../../mocks/workbench'
import { StepPath } from './wizard/StepPath'
import { StepExternal } from './wizard/StepExternal'
import { StepSummary } from './wizard/StepSummary'
import { StepMigrate } from './wizard/StepMigrate'
import { verbErrorCode } from './OverviewPage'
import { MigrationProgressBody, useMigrationRun } from './migration/MigrateProgressDialog'
import { migrationStartErrorText } from './migration/MigrateConfirmDialog'

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
  /**
   * The conditional ③'s toggle (task 1.7): migrate right after registering.
   * Default TRUE (ui-design 开关默认开); FALSE = the read-only compatibility
   * registration (the card keeps 可迁移). Edit mode carries TRUE as a neutral
   * baseline (the step never renders there, so the value never goes dirty).
   */
  readonly migrateNow: boolean
}

/**
 * The register mode's pristine draft (step ① empty; M3 flip, task 1.7: 仓外
 * DEFAULT — the app-managed path prefills once the codeRoot is known and the
 * kernel paths read lands; 仓内 remains a radio away).
 */
export const EMPTY_WIZARD_DRAFT: WizardDraft = Object.freeze({
  codeRoot: '',
  docLocationType: 'external',
  docLocationPath: '',
  externalAuthorized: false,
  displayName: '',
  migrateNow: true,
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
    migrateNow: true,
  }
}

/** Field-by-field dirtiness (the discard guard's input). */
export function isWizardDraftDirty(draft: WizardDraft, baseline: WizardDraft): boolean {
  return draft.codeRoot !== baseline.codeRoot
    || draft.docLocationType !== baseline.docLocationType
    || draft.docLocationPath !== baseline.docLocationPath
    || draft.externalAuthorized !== baseline.externalAuthorized
    || draft.displayName !== baseline.displayName
    || draft.migrateNow !== baseline.migrateNow
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
  /** register = fresh flow (conditionally four steps); edit = the repoint/rename reuse (prefilled, three steps). */
  readonly mode: 'register' | 'edit'
  /** The registered row being repointed — required when mode='edit'. */
  readonly project: Project | undefined
  /** The current registry (the ERR_PROJECT_EXISTS locate lookup). */
  readonly projects: readonly Project[]
  /** Face members override the build-stage mock twin (5.14 injects the IPC verbs; 1.7 adds the real probe). */
  readonly face?: Partial<RegisterWizardFace> | undefined
  /**
   * The migration family's face (task 1.7): getWorkbenchPaths backs the
   * flipped default's app-managed prefill; startMigration/events run the
   * in-place phase after registration. Absent members fall back to the
   * build-stage mock twin (1.7's assembly injects the IPC face).
   */
  readonly migrationFace?: Partial<MigrationFace> | undefined
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

/** 1.7: the in-place phase's pre-flight guard note (the confirm door's twin). */
const preflightNoteStyle = {
  border: '1px solid var(--dsw-alias-state-warn-primary, rgb(245, 158, 11))',
  borderRadius: '14px',
  color: 'var(--dsw-alias-state-warn-primary, rgb(245, 158, 11))',
  fontSize: '12px',
  lineHeight: '18px',
  padding: '8px 12px',
} as const

/**
 * The register wizard overlay (`data-dsh-forge-dialog="register-wizard"`).
 * Mount = open (the shell owns the open/close decision); unmount = closed.
 */
export function RegisterWizard(props: RegisterWizardProps) {
  const { t } = props
  const generatedId = useId().replace(/[^a-zA-Z0-9-]/g, '')
  const titleId = `dsh-forge-wizard-title-${generatedId}`

  // Build-stage default faces: one isolated mock twin per mount (5.14 spreads
  // the IPC-backed members over it — the OverviewPage precedent; 1.7 adds the
  // migration family's twin for the paths read + the in-place run).
  const [defaultFace] = useState(() => createMockRegisterWizardFace())
  const face: RegisterWizardFace = { ...defaultFace, ...props.face }
  const [defaultMigrationFace] = useState(() => createMockMigrationFace().face)
  // Identity-stable for given props (the run hook's event subscription and
  // the paths-read effect key on the face object itself).
  const migrationFace: MigrationFace = useMemo(
    () => ({ ...defaultMigrationFace, ...props.migrationFace }),
    [defaultMigrationFace, props.migrationFace],
  )

  const initialBaseline = props.mode === 'edit' && props.project !== undefined
    ? draftOfProject(props.project)
    : EMPTY_WIZARD_DRAFT
  // The baseline is STATE (not a memo): the 1.7 default-path prefill patches
  // draft AND baseline together, so a pristine wizard stays clean (Esc = the
  // immediate close) even though the app-managed path landed in the draft.
  const [baseline, setBaseline] = useState<WizardDraft>(initialBaseline)
  const [draft, setDraft] = useState<WizardDraft>(initialBaseline)
  /** 1.7: the CONDITIONAL ③ exists only when the settled doc tree probed index.json. */
  const [migrationOffered, setMigrationOffered] = useState(false)
  /** 1.7: set once registration resolved and the in-place migration run began. */
  const [migrationPhase, setMigrationPhase] = useState<{ readonly project: Project } | undefined>(undefined)
  const [docsRoot, setDocsRoot] = useState<string | null>(null)
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [codeRootProbe, setCodeRootProbe] = useState<CodeRootProbe>({ status: 'empty' })
  const [externalProbe, setExternalProbe] = useState<ExternalProbe>({ status: 'idle' })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<{ code: string; message: string } | undefined>(undefined)
  const [discardOpen, setDiscardOpen] = useState(false)

  const pathInputRef = useRef<HTMLInputElement>(null)
  const discardCancelRef = useRef<HTMLButtonElement | null>(null)
  // fix-1 defect B (dialog focus contract): where focus returns when the
  // discard sub-dialog closes WITHOUT discarding — the element the guard
  // interrupted, else the step-① input, else the card's -1 anchor. Without
  // a restore the unmounting overlay drops focus to <body>, outside the
  // card-scoped keydown handler, and the wizard's Esc/mask/✕ go dead for
  // keyboard users (the second Esc could never re-raise the guard).
  const wizardCardRef = useRef<HTMLDivElement | null>(null)
  const discardReturnRef = useRef<HTMLElement | null>(null)
  const probeSeq = useRef(0)
  const externalSeq = useRef(0)
  const offerSeq = useRef(0)
  const defaultPathApplied = useRef(false)

  // 1.7: the kernel-managed docs root (the flipped default's 应用管理路径 base).
  // A failed read keeps docsRoot null — the prefill stays absent and the
  // external branch demands a hand-typed path (the chain still works).
  useEffect(() => {
    let alive = true
    migrationFace.getWorkbenchPaths().then((paths) => {
      if (alive) setDocsRoot(paths.docsRoot)
    }).catch(() => {})
    return () => { alive = false }
  }, [migrationFace])

  // 1.7 prefill: 仓外 default + the app-managed path `<docsRoot>/<dirname>`
  // lands ONCE (register mode, pristine external draft, codeRoot known) — and
  // patches the BASELINE with it, so the untouched wizard is NOT dirty (Esc
  // still closes immediately; the discard guard never fires on the default).
  useEffect(() => {
    if (defaultPathApplied.current) return
    if (props.mode !== 'register') {
      defaultPathApplied.current = true
      return
    }
    const name = directoryNameOf(draft.codeRoot.trim())
    if (name === '' || docsRoot === null) return
    if (draft.docLocationType !== 'external' || draft.docLocationPath !== '') {
      defaultPathApplied.current = true
      return
    }
    const prefilled = docsRoot.endsWith('/') ? `${docsRoot}${name}` : `${docsRoot}/${name}`
    defaultPathApplied.current = true
    setDraft(current => (current.docLocationType === 'external' && current.docLocationPath === ''
      ? { ...current, docLocationPath: prefilled }
      : current))
    setBaseline(current => (current.docLocationType === 'external' && current.docLocationPath === ''
      ? { ...current, docLocationPath: prefilled }
      : current))
  }, [docsRoot, draft.codeRoot, draft.docLocationType, draft.docLocationPath, props.mode])

  // The in-place migration run (1.7): the hook lives for the wizard's whole
  // lifetime; the placeholder id matches no project until the phase begins.
  const migrationRun = useMigrationRun({
    projectId: migrationPhase?.project.id ?? 'dsh-forge-wizard-unregistered',
    face: migrationFace,
  })

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
  /** 1.7: the summary's step number rides the conditional ③ (offered → 4). */
  const summaryStep = migrationOffered ? 4 : 3
  const stepCount = migrationOffered ? 4 : 3
  const inMigrationPhase = migrationPhase !== undefined

  // ---- actions ---------------------------------------------------------------

  /**
   * 1.7: leaving ② re-probes with the SETTLED doc location — the conditional
   * ③'s premise is the CHOSEN tree's index.json (the step-① probe scanned the
   * repo side only). Register mode only; a probe failure offers nothing.
   */
  const advanceFromStep2 = (): void => {
    if (!canAdvanceStep2) return
    if (props.mode !== 'register') {
      setStep(3)
      return
    }
    const seq = (offerSeq.current += 1)
    const settledPath = draft.docLocationType === 'external' ? draft.docLocationPath.trim() : null
    void face.probeCodeRoot({ codeRoot: draft.codeRoot.trim(), docLocationPath: settledPath }).then((result) => {
      if (seq !== offerSeq.current) return
      setMigrationOffered(result.available && result.indexJsonDetected)
      setStep(3)
    }, () => {
      if (seq !== offerSeq.current) return
      setMigrationOffered(false)
      setStep(3)
    })
  }

  const advance = (): void => {
    if (inMigrationPhase) return
    if (step === summaryStep) return
    if (step === 1 && !canAdvanceStep1) return
    if (step === 2) {
      advanceFromStep2()
      return
    }
    setStep(current => (current >= summaryStep ? current : (current + 1) as 2 | 3 | 4))
  }

  /** The only persistent-write call site (task Hard Rule): the summary confirm. */
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
        // 1.7: the toggle ON + the conditional step offered → the step content
        // area evolves IN PLACE into the migration run; the wizard closes only
        // through the phase's explicit terminals. Everything else closes now.
        if (migrationOffered && draft.migrateNow) {
          setMigrationPhase({ project })
          setSubmitting(false)
          migrationRun.start()
          return
        }
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
    if (inMigrationPhase) return
    if (step < summaryStep) advance()
    else void submit()
  }

  /**
   * Esc / mask / ✕: dirty → the discard confirm; clean → immediate close;
   * in-flight → disarmed; migration phase → disarmed for its WHOLE lifetime
   * (ui-design: 执行中向导整体锁定,关闭仅经显式终端按钮 — 完成/失败/未迁移态)。
   */
  const requestClose = (): void => {
    if (submitting || inMigrationPhase || discardOpen) return
    if (dirty) {
      discardReturnRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
      setDiscardOpen(true)
      return
    }
    props.onClose?.()
  }

  /** 1.7: close from a migration-phase terminal (carries the registration result). */
  const closeAfterMigration = (): void => {
    const phase = migrationPhase
    if (phase === undefined) return
    setMigrationPhase(undefined)
    props.onClose?.({ project: phase.project, action: 'register' })
  }

  /**
   * The discard sub-dialog's cancel/dismiss close (fix-1 defect B): close
   * the overlay AND restore focus INTO the wizard (the interrupted element
   * when it survived inside the card, else the step-① input, else the
   * card's -1 anchor) so the card's keydown scope owns the keyboard again —
   * Esc re-raises the guard, Tab cycles the card, exactly as before the
   * sub-dialog existed.
   */
  const cancelDiscard = (): void => {
    setDiscardOpen(false)
    const interrupted = discardReturnRef.current
    discardReturnRef.current = null
    if (
      interrupted !== null
      && interrupted.isConnected
      && wizardCardRef.current?.contains(interrupted) === true
    ) {
      interrupted.focus()
      return
    }
    if (pathInputRef.current !== null) {
      pathInputRef.current.focus()
      return
    }
    wizardCardRef.current?.focus()
  }

  const closeAfterLocate = (): void => {
    if (existingProject !== undefined) props.onLocate?.(existingProject)
    props.onClose?.()
  }

  const stepLabel = t('wizard.stepLabel')
    .replace('{current}', String(step))
    .replace('{total}', String(stepCount))
  /** The migration run's current projection (the in-place phase's body source). */
  const run = migrationRun.run
  const runPreflightNote = run.status === 'idle' && run.startRejection !== null
    ? migrationStartErrorText(run.startRejection, t)
    : ''

  return (
    <>
      <DialogFrame
        role="dialog"
        ariaLabelledBy={titleId}
        initialFocus={pathInputRef}
        onDismiss={submitting || inMigrationPhase ? undefined : requestClose}
        dialogDataKey="register-wizard"
        cardRef={wizardCardRef}
      >
        <DialogHeader
          id={titleId}
          title={inMigrationPhase
            ? t('migration.progress.title')
            : t(props.mode === 'edit' ? 'wizard.editTitle' : 'wizard.title')}
          closeLabel={submitting || inMigrationPhase ? undefined : t('wizard.close')}
          onClose={submitting || inMigrationPhase ? undefined : requestClose}
        />
        <form style={formStyle} noValidate data-dsh-forge-wizard-step={inMigrationPhase ? 'migration' : step} onSubmit={handleSubmit}>
          <DialogBody>
            {/* 1.7 向导内迁移: the step content area evolves IN PLACE into the
                1.6 progress presentation — no nested dialog (唯一一模态), the
                stepper retires for the phase, and the terminals own every
                close (the frame's dismissal is disarmed above). */}
            {inMigrationPhase ? (
              <div data-dsh-forge-wizard-migration-run="">
                <MigrationProgressBody t={t} run={run} />
                {runPreflightNote !== '' && (
                  <p role="status" data-dsh-forge-wizard-migration-preflight="" style={{ margin: '10px 0 0 0', ...preflightNoteStyle }}>
                    {runPreflightNote}
                  </p>
                )}
              </div>
            ) : (
              <>
                {/* 步骤点 + 步骤 N/总 (ui-design Layout; the stepper carries the
                    label; the count rides the conditional ③ — 三圆 ⇄ 四圆). */}
                <div role="group" aria-label={stepLabel} data-dsh-forge-wizard-stepper="" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {Array.from({ length: stepCount }, (_, index) => index + 1).map((index) => {
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
                    defaultPath={docsRoot === null || directoryNameOf(draft.codeRoot.trim()) === ''
                      ? null
                      : `${docsRoot.endsWith('/') ? docsRoot.slice(0, -1) : docsRoot}/${directoryNameOf(draft.codeRoot.trim())}`}
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
                {/* 1.7 条件③: migration confirm — ONLY when offered (the settled
                    doc tree probed index.json); the summary shifts to ④. */}
                {step === 3 && migrationOffered && (
                  <StepMigrate
                    t={t}
                    migrateNow={draft.migrateNow}
                    onMigrateNowChange={(migrateNow) => { setDraft(current => ({ ...current, migrateNow })) }}
                  />
                )}
                {step === summaryStep && (
                  <StepSummary
                    t={t}
                    codeRoot={draft.codeRoot.trim()}
                    docLocationType={draft.docLocationType}
                    docLocationPath={draft.docLocationPath}
                    displayName={draft.displayName}
                    defaultName={defaultName}
                    submitError={submitError}
                    existingProject={existingProject}
                    migrationChoice={!migrationOffered ? undefined : draft.migrateNow ? 'now' : 'defer'}
                    onNameChange={(value) => { setDraft(current => ({ ...current, displayName: value })) }}
                    onLocate={closeAfterLocate}
                  />
                )}
              </>
            )}
          </DialogBody>
          <DialogFooter>
            {inMigrationPhase ? (
              <>
                {/* 失败/前置拒绝: [以未迁移态完成注册] (ghost) + [重试] (md 主);
                    完成: [进入工作台] (md 主)。执行中: no controls at all. */}
                {(run.status === 'failed' || runPreflightNote !== '') && (
                  <ChromeButton
                    type="button"
                    data-dsh-forge-wizard-migration-finish-unmigrated=""
                    style={ghostButtonStyle}
                    onClick={closeAfterMigration}
                  >
                    {t('wizard.migration.finishUnmigrated')}
                  </ChromeButton>
                )}
                {(run.status === 'failed' || runPreflightNote !== '') && (
                  <ChromeButton
                    type="button"
                    data-dsh-forge-wizard-migration-retry=""
                    style={primaryButtonStyle}
                    onClick={migrationRun.start}
                  >
                    {t('migration.failed.retry')}
                  </ChromeButton>
                )}
                {run.status === 'done' && (
                  <ChromeButton
                    type="button"
                    data-dsh-forge-wizard-migration-enter=""
                    style={primaryButtonStyle}
                    onClick={closeAfterMigration}
                  >
                    {t('wizard.migration.enterWorkbench')}
                  </ChromeButton>
                )}
              </>
            ) : (
              <>
                {step > 1 && (
                  <ChromeButton
                    type="button"
                    data-dsh-forge-wizard-back=""
                    style={ghostButtonStyle}
                    onClick={() => { setStep(current => (current === 1 ? current : (current - 1) as 1 | 2 | 3)) }}
                  >
                    {t('wizard.back')}
                  </ChromeButton>
                )}
                {step < summaryStep && (
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
                {step === summaryStep && (
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
              </>
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
          onDismiss={cancelDiscard}
          dialogDataKey="register-wizard-discard"
        >
          <DialogHeader
            id={`dsh-forge-wizard-discard-title-${generatedId}`}
            title={t(props.mode === 'edit' ? 'wizard.discard.editTitle' : 'wizard.discard.title')}
            closeLabel={t('wizard.discard.cancel')}
            onClose={cancelDiscard}
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
              onClick={cancelDiscard}
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
