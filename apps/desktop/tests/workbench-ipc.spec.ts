import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openDatabase, type DatabaseSyncLike } from '../src/main/workbench/store/db.ts'
import {
  WORKBENCH_EVENT_CHANNEL,
  WORKBENCH_VERB_CHANNELS,
  isWhitelistedWorkbenchVerbChannel,
} from '../src/main/workbench/ipc/channel-allowlist.ts'
import {
  createWorkbenchEventSubscriptions,
  installWorkbenchVerbs,
  toWorkbenchIpcError,
  WorkbenchIpcError,
  type WorkbenchEventSubscriptions,
  type WorkbenchHandleRegistrar,
} from '../src/main/workbench/ipc/handlers.ts'
import type { WorkbenchEventSender, WorkbenchVerbEvent } from '../src/main/workbench/ipc/sender-validate.ts'
import { WorkbenchRepoError } from '../src/main/workbench/repos/types.ts'
import { WorkbenchRegistryError } from '../src/main/workbench/registry/validate.ts'
import { authorizeExternalDocPath } from '../src/main/workbench/registry/authorize.ts'
import { scanForgeFiles, type ScanTarget } from '../src/main/workbench/indexer/scan.ts'
import {
  createPluginFace,
  PluginMandatoryError,
  readPluginManifestBundles,
} from '../src/main/workbench/ipc/plugins.ts'
import { createPluginEnableGuard } from '../src/main/plugin-runtime/guard.ts'
import { createWorkbenchIpcServices, type WorkbenchPerceptionSeam } from '../src/main/workbench/ipc/services.ts'
import type { Project, WorkbenchState, WorkbenchVerbServices } from '../src/main/workbench/ipc/types.ts'

// Task 2.7 — dshForge.workbench.* verb face. Design:
// docs/features/dsh-forge-m2/design/tech-design.md §Interface 1 (verb table,
// DTOs, event push channel), §Interface 4 (plugin two-tier model), §Error
// Handling (reject envelope), §Security T1 (sender validation) +
// docs/conventions/electron-ipc-security.md (TECH-electron-ipc-001).
//
// Four AC groups under test: routing table, sender rejection, event
// subscription lifecycle, error envelope — plus the service assembly over the
// 2.2-2.6 kernel (repos / registry / scan / perception seam) and the plugin
// face with the 3.1 real guard (mandatory → ERR_PLUGIN_MANDATORY).

const OWNED: WorkbenchVerbEvent = { senderFrame: { url: 'dsh-app://app/' } }
const FOREIGN: WorkbenchVerbEvent = { senderFrame: { url: 'https://evil.example/' } }
const NO_FRAME: WorkbenchVerbEvent = {}

function stderrSink(): string[] {
  const lines: string[] = []
  vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: unknown) => {
    lines.push(String(chunk))
    return true
  }) as typeof process.stderr.write)
  return lines
}

afterEach(() => {
  vi.restoreAllMocks()
})

function toCapture(fn: () => void): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Fakes: services / perception / webContents sender
// ---------------------------------------------------------------------------

const PROJECT: Project = {
  id: 'p-1',
  displayName: 'demo',
  codeRoot: 'Z:/demo',
  docLocationType: 'in_repo',
  docLocationPath: null,
  createdAt: '2026-09-22T00:00:00.000Z',
  lastActivatedAt: null,
}

/** vi.fn-backed service double: every verb records its call and returns a marker. */
function fakeServices(): WorkbenchVerbServices {
  const state: WorkbenchState = { projects: [PROJECT], activeProjectId: 'p-1', plugins: [] }
  return {
    getState: vi.fn(() => state),
    registerProject: vi.fn(() => PROJECT),
    updateProject: vi.fn(() => PROJECT),
    removeProject: vi.fn(() => undefined),
    activateProject: vi.fn(() => undefined),
    getTaskBoard: vi.fn(() => ({ tasks: [], generatedAt: 'now', sync: { state: 'idle', lastScanAt: null } })),
    getTaskDetail: vi.fn(() => ({ summary: { key: 'alpha/1.1' } })),
    getFeatureBoard: vi.fn(() => ({ features: [], generatedAt: 'now' })),
    readFeatureDoc: vi.fn(() => ({ kind: 'prd', markdown: '# prd' })),
    listPlugins: vi.fn(() => []),
    setPluginEnabled: vi.fn(() => []),
    recordSessionLink: vi.fn(() => ({
      id: 'l-1',
      projectId: 'p-1',
      taskKey: 'alpha/1.1',
      sessionId: 's-1',
      status: 'active',
      startedAt: '2026-09-22T00:00:00.000Z',
      endedAt: null,
    })),
    endSessionLink: vi.fn(() => undefined),
  } as unknown as WorkbenchVerbServices
}

function fakePerception(): { seam: WorkbenchPerceptionSeam; retargets: (string | null)[]; rescans: string[] } {
  const retargets: (string | null)[] = []
  const rescans: string[] = []
  const seam: WorkbenchPerceptionSeam = {
    retarget: (target) => { retargets.push(target === null ? null : target.id) },
    rescan: (target) => { rescans.push(target.id) },
  }
  return { seam, retargets, rescans }
}

/** webContents-like sender observing sends + destroyed callbacks. */
function fakeSender(): WorkbenchEventSender & { sent: unknown[][]; destroy(): void; markDestroyed(): void } {
  const sent: unknown[][] = []
  const destroyedCallbacks: (() => void)[] = []
  let destroyed = false
  return {
    send: (...args: unknown[]) => { sent.push(args) },
    once: (event, listener) => { if (event === 'destroyed') destroyedCallbacks.push(listener) },
    isDestroyed: () => destroyed,
    // Real webContents destruction fires the hook; markDestroyed simulates a
    // sender that reports destroyed without the hook having run (sink pruning).
    destroy: () => {
      destroyed = true
      for (const callback of destroyedCallbacks) callback()
    },
    markDestroyed: () => { destroyed = true },
    get sent() { return sent },
  }
}

function installed(services: WorkbenchVerbServices, subscriptions?: WorkbenchEventSubscriptions) {
  const subs = subscriptions ?? createWorkbenchEventSubscriptions()
  const handlers = new Map<string, (event: WorkbenchVerbEvent, ...args: unknown[]) => unknown>()
  const registrar: WorkbenchHandleRegistrar = (channel, listener) => { handlers.set(channel, listener) }
  installWorkbenchVerbs(registrar, services, subs)
  return { handlers, subs }
}

// ---------------------------------------------------------------------------
// AC-2: routing table (one whitelisted channel per verb, no passthrough)
// ---------------------------------------------------------------------------

describe('workbench verb routing table', () => {
  it('contains exactly the fifteen whitelisted verb channels, one per verb', () => {
    expect(Object.values(WORKBENCH_VERB_CHANNELS).sort()).toEqual([
      'dsh-forge:workbench-activate-project',
      'dsh-forge:workbench-end-session-link',
      'dsh-forge:workbench-get-feature-board',
      'dsh-forge:workbench-get-state',
      'dsh-forge:workbench-get-task-board',
      'dsh-forge:workbench-get-task-detail',
      'dsh-forge:workbench-list-plugins',
      'dsh-forge:workbench-read-feature-doc',
      'dsh-forge:workbench-record-session-link',
      'dsh-forge:workbench-register-project',
      'dsh-forge:workbench-remove-project',
      'dsh-forge:workbench-set-plugin-enabled',
      'dsh-forge:workbench-subscribe-events',
      'dsh-forge:workbench-unsubscribe-events',
      'dsh-forge:workbench-update-project',
    ])
    expect(new Set(Object.values(WORKBENCH_VERB_CHANNELS)).size).toBe(15)
  })

  it('keeps the event push channel off the invokable verb whitelist', () => {
    expect(WORKBENCH_EVENT_CHANNEL).toBe('dsh-forge:workbench-events')
    expect(isWhitelistedWorkbenchVerbChannel(WORKBENCH_EVENT_CHANNEL)).toBe(false)
  })

  it('rejects off-whitelist channels (never registered)', () => {
    expect(isWhitelistedWorkbenchVerbChannel('dsh-forge:workbench-get-state')).toBe(true)
    for (const offWhitelist of [
      'dsh-forge:workbench-eval',
      'dsh-forge:workbench-invoke',
      'dsh-forge:eval',
      'dsh-forge:workbench-events',
      'shell:exec',
      '',
    ]) {
      expect(isWhitelistedWorkbenchVerbChannel(offWhitelist)).toBe(false)
    }
  })

  it('registers exactly the 15 channels and routes each verb to its service call with validated args', () => {
    const services = fakeServices()
    const { handlers } = installed(services)
    expect(handlers.size).toBe(15)

    const C = WORKBENCH_VERB_CHANNELS
    expect(handlers.get(C.getState)?.(OWNED)).toMatchObject({ activeProjectId: 'p-1' })
    expect(services.getState).toHaveBeenCalledTimes(1)

    handlers.get(C.registerProject)?.(OWNED, { codeRoot: 'Z:/demo', docLocationType: 'in_repo' })
    expect(services.registerProject).toHaveBeenCalledWith({ codeRoot: 'Z:/demo', docLocationType: 'in_repo' })

    handlers.get(C.updateProject)?.(OWNED, 'p-1', { displayName: 'renamed' })
    expect(services.updateProject).toHaveBeenCalledWith('p-1', { displayName: 'renamed' })

    handlers.get(C.removeProject)?.(OWNED, 'p-1')
    expect(services.removeProject).toHaveBeenCalledWith('p-1')

    handlers.get(C.activateProject)?.(OWNED, 'p-1')
    expect(services.activateProject).toHaveBeenCalledWith('p-1')

    handlers.get(C.getTaskBoard)?.(OWNED, 'p-1')
    expect(services.getTaskBoard).toHaveBeenCalledWith('p-1')

    handlers.get(C.getTaskDetail)?.(OWNED, 'p-1', 'alpha/1.1')
    expect(services.getTaskDetail).toHaveBeenCalledWith('p-1', 'alpha/1.1')

    handlers.get(C.getFeatureBoard)?.(OWNED, 'p-1')
    expect(services.getFeatureBoard).toHaveBeenCalledWith('p-1')

    handlers.get(C.readFeatureDoc)?.(OWNED, 'p-1', 'alpha', 'prd')
    expect(services.readFeatureDoc).toHaveBeenCalledWith('p-1', 'alpha', 'prd')

    handlers.get(C.listPlugins)?.(OWNED)
    expect(services.listPlugins).toHaveBeenCalledTimes(1)

    handlers.get(C.setPluginEnabled)?.(OWNED, 'hello-world', false)
    expect(services.setPluginEnabled).toHaveBeenCalledWith('hello-world', false)

    handlers.get(C.recordSessionLink)?.(OWNED, { projectId: 'p-1', taskKey: 'alpha/1.1', sessionId: 's-1' })
    expect(services.recordSessionLink).toHaveBeenCalledWith({ projectId: 'p-1', taskKey: 'alpha/1.1', sessionId: 's-1' })

    handlers.get(C.endSessionLink)?.(OWNED, 'l-1')
    expect(services.endSessionLink).toHaveBeenCalledWith('l-1')
  })

  it('maps shape violations to the ERR_WORKBENCH_DB envelope without reaching the service', () => {
    const lines = stderrSink()
    const services = fakeServices()
    const { handlers } = installed(services)
    const error = toCapture(() => handlers.get(WORKBENCH_VERB_CHANNELS.getTaskBoard)?.(OWNED, 42)) as WorkbenchIpcError
    expect(error).toBeInstanceOf(WorkbenchIpcError)
    expect(JSON.parse(error.message)).toMatchObject({ code: 'ERR_WORKBENCH_DB' })
    expect(services.getTaskBoard).not.toHaveBeenCalled()
    expect(lines.some(line => line.includes('ERR_WORKBENCH_DB'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// AC-3: sender frame validation (every handler, reject + log)
// ---------------------------------------------------------------------------

describe('sender frame validation', () => {
  it('rejects and logs every registered verb from a foreign frame', () => {
    const lines = stderrSink()
    const services = fakeServices()
    const { handlers } = installed(services)
    for (const [channel, handler] of handlers) {
      expect(() => handler(FOREIGN), channel).toThrow(/unowned frame/)
    }
    expect(lines.filter(line => line.includes('ERR_IPC_SENDER_REJECTED'))).toHaveLength(handlers.size)
    expect(lines.some(line => line.includes('https://evil.example/'))).toBe(true)
    expect(services.getState).not.toHaveBeenCalled()
  })

  it('rejects and logs every registered verb when the frame is missing', () => {
    const lines = stderrSink()
    const { handlers } = installed(fakeServices())
    for (const [, handler] of handlers) {
      expect(() => handler(NO_FRAME)).toThrow(/unowned frame/)
    }
    expect(lines.some(line => line.includes('ERR_IPC_SENDER_REJECTED'))).toBe(true)
  })

  it('sender rejection stays a plain rejection (never remapped into the envelope)', () => {
    stderrSink()
    const { handlers } = installed(fakeServices())
    const error = toCapture(() => handlers.get(WORKBENCH_VERB_CHANNELS.getState)?.(FOREIGN))
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(WorkbenchIpcError)
    expect((error as Error).message).toMatch(/unowned frame/)
  })

  it('accepts the dsh-app://app/ main document frame without logging', () => {
    const lines = stderrSink()
    const { handlers } = installed(fakeServices())
    expect(() => handlers.get(WORKBENCH_VERB_CHANNELS.getState)?.(OWNED)).not.toThrow()
    expect(lines).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// AC-4: onEvents subscription lifecycle + batch push sink
// ---------------------------------------------------------------------------

describe('event subscription lifecycle', () => {
  const senderEvent = (sender: WorkbenchEventSender): WorkbenchVerbEvent => ({
    senderFrame: { url: 'dsh-app://app/' },
    sender,
  })
  const SYNC_BATCH = [{ type: 'sync', projectId: 'p-1', sync: { state: 'idle', lastScanAt: null } }]

  it('subscribe registers the invoking webContents (idempotent) and unsubscribe removes it', () => {
    const { handlers, subs } = installed(fakeServices())
    const sender = fakeSender()

    handlers.get(WORKBENCH_VERB_CHANNELS.subscribeEvents)?.(senderEvent(sender))
    expect(subs.size).toBe(1)
    handlers.get(WORKBENCH_VERB_CHANNELS.subscribeEvents)?.(senderEvent(sender))
    expect(subs.size).toBe(1) // single-subscriber semantics: same webContents deduped

    subs.sink(SYNC_BATCH)
    expect(sender.sent).toEqual([[WORKBENCH_EVENT_CHANNEL, SYNC_BATCH]])

    handlers.get(WORKBENCH_VERB_CHANNELS.unsubscribeEvents)?.(senderEvent(sender))
    expect(subs.size).toBe(0)
    subs.sink(SYNC_BATCH)
    expect(sender.sent).toHaveLength(1) // no further delivery
  })

  it('renderer destruction auto-unsubscribes via the destroyed hook', () => {
    const subs = createWorkbenchEventSubscriptions()
    const sender = fakeSender()
    subs.subscribe(sender)
    expect(subs.size).toBe(1)

    sender.destroy()
    expect(subs.size).toBe(0) // 渲染层销毁即退订
    subs.sink(SYNC_BATCH)
    expect(sender.sent).toHaveLength(0)
  })

  it('sink prunes a sender that reports destroyed without the hook having fired', () => {
    const subs = createWorkbenchEventSubscriptions()
    const silent = fakeSender()
    subs.subscribe(silent)
    silent.markDestroyed()
    expect(subs.size).toBe(1) // hook never fired — the sink is the second line
    subs.sink(SYNC_BATCH)
    expect(silent.sent).toHaveLength(0)
    expect(subs.size).toBe(0)
  })

  it('sink broadcasts one coalesced batch to every live subscriber', () => {
    const subs = createWorkbenchEventSubscriptions()
    const a = fakeSender()
    const b = fakeSender()
    subs.subscribe(a)
    subs.subscribe(b)
    const batch = [
      { type: 'task_updated', projectId: 'p-1', taskKey: 'alpha/1.1', source: null, changeKind: 'attribute' },
      { type: 'sync', projectId: 'p-1', sync: { state: 'idle', lastScanAt: null } },
    ]
    subs.sink(batch)
    expect(a.sent).toEqual([[WORKBENCH_EVENT_CHANNEL, batch]])
    expect(b.sent).toEqual([[WORKBENCH_EVENT_CHANNEL, batch]])
  })

  it('sink is a no-op for empty batches and with no subscribers', () => {
    const subs = createWorkbenchEventSubscriptions()
    expect(() => subs.sink([])).not.toThrow()
    const sender = fakeSender()
    subs.subscribe(sender)
    subs.sink([])
    expect(sender.sent).toHaveLength(0)
  })

  it('subscribe without a sender webContents is a contract error (envelope, not registered)', () => {
    const lines = stderrSink()
    const { handlers, subs } = installed(fakeServices())
    const error = toCapture(() => handlers.get(WORKBENCH_VERB_CHANNELS.subscribeEvents)?.(OWNED)) as WorkbenchIpcError
    expect(error).toBeInstanceOf(WorkbenchIpcError)
    expect(JSON.parse(error.message)).toMatchObject({ code: 'ERR_WORKBENCH_DB' })
    expect(subs.size).toBe(0)
    expect(lines.some(line => line.includes('ERR_WORKBENCH_DB'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// AC-6a: error envelope (domain codes through, unknown → ERR_WORKBENCH_DB)
// ---------------------------------------------------------------------------

describe('error envelope', () => {
  it('serializes domain errors as { code, message } in the rejected message', () => {
    const error = toWorkbenchIpcError(
      new WorkbenchRepoError('ERR_PROJECT_NOT_FOUND', 'project p-1 does not exist'),
      'dsh-forge:workbench-get-task-board',
    )
    expect(error).toBeInstanceOf(WorkbenchIpcError)
    expect(error.envelope).toEqual({ code: 'ERR_PROJECT_NOT_FOUND', message: 'project p-1 does not exist' })
    expect(JSON.parse(error.message)).toEqual({ code: 'ERR_PROJECT_NOT_FOUND', message: 'project p-1 does not exist' })
  })

  it('carries registry and guard error codes through unchanged', () => {
    const registry = toWorkbenchIpcError(
      new WorkbenchRegistryError('ERR_CODE_ROOT_UNREADABLE', 'code root Z:/nope is not a readable directory'),
      'verb',
    )
    expect(registry.envelope.code).toBe('ERR_CODE_ROOT_UNREADABLE')
    const guard = toWorkbenchIpcError(new PluginMandatoryError('plugin forge-workbench is mandatory'), 'verb')
    expect(guard.envelope).toEqual({ code: 'ERR_PLUGIN_MANDATORY', message: 'plugin forge-workbench is mandatory' })
  })

  it('falls back to ERR_WORKBENCH_DB + log for unclassified errors', () => {
    const lines = stderrSink()
    const error = toWorkbenchIpcError(new Error('boom'), 'dsh-forge:workbench-get-state')
    expect(error.envelope.code).toBe('ERR_WORKBENCH_DB')
    expect(error.envelope.detail).toBe('boom')
    expect(lines.some(line => line.includes('ERR_WORKBENCH_DB') && line.includes('boom'))).toBe(true)
  })

  it('handler rejections surface the envelope (renderer parses err.message)', () => {
    const services = fakeServices()
    vi.mocked(services.getTaskBoard).mockImplementation(() => {
      throw new WorkbenchRepoError('ERR_PROJECT_NOT_FOUND', 'project gone does not exist')
    })
    const { handlers } = installed(services)
    const error = toCapture(() => handlers.get(WORKBENCH_VERB_CHANNELS.getTaskBoard)?.(OWNED, 'gone')) as WorkbenchIpcError
    expect(error).toBeInstanceOf(WorkbenchIpcError)
    expect(JSON.parse(error.message)).toEqual({ code: 'ERR_PROJECT_NOT_FOUND', message: 'project gone does not exist' })
  })

  it('propagates an already-envelope error unchanged', () => {
    const original = new WorkbenchIpcError({ code: 'ERR_PROJECT_EXISTS', message: 'already registered' })
    expect(toWorkbenchIpcError(original, 'verb')).toBe(original)
  })
})

// ---------------------------------------------------------------------------
// Service assembly over the 2.2-2.6 kernel
// ---------------------------------------------------------------------------

const scratches: string[] = []

function makeScratch(): string {
  const dir = join(tmpdir(), `dsh-forge-workbench-ipc-${String(process.pid)}-${String(scratches.length)}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  scratches.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of scratches.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 10 })
})

interface FixtureTask {
  readonly id: string
  readonly dependencies?: readonly string[]
  readonly type?: string
  readonly record?: { readonly completed?: string; readonly actor?: string; readonly summary?: string }
}

/** Compact synthetic forge project (dialect pinned by task 2.5). */
function buildForgeProject(root: string, tasks: readonly FixtureTask[]): string {
  mkdirSync(join(root, '.forge'), { recursive: true })
  const featureDir = join(root, 'docs', 'features', 'alpha')
  const tasksDir = join(featureDir, 'tasks')
  mkdirSync(join(tasksDir, 'records'), { recursive: true })
  writeFileSync(join(featureDir, 'manifest.md'), '---\nfeature: "alpha"\nstatus: tasks\n---\n\n# alpha\n')
  mkdirSync(join(featureDir, 'prd'), { recursive: true })
  writeFileSync(join(featureDir, 'prd', 'prd-spec.md'), '# PRD body\n')
  const entries: Record<string, Record<string, unknown>> = {}
  for (const task of tasks) {
    const stem = `${task.id}-task`
    const entry: Record<string, unknown> = {
      id: task.id,
      title: `Task ${task.id}`,
      status: task.record === undefined ? 'in_progress' : 'completed',
      file: `${stem}.md`,
      record: `records/${stem}.md`,
    }
    if (task.type !== undefined) entry.type = task.type
    if (task.dependencies !== undefined) entry.dependencies = [...task.dependencies]
    entries[stem] = entry
    writeFileSync(
      join(tasksDir, `${stem}.md`),
      `---\nid: "${task.id}"\ntitle: "Task ${task.id}"\n---\n\n# Task ${task.id}\n\nBody of ${task.id}.\n`,
    )
    if (task.record !== undefined) {
      const actor = task.record.actor === undefined ? '' : `actor: "${task.record.actor}"\n`
      writeFileSync(
        join(tasksDir, 'records', `${stem}.md`),
        '---\n'
          + 'status: "completed"\n'
          + 'started: "2026-09-21 09:00"\n'
          + `completed: "${task.record.completed ?? '2026-09-21 09:30'}"\n`
          + actor
          + '---\n\n## Summary\n'
          + `${task.record.summary ?? 'Executed the task.'}\n`,
      )
    }
  }
  writeFileSync(join(tasksDir, 'index.json'), JSON.stringify({ feature: 'alpha', tasks: entries }))
  return root
}

function makeForgeRoot(name: string, tasks: readonly FixtureTask[] = [{ id: '1.1' }]): string {
  return buildForgeProject(join(makeScratch(), name), tasks)
}

interface Harness {
  readonly db: DatabaseSyncLike
  readonly verbs: WorkbenchVerbServices
  readonly perception: { seam: WorkbenchPerceptionSeam; retargets: (string | null)[]; rescans: string[] }
  readonly paths: { readonly userData: string; readonly manifest: string; readonly overlay: string }
  seedProject(codeRoot: string): Project
}

async function withHarness(run: (harness: Harness) => void | Promise<void>): Promise<void> {
  const root = makeScratch()
  const userData = join(root, 'user')
  mkdirSync(userData, { recursive: true })
  const manifest = join(root, 'resources', 'plugin-bundles.json')
  mkdirSync(join(root, 'resources'), { recursive: true })
  writeFileSync(manifest, JSON.stringify({
    bundles: [
      { name: '@deepseek-ai/dsh-base', mandatory: true },
      { name: 'hello-world' },
    ],
  }))
  const { db } = await openDatabase(userData)
  const perception = fakePerception()
  const assembly = createWorkbenchIpcServices({
    db,
    pluginBundlesPath: manifest,
    userDataPath: userData,
    onEvents: () => {},
    perception: perception.seam,
  })
  try {
    await run({
      db,
      verbs: assembly.verbs,
      perception,
      paths: { userData, manifest, overlay: join(userData, 'plugin-runtime.json') },
      seedProject: codeRoot => assembly.verbs.registerProject({ codeRoot, docLocationType: 'in_repo' }),
    })
  } finally {
    db.close()
  }
}

function targetOf(project: Project): ScanTarget {
  return { id: project.id, codeRoot: project.codeRoot, docLocationPath: project.docLocationPath }
}

describe('workbench services: project lifecycle + perception orchestration', () => {
  it('registerProject runs the full registry chain; activation retargets and rescans', async () => {
    await withHarness(({ verbs, perception, seedProject }) => {
      const project = seedProject(makeForgeRoot('demo'))
      expect(project.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(perception.retargets).toEqual([]) // 注册不启动感知(激活才感知)

      verbs.activateProject(project.id)
      expect(perception.retargets).toEqual([project.id])
      expect(perception.rescans).toEqual([project.id])

      const state = verbs.getState()
      expect(state.activeProjectId).toBe(project.id)
      expect(state.projects.map(p => p.id)).toContain(project.id)
      expect(state.plugins).toEqual([
        { name: '@deepseek-ai/dsh-base', mandatory: true, enabled: true },
        { name: 'hello-world', mandatory: false, enabled: true },
      ])
    })
  })

  it('removeProject of the active project stops perception; non-active removal does not', async () => {
    await withHarness(({ verbs, perception, seedProject }) => {
      const a = seedProject(makeForgeRoot('a'))
      const b = seedProject(makeForgeRoot('b'))
      verbs.activateProject(a.id)
      perception.retargets.length = 0

      verbs.removeProject(b.id)
      expect(perception.retargets).toEqual([])

      verbs.removeProject(a.id)
      expect(perception.retargets).toEqual([null])
      expect(verbs.getState().activeProjectId).toBe(null)
    })
  })

  it('updateProject repoint rescans and retargets the active project; rename-only does neither (Interface 1 注记)', async () => {
    await withHarness(({ verbs, db, perception, seedProject }) => {
      const project = seedProject(makeForgeRoot('repoint'))
      verbs.activateProject(project.id)
      perception.retargets.length = 0
      perception.rescans.length = 0

      const renamed = verbs.updateProject(project.id, { displayName: 'renamed' })
      expect(renamed.displayName).toBe('renamed')
      expect(perception.retargets).toEqual([])
      expect(perception.rescans).toEqual([])

      // repoint → external docs: explicit authorization is a 2.4 chain input
      const externalRoot = makeForgeRoot('external-docs')
      authorizeExternalDocPath(db, externalRoot)
      const repointed = verbs.updateProject(project.id, {
        docLocationType: 'external',
        docLocationPath: externalRoot,
      })
      expect(repointed.docLocationType).toBe('external')
      expect(perception.retargets).toEqual([project.id])
      expect(perception.rescans).toEqual([project.id])
    })
  })

  it('start() resumes the persisted active project (retarget + rescan, no pointer rewrite)', async () => {
    const root = makeScratch()
    const userData = join(root, 'user')
    mkdirSync(userData, { recursive: true })
    const manifest = join(root, 'resources', 'plugin-bundles.json')
    mkdirSync(join(root, 'resources'), { recursive: true })
    writeFileSync(manifest, JSON.stringify({ bundles: [{ name: 'hello-world' }] }))
    const forgeRoot = makeForgeRootAt(join(root, 'proj'))

    const { db } = await openDatabase(userData)
    const setup = createWorkbenchIpcServices({ db, pluginBundlesPath: manifest, userDataPath: userData, perception: fakePerception().seam })
    const project = setup.verbs.registerProject({ codeRoot: forgeRoot, docLocationType: 'in_repo' })
    setup.verbs.activateProject(project.id)
    const activatedAt = setup.verbs.getState().projects.find(p => p.id === project.id)?.lastActivatedAt
    db.close()

    const reopened = await openDatabase(userData)
    const perception = fakePerception()
    const resume = createWorkbenchIpcServices({
      db: reopened.db,
      pluginBundlesPath: manifest,
      userDataPath: userData,
      perception: perception.seam,
    })
    resume.start()
    expect(perception.retargets).toEqual([project.id])
    expect(perception.rescans).toEqual([project.id])
    // resume 不迁移 last_activated_at(非用户激活)
    expect(resume.verbs.getState().projects.find(p => p.id === project.id)?.lastActivatedAt).toBe(activatedAt)
    reopened.db.close()
  })
})

function makeForgeRootAt(root: string): string {
  return buildForgeProject(root, [{ id: '1.1' }])
}

describe('workbench services: board / detail / doc reads', () => {
  it('getTaskBoard projects snapshots into TaskSummary DTOs with sync state', async () => {
    await withHarness(({ verbs, seedProject, db }) => {
      const project = seedProject(makeForgeRoot('board', [
        { id: '1.1', dependencies: ['1.0'], record: { summary: 'did it' } },
        { id: '1.0' },
      ]))
      scanForgeFiles(db, targetOf(project))

      const board = verbs.getTaskBoard(project.id)
      expect(board.tasks.map(task => task.key).sort()).toEqual(['alpha/1.0', 'alpha/1.1'])
      const task11 = board.tasks.find(task => task.key === 'alpha/1.1')
      expect(task11).toMatchObject({
        title: 'Task 1.1',
        featureSlug: 'alpha',
        blockers: ['1.0'],
        branch: null,
        worktree: false,
        status: 'completed',
      })
      expect(board.sync.state).toBe('idle')
      expect(board.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })
  })

  it('getTaskBoard rejects unknown projects with ERR_PROJECT_NOT_FOUND', async () => {
    await withHarness(({ verbs }) => {
      const error = toCapture(() => verbs.getTaskBoard('nope'))
      expect(error).toBeInstanceOf(WorkbenchRepoError)
      expect(error).toMatchObject({ code: 'ERR_PROJECT_NOT_FOUND' })
    })
  })

  it('getTaskDetail assembles description/records/depChain/links (2.5 dialect)', async () => {
    await withHarness(({ verbs, seedProject, db }) => {
      const project = seedProject(makeForgeRoot('detail', [
        { id: '1.3', dependencies: ['1.2'] },
        { id: '1.2', dependencies: ['1.1'] },
        { id: '1.1', type: 'coding.feature', record: { completed: '2026-09-21 10:00', summary: 'Implemented the base.' } },
      ]))
      scanForgeFiles(db, targetOf(project))
      verbs.recordSessionLink({ projectId: project.id, taskKey: 'alpha/1.3', sessionId: 'sess-9' })

      const detail = verbs.getTaskDetail(project.id, 'alpha/1.3')
      expect(detail.summary).toMatchObject({ key: 'alpha/1.3', status: 'in_progress' })
      expect(detail.descriptionMarkdown).toContain('# Task 1.3')
      expect(detail.descriptionMarkdown).toContain('Body of 1.3.')
      // 传递链拓扑序(最上游在前),key 为限定地址
      expect(detail.depChain).toEqual([
        { key: 'alpha/1.1', title: 'Task 1.1', status: 'completed' },
        { key: 'alpha/1.2', title: 'Task 1.2', status: 'in_progress' },
      ])
      expect(detail.records).toEqual([]) // 1.3 无执行记录
      expect(detail.links).toHaveLength(1)
      expect(detail.links[0]).toMatchObject({ sessionId: 'sess-9', status: 'active' })

      const base = verbs.getTaskDetail(project.id, 'alpha/1.1')
      expect(base.records).toEqual([
        { at: '2026-09-21 10:00', kind: 'coding.feature', source: null, summary: 'Implemented the base.' },
      ])
      expect(base.links).toEqual([])

      // 未知任务 → 未知异常口径(通用错误卡)
      expect(toCapture(() => verbs.getTaskDetail(project.id, 'alpha/9.9'))).toBeInstanceOf(Error)
    })
  })

  it('getFeatureBoard projects feature snapshots', async () => {
    await withHarness(({ verbs, seedProject, db }) => {
      const project = seedProject(makeForgeRoot('features', [{ id: '1.1' }, { id: '1.2' }]))
      scanForgeFiles(db, targetOf(project))

      const board = verbs.getFeatureBoard(project.id)
      expect(board.features).toEqual([
        {
          slug: 'alpha',
          status: 'tasks',
          docKinds: ['manifest', 'prd', 'tasks'],
          taskTotal: 2,
          taskCompleted: 0,
          updatedAt: expect.any(String),
        },
      ])
    })
  })

  it('readFeatureDoc reads dialect anchors and fails loud on missing docs (T4)', async () => {
    await withHarness(({ verbs, seedProject }) => {
      const project = seedProject(makeForgeRoot('docs'))

      expect(verbs.readFeatureDoc(project.id, 'alpha', 'prd')).toEqual({ kind: 'prd', markdown: '# PRD body\n' })
      expect(verbs.readFeatureDoc(project.id, 'alpha', 'manifest')).toMatchObject({ kind: 'manifest' })

      const missing = toCapture(() => verbs.readFeatureDoc(project.id, 'alpha', 'ui')) as Error
      expect(missing).toBeInstanceOf(Error)
      expect(missing.message).toMatch(/unreadable/)
      expect(toCapture(() => verbs.readFeatureDoc(project.id, 'ghost', 'prd'))).toBeInstanceOf(Error)
    })
  })

  it('session link verbs map onto the repos layer', async () => {
    await withHarness(({ verbs, seedProject }) => {
      const project = seedProject(makeForgeRoot('links'))
      const link = verbs.recordSessionLink({ projectId: project.id, taskKey: 'alpha/1.1', sessionId: 's-1' })
      expect(link).toMatchObject({ status: 'active', sessionId: 's-1' })
      verbs.endSessionLink(link.id)
      const ended = verbs.recordSessionLink({ projectId: project.id, taskKey: 'alpha/1.1', sessionId: 's-1' })
      expect(ended.status).toBe('active') // 复挂恢复 active(刷新语义)
      expect(toCapture(() => verbs.endSessionLink('missing'))).toMatchObject({ code: 'ERR_SESSION_LINK_NOT_FOUND' })
    })
  })
})

describe('plugin face: two-tier model + 3.1 real guard', () => {
  function makeFace(root: string, manifestBundles: unknown) {
    const manifest = join(root, 'resources', 'plugin-bundles.json')
    mkdirSync(join(root, 'resources'), { recursive: true })
    writeFileSync(manifest, JSON.stringify({ bundles: manifestBundles }))
    const pluginFace = createPluginFace({
      manifestPath: manifest,
      overlayPath: join(root, 'user', 'plugin-runtime.json'),
      guard: createPluginEnableGuard(() => readPluginManifestBundles(manifest)),
    })
    return { pluginFace, manifest }
  }

  it('listRows derives mandatory from the manifest and enabled from the overlay', () => {
    const { pluginFace } = makeFace(makeScratch(), [
      { name: '@deepseek-ai/dsh-base', mandatory: true },
      { name: 'hello-world' },
    ])
    expect(pluginFace.listRows()).toEqual([
      { name: '@deepseek-ai/dsh-base', mandatory: true, enabled: true },
      { name: 'hello-world', mandatory: false, enabled: true },
    ])

    pluginFace.setEnabled('hello-world', false)
    expect(pluginFace.listRows().find(row => row.name === 'hello-world')).toMatchObject({ enabled: false })
  })

  it('setPluginEnabled rejects mandatory bundles (ERR_PLUGIN_MANDATORY) and writes only the overlay', () => {
    const root = makeScratch()
    const { pluginFace, manifest } = makeFace(root, [
      { name: 'forge-workbench', mandatory: true },
      { name: 'hello-world' },
    ])
    const before = readFileSync(manifest, 'utf8')

    const rejection = toCapture(() => pluginFace.setEnabled('forge-workbench', false))
    expect(rejection).toBeInstanceOf(PluginMandatoryError)
    expect((rejection as PluginMandatoryError).code).toBe('ERR_PLUGIN_MANDATORY')

    pluginFace.setEnabled('hello-world', false)
    expect(readFileSync(manifest, 'utf8')).toBe(before) // 产品清单运行时只读
    expect(JSON.parse(readFileSync(join(root, 'user', 'plugin-runtime.json'), 'utf8'))).toEqual({ disabled: ['hello-world'] })

    pluginFace.setEnabled('hello-world', true)
    expect(JSON.parse(readFileSync(join(root, 'user', 'plugin-runtime.json'), 'utf8'))).toEqual({ disabled: [] })

    expect(toCapture(() => pluginFace.setEnabled('unknown-plugin', false))).toBeInstanceOf(Error)
  })

  it('overlay violations (mandatory or unknown names, corrupt JSON) fall back to the manifest state', () => {
    const root = makeScratch()
    const { pluginFace } = makeFace(root, [{ name: 'hello-world' }])
    const overlayPath = join(root, 'user', 'plugin-runtime.json')
    mkdirSync(join(root, 'user'), { recursive: true })

    const lines: string[] = []
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
      lines.push(String(chunk))
      return true
    }) as typeof process.stdout.write)

    writeFileSync(overlayPath, JSON.stringify({ disabled: ['hello-world', 'not-a-bundle', 42] }))
    // 剔除违规条目(未知名/非字符串);合法的第三方禁用保留
    expect(pluginFace.listRows()).toEqual([{ name: 'hello-world', mandatory: false, enabled: false }])
    expect(lines.some(line => line.includes('ERR_PLUGIN_RUNTIME_STATE') && line.includes('not-a-bundle'))).toBe(true)

    writeFileSync(overlayPath, '{ not json')
    expect(pluginFace.listRows()).toEqual([{ name: 'hello-world', mandatory: false, enabled: true }])
  })
})

describe('services + handlers end to end (real kernel, fake perception)', () => {
  it('serves board and detail reads through the installed verbs; errors carry the envelope', async () => {
    await withHarness(({ verbs, db, seedProject }) => {
      const handlers = new Map<string, (event: WorkbenchVerbEvent, ...args: unknown[]) => unknown>()
      installWorkbenchVerbs(
        (channel, listener) => { handlers.set(channel, listener) },
        verbs,
        createWorkbenchEventSubscriptions(),
      )
      const project = seedProject(makeForgeRoot('e2e', [
        { id: '1.1', type: 'coding.feature', record: { summary: 'ran it' } },
      ]))
      scanForgeFiles(db, targetOf(project))

      const board = handlers.get(WORKBENCH_VERB_CHANNELS.getTaskBoard)?.(OWNED, project.id) as { tasks: { key: string }[] }
      expect(board.tasks.map(task => task.key)).toEqual(['alpha/1.1'])

      const detail = handlers.get(WORKBENCH_VERB_CHANNELS.getTaskDetail)?.(OWNED, project.id, 'alpha/1.1') as {
        summary: { key: string }
        records: { summary: string }[]
      }
      expect(detail.summary.key).toBe('alpha/1.1')
      expect(detail.records[0]?.summary).toBe('ran it')

      const error = toCapture(() =>
        handlers.get(WORKBENCH_VERB_CHANNELS.getTaskDetail)?.(OWNED, 'ghost', 'alpha/1.1'),
      ) as WorkbenchIpcError
      expect(JSON.parse(error.message)).toMatchObject({ code: 'ERR_PROJECT_NOT_FOUND' })
    })
  })
})
