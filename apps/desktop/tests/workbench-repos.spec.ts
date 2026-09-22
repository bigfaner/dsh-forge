import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase, type DatabaseSyncLike } from '../src/main/workbench/store/db.ts'
import { activateProject, getActiveProject, getActiveProjectId } from '../src/main/workbench/repos/app-state.ts'
import { listProjects, registerProject, removeProject, updateProject } from '../src/main/workbench/repos/projects.ts'
import { endSessionLink, listSessionLinks, listSessionLinksByTask, recordSessionLink, supersedeActiveSessionLinks } from '../src/main/workbench/repos/session-links.ts'
import { WorkbenchRepoError, type Project } from '../src/main/workbench/repos/types.ts'

// Task 2.2 — owned-SoT repos (projects / app_state / session_links) over the
// store from task 2.1. Design: docs/features/dsh-forge-m2/design/tech-design.md
// (§Interfaces Interface 1) + design/er-diagram.md (row-level contracts).
//
// Hard Rule note: production code writes the three owned tables ONLY through
// the repos layer. This spec uses raw SQL exclusively where no repo path
// exists yet — seeding the derived snapshot tables (indexer is a later task)
// and fault injection (dangling pointer / constraint violations) — mirroring
// the raw-seeding precedent of workbench-store.spec.ts.

const scratches: string[] = []

function makeScratch(): string {
  const dir = join(tmpdir(), `dsh-forge-workbench-repos-${String(process.pid)}-${String(scratches.length)}`)
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

/** Capture a sync throw for structured assertions (2.1 spec pattern). */
function capture(fn: () => void): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  return undefined
}

function expectRepoError(error: unknown, code: string, messagePattern: RegExp): void {
  expect(error).toBeInstanceOf(WorkbenchRepoError)
  const repoError = error as WorkbenchRepoError
  expect(repoError.code).toBe(code)
  expect(repoError.message).toMatch(messagePattern)
}

/** Distinct-timestamp helper: real clock, 3ms apart keeps ISO ordering stable. */
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 3))

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

function registerInRepo(db: DatabaseSyncLike, codeRoot: string): Project {
  return registerProject(db, { codeRoot, docLocationType: 'in_repo' })
}

function findProject(db: DatabaseSyncLike, id: string): Project | undefined {
  return listProjects(db).find(project => project.id === id)
}

function activePointerRows(db: DatabaseSyncLike): number {
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM app_state WHERE key = 'active_project_id'")
    .get() as { c: number }
  return row.c
}

function sessionLinkRows(db: DatabaseSyncLike, projectId: string): number {
  const row = db.prepare('SELECT COUNT(*) AS c FROM session_links WHERE project_id = ?').get(projectId) as { c: number }
  return row.c
}

// Derived snapshot seeding (no snapshot repo in this task — indexer is 2.x).
function seedSnapshots(db: DatabaseSyncLike, projectId: string): void {
  db.prepare(
    "INSERT INTO task_snapshot (project_id, task_key, feature_slug, title, status, updated_at) VALUES (?, '2.1', 'dsh-forge-m2', 'store foundation', 'pending', ?)",
  ).run(projectId, '2026-09-22T00:00:00.000Z')
  db.prepare(
    "INSERT INTO feature_snapshot (project_id, feature_slug, status, updated_at) VALUES (?, 'dsh-forge-m2', 'tasks', ?)",
  ).run(projectId, '2026-09-22T00:00:00.000Z')
  db.prepare('INSERT INTO sync_state (project_id) VALUES (?)').run(projectId)
}

describe('registerProject — 三型文档位置 + UNIQUE 规范化 (AC1)', () => {
  it('inserts in_repo / external / explicit-displayName shapes with DTO defaults', async () => {
    await withDb((db) => {
      const inRepo = registerProject(db, { codeRoot: 'C:\\repos\\alpha', docLocationType: 'in_repo' })
      expect(inRepo.id).toMatch(UUID_PATTERN)
      expect(inRepo.codeRoot).toBe('C:/repos/alpha')
      expect(inRepo.displayName).toBe('alpha')
      expect(inRepo.docLocationPath).toBeNull()
      expect(inRepo.createdAt).toMatch(ISO_PATTERN)
      expect(inRepo.lastActivatedAt).toBeNull()

      const external = registerProject(db, {
        codeRoot: 'C:\\repos\\beta',
        docLocationType: 'external',
        docLocationPath: 'C:\\docs\\beta',
      })
      expect(external.docLocationType).toBe('external')
      expect(external.docLocationPath).toBe('C:\\docs\\beta')

      const named = registerProject(db, { codeRoot: 'C:\\repos\\gamma', docLocationType: 'in_repo', displayName: '工作台' })
      expect(named.displayName).toBe('工作台')

      expect(listProjects(db).map(project => project.codeRoot).sort()).toEqual([
        'C:/repos/alpha',
        'C:/repos/beta',
        'C:/repos/gamma',
      ])
    })
  })

  it('normalizes code_root so separator/trailing-slash variants hit ERR_PROJECT_EXISTS (single row)', async () => {
    await withDb((db) => {
      registerInRepo(db, 'C:\\repos\\alpha')
      const variant = capture(() => registerInRepo(db, 'C:/repos/alpha/'))
      expectRepoError(variant, 'ERR_PROJECT_EXISTS', /already registered/)
      expect(capture(() => registerInRepo(db, 'C:\\repos\\alpha'))).toBeInstanceOf(WorkbenchRepoError)
      expect(listProjects(db)).toHaveLength(1)
    })
  })
})

describe('updateProject — patch 更新 (AC1)', () => {
  it('applies rename and coherent repoint patches, returning the updated DTO', async () => {
    await withDb((db) => {
      const project = registerProject(db, {
        codeRoot: 'C:\\repos\\alpha',
        docLocationType: 'external',
        docLocationPath: 'C:\\docs\\alpha',
      })
      const renamed = updateProject(db, project.id, { displayName: '重命名' })
      expect(renamed.displayName).toBe('重命名')
      expect(renamed.codeRoot).toBe('C:/repos/alpha')
      expect(renamed.docLocationType).toBe('external')

      const repointed = updateProject(db, project.id, { docLocationType: 'in_repo', docLocationPath: null })
      expect(repointed.docLocationType).toBe('in_repo')
      expect(repointed.docLocationPath).toBeNull()
      expect(repointed.displayName).toBe('重命名')
    })
  })

  it('unknown id → ERR_PROJECT_NOT_FOUND, store untouched', async () => {
    await withDb((db) => {
      const error = capture(() => updateProject(db, 'no-such-id', { displayName: 'x' }))
      expectRepoError(error, 'ERR_PROJECT_NOT_FOUND', /does not exist/)
      expect(listProjects(db)).toEqual([])
    })
  })

  it('incoherent patch (in_repo keeps external path) fails the row CHECK loudly and atomically', async () => {
    await withDb((db) => {
      const project = registerProject(db, {
        codeRoot: 'C:\\repos\\alpha',
        docLocationType: 'external',
        docLocationPath: 'C:\\docs\\alpha',
      })
      const error = capture(() => updateProject(db, project.id, { docLocationType: 'in_repo' }))
      expect(error).toBeInstanceOf(Error)
      expect(error).not.toBeInstanceOf(WorkbenchRepoError)
      expect((error as Error).message).toMatch(/constraint/i)
      // UPDATE 原子回滚:行保持原值。
      const after = findProject(db, project.id)
      expect(after?.docLocationType).toBe('external')
      expect(after?.docLocationPath).toBe('C:\\docs\\alpha')
    })
  })
})

describe('removeProject — 级联删除 + 激活指针清理 (AC1/AC3/AC5-CASCADE)', () => {
  it('FK CASCADE removes session_links and the derived snapshot rows; no hand-written snapshot deletes', async () => {
    await withDb((db) => {
      const project = registerInRepo(db, 'C:\\repos\\alpha')
      recordSessionLink(db, { projectId: project.id, taskKey: '2.1', sessionId: 'session-a' })
      seedSnapshots(db, project.id)
      removeProject(db, project.id)
      expect(listProjects(db)).toEqual([])
      expect(listSessionLinks(db, project.id)).toEqual([])
      // Engine-level CASCADE per schema-v1.sql (all four child tables declare it);
      // the repos layer issues DELETE only on projects + the app_state pointer.
      expect(db.prepare('SELECT COUNT(*) AS c FROM task_snapshot').get()).toMatchObject({ c: 0 })
      expect(db.prepare('SELECT COUNT(*) AS c FROM feature_snapshot').get()).toMatchObject({ c: 0 })
      expect(db.prepare('SELECT COUNT(*) AS c FROM sync_state').get()).toMatchObject({ c: 0 })
    })
  })

  it('removing the active project clears the pointer row in the same transaction — getActiveProject falls back to null, no FK error (AC3)', async () => {
    await withDb((db) => {
      const project = registerInRepo(db, 'C:\\repos\\alpha')
      activateProject(db, project.id)
      removeProject(db, project.id)
      expect(activePointerRows(db)).toBe(0)
      expect(getActiveProjectId(db)).toBeNull()
      expect(getActiveProject(db)).toBeNull()
    })
  })

  it('removing a non-active project leaves the active pointer intact', async () => {
    await withDb((db) => {
      const active = registerInRepo(db, 'C:\\repos\\alpha')
      const other = registerInRepo(db, 'C:\\repos\\beta')
      activateProject(db, active.id)
      removeProject(db, other.id)
      expect(getActiveProjectId(db)).toBe(active.id)
      expect(getActiveProject(db)?.id).toBe(active.id)
    })
  })

  it('unknown id → ERR_PROJECT_NOT_FOUND', async () => {
    await withDb((db) => {
      const error = capture(() => removeProject(db, 'no-such-id'))
      expectRepoError(error, 'ERR_PROJECT_NOT_FOUND', /does not exist/)
    })
  })
})

describe('activateProject — 单激活事务不变量 (AC2/AC5-并发写序列)', () => {
  it('activates: pointer set, last_activated_at stamped, exactly one app_state row', async () => {
    await withDb((db) => {
      const project = registerInRepo(db, 'C:\\repos\\alpha')
      activateProject(db, project.id)
      expect(getActiveProjectId(db)).toBe(project.id)
      expect(activePointerRows(db)).toBe(1)
      const active = getActiveProject(db)
      expect(active?.id).toBe(project.id)
      expect(active?.lastActivatedAt).toMatch(ISO_PATTERN)
    })
  })

  it('switching A→B keeps a single pointer row and preserves the previous last_activated_at', async () => {
    await withDb(async (db) => {
      const a = registerInRepo(db, 'C:\\repos\\alpha')
      const b = registerInRepo(db, 'C:\\repos\\beta')
      activateProject(db, a.id)
      const aActivatedAt = getActiveProject(db)?.lastActivatedAt
      await tick()
      activateProject(db, b.id)
      expect(getActiveProjectId(db)).toBe(b.id)
      expect(activePointerRows(db)).toBe(1)
      const pa = findProject(db, a.id)
      const pb = findProject(db, b.id)
      expect(pa?.lastActivatedAt).toBe(aActivatedAt)
      expect(new Date(pb?.lastActivatedAt ?? 0).getTime()).toBeGreaterThan(new Date(aActivatedAt ?? 0).getTime())
    })
  })

  it('interleaved write sequence A/B/A/B… — at most one active id at every step, last write wins', async () => {
    await withDb(async (db) => {
      const a = registerInRepo(db, 'C:\\repos\\alpha')
      const b = registerInRepo(db, 'C:\\repos\\beta')
      const sequence = [a, b, a, b, a, b]
      for (const target of sequence) {
        activateProject(db, target.id)
        expect(getActiveProjectId(db)).toBe(target.id)
        expect(activePointerRows(db)).toBe(1)
      }
      expect(getActiveProjectId(db)).toBe(b.id)
    })
  })

  it('violation sequence: activating an unknown id throws ERR_PROJECT_NOT_FOUND and leaves the pointer intact (transaction rollback)', async () => {
    await withDb(async (db) => {
      const a = registerInRepo(db, 'C:\\repos\\alpha')
      activateProject(db, a.id)
      const aActivatedAt = getActiveProject(db)?.lastActivatedAt
      await tick()
      const error = capture(() => activateProject(db, 'no-such-id'))
      expectRepoError(error, 'ERR_PROJECT_NOT_FOUND', /cannot activate/)
      expect(getActiveProjectId(db)).toBe(a.id)
      expect(activePointerRows(db)).toBe(1)
      expect(findProject(db, a.id)?.lastActivatedAt).toBe(aActivatedAt)
    })
  })

  it('no activation at all → null reads', async () => {
    await withDb((db) => {
      registerInRepo(db, 'C:\\repos\\alpha')
      expect(getActiveProjectId(db)).toBeNull()
      expect(getActiveProject(db)).toBeNull()
    })
  })
})

describe('getActiveProject — 失效引用回退 (AC3)', () => {
  it('a dangling pointer (fault injection) falls back to null on the join read without throwing', async () => {
    await withDb((db) => {
      // Fault injection: bypass the repos write path to corrupt app_state —
      // the defensive read contract is what this test pins down.
      db.prepare("INSERT INTO app_state (key, value) VALUES ('active_project_id', ?)").run(JSON.stringify('bogus-id'))
      expect(getActiveProjectId(db)).toBe('bogus-id')
      expect(getActiveProject(db)).toBeNull()
    })
  })
})

describe('session_links — 幂等登记 / 结束 / 历史 (AC4/AC5-UNIQUE 幂等)', () => {
  it('records a new link; repeated registration is idempotent refresh (single row, stable id, started_at refreshed)', async () => {
    await withDb(async (db) => {
      const project = registerInRepo(db, 'C:\\repos\\alpha')
      const input = { projectId: project.id, taskKey: '2.1', sessionId: 'session-a' }
      const first = recordSessionLink(db, input)
      expect(first.id).toMatch(UUID_PATTERN)
      expect(first.status).toBe('active')
      expect(first.startedAt).toMatch(ISO_PATTERN)
      expect(first.endedAt).toBeNull()
      await tick()
      const again = recordSessionLink(db, input)
      expect(again.id).toBe(first.id)
      expect(again.status).toBe('active')
      expect(again.endedAt).toBeNull()
      expect(new Date(again.startedAt).getTime()).toBeGreaterThan(new Date(first.startedAt).getTime())
      expect(sessionLinkRows(db, project.id)).toBe(1)
    })
  })

  it('recording for an unknown project → ERR_PROJECT_NOT_FOUND', async () => {
    await withDb((db) => {
      const error = capture(() => recordSessionLink(db, { projectId: 'no-such-project', taskKey: '2.1', sessionId: 'session-a' }))
      expectRepoError(error, 'ERR_PROJECT_NOT_FOUND', /does not exist/)
    })
  })

  it('multiple sessions per task = multiple rows; project/task history queries include ended, new→old (含历史)', async () => {
    await withDb(async (db) => {
      const project = registerInRepo(db, 'C:\\repos\\alpha')
      const linkA = recordSessionLink(db, { projectId: project.id, taskKey: '2.1', sessionId: 'session-a' })
      await tick()
      const linkB = recordSessionLink(db, { projectId: project.id, taskKey: '2.1', sessionId: 'session-b' })
      await tick()
      recordSessionLink(db, { projectId: project.id, taskKey: '3.1', sessionId: 'session-c' })
      endSessionLink(db, linkB.id)

      const all = listSessionLinks(db, project.id)
      expect(all.map(link => link.sessionId)).toEqual(['session-c', 'session-b', 'session-a'])
      expect(all.find(link => link.id === linkB.id)?.status).toBe('ended')
      expect(all.find(link => link.id === linkA.id)?.status).toBe('active')
      expect(sessionLinkRows(db, project.id)).toBe(3)

      const forTask = listSessionLinksByTask(db, project.id, '2.1')
      expect(forTask.map(link => link.sessionId)).toEqual(['session-b', 'session-a'])
      expect(listSessionLinksByTask(db, project.id, '9.9')).toEqual([])
      expect(listSessionLinks(db, 'no-such-project')).toEqual([])
    })
  })

  it('endSessionLink sets ended without deleting the row; repeated end is a no-op; unknown id → ERR_SESSION_LINK_NOT_FOUND', async () => {
    await withDb(async (db) => {
      const project = registerInRepo(db, 'C:\\repos\\alpha')
      const link = recordSessionLink(db, { projectId: project.id, taskKey: '2.1', sessionId: 'session-a' })
      endSessionLink(db, link.id)
      const ended = listSessionLinksByTask(db, project.id, '2.1').find(row => row.id === link.id)
      expect(ended?.status).toBe('ended')
      expect(ended?.endedAt).toMatch(ISO_PATTERN)
      expect(ended?.startedAt).toBe(link.startedAt)
      expect(sessionLinkRows(db, project.id)).toBe(1)

      await tick()
      endSessionLink(db, link.id)
      const reEnded = listSessionLinksByTask(db, project.id, '2.1').find(row => row.id === link.id)
      expect(reEnded?.endedAt).toBe(ended?.endedAt)

      const error = capture(() => endSessionLink(db, 'no-such-link'))
      expectRepoError(error, 'ERR_SESSION_LINK_NOT_FOUND', /does not exist/)
    })
  })

  it('ended→re-record same session restores active on the same row (同 session 复挂) (AC5-复挂)', async () => {
    await withDb(async (db) => {
      const project = registerInRepo(db, 'C:\\repos\\alpha')
      const input = { projectId: project.id, taskKey: '2.1', sessionId: 'session-a' }
      const link = recordSessionLink(db, input)
      await tick()
      endSessionLink(db, link.id)
      expect(sessionLinkRows(db, project.id)).toBe(1)

      const revived = recordSessionLink(db, input)
      expect(revived.id).toBe(link.id)
      expect(revived.status).toBe('active')
      expect(revived.endedAt).toBeNull()
      expect(new Date(revived.startedAt).getTime()).toBeGreaterThan(new Date(link.startedAt).getTime())
      expect(sessionLinkRows(db, project.id)).toBe(1)
    })
  })
})

describe('session_links — 发起侧收敛 supersede + 重启持久化 (4.2 AC5/AC3)', () => {
  it('supersede ends the task\'s OTHER active links, keeps the keep-id and other tasks alone', async () => {
    await withDb(async (db) => {
      const project = registerInRepo(db, 'C:\\repos\\alpha')
      const keep = recordSessionLink(db, { projectId: project.id, taskKey: 'alpha/2.1', sessionId: 'session-new' })
      await tick()
      recordSessionLink(db, { projectId: project.id, taskKey: 'alpha/2.1', sessionId: 'session-old-a' })
      await tick()
      const endedAlready = recordSessionLink(db, { projectId: project.id, taskKey: 'alpha/2.1', sessionId: 'session-old-b' })
      endSessionLink(db, endedAlready.id)
      const endedAtBefore = listSessionLinksByTask(db, project.id, 'alpha/2.1')
        .find(row => row.sessionId === 'session-old-b')?.endedAt
      await tick()
      const otherTask = recordSessionLink(db, { projectId: project.id, taskKey: 'alpha/3.1', sessionId: 'session-old-a' })

      const converged = supersedeActiveSessionLinks(db, project.id, 'alpha/2.1', 'session-new')

      expect(converged).toBe(1) // 仅同任务其余 active 行(oldA);ended/异任务行不动
      const rows = listSessionLinksByTask(db, project.id, 'alpha/2.1')
      const byId = new Map(rows.map(row => [row.sessionId, row]))
      expect(byId.get('session-new')?.status).toBe('active')
      expect(byId.get('session-new')?.endedAt).toBeNull()
      expect(byId.get('session-old-a')?.status).toBe('ended')
      expect(byId.get('session-old-a')?.endedAt).toMatch(ISO_PATTERN)
      expect(byId.get('session-old-b')?.endedAt).toBe(endedAtBefore) // 已 ended 行不被刷新
      expect(listSessionLinksByTask(db, project.id, 'alpha/3.1')[0]?.id).toBe(otherTask.id)
      expect(listSessionLinksByTask(db, project.id, 'alpha/3.1')[0]?.status).toBe('active')
      expect(keep.id).toBeDefined()
    })
  })

  it('supersede re-run is idempotent (0 rows) and an unknown task converges nothing', async () => {
    await withDb(async (db) => {
      const project = registerInRepo(db, 'C:\\repos\\alpha')
      recordSessionLink(db, { projectId: project.id, taskKey: 'alpha/2.1', sessionId: 'session-keep' })
      expect(supersedeActiveSessionLinks(db, project.id, 'alpha/2.1', 'session-keep')).toBe(0)
      expect(supersedeActiveSessionLinks(db, project.id, 'alpha/9.9', 'session-keep')).toBe(0)
      expect(supersedeActiveSessionLinks(db, 'no-such-project', 'alpha/2.1', 'session-keep')).toBe(0)
    })
  })

  it('挂接关系经 store 关闭重开仍在(Story2 AC3 重启持久化)', async () => {
    const dir = makeScratch()
    let linkId: string
    const first = await openDatabase(dir)
    try {
      const project = registerInRepo(first.db, 'C:\\repos\\restart')
      const link = recordSessionLink(first.db, { projectId: project.id, taskKey: 'alpha/2.1', sessionId: 'session-keep' })
      linkId = link.id
    } finally {
      first.db.close()
    }
    const second = await openDatabase(dir)
    try {
      const project = second.db.prepare('SELECT id FROM projects').get() as { id: string }
      const rows = listSessionLinksByTask(second.db, project.id, 'alpha/2.1')
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ id: linkId, sessionId: 'session-keep', status: 'active', endedAt: null })
    } finally {
      second.db.close()
    }
  })
})
