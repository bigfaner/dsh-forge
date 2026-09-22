// Task 6.1 fixture self-coverage: the session-channel stub's TEST-side half
// (apps/desktop/e2e/fixtures/stubs/channel.ts — control/journal protocol
// helpers the journeys orchestrate with). The host-half behavior is covered
// in packages/plugins/forge-workbench/tests/session-channel-stub.spec.ts.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SESSION_STUB_DIR_ENV, createChannelStub } from '../e2e/fixtures/stubs/channel.ts'

const dirs: string[] = []
function stubDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-chanstub-test-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop() as string, { recursive: true, force: true })
})

/** Append lines the way the HOST half does (the other protocol end). */
function hostAppend(dir: string, entries: Array<Record<string, unknown>>): void {
  const path = join(dir, 'journal.jsonl')
  writeFileSync(path, entries.map(entry => `${JSON.stringify(entry)}\n`).join(''))
}

describe('createChannelStub (test-process half)', () => {
  it('creates the protocol files and carries the env seam', () => {
    const dir = stubDir()
    const channel = createChannelStub(dir)
    expect(channel.dir).toBe(dir)
    expect(channel.env[SESSION_STUB_DIR_ENV]).toBe(dir)
    expect(channel.readControl()).toEqual({})
  })

  it('writeControl / readControl round-trip (absent control degrades to {})', () => {
    const dir = stubDir()
    const channel = createChannelStub(dir)
    channel.writeControl({ create: 'fail', prompt: 'hang', mintSessionId: 'session-x' })
    expect(channel.readControl()).toEqual({ create: 'fail', prompt: 'hang', mintSessionId: 'session-x' })
    writeFileSync(join(dir, 'control.json'), 'broken{')
    expect(channel.readControl()).toEqual({})
  })

  it('readJournal parses the host half\'s lines; readPrompts filters the message oracle', () => {
    const dir = stubDir()
    const channel = createChannelStub(dir)
    hostAppend(dir, [
      { kind: 'create', at: 't1', sessionId: 's1', cwd: 'Z:/p' },
      { kind: 'prompt', at: 't2', sessionId: 's1', requestId: 'r1', mode: 'queue', text: 'PROMPT + actor line' },
    ])
    expect(channel.readJournal().length).toBe(2)
    const prompts = channel.readPrompts()
    expect(prompts.length).toBe(1)
    expect(prompts[0]?.text).toBe('PROMPT + actor line')
  })

  it('markSessionEnded appends the third state to the same stream', () => {
    const dir = stubDir()
    const channel = createChannelStub(dir)
    hostAppend(dir, [{ kind: 'create', at: 't1', sessionId: 's1', cwd: '' }])
    channel.markSessionEnded('s1')
    const journal = channel.readJournal()
    expect(journal.length).toBe(2)
    expect(journal[1]?.kind).toBe('session-ended')
    expect(journal[1]?.sessionId).toBe('s1')
  })

  it('readJournal tolerates an empty journal', () => {
    const channel = createChannelStub(stubDir())
    expect(channel.readJournal()).toEqual([])
    expect(channel.readPrompts()).toEqual([])
  })
})
