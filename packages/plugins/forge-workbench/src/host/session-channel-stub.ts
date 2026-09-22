/**
 * The e2e stub session channel, host half (task 6.1 fixture 工程 — the seam
 * 6.3's SC2/SC3 legs drive; AC「stub 会话通道可编排三态」).
 *
 * Why an env seam instead of a second cordis service: the DF004 main channel
 * is resolved per call from `ctx.sessionController` (session-launch-rpc), and
 * cordis `provide()` THROWS on a duplicate service name — an in-process
 * stand-in cannot register beside the web-app bundle's real controller. The
 * only injection point inside the host child is therefore this module, wired
 * in host/index.ts behind `DSH_FORGE_SESSION_STUB_DIR` (same env-seam family
 * as DSH_FORGE_PROJECT_ROOTS; unset → the real channel, production bytes
 * untouched).
 *
 * Protocol (file-backed; the test process is the other end):
 *   <stubDir>/control.json — orchestration, re-read on EVERY channel call:
 *     { "create": "ok" | "fail" | "hang", "createError"?: string,
 *       "prompt": "ok" | "fail" | "hang", "promptError"?: string,
 *       "mintSessionId"?: string }
 *   <stubDir>/journal.jsonl — one JSON line per observed channel call:
 *     { "kind": "create", "at": ISO, "sessionId": string, "cwd": string }
 *     { "kind": "prompt", "at": ISO, "sessionId": string, "requestId": string,
 *       "mode": "queue", "text": string }   // the COMPOSED first user message
 *                                            (prompt + FORGE_ACTOR line) —
 *                                            6.3's 逐字符 hash oracle.
 * The third orchestration state (「结束事件」) is launcher-side convergence by
 * design (spike-1 §5: sessions carry no terminal signal); the TEST-side
 * helper appends a `{ "kind": "session-ended", "sessionId" }` journal line
 * (apps/desktop/e2e/fixtures/stubs/channel.ts) so 6.3 can drive the
 * endSessionLink verb off the same journal stream.
 *
 * Failure semantics mirror the real channel: 'fail' legs throw (the launch
 * core maps them to ERR_SESSION_CHANNEL_UNAVAILABLE); 'hang' legs never
 * settle (the per-leg ceiling classifies them as timeouts).
 */

import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { SessionChannel } from './session-launch'

/** Env name carrying the stub home dir (unset/empty → real channel). */
export const SESSION_STUB_DIR_ENV = 'DSH_FORGE_SESSION_STUB_DIR'

const CONTROL_FILE = 'control.json'
const JOURNAL_FILE = 'journal.jsonl'

/** The orchestration file shape (absent file / absent key = 'ok'). */
export interface SessionStubControl {
  readonly create?: 'ok' | 'fail' | 'hang'
  readonly createError?: string
  readonly prompt?: 'ok' | 'fail' | 'hang'
  readonly promptError?: string
  readonly mintSessionId?: string
}

/** Resolve the stub dir from an env bag (undefined = seam off). */
export function resolveSessionStubDir(env: Record<string, string | undefined> = process.env): string | undefined {
  const value = env[SESSION_STUB_DIR_ENV]?.trim()
  return value === undefined || value === '' ? undefined : value
}

function readControl(stubDir: string): SessionStubControl {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(stubDir, CONTROL_FILE), 'utf8'))
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as SessionStubControl
  } catch {
    return {} // absent or malformed control = everything ok (the stub boots usable)
  }
}

function journal(stubDir: string, entry: Record<string, unknown>): void {
  appendFileSync(join(stubDir, JOURNAL_FILE), `${JSON.stringify(entry)}\n`)
}

/** Behavior for one leg: 'ok' answers normally, 'fail' throws, 'hang' never settles. */
type LegBehavior = 'ok' | 'fail' | 'hang'

function legBehavior(value: string | undefined): LegBehavior {
  return value === 'fail' || value === 'hang' ? value : 'ok'
}

function neverSettles(): Promise<never> {
  return new Promise<never>(() => {})
}

/**
 * Build a file-backed session channel bound to a stub home dir. The dir is
 * created by the TEST process before launch (the channel only reads control
 * and appends journal lines inside it).
 */
export function createStubSessionChannel(stubDir: string): SessionChannel {
  return {
    create(request: { readonly sessionId?: string; readonly cwd?: string }): Promise<{ readonly sessionId: string }> {
      const control = readControl(stubDir)
      const sessionId = request.sessionId?.trim() !== '' && request.sessionId !== undefined
        ? request.sessionId
        : control.mintSessionId ?? `session-stub-${randomUUID()}`
      journal(stubDir, { kind: 'create', at: new Date().toISOString(), sessionId, cwd: request.cwd ?? '' })
      if (legBehavior(control.create) === 'fail') {
        return Promise.reject(new Error(control.createError ?? 'stub session create failed (orchestrated)'))
      }
      if (legBehavior(control.create) === 'hang') return neverSettles()
      return Promise.resolve({ sessionId })
    },
    prompt(request: {
      readonly requestId: string
      readonly sessionId: string
      readonly mode: 'queue'
      readonly content: readonly { readonly type: 'text'; readonly text: string }[]
    }): Promise<{ readonly accepted: true }> {
      const control = readControl(stubDir)
      const text = request.content.map(part => part.text).join('')
      journal(stubDir, {
        kind: 'prompt',
        at: new Date().toISOString(),
        sessionId: request.sessionId,
        requestId: request.requestId,
        mode: request.mode,
        text,
      })
      if (legBehavior(control.prompt) === 'fail') {
        return Promise.reject(new Error(control.promptError ?? 'stub session prompt failed (orchestrated)'))
      }
      if (legBehavior(control.prompt) === 'hang') return neverSettles()
      return Promise.resolve({ accepted: true })
    },
  }
}
