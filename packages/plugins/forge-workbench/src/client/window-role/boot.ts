/**
 * The C10 window-role BOOT, client half (M4 task 4.3; tech-design
 * §Interfaces·Interface 5「windowGetRole:新窗 boot 经 preload 查询,typed
 * 握手,不走 URL hash」+ ui-design §Component C10): every renderer of the
 * single-instance shell loads the SAME dsh-app://app/ document — the main
 * window and each detached window — so the renderer's own assembly must ask
 * the shell WHO IT IS before the heavy workbench seats register.
 *
 *   role.kind='detached' → 单视图渲染 (detached-view.tsx): NO workbench
 *       header, NO region navigation (the left-tree/nav/rail/rightbar/split
 *       seats are MAIN-window-only — a detached window never double-registers
 *       them), the window title replaces the 工作台头 (the shell owns it);
 *   role.kind='main' / null → the normal workbench (the pre-4.3 apply body);
 *   no dshForge at all (jsdom mounts, hostless tests, the fallback-rail
 *       world) → main, resolved SYNCHRONOUSLY — the hostless boot contract
 *       the 3.3/4.4 specs assert.
 *
 * The role never travels through the URL (the M1 spike-3 discipline role.ts
 * owns main-side); this module is its typed consumer. The twins below are
 * STRUCTURAL COPIES of the main-side types (windows/role.ts, detached.ts,
 * layout-schema.ts — the plugin cannot depend on the app, the 4.1 precedent):
 * a drift surfaces as the shape guard rejecting, never as a crash.
 */
import type { LineageSubagentAddress } from '../lineage'

/** Interface 4/5 detached 窗口视图词表 (layout-schema DetachedView 的结构孪生). */
export type DetachedViewKind = 'board' | 'conversation'

/**
 * The detached 窗口's session target (§Data Models: SessionId |
 * SubagentAddress — 恰一形态; the subagent arm is the structural twin of
 * {@link LineageSubagentAddress}).
 */
export type SessionTargetClient =
  | { readonly sessionId: string }
  | { readonly parentSessionId: string; readonly childSessionId: string; readonly mode: 'one-shot' | 'continuable' }

/** windowOpenDetached's input (Interface 5; rect = the 4.5 layout-replay leg). */
export interface OpenDetachedInputClient {
  readonly projectId: string
  readonly view: DetachedViewKind
  readonly target?: SessionTargetClient | undefined
  readonly rect?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | undefined
}

/** The window-changed push payload (Interface 5; preload dshForge.window.onChanged 同型). */
export type WindowChangedEventClient =
  | { readonly type: 'detached-opened'; readonly windowId: string; readonly projectId: string; readonly view: DetachedViewKind; readonly target?: SessionTargetClient }
  | { readonly type: 'detached-closed'; readonly windowId: string; readonly projectId: string; readonly view: DetachedViewKind; readonly target?: SessionTargetClient }

/** The typed handshake's detached arm (windows/role.ts WindowRole 的结构孪生). */
export interface DetachedWindowRole {
  readonly kind: 'detached'
  readonly windowId: string
  readonly projectId: string
  readonly view: DetachedViewKind
  readonly target?: SessionTargetClient | undefined
}

/** What every renderer boot resolves to: the workbench, or one detached view. */
export type WindowBootRole = DetachedWindowRole | { readonly kind: 'main' }

/**
 * The preload window-verb face (task 4.2's `dshForge.window` group) as this
 * plugin consumes it — one member per whitelisted channel, rejections riding
 * the `{ code, message, detail? }` envelope (normalized where it matters).
 */
export interface WindowVerbFaceClient {
  openDetached(input: OpenDetachedInputClient): Promise<{ windowId: string }>
  getRole(): Promise<DetachedWindowRole | { kind: 'main' } | null>
  recall(windowId: string): Promise<void>
  onChanged(callback: (event: WindowChangedEventClient) => void): () => void
}

/** The face's members — the guarded-read completeness rule (bridge discipline). */
const WINDOW_FACE_MEMBERS = ['openDetached', 'getRole', 'recall', 'onChanged'] as const

/**
 * Read the preload `dshForge.window` verb face, GUARDED: hostless
 * environments (jsdom unit mounts, the fallback-rail world, a web build
 * without the shell) have no `dshForge` — the resolver answers undefined and
 * the boot routes main synchronously. A partial face degrades to absent (one
 * rule, no per-verb presence checks — the getWorkbenchIpcBridge discipline).
 */
export function getWindowVerbFace(): WindowVerbFaceClient | undefined {
  let candidate: unknown
  try {
    candidate = (globalThis as { dshForge?: { window?: unknown } }).dshForge?.window
  } catch {
    return undefined // sandboxed globals can throw on property reads
  }
  if (candidate === null || typeof candidate !== 'object') return undefined
  const face = candidate as Record<string, unknown>
  return WINDOW_FACE_MEMBERS.every(member => typeof face[member] === 'function')
    ? (candidate as WindowVerbFaceClient)
    : undefined
}

const isObject = (candidate: unknown): candidate is Record<string, unknown> =>
  typeof candidate === 'object' && candidate !== null

const isNonEmptyString = (candidate: unknown): candidate is string =>
  typeof candidate === 'string' && candidate !== ''

/** The target's subagent arm, narrowed (the aside origins' triple). */
export function subagentTargetOf(target: SessionTargetClient | undefined): LineageSubagentAddress | undefined {
  if (target === undefined || !isObject(target)) return undefined
  if ('parentSessionId' in target && 'childSessionId' in target && 'mode' in target) return target
  return undefined
}

/**
 * Shape-guard the handshake's answer (the structural twins' drift alarm): a
 * role that is not a well-formed `{ kind: 'main' }` / detached arm routes
 * MAIN — the boot never crashes on a drifted payload, and a malformed
 * detached arm degrades to the workbench the window can always render.
 */
export function isDetachedRole(role: unknown): role is DetachedWindowRole {
  if (!isObject(role) || role.kind !== 'detached') return false
  if (!isNonEmptyString(role.windowId) || !isNonEmptyString(role.projectId)) return false
  if (role.view !== 'board' && role.view !== 'conversation') return false
  if (role.target === undefined) return true
  const target = role.target
  if (isObject(target) && isNonEmptyString(target.sessionId) && Object.keys(target).length === 1) return true
  return isObject(target) && isNonEmptyString(target.parentSessionId)
    && isNonEmptyString(target.childSessionId)
    && (target.mode === 'one-shot' || target.mode === 'continuable')
}

/** What the router hands each world. */
export interface WindowBootHandlers {
  /** The normal workbench assembly (role main/null, or no shell at all). */
  main(): (() => void) | void
  /** The single-view assembly (无工作台头,区导航不可用). */
  detached(role: DetachedWindowRole): (() => void) | void
}

/** One face's memoized handshake (a window's role never changes mid-life). */
const roleMemo = new WeakMap<object, Promise<WindowBootRole>>()

/**
 * Route the renderer's boot (AC2): query the role EARLY — before the heavy
 * apply — and dispatch exactly one assembly.
 *
 *   face ABSENT  → `main()` runs SYNCHRONOUSLY (the hostless contract the
 *                  nav-form/slots specs assert; identical to the pre-4.3
 *                  boot);
 *   face PRESENT → one `getRole()` IPC roundtrip gates the assembly: a
 *                  well-formed detached arm → `detached(role)`, anything else
 *                  (main / null / a rejection / a drifted shape) → `main()`.
 *
 * The handshake is memoized on the FACE object (a stable preload namespace):
 * repeated routings in one renderer share the single query, while tests with
 * fresh stubbed faces query afresh.
 * @param face - the preload window verb face (`getWindowVerbFace()`).
 * @param handlers - the two worlds' assemblies.
 * @returns a disposer that cancels a pending routing and disposes whatever
 * assembled (a fiber torn down mid-handshake leaves nothing behind).
 */
export function routeWindowBoot(face: WindowVerbFaceClient | undefined, handlers: WindowBootHandlers): () => void {
  if (face === undefined) {
    const dispose = handlers.main()
    return () => { if (typeof dispose === 'function') dispose() }
  }
  let cancelled = false
  let disposeAssembled: (() => void) | undefined
  const faceKey = face as unknown as object
  let handshake = roleMemo.get(faceKey)
  if (handshake === undefined) {
    handshake = face.getRole()
      .then(role => (isDetachedRole(role) ? role : { kind: 'main' as const }))
      .catch(() => ({ kind: 'main' as const }))
    roleMemo.set(faceKey, handshake)
  }
  void handshake.then((role) => {
    if (cancelled) return
    const dispose = role.kind === 'detached' ? handlers.detached(role) : handlers.main()
    if (typeof dispose === 'function') disposeAssembled = dispose
  })
  return () => {
    cancelled = true
    disposeAssembled?.()
    disposeAssembled = undefined
  }
}
