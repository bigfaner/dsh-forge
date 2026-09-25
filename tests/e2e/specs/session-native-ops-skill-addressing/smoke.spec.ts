// @feature dsh-forge-m3 | @web-e2e | @journey session-native-ops-skill-addressing
// Journey smoke test — the session-native chain END TO END in one world
// (happy-path Outcomes only):
//   Step 1 read-only query (board parity) → Step 2 claim (actor audit + reflow)
//   → Step 3 record + submit (terminal state + rendered record + tri-consistency)
//   → Step 4 the 15 skills resolve by flat name (repo zero-new-files).
// Traceability: docs/features/dsh-forge-m3/testing/session-native-ops-skill-
// addressing/journey.md (Happy Path Steps 1-4) + contracts success faces.

import { join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { REFLOW_BUDGET_MS, assertSkillsResolve, freshRoot, measureReflow, openKernelDb, recordMarkdown, snapshotTree, WorldManager, bridgeInvoke } from '../_lib/journey-world.ts'
import { buildMainWorld, SESS_FEATURE, TASK_1 } from './harness.ts'

const RECORD_MARK = 'sess-ops smoke 执行记录锚点。'

test('smoke/session-native-ops-skill-addressing: 只读查询(看板同口径)→ claim(actor 审计 + ≤5s 回流)→ 记录先落 + submit(终态 + 记录渲染 + 三方一致)→ 15 技能扁平名解析(仓零新增)', async ({ }, testInfo) => {
  testInfo.setTimeout(900_000)
  const manager = new WorldManager()
  const kernel = await buildMainWorld(freshRoot('sess-smoke'))
  const actor = 'session:sess-ops-smoke'
  try {
    const world = await manager.acquire(kernel, 'main')
    const { page } = world

    // ---- Step 1:会话内任务查询(只读 tool,看板同口径)--------------
    const queried = await bridgeInvoke<Array<{ key: string; status: string }>>(page, 'taskQuery', [{ projectId: world.projectId, featureSlug: SESS_FEATURE }])
    expect(queried.length, 'Step 1:查询非空(4 任务)').toBe(4)
    const board = await bridgeInvoke<{ tasks: Array<{ key: string; status: string }> }>(page, 'getTaskBoard', [world.projectId])
    const boardBy = new Map(board.tasks.map(row => [row.key, row.status]))
    for (const row of queried) {
      expect(boardBy.get(row.key), `Step 1:${row.key} 与看板同口径`).toBe(row.status)
    }

    // ---- Step 2:claim(actor 留痕 + ≤5s 回流)-----------------------
    const claimMs = await measureReflow(page, TASK_1, 'in_progress', async () => {
      const claimed = await bridgeInvoke<{ status: string; source: string | null }>(page, 'taskClaim', [{ projectId: world.projectId, taskKey: TASK_1 }, actor])
      expect(claimed.status).toBe('in_progress')
      expect(claimed.source, '来源投影 = [会话]').toBe('session')
    })
    expect(claimMs, `Step 2:回流 ≤${String(REFLOW_BUDGET_MS)}ms`).toBeLessThanOrEqual(REFLOW_BUDGET_MS)

    // ---- Step 3:记录先落 → submit → 终态 + 记录渲染 + 三方一致 ------
    const recordsDir = join(kernel.featuresRoot, SESS_FEATURE, 'tasks', 'records')
    mkdirSync(recordsDir, { recursive: true })
    writeFileSync(join(recordsDir, '1-x.md'), recordMarkdown({ actor, summary: RECORD_MARK }), 'utf8')
    const submitted = await bridgeInvoke<{ status: string }>(page, 'taskSubmit', [{ projectId: world.projectId, taskKey: TASK_1 }, actor])
    expect(submitted.status, 'Step 3:submit → completed').toBe('completed')

    const detail = await bridgeInvoke<{ records: Array<{ summary: string }> }>(page, 'taskGet', [{ projectId: world.projectId, taskKey: TASK_1 }])
    expect(detail.records.some(row => row.summary.includes(RECORD_MARK)), 'Step 3:执行记录渲染入内核').toBe(true)

    const boardAfter = await bridgeInvoke<{ tasks: Array<{ key: string; status: string; source: string | null; updatedBy?: string }> }>(page, 'getTaskBoard', [world.projectId])
    const row = boardAfter.tasks.find(candidate => candidate.key === TASK_1)
    expect(row?.status, 'Step 3:看板终态').toBe('completed')
    expect(row?.source, 'Step 3:看板来源 = session(三方一致之一)').toBe('session')
    expect(row?.updatedBy, 'Step 3:审计 actor 一致(三方一致之二)').toBe(actor)

    const db = await openKernelDb(kernel.userDataDir)
    try {
      const sqlite = db as unknown as { prepare: (sql: string) => { get: (...args: string[]) => { updated_by: string } } }
      expect(sqlite.prepare('SELECT updated_by FROM task WHERE project_id = ? AND task_key = ?').get(world.projectId, TASK_1).updated_by,
        'Step 3:内核审计同源(三方一致之三)').toBe(actor)
    } finally {
      ;(db as unknown as { close(): void }).close()
    }

    // ---- Step 4:15 技能扁平名寻址(项目仓零新增)---------------------
    const repoBefore = snapshotTree(kernel.codeRoot)
    assertSkillsResolve(world.shell.profileDir)
    expect(snapshotTree(kernel.codeRoot), 'Step 4:项目仓零新增文件(Invariant)').toEqual(repoBefore)
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await manager.closeAll()
  }
})
