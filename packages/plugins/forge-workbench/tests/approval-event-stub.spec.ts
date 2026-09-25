// Task 6.2: the e2e approval-event stub, host half (审批事件注入面 — the
// third stub kind). Pure file protocol + a fake bridge core, mirroring the
// session-channel-stub.spec unit face: inject lines drive target.handle /
// target.observeToolExec, outcomes journal back, the cursor never replays,
// malformed lines degrade to claimed:false, and partial trailing writes wait.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  APPROVAL_STUB_DIR_ENV,
  attachApprovalEventStub,
  resolveApprovalStubDir,
  type ApprovalEventStubTarget,
} from '../src/host/approval-event-stub.ts'
import { createApprovalBridgeCore } from '../src/host/approval-bridge/bridge.ts'

const dirs: string[] = []
function stubDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-apprstub-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'inject.jsonl'), '')
  return dir
}
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop() as string, { recursive: true, force: true })
})

type HandleCall = { readonly agentId: string; readonly toolName: string; readonly callId?: string; readonly reason?: string }

/** A fake target's recorded observation faces. */
interface FakeTarget {
  readonly calls: HandleCall[]
  readonly execs: unknown[]
  readonly target: ApprovalEventStubTarget
}

/** A fake target recording calls; 'unclaim' makes handle return null. */
function fakeTarget(behavior: { readonly unclaim?: boolean; readonly outcome?: 'allowed-once' | 'rejected' } = {}): FakeTarget {
  const calls: HandleCall[] = []
  const execs: unknown[] = []
  return {
    calls,
    execs,
    target: {
      handle: (request) => {
        calls.push(request)
        return behavior.unclaim === true ? null : Promise.resolve(behavior.outcome ?? 'allowed-once')
      },
      observeToolExec: (exec) => { execs.push(exec) },
    },
  }
}

function inject(dir: string, line: Record<string, unknown>): void {
  writeFileSync(join(dir, 'inject.jsonl'), `${JSON.stringify(line)}\n`, { flag: 'a' })
}

function readJournal(dir: string): Array<Record<string, unknown>> {
  let raw: string
  try {
    raw = readFileSync(join(dir, 'journal.jsonl'), 'utf8')
  } catch {
    return [] // nothing journaled yet — a healthy idle state
  }
  return raw
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(line => JSON.parse(line) as Record<string, unknown>)
}

describe('resolveApprovalStubDir', () => {
  it('resolves the env seam and treats blank/absent as off', () => {
    expect(resolveApprovalStubDir({ [APPROVAL_STUB_DIR_ENV]: ' Z:/stub ' })).toBe('Z:/stub')
    expect(resolveApprovalStubDir({ [APPROVAL_STUB_DIR_ENV]: '' })).toBeUndefined()
    expect(resolveApprovalStubDir({})).toBeUndefined()
  })
})

describe('attachApprovalEventStub', () => {
  it('drives approval inject lines through target.handle and journals the outcome', async () => {
    const dir = stubDir()
    const fake = fakeTarget()
    const stub = attachApprovalEventStub(dir, fake.target, { intervalMs: 60_000 })
    try {
      inject(dir, { agentId: 'session-1', toolName: 'forge_task_submit', callId: 'call-7', reason: 'submit 6.2' })
      await stub.pollNow()
      await stub.idle()
      expect(fake.calls).toEqual([{ agentId: 'session-1', toolName: 'forge_task_submit', callId: 'call-7', reason: 'submit 6.2' }])
      const entries = readJournal(dir)
      expect(entries).toHaveLength(1)
      expect(entries[0]).toMatchObject({
        kind: 'approval', agentId: 'session-1', toolName: 'forge_task_submit', claimed: true, outcome: 'allowed-once',
      })
    } finally {
      stub.detach()
    }
  })

  it('journals unclaimed requests (non-dispatch session) without an outcome', async () => {
    const dir = stubDir()
    const fake = fakeTarget({ unclaim: true })
    const stub = attachApprovalEventStub(dir, fake.target, { intervalMs: 60_000 })
    try {
      inject(dir, { agentId: 'user-session', toolName: 'tool_bash' })
      await stub.pollNow()
      const entries = readJournal(dir)
      expect(entries).toHaveLength(1)
      expect(entries[0]).toMatchObject({ kind: 'approval', agentId: 'user-session', claimed: false })
      expect('outcome' in (entries[0] as object)).toBe(false)
    } finally {
      stub.detach()
    }
  })

  it('routes tool-exec lines to the capture observer (arguments included)', async () => {
    const dir = stubDir()
    const fake = fakeTarget()
    const stub = attachApprovalEventStub(dir, fake.target, { intervalMs: 60_000 })
    try {
      inject(dir, { kind: 'tool-exec', callId: 'call-9', arguments: { taskKey: 'dsh-forge-m3/6.2' } })
      await stub.pollNow()
      expect(fake.execs).toEqual([{ callId: 'call-9', arguments: { taskKey: 'dsh-forge-m3/6.2' } }])
      expect(readJournal(dir)).toEqual([]) // observation is silent by design
    } finally {
      stub.detach()
    }
  })

  it('never replays consumed lines (cursor) and skips malformed ones with claimed:false', async () => {
    const dir = stubDir()
    const fake = fakeTarget()
    const stub = attachApprovalEventStub(dir, fake.target, { intervalMs: 60_000 })
    try {
      inject(dir, { agentId: 'session-1', toolName: 'forge_task_add' })
      await stub.pollNow()
      writeFileSync(join(dir, 'inject.jsonl'), 'broken{json}\n', { flag: 'a' })
      inject(dir, { agentId: 'session-2', toolName: 'forge_task_claim' })
      await stub.pollNow()
      await stub.pollNow() // replays nothing
      expect(fake.calls.map(call => call.agentId)).toEqual(['session-1', 'session-2'])
      // Journal order interleaves sync rows (malformed) with fire-and-forget
      // outcome rows — assert by content, not by index.
      const entries = readJournal(dir)
      expect(entries).toHaveLength(3)
      expect(entries.find(entry => entry.error === 'malformed')).toMatchObject({ kind: 'approval', claimed: false })
      expect(entries.filter(entry => entry.claimed === true)).toHaveLength(2)
    } finally {
      stub.detach()
    }
  })

  it('leaves a partial trailing line for the next poll (no malformed journal noise)', async () => {
    const dir = stubDir()
    const fake = fakeTarget()
    const stub = attachApprovalEventStub(dir, fake.target, { intervalMs: 60_000 })
    try {
      writeFileSync(join(dir, 'inject.jsonl'), '{"agentId":"session-1","toolNa', { flag: 'a' }) // mid-write shape
      await stub.pollNow()
      expect(fake.calls).toEqual([])
      expect(readJournal(dir)).toEqual([])
      writeFileSync(join(dir, 'inject.jsonl'), 'me":"forge_task_add"}\n', { flag: 'a' })
      await stub.pollNow()
      expect(fake.calls.map(call => call.agentId)).toEqual(['session-1'])
    } finally {
      stub.detach()
    }
  })

  it('survives a target rejection without killing the poll loop (fail-closed journal)', async () => {
    const dir = stubDir()
    const calls: HandleCall[] = []
    let rejectOnce = true
    const target: ApprovalEventStubTarget = {
      handle: (request) => {
        calls.push(request)
        if (rejectOnce) {
          rejectOnce = false
          return Promise.reject(new Error('rogue rejection'))
        }
        return Promise.resolve('rejected')
      },
      observeToolExec: () => {},
    }
    const stub = attachApprovalEventStub(dir, target, { intervalMs: 60_000 })
    try {
      inject(dir, { agentId: 'session-1', toolName: 'forge_task_add' })
      inject(dir, { agentId: 'session-2', toolName: 'forge_task_claim' })
      await stub.pollNow()
      await stub.idle()
      expect(calls).toHaveLength(2)
      const entries = readJournal(dir)
      expect(entries[0]).toMatchObject({ claimed: true, outcome: 'unavailable' })
      expect(entries[1]).toMatchObject({ claimed: true, outcome: 'rejected' })
    } finally {
      stub.detach()
    }
  })

  it('drives the REAL bridge core end-to-end (claim filter → kernel port → settle)', async () => {
    const dir = stubDir()
    const received: Array<{ dispatchId: string; payload: { toolName: string } }> = []
    let approvalId = 0
    const core = createApprovalBridgeCore({
      resolveDispatch: sessionId => (sessionId === 'session-dispatch' ? { dispatchId: 'dispatch-1' } : null),
      kernel: {
        receiveApproval: async (input) => {
          received.push({ dispatchId: input.dispatchId, payload: { toolName: input.payload.toolName } })
          approvalId += 1
          return { approvalId: `approval-${String(approvalId)}` }
        },
        rejectApproval: async () => undefined,
      },
      receiveRetry: { attempts: 1, delayMs: 0 },
    })
    const stub = attachApprovalEventStub(dir, {
      handle: request => core.handle(request),
      observeToolExec: () => {},
    }, { intervalMs: 60_000 })
    try {
      inject(dir, { agentId: 'session-dispatch', toolName: 'forge_task_submit' })
      inject(dir, { agentId: 'session-stranger', toolName: 'tool_bash' })
      await stub.pollNow()
      // The kernel-receive leg inside the real core is async: the push is
      // synchronous but pending-decision registration lands microtasks
      // later — one macrotask tick drains the whole chain (bounded loop,
      // fails loudly if the port never answers).
      for (let attempt = 0; attempt < 50 && received.length === 0; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 5))
      }
      await new Promise(resolve => setTimeout(resolve, 10))
      // The stranger session is filtered out by the registry claim face; the
      // dispatch session's request reached the kernel port and now waits on
      // the human decision (unbounded — the poll loop did NOT block on it).
      expect(received).toEqual([{ dispatchId: 'dispatch-1', payload: { toolName: 'forge_task_submit' } }])
      expect(core.settle('approval-1', true)).toEqual({ settled: true })
      // The outcome journal lands fire-and-forget once the decision settles.
      await stub.idle()
      const entries = readJournal(dir)
      expect(entries.find(entry => entry.agentId === 'session-dispatch')).toMatchObject({ claimed: true, outcome: 'allowed-once' })
      expect(entries.find(entry => entry.agentId === 'session-stranger')).toMatchObject({ claimed: false })
    } finally {
      stub.detach()
    }
  })
})
