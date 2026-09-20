import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveBuiltinNode } from '@dsh-forge/desktop-host-vendor'
import { createHostSupervisor, parseSessionEvent, type HostChildProcess, type HostSupervisorDeps } from '../src/main/host-supervisor/index.ts'

const projectRoot = join(import.meta.dirname, '../../..')
const runtimeUnavailable = (() => { try { resolveBuiltinNode(); return false } catch { return true } })()

// Mock child process implementing the IPC surface the supervisor consumes.
class MockHostChild extends EventEmitter {
  pid = 4242
  sent: unknown[] = []
  killed: string[] = []
  #exited = false
  send = (message: unknown): boolean => { this.sent.push(message); return true }
  kill = (signal = 'SIGTERM'): boolean => { this.killed.push(signal); this.exit(1, signal); return true }
  get exited(): boolean { return this.#exited }
  exit(code: number | null, signal: string | null): void {
    if (this.#exited) return
    this.#exited = true
    this.emit('exit', code, signal)
  }
  /** Emit an IPC message from the "host". */
  hostMessage(message: unknown): void { this.emit('message', message) }
}

function makeDeps(child: MockHostChild): HostSupervisorDeps {
  return {
    spawnChild: () => child as unknown as HostChildProcess,
    nodeExecutable: 'node-mock',
    hostEntryPath: 'host-entry-mock.ts',
    readyTimeoutMs: 500,
    shutdownTimeoutMs: 200,
  }
}

function ready(child: MockHostChild): void { child.hostMessage({ type: 'ready', url: 'http://127.0.0.1:1' }) }

let stderrWrite: typeof process.stderr.write

beforeEach(() => {
  stderrWrite = process.stderr.write
  process.stderr.write = (() => true) as typeof process.stderr.write
})

afterEach(() => {
  process.stderr.write = stderrWrite
  vi.restoreAllMocks()
})

describe('host-supervisor (Interface 1)', () => {
  it('startHost resolves after ready handshake with the child pid', async () => {
    const child = new MockHostChild()
    const supervisor = createHostSupervisor(makeDeps(child))
    const pending = supervisor.startHost('/profile')
    ready(child)
    const handle = await pending
    expect(handle.pid).toBe(4242)
  })

  it('attempts increments on every startHost call (written into recoveryContext)', async () => {
    const child = new MockHostChild()
    const supervisor = createHostSupervisor({ ...makeDeps(child), readyTimeoutMs: 20 })
    expect(supervisor.recoveryContext.attempts).toBe(0)
    const p1 = supervisor.startHost('/a')
    void p1.catch(() => {})
    expect(supervisor.recoveryContext.attempts).toBe(1) // incremented immediately on call
    const p2 = supervisor.startHost('/b')
    void p2.catch(() => {})
    expect(supervisor.recoveryContext.attempts).toBe(2)
    await expect(p1).rejects.toThrow()
    await expect(p2).rejects.toThrow()
    expect(supervisor.recoveryContext.state).toBe('idle')
  })

  it('onExit receives (code, signal) when the host exits', async () => {
    const child = new MockHostChild()
    const supervisor = createHostSupervisor(makeDeps(child))
    const pending = supervisor.startHost('/profile')
    ready(child)
    const handle = await pending
    const onExit = vi.fn()
    handle.onExit(onExit)
    child.exit(1, null)
    expect(onExit).toHaveBeenCalledWith(1, null)
    child.exit(9, 'SIGKILL') // second exit is not re-fired
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('onSessionEvent forwards wait-input / turn-end / session-list; other messages ignored', async () => {
    const child = new MockHostChild()
    const supervisor = createHostSupervisor(makeDeps(child))
    const pending = supervisor.startHost('/profile')
    ready(child)
    const handle = await pending
    const events: unknown[] = []
    handle.onSessionEvent(ev => events.push(ev))
    child.hostMessage({ type: 'wait-input', sessionId: 's1', title: 't1' })
    child.hostMessage({ type: 'turn-end', sessionId: 's1', title: 't1' })
    child.hostMessage({ type: 'session-list', sessions: [{ id: 's1', title: 't1' }, { id: 's2', title: 't2' }] })
    child.hostMessage({ type: 'shutdown-complete' })
    child.hostMessage('not-an-object')
    child.hostMessage({ type: 'wait-input', sessionId: 7, title: 'bad' })
    expect(events).toEqual([
      { type: 'wait-input', sessionId: 's1', title: 't1' },
      { type: 'turn-end', sessionId: 's1', title: 't1' },
      { type: 'session-list', sessions: [{ id: 's1', title: 't1' }, { id: 's2', title: 't2' }] },
    ])
  })

  it('shutdown sends the shutdown message and resolves on exit without killing (no orphan)', async () => {
    const child = new MockHostChild()
    const supervisor = createHostSupervisor(makeDeps(child))
    const pending = supervisor.startHost('/profile')
    ready(child)
    const handle = await pending
    const done = handle.shutdown()
    expect(child.sent).toEqual([{ type: 'shutdown' }])
    child.exit(0, null)
    await done
    expect(child.killed).toEqual([])
    // Idempotent after exit.
    await handle.shutdown()
  })

  it('shutdown escalates to kill when the host ignores the shutdown request', async () => {
    const child = new MockHostChild()
    child.kill = (signal = 'SIGTERM') => { child.killed.push(signal); return true } // ignore, do not exit
    const supervisor = createHostSupervisor(makeDeps(child))
    const pending = supervisor.startHost('/profile')
    ready(child)
    const handle = await pending
    await handle.shutdown()
    expect(child.killed.length).toBeGreaterThan(0)
  })

  it('host fatal message rejects startHost (ERR_HOST_START_FAILED)', async () => {
    const child = new MockHostChild()
    const supervisor = createHostSupervisor(makeDeps(child))
    const pending = supervisor.startHost('/profile')
    child.hostMessage({ type: 'fatal', message: 'boot blew up' })
    await expect(pending).rejects.toThrow('boot blew up')
  })

  it('host exit before handshake rejects startHost', async () => {
    const child = new MockHostChild()
    const supervisor = createHostSupervisor(makeDeps(child))
    const pending = supervisor.startHost('/profile')
    child.exit(2, null)
    await expect(pending).rejects.toThrow('exited before ready handshake')
  })

  it('handshake timeout rejects startHost', async () => {
    const child = new MockHostChild()
    const supervisor = createHostSupervisor({ ...makeDeps(child), readyTimeoutMs: 30 })
    await expect(supervisor.startHost('/profile')).rejects.toThrow('handshake timeout')
    expect(child.killed.length).toBeGreaterThan(0)
  })

  it('missing builtin node runtime rejects with actionable error without spawning', async () => {
    const spawnChild = vi.fn()
    const supervisor = createHostSupervisor({
      spawnChild: spawnChild as never,
      resolveNode: () => { throw new Error('builtin Node runtime not acquired — run: node scripts/prepare-host-runtime.mjs (or pass --node-path <local-node>)') },
    })
    await expect(supervisor.startHost('/profile')).rejects.toThrow('prepare-host-runtime')
    expect(spawnChild).not.toHaveBeenCalled()
  })

  it('captures the ready handshake boot payload (url + injections) on HostHandle.boot', async () => {
    const child = new MockHostChild()
    const supervisor = createHostSupervisor(makeDeps(child))
    const pending = supervisor.startHost('/profile')
    child.hostMessage({ type: 'ready', url: 'http://127.0.0.1:19387/auth', injections: [{ kind: 'script', line: 'x' }] })
    const handle = await pending
    expect(handle.boot).toEqual({ url: 'http://127.0.0.1:19387/auth', injections: [{ kind: 'script', line: 'x' }] })
  })

  it('leaves boot undefined when the ready handshake carries no URL', async () => {
    const child = new MockHostChild()
    const supervisor = createHostSupervisor(makeDeps(child))
    const pending = supervisor.startHost('/profile')
    child.hostMessage({ type: 'smoke-ready' })
    const handle = await pending
    expect(handle.boot).toBeUndefined()
  })
})

describe('parseSessionEvent', () => {
  it('rejects malformed payloads', () => {
    expect(parseSessionEvent({ type: 'session-list', sessions: 'nope' })).toBeUndefined()
    expect(parseSessionEvent({ type: 'turn-end' })).toBeUndefined()
    expect(parseSessionEvent(null)).toBeUndefined()
  })
})

describe('host-supervisor real subprocess (fixture entry, builtin Node)', () => {
  it.skipIf(runtimeUnavailable)('spawns, handshakes, and shuts down cleanly without orphans', async () => {
    const supervisor = createHostSupervisor({
      hostEntryPath: join(projectRoot, 'packages/desktop-host-vendor/tests/fixtures/host-entry-fixture.mjs'),
      resolveNode: () => resolveBuiltinNode().nodeExecutable,
      readyTimeoutMs: 20_000,
      shutdownTimeoutMs: 5_000,
    })
    const handle = await supervisor.startHost(join(projectRoot, 'runtime-fixture-profile'))
    expect(handle.pid).toBeGreaterThan(0)
    expect(supervisor.recoveryContext.attempts).toBe(1)
    const exit = new Promise<[number | null, string | null]>(resolve => handle.onExit((c, s) => resolve([c, s])))
    await handle.shutdown()
    const [code] = await exit
    expect(code).toBe(0)
  }, 30_000)
})
