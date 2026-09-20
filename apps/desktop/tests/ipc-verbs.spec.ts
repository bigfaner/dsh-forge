import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  SHELL_VERB_CHANNELS,
  assertVerbSender,
  createRestartSequence,
  installShellVerbs,
  isWhitelistedVerbChannel,
  type ShellVerbChannel,
  type VerbSenderEvent,
} from '../src/main/ipc/index.ts'
import type { RecoveryState } from '../src/main/crash-recovery/index.ts'

const OWNED_EVENT: VerbSenderEvent = { senderFrame: { url: 'dsh-app://app/' } }
const FOREIGN_EVENT: VerbSenderEvent = { senderFrame: { url: 'https://evil.example/' } }
const NO_FRAME_EVENT: VerbSenderEvent = {}

function errorSink(): string[] {
  const lines: string[] = []
  vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: unknown) => {
    lines.push(String(chunk))
    return true
  }) as typeof process.stderr.write)
  return lines
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Interface 6 IPC whitelist', () => {
  it('contains exactly the five dshForge verb channels', () => {
    expect(Object.values(SHELL_VERB_CHANNELS).sort()).toEqual([
      'dsh-forge:recovery-get-state',
      'dsh-forge:recovery-restart-app',
      'dsh-forge:update-dismiss',
      'dsh-forge:update-get-state',
      'dsh-forge:update-open-release',
    ])
  })

  it('rejects off-whitelist channels (never registered)', () => {
    expect(isWhitelistedVerbChannel('dsh-forge:update-dismiss')).toBe(true)
    for (const offWhitelist of ['dsh-forge:eval', 'dsh-forge:boot-forged', 'shell:exec', '']) {
      expect(isWhitelistedVerbChannel(offWhitelist)).toBe(false)
    }
    const registered: string[] = []
    const rejectingHandle = (channel: ShellVerbChannel | string): void => {
      if (!isWhitelistedVerbChannel(channel)) throw new Error(`refusing to register off-whitelist channel: ${channel}`)
      registered.push(channel)
    }
    expect(() => rejectingHandle('dsh-forge:eval')).toThrow(/off-whitelist/)
    expect(registered).toHaveLength(0)
  })
})

describe('sender frame validation', () => {
  it('rejects and logs verbs from a foreign frame', () => {
    const lines = errorSink()
    expect(() => assertVerbSender(SHELL_VERB_CHANNELS.recoveryGetState, FOREIGN_EVENT)).toThrow(/unowned frame/)
    expect(lines.some(line => line.includes('ERR_IPC_SENDER_REJECTED') && line.includes('https://evil.example/'))).toBe(true)
  })

  it('rejects and logs verbs when the frame is missing', () => {
    const lines = errorSink()
    expect(() => assertVerbSender(SHELL_VERB_CHANNELS.updateOpenRelease, NO_FRAME_EVENT)).toThrow(/unowned frame/)
    expect(lines.some(line => line.includes('ERR_IPC_SENDER_REJECTED'))).toBe(true)
  })

  it('accepts the dsh-app://app/ main document frame without logging', () => {
    const lines = errorSink()
    expect(() => assertVerbSender(SHELL_VERB_CHANNELS.updateDismiss, OWNED_EVENT)).not.toThrow()
    expect(lines).toHaveLength(0)
  })
})

describe('installShellVerbs', () => {
  it('routes every verb through the sender guard and its impl', () => {
    const calls: string[] = []
    const handlers = new Map<string, (event: VerbSenderEvent) => unknown>()
    installShellVerbs(
      (channel, listener) => { handlers.set(channel, listener) },
      {
        dismiss: () => { calls.push('dismiss') },
        openRelease: () => { calls.push('openRelease') },
        getState: () => { calls.push('update-get-state') },
      },
      {
        restartApp: () => { calls.push('restartApp') },
        getState: () => { calls.push('getState') },
      },
    )
    expect(handlers.size).toBe(5)
    for (const [, handler] of handlers) {
      expect(() => handler(FOREIGN_EVENT)).toThrow(/unowned frame/)
      expect(() => handler(OWNED_EVENT)).not.toThrow()
    }
    expect(calls.filter(c => c === 'dismiss')).toHaveLength(1)
    expect(calls.filter(c => c === 'openRelease')).toHaveLength(1)
    expect(calls.filter(c => c === 'restartApp')).toHaveLength(1)
    expect(calls.filter(c => c === 'getState')).toHaveLength(1)
  })
})

describe('restartApp ordering (shutdown host → release lock → relaunch → exit)', () => {
  it('executes the Interface 6 sequence in order, awaiting host settlement before the lock release', async () => {
    const order: string[] = []
    let releaseHost: (() => void) | undefined
    const restartApp = createRestartSequence({
      disposeRecovery: () => { order.push('dispose-recovery') },
      shutdownHost: () => new Promise<void>((resolve) => {
        order.push('shutdown-host:start')
        releaseHost = () => { order.push('shutdown-host:settled'); resolve() }
      }),
      releaseSingleInstanceLock: () => { order.push('release-lock') },
      relaunch: () => { order.push('relaunch') },
      exit: () => { order.push('exit') },
    })
    const pending = restartApp()
    // Nothing past host shutdown may run while the host is still settling.
    await Promise.resolve()
    await Promise.resolve()
    expect(order).toEqual(['dispose-recovery', 'shutdown-host:start'])
    releaseHost?.()
    await pending
    expect(order).toEqual(['dispose-recovery', 'shutdown-host:start', 'shutdown-host:settled', 'release-lock', 'relaunch', 'exit'])
  })

  it('tolerates a host that is already gone (shutdown resolves, sequence still completes)', async () => {
    const order: string[] = []
    const restartApp = createRestartSequence({
      disposeRecovery: () => { order.push('dispose-recovery') },
      shutdownHost: () => { order.push('shutdown-host') },
      releaseSingleInstanceLock: () => { order.push('release-lock') },
      relaunch: () => { order.push('relaunch') },
      exit: () => { order.push('exit') },
    })
    await restartApp()
    expect(order).toEqual(['dispose-recovery', 'shutdown-host', 'release-lock', 'relaunch', 'exit'])
  })
})

describe('getState return type', () => {
  it('returns the RecoveryState union used by the crash-recovery machine', () => {
    const states: RecoveryState[] = ['idle', 'restarting', 'restoring', 'recovered', 'failed']
    const handlers = new Map<string, (event: VerbSenderEvent) => unknown>()
    let current: RecoveryState = 'idle'
    installShellVerbs(
      (channel, listener) => { handlers.set(channel, listener) },
      { dismiss: () => {}, openRelease: () => {}, getState: () => undefined },
      { restartApp: () => {}, getState: () => current },
    )
    const handler = handlers.get(SHELL_VERB_CHANNELS.recoveryGetState)
    expect(handler).toBeDefined()
    for (const state of states) {
      current = state
      expect(handler?.(OWNED_EVENT)).toBe(state)
    }
  })
})
