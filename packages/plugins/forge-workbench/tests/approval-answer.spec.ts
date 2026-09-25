// Task 6.5 — the renderer approval-answer leg (SC3's 决策送达链 driver):
//   ① the decision delivery (decideApproval resolves → the host bridge's
//      settle face fires with the same approvalId/approve pair — the subagent
//      side learns the human decision, spike-2 §1.3 ③);
//   ② the module-slot consumption through createIpcDispatchFace (decided rows
//      ride the installed relay; verb rejections never do; absent relay = the
//      kernel-only semantics — the row is decided, delivery waits);
//   ③ the installer (namespace arming, late mount polling, uninstall clears).
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  approvalAnswerRelayOf, deliverApprovalAnswer, installApprovalAnswerRelay, setApprovalAnswerRelay,
} from '../src/client/ipc/approval-answer.ts'
import {
  createIpcDispatchFace, type ApprovalRow, type WorkbenchIpcBridge,
} from '../src/client/ipc/workbench.ts'

const decidedRow = (overrides: Partial<ApprovalRow> = {}): ApprovalRow => ({
  id: 'apr-1',
  dispatchId: 'dsp-1',
  projectId: 'p1',
  taskKey: 'demo/2.1',
  sessionId: 'session-1',
  payload: null,
  state: 'approved',
  createdAt: '2026-09-24T00:00:00.000Z',
  decidedAt: '2026-09-24T00:01:00.000Z',
  decidedBy: 'workbench',
  ...overrides,
})

/** A fake bridge recording the decide verb (everything else throws). */
function decideBridge(result: Promise<ApprovalRow> | ApprovalRow): { bridge: WorkbenchIpcBridge; calls: string[] } {
  const calls: string[] = []
  const bridge = {
    decideApproval: async (input: { readonly approvalId: string; readonly approve: boolean }): Promise<ApprovalRow> => {
      calls.push(`decide:${input.approvalId}:${String(input.approve)}`)
      return result
    },
  } as unknown as WorkbenchIpcBridge
  return { bridge, calls }
}

describe('approval answer: the IPC face consumption (module slot)', () => {
  const restoreAfter: Array<() => void> = []
  afterEach(() => {
    while (restoreAfter.length > 0) restoreAfter.pop()?.()
    setApprovalAnswerRelay(undefined)
  })

  it('a decided row rides the installed relay with the same id/verdict pair', async () => {
    const { bridge } = decideBridge(decidedRow())
    const answered: Array<{ approvalId: string; approve: boolean }> = []
    restoreAfter.push(setApprovalAnswerRelay({
      answerDecision: (approvalId, approve) => { answered.push({ approvalId, approve }) },
    }))
    const face = createIpcDispatchFace(bridge)
    const row = await face.decideApproval({ approvalId: 'apr-1', approve: true }, 'workbench')
    expect(row.state).toBe('approved')
    expect(answered).toEqual([{ approvalId: 'apr-1', approve: true }])
  })

  it('rejections and re-decided rows never open the answer channel', async () => {
    const { bridge } = decideBridge(Promise.reject(new Error('ERR_APPROVAL_DECIDED')))
    const answered: unknown[] = []
    restoreAfter.push(setApprovalAnswerRelay({
      answerDecision: (approvalId, approve) => { answered.push({ approvalId, approve }) },
    }))
    const face = createIpcDispatchFace(bridge)
    await expect(face.decideApproval({ approvalId: 'apr-1', approve: false }, 'workbench'))
      .rejects.toThrow('ERR_APPROVAL_DECIDED')
    expect(answered).toEqual([])
  })

  it('no installed relay = the verb still answers (kernel-only semantics)', async () => {
    setApprovalAnswerRelay(undefined)
    const { bridge, calls } = decideBridge(decidedRow({ state: 'rejected' }))
    const face = createIpcDispatchFace(bridge)
    const row = await face.decideApproval({ approvalId: 'apr-1', approve: false }, 'workbench')
    expect(row.state).toBe('rejected')
    expect(calls).toEqual(['decide:apr-1:false'])
  })
})

// ---------------------------------------------------------------------------
// The delivery leg (the mounted namespace face)
// ---------------------------------------------------------------------------

describe('approval answer: the delivery leg', () => {
  it('answers through the mounted namespace and swallows transport failures', async () => {
    const answer = vi.fn(async () => ({ ok: true, value: { settled: true } }))
    await deliverApprovalAnswer({ answer }, 'apr-1', true)
    expect(answer).toHaveBeenCalledWith({ approvalId: 'apr-1', approve: true })

    const throwing = vi.fn(async () => { throw new Error('gateway gone') })
    await expect(deliverApprovalAnswer({ answer: throwing }, 'apr-2', false)).resolves.toBeUndefined()
    expect(throwing).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// The installer (fake-context harness — the dispatch-relay.spec discipline)
// ---------------------------------------------------------------------------

/** A minimal cordis-shaped fake: service table + effect + inject passthrough. */
function fakeContext() {
  const serviceTable = new Map<string, unknown>()
  const disposers: Array<() => void> = []
  const baseContext = {
    effect: (fn: () => (() => void) | void): (() => void) => {
      const dispose = fn()
      const run = typeof dispose === 'function' ? dispose : () => {}
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

describe('approval answer: the installer', () => {
  const restoreAfter: Array<() => void> = []
  afterEach(() => {
    while (restoreAfter.length > 0) restoreAfter.pop()?.()
    setApprovalAnswerRelay(undefined)
  })

  it('arms the slot once the approvalBridge namespace is already mounted', async () => {
    const { context, serviceTable } = fakeContext()
    serviceTable.set('remote.approvalBridge', { answer: async () => ({ ok: true, value: { settled: true } }) })
    restoreAfter.push(installApprovalAnswerRelay(context as never))
    await new Promise((resolve) => { setTimeout(resolve, 10) })
    expect(approvalAnswerRelayOf()).toBeDefined()
  })

  it('polls until the namespace appears (the shared mount lands late)', async () => {
    vi.useFakeTimers()
    try {
      const { context, serviceTable } = fakeContext()
      restoreAfter.push(installApprovalAnswerRelay(context as never))
      expect(approvalAnswerRelayOf()).toBeUndefined() // namespace absent — waits
      serviceTable.set('remote.approvalBridge', { answer: async () => ({ ok: true, value: { settled: true } }) })
      await vi.advanceTimersByTimeAsync(300)
      expect(approvalAnswerRelayOf()).toBeDefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('no inject face = no-op; uninstall clears the slot', async () => {
    const context = { get: () => undefined } // no inject
    expect(() => installApprovalAnswerRelay(context as never)).not.toThrow()
    expect(approvalAnswerRelayOf()).toBeUndefined()

    const { context: ctx, serviceTable, disposeAll } = fakeContext()
    serviceTable.set('remote.approvalBridge', { answer: async () => ({ ok: true, value: { settled: false } }) })
    const uninstall = installApprovalAnswerRelay(ctx as never)
    await new Promise((resolve) => { setTimeout(resolve, 10) })
    expect(approvalAnswerRelayOf()).toBeDefined()
    uninstall()
    expect(approvalAnswerRelayOf()).toBeUndefined()
    disposeAll()
  })
})
