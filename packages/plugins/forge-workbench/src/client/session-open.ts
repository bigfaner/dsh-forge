/**
 * The Interface 6 会话打开通道, client half (M4 task 2.7; tech-design
 * §Interfaces·Interface 6 — C2/C5 消费): the ONE navigation channel every
 * task→session jump rides, in three paths over the upstream public seams
 * only (声明合并纯增量, vendored untouched):
 *
 *   顶层     `openSessionTarget(sessionId)` — the SAME write path the M3
 *            session-handover seam rides (session-handover.ts: switch the
 *            view FIRST, then `ctx.uiWorkspace.openSession(id)` locates the
 *            session — openSession's replaceMain is itself a navigation, so
 *            the view-key machine must already say `session`);
 *   subagent `openSessionTarget(SubagentAddress)` — the SAME native API
 *            taking the address triple verbatim (the `mode` member IS the
 *            upstream SubagentListEntry.mode the 2.5 lineage hits carry);
 *   旁置     `openSessionTargetAside(address)` — the right-column pane form:
 *            `ctx.sidebarRight.openResource(subagentChatAddress(address),
 *            { preferNewPane: true })` (the ui-subagent `openChildAside`
 *            precedent verbatim — no view switch, the conversation stays).
 *
 * The M1 sessionFocus MAIN-process channel stays the frozen fallback: it is
 * NOT part of this channel or the M4 chain (tech-design Interface 6 口径).
 *
 * Error contract (2.6's toast rule, 打开失败不静默): the channel REJECTS on
 * an absent upstream service, a malformed target, or a throwing open — the
 * C5 LinkHistory seam catches the rejection and surfaces the open-failed
 * toast; the M3 handover's best-effort swallow (view landed, locating
 * degrades) stays that seam's own behavior, untouched.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { LineageSubagentAddress } from './lineage'
import { uiWorkspaceOf } from './session-handover'
import type { ViewSwitchController } from './nav/view-switch'

/** Interface 6's target union: a TOP session id, or a lineage hit's address triple. */
export type SessionOpenTarget = string | LineageSubagentAddress

/** The structured rejection prefix (surfaced by the C5 toast; never silent). */
export const SESSION_OPEN_ERROR = 'ERR_SESSION_OPEN_FAILED'

/** The one error shape the channel rejects with (code + reason). */
const openError = (reason: string): Error => new Error(`${SESSION_OPEN_ERROR}: ${reason}`)

/** The message of any thrown cause (best-effort string, never rethrown raw). */
const causeMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : 'open threw'

/**
 * Shape guard for the object arm: a target that is neither a string nor a
 * well-formed address triple is REJECTED before any upstream call (never
 * forward garbage across the service boundary).
 */
export function isSubagentAddressTarget(target: unknown): target is LineageSubagentAddress {
  if (typeof target !== 'object' || target === null) return false
  const candidate = target as Record<string, unknown>
  return typeof candidate.parentSessionId === 'string' && candidate.parentSessionId !== ''
    && typeof candidate.childSessionId === 'string' && candidate.childSessionId !== ''
    && (candidate.mode === 'one-shot' || candidate.mode === 'continuable')
}

/**
 * The ui-subagent sidebar-chat resource address (the STRUCTURAL TWIN of
 * ui-subagent's `subagentChatAddress` — that package is not a linked peer of
 * this plugin, so the format is mirrored here, documented against the
 * vendored source; drift surfaces as the pane failing to open, never a
 * crash): `dsh-resource://subagentchat/session/<child>?parent=<id>&mode=<mode>`.
 */
export const SUBAGENT_CHAT_ADDRESS_PREFIX = 'dsh-resource://subagentchat/session/'

/** Build the 旁置 pane's resource address for one address triple. */
export function subagentChatAddressOf(address: LineageSubagentAddress): string {
  const query = new URLSearchParams({ parent: address.parentSessionId, mode: address.mode })
  return `${SUBAGENT_CHAT_ADDRESS_PREFIX}${encodeURIComponent(address.childSessionId)}?${query}`
}

/**
 * The `ctx.sidebarRight` subset the 旁置 path needs (the guarded duck-read
 * discipline — an absent or drifted service degrades to a rejection, never
 * a throw, never a load gate).
 */
interface SidebarRightOpenFace {
  openResource(address: string, options?: { readonly kind?: string; readonly preferNewPane?: boolean }): void
}

function sidebarRightOf(ctx: ClientContext): SidebarRightOpenFace | undefined {
  let candidate: unknown
  try {
    candidate = ctx.get('sidebarRight', false)
  } catch {
    return undefined
  }
  if (candidate === null || typeof candidate !== 'object') return undefined
  const face = candidate as { openResource?: unknown }
  return typeof face.openResource === 'function'
    ? candidate as SidebarRightOpenFace
    : undefined
}

/** Interface 6's channel face (the seam C2/C5/C3 consume). */
export interface SessionOpenChannel {
  /**
   * 顶层/subagent 双通路: a string rides the session-focus path; an address
   * triple rides the same native openSession taking SubagentAddress. Both
   * switch the view FIRST (the handover discipline), then locate.
   */
  openSessionTarget(target: SessionOpenTarget): Promise<void>
  /**
   * 旁置 (右栏 pane): the subagent chat opens in a NEW rightbar pane — no
   * view switch, the conversation column is untouched.
   */
  openSessionTargetAside(address: LineageSubagentAddress): Promise<void>
}

/**
 * Assemble the channel (plugin-lifetime — the apply context outlives every
 * board round-trip, exactly like the hand-over seat).
 * @param ctx - client root context (the plugin's apply context).
 * @param controller - the shared view-switch controller (the top/subagent
 * paths' switch-first leg — the ONE write path's first half).
 * @returns the channel (pure navigation; rejects on failure, never throws
 * synchronously).
 */
export function createSessionOpenChannel(
  ctx: ClientContext,
  controller: ViewSwitchController,
): SessionOpenChannel {
  return {
    async openSessionTarget(target: SessionOpenTarget): Promise<void> {
      if (typeof target !== 'string' && !isSubagentAddressTarget(target)) {
        throw openError('malformed target')
      }
      const workspace = uiWorkspaceOf(ctx)
      if (workspace === undefined) throw openError('uiWorkspace unavailable')
      // 切会话视图 FIRST (the machine + its persistence), then locate — the
      // session-handover discipline, one write path.
      controller.switchSession()
      try {
        workspace.openSession(target)
      } catch (cause) {
        // A session the workspace store does not know makes retain throw —
        // the channel REJECTS so the C5 seam's toast fires (2.6's contract).
        throw openError(causeMessage(cause))
      }
    },
    async openSessionTargetAside(address: LineageSubagentAddress): Promise<void> {
      if (!isSubagentAddressTarget(address)) throw openError('malformed target')
      const sidebarRight = sidebarRightOf(ctx)
      if (sidebarRight === undefined) throw openError('sidebarRight unavailable')
      try {
        sidebarRight.openResource(subagentChatAddressOf(address), {
          kind: 'subagentchat',
          preferNewPane: true,
        })
      } catch (cause) {
        throw openError(causeMessage(cause))
      }
    },
  }
}
