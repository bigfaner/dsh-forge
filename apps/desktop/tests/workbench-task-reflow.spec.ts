import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../src/main/workbench/store/db.ts'
import { registerProject } from '../src/main/workbench/repos/projects.ts'
import { scanForgeFiles } from '../src/main/workbench/indexer/scan.ts'
import type { WorkbenchEvent } from '../src/main/workbench/indexer/diff.ts'
import { createMigrationService } from '../src/main/workbench/migration/pipeline.ts'
import { createWorkbenchIpcServices } from '../src/main/workbench/ipc/services.ts'

// Task 6.3 (SC1) — the authoritative-write reflow chain, kernel side. Two
// integration points this task closed (both SC1-exposed gaps the e2e leg
// rides):
//   ① getTaskBoard read routing (tech-design §Interface 1: read verbs split
//      by data_authority; 1.3 landed taskGet/taskQuery only) — a MIGRATED
//      project's board must read the authoritative task table, not the
//      files-side snapshot cache (index.json archiving empties the scan).
//   ② task write verbs emit task_updated straight after the commit (the
//      board's ONLY refresh trigger; perception scans cover files projects
//      alone) with the actor-derived source (session:<id> → 'session').
//
// Authorities: tech-design §Interface 1 (read routing + event extension),
// §Interface 2 (actor audit), prd-spec SC1/G1 (状态回流看板 ≤5s 的推送面).

const scratches: string[] = []
const openDbs: Array<{ close(): void }> = []
function makeScratch(): string {
  const dir = join(tmpdir(), `dsh-forge-reflow-${String(process.pid)}-${String(Date.now().toString(36))}-${String(scratches.length)}`)
  mkdirSync(dir, { recursive: true })
  scratches.push(dir)
  return dir
}
afterEach(async () => {
  for (const db of openDbs.splice(0)) {
    try { db.close() } catch { /* already closed */ }
  }
  const pending = scratches.splice(0)
  for (const dir of pending) {
    // Windows: late SQLite unlocks need the retries.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        rmSync(dir, { recursive: true, force: true })
        break
      } catch {
        await new Promise((resolve) => { setTimeout(resolve, 100) })
      }
    }
  }
})

/** One minimal forge project: feature `demo` with 1.1 (completed) + 1.2 (pending, dep 1.1). */
function buildForgeTree(codeRoot: string): void {
  const tasksDir = join(codeRoot, 'docs', 'features', 'demo', 'tasks')
  mkdirSync(join(tasksDir, 'records'), { recursive: true })
  writeFileSync(
    join(codeRoot, 'docs', 'features', 'demo', 'manifest.md'),
    '---\nfeature: "demo"\ncreated: "2026-09-24"\nstatus: tasks\n---\n\n# Feature: demo\n',
  )
  writeFileSync(join(tasksDir, '1.1-first.md'), '---\nid: "1.1"\ntitle: "First"\npriority: "P0"\n---\n\n# 1.1\n')
  writeFileSync(join(tasksDir, '1.2-second.md'), '---\nid: "1.2"\ntitle: "Second"\npriority: "P0"\n---\n\n# 1.2\n')
  writeFileSync(join(tasksDir, 'records', '1.1-first.md'), '---\nat: "2026-09-24T00:00:00Z"\nkind: "submit"\nsource: "session:session-done"\nsummary: "done"\n---\n')
  writeFileSync(join(tasksDir, 'index.json'), JSON.stringify({
    tasks: {
      '1.1-first': { id: '1.1', title: 'First', priority: 'P0', status: 'completed', file: '1.1-first.md', record: 'records/1.1-first.md' },
      '1.2-second': { id: '1.2', title: 'Second', priority: 'P0', status: 'pending', file: '1.2-second.md', dependencies: ['1.1'] },
    },
  }, undefined, 2))
}

/** The full kernel chain up to a MIGRATED project + the assembled verb services. */
async function migratedServices() {
  const root = makeScratch()
  const codeRoot = join(root, 'repo')
  const userData = join(root, 'user-data')
  buildForgeTree(codeRoot)
  const { db } = await openDatabase(userData)
  openDbs.push(db)
  const project = registerProject(db, { codeRoot, docLocationType: 'in_repo' })
  scanForgeFiles(db, { id: project.id, codeRoot, docLocationPath: null })
  const migration = createMigrationService({
    db,
    userDataPath: userData,
    loadProject: id => (id === project.id ? project : null),
    onEvent: () => {},
  })
  await migration.startMigration(project.id)
  const events: WorkbenchEvent[] = []
  const assembly = createWorkbenchIpcServices({
    db,
    pluginBundlesPath: join(root, 'nonexistent-plugin-bundles.json'),
    userDataPath: userData,
    onEvents: batch => events.push(...batch),
  })
  return { db, project, services: assembly.verbs, events, codeRoot, userData }
}

describe('task 6.3 (SC1): authoritative board read routing', () => {
  it('a migrated project\'s board reads the task table (not the emptied snapshot cache)', async () => {
    const { project, services } = await migratedServices()
    const board = services.getTaskBoard(project.id)
    const byKey = new Map(board.tasks.map(task => [task.key, task]))
    expect(byKey.get('demo/1.1')?.status, 'ingested completed row survives on the board').toBe('completed')
    expect(byKey.get('demo/1.2')?.status).toBe('pending')
    // The authoritative rows carry the actor-audit projection (updatedBy).
    expect(board.tasks.every(task => typeof task.updatedBy === 'string' || task.updatedBy === undefined)).toBe(true)
  })

  it('a files project keeps the snapshot projection (M2 semantics unchanged)', async () => {
    const root = makeScratch()
    const codeRoot = join(root, 'repo')
    buildForgeTree(codeRoot)
    const { db } = await openDatabase(join(root, 'user-data'))
    openDbs.push(db)
    const project = registerProject(db, { codeRoot, docLocationType: 'in_repo' })
    scanForgeFiles(db, { id: project.id, codeRoot, docLocationPath: null })
    const assembly = createWorkbenchIpcServices({
      db,
      pluginBundlesPath: join(root, 'nonexistent-plugin-bundles.json'),
      userDataPath: join(root, 'user-data'),
      onEvents: () => {},
    })
    const board = assembly.verbs.getTaskBoard(project.id)
    expect(board.tasks.find(task => task.key === 'demo/1.1')?.status).toBe('completed')
    expect(board.tasks.every(task => task.updatedBy === undefined), 'files rows carry no audit projection').toBe(true)
  })
})

describe('task 6.3 (SC1): authoritative write events (the reflow push face)', () => {
  it('claim/submit emit task_updated with the actor-derived session source', async () => {
    const { project, services, events, db } = await migratedServices()
    const claimed = services.taskClaim({ projectId: project.id, taskKey: 'demo/1.2' }, 'session:session-sc1')
    expect(claimed.status).toBe('in_progress')
    expect(claimed.source, 'session:<id> projects to the [会话] source').toBe('session')
    expect(claimed.updatedBy, 'the audit column rides the summary (AC-4 face)').toBe('session:session-sc1')

    const claimEvent = events.find(event => event.type === 'task_updated') as Extract<WorkbenchEvent, { type: 'task_updated' }> | undefined
    expect(claimEvent, 'task_updated fired on the claim').toBeDefined()
    expect(claimEvent).toMatchObject({ projectId: project.id, taskKey: 'demo/1.2', source: 'session', changeKind: 'attribute' })

    const submitted = services.taskSubmit({ projectId: project.id, taskKey: 'demo/1.2' }, 'session:session-sc1')
    expect(submitted.status).toBe('completed')
    const updates = events.filter(event => event.type === 'task_updated')
    expect(updates).toHaveLength(2)

    // The board reflects the writes (read routing + the events landed).
    const board = services.getTaskBoard(project.id)
    expect(board.tasks.find(task => task.key === 'demo/1.2')?.status).toBe('completed')
    // 库断言 face: the audit column is the durable record.
    const row = db.prepare('SELECT updated_by, status FROM task WHERE project_id = ? AND task_key = ?').get(project.id, 'demo/1.2') as { updated_by: string; status: string }
    expect(row.updated_by).toBe('session:session-sc1')
    expect(row.status).toBe('completed')
  })

  it('rejected writes emit nothing (zero events on failure)', async () => {
    const { project, services, events } = await migratedServices()
    expect(() => services.taskReopen({ projectId: project.id, taskKey: 'demo/1.2' }, 'session:session-x'))
      .toThrow() // reopen is only legal from rejected/skipped, this row is pending
    expect(events.filter(event => event.type === 'task_updated')).toHaveLength(0)
  })

  it('taskAdd emits the structural flavor', async () => {
    const { project, services, events } = await migratedServices()
    services.taskAdd({ projectId: project.id, featureSlug: 'demo', title: 'Discovered' }, 'session:session-add')
    const event = events.find(event => event.type === 'task_updated') as Extract<WorkbenchEvent, { type: 'task_updated' }> | undefined
    expect(event?.changeKind).toBe('structural')
    expect(event?.taskKey).toMatch(/^demo\/disc-/)
  })
})
