/**
 * The session hand-over, client half (M3 task 6.1 — the surviving slice of
 * the retired M2 launch seat): 切会话视图 through the ONE write path (the
 * view-switch controller — Hard Rule: 不得旁路刷新/重载上游 SPA), then
 * `ctx.uiWorkspace.openSession(sessionId)` locates the session (spike-1
 * §2.2 — the M1 localStorage poke is boot-time only and stays retired).
 *
 * Consumers: the UF1 dispatch chain's 「进入会话」 jump (the orchestration
 * section + the detail dock's link history) threads this hand-over through
 * the shell's `launch` seat. The M2 「发起会话」 rpc members
 * (forgeBridge probe / sessionLaunch tier-1 / renderer tier-2 / clipboard
 * tier-3) were deleted with the ForgeBridge retirement — the presynthesized
 * dispatch chain owns session creation now, so the seat carries ONLY the
 * hand-over.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ViewSwitchController } from './nav/view-switch'

/** The hand-over seat the shell threads into the board (the launch seat's M3 form). */
export interface SessionHandover {
  /** 切会话视图 + session locating (best-effort openSession, guarded). */
  onLaunched(sessionId: string): void
}

/** The uiWorkspace read (spike-1 §2.2: openSession is the runtime session locator). */
function uiWorkspaceOf(ctx: ClientContext): { openSession(target: string): void } | undefined {
  let candidate: unknown
  try {
    candidate = ctx.get('uiWorkspace', false)
  } catch {
    return undefined
  }
  if (candidate === null || typeof candidate !== 'object') return undefined
  const face = candidate as { openSession?: unknown }
  return typeof face.openSession === 'function'
    ? candidate as { openSession(target: string): void }
    : undefined
}

/**
 * Assemble the hand-over (plugin-lifetime — ABOVE the shell — because the
 * board's round-trips unmount the shell in the slot path; the hand-over must
 * survive them).
 * @param ctx - client root context (the plugin's apply context).
 * @param controller - the shared view-switch controller (the success leg).
 * @returns the hand-over both navigation forms thread into the shell.
 */
export function createSessionHandover(ctx: ClientContext, controller: ViewSwitchController): SessionHandover {
  return {
    onLaunched(sessionId: string): void {
      // 切会话视图 FIRST (the machine + its persistence), then locate the
      // session inside the conversation — openSession's replaceMain is itself
      // a navigation, so the machine must already say `session`.
      controller.switchSession()
      // The locate leg is best-effort BY DESIGN (the guarded-read discipline):
      // a session the workspace store does not know — the e2e stub channel's
      // id, or a store-sync race in the real app — makes retain throw; the
      // view switch already landed, so the failure degrades to "located when
      // the store catches up" and must never surface as a renderer pageerror.
      try {
        uiWorkspaceOf(ctx)?.openSession(sessionId)
      } catch {
        // The session view is up; locating is an enhancement, not a guarantee.
      }
    },
  }
}
