/**
 * forge-workbench plugin, host half (dsh host process). Task 3.2 shipped this
 * scaffold deliberately EMPTY; task 4.1 fills the first face — the ForgeBridge
 * cordis service (forge CLI resolution + task-prompt retrieval, Interface 2).
 * Session launch (DF004) and FORGE_ACTOR passthrough remain 4.2 work. The
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
 *
 * Both names follow the host-spawn env precedent (DSH_FORGE_PRIMARY_RUNTIME).
 */

import type { Context } from '@deepseek-ai/cordis'
import { ForgeBridgeService } from './forge-bridge-rpc'

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
 * Host plugin body: register the ForgeBridge remote service (service key and
 * wire namespace `forgeBridge`; the Gateway discovers the binding and routes
 * `ctx.remote.forgeBridge.*` from the browser half).
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
}
