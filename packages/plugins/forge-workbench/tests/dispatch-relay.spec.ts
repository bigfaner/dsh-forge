// Task 6.3 — the renderer launch relay (SC1's 两段式派发链 driver leg):
//   ① the request mapping (DispatchedRow → host DispatchLaunchRequest);
//   ② the outcome backfill (ok+sessionId → notifySessionStarted; launch
//      failure → notifyLaunchFailed with the reason; gateway/transport
//      failure = the launch never happened → whole batch failed + reason);
//   ③ the module-slot consumption through createIpcDispatchFace
//      (dispatched results ride the installed relay; blocked results never
//      do; absent relay = the kernel's rows-stay-starting semantics).
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DispatchedRow } from '../src/client/ipc-types.ts'
import {
  dispatchLaunchRelayOf, installDispatchLaunchRelay, launchRequestOf, relayDispatchedRows, setDispatchLaunchRelay,
} from '../src/client/ipc/dispatch-relay.ts'
import {
  createIpcDispatchFace, type WorkbenchIpcBridge,
} from '../src/client/ipc/workbench.ts'

const dispatchedRow = (overrides: Partial<DispatchedRow> = {}): DispatchedRow => ({
  id: 'dsp-1',
  batchId: 'batch-1',
  projectId: 'p1',
  featureSlug: 'demo',
  taskKey: 'demo/2.1',
  state: 'starting',
  sessionId: 'session-premint',
  promptHash: 'hash-abc',
  actor: 'dispatcher',
  dispatchedAt: '2026-09-24T00:00:00.000Z',
  endedAt: null,
  error: null,
  launch: {
    prompt: 'presynthesized first message',
    promptHash: 'hash-abc',
    sessionId: 'session-premint',
    cwd: 'Z:/repo/demo',
    taskType: 'coding.feature',
  },
  ...overrides,
})

describe('dispatch relay: request mapping', () => {
  it('merges the row fields with the launch payload field-for-field', () => {
    const request = launchRequestOf(dispatchedRow())
    expect(request).toEqual({
      dispatchId: 'dsp-1',
      batchId: 'batch-1',
      projectId: 'p1',
      featureSlug: 'demo',
      taskKey: 'demo/2.1',
      taskType: 'coding.feature',
      prompt: 'presynthesized first message',
      promptHash: 'hash-abc',
      sessionId: 'session-premint',
      cwd: 'Z:/repo/demo',
    })
  })
})

/** A fake bridge recording the notify verbs (everything else throws). */
function notifyBridge(calls: string[]): WorkbenchIpcBridge {
  const reject = (verb: string) => (): never => { throw new Error(`unexpected bridge call: ${verb}`) }
  return {
    notifySessionStarted: async (dispatchId, sessionId) => {
      calls.push(`started:${dispatchId}:${sessionId}`)
      return dispatchedRow({ id: dispatchId, state: 'running' })
    },
    notifyLaunchFailed: async (dispatchId, error) => {
      calls.push(`failed:${dispatchId}:${error}`)
      return dispatchedRow({ id: dispatchId, state: 'failed' })
    },
    dispatchTasks: reject('dispatchTasks'),
    redispatch: reject('redispatch'),
  } as unknown as WorkbenchIpcBridge
}

describe('dispatch relay: outcome backfill', () => {
  it('ok outcomes backfill running (premint fallback when the host mints)', async () => {
    const calls: string[] = []
    const namespace = {
      launch: vi.fn(async () => ({ ok: true, value: { results: [{ ok: true, sessionId: 'session-adopted' }] } })),
    }
    await relayDispatchedRows(namespace, notifyBridge(calls), [dispatchedRow()])
    expect(namespace.launch).toHaveBeenCalledWith({
      launches: [launchRequestOf(dispatchedRow())],
    })
    expect(calls).toEqual(['started:dsp-1:session-adopted'])
  })

  it('launch failures backfill failed + the host reason (explicit, never silent)', async () => {
    const calls: string[] = []
    const namespace = {
      launch: vi.fn(async () => ({
        ok: true,
        value: { results: [{ ok: false, code: 'ERR_DISPATCH_LAUNCH_FAILED', error: 'create leg exploded' }] },
      })),
    }
    await relayDispatchedRows(namespace, notifyBridge(calls), [dispatchedRow()])
    expect(calls).toEqual(['failed:dsp-1:ERR_DISPATCH_LAUNCH_FAILED: create leg exploded'])
  })

  it('a missing outcome row is an explicit launch failure (no silent starting leak)', async () => {
    const calls: string[] = []
    const namespace = { launch: vi.fn(async () => ({ ok: true, value: { results: [] } })) }
    await relayDispatchedRows(namespace, notifyBridge(calls), [dispatchedRow()])
    expect(calls[0]).toMatch(/^failed:dsp-1:/)
  })

  it('gateway/transport failure = the launch never happened → whole batch failed', async () => {
    const calls: string[] = []
    const rows = [dispatchedRow(), dispatchedRow({ id: 'dsp-2', taskKey: 'demo/2.2' })]
    const namespace = {
      launch: vi.fn(async () => ({ ok: false, error: { code: 'GATEWAY_TIMEOUT', message: 'no route' } })),
    }
    await relayDispatchedRows(namespace, notifyBridge(calls), rows)
    expect(calls).toHaveLength(2)
    for (const call of calls) expect(call).toMatch(/^failed:dsp-[12]:dispatchLaunch channel failed: GATEWAY_TIMEOUT: no route$/)
  })

  it('an empty batch never opens the channel', async () => {
    const namespace = { launch: vi.fn() }
    await relayDispatchedRows(namespace, notifyBridge([]), [])
    expect(namespace.launch).not.toHaveBeenCalled()
  })
})

describe('dispatch relay: the IPC face consumption (module slot)', () => {
  const restoreAfter: Array<() => void> = []
  afterEach(() => {
    while (restoreAfter.length > 0) restoreAfter.pop()?.()
  })

  const bridgeWith = (result: unknown): { bridge: WorkbenchIpcBridge; dispatched: unknown } => {
    const seen: unknown[] = []
    const bridge = {
      checkStageArtifacts: async () => ({ stage: 'tasks', satisfied: true, missing: [] }),
      dispatchTasks: async (input: unknown, actor: string) => {
        seen.push({ input, actor })
        return result
      },
      redispatch: async () => result,
    } as unknown as WorkbenchIpcBridge
    return { bridge, dispatched: seen }
  }

  it('dispatched results ride the installed relay; blocked results never do', async () => {
    const rows = [dispatchedRow()]
    const { bridge } = bridgeWith({ dispatched: rows })
    const relayed: readonly DispatchedRow[][] = []
    restoreAfter.push(setDispatchLaunchRelay({
      relayDispatched: (batch) => { relayed.push([...batch]) },
    }))
    const face = createIpcDispatchFace(bridge)
    await face.dispatchTasks({ projectId: 'p1', taskKeys: ['demo/2.1'] }, 'dispatcher')
    expect(relayed).toEqual([rows])

    await face.dispatchTasks({ projectId: 'p1', taskKeys: ['demo/2.1'] }, 'dispatcher')
    expect(relayed).toHaveLength(2) // every dispatched call relays

    const { bridge: blockedBridge } = bridgeWith({ blocked: 'artifacts-missing', missing: [] })
    const blockedFace = createIpcDispatchFace(blockedBridge)
    await blockedFace.dispatchTasks({ projectId: 'p1', taskKeys: ['demo/2.1'] }, 'dispatcher')
    expect(relayed).toHaveLength(2) // blocked: zero rows, zero relay
  })

  it('redispatch relays through the same seam', async () => {
    const rows = [dispatchedRow({ id: 'dsp-9' })]
    const { bridge } = bridgeWith({ dispatched: rows })
    const relayed: readonly DispatchedRow[][] = []
    restoreAfter.push(setDispatchLaunchRelay({
      relayDispatched: (batch) => { relayed.push([...batch]) },
    }))
    const face = createIpcDispatchFace(bridge)
    await face.redispatch('dsp-8', 'dispatcher')
    expect(relayed).toEqual([rows])
  })

  it('no installed relay = the face still answers (rows stay starting, kernel semantics)', async () => {
    setDispatchLaunchRelay(undefined)
    const rows = [dispatchedRow()]
    const { bridge, dispatched } = bridgeWith({ dispatched: rows })
    const face = createIpcDispatchFace(bridge)
    const result = await face.dispatchTasks({ projectId: 'p1', taskKeys: ['demo/2.1'] }, 'dispatcher')
    expect(result).toEqual({ dispatched: rows })
    expect(dispatched).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// The installer (fake-context harness — the tool-bridge-core.spec discipline)
// ---------------------------------------------------------------------------

/** A minimal cordis-shaped fake: service table + effect + inject passthrough. */
function fakeContext() {
  const serviceTable = new Map<string, unknown>()
  const disposers: Array<() => void> = []
  const baseContext = {
    effect: (fn: () => (() => void) | void): (() => void) => {
      const dispose = fn()
      const run = typeof dispose === 'function' ? () => dispose() : () => {}
      disposers.push(run)
      return run
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
  return { context: baseContext, serviceTable, disposeAll: () => { while (disposers.length > 0) disposers.pop()?.() } }
}

describe('dispatch relay: the installer', () => {
  const restoreAfter: Array<() => void> = []
  afterEach(() => {
    while (restoreAfter.length > 0) restoreAfter.pop()?.()
  })

  it('arms the slot once the dispatchLaunch namespace is already mounted', async () => {
    vi.stubGlobal('dshForge', { workbench: { taskClaim: async () => {}, notifySessionStarted: async () => {}, notifyLaunchFailed: async () => {} } })
    const { context, serviceTable } = fakeContext()
    serviceTable.set('remote.dispatchLaunch', { launch: async () => ({ ok: true, value: { results: [] } }) })
    const uninstall = installDispatchLaunchRelay(context as never, {} as never)
    restoreAfter.push(uninstall)
    // The already-mounted namespace arms synchronously inside the fiber.
    await new Promise((resolve) => { setTimeout(resolve, 10) })
    expect(dispatchLaunchRelayOf()).toBeDefined()
    // The armed slot relays through the mounted namespace (empty batch = no-op).
    dispatchLaunchRelayOf()?.relayDispatched([])
    vi.unstubAllGlobals()
  })

  it('polls until the namespace appears (the tool-bridge mount lands late)', async () => {
    vi.useFakeTimers()
    try {
      vi.stubGlobal('dshForge', { workbench: { taskClaim: async () => {}, notifySessionStarted: async () => {}, notifyLaunchFailed: async () => {} } })
      const { context, serviceTable } = fakeContext()
      const uninstall = installDispatchLaunchRelay(context as never, {} as never)
      restoreAfter.push(uninstall)
      expect(dispatchLaunchRelayOf()).toBeUndefined() // namespace absent — waits
      serviceTable.set('remote.dispatchLaunch', { launch: async () => ({ ok: true, value: { results: [] } }) })
      await vi.advanceTimersByTimeAsync(300)
      expect(dispatchLaunchRelayOf()).toBeDefined()
      vi.unstubAllGlobals()
    } finally {
      vi.useRealTimers()
    }
  })

  it('no inject face = no-op; uninstall clears the slot', async () => {
    const context = { get: () => undefined } // no inject
    expect(() => installDispatchLaunchRelay(context as never, {} as never)).not.toThrow()
    expect(dispatchLaunchRelayOf()).toBeUndefined()

    vi.stubGlobal('dshForge', { workbench: { taskClaim: async () => {}, notifySessionStarted: async () => {}, notifyLaunchFailed: async () => {} } })
    const { context: ctx, serviceTable, disposeAll } = fakeContext()
    serviceTable.set('remote.dispatchLaunch', { launch: async () => ({ ok: true, value: { results: [] } }) })
    const uninstall = installDispatchLaunchRelay(ctx as never, {} as never)
    await new Promise((resolve) => { setTimeout(resolve, 10) })
    expect(dispatchLaunchRelayOf()).toBeDefined()
    uninstall()
    expect(dispatchLaunchRelayOf()).toBeUndefined()
    disposeAll()
    vi.unstubAllGlobals()
  })
})
