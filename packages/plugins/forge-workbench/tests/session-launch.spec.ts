// Task 4.2 unit legs (AC6 four groups): 发起 (main-channel create+prompt,
// prompt byte-faithful) / 重发幂等 (deterministic requestId + adopt identity) /
// 结束回流 (repo-side supersede lives in apps/desktop specs; here the chain
// contract) / 降级 (ERR_HOST_NOT_READY / ERR_SESSION_CHANNEL_UNAVAILABLE) —
// plus the actor-env (FORGE_ACTOR) convention and the rpc face. The session
// channel is STUBBED through the deps seam (no real dsh host in unit tests):
// an in-memory recorder standing in for the upstream `sessionController`.

import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import {
  composeFirstUserMessage, FORGE_ACTOR_ENV, forgeActorValue,
} from '../src/host/actor-env.ts'
import {
  createSessionLaunchCore, deriveLaunchRequestId,
  type SessionChannel, type SessionLaunchCore,
} from '../src/host/session-launch.ts'
// The decorator-bearing rpc class is loaded through the tsc-lowered build
// output (same source): this workspace's test transform does not lower
// standard decorators, while tsc --build (the suite's existing build prereq —
// the artifact legs gate on lib/) does.
import { SessionLaunchService, sessionChannelOf } from '../lib/types/host/session-launch-rpc.js'
import type { SessionLaunchInput, SessionLaunchResult } from '../src/client/session-launch.ts'

/** Byte-faithful prompt fixture (4.1 discipline): markdown shapes, quotes, trailing spaces, final newline. */
const PROMPT_FIXTURE = 'TASK_ID: 4.2\nTASK_FILE: Z:\\fixture\\4.2-task.md\n\nExecute the task per the file above.\n\n```\nblock with "quotes" & | pipes\n```\ntrailing spaces   \n'

/** One recorded channel call (the create/prompt discipline oracle). */
interface ChannelRecorder {
  createCalls: { sessionId?: string; cwd?: string }[]
  promptCalls: {
    requestId: string
    sessionId: string
    mode: 'queue'
    content: { type: 'text'; text: string }[]
  }[]
}

/** In-memory stub of the upstream sessionController create/prompt face. */
function makeChannel(
  recorder: ChannelRecorder,
  behavior: { createError?: Error; promptError?: Error; hangPrompt?: boolean } = {},
): SessionChannel {
  return {
    async create(request) {
      recorder.createCalls.push({ ...request })
      if (behavior.createError !== undefined) throw behavior.createError
      return { sessionId: request.sessionId ?? 'session-adopted' }
    },
    async prompt(request) {
      recorder.promptCalls.push({
        requestId: request.requestId,
        sessionId: request.sessionId,
        mode: request.mode,
        content: [...request.content],
      })
      if (behavior.promptError !== undefined) throw behavior.promptError
      if (behavior.hangPrompt === true) return new Promise<{ accepted: true }>(() => {})
      return { accepted: true }
    },
  }
}

function makeCore(channel: SessionChannel | undefined, overrides: { channelTimeoutMs?: number } = {}): SessionLaunchCore {
  return createSessionLaunchCore({
    getSessionChannel: () => channel,
    mintSessionId: () => 'session-mint-0001',
    ...overrides,
  })
}

const INPUT: SessionLaunchInput = {
  promptText: PROMPT_FIXTURE,
  title: 'SessionLaunch(host 半身)',
  cwd: 'Z:/workbench/registered-a',
}

describe('actor-env: FORGE_ACTOR passthrough convention (AC2)', () => {
  it('mints session-prefixed actor values — the form Interface 3 path ① recognizes', () => {
    // 2.5 dialect: resolveActorSource maps a `session:`-prefixed actor value
    // to [会话] (apps/desktop workbench/indexer/source.ts); the prefix is the
    // cross-package contract this assertion pins.
    expect(forgeActorValue('session-mint-0001')).toBe('session:session-mint-0001')
    expect(forgeActorValue('session-mint-0001').startsWith('session:')).toBe(true)
  })

  it('appends exactly one attribution line AFTER the verbatim prompt — body untouched (逐字符)', () => {
    const message = composeFirstUserMessage(PROMPT_FIXTURE, 'session:session-mint-0001')
    // The fixture survives character-for-character as the prefix.
    expect(message.startsWith(PROMPT_FIXTURE)).toBe(true)
    const appended = message.slice(PROMPT_FIXTURE.length)
    expect(appended.startsWith('\n\n')).toBe(true)
    const line = appended.slice(2)
    // One single line, naming the env slot and the actor value.
    expect(line.includes('\n')).toBe(false)
    expect(line).toContain(`${FORGE_ACTOR_ENV}=session:session-mint-0001`)
  })

  it('degrades to the verbatim prompt on an empty actor value (defensive no-op)', () => {
    expect(composeFirstUserMessage(PROMPT_FIXTURE, '')).toBe(PROMPT_FIXTURE)
  })
})

describe('session launch core: main channel create + prompt (AC1 / AC6-发起)', () => {
  it('creates the session at the project cwd and queues the first message', async () => {
    const recorder: ChannelRecorder = { createCalls: [], promptCalls: [] }
    const result = await makeCore(makeChannel(recorder)).launch(INPUT)

    expect(result).toEqual({ ok: true, sessionId: 'session-mint-0001' })
    expect(recorder.createCalls).toEqual([{ sessionId: 'session-mint-0001', cwd: 'Z:/workbench/registered-a' }])
    expect(recorder.promptCalls).toHaveLength(1)
    const prompt = recorder.promptCalls[0]
    expect(prompt.sessionId).toBe('session-mint-0001')
    expect(prompt.mode).toBe('queue')
    expect(prompt.requestId).toMatch(/^forge-launch-[0-9a-f]{32}$/)
    // Single text part; its text IS the composed first message.
    expect(prompt.content).toHaveLength(1)
    expect(prompt.content[0]?.type).toBe('text')
  })

  it('injects the complete prompt character-for-character plus the FORGE_ACTOR line (SC3)', async () => {
    const recorder: ChannelRecorder = { createCalls: [], promptCalls: [] }
    await makeCore(makeChannel(recorder)).launch(INPUT)
    const message = recorder.promptCalls[0]?.content[0]?.text ?? ''

    expect(message.startsWith(PROMPT_FIXTURE)).toBe(true)
    expect(message).toContain(`${FORGE_ACTOR_ENV}=session:session-mint-0001`)
    // The append is bounded: fixture + separator + exactly one line.
    expect(message.split('\n').length).toBe(PROMPT_FIXTURE.split('\n').length + 2)
  })

  it('adopts a caller-minted session id (tier-2 recovery / retry identity)', async () => {
    const recorder: ChannelRecorder = { createCalls: [], promptCalls: [] }
    const result = await makeCore(makeChannel(recorder)).launch({ ...INPUT, sessionId: 'session-retry-9' })
    expect(result).toEqual({ ok: true, sessionId: 'session-retry-9' })
    expect(recorder.createCalls[0]?.sessionId).toBe('session-retry-9')
    expect(recorder.promptCalls[0]?.sessionId).toBe('session-retry-9')
    // The actor line rides the ADOPTED id.
    expect(recorder.promptCalls[0]?.content[0]?.text).toContain('FORGE_ACTOR=session:session-retry-9')
  })

  it('treats a blank session id as unset (mint path)', async () => {
    const recorder: ChannelRecorder = { createCalls: [], promptCalls: [] }
    const result = await makeCore(makeChannel(recorder)).launch({ ...INPUT, sessionId: '  ' })
    expect(result).toEqual({ ok: true, sessionId: 'session-mint-0001' })
  })
})

describe('session launch core: replay stability (AC6-重发幂等)', () => {
  it('derives the requestId from (session, message) — identical replays are byte-identical requests', async () => {
    expect(deriveLaunchRequestId('s-1', 'hello')).toBe(deriveLaunchRequestId('s-1', 'hello'))
    expect(deriveLaunchRequestId('s-1', 'hello')).not.toBe(deriveLaunchRequestId('s-1', 'hello!'))
    expect(deriveLaunchRequestId('s-1', 'hello')).not.toBe(deriveLaunchRequestId('s-2', 'hello'))

    const recorder: ChannelRecorder = { createCalls: [], promptCalls: [] }
    const core = makeCore(makeChannel(recorder))
    await core.launch({ ...INPUT, sessionId: 'session-retry-9' })
    await core.launch({ ...INPUT, sessionId: 'session-retry-9' })
    // Upstream hasPromptRequest short-circuits on the requestId: the two
    // wire requests being identical is what makes the replay single-message.
    expect(recorder.promptCalls[0]).toEqual(recorder.promptCalls[1])
    expect(recorder.createCalls).toHaveLength(2) // create is an idempotent adopt
  })
})

describe('session launch core: degradation reasonCodes (AC4 / AC6-降级)', () => {
  it('ERR_HOST_NOT_READY when the host context carries no session channel', async () => {
    const result = await makeCore(undefined).launch(INPUT)
    expect(result).toEqual({
      ok: false,
      reasonCode: 'ERR_HOST_NOT_READY',
      detail: expect.stringContaining('sessionController'),
    })
  })

  it('ERR_SESSION_CHANNEL_UNAVAILABLE when create rejects (detail disambiguates, no swallow)', async () => {
    const recorder: ChannelRecorder = { createCalls: [], promptCalls: [] }
    const result = await makeCore(makeChannel(recorder, { createError: new Error('workspace/not-found: nope') })).launch(INPUT)
    expect(result).toMatchObject({
      ok: false,
      reasonCode: 'ERR_SESSION_CHANNEL_UNAVAILABLE',
      sessionId: 'session-mint-0001',
    })
    expect((result as { detail: string }).detail).toContain('workspace/not-found')
    expect(recorder.promptCalls).toHaveLength(0)
  })

  it('ERR_SESSION_CHANNEL_UNAVAILABLE when prompt rejects — carrying the created session id for recovery', async () => {
    const recorder: ChannelRecorder = { createCalls: [], promptCalls: [] }
    const result = await makeCore(makeChannel(recorder, { promptError: new Error('session/model-unavailable') })).launch(INPUT)
    expect(result).toMatchObject({
      ok: false,
      reasonCode: 'ERR_SESSION_CHANNEL_UNAVAILABLE',
      sessionId: 'session-mint-0001',
    })
    expect((result as { detail: string }).detail).toContain('session/model-unavailable')
  })

  it('ERR_SESSION_CHANNEL_UNAVAILABLE when a channel leg hangs past its ceiling', async () => {
    const recorder: ChannelRecorder = { createCalls: [], promptCalls: [] }
    const result = await makeCore(
      makeChannel(recorder, { hangPrompt: true }),
      { channelTimeoutMs: 15 },
    ).launch(INPUT)
    expect(result).toMatchObject({ ok: false, reasonCode: 'ERR_SESSION_CHANNEL_UNAVAILABLE' })
    expect((result as { detail: string }).detail).toContain('did not answer')
  })

  it('rejects structurally invalid input (bad-request class, surfaced — never a fake success)', async () => {
    const core = makeCore(makeChannel({ createCalls: [], promptCalls: [] }))
    await expect(core.launch({ ...INPUT, promptText: '' })).rejects.toThrow(/promptText/)
    await expect(core.launch({ ...INPUT, cwd: '  ' })).rejects.toThrow(/cwd/)
  })
})

describe('session launch rpc face: registration + channel resolution (4.2)', () => {
  /** Minimal Context face the cordis Service base needs at registration time. */
  function fakeHostContext(): { ctx: Context; provide: ReturnType<typeof vi.fn> } {
    const provide = vi.fn()
    return { ctx: { reflect: { provide } } as unknown as Context, provide }
  }

  it('exposes exactly the launch endpoint', () => {
    const { ctx } = fakeHostContext()
    const service = new SessionLaunchService(ctx, { getSessionChannel: () => undefined })
    expect(remoteMethods(service).map(marker => marker.exportName ?? marker.method)).toEqual(['launch'])
  })

  it('sessionChannelOf resolves per call and duck-types the upstream service', () => {
    const channel: SessionChannel = {
      async create() { return { sessionId: 's' } },
      async prompt() { return { accepted: true } },
    }
    const bare = { reflect: { provide: vi.fn() } } as unknown as Record<string, unknown>
    expect(sessionChannelOf(bare as Context)).toBeUndefined() // key absent
    expect(sessionChannelOf({ ...bare, sessionController: {} } as Context)).toBeUndefined() // face incomplete
    expect(sessionChannelOf({ ...bare, sessionController: channel } as Context)).toBe(channel)
  })

  it('delegates launch to the core through the default ctx channel', async () => {
    const recorder: ChannelRecorder = { createCalls: [], promptCalls: [] }
    const channel = makeChannel(recorder)
    const ctx = {
      reflect: { provide: vi.fn() },
      sessionController: channel,
    } as unknown as Context
    const service = new SessionLaunchService(ctx)
    const result: SessionLaunchResult = await service.launch(INPUT)
    expect(result).toMatchObject({ ok: true })
    // The default deps DID go through the ctx-resolved channel (minted id shape).
    expect(recorder.createCalls).toHaveLength(1)
    expect((result as { sessionId: string }).sessionId).toMatch(/^session-/)
    expect(recorder.createCalls[0]?.sessionId).toBe((result as { sessionId: string }).sessionId)
  })

  it('answers ERR_HOST_NOT_READY when the ctx carries no channel (default deps)', async () => {
    const { ctx } = fakeHostContext()
    const service = new SessionLaunchService(ctx)
    expect(await service.launch(INPUT)).toMatchObject({ ok: false, reasonCode: 'ERR_HOST_NOT_READY' })
  })
})
