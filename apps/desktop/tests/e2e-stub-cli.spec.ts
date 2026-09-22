// Task 6.1 fixture self-coverage: the stub forge CLI (AC3 — fixed legal
// prompt, orchestratable exit codes / timeouts; AC5 — journal + cleanup).
// Spawns the REAL materialized artifact the way the resolver does (argument
// array, shell off) — on win32 that means the node.exe-copy trick end-to-end.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { generateTaskSet } from '../e2e/fixtures/task-generator.ts'
import { writeForgeProject } from '../e2e/fixtures/forge-project.ts'
import { materializeStubCli } from '../e2e/fixtures/stubs/cli.ts'

const homes: string[] = []
function stubHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'dsh-forge-stubcli-unit-'))
  homes.push(home)
  return home
}
afterEach(() => {
  while (homes.length > 0) rmSync(homes.pop() as string, { recursive: true, force: true })
})

/** Spawn exactly like cli-resolve does: argument array, shell off, pipes. */
function runStub(stub: ReturnType<typeof materializeStubCli>, args: string[], cwd?: string) {
  const result = spawnSync(stub.cliPath, args, {
    ...(cwd === undefined ? {} : { cwd }),
    encoding: 'utf8',
    windowsHide: true,
    timeout: 20_000,
  })
  return {
    code: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

/** A small fixture project the prompt/status legs can point at. */
function fixtureProject(root: string): { root: string; set: ReturnType<typeof generateTaskSet> } {
  const set = generateTaskSet({ seed: 'stubcli', taskCount: 9, featureCount: 1, danglingRate: 0, gates: false })
  writeForgeProject(set, { codeRoot: root })
  return { root, set }
}

describe('stub forge CLI — version probe leg', () => {
  it('answers VERSION: <semver> on stdout, exit 0 (resolver contract)', () => {
    const stub = materializeStubCli(stubHome())
    const run = runStub(stub, ['version'], stub.launchCwd)
    expect(run.code).toBe(0)
    expect(run.stdout).toMatch(/^VERSION: 5\./)
  })

  it('orchestrates failure (stderr + nonzero exit)', () => {
    const stub = materializeStubCli(stubHome())
    stub.writeControl({ version: { mode: 'fail', stderr: 'stub boom\n' } })
    const run = runStub(stub, ['version'], stub.launchCwd)
    expect(run.code).toBe(1)
    expect(run.stderr).toContain('stub boom')
  })

  it('honors a custom version string', () => {
    const stub = materializeStubCli(stubHome())
    stub.writeControl({ version: { version: '9.9.9-custom' } })
    const run = runStub(stub, ['version'], stub.launchCwd)
    expect(run.stdout).toContain('9.9.9-custom')
  })
})

describe('stub forge CLI — prompt get-by-task-id leg', () => {
  it('derives the fixed legal prompt (TASK_ID / TASK_FILE / TASK_CATEGORY + sentinel)', () => {
    const { root } = fixtureProject(stubHome())
    const stub = materializeStubCli(stubHome())
    stub.attachProject(root)
    const run = runStub(stub, ['prompt', 'get-by-task-id', '1.2'], root)
    expect(run.code).toBe(0)
    expect(run.stdout).toContain('TASK_ID: 1.2')
    expect(run.stdout).toMatch(/^TASK_FILE: [A-Za-z]:[\\/].*1\.2-.*\.md$/m)
    expect(run.stdout).toContain('TASK_CATEGORY:')
    expect(run.stdout).toContain('STUB-FORGE-PROMPT')
  })

  it('same inputs → byte-identical prompt (SC2 hash oracle)', () => {
    const { root } = fixtureProject(stubHome())
    const stub = materializeStubCli(stubHome())
    stub.attachProject(root)
    const first = runStub(stub, ['prompt', 'get-by-task-id', '1.1'], root)
    const second = runStub(stub, ['prompt', 'get-by-task-id', '1.1'], root)
    expect(first.stdout).toBe(second.stdout)
  })

  it('unknown task id → dialect failure (exit 1, stderr names the task)', () => {
    const { root } = fixtureProject(stubHome())
    const stub = materializeStubCli(stubHome())
    stub.attachProject(root)
    const run = runStub(stub, ['prompt', 'get-by-task-id', '7.7'], root)
    expect(run.code).toBe(1)
    expect(run.stderr).toContain('not found in index')
  })

  it('orchestrates failure and text override via control (re-read per call)', () => {
    const { root } = fixtureProject(stubHome())
    const stub = materializeStubCli(stubHome())
    stub.attachProject(root)
    stub.writeControl({ prompt: { mode: 'fail', exitCode: 3, stderr: 'orchestrated\n' } })
    const failed = runStub(stub, ['prompt', 'get-by-task-id', '1.1'], root)
    expect(failed.code).toBe(3)
    expect(failed.stderr).toContain('orchestrated')
    stub.writeControl({ prompt: { text: 'OVERRIDDEN PROMPT\n' } })
    const overridden = runStub(stub, ['prompt', 'get-by-task-id', '1.1'], root)
    expect(overridden.code).toBe(0)
    expect(overridden.stdout).toBe('OVERRIDDEN PROMPT\n')
  })
})

describe('stub forge CLI — task status leg (SC7 oracle)', () => {
  it('prints the fixture status set as sorted TSV rows', () => {
    const { root } = fixtureProject(stubHome())
    const stub = materializeStubCli(stubHome())
    stub.attachProject(root)
    const run = runStub(stub, ['task', 'status'], root)
    expect(run.code).toBe(0)
    const rows = run.stdout.split('\n').filter(line => line !== '')
    expect(rows.length).toBe(9)
    expect(rows[0]).toMatch(/^fixture-01-[a-z0-9-]+\/1\.\d+\t(pending|in_progress|completed|blocked|suspended|skipped|rejected)$/)
    expect([...rows].sort()).toEqual(rows)
  })
})

describe('stub forge CLI — journal + hygiene (AC5)', () => {
  it('records every invocation with argv and cwd', () => {
    const { root } = fixtureProject(stubHome())
    const stub = materializeStubCli(stubHome())
    stub.attachProject(root)
    runStub(stub, ['version'], stub.launchCwd)
    runStub(stub, ['prompt', 'get-by-task-id', '1.1'], root)
    const journal = stub.readJournal()
    expect(journal.length).toBe(2)
    expect(journal[0]?.argv).toEqual(['version'])
    expect(journal[1]?.argv).toEqual(['prompt', 'get-by-task-id', '1.1'])
    expect(journal[1]?.cwd).toBe(root)
  })

  it('the stub tree lives entirely under its home (fixture-isolated, TEST-isolation-000)', () => {
    const home = stubHome()
    const stub = materializeStubCli(home)
    expect(stub.home).toBe(home)
    expect(existsSync(join(home, 'dispatch.cjs'))).toBe(true)
    expect(existsSync(stub.controlPath)).toBe(true)
    expect(existsSync(stub.cliPath)).toBe(true)
    expect(stub.cliPath.startsWith(home)).toBe(true)
    expect(stub.env.DSH_FORGE_CLI_PATH).toBe(stub.cliPath)
  })
})
