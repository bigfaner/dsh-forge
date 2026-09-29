// tests/e2e/stubs/dispatch — 派发通道统一 stub,test 半身(任务 6.2 base).
//
// One stub home drives BOTH host seams (the env pair) against ONE journal:
//   DSH_FORGE_SESSION_STUB_DIR  → the M2 session-channel stub host half
//                                 (packages/plugins/forge-workbench/src/host/
//                                 session-channel-stub.ts): create/prompt +
//                                 orchestratable fail/hang, journal rows
//                                 `create` / `prompt` / `session-ended`;
//   DSH_FORGE_APPROVAL_STUB_DIR → the 6.2 approval-event stub host half
//                                 (approval-event-stub.ts): inject.jsonl →
//                                 REAL bridge core, journal row `approval`.
// The M2 channel test-half (apps/desktop/e2e/fixtures/stubs/channel.ts) is
// reused verbatim — its control/journal protocol is the wire the host half
// already speaks — and this module adds the approval injector + the unified
// journal reader the 6.3-6.8 legs consume.
//
// Repository hygiene: the stub dir is journey-local (caller-owned temp root);
// the host child only ever reads control/inject and appends journal lines.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createChannelStub, type ChannelStub, type ChannelStubControl, type ChannelStubEntry } from '../../../apps/desktop/e2e/fixtures/stubs/channel.ts'
import { APPROVAL_STUB_DIR_ENV, type ApprovalStubInjectRequest } from '../../../packages/plugins/forge-workbench/src/host/approval-event-stub.ts'

/** An approval journal row (the third stub kind, appended by the host half). */
export interface ApprovalJournalEntry extends ChannelStubEntry {
  readonly kind: 'approval'
  readonly agentId?: string
  readonly claimed?: boolean
  readonly outcome?: string
  readonly error?: string
}

/**
 * A lineage-corpus journal row (the FIFTH stub kind, appended by the TEST
 * half — 2.9's stub 扩展): the `parentSession`/`origin` header facts of one
 * session seeded into the REAL persistence backend (tests/e2e/stubs/
 * lineage-corpus.ts), the 对拍 anchor the SC7 leg cross-checks against the
 * artifacts the host child actually consumed.
 */
export interface SessionSeededJournalEntry extends ChannelStubEntry {
  readonly kind: 'session-seeded'
  readonly cwd?: string
  readonly parentSession?: string
  readonly origin?: string
  readonly mode?: string
  readonly label?: string
  readonly title?: string
}

export interface DispatchStub extends ChannelStub {
  readonly dir: string
  /** The env pair both host halves read (pass into the Electron launch env). */
  readonly env: { readonly DSH_FORGE_SESSION_STUB_DIR: string; readonly DSH_FORGE_APPROVAL_STUB_DIR: string }
  writeControl(control: ChannelStubControl): void
  readControl(): ChannelStubControl
  readJournal(): ChannelStubEntry[]
  readPrompts(): ChannelStubEntry[]
  markSessionEnded(sessionId: string): void
  /** Append an approval-request inject line (drives the REAL bridge core). */
  injectApproval(request: ApprovalStubInjectRequest): void
  /** Append a tool-exec capture line (callId → arguments join payload). */
  injectToolExec(callId: string, args: unknown): void
  /** The approval rows of the unified journal. */
  readApprovals(): ApprovalJournalEntry[]
  /**
   * Append one lineage-corpus 对拍 row (the seeded header facts; the TEST
   * half's own observation stream, beside `markSessionEnded`'s precedent).
   */
  noteSessionSeeded(entry: Omit<SessionSeededJournalEntry, 'kind' | 'at'>): void
  /** The lineage-corpus rows of the unified journal. */
  readSeeded(): SessionSeededJournalEntry[]
}

/**
 * Create the unified dispatch stub home. Both env vars point at `dir`, so
 * the session journal and the approval journal are ONE stream (kinds:
 * create / prompt / session-ended / approval).
 */
export function createDispatchStub(dir: string): DispatchStub {
  const channel: ChannelStub = createChannelStub(dir)
  mkdirSync(dir, { recursive: true })
  const injectPath = join(dir, 'inject.jsonl')
  writeFileSync(injectPath, '')
  const appendInject = (line: Record<string, unknown>): void => {
    let existing = ''
    try {
      existing = readFileSync(injectPath, 'utf8')
    } catch {
      existing = ''
    }
    writeFileSync(injectPath, `${existing}${JSON.stringify(line)}\n`)
  }
  return {
    ...channel,
    dir,
    env: {
      DSH_FORGE_SESSION_STUB_DIR: dir,
      [APPROVAL_STUB_DIR_ENV]: dir,
    },
    injectApproval: (request) => { appendInject({ kind: 'approval', ...request }) },
    injectToolExec: (callId, args) => { appendInject({ kind: 'tool-exec', callId, arguments: args }) },
    readApprovals: () => channel.readJournal().filter((entry): entry is ApprovalJournalEntry => entry.kind === 'approval') as ApprovalJournalEntry[],
    noteSessionSeeded: entry => { channel.appendJournal({ kind: 'session-seeded', at: new Date().toISOString(), ...entry }) },
    readSeeded: () => channel.readJournal().filter((entry): entry is SessionSeededJournalEntry => entry.kind === 'session-seeded') as SessionSeededJournalEntry[],
  }
}
