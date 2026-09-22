// e2e fixture: the session-channel stub, test-process half (task 6.1 — AC4:
// 「创建成功/失败/结束事件」三态可编排, 4.2/6.3 消费).
//
// The host-side implementation lives in the plugin
// (packages/plugins/forge-workbench/src/host/session-channel-stub.ts), wired
// behind the `DSH_FORGE_SESSION_STUB_DIR` env seam — the only in-host
// injection point, because the DF004 main channel resolves from
// `ctx.sessionController` and cordis `provide()` refuses duplicate service
// names (an in-process stand-in cannot register beside the web-app bundle's
// real controller). This module is the OTHER end of the file protocol:
//
//   <dir>/control.json — orchestration (re-read by the host half per call):
//     { create?: 'ok'|'fail'|'hang', createError?, prompt?: 'ok'|'fail'|'hang',
//       promptError?, mintSessionId? }
//   <dir>/journal.jsonl — observations, one JSON line per channel call:
//     { kind: 'create', at, sessionId, cwd }
//     { kind: 'prompt', at, sessionId, requestId, mode, text }  // composed
//       first user message (prompt + FORGE_ACTOR line) — the SC2-2 逐字符
//       hash oracle
//     { kind: 'session-ended', at, sessionId }  // the THIRD state: written
//       by THIS helper (markSessionEnded) — sessions carry no terminal signal
//       (spike-1 §5), so "end" is a stub-side fact the journey drives the
//       endSessionLink verb off.
//
// Repository hygiene: the stub dir is journey-local (caller-owned temp root).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** The env seam name (mirrors the plugin host half's constant). */
export const SESSION_STUB_DIR_ENV = 'DSH_FORGE_SESSION_STUB_DIR'

/** Control-file shape (absent keys = 'ok'). */
export interface ChannelStubControl {
  readonly create?: 'ok' | 'fail' | 'hang'
  readonly createError?: string
  readonly prompt?: 'ok' | 'fail' | 'hang'
  readonly promptError?: string
  readonly mintSessionId?: string
}

/** One journal line. */
export interface ChannelStubEntry {
  readonly kind: 'create' | 'prompt' | 'session-ended'
  readonly at: string
  readonly sessionId?: string
  readonly cwd?: string
  readonly requestId?: string
  readonly mode?: string
  /** kind 'prompt' only: the composed first user message, verbatim. */
  readonly text?: string
}

export interface ChannelStub {
  readonly dir: string
  readonly env: { readonly DSH_FORGE_SESSION_STUB_DIR: string }
  writeControl(control: ChannelStubControl): void
  readControl(): ChannelStubControl
  readJournal(): ChannelStubEntry[]
  /** The composed first-user-message observations (SC2-2's oracle). */
  readPrompts(): ChannelStubEntry[]
  /** The end-event marker: appends the third journal state. */
  markSessionEnded(sessionId: string): void
}

/**
 * Create the channel stub home (the host half appends into the same files).
 * @param dir - journey-local temp dir.
 */
export function createChannelStub(dir: string): ChannelStub {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'control.json'), `${JSON.stringify({}, undefined, 2)}\n`)
  writeFileSync(join(dir, 'journal.jsonl'), '')
  const journalPath = join(dir, 'journal.jsonl')
  const appendJournal = (entry: ChannelStubEntry): void => {
    const existing = readFileSync(journalPath, 'utf8')
    writeFileSync(journalPath, `${existing}${JSON.stringify(entry)}\n`)
  }
  return {
    dir,
    env: { [SESSION_STUB_DIR_ENV]: dir },
    writeControl: (control) => { writeFileSync(join(dir, 'control.json'), `${JSON.stringify(control, undefined, 2)}\n`) },
    readControl: (): ChannelStubControl => {
      try {
        return JSON.parse(readFileSync(join(dir, 'control.json'), 'utf8')) as ChannelStubControl
      } catch {
        return {}
      }
    },
    readJournal: (): ChannelStubEntry[] => {
      try {
        return readFileSync(journalPath, 'utf8')
          .split('\n')
          .filter(line => line.trim() !== '')
          .map(line => JSON.parse(line) as ChannelStubEntry)
      } catch {
        return []
      }
    },
    readPrompts(): ChannelStubEntry[] {
      return this.readJournal().filter(entry => entry.kind === 'prompt')
    },
    markSessionEnded: (sessionId) => { appendJournal({ kind: 'session-ended', at: new Date().toISOString(), sessionId }) },
  }
}
