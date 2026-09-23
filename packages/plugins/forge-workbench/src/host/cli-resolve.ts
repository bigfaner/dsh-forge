/**
 * forge CLI resolution + bounded child-process capture (task 4.1, DF001).
 *
 * Resolution chain (tech-design §Dependencies): workbench-configured explicit
 * path → PATH lookup → `ERR_FORGE_CLI_UNAVAILABLE` carrying the diagnostics of
 * every attempted stage. Version evidence comes from `forge version` — the
 * live v5.21 CLI has no `--version` flag (`unknown flag`, exit 1); the
 * subcommand prints `VERSION: <semver>` on stdout, exit 0.
 *
 * T2 discipline (Hard Rule): everything spawns as an argument array with the
 * shell OFF; script shims (`forge.cmd`/`.bat`/`.ps1`, the npm-on-Windows
 * form) are deliberately NOT executable candidates because running them
 * requires cmd.exe interpretation — a shell. The forge CLI ships as a native
 * executable (`forge.exe`), so the real distribution is covered and every
 * output is bounded (size caps, timeout with child termination).
 */

import { spawn } from 'node:child_process'
import { accessSync, constants as fsConstants, statSync } from 'node:fs'
import { delimiter, isAbsolute, join } from 'node:path'

/**
 * Injectable spawn face. `args` is ALWAYS a readonly array — the one and only
 * argument form this module ever uses (unit tests stub it; the default runs
 * the real node:child_process.spawn with stdio pipes and the shell off).
 */
export type CliSpawnFn = (
  command: string,
  args: readonly string[],
  options: { cwd?: string; windowsHide: boolean },
) => CliChildProcess

/** The child-process surface the bounded capture consumes. */
export interface CliChildProcess {
  stdout: { on(event: 'data', listener: (chunk: Buffer) => void): unknown } | null
  stderr: { on(event: 'data', listener: (chunk: Buffer) => void): unknown } | null
  on(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown
  on(event: 'error', listener: (error: Error) => void): unknown
  kill(signal?: NodeJS.Signals): boolean
}

const defaultSpawn: CliSpawnFn = (command, args, options) =>
  spawn(command, [...args], { ...options, stdio: ['ignore', 'pipe', 'pipe'] }) as unknown as CliChildProcess

/** Default file-existence probe: a regular file, executable (X_OK off win32). */
function defaultFileExists(candidate: string): boolean {
  try {
    if (!statSync(candidate).isFile()) return false
    if (process.platform === 'win32') return true
    accessSync(candidate, fsConstants.X_OK)
    return true
  } catch {
    return false
  }
}

export interface BoundedRunRequest {
  readonly command: string
  readonly args: readonly string[]
  readonly cwd?: string
  readonly timeoutMs: number
  readonly maxStdoutBytes: number
  readonly maxStderrBytes: number
  readonly spawnFn?: CliSpawnFn
}

export interface BoundedRunResult {
  /** spawn itself failed (ENOENT/EACCES/…): no child ever ran. */
  readonly spawnError?: Error
  /** Child's own exit code (null when we killed it or it died by signal). */
  readonly code: number | null
  readonly signal: NodeJS.Signals | null
  /** Captured stdout (utf8; truncated at the cap when `stdoutOverflowed`). */
  readonly stdout: string
  readonly stderr: string
  readonly timedOut: boolean
  /** stdout crossed its cap (child terminated at the cap). */
  readonly stdoutOverflowed: boolean
  /** stderr crossed its cap (child terminated at the cap). */
  readonly stderrOverflowed: boolean
}

/**
 * Run one command as an argument array and capture bounded output. On timeout
 * or output-cap breach the child is terminated and the run settles
 * immediately (the later OS `close` is absorbed by the settle guard).
 */
export function runBoundedCapture(request: BoundedRunRequest): Promise<BoundedRunResult> {
  const spawnFn = request.spawnFn ?? defaultSpawn
  return new Promise((resolve) => {
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    const stdoutCounter = { bytes: 0 }
    const stderrCounter = { bytes: 0 }
    let stdoutOverflowed = false
    let stderrOverflowed = false
    let timedOut = false
    let settled = false
    let child: CliChildProcess
    let timer: ReturnType<typeof setTimeout> | undefined

    const result: {
      spawnError?: Error
      code: number | null
      signal: NodeJS.Signals | null
      stdout: string
      stderr: string
      timedOut: boolean
      stdoutOverflowed: boolean
      stderrOverflowed: boolean
    } = { code: null, signal: null, stdout: '', stderr: '', timedOut: false, stdoutOverflowed: false, stderrOverflowed: false }

    const finish = (): void => {
      if (settled) return
      settled = true
      if (timer !== undefined) clearTimeout(timer)
      result.stdout = Buffer.concat(stdoutChunks).toString('utf8')
      result.stderr = Buffer.concat(stderrChunks).toString('utf8')
      result.timedOut = timedOut
      result.stdoutOverflowed = stdoutOverflowed
      result.stderrOverflowed = stderrOverflowed
      resolve(result)
    }

    try {
      child = spawnFn(request.command, request.args, {
        ...(request.cwd === undefined ? {} : { cwd: request.cwd }),
        windowsHide: true,
      })
    } catch (error) {
      resolve({ ...result, spawnError: error instanceof Error ? error : new Error(String(error)) })
      return
    }

    timer = setTimeout(() => {
      timedOut = true
      child.kill()
      finish()
    }, request.timeoutMs)

    const capture = (
      stream: { on(event: 'data', listener: (chunk: Buffer) => void): unknown } | null,
      chunks: Buffer[],
      counter: { bytes: number },
      cap: number,
      markOverflow: () => void,
    ): void => {
      stream?.on('data', (chunk: Buffer) => {
        if (counter.bytes + chunk.length > cap) {
          const remaining = cap - counter.bytes
          if (remaining > 0) {
            chunks.push(chunk.subarray(0, remaining))
            counter.bytes = cap
          }
          markOverflow()
          child.kill()
          finish()
          return
        }
        chunks.push(chunk)
        counter.bytes += chunk.length
      })
    }
    capture(child.stdout, stdoutChunks, stdoutCounter, request.maxStdoutBytes, () => { stdoutOverflowed = true })
    capture(child.stderr, stderrChunks, stderrCounter, request.maxStderrBytes, () => { stderrOverflowed = true })

    child.on('close', (code, signal) => {
      result.code = code
      result.signal = signal
      finish()
    })
    child.on('error', (error) => {
      result.spawnError = error
      finish()
    })
  })
}

export interface ForgeCliResolutionDeps {
  /** Workbench-configured explicit CLI path (undefined/empty = unset → PATH). */
  readonly explicitPath?: () => string | undefined
  /** Environment carrying PATH (default process.env). */
  readonly env?: Readonly<{ PATH?: string }>
  readonly platform?: NodeJS.Platform
  /** File-existence probe override (default: statSync isFile + X_OK). */
  readonly fileExists?: (candidate: string) => boolean
  readonly spawnFn?: CliSpawnFn
  /** Version-probe timeout (default 5s). */
  readonly probeTimeoutMs?: number
}

export type ForgeCliResolution =
  | { ok: true; path: string; version: string; origin: 'explicit' | 'path' }
  | { ok: false; reasonCode: 'ERR_FORGE_CLI_UNAVAILABLE'; detail: string }

const PROBE_TIMEOUT_MS = 5_000
const PROBE_OUTPUT_CAP = 4_096

/**
 * Directly-spawnable name suffixes on PATH. win32 keeps only native-executable
 * forms (.exe/.com): script shims (.cmd/.bat/.ps1) would need cmd.exe — a
 * shell — which the T2 Hard Rule forbids. POSIX resolves the bare name.
 */
function spawnableSuffixes(platform: NodeJS.Platform): readonly string[] {
  return platform === 'win32' ? ['.exe', '.com'] : ['']
}

const SHIM_SUFFIXES = ['.cmd', '.bat', '.ps1'] as const

interface PathLookup {
  path?: string
  shimOnly: boolean
  searched: number
}

function locateOnPath(
  name: string,
  env: Readonly<{ PATH?: string }>,
  platform: NodeJS.Platform,
  fileExists: (candidate: string) => boolean,
): PathLookup {
  const dirs = (env.PATH ?? '').split(delimiter).filter(entry => entry !== '')
  for (const suffix of spawnableSuffixes(platform)) {
    for (const dir of dirs) {
      const candidate = join(dir, name + suffix)
      if (fileExists(candidate)) return { path: candidate, shimOnly: false, searched: dirs.length }
    }
  }
  // Diagnostic aid only: a shim-only hit explains WHY PATH "found forge" but
  // refused it (the common npm-on-Windows confusion).
  const shimOnly = dirs.some(dir => SHIM_SUFFIXES.some(shim => fileExists(join(dir, name + shim))))
  return { shimOnly, searched: dirs.length }
}

/** Extract the version line: `VERSION: 5.21.0` → `5.21.0` (prefix optional). */
function parseVersionLine(stdout: string): string | undefined {
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.replace(/^VERSION:\s*/, '').trim()
    if (trimmed !== '') return trimmed
  }
  return undefined
}

async function probeVersion(
  cliPath: string,
  spawnFn: CliSpawnFn | undefined,
  timeoutMs: number,
): Promise<{ version: string } | { failed: string }> {
  const run = await runBoundedCapture({
    command: cliPath,
    args: ['version'],
    timeoutMs,
    maxStdoutBytes: PROBE_OUTPUT_CAP,
    maxStderrBytes: PROBE_OUTPUT_CAP,
    ...(spawnFn === undefined ? {} : { spawnFn }),
  })
  if (run.spawnError !== undefined) return { failed: `cannot execute (${run.spawnError.message})` }
  if (run.timedOut) return { failed: `timed out after ${String(timeoutMs)}ms` }
  if (run.code !== 0) {
    const stderrExcerpt = run.stderr.trim().split(/\r?\n/)[0] ?? ''
    return { failed: `exit ${String(run.code)}${stderrExcerpt === '' ? '' : `: ${stderrExcerpt}`}` }
  }
  const version = parseVersionLine(run.stdout)
  return version === undefined ? { failed: 'no version line on stdout' } : { version }
}

/**
 * Resolve the forge CLI: explicit configured path (validated absolute + present
 * + version-probed) first, falling through to a PATH lookup on failure or when
 * unset; every failing stage appends its diagnosis so the final
 * `ERR_FORGE_CLI_UNAVAILABLE` detail reports both paths, as Interface 2's
 * resolution chain requires.
 */
export async function resolveForgeCli(deps: ForgeCliResolutionDeps = {}): Promise<ForgeCliResolution> {
  const env = deps.env ?? process.env
  const platform = deps.platform ?? process.platform
  const fileExists = deps.fileExists ?? defaultFileExists
  const probeTimeoutMs = deps.probeTimeoutMs ?? PROBE_TIMEOUT_MS
  const diagnostics: string[] = []

  const rawExplicit = deps.explicitPath?.()?.trim()
  if (rawExplicit !== undefined && rawExplicit !== '') {
    if (!isAbsolute(rawExplicit)) {
      diagnostics.push(`explicit path "${rawExplicit}": not an absolute path`)
    } else if (!fileExists(rawExplicit)) {
      diagnostics.push(`explicit path "${rawExplicit}": file not found`)
    } else {
      const probe = await probeVersion(rawExplicit, deps.spawnFn, probeTimeoutMs)
      if ('version' in probe) return { ok: true, path: rawExplicit, version: probe.version, origin: 'explicit' }
      diagnostics.push(`explicit path "${rawExplicit}": version probe failed (${probe.failed})`)
    }
  }

  const lookup = locateOnPath('forge', env, platform, fileExists)
  if (lookup.path !== undefined) {
    const probe = await probeVersion(lookup.path, deps.spawnFn, probeTimeoutMs)
    if ('version' in probe) return { ok: true, path: lookup.path, version: probe.version, origin: 'path' }
    diagnostics.push(`PATH candidate "${lookup.path}": version probe failed (${probe.failed})`)
  } else if (lookup.shimOnly) {
    diagnostics.push(
      `PATH: only script shims found (forge${SHIM_SUFFIXES.join('/')} need a shell and are rejected) — configure the explicit path`,
    )
  } else {
    diagnostics.push(`PATH: no forge candidate in ${String(lookup.searched)} entries`)
  }

  return {
    ok: false,
    reasonCode: 'ERR_FORGE_CLI_UNAVAILABLE',
    detail: diagnostics.length > 0 ? diagnostics.join('; ') : 'no resolution stage ran (no explicit path, empty PATH)',
  }
}
