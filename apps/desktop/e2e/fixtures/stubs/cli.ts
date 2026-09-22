// e2e fixture: the stub forge CLI (task 6.1 — AC3: getTaskPrompt-class calls
// answer a fixed legal prompt; exit codes / timeouts are orchestratable).
//
// WHAT THE CONSUMER REQUIRES (packages/plugins/forge-workbench/src/host/):
//   - resolution probes `forge version` (NO cwd — it inherits the spawning
//     host child's cwd) and expects stdout `VERSION: <semver>`, exit 0;
//   - `forge prompt get-by-task-id <localId>` runs with cwd = the registered
//     project root; success = COMPLETE markdown on stdout, exit 0; failure =
//     stderr + nonzero;
//   - `forge task status` (6.5's SC7 terminal form) runs with cwd = project
//     root and must print the fixture's status set;
//   - T2 Hard Rule: the resolver on win32 ONLY spawns native executables
//     (.exe/.com — script shims are rejected because they need a shell).
//
// THE WIN32 TRICK: a copy of the repo's builtin standalone node.exe renamed
// `forge.exe` is a fully functional node runtime under any name. Spawned as
// `forge.exe version`, node resolves its MAIN ENTRY `version` against its
// cwd — so `version.js` in the spawn cwd runs; `forge.exe prompt ...` with
// cwd = project root runs `prompt.js` THERE. The generated one-line mains
// require one shared dispatch script (control + journal live beside it).
// POSIX needs none of this: a `#!/usr/bin/env node` script is directly
// spawnable.
//
// TEST-isolation-000: every artifact lives under the caller-owned stub home
// (a temp dir); nothing is written into the repo tree, and the mock-chrome
// fixed codeRoot concern (5.11) cannot recur — the stub path is per-journey.
//
// Orchestration: <home>/control.json is re-read on EVERY invocation — rewrite
// it between calls to flip behaviors. <home>/journal.jsonl records every
// invocation (argv + cwd) for assertions.

import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

/** Repo root (five levels up from e2e/fixtures/stubs/). */
const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url))

/**
 * Locate the builtin standalone Node executable (the same artifact
 * scripts/prepare-host-runtime.mjs acquires and the host supervisor spawns —
 * mirrored here so fixtures never import workspace packages into specs).
 */
export function builtinNodeExecutable(): string {
  const runtimeRoot = join(REPO_ROOT, 'packages', 'desktop-host-vendor', 'runtime', 'node')
  const entries = existsSync(runtimeRoot) ? readdirSync(runtimeRoot, { withFileTypes: true }) : []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const manifestPath = join(runtimeRoot, entry.name, 'runtime.json')
    if (!existsSync(manifestPath)) continue
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { platform?: string; arch?: string }
      if (manifest.platform !== process.platform || manifest.arch !== process.arch) continue
      const exe = process.platform === 'win32' ? join(runtimeRoot, entry.name, 'node.exe') : join(runtimeRoot, entry.name, 'bin', 'node')
      if (existsSync(exe)) return exe
    } catch {
      // malformed manifest — skip this runtime dir
    }
  }
  throw new Error('builtin Node runtime not acquired — run: node scripts/prepare-host-runtime.mjs')
}

/** Version-leg orchestration. */
export interface StubVersionControl {
  readonly mode?: 'ok' | 'fail' | 'hang'
  readonly version?: string
  readonly exitCode?: number
  readonly stderr?: string
}

/** Prompt-leg orchestration. Default (mode 'ok') derives a fixed legal prompt. */
export interface StubPromptControl {
  readonly mode?: 'ok' | 'fail' | 'hang' | 'overflow'
  /** Full prompt body override (wins over the derived fixed prompt). */
  readonly text?: string
  readonly exitCode?: number
  readonly stderr?: string
}

export interface StubCliControl {
  readonly version?: StubVersionControl
  readonly prompt?: StubPromptControl
}

/** One recorded stub invocation. */
export interface StubCliInvocation {
  readonly at: string
  readonly argv: string[]
  readonly cwd: string
}

export interface StubCli {
  /** The stub home (control + journal + dispatch live here). */
  readonly home: string
  /** The DSH_FORGE_CLI_PATH value (absolute, native-spawnable). */
  readonly cliPath: string
  /**
   * The Electron launch cwd the journey must pass (win32 only — the
   * cwd-less `version` probe resolves its main entry here; undefined on
   * POSIX where the shebang script needs no cwd cooperation).
   */
  readonly launchCwd: string | undefined
  readonly controlPath: string
  readonly journalPath: string
  /** The env seam carrying the stub into the host child. */
  readonly env: { readonly DSH_FORGE_CLI_PATH: string }
  writeControl(control: StubCliControl): void
  readControl(): StubCliControl
  readJournal(): StubCliInvocation[]
  /**
   * Write the win32 main-entry dispatch files into a project root (the
   * `prompt`/`task` spawn cwd). Idempotent; no-op on POSIX.
   */
  attachProject(projectRoot: string): void
}

/** The fixed prompt version line (spike-1 §4.3 shape). */
const STUB_VERSION = '5.21.0-stub'

function dispatchScriptSource(home: string): string {
  return `// Generated fixture stub for the forge CLI (task 6.1). Not production code.
// Orchestration: <home>/control.json (re-read per invocation);
// observation: <home>/journal.jsonl (one line per invocation).
const fs = require('node:fs')
const path = require('node:path')
const HOME = ${JSON.stringify(home)}
// Argument reconstruction: on win32 the node.exe-copy consumes the subcommand
// as its MAIN ENTRY ('forge.exe version' = 'node version' → runs version.js)
// — argv[1] becomes the resolved entry spec (extension stays APPENDED-OFF:
// node keeps the literal 'version'), so the subcommand is recovered from the
// basename, matching both the bare and '.js' forms. POSIX (shebang script)
// sees it in argv[2] and argv[1] is the script path ('forge').
let args = process.argv.slice(2)
const mainBase = path.basename(process.argv[1] || '')
for (const known of ['version', 'prompt', 'task']) {
  if (mainBase === known || mainBase === known + '.js') { args = [known].concat(args); break }
}
try {
  fs.appendFileSync(path.join(HOME, 'journal.jsonl'), JSON.stringify({ at: new Date().toISOString(), argv: args, cwd: process.cwd() }) + '\\n')
} catch {}
let control = {}
try { control = JSON.parse(fs.readFileSync(path.join(HOME, 'control.json'), 'utf8')) } catch {}
// Pipe writes are ASYNC on Windows — process.exit() right after a write can
// truncate it. Set exitCode and let the event loop drain instead.
const fail = (stderr, exitCode) => { process.stderr.write(stderr); process.exitCode = exitCode }
const hang = () => { setInterval(() => {}, 60000) }
const sub = args[0]

if (sub === 'version') {
  const v = control.version || {}
  if (v.mode === 'fail') return fail(v.stderr || 'stub forge version failed (orchestrated)\\n', v.exitCode === undefined ? 1 : v.exitCode)
  if (v.mode === 'hang') return hang()
  process.stdout.write('VERSION: ' + (v.version || ${JSON.stringify(STUB_VERSION)}) + '\\n')
  process.exitCode = 0
  return
}

// Find one task entry by local id across the cwd's features (index.json is
// the authority — the 2.5 dialect).
function findEntry(localId) {
  const featuresDir = path.resolve(process.cwd(), 'docs', 'features')
  let featureDirs = []
  try { featureDirs = fs.readdirSync(featuresDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort() } catch { return undefined }
  for (const slug of featureDirs) {
    const indexPath = path.join(featuresDir, slug, 'tasks', 'index.json')
    let entries
    try { entries = JSON.parse(fs.readFileSync(indexPath, 'utf8')).tasks } catch { continue }
    if (!entries || typeof entries !== 'object') continue
    for (const [stem, entry] of Object.entries(entries)) {
      if (entry && typeof entry === 'object' && entry.id === localId) {
        return { slug, stem, entry, tasksDir: path.join(featuresDir, slug, 'tasks') }
      }
    }
  }
  return undefined
}

if (sub === 'prompt' && args[1] === 'get-by-task-id') {
  const p = control.prompt || {}
  const localId = args[2]
  if (localId === undefined) return fail('usage: forge prompt get-by-task-id <id>\\n', 2)
  if (p.mode === 'fail') return fail(p.stderr || 'ERROR_CODE: ERR_STUB_PROMPT\\nERROR: stub prompt failed (orchestrated)\\n', p.exitCode === undefined ? 1 : p.exitCode)
  if (p.mode === 'hang') return hang()
  if (p.mode === 'overflow') { process.stdout.write('x'.repeat(3 * 1024 * 1024)); process.exitCode = 0; return }
  const found = findEntry(localId)
  if (found === undefined) return fail('task "' + localId + '" not found in index\\n', 1)
  if (p.text !== undefined && p.text !== '') { process.stdout.write(p.text); process.exitCode = 0; return }
  const taskFile = path.join(found.tasksDir, found.entry.file || (found.stem + '.md'))
  const body = [
    'You are a focused task executor running the fixture stub forge CLI.',
    '',
    'TASK_ID: ' + localId,
    'TASK_FILE: ' + taskFile,
    'TASK_CATEGORY: ' + (found.entry.type || 'coding'),
    '',
    'Read the task file at TASK_FILE and follow it exactly; on completion run the submit skill.',
    '',
    'STUB-FORGE-PROMPT ' + ${JSON.stringify(STUB_VERSION)} + ' (fixed legal prompt — byte-stable for SC2 hash asserts)',
    ''
  ].join('\\n')
  process.stdout.write(body)
  process.exitCode = 0
  return
}

if (sub === 'task' && args[1] === 'status') {
  // SC7 dual-form oracle: one TSV row per task, <featureSlug>/<localId><TAB><status>.
  const featuresDir = path.resolve(process.cwd(), 'docs', 'features')
  let featureDirs = []
  try { featureDirs = fs.readdirSync(featuresDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort() } catch {}
  const rows = []
  for (const slug of featureDirs) {
    const indexPath = path.join(featuresDir, slug, 'tasks', 'index.json')
    let entries
    try { entries = JSON.parse(fs.readFileSync(indexPath, 'utf8')).tasks } catch { continue }
    if (!entries || typeof entries !== 'object') continue
    for (const entry of Object.values(entries)) {
      if (entry && typeof entry === 'object' && entry.id) rows.push(slug + '/' + entry.id + '\\t' + (entry.status || ''))
    }
  }
  rows.sort()
  process.stdout.write(rows.length === 0 ? '' : rows.join('\\n') + '\\n')
  process.exitCode = 0
  return
}

fail('stub forge CLI: unsupported invocation ' + JSON.stringify(args) + '\\n', 2)
`
}

/** The win32 main-entry one-liners (dispatch by resolved main filename). */
function mainEntrySource(home: string): string {
  return `require(${JSON.stringify(join(home, 'dispatch.cjs'))})\n`
}

/**
 * Materialize the stub CLI under a caller-owned temp dir.
 *
 * @param home - the stub home (created; must be journey-local).
 */
export function materializeStubCli(home: string): StubCli {
  mkdirSync(home, { recursive: true })
  const binDir = join(home, 'bin')
  mkdirSync(binDir, { recursive: true })
  writeFileSync(join(home, 'dispatch.cjs'), dispatchScriptSource(home))
  writeFileSync(join(home, 'control.json'), `${JSON.stringify({}, undefined, 2)}\n`)
  writeFileSync(join(home, 'journal.jsonl'), '')

  let cliPath: string
  let launchCwd: string | undefined
  if (process.platform === 'win32') {
    const exe = join(binDir, 'forge.exe')
    copyFileSync(builtinNodeExecutable(), exe)
    // The cwd-less `version` probe resolves node's main entry against the
    // spawn cwd = the host child's cwd = the Electron launch cwd.
    writeFileSync(join(binDir, 'version.js'), mainEntrySource(home))
    cliPath = exe
    launchCwd = binDir
  } else {
    const script = join(binDir, 'forge')
    writeFileSync(script, `#!/usr/bin/env node\n${mainEntrySource(home)}`)
    chmodSync(script, 0o755)
    cliPath = script
  }

  const readControl = (): StubCliControl => {
    try {
      return JSON.parse(readFileSync(join(home, 'control.json'), 'utf8')) as StubCliControl
    } catch {
      return {}
    }
  }
  return {
    home,
    cliPath,
    launchCwd,
    controlPath: join(home, 'control.json'),
    journalPath: join(home, 'journal.jsonl'),
    env: { DSH_FORGE_CLI_PATH: cliPath },
    writeControl: (control) => { writeFileSync(join(home, 'control.json'), `${JSON.stringify(control, undefined, 2)}\n`) },
    readControl,
    readJournal: () => {
      try {
        return readFileSync(join(home, 'journal.jsonl'), 'utf8')
          .split('\n')
          .filter(line => line.trim() !== '')
          .map(line => JSON.parse(line) as StubCliInvocation)
      } catch {
        return []
      }
    },
    attachProject: (projectRoot) => {
      if (process.platform !== 'win32') return
      writeFileSync(join(projectRoot, 'prompt.js'), mainEntrySource(home))
      writeFileSync(join(projectRoot, 'task.js'), mainEntrySource(home))
    },
  }
}
