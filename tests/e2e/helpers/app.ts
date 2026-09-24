// tests/e2e/helpers/app — M3 e2e 腿的应用启动器(任务 6.2 base).
//
// The M3 lane's `launchPluginShell` preset: the REAL apps/desktop shell over
// the REAL forge-workbench plugin (on-demand tarball pack — the exact bytes
// the stage channel ships), with the three base disciplines baked in:
//   ① isolated userData (Hard Rule — REQUIRED here, no default: the
//      workbench DB, plugin overlay and single-instance lock all pin to a
//      per-journey temp dir via DSH_FORGE_USER_DATA);
//   ② clean PATH by default (SC1's 干净环境 — user tool dirs stripped, so no
//      forge CLI can resolve inside the app; case-variant Path/PATHEXT keys
//      are normalized so the sanitized value wins under any lookup casing);
//   ③ the dispatch-stub env pair rides through `stubEnv` (tests/e2e/stubs/
//      dispatch.ts) — both host seams in one launch.
// The M2 plugin-journey stack (apps/desktop/e2e/helpers/plugins.ts) is reused
// verbatim underneath — this module only adds the M3 preset.

import { tmpdir } from 'node:os'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import {
  BASE_BUNDLES,
  FORGE_WORKBENCH,
  FORGE_WORKBENCH_STAGED_AT,
  forgeWorkbenchTarball,
  launchPluginShell,
  type BundleEntry,
  type PluginShell,
} from '../../../apps/desktop/e2e/helpers/plugins.ts'
import { cleanSystemPath } from '../fixtures/clean-env.ts'

/** The M3 leg bundle set: vendored closure base + the mandatory forge core. */
export function workbenchBundles(): BundleEntry[] {
  return [
    ...BASE_BUNDLES,
    { name: FORGE_WORKBENCH, source: `tarball:${FORGE_WORKBENCH_STAGED_AT}`, mandatory: true },
  ]
}

/** The staged tarball artifacts matching workbenchBundles(). */
export function workbenchTarballs(): Array<{ at: string; from: string }> {
  return [{ at: FORGE_WORKBENCH_STAGED_AT, from: forgeWorkbenchTarball() }]
}

export interface WorkbenchShellOptions {
  /** REQUIRED (Hard Rule): isolated per-journey userData temp dir. */
  readonly userDataDir: string
  /** The dispatch-stub env pair (createDispatchStub().env). */
  readonly stubEnv?: Record<string, string>
  /** Extra env after everything else (wins conflicts). */
  readonly env?: Record<string, string>
  /** Sanitize PATH (default true — SC1 干净环境; false keeps the ambient PATH). */
  readonly cleanPath?: boolean
  /** Persistent root for multi-boot legs (default: a fresh temp dir). */
  readonly rootDir?: string
  /** Working directory for the Electron main process. */
  readonly cwd?: string
}

/**
 * The canonical case-variant spellings of PATH/PATHEXT present in the base
 * env, all set to the SAME sanitized value — whichever casing the child (or
 * a grandchild shell) resolves, it reads the clean value.
 */
function pathOverrides(): Record<string, string> {
  const overrides: Record<string, string> = { PATH: cleanSystemPath() }
  if (process.platform === 'win32') {
    overrides.PATHEXT = '.COM;.EXE;.BAT;.CMD'
    for (const key of Object.keys(process.env)) {
      if (key !== 'PATH' && key.toUpperCase() === 'PATH') overrides[key] = cleanSystemPath()
      if (key !== 'PATHEXT' && key.toUpperCase() === 'PATHEXT') overrides[key] = '.COM;.EXE;.BAT;.CMD'
    }
  }
  return overrides
}

/**
 * Launch the real shell with the M3 preset. `packPlugin` demands a built
 * plugin tree — run `pnpm build:plugins` first when host sources changed.
 */
export async function launchWorkbenchShell(options: WorkbenchShellOptions): Promise<PluginShell> {
  return await launchPluginShell({
    bundles: workbenchBundles(),
    stageTarballs: workbenchTarballs(),
    userDataDir: options.userDataDir,
    rootDir: options.rootDir,
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    env: {
      ...(options.cleanPath === false ? {} : pathOverrides()),
      ...options.stubEnv,
      ...options.env,
    },
  })
}

/** A fresh per-journey userData temp dir (the isolation Hard Rule's face). */
export function freshUserDataDir(tag = 'dsh-forge-m3-e2e'): string {
  return join(mkdtempSync(join(tmpdir(), `${tag}-`)), 'user-data')
}
