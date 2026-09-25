/**
 * The UF3 migration progress/result family (task 1.6, ui-design 迁移进度/
 * 结果对话框) — three layers, one file:
 *
 *   1. The PURE run view-model (MIGRATION_STEPS / stepOfPhase /
 *      applyMigrationProgressEvent): the kernel's seven-phase event stream
 *      (migration_progress; Interface 4's backup→ingest→verify→switch→
 *      archive order, rollback tagging the wholesale-rollback completion)
 *      folded onto the spec's THREE step rows 校验/迁移/对拍 — the PRD
 *      internal-inconsistency ruling: the UF-table enumeration wins, 备份
 *      merges INTO the 校验 row (its first action; the run's backup path
 *      renders inline there), and 完成 is the terminal presentation, not a
 *      row. switch/archive ride the 对拍 row (the pipeline's tail).
 *
 *   2. {@link useMigrationRun} — the run hook over the {@link MigrationFace}:
 *      fires the one-shot verb, subscribes the SAME single-subscriber event
 *      channel, folds migration_progress batches through the reducer, reads
 *      the backup path back from getMigrationStatus().lastEvent once backup
 *      completes, and settles from the verb's own promise — resolve = done
 *      (every row ✓), rejection = failed-rolled-back (the kernel only
 *      rejects AFTER the rollback; zero half-migrated states exist), EXCEPT
 *      the pre-flight guard codes (ERR_MIGRATION_GUARD / IN_PROGRESS) which
 *      carry no events and route back to the confirm door as an inline note.
 *
 *   3. The presentation pair: {@link MigrationProgressBody} — the bare step
 *      rows + terminal conclusions (aria-live polite), the piece the 1.7
 *      register wizard reuses IN-PLACE (its step content area — no nested
 *      dialog, the ui-design 唯一模态 ruling) — and {@link MigrateProgressDialog},
 *      the r24 dialog the overview path opens. THE CLOSE-GUARD (task Hard
 *      Rule: 执行中不可放弃): while the run is live the frame's dismissal is
 *      DISARMED (Esc never registers, the mask never closes) and the ✕ is
 *      not rendered at all — an unstoppable run must not look cancellable
 *      (the LaunchStates initiating-phase precedent); done/failed re-arm
 *      Esc/mask/✕. {@link MigrationDialogs} composes confirm → progress and
 *      owns the flow states (confirming/migrating + the run's done/failed).
 */
import { useEffect, useId, useRef, useState } from 'react'
import type { WorkbenchVerbError, MigrationPhase, MigrationPhaseResult } from '../../../ipc-types'
import type { MigrationFace } from '../../../contract'
import type { WorkbenchKey } from '../../../locale/en'
import { fillTemplate } from '../format'
import { ChromeButton } from '../../../components/chrome/ChromeButton'
import {
  DialogBody, DialogFooter, DialogFrame, DialogHeader, ghostButtonStyle, primaryButtonStyle,
} from '../../tasks/launch/LaunchStates'
import { MigrateConfirmDialog, migrationStartErrorText } from './MigrateConfirmDialog'
import type { MigrationTranslate } from './MigrateConfirmDialog'

// ---------------------------------------------------------------------------
// Pure view-model: kernel phases → the three step rows
// ---------------------------------------------------------------------------

/**
 * The step-row enumeration (ui-design UF3 步骤枚举裁决): 校验/迁移/对拍.
 * Row keys are vocabulary, not kernel phases — see {@link stepOfPhase}.
 */
export const MIGRATION_STEPS = ['verify', 'migrate', 'parity'] as const

/** One step row's key. */
export type MigrationStepKey = (typeof MIGRATION_STEPS)[number]

/** One step row's presentation state: 未达 ○ / 执行中 ◐ / 完成 ✓ / 失败 ✕. */
export type MigrationStepState = 'todo' | 'active' | 'done' | 'error'

/** The run's coarse status: idle → running → done | failed (sticky terminals). */
export type MigrationRunStatus = 'idle' | 'running' | 'done' | 'failed'

/** The whole run's projection (reducer-owned; the hook only swaps statuses). */
export interface MigrationRunState {
  readonly status: MigrationRunStatus
  readonly steps: Readonly<Record<MigrationStepKey, MigrationStepState>>
  /** Kernel phases completed ok so far (derivation input; deduped, in order). */
  readonly completedPhases: readonly MigrationPhase[]
  /** The run's backup directory once known (the 校验 row's inline path). */
  readonly backupPath: string | null
  /** The failed kernel phase (failed presentation context); null elsewhere. */
  readonly failedPhase: MigrationPhase | null
  /** The pre-flight guard rejection (routed back to the confirm door); else null. */
  readonly startRejection: WorkbenchVerbError | null
}

/** The idle run: every row 未达, nothing known. */
export function initialMigrationRunState(): MigrationRunState {
  return {
    status: 'idle',
    steps: { verify: 'todo', migrate: 'todo', parity: 'todo' },
    completedPhases: [],
    backupPath: null,
    failedPhase: null,
    startRejection: null,
  }
}

/** The run's opening projection (the `start` reset): the first row goes live. */
export function runningMigrationRunState(): MigrationRunState {
  return {
    ...initialMigrationRunState(),
    status: 'running',
    steps: { verify: 'active', migrate: 'todo', parity: 'todo' },
  }
}

/**
 * Kernel phase → step row. backup → 校验 (备份并入校验), ingest → 迁移,
 * verify/switch/archive → 对拍 (the pipeline's tail folds into the last
 * row); rollback/reingest own NO row — rollback is the failure path's
 * completion signal (the terminal rides the verb's rejection), reingest is
 * the external-write recovery audit (1.5), never part of the one-shot run.
 */
export function stepOfPhase(phase: MigrationPhase): MigrationStepKey | null {
  switch (phase) {
    case 'backup': return 'verify'
    case 'ingest': return 'migrate'
    case 'verify':
    case 'switch':
    case 'archive': return 'parity'
    default: return null
  }
}

/** Derive the three rows from the completed set + the failed phase. */
function deriveSteps(
  completedPhases: readonly MigrationPhase[],
  failedPhase: MigrationPhase | null,
  status: MigrationRunStatus,
): Readonly<Record<MigrationStepKey, MigrationStepState>> {
  const done = (phase: MigrationPhase): boolean => completedPhases.includes(phase)
  const parityDone = done('verify') && done('switch') && done('archive')
  return {
    verify: failedPhase === 'backup' ? 'error' : done('backup') ? 'done' : status === 'running' ? 'active' : 'todo',
    migrate: failedPhase === 'ingest'
      ? 'error'
      : done('ingest') ? 'done' : done('backup') && status === 'running' ? 'active' : 'todo',
    parity: failedPhase !== null && stepOfPhase(failedPhase) === 'parity'
      ? 'error'
      : parityDone ? 'done' : done('ingest') && status === 'running' ? 'active' : 'todo',
  }
}

/**
 * Fold ONE migration_progress event into the run state (pure). Ignored legs:
 * events after a terminal (statuses are sticky — the verb's promise owns the
 * settle), rollback (rows already speak) and reingest (recovery audit).
 */
export function applyMigrationProgressEvent(
  state: MigrationRunState,
  event: { readonly phase: MigrationPhase; readonly result: MigrationPhaseResult },
): MigrationRunState {
  if (state.status !== 'running') return state
  if (event.phase === 'rollback' || event.phase === 'reingest') return state
  const completedPhases = event.result === 'ok' && !state.completedPhases.includes(event.phase)
    ? [...state.completedPhases, event.phase]
    : state.completedPhases
  const failedPhase = event.result === 'fail' ? event.phase : state.failedPhase
  return { ...state, completedPhases, failedPhase, steps: deriveSteps(completedPhases, failedPhase, state.status) }
}

// ---------------------------------------------------------------------------
// The run hook (verb + events; the dialog/wizard share it)
// ---------------------------------------------------------------------------

/** Fold any rejection into the serialized verb-error shape (the mock throws it already). */
function asVerbError(error: unknown): WorkbenchVerbError {
  if (error !== null && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string') {
    const shaped = error as { code: string; message?: unknown }
    return {
      code: shaped.code,
      message: typeof shaped.message === 'string' ? shaped.message : shaped.code,
    }
  }
  return { code: 'ERR_WORKBENCH_DB', message: error instanceof Error ? error.message : String(error) }
}

/** The start-side rejections that route BACK to the confirm door (nothing ran). */
function isPreFlightRejection(code: string): boolean {
  return code === 'ERR_MIGRATION_GUARD' || code === 'ERR_MIGRATION_IN_PROGRESS'
}

/** The rejection-code fallback for the failed-phase context (events carry it normally). */
function phaseOfRejectionCode(code: string): MigrationPhase | null {
  if (code === 'ERR_MIGRATION_VERIFY') return 'verify'
  return null
}

/** Inputs of {@link useMigrationRun}. */
export interface UseMigrationRunInput {
  /** The migrating project (event filter + verb argument). */
  readonly projectId: string
  /** The migration family's face (startMigration + getMigrationStatus + events). */
  readonly face: MigrationFace
  /** Terminal notification, fired ONCE per run (the host refreshes its status). */
  readonly onSettled?: ((result: 'migrated' | 'failed') => void) | undefined
}

/** The run hook's projection: {@link MigrationRunState} plus the restart leg. */
export interface MigrationRun {
  readonly run: MigrationRunState
  /** Fire the one-shot verb (also the retry leg — the same flow again). */
  readonly start: () => void
}

/**
 * The run hook. One subscription for the hook's lifetime (the single-
 * subscriber channel discipline — the task-board face precedent); `start`
 * resets the view-model, fires the verb, and settles from ITS promise with
 * a per-start token so a stale promise can never clobber a newer run.
 */
export function useMigrationRun(input: UseMigrationRunInput): MigrationRun {
  const [run, setRun] = useState<MigrationRunState>(initialMigrationRunState)
  const startToken = useRef(0)
  const backupRead = useRef(false)
  const settledRef = useRef(input.onSettled)
  settledRef.current = input.onSettled

  useEffect(() => {
    const unsubscribe = input.face.subscribeEvents((events) => {
      setRun((current) => {
        let next = current
        for (const event of events) {
          if (event.type !== 'migration_progress') continue
          if (event.projectId !== input.projectId) continue
          next = applyMigrationProgressEvent(next, event)
          // 备份完成后一次性回读实际备份目录(优先 status.backupPath 的
          // 稳定面 —— lastEvent 随管线前移,快速迁移下 backup 相位读回会
          // 错过,完成态仍须呈现备份位置;lastEvent 解析保留为兼容回退)。
          if (event.phase === 'backup' && event.result === 'ok' && !backupRead.current) {
            backupRead.current = true
            void input.face.getMigrationStatus(input.projectId).then((status) => {
              if (typeof status.backupPath === 'string' && status.backupPath !== '') {
                setRun(state => state.backupPath === null ? { ...state, backupPath: status.backupPath as string } : state)
                return
              }
              if (status.lastEvent?.phase === 'backup' && status.lastEvent.detailJson !== null) {
                try {
                  const detail = JSON.parse(status.lastEvent.detailJson) as { backupPath?: unknown }
                  const backupPath = detail.backupPath
                  if (typeof backupPath === 'string' && backupPath !== '') {
                    setRun(state => state.backupPath === null ? { ...state, backupPath } : state)
                  }
                } catch {
                  // detailJson 损坏 → 路径缺省(确认对话框的根路径仍在场)
                }
              }
            }).catch(() => {
              // 回读失败不打扰迁移呈现(路径是增强信息,不是门)
            })
          }
        }
        return next
      })
    })
    return unsubscribe
  }, [input.face, input.projectId])

  const start = (): void => {
    const mine = ++startToken.current
    backupRead.current = false
    setRun(runningMigrationRunState())
    void input.face.startMigration(input.projectId).then(
      () => {
        if (startToken.current !== mine) return
        setRun(current => current.status === 'running'
          ? {
            ...current,
            status: 'done',
            steps: deriveSteps(['backup', 'ingest', 'verify', 'switch', 'archive'], null, 'done'),
          }
          : current)
        settledRef.current?.('migrated')
      },
      (error: unknown) => {
        if (startToken.current !== mine) return
        const rejection = asVerbError(error)
        if (isPreFlightRejection(rejection.code)) {
          // 守卫/在途拒绝:零相位零事件 → 回确认门内联说明,绝不进失败回滚态。
          setRun({ ...initialMigrationRunState(), startRejection: rejection })
          return
        }
        setRun((current) => {
          if (current.status !== 'running') return current
          const failedPhase = current.failedPhase ?? phaseOfRejectionCode(rejection.code)
          return {
            ...current,
            status: 'failed',
            failedPhase,
            steps: deriveSteps(current.completedPhases, failedPhase, 'failed'),
          }
        })
        settledRef.current?.('failed')
      },
    )
  }

  return { run, start }
}

// ---------------------------------------------------------------------------
// Presentation: the step rows + terminals (wizard-reusable body)
// ---------------------------------------------------------------------------

const visuallyHiddenStyle = {
  border: '0',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  height: '1px',
  margin: '-1px',
  overflow: 'hidden',
  padding: '0',
  position: 'absolute',
  whiteSpace: 'nowrap',
  width: '1px',
} as const

const stepsListStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
} as const

const stepRowStyle = {
  alignItems: 'baseline',
  display: 'flex',
  gap: '10px',
} as const

const stepIconBaseStyle = {
  alignItems: 'center',
  display: 'inline-flex',
  flex: '0 0 auto',
  fontSize: '14px',
  height: '22px',
  justifyContent: 'center',
  lineHeight: '22px',
  width: '18px',
} as const

const stepLabelStyle = {
  fontSize: '14px',
  lineHeight: '22px',
} as const

const stepSubStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
  minWidth: '0',
  overflowWrap: 'anywhere',
} as const

const monoSubStyle = {
  ...stepSubStyle,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
} as const

const conclusionStyle = {
  color: 'var(--dsw-alias-state-success-primary, rgb(34, 197, 94))',
  fontSize: '14px',
  fontWeight: 500,
  lineHeight: '22px',
  margin: '0',
} as const

const rollbackStyle = {
  color: 'var(--dsw-alias-state-error-primary, rgb(236, 19, 19))',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0',
} as const

const atStepStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0',
} as const

const terminalBlockStyle = {
  background: 'var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.1))',
  borderRadius: '14px',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  padding: '10px 12px',
} as const

/** The step labels' locale keys (校验/迁移/对拍). */
const STEP_LABEL_KEYS: Record<MigrationStepKey, WorkbenchKey> = {
  verify: 'migration.step.verify',
  migrate: 'migration.step.migrate',
  parity: 'migration.step.parity',
}

/** The in-row spinner (SMIL inside the plugin's own SVG — the LaunchSpinner precedent). */
function MigrationSpinner(props: { label: string }) {
  return (
    <span
      role="img"
      aria-label={props.label}
      data-dsh-forge-migration-spinner=""
      style={{ ...stepIconBaseStyle, color: 'var(--dsw-alias-link, rgb(65, 118, 230))' }}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
        <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
        <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <animateTransform attributeName="transform" attributeType="XML" type="rotate" from="0 8 8" to="360 8 8" dur="0.8s" repeatCount="indefinite" />
        </path>
      </svg>
    </span>
  )
}

/** One step row's icon cell: ✓ / ◐ / ○ / ✕. */
function StepIcon(props: { state: MigrationStepState; label: string }) {
  if (props.state === 'active') return <MigrationSpinner label={props.label} />
  const style = props.state === 'done'
    ? { ...stepIconBaseStyle, color: 'var(--dsw-alias-state-success-primary, rgb(34, 197, 94))' }
    : props.state === 'error'
      ? { ...stepIconBaseStyle, color: 'var(--dsw-alias-state-error-primary, rgb(236, 19, 19))' }
      : { ...stepIconBaseStyle, color: 'var(--dsw-alias-label-secondary, inherit)' }
  const glyph = props.state === 'done' ? '✓' : props.state === 'error' ? '✕' : '○'
  return <span aria-hidden="true" style={style}>{glyph}</span>
}

/** Inputs of {@link MigrationProgressBody}. */
export interface MigrationProgressBodyProps {
  /** The locale seat (the shell's `t`). */
  readonly t: MigrationTranslate
  /** The run projection (the hook's `run`). */
  readonly run: MigrationRunState
}

/**
 * The bare progress presentation: the three step rows + the terminal
 * conclusions (成功态对拍结论 / 失败态回滚说明) + the polite live region.
 * This is the piece the 1.7 wizard renders INSIDE its step content area
 * (原地演进 — no dialog, no second modal), so it carries no overlay chrome
 * and no buttons; the hosts own their actions.
 */
export function MigrationProgressBody(props: MigrationProgressBodyProps) {
  const { t, run } = props
  const failedStep = run.failedPhase !== null ? stepOfPhase(run.failedPhase) : null
  const liveText = run.status === 'done'
    ? t('migration.result.parityOk')
    : run.status === 'failed'
      ? t('migration.failed.rollbackNote')
      : run.status === 'running'
        ? ((): string => {
          const active = MIGRATION_STEPS.find(step => run.steps[step] === 'active')
          return active === undefined ? '' : fillTemplate(t('migration.live.running'), { step: t(STEP_LABEL_KEYS[active]) })
        })()
        : ''
  return (
    <div data-dsh-forge-migration-run={run.status}>
      <span aria-live="polite" style={visuallyHiddenStyle}>{liveText}</span>
      <div style={stepsListStyle}>
        {MIGRATION_STEPS.map(step => (
          <div key={step} data-dsh-forge-migration-step={step} data-state={run.steps[step]} style={stepRowStyle}>
            <StepIcon state={run.steps[step]} label={t(STEP_LABEL_KEYS[step])} />
            <span style={stepLabelStyle}>{t(STEP_LABEL_KEYS[step])}</span>
            {step === 'verify' && run.steps.verify === 'done' && run.backupPath !== null && (
              <span style={stepSubStyle}>
                {t('migration.step.backupDone')}
                <span data-dsh-forge-migration-backup-path="" title={run.backupPath} style={monoSubStyle}>
                  {run.backupPath}
                </span>
              </span>
            )}
          </div>
        ))}
      </div>
      {run.status === 'done' && (
        <div style={terminalBlockStyle}>
          <p data-dsh-forge-migration-parity-ok="" style={conclusionStyle}>{t('migration.result.parityOk')}</p>
        </div>
      )}
      {run.status === 'failed' && (
        <div style={terminalBlockStyle}>
          {failedStep !== null && (
            <p style={atStepStyle}>
              {fillTemplate(t('migration.failed.atStep'), { step: t(STEP_LABEL_KEYS[failedStep]) })}
            </p>
          )}
          <p data-dsh-forge-migration-rollback-note="" style={rollbackStyle}>{t('migration.failed.rollbackNote')}</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Presentation: the dialog (overview path) + the flow composition
// ---------------------------------------------------------------------------

/** Inputs of {@link MigrateProgressDialog}. */
export interface MigrateProgressDialogProps {
  /** The locale seat (the shell's `t`). */
  readonly t: MigrationTranslate
  /** The run projection (the hook's `run`). */
  readonly run: MigrationRunState
  /** Close from a terminal (done/failed only — the frame disarms while running). */
  readonly onClose: () => void
  /** Retry from the failed terminal (re-fires the same one-shot verb). */
  readonly onRetry: () => void
}

/**
 * The progress/result dialog. The close-guard (task Hard Rule: 执行中不可
 * 放弃): while `run.status === 'running'` the frame's dismissal is disarmed —
 * Esc never registers a close, the mask click is inert — and the header ✕ is
 * not rendered; done/failed re-arm everything. `data-dsh-forge-dialog=
 * "migrate-progress"` joins the dialog family's observation contract.
 */
export function MigrateProgressDialog(props: MigrateProgressDialogProps) {
  const running = props.run.status === 'running'
  const failed = props.run.status === 'failed'
  const done = props.run.status === 'done'
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const generatedId = useId().replace(/[^a-zA-Z0-9-]/g, '')
  const titleId = `dsh-forge-migrate-progress-title-${generatedId}`
  return (
    <DialogFrame
      role="alertdialog"
      ariaLabelledBy={titleId}
      initialFocus={closeRef}
      onDismiss={running ? undefined : props.onClose}
      dialogDataKey="migrate-progress"
    >
      <DialogHeader
        id={titleId}
        title={failed ? props.t('migration.failed.title') : props.t('migration.progress.title')}
        closeLabel={running ? undefined : props.t('migration.failed.close')}
        onClose={running ? undefined : props.onClose}
      />
      <DialogBody>
        <MigrationProgressBody t={props.t} run={props.run} />
      </DialogBody>
      <DialogFooter>
        {failed && (
          <ChromeButton
            ref={closeRef}
            type="button"
            data-dsh-forge-migration-close=""
            style={ghostButtonStyle}
            onClick={props.onClose}
          >
            {props.t('migration.failed.close')}
          </ChromeButton>
        )}
        {failed && (
          <ChromeButton
            type="button"
            data-dsh-forge-migration-retry=""
            style={primaryButtonStyle}
            onClick={props.onRetry}
          >
            {props.t('migration.failed.retry')}
          </ChromeButton>
        )}
        {done && (
          <ChromeButton
            ref={closeRef}
            type="button"
            data-dsh-forge-migration-done=""
            style={primaryButtonStyle}
            onClick={props.onClose}
          >
            {props.t('migration.result.done')}
          </ChromeButton>
        )}
      </DialogFooter>
    </DialogFrame>
  )
}

/** Inputs of {@link MigrationDialogs}. */
export interface MigrationDialogsProps {
  /** The locale seat (the shell's `t`). */
  readonly t: MigrationTranslate
  /** The migrating project. */
  readonly projectId: string
  /** The migration family's face (verbs + events). */
  readonly face: MigrationFace
  /** The backup location for the confirm copy (root or last known run path; mono). */
  readonly backupPath: string
  /** False renders nothing (the host owns the entry; 1.7 wires the guarded click). */
  readonly open: boolean
  /** Terminal notification ('migrated' | 'failed'), once per run. */
  readonly onSettled?: ((result: 'migrated' | 'failed') => void) | undefined
  /** The family closed (cancel / 完成 / 失败关闭) — the host drops `open`. */
  readonly onClose: () => void
}

/**
 * The dialog-family composition (AC1's state machine): confirming →
 * migrating (the progress dialog carrying its own done/failed terminals) →
 * closed via the host. A pre-flight guard rejection bounces the flow BACK to
 * the confirm door with the inline guard note (nothing ran — no failed
 * presentation); the retry leg re-fires the same verb through the same
 * chain. The 1.7 wizard path does NOT mount this component — it takes
 * {@link useMigrationRun} + {@link MigrationProgressBody} directly.
 */
export function MigrationDialogs(props: MigrationDialogsProps) {
  const [confirming, setConfirming] = useState(true)
  const run = useMigrationRun({
    projectId: props.projectId,
    face: props.face,
    onSettled: props.onSettled,
  })

  // open transitions reset the flow to the confirm door.
  useEffect(() => {
    if (props.open) setConfirming(true)
  }, [props.open])

  // A pre-flight rejection (status back to idle + startRejection) reopens the confirm door.
  useEffect(() => {
    if (!props.open) return
    if (run.run.status === 'idle' && run.run.startRejection !== null) setConfirming(true)
  }, [props.open, run.run.status, run.run.startRejection])

  if (!props.open) return null
  if (confirming || run.run.status === 'idle') {
    return (
      <MigrateConfirmDialog
        t={props.t}
        backupPath={props.backupPath}
        startError={run.run.startRejection === null ? null : migrationStartErrorText(run.run.startRejection, props.t)}
        onConfirm={() => {
          setConfirming(false)
          run.start()
        }}
        onCancel={props.onClose}
      />
    )
  }
  return (
    <MigrateProgressDialog
      t={props.t}
      run={run.run}
      onClose={props.onClose}
      onRetry={run.start}
    />
  )
}
