// tests/e2e/fixtures/clean-env — 干净环境 fixture(任务 6.2 base;SC1 的环境半).
//
// SC1 asserts the WHOLE chain runs with forge CLI calls = 0 — the honest form
// of that assertion starts from an environment where the CLI cannot even be
// RESOLVED: a sanitized PATH (system dirs only — never user tool dirs where a
// dev machine's `forge` lives) carried into the Electron child env, plus a
// process probe the legs assert with (before launch) so the cleanliness is
// evidence, not an assumption.
//
// Probe faces (win32 + posix):
//   - bare-name spawns for every PATHEXT-relevant form (`forge`, `forge.exe`,
//     `forge.cmd`, `forge.bat` on win32; `forge` on posix) WITHOUT a shell —
//     the resolver contract only ever spawns native executables
//     (TECH-host-002), so a .cmd EINVAL is exactly the production reachability
//     face and counts as unreachable;
//   - a SHELL probe (`forge --version` through cmd.exe / sh) — the strongest
//     form: PATH + PATHEXT resolution the way a terminal would see it;
//   - a negative-control helper (`fakeForgeControlEnv`) that plants a forge
//     shim in a temp dir and proves the probe DOES find one — the probe is
//     not vacuously failing (the AC-1 断言用例).
//
// Env normalization detail (win32): `{...process.env}` can carry a
// case-variant `Path`/`PATH` pair; the sanitized env keeps exactly one
// canonical `PATH` (+ one `PATHEXT`) so the child's resolution reads the
// sanitized value regardless of lookup casing.

import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Windows system dirs that are safe by construction (no user tooling). */
function windowsSystemPath(): string {
  const root = process.env.SystemRoot ?? process.env.WINDIR ?? 'C:\\Windows'
  return [join(root, 'System32'), root, join(root, 'System32', 'Wbem'), join(root, 'System32', 'WindowsPowerShell', 'v1.0')].join(';')
}

/** POSIX essentials only — user bins (~/.local/bin, /usr/local/bin, ~/go/bin) excluded. */
const POSIX_SYSTEM_PATH = '/usr/bin:/bin'

/** The sanitized PATH for the platform. */
export function cleanSystemPath(): string {
  return process.platform === 'win32' ? windowsSystemPath() : POSIX_SYSTEM_PATH
}

/**
 * A child-process env with the sanitized PATH (one canonical key — win32
 * case-variants of PATH/PATHEXT are dropped, then set once). Everything
 * else rides through from the base env.
 */
export function cleanEnv(base: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(base)) {
    if (key === 'PATH' || key === 'Path' || key === 'path' || key === 'PATHEXT' || key === 'PathExt') continue
    if (value !== undefined) env[key] = value
  }
  env.PATH = cleanSystemPath()
  if (process.platform === 'win32') env.PATHEXT = '.COM;.EXE;.BAT;.CMD'
  return env
}

/** The bare-name probe set for the platform (no shell — the resolver's face). */
export function forgeProbeNames(): readonly string[] {
  return process.platform === 'win32' ? ['forge', 'forge.exe', 'forge.cmd', 'forge.bat'] : ['forge']
}

/** One probe row: how a given name resolved under the given env. */
export interface ForgeProbeResult {
  readonly name: string
  readonly shell: boolean
  /** true = the spawn RESOLVED an executable (error === undefined). */
  readonly reachable: boolean
  readonly code?: string
}

function probeOne(env: Record<string, string>, name: string, shell: boolean): ForgeProbeResult {
  const spawned = spawnSync(shell ? `${name} --version` : name, shell ? [] : ['--version'], {
    env,
    shell,
    windowsHide: true,
    timeout: 5_000,
    encoding: 'utf8',
  })
  if (spawned.error !== undefined) {
    return { name, shell, reachable: false, code: String((spawned.error as NodeJS.ErrnoException).code ?? 'unknown') }
  }
  // The process SPAWNED (error === undefined). For the shell face that only
  // means cmd/sh started — the command inside was found iff it succeeded
  // (both shells exit non-zero on not-found: cmd 1, sh 127). A bare-name
  // spawn resolving means the executable itself was found regardless of its
  // exit status.
  return { name, shell, reachable: shell ? spawned.status === 0 : true, code: spawned.status === null ? 'no-status' : undefined }
}

/**
 * Probe every resolution face of `forge` under the given env (bare names +
 * the shell form). The AC-1 process probe — the caller asserts `reachable`
 * is false on every row for the clean env.
 */
export function probeForgeCli(env: Record<string, string>): ForgeProbeResult[] {
  const rows = forgeProbeNames().map(name => probeOne(env, name, false))
  rows.push(probeOne(env, 'forge', true))
  return rows
}

/**
 * Assert the forge CLI is unreachable under the given env — every probe face
 * fails to resolve. Throws listing the reachable faces (fail-fast evidence).
 */
export function assertForgeCliUnavailable(env: Record<string, string>, label = 'clean env'): void {
  const reachable = probeForgeCli(env).filter(row => row.reachable)
  if (reachable.length > 0) {
    throw new Error(
      `[${label}] forge CLI resolved where it must be unreachable: ${reachable.map(row => `${row.name}${row.shell ? ' (shell)' : ''} → ${row.code ?? 'spawned'}`).join(', ')}`,
    )
  }
}

/**
 * Negative control (the 断言用例 the probe is not vacuous): plant a working
 * `forge` shim in `dir` and return an env whose PATH sees it. `assertForgeCli
 * Unavailable` against this env MUST throw — the unit selfcheck asserts that.
 */
export function fakeForgeControlEnv(dir: string): Record<string, string> {
  mkdirSync(dir, { recursive: true })
  if (process.platform === 'win32') {
    // A copy of the running node.exe renamed forge.exe is a fully functional
    // runtime under any name (the M2 stub-CLI trick); plus a .cmd shim for
    // the shell face.
    copyFileSync(process.execPath, join(dir, 'forge.exe'))
    writeFileSync(join(dir, 'forge.cmd'), '@echo off\r\nexit /b 0\r\n')
    return { ...cleanEnv(), PATH: `${dir};${cleanSystemPath()}` }
  }
  const script = join(dir, 'forge')
  writeFileSync(script, '#!/bin/sh\nexit 0\n', { mode: 0o755 })
  return { ...cleanEnv(), PATH: `${dir}:${POSIX_SYSTEM_PATH}` }
}

/** A fresh temp home for a control shim (caller-owned; rm after the test). */
export function controlDir(tag = 'dsh-forge-cleanenv-ctl'): string {
  return join(tmpdir(), `${tag}-${String(process.pid)}-${String(Date.now().toString(36))}`)
}
