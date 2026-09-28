// Task 6.2 (M3) — the e2e BASE self-check, unit lane (vitest; the Playwright
// lane is tests/e2e/specs/base-smoke.spec.ts). Authorities: task 6.2 AC-1/2/4,
// tech-design §Testing Strategy (SC 腿基座), spike-3 §4 (hash oracle 口径).
//
//   AC-1  clean env: the sanitized PATH hides the machine's forge CLI on
//         every probe face, and the fake-shim control env IS detected (the
//         probe is not vacuous); both corpus kinds build — 未迁移 (index.json
//         + task md, register/scan over the REAL kernel) and 已迁移 (real
//         migration pipeline → SQLite-only + .migrated archive, md 原样).
//   AC-2  stub journal: the unified dispatch stub round-trips the composed
//         first user message byte-exactly (CRLF/unicode/行尾空格/收尾换行
//         corpus) and the four-check oracle passes — and FAILS on a tampered
//         row (negative control).
//   AC-4  instance lock: marker detection over synthetic rows + fail-fast
//         throw listing pids + the live enumeration probe works.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { assertForgeCliUnavailable, cleanEnv, cleanSystemPath, controlDir, fakeForgeControlEnv, probeForgeCli } from './fixtures/clean-env.ts'
import { DEFAULT_CORPUS, buildMigratedCorpus, writeUnmigratedCorpus } from './fixtures/corpus.ts'
import { createDispatchStub } from './stubs/dispatch.ts'
import { ATTRIBUTION_MARKER, ORACLE_TEXT_CORPUS, composeFirstUserMessage, promptHashOf, verifyPromptInjection } from './stubs/oracle.ts'
import { assertNoActiveDshForgeInstances, findActiveDshForgeInstances, isDshForgeInstance, listProcessRows } from './helpers/instance-lock.ts'
import { openDatabase } from '../../apps/desktop/src/main/workbench/store/db.ts'
import { registerProject } from '../../apps/desktop/src/main/workbench/repos/projects.ts'
import { scanForgeFiles } from '../../apps/desktop/src/main/workbench/indexer/scan.ts'
import { listTaskSnapshots } from '../../apps/desktop/src/main/workbench/repos/task-snapshots.ts'
import { deriveLaunchRequestId } from '../../packages/plugins/forge-workbench/src/host/dispatch-launch/channel.ts'

const scratches: string[] = []
function scratch(tag: string): string {
  const dir = mkdtempSync(join(tmpdir(), `dsh-forge-62-${tag}-`))
  scratches.push(dir)
  return dir
}
afterEach(() => {
  while (scratches.length > 0) rmSync(scratches.pop() as string, { recursive: true, force: true, maxRetries: 10 })
})

// ---------------------------------------------------------------------------
// AC-1a — the clean environment + the reachability probe
// ---------------------------------------------------------------------------

describe('clean env (AC-1)', () => {
  it('sanitizes PATH to system dirs only (no user tool dirs)', () => {
    const path = cleanSystemPath()
    expect(path).not.toContain('pnpm')
    if (process.platform === 'win32') {
      expect(path.toLowerCase()).toContain('system32')
    } else {
      expect(path.split(':')).toEqual(expect.arrayContaining(['/usr/bin', '/bin']))
    }
  })

  it('drops case-variant PATH/PATHEXT keys and sets one canonical pair', () => {
    const env = cleanEnv()
    expect(Object.keys(env).filter(key => key.toUpperCase() === 'PATH')).toEqual(['PATH'])
    if (process.platform === 'win32') {
      expect(Object.keys(env).filter(key => key.toUpperCase() === 'PATHEXT')).toEqual(['PATHEXT'])
    }
  })

  it('the forge CLI is unreachable on every probe face under the clean env', () => {
    const rows = probeForgeCli(cleanEnv())
    expect(rows.length).toBeGreaterThanOrEqual(2) // bare names + the shell face
    for (const row of rows) expect(row.reachable, `${row.name}${row.shell ? ' (shell)' : ''}`).toBe(false)
    expect(() => assertForgeCliUnavailable(cleanEnv())).not.toThrow()
  })

  it('negative control: a planted forge shim IS detected (probe not vacuous)', () => {
    const dir = controlDir()
    scratches.push(dir)
    const env = fakeForgeControlEnv(dir)
    expect(probeForgeCli(env).some(row => row.reachable)).toBe(true)
    expect(() => assertForgeCliUnavailable(env, 'control env')).toThrow(/forge CLI resolved/)
  })
})

// ---------------------------------------------------------------------------
// AC-1b — the two corpus kinds over the REAL kernel
// ---------------------------------------------------------------------------

describe('corpus (AC-1)', () => {
  it('① unmigrated: index.json + task md present, register/scan ingest error-free', async () => {
    const root = scratch('corpus-un')
    const written = writeUnmigratedCorpus(root)
    const expectedTasks = written.set.features.reduce((sum, feature) => sum + feature.tasks.length, 0)
    const descriptionPaths = written.set.features.flatMap(feature =>
      feature.tasks.map(task => join(written.docsRoot, 'docs', 'features', feature.slug, 'tasks', `${task.stem}.md`)))
    expect(written.indexPaths).toHaveLength(written.set.features.length)
    for (const { path } of written.indexPaths) expect(existsSync(path)).toBe(true)
    expect(descriptionPaths).toHaveLength(expectedTasks)
    for (const path of descriptionPaths) expect(existsSync(path)).toBe(true)

    const userData = join(root, 'user-data')
    mkdirSync(userData, { recursive: true })
    const { db } = await openDatabase(userData)
    try {
      const project = registerProject(db, { codeRoot: written.codeRoot, docLocationType: 'in_repo' })
      scanForgeFiles(db, { id: project.id, codeRoot: written.codeRoot, docLocationPath: null })
      expect(listTaskSnapshots(db, project.id)).toHaveLength(expectedTasks)
    } finally {
      db.close()
    }
  })

  it('② migrated: SQLite-only + .migrated archive, md bytes untouched, authority switched', async () => {
    const root = scratch('corpus-mig')
    const userData = join(root, 'user-data')
    const facts = await buildMigratedCorpus(userData, root)

    // The archive face: every feature's index.json is gone, .migrated-<ts> in place.
    expect(facts.archivedIndexes).toHaveLength(DEFAULT_CORPUS.featureCount)
    for (const { path } of facts.archivedIndexes) {
      expect(path).toMatch(/index\.json\.migrated-/)
      expect(existsSync(path)).toBe(true)
      expect(existsSync(join(path, '..', 'index.json'))).toBe(false)
    }
    // The md bodies are byte-identical to what the writer produced.
    for (const body of facts.markdownBodies) {
      expect(readFileSync(body.path, 'utf8')).toBe(body.bytes)
    }
    // The audit trail: the Interface-4 phases all landed ok.
    const phases = facts.events.map(event => `${event.phase}:${event.result}`)
    for (const phase of ['backup:ok', 'ingest:ok', 'verify:ok', 'switch:ok', 'archive:ok']) {
      expect(phases).toContain(phase)
    }
    // The db (reopened the way the app will) carries the SoT rows + authority.
    const reopened = await openDatabase(userData)
    try {
      const authority = reopened.db.prepare('SELECT data_authority, deviated FROM projects WHERE id = ?').get(facts.project.id) as { data_authority: string; deviated: number }
      expect(authority.data_authority).toBe('sqlite')
      expect(authority.deviated).toBe(0)
      const rows = reopened.db.prepare('SELECT COUNT(*) AS n FROM task WHERE project_id = ?').get(facts.project.id) as { n: number | bigint }
      expect(Number(rows.n)).toBe(facts.taskCount)
    } finally {
      reopened.db.close()
    }
    expect(existsSync(facts.dbPath)).toBe(true)
    expect(facts.taskCount).toBe(DEFAULT_CORPUS.taskCount)
  })

  it('determinism: the same seed re-renders the same index.json bytes', () => {
    const rootA = scratch('det-a')
    const rootB = scratch('det-b')
    const a = writeUnmigratedCorpus(rootA)
    const b = writeUnmigratedCorpus(rootB)
    expect(a.indexPaths.length).toBe(b.indexPaths.length)
    for (let index = 0; index < a.indexPaths.length; index += 1) {
      expect(readFileSync((a.indexPaths[index] as { path: string }).path, 'utf8'))
        .toBe(readFileSync((b.indexPaths[index] as { path: string }).path, 'utf8'))
    }
  })
})

// ---------------------------------------------------------------------------
// AC-2 — the unified stub journal + the four-check oracle
// ---------------------------------------------------------------------------

describe('dispatch stub journal (AC-2)', () => {
  it('carries both env seams to the same dir and creates the protocol files', () => {
    const dir = scratch('stub')
    const stub = createDispatchStub(dir)
    expect(stub.env.DSH_FORGE_SESSION_STUB_DIR).toBe(dir)
    expect(stub.env.DSH_FORGE_APPROVAL_STUB_DIR).toBe(dir)
    expect(existsSync(join(dir, 'control.json'))).toBe(true)
    expect(existsSync(join(dir, 'journal.jsonl'))).toBe(true)
    expect(existsSync(join(dir, 'inject.jsonl'))).toBe(true)
    expect(stub.readControl()).toEqual({})
  })

  it('round-trips injected content byte-exactly and passes the four-check oracle (adversarial corpus)', () => {
    const dir = scratch('stub-oracle')
    const stub = createDispatchStub(dir)
    for (const [index, presynth] of ORACLE_TEXT_CORPUS.entries()) {
      const sessionId = `session-oracle-${String(index)}`
      const message = composeFirstUserMessage(presynth, sessionId)
      // The host half's append shape (session-channel-stub journal()).
      writeFileSync(join(dir, 'journal.jsonl'), `${JSON.stringify({
        kind: 'prompt', at: new Date().toISOString(), sessionId, requestId: deriveLaunchRequestId(sessionId, message), mode: 'queue', text: message,
      })}\n`, { flag: 'a' })
    }
    const prompts = stub.readPrompts()
    expect(prompts).toHaveLength(ORACLE_TEXT_CORPUS.length)
    for (const [index, entry] of prompts.entries()) {
      const presynth = ORACLE_TEXT_CORPUS[index] as string
      const message = composeFirstUserMessage(presynth, `session-oracle-${String(index)}`)
      expect(entry.text).toBe(message) // 逐字符取回
      expect(verifyPromptInjection({
        journalText: entry.text as string,
        presynthContent: presynth,
        promptHash: promptHashOf(message),
        sessionId: `session-oracle-${String(index)}`,
        requestId: entry.requestId,
      })).toEqual({ ok: true })
    }
  })

  it('negative control: tampered journal rows fail the oracle with specific codes', () => {
    const presynth = ORACLE_TEXT_CORPUS[0] as string
    const sessionId = 'session-tamper'
    const message = composeFirstUserMessage(presynth, sessionId)
    const tampered = `${message}extra trailing rewrite`
    const tamperedResult = verifyPromptInjection({
      journalText: tampered,
      presynthContent: presynth,
      promptHash: promptHashOf(message),
      sessionId,
      requestId: deriveLaunchRequestId(sessionId, message),
    })
    expect(tamperedResult).toEqual({ ok: false, failures: ['hash-mismatch', 'request-id-mismatch'] })
    // A second attribution marker breaks check ③ alone (two-line shape: the
    // third line no longer carries the naming prefix).
    const doubled = `${message}\n${ATTRIBUTION_MARKER} session:other\n`
    expect(verifyPromptInjection({
      journalText: doubled,
      presynthContent: presynth,
      promptHash: promptHashOf(doubled),
      sessionId,
    })).toEqual({ ok: false, failures: ['appendix-not-two-lines'] })
    // Dropping the naming line (attribution only) breaks check ③ alone too
    // (exactly one line is no longer the appendix contract — 恰好两行).
    const naming = message.slice(message.lastIndexOf('\n') + 1)
    const noNaming = message.slice(0, message.length - naming.length - 1)
    expect(verifyPromptInjection({
      journalText: noNaming,
      presynthContent: presynth,
      promptHash: promptHashOf(noNaming),
      sessionId,
    })).toEqual({ ok: false, failures: ['appendix-not-two-lines'] })
  })

  it('inject lines parse back through the unified reader (approval kind filter)', () => {
    const dir = scratch('stub-appr')
    const stub = createDispatchStub(dir)
    stub.injectApproval({ agentId: 'session-1', toolName: 'forge_task_submit', reason: 'submit 6.2' })
    stub.injectToolExec('call-1', { taskKey: 'dsh-forge-m3/6.2' })
    const lines = readFileSync(join(dir, 'inject.jsonl'), 'utf8')
      .split('\n')
      .filter(line => line.trim() !== '')
      .map(line => JSON.parse(line) as Record<string, unknown>)
    expect(lines).toEqual([
      { kind: 'approval', agentId: 'session-1', toolName: 'forge_task_submit', reason: 'submit 6.2' },
      { kind: 'tool-exec', callId: 'call-1', arguments: { taskKey: 'dsh-forge-m3/6.2' } },
    ])
    // Approval journal rows (the host half appends them) filter cleanly.
    writeFileSync(join(dir, 'journal.jsonl'), `${JSON.stringify({ kind: 'approval', at: 't', agentId: 'session-1', toolName: 'forge_task_submit', claimed: true, outcome: 'allowed-once' })}\n`, { flag: 'a' })
    expect(stub.readApprovals()).toHaveLength(1)
    expect(stub.readApprovals()[0]?.outcome).toBe('allowed-once')
    expect(stub.readPrompts()).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// AC-4 — the instance-lock discipline
// ---------------------------------------------------------------------------

describe('instance lock (AC-4)', () => {
  it('detects every launch form and ignores unrelated processes', () => {
    const rows = [
      { pid: 101, command: 'C:\\repo\\apps\\desktop\\dist\\main.cjs' },
      { pid: 102, command: '/home/dev/repo/apps/desktop/dist/main.cjs --flag' },
      { pid: 103, command: 'C:\\Program Files\\dsh-forge\\dsh-forge.exe' },
      // The dev-instance form: electron parent is just `.` — the HOST CHILD
      // is the detectable face (and the fixed-port holder).
      { pid: 104, command: 'Z:\\any\\checkout\\packages\\desktop-host-vendor\\runtime\\node\\node-22.20.0\\node.exe --experimental-strip-types Z:\\any\\checkout\\packages\\desktop-host-vendor\\vendored\\apps\\desktop-host\\src\\index.ts Z:\\any\\checkout\\packages\\desktop-host-vendor\\vendored\\apps\\desktop-host C:\\Users\\dev\\AppData\\Roaming\\@dsh-forge\\desktop\\host-profile' },
      { pid: 105, command: 'node /somewhere/server.js' },
      { pid: 106, command: 'powershell -NoProfile -Command Get-CimInstance' },
    ]
    expect(findActiveDshForgeInstances(rows).map(row => row.pid)).toEqual([101, 102, 103, 104])
    expect(isDshForgeInstance(rows[4] as { pid: number; command: string })).toBe(false)
  })

  it('fail-fast: assert throws listing the conflicting pids; exclusion works', () => {
    const rows = [
      { pid: 201, command: 'Z:\\any\\worktree\\apps/desktop/dist/main.cjs' },
      { pid: 202, command: 'unrelated' },
    ]
    expect(() => assertNoActiveDshForgeInstances({ rows })).toThrow(/pid 201/)
    expect(() => assertNoActiveDshForgeInstances({ rows, excludePids: new Set([201]) })).not.toThrow()
  })

  it('live enumeration works on this platform (own process visible)', () => {
    const rows = listProcessRows()
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.some(row => row.pid === process.pid)).toBe(true)
    // The discipline gate itself, live: passes unless a real instance is up.
    assertNoActiveDshForgeInstances({ rows, excludePids: new Set([process.pid]) })
  })
})
