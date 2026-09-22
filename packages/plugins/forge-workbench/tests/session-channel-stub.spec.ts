// Task 6.1: the e2e session-channel stub, host half (AC4 — the three
// orchestratable states + the journal oracle SC2-2/SC3-3 consume). Pure
// file protocol, no cordis — the unit face is the whole contract.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  SESSION_STUB_DIR_ENV,
  createStubSessionChannel,
  resolveSessionStubDir,
} from '../src/host/session-channel-stub.ts'
import { createSessionLaunchCore } from '../src/host/session-launch.ts'

const dirs: string[] = []
function stubDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-chanstub-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop() as string, { recursive: true, force: true })
})

function writeControl(dir: string, control: unknown): void {
  writeFileSync(join(dir, 'control.json'), `${JSON.stringify(control)}\n`)
}
function journal(dir: string): string[] {
  return readFileSync(join(dir, 'journal.jsonl'), 'utf8')
    .split('\n')
    .filter(line => line.trim() !== '')
}

describe('resolveSessionStubDir (env seam)', () => {
  it('unset / empty / blank → undefined (production keeps the real channel)', () => {
    expect(resolveSessionStubDir({})).toBeUndefined()
    expect(resolveSessionStubDir({ [SESSION_STUB_DIR_ENV]: '' })).toBeUndefined()
    expect(resolveSessionStubDir({ [SESSION_STUB_DIR_ENV]: '   ' })).toBeUndefined()
  })

  it('a set dir resolves (trimmed)', () => {
    expect(resolveSessionStubDir({ [SESSION_STUB_DIR_ENV]: ' Z:/stub ' })).toBe('Z:/stub')
  })
})

describe('createStubSessionChannel — the three states (AC4)', () => {
  it('create-success: adopts the caller id (or mints) and journals it', async () => {
    const dir = stubDir()
    const channel = createStubSessionChannel(dir)
    const created = await channel.create({ sessionId: 'session-xyz', cwd: 'Z:/proj' })
    expect(created.sessionId).toBe('session-xyz')
    const minted = await channel.create({ cwd: 'Z:/proj' })
    expect(minted.sessionId).toMatch(/^session-stub-/)
    const lines = journal(dir)
    expect(lines.length).toBe(2)
    expect(JSON.parse(lines[0] as string)).toMatchObject({ kind: 'create', sessionId: 'session-xyz', cwd: 'Z:/proj' })
  })

  it('create-failure: throws the orchestrated error (launch maps it to ERR_SESSION_CHANNEL_UNAVAILABLE)', async () => {
    const dir = stubDir()
    writeControl(dir, { create: 'fail', createError: 'orchestrated create failure' })
    const channel = createStubSessionChannel(dir)
    await expect(channel.create({ sessionId: 's', cwd: 'Z:/p' })).rejects.toThrow('orchestrated create failure')
  })

  it('prompt leg: journals the message VERBATIM and honors fail orchestration', async () => {
    const dir = stubDir()
    const channel = createStubSessionChannel(dir)
    await channel.prompt({
      requestId: 'req-1',
      sessionId: 'session-xyz',
      mode: 'queue',
      content: [{ type: 'text', text: 'PROMPT BODY\nFORGE_ACTOR=session:session-xyz' }],
    })
    const lines = journal(dir)
    expect(JSON.parse(lines[0] as string)).toMatchObject({
      kind: 'prompt',
      sessionId: 'session-xyz',
      requestId: 'req-1',
      mode: 'queue',
      text: 'PROMPT BODY\nFORGE_ACTOR=session:session-xyz',
    })
    writeControl(dir, { prompt: 'fail', promptError: 'orchestrated prompt failure' })
    await expect(channel.prompt({
      requestId: 'req-2',
      sessionId: 'session-xyz',
      mode: 'queue',
      content: [{ type: 'text', text: 'again' }],
    })).rejects.toThrow('orchestrated prompt failure')
  })

  it('hang legs never settle (the per-leg ceiling classifies them as timeouts)', async () => {
    const dir = stubDir()
    writeControl(dir, { create: 'hang' })
    const channel = createStubSessionChannel(dir)
    let settled = false
    void channel.create({ sessionId: 's', cwd: 'Z:/p' }).then(() => { settled = true })
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(settled).toBe(false)
  })

  it('malformed / absent control degrades to everything-ok', async () => {
    const dir = stubDir()
    writeFileSync(join(dir, 'control.json'), 'not json')
    const channel = createStubSessionChannel(dir)
    const created = await channel.create({ sessionId: 's', cwd: 'Z:/p' })
    expect(created.sessionId).toBe('s')
  })
})

describe('createStubSessionChannel through the launch core (4.2 consumption)', () => {
  it('the full launch walks the stub channel and lands ok with the caller-minted session id', async () => {
    const dir = stubDir()
    const core = createSessionLaunchCore({ getSessionChannel: () => createStubSessionChannel(dir) })
    const result = await core.launch({ promptText: 'TASK PROMPT', title: 't', cwd: 'Z:/proj', sessionId: 'session-stub-fixed' })
    expect(result).toEqual({ ok: true, sessionId: 'session-stub-fixed' })
    // The journaled first message is the prompt + the FORGE_ACTOR attribution line.
    const lines = journal(dir).map(line => JSON.parse(line) as { kind: string; text?: string })
    const prompt = lines.find(entry => entry.kind === 'prompt')
    expect(prompt?.text).toContain('TASK PROMPT')
    expect(prompt?.text).toContain('FORGE_ACTOR=session:session-stub-fixed')
  })

  it('an orchestrated create failure surfaces ERR_SESSION_CHANNEL_UNAVAILABLE', async () => {
    const dir = stubDir()
    writeControl(dir, { create: 'fail' })
    const core = createSessionLaunchCore({ getSessionChannel: () => createStubSessionChannel(dir) })
    const result = await core.launch({ promptText: 'P', title: 't', cwd: 'Z:/proj' })
    expect(result).toMatchObject({ ok: false, reasonCode: 'ERR_SESSION_CHANNEL_UNAVAILABLE' })
  })
})
