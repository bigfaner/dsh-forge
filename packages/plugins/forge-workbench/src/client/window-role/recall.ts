/**
 * The C10 拆出/收回 actions + the MAIN window's window-changed reaction
 * (M4 task 4.3; tech-design §Interfaces·Interface 5 + ui-design §Component
 * C10「Interactions: [拆出为窗口]→建窗并移除主窗 pane;独立窗口 [收回]→回主窗
 * pane」):
 *
 *   拆出   `detach*ToWindow` — the [拆出为窗口] action body: ONE
 *          `windowOpenDetached({ projectId, view, target?, rect? })` call;
 *          the caller removes its pane ONLY on the resolved promise (a
 *          failed open keeps the pane — never a lost view);
 *   收回   `installWindowRecallSync` — the main window subscribes
 *          `window-changed` (the 4.2 fan-out) and restores the view the
 *          moment a `detached-closed` lands (不待重启 — the event, not a
 *          restart, drives the pane's return): board → the rightbar board
 *          pane (`openTab('board', { preferNewPane: true })`), conversation
 *          subagent target → the 2.7 旁置 pane (the SAME address + call
 *          shape), conversation sessionId → the Interface 6 one write path
 *          (`uiWorkspace.openSession`). OS close and [收回] share the
 *          main-side 'closed' funnel, so both paths land here identically.
 *
 * 窗口语义 (AC4): the sync keeps a client-side registry of the live
 * detached set (opened/closed events) — the source the delete flow's
 * 「该项目全部拆出窗口已关闭」toast counts, and the `markRemoved` pre-verb
 * mark that keeps a deleted project's closing windows from "returning"
 * panes for a project that no longer exists (the mark is set BEFORE the
 * verb, so the events can never race ahead of it).
 */
import { SUBAGENT_CHAT_ADDRESS_PREFIX, subagentChatAddressOf } from '../session-open'
import type { LineageSubagentAddress } from '../lineage'
import type { SessionTargetClient, WindowChangedEventClient, WindowVerbFaceClient } from './boot'
import { subagentTargetOf } from './boot'

/**
 * Parse a subagent-chat resource address back into its address triple (the
 * INVERSE of {@link subagentChatAddressOf} — the aside tab-menu origin reads
 * the tab's own contentId): `dsh-resource://subagentchat/session/<child>
 * ?parent=<id>&mode=<mode>`. Anything else answers undefined (the menu entry
 * renders for subagentchat tabs only).
 */
export function parseSubagentChatAddress(address: string): LineageSubagentAddress | undefined {
  if (!address.startsWith(SUBAGENT_CHAT_ADDRESS_PREFIX)) return undefined
  const queryStart = address.indexOf('?')
  const child = decodeURIComponent(
    queryStart === -1
      ? address.slice(SUBAGENT_CHAT_ADDRESS_PREFIX.length)
      : address.slice(SUBAGENT_CHAT_ADDRESS_PREFIX.length, queryStart),
  )
  if (child === '') return undefined
  const params = new URLSearchParams(queryStart === -1 ? '' : address.slice(queryStart + 1))
  const parent = params.get('parent')
  const mode = params.get('mode')
  if (parent === null || parent === '' || (mode !== 'one-shot' && mode !== 'continuable')) return undefined
  return { parentSessionId: parent, childSessionId: child, mode }
}

/** The optional replay rectangle (Interface 5's rect; the 4.5 layout-replay carrier). */
export interface OpenDetachedRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

function spreadRect(rect: OpenDetachedRect | undefined): { rect?: OpenDetachedRect } {
  return rect === undefined ? {} : { rect }
}

/**
 * [拆出为窗口] for a BOARD pane (AC1): open the detached window over the
 * verb face. The rect stays absent on this leg (first detach = the shell's
 * 960×640 default; the 4.5 layout replay is the rect's future carrier).
 * @returns whether the window opened (the caller removes its pane ONLY then).
 */
export function detachBoardToWindow(
  face: WindowVerbFaceClient,
  projectId: string,
  rect?: OpenDetachedRect,
): Promise<boolean> {
  return face.openDetached({ projectId, view: 'board', ...spreadRect(rect) })
    .then(() => true, () => false)
}

/**
 * [拆出为窗口] for a CONVERSATION target (the aside tab-menu origin): the
 * target rides the handshake — a subagent triple (the aside's lineage
 * address) or a top session id.
 * @returns whether the window opened (the caller removes its pane ONLY then).
 */
export function detachConversationToWindow(
  face: WindowVerbFaceClient,
  projectId: string,
  target: SessionTargetClient,
  rect?: OpenDetachedRect,
): Promise<boolean> {
  return face.openDetached({ projectId, view: 'conversation', target, ...spreadRect(rect) })
    .then(() => true, () => false)
}

/** The rightbar controller subset the recall restore needs (guarded faces satisfy this structurally). */
export interface RecallSidebarFace {
  openTab(kind: string, options?: { readonly preferNewPane?: boolean }): void
  openResource(address: string, options?: { readonly kind?: string; readonly preferNewPane?: boolean }): void
}

/** The conversation restore's openSession seam (Interface 6's one write path). */
export interface RecallSessionFace {
  openSession(sessionId: string): unknown
}

/** The pure restore's observed effect (the spec assertion surface). */
export interface PaneRestoreOutcome {
  /** Which leg fired ('board' | 'aside' | 'session' | 'none'). */
  readonly leg: 'board' | 'aside' | 'session' | 'none'
  /** True when a rightbar open was issued. */
  readonly paneOpened: boolean
}

/**
 * Restore a closed detached window's view into the MAIN window (AC3, pure —
 * the installer feeds it the live faces): board → the board pane; subagent
 * target → the 旁置 pane (the 2.7 address + call shape verbatim); sessionId
 * target → `openSession` (the conversation column itself). Absent faces
 * degrade to `none` — never a throw.
 */
export function restoreDetachedPane(
  event: WindowChangedEventClient,
  faces: { sidebarRight?: RecallSidebarFace | undefined; session?: RecallSessionFace | undefined },
): PaneRestoreOutcome {
  if (event.view === 'board') {
    try {
      faces.sidebarRight?.openTab('board', { preferNewPane: true })
      return { leg: 'board', paneOpened: faces.sidebarRight !== undefined }
    } catch {
      return { leg: 'none', paneOpened: false }
    }
  }
  const triple = subagentTargetOf(event.target)
  if (triple !== undefined) {
    try {
      faces.sidebarRight?.openResource(subagentChatAddressOf(triple), { kind: 'subagentchat', preferNewPane: true })
      return { leg: 'aside', paneOpened: faces.sidebarRight !== undefined }
    } catch {
      return { leg: 'none', paneOpened: false }
    }
  }
  if (event.target !== undefined && 'sessionId' in event.target) {
    try {
      faces.session?.openSession(event.target.sessionId)
      return { leg: 'session', paneOpened: false }
    } catch {
      return { leg: 'none', paneOpened: false }
    }
  }
  return { leg: 'none', paneOpened: false }
}

/** The recall-sync's public face (the delete flow's toast + removed marks ride it). */
export interface DetachedWindowRegistryFace {
  /** The live detached-window count of one project (the delete toast's number). */
  countFor(projectId: string): number
  /**
   * Mark a project as being REMOVED (set BEFORE the removeProject verb, so
   * the closing windows' events can never race the mark): its closing
   * windows do NOT restore panes.
   */
  markRemoved(projectId: string): void
}

/** The installer's inputs. */
export interface WindowRecallSyncOptions {
  /** The preload window verb face (the event subscription). */
  readonly face: WindowVerbFaceClient
  /** The lazy rightbar controller face (absent legs degrade, never throw). */
  readonly getSidebarRight: () => RecallSidebarFace | undefined
  /** The lazy openSession face (the conversation restore's write path). */
  readonly getOpenSession?: (() => RecallSessionFace | undefined) | undefined
}

/**
 * The main window's window-changed reaction (AC3/AC4): track the live
 * detached set, restore panes on `detached-closed` (不待重启), and skip the
 * closures a project removal caused (`markRemoved` — the delete flow's toast
 * note is the project seat's own surface; these windows must not "return"
 * panes for a project that no longer exists). [收回] and the OS title-bar
 * close land here identically (the main-side funnel's single 'closed'
 * terminal is the design, not a coincidence).
 * @returns the registry face + the disposer (both fields).
 */
export function installWindowRecallSync(options: WindowRecallSyncOptions): DetachedWindowRegistryFace & { dispose(): void } {
  const { face, getSidebarRight, getOpenSession } = options
  /** The live detached set, mirrored from the events (windowId → projectId). */
  const live = new Map<string, string>()
  /** Projects whose removal is in flight (or done) — their windows never restore. */
  const removedProjects = new Set<string>()
  const unsubscribe = face.onChanged((event) => {
    if (event.type === 'detached-opened') {
      live.set(event.windowId, event.projectId)
      return
    }
    live.delete(event.windowId)
    if (removedProjects.has(event.projectId)) {
      // The delete flow's own closures (4.2's recallProjectWindows hook): no
      // pane restores for a gone project — the toast rides the delete flow
      // itself (project-seat's removed-toast note, counted pre-verb).
      return
    }
    restoreDetachedPane(event, {
      sidebarRight: getSidebarRight(),
      ...getOpenSession === undefined ? {} : { session: getOpenSession() },
    })
  })
  return {
    countFor(projectId) {
      let count = 0
      for (const owner of live.values()) {
        if (owner === projectId) count += 1
      }
      return count
    },
    markRemoved(projectId) {
      removedProjects.add(projectId)
    },
    dispose() {
      unsubscribe()
    },
  }
}
