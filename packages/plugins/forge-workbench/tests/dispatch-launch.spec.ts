// Task 3.5 unit legs — the dispatch-launch host core (subagent creation over
// the sessionController channel) + its rpc face. AC groups (task file):
//
//   派发链  — 消费内核预合成产物:create({sessionId: 预铸, cwd}) 幂等 adopt
//             + prompt(mode:'queue') 持久化首条 user 消息;requestId 确定性
//             (deriveLaunchRequestId 同式);stub 实测派发 → 可交互预算 ≤3s。
//   并行    — ≥3 无依赖任务同批:N 次独立 create 互不共享上下文(G3),
//             dispatch 行互不串扰(一行失败不影响他行)。
//   注入    — 预合成内容逐字符完整交付(sha256 全等 oracle;host 零改写 —
//             追加行由内核预合成);契约三查不满足 → ERR_SYSTEM_PROMPT_CONTRACT。
//   降级    — create/prompt 腿失败或超上限 → ERR_DISPATCH_LAUNCH_FAILED + 原因
//             (dispatch failed 态 + 可重派发的呈现面);永不算 undefined 静默。
//
// The session channel is STUBBED through the deps seam (in-memory recorder —
// the same discipline as session-launch.spec; the file-backed e2e stub rides
// the DSH_FORGE_SESSION_STUB_DIR seam wired in host/index.ts).

import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { deriveLaunchRequestId, type SessionChannel } from '../src/host/session-launch.ts'
import {
  createDispatchLaunchCore,
  type DispatchLaunchOutcome,
  type DispatchLaunchRequest,
} from '../src/host/dispatch-launch/launch.ts'
import { createDispatchSessionRegistry } from '../src/host/dispatch-launch/registry.ts'
// The decorator-bearing rpc class is loaded through the tsc-lowered build
// output (session-launch.spec precedent: the workspace test transform does not
// lower standard decorators; tsc --build does).
import { DispatchLaunchService } from '../lib/types/host/dispatch-launch/rpc.js'

/** One recorded channel call (the verbatim-injection oracle). */
interface ChannelRecorder {
  createCalls: { sessionId?: string; cwd?: string }[]
  promptCalls: {
    requestId: string
    sessionId: string
    mode: 'queue'
    text: string
  }[]
}

/** In-memory stub of the upstream sessionController create/prompt face. */
function makeChannel(
  recorder: ChannelRecorder,
  behavior: {
    createError?: (request: { sessionId?: string; cwd?: string }) => Error | undefined
    promptError?: (sessionId: string) => Error | undefined
    hangCreateFor?: string
    hangPromptFor?: string
  } = {},
): SessionChannel {
  return {
    async create(request) {
      recorder.createCalls.push({ ...request })
      if (behavior.createError !== undefined) {
        const error = behavior.createError(request)
        if (error !== undefined) throw error
      }
      if (behavior.hangCreateFor !== undefined && request.sessionId === behavior.hangCreateFor) {
        return new Promise<{ sessionId: string }>(() => {})
      }
      return { sessionId: request.sessionId ?? 'session-adopted' }
    },
    async prompt(request) {
      recorder.promptCalls.push({
        requestId: request.requestId,
        sessionId: request.sessionId,
        mode: request.mode,
        text: request.content.map(part => part.text).join(''),
      })
      if (behavior.promptError !== undefined) {
        const error = behavior.promptError(request.sessionId)
        if (error !== undefined) throw error
      }
      if (behavior.hangPromptFor !== undefined && request.sessionId === behavior.hangPromptFor) {
        return new Promise<{ accepted: true }>(() => {})
      }
      return { accepted: true }
    },
  }
}

/** The kernel presynth product as a launch request (pre-minted session id + composed first user message). */
function requestOf(overrides: Partial<DispatchLaunchRequest> = {}): DispatchLaunchRequest {
  return {
    dispatchId: 'd-1',
    batchId: 'b-1',
    projectId: 'p-1',
    featureSlug: 'alpha',
    taskKey: 'alpha/1.1',
    taskType: 'coding.feature',
    prompt: 'EXECUTOR PREAMBLE…\nprotocol body\n\n[dsh-forge workbench] Attribution: session:session-pre-1',
    promptHash: createHash('sha256').update('EXECUTOR PREAMBLE…\nprotocol body\n\n[dsh-forge workbench] Attribution: session:session-pre-1', 'utf8').digest('hex'),
    sessionId: 'session-pre-1',
    cwd: 'Z:/workbench/registered-a',
    ...overrides,
  }
}

function makeCore(channel: SessionChannel | undefined, overrides: { channelTimeoutMs?: number } = {}) {
  return createDispatchLaunchCore({
    getSessionChannel: () => channel,
    ...overrides,
  })
}

// ---------------------------------------------------------------------------
// 派发链(AC-1)
// ---------------------------------------------------------------------------

describe('dispatch-launch: the dispatch chain over the stub channel (AC-1)', () => {
  it('creates with the pre-minted session id (idempotent adopt face) and queues the presynth message verbatim', async () => {
    const recorder: ChannelRecorder = { createCalls: [], promptCalls: [] }
    const request = requestOf()
    const outcome = await makeCore(makeChannel(recorder)).launch(request)

    expect(outcome).toEqual({ ok: true, sessionId: 'session-pre-1' })
    expect(recorder.createCalls).toEqual([{ sessionId: 'session-pre-1', cwd: 'Z:/workbench/registered-a' }])
    expect(recorder.promptCalls).toHaveLength(1)
    const prompt = recorder.promptCalls[0] as (typeof recorder.promptCalls)[number]
    expect(prompt.mode).toBe('queue')
    expect(prompt.sessionId).toBe('session-pre-1')
    // requestId determinism — the exact stream the M2 oracle hashes (replay
    // idempotence rides the upstream hasPromptRequest short-circuit).
    expect(prompt.requestId).toBe(deriveLaunchRequestId('session-pre-1', request.prompt))
  })

  it('injection is byte-faithful: sha256(delivered text) === promptHash, zero host-side rewriting (AC-3)', async () => {
    const recorder: ChannelRecorder = { createCalls: [], promptCalls: [] }
    const request = requestOf()
    await makeCore(makeChannel(recorder)).launch(request)
    const delivered = recorder.promptCalls[0]?.text as string

    // The hash oracle (spike-3 §4 four-piece): full-equality on the delivered
    // string — the host neither appends, trims, nor reflows the kernel product
    // (the attribution line is already part of the composed message).
    expect(delivered).toBe(request.prompt)
    expect(createHash('sha256').update(delivered, 'utf8').digest('hex')).toBe(request.promptHash)
    // 恰好一行追加行(kernel-composed;host 侧零增补 —— 计数锚点 [dsh-forge workbench])
    expect(delivered.split('[dsh-forge workbench]').length - 1).toBe(1)
  })

  it('mints a fresh session id only for the non-preminted shape (null sessionId)', async () => {
    const recorder: ChannelRecorder = { createCalls: [], promptCalls: [] }
    const core = createDispatchLaunchCore({
      getSessionChannel: () => makeChannel(recorder),
      mintSessionId: () => 'session-mint-0001',
    })
    const outcome = await core.launch(requestOf({ sessionId: null }))
    expect(outcome).toEqual({ ok: true, sessionId: 'session-mint-0001' })
    expect(recorder.createCalls[0]?.sessionId).toBe('session-mint-0001')
  })

  it('stub-measured dispatch → interactive stays within the ≤3s budget (3-task batch, AC-1)', async () => {
    const recorder: ChannelRecorder = { createCalls: [], promptCalls: [] }
    const core = makeCore(makeChannel(recorder))
    const requests = [1, 2, 3].map(i => requestOf({
      dispatchId: `d-${String(i)}`,
      taskKey: `alpha/1.${String(i)}`,
      sessionId: `session-pre-${String(i)}`,
      prompt: `PROMPT[${String(i)}]`,
      promptHash: createHash('sha256').update(`PROMPT[${String(i)}]`, 'utf8').digest('hex'),
    }))
    const startedAt = Date.now()
    const outcomes = await core.launchBatch(requests)
    const elapsed = Date.now() - startedAt
    expect(outcomes.every(outcome => outcome.ok)).toBe(true)
    expect(recorder.createCalls.map(call => call.sessionId)).toEqual(['session-pre-1', 'session-pre-2', 'session-pre-3'])
    expect(elapsed).toBeLessThan(3000) // stub 环境(进程内腿 ms 级)的回归绊线
  })
})

// ---------------------------------------------------------------------------
// 并行(AC-2):N 次独立 create,互不共享上下文、互不串扰
// ---------------------------------------------------------------------------

describe('dispatch-launch: parallel independence (AC-2)', () => {
  it('runs ≥3 independent creates — every prompt lands in its OWN session, none cross-contaminated', async () => {
    const recorder: ChannelRecorder = { createCalls: [], promptCalls: [] }
    const requests = [1, 2, 3, 4].map(i => requestOf({
      dispatchId: `d-${String(i)}`,
      batchId: 'b-parallel',
      taskKey: `alpha/2.${String(i)}`,
      sessionId: `session-par-${String(i)}`,
      prompt: `CONTENT-FOR-2.${String(i)}`,
      promptHash: createHash('sha256').update(`CONTENT-FOR-2.${String(i)}`, 'utf8').digest('hex'),
    }))
    const outcomes = await makeCore(makeChannel(recorder)).launchBatch(requests)

    expect(outcomes).toHaveLength(4)
    expect(outcomes.every(outcome => outcome.ok)).toBe(true)
    // Each session received exactly its own message — no shared context, no
    // message bleed between the four independent creates (G3).
    const bySession = new Map(recorder.promptCalls.map(call => [call.sessionId, call.text]))
    expect(bySession.get('session-par-1')).toBe('CONTENT-FOR-2.1')
    expect(bySession.get('session-par-2')).toBe('CONTENT-FOR-2.2')
    expect(bySession.get('session-par-3')).toBe('CONTENT-FOR-2.3')
    expect(bySession.get('session-par-4')).toBe('CONTENT-FOR-2.4')
  })

  it('isolates failures: one row failing create never disturbs its batch siblings', async () => {
    const recorder: ChannelRecorder = { createCalls: [], promptCalls: [] }
    const channel = makeChannel(recorder, {
      createError: request => request.sessionId === 'session-par-2'
        ? new Error('host: session quota exhausted')
        : undefined,
    })
    const requests = [1, 2, 3].map(i => requestOf({
      dispatchId: `d-${String(i)}`,
      sessionId: `session-par-${String(i)}`,
      prompt: `P-${String(i)}`,
      promptHash: createHash('sha256').update(`P-${String(i)}`, 'utf8').digest('hex'),
    }))
    const outcomes = await makeCore(channel).launchBatch(requests)

    expect(outcomes[0]?.ok).toBe(true)
    expect(outcomes[2]?.ok).toBe(true)
    const failed = outcomes[1] as Extract<DispatchLaunchOutcome, { ok: false }>
    expect(failed.ok).toBe(false)
    expect(failed.code).toBe('ERR_DISPATCH_LAUNCH_FAILED')
    expect(failed.error).toContain('d-2')
    expect(failed.error).toContain('session quota exhausted')
  })
})

// ---------------------------------------------------------------------------
// 注入契约三查(AC-3):ERR_SYSTEM_PROMPT_CONTRACT(spike-3 §5.4)
// ---------------------------------------------------------------------------

describe('dispatch-launch: the injection contract three-check (AC-3)', () => {
  const cases: Array<[string, DispatchLaunchRequest, boolean]> = [
    ['channel unresolvable (①查, host-side)', requestOf(), false],
    ['empty presynth content (②查)', requestOf({ prompt: '', promptHash: 'h' }), true],
    ['prompt_hash not finalized (③查)', requestOf({ promptHash: '' }), true],
    ['no cwd on the payload', requestOf({ cwd: ' ' }), true],
  ]
  for (const [label, request, channelPresent] of cases) {
    it(`refuses to launch on: ${label}`, async () => {
      const recorder: ChannelRecorder = { createCalls: [], promptCalls: [] }
      const core = makeCore(channelPresent ? makeChannel(recorder) : undefined)
      const outcome = await core.launch(request)
      expect(outcome.ok).toBe(false)
      expect(outcome).toMatchObject({ code: 'ERR_SYSTEM_PROMPT_CONTRACT' })
      expect((outcome as Extract<DispatchLaunchOutcome, { ok: false }>).error).toContain(request.dispatchId)
      // 拒绝派发 = 零通道调用(create/prompt 均未触达)。
      expect(recorder.createCalls).toHaveLength(0)
      expect(recorder.promptCalls).toHaveLength(0)
    })
  }
})

// ---------------------------------------------------------------------------
// 降级链(AC-5):launch 失败 → 显式终局(failed 态 + 原因),禁静默
// ---------------------------------------------------------------------------

describe('dispatch-launch: degradation chain (AC-5)', () => {
  it('maps create-leg failures to ERR_DISPATCH_LAUNCH_FAILED with the reason', async () => {
    const channel = makeChannel({ createCalls: [], promptCalls: [] }, {
      createError: () => new Error('TypeError: cwd is not a workspace'),
    })
    const outcome = await makeCore(channel).launch(requestOf())
    expect(outcome).toMatchObject({
      ok: false,
      code: 'ERR_DISPATCH_LAUNCH_FAILED',
    })
    expect((outcome as Extract<DispatchLaunchOutcome, { ok: false }>).error).toContain('cwd is not a workspace')
  })

  it('maps prompt-leg failures the same way (create already adopted, prompt rejected)', async () => {
    const channel = makeChannel({ createCalls: [], promptCalls: [] }, {
      promptError: () => new Error('queue rejected: session sealed'),
    })
    const outcome = await makeCore(channel).launch(requestOf())
    expect(outcome).toMatchObject({ ok: false, code: 'ERR_DISPATCH_LAUNCH_FAILED' })
    expect((outcome as Extract<DispatchLaunchOutcome, { ok: false }>).error).toContain('session sealed')
  })

  it('classifies a hung leg as a failure via the per-leg ceiling (hang guard)', async () => {
    const channel = makeChannel({ createCalls: [], promptCalls: [] }, { hangPromptFor: 'session-pre-1' })
    const outcome = await makeCore(channel, { channelTimeoutMs: 30 }).launch(requestOf())
    expect(outcome).toMatchObject({ ok: false, code: 'ERR_DISPATCH_LAUNCH_FAILED' })
    expect((outcome as Extract<DispatchLaunchOutcome, { ok: false }>).error).toContain('did not answer within 30ms')
  })
})

// ---------------------------------------------------------------------------
// 登记表 + rpc 面
// ---------------------------------------------------------------------------

describe('dispatch-launch: session registry + rpc face', () => {
  it('registry lookups answer only registered dispatch sessions (the approval-bridge claim filter source)', () => {
    const registry = createDispatchSessionRegistry()
    expect(registry.lookup('session-pre-1')).toBeNull()
    registry.register('session-pre-1', { dispatchId: 'd-1', batchId: 'b-1', projectId: 'p-1', taskKey: 'alpha/1.1' })
    expect(registry.lookup('session-pre-1')).toEqual({ dispatchId: 'd-1', batchId: 'b-1', projectId: 'p-1', taskKey: 'alpha/1.1' })
    registry.register('session-pre-1', { dispatchId: 'd-1b', batchId: 'b-2', projectId: 'p-1', taskKey: 'alpha/1.2' }) // 覆盖幂等
    expect(registry.lookup('session-pre-1')?.dispatchId).toBe('d-1b')
    expect(registry.lookup('session-other')).toBeNull()
  })

  function fakeHostContext(): Context {
    return { reflect: { provide: vi.fn() } } as unknown as Context
  }

  it('exposes exactly the launch endpoint', () => {
    const service = new DispatchLaunchService(fakeHostContext(), createDispatchSessionRegistry(), { getSessionChannel: () => undefined })
    expect(remoteMethods(service).map(marker => marker.exportName ?? marker.method)).toEqual(['launch'])
  })

  it('registers pre-minted sessions BEFORE launching, then delegates to the core', async () => {
    const recorder: ChannelRecorder = { createCalls: [], promptCalls: [] }
    const registry = createDispatchSessionRegistry()
    const service = new DispatchLaunchService(fakeHostContext(), registry, {
      getSessionChannel: () => makeChannel(recorder),
    })
    const result = await service.launch({ launches: [requestOf()] })
    expect(result.results[0]).toMatchObject({ ok: true, sessionId: 'session-pre-1' })
    // The claim filter is populated BEFORE create fires (approvals can only
    // arrive once the session runs, but registration must not lose the race).
    expect(registry.lookup('session-pre-1')).toMatchObject({ dispatchId: 'd-1', taskKey: 'alpha/1.1' })
    // Non-preminted requests are not registered (no stable key to claim by).
    await service.launch({ launches: [requestOf({ dispatchId: 'd-2', sessionId: null, prompt: 'X', promptHash: createHash('sha256').update('X', 'utf8').digest('hex') })] })
    expect(registry.lookup('session-adopted')).toBeNull()
  })
})
