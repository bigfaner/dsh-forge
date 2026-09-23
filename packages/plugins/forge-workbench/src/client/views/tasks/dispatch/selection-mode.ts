/**
 * The UF1 dispatch-selection state machine (task 3.6, ui-design UF1 选择模式
 * + States/Interactions 派发链): the pure machine behind the selection layer
 * — idle → selecting → checking → (warning ⇄ confirming) → dispatching →
 * dispatched/exit, plus the dispatch-error (timeout / verb rejection) branch.
 *
 * Layer split (the MigrateGuard.ts / view-key.ts precedent — pure machine in
 * a plain module, the React glue in the sibling component):
 *   - HERE: the machine snapshot + reducer, the Esc-layering decision, and
 *     the dispatchability view-model (the KERNEL-semantics mirror — see
 *     selectionDisabledReason);
 *   - SelectionLayer.tsx: the controller hook (useDispatchSelection — verbs
 *     + timeout budget + stale-leg tokens), the card/keyboard contract, the
 *     context the card-level primitives consume;
 *   - dialog components: the r24 presentations of warning / confirming /
 *     dispatch-error.
 *
 * Verbs seam: the two Interface 1 verbs this chain consumes
 * (checkStageArtifacts / dispatchTasks) mirror the preload signatures from
 * task 3.3 VERBATIM (input shape, the dispatched|blocked union, the actor
 * string) — the real IPC wiring lands with 3.9's TaskBoardPage integration;
 * 3.6 builds and tests the chain against mock verbs (task Implementation
 * Notes). The DTO twins below stay structural twins of the kernel halves
 * (apps/desktop ipc/types.ts 3.2/3.3): the plugin cannot import the app.
 */
import type { DispatchState, FeatureStatus, TaskStatus } from '../../../ipc-types'
import type { WorkbenchKey } from '../../../locale/en'

// ---------------------------------------------------------------------------
// Interface 1 verb DTO twins (kernel 3.2/3.3; camelCase projections)
// ---------------------------------------------------------------------------

/**
 * dispatch 行 5 态 — the CANONICAL client twin lives in ipc-types.ts since
 * task 3.7 (the WorkbenchEvent union's dispatch_updated member needs it);
 * re-exported here so the 3.6 chain's imports stay stable.
 */
export type { DispatchState }

/** 单条缺失项(kernel MissingItem — 结构化警告清单元素). */
export interface MissingItem {
  /** 产生该期望的阶段行(PRD 清单行). */
  readonly stage: FeatureStatus
  /** 命中的机器规则(kernel StageCheckRule 词表原词). */
  readonly rule: string
  /** 缺失对象:相对路径(tasks/ 方言)/ 任务看板地址 / 聚合面名. */
  readonly artifact: string
  /** 机器可读解释(稳定文案,UI 直接呈现). */
  readonly detail: string
}

/** checkStageArtifacts 产物(kernel StageArtifactsReport). */
export interface StageArtifactsReport {
  readonly stage: FeatureStatus
  /** 期望清单全过(= missing 为空);false 仍可派发(acknowledgeMissing). */
  readonly satisfied: boolean
  readonly missing: readonly MissingItem[]
}

/** dispatch 行的 IPC 投影(kernel DispatchRow). */
export interface DispatchRow {
  readonly id: string
  readonly batchId: string
  readonly projectId: string
  readonly featureSlug: string
  /** 看板限定地址 `<featureSlug>/<localId>`. */
  readonly taskKey: string
  readonly state: DispatchState
  readonly sessionId: string | null
  readonly promptHash: string
  readonly actor: string
  readonly dispatchedAt: string
  readonly endedAt: string | null
  readonly error: string | null
}

/** dispatchTasks 入参(kernel DispatchTasksInput;acknowledgeMissing = 缺失确认面). */
export interface DispatchTasksInput {
  readonly projectId: string
  readonly taskKeys: readonly string[]
  readonly acknowledgeMissing?: boolean
}

/** dispatchTasks 联合返回(kernel DispatchTasksResult;blocked = 产物缺失未确认). */
export type DispatchTasksResult =
  | { readonly dispatched: readonly DispatchRow[] }
  | { readonly blocked: 'artifacts-missing'; readonly missing: readonly MissingItem[] }

/**
 * The two verbs the chain consumes (Interface 1 UF1 编排段;signatures mirror
 * the preload bridge of task 3.3 one-to-one — dispatchTasks carries the
 * dispatching human's actor string for kernel audit).
 */
export interface DispatchVerbs {
  checkStageArtifacts(input: { readonly projectId: string; readonly featureSlug: string }): Promise<StageArtifactsReport>
  dispatchTasks(input: DispatchTasksInput, actor: string): Promise<DispatchTasksResult>
}

// ---------------------------------------------------------------------------
// Dispatchability view-model (kernel-semantics mirror)
// ---------------------------------------------------------------------------

/**
 * One board task as the selection layer addresses it — the TaskSummary
 * projection the page already owns (key = 看板限定地址, blockers = same-feature
 * LOCAL upstream keys, task 2.5 dialect).
 */
export interface SelectionTaskEntry {
  readonly key: string
  readonly title: string
  readonly status: TaskStatus
  readonly featureSlug: string
  readonly blockers: readonly string[]
}

/** 终态(completed/skipped/rejected)—— kernel model.ts isTerminalStatus mirror. */
export function isTerminalTaskStatus(status: TaskStatus): boolean {
  return status === 'completed' || status === 'skipped' || status === 'rejected'
}

/** 满足依赖检查的状态集(kernel deps.ts SATISFIED_STATUSES:completed + skipped,无 rejected). */
const DEP_SATISFIED_STATUSES: ReadonlySet<TaskStatus> = new Set(['completed', 'skipped'])

/** The local id of a qualified board key (`<featureSlug>/<localId>` dialect). */
export function localIdOfTaskKey(taskKey: string): string {
  const at = taskKey.lastIndexOf('/')
  return at === -1 ? taskKey : taskKey.slice(at + 1)
}

/** The feature slug of a qualified board key (the segment before the last `/`). */
export function featureSlugOfTaskKey(taskKey: string): string {
  const at = taskKey.lastIndexOf('/')
  return at === -1 ? '' : taskKey.slice(0, at)
}

/**
 * The entry's disabled reason for selection, or null when dispatchable — the
 * KERNEL dispatchability semantics mirrored for the pre-guard (ui-design:
 * 依赖未满足/终态 checkbox disabled + tooltip; kernel re-validates and rejects
 * with ERR_TASK_STATE_INVALID / ERR_TASK_DEPS_UNSATISFIED regardless):
 *
 *   - terminal (completed/skipped/rejected) → not dispatchable, reopen first;
 *   - in_progress → one executor per task;
 *   - suspended → resume before dispatching;
 *   - pending/blocked with resolved-but-unsatisfied blockers → deps reason
 *     (this subsumes ui-design's 多选含互相依赖 → 后续者 disabled: a batch
 *     mate whose blocker is still pending is exactly a non-terminal dep).
 *     Dangling blockers are vacuously satisfied (claim 语境, kernel parity).
 */
export function selectionDisabledReason(
  entry: SelectionTaskEntry,
  entries: readonly SelectionTaskEntry[],
): WorkbenchKey | null {
  if (isTerminalTaskStatus(entry.status)) return 'tasks.dispatch.disabled.terminal'
  if (entry.status === 'in_progress') return 'tasks.dispatch.disabled.inProgress'
  if (entry.status === 'suspended') return 'tasks.dispatch.disabled.suspended'
  for (const blocker of entry.blockers) {
    const upstream = entries.find(
      candidate => candidate.featureSlug === entry.featureSlug && localIdOfTaskKey(candidate.key) === blocker,
    )
    // Dangling (unresolved) blockers are vacuously satisfied — kernel parity.
    if (upstream !== undefined && !DEP_SATISFIED_STATUSES.has(upstream.status)) {
      return 'tasks.dispatch.disabled.deps'
    }
  }
  return null
}

/** Does the board carry at least one dispatchable entry (the toolbar entry's disabled face)? */
export function hasDispatchableEntry(entries: readonly SelectionTaskEntry[]): boolean {
  return entries.some(entry => selectionDisabledReason(entry, entries) === null)
}

// ---------------------------------------------------------------------------
// The machine
// ---------------------------------------------------------------------------

/**
 * The chain phases (ui-design States: idle / selecting / warning /
 * confirming / dispatching + the dispatch-error branch; `checking` is the
 * transient checkStageArtifacts leg — the deterministic pre-dispatch check
 * rides the same spinner face as dispatching).
 */
export type DispatchSelectionPhase =
  | 'idle'
  | 'selecting'
  | 'checking'
  | 'warning'
  | 'confirming'
  | 'dispatching'
  | 'dispatch-error'

/** The dispatch-flow error (timeout vs verb rejection — different dialog copy). */
export interface DispatchFlowError {
  readonly kind: 'timeout' | 'failed'
  readonly message: string
}

/** The aria-live outcome the layer announces (structured; copy stays in the locale halves). */
export type DispatchSelectionOutcome =
  | { readonly type: 'entered' }
  | { readonly type: 'exited' }
  | { readonly type: 'dispatched'; readonly count: number }

/** Machine snapshot — a stable reference between transitions. */
export interface DispatchSelectionSnapshot {
  readonly phase: DispatchSelectionPhase
  /** Selected keys in click order (selection mode only). */
  readonly selectedKeys: readonly string[]
  /** The batch under dialog (snapshotted at requestDispatch; the dispatch verb's taskKeys). */
  readonly pendingKeys: readonly string[]
  /** The warning dialog's missing list (warning phase only). */
  readonly missing: readonly MissingItem[]
  /** Did the user pass the warning door (acknowledgeMissing = true)? */
  readonly acknowledgedMissing: boolean
  readonly error: DispatchFlowError | null
  readonly outcome: DispatchSelectionOutcome | null
}

/** First-boot state. */
export const INITIAL_DISPATCH_SELECTION: DispatchSelectionSnapshot = Object.freeze({
  phase: 'idle',
  selectedKeys: [],
  pendingKeys: [],
  missing: [],
  acknowledgedMissing: false,
  error: null,
  outcome: null,
}) as DispatchSelectionSnapshot

/** The actions (the controller hook pre-validates toggle; the reducer phase-guards every leg). */
export type DispatchSelectionAction =
  | { readonly type: 'enter' }
  | { readonly type: 'exit' }
  | { readonly type: 'toggle'; readonly key: string }
  | { readonly type: 'requestDispatch' }
  | { readonly type: 'checkResolved'; readonly missing: readonly MissingItem[] }
  | { readonly type: 'flowFailed'; readonly error: DispatchFlowError }
  | { readonly type: 'cancelDialog' }
  | { readonly type: 'acknowledgeMissing' }
  | { readonly type: 'confirmDispatch' }
  | { readonly type: 'dispatchResolved'; readonly count: number }
  | { readonly type: 'dispatchBlocked'; readonly missing: readonly MissingItem[] }
  | { readonly type: 'retryDispatch' }
  | { readonly type: 'closeError' }

/** True while a verb leg is in flight (the spinner face). */
export function isDispatchBusy(phase: DispatchSelectionPhase): boolean {
  return phase === 'checking' || phase === 'dispatching'
}

/** True while one of the chain dialogs is open (the Esc-consumed layer). */
export function isDispatchDialogOpen(phase: DispatchSelectionPhase): boolean {
  return phase === 'warning' || phase === 'confirming' || phase === 'dispatch-error'
}

// ---------------------------------------------------------------------------
// The controller seam (implemented by SelectionLayer.tsx's useDispatchSelection)
// ---------------------------------------------------------------------------

/** The controller hook's inputs. */
export interface DispatchQueueOptions {
  /** The board tasks (the dispatchability view-model's input; reactive). */
  readonly entries: readonly SelectionTaskEntry[]
  readonly projectId: string
  readonly verbs: DispatchVerbs
  /** The dispatching human's audit string (default 'workbench'). */
  readonly actor?: string
  /** The check/dispatch leg timeout budget (default 3000ms). */
  readonly budgetMs?: number
  /** Fired once on a successful dispatch (3.9 refreshes the board's orchestration projection). */
  readonly onDispatched?: (rows: readonly DispatchRow[]) => void
}

/** The controller the layer (and the page's toolbar entry) drive. */
export interface DispatchSelectionController {
  readonly snapshot: DispatchSelectionSnapshot
  /** The board entries the controller was built with (title resolution). */
  readonly entries: readonly SelectionTaskEntry[]
  isSelected(taskKey: string): boolean
  isDisabled(taskKey: string): boolean
  /** The disabled reason's locale KEY (null = dispatchable) — the tooltip source. */
  disabledReason(taskKey: string): WorkbenchKey | null
  /** Enter selection mode (idle → selecting; idempotent). */
  enter(): void
  /** Exit selection mode and clear the selection (selecting → idle). */
  exit(): void
  /** Toggle one card's checkbox (validated: dispatchable + selecting phase only). */
  toggle(taskKey: string): void
  /** 派发所选 — the deterministic check, then warning/confirming. */
  requestDispatch(): void
  /** The warning door's 继续派发 (acknowledgeMissing face). */
  acknowledgeMissing(): void
  /** The confirming dialog's 派发 — the dispatchTasks leg. */
  confirmDispatch(): void
  /** 取消/Esc on an open dialog — back to selecting, selection KEPT. */
  cancelDialog(): void
  /** The error dialog's 重试 — re-runs the dispatch leg. */
  retryDispatch(): void
  /** The error dialog's 关闭 — back to selecting, selection kept. */
  closeError(): void
}

/**
 * The Esc layering decision (ui-design Esc 分层; unit-testable in isolation):
 * a dialog open → the dialog consumes Esc (close, STAY in selection mode,
 * selection kept — the event never reaches the exit leg); selecting with no
 * dialog → exit and clear; idle/busy → Esc is not this layer's to take
 * (busy legs cannot be cancelled mid-flight — no spec face for that).
 */
export function escActionForPhase(phase: DispatchSelectionPhase): 'close-dialog' | 'exit-selection' | 'none' {
  if (isDispatchDialogOpen(phase)) return 'close-dialog'
  if (phase === 'selecting') return 'exit-selection'
  return 'none'
}

/** Back to the selecting baseline (dialog closed; SELECTION KEPT — ui-design 取消/Esc(对话框)). */
const RESUME_SELECTING: Partial<DispatchSelectionSnapshot> = {
  phase: 'selecting',
  pendingKeys: [],
  missing: [],
  acknowledgedMissing: false,
  error: null,
}

/**
 * The reducer. Every leg is phase-guarded: a stale async settle (a check
 * that resolved after the timeout already fired, a dispatch that landed
 * after closeError) is a no-op — the controller's token ALSO drops stale
 * legs before dispatching, so the guard is belt-and-braces for the pure
 * unit tests of the reducer itself.
 */
export function dispatchSelectionReducer(
  state: DispatchSelectionSnapshot,
  action: DispatchSelectionAction,
): DispatchSelectionSnapshot {
  switch (action.type) {
    case 'enter':
      if (state.phase !== 'idle') return state
      return { ...state, phase: 'selecting', outcome: { type: 'entered' } }
    case 'exit':
      if (state.phase !== 'selecting') return state
      return {
        ...INITIAL_DISPATCH_SELECTION,
        outcome: { type: 'exited' },
      }
    case 'toggle': {
      if (state.phase !== 'selecting') return state
      const selected = state.selectedKeys.includes(action.key)
        ? state.selectedKeys.filter(key => key !== action.key)
        : [...state.selectedKeys, action.key]
      return { ...state, selectedKeys: selected }
    }
    case 'requestDispatch':
      if (state.phase !== 'selecting' || state.selectedKeys.length === 0) return state
      return {
        ...state,
        phase: 'checking',
        pendingKeys: state.selectedKeys.slice(),
        acknowledgedMissing: false,
        error: null,
      }
    case 'checkResolved':
      if (state.phase !== 'checking') return state
      return action.missing.length === 0
        ? { ...state, phase: 'confirming', missing: [] }
        : { ...state, phase: 'warning', missing: action.missing }
    case 'flowFailed':
      if (state.phase !== 'checking' && state.phase !== 'dispatching') return state
      return { ...state, phase: 'dispatch-error', error: action.error }
    case 'cancelDialog':
      if (state.phase !== 'warning' && state.phase !== 'confirming') return state
      return { ...state, ...RESUME_SELECTING }
    case 'acknowledgeMissing':
      // The warning door's 继续派发 — treated as confirmation (Hard Rule:
      // missing artifacts warn but never block; acknowledgeMissing face).
      if (state.phase !== 'warning') return state
      return { ...state, phase: 'confirming', acknowledgedMissing: true }
    case 'confirmDispatch':
      if (state.phase !== 'confirming') return state
      return { ...state, phase: 'dispatching', error: null }
    case 'dispatchResolved':
      // Success: exit selection mode entirely (ui-design — 确认后派发,退出
      // 选择模式); selection cleared.
      if (state.phase !== 'dispatching') return state
      return { ...INITIAL_DISPATCH_SELECTION, outcome: { type: 'dispatched', count: action.count } }
    case 'dispatchBlocked':
      // Race leg: the batch's artifacts went missing between check and
      // dispatch — the blocked union's list re-opens the warning door.
      if (state.phase !== 'dispatching') return state
      return { ...state, phase: 'warning', missing: action.missing, acknowledgedMissing: false, error: null }
    case 'retryDispatch':
      if (state.phase !== 'dispatch-error') return state
      // Retry keeps the acknowledged context (a retry after acknowledge does
      // not re-warn on the same list).
      return { ...state, phase: 'dispatching', error: null }
    case 'closeError':
      if (state.phase !== 'dispatch-error') return state
      return { ...state, ...RESUME_SELECTING }
  }
}
