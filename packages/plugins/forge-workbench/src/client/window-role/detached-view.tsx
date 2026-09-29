/**
 * The C10 detached window's SINGLE-VIEW assembly (M4 task 4.3; ui-design
 * §Component C10 + page-map「拆出窗口」): what a renderer whose boot role is
 * `detached` mounts — and, as much the point, what it does NOT.
 *
 *   无工作台头    the window title「<项目名> · <视图名>」(the shell owns it,
 *                4.2's detached.ts) replaces the workbench header — no rail,
 *                no nav slots, no panel row register here;
 *   区导航不可用  the single view IS the window (board = the main panel; the
 *                conversation = the native panel the SPA already renders);
 *   单视图渲染    board → the 2.1 dual-host TasksView in its WINDOW form with
 *                `projectId` PINNED to the source project (不随主窗激活指针 —
 *                BIZ-002: a detached window is a derived display surface, not
 *                a second activation pointer; nothing here reads one);
 *                conversation → 原生 conversation + `openSession(target)`
 *                (Interface 6's ONE write path, the session-handover seam).
 *
 * 收回 semantics live on BOTH closing paths ([收回] here, the OS title bar
 * main-side): the button rides the shell's `windowRecall` verb — the main
 * process funnels OS close and recall into the same 'closed' terminal (4.2's
 * detached.ts), so the pane's return to the main window (recall.ts) needs no
 * renderer cooperation from this window.
 */
import type { ReactNode } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { ChromeButton } from '../components/chrome/ChromeButton'
import { TasksView } from '../views/tasks/TasksView'
import { CONVERSATION_HEADER_UTILITIES_SLOT } from '../views/rightbar/SplitControls'
import type { ConversationHeaderUtilitiesZone } from '../views/rightbar/SplitControls'
import { MAIN_SLOT, NS } from '../contract'
import type { WorkbenchKey } from '../locale/en'
import type { LineageSubagentAddress } from '../lineage'
import { subagentTargetOf } from './boot'
import type { DetachedWindowRole, WindowVerbFaceClient } from './boot'

/** The translate seat the detached assembly reads (the plugin's own `t`). */
export type DetachedViewTranslate = (key: WorkbenchKey) => string

/** The detached board's `main`-slot panel id (a FRESH key — no shipped occupant owns it). */
export const DETACHED_PANEL_ID = 'forge-detached' as MainPanelId

/** The [收回] bar's height (the pane 头 h32 form — a window control bar, not a workbench header). */
const DETACHED_BAR_STYLE = {
  alignItems: 'center',
  borderBottom: '0.5px solid var(--dsw-alias-border-l3, rgba(128, 128, 128, 0.35))',
  display: 'flex',
  gap: '8px',
  height: '32px',
  minHeight: '32px',
  padding: '0 4px 0 12px',
} as const

/** The bar's 区名 (the window's view name; the OS title carries the full form). */
const DETACHED_REGION_STYLE = {
  color: 'var(--dsw-alias-label-secondary, rgb(97, 102, 107))',
  flex: '1 1 auto',
  fontSize: '12px',
  lineHeight: '18px',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

/** The bar's sm ghost button (the pane 头's twin form). */
const recallButtonStyle = {
  alignItems: 'center',
  background: 'transparent',
  border: 'none',
  borderRadius: '14px',
  color: 'inherit',
  cursor: 'pointer',
  display: 'flex',
  flex: '0 0 auto',
  font: 'inherit',
  fontSize: '12px',
  height: '24px',
  lineHeight: '18px',
  padding: '0 8px',
} as const

/** The detached board panel's props (the keyed `main` registration's inject product). */
export interface DetachedBoardPanelProps {
  /** The plugin locale seat. */
  readonly t: DetachedViewTranslate
  /** The boot handshake's role — the board's ONLY project source (pinned). */
  readonly role: DetachedWindowRole
  /** The [收回] commit (the installer hands the recall verb; never a throw). */
  readonly onRecall: () => void
}

/**
 * The detached BOARD view (AC1: board 视图 = TasksView 绑定来源项目): the
 * h32 [收回] bar over the 2.1 dual-host TasksView in its WINDOW form —
 * `host='window'` (the M2/M3 geometry verbatim) and `projectId` pinned to
 * the source project. The view re-keys NEVER (a main-window activation
 * change is not this board's concern — 绑定来源项目).
 * @returns the panel.
 */
export function DetachedBoardPanel({ t, role, onRecall }: DetachedBoardPanelProps): ReactNode {
  const regionName = t('rightbar.split.pane.board')
  return (
    <div
      data-dsh-forge-detached-board=""
      data-dsh-forge-detached-project={role.projectId}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}
    >
      <div data-dsh-forge-detached-bar="" style={DETACHED_BAR_STYLE} role="group" aria-label={regionName}>
        <span style={DETACHED_REGION_STYLE} title={regionName}>{regionName}</span>
        <ChromeButton
          type="button"
          data-dsh-forge-detached-recall=""
          aria-label={t('window.detached.recall')}
          title={t('window.detached.recall')}
          style={recallButtonStyle}
          onClick={onRecall}
        >
          {t('window.detached.recall')}
        </ChromeButton>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0 }}>
        <TasksView t={t} host="window" projectId={role.projectId} />
      </div>
    </div>
  )
}

/** The conversation leg's minimal openSession seam (Interface 6's one write path). */
export interface DetachedSessionOpenFace {
  openSession(target: string | LineageSubagentAddress): unknown
}

/** The utilities-row [收回] entry's composed props (the mirrored marker owner + the face). */
export type DetachedRecallSeatProps =
  & ConversationHeaderUtilitiesZone
  & InjectFace<{ t: DetachedViewTranslate; onRecall: () => void }>

/**
 * The [收回] control the detached CONVERSATION window carries: ONE list
 * entry on the conversation header's utilities row (the 4.4 seat — the
 * native header is the window's own chrome, the entry is append-only). The
 * OS title-bar close stays the guaranteed path when no session body renders
 * (the utilities row's own phase rule).
 * @returns the control.
 */
export function DetachedRecallSeat({ t, onRecall }: DetachedRecallSeatProps): ReactNode {
  return (
    <ChromeButton
      type="button"
      data-dsh-forge-detached-recall=""
      aria-label={t('window.detached.recall')}
      title={t('window.detached.recall')}
      style={recallButtonStyle}
      onClick={onRecall}
    >
      {t('window.detached.recall')}
    </ChromeButton>
  )
}

/** The utilities entry's list id (beside the 4.4 split control's). */
export const DETACHED_RECALL_ID = 'forge-detached-recall'

/** The utilities entry's order (after the split control's ascending run). */
export const DETACHED_RECALL_ORDER = 200

/** The availability poll's cadence/ceiling (the approval-answer relay precedent). */
export const DETACHED_POLL_MS = 250
export const DETACHED_POLL_CEILING_MS = 60_000

/**
 * The presentation re-assert ladder (4.6 SC4 e2e finding — the boot-bounce
 * tolerance): the upstream home session list's hydration navigation ends in
 * `selectPanel(null)` SECONDS after boot and wipes a presentation issued too
 * early (the sc1 escape-door lesson — same race, same cure). Each rung
 * re-issues the IDEMPOTENT select on a decaying cadence; the ladder is
 * bounded and cannot fight user intent (the detached window carries no
 * navigation surface by construction — nothing but the bounce ever deselects
 * its panel).
 */
export const DETACHED_PRESENT_LADDER_MS: readonly number[] = [1_000, 1_000, 2_000, 3_000]

/** The installer's inputs. */
export interface DetachedWindowOptions {
  /** The plugin locale seat. */
  readonly t: DetachedViewTranslate
  /** The boot handshake's detached role. */
  readonly role: DetachedWindowRole
  /** The preload window verb face (the [收回] verb). */
  readonly face: WindowVerbFaceClient
  /** The conversation leg's lazy openSession seam (absent = the open degrades silently). */
  readonly getOpenSession?: (() => DetachedSessionOpenFace | undefined) | undefined
}

/**
 * Bounded availability poll (250ms cadence, 60s ceiling — the bounded-poll
 * precedent): fires `act` with the first live read, stops on the first hit,
 * the ceiling, or the returned disposer.
 */
function pollUntil<T>(live: () => T | undefined, act: (value: T) => void): () => void {
  let stopped = false
  const immediate = live()
  if (immediate !== undefined) {
    act(immediate)
    return () => { stopped = true }
  }
  const startedAt = Date.now()
  const timer = setInterval(() => {
    if (stopped) return
    const value = live()
    if (value !== undefined || Date.now() - startedAt > DETACHED_POLL_CEILING_MS) {
      clearInterval(timer)
      if (value !== undefined) act(value)
      return
    }
  }, DETACHED_POLL_MS)
  return () => {
    stopped = true
    clearInterval(timer)
  }
}

/**
 * Issue one panel presentation AND keep re-asserting it across the boot
 * bounce ({@link DETACHED_PRESENT_LADDER_MS}): each rung re-issues the
 * idempotent select; a rung that throws (a torn-down layout mid-boot) ends
 * that rung quietly. @returns the ladder's disposer.
 */
function presentPanelAcrossBounce(present: () => void): () => void {
  present()
  const rungs = DETACHED_PRESENT_LADDER_MS.map(delay =>
    setTimeout(() => {
      try {
        present()
      } catch {
        // A torn-down layout mid-boot — later rungs may still land; the
        // window keeps its fallback view if none does.
      }
    }, delay),
  )
  return () => { for (const rung of rungs) clearTimeout(rung) }
}

/**
 * Install the detached window's whole client face (AC2's detached arm):
 * the board takes the `main` keyed slot with a FRESH panel id and presents
 * itself once the layout service is live; the conversation adds only the
 * utilities-row [收回] entry and drives the ONE `openSession(target)` write
 * (bounded poll on the late-booting upstream service). NOTHING else
 * registers — the workbench seats are main-window-only by construction
 * (boot.ts routes them away).
 * @param ctx - client root context.
 * @param options - the locale seat + the handshake role + the verb face.
 * @returns disposer removing every registration this window made.
 */
export function installDetachedWindow(ctx: ClientContext, options: DetachedWindowOptions): () => void {
  const { t, role, face } = options
  const onRecall = (): void => {
    // OS title-bar close ≡ [收回] (the main-side 'close'→'closed' funnel owns
    // the equivalence); a rejection here (window already gone) is inert.
    void face.recall(role.windowId).catch(() => {})
  }

  if (role.view === 'board') {
    let disposeLadder: (() => void) | undefined
    const disposeBoard = ctx.slots.inject(MAIN_SLOT, () => {
      const dispose = ctx.slots.register({
        name: MAIN_SLOT,
        key: DETACHED_PANEL_ID,
        locale: NS,
        inject: (): DetachedBoardPanelProps => ({ t, role, onRecall }),
        registrant: 'forge-workbench: detached board window',
      }, DetachedBoardPanel)
      // Present the panel once the layout service is live (it registers
      // during the native boot — earlier selects would throw on the
      // unregistered key; the bounded poll retires the race), AND keep
      // re-asserting across the boot bounce (the home session list's
      // hydration selectPanel(null) — the sc1 escape-door lesson, 4.6's
      // SC4 e2e finding).
      const disposePoll = pollUntil(() => {
        try {
          return ctx.get('layout', false) as { selectPanel(id: MainPanelId | null): void } | undefined
        } catch {
          return undefined
        }
      }, (layout) => {
        disposeLadder = presentPanelAcrossBounce(() => {
          try {
            layout.selectPanel(DETACHED_PANEL_ID)
          } catch {
            // A torn-down layout mid-boot — the window keeps its fallback view.
          }
        })
      })
      return () => {
        disposeLadder?.()
        disposeLadder = undefined
        disposePoll()
        dispose()
      }
    })
    return () => { disposeBoard() }
  }

  // conversation: 原生 conversation + openSession(target) — the ONE write
  // path over the late-booting uiWorkspace service; a dead session id (the
  // open throws) leaves the native empty conversation, never a crash.
  const disposers: (() => void)[] = []
  disposers.push(ctx.slots.inject(CONVERSATION_HEADER_UTILITIES_SLOT, () => {
    const dispose = ctx.slots.register({
      name: CONVERSATION_HEADER_UTILITIES_SLOT,
      id: DETACHED_RECALL_ID,
      order: DETACHED_RECALL_ORDER,
      registrant: 'forge-workbench: detached conversation recall',
      inject: (): { t: DetachedViewTranslate; onRecall: () => void } => ({ t, onRecall }),
    }, DetachedRecallSeat)
    return () => { dispose() }
  }))
  if (options.getOpenSession !== undefined) {
    const target = role.target
    disposers.push(pollUntil(options.getOpenSession, (opener) => {
      try {
        if (target === undefined) return
        opener.openSession(subagentTargetOf(target) ?? (target as { sessionId: string }).sessionId)
      } catch {
        // A session the workspace store does not know (deleted mid-flight):
        // the native empty conversation stays — the OS close recalls the window.
      }
    }))
  }
  return () => { for (const dispose of disposers.reverse()) dispose() }
}
