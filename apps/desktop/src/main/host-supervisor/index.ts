// host-supervisor — Interface 1 of the M1 tech design (壳↔宿主监护).
//
// Spawns the vendored upstream desktop-host entry as a child process under
// the builtin standalone Node runtime (resolved through the vendor seam),
// performs the IPC handshake, forwards the host session-event stream to the
// shell, owns graceful shutdown (no orphan processes), and increments the
// recovery `attempts` counter on every startHost() call (written into
// RecoveryContext, consumed by crash-recovery / Interface 2).
//
// Child-process IPC contract (verified against the vendored entry and the
// smoke fixture):
//   argv:    [hostEntry, runtimeDir(profileDir), projectDir]
//   child -> parent : { type: 'ready', ... } handshake success
//                     { type: 'fatal', message } startup failure
//                     { type: 'wait-input' | 'turn-end' | 'session-list', ... }
//                     { type: 'shutdown-complete' }
//   parent -> child : { type: 'shutdown' }

import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { HOST_ENTRY_PATH, resolveBuiltinNode } from '@dsh-forge/desktop-host-vendor'
import { shellLog } from '../log.ts'

export type HostSessionEvent =
  | { type: 'wait-input'; sessionId: string; title: string }
  | { type: 'turn-end'; sessionId: string; title: string }
  | { type: 'session-list'; sessions: Array<{ id: string; title: string }> }

/**
 * Host boot facts carried by the ready handshake (vendored entry:
 * `process.send?.({ type: 'ready', url, injections })`). Consumed by the
 * dsh-app:// protocol carriage (web-asset & API traffic over the upstream
 * host-protocol/wire seam).
 */
export interface HostBootInfo {
  readonly url: string
  readonly injections?: readonly unknown[]
}

export interface HostHandle {
  readonly pid: number
  /** ready-payload boot facts; undefined when the handshake carried no URL. */
  readonly boot?: HostBootInfo
  onExit(cb: (code: number | null, signal: string | null) => void): void
  onSessionEvent(cb: (ev: HostSessionEvent) => void): void
  shutdown(): Promise<void>
}

export type RecoveryState = 'idle' | 'restarting' | 'restoring' | 'recovered' | 'failed'

export interface RecoveryContext {
  state: RecoveryState
  attempts: number
  failure?: { code: 'retry-exhausted' | 'replay-error' | 'host-start-failed'; detail: string }
}

/** Minimal child-process surface the supervisor depends on (mockable in tests). */
export interface HostChildProcess {
  readonly pid: number | undefined
  on(event: string, listener: (...args: unknown[]) => void): unknown
  once(event: string, listener: (...args: unknown[]) => void): unknown
  send(message: unknown): boolean
  kill(signal?: string): boolean
}

export interface HostSupervisorDeps {
  /** Spawn override (tests inject a mock child). Defaults to node:child_process spawn. */
  spawnChild?: (nodeExecutable: string, args: string[], options: { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] }) => HostChildProcess
  /** Builtin-Node resolver override (defaults to the vendor seam). */
  resolveNode?: () => string
  nodeExecutable?: string
  hostEntryPath?: string
  projectDir?: string
  readyTimeoutMs?: number
  shutdownTimeoutMs?: number
}

export interface HostSupervisor {
  startHost(profileDir: string): Promise<HostHandle>
  /** Snapshot of the recovery context written by this supervisor (attempts counter). */
  readonly recoveryContext: Readonly<RecoveryContext>
}

const DEFAULT_READY_TIMEOUT_MS = 20_000
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Narrow a raw IPC message into a HostSessionEvent; anything else is not forwarded. */
export function parseSessionEvent(message: unknown): HostSessionEvent | undefined {
  if (!isRecord(message)) return undefined
  if (message.type === 'wait-input' || message.type === 'turn-end') {
    const { sessionId, title } = message
    if (typeof sessionId !== 'string' || typeof title !== 'string') return undefined
    return { type: message.type, sessionId, title }
  }
  if (message.type === 'session-list') {
    const raw = message.sessions
    if (!Array.isArray(raw)) return undefined
    const sessions: Array<{ id: string; title: string }> = []
    for (const entry of raw) {
      if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.title !== 'string') return undefined
      sessions.push({ id: entry.id, title: entry.title })
    }
    return { type: 'session-list', sessions }
  }
  return undefined
}

class HostStartError extends Error {
  constructor(detail: string) {
    super(`host start failed: ${detail}`)
    this.name = 'HostStartError'
  }
}

export function createHostSupervisor(deps: HostSupervisorDeps = {}): HostSupervisor {
  const {
    spawnChild = (nodeExecutable, args, options) => spawn(nodeExecutable, args, options) as unknown as HostChildProcess,
    hostEntryPath = HOST_ENTRY_PATH,
    projectDir = process.cwd(),
    readyTimeoutMs = DEFAULT_READY_TIMEOUT_MS,
    shutdownTimeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS,
  } = deps

  const resolveNode = deps.resolveNode ?? (() => resolveBuiltinNode().nodeExecutable)
  let nodeExecutable = deps.nodeExecutable
  let recoveryContext: RecoveryContext = { state: 'idle', attempts: 0 }

  function startHost(profileDir: string): Promise<HostHandle> {
    // attempts: +1 on every startHost() call, written into RecoveryContext (tech-design Interface 2 note).
    recoveryContext = { ...recoveryContext, attempts: recoveryContext.attempts + 1 }

    if (nodeExecutable === undefined) {
      try {
        nodeExecutable = resolveNode()
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        shellLog.error({ code: 'ERR_HOST_START_FAILED', message: 'builtin Node runtime unavailable', data: { detail } })
        return Promise.reject(new HostStartError(detail))
      }
    }

    return new Promise<HostHandle>((resolve, reject) => {
      let child: HostChildProcess
      try {
        child = spawnChild(nodeExecutable as string, [hostEntryPath, profileDir, projectDir], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        shellLog.error({ code: 'ERR_HOST_START_FAILED', message: 'host spawn threw', data: { detail } })
        reject(new HostStartError(detail))
        return
      }

      const exitCallbacks: Array<(code: number | null, signal: string | null) => void> = []
      const eventCallbacks: Array<(ev: HostSessionEvent) => void> = []
      let exitCode: number | null = null
      let exitSignal: string | null = null
      let exited = false
      let ready = false
      let settled = false

      const readyTimer = setTimeout(() => {
        if (settled) return
        settled = true
        shellLog.error({ code: 'ERR_HOST_START_FAILED', message: 'host handshake timed out', data: { pid: child.pid } })
        reject(new HostStartError(`handshake timeout after ${String(readyTimeoutMs)}ms`))
        safeKill(child)
      }, readyTimeoutMs)

      const onExit = (code: number | null, signal: string | null): void => {
        exited = true
        exitCode = code
        exitSignal = signal
        for (const cb of exitCallbacks) cb(code, signal)
      }

      child.once('exit', (...args: unknown[]) => onExit(args[0] as number | null, args[1] as string | null))
      child.once('error', (error: unknown) => {
        if (settled) return
        settled = true
        clearTimeout(readyTimer)
        const detail = error instanceof Error ? error.message : String(error)
        shellLog.error({ code: 'ERR_HOST_START_FAILED', message: 'host child error', data: { detail } })
        reject(new HostStartError(detail))
      })
      child.on('message', (message: unknown) => {
        if (!isRecord(message)) return
        // 'ready' = vendored upstream entry; 'smoke-ready' = smoke fixture (same wiring).
        if (!ready && (message.type === 'ready' || message.type === 'smoke-ready')) {
          ready = true
          clearTimeout(readyTimer)
          if (settled) return
          settled = true
          const boot: HostBootInfo | undefined = typeof message.url === 'string' && message.url !== ''
            ? { url: message.url, injections: Array.isArray(message.injections) ? message.injections : [] }
            : undefined
          shellLog.info({ code: 'HOST_STARTED', message: 'host subprocess ready', data: { pid: child.pid } })
          resolve(makeHandle(child, () => exitCallbacks, () => eventCallbacks, () => ({ exited, exitCode, exitSignal }), boot))
          return
        }
        if (!ready && message.type === 'fatal') {
          if (settled) return
          settled = true
          clearTimeout(readyTimer)
          const detail = typeof message.message === 'string' ? message.message : 'unknown fatal error'
          shellLog.error({ code: 'ERR_HOST_START_FAILED', message: 'host reported fatal startup error', data: { detail } })
          reject(new HostStartError(detail))
          return
        }
        const event = parseSessionEvent(message)
        if (event !== undefined) for (const cb of eventCallbacks) cb(event)
      })

      // Exit before the handshake completes is a startup failure (SC: spawn/握手失败).
      const guard = (): void => {
        if (ready || settled) return
        settled = true
        clearTimeout(readyTimer)
        shellLog.error({ code: 'ERR_HOST_START_FAILED', message: 'host exited before handshake', data: { pid: child.pid } })
        reject(new HostStartError('host exited before ready handshake'))
      }
      child.once('exit', guard)
    })
  }

  function makeHandle(
    child: HostChildProcess,
    getExitCallbacks: () => Array<(code: number | null, signal: string | null) => void>,
    getEventCallbacks: () => Array<(ev: HostSessionEvent) => void>,
    getExitState: () => { exited: boolean; exitCode: number | null; exitSignal: string | null },
    boot: HostBootInfo | undefined,
  ): HostHandle {
    return {
      pid: child.pid as number,
      boot,
      onExit(cb) { getExitCallbacks().push(cb) },
      onSessionEvent(cb) { getEventCallbacks().push(cb) },
      shutdown() {
        return new Promise<void>((resolve) => {
          if (getExitState().exited) { resolve(); return }
          const timers: Array<ReturnType<typeof setTimeout>> = []
          const finish = (): void => {
            for (const timer of timers) clearTimeout(timer)
            resolve()
          }
          child.once('exit', finish)
          try { child.send({ type: 'shutdown' }) } catch { /* channel closed — exit will follow */ }
          // Escalation ladder: shutdown message → SIGTERM → SIGKILL → resolve.
          // Bounded on every step so shutdown() can never hang (and never leave an orphan host).
          timers.push(setTimeout(() => {
            if (getExitState().exited) return
            shellLog.warn({ code: 'WARN_HOST_SHUTDOWN_TIMEOUT', message: 'host did not exit after shutdown request, escalating to SIGTERM', data: { pid: child.pid } })
            if (!safeKill(child, 'SIGTERM')) safeKill(child, 'SIGKILL')
          }, shutdownTimeoutMs))
          timers.push(setTimeout(() => {
            if (getExitState().exited) return
            shellLog.warn({ code: 'WARN_HOST_SHUTDOWN_TIMEOUT', message: 'host still alive, escalating to SIGKILL', data: { pid: child.pid } })
            safeKill(child, 'SIGKILL')
          }, shutdownTimeoutMs * 2))
          timers.push(setTimeout(finish, shutdownTimeoutMs * 3))
        })
      },
    }
  }

  function safeKill(child: HostChildProcess, signal = 'SIGTERM'): boolean {
    try { return child.kill(signal) } catch { return false }
  }

  return {
    startHost,
    get recoveryContext() { return recoveryContext },
  }
}

// Re-exported for convenience of the main entry wiring (and for type-only consumers).
export type { ChildProcess }
