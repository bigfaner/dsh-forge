/**
 * The forge CLI bridge core, host half (task 4.1, tech-design Interface 2,
 * DF001 transition form: spawn-to-completion, footprint = 2). Pure logic —
 * deliberately free of decorators and cordis types so the whole surface is
 * unit-testable from source; the cordis service class that exposes it lives
 * in forge-bridge-rpc.ts.
 *
 * Security (T2 Hard Rules): spawn is ALWAYS an argument array (no shell
 * string); the task key must reduce to a local forge id `^\d+(\.\d+)*$` (the
 * workbench qualified form `<featureSlug>/<localId>` is translated first —
 * task 2.5 dialect); `cwd` is restricted to the registered-project allowlist
 * injected via deps; output and lifetime are bounded. The prompt is DATA end
 * to end — returned as a string, never parsed or executed (T6: interpretation
 * belongs to the session's existing approval UI, not this bridge).
 *
 * Hard Rule (no prompt caching): every getTaskPrompt call resolves and spawns
 * afresh — a prompt captured before a status change is invalid by definition,
 * so nothing here memoizes.
 */

import { resolve } from 'node:path'
import { resolveForgeCli, runBoundedCapture, type CliSpawnFn } from './cli-resolve'
import type { GetTaskPromptInput, GetTaskPromptResult, ResolveCliResult } from '../client/services'

// Re-declared for the deps surface below (structural, no runtime import).
type CliEnv = Readonly<{ PATH?: string }>

/** The local forge task-id whitelist (tech-design T2 mitigation). */
export const FORGE_TASK_KEY_PATTERN = /^\d+(\.\d+)*$/

/** Default prompt-spawn budget (forge prompt get-by-task-id is sub-second; generous ceiling). */
export const PROMPT_TIMEOUT_MS = 15_000

/** Default output guards: 2 MiB prompt, 256 KiB diagnostics. */
export const MAX_PROMPT_BYTES = 2 * 1024 * 1024
export const MAX_ERROR_BYTES = 256 * 1024

/** Default version-probe budget handed to the resolver. */
export const PROBE_TIMEOUT_MS = 5_000

export interface ForgeBridgeDeps {
  /**
   * Registered project code_roots — THE allowlist. Sole source of truth is the
   * workbench projects table (2.2 repos); this provider is the delivery seam
   * (wired by the shell-side integration task). Empty = fail closed: every
   * spawn request is rejected.
   */
  readonly listProjectRoots: () => readonly string[]
  /** Workbench 设置显式 CLI 路径 provider (undefined/empty = unset → PATH chain). */
  readonly getCliPath?: () => string | undefined
  /** Spawn injection point (unit tests route the real spawner at a stub CLI script). */
  readonly spawnFn?: CliSpawnFn
  /** Environment for PATH lookup (default process.env; tests pin it hermetically). */
  readonly env?: CliEnv
  readonly promptTimeoutMs?: number
  readonly maxPromptBytes?: number
  readonly maxErrorBytes?: number
  readonly probeTimeoutMs?: number
  /** Case-fold root comparison (default: win32). Injectable for platform-neutral tests. */
  readonly caseInsensitiveRoots?: boolean
}

/**
 * Translate a workbench task key to the local forge id. Qualified keys
 * (`<featureSlug>/<localId>`, task 2.5 dialect) strip their prefix — but only
 * when the prefix is a real slug segment (non-empty, not `.`/`..`) and the
 * slash count is exactly one; anything that does not then match
 * `^\d+(\.\d+)*$` (the only form the CLI accepts) is rejected → undefined.
 */
export function toLocalTaskKey(taskKey: string): string | undefined {
  const slash = taskKey.indexOf('/')
  if (slash === -1) {
    return FORGE_TASK_KEY_PATTERN.test(taskKey) ? taskKey : undefined
  }
  const slug = taskKey.slice(0, slash)
  if (slug === '' || slug === '.' || slug === '..') return undefined
  if (taskKey.indexOf('/', slash + 1) !== -1) return undefined
  const local = taskKey.slice(slash + 1)
  return FORGE_TASK_KEY_PATTERN.test(local) ? local : undefined
}

/**
 * Normalize a project root for allowlist comparison — the exact convention of
 * the workbench repos layer (resolve → forward slashes → no trailing slash,
 * drive/POSIX roots kept): registered rows are stored in this form, so the
 * input must be folded the same way before comparing. Mirrored here (not
 * imported) because the plugin package cannot depend on the app.
 */
export function normalizeProjectRoot(root: string): string {
  const resolved = resolve(root).replaceAll('\\', '/')
  if (resolved === '/' || /^[A-Za-z]:\/$/.test(resolved)) return resolved
  return resolved.replace(/\/+$/, '')
}

/** The cordis-free service core (unit-tested directly; the class delegates). */
export interface ForgeBridgeCore {
  resolveCli(): Promise<ResolveCliResult>
  getTaskPrompt(input: GetTaskPromptInput): Promise<GetTaskPromptResult>
}

export function createForgeBridgeCore(deps: ForgeBridgeDeps): ForgeBridgeCore {
  const promptTimeoutMs = deps.promptTimeoutMs ?? PROMPT_TIMEOUT_MS
  const maxPromptBytes = deps.maxPromptBytes ?? MAX_PROMPT_BYTES
  const maxErrorBytes = deps.maxErrorBytes ?? MAX_ERROR_BYTES
  const caseInsensitiveRoots = deps.caseInsensitiveRoots ?? process.platform === 'win32'
  const sameRoot = (a: string, b: string): boolean =>
    caseInsensitiveRoots ? a.toLowerCase() === b.toLowerCase() : a === b

  const resolutionDeps = {
    ...(deps.getCliPath === undefined ? {} : { explicitPath: deps.getCliPath }),
    ...(deps.spawnFn === undefined ? {} : { spawnFn: deps.spawnFn }),
    ...(deps.env === undefined ? {} : { env: deps.env }),
    probeTimeoutMs: deps.probeTimeoutMs ?? PROBE_TIMEOUT_MS,
  }

  return {
    async resolveCli(): Promise<ResolveCliResult> {
      const resolution = await resolveForgeCli(resolutionDeps)
      if (resolution.ok) {
        return { available: true, path: resolution.path, version: resolution.version }
      }
      return { available: false, reasonCode: resolution.reasonCode, detail: resolution.detail }
    },

    async getTaskPrompt(input: GetTaskPromptInput): Promise<GetTaskPromptResult> {
      // Gate 1 — task key dialect: qualified → local, then regex whitelist.
      // (AC2: 非法即拒; reaches no spawn.)
      const localId = toLocalTaskKey(input.taskKey)
      if (localId === undefined) {
        return {
          available: false,
          reasonCode: 'ERR_NO_PROMPT',
          detail: `task key "${input.taskKey}" is not a forge task id (expected "<featureSlug>/<N.N>" or "<N.N>")`,
        }
      }

      // Gate 2 — registered-project allowlist: the ONLY cwd a spawn may take.
      // Fail closed when the provider yields nothing.
      const normalizedRoot = normalizeProjectRoot(input.projectRoot)
      const registered = deps.listProjectRoots().map(normalizeProjectRoot)
      if (!registered.some(root => sameRoot(root, normalizedRoot))) {
        return {
          available: false,
          reasonCode: 'ERR_NO_PROMPT',
          detail: `project root ${input.projectRoot} is not a registered project`,
        }
      }

      // Gate 3 — CLI resolution (设置显式路径 → PATH).
      const resolution = await resolveForgeCli(resolutionDeps)
      if (!resolution.ok) {
        return { available: false, reasonCode: 'ERR_FORGE_CLI_UNAVAILABLE', detail: resolution.detail }
      }

      // Argument-array spawn, bounded output, cwd pinned to the registered root.
      const run = await runBoundedCapture({
        command: resolution.path,
        args: ['prompt', 'get-by-task-id', localId],
        cwd: normalizedRoot,
        timeoutMs: promptTimeoutMs,
        maxStdoutBytes: maxPromptBytes,
        maxStderrBytes: maxErrorBytes,
        ...(deps.spawnFn === undefined ? {} : { spawnFn: deps.spawnFn }),
      })

      if (run.spawnError !== undefined) {
        // The binary vanished between resolution and spawn — a resolution-class
        // failure, not a "task has no prompt" fact.
        return {
          available: false,
          reasonCode: 'ERR_FORGE_CLI_UNAVAILABLE',
          detail: `forge CLI at ${resolution.path} failed to start (${run.spawnError.message})`,
        }
      }
      if (run.timedOut) {
        return {
          available: false,
          reasonCode: 'ERR_NO_PROMPT',
          detail: `forge prompt get-by-task-id ${localId} timed out after ${String(promptTimeoutMs)}ms (child terminated)`,
        }
      }
      if (run.stdoutOverflowed) {
        return {
          available: false,
          reasonCode: 'ERR_NO_PROMPT',
          detail: `forge prompt get-by-task-id ${localId} output exceeded the ${String(maxPromptBytes)}-byte cap (child terminated)`,
        }
      }
      if (run.stderrOverflowed) {
        return {
          available: false,
          reasonCode: 'ERR_NO_PROMPT',
          detail: `forge prompt get-by-task-id ${localId} diagnostics exceeded the ${String(maxErrorBytes)}-byte cap (child terminated)`,
        }
      }
      if (run.code !== 0) {
        // Spike-1 §4.3: failures land on stderr (structured AIError block),
        // exit 1 (blocking 2) — e.g. `task "x" not found in index`.
        const stderrExcerpt = run.stderr.trim().split(/\r?\n/).slice(0, 4).join(' | ')
        return {
          available: false,
          reasonCode: 'ERR_NO_PROMPT',
          detail: `forge prompt get-by-task-id ${localId} exited ${String(run.code)}${stderrExcerpt === '' ? '' : `: ${stderrExcerpt}`}`,
        }
      }
      if (run.stdout.length === 0) {
        return {
          available: false,
          reasonCode: 'ERR_NO_PROMPT',
          detail: `forge prompt get-by-task-id ${localId} produced empty output`,
        }
      }

      // COMPLETE stdout, no trimming — SC3 injects this character-for-character.
      return { available: true, promptText: run.stdout }
    },
  }
}
