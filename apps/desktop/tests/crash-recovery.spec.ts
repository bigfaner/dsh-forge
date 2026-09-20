import { describe, expect, it } from 'vitest'
import {
  BACKOFF_SCHEDULE_MS,
  createCrashRecovery,
  IllegalRecoveryTransitionError,
  MAX_RECOVERY_ATTEMPTS,
  RECOVERY_TRANSITIONS,
  transition,
  type RecoveryEvent,
  type RecoverySideEffect,
  type RecoveryState,
} from '../src/main/crash-recovery/index.ts'

// Task 4.4 AC (Interface 2 / Key Flow F2, SC9): 全合法迁移、非法迁移抛错(表驱动)、
// 退避 2s/4s/8s 与 attempts 递增一致、failed 不回退、host-exit 清空 SessionTable/Dedup
// (联动语义经 session-table-reset 事件导出, notifier 任务后续消费).

describe('pure transition table (F2 state machine)', () => {
  const legal: Array<[RecoveryState, RecoveryEvent, RecoveryState]> = [
    ['idle', 'host-exit', 'restarting'],
    ['idle', 'start-failed', 'failed'],
    ['restarting', 'host-responsive', 'restoring'],
    ['restarting', 'retry-exhausted', 'failed'],
    ['restoring', 'replay-complete', 'recovered'],
    ['restoring', 'replay-error', 'failed'],
    ['restoring', 'retry-exhausted', 'failed'],
  ]

  it('covers exactly the F2 legal transitions', () => {
    expect(legal).toHaveLength(7)
  })

  for (const [from, event, to] of legal) {
    it(`${from} --${event}--> ${to}`, () => {
      expect(transition(from, event)).toBe(to)
    })
  }

  it('throws on every illegal (state, event) pair — table-driven exhaustive', () => {
    const states: RecoveryState[] = ['idle', 'restarting', 'restoring', 'recovered', 'failed']
    const events: RecoveryEvent[] = ['host-exit', 'host-responsive', 'replay-complete', 'retry-exhausted', 'replay-error', 'start-failed']
    const legalKeys = new Set(legal.map(([f, e]) => `${f}|${e}`))
    let illegalCount = 0
    for (const state of states) {
      for (const event of events) {
        if (legalKeys.has(`${state}|${event}`)) continue
        illegalCount += 1
        expect(() => transition(state, event)).toThrow(IllegalRecoveryTransitionError)
      }
    }
    // 5 states × 6 events − 7 legal = 23 illegal pairs, all exercised.
    expect(illegalCount).toBe(23)
  })

  it('failed never regresses (terminal, empty transition row)', () => {
    expect(RECOVERY_TRANSITIONS.failed).toEqual({})
    for (const event of ['host-exit', 'host-responsive', 'replay-complete', 'retry-exhausted', 'replay-error', 'start-failed'] as RecoveryEvent[]) {
      expect(() => transition('failed', event)).toThrow(/failed never regresses/u)
    }
  })

  it('recovered is terminal on the transition() surface (no F2 overlay-close event in Interface 2)', () => {
    expect(RECOVERY_TRANSITIONS.recovered).toEqual({})
    expect(() => transition('recovered', 'host-exit')).toThrow(IllegalRecoveryTransitionError)
  })
})

describe('createCrashRecovery machine', () => {
  function fakeClock() {
    const timers: Array<{ fn: () => void; delayMs: number; fired: boolean; cancelled: boolean; at: number }> = []
    let now = 0
    const advance = (ms: number): void => {
      now += ms
      for (const t of timers) {
        if (!t.cancelled && !t.fired && t.at <= now) {
          t.fired = true
          t.fn()
        }
      }
    }
    return {
      timers,
      advance,
      pending: () => timers.filter(t => !t.cancelled && !t.fired),
      setTimer: (fn: () => void, delayMs: number) => {
        const entry = { fn, delayMs, fired: false, cancelled: false, at: now + delayMs }
        timers.push(entry)
        return entry
      },
      clearTimer: (handle: unknown) => {
        const entry = handle as { cancelled: boolean }
        entry.cancelled = true
      },
    }
  }

  function machine(clock: ReturnType<typeof fakeClock>) {
    const effects: RecoverySideEffect[] = []
    const recovery = createCrashRecovery({
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
      onEffect: effect => effects.push(effect),
    })
    return { recovery, effects }
  }

  it('happy path: idle → restarting → restoring → recovered with context maintained', () => {
    const clock = fakeClock()
    const { recovery, effects } = machine(clock)
    expect(recovery.context).toEqual({ state: 'idle', attempts: 0 })

    expect(recovery.dispatch('host-exit', 'code=1')).toBe('restarting')
    expect(recovery.dispatch('host-responsive')).toBe('restoring')
    expect(recovery.dispatch('replay-complete')).toBe('recovered')

    expect(recovery.context.state).toBe('recovered')
    expect(recovery.context.failure).toBeUndefined()
    const stateChanges = effects.filter(e => e.type === 'state-changed')
    expect(stateChanges.map(e => (e as { to: RecoveryState }).to)).toEqual(['restarting', 'restoring', 'recovered'])
  })

  it('host-exit emits the session-table-reset hook (SessionTable/Dedup clearing semantics)', () => {
    const clock = fakeClock()
    const { recovery, effects } = machine(clock)
    recovery.dispatch('host-exit', 'crashed')
    const resets = effects.filter(e => e.type === 'session-table-reset')
    expect(resets).toEqual([{ type: 'session-table-reset', reason: 'host-exit' }])
    // Only on the idle → restarting host-exit edge, not on other transitions.
    recovery.dispatch('host-responsive')
    recovery.dispatch('replay-complete')
    expect(effects.filter(e => e.type === 'session-table-reset')).toHaveLength(1)
  })

  it('start-failed: idle → failed directly (F1 first spawn/handshake failure)', () => {
    const clock = fakeClock()
    const { recovery } = machine(clock)
    expect(recovery.dispatch('start-failed', 'handshake timeout')).toBe('failed')
    expect(recovery.context.failure).toEqual({ code: 'host-start-failed', detail: 'handshake timeout' })
    // failed 不回退.
    expect(() => recovery.dispatch('host-exit')).toThrow(IllegalRecoveryTransitionError)
    expect(recovery.context.state).toBe('failed')
  })

  it('illegal dispatch leaves state unchanged', () => {
    const clock = fakeClock()
    const { recovery } = machine(clock)
    recovery.dispatch('host-exit')
    expect(() => recovery.dispatch('replay-complete')).toThrow(IllegalRecoveryTransitionError)
    expect(recovery.context.state).toBe('restarting')
  })

  it('replay-error: restoring → failed with failure detail', () => {
    const clock = fakeClock()
    const { recovery } = machine(clock)
    recovery.dispatch('host-exit')
    recovery.dispatch('host-responsive')
    expect(recovery.dispatch('replay-error', 'session replay threw')).toBe('failed')
    expect(recovery.context.failure).toEqual({ code: 'replay-error', detail: 'session replay threw' })
  })

  it('truncates failure detail to 120 characters', () => {
    const clock = fakeClock()
    const { recovery } = machine(clock)
    const long = 'x'.repeat(200)
    recovery.dispatch('start-failed', long)
    expect(recovery.context.failure?.detail).toHaveLength(120)
    expect(recovery.context.failure?.detail).toBe('x'.repeat(120))
  })

  it('backoff ladder 2s/4s/8s tracks attempts increments; abandonment = retry-exhausted → failed', () => {
    const clock = fakeClock()
    const { recovery, effects } = machine(clock)

    // Initial start consumed one attempt before the crash (supervisor-owned counter).
    recovery.setAttempts(1)
    recovery.dispatch('host-exit', 'code=1')

    // Each fired backoff timer = wiring issues startHost() → attempts+1 (mirrored).
    const firedDelays: number[] = []
    let retries = 0
    const step = (): void => {
      const pending = clock.pending()
      expect(pending).toHaveLength(1)
      const entry = pending[0]
      expect(entry).toBeDefined()
      const delay = entry?.delayMs as number
      firedDelays.push(delay)
      clock.advance(delay)
      retries += 1
      // Attempts increment per startHost() call; attempt 3 still not host-responsive.
      recovery.setAttempts(recovery.context.attempts + 1)
      if (recovery.context.state !== 'failed') step()
    }
    step()

    // Ladder observed: 2s, 4s (abandon fires before an 8s-wrapped 4th attempt);
    // the full schedule constant is exported as the design contract.
    expect(firedDelays).toEqual([BACKOFF_SCHEDULE_MS[0], BACKOFF_SCHEDULE_MS[1]])
    expect(BACKOFF_SCHEDULE_MS).toEqual([2_000, 4_000, 8_000])
    expect(MAX_RECOVERY_ATTEMPTS).toBe(3)
    expect(recovery.context.attempts).toBe(MAX_RECOVERY_ATTEMPTS)
    expect(recovery.context.state).toBe('failed')
    expect(recovery.context.failure?.code).toBe('retry-exhausted')
    expect(effects.filter(e => e.type === 'retry-scheduled').map(e => (e as { attempt: number }).attempt)).toEqual([2, 3])
    expect(effects).toContainEqual({ type: 'retry-abandoned', attempts: 3 })
    // failed 不回退.
    expect(() => recovery.dispatch('host-responsive')).toThrow(IllegalRecoveryTransitionError)
  })

  it('successful host-responsive during the ladder cancels the pending backoff timer', () => {
    const clock = fakeClock()
    const { recovery } = machine(clock)
    recovery.setAttempts(1)
    recovery.dispatch('host-exit')
    expect(clock.pending()).toHaveLength(1)
    recovery.dispatch('host-responsive')
    expect(clock.pending()).toHaveLength(0)
    recovery.dispatch('replay-complete')
    expect(recovery.context.state).toBe('recovered')
  })

  it('setAttempts rejects invalid counters', () => {
    const clock = fakeClock()
    const { recovery } = machine(clock)
    expect(() => recovery.setAttempts(-1)).toThrow(TypeError)
    expect(() => recovery.setAttempts(Number.NaN)).toThrow(TypeError)
  })

  it('dispose cancels pending timers', () => {
    const clock = fakeClock()
    const { recovery } = machine(clock)
    recovery.dispatch('host-exit')
    expect(clock.pending()).toHaveLength(1)
    recovery.dispose()
    expect(clock.pending()).toHaveLength(0)
  })

})
