// @feature dsh-forge-m3 | @web-e2e | @journey session-native-ops-skill-addressing
// Traceability: docs/features/dsh-forge-m3/testing/session-native-ops-skill-
// addressing/contracts/step-1-session-task-query.md — Outcomes:
//   success            — 会话内只读查询(dsh tool 同面动词)成功,结果与
//                        数据内核一致(看板同口径);零写入。
//   tool-unavailable-degraded — DEFERRED(无注入缝):dsh tool 桥传输故障
//                        (ERR_TOOL_BRIDGE_UNAVAILABLE 的重试后上抛面)在
//                        6.2 基座无 selective seam;覆盖留待缝位(见覆盖报告)。
//   actor-missing-fail-closed — 无会话身份的调用被拒(审计纪律:宁失败不
//                        误记);零写入、零审计行。
// fixture_spec: Project(sqlite)/Task(任一七态)— main world。

import { expect, test } from '@playwright/test'
import { freshRoot, openKernelDb, WorldManager, bridgeInvoke } from '../_lib/journey-world.ts'
import { buildMainWorld, SESS_FEATURE } from './harness.ts'
import type { KernelWorld } from '../_lib/journey-world.ts'

test.describe.serial('session-native-ops-skill-addressing / step 1: 会话内任务查询(只读 tool)', () => {
  const manager = new WorldManager()
  let kernel: KernelWorld | null = null

  test.beforeAll(async () => {
    kernel = await buildMainWorld(freshRoot('sess-s1'))
  })

  test.afterAll(async () => {
    await manager.closeAll()
  })

  // Outcome "success" — 只读查询成功,与看板同口径。
  test('step1/success: the session-side read-only query answers with the kernel rows (board-parity), zero writes', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main')
    const { page } = world

    // 只读 tool 同面:taskQuery(限定 feature 语境)。
    const queried = await bridgeInvoke<Array<{ key: string; status: string; blockers: string[]; title: string }>>(
      page, 'taskQuery', [{ projectId: world.projectId, featureSlug: SESS_FEATURE }],
    )
    expect(queried.length, '查询非空(4 任务)').toBe(4)

    // 与看板同口径(getTaskBoard = 看板数据源,同一权威)。
    const board = await bridgeInvoke<{ tasks: Array<{ key: string; status: string; blockers: string[]; title: string }> }>(
      page, 'getTaskBoard', [world.projectId],
    )
    const byKey = new Map(board.tasks.map(row => [row.key, row]))
    for (const row of queried) {
      const boardRow = byKey.get(row.key)
      expect(boardRow, `看板同口径在场:${row.key}`).toBeDefined()
      expect(boardRow?.status, `${row.key} 状态与看板一致`).toBe(row.status)
      expect(boardRow?.blockers, `${row.key} 依赖与看板一致`).toEqual(row.blockers)
      expect(boardRow?.title, `${row.key} 标题与看板一致`).toBe(row.title)
    }

    // State:零写入零状态变更(updated_at 基线不动由零变更保证;行集等价)。
    const db = await openKernelDb(world.kernel.userDataDir)
    try {
      const sqlite = db as unknown as { prepare: (sql: string) => { all: (...args: string[]) => Array<{ task_key: string; updated_by: string | null }> } }
      const rows = sqlite.prepare('SELECT task_key, updated_by FROM task WHERE project_id = ?').all(world.projectId)
      expect(rows.length, '内核行集与查询同基数').toBe(4)
      // 零审计写入 = 零会话 actor(摄入基线行为 'kernel',非 null —— 生成稿误设 null 基线)。
      expect(rows.every(row => !(row.updated_by ?? '').startsWith('session:')), '只读操作零审计写入(零会话 actor)').toBe(true)
    } finally {
      ;(db as unknown as { close(): void }).close()
    }
  })

  // Outcome "actor-missing-fail-closed" — 无身份即拒绝,不产生误记审计。
  test('step1/actor-missing-fail-closed: a write call without a session identity is rejected outright (audit discipline) — zero writes, zero audit rows', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main')
    const { page } = world

    // 构造:无会话身份的执行上下文调用任务工具(actor 缺位)。
    let rejected = false
    try {
      await bridgeInvoke(page, 'taskClaim', [{ projectId: world.projectId, taskKey: 'sess-ops/1' }, ''])
    } catch {
      rejected = true
    }
    expect(rejected, '无身份调用被拒(fail-closed,宁失败不误记)').toBe(true)

    // State:任务行零变更、审计零行。
    const db = await openKernelDb(world.kernel.userDataDir)
    try {
      const sqlite = db as unknown as { prepare: (sql: string) => { get: (...args: string[]) => { status: string; updated_by: string | null } } }
      const row = sqlite.prepare('SELECT status, updated_by FROM task WHERE project_id = ? AND task_key = ?').get(world.projectId, 'sess-ops/1')
      expect(row.status, '任务状态不变(pending)').toBe('pending')
      expect(row.updated_by ?? '', '审计不留任何记录(拒绝的面不落会话 actor;摄入基线为 kernel 非 null)').not.toContain('session:')
    } finally {
      ;(db as unknown as { close(): void }).close()
    }
  })
})
