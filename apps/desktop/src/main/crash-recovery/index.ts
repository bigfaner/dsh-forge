// crash-recovery — Interface 2 of the M1 tech design (UF4 显式状态机 / Key Flow F2, SC9).
//
// Pure table-driven state machine over RecoveryState with exactly the legal
// transitions of the F2 diagram:
//   idle → restarting        (host-exit: 子进程异常退出)
//   restarting → restoring   (host-responsive: 重启成功·可响应)
//   restarting → failed      (retry-exhausted: 重试 3 次耗尽)
//   restoring → recovered    (replay-complete: session 回放完成)
//   restoring → failed       (replay-error / retry-exhausted)
//   idle → failed            (start-failed: 首次 spawn/握手失败, F1 直进失败态)
// `recovered` and `failed` are terminal for the `transition()` surface —
// failed 不回退; every other (state, event) pair throws (单测表驱动覆盖).
//
// Retry policy (Interface 2 note): 最多 3 次, 指数退避 2s/4s/8s, 定时器驱动,
// 放弃即 retry-exhausted. Attempts are owned by host-supervisor (每 次 startHost()
// 后 +1 写入 RecoveryContext); the machine mirrors that counter via
// `setAttempts()` and abandons retries once the 3rd attempt has not produced a
// host-responsive — the next timer tick dispatches `retry-exhausted`.
//
// host-exit clearing semantics (Data Models, SessionTable lifecycle): on every
// host-exit the machine emits a `session-table-reset` side effect — the
// notifier task (Interface 4) consumes it later to clear SessionTable and zero
// the Dedup entries. This module only exports the event; it does not implement
// the notifier itself.

import { shellLog } from '../log.ts'

export type RecoveryState = 'idle' | 'restarting' | 'restoring' | 'recovered' | 'failed'

export type RecoveryEvent =
  | 'host-exit'
  | 'host-responsive'
  | 'replay-complete'
  | 'retry-exhausted'
  | 'replay-error'
  | 'start-failed'

export type RecoveryFailureCode = 'retry-exhausted' | 'replay-error' | 'host-start-failed'

export interface RecoveryContext {
  state: RecoveryState
  attempts: number
  failure?: { code: RecoveryFailureCode; detail: string }
}

/** Data-model contract: failure.detail ≤120 字符截断. */
const FAILURE_DETAIL_MAX = 120

/** Backoff ladder in ms: 2s / 4s / 8s across at most MAX_ATTEMPTS attempts. */
export const BACKOFF_SCHEDULE_MS = [2_000, 4_000, 8_000] as const
export const MAX_RECOVERY_ATTEMPTS = 3

/** Legal transitions — F2 崩溃恢复状态机, verbatim. */
export const RECOVERY_TRANSITIONS: Readonly<Record<RecoveryState, Readonly<Partial<Record<RecoveryEvent, RecoveryState>>>>> = {
  idle: { 'host-exit': 'restarting', 'start-failed': 'failed' },
  restarting: { 'host-responsive': 'restoring', 'retry-exhausted': 'failed' },
  restoring: { 'replay-complete': 'recovered', 'replay-error': 'failed', 'retry-exhausted': 'failed' },
  recovered: {},
  failed: {},
}

export class IllegalRecoveryTransitionError extends Error {
  constructor(
    public readonly from: RecoveryState,
    public readonly event: RecoveryEvent,
  ) {
    super(`illegal recovery transition: ${from} --${event}--> (rejected; failed never regresses)`)
    this.name = 'IllegalRecoveryTransitionError'
  }
}

/** Pure transition function (Interface 2 signature). Throws on illegal moves. */
export function transition(state: RecoveryState, event: RecoveryEvent): RecoveryState {
  const next = RECOVERY_TRANSITIONS[state][event]
  if (next === undefined) throw new IllegalRecoveryTransitionError(state, event)
  return next
}

/** Side effects the machine emits for downstream consumers (notifier task, overlay). */
export type RecoverySideEffect =
  | { type: 'session-table-reset'; reason: 'host-exit' }
  | { type: 'state-changed'; from: RecoveryState; to: RecoveryState; context: RecoveryContext }
  | { type: 'retry-scheduled'; delayMs: number; attempt: number }
  | { type: 'retry-abandoned'; attempts: number }

export interface CrashRecoveryDeps {
  /** Timer seam (tests inject a fake clock). Defaults to setTimeout/clearTimeout. */
  setTimer?: (fn: () => void, delayMs: number) => unknown
  clearTimer?: (handle: unknown) => void
  /** Side-effect sink — wiring forwards `session-table-reset` to the notifier task. */
  onEffect?: (effect: RecoverySideEffect) => void
}

export interface CrashRecovery {
  readonly context: Readonly<RecoveryContext>
  /** Dispatch a machine event (illegal transitions throw; state is unchanged). */
  dispatch(event: RecoveryEvent, detail?: string): RecoveryState
  /** Mirror the supervisor's attempts counter (incremented per startHost() call). */
  setAttempts(attempts: number): void
  /** Cancel any pending backoff timer (e.g. before app teardown / relaunch). */
  dispose(): void
}

const FAILURE_CODE_BY_EVENT: Readonly<Partial<Record<RecoveryEvent, RecoveryFailureCode>>> = {
  'retry-exhausted': 'retry-exhausted',
  'replay-error': 'replay-error',
  'start-failed': 'host-start-failed',
}

function truncateDetail(detail: string | undefined): string {
  const text = detail === undefined || detail === '' ? 'no detail' : detail
  return text.length <= FAILURE_DETAIL_MAX ? text : text.slice(0, FAILURE_DETAIL_MAX)
}

export function createCrashRecovery(deps: CrashRecoveryDeps = {}): CrashRecovery {
  const setTimer = deps.setTimer ?? ((fn: () => void, delayMs: number) => setTimeout(fn, delayMs))
  const clearTimer = deps.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>))
  const emit = deps.onEffect ?? (() => {})

  let context: RecoveryContext = { state: 'idle', attempts: 0 }
  let pendingTimer: unknown
  // Index into BACKOFF_SCHEDULE_MS for the currently scheduled retry step.
  let backoffStep = 0

  function scheduleNextRetry(): void {
    // 放弃即 retry-exhausted: 3 attempts consumed without host-responsive.
    if (context.attempts >= MAX_RECOVERY_ATTEMPTS) {
      emit({ type: 'retry-abandoned', attempts: context.attempts })
      dispatch('retry-exhausted', `gave up after ${String(MAX_RECOVERY_ATTEMPTS)} restart attempts (backoff 2s/4s/8s exhausted)`)
      return
    }
    const delayMs: number = BACKOFF_SCHEDULE_MS[backoffStep] ?? 8_000
    const attempt = context.attempts + 1
    backoffStep += 1
    pendingTimer = setTimer(() => {
      pendingTimer = undefined
      emit({ type: 'retry-scheduled', delayMs, attempt })
    }, delayMs)
  }

  function dispatch(event: RecoveryEvent, detail?: string): RecoveryState {
    const from = context.state
    const to = transition(from, event)
    let failure: RecoveryContext['failure']
    const code = FAILURE_CODE_BY_EVENT[event]
    if (code !== undefined) failure = { code, detail: truncateDetail(detail) }
    context = { state: to, attempts: context.attempts, ...(failure === undefined ? {} : { failure }) }
    emit({ type: 'state-changed', from, to, context })

    if (from === 'idle' && to === 'restarting') {
      // host-exit clearing semantics hook: SessionTable 整表清空 + DedupEntry 清零
      // (重建由 session-list 对账 + 新事件完成). Consumed by the notifier task (4.x).
      emit({ type: 'session-table-reset', reason: 'host-exit' })
      backoffStep = 0
      scheduleNextRetry()
    }
    if (to === 'restoring' || to === 'failed') {
      // Retry ladder ends on any exit from `restarting` (success or abandonment).
      if (pendingTimer !== undefined) {
        clearTimer(pendingTimer)
        pendingTimer = undefined
      }
      backoffStep = 0
    }
    if (to === 'failed') {
      shellLog.error({
        code: 'ERR_HOST_START_FAILED',
        message: 'recovery failed (terminal state; app restart required)',
        data: { failureCode: context.failure?.code, detail: context.failure?.detail, attempts: context.attempts },
      })
    }
    return to
  }

  return {
    get context() { return context },
    dispatch,
    setAttempts(attempts: number) {
      if (typeof attempts !== 'number' || !Number.isFinite(attempts) || attempts < 0) {
        throw new TypeError(`attempts must be a non-negative finite number, got ${String(attempts)}`)
      }
      context = { ...context, attempts }
      // Attempts progressed while a retry ladder is armed and the newest
      // attempt still has not produced host-responsive: keep the ladder going.
      if (context.state === 'restarting' && pendingTimer === undefined) scheduleNextRetry()
    },
    dispose() {
      if (pendingTimer !== undefined) {
        clearTimer(pendingTimer)
        pendingTimer = undefined
      }
      backoffStep = 0
    },
  }
}
