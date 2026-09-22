/**
 * The cordis service face of the forge CLI bridge (task 4.1): a
 * TypertRemoteService under the `forgeBridge` service key/wire namespace. The
 * Gateway discovers every registered service carrying a `typertRemote`
 * binding (source-mode claims walk the whole app graph), so registering here
 * is what makes `ctx.remote.forgeBridge.*` routable from the browser half; no
 * upstream surface is touched. The client-side declaration lives at
 * src/client/services.ts; the logic lives in forge-bridge.ts (this file is
 * the thin rpc shell — decorator syntax confined here because the workspace's
 * test transform does not lower standard decorators; unit tests load this
 * face through the tsc-lowered build output).
 */

import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { createForgeBridgeCore, type ForgeBridgeCore, type ForgeBridgeDeps } from './forge-bridge'
import type { GetTaskPromptInput, GetTaskPromptResult, ResolveCliResult } from '../client/services'

/**
 * Methods are `@Remote`-marked, so the Gateway's source-mode discovery
 * exposes them as `forgeBridge/resolveCli` and `forgeBridge/getTaskPrompt` —
 * the endpoints the browser half invokes.
 */
export class ForgeBridgeService extends TypertRemoteService implements ForgeBridgeCore {
  private readonly core: ForgeBridgeCore

  constructor(ctx: Context, deps: ForgeBridgeDeps) {
    super(ctx, 'forgeBridge')
    this.core = createForgeBridgeCore(deps)
  }

  @Remote('resolveCli')
  resolveCli(): Promise<ResolveCliResult> {
    return this.core.resolveCli()
  }

  @Remote('getTaskPrompt')
  getTaskPrompt(input: GetTaskPromptInput): Promise<GetTaskPromptResult> {
    return this.core.getTaskPrompt(input)
  }
}
