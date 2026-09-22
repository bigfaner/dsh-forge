/**
 * The SessionLaunch remote face, client-side declaration (task 4.2,
 * tech-design Interface 2 + Interface 5 as fixed by spike-1 §2). PURE TYPES:
 * the browser half carries no runtime code for this service — every call
 * crosses the process boundary as a Typert remote invocation on the
 * `sessionLaunch` namespace (the host implementation lives at
 * src/host/session-launch.ts and imports these very shapes, so the two
 * halves cannot drift). The namespace mount for `ctx.remote.sessionLaunch`
 * is wired by the 5.10/5.11 entry tasks; this file is the declaration they
 * mount.
 *
 * Error convention (Interface 2 / Error Handling §Propagation): host-half
 * services return `reasonCode` — NOT the IPC `{code,message,detail}` envelope
 * and NOT thrown rejections. `ERR_SESSION_CHANNEL_UNAVAILABLE` is NOT an
 * error presentation: the client entry routes it into the Interface 5
 * degradation chain (tier 2 `ctx.remote.session`, then the frozen tier-3
 * fallback: clipboard + front window + toast — M1 session-focus form).
 */

/**
 * launch() input. `promptText` is the COMPLETE `forge prompt get-by-task-id`
 * stdout from ForgeBridgeService.getTaskPrompt (injected character-for-character,
 * plus the FORGE_ACTOR attribution line the host half appends). `cwd` is the
 * registered project codeRoot — the DF004 main channel creates the session
 * with it (spike-1 §2.1: cwd-only create is legal; Interface 2's body text
 * predates the spike fix that made the create cwd explicit). `title` is the
 * task title (display identity; upstream derives the session title from the
 * first prompt — spike-1 §2.4 — so the service carries it for logging/future
 * use, not for a rename call). `sessionId` is the optional retry identity: a
 * caller-minted id makes the launch replay-safe (upstream `create` adopts an
 * existing id; the prompt requestId is derived from the id + content, so the
 * tier-2 recovery and user retries never double-post the first message).
 */
export interface SessionLaunchInput {
  readonly promptText: string
  readonly title: string
  readonly cwd: string
  readonly sessionId?: string
}

/** launch() success: the session exists and the first user message is queued. */
export interface SessionLaunchOk {
  readonly ok: true
  readonly sessionId: string
}

/**
 * launch() failure. `ERR_HOST_NOT_READY` = the host context does not carry
 * the DF004 main channel (`sessionController` absent — the web-app bundle row
 * has not loaded, or the profile ships without it); the client entry should
 * try the tier-2 channel. `ERR_SESSION_CHANNEL_UNAVAILABLE` = the channel was
 * reachable but the create/prompt leg failed or timed out; the client entry
 * routes this into the frozen fallback chain (clipboard + toast), never a
 * silent failure. `sessionId` is present when the session was already created
 * before the failing leg — the recovery identity for a tier-2 retry (adopt +
 * re-prompt) or the fallback's manual guidance. `detail` always disambiguates
 * (upstream error text, timeout stage, or the absence reason).
 */
export interface SessionLaunchFailed {
  readonly ok: false
  readonly reasonCode: 'ERR_HOST_NOT_READY' | 'ERR_SESSION_CHANNEL_UNAVAILABLE'
  readonly detail: string
  readonly sessionId?: string
}

export type SessionLaunchResult = SessionLaunchOk | SessionLaunchFailed

/**
 * The remote namespace face served by the host half (implementation:
 * src/host/session-launch.ts, service key + wire namespace `sessionLaunch`).
 */
export interface SessionLaunchRemoteFace {
  launch(input: SessionLaunchInput): Promise<SessionLaunchResult>
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap {
    /** Session launch channel (task 4.2): `ctx.remote.sessionLaunch.*` after mount. */
    sessionLaunch: SessionLaunchRemoteFace
  }
}
