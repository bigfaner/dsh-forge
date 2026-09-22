/**
 * The UF5 launch chain's REAL service assembly, client half (task 5.11 — the
 * integrate task 5.10's seam promised): the cordis rpc faces that replace the
 * build-stage mocks behind `Partial<SessionLaunchServices>`, plus the success
 * hand-over (切会话视图 + uiWorkspace.openSession). Three layers:
 *
 *   1. NAMESPACE MOUNT — the host half's `@Remote` services (4.1/4.2) are
 *      routable via the Gateway's SRC claims, but a namespace only EXISTS in
 *      `ctx.remote.*` after a client-side `TypertRemoteContribution` is
 *      mounted (`ctx.remote.$mount` — the api-remotes client assembly's own
 *      pattern, vendored api/remotes/src/client/index.ts). The contribution
 *      below is hand-written (no generator run for plugin packages): direct
 *      descriptors whose wire fields mirror the HOST methods' parameter names
 *      VERBATIM (`getTaskPrompt(input)` / `launch(input)` — the names survive
 *      the unminified host build, verified in lib/index.js), strict
 *      hand-rolled TypertSchema codecs for the parameters (the client's mount
 *      validation rejects src-json inputs — requireStrictCodec), src-json
 *      results (the host's SRC fallback validates nothing either; the values
 *      are the plugin's own union types).
 *
 *   2. SERVICE MEMBERS — probe/launch unwrap the `RemoteResult` envelope into
 *      the plain 4.1/4.2 unions (a gateway/transport failure maps to the
 *      member's channel-unavailable reasonCode, so the Interface 5 chain
 *      ROUTES it — never an error surface); tier 2 re-implements the host's
 *      create+prompt semantics over `ctx.remote.session` with the SAME message
 *      bytes (composeFirstUserMessage/forgeActorValue imported from the
 *      host-half actor module — it is dependency-free, and byte identity is
 *      load-bearing: the tier-2 requestId must derive from the same
 *      (session, message) stream as tier 1 so a timeout-raced tier-1 prompt
 *      cannot double-post).
 *
 *   3. THE SEAT — `createLaunchSeat(ctx, controller)` is the observable the
 *      client apply threads through BOTH navigation forms into the shell
 *      (the same identity channel the view-key machine rides). Its initial
 *      snapshot carries everything available WITHOUT the remote: the IPC
 *      bridge's recordSessionLink (the 5.16 adapter pattern) + the renderer
 *      tier-3 legs (clipboard / window-front) + the success hand-over; the
 *      rpc members (probe/launch/tier-2) land when the `remote` service
 *      arrives and the namespaces mount. Absent members stay undefined — the
 *      entries keep the build-stage mock for them (the DI switch 5.11's task
 *      file mandates: 5.x unit tests keep running on mocks).
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {
  InvocationDescriptor, InvocationParameterDescriptor, RemoteFailure, RemoteResult, TypertClientRemote,
  TypertRemoteContribution, TypertSchema,
} from '@deepseek-ai/dsh-typert-protocol'
import type { GetTaskPromptInput, GetTaskPromptResult } from './services'
import type { SessionLaunchInput, SessionLaunchResult } from './session-launch'
import type { RecordSessionLinkInput, SessionLink } from './ipc-types'
import type { SessionLaunchServices } from './contract'
import { getWorkbenchIpcBridge } from './ipc/workbench'
import type { ViewSwitchController } from './nav/view-switch'
import { composeFirstUserMessage, forgeActorValue } from '../host/actor-env'

// ---------------------------------------------------------------------------
// 1. The namespace mount (the hand-written Typert contribution)
// ---------------------------------------------------------------------------

/** The plugin's npm identity (contribution bookkeeping). */
const PACKAGE = '@dsh-forge/plugin-forge-workbench'

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

function describeFailure(failure: RemoteFailure): string {
  const detail = 'detail' in failure && typeof failure.detail === 'string' ? ` (${failure.detail})` : ''
  return `${failure.code}: ${failure.message}${detail}`
}

/** Parse a plain object with string fields (a strict hand-rolled TypertSchema). */
function parseStringRecord(value: unknown, fields: readonly string[], optional: readonly string[] = []): Record<string, string> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`expected an object with the string fields ${fields.join(', ')}`)
  }
  const source = value as Record<string, unknown>
  for (const field of fields) {
    if (typeof source[field] !== 'string') throw new TypeError(`field ${field} must be a string`)
  }
  for (const field of optional) {
    if (source[field] !== undefined && typeof source[field] !== 'string') {
      throw new TypeError(`optional field ${field} must be a string when present`)
    }
  }
  return value as Record<string, string>
}

/** GetTaskPromptInput's boundary schema: { projectRoot: string; taskKey: string }. */
const GET_TASK_PROMPT_INPUT_SCHEMA: TypertSchema<GetTaskPromptInput> = {
  parse(value: unknown): GetTaskPromptInput {
    return parseStringRecord(value, ['projectRoot', 'taskKey']) as unknown as GetTaskPromptInput
  },
}

/** SessionLaunchInput's boundary schema: promptText/title/cwd + optional sessionId. */
const SESSION_LAUNCH_INPUT_SCHEMA: TypertSchema<SessionLaunchInput> = {
  parse(value: unknown): SessionLaunchInput {
    return parseStringRecord(value, ['promptText', 'title', 'cwd'], ['sessionId']) as unknown as SessionLaunchInput
  },
}

/** One strict-parameter descriptor (the shape every client mount demands). */
function jsonParameter(name: string, typeSymbol: string, schema: TypertSchema<unknown>): InvocationParameterDescriptor {
  return {
    name,
    wire: name,
    source: 'json',
    codec: { mode: 'strict', typeSymbol, create: () => schema },
  }
}

const FORGE_BRIDGE_GET_TASK_PROMPT: InvocationDescriptor = {
  id: `${PACKAGE}#forgeBridge/getTaskPrompt`,
  service: 'forgeBridge',
  namespace: 'forgeBridge',
  method: 'getTaskPrompt',
  invocation: { kind: 'direct' },
  parameters: [jsonParameter('input', `${PACKAGE}#GetTaskPromptInput`, GET_TASK_PROMPT_INPUT_SCHEMA)],
  result: { mode: 'src-json' },
}

const SESSION_LAUNCH_LAUNCH: InvocationDescriptor = {
  id: `${PACKAGE}#sessionLaunch/launch`,
  service: 'sessionLaunch',
  namespace: 'sessionLaunch',
  method: 'launch',
  invocation: { kind: 'direct' },
  parameters: [jsonParameter('input', `${PACKAGE}#SessionLaunchInput`, SESSION_LAUNCH_INPUT_SCHEMA)],
  result: { mode: 'src-json' },
}

/**
 * The plugin's Remote contribution: the two endpoints the UF5 entry invokes.
 * Mounting installs `ctx.remote.forgeBridge` / `ctx.remote.sessionLaunch` as
 * namespace services (keys `remote.<ns>`); the descriptors' wire field
 * (`input`) is the HOST method's parameter name — the Gateway's SRC dispatch
 * maps wire fields onto parameters by exactly that name.
 */
export const FORGE_WORKBENCH_REMOTE_CONTRIBUTION: TypertRemoteContribution = {
  package: PACKAGE,
  descriptors: [FORGE_BRIDGE_GET_TASK_PROMPT, SESSION_LAUNCH_LAUNCH],
}

// ---------------------------------------------------------------------------
// 2. The rpc service members (RemoteResult → the 4.1/4.2 unions)
// ---------------------------------------------------------------------------

/** The mounted forgeBridge namespace's structural face (duck-checked at read). */
interface ForgeBridgeNamespace {
  getTaskPrompt(input: GetTaskPromptInput): Promise<RemoteResult<GetTaskPromptResult>>
}

/** The mounted sessionLaunch namespace's structural face. */
interface SessionLaunchNamespace {
  launch(input: SessionLaunchInput): Promise<RemoteResult<SessionLaunchResult>>
}

/**
 * Read a mounted namespace service, non-strict + duck-checked (the 5.16
 * guarded-read discipline: a partial or absent namespace degrades to
 * undefined — never a throw).
 */
function namespaceOf<T>(ctx: ClientContext, namespace: string, methods: readonly string[]): T | undefined {
  let candidate: unknown
  try {
    candidate = ctx.get(`remote.${namespace}`, false)
  } catch {
    return undefined
  }
  if (candidate === null || typeof candidate !== 'object') return undefined
  const face = candidate as Record<string, unknown>
  return methods.every(method => typeof face[method] === 'function') ? candidate as T : undefined
}

/** Unwrap the probe's envelope: a gateway failure IS the channel being unavailable. */
function unwrapPromptResult(result: RemoteResult<GetTaskPromptResult>): GetTaskPromptResult {
  if (result.ok) return result.value
  return {
    available: false,
    reasonCode: 'ERR_FORGE_CLI_UNAVAILABLE',
    detail: `forgeBridge channel failed: ${describeFailure(result.error)}`,
  }
}

/** Unwrap the launch envelope: a gateway failure routes into the chain (tier 2/3). */
function unwrapLaunchResult(result: RemoteResult<SessionLaunchResult>): SessionLaunchResult {
  if (result.ok) return result.value
  return {
    ok: false,
    reasonCode: 'ERR_SESSION_CHANNEL_UNAVAILABLE',
    detail: `sessionLaunch channel failed: ${describeFailure(result.error)}`,
  }
}

/** The upstream `session` namespace's structural face for the tier-2 legs (4.2 shapes). */
interface SessionChannelFace {
  create(request: { readonly sessionId?: string; readonly cwd?: string }): Promise<RemoteResult<{ readonly sessionId: string }>>
  prompt(request: {
    readonly requestId: string
    readonly sessionId: string
    readonly mode: 'queue'
    readonly content: readonly { readonly type: 'text'; readonly text: string }[]
  }): Promise<RemoteResult<{ readonly accepted: true }>>
}

/** The tier-2 channel read (per call — the web-app row may mount before or after us). */
export function sessionChannelOf(ctx: ClientContext): SessionChannelFace | undefined {
  return namespaceOf<SessionChannelFace>(ctx, 'session', ['create', 'prompt'])
}

/** The uiWorkspace read (spike-1 §2.2: openSession is the runtime session locator). */
function uiWorkspaceOf(ctx: ClientContext): { openSession(target: string): void } | undefined {
  let candidate: unknown
  try {
    candidate = ctx.get('uiWorkspace', false)
  } catch {
    return undefined
  }
  if (candidate === null || typeof candidate !== 'object') return undefined
  const face = candidate as { openSession?: unknown }
  return typeof face.openSession === 'function'
    ? candidate as { openSession(target: string): void }
    : undefined
}

/** Session-id mint, the host's `session-<uuid>` shape (best-effort randomness). */
function mintSessionId(): string {
  const crypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (typeof crypto?.randomUUID === 'function') return `session-${crypto.randomUUID()}`
  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * The tier-2 requestId twin: sha256(sessionId + NUL + message) hex, first 32
 * chars, `forge-launch-` prefix — the EXACT stream the host's
 * deriveLaunchRequestId hashes (host/session-launch.ts), so a tier-2 replay of
 * a timed-out-but-actually-delivered tier-1 prompt hits the same upstream
 * `hasPromptRequest` short-circuit. crypto.subtle is available in the
 * renderer's secure context (dsh-app:// / loopback); without it the
 * deterministic FNV fallback below keeps replays idempotent WITHIN tier 2
 * (cross-tier dedup is the degraded dimension, documented here).
 */
export async function deriveLaunchRequestIdClient(sessionId: string, message: string): Promise<string> {
  const subtle = (globalThis as { crypto?: { subtle?: { digest(algorithm: 'SHA-256', data: BufferSource): Promise<ArrayBuffer> } } })
    .crypto?.subtle
  const stream = `${sessionId}\u0000${message}`
  if (subtle !== undefined) {
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(stream))
    const hex = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
    return `forge-launch-${hex.slice(0, 32)}`
  }
  // FNV-1a 32×2 (two seeds, 16 hex chars): deterministic, dependency-free.
  let hashA = 0x811c9dc5
  let hashB = 0x01000193
  for (let index = 0; index < stream.length; index += 1) {
    const code = stream.charCodeAt(index)
    hashA = Math.imul(hashA ^ code, 0x01000193) >>> 0
    hashB = Math.imul(hashB ^ ((code + index) & 0xffff), 0x85ebca6b) >>> 0
  }
  return `forge-launch-${hashA.toString(16).padStart(8, '0')}${hashB.toString(16).padStart(8, '0')}`
}

/** Fold a channel-leg failure into the chain's routing result. */
function channelFailed(stage: 'create' | 'prompt', failure: RemoteFailure, sessionId: string): SessionLaunchResult {
  return {
    ok: false,
    reasonCode: 'ERR_SESSION_CHANNEL_UNAVAILABLE',
    detail: `renderer session channel ${stage} failed: ${describeFailure(failure)}`,
    ...(sessionId === '' ? {} : { sessionId }),
  }
}

/**
 * Tier 2 (Interface 5 candidate 2): the SAME create+prompt semantics as the
 * host's tier 1, over the renderer's `ctx.remote.session` namespace —
 * caller-minted id = idempotent adopt, the message = verbatim prompt + the
 * FORGE_ACTOR line, queue mode (a persisted first user message).
 */
export async function launchViaClientChannel(
  ctx: ClientContext,
  input: SessionLaunchInput,
): Promise<SessionLaunchResult> {
  const channel = sessionChannelOf(ctx)
  if (channel === undefined) {
    return {
      ok: false,
      reasonCode: 'ERR_SESSION_CHANNEL_UNAVAILABLE',
      detail: 'the renderer session channel (ctx.remote.session) is unavailable',
    }
  }
  const requested = input.sessionId?.trim() ?? ''
  const sessionId = requested === '' ? mintSessionId() : requested
  try {
    const created = await channel.create({ sessionId, cwd: input.cwd })
    if (!created.ok) return channelFailed('create', created.error, sessionId)
    const liveSessionId = created.value.sessionId
    const message = composeFirstUserMessage(input.promptText, forgeActorValue(liveSessionId))
    const prompted = await channel.prompt({
      requestId: await deriveLaunchRequestIdClient(liveSessionId, message),
      sessionId: liveSessionId,
      mode: 'queue',
      content: [{ type: 'text', text: message }],
    })
    if (!prompted.ok) return channelFailed('prompt', prompted.error, liveSessionId)
    return { ok: true, sessionId: liveSessionId }
  } catch (error) {
    return {
      ok: false,
      reasonCode: 'ERR_SESSION_CHANNEL_UNAVAILABLE',
      detail: `renderer session channel threw: ${describeError(error)}`,
      ...(sessionId === '' ? {} : { sessionId }),
    }
  }
}

// ---------------------------------------------------------------------------
// 3. The tier-3 renderer legs + the seat
// ---------------------------------------------------------------------------

/**
 * Tier 3 leg 1 (frozen M1 fallback form): the verbatim prompt to the system
 * clipboard. Resolves false when denied/unavailable — the chain then surfaces
 * the clipboard-denied terminal (no silent failure).
 */
export async function copyPromptToClipboard(text: string): Promise<boolean> {
  const clipboard = (globalThis as { navigator?: { clipboard?: { writeText(value: string): Promise<void> } | undefined } | undefined })
    .navigator?.clipboard
  if (clipboard === undefined) return false
  try {
    await clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * Tier 3 leg 2: bring the main window to front. The renderer-side best effort
 * is `window.focus()`; the M1 main-side session-focus form needs a bridge verb
 * the preload surface does not carry (documented degradation — the frozen
 * fallback's toast still guides the user).
 */
export function bringMainWindowToFront(): void {
  try {
    ;(globalThis as { window?: { focus(): void } | undefined }).window?.focus()
  } catch {
    // A guarded no-op — the fallback chain's presentation continues.
  }
}

/** The seat's snapshot: the services partial + the success hand-over. */
export interface LaunchSeatSnapshot {
  /**
   * The REAL service members — absent members stay undefined so the entry
   * keeps its build-stage mock for them (the DI switch, 5.11 Implementation
   * Notes).
   */
  readonly services: Partial<SessionLaunchServices>
  /**
   * The launch-success hand-over: 切会话视图 through the ONE write path (the
   * view-switch controller — Hard Rule: 不得旁路刷新/重载上游 SPA), then
   * `ctx.uiWorkspace.openSession(sessionId)` locates the session (spike-1
   * §2.2 — the M1 localStorage poke is boot-time only and stays retired).
   */
  readonly onLaunched: (sessionId: string) => void
}

/** The observable seat store (getSnapshot/subscribe — the uSES currency). */
export interface LaunchSeatStore {
  /** @returns the current snapshot (stable reference between commits). */
  getSnapshot(): LaunchSeatSnapshot
  /** Subscribe to commits (the rpc members landing). */
  subscribe(listener: () => void): () => void
}

/**
 * Assemble the launch seat: the initial (remote-free) members immediately,
 * the rpc members when the `remote` service arrives and the namespace
 * contribution mounts. All reads are guarded — a hostless world (jsdom, the
 * pre-boot window) simply keeps the initial snapshot forever.
 * @param ctx - client root context (the plugin's apply context).
 * @param controller - the shared view-switch controller (the success leg).
 * @returns the seat store both navigation forms thread into the shell.
 */
export function createLaunchSeat(ctx: ClientContext, controller: ViewSwitchController): LaunchSeatStore {
  const bridge = getWorkbenchIpcBridge()
  const listeners = new Set<() => void>()

  const onLaunched = (sessionId: string): void => {
    // 切会话视图 FIRST (the machine + its persistence), then locate the
    // session inside the conversation — openSession's replaceMain is itself
    // a navigation, so the machine must already say `session`.
    controller.switchSession()
    uiWorkspaceOf(ctx)?.openSession(sessionId)
  }

  let snapshot: LaunchSeatSnapshot = Object.freeze({
    services: {
      copyPromptToClipboard,
      bringMainWindowToFront,
      ...(bridge === undefined
        ? {}
        : {
          // The 5.16 adapter pattern: the preload verb 1:1. Its rejection —
          // whatever envelope form — is SWALLOWED by the entry's success chain
          // (the session already exists; a failed persist must not un-launch
          // it), so no normalization layer is needed on this leg.
          recordSessionLink: (input: RecordSessionLinkInput): Promise<SessionLink> =>
            bridge.recordSessionLink(input),
        }),
    },
    onLaunched,
  })

  const commit = (services: Partial<SessionLaunchServices>): void => {
    snapshot = Object.freeze({ services, onLaunched })
    for (const listener of [...listeners]) listener()
  }

  ctx.effect(() => {
    // The inject fiber owns the namespace mount for the plugin's life; its
    // disposal (plugin unload / remote bounce unwind) unmounts the namespaces.
    // Guarded: a minimal/test context without inject keeps the initial seat
    // (the hostless discipline — no throw, the mock legs answer).
    if (typeof ctx.inject !== 'function') return () => {}
    const fiber = ctx.inject(['remote'], (remoteCtx: ClientContext) => {
      const remote = remoteCtx.get('remote', false) as TypertClientRemote | undefined
      if (remote === undefined || typeof remote.$mount !== 'function') return
      void remote.$mount(FORGE_WORKBENCH_REMOTE_CONTRIBUTION)
        .then((dispose) => {
          // The disposer must unwind with the inject fiber (remote bounce).
          try {
            remoteCtx.effect(() => () => { void dispose() }, 'forge-workbench: launch namespaces unmount')
          } catch {
            void dispose()
            return
          }
          const forgeBridge = namespaceOf<ForgeBridgeNamespace>(remoteCtx, 'forgeBridge', ['getTaskPrompt'])
          const sessionLaunch = namespaceOf<SessionLaunchNamespace>(remoteCtx, 'sessionLaunch', ['launch'])
          if (forgeBridge === undefined || sessionLaunch === undefined) return
          commit({
            ...snapshot.services,
            probe: (input: { projectRoot: string; taskKey: string }): Promise<GetTaskPromptResult> =>
              forgeBridge.getTaskPrompt(input).then(unwrapPromptResult),
            launch: (input: SessionLaunchInput): Promise<SessionLaunchResult> =>
              sessionLaunch.launch(input).then(unwrapLaunchResult),
            launchViaClientChannel: (input: SessionLaunchInput): Promise<SessionLaunchResult> =>
              launchViaClientChannel(ctx, input),
          })
        })
        .catch(() => {
          // Mount refused (a conflicting contribution, a closed registry): the
          // seat keeps its initial members; the entries' mock legs still answer.
        })
    })
    return () => { void fiber.dispose() }
  }, 'forge-workbench: launch rpc namespaces')

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}
