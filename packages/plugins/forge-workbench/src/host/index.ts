/**
 * forge-workbench plugin, host half (dsh host process). Task 3.2 shipped this
 * scaffold deliberately EMPTY; task 4.1 filled the first face — the
 * ForgeBridge cordis service (forge CLI resolution + task-prompt retrieval,
 * Interface 2). Task 4.2 fills the second face — the SessionLaunch cordis
 * service (DF004 channel + FORGE_ACTOR passthrough, Interface 2/5/6). The
 * browser half ships via exports['./client'] and is discovered through the
 * package.json dsh.client declaration.
 *
 * Cross-process dependency seams (fail closed; the workbench data kernel is
 * the single source of truth, this process never keeps its own copy):
 *
 * - `DSH_FORGE_PROJECT_ROOTS` — the registered-project allowlist, a JSON
 *   array of normalized code_root strings, refreshed by the shell at host
 *   spawn from the workbench projects table (2.2 repos / 2.7 wiring task).
 *   Absent/invalid → empty allowlist → every spawn request is rejected
 *   (secure default; the UI degrades to "no prompt", never to an unguarded
 *   spawn).
 * - `DSH_FORGE_CLI_PATH` — the workbench 设置显式路径 override for the forge
 *   binary. Absent → the PATH chain applies.
 * - `DSH_FORGE_SESSION_STUB_DIR` — TEST-ONLY (task 6.1): when set, the
 *   session-launch channel is the file-backed e2e stub instead of the real
 *   upstream sessionController (control.json orchestration + journal.jsonl
 *   observation; see session-channel-stub.ts).
 *
 * Both names follow the host-spawn env precedent (DSH_FORGE_PRIMARY_RUNTIME).
 *
 * SessionLaunch needs NO shell-side env feed: its channel (the upstream
 * `sessionController`) lives in the SAME cordis app as this plugin (spike-1
 * §0: 插件 host 半身与宿主服务同进程同一 cordis 应用), resolved per call
 * (session-launch-rpc.sessionChannelOf) so the web-app bundle row may
 * register before or after this plugin. Absence is not an error — the
 * service answers ERR_HOST_NOT_READY and the client entry walks the
 * Interface 5 degradation chain (tier 2 ctx.remote.session → tier 3 frozen
 * fallback; those legs are 5.10/5.11 work).
 */

import type { Context } from '@deepseek-ai/cordis'
import { ForgeBridgeService } from './forge-bridge-rpc'
import { SessionLaunchService } from './session-launch-rpc'
import { createStubSessionChannel, resolveSessionStubDir } from './session-channel-stub'

const PROJECT_ROOTS_ENV = 'DSH_FORGE_PROJECT_ROOTS'
const CLI_PATH_ENV = 'DSH_FORGE_CLI_PATH'

/**
 * Parse the allowlist transport on each call (a small JSON array; prompt
 * requests are user-click-scale, so per-call parsing beats a cache that could
 * pin a stale list across tests/process-lifetime surprises). Invalid or absent
 * → empty list → fail closed.
 */
function registeredProjectRootsFromEnv(): readonly string[] {
  const raw = process.env[PROJECT_ROOTS_ENV]
  if (raw === undefined || raw.trim() === '') return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.every(entry => typeof entry === 'string')) {
      return parsed as readonly string[]
    }
  } catch {
    // fall through to the closed-list warning below
  }
  console.warn(`[forge-workbench] ${PROJECT_ROOTS_ENV} is not a JSON string array — allowlist stays closed`)
  return []
}

/**
 * Host plugin body: register the two remote services (service keys and wire
 * namespaces `forgeBridge` and `sessionLaunch`; the Gateway discovers the
 * bindings and routes `ctx.remote.forgeBridge.*` / `ctx.remote.sessionLaunch.*`
 * from the browser half).
 * @param ctx - host cordis context.
 */
export function apply(ctx: Context): void {
  new ForgeBridgeService(ctx, {
    listProjectRoots: registeredProjectRootsFromEnv,
    getCliPath: () => {
      const value = process.env[CLI_PATH_ENV]?.trim()
      return value === undefined || value === '' ? undefined : value
    },
  })
  // Task 6.1: the e2e session-channel stub seam. Unset (every production
  // boot) resolves the REAL upstream sessionController per call; a stub dir
  // swaps in the file-backed orchestration channel (see
  // session-channel-stub.ts for why an env seam is the only in-host
  // injection point — cordis provide() refuses duplicate service names).
  const sessionStubDir = resolveSessionStubDir()
  new SessionLaunchService(ctx, sessionStubDir === undefined
    ? undefined
    : { getSessionChannel: () => createStubSessionChannel(sessionStubDir) })
}
