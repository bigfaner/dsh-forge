// Task 3.5 unit legs — the approval-bridge host core (the `approval/request`
// waterfall claim → kernel pending row → decideApproval answer round trip) +
// its rpc face + the attach wiring. AC groups (task file):
//
//   审批往返 — 派发会话审批事件 → 内核 receiveApproval(pending + awaiting
//             联动入参面)→ settle(批准/拒绝)→ 'allowed-once'/'rejected'
//             原生回注;非派发会话 → next() 委派(上游链零改动);FORGE_
//             ACTOR 透传 = sessionId 与 dispatch.session_id 同键直 join
//             (spike-2 §2)。
//   payload  — 事件字段(toolName/reason/callId)+ pre-execute callId join 的
//             arguments(spike-2 §3);核销即弃。
//   降级     — 内核不可达 → 'unavailable'(fail-closed 显式,上游文案区分
//             「无审批通道」,禁静默);turn abort → 'cancelled' + 内核核销
//             (decideApproval(approve=false, actor='kernel')形态);starting
//             竞态有界重试;晚到决策幂等。
//
// The kernel is a stubbed port (the production carrier = the T2 tool bridge,
// already covered by forge-tools.spec); the upstream waterfall event is the
// structural twin (spike-2 §1.1).

import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import {
  createApprovalBridgeCore,
  createPreExecuteCapture,
  type ApprovalKernelPort,
  type ApprovalOutcome,
  type SubagentApprovalRequest,
} from '../src/host/approval-bridge/bridge.ts'
// The decorator-bearing rpc class is loaded through the tsc-lowered build
// output (session-launch.spec precedent).
import { ApprovalBridgeService, attachApprovalBridge } from '../lib/types/host/approval-bridge/rpc.js'

/** 内核端口 stub:入列/核销调用观测 + 行为可编排。 */
/** 内核端口 stub 的观测面。 */
interface KernelStubObs {
  receiveCalls: Array<{ dispatchId: string; sessionId: string; payload: Record<string, unknown> }>
  rejectCalls: Array<{ approvalId: string; actor: string }>
}

function makeKernel(behavior: {
  approvalSeq?: string[]
  receiveError?: (call: number) => Error | undefined
} = {}): ApprovalKernelPort & KernelStubObs {
  const receiveCalls: KernelStubObs['receiveCalls'] = []
  const rejectCalls: KernelStubObs['rejectCalls'] = []
  const seq = [...(behavior.approvalSeq ?? ['a-1'])]
  let call = 0
  return {
    receiveCalls,
    rejectCalls,
    receiveApproval: vi.fn(async (input: { dispatchId: string; sessionId: string; payload: Record<string, unknown> }) => {
      call += 1
      receiveCalls.push({ dispatchId: input.dispatchId, sessionId: input.sessionId, payload: input.payload })
      const error = behavior.receiveError?.(call)
      if (error !== undefined) throw error
      return { approvalId: seq.shift() ?? 'a-late' }
    }),
    rejectApproval: vi.fn(async (input: { approvalId: string }, actor: string) => {
      rejectCalls.push({ approvalId: input.approvalId, actor })
      return { id: input.approvalId, state: 'rejected' }
    }),
  } as unknown as ApprovalKernelPort & KernelStubObs
}

function makeCore(
  kernel: ApprovalKernelPort,
  overrides: {
    resolveDispatch?: (sessionId: string) => { dispatchId: string } | null
    argumentsOf?: (callId: string) => unknown
    dropCapture?: (callId: string) => void
    receiveRetry?: { attempts: number; delayMs: number }
  } = {},
) {
  return createApprovalBridgeCore({
    resolveDispatch: overrides.resolveDispatch ?? (sessionId => (sessionId === 'session-dispatch-1' ? { dispatchId: 'd-1' } : null)),
    kernel,
    ...(overrides.argumentsOf === undefined ? {} : { argumentsOf: overrides.argumentsOf }),
    ...(overrides.dropCapture === undefined ? {} : { dropCapture: overrides.dropCapture }),
    ...(overrides.receiveRetry === undefined ? {} : { receiveRetry: overrides.receiveRetry }),
  })
}

/** 宏任务冲刷:waitFor 首查同步通过时不排空微任务,handlen 的注册续体在其后。 */
async function flush(): Promise<void> {
  await new Promise((resolve) => { setTimeout(resolve, 0) })
}

/** 一条派发会话审批事件(twin of the upstream ApprovalRequestEvent)。 */
function eventOf(overrides: Partial<SubagentApprovalRequest> = {}): SubagentApprovalRequest {
  return {
    agentId: 'session-dispatch-1',
    toolName: 'bash',
    callId: 'call-1',
    reason: 'sandbox escalation: workspace-write → danger-full-access (build step)',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// 审批往返(AC-4)
// ---------------------------------------------------------------------------

describe('approval-bridge: the round trip (AC-4)', () => {
  it('claims a dispatch-session request, inserts it into the kernel, and answers an approval with allowed-once', async () => {
    const kernel = makeKernel()
    const core = makeCore(kernel)
    const pending = core.handle(eventOf())
    expect(pending).not.toBeNull()
    await vi.waitFor(() => { expect(kernel.receiveCalls).toHaveLength(1) })
    await flush() // 入列腿微任务排空(pending 注册续体)

    // FORGE_ACTOR join discipline (spike-2 §2): the source session id rides
    // the receive input verbatim — same key as dispatch.session_id, no
    // mapping layer; the payload carries category fields (toolName/reason/callId).
    const received = kernel.receiveCalls[0] as (typeof kernel.receiveCalls)[number]
    expect(received).toMatchObject({
      dispatchId: 'd-1',
      sessionId: 'session-dispatch-1',
    })
    expect(received.payload).toMatchObject({ toolName: 'bash', callId: 'call-1' })
    expect(String(received.payload.reason)).toContain('sandbox escalation')

    expect(core.settle('a-1', true)).toEqual({ settled: true })
    await expect(pending).resolves.toBe('allowed-once')
  })

  it('answers a rejection with rejected (no permission granted)', async () => {
    const kernel = makeKernel()
    const core = makeCore(kernel)
    const pending = core.handle(eventOf())
    await vi.waitFor(() => { expect(kernel.receiveCalls).toHaveLength(1) })
    await flush()
    expect(core.settle('a-1', false)).toEqual({ settled: true })
    await expect(pending).resolves.toBe('rejected')
    expect(kernel.rejectCalls).toHaveLength(0) // 人的拒绝不是核销腿
  })

  it('delegates non-dispatch sessions to next() — the upstream chain stays untouched', async () => {
    const kernel = makeKernel()
    const core = makeCore(kernel)
    expect(core.handle(eventOf({ agentId: 'session-human-1' }))).toBeNull() // → 调用方 next()
    expect(kernel.receiveCalls).toHaveLength(0)
  })

  it('forwards pre-execute-joined arguments in the payload and drops the capture on settle (spike-2 §3)', async () => {
    const kernel = makeKernel()
    const dropped: string[] = []
    const core = makeCore(kernel, {
      argumentsOf: callId => (callId === 'call-1' ? { command: 'pnpm build:plugins' } : undefined),
      dropCapture: (callId) => { dropped.push(callId) },
    })
    const pending = core.handle(eventOf())
    await vi.waitFor(() => { expect(kernel.receiveCalls).toHaveLength(1) })
    await flush()
    expect((kernel.receiveCalls[0] as (typeof kernel.receiveCalls)[number]).payload.arguments).toEqual({ command: 'pnpm build:plugins' })
    core.settle('a-1', true)
    await expect(pending).resolves.toBe('allowed-once')
    expect(dropped).toEqual(['call-1']) // 核销即弃
  })
})

// ---------------------------------------------------------------------------
// 降级链(AC-5)
// ---------------------------------------------------------------------------

describe('approval-bridge: degradation chain (AC-5)', () => {
  it('fails closed with unavailable when the kernel port is unreachable (explicit, never silent)', async () => {
    const kernel = makeKernel({ receiveError: () => Object.assign(new Error('forge tool bridge approval_receive: no renderer stream (renderer bridge unavailable)'), { code: 'ERR_TOOL_BRIDGE_UNAVAILABLE' }) })
    const core = makeCore(kernel)
    await expect(core.handle(eventOf())).resolves.toBe('unavailable')
    // 未达即不入列:内核侧不建 pending 行(spike-2 §1.3 ④-1)。
    expect(kernel.rejectCalls).toHaveLength(0)
  })

  it('does NOT retry non-starting business rejections (a dead dispatch fails fast)', async () => {
    const kernel = makeKernel({
      receiveError: () => Object.assign(new Error('dispatch d-1 is failed — approvals can only arrive from a running dispatch'), { code: 'ERR_DISPATCH_STATE_INVALID' }),
    })
    const core = makeCore(kernel, { receiveRetry: { attempts: 4, delayMs: 0 } })
    await expect(core.handle(eventOf())).resolves.toBe('unavailable')
    expect(kernel.receiveCalls).toHaveLength(1)
  })

  it('tolerates the starting race with a bounded retry (relay backfill lands within the window)', async () => {
    let calls = 0
    const kernel = makeKernel({
      receiveError: () => {
        calls += 1
        return calls === 1
          ? Object.assign(new Error('dispatch d-1 is starting — approvals can only arrive from a running dispatch'), { code: 'ERR_DISPATCH_STATE_INVALID' })
          : undefined
      },
    })
    const core = makeCore(kernel, { receiveRetry: { attempts: 4, delayMs: 0 } })
    const pending = core.handle(eventOf())
    await vi.waitFor(() => { expect(kernel.receiveCalls).toHaveLength(2) })
    await flush()
    expect(core.settle('a-1', true)).toEqual({ settled: true })
    await expect(pending).resolves.toBe('allowed-once')
    expect(kernel.receiveCalls).toHaveLength(2) // 1 rejected (starting) + 1 landed
  })

  it('settles cancelled on turn abort and reconciles the kernel row via the kernel-actor leg', async () => {
    const kernel = makeKernel()
    const controller = new AbortController()
    const core = makeCore(kernel)
    const pending = core.handle(eventOf({ signal: controller.signal }))
    await vi.waitFor(() => { expect(kernel.receiveCalls).toHaveLength(1) })
    await flush()
    controller.abort() // turn 取消 = 唯一超时面(spike-2 §1.3 ④-2)
    await expect(pending).resolves.toBe('cancelled')
    // 内核行核销:decideApproval(approve=false) 形态,actor='kernel'(Actor
    // 词表成员;四态→三态映射采 spike-2 §4-5 方案 (a),不改 schema CHECK)。
    expect(kernel.rejectCalls).toEqual([{ approvalId: 'a-1', actor: 'kernel' }])
    // 晚到的人决策:幂等不改结果(已 cancelled 收口)。
    expect(core.settle('a-1', true)).toEqual({ settled: false })
  })

  it('reconciles even when the abort fires DURING the receive leg', async () => {
    const kernel = makeKernel()
    const controller = new AbortController()
    const core = makeCore(kernel)
    const pending = core.handle(eventOf({ signal: controller.signal }))
    controller.abort()
    await expect(pending).resolves.toBe('cancelled')
    // 入列腿仍完成(行已建)→ 核销腿必须到达,否则内核 pending 悬挂。
    await vi.waitFor(() => { expect(kernel.rejectCalls).toEqual([{ approvalId: 'a-1', actor: 'kernel' }]) })
  })

  it('keeps settle idempotent for unknown approvals (answer replays never double-resolve)', () => {
    const core = makeCore(makeKernel())
    expect(core.settle('ghost', true)).toEqual({ settled: false })
  })
})

// ---------------------------------------------------------------------------
// pre-execute 捕获 + attach 面 + rpc 面
// ---------------------------------------------------------------------------

describe('approval-bridge: pre-execute capture, attach wiring, rpc face', () => {
  it('capture joins arguments by callId, bounds its size, and drops on demand', () => {
    const capture = createPreExecuteCapture(2)
    capture.observe({ name: 'bash', callId: 'c-1', arguments: { command: 'ls' } })
    capture.observe({ name: 'fs', arguments: { path: 'x' } }) // 无 callId:不入表
    capture.observe(null)
    expect(capture.argumentsOf('c-1')).toEqual({ command: 'ls' })
    capture.observe({ callId: 'c-2', arguments: { command: 'rm' } })
    capture.observe({ callId: 'c-3', arguments: { command: 'mv' } }) // 逐出 c-1(上限 2)
    expect(capture.argumentsOf('c-1')).toBeUndefined()
    expect(capture.argumentsOf('c-3')).toEqual({ command: 'mv' })
    capture.drop('c-2')
    expect(capture.argumentsOf('c-2')).toBeUndefined()
  })

  interface LooseOnRecord {
    name: string
    listener: (event: unknown, next: () => unknown) => unknown
    options: unknown
  }

  function fakeHostContext(): { ctx: Context; ons: LooseOnRecord[] } {
    const ons: LooseOnRecord[] = []
    const ctx = {
      reflect: { provide: vi.fn() },
      on: vi.fn((name: string, listener: (event: unknown, next: () => unknown) => unknown, options?: unknown) => {
        ons.push({ name, listener, options })
        return () => {}
      }),
    } as unknown as Context
    return { ctx, ons }
  }

  it('attaches the waterfall listener with prepend:true and the pre-execute observer', () => {
    const { ctx, ons } = fakeHostContext()
    const kernel = makeKernel()
    const capture = createPreExecuteCapture()
    attachApprovalBridge(ctx, makeCore(kernel), capture)
    const approval = ons.find(entry => entry.name === 'approval/request')
    const preExecute = ons.find(entry => entry.name === 'tools/pre-execute')
    expect(approval?.options).toEqual({ prepend: true }) // spike-2 §1.3 ② 抢占
    expect(preExecute).toBeDefined()

    // 观察者恒 next()(观察不认领)。
    const next = vi.fn(() => 'chained')
    expect(preExecute?.listener({ callId: 'c-9', arguments: { command: 'x' } }, next)).toBe('chained')
    expect(next).toHaveBeenCalledTimes(1)

    // 畸形事件 → 委派(绝不吞审批)。
    expect(approval?.listener({ toolName: 'bash' }, next)).toBe('chained')
    // 非派发会话 → 委派。
    expect(approval?.listener({ agent: { id: 'session-human-1' }, toolName: 'bash' }, next)).toBe('chained')
    // 派发会话 → 认领(next 不被调,返回 Promise 回注)。
    const claimed = approval?.listener({ agent: { id: 'session-dispatch-1' }, toolName: 'bash', callId: 'c-1' }, next) as Promise<ApprovalOutcome>
    expect(next).toHaveBeenCalledTimes(3) // pre-execute 1 + 两笔委派;认领路径零 next
    expect(claimed).toBeInstanceOf(Promise)
  })

  it('exposes exactly the answer endpoint and settles through it', async () => {
    const kernel = makeKernel()
    const core = makeCore(kernel)
    const service = new ApprovalBridgeService({ reflect: { provide: vi.fn() } } as unknown as Context, core)
    expect(remoteMethods(service).map(marker => marker.exportName ?? marker.method)).toEqual(['answer'])
    const pending = core.handle(eventOf())
    await vi.waitFor(() => { expect(kernel.receiveCalls).toHaveLength(1) })
    await flush()
    await expect(service.answer({ approvalId: 'a-1', approve: true })).resolves.toEqual({ settled: true })
    await expect(pending).resolves.toBe('allowed-once')
    // 晚到重放:幂等。
    await expect(service.answer({ approvalId: 'a-1', approve: false })).resolves.toEqual({ settled: false })
  })
})
