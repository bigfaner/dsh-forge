import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { ShellLogFields } from '../src/main/log.ts'
import { openDatabase, type DatabaseSyncLike } from '../src/main/workbench/store/db.ts'
import { registerProject } from '../src/main/workbench/repos/projects.ts'
import { authorizeExternalDocPath } from '../src/main/workbench/registry/authorize.ts'
import { listTaskSnapshots } from '../src/main/workbench/repos/task-snapshots.ts'
import { scanForgeFiles, type ScanOutcome, type ScanTarget } from '../src/main/workbench/indexer/scan.ts'
import type { WorkbenchEvent } from '../src/main/workbench/indexer/diff.ts'
import type { RepoDb } from '../src/main/workbench/repos/types.ts'
import { createEventBatcher } from '../src/main/workbench/watcher/events.ts'
import type { WatchOpener } from '../src/main/workbench/watcher/fallback.ts'
import { createWorkbenchWatcher, type WorkbenchWatcher } from '../src/main/workbench/watcher/watch.ts'

// Task 2.6 — DF003 perception watcher over the 2.5 indexer entry. Design:
// docs/features/dsh-forge-m2/design/tech-design.md §Interface 3 (watch targets
// = codeRoot/.forge/ + docs/features/, recursive→tree→2s polling fallback,
// 400ms debounce) + §Interface 1 (WorkbenchEvent batched push ≤500ms).
//
// Four groups per AC6: trigger / merge / degrade / recover. Polling and the
// debounce/batch windows run on fake clocks; one trigger case exercises the
// real fs.watch path end to end. Hard Rules under test: only registered
// (and, for external doc locations, authorized) paths are ever watched, and
// the scan never runs on the fs-event callback stack (macrotask slicing).
//
// Fixtures reuse the 2.5 synthetic forge-project dialect: manifest.md
// frontmatter + tasks/index.json keyed by `<id>-task` stems.

const scratches: string[] = []
const openDbs: DatabaseSyncLike[] = []
const watchers: WorkbenchWatcher[] = []

function makeScratch(): string {
  const dir = join(tmpdir(), `dsh-forge-workbench-watcher-${String(process.pid)}-${String(scratches.length)}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  scratches.push(dir)
  return dir
}

function writeForgeFeature(codeRoot: string, status = 'pending'): void {
  mkdirSync(join(codeRoot, '.forge'), { recursive: true })
  const tasksDir = join(codeRoot, 'docs', 'features', 'demo', 'tasks')
  mkdirSync(join(tasksDir, 'records'), { recursive: true })
  writeFileSync(join(codeRoot, 'docs', 'features', 'demo', 'manifest.md'), '---\nfeature: "demo"\nstatus: in-progress\n---\n\n# demo\n')
  writeTaskIndex(codeRoot, status)
}

function writeTaskIndex(codeRoot: string, status: string): void {
  const indexPath = join(codeRoot, 'docs', 'features', 'demo', 'tasks', 'index.json')
  const entry = { id: '1.1', title: 'One', priority: 'P0', status, file: '1.1-task.md', record: 'records/1.1-task.md' }
  writeFileSync(indexPath, `${JSON.stringify({ tasks: { '1.1-task': entry } }, null, 2)}\n`)
}

async function makeDb(): Promise<DatabaseSyncLike> {
  const { db } = await openDatabase(makeScratch())
  openDbs.push(db)
  return db
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  for (const watcher of watchers.splice(0)) watcher.stop()
  for (const db of openDbs.splice(0)) db.close()
  for (const dir of scratches.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 10 })
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Fake fs.watch (deterministic tier control) + watcher harness
// ---------------------------------------------------------------------------

/** Degrade-control knobs, read live at every openWatch call. */
interface WatchMode {
  failRecursive: boolean
  failTree: boolean
}

interface FakeHandle {
  readonly dir: string
  readonly recursive: boolean
  closed: boolean
  /** Fire a filesystem event on this handle. */
  fire(eventType?: string): void
  /** Fire a runtime watch error on this handle (dir deleted / permission). */
  fail(message?: string): void
}

function makeFakeWatch(mode: WatchMode): { handles: FakeHandle[]; opener: WatchOpener } {
  const handles: FakeHandle[] = []
  const opener: WatchOpener = (dir, options, listener, onError) => {
    if (options.recursive && mode.failRecursive) throw new Error('ERR_FEATURE_UNAVAILABLE: recursive watch unsupported')
    if (!options.recursive && mode.failTree) throw new Error('ENOENT: watch root unavailable')
    const handle: FakeHandle = {
      dir,
      recursive: options.recursive,
      closed: false,
      fire: (eventType = 'change') => listener(eventType, 'file'),
      fail: (message = 'EPERM: operation not permitted') => onError(new Error(message)),
    }
    handles.push(handle)
    return { close: () => { handle.closed = true } }
  }
  return { handles, opener }
}

type WatchLogSpy = {
  readonly info: Mock<(fields: ShellLogFields) => void>
  readonly warn: Mock<(fields: ShellLogFields) => void>
}

function makeLogSpy(): WatchLogSpy {
  return { info: vi.fn<(fields: ShellLogFields) => void>(), warn: vi.fn<(fields: ShellLogFields) => void>() }
}

interface Harness {
  readonly db: RepoDb
  readonly watcher: WorkbenchWatcher
  readonly target: ScanTarget
  readonly scanSpy: Mock<(db: RepoDb, target: ScanTarget) => ScanOutcome>
  readonly batches: (readonly WorkbenchEvent[])[]
  readonly log: WatchLogSpy
  readonly handles: FakeHandle[]
  readonly mode: WatchMode
  readonly signatureQueue: string[]
  readonly treeSignature: Mock<() => string>
}

async function makeHarness(options: { mode?: Partial<WatchMode>; signatureQueue?: string[] } = {}): Promise<Harness> {
  const db = await makeDb()
  const codeRoot = makeScratch()
  writeForgeFeature(codeRoot)
  const project = registerProject(db, { codeRoot, docLocationType: 'in_repo' })
  const mode: WatchMode = { failRecursive: false, failTree: false, ...options.mode }
  const { handles, opener } = makeFakeWatch(mode)
  const signatureQueue = options.signatureQueue ?? []
  const treeSignature = vi.fn((): string => signatureQueue.shift() ?? 'sig-stable')
  const scanSpy = vi.fn((db: RepoDb, target: ScanTarget): ScanOutcome => scanForgeFiles(db, target))
  const batches: (readonly WorkbenchEvent[])[] = []
  const log = makeLogSpy()
  const watcher = createWorkbenchWatcher(db, {
    scan: scanSpy,
    onEvents: batch => batches.push(batch),
    // treeSignature injected only when a controlled sequence is requested —
    // otherwise the production default (real mtime-tree walker) runs.
    tier: {
      openWatch: opener,
      pollIntervalMs: 2000,
      ...(signatureQueue.length > 0 ? { treeSignature } : {}),
    },
    log,
  })
  watchers.push(watcher)
  return {
    db,
    watcher,
    target: { id: project.id, codeRoot: project.codeRoot, docLocationPath: null },
    scanSpy,
    batches,
    log,
    handles,
    mode,
    signatureQueue,
    treeSignature,
  }
}

function liveHandles(harness: Harness): FakeHandle[] {
  return harness.handles.filter(handle => !handle.closed)
}

/** Advance the fake clock exactly `ms`(no slice). */
async function advanceThroughScan(harness: Harness, ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
}

/**
 * Advance `ms`, then one more ms so the macrotask slice in runScan
 * (setImmediate-boundary scanning) lands inside the same await — vitest fake
 * clocks only fire mid-window-scheduled immediates once the clock moves past
 * them. Perception budget stays 400ms debounce + one event-loop slice.
 */
async function advanceAndSlice(harness: Harness, ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
  await vi.advanceTimersByTimeAsync(1)
}

// ---------------------------------------------------------------------------
// Group 1: trigger(触发)—— change → 400ms debounce → scan → persist
// ---------------------------------------------------------------------------

describe('workbench watcher: trigger', () => {
  it('recursive watch fires → scan exactly at the 400ms debounce deadline → snapshot persisted', async () => {
    const harness = await makeHarness()
    harness.watcher.rebuild(harness.target)

    // Both Interface-3 roots watched recursively in one tier.
    expect(harness.watcher.strategy).toBe('recursive')
    expect(liveHandles(harness).length).toBe(2)
    expect(liveHandles(harness).every(handle => handle.recursive)).toBe(true)

    liveHandles(harness)[0]!.fire()
    await advanceThroughScan(harness, 399)
    expect(harness.scanSpy).not.toHaveBeenCalled()

    await advanceAndSlice(harness, 1) // t = 400: debounce fires; +1ms lets the macrotask slice land
    expect(harness.scanSpy).toHaveBeenCalledTimes(1)
    const rows = listTaskSnapshots(harness.db, harness.target.id)
    expect(rows.length).toBe(1)
    expect(rows[0]).toMatchObject({ taskKey: 'demo/1.1', featureSlug: 'demo', status: 'pending' })
  })

  it('real fs.watch end to end: file change → incremental scan → snapshot + batched events (perception path)', async () => {
    vi.useRealTimers()
    const db = await makeDb()
    const codeRoot = makeScratch()
    writeForgeFeature(codeRoot)
    const project = registerProject(db, { codeRoot, docLocationType: 'in_repo' })
    const scanSpy = vi.fn((db: RepoDb, target: ScanTarget): ScanOutcome => scanForgeFiles(db, target))
    const batches: (readonly WorkbenchEvent[])[] = []
    const watcher = createWorkbenchWatcher(db, { scan: scanSpy, onEvents: batch => batches.push(batch) })
    watchers.push(watcher)
    watcher.rebuild({ id: project.id, codeRoot: project.codeRoot, docLocationPath: null })
    expect(watcher.strategy).not.toBeNull()

    writeTaskIndex(codeRoot, 'completed')

    const deadline = Date.now() + 6000
    while (listTaskSnapshots(db, project.id).every(row => row.status !== 'completed')) {
      if (Date.now() > deadline) throw new Error('perception scan did not land within 6s (real fs.watch)')
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    while (batches.length === 0) {
      if (Date.now() > deadline + 2000) throw new Error('event batch was not flushed within budget')
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    expect(scanSpy.mock.calls.length).toBeGreaterThanOrEqual(1)
    const taskEvents = batches.flat().filter((event): event is Extract<WorkbenchEvent, { type: 'task_updated' }> => event.type === 'task_updated')
    expect(taskEvents.length).toBeGreaterThanOrEqual(1)
    expect(taskEvents.every(event => event.projectId === project.id && event.taskKey === 'demo/1.1')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Group 2: merge(合并)—— debounce 尾沿合并 + 事件批推 ≤500ms
// ---------------------------------------------------------------------------

describe('workbench watcher: merge', () => {
  it('consecutive writes inside the window collapse into a single scan round', async () => {
    const harness = await makeHarness()
    harness.watcher.rebuild(harness.target)

    liveHandles(harness)[0]!.fire() // t = 0
    await advanceThroughScan(harness, 150)
    liveHandles(harness)[0]!.fire() // t = 150 (re-arms the trailing edge)
    await advanceThroughScan(harness, 150)
    liveHandles(harness)[0]!.fire() // t = 300 (re-arms again → due at 700)
    await advanceThroughScan(harness, 399) // t = 699
    expect(harness.scanSpy).not.toHaveBeenCalled()
    await advanceAndSlice(harness, 1) // t = 700: single merged scan round
    expect(harness.scanSpy).toHaveBeenCalledTimes(1)
  })

  it('event batcher: ≤500ms window merges same-key events to the final form, keeping first-seen order', async () => {
    const delivered: (readonly WorkbenchEvent[])[] = []
    const batcher = createEventBatcher(batch => delivered.push(batch))
    const scan1: WorkbenchEvent[] = [
      { type: 'task_updated', projectId: 'p1', taskKey: 'demo/1.1', source: 'terminal', changeKind: 'attribute' },
      { type: 'sync', projectId: 'p1', sync: { state: 'idle', lastScanAt: 't1' } },
    ]
    const scan2: WorkbenchEvent[] = [
      { type: 'task_updated', projectId: 'p1', taskKey: 'demo/1.1', source: 'session', changeKind: 'structural' },
      { type: 'feature_updated', projectId: 'p1', featureSlug: 'demo' },
      { type: 'sync', projectId: 'p1', sync: { state: 'idle', lastScanAt: 't2' } },
    ]
    batcher.push(scan1) // window opens at t = 0
    await vi.advanceTimersByTimeAsync(100)
    batcher.push(scan2) // same window (push at t=100 does not re-arm)
    expect(batcher.pendingCount).toBe(3)

    await vi.advanceTimersByTimeAsync(399) // t = 499
    expect(delivered.length).toBe(0)
    await vi.advanceTimersByTimeAsync(1) // t = 500: window closes
    expect(batcher.pendingCount).toBe(0)
    expect(delivered.length).toBe(1)
    expect(delivered[0]).toEqual([
      { type: 'task_updated', projectId: 'p1', taskKey: 'demo/1.1', source: 'session', changeKind: 'structural' },
      { type: 'sync', projectId: 'p1', sync: { state: 'idle', lastScanAt: 't2' } },
      { type: 'feature_updated', projectId: 'p1', featureSlug: 'demo' },
    ])
  })

  it('batcher flush delivers immediately; dispose drops pending events', async () => {
    const delivered: (readonly WorkbenchEvent[])[] = []
    const batcher = createEventBatcher(batch => delivered.push(batch))

    batcher.push([{ type: 'feature_updated', projectId: 'p1', featureSlug: 'demo' }])
    batcher.flush() // stop()/收尾通道:不等窗口
    expect(delivered.length).toBe(1)
    expect(batcher.pendingCount).toBe(0)

    batcher.push([{ type: 'sync', projectId: 'p1', sync: { state: 'idle', lastScanAt: null } }])
    batcher.dispose()
    await vi.advanceTimersByTimeAsync(600)
    expect(delivered.length).toBe(1) // disposed batch never fires
    expect(batcher.pendingCount).toBe(0)
  })

  it('two scan rounds inside one batch window deliver a single batch consistent with the final snapshot', async () => {
    const harness = await makeHarness()
    harness.watcher.rebuild(harness.target)
    const handle = liveHandles(harness)[0]!

    handle.fire() // t = 0 → scan due 400
    await advanceAndSlice(harness, 400) // t = 401: scan 1 landed (pending)
    expect(listTaskSnapshots(harness.db, harness.target.id)[0]).toMatchObject({ status: 'pending' })

    writeTaskIndex(harness.target.codeRoot, 'completed')
    handle.fire() // t = 401 → scan due 801 (batch window closes at 901)
    await advanceAndSlice(harness, 400) // t = 802: scan 2
    await advanceThroughScan(harness, 98) // t = 900: window still open
    expect(harness.batches.length).toBe(0)
    await advanceAndSlice(harness, 1) // t = 901: batch flush
    expect(harness.scanSpy).toHaveBeenCalledTimes(2)
    expect(harness.batches.length).toBe(1)

    const batch = harness.batches[0]!
    const taskEvents = batch.filter((event): event is Extract<WorkbenchEvent, { type: 'task_updated' }> => event.type === 'task_updated')
    expect(taskEvents.length).toBe(1) // coalesced — no attribute→structural double flicker
    const rows = listTaskSnapshots(harness.db, harness.target.id)
    expect(rows[0]).toMatchObject({ taskKey: taskEvents[0]!.taskKey, status: 'completed' })
    const syncEvents = batch.filter(event => event.type === 'sync')
    expect(syncEvents.length).toBe(1) // terminal sync state only
  })
})

// ---------------------------------------------------------------------------
// Group 3: degrade(降级)—— recursive → tree → 2s polling
// ---------------------------------------------------------------------------

describe('workbench watcher: degrade', () => {
  it('recursive unavailable at runtime probe → directory-tree watch (non-recursive per dir), upper flow unchanged', async () => {
    const harness = await makeHarness({ mode: { failRecursive: true } })
    harness.watcher.rebuild(harness.target)

    expect(harness.watcher.strategy).toBe('tree')
    const handles = liveHandles(harness)
    expect(handles.length).toBe(5) // .forge + docs/features + demo + tasks + records
    expect(handles.every(handle => !handle.recursive)).toBe(true)

    handles[0]!.fire()
    await advanceAndSlice(harness, 400)
    expect(harness.scanSpy).toHaveBeenCalledTimes(1)
    expect(listTaskSnapshots(harness.db, harness.target.id).length).toBe(1)
  })

  it('both watch tiers unavailable → 2s polling (fake clock): signature change triggers the same scan flow', async () => {
    const harness = await makeHarness({ mode: { failRecursive: true, failTree: true }, signatureQueue: ['sig-a', 'sig-b'] })
    harness.watcher.rebuild(harness.target)

    expect(harness.watcher.strategy).toBe('polling')
    expect(liveHandles(harness).length).toBe(0)

    await advanceThroughScan(harness, 2000) // tick 1: baseline signature recorded
    expect(harness.treeSignature).toHaveBeenCalledTimes(1)
    expect(harness.scanSpy).not.toHaveBeenCalled()

    await advanceThroughScan(harness, 2000) // tick 2: signature differs → change (failed probes keep the interval alive)
    expect(harness.treeSignature).toHaveBeenCalledTimes(2)
    await advanceThroughScan(harness, 399) // debounce not yet due
    expect(harness.scanSpy).not.toHaveBeenCalled()
    await advanceAndSlice(harness, 1) // t = 4400: scan lands
    expect(harness.scanSpy).toHaveBeenCalledTimes(1)
    expect(listTaskSnapshots(harness.db, harness.target.id).length).toBe(1)
  })

  it('polling with the default mtime-tree signature detects a real file change on disk', async () => {
    // No signatureQueue injection → default real-fs walker (defaultTreeSignature).
    const harness = await makeHarness({ mode: { failRecursive: true, failTree: true } })
    harness.watcher.rebuild(harness.target)
    expect(harness.watcher.strategy).toBe('polling')

    await advanceThroughScan(harness, 2000) // baseline over the real tree
    writeTaskIndex(harness.target.codeRoot, 'completed') // real change under the roots
    await advanceThroughScan(harness, 2000) // real signature differs → change
    await advanceAndSlice(harness, 400)
    expect(harness.scanSpy).toHaveBeenCalledTimes(1)
    expect(listTaskSnapshots(harness.db, harness.target.id)[0]).toMatchObject({ taskKey: 'demo/1.1', status: 'completed' })
  })

  it('tree tier picks up new directories on rename events and prunes removed ones', async () => {
    const harness = await makeHarness({ mode: { failRecursive: true } })
    harness.watcher.rebuild(harness.target)
    expect(harness.watcher.strategy).toBe('tree')
    const before = liveHandles(harness).length
    const featuresHandle = liveHandles(harness).find(handle => handle.dir === join(harness.target.codeRoot, 'docs', 'features'))!

    mkdirSync(join(harness.target.codeRoot, 'docs', 'features', 'beta', 'tasks'), { recursive: true })
    featuresHandle.fire('rename')
    expect(liveHandles(harness).length).toBe(before + 2) // beta + beta/tasks now watched

    rmSync(join(harness.target.codeRoot, 'docs', 'features', 'beta'), { recursive: true, force: true })
    featuresHandle.fire('rename')
    expect(liveHandles(harness).length).toBe(before) // pruned — no leaked handles

    liveHandles(harness)[0]!.fire()
    await advanceAndSlice(harness, 400)
    expect(harness.scanSpy).toHaveBeenCalledTimes(1)
  })

  it('current strategy is observable via structured log across the chain', async () => {
    const harness = await makeHarness({ mode: { failRecursive: true, failTree: true } })
    harness.watcher.rebuild(harness.target)
    const strategies = harness.log.info.mock.calls.map(call => (call[0] as { data?: { strategy?: string } }).data?.strategy)
    expect(strategies).toContain('polling')
    const codes = harness.log.info.mock.calls.map(call => (call[0] as { code: string }).code)
    expect(codes.every(code => code === 'WORKBENCH_WATCH')).toBe(true)
  })

  it('runtime watch error (dir deleted / permission) degrades one level without crashing', async () => {
    const harness = await makeHarness()
    harness.watcher.rebuild(harness.target)
    expect(harness.watcher.strategy).toBe('recursive')

    liveHandles(harness)[0]!.fail('EPERM: watch root vanished')
    expect(harness.watcher.strategy).toBe('tree') // one level down, chain intact
    expect(liveHandles(harness).length).toBe(5)

    liveHandles(harness)[0]!.fire() // upper flow still works on the degraded tier
    await advanceAndSlice(harness, 400)
    expect(harness.scanSpy).toHaveBeenCalledTimes(1)
    expect(harness.log.warn.mock.calls.length).toBe(0) // degradation is a strategy log, not an error crash
  })

  it('tree-tier runtime error degrades to polling, then the next tick climbs back up and perceives again', async () => {
    const harness = await makeHarness()
    harness.watcher.rebuild(harness.target)
    expect(harness.watcher.strategy).toBe('recursive')

    liveHandles(harness)[0]!.fail('ERR_STREAM_WATCH: watcher overload')
    expect(harness.watcher.strategy).toBe('tree')

    for (const handle of [...liveHandles(harness)]) handle.fail('ENOENT: directory removed')
    expect(harness.watcher.strategy).toBe('polling')

    await advanceThroughScan(harness, 2000) // poll tick: upgrade probe succeeds (roots healthy again)
    expect(harness.watcher.strategy).toBe('recursive')
    expect(liveHandles(harness).every(handle => handle.recursive)).toBe(true)

    liveHandles(harness)[0]!.fire()
    await advanceAndSlice(harness, 400)
    expect(harness.scanSpy).toHaveBeenCalledTimes(1)
    expect(listTaskSnapshots(harness.db, harness.target.id).length).toBe(1)
  })

  it('scan failure is contained: logged, no crash, later scans still run', async () => {
    const harness = await makeHarness()
    const { handles: localHandles, opener } = makeFakeWatch(harness.mode)
    let calls = 0
    const flaky = vi.fn((db: RepoDb, target: ScanTarget): ScanOutcome => {
      calls += 1
      if (calls === 1) throw new Error('ERR_WORKBENCH_DB: scan exploded')
      return scanForgeFiles(db, target)
    })
    const watcher = createWorkbenchWatcher(harness.db, {
      scan: flaky,
      onEvents: batch => harness.batches.push(batch),
      tier: { openWatch: opener },
      log: harness.log,
    })
    watchers.push(watcher)
    watcher.rebuild(harness.target)

    const handle = localHandles[0]!
    handle.fire()
    await advanceAndSlice(harness, 400)
    expect(flaky).toHaveBeenCalledTimes(1)
    expect(harness.log.warn).toHaveBeenCalledTimes(1)
    expect((harness.log.warn.mock.calls[0]![0] as { code: string }).code).toBe('ERR_WORKBENCH_WATCH')

    handle.fire()
    await advanceAndSlice(harness, 400)
    expect(flaky).toHaveBeenCalledTimes(2)
    expect(listTaskSnapshots(harness.db, harness.target.id).length).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Group 4: recover(恢复)+ 激活切换重建
// ---------------------------------------------------------------------------

describe('workbench watcher: recover', () => {
  it('polling tier upgrades back to recursive once the runtime recovers, then event flow resumes', async () => {
    const harness = await makeHarness({ mode: { failRecursive: true, failTree: true }, signatureQueue: ['sig-a'] })
    harness.watcher.rebuild(harness.target)
    expect(harness.watcher.strategy).toBe('polling')

    await advanceThroughScan(harness, 2000) // tick with both tiers failing → stays polling
    expect(harness.watcher.strategy).toBe('polling')

    harness.mode.failRecursive = false // directory restored / overload gone
    harness.mode.failTree = false
    await advanceThroughScan(harness, 2000) // next tick probes upgrade first
    expect(harness.watcher.strategy).toBe('recursive')
    expect(liveHandles(harness).length).toBe(2)
    expect(liveHandles(harness).every(handle => handle.recursive)).toBe(true)

    const signatureCallsBefore = harness.treeSignature.mock.calls.length
    await advanceThroughScan(harness, 2000) // polling interval is gone — no more signature ticks
    expect(harness.treeSignature.mock.calls.length).toBe(signatureCallsBefore)

    liveHandles(harness)[0]!.fire()
    await advanceAndSlice(harness, 400)
    expect(harness.scanSpy).toHaveBeenCalledTimes(1)
    expect(listTaskSnapshots(harness.db, harness.target.id).length).toBe(1)
  })

  it('activation switch rebuilds targets with zero handle leaks; null stops everything', async () => {
    const harness = await makeHarness()
    const db = harness.db
    const otherRoot = makeScratch()
    writeForgeFeature(otherRoot)
    const other = registerProject(db, { codeRoot: otherRoot, docLocationType: 'in_repo' })

    harness.watcher.rebuild(harness.target)
    expect(liveHandles(harness).length).toBe(2)
    const firstBatch = [...harness.handles]

    harness.watcher.rebuild({ id: other.id, codeRoot: other.codeRoot, docLocationPath: null })
    expect(firstBatch.every(handle => handle.closed)).toBe(true) // no leaks on switch
    expect(liveHandles(harness).length).toBe(2)

    const secondBatch = [...harness.handles]
    harness.watcher.rebuild(null)
    expect(secondBatch.every(handle => handle.closed)).toBe(true)
    expect(harness.watcher.strategy).toBeNull()

    for (const handle of secondBatch) handle.fire() // stale watchers must be inert
    await advanceThroughScan(harness, 1000)
    expect(harness.scanSpy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Hard Rules: 仅已注册/已授权路径可 watch
// ---------------------------------------------------------------------------

describe('workbench watcher: authorization hard rules', () => {
  it('refuses to watch a target whose project is not registered', async () => {
    const harness = await makeHarness()
    const rogue: ScanTarget = { id: '00000000-0000-0000-0000-000000000000', codeRoot: harness.target.codeRoot, docLocationPath: null }
    harness.watcher.rebuild(rogue)

    expect(harness.watcher.strategy).toBeNull()
    expect(harness.handles.length).toBe(0)
    expect(harness.log.warn).toHaveBeenCalledTimes(1)
    expect((harness.log.warn.mock.calls[0]![0] as { code: string }).code).toBe('ERR_WORKBENCH_WATCH')
  })

  it('external doc location without explicit authorization is not watched; authorizing opens it', async () => {
    const db = await makeDb()
    const codeRoot = makeScratch()
    mkdirSync(join(codeRoot, '.forge'), { recursive: true })
    const externalDocs = makeScratch()
    writeForgeFeature(externalDocs)
    const project = registerProject(db, { codeRoot, docLocationType: 'external', docLocationPath: externalDocs })

    const mode: WatchMode = { failRecursive: false, failTree: false }
    const { handles, opener } = makeFakeWatch(mode)
    const watcher = createWorkbenchWatcher(db, {
      scan: (db, target) => scanForgeFiles(db, target),
      tier: { openWatch: opener },
      log: makeLogSpy(),
    })
    watchers.push(watcher)
    const target: ScanTarget = { id: project.id, codeRoot: project.codeRoot, docLocationPath: project.docLocationPath }

    watcher.rebuild(target)
    expect(watcher.strategy).toBe('recursive')
    expect(handles.length).toBe(1) // only codeRoot/.forge — external features dir stays unwatched
    expect(handles.every(handle => handle.dir === join(codeRoot, '.forge'))).toBe(true)

    authorizeExternalDocPath(db, externalDocs)
    watcher.rebuild(target)
    expect(watcher.strategy).toBe('recursive')
    expect(handles.filter(handle => !handle.closed).length).toBe(2)
  })

  it('no watchable roots → no watch established, strategy observable as null', async () => {
    const db = await makeDb()
    const codeRoot = makeScratch() // registered but bare: no .forge, no docs/features
    const project = registerProject(db, { codeRoot, docLocationType: 'in_repo' })
    const mode: WatchMode = { failRecursive: false, failTree: false }
    const { handles, opener } = makeFakeWatch(mode)
    const log = makeLogSpy()
    const watcher = createWorkbenchWatcher(db, { tier: { openWatch: opener }, log })
    watchers.push(watcher)

    watcher.rebuild({ id: project.id, codeRoot: project.codeRoot, docLocationPath: null })
    expect(watcher.strategy).toBeNull()
    expect(handles.length).toBe(0)
    expect(log.info).toHaveBeenCalledTimes(1) // observability, not silence
  })
})
