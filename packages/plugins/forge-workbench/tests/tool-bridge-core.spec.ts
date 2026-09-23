// Task 2.1 unit legs — the renderer tool bridge (T2), host core + client
// dispatch under stubs (AC-1/AC-4 + the AC-3 authority boundary end-to-end):
//
//   AC-1 桥链路     — tool call (host) → waiter stream frame → client
//                     dispatch → IPC verb (stub bridge) → answer → resolve;
//                     payload fidelity (args deep-equal) + actor
//                     `session:<id>` threading into the WRITE verbs' actor
//                     argument (kernel audit discipline, tech-design §I2).
//   AC-4 降级链     — no stream attached → connect-grace fast-fail; stream
//                     attached but never answering → per-call budget; retry
//                     once on transport failure, then ERR_TOOL_BRIDGE_
//                     UNAVAILABLE surfaces (the tool layer THROWS it — 禁静默);
//                     a late answer for an expired callId is idempotently
//                     ignored (spike-1 §3.2/§3.3 形态).
//   AC-3 权限界     — a files-authority project's write rejection
//                     (ERR_TASK_NOT_AUTHORITATIVE envelope from the IPC verb)
//                     flows back as the tool's BUSINESS result value carrying
//                     the「走 CLI」hint — not a thrown error, not retried.
//
// The two halves are wired directly through their decorator-free cores: the
// rpc shells (host @Remote faces) and the cordis mounts are covered by the
// registration legs in forge-tools.spec.ts / host-half.spec.ts — here the
// queue/backlog/budget machinery is the object under test, so fake timers
// drive the budgets (defaults 1s grace / 5s call budget — spike-1 §3.3).

import { describe, expect, it, vi } from 'vitest'
import {
  BRIDGE_TRANSPORT_CODE, createToolBridgeCore, isBoardTaskKeyAddress,
  type ForgeToolBridgeCall, type ToolBridgeWaiterStream,
} from '../src/host/forge-tools/bridge-core.ts'
import { dispatchToolBridgeCall, installToolBridgeClient, runToolBridgePump } from '../src/client/ipc/tool-bridge.ts'
import type { WorkbenchIpcBridge } from '../src/client/ipc/workbench.ts'

/** Budgets small enough for fake-timer stepping. */
const BUDGETS = { connectGraceMs: 1_000, callBudgetMs: 5_000 }

/** Deterministic callId mint for asserting retry attempts. */
let mintSeq = 0
const mintCallId = (): string => `call-${(mintSeq += 1)}`

/** One attached client stream: drains the core through the waiter contract. */
function attachStream(core: ReturnType<typeof createToolBridgeCore>): ToolBridgeWaiterStream {
  const stream = core.attach(new AbortController().signal)
  return stream as ToolBridgeWaiterStream
}

/** The stub IPC bridge: records every verb invocation + programmable results. */
function stubBridge(results: Partial<Record<string, unknown>> = {}): {
  bridge: WorkbenchIpcBridge
  calls: Array<{ member: string; args: unknown[] }>
} {
  const calls: Array<{ member: string; args: unknown[] }> = []
  const record = (member: string) => (...args: unknown[]): Promise<unknown> => {
    calls.push({ member, args })
    const outcome = results[member]
    if (outcome instanceof Error) return Promise.reject(outcome)
    return Promise.resolve(outcome ?? {})
  }
  const member = (name: string): unknown => record(name)
  const bridge = new Proxy({} as Record<string, unknown>, {
    get: (target, prop) => {
      if (prop === 'onEvents') return () => () => {}
      if (typeof prop !== 'string') return undefined
      if (!(prop in target)) target[prop] = member(prop)
      return target[prop]
    },
  })
  return { bridge: bridge as unknown as WorkbenchIpcBridge, calls }
}

/** Drive a full round trip: enqueue → pump one frame → dispatch → answer. */
async function roundTrip(
  core: ReturnType<typeof createToolBridgeCore>,
  stream: ToolBridgeWaiterStream,
  bridge: WorkbenchIpcBridge,
): Promise<void> {
  const frame = await pullFrame(stream)
  core.settleFromClient(await dispatchToolBridgeCall(bridge, frame))
}

/** Pull the next frame off an attached stream (lets the lazy generator start). */
async function pullFrame(stream: ToolBridgeWaiterStream): Promise<ForgeToolBridgeCall> {
  const next = stream[Symbol.asyncIterator]().next()
  await Promise.resolve()
  return (await next).value as ForgeToolBridgeCall
}

describe('tool bridge core: round trip + payload fidelity + actor threading (AC-1)', () => {
  it('delivers a write call to the client stream, forwards it to the IPC verb, and resolves the kernel value', async () => {
    const core = createToolBridgeCore({ budgets: BUDGETS, mintCallId })
    const stream = attachStream(core)
    const taskSummary = { key: 'feat/1.3', title: 'T', status: 'pending', featureSlug: 'feat' }
    const { bridge, calls } = stubBridge({ taskClaim: taskSummary })

    const pending = core.callWithRetry('task_claim', { projectId: 'p1', taskKey: 'feat/1.3' }, 'session:s-1')
    void roundTrip(core, stream, bridge)
    const result = await pending

    expect(result).toEqual({ ok: true, value: taskSummary })
    // Closed-verb forwarding: task_claim → bridge.taskClaim(input, actor).
    expect(calls.map(entry => entry.member)).toEqual(['taskClaim'])
    expect(calls[0]?.args[0]).toEqual({ projectId: 'p1', taskKey: 'feat/1.3' })
    // Actor audit discipline: the session identity rides the write verb's actor slot.
    expect(calls[0]?.args[1]).toBe('session:s-1')
  })

  it('routes the read family: task_get → taskGet, task_query → taskQuery, task_list → unfiltered taskQuery', async () => {
    const core = createToolBridgeCore({ budgets: BUDGETS, mintCallId })
    const stream = attachStream(core)
    const { bridge, calls } = stubBridge({ taskGet: { summary: taskSummaryStub() }, taskQuery: [] })

    const get = core.callWithRetry('task_get', { projectId: 'p1', taskKey: 'feat/1.3' }, 'session:s-1')
    void roundTrip(core, stream, bridge)
    await get
    const query = core.callWithRetry('task_query', { projectId: 'p1', featureSlug: 'feat' }, 'session:s-1')
    void roundTrip(core, stream, bridge)
    await query
    const list = core.callWithRetry('task_list', { projectId: 'p1' }, 'session:s-1')
    void roundTrip(core, stream, bridge)
    await list

    expect(calls.map(entry => entry.member)).toEqual(['taskGet', 'taskQuery', 'taskQuery'])
    expect(calls[0]?.args[0]).toEqual({ projectId: 'p1', taskKey: 'feat/1.3' })
    expect(calls[1]?.args[0]).toEqual({ projectId: 'p1', featureSlug: 'feat' })
    expect(calls[2]?.args[0]).toEqual({ projectId: 'p1' })
    // Reads never carry an actor argument (audit is a write-verb concern).
    expect(calls[0]?.args).toHaveLength(1)
  })

  it('replays backlog frames on late stream attach (boot race absorbed, no loss)', async () => {
    const core = createToolBridgeCore({ budgets: BUDGETS, mintCallId })
    const { bridge, calls } = stubBridge({ taskSubmit: { key: 'feat/1.3', status: 'completed' } })

    // Enqueue BEFORE any stream exists — the call parks in the backlog.
    const pending = core.callWithRetry('task_submit', { projectId: 'p1', taskKey: 'feat/1.3', recordPath: 'records/1.3.md' }, 'session:s-2')
    const stream = attachStream(core)
    const iterator = stream[Symbol.asyncIterator]()
    const next = iterator.next()
    await Promise.resolve()
    const frame = (await next).value as ForgeToolBridgeCall
    core.settleFromClient(await dispatchToolBridgeCall(bridge, frame))
    const result = await pending

    expect(result).toEqual({ ok: true, value: { key: 'feat/1.3', status: 'completed' } })
    expect(calls[0]?.args[0]).toEqual({ projectId: 'p1', taskKey: 'feat/1.3', recordPath: 'records/1.3.md' })
    expect(calls[0]?.args[1]).toBe('session:s-2')
  })
})

describe('tool bridge core: degradation chain (AC-4)', () => {
  it('fast-fails after the connect grace when no renderer stream is attached, retries once, then surfaces the transport code', async () => {
    vi.useFakeTimers()
    try {
      const before = mintSeq
      const core = createToolBridgeCore({ budgets: BUDGETS, mintCallId })
      const pending = core.callWithRetry('task_claim', { projectId: 'p1', taskKey: 'feat/1.3' }, 'session:s-1')
      const settled = vi.fn()
      void pending.then(settled)

      // Within the grace window: still waiting (a stream may attach).
      await vi.advanceTimersByTimeAsync(BUDGETS.connectGraceMs - 1)
      expect(settled).not.toHaveBeenCalled()
      // Grace expires → attempt 1 transport-fails → attempt 2 starts (new callId, new grace).
      await vi.advanceTimersByTimeAsync(1)
      expect(settled).not.toHaveBeenCalled()
      // Second attempt's grace expiry → the retry budget is spent.
      await vi.advanceTimersByTimeAsync(BUDGETS.connectGraceMs)
      const result = await pending

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe(BRIDGE_TRANSPORT_CODE)
        expect(result.message).toMatch(/no renderer bridge stream/i)
      }
      // Retry-once: two attempts were minted.
      expect(mintSeq - before).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('times a delivered-but-unanswered call out at the per-call budget (renderer frozen), then degrades', async () => {
    vi.useFakeTimers()
    try {
      const before = mintSeq
      const core = createToolBridgeCore({ budgets: BUDGETS, mintCallId })
      const pending = core.callWithRetry('task_get', { projectId: 'p1', taskKey: 'feat/1.3' }, 'session:s-1')
      const stream = attachStream(core)

      // Attempt 1: the frame is delivered (pulled from the stream) but never answered.
      const firstFrame = await pullFrame(stream)
      await vi.advanceTimersByTimeAsync(BUDGETS.callBudgetMs)

      // Attempt 2 (retry): delivered to the same live stream, also unanswered → budget again.
      const retryFrame = await pullFrame(stream)
      expect(retryFrame.callId).not.toBe(firstFrame.callId)
      await vi.advanceTimersByTimeAsync(BUDGETS.callBudgetMs)

      const result = await pending
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.code).toBe(BRIDGE_TRANSPORT_CODE)
      expect(mintSeq - before).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores a late answer for an expired callId idempotently (no throw, no state change)', async () => {
    vi.useFakeTimers()
    try {
      const core = createToolBridgeCore({ budgets: BUDGETS, mintCallId })
      const stream = attachStream(core)
      const pending = core.callWithRetry('task_get', { projectId: 'p1', taskKey: 'feat/1.3' }, 'session:s-1')
      const iterator = stream[Symbol.asyncIterator]()
      const next = iterator.next()
      await Promise.resolve()
      const expiredFrame = (await next).value as ForgeToolBridgeCall
      await vi.advanceTimersByTimeAsync(BUDGETS.callBudgetMs + BUDGETS.callBudgetMs + BUDGETS.connectGraceMs)
      await pending

      // The stale frame's answer arrives long after the call degraded.
      expect(() => core.settleFromClient({ callId: expiredFrame.callId, ok: true, value: {} }))
        .not.toThrow()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('tool bridge authority boundary through the full chain (AC-3)', () => {
  it('returns the files-project write rejection as a business value carrying the CLI hint (no retry, no throw)', async () => {
    const before = mintSeq
    const core = createToolBridgeCore({ budgets: BUDGETS, mintCallId })
    const stream = attachStream(core)
    const rejection = Object.assign(new Error('envelope'), {
      message: JSON.stringify({
        code: 'ERR_TASK_NOT_AUTHORITATIVE',
        message: "project p1 is not sqlite-authoritative yet (data_authority='files'); use the forge CLI for task writes on this project (dual-form discipline)",
      }),
    })
    const { bridge } = stubBridge({ taskAdd: rejection })

    const pending = core.callWithRetry('task_add', { projectId: 'p1', featureSlug: 'feat', title: 'T' }, 'session:s-1')
    void roundTrip(core, stream, bridge)
    const result = await pending

    // Business rejection: surfaced as a value, single attempt (never retried).
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('ERR_TASK_NOT_AUTHORITATIVE')
      expect(result.message).toMatch(/use the forge CLI/)
    }
    expect(mintSeq - before).toBe(1)
  })

  it('normalizes an unclassified IPC rejection into the ERR_WORKBENCH_DB fallback envelope', async () => {
    const core = createToolBridgeCore({ budgets: BUDGETS, mintCallId })
    const stream = attachStream(core)
    const { bridge } = stubBridge({ taskQuery: new Error('Error invoking remote method: boom') })

    const pending = core.callWithRetry('task_query', { projectId: 'p1' }, 'session:s-1')
    void roundTrip(core, stream, bridge)
    const result = await pending

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('ERR_WORKBENCH_DB')
  })

  it('answers an unregistered project with the kernel rejection value (not in the tool operating set)', async () => {
    const core = createToolBridgeCore({ budgets: BUDGETS, mintCallId })
    const stream = attachStream(core)
    const { bridge } = stubBridge({
      taskGet: new Error(JSON.stringify({ code: 'ERR_PROJECT_NOT_FOUND', message: 'project p-unknown does not exist' })),
    })

    const pending = core.callWithRetry('task_get', { projectId: 'p-unknown', taskKey: 'feat/1.3' }, 'session:s-1')
    void roundTrip(core, stream, bridge)
    const result = await pending

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('ERR_PROJECT_NOT_FOUND')
  })
})

describe('tool bridge client pump (AC-1 renderer leg)', () => {
  it('pumps stream frames through the closed-verb dispatch and answers each by callId', async () => {
    const { bridge, calls } = stubBridge({ taskClaim: { key: 'feat/1.3', status: 'in_progress' } })
    const frames: ForgeToolBridgeCall[] = [
      { callId: 'c-1', verb: 'task_claim', args: { projectId: 'p1', taskKey: 'feat/1.3' }, actor: 'session:s-1' },
      { callId: 'c-2', verb: 'task_list', args: { projectId: 'p1' }, actor: 'session:s-1' },
    ]
    const answers: ForgeToolBridgeAnswer[] = []
    let releaseFrames: (() => void) | undefined
    const openStream = (): AsyncIterable<ForgeToolBridgeCall> => ({
      [Symbol.asyncIterator]: () => ({
        async next(): Promise<IteratorResult<ForgeToolBridgeCall>> {
          const frame = frames.shift()
          if (frame !== undefined) return { value: frame, done: false }
          releaseFrames = undefined
          await new Promise<void>((resolve) => { releaseFrames = resolve })
          return { value: undefined as never, done: true }
        },
      }),
    })
    const pump = runToolBridgePump({
      bridge,
      openStream,
      sendAnswer: async (answer) => { answers.push(answer) },
      reopenDelayMs: 0,
    })
    // Let both frames flow through dispatch + answer.
    await new Promise((resolve) => { setTimeout(resolve, 20) })
    pump.stop()
    releaseFrames?.()

    expect(calls.map(entry => entry.member).sort()).toEqual(['taskClaim', 'taskQuery'])
    expect(answers.map(answer => answer.callId).sort()).toEqual(['c-1', 'c-2'])
    expect(answers.find(answer => answer.callId === 'c-1')).toMatchObject({ ok: true, value: { key: 'feat/1.3', status: 'in_progress' } })
  })
})

describe('taskKey board-address validation (AC-2, tool-face mirror of the kernel rule)', () => {
  it.each([
    ['feat/1.3', true],
    ['feat/5.gate', true],
    ['feat/T-review-doc', true],
    ['feat/disc-1', true],
    ['1.3', false],            // bare local id — the M2-disproved assumption
    ['feat/1.3/x', false],     // multi-segment
    ['feat', false],           // no separator
    ['', false],
    ['feat/1\\3', false],      // path separator
    ['feat/1\n3', false],      // control character
  ])('isBoardTaskKeyAddress(%j) → %s', (key, expected) => {
    expect(isBoardTaskKeyAddress(key)).toBe(expected)
  })
})

function taskSummaryStub(): Record<string, unknown> {
  return { key: 'feat/1.3', title: 'T', status: 'pending', featureSlug: 'feat', blockers: [] }
}


describe('tool bridge client installer (AC-1 mount wiring, guarded lifecycle)', () => {
  it('mounts the namespace, starts the pump, answers by callId, and tears down cleanly', async () => {
    const { bridge, calls } = stubBridge({ taskClaim: { key: 'feat/1.3', status: 'in_progress' } })
    vi.stubGlobal('dshForge', { workbench: bridge })

    // A minimal client cordis context: effect/inject/get over a service table.
    const effects: Array<() => void> = []
    const serviceTable = new Map<string, unknown>()
    const answers: ForgeToolBridgeAnswer[] = []
    let releaseFrames: (() => void) | undefined
    let mountedContribution = ''
    let servedFrame = false
    const namespace = {
      calls: (): AsyncIterable<ForgeToolBridgeCall> => ({
        [Symbol.asyncIterator]: () => ({
          async next(): Promise<IteratorResult<ForgeToolBridgeCall>> {
            if (servedFrame) {
              await new Promise<void>((resolve) => { releaseFrames = resolve })
              return { value: undefined as never, done: true }
            }
            servedFrame = true
            await Promise.resolve()
            return { value: { callId: 'c-9', verb: 'task_claim', args: { projectId: 'p1', taskKey: 'feat/1.3' }, actor: 'session:s-9' }, done: false }
          },
        }),
      }),
      answer: async (answer: ForgeToolBridgeAnswer): Promise<{ ok: true }> => {
        answers.push(answer)
        return { ok: true }
      },
    }
    serviceTable.set('remote', {
      $mount: async (contribution: { package: string }) => {
        mountedContribution = contribution.package
        serviceTable.set('remote.forgeToolBridge', namespace)
        return async () => { serviceTable.delete('remote.forgeToolBridge') }
      },
    })
    const baseContext = {
      effect: (fn: () => (() => void) | void): (() => void) => {
        const dispose = fn()
        if (typeof dispose === 'function') effects.push(dispose)
        return () => {}
      },
      inject: (names: string[], body: (sub: unknown) => void) => {
        expect(names).toEqual(['remote'])
        body({
          get: (key: string) => serviceTable.get(key),
          effect: (fn: () => (() => void) | void) => baseContext.effect(fn),
        })
        return { dispose: () => {} }
      },
      get: (key: string) => serviceTable.get(key),
    }

    const dispose = installToolBridgeClient(baseContext as never)
    // Mount is async: let the $mount promise + the pump's first frames flow.
    await new Promise((resolve) => { setTimeout(resolve, 20) })

    expect(mountedContribution).toBe('@dsh-forge/plugin-forge-workbench')
    expect(calls.map(entry => entry.member)).toEqual(['taskClaim'])
    expect(calls[0]?.args[1]).toBe('session:s-9')
    expect(answers.map(answer => answer.callId)).toContain('c-9')
    expect(answers.find(answer => answer.callId === 'c-9')?.ok).toBe(true)

    dispose()
    for (const effectDispose of effects.splice(0)) effectDispose()
    releaseFrames?.()
    vi.unstubAllGlobals()
  })

  it('is a silent no-op without the preload bridge (hostless worlds)', () => {
    vi.stubGlobal('dshForge', undefined)
    const dispose = installToolBridgeClient({} as never)
    expect(() => dispose()).not.toThrow()
    vi.unstubAllGlobals()
  })
})


describe('tool bridge client degradation paths (AC-4 renderer legs)', () => {
  it('reopens the stream after a carrier failure and keeps answering (self-healing pump)', async () => {
    const { bridge, calls } = stubBridge({ taskQuery: [] })
    let generations = 0
    let servedFrame = false
    let releaseFrames: (() => void) | undefined
    const openStream = (): AsyncIterable<ForgeToolBridgeCall> => ({
      [Symbol.asyncIterator]: () => ({
        async next(): Promise<IteratorResult<ForgeToolBridgeCall>> {
          generations += 1
          if (servedFrame) throw new Error('carrier lost')
          servedFrame = true
          return {
            value: { callId: 'c-r', verb: 'task_list', args: { projectId: 'p1' }, actor: 'session:s-1' },
            done: false,
          }
        },
        async return(): Promise<IteratorResult<ForgeToolBridgeCall>> {
          releaseFrames?.()
          return { value: undefined as never, done: true }
        },
      }),
    })
    const answers: ForgeToolBridgeAnswer[] = []
    const pump = runToolBridgePump({
      bridge,
      openStream,
      sendAnswer: async (answer) => { answers.push(answer) },
      reopenDelayMs: 0,
    })
    await new Promise((resolve) => { setTimeout(resolve, 20) })
    pump.stop()
    releaseFrames?.()

    // Frame 1 answered; the next generation threw → the pump reopened and threw
    // again in a tight loop (delay 0) — observable only as repeated generations,
    // never as an unhandled rejection or a stopped pump before stop().
    expect(generations).toBeGreaterThan(1)
    expect(calls.map(entry => entry.member)).toEqual(['taskQuery'])
    expect(answers.map(answer => answer.callId)).toEqual(['c-r'])
  })

  it('swallows a failing answer leg (the host degrades that call by budget, never the pump)', async () => {
    const { bridge } = stubBridge({ taskGet: { summary: taskSummaryStub() } })
    let servedFrame = false
    let releaseFrames: (() => void) | undefined
    const openStream = (): AsyncIterable<ForgeToolBridgeCall> => ({
      [Symbol.asyncIterator]: () => ({
        async next(): Promise<IteratorResult<ForgeToolBridgeCall>> {
          if (servedFrame) {
            await new Promise<void>((resolve) => { releaseFrames = resolve })
            return { value: undefined as never, done: true }
          }
          servedFrame = true
          return {
            value: { callId: 'c-x', verb: 'task_get', args: { projectId: 'p1', taskKey: 'feat/1.3' }, actor: 'session:s-1' },
            done: false,
          }
        },
      }),
    })
    const pump = runToolBridgePump({
      bridge,
      openStream,
      sendAnswer: async () => { throw new Error('answer leg down') },
      reopenDelayMs: 0,
    })
    await new Promise((resolve) => { setTimeout(resolve, 20) })
    pump.stop()
    releaseFrames?.()
    // Reaching this point without an unhandled rejection is the assertion.
  })

  it('stays silent when the mount is refused or the namespace is absent', async () => {
    vi.stubGlobal('dshForge', { workbench: stubBridge().bridge })
    const serviceTable = new Map<string, unknown>()
    const baseContext = {
      effect: (fn: () => (() => void) | void): (() => void) => {
        const dispose = fn()
        return typeof dispose === 'function' ? () => dispose() : () => {}
      },
      inject: (names: string[], body: (sub: unknown) => void) => {
        body({
          get: (key: string) => serviceTable.get(key),
          effect: (fn: () => (() => void) | void) => baseContext.effect(fn),
        })
        return { dispose: () => {} }
      },
      get: (key: string) => serviceTable.get(key),
    }

    // Mount refused (contribution conflict): silent — the host budget degrades.
    serviceTable.set('remote', { $mount: async () => Promise.reject(new Error('registry closed')) })
    expect(() => installToolBridgeClient(baseContext as never)).not.toThrow()
    await new Promise((resolve) => { setTimeout(resolve, 10) })

    // Mount resolves but the namespace never appears: disposes the mount, no pump.
    let mountDisposed = false
    serviceTable.set('remote', {
      $mount: async () => async () => { mountDisposed = true },
    })
    const dispose = installToolBridgeClient(baseContext as never)
    await new Promise((resolve) => { setTimeout(resolve, 10) })
    dispose()
    expect(mountDisposed).toBe(true)
    vi.unstubAllGlobals()
  })
})
