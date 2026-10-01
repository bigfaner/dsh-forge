import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { insertExpectationPlaceholder, listProjectionExpectations, listWorkspaceProjectionRows, recordProjectionDegraded, recordSuccessfulPush, getWorkspaceProjectionRow } from '../src/main/workbench/projection/expectation-repo.ts'
import { diffProjection } from '../src/main/workbench/projection/diff.ts'
import { reconcileVerdictEvent, nextProjectionState } from '../src/main/workbench/projection/state-machine.ts'
import { registerProject, setProjectArchived, setProjectProjectionState, setProjectWorkspaceId } from '../src/main/workbench/repos/projects.ts'
import { WorkbenchRepoError, type RepoDb } from '../src/main/workbench/repos/types.ts'
import { openDatabase, type DatabaseSyncLike } from '../src/main/workbench/store/db.ts'

// 任务 3.1 — workspace_projection 期望快照仓储(er-diagram §workspace_projection
// 行级契约)+ repos 写位(单写者 Hard Rule:projection 域经 repos/projects.ts
// 写 projects 信息位)。NOT NULL 列的占位哨兵('')在 DTO 面映射 null。
// 路径用真实绝对 tmp 目录(registerProject 的 resolve 规范化会展开相对写法)。

const scratches: string[] = []

function makeScratch(): string {
  const dir = join(tmpdir(), `dsh-forge-projection-repo-${String(process.pid)}-${String(scratches.length)}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  scratches.push(dir)
  return dir
}

/** 注册用绝对 codeRoot(tmp 下唯一目录,正斜杠形态 = 规范化存储值)。 */
function projPath(name: string): string {
  return join(tmpdir(), `dsh-forge-projection-p-${name}`).replaceAll('\\', '/')
}

afterEach(() => {
  for (const dir of scratches.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 10 })
})

async function withDb(run: (db: DatabaseSyncLike) => void | Promise<void>): Promise<void> {
  const { db } = await openDatabase(makeScratch())
  try {
    await run(db as RepoDb)
  } finally {
    db.close()
  }
}

function expectRepoError(error: unknown, code: string): void {
  expect(error).toBeInstanceOf(WorkbenchRepoError)
  expect((error as WorkbenchRepoError).code).toBe(code)
}

function capture(fn: () => void): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  return undefined
}

describe('expectation-repo — 注册即占位(AC-1)', () => {
  it('占位行:projects 基线值(path/title/order_idx)+ 空串哨兵(workspace_id/pushed_at)+ last_error NULL', async () => {
    await withDb((db) => {
      const project = registerProject(db, { codeRoot: projPath('a'), docLocationType: 'in_repo', displayName: 'Alpha' })
      insertExpectationPlaceholder(db, project.id)
      const row = getWorkspaceProjectionRow(db, project.id)
      expect(row).toEqual({
        projectId: project.id,
        workspaceId: null,
        path: projPath('a'),
        title: 'Alpha',
        orderIdx: 0,
        pushedAt: null,
        lastError: null,
      })
      // 存储哨兵原形(NOT NULL 列占位语义钉定;DTO 面 '' → null)。
      const raw = db.prepare('SELECT workspace_id, pushed_at FROM workspace_projection WHERE project_id = ?').get(project.id) as { workspace_id: string; pushed_at: string }
      expect(raw.workspace_id).toBe('')
      expect(raw.pushed_at).toBe('')
    })
  })

  it('幂等:重复占位不覆盖既有审计行;未知项目 → ERR_PROJECT_NOT_FOUND', async () => {
    await withDb((db) => {
      const project = registerProject(db, { codeRoot: projPath('b'), docLocationType: 'in_repo', displayName: 'Beta' })
      insertExpectationPlaceholder(db, project.id)
      recordSuccessfulPush(db, { projectId: project.id, workspaceId: 'ws-1', path: projPath('b'), title: 'Beta', orderIdx: 0, pushedAt: '2026-09-29T01:00:00.000Z' })
      insertExpectationPlaceholder(db, project.id) // INSERT OR IGNORE:审计行不动
      expect(getWorkspaceProjectionRow(db, project.id)?.workspaceId).toBe('ws-1')
      expectRepoError(capture(() => insertExpectationPlaceholder(db, 'ghost')), 'ERR_PROJECT_NOT_FOUND')
    })
  })
})

describe('expectation-repo — 最近成功投影回写(AC-1)', () => {
  it('四列回写 + last_error 清位 + projects.workspace_id 信息位镜像', async () => {
    await withDb((db) => {
      const project = registerProject(db, { codeRoot: projPath('c'), docLocationType: 'in_repo', displayName: 'Gamma' })
      insertExpectationPlaceholder(db, project.id)
      recordProjectionDegraded(db, project.id, 'ERR_PROJECTION_CHANNEL_UNAVAILABLE')
      recordSuccessfulPush(db, { projectId: project.id, workspaceId: 'ws-9', path: projPath('c'), title: 'Gamma', orderIdx: 3, pushedAt: '2026-09-29T02:00:00.000Z' })
      expect(getWorkspaceProjectionRow(db, project.id)).toEqual({
        projectId: project.id,
        workspaceId: 'ws-9',
        path: projPath('c'),
        title: 'Gamma',
        orderIdx: 3,
        pushedAt: '2026-09-29T02:00:00.000Z',
        lastError: null,
      })
      const mirror = db.prepare('SELECT workspace_id FROM projects WHERE id = ?').get(project.id) as { workspace_id: string | null }
      expect(mirror.workspace_id).toBe('ws-9')
    })
  })

  it('dsh 侧删除重建后按 path 复连:同 path 新 id 覆写回写(er-diagram「由 ensure 更新」)', async () => {
    await withDb((db) => {
      const project = registerProject(db, { codeRoot: projPath('d'), docLocationType: 'in_repo', displayName: 'Delta' })
      insertExpectationPlaceholder(db, project.id)
      recordSuccessfulPush(db, { projectId: project.id, workspaceId: 'ws-old', path: projPath('d'), title: 'Delta', orderIdx: 0, pushedAt: '2026-09-29T03:00:00.000Z' })
      // 复连:ensure(create-or-adopt)outcome 携同 path 新 id。
      recordSuccessfulPush(db, { projectId: project.id, workspaceId: 'ws-new', path: projPath('d'), title: 'Delta', orderIdx: 0, pushedAt: '2026-09-29T04:00:00.000Z' })
      expect(getWorkspaceProjectionRow(db, project.id)?.workspaceId).toBe('ws-new')
      expect(db.prepare('SELECT workspace_id FROM projects WHERE id = ?').get(project.id)).toMatchObject({ workspace_id: 'ws-new' })
    })
  })

  it('v3 存量项目无占位行也能直接回写(UPSERT);未知项目 → ERR_PROJECT_NOT_FOUND', async () => {
    await withDb((db) => {
      const project = registerProject(db, { codeRoot: projPath('e'), docLocationType: 'in_repo', displayName: 'Eps' })
      recordSuccessfulPush(db, { projectId: project.id, workspaceId: 'ws-1', path: projPath('e'), title: 'Eps', orderIdx: 0, pushedAt: '2026-09-29T05:00:00.000Z' })
      expect(listWorkspaceProjectionRows(db)).toHaveLength(1)
      expectRepoError(
        capture(() => recordSuccessfulPush(db, { projectId: 'ghost', workspaceId: 'ws-x', path: projPath('e'), title: 'G', orderIdx: 0, pushedAt: '2026-09-29T05:00:00.000Z' })),
        'ERR_PROJECT_NOT_FOUND',
      )
    })
  })
})

describe('expectation-repo — degraded 审计(AC-1)', () => {
  it('last_error 落位,最近成功 push 审计列保留(降级不清账)', async () => {
    await withDb((db) => {
      const project = registerProject(db, { codeRoot: projPath('f'), docLocationType: 'in_repo', displayName: 'Zeta' })
      insertExpectationPlaceholder(db, project.id)
      recordSuccessfulPush(db, { projectId: project.id, workspaceId: 'ws-1', path: projPath('f'), title: 'Zeta', orderIdx: 0, pushedAt: '2026-09-29T06:00:00.000Z' })
      recordProjectionDegraded(db, project.id, 'ERR_PROJECTION_OP_FAILED: name-conflict')
      const row = getWorkspaceProjectionRow(db, project.id)
      expect(row?.lastError).toBe('ERR_PROJECTION_OP_FAILED: name-conflict')
      expect(row?.workspaceId).toBe('ws-1')
      expect(row?.pushedAt).toBe('2026-09-29T06:00:00.000Z')
    })
  })

  it('从未推送即失败:占位 + last_error(workspace_id/pushed_at 保持 null 语义)', async () => {
    await withDb((db) => {
      const project = registerProject(db, { codeRoot: projPath('g'), docLocationType: 'in_repo', displayName: 'Eta' })
      recordProjectionDegraded(db, project.id, 'ERR_PROJECTION_CHANNEL_UNAVAILABLE')
      const row = getWorkspaceProjectionRow(db, project.id)
      expect(row).toMatchObject({ workspaceId: null, pushedAt: null, lastError: 'ERR_PROJECTION_CHANNEL_UNAVAILABLE', title: 'Eta' })
      expectRepoError(capture(() => recordProjectionDegraded(db, 'ghost', 'x')), 'ERR_PROJECT_NOT_FOUND')
    })
  })
})

describe('expectation-repo — 期望并集读(AC-1/AC-6:v3 回填交互)', () => {
  it('无行存量项目按 projects 权威列合成待推送期望;有行以行为偏差基线;archived 位透传', async () => {
    await withDb((db) => {
      const first = registerProject(db, { codeRoot: projPath('u1'), docLocationType: 'in_repo', displayName: 'First' })
      const second = registerProject(db, { codeRoot: projPath('u2'), docLocationType: 'in_repo', displayName: 'Second' })
      const archived = registerProject(db, { codeRoot: projPath('u3'), docLocationType: 'in_repo', displayName: 'Arch' })
      setProjectArchived(db, archived.id, true)
      recordSuccessfulPush(db, { projectId: first.id, workspaceId: 'ws-1', path: projPath('u1'), title: 'First-old', orderIdx: 0, pushedAt: '2026-09-29T07:00:00.000Z' })
      const expectations = listProjectionExpectations(db)
      expect(expectations.map(exp => exp.projectId)).toEqual([first.id, second.id, archived.id])
      expect(expectations[0]).toEqual({
        projectId: first.id,
        path: projPath('u1'),
        expectedTitle: 'First',
        orderIdx: 0,
        archived: false,
        pushedWorkspaceId: 'ws-1',
        pushedTitle: 'First-old',
        pushedAt: '2026-09-29T07:00:00.000Z',
        lastError: null,
      })
      // v3 存量形态:无行 → pushed* 全 null(收数前 pending 期望)。
      expect(expectations[1]).toMatchObject({ projectId: second.id, expectedTitle: 'Second', orderIdx: 1, archived: false, pushedWorkspaceId: null, pushedTitle: null })
      expect(expectations[2]).toMatchObject({ projectId: archived.id, archived: true })
    })
  })

  it('存量 pending 收数全链:合成期望 → diff(收数/偏差)→ 状态机迁移', async () => {
    await withDb((db) => {
      const stock = registerProject(db, { codeRoot: projPath('stock'), docLocationType: 'in_repo', displayName: 'Stock' })
      setProjectProjectionState(db, stock.id, 'pending') // v3 迁移回填口径
      const expectations = listProjectionExpectations(db)
      // 空快照(收数前):ensure 待推,不迁移。
      const before = diffProjection(expectations, [])
      expect(before.plans[0]?.ops).toEqual([{ kind: 'ensure', canonicalPath: projPath('stock'), title: 'Stock' }])
      expect(before.rows[0]?.verdict).toBe('unprojected')
      // 实况同名在场(dsh 侧本就有该目录的 workspace):adopted → match → healthy。
      const adopted = diffProjection(expectations, [{ workspaceId: 'ws-stock', path: projPath('stock'), title: 'Stock', orderIdx: 0 }])
      expect(adopted.rows[0]?.verdict).toBe('match')
      const matchEvent = reconcileVerdictEvent(adopted.rows[0]?.verdict ?? 'unprojected')
      expect(matchEvent).toBe('reconcile_match')
      expect(nextProjectionState('pending', matchEvent ?? 'push_failed')).toBe('healthy')
      // 实况异名在场:无推送基线 → 零偏差,rename 待收敛(unprojected,不迁移)。
      const mismatch = diffProjection(expectations, [{ workspaceId: 'ws-stock', path: projPath('stock'), title: 'User name', orderIdx: 0 }])
      expect(mismatch.rows[0]?.verdict).toBe('unprojected')
      expect(mismatch.rows[0]?.deviations).toEqual([])
    })
  })
})

describe('repos 写位 — 投影信息位(单写者 Hard Rule 通道)', () => {
  it('setProjectProjectionState / setProjectWorkspaceId 落位;未知 id → ERR_PROJECT_NOT_FOUND', async () => {
    await withDb((db) => {
      const project = registerProject(db, { codeRoot: projPath('h'), docLocationType: 'in_repo', displayName: 'Theta' })
      setProjectProjectionState(db, project.id, 'degraded')
      setProjectWorkspaceId(db, project.id, 'ws-7')
      const row = db.prepare('SELECT projection_state, workspace_id FROM projects WHERE id = ?').get(project.id) as { projection_state: string; workspace_id: string | null }
      expect(row).toEqual({ projection_state: 'degraded', workspace_id: 'ws-7' })
      setProjectWorkspaceId(db, project.id, null)
      expect(db.prepare('SELECT workspace_id FROM projects WHERE id = ?').get(project.id)).toMatchObject({ workspace_id: null })
      expectRepoError(capture(() => setProjectProjectionState(db, 'ghost', 'healthy')), 'ERR_PROJECT_NOT_FOUND')
      expectRepoError(capture(() => setProjectWorkspaceId(db, 'ghost', 'ws-1')), 'ERR_PROJECT_NOT_FOUND')
    })
  })

  it('归档(必答⑤):archived 翻转不动期望快照行(期望不变,workspace 保留)', async () => {
    await withDb((db) => {
      const project = registerProject(db, { codeRoot: projPath('i'), docLocationType: 'in_repo', displayName: 'Iota' })
      insertExpectationPlaceholder(db, project.id)
      recordSuccessfulPush(db, { projectId: project.id, workspaceId: 'ws-1', path: projPath('i'), title: 'Iota', orderIdx: 0, pushedAt: '2026-09-29T08:00:00.000Z' })
      const before = getWorkspaceProjectionRow(db, project.id)
      setProjectArchived(db, project.id, true)
      expect(getWorkspaceProjectionRow(db, project.id)).toEqual(before)
      expect(listWorkspaceProjectionRows(db)).toHaveLength(1)
    })
  })
})
