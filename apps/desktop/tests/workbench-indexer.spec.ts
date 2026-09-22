import { mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase, type DatabaseSyncLike } from '../src/main/workbench/store/db.ts'
import { registerProject } from '../src/main/workbench/repos/projects.ts'
import { endSessionLink, recordSessionLink } from '../src/main/workbench/repos/session-links.ts'
import { rebuildDerivedSnapshots } from '../src/main/workbench/repos/snapshot-rebuild.ts'
import { listFeatureSnapshots } from '../src/main/workbench/repos/feature-snapshots.ts'
import { listTaskSnapshots } from '../src/main/workbench/repos/task-snapshots.ts'
import { getSyncState } from '../src/main/workbench/repos/sync-state.ts'
import type { TaskSnapshot } from '../src/main/workbench/repos/types.ts'
import { parseRecordMarkdown, readTaskIndex } from '../src/main/workbench/indexer/parse-task.ts'
import { scanFeatures } from '../src/main/workbench/indexer/parse-feature.ts'
import { diffTasks, findDanglingBlockers, type IncomingTaskRow, type WorkbenchEvent } from '../src/main/workbench/indexer/diff.ts'
import { determineSource, resolveActorSource } from '../src/main/workbench/indexer/source.ts'
import { makeRescanHook, resolveFeaturesDir, scanForgeFiles, type ScanOutcome } from '../src/main/workbench/indexer/scan.ts'

// Task 2.5 — forge-file indexer over the 2.3 snapshot repos. Design:
// docs/features/dsh-forge-m2/design/tech-design.md §Interface 3 (scan targets,
// source-determination order, attribute/structural diff) + §Interface 1
// (WorkbenchEvent / TaskRecord DTOs) + spike-1-findings §4 (record-file
// dialect, FORGE_ACTOR = optional submit-only slot).
//
// Fixtures are synthetic forge projects written into tmp dirs in this repo's
// pinned dialect (manifest frontmatter / tasks/index.json / write-once record
// .md) — the same pattern 6.1 will reuse for its 500-task generator.
//
// Hard Rules under test: the indexer never writes forge files (all assertions
// below read the DB side only), and parses without inventing fields (branch
// null / worktree false / blockers verbatim / dangling refs preserved).

type TaskEvent = Extract<WorkbenchEvent, { type: 'task_updated' }>

const scratches: string[] = []

function makeScratch(): string {
  const dir = join(tmpdir(), `dsh-forge-workbench-indexer-${String(process.pid)}-${String(scratches.length)}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  scratches.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of scratches.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 10 })
})

async function withDb(run: (db: DatabaseSyncLike) => void | Promise<void>): Promise<void> {
  const { db } = await openDatabase(makeScratch())
  try {
    await run(db)
  } finally {
    db.close()
  }
}

function taskEventsOf(outcome: ScanOutcome): TaskEvent[] {
  return outcome.events.filter((event): event is TaskEvent => event.type === 'task_updated')
}

// ---------------------------------------------------------------------------
// Synthetic forge-project fixture builder (dialect: this repo's live shape)
// ---------------------------------------------------------------------------

/** Deterministic clock: base epoch + day offsets, applied via utimesSync. */
const T0 = Date.UTC(2026, 8, 20, 0, 0, 0)
const DAY = 86_400_000

function touch(path: string, epochMs: number): void {
  const time = new Date(epochMs)
  utimesSync(path, time, time)
}

interface FixtureRecord {
  readonly started?: string
  readonly completed?: string
  readonly actor?: string
  readonly summary?: string
  /** true = write a frontmatter-less corrupt body. */
  readonly corrupt?: boolean
}

interface FixtureTask {
  readonly id: string
  readonly title?: string
  readonly status?: string
  readonly dependencies?: readonly string[]
  readonly type?: string
  readonly record?: FixtureRecord
  /** off-vocab status written raw into index.json (parse-reject case). */
  readonly rawStatus?: string
}

interface FixtureFeature {
  readonly slug: string
  readonly manifestStatus?: string
  /** true = write manifest without a status line. */
  readonly omitManifestStatus?: boolean
  readonly docs?: ReadonlyArray<'prd' | 'design' | 'ui'>
  readonly tasks?: readonly FixtureTask[]
  readonly corruptIndex?: boolean
  /** Extra non-feature directory under docs/features (silently ignored). */
  readonly plainDirs?: readonly string[]
}

const STATUS_ENUM = ['pending', 'in_progress', 'completed', 'blocked', 'suspended', 'skipped', 'rejected']

function stemFor(task: FixtureTask): string {
  const suffix = task.type === 'gate' ? 'gate' : task.type === 'doc.summary' ? 'summary' : 'task'
  return `${task.id}-${suffix}`
}

function buildForgeProject(root: string, features: readonly FixtureFeature[]): { codeRoot: string; featuresDir: string } {
  mkdirSync(join(root, '.forge'), { recursive: true })
  const featuresDir = join(root, 'docs', 'features')
  mkdirSync(featuresDir, { recursive: true })
  for (const dir of features.flatMap(feature => feature.plainDirs ?? [])) {
    mkdirSync(join(featuresDir, dir), { recursive: true })
  }
  let dayOffset = 1
  for (const feature of features) {
    const featureDir = join(featuresDir, feature.slug)
    const tasksDir = join(featureDir, 'tasks')
    mkdirSync(join(tasksDir, 'records'), { recursive: true })
    const manifestLines = ['---', `feature: "${feature.slug}"`, 'created: "2026-09-20"']
    if (!feature.omitManifestStatus) manifestLines.push(`status: ${feature.manifestStatus ?? 'tasks'}`)
    manifestLines.push('---', '', `# Feature: ${feature.slug}`)
    const manifestPath = join(featureDir, 'manifest.md')
    writeFileSync(manifestPath, `${manifestLines.join('\n')}\n`)
    touch(manifestPath, T0)

    for (const anchor of feature.docs ?? []) {
      const anchorPath =
        anchor === 'prd'
          ? join(featureDir, 'prd', 'prd-spec.md')
          : anchor === 'design'
            ? join(featureDir, 'design', 'tech-design.md')
            : join(featureDir, 'ui', 'ui-design.md')
      mkdirSync(join(anchorPath, '..'), { recursive: true })
      writeFileSync(anchorPath, `# ${anchor}\n`)
      touch(anchorPath, T0)
    }

    const tasks: Record<string, Record<string, unknown>> = {}
    for (const task of feature.tasks ?? []) {
      const stem = stemFor(task)
      const entry: Record<string, unknown> = {
        id: task.id,
        title: task.title ?? `Task ${task.id}`,
        priority: 'P0',
        status: task.rawStatus ?? task.status ?? 'pending',
        file: `${stem}.md`,
        record: `records/${stem}.md`,
      }
      if (task.type !== undefined) entry.type = task.type
      if (task.dependencies !== undefined && task.dependencies.length > 0) entry.dependencies = [...task.dependencies]
      tasks[stem] = entry
      const taskPath = join(tasksDir, `${stem}.md`)
      writeFileSync(
        taskPath,
        `---\nid: "${task.id}"\ntitle: "${task.title ?? `Task ${task.id}`}"\npriority: "P0"\n---\n\n# ${task.id}\n\n## Acceptance Criteria\n- [ ] works\n`,
      )
      touch(taskPath, T0 + dayOffset * DAY)
      if (task.record !== undefined) {
        const recordPath = join(tasksDir, 'records', `${stem}.md`)
        if (task.record.corrupt === true) {
          writeFileSync(recordPath, '# Task Record: no frontmatter at all\n\n## Summary\nBroken.\n')
        } else {
          const recordLines = [
            '---',
            'status: "completed"',
            `started: "${task.record.started ?? '2026-09-21 09:00'}"`,
            `completed: "${task.record.completed ?? '2026-09-21 09:30'}"`,
            'time_spent: "~30m"',
          ]
          if (task.record.actor !== undefined) recordLines.push(`actor: "${task.record.actor}"`)
          recordLines.push(
            '---',
            '',
            `# Task Record: ${task.id} ${task.title ?? `Task ${task.id}`}`,
            '',
            '## Summary',
            task.record.summary ?? 'Executed the task.',
            '',
            '## Changes',
            'none',
          )
          writeFileSync(recordPath, `${recordLines.join('\n')}\n`)
        }
        touch(recordPath, T0 + (dayOffset + 10) * DAY)
      }
      dayOffset += 1
    }

    const indexPath = join(tasksDir, 'index.json')
    writeFileSync(
      indexPath,
      feature.corruptIndex === true
        ? '{ this is not json'
        : JSON.stringify({ feature: feature.slug, tasks, statusEnum: STATUS_ENUM }, null, 1),
    )
    touch(indexPath, T0)
  }
  return { codeRoot: root, featuresDir }
}

function indexPathFor(root: string, slug: string): string {
  return join(root, 'docs', 'features', slug, 'tasks', 'index.json')
}

/** Read a feature's index entries as a mutable map (mutation-test helper). */
function readEntries(root: string, slug: string): Record<string, Record<string, unknown>> {
  const entries = readTaskIndex(indexPathFor(root, slug)) ?? {}
  return Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, value as Record<string, unknown>]))
}

/** Rewrite a feature's tasks/index.json (mutation helper; mtime explicit). */
function rewriteIndex(root: string, slug: string, entries: Record<string, Record<string, unknown>>, epochMs: number): void {
  writeFileSync(indexPathFor(root, slug), JSON.stringify({ feature: slug, tasks: entries, statusEnum: STATUS_ENUM }, null, 1))
  touch(indexPathFor(root, slug), epochMs)
}

function stemKeyFor(entries: Record<string, Record<string, unknown>>, taskId: string): string | undefined {
  return Object.keys(entries).find(key => entries[key]?.id === taskId)
}

/** Register a fixture code root and scan it once. */
function setupScannedProject(db: DatabaseSyncLike, root: string): { projectId: string; outcome: ScanOutcome } {
  const project = registerProject(db, { codeRoot: root, docLocationType: 'in_repo' })
  const outcome = scanForgeFiles(db, { id: project.id, codeRoot: root, docLocationPath: null })
  return { projectId: project.id, outcome }
}

// ---------------------------------------------------------------------------
// AC3 — source determination order (unit-pinned three paths)
// ---------------------------------------------------------------------------

describe('indexer/source — Interface 3 determination order (AC3)', () => {
  it('path 1: FORGE_ACTOR value passes through — session:<linkId> and terminal literals', () => {
    expect(resolveActorSource('session:link-1')).toBe('session')
    expect(resolveActorSource('terminal')).toBe('terminal')
    // Empty slot (current dialect reality) and unrecognized values do not
    // fabricate a source — they fall through to inference.
    expect(resolveActorSource(null)).toBeNull()
    expect(resolveActorSource(undefined)).toBeNull()
    expect(resolveActorSource('')).toBeNull()
    expect(resolveActorSource('browser-extension-9')).toBeNull()
  })

  it('path 1 wins over inference when the actor slot carries a defined value', () => {
    expect(determineSource({ actor: 'session:link-1', hasActiveSessionLink: false })).toBe('session')
    expect(determineSource({ actor: 'terminal', hasActiveSessionLink: true })).toBe('terminal')
  })

  it('path 2: no actor + active session link → session; no link → terminal', () => {
    expect(determineSource({ actor: null, hasActiveSessionLink: true })).toBe('session')
    expect(determineSource({ actor: null, hasActiveSessionLink: false })).toBe('terminal')
  })

  it('record-level source: actor line maps to a source; absent actor stays null (no historical inference)', () => {
    const withActor = parseRecordMarkdown(
      '---\nstatus: "completed"\nstarted: "2026-09-21 09:00"\ncompleted: "2026-09-21 09:30"\nactor: "session:link-1"\n---\n\n## Summary\nx\n',
      'coding.feature',
    )
    expect(withActor?.record.source).toBe('session')
    const withoutActor = parseRecordMarkdown(
      '---\nstatus: "completed"\nstarted: "2026-09-21 09:00"\ncompleted: "2026-09-21 09:30"\n---\n\n## Summary\nx\n',
      'coding.feature',
    )
    expect(withoutActor?.record.source).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// TaskRecord dialect adaptation (spike-1-findings §4)
// ---------------------------------------------------------------------------

describe('indexer/parse-task — TaskRecord dialect adaptation', () => {
  it('maps at/kind/summary faithfully from a write-once record .md', () => {
    const parsed = parseRecordMarkdown(
      '---\nstatus: "completed"\nstarted: "2026-09-22 10:16"\ncompleted: "2026-09-22 10:33"\ntime_spent: "~17m"\n---\n\n# Task Record: 2.3 snapshot repos\n\n## Summary\nImplemented the derived-cache repository layer.\n\nMulti-paragraph body\nkept verbatim.\n\n## Changes\n\n### Files Created\n- x.ts\n',
      'coding.feature',
    )
    expect(parsed).not.toBeNull()
    expect(parsed?.record.at).toBe('2026-09-22 10:33') // completed, verbatim local string
    expect(parsed?.record.kind).toBe('coding.feature') // degraded from index task type
    expect(parsed?.record.summary).toBe('Implemented the derived-cache repository layer.\n\nMulti-paragraph body\nkept verbatim.')
    expect(parsed?.actor).toBeNull()
  })

  it('degrades at to started when completed is missing; rejects frontmatter-less records', () => {
    const degraded = parseRecordMarkdown(
      '---\nstatus: "in_progress"\nstarted: "2026-09-22 11:00"\n---\n\n## Summary\nmid\n',
      'coding.feature',
    )
    expect(degraded?.record.at).toBe('2026-09-22 11:00')
    expect(parseRecordMarkdown('# no frontmatter\n\n## Summary\nx\n', 'doc')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// AC1 — full scan into the 2.3 snapshot repos
// ---------------------------------------------------------------------------

describe('indexer/scan — full scan (AC1)', () => {
  it('indexes every index.json task across features with qualified keys, verbatim fields, and no exclusion', async () => {
    const root = makeScratch()
    buildForgeProject(root, [
      {
        slug: 'alpha',
        manifestStatus: 'in-progress',
        docs: ['prd', 'design', 'ui'],
        tasks: [
          { id: '1.1', status: 'completed', type: 'coding.feature', record: {} },
          { id: '1.gate', type: 'gate', dependencies: ['1.1'] },
          { id: '1.2', dependencies: ['1.gate'] },
        ],
      },
      {
        slug: 'beta',
        manifestStatus: 'completed',
        // UIPF shape: no prd/design/ui anchors; T-* pipeline task; dangling dep
        tasks: [
          { id: '1.1', status: 'pending', type: 'test.run', dependencies: ['9.9'] },
          { id: 'T-review-doc', type: 'doc.review', record: { actor: 'terminal' } },
        ],
        plainDirs: ['stray-notes'],
      },
    ])
    await withDb((db) => {
      const { projectId, outcome } = setupScannedProject(db, root)
      expect(outcome.stats.featuresScanned).toBe(2)
      expect(outcome.stats.tasksIndexed).toBe(5)
      expect(outcome.stats.skippedFiles).toHaveLength(0)

      const tasks = listTaskSnapshots(db, projectId)
      expect(tasks.map(task => task.taskKey).sort()).toEqual([
        'alpha/1.1',
        'alpha/1.2',
        'alpha/1.gate',
        'beta/1.1',
        'beta/T-review-doc',
      ])

      // Same local id in two features coexists (qualified-key adaptation).
      const alphaOne = tasks.find(task => task.taskKey === 'alpha/1.1')
      const betaOne = tasks.find(task => task.taskKey === 'beta/1.1')
      expect(alphaOne?.status).toBe('completed')
      expect(betaOne?.status).toBe('pending')

      // Verbatim passthrough — no invented fields, blockers as local upstream keys.
      const onePointTwo = tasks.find(task => task.taskKey === 'alpha/1.2')
      expect(onePointTwo?.blockers).toEqual(['1.gate'])
      expect(onePointTwo?.branch).toBeNull()
      expect(onePointTwo?.worktree).toBe(false)

      // Dependency tree rebuildable: referenced blockers resolve or are flagged.
      expect(outcome.stats.danglingBlockers).toEqual([{ taskKey: 'beta/1.1', blocker: '9.9' }])
      const keySet = new Set(tasks.map(task => task.taskKey))
      const dangling = new Set(outcome.stats.danglingBlockers.map(entry => `${entry.taskKey}|${entry.blocker}`))
      for (const task of tasks) {
        for (const blocker of task.blockers) {
          expect(keySet.has(`${task.featureSlug}/${blocker}`) || dangling.has(`${task.taskKey}|${blocker}`)).toBe(true)
        }
      }

      // Feature rows: manifest word passthrough + doc-kind anchors + derived counts.
      const features = listFeatureSnapshots(db, projectId)
      expect(features.map(feature => feature.featureSlug).sort()).toEqual(['alpha', 'beta'])
      const alpha = features.find(feature => feature.featureSlug === 'alpha')
      expect(alpha?.status).toBe('in-progress') // hyphenated manifest word, no rewrite
      expect(alpha?.docKinds).toEqual(['manifest', 'prd', 'design', 'ui', 'tasks'])
      expect(alpha?.taskTotal).toBe(3)
      expect(alpha?.taskCompleted).toBe(1)
      const beta = features.find(feature => feature.featureSlug === 'beta')
      expect(beta?.docKinds).toEqual(['manifest', 'tasks'])

      // sync_state: cursor written, idle, no error (AC5 baseline).
      const sync = getSyncState(db, projectId)
      expect(sync?.status).toBe('idle')
      expect(sync?.lastScanAt).not.toBeNull()
      expect(sync?.error).toBeNull()

      // Baseline events: everything is structural-new + feature updates + sync.
      expect(taskEventsOf(outcome).every(event => event.changeKind === 'structural')).toBe(true)
      expect(outcome.events.filter(event => event.type === 'feature_updated')).toHaveLength(2)
      expect(outcome.events.at(-1)?.type).toBe('sync')
    })
  })

  it('updatedAt is derived from forge artifact mtimes (index/task file/record), not fabricated', async () => {
    const root = makeScratch()
    buildForgeProject(root, [
      {
        slug: 'solo',
        tasks: [
          { id: '2.1', record: {} }, // record mtime = T0 + 11 days (later than task file)
          { id: '2.2' },
        ],
      },
    ])
    await withDb((db) => {
      const { projectId } = setupScannedProject(db, root)
      const tasks = listTaskSnapshots(db, projectId)
      const twoOne = tasks.find(task => task.taskKey === 'solo/2.1')
      const twoTwo = tasks.find(task => task.taskKey === 'solo/2.2')
      expect(twoOne?.updatedAt).toBe(new Date(T0 + 11 * DAY).toISOString())
      expect(twoTwo?.updatedAt).toBe(new Date(T0 + 2 * DAY).toISOString())
    })
  })

  it('resolves the features dir through an external doc location (three-part model)', async () => {
    const root = makeScratch()
    const docsRoot = makeScratch()
    buildForgeProject(docsRoot, [{ slug: 'externalized', tasks: [{ id: '1.1' }] }])
    await withDb((db) => {
      const project = registerProject(db, { codeRoot: root, docLocationType: 'external', docLocationPath: docsRoot })
      const outcome = scanForgeFiles(db, { id: project.id, codeRoot: root, docLocationPath: docsRoot })
      expect(outcome.stats.featuresScanned).toBe(1)
      expect(listTaskSnapshots(db, project.id).map(task => task.taskKey)).toEqual(['externalized/1.1'])
    })
  })

  it('diff pure functions: attribute vs structural classification and dangling detection', () => {
    const previous: TaskSnapshot[] = [
      {
        projectId: 'p',
        taskKey: 'f/1',
        featureSlug: 'f',
        title: 't',
        status: 'pending',
        blockers: ['2'],
        branch: null,
        worktree: false,
        source: null,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]
    const same: IncomingTaskRow = { taskKey: 'f/1', featureSlug: 'f', title: 't', status: 'pending', blockers: ['2'], branch: null, worktree: false }
    expect(diffTasks(previous, [same]).upserts).toHaveLength(0)
    const changed: IncomingTaskRow = { ...same, status: 'in_progress' }
    const attributeDiff = diffTasks(previous, [changed])
    expect(attributeDiff.upserts).toHaveLength(1)
    expect(attributeDiff.changeKinds.get('f/1')).toBe('attribute')
    expect(diffTasks(previous, []).deletedKeys).toEqual(['f/1'])
    const addedDiff = diffTasks(previous, [same, { taskKey: 'f/3', featureSlug: 'f', title: 'n', status: 'pending', blockers: [], branch: null, worktree: false }])
    expect(addedDiff.changeKinds.get('f/3')).toBe('structural')
    expect(findDanglingBlockers([same])).toEqual([{ taskKey: 'f/1', blocker: '2' }])
  })
})

// ---------------------------------------------------------------------------
// AC2 — incremental diff: attribute upsert vs structural delete
// ---------------------------------------------------------------------------

describe('indexer/scan — incremental diff (AC2)', () => {
  function baseFixture(): string {
    const root = makeScratch()
    buildForgeProject(root, [
      {
        slug: 'alpha',
        tasks: [
          { id: '1.1', status: 'pending', record: {} },
          { id: '1.2', status: 'pending', dependencies: ['1.1'] },
        ],
      },
      { slug: 'beta', tasks: [{ id: '1.1', status: 'completed' }] },
    ])
    return root
  }

  it('single-task status change → attribute upsert with updatedAt moved forward; untouched rows stable', async () => {
    const root = baseFixture()
    await withDb((db) => {
      const { projectId } = setupScannedProject(db, root)
      const before = listTaskSnapshots(db, projectId)
      const beforeChanged = before.find(task => task.taskKey === 'alpha/1.1')
      const beforeStable = before.find(task => task.taskKey === 'alpha/1.2')
      expect(beforeChanged).toBeDefined()
      expect(beforeStable).toBeDefined()

      const entries = readEntries(root, 'alpha')
      const stem = stemKeyFor(entries, '1.1')
      expect(stem).toBeDefined()
      if (stem !== undefined) entries[stem] = { ...entries[stem] ?? {}, status: 'in_progress' }
      rewriteIndex(root, 'alpha', entries, T0 + 30 * DAY)

      const second = scanForgeFiles(db, { id: projectId, codeRoot: root, docLocationPath: null })
      expect(taskEventsOf(second)).toHaveLength(1)
      expect(second.events[0]).toMatchObject({ type: 'task_updated', taskKey: 'alpha/1.1', changeKind: 'attribute', source: 'terminal' })

      const after = listTaskSnapshots(db, projectId)
      const changed = after.find(task => task.taskKey === 'alpha/1.1')
      expect(changed?.status).toBe('in_progress')
      expect(changed?.source).toBe('terminal')
      expect(beforeChanged && changed ? changed.updatedAt > beforeChanged.updatedAt : false).toBe(true)
      // Untouched row: same content, updatedAt not drifted.
      expect(after.find(task => task.taskKey === 'alpha/1.2')?.updatedAt).toBe(beforeStable?.updatedAt)
      // Feature counts unchanged here → no feature event.
      expect(second.events.filter(event => event.type === 'feature_updated')).toHaveLength(0)
    })
  })

  it('task deletion → structural row delete + event, no orphan rows; feature counts follow', async () => {
    const root = baseFixture()
    await withDb((db) => {
      const { projectId } = setupScannedProject(db, root)
      const entries = readEntries(root, 'alpha')
      const stem = stemKeyFor(entries, '1.2')
      expect(stem).toBeDefined()
      if (stem !== undefined) delete entries[stem]
      rewriteIndex(root, 'alpha', entries, T0 + 30 * DAY)

      const second = scanForgeFiles(db, { id: projectId, codeRoot: root, docLocationPath: null })
      expect(taskEventsOf(second)).toEqual([
        { type: 'task_updated', projectId, taskKey: 'alpha/1.2', source: 'terminal', changeKind: 'structural' },
      ])

      const after = listTaskSnapshots(db, projectId)
      expect(after.map(task => task.taskKey).sort()).toEqual(['alpha/1.1', 'beta/1.1']) // no orphans
      const alpha = listFeatureSnapshots(db, projectId).find(feature => feature.featureSlug === 'alpha')
      expect(alpha?.taskTotal).toBe(1)
      expect(second.events.some(event => event.type === 'feature_updated' && event.featureSlug === 'alpha')).toBe(true)
    })
  })

  it('phase-shift rename (1.2 → 2.2) = structural delete of old key + structural add of new key', async () => {
    const root = baseFixture()
    await withDb((db) => {
      const { projectId } = setupScannedProject(db, root)
      const entries = readEntries(root, 'alpha')
      const oldStem = stemKeyFor(entries, '1.2')
      expect(oldStem).toBeDefined()
      if (oldStem !== undefined) {
        entries['2.2-task'] = { ...entries[oldStem] ?? {}, id: '2.2', file: '2.2-task.md', record: 'records/2.2-task.md' }
        delete entries[oldStem]
      }
      rewriteIndex(root, 'alpha', entries, T0 + 30 * DAY)

      const second = scanForgeFiles(db, { id: projectId, codeRoot: root, docLocationPath: null })
      expect(taskEventsOf(second).map(event => `${event.taskKey}:${event.changeKind}`).sort()).toEqual([
        'alpha/1.2:structural',
        'alpha/2.2:structural',
      ])
      expect(listTaskSnapshots(db, projectId).map(task => task.taskKey).sort()).toEqual(['alpha/1.1', 'alpha/2.2', 'beta/1.1'])
    })
  })

  it('feature directory removal → feature row + task rows deleted, feature_updated emitted', async () => {
    const root = baseFixture()
    await withDb((db) => {
      const { projectId } = setupScannedProject(db, root)
      rmSync(join(root, 'docs', 'features', 'beta'), { recursive: true, force: true })

      const second = scanForgeFiles(db, { id: projectId, codeRoot: root, docLocationPath: null })
      expect(listTaskSnapshots(db, projectId).map(task => task.taskKey)).toEqual(['alpha/1.1', 'alpha/1.2'])
      expect(listFeatureSnapshots(db, projectId).map(feature => feature.featureSlug)).toEqual(['alpha'])
      expect(second.events.some(event => event.type === 'feature_updated' && event.featureSlug === 'beta')).toBe(true)
    })
  })

  it('re-scan without changes is event-silent apart from the sync event (2.6 reuse entry)', async () => {
    const root = baseFixture()
    await withDb((db) => {
      const { projectId } = setupScannedProject(db, root)
      const second = scanForgeFiles(db, { id: projectId, codeRoot: root, docLocationPath: null })
      expect(second.events.filter(event => event.type !== 'sync')).toHaveLength(0)
      expect(second.stats.taskUpserts).toBe(0)
      expect(second.stats.taskDeletes).toBe(0)
      expect(getSyncState(db, projectId)?.status).toBe('idle')
    })
  })
})

// ---------------------------------------------------------------------------
// Source determination integration through the scan (order wired end to end)
// ---------------------------------------------------------------------------

describe('indexer/scan — source determination wiring', () => {
  const fixture = (): string => {
    const root = makeScratch()
    buildForgeProject(root, [
      {
        slug: 'alpha',
        tasks: [
          { id: '1.1', status: 'pending' }, // will flip → no actor, no link → terminal
          { id: '1.2', status: 'pending', record: { actor: 'session:link-9' } }, // actor slot wins
          { id: '1.3', status: 'pending' }, // will flip with an active link → session
        ],
      },
    ])
    return root
  }

  const flipStatuses = (root: string, ids: readonly string[], status: string): void => {
    const entries = readEntries(root, 'alpha')
    for (const [key, value] of Object.entries(entries)) {
      if (ids.includes(String(value.id))) entries[key] = { ...value, status }
    }
    rewriteIndex(root, 'alpha', entries, T0 + 30 * DAY)
  }

  it('path 2 marks session via active session_link, else terminal; path 1 actor overrides', async () => {
    const root = fixture()
    await withDb((db) => {
      const { projectId } = setupScannedProject(db, root)
      recordSessionLink(db, { projectId, taskKey: 'alpha/1.3', sessionId: 'sess-3' })
      flipStatuses(root, ['1.1', '1.3'], 'in_progress')

      const second = scanForgeFiles(db, { id: projectId, codeRoot: root, docLocationPath: null })
      const byKey = new Map(taskEventsOf(second).map(event => [event.taskKey, event.source]))
      expect(byKey.get('alpha/1.1')).toBe('terminal') // path 2b
      expect(byKey.get('alpha/1.3')).toBe('session') // path 2a
      // 1.2 content unchanged → row keeps the baseline source from its
      // actor-bearing record (path 1, carried since the first scan).
      const tasks = listTaskSnapshots(db, projectId)
      expect(tasks.find(task => task.taskKey === 'alpha/1.2')?.source).toBe('session')
      expect(tasks.find(task => task.taskKey === 'alpha/1.3')?.source).toBe('session')
    })
  })

  it('ended session links do not confer the session source', async () => {
    const root = fixture()
    await withDb((db) => {
      const { projectId } = setupScannedProject(db, root)
      const link = recordSessionLink(db, { projectId, taskKey: 'alpha/1.3', sessionId: 'sess-old' })
      endSessionLink(db, link.id)
      flipStatuses(root, ['1.3'], 'in_progress')

      const second = scanForgeFiles(db, { id: projectId, codeRoot: root, docLocationPath: null })
      const event = taskEventsOf(second).find(taskEvent => taskEvent.taskKey === 'alpha/1.3')
      expect(event?.source).toBe('terminal')
    })
  })
})

// ---------------------------------------------------------------------------
// AC4 — corruption tolerance: skip + record, keep scanning
// ---------------------------------------------------------------------------

describe('indexer/scan — corruption tolerance (AC4)', () => {
  it('corrupt index.json: other features scan, existing rows of the broken feature are preserved, sync_state records the error', async () => {
    const root = makeScratch()
    buildForgeProject(root, [
      { slug: 'alpha', tasks: [{ id: '1.1', status: 'pending' }] },
      { slug: 'beta', tasks: [{ id: '1.1', status: 'pending' }], corruptIndex: true },
    ])
    await withDb((db) => {
      const { projectId, outcome: first } = setupScannedProject(db, root)
      expect(first.stats.skippedFiles).toHaveLength(1)
      expect(first.stats.skippedFiles[0]?.file).toContain('beta/tasks/index.json')
      expect(first.sync.status).toBe('error')
      expect(first.sync.error).toContain('beta/tasks/index.json')
      expect(getSyncState(db, projectId)?.lastScanAt).toBeNull() // no clean success yet

      // Alpha is fully indexed despite beta's corruption (continue the rest).
      expect(listTaskSnapshots(db, projectId).map(task => task.taskKey)).toEqual(['alpha/1.1'])

      // Establish a clean history for beta, then corrupt again: rows preserved.
      const fixed = indexPathFor(root, 'beta')
      writeFileSync(
        fixed,
        JSON.stringify({
          feature: 'beta',
          tasks: { '1.1-task': { id: '1.1', title: 'Task 1.1', status: 'completed', file: '1.1-task.md', record: 'records/1.1-task.md' } },
          statusEnum: STATUS_ENUM,
        }),
      )
      touch(fixed, T0 + 5 * DAY)
      scanForgeFiles(db, { id: projectId, codeRoot: root, docLocationPath: null })
      writeFileSync(fixed, '{ broken again')
      const third = scanForgeFiles(db, { id: projectId, codeRoot: root, docLocationPath: null })
      expect(listTaskSnapshots(db, projectId).map(task => task.taskKey).sort()).toEqual(['alpha/1.1', 'beta/1.1']) // preserved, not deleted
      expect(third.sync.status).toBe('error')
    })
  })

  it('corrupt record .md: task row still indexed, record skipped and recorded', async () => {
    const root = makeScratch()
    buildForgeProject(root, [
      {
        slug: 'alpha',
        tasks: [
          { id: '1.1', record: { corrupt: true } },
          { id: '1.2', record: {} },
        ],
      },
    ])
    await withDb((db) => {
      const { projectId, outcome } = setupScannedProject(db, root)
      expect(outcome.stats.tasksIndexed).toBe(2)
      expect(outcome.stats.recordsParsed).toBe(1)
      expect(outcome.stats.skippedFiles).toHaveLength(1)
      expect(outcome.stats.skippedFiles[0]?.file).toContain('records/1.1-task.md')
      expect(listTaskSnapshots(db, projectId).map(task => task.taskKey)).toHaveLength(2)
      expect(outcome.sync.status).toBe('error')
    })
  })

  it('manifest without status: feature row untouched, task set still scanned', async () => {
    const root = makeScratch()
    buildForgeProject(root, [{ slug: 'alpha', omitManifestStatus: true, tasks: [{ id: '1.1', status: 'pending' }] }])
    await withDb((db) => {
      const { projectId, outcome } = setupScannedProject(db, root)
      expect(outcome.stats.skippedFiles.some(failure => failure.file === 'alpha/manifest.md')).toBe(true)
      expect(listTaskSnapshots(db, projectId).map(task => task.taskKey)).toEqual(['alpha/1.1'])
      expect(listFeatureSnapshots(db, projectId)).toEqual([]) // no status → no invented feature row
    })
  })

  it('out-of-vocab task status is skipped and recorded (no enum rewriting)', async () => {
    const root = makeScratch()
    buildForgeProject(root, [
      {
        slug: 'alpha',
        tasks: [
          { id: '1.1', rawStatus: 'superseded-by-forge-7' },
          { id: '1.2', status: 'pending' },
        ],
      },
    ])
    await withDb((db) => {
      const { projectId, outcome } = setupScannedProject(db, root)
      expect(outcome.stats.skippedFiles.some(failure => failure.reason.includes('outside snapshot vocabulary'))).toBe(true)
      expect(listTaskSnapshots(db, projectId).map(task => task.taskKey)).toEqual(['alpha/1.2'])
    })
  })

  it('missing features directory: no data changes, sync error, no structural wipe', async () => {
    const root = makeScratch()
    buildForgeProject(root, [{ slug: 'alpha', tasks: [{ id: '1.1' }] }])
    await withDb((db) => {
      const { projectId } = setupScannedProject(db, root)
      rmSync(join(root, 'docs', 'features'), { recursive: true, force: true })
      const second = scanForgeFiles(db, { id: projectId, codeRoot: root, docLocationPath: null })
      expect(second.sync.status).toBe('error')
      expect(second.stats.tasksIndexed).toBe(0)
      expect(listTaskSnapshots(db, projectId).map(task => task.taskKey)).toEqual(['alpha/1.1']) // preserved
    })
  })
})

// ---------------------------------------------------------------------------
// AC5 — sync_state cursor per round + rebuild equivalence
// ---------------------------------------------------------------------------

describe('indexer/scan — sync_state lifecycle and rebuild equivalence (AC5)', () => {
  it('cursor advances on success and stays put on degraded rounds', async () => {
    const root = makeScratch()
    buildForgeProject(root, [{ slug: 'alpha', tasks: [{ id: '1.1' }] }])
    await withDb((db) => {
      const { projectId, outcome: first } = setupScannedProject(db, root)
      expect(first.sync.lastScanAt).not.toBeNull()
      writeFileSync(indexPathFor(root, 'alpha'), '{ nope')
      const second = scanForgeFiles(db, { id: projectId, codeRoot: root, docLocationPath: null })
      expect(second.sync.status).toBe('error')
      expect(second.sync.lastScanAt).toBe(first.sync.lastScanAt) // cursor keeps the last clean scan
    })
  })

  it('rebuildDerivedSnapshots with the indexer rescan hook reproduces the incremental rows exactly', async () => {
    const root = makeScratch()
    buildForgeProject(root, [
      {
        slug: 'alpha',
        manifestStatus: 'in-progress',
        docs: ['prd'],
        tasks: [
          { id: '1.1', status: 'completed', record: {} },
          { id: '1.2', status: 'in_progress' },
          { id: '1.gate', type: 'gate', dependencies: ['1.2'] },
        ],
      },
      { slug: 'beta', tasks: [{ id: '1.1', status: 'pending', dependencies: ['9.9'] }] },
    ])
    await withDb((db) => {
      // Link recorded BEFORE the first scan so both the incremental scan and the
      // rebuild derive from identical inputs (forge files + session_links) —
      // rebuild re-derives source from current inputs by design.
      const project = registerProject(db, { codeRoot: root, docLocationType: 'in_repo' })
      recordSessionLink(db, { projectId: project.id, taskKey: 'alpha/1.2', sessionId: 'sess-1' })
      const first = scanForgeFiles(db, { id: project.id, codeRoot: root, docLocationPath: null })
      expect(first.stats.tasksIndexed).toBe(4)
      const projectId = project.id
      const beforeTasks = listTaskSnapshots(db, projectId)
      const beforeFeatures = listFeatureSnapshots(db, projectId)
      const beforeSync = getSyncState(db, projectId)

      rebuildDerivedSnapshots(db, makeRescanHook({ id: projectId, codeRoot: root, docLocationPath: null }))

      // Row equivalence: mtimes and links are unchanged, so every derived value
      // (including source via the determination order) reproduces exactly.
      expect(listTaskSnapshots(db, projectId)).toEqual(beforeTasks)
      expect(listFeatureSnapshots(db, projectId)).toEqual(beforeFeatures)
      expect(getSyncState(db, projectId)?.status).toBe(beforeSync?.status)
    })
  })

  it('resolveFeaturesDir follows the registry docBase convention', () => {
    expect(resolveFeaturesDir({ id: 'p', codeRoot: 'C:/repo', docLocationPath: null })).toBe(join('C:/repo', 'docs', 'features'))
    expect(resolveFeaturesDir({ id: 'p', codeRoot: 'C:/repo', docLocationPath: 'D:/docs' })).toBe(join('D:/docs', 'docs', 'features'))
  })

  it('scanFeatures ignores non-feature directories silently', () => {
    const root = makeScratch()
    buildForgeProject(root, [{ slug: 'alpha', tasks: [{ id: '1.1' }] }])
    const result = scanFeatures(join(root, 'docs', 'features'))
    expect(result.features.map(feature => feature.slug)).toEqual(['alpha'])
    expect(result.failures).toHaveLength(0)
  })
})
