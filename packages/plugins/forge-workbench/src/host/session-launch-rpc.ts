/**
 * The cordis service face of the session launch (task 4.2): a
 * TypertRemoteService under the `sessionLaunch` service key/wire namespace.
 * Registering here is what makes `ctx.remote.sessionLaunch.*` routable from
 * the browser half; no upstream surface is touched. The client-side
 * declaration lives at src/client/session-launch.ts; the logic lives in
 * session-launch.ts (this file is the thin rpc shell — decorator syntax
 * confined here because the workspace's test transform does not lower
 * standard decorators; unit tests load this face through the tsc-lowered
 * build output).
 */

import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { createSessionLaunchCore, type SessionChannel, type SessionLaunchCore, type SessionLaunchDeps } from './session-launch'
import type { SessionLaunchInput, SessionLaunchResult } from '../client/session-launch'

/** The upstream host service key the DF004 main channel resolves through (vendored session-controller Context merge). */
const SESSION_CONTROLLER_KEY = 'sessionController'

/**
 * Resolve the DF004 main channel from a host context, PER CALL (the
 * web-app bundle's sessionController row may register after this plugin —
 * presence at launch time is what matters, not at plugin load). Structural
 * duck-typing keeps this package free of a vendored type dependency (4.1
 * precedent); the face check also tolerates a non-service value under the
 * key, which degrades to ERR_HOST_NOT_READY rather than a stray throw.
 */
export function sessionChannelOf(ctx: Context): SessionChannel | undefined {
  const candidate: unknown = (ctx as unknown as Record<string, unknown>)[SESSION_CONTROLLER_KEY]
  if (typeof candidate !== 'object' || candidate === null) return undefined
  const face = candidate as Partial<SessionChannel>
  return typeof face.create === 'function' && typeof face.prompt === 'function'
    ? candidate as SessionChannel
    : undefined
}

/**
 * Methods are `@Remote`-marked, so the Gateway's source-mode discovery
 * exposes them as `sessionLaunch/launch` — the endpoint the browser half
 * invokes after mounting the namespace (5.10/5.11 entry tasks).
 */
export class SessionLaunchService extends TypertRemoteService implements SessionLaunchCore {
  private readonly core: SessionLaunchCore

  constructor(ctx: Context, deps?: SessionLaunchDeps) {
    super(ctx, 'sessionLaunch')
    this.core = createSessionLaunchCore(
      deps ?? { getSessionChannel: () => sessionChannelOf(ctx) },
    )
  }

  @Remote('launch')
  launch(input: SessionLaunchInput): Promise<SessionLaunchResult> {
    return this.core.launch(input)
  }
}
