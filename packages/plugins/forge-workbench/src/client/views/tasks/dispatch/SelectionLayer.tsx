/**
 * The UF1 selection layer (task 3.6, ui-design UF1 选择模式): the controller
 * hook + the mode wrapper the board views mount inside. Composition (the
 * CONTROLLED toolbar precedent — the page owns the machine, the views stay
 * stateless above it):
 *
 *   useDispatchSelection(options) → controller — the machine (selection-mode.ts
 *       reducer) plus the async legs: the per-feature checkStageArtifacts fan
 *       (multi-feature batches merge their missing lists, mirroring the
 *       kernel's own per-feature loop), the dispatchTasks leg with the ≤3s
 *       budget timer, and stale-leg tokens so a late verb settle after a
 *       timeout/close never lands.
 *   <SelectionLayer controller t onOpenDetail> — wraps the board views
 *       (cards address themselves by `data-dsh-forge-select-card` OR the M2
 *       board's own hooks — view B card / view C row / view A `data-id`
 *       wrapper, the CARD_SELECTOR union since 3.9), owns the
 *       keyboard contract in the CAPTURE phase (Space = 勾选 / Enter = 详情 /
 *       方向键遍历 — the M2 Enter/Space semantics are overridden exactly and
 *       only while the selecting phase is live, so nothing inside the cards
 *       has to change), the whole-surface click toggle, the Esc layering,
 *       the float bar + the three dialogs, and the aria-live outcome region.
 *   SelectionCheckbox / DetailJumpButton — the card-level primitives
 *       (self-hiding outside selection mode), the checkbox being the ui-design
 *       M3 先例外溢新增控件原语: 28×28 r14, 2px `--dsw-alias-link` focus ring,
 *       checked = brand fill + white check, NATIVE checkbox semantics with
 *       `aria-label` = the task title (Hard Rule).
 *
 * Integration with TaskBoardPage itself is task 3.9 — this layer mounts
 * nothing on the page; tests drive mock verbs.
 */
import {
  createContext, useContext, useEffect, useMemo, useReducer, useRef, useState,
  type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import type { WorkbenchVerbError } from '../../../ipc-types'
import type { WorkbenchKey } from '../../../locale/en'
import { normalizeWorkbenchVerbError } from '../../../ipc/workbench'
import { fillTemplate } from '../../overview/format'
import { ChromeButton } from '../../../components/chrome/ChromeButton'
import {
  dispatchSelectionReducer, escActionForPhase, featureSlugOfTaskKey, INITIAL_DISPATCH_SELECTION,
  isDispatchBusy, selectionDisabledReason,
  type DispatchFlowError, type DispatchRow, type DispatchSelectionController,
  type DispatchQueueOptions, type DispatchSelectionOutcome, type DispatchTasksInput,
  type MissingItem,
} from './selection-mode'
import { SelectionFloatBar } from './SelectionFloatBar'
import { DispatchWarningDialog } from './DispatchWarningDialog'
import { DispatchConfirmDialog } from './DispatchConfirmDialog'
import { DispatchErrorDialog } from './DispatchErrorDialog'
import type { BoardHostForm } from '../launch/LaunchStates'

/** The locale seat shape this module's consumers pass through. */
export type DispatchTranslate = (key: WorkbenchKey) => string

/** The dispatch verb timeout budget (ui-design 性能预算: 派发 → 可交互 ≤3s). */
export const DISPATCH_BUDGET_MS = 3000

/** The human-dispatcher actor default (kernel audit string; 派发者). */
export const DISPATCH_ACTOR = 'workbench'

// ---------------------------------------------------------------------------
// The controller hook
// ---------------------------------------------------------------------------

/**
 * The machine + the async legs. Every action is idempotent under phase
 * guards (the reducer's own guards double-protect against double-fired
 * events); async settles carry a per-leg token so only the CURRENT leg can
 * commit (a timeout already moved the phase — the late resolution drops).
 */
export function useDispatchSelection(options: DispatchQueueOptions): DispatchSelectionController {
  const budgetMs = options.budgetMs ?? DISPATCH_BUDGET_MS
  const [snapshot, dispatchAction] = useReducer(dispatchSelectionReducer, INITIAL_DISPATCH_SELECTION)
  // Latest-snapshot ref: the async legs read pendingKeys/acknowledged at
  // fire time without stale-closure hazards. Same for the option legs the
  // async callbacks consume (verbs/onDispatched may be fresh per render).
  const stateRef = useRef(snapshot)
  stateRef.current = snapshot
  const legToken = useRef(0)
  const optionsRef = useRef(options)
  optionsRef.current = options

  /** The budget timer: a check/dispatch leg that outlives it fails to the error dialog. */
  useEffect(() => {
    if (!isDispatchBusy(snapshot.phase)) return
    const timer = setTimeout(() => {
      legToken.current += 1 // the in-flight leg is dead to us now
      dispatchAction({ type: 'flowFailed', error: { kind: 'timeout', message: '' } })
    }, budgetMs)
    return () => { clearTimeout(timer) }
  }, [snapshot.phase, budgetMs])

  return useMemo<DispatchSelectionController>(() => {
    /** Fold a verb rejection into the dialog's message (the envelope's own text). */
    const failureOf = (error: unknown): DispatchFlowError => {
      const normalized: WorkbenchVerbError = normalizeWorkbenchVerbError(error)
      return { kind: 'failed', message: `${normalized.message} (${normalized.code})` }
    }

    /** The deterministic pre-dispatch check — one call per DISTINCT feature of the batch (kernel parity: the kernel loop). */
    const runCheck = async (taskKeys: readonly string[]): Promise<void> => {
      const current = optionsRef.current
      const token = ++legToken.current
      const features = [...new Set(taskKeys.map(featureSlugOfTaskKey))]
      try {
        const reports = await Promise.all(
          features.map(featureSlug => current.verbs.checkStageArtifacts({
            projectId: current.projectId,
            featureSlug,
          })),
        )
        if (token !== legToken.current) return
        const missing: MissingItem[] = reports.flatMap(report => report.missing)
        dispatchAction({ type: 'checkResolved', missing })
      } catch (error) {
        if (token !== legToken.current) return
        dispatchAction({ type: 'flowFailed', error: failureOf(error) })
      }
    }

    /** The dispatch leg (acknowledge rides the warning door's decision). */
    const runDispatch = async (taskKeys: readonly string[], acknowledgeMissing: boolean): Promise<void> => {
      const current = optionsRef.current
      const token = ++legToken.current
      const input: DispatchTasksInput = acknowledgeMissing
        ? { projectId: current.projectId, taskKeys, acknowledgeMissing: true }
        : { projectId: current.projectId, taskKeys }
      try {
        const result = await current.verbs.dispatchTasks(input, current.actor ?? DISPATCH_ACTOR)
        if (token !== legToken.current) return
        if ('dispatched' in result) {
          const rows: readonly DispatchRow[] = result.dispatched
          dispatchAction({ type: 'dispatchResolved', count: rows.length })
          current.onDispatched?.(rows)
        } else {
          dispatchAction({ type: 'dispatchBlocked', missing: result.missing })
        }
      } catch (error) {
        if (token !== legToken.current) return
        dispatchAction({ type: 'flowFailed', error: failureOf(error) })
      }
    }

    const { entries } = options
    return {
      snapshot,
      entries,
      isSelected: (key: string): boolean => snapshot.selectedKeys.includes(key),
      isDisabled: (key: string): boolean => {
        const entry = entries.find(candidate => candidate.key === key)
        return entry === undefined || selectionDisabledReason(entry, entries) !== null
      },
      disabledReason: (key: string): WorkbenchKey | null => {
        const entry = entries.find(candidate => candidate.key === key)
        // An unknown key is never selectable (defensive: board data moved).
        return entry === undefined ? 'tasks.dispatch.disabled.terminal' : selectionDisabledReason(entry, entries)
      },
      enter: () => { dispatchAction({ type: 'enter' }) },
      exit: () => { dispatchAction({ type: 'exit' }) },
      toggle: (taskKey: string): void => {
        if (stateRef.current.phase !== 'selecting') return
        const entry = entries.find(candidate => candidate.key === taskKey)
        if (entry === undefined) return
        if (selectionDisabledReason(entry, entries) !== null) return
        dispatchAction({ type: 'toggle', key: taskKey })
      },
      requestDispatch: (): void => {
        const state = stateRef.current
        if (state.phase !== 'selecting' || state.selectedKeys.length === 0) return
        const keys = state.selectedKeys.slice()
        dispatchAction({ type: 'requestDispatch' })
        void runCheck(keys)
      },
      acknowledgeMissing: () => { dispatchAction({ type: 'acknowledgeMissing' }) },
      confirmDispatch: (): void => {
        const state = stateRef.current
        if (state.phase !== 'confirming') return
        dispatchAction({ type: 'confirmDispatch' })
        void runDispatch(state.pendingKeys, state.acknowledgedMissing)
      },
      cancelDialog: () => { dispatchAction({ type: 'cancelDialog' }) },
      retryDispatch: (): void => {
        const state = stateRef.current
        if (state.phase !== 'dispatch-error') return
        dispatchAction({ type: 'retryDispatch' })
        void runDispatch(state.pendingKeys, state.acknowledgedMissing)
      },
      closeError: () => { dispatchAction({ type: 'closeError' }) },
    }
  }, [snapshot, options])
}

// ---------------------------------------------------------------------------
// The card-level selection context + primitives
// ---------------------------------------------------------------------------

/**
 * What the card-level primitives consume. `active` covers every non-idle
 * phase (checkboxes stay visible behind the dialog masks — the board does
 * not visually reset mid-chain).
 */
export interface DispatchSelectionMode {
  readonly active: boolean
  /** A verb leg is in flight (checking/dispatching). */
  readonly busy: boolean
  readonly t: DispatchTranslate
  isSelected(taskKey: string): boolean
  isDisabled(taskKey: string): boolean
  /** The disabled reason's locale copy, or null when dispatchable (the tooltip). */
  disabledTitle(taskKey: string): string | null
  toggle(taskKey: string): void
  openDetail(taskKey: string): void
}

const DispatchSelectionContext = createContext<DispatchSelectionMode | null>(null)

/** The card-level consumption hook (primitives must mount inside the layer). */
export function useDispatchSelectionMode(): DispatchSelectionMode {
  const mode = useContext(DispatchSelectionContext)
  if (mode === null) {
    throw new Error('useDispatchSelectionMode requires an enclosing SelectionLayer')
  }
  return mode
}

const CHECK_SIZE = 28
const CHECK_RADIUS = 14
const LINK = 'var(--dsw-alias-link, rgb(65, 118, 230))'

/** The checkbox wrap positions: overlay (卡片左上覆盖) vs inline (列表行首内嵌). */
const overlayWrapStyle = {
  left: '8px',
  position: 'absolute',
  top: '8px',
  zIndex: 5,
} as const

const inlineWrapStyle = {
  display: 'inline-flex',
  flex: '0 0 auto',
} as const

/** The native input's own face (appearance-none; the check is the sibling glyph). */
function checkboxInputStyle(checked: boolean, focused: boolean): Record<string, string | number> {
  return {
    appearance: 'none',
    WebkitAppearance: 'none',
    background: checked ? LINK : 'transparent',
    border: `2px solid ${checked || focused ? LINK : 'var(--dsh-border-color, CanvasText)'}`,
    borderRadius: `${CHECK_RADIUS}px`,
    boxShadow: focused ? `0 0 0 2px ${LINK}` : 'none',
    cursor: 'pointer',
    height: `${CHECK_SIZE}px`,
    margin: '0',
    padding: '0',
    width: `${CHECK_SIZE}px`,
  }
}

const checkGlyphStyle = {
  alignItems: 'center',
  color: '#fff',
  display: 'flex',
  fontSize: '16px',
  fontWeight: 600,
  height: '100%',
  inset: '0',
  justifyContent: 'center',
  pointerEvents: 'none',
  position: 'absolute',
  width: '100%',
} as const

const detailJumpStyle = {
  alignItems: 'center',
  background: 'transparent',
  border: 'none',
  borderRadius: '14px',
  color: 'inherit',
  cursor: 'pointer',
  display: 'inline-flex',
  flex: '0 0 auto',
  font: 'inherit',
  fontSize: '14px',
  height: '28px',
  justifyContent: 'center',
  width: '28px',
} as const

/** Inputs of {@link SelectionCheckbox}. */
export interface SelectionCheckboxProps {
  /** The card's task key (the qualified board address). */
  readonly taskKey: string
  /** The task title — the checkbox's `aria-label` (Hard Rule: aria-label = 任务标题). */
  readonly title: string
  /** overlay = 卡片左上覆盖 (views A/B); inline = 列表行首内嵌 (view C). */
  readonly variant?: 'overlay' | 'inline'
}

/**
 * The checkbox primitive (the M3 先例外溢新增控件原语): NATIVE checkbox
 * semantics — real `input[type=checkbox]` with `checked` / `aria-label` =
 * task title — in the 28×28 r14 shell; focus ring 2px `--dsw-alias-link`;
 * checked = brand fill + white check (the ✓ glyph is decorative, aria-hidden
 * — the input carries the state). Self-hides outside selection mode; a
 * disabled face carries the reason as its tooltip. Its own clicks stop
 * propagation (the whole-surface toggle must not double-fire).
 */
export function SelectionCheckbox(props: SelectionCheckboxProps) {
  const mode = useDispatchSelectionMode()
  const [focused, setFocused] = useState(false)
  if (!mode.active) return null
  const checked = mode.isSelected(props.taskKey)
  const disabled = mode.isDisabled(props.taskKey)
  const tooltip = disabled ? (mode.disabledTitle(props.taskKey) ?? undefined) : undefined
  return (
    <span
      data-dsh-forge-select-chk={props.taskKey}
      data-dsh-forge-select-chk-state={checked ? 'checked' : 'unchecked'}
      style={props.variant === 'inline' ? inlineWrapStyle : overlayWrapStyle}
      onClick={(event) => { event.stopPropagation() }}
    >
      <span style={{ display: 'inline-flex', height: `${CHECK_SIZE}px`, position: 'relative', width: `${CHECK_SIZE}px` }}>
        <input
          type="checkbox"
          aria-label={props.title}
          checked={checked}
          disabled={disabled}
          title={tooltip}
          data-dsh-forge-select-chk-input=""
          style={checkboxInputStyle(checked, focused)}
          onFocus={() => { setFocused(true) }}
          onBlur={() => { setFocused(false) }}
          onChange={() => { mode.toggle(props.taskKey) }}
        />
        {checked && (
          <span aria-hidden="true" style={checkGlyphStyle}>
            <svg viewBox="0 0 16 16" width="16" height="16" focusable="false">
              <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}
      </span>
    </span>
  )
}

/**
 * The ⤢ detail jump (28×28 ghost, 仅选择模式显现, `aria-label` =
 * 打开任务详情): opens the UF3 side panel WITHOUT leaving selection mode
 * (ui-design 命中区域划分 — the card surface became the toggle, this is the
 * detail entry). Self-hides outside selection mode.
 */
export function DetailJumpButton(props: { readonly taskKey: string }) {
  const mode = useDispatchSelectionMode()
  if (!mode.active) return null
  return (
    <ChromeButton
      type="button"
      aria-label={mode.t('tasks.dispatch.detail')}
      title={mode.t('tasks.dispatch.detail')}
      data-dsh-forge-select-detail={props.taskKey}
      style={detailJumpStyle}
      onClick={(event) => {
        event.stopPropagation()
        mode.openDetail(props.taskKey)
      }}
    >
      <span aria-hidden="true">⤢</span>
    </ChromeButton>
  )
}

// ---------------------------------------------------------------------------
// The layer
// ---------------------------------------------------------------------------

/** Inputs of {@link SelectionLayer}. */
export interface SelectionLayerProps {
  /** The controller (the page's `useDispatchSelection` machine). */
  readonly controller: DispatchSelectionController
  /** The locale seat (the host's `t`). */
  readonly t: DispatchTranslate
  /**
   * The host's width breakpoint (M4 2.1 双宿主, threaded by TaskBoardPage):
   * rides through to the float bar's anchoring — 'window' (default) keeps the
   * M2/M3 window-fixed geometry; 'pane' anchors the bar inside the board's
   * own box.
   */
  readonly host?: BoardHostForm | undefined
  /** Open a task's detail (UF3 side panel) — selection mode STAYS active. */
  readonly onOpenDetail: (taskKey: string) => void
  /** The board views; cards carry `data-dsh-forge-select-card="<taskKey>"`. */
  readonly children: ReactNode
}

/** The card-addressing attribute the keyboard/click contract keys off. */
export const SELECT_CARD_ATTR = 'data-dsh-forge-select-card'

/**
 * The card-addressing selector UNION (task 3.9's board integration): the
 * 3.6 build attribute plus the M2 board's OWN card hooks — the view B card,
 * the view C row, and the view A DAG node wrapper (the lib keys them
 * `data-id`) — so the whole-surface toggle / keyboard contract addresses
 * every real board card with ZERO M2 view changes (the 3.6 hard rule: the
 * interaction rides this layer's capture/bubble handlers, never the cards).
 */
const CARD_SELECTOR = [
  `[${SELECT_CARD_ATTR}]`,
  '[data-dsh-forge-task-card]',
  '[data-dsh-forge-task-row]',
  '[data-dsh-forge-dep-tree] [data-id]',
].join(',')

/** A resolved card element's task key (whichever hook addressed it). */
function taskKeyOfCard(card: Element): string | null {
  if (card.hasAttribute(SELECT_CARD_ATTR)) return card.getAttribute(SELECT_CARD_ATTR)
  if (card.hasAttribute('data-dsh-forge-task-card')) return card.getAttribute('data-dsh-forge-task-card')
  if (card.hasAttribute('data-dsh-forge-task-row')) return card.getAttribute('data-dsh-forge-task-row')
  if (card.hasAttribute('data-id')) return card.getAttribute('data-id')
  return null
}

/** Click targets that keep their own meaning inside a card (checkbox, ⤢, caller-marked). */
const SELECT_INTERACTIVE_SELECTOR = [
  '[data-dsh-forge-select-chk]',
  '[data-dsh-forge-select-detail]',
  '[data-dsh-forge-select-skip]',
  '[data-dsh-forge-dispatch-float-bar]',
].join(',')

/** The visually-hidden live-region style (inline — no stylesheet pipeline). */
const visuallyHiddenStyle = {
  clipPath: 'inset(50%)',
  height: '1px',
  overflow: 'hidden',
  position: 'absolute',
  whiteSpace: 'nowrap',
  width: '1px',
} as const

/** Is an element reachable (not inside a hidden subtree — the jsdom-friendly visibility test). */
function isDomVisible(element: HTMLElement): boolean {
  return element.closest('[hidden]') === null
}

/** The nearest card element addressing `target`, if any. */
function cardOf(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null
  return target.closest(CARD_SELECTOR)
}

/** The structured outcome → locale copy (the aria-live leg). */
function announceTextOf(outcome: DispatchSelectionOutcome | null, t: DispatchTranslate): string {
  if (outcome === null) return ''
  if (outcome.type === 'entered') return t('tasks.dispatch.announce.entered')
  if (outcome.type === 'exited') return t('tasks.dispatch.announce.exited')
  return fillTemplate(t('tasks.dispatch.announce.dispatched'), { count: String(outcome.count) })
}

/**
 * The selection-mode wrapper. While `selecting` is live the CAPTURE-phase
 * keydown takes Space/Enter/arrows BEFORE any card-internal handler (the
 * explicit M2-semantics override — scope: selection mode only), the bubble
 * click turns a card's whole surface into the toggle (命中区域划分), and Esc
 * follows the layering table (dialogs consume their own Esc — the layer's
 * bubble leg only acts when NO dialog is open, so the event never
 * double-fires through to the exit).
 */
export function SelectionLayer(props: SelectionLayerProps) {
  const { controller, t } = props
  const { snapshot } = controller
  const active = snapshot.phase !== 'idle'
  const busy = isDispatchBusy(snapshot.phase)
  const prevPhaseRef = useRef(snapshot.phase)
  const floatGoRef = useRef<HTMLButtonElement | null>(null)

  // Focus return after a dialog closes (the dialog family's restore leg):
  // back on the float bar's dispatch button — the dialog chain's entry.
  useEffect(() => {
    const previous = prevPhaseRef.current
    prevPhaseRef.current = snapshot.phase
    if (
      (previous === 'warning' || previous === 'confirming' || previous === 'dispatch-error')
      && snapshot.phase === 'selecting'
    ) {
      floatGoRef.current?.focus()
    }
  }, [snapshot.phase])

  /** Space = 勾选, Enter = 详情, arrows = traverse — capture phase, selecting only. */
  const onKeyDownCapture = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (snapshot.phase !== 'selecting') return
    const card = cardOf(event.target)
    if (card === null) return
    const taskKey = taskKeyOfCard(card)
    if (taskKey === null || taskKey === '') return
    if (event.key === ' ') {
      event.preventDefault()
      event.stopPropagation()
      controller.toggle(taskKey)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      props.onOpenDetail(taskKey)
    } else if (
      event.key === 'ArrowLeft' || event.key === 'ArrowUp'
      || event.key === 'ArrowRight' || event.key === 'ArrowDown'
    ) {
      event.preventDefault()
      event.stopPropagation()
      const cards = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(CARD_SELECTOR))
        .filter(isDomVisible)
      const index = cards.indexOf(card)
      if (index === -1) return
      const step = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1
      cards[index + step]?.focus()
    }
  }

  /** Esc layering — the bubble leg; open dialogs already consumed their own Esc. */
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Escape') return
    if (escActionForPhase(snapshot.phase) === 'exit-selection') controller.exit()
  }

  /** Whole-surface click = toggle (选择模式 only; interactive children keep their own clicks). */
  const onClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
    if (snapshot.phase !== 'selecting') return
    if (event.target instanceof HTMLElement && event.target.closest(SELECT_INTERACTIVE_SELECTOR) !== null) return
    const card = cardOf(event.target)
    const taskKey = card === null ? null : taskKeyOfCard(card)
    if (taskKey !== null && taskKey !== undefined && taskKey !== '') controller.toggle(taskKey)
  }

  const mode = useMemo<DispatchSelectionMode>(() => ({
    active,
    busy,
    t,
    isSelected: controller.isSelected,
    isDisabled: controller.isDisabled,
    disabledTitle: (key: string): string | null => {
      const reason = controller.disabledReason(key)
      return reason === null ? null : t(reason)
    },
    toggle: controller.toggle,
    openDetail: props.onOpenDetail,
  }), [active, busy, t, controller, props.onOpenDetail])

  /** The confirming dialog's task list — pending keys resolved against the entries. */
  const confirmTasks = useMemo(
    () => snapshot.pendingKeys.map((key) => {
      const entry = controller.entries.find(candidate => candidate.key === key)
      return { key, title: entry?.title ?? key }
    }),
    [snapshot.pendingKeys, controller.entries],
  )

  return (
    <DispatchSelectionContext.Provider value={mode}>
      <div
        data-dsh-forge-selection-layer={active ? 'active' : 'inactive'}
        onKeyDownCapture={onKeyDownCapture}
        onKeyDown={onKeyDown}
        onClick={onClick}
      >
        {props.children}
        {active && (
          <SelectionFloatBar
            t={t}
            host={props.host}
            count={snapshot.selectedKeys.length}
            busy={busy}
            onGoButtonElement={(element) => { floatGoRef.current = element }}
            onCancel={() => { controller.exit() }}
            onDispatch={() => { controller.requestDispatch() }}
          />
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
            tasks={confirmTasks}
            onConfirm={() => { controller.confirmDispatch() }}
            onCancel={() => { controller.cancelDialog() }}
          />
        )}
        {snapshot.phase === 'dispatch-error' && snapshot.error !== null && (
          <DispatchErrorDialog
            t={t}
            error={snapshot.error}
            onRetry={() => { controller.retryDispatch() }}
            onClose={() => { controller.closeError() }}
          />
        )}
        <span role="status" aria-live="polite" data-dsh-forge-dispatch-announce="" style={visuallyHiddenStyle}>
          {announceTextOf(snapshot.outcome, t)}
        </span>
      </div>
    </DispatchSelectionContext.Provider>
  )
}

export { hasDispatchableEntry, selectionDisabledReason } from './selection-mode'
