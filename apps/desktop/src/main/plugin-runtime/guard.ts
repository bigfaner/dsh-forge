// plugin-runtime/guard — the single-write-path guard (task 3.1, tech-design
// §Interface 4 / SC6).
//
// The only runtime enable/disable write entry is the `workbench.
// setPluginEnabled` verb; this guard runs first on that path. Mandatory
// identity derives from the product manifest alone (G6: no second list) —
// disable requests for mandatory bundles are rejected with ERR_PLUGIN_MANDATORY
// + a structured log (defense layer 2 — UF6 renders no disable affordance for
// mandatory rows, but the guard does not depend on UI discipline).
//
// The interface + error type are the 2.7 seam contract (workbench/ipc/plugins.ts
// re-exports them); this module is the production implementation that replaced
// the 2.7 stub at the assembly seam.

import { shellLog } from '../log.ts'
import type { OverlayBundleRef } from './overlay.ts'

/** Structured log minimal face (test injection). */
export type PluginGuardLog = Pick<typeof shellLog, 'warn'>

/**
 * setPluginEnabled's single-write-path guard (2.7 seam contract, unchanged).
 * Implementations throw a code-carrying error (`ERR_PLUGIN_MANDATORY`) for
 * bundle names that must stay enabled; returning means the write may proceed.
 */
export interface PluginEnableGuard {
  assertCanBeDisabled(bundleName: string): void
}

/** Mandatory plugin disable request (defense layer 2; envelope mapping by `code`). */
export class PluginMandatoryError extends Error {
  readonly code = 'ERR_PLUGIN_MANDATORY'

  constructor(message: string) {
    super(message)
    this.name = 'PluginMandatoryError'
  }
}

/**
 * The production guard: mandatory names (derived from the product manifest,
 * the single source of truth) are rejected before any overlay write, with an
 * ERR_PLUGIN_MANDATORY log. Unknown names pass through — the verb face owns
 * that contract error after the guard.
 */
export function createPluginEnableGuard(
  loadBundles: () => readonly OverlayBundleRef[],
  log: PluginGuardLog = shellLog,
): PluginEnableGuard {
  return {
    assertCanBeDisabled(bundleName: string): void {
      const entry = loadBundles().find(bundle => bundle.name === bundleName)
      if (entry?.mandatory === true) {
        log.warn({
          code: 'ERR_PLUGIN_MANDATORY',
          message: 'disable request rejected — the bundle is mandatory in the product manifest',
          data: { bundle: bundleName },
        })
        throw new PluginMandatoryError(`plugin ${bundleName} is mandatory and cannot be disabled`)
      }
    },
  }
}
