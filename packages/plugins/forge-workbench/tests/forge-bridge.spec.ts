// Task 4.1 unit legs (AC6): 解析链三态 / taskKey 拒绝 / allowlist 拒绝 /
// 超时中断 / 正常往返 — plus the output-guard, error-semantics, and
// cordis-service faces. The forge CLI is STUBBED: an inline script written to
// a temp dir at setup, executed through the REAL spawner (process.execPath +
// script, the spawnFn seam's injection point) so capture/timeout/kill run
// against real child processes without any real-CLI dependency. The stub
// mirrors the argument contract verified against the live CLI (spike-1 §4.3:
// `prompt get-by-task-id <id>` raw markdown stdout exit 0; `version` prints
// `VERSION: <semver>`; failures → structured stderr, exit 1).

import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import {
  createForgeBridgeCore, normalizeProjectRoot, toLocalTaskKey,
  type ForgeBridgeCore,
} from '../src/host/forge-bridge.ts'
import {
  resolveForgeCli, runBoundedCapture,
  type CliChildProcess, type CliSpawnFn,
} from '../src/host/cli-resolve.ts'
// The decorator-bearing rpc class is loaded through the tsc-lowered build
// output (same source): this workspace's test transform does not lower
// standard decorators, while tsc --build (the suite's existing build prereq —
// the artifact legs below already gate on lib/) does.
import { ForgeBridgeService } from '../lib/types/host/forge-bridge-rpc.js'

/** Byte-faithful round-trip fixture: markdown shapes, quotes, trailing spaces, final newline. */
const PROMPT_FIXTURE = 'TASK_ID: 4.1\nTASK_FILE: Z:\\fixture\\4.1-task.md\n\nExecute the task per the file above.\n\n```\nblock with "quotes" & | pipes\n```\ntrailing spaces   \n'

/** The stub CLI body. argv: [node, script, sub, ...rest] — mirrors real forge args. */
const STUB_CLI_SOURCE = `
const sub = process.argv[2]
if (sub === 'version') {
  process.stdout.write('VERSION: 9.9.9-stub\\n')
  process.exitCode = 0
} else if (sub === 'prompt' && process.argv[3] === 'get-by-task-id') {
  const id = process.argv[4]
  if (id === '9.9') {
    process.stderr.write('ERROR_CODE: TASK_NOT_FOUND\\nERROR: task "9.9" not found in index\\n')
    process.exitCode = 1
  } else if (id === '8.8') {
    setInterval(() => {}, 60_000) // hang leg: never exits, never writes
  } else if (id === '7.7') {
    process.stdout.write('x'.repeat(64 * 1024)) // stdout-cap leg
    process.exitCode = 0
  } else if (id === '6.6') {
    process.stderr.write('e'.repeat(64 * 1024)) // stderr-cap leg
    process.exitCode = 0
  } else {
    process.stdout.write(${JSON.stringify(PROMPT_FIXTURE)})
    process.exitCode = 0
  }
} else {
  process.stderr.write('unknown subcommand\\n')
  process.exitCode = 1
}
`

let tempRoot: string
let stubCliPath: string
let pathDir: string
let pathEmptyDir: string

beforeAll(() => {
  tempRoot = mkdtempSync(join(tmpdir(), 'forge-bridge-'))
  stubCliPath = join(tempRoot, 'stub-forge-cli.mjs')
  writeFileSync(stubCliPath, STUB_CLI_SOURCE, 'utf8')
  pathDir = join(tempRoot, 'on-path')
  mkdirSync(pathDir, { recursive: true })
  pathEmptyDir = join(tempRoot, 'path-empty')
  mkdirSync(pathEmptyDir, { recursive: true })
})

afterAll(() => {
  rmSync(tempRoot, { recursive: true, force: true })
})

/** Every spawn invocation, recorded (the arg-array/cwd discipline oracle). */
interface SpawnCall {
  command: string
  args: readonly string[]
  cwd?: string
  isArray: boolean
}

/**
 * The real-spawner seam: the service believes it spawns the resolved CLI; the
 * test routes the identical argv at the stub script via the real
 * node executable — real pipes, real close events, real kill. `failProbe`
 * short-circuits version probes (probe-failure legs).
 */
function makeRealStubSpawn(records: SpawnCall[], options: { failProbe?: 'exit' | 'throw' | 'timeout' | 'empty' } = {}): CliSpawnFn {
  return (command, args, spawnOptions) => {
    records.push({ command, args: [...args], cwd: spawnOptions.cwd, isArray: Array.isArray(args) })
    if (options.failProbe !== undefined && args[0] === 'version') {
      if (options.failProbe === 'throw') throw new Error('EACCES: permission denied')
      if (options.failProbe === 'timeout') {
        return { stdout: null, stderr: null, on: () => undefined, kill: () => true }
      }
      const script = options.failProbe === 'empty'
        ? 'process.stdout.write("\\n\\n")'
        : 'process.stderr.write("probe failure"); process.exitCode = 3'
      return spawn(process.execPath, ['-e', script], { ...spawnOptions, stdio: ['ignore', 'pipe', 'pipe'] }) as unknown as CliChildProcess
    }
    return spawn(process.execPath, [stubCliPath, ...args], { ...spawnOptions, stdio: ['ignore', 'pipe', 'pipe'] }) as unknown as CliChildProcess
  }
}

describe('resolveForgeCli: the three-state resolution chain (AC1)', () => {
  it('explicit configured path wins over PATH', async () => {
    const records: SpawnCall[] = []
    const resolution = await resolveForgeCli({
      explicitPath: () => stubCliPath,
      env: { PATH: pathDir },
      spawnFn: makeRealStubSpawn(records),
    })
    expect(resolution).toEqual({ ok: true, path: stubCliPath, version: '9.9.9-stub', origin: 'explicit' })
    // The version evidence is a real probe (`forge version`, arg array).
    expect(records[0]).toMatchObject({ command: stubCliPath, args: ['version'] })
  })

  it('falls back to PATH when no explicit path is configured', async () => {
    writeFileSync(join(pathDir, 'forge.exe'), '', 'utf8')
    const resolution = await resolveForgeCli({
      env: { PATH: pathDir },
      platform: 'win32',
      spawnFn: makeRealStubSpawn([]),
    })
    expect(resolution).toEqual({ ok: true, path: join(pathDir, 'forge.exe'), version: '9.9.9-stub', origin: 'path' })
  })

  it('returns structured ERR_FORGE_CLI_UNAVAILABLE with BOTH path diagnostics when every stage fails', async () => {
    const resolution = await resolveForgeCli({
      explicitPath: () => join(tempRoot, 'missing', 'forge.exe'),
      env: { PATH: pathEmptyDir },
      spawnFn: makeRealStubSpawn([]),
    })
    expect(resolution).toEqual({ ok: false, reasonCode: 'ERR_FORGE_CLI_UNAVAILABLE', detail: expect.any(String) })
    if (!resolution.ok) {
      expect(resolution.detail).toContain('explicit path')
      expect(resolution.detail).toContain('file not found')
      expect(resolution.detail).toContain('PATH')
      expect(resolution.detail).toContain('no forge candidate')
    }
  })

  it('rejects script-shim PATH hits with shim diagnostics (no shell form is ever spawned)', async () => {
    const shimDir = join(tempRoot, 'path-shim')
    mkdirSync(shimDir, { recursive: true })
    writeFileSync(join(shimDir, 'forge.cmd'), '', 'utf8')
    const resolution = await resolveForgeCli({ env: { PATH: shimDir }, platform: 'win32', spawnFn: makeRealStubSpawn([]) })
    expect(resolution.ok).toBe(false)
    if (!resolution.ok) expect(resolution.detail).toContain('script shims')
  })

  it('reports probe failure detail when a PATH candidate cannot prove a version', async () => {
    writeFileSync(join(pathDir, 'forge.exe'), '', 'utf8')
    for (const failProbe of ['exit', 'timeout', 'empty'] as const) {
      const resolution = await resolveForgeCli({
        env: { PATH: pathDir },
        platform: 'win32',
        spawnFn: makeRealStubSpawn([], { failProbe }),
        probeTimeoutMs: 200,
      })
      expect(resolution.ok).toBe(false)
      if (!resolution.ok) {
        expect(resolution.detail).toContain('PATH candidate')
        expect(resolution.detail).toContain('version probe failed')
      }
    }
  })

  it('reports spawn-thrown probes (cannot execute) through the same diagnostics', async () => {
    const resolution = await resolveForgeCli({
      explicitPath: () => stubCliPath,
      env: { PATH: pathDir },
      spawnFn: makeRealStubSpawn([], { failProbe: 'throw' }),
    })
    expect(resolution.ok).toBe(false)
    if (!resolution.ok) expect(resolution.detail).toContain('cannot execute')
  })
})

describe('toLocalTaskKey + normalizeProjectRoot: the dialect folds (AC2)', () => {
  it('strips the feature prefix from qualified keys and validates the local id', () => {
    expect(toLocalTaskKey('dsh-forge-m2/4.1')).toBe('4.1')
    expect(toLocalTaskKey('4.1')).toBe('4.1')
    expect(toLocalTaskKey('dsh-forge-m2/2.10')).toBe('2.10')
  })

  it('rejects everything the forge CLI would not accept as a local id', () => {
    for (const key of ['abc', '', 'dsh-forge-m2/9x9', 'a/b/4.1', 'dsh-forge-m2/', '4.1;rm', '../4.1', '4.1 x', 'gate']) {
      expect(toLocalTaskKey(key), `key "${key}"`).toBeUndefined()
    }
  })

  it('normalizes roots by the repos-layer convention (resolve → forward slashes → no trailing slash)', () => {
    if (process.platform === 'win32') {
      expect(normalizeProjectRoot('Z:/workbench/proj/')).toBe('Z:/workbench/proj')
      expect(normalizeProjectRoot('Z:\\workbench\\proj\\')).toBe('Z:/workbench/proj')
      expect(normalizeProjectRoot('Z:\\')).toBe('Z:/')
    } else {
      expect(normalizeProjectRoot('/tmp/workbench/proj/')).toBe('/tmp/workbench/proj')
      expect(normalizeProjectRoot('/tmp/workbench/proj//')).toBe('/tmp/workbench/proj')
      expect(normalizeProjectRoot('/')).toBe('/')
    }
  })
})

/** Core under test with the real-spawner stub and a live temp project root. */
function coreWith(overrides: Partial<Parameters<typeof createForgeBridgeCore>[0]> = {}): { core: ForgeBridgeCore; records: SpawnCall[] } {
  const records: SpawnCall[] = []
  const core = createForgeBridgeCore({
    listProjectRoots: () => [tempRoot],
    getCliPath: () => stubCliPath,
    spawnFn: makeRealStubSpawn(records),
    // Hermetic PATH: resolution can never fall through to the real machine
    // forge (the explicit stub path answers the chain's first stage).
    env: { PATH: pathEmptyDir },
    ...overrides,
  })
  return { core, records }
}

describe('getTaskPrompt: gates (AC2 — taskKey 拒绝 / allowlist 拒绝)', () => {
  it('rejects non-conforming task keys without any spawn', async () => {
    const { core, records } = coreWith()
    for (const taskKey of ['abc', 'dsh-forge-m2/9x9', 'a/b/4.1', '4.1;rm -rf /']) {
      const result = await core.getTaskPrompt({ projectRoot: tempRoot, taskKey })
      expect(result, `key "${taskKey}"`).toMatchObject({ available: false, reasonCode: 'ERR_NO_PROMPT' })
      expect((result as { detail?: string }).detail).toContain('not a forge task id')
    }
    expect(records).toEqual([])
  })

  it('rejects project roots outside the registered allowlist without any spawn (fail closed)', async () => {
    const { core, records } = coreWith({ listProjectRoots: () => [] })
    const result = await core.getTaskPrompt({ projectRoot: tempRoot, taskKey: '4.1' })
    expect(result).toMatchObject({ available: false, reasonCode: 'ERR_NO_PROMPT' })
    expect((result as { detail?: string }).detail).toContain('not a registered project')
    expect(records).toEqual([])
  })

  it('accepts a differently-spelled registered root (trailing slash) and folds root case on win32 semantics', async () => {
    const { core } = coreWith({ caseInsensitiveRoots: true })
    const result = await core.getTaskPrompt({ projectRoot: `${tempRoot}/`, taskKey: '4.1' })
    expect(result).toMatchObject({ available: true })
  })
})

describe('getTaskPrompt: the spawn round trip (AC3/AC4/AC5)', () => {
  it('returns the COMPLETE stub output character-for-character and spawns an argument array at the local id', async () => {
    const { core, records } = coreWith()
    const result = await core.getTaskPrompt({ projectRoot: tempRoot, taskKey: 'dsh-forge-m2/4.1' })
    expect(result).toEqual({ available: true, promptText: PROMPT_FIXTURE })
    // Arg-array discipline + qualified→local translation + cwd pinned to the root.
    expect(records).toHaveLength(2) // version probe + prompt spawn
    const promptCall = records[1]
    expect(promptCall.isArray).toBe(true)
    expect(promptCall.args).toEqual(['prompt', 'get-by-task-id', '4.1'])
    expect(promptCall.cwd).toBe(normalizeProjectRoot(tempRoot))
  })

  it('maps CLI failure (exit 1 + structured stderr) to ERR_NO_PROMPT with the stderr evidence (AC5)', async () => {
    const { core } = coreWith()
    const result = await core.getTaskPrompt({ projectRoot: tempRoot, taskKey: 'dsh-forge-m2/9.9' })
    expect(result).toMatchObject({ available: false, reasonCode: 'ERR_NO_PROMPT' })
    expect((result as { detail?: string }).detail).toContain('exited 1')
    expect((result as { detail?: string }).detail).toContain('TASK_NOT_FOUND')
  })

  it('interrupts the child on timeout and reports the budget (超时中断)', async () => {
    const started = Date.now()
    const { core } = coreWith({ promptTimeoutMs: 400 })
    const result = await core.getTaskPrompt({ projectRoot: tempRoot, taskKey: '8.8' })
    const elapsed = Date.now() - started
    expect(result).toMatchObject({ available: false, reasonCode: 'ERR_NO_PROMPT' })
    expect((result as { detail?: string }).detail).toContain('timed out after 400ms')
    // Resolution itself is the kill proof: a live child would hold the
    // promise open until the 60s stub interval fired.
    expect(elapsed).toBeLessThan(5_000)
  })

  it('terminates the child when stdout exceeds the output cap', async () => {
    const { core } = coreWith({ maxPromptBytes: 1024 })
    const result = await core.getTaskPrompt({ projectRoot: tempRoot, taskKey: '7.7' })
    expect(result).toMatchObject({ available: false, reasonCode: 'ERR_NO_PROMPT' })
    expect((result as { detail?: string }).detail).toContain('exceeded the 1024-byte cap')
  })

  it('terminates the child when stderr exceeds its cap', async () => {
    const { core } = coreWith({ maxErrorBytes: 512 })
    const result = await core.getTaskPrompt({ projectRoot: tempRoot, taskKey: '6.6' })
    expect(result).toMatchObject({ available: false, reasonCode: 'ERR_NO_PROMPT' })
    expect((result as { detail?: string }).detail).toContain('diagnostics exceeded the 512-byte cap')
  })

  it('maps a spawn that cannot start to ERR_FORGE_CLI_UNAVAILABLE (resolution-class failure)', async () => {
    const underlying = makeRealStubSpawn([])
    const throwingPromptSpawn: CliSpawnFn = (command, args, options) => {
      // Only the PROMPT spawn fails; the version probe (resolution) succeeds,
      // isolating the start-failure mapping from the resolution chain.
      if (args[0] === 'prompt') throw new Error('ENOENT: no such file')
      return underlying(command, args, options)
    }
    const { core } = coreWith({ spawnFn: throwingPromptSpawn })
    const result = await core.getTaskPrompt({ projectRoot: tempRoot, taskKey: '4.1' })
    expect(result).toMatchObject({ available: false, reasonCode: 'ERR_FORGE_CLI_UNAVAILABLE' })
    expect((result as { detail?: string }).detail).toContain('failed to start')
  })

  it('propagates ERR_FORGE_CLI_UNAVAILABLE when the CLI cannot be resolved at all', async () => {
    const core = createForgeBridgeCore({
      listProjectRoots: () => [tempRoot],
      getCliPath: () => join(tempRoot, 'definitely-missing', 'forge.exe'),
      env: { PATH: pathEmptyDir },
    })
    const result = await core.getTaskPrompt({ projectRoot: tempRoot, taskKey: '4.1' })
    expect(result).toMatchObject({ available: false, reasonCode: 'ERR_FORGE_CLI_UNAVAILABLE' })
  })
})

describe('core.resolveCli + runBoundedCapture primitives', () => {
  it('resolveCli surfaces the resolution chain result in reasonCode form', async () => {
    const records: SpawnCall[] = []
    const { core } = coreWith({ spawnFn: makeRealStubSpawn(records) })
    expect(await core.resolveCli()).toEqual({
      available: true,
      path: stubCliPath,
      version: '9.9.9-stub',
    })
  })

  it('resolveCli failure carries both-path diagnostics', async () => {
    const core = createForgeBridgeCore({
      listProjectRoots: () => [tempRoot],
      spawnFn: makeRealStubSpawn([], { failProbe: 'throw' }),
    })
    const result = await core.resolveCli()
    expect(result).toMatchObject({ available: false, reasonCode: 'ERR_FORGE_CLI_UNAVAILABLE' })
  })

  it('runBoundedCapture returns exit code and both streams on a clean run', async () => {
    const run = await runBoundedCapture({
      command: stubCliPath,
      args: ['prompt', 'get-by-task-id', '4.1'],
      timeoutMs: 10_000,
      maxStdoutBytes: 1_000_000,
      maxStderrBytes: 1_000,
      spawnFn: makeRealStubSpawn([]),
    })
    expect(run).toEqual({
      spawnError: undefined,
      code: 0,
      signal: null,
      stdout: PROMPT_FIXTURE,
      stderr: '',
      timedOut: false,
      stdoutOverflowed: false,
      stderrOverflowed: false,
    })
  })

  it('runBoundedCapture surfaces unknown-subcommand failures (exit 1 + stderr)', async () => {
    const run = await runBoundedCapture({
      command: stubCliPath,
      args: ['bogus'],
      timeoutMs: 10_000,
      maxStdoutBytes: 1_000,
      maxStderrBytes: 1_000,
      spawnFn: makeRealStubSpawn([]),
    })
    expect(run.code).toBe(1)
    expect(run.stderr).toContain('unknown subcommand')
    expect(run.timedOut).toBe(false)
  })
})

describe('ForgeBridgeService: the cordis remote face', () => {
  it('registers under the forgeBridge key and marks both methods @Remote (gateway discovery face)', () => {
    const provide = vi.fn()
    const ctx = { reflect: { provide } } as unknown as Context
    const service = new ForgeBridgeService(ctx, { listProjectRoots: () => [] })
    expect(provide).toHaveBeenCalledTimes(1)
    expect(provide.mock.calls[0][0]).toBe('forgeBridge')
    expect(provide.mock.calls[0][1]).toBe(service)
    expect(remoteMethods(service).map(marker => marker.exportName ?? marker.method).sort())
      .toEqual(['getTaskPrompt', 'resolveCli'])
  })

  it('delegates both verbs to the core', async () => {
    const provide = vi.fn()
    const ctx = { reflect: { provide } } as unknown as Context
    const service = new ForgeBridgeService(ctx, {
      listProjectRoots: () => [tempRoot],
      getCliPath: () => stubCliPath,
      spawnFn: makeRealStubSpawn([]),
    })
    expect(await service.resolveCli()).toMatchObject({ available: true, version: '9.9.9-stub' })
    expect(await service.getTaskPrompt({ projectRoot: tempRoot, taskKey: 'dsh-forge-m2/4.1' }))
      .toEqual({ available: true, promptText: PROMPT_FIXTURE })
  })
})
