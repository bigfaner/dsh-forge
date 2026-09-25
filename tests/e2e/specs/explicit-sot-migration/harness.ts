// tests/e2e/specs/explicit-sot-migration/harness — the journey's worlds and
// oracles (T-test-gen-scripts, contract-derived).
//
// Traceability: docs/features/dsh-forge-m3/testing/explicit-sot-migration/
// contracts/step-{1..4}-*.md. The worlds:
//   files    — hand-built 12-task tree (multi-status + deps chain), registered
//              + scanned but NOT migrated (data_authority=files) — the
//              migratable-pill corpus (fixture: TaskIndexFile ≥10 tasks,
//              Task belongs_to TaskIndexFile);
//   migrated — the same shape pre-migrated through the real kernel chain (the
//              not-migratable-hidden / already-migrated-guard corpus).
// The doc-tree oracles (SC2 口径,byte-level) and the four-field parity oracle
// live here (expected values from the hand-built set = the corpus ground
// truth).

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from '@playwright/test'
import { buildKernelWorld, type KernelDb, type KernelWorld, type TaskSpec } from '../_lib/journey-world.ts'

export const MIG_FEATURE = 'sot-migration'

/** 12 tasks: multi-status + a deps chain (10→11 unmet, 9→12 met). */
export const MIG_TASKS: readonly TaskSpec[] = [
  { stem: '1-x', localId: '1', title: '迁移语料任务一(pending)', status: 'pending', type: 'coding.feature', dependencies: [] },
  { stem: '2-x', localId: '2', title: '迁移语料任务二(pending)', status: 'pending', type: 'coding.fix', dependencies: [] },
  { stem: '3-x', localId: '3', title: '迁移语料任务三(pending)', status: 'pending', type: 'coding.enhancement', dependencies: [] },
  { stem: '4-x', localId: '4', title: '迁移语料任务四(pending)', status: 'pending', type: 'coding.feature', dependencies: [] },
  { stem: '5-x', localId: '5', title: '迁移语料任务五(pending,依赖已终态)', status: 'pending', type: 'coding.feature', dependencies: ['8'] },
  { stem: '6-x', localId: '6', title: '迁移语料任务六(in_progress)', status: 'in_progress', type: 'coding.feature', dependencies: [] },
  { stem: '7-x', localId: '7', title: '迁移语料任务七(in_progress)', status: 'in_progress', type: 'coding.fix', dependencies: [] },
  { stem: '8-x', localId: '8', title: '迁移语料任务八(completed)', status: 'completed', type: 'coding.feature', dependencies: [] },
  { stem: '9-x', localId: '9', title: '迁移语料任务九(completed)', status: 'completed', type: 'coding.fix', dependencies: [] },
  { stem: '10-x', localId: '10', title: '迁移语料任务十(completed)', status: 'completed', type: 'coding.enhancement', dependencies: [] },
  { stem: '11-x', localId: '11', title: '迁移语料任务十一(pending,依赖未终态)', status: 'pending', type: 'coding.feature', dependencies: ['6'] },
  { stem: '12-x', localId: '12', title: '迁移语料任务十二(pending,依赖已终态)', status: 'pending', type: 'coding.feature', dependencies: ['9'] },
]

const SHAPE = { slug: MIG_FEATURE, status: 'tasks', docKinds: ['prd', 'design'] }

/** The files-authority world (registered, scanned, NOT migrated). */
export async function buildFilesWorld(root: string): Promise<KernelWorld> {
  return await buildKernelWorld(root, { feature: SHAPE, tasks: MIG_TASKS, migrate: false })
}

/** The pre-migrated world (kernel chain; the sqlite terminal state). */
export async function buildMigratedWorld(root: string): Promise<KernelWorld> {
  return await buildKernelWorld(root, { feature: SHAPE, tasks: MIG_TASKS })
}

// ---------------------------------------------------------------------------
// Doc-tree oracle: position + bytes (the md-原样 Hard Rule's evidence base)
// ---------------------------------------------------------------------------

/** Every file under <docsRoot>/docs/features (rel path → bytes), pre-run. */
export function snapshotDocTree(docsRoot: string): Map<string, string> {
  const files = new Map<string, string>()
  const featuresRoot = join(docsRoot, 'docs', 'features')
  const walk = (dir: string, rel: string): void => {
    for (const dirent of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const childRel = rel === '' ? dirent.name : `${rel}/${dirent.name}`
      if (dirent.isDirectory()) walk(join(dir, dirent.name), childRel)
      else files.set(childRel, readFileSync(join(dir, dirent.name), 'utf8'))
    }
  }
  walk(featuresRoot, '')
  return files
}

/**
 * The doc-tree comparison AFTER migration: every pre-run file must still exist
 * with IDENTICAL bytes at the IDENTICAL path, except each feature's
 * tasks/index.json which must be RETIRED and re-appear as
 * tasks/index.json.migrated-<ts> carrying the SAME bytes (archive = rename).
 */
export function assertDocTreeMigrated(label: string, before: ReadonlyMap<string, string>, docsRoot: string): void {
  const after = snapshotDocTree(docsRoot)
  const problems: string[] = []
  for (const [rel, bytes] of before) {
    if (rel.endsWith('/tasks/index.json')) {
      if (after.has(rel)) problems.push(`index.json NOT retired: ${rel}`)
      const archived = [...after.keys()].find(candidate => candidate.startsWith(`${rel}.migrated-`))
      if (archived === undefined) problems.push(`archive missing for: ${rel}`)
      else if (after.get(archived) !== bytes) problems.push(`archive bytes rewritten: ${archived}`)
      continue
    }
    if (after.get(rel) !== bytes) problems.push(`file changed: ${rel}`)
  }
  const expectedKeys = new Set(before.keys())
  for (const rel of after.keys()) {
    const base = rel.match(/^(.*\/tasks\/index\.json)\.migrated-[^/]+$/)?.[1]
    if (base !== undefined && expectedKeys.has(base)) continue
    if (!expectedKeys.has(rel)) problems.push(`unexpected extra file: ${rel}`)
  }
  expect(problems, `[${label}] doc tree: md 原样(内容+位置)+ index.json 淘汰归档`).toEqual([])
}

/** The un-migrated doc tree: index.json everywhere, zero archive leftovers. */
export function assertDocTreeRolledBack(label: string, before: ReadonlyMap<string, string>, docsRoot: string): void {
  const after = snapshotDocTree(docsRoot)
  const problems: string[] = []
  for (const [rel, bytes] of before) {
    if (after.get(rel) !== bytes) problems.push(`file changed during failed run: ${rel}`)
  }
  for (const rel of after.keys()) {
    if (rel.includes('/index.json.migrated-')) problems.push(`archive leftover: ${rel}`)
  }
  expect(problems, `[${label}] rolled-back doc tree ≡ pre-migration tree(零半迁移 · 文档树半身)`).toEqual([])
}

// ---------------------------------------------------------------------------
// Parity oracle: the four-field comparison (限定地址/状态/依赖/标题)
// ---------------------------------------------------------------------------

export interface ParityRow { readonly status: string; readonly title: string; readonly blockers: string }

/** The corpus ground truth (the file dialect as the writer wrote it). */
export function expectedParity(world: KernelWorld): Map<string, ParityRow> {
  const map = new Map<string, ParityRow>()
  for (const feature of world.set.features) {
    for (const task of feature.tasks) {
      map.set(`${feature.slug}/${task.localId}`, {
        status: task.status,
        title: task.title,
        blockers: JSON.stringify([...task.dependencies]),
      })
    }
  }
  return map
}

/** One kernel table's four-field projection (blockers canonicalized). */
export function readParity(db: KernelDb, table: 'task' | 'task_snapshot', projectId: string): Map<string, ParityRow> {
  const sqlite = db as unknown as { prepare: (sql: string) => { all: (...args: string[]) => Array<{ task_key: string; status: string; title: string; blockers: string }> } }
  const rows = sqlite.prepare(`SELECT task_key, status, title, blockers FROM ${table} WHERE project_id = ?`).all(projectId)
  const map = new Map<string, ParityRow>()
  for (const row of rows) {
    map.set(row.task_key, {
      status: row.status,
      title: row.title,
      blockers: JSON.stringify(JSON.parse(row.blockers) as unknown[]),
    })
  }
  return map
}

/** Zero-diff assertion with a report (non-vacuous enforced). */
export function assertParityZeroDiff(label: string, actual: ReadonlyMap<string, ParityRow>, expected: ReadonlyMap<string, ParityRow>): void {
  expect(expected.size, `[${label}] parity 非平凡(真值携带任务)`).toBeGreaterThan(0)
  const diffs: string[] = []
  for (const key of new Set([...expected.keys(), ...actual.keys()])) {
    const left = actual.get(key)
    const right = expected.get(key)
    if (left === undefined || right === undefined) {
      diffs.push(`${key}: ${left === undefined ? 'missing' : 'extra'}`)
      continue
    }
    if (left.status !== right.status) diffs.push(`${key}.status ${left.status} ≠ ${right.status}`)
    if (left.title !== right.title) diffs.push(`${key}.title differs`)
    if (left.blockers !== right.blockers) diffs.push(`${key}.blockers ${left.blockers} ≠ ${right.blockers}`)
  }
  expect(diffs, `[${label}] 任务全集对拍零差异(限定地址/状态/依赖/标题)`).toEqual([])
}

// ---------------------------------------------------------------------------
// Kernel readers (WAL: safe beside the live app connection)
// ---------------------------------------------------------------------------

export interface ProjectRow { readonly id: string; readonly data_authority: string; readonly migrated_at: string | null; readonly backup_path: string | null }

/** Read the single registered project row of this journey kernel. */
export function readProjectRow(db: KernelDb): ProjectRow {
  const sqlite = db as unknown as { prepare: (sql: string) => { all: () => ProjectRow[] } }
  const rows = sqlite.prepare('SELECT id, data_authority, migrated_at, backup_path FROM projects').all()
  expect(rows.length, '本旅程内核恰一注册项目').toBe(1)
  return rows[0] as ProjectRow
}

/** migration_event (phase, result) trail in write order. */
export function migrationTrail(db: KernelDb, projectId: string): string[] {
  const sqlite = db as unknown as { prepare: (sql: string) => { all: (...args: string[]) => Array<{ phase: string; result: string }> } }
  const rows = sqlite.prepare('SELECT phase, result FROM migration_event WHERE project_id = ? ORDER BY rowid').all(projectId)
  return rows.map(row => `${row.phase}/${row.result}`)
}

/** The post-migration full end-state (doc tree + kernel + backup artifacts). */
export async function assertMigratedEndState(label: string, world: KernelWorld, treeBefore: ReadonlyMap<string, string>, db: KernelDb): Promise<void> {
  assertDocTreeMigrated(label, treeBefore, world.docsRoot)
  const project = readProjectRow(db)
  expect(project.data_authority, `[${label}] 权威已切读 sqlite`).toBe('sqlite')
  expect(project.migrated_at, `[${label}] migrated_at 落库`).not.toBeNull()
  expect(project.backup_path, `[${label}] backup_path 落库`).not.toBeNull()
  const backupPath = project.backup_path as string
  expect(existsSync(backupPath), `[${label}] 备份目录在场`).toBe(true)
  expect(existsSync(join(backupPath, 'workbench.db')), `[${label}] 备份含库文件`).toBe(true)
  assertParityZeroDiff(`${label} task↔snapshot`, readParity(db, 'task', project.id), readParity(db, 'task_snapshot', project.id))
  assertParityZeroDiff(`${label} task↔ground-truth`, readParity(db, 'task', project.id), expectedParity(world))
  expect(migrationTrail(db, project.id).slice(-5), `[${label}] 成功程五相全 ok`).toEqual([
    'backup/ok', 'ingest/ok', 'verify/ok', 'switch/ok', 'archive/ok',
  ])
}
