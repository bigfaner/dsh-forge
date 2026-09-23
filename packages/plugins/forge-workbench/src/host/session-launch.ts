/**
 * The session-launch core, host half (task 4.2, tech-design Interface 2 +
 * Interface 5 as fixed by spike-1 §2). Pure logic — deliberately free of
 * decorators and cordis types so the whole surface is unit-testable from
 * source; the cordis service class that exposes it lives in
 * session-launch-rpc.ts.
 *
 * Channel (spike-1 §2.3, main channel adopted): the host half sits in the
 * SAME cordis app as the upstream `sessionController` (web-app bundle row),
 * so launch is two in-process calls —
 *
 *   create({ sessionId, cwd })   →  caller-minted id = idempotent adopt
 *   prompt({ requestId, sessionId, mode: 'queue', content })  →  the
 *                                  message becomes the session's persisted
 *                                  first user message (SC3 semantics)
 *
 * Degradation (Interface 5 chain): channel absent → ERR_HOST_NOT_READY (the
 * client entry then tries tier 2, `ctx.remote.session`); channel leg failed
 * or timed out → ERR_SESSION_CHANNEL_UNAVAILABLE (routes into the frozen
 * tier-3 fallback: clipboard + toast — NOT an error presentation). Neither
 * failure is ever swallowed (Hard Rule: 通道失败必须显式可见).
 *
 * The prompt is DATA end to end (Hard Rule): promptText is embedded verbatim
 * as message content, never parsed or executed; the only transformation is
 * the single FORGE_ACTOR attribution line APPENDED by actor-env.ts.
 */

import { createHash, randomUUID } from 'node:crypto'
import { composeFirstUserMessage, forgeActorValue } from './actor-env'
import type { SessionLaunchInput, SessionLaunchResult } from '../client/session-launch'

/**
 * Structural face of the upstream `sessionController` the launch needs
 * (re-declared here — no runtime import — mirroring the 4.1 CliEnv
 * precedent; the vendored service's create/prompt signatures are supersets
 * of these shapes, so the cast at the ctx seam is sound).
 */
export interface SessionChannel {
  create(request: { readonly sessionId?: string; readonly cwd?: string }): Promise<{ readonly sessionId: string }>
  prompt(request: {
    readonly requestId: string
    readonly sessionId: string
    readonly mode: 'queue'
    readonly content: readonly { readonly type: 'text'; readonly text: string }[]
  }): Promise<{ readonly accepted: true }>
}

export interface SessionLaunchDeps {
  /**
   * The DF004 main channel provider, resolved PER CALL (load-order tolerant:
   * the sessionController row may register after this plugin). undefined =
   * ERR_HOST_NOT_READY.
   */
  readonly getSessionChannel: () => SessionChannel | undefined
  /** Session-id mint (default: the upstream `session-<uuid>` shape). */
  readonly mintSessionId?: () => string
  /** Ceiling for each channel leg (default 10s; in-process legs are ms-scale — this is a hang guard, not the ≤3s UX budget). */
  readonly channelTimeoutMs?: number
}

/** Default per-leg channel ceiling (create and prompt are in-process ms-scale calls). */
export const SESSION_CHANNEL_TIMEOUT_MS = 10_000

/**
 * The deterministic prompt requestId: stable for the same (session, message)
 * pair, so replays of one launch never double-post the first user message —
 * the upstream `hasPromptRequest` short-circuit deduplicates on it
 * (spike-1 §2.1). Fresh sessions mint fresh ids, so distinct launches stay
 * distinct.
 */
export function deriveLaunchRequestId(sessionId: string, message: string): string {
  const digest = createHash('sha256').update(sessionId).update('\u0000').update(message).digest('hex')
  return `forge-launch-${digest.slice(0, 32)}`
}

/** The cordis-free service core (unit-tested directly; the rpc class delegates). */
export interface SessionLaunchCore {
  launch(input: SessionLaunchInput): Promise<SessionLaunchResult>
}

/** Marks a channel leg that exceeded its ceiling (classified as channel-unavailable). */
class ChannelTimeout extends Error {
  constructor(stage: 'create' | 'prompt', timeoutMs: number) {
    super(`session channel ${stage} did not answer within ${String(timeoutMs)}ms`)
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

export function createSessionLaunchCore(deps: SessionLaunchDeps): SessionLaunchCore {
  const mintSessionId = deps.mintSessionId ?? ((): string => `session-${randomUUID()}`)
  const channelTimeoutMs = deps.channelTimeoutMs ?? SESSION_CHANNEL_TIMEOUT_MS

  const fail = (
    reasonCode: 'ERR_HOST_NOT_READY' | 'ERR_SESSION_CHANNEL_UNAVAILABLE',
    detail: string,
    sessionId?: string,
  ): SessionLaunchResult => ({
    ok: false,
    reasonCode,
    detail,
    ...(sessionId === undefined || sessionId === '' ? {} : { sessionId }),
  })

  /** Race one channel leg against its ceiling (the timer never pins the host process). */
  const withCeiling = async <T>(stage: 'create' | 'prompt', run: () => Promise<T>): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const ceiling = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { reject(new ChannelTimeout(stage, channelTimeoutMs)) }, channelTimeoutMs)
      ;(timer as ReturnType<typeof setTimeout> & { unref?: () => void }).unref?.()
    })
    try {
      return await Promise.race([run(), ceiling])
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    async launch(input: SessionLaunchInput): Promise<SessionLaunchResult> {
      // Gate 1 — payload sanity (caller bugs are bad-request class, surfaced
      // as a rejection exactly like the upstream channel does; the 5.10 entry
      // validates before calling, so this never fires on the happy path).
      if (input.promptText === '') {
        throw new Error('session launch requires a non-empty promptText (getTaskPrompt output)')
      }
      if (input.cwd.trim() === '') {
        throw new Error('session launch requires a non-empty cwd (registered project codeRoot)')
      }

      // Gate 2 — the DF004 main channel (per-call resolution, load-order tolerant).
      const channel = deps.getSessionChannel()
      if (channel === undefined) {
        return fail(
          'ERR_HOST_NOT_READY',
          'the host context carries no sessionController (web-app bundle not loaded / profile without it) — the client entry should try the tier-2 remote channel',
        )
      }

      // Gate 3 — create/adopt the session with a caller-minted id.
      const requestedSessionId = input.sessionId?.trim() ?? ''
      const sessionId = requestedSessionId === '' ? mintSessionId() : requestedSessionId
      let created: string
      try {
        const value = await withCeiling('create', () => channel.create({ sessionId, cwd: input.cwd }))
        created = value.sessionId
      } catch (error) {
        return fail(
          'ERR_SESSION_CHANNEL_UNAVAILABLE',
          `session create failed: ${describeError(error)}`,
          sessionId,
        )
      }

      // Gate 4 — the first user message: verbatim prompt + the FORGE_ACTOR
      // attribution line, delivered queue-mode (persisted user message).
      const message = composeFirstUserMessage(input.promptText, forgeActorValue(created))
      try {
        await withCeiling('prompt', () => channel.prompt({
          requestId: deriveLaunchRequestId(created, message),
          sessionId: created,
          mode: 'queue',
          content: [{ type: 'text', text: message }],
        }))
      } catch (error) {
        return fail(
          'ERR_SESSION_CHANNEL_UNAVAILABLE',
          `session prompt failed: ${describeError(error)}`,
          created,
        )
      }

      return { ok: true, sessionId: created }
    },
  }
}
