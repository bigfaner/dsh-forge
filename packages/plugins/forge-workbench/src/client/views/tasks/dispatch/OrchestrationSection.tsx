/**
 * The UF1 任务详情侧板编排分区 + 「派发执行」主按钮 (task 3.8, ui-design UF1
 * 任务详情侧板(M2 UF3 演进)节): the M2 detail dock's M3 orchestration face —
 *
 *   DispatchExecuteButton — 头部「▶ 派发执行」md 主按钮(整宽), the M2
 *       「发起会话」slot's SAME-POSITION semantic evolution (Hard Rule: 不新增
 *       并列入口 — ONE button, one door): 无执行条件(依赖/终态)→ disabled +
 *       tooltip;可执行 → the 单任务派发捷径 (等价选中 1 项, the same
 *       check → (warning ⇄) confirming → dispatching chain the 3.6 selection
 *       layer runs, reusing its three dialogs verbatim); a FAILED current
 *       orchestration flips the click into the redispatch door (prototype
 *       dp-dispatch behavior — failure recovery keeps the audit linkage).
 *   OrchestrationSection — the 编排 partition (置于执行记录之上, mounted by
 *       3.9 above the records accordion): 当前编排态 (the 3.7 badge spectrum)
 *       + 派发时间 + subagent 会话 + [进入会话](sm ghost — the M1 视图切换
 *       contract, 3.9 wires) + 失败原因 + [重派发](sm ghost) + 预合成要素行
 *       (三要素 ✓ + prompt_hash 元数据, tooltip = 三要素来源) + 待审批时
 *       [去审批](sm 主 — 切审批面板, the 侧板侧审批入口; the dock mutex is
 *       3.9's presentation orchestration).
 *
 * Layer split (the selection-mode.ts / SelectionLayer.tsx precedent):
 *   - HERE, pure half: the single-task chain machine (idle → checking →
 *     warning ⇄ confirming → dispatching, + redispatch-confirm →
 *     redispatching, + error) and currentDispatchRow (latest-row semantics);
 *   - HERE, React half: useDetailDispatchChain (the verbs + ≤3s budget +
 *     stale-leg tokens — the 3.6 controller discipline) and the two views;
 *   - RedispatchDialog.tsx: the second-confirmation presentation.
 *
 * Verb seam (Interface 1, preload twins verbatim): checkStageArtifacts /
 * dispatchTasks (3.6's DispatchVerbs) + redispatch(dispatchId, actor) — the
 * kernel redispatch RE-RUNS the whole pre-check (acknowledgeMissing=false),
 * so its blocked union re-opens the warning door and the acknowledged
 * continuation goes through dispatchTasks (the only verb with the ack face).
 * 3.9 wires the real IPC; 3.8 builds and tests against mock verbs.
 */
import {
  useEffect, useMemo, useReducer, useRef,
} from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { WorkbenchVerbError } from '../../../ipc-types'
import type { WorkbenchKey } from '../../../locale/en'
import { normalizeWorkbenchVerbError } from '../../../ipc/workbench'
import { fillTemplate, formatTimestamp } from '../../overview/format'
import { ChromeButton } from '../../../components/chrome/ChromeButton'
import { LaunchSpinner, ghostButtonStyle, primaryButtonStyle } from '../launch/LaunchStates'
import { DispatchBadge, type DispatchTranslate } from './DispatchBadge'
import { DISPATCH_ACTOR, DISPATCH_BUDGET_MS } from './SelectionLayer'
import {
  isTerminalTaskStatus, selectionDisabledReason,
  type DispatchFlowError, type DispatchRow, type DispatchTasksResult, type DispatchVerbs,
  type MissingItem, type SelectionTaskEntry,
} from './selection-mode'
import { DispatchWarningDialog } from './DispatchWarningDialog'
import { DispatchConfirmDialog } from './DispatchConfirmDialog'
import { DispatchErrorDialog } from './DispatchErrorDialog'
import { RedispatchDialog } from './RedispatchDialog'

// ---------------------------------------------------------------------------
// Interface 1 verb seam (preload twin)
// ---------------------------------------------------------------------------

/**
 * The three verbs the detail-side chain consumes — 3.6's DispatchVerbs plus
 * the redispatch verb (signatures mirror the preload bridge of task 3.3
 * one-to-one; redispatch carries the dispatching human's actor string for
 * kernel audit).
 */
export interface DetailDispatchVerbs extends DispatchVerbs {
  redispatch(dispatchId: string, actor: string): Promise<DispatchTasksResult>
}

// ---------------------------------------------------------------------------
// Pure half — the current-row view-model
// ---------------------------------------------------------------------------

/**
 * The task's CURRENT dispatch row: the LATEST by dispatchedAt among the
 * rows addressed to `taskKey` (a redispatch mints a NEW row — the original
 * stays as the audit trail — so latest-by-time IS the live orchestration;
 * ties break toward the later array entry).
 */
export function currentDispatchRow(rows: readonly DispatchRow[], taskKey: string): DispatchRow | null {
  let latest: DispatchRow | null = null
  for (const row of rows) {
    if (row.taskKey !== taskKey) continue
    if (latest === null || row.dispatchedAt >= latest.dispatchedAt) latest = row
  }
  return latest
}

// ---------------------------------------------------------------------------
// Pure half — the single-task chain machine
// ---------------------------------------------------------------------------

/**
 * The chain phases: the 3.6 selection chain's single-task twin (idle →
 * checking → warning ⇄ confirming → dispatching) plus the redispatch door
 * (redispatch-confirm = the second-confirmation dialog; redispatching = the
 * verb leg) and the shared error branch.
 */
export type DetailDispatchPhase =
  | 'idle'
  | 'checking'
  | 'warning'
  | 'confirming'
  | 'dispatching'
  | 'redispatch-confirm'
  | 'redispatching'
  | 'error'

/** The redispatch door's captured target (dialog echo + the verb argument). */
export interface RedispatchTarget {
  readonly dispatchId: string
  /** The failed row's error — the dialog's 原因回显; null = none recorded. */
  readonly reason: string | null
}

/** Machine snapshot — a stable reference between transitions. */
export interface DetailDispatchSnapshot {
  readonly phase: DetailDispatchPhase
  /** The warning dialog's missing list (warning phase only). */
  readonly missing: readonly MissingItem[]
  /** Did the user pass the warning door (dispatchTasks then carries acknowledgeMissing)? */
  readonly acknowledgedMissing: boolean
  readonly error: DispatchFlowError | null
  /** Which leg an error retry re-runs. */
  readonly failedLeg: 'check' | 'dispatch' | 'redispatch' | null
  /** The redispatch door's target (redispatch-confirm/redispatching only). */
  readonly redispatch: RedispatchTarget | null
  /** The last successful dispatch's row count (the aria-live outcome; reset by every start). */
  readonly dispatchedCount: number | null
}

/** First-boot state. */
export const INITIAL_DETAIL_DISPATCH: DetailDispatchSnapshot = Object.freeze({
  phase: 'idle',
  missing: [],
  acknowledgedMissing: false,
  error: null,
  failedLeg: null,
  redispatch: null,
  dispatchedCount: null,
}) as DetailDispatchSnapshot

/** The actions (the controller pre-validates; the reducer phase-guards every leg). */
export type DetailDispatchAction =
  | { readonly type: 'startDispatch' }
  | { readonly type: 'startRedispatch'; readonly dispatchId: string; readonly reason: string | null }
  | { readonly type: 'checkResolved'; readonly missing: readonly MissingItem[] }
  | { readonly type: 'acknowledgeMissing' }
  | { readonly type: 'cancelDialog' }
  | { readonly type: 'confirmDispatch' }
  | { readonly type: 'dispatchResolved'; readonly count: number }
  | { readonly type: 'dispatchBlocked'; readonly missing: readonly MissingItem[] }
  | { readonly type: 'redispatchConfirmed' }
  | { readonly type: 'redispatchResolved'; readonly count: number }
  | { readonly type: 'redispatchBlocked'; readonly missing: readonly MissingItem[] }
  | { readonly type: 'flowFailed'; readonly error: DispatchFlowError; readonly leg: 'check' | 'dispatch' | 'redispatch' }
  | { readonly type: 'retry' }
  | { readonly type: 'closeError' }

/** True while a verb leg is in flight (the button's spinner face + the budget timer). */
export function isDetailDispatchBusy(phase: DetailDispatchPhase): boolean {
  return phase === 'checking' || phase === 'dispatching' || phase === 'redispatching'
}

/** True while one of the chain dialogs is open (the Esc-containment layer). */
export function isDetailDispatchDialogOpen(phase: DetailDispatchPhase): boolean {
  return phase === 'warning' || phase === 'confirming' || phase === 'redispatch-confirm' || phase === 'error'
}

/**
 * The reducer. Every leg is phase-guarded (a stale async settle after a
 * timeout/close is a no-op — belt-and-braces under the controller's tokens).
 * The two blocked legs BOTH land in the warning door; the acknowledged
 * continuation then goes through the confirming → dispatchTasks(ack) path
 * (the only verb with the acknowledgeMissing face — the kernel redispatch
 * re-checks with ack=false by construction).
 */
export function detailDispatchReducer(
  state: DetailDispatchSnapshot,
  action: DetailDispatchAction,
): DetailDispatchSnapshot {
  switch (action.type) {
    case 'startDispatch':
      if (state.phase !== 'idle') return state
      return {
        ...INITIAL_DETAIL_DISPATCH,
        phase: 'checking',
      }
    case 'startRedispatch':
      if (state.phase !== 'idle') return state
      return {
        ...INITIAL_DETAIL_DISPATCH,
        phase: 'redispatch-confirm',
        redispatch: { dispatchId: action.dispatchId, reason: action.reason },
      }
    case 'checkResolved':
      if (state.phase !== 'checking') return state
      return action.missing.length === 0
        ? { ...state, phase: 'confirming', missing: [] }
        : { ...state, phase: 'warning', missing: action.missing }
    case 'acknowledgeMissing':
      // The warning door's 继续派发 (Hard Rule: missing artifacts warn but
      // never block — the acknowledgeMissing face).
      if (state.phase !== 'warning') return state
      return { ...state, phase: 'confirming', acknowledgedMissing: true }
    case 'cancelDialog':
      // 取消/Esc/✕/mask on any dialog — back to the side panel as it was.
      if (!isDetailDispatchDialogOpen(state.phase)) return state
      return { ...INITIAL_DETAIL_DISPATCH }
    case 'confirmDispatch':
      if (state.phase !== 'confirming') return state
      return { ...state, phase: 'dispatching', error: null }
    case 'dispatchResolved':
      if (state.phase !== 'dispatching') return state
      return { ...INITIAL_DETAIL_DISPATCH, dispatchedCount: action.count }
    case 'dispatchBlocked':
      // Race leg: artifacts went missing between check and dispatch — the
      // blocked union's list re-opens the warning door (ack context reset).
      if (state.phase !== 'dispatching') return state
      return { ...state, phase: 'warning', missing: action.missing, acknowledgedMissing: false, error: null }
    case 'redispatchConfirmed':
      if (state.phase !== 'redispatch-confirm') return state
      return { ...state, phase: 'redispatching', error: null }
    case 'redispatchResolved':
      if (state.phase !== 'redispatching') return state
      return { ...INITIAL_DETAIL_DISPATCH, dispatchedCount: action.count }
    case 'redispatchBlocked':
      // The kernel redispatch re-ran the check and found gaps — the same
      // warning door; 继续派发 then acknowledges through dispatchTasks.
      if (state.phase !== 'redispatching') return state
      return { ...state, phase: 'warning', missing: action.missing, acknowledgedMissing: false, error: null }
    case 'flowFailed':
      if (!isDetailDispatchBusy(state.phase)) return state
      return { ...state, phase: 'error', error: action.error, failedLeg: action.leg }
    case 'retry': {
      if (state.phase !== 'error' || state.failedLeg === null) return state
      // The failed leg re-runs with its context KEPT (the ack face for a
      // dispatch retry, the target for a redispatch retry).
      const phase: DetailDispatchPhase = state.failedLeg === 'check'
        ? 'checking'
        : state.failedLeg === 'dispatch'
          ? 'dispatching'
          : 'redispatching'
      return { ...state, phase, error: null }
    }
    case 'closeError':
      if (state.phase !== 'error') return state
      return { ...INITIAL_DETAIL_DISPATCH }
  }
}

// ---------------------------------------------------------------------------
// The controller hook (the 3.6 useDispatchSelection discipline)
// ---------------------------------------------------------------------------

/** The hook's inputs. */
export interface DetailDispatchChainOptions {
  readonly projectId: string
  /** The task's QUALIFIED board key (`<featureSlug>/<localId>`). */
  readonly taskKey: string
  /** The task title (the confirm/redispatch dialogs' subject line). */
  readonly title: string
  /** The task's feature (the checkStageArtifacts argument). */
  readonly featureSlug: string
  readonly verbs: DetailDispatchVerbs
  /** The dispatching human's audit string (default 'workbench'). */
  readonly actor?: string
  /** The check/dispatch/redispatch leg timeout budget (default 3000ms). */
  readonly budgetMs?: number
  /** Fired once on a successful dispatch/redispatch (3.9 refreshes the board's orchestration face). */
  readonly onDispatched?: (rows: readonly DispatchRow[]) => void
}

/** The controller the execute button and the section drive. */
export interface DetailDispatchController {
  readonly snapshot: DetailDispatchSnapshot
  /** A verb leg is in flight (the button's spinner + disabled face). */
  readonly busy: boolean
  /** 「▶ 派发执行」— the fresh single-task chain (check → dialogs → dispatchTasks). */
  startDispatch(): void
  /** [重派发] — open the second-confirmation dialog for a failed row. */
  startRedispatch(dispatchId: string, reason: string | null): void
  /** The warning door's 继续派发 (acknowledgeMissing face). */
  acknowledgeMissing(): void
  /** The confirming dialog's 派发 — the dispatchTasks leg. */
  confirmDispatch(): void
  /** The RedispatchDialog's 重派发 — the redispatch verb leg (re-runs the kernel check). */
  confirmRedispatch(): void
  /** 取消/Esc on an open dialog — back to the side panel. */
  cancelDialog(): void
  /** The error dialog's 重试 — re-run the failed leg (context kept). */
  retry(): void
  /** The error dialog's 关闭. */
  closeError(): void
}

/**
 * The machine + the async legs. A per-leg token drops stale settles (a leg
 * resolving after the budget timer or a newer start never lands); the ≤3s
 * budget covers the check/dispatch/redispatch legs (ui-design 性能预算).
 */
export function useDetailDispatchChain(options: DetailDispatchChainOptions): DetailDispatchController {
  const budgetMs = options.budgetMs ?? DISPATCH_BUDGET_MS
  const [snapshot, dispatchAction] = useReducer(detailDispatchReducer, INITIAL_DETAIL_DISPATCH)
  const stateRef = useRef(snapshot)
  stateRef.current = snapshot
  const legToken = useRef(0)
  const optionsRef = useRef(options)
  optionsRef.current = options

  /** Fold a verb rejection into the dialog's message (the envelope's own text). */
  const failureOf = (error: unknown): DispatchFlowError => {
    const normalized: WorkbenchVerbError = normalizeWorkbenchVerbError(error)
    return { kind: 'failed', message: `${normalized.message} (${normalized.code})` }
  }

  /** The budget timer: a busy leg that outlives it fails to the error dialog. */
  useEffect(() => {
    if (!isDetailDispatchBusy(snapshot.phase)) return
    const timer = setTimeout(() => {
      legToken.current += 1 // the in-flight leg is dead to us now
      const leg = snapshot.phase === 'checking' ? 'check' : snapshot.phase === 'dispatching' ? 'dispatch' : 'redispatch'
      dispatchAction({ type: 'flowFailed', error: { kind: 'timeout', message: '' }, leg })
    }, budgetMs)
    return () => { clearTimeout(timer) }
  }, [snapshot.phase, budgetMs])

  return useMemo<DetailDispatchController>(() => {
    /** The deterministic pre-dispatch check (the task's own feature — one call). */
    const runCheck = async (): Promise<void> => {
      const current = optionsRef.current
      const token = ++legToken.current
      try {
        const report = await current.verbs.checkStageArtifacts({
          projectId: current.projectId,
          featureSlug: current.featureSlug,
        })
        if (token !== legToken.current) return
        dispatchAction({ type: 'checkResolved', missing: report.missing })
      } catch (error) {
        if (token !== legToken.current) return
        dispatchAction({ type: 'flowFailed', error: failureOf(error), leg: 'check' })
      }
    }

    /** The dispatch leg (the acknowledge rides the warning door's decision). */
    const runDispatch = async (acknowledgeMissing: boolean): Promise<void> => {
      const current = optionsRef.current
      const token = ++legToken.current
      try {
        const result: DispatchTasksResult = await current.verbs.dispatchTasks(
          acknowledgeMissing
            ? { projectId: current.projectId, taskKeys: [current.taskKey], acknowledgeMissing: true }
            : { projectId: current.projectId, taskKeys: [current.taskKey] },
          current.actor ?? DISPATCH_ACTOR,
        )
        if (token !== legToken.current) return
        if ('dispatched' in result) {
          dispatchAction({ type: 'dispatchResolved', count: result.dispatched.length })
          current.onDispatched?.(result.dispatched)
        } else {
          dispatchAction({ type: 'dispatchBlocked', missing: result.missing })
        }
      } catch (error) {
        if (token !== legToken.current) return
        dispatchAction({ type: 'flowFailed', error: failureOf(error), leg: 'dispatch' })
      }
    }

    /** The redispatch leg — the kernel re-runs the whole pre-check (ack=false). */
    const runRedispatch = async (dispatchId: string): Promise<void> => {
      const current = optionsRef.current
      const token = ++legToken.current
      try {
        const result = await current.verbs.redispatch(dispatchId, current.actor ?? DISPATCH_ACTOR)
        if (token !== legToken.current) return
        if ('dispatched' in result) {
          dispatchAction({ type: 'redispatchResolved', count: result.dispatched.length })
          current.onDispatched?.(result.dispatched)
        } else {
          dispatchAction({ type: 'redispatchBlocked', missing: result.missing })
        }
      } catch (error) {
        if (token !== legToken.current) return
        dispatchAction({ type: 'flowFailed', error: failureOf(error), leg: 'redispatch' })
      }
    }

    return {
      snapshot,
      busy: isDetailDispatchBusy(snapshot.phase),
      startDispatch: (): void => {
        if (stateRef.current.phase !== 'idle') return
        dispatchAction({ type: 'startDispatch' })
        void runCheck()
      },
      startRedispatch: (dispatchId: string, reason: string | null): void => {
        if (stateRef.current.phase !== 'idle') return
        dispatchAction({ type: 'startRedispatch', dispatchId, reason })
      },
      acknowledgeMissing: (): void => { dispatchAction({ type: 'acknowledgeMissing' }) },
      confirmDispatch: (): void => {
        const state = stateRef.current
        if (state.phase !== 'confirming') return
        dispatchAction({ type: 'confirmDispatch' })
        void runDispatch(state.acknowledgedMissing)
      },
      confirmRedispatch: (): void => {
        const state = stateRef.current
        if (state.phase !== 'redispatch-confirm' || state.redispatch === null) return
        dispatchAction({ type: 'redispatchConfirmed' })
        void runRedispatch(state.redispatch.dispatchId)
      },
      cancelDialog: (): void => { dispatchAction({ type: 'cancelDialog' }) },
      retry: (): void => {
        const state = stateRef.current
        if (state.phase !== 'error') return
        dispatchAction({ type: 'retry' })
        if (state.failedLeg === 'check') void runCheck()
        else if (state.failedLeg === 'dispatch') void runDispatch(state.acknowledgedMissing)
        else if (state.failedLeg === 'redispatch' && state.redispatch !== null) {
          void runRedispatch(state.redispatch.dispatchId)
        }
      },
      closeError: (): void => { dispatchAction({ type: 'closeError' }) },
    }
    // The options merge is not part of the chain contract (optionsRef carries
    // the fresh legs); the snapshot identity drives the controller identity.
  }, [snapshot])
}

// ---------------------------------------------------------------------------
// The 「▶ 派发执行」 button
// ---------------------------------------------------------------------------

/** 12/18 secondary (the semantic-evolution note under the button). */
const noteStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '6px 0 0',
} as const

/** Inputs of {@link DispatchExecuteButton}. */
export interface DispatchExecuteButtonProps {
  /** The locale seat (the shell's `t`). */
  readonly t: DispatchTranslate
  /** The chain controller (the dock's ONE machine — shared with the section). */
  readonly controller: DetailDispatchController
  /** The task as the dispatchability view-model addresses it. */
  readonly entry: SelectionTaskEntry
  /** The board entries (the dependency mirror's lookup set). */
  readonly entries: readonly SelectionTaskEntry[]
  /** The task's current dispatch row (latest); a failed row flips the click into the redispatch door. */
  readonly currentRow: DispatchRow | null
}

/**
 * The panel-primary dispatch entry (`data-dsh-forge-orch-execute`): the M2
 * UF5 slot's same-position evolution — md 主, 整宽, ▶ glyph + 派发执行.
 * Disabled + tooltip while a pre-guard reason holds (the 3.6 kernel-
 * semantics mirror: 终态/执行中/挂起/依赖未满足); busy = spinner +
 * 正在派发…; a FAILED current orchestration keeps the door OPEN (failure
 * recovery — the click then opens the RedispatchDialog), except for a
 * terminal task (reopen first — the kernel rejects regardless).
 */
export function DispatchExecuteButton(props: DispatchExecuteButtonProps) {
  const { t, controller } = props
  const reason: WorkbenchKey | null = selectionDisabledReason(props.entry, props.entries)
  const failed = props.currentRow !== null && props.currentRow.state === 'failed'
  const terminal = isTerminalTaskStatus(props.entry.status)
  const busy = controller.busy
  const disabled = busy || (reason !== null && (terminal || !failed))
  const tooltip = disabled && !busy && reason !== null ? t(reason) : undefined
  const face = failed && !terminal ? 'redispatch' : disabled ? 'disabled' : 'dispatch'

  return (
    <div data-dsh-forge-orch-execute-wrap="">
      <ChromeButton
        type="button"
        disabled={disabled}
        title={tooltip}
        data-dsh-forge-orch-execute=""
        data-dsh-forge-orch-execute-face={face}
        data-dsh-forge-orch-execute-busy={busy ? 'true' : 'false'}
        style={{
          ...primaryButtonStyle,
          alignItems: 'center',
          cursor: disabled ? 'default' : 'pointer',
          display: 'inline-flex',
          gap: '6px',
          justifyContent: 'center',
          width: '100%',
        }}
        onClick={() => {
          if (disabled) return
          if (failed && props.currentRow !== null) {
            controller.startRedispatch(props.currentRow.id, props.currentRow.error)
            return
          }
          controller.startDispatch()
        }}
      >
        {busy
          ? (
            <span style={{ alignItems: 'center', display: 'inline-flex', gap: '6px' }}>
              <LaunchSpinner label={t('tasks.orch.execute.busy')} />
              <span>{t('tasks.orch.execute.busy')}</span>
            </span>
          )
          : (
            <>
              <span aria-hidden="true">▶</span>
              <span>{t('tasks.orch.execute')}</span>
            </>
          )}
      </ChromeButton>
      <p style={noteStyle}>{t('tasks.orch.execute.note')}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The 编排 partition
// ---------------------------------------------------------------------------

/** One orchestration line (the prototype's .orch-line). */
const lineStyle = {
  alignItems: 'center',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
  padding: '2px 0',
} as const

/** 12/18 secondary. */
const secondaryStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
} as const

/** mono 12/18 secondary (timestamps, session ids, prompt_hash). */
const monoSecondaryStyle = {
  ...secondaryStyle,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  overflowWrap: 'anywhere',
} as const

/** 失败原因 — error tone, 12/18. */
const errorTextStyle = {
  color: 'var(--dsw-alias-state-error-primary, rgb(239, 68, 68))',
  fontSize: '12px',
  lineHeight: '18px',
  overflowWrap: 'anywhere',
} as const

/** 空分区 hint (the prototype's 尚未派发 line). */
const emptyHintStyle = {
  ...secondaryStyle,
  margin: '0',
} as const

/** 去审批 sm 主 (h28 r14 brand fill — the ApprovalPanel approve precedent). */
const smPrimaryButtonStyle = {
  background: 'var(--dsw-alias-link, rgb(65, 118, 230))',
  border: 'none',
  borderRadius: '14px',
  color: '#fff',
  cursor: 'pointer',
  font: 'inherit',
  height: '28px',
  padding: '0 12px',
} as const

/** The visually-hidden live-region style (inline — no stylesheet pipeline). */
const visuallyHiddenStyle = {
  clipPath: 'inset(50%)',
  height: '1px',
  overflow: 'hidden',
  position: 'absolute',
  whiteSpace: 'nowrap',
  width: '1px',
} as const

/** The prompt_hash metadata's rendered budget (full hash rides as the title). */
function shortHash(hash: string): string {
  return hash.length <= 12 ? hash : `${hash.slice(0, 12)}…`
}

/** Inputs of {@link OrchestrationSection}. */
export interface OrchestrationSectionProps {
  /** The locale seat (the shell's `t`). */
  readonly t: DispatchTranslate
  /** The section's task (qualified board key). */
  readonly taskKey: string
  /** The task title (the dialogs' subject line). */
  readonly taskTitle: string
  /** The project's dispatch rows (unfiltered — the section picks this task's). */
  readonly rows: readonly DispatchRow[]
  /** The dock's ONE chain controller (shared with the execute button). */
  readonly controller: DetailDispatchController
  /** 「进入会话」 — 切会话视图 + session-focus (the M1 view-switch contract, 3.9 wires). */
  readonly onEnterSession?: ((sessionId: string) => void) | undefined
  /** [去审批] / the awaiting badge — switch to the approval dock (侧板互斥编排 by 3.9). */
  readonly onOpenApproval?: ((taskKey: string) => void) | undefined
}

/**
 * The 编排 partition (`data-dsh-forge-orchestration-section`): the current
 * row's orchestration face + the chain's dialogs. The dialogs render HERE
 * (one place, above the partition content — the execute button stays a pure
 * trigger sharing the same controller), and the wrapper contains Esc while
 * a dialog is open so the detail dock behind it does not ALSO close (the
 * DialogFrame dismisses the dialog; the bubble leg dies at this wrapper).
 */
export function OrchestrationSection(props: OrchestrationSectionProps) {
  const { t, controller } = props
  const { snapshot } = controller
  const current = currentDispatchRow(props.rows, props.taskKey)
  const dialogOpen = isDetailDispatchDialogOpen(snapshot.phase)

  /** Esc containment (dialog-open phases only): the dock's own Esc close stays armed otherwise. */
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape' && dialogOpen) event.stopPropagation()
  }

  return (
    <div data-dsh-forge-orchestration-section="" onKeyDown={onKeyDown}>
      {current === null
        ? <p data-dsh-forge-orch-empty="" style={emptyHintStyle}>{t('tasks.orch.empty')}</p>
        : (
          <>
            <div data-dsh-forge-orch-state-line="" style={lineStyle}>
              <span style={secondaryStyle}>{t('tasks.orch.currentState')}</span>
              <DispatchBadge
                t={t}
                taskKey={props.taskKey}
                state={current.state}
                {...(props.onOpenApproval === undefined ? {} : { onOpenApproval: props.onOpenApproval })}
              />
              <span
                data-dsh-forge-orch-dispatched-at=""
                title={current.dispatchedAt}
                style={monoSecondaryStyle}
              >
                {fillTemplate(t('tasks.orch.dispatchedAt'), { time: formatTimestamp(current.dispatchedAt) })}
              </span>
            </div>
            {current.sessionId !== null && (
              <div data-dsh-forge-orch-session-line="" style={lineStyle}>
                <span style={secondaryStyle}>
                  {fillTemplate(t('tasks.orch.session'), { id: current.sessionId })}
                </span>
                <ChromeButton
                  type="button"
                  data-dsh-forge-orch-enter-session={current.sessionId}
                  style={ghostButtonStyle}
                  onClick={() => { props.onEnterSession?.(current.sessionId as string) }}
                >
                  {t('detail.links.enter')}
                </ChromeButton>
              </div>
            )}
            {current.state === 'awaiting' && (
              <div data-dsh-forge-orch-approval-line="" style={lineStyle}>
                <ChromeButton
                  type="button"
                  data-dsh-forge-orch-go-approval={props.taskKey}
                  style={smPrimaryButtonStyle}
                  onClick={() => { props.onOpenApproval?.(props.taskKey) }}
                >
                  {t('tasks.orch.goApproval')}
                </ChromeButton>
              </div>
            )}
            {current.state === 'failed' && (
              <div data-dsh-forge-orch-failed-line="" style={lineStyle}>
                <span data-dsh-forge-orch-reason="" style={errorTextStyle}>
                  {current.error === null
                    ? t('tasks.orch.failedReason.none')
                    : fillTemplate(t('tasks.orch.failedReason'), { reason: current.error })}
                </span>
                <ChromeButton
                  type="button"
                  data-dsh-forge-orch-redispatch={current.id}
                  style={ghostButtonStyle}
                  onClick={() => { controller.startRedispatch(current.id, current.error) }}
                >
                  {t('tasks.orch.redispatch')}
                </ChromeButton>
              </div>
            )}
            <div data-dsh-forge-orch-presynth-line="" style={lineStyle} title={t('tasks.orch.presynth.tooltip')}>
              <span data-dsh-forge-orch-presynth="" style={secondaryStyle}>{t('tasks.orch.presynth')}</span>
              <span
                data-dsh-forge-orch-prompt-hash=""
                title={current.promptHash}
                style={monoSecondaryStyle}
              >
                {fillTemplate(t('tasks.orch.presynth.hash'), { hash: shortHash(current.promptHash) })}
              </span>
            </div>
          </>
        )}

      {snapshot.phase === 'warning' && (
        <DispatchWarningDialog
          t={t}
          missing={snapshot.missing}
          onContinue={() => { controller.acknowledgeMissing() }}
          onCancel={() => { controller.cancelDialog() }}
        />
      )}
      {snapshot.phase === 'confirming' && (
        <DispatchConfirmDialog
          t={t}
          tasks={[{ key: props.taskKey, title: props.taskTitle }]}
          onConfirm={() => { controller.confirmDispatch() }}
          onCancel={() => { controller.cancelDialog() }}
        />
      )}
      {snapshot.phase === 'redispatch-confirm' && snapshot.redispatch !== null && (
        <RedispatchDialog
          t={t}
          taskKey={props.taskKey}
          taskTitle={props.taskTitle}
          reason={snapshot.redispatch.reason}
          onConfirm={() => { controller.confirmRedispatch() }}
          onCancel={() => { controller.cancelDialog() }}
        />
      )}
      {snapshot.phase === 'error' && snapshot.error !== null && (
        <DispatchErrorDialog
          t={t}
          error={snapshot.error}
          onRetry={() => { controller.retry() }}
          onClose={() => { controller.closeError() }}
        />
      )}

      <span role="status" aria-live="polite" data-dsh-forge-orch-announce="" style={visuallyHiddenStyle}>
        {snapshot.dispatchedCount === null
          ? ''
          : fillTemplate(t('tasks.orch.announce.dispatched'), { key: props.taskKey })}
      </span>
    </div>
  )
}
