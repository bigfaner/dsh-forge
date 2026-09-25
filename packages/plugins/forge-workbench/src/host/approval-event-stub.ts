/**
 * The e2e approval-event stub, host half (task 6.2 base — 审批事件 stub,
 * `approval_received` 注入面;AC「三类 stub + journal 落盘」的第三类).
 *
 * Why an env seam + file protocol (session-channel-stub precedent): the
 * production approval source is a REAL subagent asking through the upstream
 * `approval/request` waterfall — but the e2e legs run the session channel as
 * the file-backed stub (no real subagent exists to ask). The only in-host
 * injection point that keeps the production wire closed is therefore this
 * module, wired in host/index.ts behind `DSH_FORGE_APPROVAL_STUB_DIR` (env
 * seam family; unset → nothing is attached, production bytes untouched).
 *
 * Injected requests ride the REAL bridge core (approval-bridge/bridge.ts
 * `handle`): claim filter (dispatch-session registry) → T2 kernel port
 * (`approval_receive` → pending row → `approval_received` event → UI dock)
 * → human decision → `settle` answer — the injection face only mints the
 * event twin, it never bypasses the routing. `tools/pre-execute` captures
 * (callId → arguments join) get the same inject channel so payload bodies
 * can be staged exactly like the production observer would.
 *
 * Protocol (file-backed; the test process is the other end):
 *   <stubDir>/inject.jsonl — append-only, one JSON object per line:
 *     { "kind": "approval" | omitted, "agentId", "toolName", "callId"?, "reason"? }
 *       → target.handle (the bridge core; agentId = dispatch.session_id key)
 *     { "kind": "tool-exec", "callId", "arguments"? }
 *       → target.observeToolExec (the pre-execute capture)
 *   <stubDir>/journal.jsonl — host appends (shared with the session stub
 *     when both envs point at the same dir — the unified journal the legs
 *     read):
 *     { "kind": "approval", "at", "agentId", "toolName", "claimed": boolean,
 *       "outcome"?: ApprovalOutcome }   // outcome present iff claimed
 *     { "kind": "approval", ..., "claimed": false, "error": "malformed" }
 *   <stubDir>/inject.cursor — consumed line count (host-private; survives
 *     host restarts so replays never double-inject).
 *
 * Only newline-terminated lines are consumed (a partial trailing write is
 * left for the next poll — every inject is a full `JSON + '\n'` append).
 */

import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ApprovalOutcome } from './approval-bridge/bridge'

/** Env name carrying the stub home dir (unset/empty → seam off). */
export const APPROVAL_STUB_DIR_ENV = 'DSH_FORGE_APPROVAL_STUB_DIR'

const INJECT_FILE = 'inject.jsonl'
const JOURNAL_FILE = 'journal.jsonl'
const CURSOR_FILE = 'inject.cursor'

/** Default poll cadence (test-visible latency; legs poll-assert anyway). */
export const APPROVAL_STUB_POLL_INTERVAL_MS = 150

/** Resolve the stub dir from an env bag (undefined = seam off). */
export function resolveApprovalStubDir(env: Record<string, string | undefined> = process.env): string | undefined {
  const value = env[APPROVAL_STUB_DIR_ENV]?.trim()
  return value === undefined || value === '' ? undefined : value
}

/** The inject twin the bridge core's handle() consumes (no signal face). */
export interface ApprovalStubInjectRequest {
  readonly agentId: string
  readonly toolName: string
  readonly callId?: string
  readonly reason?: string
}

/**
 * What the stub drives — the production pair from host/index.ts
 * (approval-bridge core + pre-execute capture), narrow faces only.
 */
export interface ApprovalEventStubTarget {
  /** The bridge core's waterfall listener body (claim filter → kernel port → decision). */
  handle(request: ApprovalStubInjectRequest): Promise<ApprovalOutcome> | null
  /** The `tools/pre-execute` observer face (callId → arguments capture). */
  observeToolExec(exec: unknown): void
}

/** Attached controller (unit tests detach; the interval is unref'd regardless). */
export interface ApprovalEventStub {
  /** Stop polling (idempotent). */
  detach(): void
  /** Process pending inject lines once, on demand (tests avoid the cadence wait). */
  pollNow(): Promise<void>
  /** Await every in-flight outcome journal write (pollNow dispatches, idle settles). */
  idle(): Promise<void>
}

interface InjectLine {
  readonly kind?: unknown
  readonly agentId?: unknown
  readonly toolName?: unknown
  readonly callId?: unknown
  readonly reason?: unknown
  readonly arguments?: unknown
}

function journal(stubDir: string, entry: Record<string, unknown>): void {
  appendFileSync(join(stubDir, JOURNAL_FILE), `${JSON.stringify(entry)}\n`)
}

function readCursor(stubDir: string): number {
  try {
    const parsed = Number.parseInt(readFileSync(join(stubDir, CURSOR_FILE), 'utf8').trim(), 10)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
  } catch {
    return 0
  }
}

/** Complete (newline-terminated) JSON lines only; a trailing partial line waits. */
function completeLines(stubDir: string): string[] {
  let raw: string
  try {
    raw = readFileSync(join(stubDir, INJECT_FILE), 'utf8')
  } catch {
    return [] // no injects yet — a healthy idle state, not an error
  }
  if (raw === '' || !raw.endsWith('\n')) raw = `${raw.slice(0, raw.lastIndexOf('\n') + 1)}`
  return raw.split('\n').filter(line => line.trim() !== '')
}

/**
 * Attach the polling injector. The timer is unref'd so it never holds the
 * host child (or a unit test) open; `detach` is the explicit teardown face.
 */
export function attachApprovalEventStub(
  stubDir: string,
  target: ApprovalEventStubTarget,
  options?: { readonly intervalMs?: number },
): ApprovalEventStub {
  let detached = false
  let busy = false
  const inflight = new Set<Promise<void>>()
  const poll = async (): Promise<void> => {
    if (detached || busy) return
    busy = true
    try {
      const lines = completeLines(stubDir)
      let cursor = readCursor(stubDir)
      for (; cursor < lines.length; cursor += 1) {
        let line: InjectLine | null = null
        try {
          const parsed: unknown = JSON.parse(lines[cursor] as string)
          if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) line = parsed as InjectLine
        } catch {
          line = null
        }
        if (line === null) {
          journal(stubDir, { kind: 'approval', at: new Date().toISOString(), agentId: '', toolName: '', claimed: false, error: 'malformed' })
          continue
        }
        if (line.kind === 'tool-exec') {
          target.observeToolExec({ callId: line.callId, arguments: line.arguments })
          continue
        }
        // kind 'approval' (or absent — the default line shape)
        if (typeof line.agentId !== 'string' || line.agentId === ''
          || typeof line.toolName !== 'string' || line.toolName === '') {
          journal(stubDir, { kind: 'approval', at: new Date().toISOString(), agentId: String(line.agentId ?? ''), toolName: String(line.toolName ?? ''), claimed: false, error: 'malformed' })
          continue
        }
        const request: ApprovalStubInjectRequest = {
          agentId: line.agentId,
          toolName: line.toolName,
          ...(typeof line.callId === 'string' && line.callId !== '' ? { callId: line.callId } : {}),
          ...(typeof line.reason === 'string' && line.reason !== '' ? { reason: line.reason } : {}),
        }
        const claimed = target.handle(request)
        if (claimed === null) {
          journal(stubDir, { kind: 'approval', at: new Date().toISOString(), ...request, claimed: false })
          continue
        }
        // Fire-and-forget outcome journaling: the human decision is
        // unbounded by design (spike-2 §1.3 ④-2), so the poll loop must
        // never serialize behind it — a pending approval would otherwise
        // block every subsequent inject line. handle() never rejects by
        // contract (fail-closed → 'unavailable'); the catch keeps a rogue
        // rejection from becoming an unhandled rejection. The in-flight set
        // backs `idle()` — tests await the journal write without sleeping.
        const tracked: Promise<void> = claimed
          .catch(() => 'unavailable' as const)
          .then((outcome) => { journal(stubDir, { kind: 'approval', at: new Date().toISOString(), ...request, claimed: true, outcome }) })
        inflight.add(tracked)
        void tracked.then(() => { inflight.delete(tracked) }, () => { inflight.delete(tracked) })
      }
      if (cursor !== readCursor(stubDir)) writeFileSync(join(stubDir, CURSOR_FILE), `${String(cursor)}\n`)
    } catch {
      // File-system hiccup (e.g. the dir vanishing mid-teardown): the next
      // tick retries; nothing here is worth crashing the host child for.
    } finally {
      busy = false
    }
  }
  const timer = setInterval(() => { void poll() }, options?.intervalMs ?? APPROVAL_STUB_POLL_INTERVAL_MS)
  timer.unref?.()
  void poll()
  return {
    detach: () => {
      if (detached) return
      detached = true
      clearInterval(timer)
    },
    pollNow: poll,
    idle: () => Promise.all([...inflight]).then(() => undefined),
  }
}
