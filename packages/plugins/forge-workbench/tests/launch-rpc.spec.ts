// Task 5.11 — the UF5 launch rpc assembly units (client half). AC map:
//   AC1 双挂位真服务全链 — the namespace contribution + the RemoteResult
//   unwrappers + the tier-2 client channel + the tier-3 renderer legs;
//   the DI switch (seat members absent ⇒ the entries keep mocks).
// Covered:
//   - the Typert contribution's shape (wire field = the HOST parameter name,
//     strict parameter codecs, src-json results — the mount validator's rules);
//   - probe/launch envelope unwrapping (a gateway failure maps to the
//     member's channel-unavailable reasonCode — ROUTED, never thrown);
//   - tier-2 create+prompt semantics over ctx.remote.session: the message =
//     verbatim prompt + the FORGE_ACTOR line (byte-identical to tier 1),
//     the requestId determinism, the recovery-id adoption, the missing-
//     channel degradation;
//   - the tier-3 renderer legs (clipboard denied → false; window focus);
//   - the seat: initial members without the remote (bridge-backed
//     recordSessionLink + the hand-over composition), rpc members after a
//     successful $mount, silence on a refused mount.
import { describe, expect, it, vi } from 'vitest'
import {
  bringMainWindowToFront, copyPromptToClipboard, createLaunchSeat,
  deriveLaunchRequestIdClient, FORGE_WORKBENCH_REMOTE_CONTRIBUTION, launchViaClientChannel,
  sessionChannelOf,
} from '../src/client/launch-rpc.ts'
import type { GetTaskPromptResult } from '../src/client/services.ts'
import type { SessionLaunchInput, SessionLaunchResult } from '../src/client/session-launch.ts'
import type { LaunchSeatStore } from '../src/client/launch-rpc.ts'
import { forgeActorValue } from '../src/host/actor-env.ts'
import type { ViewSwitchController } from '../src/client/nav/view-switch.ts'

/** The minimal cordis-context face createLaunchSeat consumes (structural). */
interface FakeCtx {
  get(name: string, strict?: boolean): unknown
  inject(deps: readonly string[], callback: (ctx: FakeCtx) => void): { dispose(): Promise<void> | void }
  effect(register: () => () => void, label?: string): unknown
}

/** A context double: services by key, inject runs immediately, effects held. */
function fakeCtx(services: Record<string, unknown> = {}): { ctx: FakeCtx; effects: Array<() => void> } {
  const effects: Array<() => void> = []
  const ctx: FakeCtx = {
    get: (name: string) => (Object.prototype.hasOwnProperty.call(services, name) ? services[name] : undefined),
    inject: (deps, callback) => {
      if (!deps.every(dep => Object.prototype.hasOwnProperty.call(services, dep))) return { dispose: () => {} }
      callback(ctx)
      return { dispose: () => {} }
    },
    effect: (register: () => () => void) => {
      const dispose = register()
      effects.push(dispose)
      return dispose
    },
  }
  return { ctx, effects }
}

/** A view-switch controller double recording switchSession calls. */
function fakeController(): ViewSwitchController & { switched: string[] } {
  return {
    switched: [],
    switchSession(): void { this.switched.push('session') },
  } as unknown as ViewSwitchController & { switched: string[] }
}

const PROMPT = '# Task 4.2 prompt\n\nbody bytes survive\n'
const LAUNCH_INPUT: SessionLaunchInput = { promptText: PROMPT, title: 't', cwd: 'Z:/repo/demo' }

/** The composed first message the host's tier 1 would build (byte-identical). */
function composedTier1Message(sessionId: string): string {
  return `${PROMPT}\n\n[dsh-forge workbench] Attribution: prefix every forge CLI command you run in this session with the environment assignment FORGE_ACTOR=${forgeActorValue(sessionId)} (example: FORGE_ACTOR=${forgeActorValue(sessionId)} forge task claim 1.1) so the task changes made here are marked as session-sourced.`
}

// ---------------------------------------------------------------------------
// The contribution (the mount validator's rules, asserted statically)
// ---------------------------------------------------------------------------

describe('FORGE_WORKBENCH_REMOTE_CONTRIBUTION', () => {
  it('declares exactly the two UF5 endpoints with the host parameter names as wire fields', () => {
    expect(FORGE_WORKBENCH_REMOTE_CONTRIBUTION.package).toBe('@dsh-forge/plugin-forge-workbench')
    const descriptors = FORGE_WORKBENCH_REMOTE_CONTRIBUTION.descriptors
    expect(descriptors.map(d => `${d.namespace}/${d.method}`)).toEqual([
      'forgeBridge/getTaskPrompt', 'sessionLaunch/launch',
    ])
    for (const descriptor of descriptors) {
      // Wire field = the HOST method's parameter name (the SRC dispatch maps
      // by exactly this name; lib/index.js keeps `getTaskPrompt(input)`.
      expect(descriptor.parameters).toHaveLength(1)
      expect(descriptor.parameters[0]?.wire).toBe('input')
      expect(descriptor.parameters[0]?.source).toBe('json')
      // Client mounts demand STRICT parameter codecs (requireStrictCodec).
      expect(descriptor.parameters[0]?.codec.mode).toBe('strict')
      if (descriptor.parameters[0]?.codec.mode === 'strict') {
        expect(typeof descriptor.parameters[0]?.codec.create).toBe('function')
        expect(typeof descriptor.parameters[0]?.codec.typeSymbol).toBe('string')
      }
      // Results stay src-json (the host's SRC fallback validates nothing).
      expect(descriptor.result.mode).toBe('src-json')
      expect(descriptor.invocation).toEqual({ kind: 'direct' })
    }
  })

  it('strict parameter schemas parse the real shapes and reject malformed ones', () => {
    const descriptor = FORGE_WORKBENCH_REMOTE_CONTRIBUTION.descriptors[0]
    if (descriptor.parameters[0]?.codec.mode !== 'strict') throw new Error('unreachable')
    const schema = descriptor.parameters[0].codec.create()
    expect(schema.parse({ projectRoot: 'Z:/repo', taskKey: 'demo/1.1' }))
      .toEqual({ projectRoot: 'Z:/repo', taskKey: 'demo/1.1' })
    expect(() => schema.parse({ projectRoot: 4 })).toThrow()
    expect(() => schema.parse(null)).toThrow()
    const launchDescriptor = FORGE_WORKBENCH_REMOTE_CONTRIBUTION.descriptors[1]
    if (launchDescriptor.parameters[0]?.codec.mode !== 'strict') throw new Error('unreachable')
    const launchSchema = launchDescriptor.parameters[0].codec.create()
    expect(launchSchema.parse({ ...LAUNCH_INPUT })).toEqual(LAUNCH_INPUT)
    expect(launchSchema.parse({ ...LAUNCH_INPUT, sessionId: 'session-x' })).toEqual({ ...LAUNCH_INPUT, sessionId: 'session-x' })
    expect(() => launchSchema.parse({ promptText: 'x', title: 't' })).toThrow() // cwd missing
  })
})

// ---------------------------------------------------------------------------
// Tier 2 (ctx.remote.session) — same semantics as the host's tier 1
// ---------------------------------------------------------------------------

/** The failure arm of the generated namespaces' RemoteResult envelope. */
type WireFailure = { ok: false; error: { code: string; message: string } }

/** The tier-2 prompt request's wire shape (single-line: the delimiter rule's multiline quirk avoided). */
type WirePromptRequest = { requestId: string; sessionId: string; mode: 'queue'; content: readonly { type: 'text'; text: string }[] }

/** The tier-2 prompt wire call as the assertion reads it. */
type WirePromptCall = { requestId: string; sessionId: string; mode: string; content: readonly { type: string; text: string }[] }

/** A session-channel double in the generated namespace's RemoteResult shape. */
function fakeSessionChannel(overrides: Partial<{
  create: (request: { sessionId?: string; cwd?: string }) => Promise<{ ok: true; value: { sessionId: string } } | WireFailure>
  prompt: (request: WirePromptRequest) => Promise<{ ok: true; value: { accepted: true } } | WireFailure>
}> = {}) {
  return {
    create: overrides.create ?? vi.fn(async (request: { sessionId?: string }) => ({ ok: true as const, value: { sessionId: request.sessionId ?? 'session-created' } })),
    prompt: overrides.prompt ?? vi.fn(async () => ({ ok: true as const, value: { accepted: true as const } })),
  }
}

describe('launchViaClientChannel (tier 2)', () => {
  it('creates with the caller-minted id, prompts queue-mode with the FORGE_ACTOR message, and reports the session', async () => {
    const channel = fakeSessionChannel()
    const { ctx } = fakeCtx({ 'remote.session': channel })
    const result = await launchViaClientChannel(ctx as never, { ...LAUNCH_INPUT, sessionId: 'session-recovery' })
    expect(result).toEqual({ ok: true, sessionId: 'session-recovery' })
    expect(channel.create).toHaveBeenCalledWith({ sessionId: 'session-recovery', cwd: LAUNCH_INPUT.cwd })
    const promptCall = (channel.prompt as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as WirePromptCall
    expect(promptCall.sessionId).toBe('session-recovery')
    expect(promptCall.mode).toBe('queue')
    expect(promptCall.content).toEqual([{ type: 'text', text: composedTier1Message('session-recovery') }])
  })

  it('mints a session-<uuid>-shaped id when tier 1 provided none', async () => {
    const channel = fakeSessionChannel()
    const { ctx } = fakeCtx({ 'remote.session': channel })
    const result = await launchViaClientChannel(ctx as never, LAUNCH_INPUT)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.sessionId).toMatch(/^session-/)
  })

  it('routes a failed create/prompt leg to ERR_SESSION_CHANNEL_UNAVAILABLE, never a throw', async () => {
    const { ctx } = fakeCtx({
      'remote.session': fakeSessionChannel({
        create: vi.fn(async () => ({ ok: false as const, error: { code: 'gateway/internal', message: 'offline' } })),
      }),
    })
    const result = await launchViaClientChannel(ctx as never, { ...LAUNCH_INPUT, sessionId: 'session-x' })
    expect(result).toMatchObject({ ok: false, reasonCode: 'ERR_SESSION_CHANNEL_UNAVAILABLE', sessionId: 'session-x' })

    const { ctx: promptCtx } = fakeCtx({
      'remote.session': fakeSessionChannel({
        prompt: vi.fn(async () => ({ ok: false as const, error: { code: 'session/not-found', message: 'gone' } })),
      }),
    })
    const prompted = await launchViaClientChannel(promptCtx as never, LAUNCH_INPUT)
    expect(prompted).toMatchObject({ ok: false, reasonCode: 'ERR_SESSION_CHANNEL_UNAVAILABLE' })
    if (!prompted.ok && prompted.sessionId !== undefined) expect(prompted.sessionId).toMatch(/^session-/)
  })

  it('degrades to ERR_SESSION_CHANNEL_UNAVAILABLE when the namespace is absent or partial', async () => {
    const empty = fakeCtx()
    expect(await launchViaClientChannel(empty.ctx as never, LAUNCH_INPUT)).toMatchObject({
      ok: false, reasonCode: 'ERR_SESSION_CHANNEL_UNAVAILABLE',
    })
    const partial = fakeCtx({ 'remote.session': { create: vi.fn() } }) // no prompt
    expect(await launchViaClientChannel(partial.ctx as never, LAUNCH_INPUT)).toMatchObject({
      ok: false, reasonCode: 'ERR_SESSION_CHANNEL_UNAVAILABLE',
    })
    expect(sessionChannelOf(partial.ctx as never)).toBeUndefined()
  })
})

describe('deriveLaunchRequestIdClient', () => {
  it('is deterministic for the same (session, message) pair and distinct across pairs', async () => {
    const a = await deriveLaunchRequestIdClient('session-1', 'message')
    const b = await deriveLaunchRequestIdClient('session-1', 'message')
    const c = await deriveLaunchRequestIdClient('session-2', 'message')
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toMatch(/^forge-launch-[0-9a-f]{8,}/)
  })

  it('matches the host recipe: sha256(session + NUL + message) hex, first 32 chars', async () => {
    const { createHash } = await import('node:crypto')
    const message = composedTier1Message('session-recipe')
    const hostRecipe = `forge-launch-${createHash('sha256').update('session-recipe').update(' ').update(message).digest('hex').slice(0, 32)}`
    // Node's digest chaining = NUL byte separator (the host core's exact form).
    const hostExact = `forge-launch-${createHash('sha256').update(`session-recipe\u0000${message}`).digest('hex').slice(0, 32)}`
    const client = await deriveLaunchRequestIdClient('session-recipe', message)
    expect(client).toBe(hostExact)
    expect(client).not.toBe(hostRecipe) // guards against a NUL-vs-space drift
  })
})

// ---------------------------------------------------------------------------
// Tier 3 renderer legs
// ---------------------------------------------------------------------------

describe('tier-3 renderer legs', () => {
  it('copyPromptToClipboard resolves true/false on the clipboard outcome', async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    try {
      expect(await copyPromptToClipboard('text')).toBe(true)
      expect(writeText).toHaveBeenCalledWith('text')
      writeText.mockRejectedValueOnce(new Error('denied'))
      expect(await copyPromptToClipboard('text')).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
    // No clipboard API at all → false (the chain surfaces clipboard-denied).
    vi.stubGlobal('navigator', {})
    try {
      expect(await copyPromptToClipboard('text')).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('bringMainWindowToFront focuses the window without throwing when absent', () => {
    const focus = vi.fn()
    vi.stubGlobal('window', { focus })
    try {
      expect(() => bringMainWindowToFront()).not.toThrow()
      expect(focus).toHaveBeenCalledOnce()
    } finally {
      vi.unstubAllGlobals()
    }
    vi.stubGlobal('window', undefined)
    try {
      expect(() => bringMainWindowToFront()).not.toThrow()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

// ---------------------------------------------------------------------------
// The seat (the DI switch: initial members → rpc members)
// ---------------------------------------------------------------------------

/** A $mount-capturing remote service double. */
function fakeRemote(mountBehavior: 'ok' | 'refuse' = 'ok'): {
  remote: { $mount: ReturnType<typeof vi.fn> }
  mountedContribution: () => unknown
} {
  let contribution: unknown
  const remote = {
    $mount: vi.fn(async (value: unknown) => {
      if (mountBehavior === 'refuse') throw new Error('registry closed')
      contribution = value
      return async () => {}
    }),
  }
  return { remote, mountedContribution: () => contribution }
}

describe('createLaunchSeat', () => {
  it('initial snapshot: renderer tier-3 legs + the bridge-backed recordSessionLink; no rpc members yet', async () => {
    const recordSessionLink = vi.fn(async () => ({ id: 'link-1' }))
    vi.stubGlobal('dshForge', {
      workbench: new Proxy({}, {
        get: (_target, prop) => (prop === 'recordSessionLink' ? recordSessionLink : vi.fn(async () => ({}))),
      }),
    })
    try {
      const { ctx } = fakeCtx() // no 'remote' service
      const seat: LaunchSeatStore = createLaunchSeat(ctx as never, fakeController())
      const initial = seat.getSnapshot()
      expect(initial.services.copyPromptToClipboard).toBe(copyPromptToClipboard)
      expect(initial.services.bringMainWindowToFront).toBe(bringMainWindowToFront)
      expect(typeof initial.services.recordSessionLink).toBe('function')
      expect(initial.services.probe).toBeUndefined()
      expect(initial.services.launch).toBeUndefined()
      expect(initial.services.launchViaClientChannel).toBeUndefined()
      await initial.services.recordSessionLink?.({ projectId: 'p', taskKey: 'f/1.1', sessionId: 's' })
      expect(recordSessionLink).toHaveBeenCalledWith({ projectId: 'p', taskKey: 'f/1.1', sessionId: 's' })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('onLaunched switches the view through the controller, then locates via uiWorkspace.openSession', () => {
    const openSession = vi.fn()
    const { ctx } = fakeCtx({ uiWorkspace: { openSession } })
    const controller = fakeController()
    const seat = createLaunchSeat(ctx as never, controller)
    seat.getSnapshot().onLaunched('session-target')
    expect(controller.switched).toEqual(['session'])
    expect(openSession).toHaveBeenCalledWith('session-target')
  })

  it('mounts the contribution when remote arrives and commits the rpc members (probe unwraps the envelope)', async () => {
    const { remote, mountedContribution } = fakeRemote()
    const getTaskPrompt = vi.fn(async () => ({
      ok: true as const,
      value: { available: true as const, promptText: PROMPT } satisfies GetTaskPromptResult,
    }))
    const launch = vi.fn(async () => ({ ok: true as const, value: { ok: true as const, sessionId: 'session-rpc' } }))
    const { ctx } = fakeCtx({
      remote,
      'remote.forgeBridge': { getTaskPrompt },
      'remote.sessionLaunch': { launch },
    })
    const notify = vi.fn()
    const seat = createLaunchSeat(ctx as never, fakeController())
    seat.subscribe(notify)
    await vi.waitFor(() => { expect(seat.getSnapshot().services.probe).toBeDefined() })
    expect(mountedContribution()).toBe(FORGE_WORKBENCH_REMOTE_CONTRIBUTION)
    expect(notify).toHaveBeenCalled()
    expect(await seat.getSnapshot().services.probe?.({ projectRoot: 'Z:/repo', taskKey: 'demo/1.1' }))
      .toEqual({ available: true, promptText: PROMPT })
    expect(await seat.getSnapshot().services.launch?.(LAUNCH_INPUT)).toEqual({ ok: true, sessionId: 'session-rpc' })
    // The rpc members REPLACE nothing: the tier-3 legs stay.
    expect(seat.getSnapshot().services.copyPromptToClipboard).toBe(copyPromptToClipboard)
    expect(seat.getSnapshot().services.bringMainWindowToFront).toBe(bringMainWindowToFront)
  })

  it('a gateway failure unwraps to the member\'s channel-unavailable reasonCode (routed, never thrown)', async () => {
    const { remote } = fakeRemote()
    const { ctx } = fakeCtx({
      remote,
      'remote.forgeBridge': { getTaskPrompt: vi.fn(async () => ({ ok: false as const, error: { code: 'gateway/internal', message: 'carrier lost' } })) },
      'remote.sessionLaunch': { launch: vi.fn(async () => ({ ok: false as const, error: { code: 'gateway/internal', message: 'carrier lost' } })) },
    })
    const seat = createLaunchSeat(ctx as never, fakeController())
    await vi.waitFor(() => { expect(seat.getSnapshot().services.probe).toBeDefined() })
    const probe = await seat.getSnapshot().services.probe?.({ projectRoot: 'Z:/repo', taskKey: 'demo/1.1' }) as GetTaskPromptResult
    expect(probe).toMatchObject({ available: false, reasonCode: 'ERR_FORGE_CLI_UNAVAILABLE' })
    const launchResult = await seat.getSnapshot().services.launch?.(LAUNCH_INPUT) as SessionLaunchResult
    expect(launchResult).toMatchObject({ ok: false, reasonCode: 'ERR_SESSION_CHANNEL_UNAVAILABLE' })
  })

  it('a refused mount keeps the initial seat (the entries keep their mock rpc legs)', async () => {
    const { remote } = fakeRemote('refuse')
    const { ctx } = fakeCtx({ remote })
    const seat = createLaunchSeat(ctx as never, fakeController())
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(seat.getSnapshot().services.probe).toBeUndefined()
    expect(seat.getSnapshot().services.copyPromptToClipboard).toBe(copyPromptToClipboard)
  })

  it('a partial namespace mount keeps the initial seat (both namespaces required)', async () => {
    const { remote } = fakeRemote()
    const { ctx } = fakeCtx({
      remote,
      'remote.forgeBridge': { getTaskPrompt: vi.fn() }, // sessionLaunch missing
    })
    const seat = createLaunchSeat(ctx as never, fakeController())
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(seat.getSnapshot().services.probe).toBeUndefined()
  })
})
