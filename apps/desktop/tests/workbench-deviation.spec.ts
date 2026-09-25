import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { ShellLogFields } from '../src/main/log.ts'
import { openDatabase, type DatabaseSyncLike } from '../src/main/workbench/store/db.ts'
import { registerProject } from '../src/main/workbench/repos/projects.ts'
import { upsertFeatureSnapshot } from '../src/main/workbench/repos/feature-snapshots.ts'
import type { RepoDb } from '../src/main/workbench/repos/types.ts'
import { scanForgeFiles, type ScanOutcome, type ScanTarget } from '../src/main/workbench/indexer/scan.ts'
import type { WorkbenchEvent } from '../src/main/workbench/indexer/diff.ts'
import { createEventBatcher } from '../src/main/workbench/watcher/events.ts'
import { createDeviationHook, type DeviationHook } from '../src/main/workbench/stages/deviation-watcher.ts'
import { createStageWriteService, StageWriteError } from '../src/main/workbench/stages/advance-service.ts'
import { createMigrationService } from '../src/main/workbench/migration/pipeline.ts'
import { createReingestHook } from '../src/main/workbench/migration/reingest-watcher.ts'
import type { WatchOpener } from '../src/main/workbench/watcher/fallback.ts'
import { createWorkbenchWatcher, type WorkbenchWatcher } from '../src/main/workbench/watcher/watch.ts'

// Task 4.2 (M3) — feature-level deviation detection (tech-design §Interface 5
// 偏离 / §Interface 1 deviation_detected { projectId?, featureSlug? }): the
// perception base detects manifest status changes NOT initiated by the kernel
// (external cross-stage operations — terminal CLI / frozen CC plugin) and marks
// feature_snapshot.deviated=1 + last_external_at + emits deviation_detected
// with the featureSlug payload. Presentation only, never a block (PRD Hard
// Rule, G8/Story 4/Story 8); read side follows the manifest (it stays a stage
// fact source); the flag clears on the next kernel-legal advance
// (advanceStage). Project-level deviation (1.5 index.json reproduction) rides
// the same channel with a different payload.
//
// Detection invariant: the kernel's advanceStage writes the manifest and the
// feature_snapshot synchronously (never observable diverged), so
//   live manifest status ≠ pre-scan feature_snapshot.status
// is exactly the set of non-kernel status changes. The hook therefore runs
// BEFORE the scan in the seam wrapper (the scan then follows the manifest).
//
// Matrix: external change / kernel advance / clear (AC-5 vitest matrix).

const FIXED_AT = '2026-09-20T10:00:00.000Z'
const T_DETECT_1 = new Date('2026-09-24T08:00:00.000Z')
const T_DETECT_2 = new Date('2026-09-24T09:30:00.000Z')
const SLUG = 'alpha'
const OTHER_SLUG = 'beta'

const scratches: string[] = []
const openDbs: DatabaseSyncLike[] = []
const watchers: WorkbenchWatcher[] = []

function makeScratch(): string {
  const dir = join(tmpdir(), `dsh-forge-deviation-${String(process.pid)}-${String(scratches.length)}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  scratches.push(dir)
  return dir
}

afterEach(() => {
  for (const watcher of watchers.splice(0)) watcher.stop()
  for (const db of openDbs.splice(0)) db.close()
  for (const dir of scratches.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 10 })
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Minimal forge dialect tree + harness
// ---------------------------------------------------------------------------

function writeManifestOf(featuresRoot: string, slug: string, status: string, body = 'Body stays.'): void {
  writeFileSync(
    join(featuresRoot, slug, 'manifest.md'),
    `---\nfeature: "${slug}"\nstatus: ${status}\ncreated: "2026-09-18"\n---\n\n# ${slug}\n\n${body}\n`,
    'utf8',
  )
}

function writeTaskIndexOf(featuresRoot: string, slug: string, status = 'pending'): void {
  const tasksDir = join(featuresRoot, slug, 'tasks')
  mkdirSync(tasksDir, { recursive: true })
  writeFileSync(
    join(tasksDir, 'index.json'),
    `${JSON.stringify({
      tasks: {
        '1.1-task': { id: '1.1', title: 'One', priority: 'P0', status, file: '1.1-task.md', record: 'records/1.1-task.md' },
      },
    }, null, 2)}\n`,
    'utf8',
  )
}

type LogSpy = {
  readonly info: Mock<(fields: ShellLogFields) => void>
  readonly warn: Mock<(fields: ShellLogFields) => void>
}

interface SnapshotProbe {
  readonly deviated: number
  readonly lastExternalAt: string | null
  readonly status: string
}

interface Harness {
  readonly db: DatabaseSyncLike
  readonly projectId: string
  readonly root: string
  readonly featuresRoot: string
  readonly target: ScanTarget
  readonly hook: DeviationHook
  readonly log: LogSpy
  /** Advance the injected clock to the second fixed stamp (T_DETECT_2). */
  readonly advanceClock: () => void
  /** Perception-round simulation in the services seam order: deviation pre-check → M2 scan (events merged). */
  readonly scan: () => WorkbenchEvent[]
  readonly writeManifest: (status: string, body?: string) => void
  readonly snapshotRow: (slug: string) => SnapshotProbe
}

async function withHarness(run: (harness: Harness) => void | Promise<void>): Promise<void> {
  const root = makeScratch()
  const userData = join(root, 'user')
  mkdirSync(userData, { recursive: true })
  const { db } = await openDatabase(userData)
  openDbs.push(db)
  const projectId = 'p-1'
  db.prepare(
    `INSERT INTO projects (id, display_name, code_root, doc_location_type, doc_location_path, created_at)
     VALUES (?, ?, ?, 'external', ?, ?)`,
  ).run(projectId, 'demo', join(root, 'code'), root, FIXED_AT)

  const featuresRoot = join(root, 'docs', 'features')
  mkdirSync(join(featuresRoot, SLUG), { recursive: true })
  writeManifestOf(featuresRoot, SLUG, 'prd')
  writeTaskIndexOf(featuresRoot, SLUG)

  const target: ScanTarget = { id: projectId, codeRoot: join(root, 'code'), docLocationPath: root }
  scanForgeFiles(db as RepoDb, target) // initial ingestion: feature_snapshot rows become kernel-known

  const log: LogSpy = { info: vi.fn(), warn: vi.fn() }
  let tick = 0
  const hook = createDeviationHook({
    db: db as RepoDb,
    now: () => (tick === 0 ? T_DETECT_1 : T_DETECT_2),
    log,
  })

  try {
    await run({
      db,
      projectId,
      root,
      featuresRoot,
      target,
      hook,
      log,
      advanceClock: () => {
        tick = 1
      },
      scan: () => {
        const deviationEvents = hook.beforeScan(target)
        const outcome = scanForgeFiles(db as RepoDb, target)
        return [...outcome.events, ...deviationEvents]
      },
      writeManifest: (status, body) => writeManifestOf(featuresRoot, SLUG, status, body),
      snapshotRow: (slug) => {
        const row = db
          .prepare('SELECT deviated, last_external_at, status FROM feature_snapshot WHERE project_id = ? AND feature_slug = ?')
          .get(projectId, slug) as { readonly deviated: number; readonly last_external_at: string | null; readonly status: string }
        return { deviated: row.deviated, lastExternalAt: row.last_external_at, status: row.status }
      },
    })
  } finally {
    db.close()
    const idx = openDbs.indexOf(db)
    if (idx >= 0) openDbs.splice(idx, 1)
  }
}

function deviationsOf(events: readonly WorkbenchEvent[]): Array<Extract<WorkbenchEvent, { type: 'deviation_detected' }>> {
  return events.filter((event): event is Extract<WorkbenchEvent, { type: 'deviation_detected' }> => event.type === 'deviation_detected')
}

function stageServiceOf(harness: Harness): ReturnType<typeof createStageWriteService> {
  return createStageWriteService({
    db: harness.db as RepoDb,
    resolveFeaturesRoot: () => harness.featuresRoot,
    onEvent: () => {},
  })
}

// ---------------------------------------------------------------------------
// AC-1 — external manifest status change → deviated=1 + last_external_at + event
// ---------------------------------------------------------------------------

describe('workbench deviation — external manifest status change (AC-1)', () => {
  it('external cross-stage change → deviated=1 + last_external_at + deviation_detected{featureSlug}; the scan then follows the manifest', async () => {
    await withHarness((harness) => {
      const before = harness.snapshotRow(SLUG)
      expect(before.deviated).toBe(0)
      expect(before.status).toBe('prd')

      harness.writeManifest('design') // external session advances the stage
      const events = harness.scan()

      expect(deviationsOf(events)).toEqual([{ type: 'deviation_detected', projectId: harness.projectId, featureSlug: SLUG }])
      const row = harness.snapshotRow(SLUG)
      expect(row.deviated).toBe(1)
      expect(row.lastExternalAt).toBe(T_DETECT_1.toISOString())
      // 读侧跟随:manifest 仍为 feature 阶段事实源之一 —— 快照收敛到外部状态。
      expect(row.status).toBe('design')
    })
  })

  it('repeat scan after the follow → no repeat event, deviation flag persists', async () => {
    await withHarness((harness) => {
      harness.writeManifest('design')
      harness.scan()

      const again = harness.scan()
      expect(deviationsOf(again)).toEqual([])
      expect(harness.snapshotRow(SLUG).deviated).toBe(1) // 呈现持续,直到内核合法推进清除
    })
  })

  it('a second external change after the follow → event again + last_external_at refreshed', async () => {
    await withHarness((harness) => {
      harness.writeManifest('design')
      harness.scan()
      harness.advanceClock()

      harness.writeManifest('tasks')
      const events = harness.scan()

      expect(deviationsOf(events)).toEqual([{ type: 'deviation_detected', projectId: harness.projectId, featureSlug: SLUG }])
      expect(harness.snapshotRow(SLUG).lastExternalAt).toBe(T_DETECT_2.toISOString())
      expect(harness.snapshotRow(SLUG).status).toBe('tasks')
    })
  })

  it('externally-created feature (no kernel-known snapshot row) → M2 structural-new path, no deviation', async () => {
    await withHarness((harness) => {
      mkdirSync(join(harness.featuresRoot, OTHER_SLUG), { recursive: true })
      writeManifestOf(harness.featuresRoot, OTHER_SLUG, 'design')
      writeTaskIndexOf(harness.featuresRoot, OTHER_SLUG)

      const events = harness.scan()

      expect(deviationsOf(events)).toEqual([])
      expect(harness.snapshotRow(OTHER_SLUG).deviated).toBe(0)
      expect(harness.snapshotRow(OTHER_SLUG).status).toBe('design')
    })
  })

  it('manifest rewrite with the SAME status → no deviation (only a status change is a signal)', async () => {
    await withHarness((harness) => {
      harness.writeManifest('prd', 'External session rewrote the body only.')
      const events = harness.scan()

      expect(deviationsOf(events)).toEqual([])
      expect(harness.snapshotRow(SLUG).deviated).toBe(0)
    })
  })

  it('backward external change (tasks → prd) → detected', async () => {
    await withHarness((harness) => {
      harness.writeManifest('tasks')
      harness.scan()

      harness.writeManifest('prd')
      const events = harness.scan()

      expect(deviationsOf(events)).toEqual([{ type: 'deviation_detected', projectId: harness.projectId, featureSlug: SLUG }])
      expect(harness.snapshotRow(SLUG).status).toBe('prd')
    })
  })
})

// ---------------------------------------------------------------------------
// AC-2 — kernel-legal advance never deviates + clears the flag
// ---------------------------------------------------------------------------

describe('workbench deviation — kernel advance + clear matrix (AC-2)', () => {
  it('kernel advanceStage (gate satisfied) → zero deviation events across the following scan round; deviated stays 0', async () => {
    await withHarness((harness) => {
      const service = stageServiceOf(harness)
      service.stageSummarize({ projectId: harness.projectId, featureSlug: SLUG, stage: 'prd', goal: 'Ship the spec', summary: 'Spec shipped.' })
      const summary = service.advanceStage(harness.projectId, SLUG)

      expect(summary.status).toBe('design')
      const events = harness.scan()
      expect(deviationsOf(events)).toEqual([])
      expect(harness.snapshotRow(SLUG).deviated).toBe(0)
      expect(harness.snapshotRow(SLUG).status).toBe('design')
    })
  })

  it('deviated=1 → next kernel-legal advanceStage clears the flag; last_external_at preserved as audit', async () => {
    await withHarness((harness) => {
      harness.writeManifest('design') // external advance detected…
      harness.scan()
      expect(harness.snapshotRow(SLUG).deviated).toBe(1)

      // …then the kernel legally advances from the followed stage
      const service = stageServiceOf(harness)
      service.stageSummarize({ projectId: harness.projectId, featureSlug: SLUG, stage: 'design', goal: 'Design done', summary: 'Design summary.' })
      service.advanceStage(harness.projectId, SLUG)

      const row = harness.snapshotRow(SLUG)
      expect(row.deviated).toBe(0)
      expect(row.lastExternalAt).toBe(T_DETECT_1.toISOString()) // 审计痕迹保留
      expect(row.status).toBe('tasks')

      const events = harness.scan()
      expect(deviationsOf(events)).toEqual([])
    })
  })

  it('gate-rejected advanceStage → deviation untouched (not a legal advance)', async () => {
    await withHarness((harness) => {
      harness.writeManifest('design')
      harness.scan()
      expect(harness.snapshotRow(SLUG).deviated).toBe(1)

      const service = stageServiceOf(harness)
      expect(() => service.advanceStage(harness.projectId, SLUG)).toThrow(StageWriteError)
      expect(harness.snapshotRow(SLUG).deviated).toBe(1)
      expect(harness.snapshotRow(SLUG).lastExternalAt).toBe(T_DETECT_1.toISOString())
    })
  })

  it('terminal completed idempotent no-op re-advance → no clear (not a legal advance)', async () => {
    await withHarness((harness) => {
      // Seed the kernel-known terminal state directly, then deviate the flag.
      upsertFeatureSnapshot(harness.db as RepoDb, {
        projectId: harness.projectId,
        featureSlug: SLUG,
        status: 'completed',
        docKinds: [],
        updatedAt: FIXED_AT,
      })
      harness.writeManifest('completed')
      harness.db
        .prepare('UPDATE feature_snapshot SET deviated = 1, last_external_at = ? WHERE project_id = ? AND feature_slug = ?')
        .run(T_DETECT_1.toISOString(), harness.projectId, SLUG)

      const service = stageServiceOf(harness)
      const summary = service.advanceStage(harness.projectId, SLUG)

      expect(summary.status).toBe('completed')
      expect(harness.snapshotRow(SLUG).deviated).toBe(1) // 终态 no-op 不清除
    })
  })
})

// ---------------------------------------------------------------------------
// AC-3 — presentation only: never blocks, never throws, log-only failures
// ---------------------------------------------------------------------------

describe('workbench deviation — presentation only, no block (AC-3)', () => {
  it('features root missing → no event, no throw', async () => {
    await withHarness((harness) => {
      rmSync(harness.featuresRoot, { recursive: true, force: true })
      expect(() => harness.hook.beforeScan(harness.target)).not.toThrow()
      expect(harness.hook.beforeScan(harness.target)).toEqual([])
    })
  })

  it('features root unreadable → warn log only (perception-face discipline), no throw', async () => {
    await withHarness((harness) => {
      rmSync(harness.featuresRoot, { recursive: true, force: true })
      writeFileSync(harness.featuresRoot, 'not a directory', 'utf8') // readdirSync fails

      expect(() => harness.hook.beforeScan(harness.target)).not.toThrow()
      expect(harness.log.warn).toHaveBeenCalledTimes(1)
      expect((harness.log.warn.mock.calls[0]![0] as ShellLogFields).code).toBe('ERR_WORKBENCH_DEVIATION')
    })
  })

  it('manifest unreadable / status outside vocabulary → skipped silently, no event, no throw', async () => {
    await withHarness((harness) => {
      writeFileSync(join(harness.featuresRoot, SLUG, 'manifest.md'), 'not yaml at all', 'utf8')
      expect(() => harness.hook.beforeScan(harness.target)).not.toThrow()
      expect(harness.hook.beforeScan(harness.target)).toEqual([])

      harness.writeManifest('bogus-stage')
      expect(harness.hook.beforeScan(harness.target)).toEqual([])
      expect(harness.snapshotRow(SLUG).deviated).toBe(0)
    })
  })

  it('detection round leaves the manifest bytes + mtime untouched (zero fs writes — the external session is never touched)', async () => {
    await withHarness((harness) => {
      harness.writeManifest('design')
      const path = join(harness.featuresRoot, SLUG, 'manifest.md')
      const before = { content: readFileSync(path, 'utf8'), mtimeMs: statSync(path).mtimeMs }

      harness.hook.beforeScan(harness.target)

      expect(readFileSync(path, 'utf8')).toBe(before.content)
      expect(statSync(path).mtimeMs).toBe(before.mtimeMs)
      expect(harness.snapshotRow(SLUG).deviated).toBe(1)
    })
  })
})

// ---------------------------------------------------------------------------
// AC-4 — same channel, different payloads (project 1.5 vs feature 4.2); ≤5s
// ---------------------------------------------------------------------------

describe('workbench deviation — same channel, distinct payloads + reflux budget (AC-4)', () => {
  it('migrated project: external index.json AND external manifest change in one round → both deviation shapes in one event batch', async () => {
    const root = makeScratch()
    const userData = join(root, 'user-data')
    mkdirSync(userData, { recursive: true })
    const codeRoot = join(root, 'repo')
    const featuresRoot = join(codeRoot, 'docs', 'features')
    mkdirSync(join(featuresRoot, SLUG), { recursive: true })
    writeManifestOf(featuresRoot, SLUG, 'prd')
    writeTaskIndexOf(featuresRoot, SLUG)

    const { db } = await openDatabase(userData)
    openDbs.push(db)
    const project = registerProject(db as RepoDb, { codeRoot, docLocationType: 'in_repo' })
    const target: ScanTarget = { id: project.id, codeRoot, docLocationPath: null }
    scanForgeFiles(db as RepoDb, target)

    const migration = createMigrationService({
      db: db as RepoDb,
      userDataPath: userData,
      loadProject: id => (id === project.id ? project : null),
      onEvent: () => {},
    })
    await migration.startMigration(project.id)

    // Two external writes in one window: task status (index.json reproduction)
    // and a cross-stage manifest flip.
    writeTaskIndexOf(featuresRoot, SLUG, 'completed')
    writeManifestOf(featuresRoot, SLUG, 'design')

    const deviation = createDeviationHook({ db: db as RepoDb, now: () => T_DETECT_1 })
    const reingest = createReingestHook({ db: db as RepoDb, now: () => T_DETECT_1 })
    // services.ts seam order (defaultPerception): pre-check → scan → reingest.
    const deviationEvents = deviation.beforeScan(target)
    const outcome: ScanOutcome = scanForgeFiles(db as RepoDb, target)
    const reingestEvents = reingest.afterScan(target)
    const merged = [...outcome.events, ...deviationEvents, ...reingestEvents]

    const found = deviationsOf(merged)
    expect(found).toHaveLength(2)
    // Project level (1.5): no featureSlug key at all.
    expect(found).toContainEqual({ type: 'deviation_detected', projectId: project.id })
    // Feature level (4.2): featureSlug payload.
    expect(found).toContainEqual({ type: 'deviation_detected', projectId: project.id, featureSlug: SLUG })
    expect(found.every(event => 'featureSlug' in event === (event.featureSlug !== undefined))).toBe(true)
    const projectDeviated = (db.prepare('SELECT deviated FROM projects WHERE id = ?').get(project.id) as { deviated: number }).deviated
    expect(projectDeviated).toBe(1)
    expect(
      (db.prepare('SELECT deviated FROM feature_snapshot WHERE project_id = ? AND feature_slug = ?').get(project.id, SLUG) as { deviated: number }).deviated,
    ).toBe(1)
  })

  it('event batcher keeps project-level and per-feature deviation events distinct inside one 500ms window', () => {
    const batches: (readonly WorkbenchEvent[])[] = []
    const batcher = createEventBatcher(batch => batches.push(batch), { batchWindowMs: 500 })
    batcher.push([
      { type: 'deviation_detected', projectId: 'p-1' },
      { type: 'deviation_detected', projectId: 'p-1', featureSlug: SLUG },
      { type: 'deviation_detected', projectId: 'p-1', featureSlug: OTHER_SLUG },
    ])
    expect(batcher.pendingCount).toBe(3)
    batcher.flush()
    expect(batches[0]).toHaveLength(3)
  })

  it('real watcher pathway: manifest change → deviation_detected delivered within the 400ms debounce + 500ms batch budget (< 5s)', async () => {
    vi.useFakeTimers()
    const root = makeScratch()
    const userData = join(root, 'user')
    mkdirSync(userData, { recursive: true })
    const { db } = await openDatabase(userData)
    openDbs.push(db)
    const codeRoot = join(root, 'repo')
    const featuresRoot = join(codeRoot, 'docs', 'features')
    mkdirSync(join(featuresRoot, SLUG), { recursive: true })
    writeManifestOf(featuresRoot, SLUG, 'prd')
    writeTaskIndexOf(featuresRoot, SLUG)
    const project = registerProject(db as RepoDb, { codeRoot, docLocationType: 'in_repo' })
    const target: ScanTarget = { id: project.id, codeRoot, docLocationPath: null }
    scanForgeFiles(db as RepoDb, target)

    const deviation = createDeviationHook({ db: db as RepoDb, now: () => T_DETECT_1 })
    const scanWithDeviation = (scanTarget: ScanTarget): ScanOutcome => {
      const deviationEvents = deviation.beforeScan(scanTarget)
      const outcome = scanForgeFiles(db as RepoDb, scanTarget)
      return deviationEvents.length > 0 ? { ...outcome, events: [...outcome.events, ...deviationEvents] } : outcome
    }

    const handles: Array<{ fire: () => void; closed: boolean }> = []
    const opener: WatchOpener = (_dir, options, listener) => {
      const handle = {
        fire: () => listener('change', 'manifest.md'),
        closed: false,
      }
      handles.push(handle)
      return { close: () => { handle.closed = true } }
    }
    const batches: (readonly WorkbenchEvent[])[] = []
    const watcher = createWorkbenchWatcher(db as RepoDb, {
      scan: (_db, scanTarget) => scanWithDeviation(scanTarget),
      onEvents: batch => batches.push(batch),
      tier: { openWatch: opener },
    })
    watchers.push(watcher)
    watcher.rebuild(target)

    writeManifestOf(featuresRoot, SLUG, 'design') // external cross-stage write
    handles[0]!.fire() // fs event lands

    await vi.advanceTimersByTimeAsync(400) // debounce deadline → scan runs
    await vi.advanceTimersByTimeAsync(1) // macrotask slice (runScan discipline)
    await vi.advanceTimersByTimeAsync(500) // batch window closes → delivery
    watcher.stop()

    // 901ms total ≪ 5s reflux budget (PRD DF004/性能要求).
    const delivered = batches.flat().filter(event => event.type === 'deviation_detected')
    expect(delivered).toEqual([{ type: 'deviation_detected', projectId: project.id, featureSlug: SLUG }])
    expect(
      (db.prepare('SELECT deviated FROM feature_snapshot WHERE project_id = ? AND feature_slug = ?').get(project.id, SLUG) as { deviated: number }).deviated,
    ).toBe(1)
  })
})
