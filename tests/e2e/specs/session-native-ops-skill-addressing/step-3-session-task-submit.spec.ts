// @feature dsh-forge-m3 | @web-e2e | @journey session-native-ops-skill-addressing
// Traceability: docs/features/dsh-forge-m3/testing/session-native-ops-skill-
// addressing/contracts/step-3-session-task-submit.md — one test per Outcome:
//   success            — 记录 md 先落(写_ONCE)→ submit → completed;记录
//                       渲染入内核可查;看板回流终态。
//   audit-tri-consistency — 看板来源标记 / 执行记录 / 内核审计三方一致
//                       (actor 同源)。
//   task-key-invalid   — 非法 taskKey 形态 → ERR_TASK_KEY_INVALID(零触达内
//                       核写面);更正为合法地址后重试成功(闭环)。
// fixture_spec: Project(sqlite)/Task(in_progress + updated_by=session)/
// ExecutionRecord(records/<stem>.md)。

import { join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { freshRoot, openKernelDb, recordMarkdown, WorldManager, bridgeInvoke } from '../_lib/journey-world.ts'
import { buildMainWorld, SESS_FEATURE, TASK_1 } from './harness.ts'
import type { KernelWorld } from '../_lib/journey-world.ts'

const RECORD_MARK = 'sess-ops 执行记录锚点 — submit 后经 taskGet 渲染(记录链路)。'

test.describe.serial('session-native-ops-skill-addressing / step 3: 会话内任务提交(submit)', () => {
  const manager = new WorldManager()
  let kernel: KernelWorld | null = null
  const actor = 'session:sess-ops-submit-1'

  test.beforeAll(async () => {
    kernel = await buildMainWorld(freshRoot('sess-s3'))
  })

  test.afterAll(async () => {
    await manager.closeAll()
  })

  /** claim the rider task (the submit legs' precondition) on the live world. */
  async function claimRider(world: Awaited<ReturnType<WorldManager['acquire']>>): Promise<void> {
    const claimed = await bridgeInvoke<{ status: string }>(world.page, 'taskClaim', [{ projectId: world.projectId, taskKey: TASK_1 }, actor])
    expect(claimed.status).toBe('in_progress')
  }

  // Outcome "success" — 记录先落 → submit → 终态 + 记录渲染。
  test('step3/success: record md lands first (write-ONCE) → submit → completed, record rendered into the kernel, board shows the terminal state', async ({ }, testInfo) => {
    testInfo.setTimeout(420_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main')
    await claimRider(world)
    const { page } = world

    // 执行记录(agent 会话经文档根写入,先于 submit)。
    const recordsDir = join(world.kernel.featuresRoot, SESS_FEATURE, 'tasks', 'records')
    mkdirSync(recordsDir, { recursive: true })
    writeFileSync(join(recordsDir, '1-x.md'), recordMarkdown({ actor, summary: RECORD_MARK }), 'utf8')

    const submitted = await bridgeInvoke<{ status: string }>(page, 'taskSubmit', [{ projectId: world.projectId, taskKey: TASK_1 }, actor])
    expect(submitted.status, 'submit 成功(ok 为真;仅 submit 角色可至 completed)').toBe('completed')

    // 记录渲染入内核可查(taskGet 读回 records/<stem>.md)。
    const detail = await bridgeInvoke<{ records: Array<{ summary: string; source: string | null }> }>(page, 'taskGet', [{ projectId: world.projectId, taskKey: TASK_1 }])
    const record = detail.records.find(row => row.summary.includes(RECORD_MARK))
    expect(record, '执行记录可渲染(逐字锚点)').toBeDefined()

    // 看板回流终态 + 库审计。
    const board = await bridgeInvoke<{ tasks: Array<{ key: string; status: string }> }>(page, 'getTaskBoard', [world.projectId])
    expect(board.tasks.find(row => row.key === TASK_1)?.status, '看板终态 completed').toBe('completed')
    const db = await openKernelDb(world.kernel.userDataDir)
    try {
      const sqlite = db as unknown as { prepare: (sql: string) => { get: (...args: string[]) => { status: string; updated_by: string } } }
      const row = sqlite.prepare('SELECT status, updated_by FROM task WHERE project_id = ? AND task_key = ?').get(world.projectId, TASK_1)
      expect(row.status, '内核终态 completed').toBe('completed')
      expect(row.updated_by, 'actor 留痕(审计可查)').toBe(actor)
    } finally {
      ;(db as unknown as { close(): void }).close()
    }
  })

  // Outcome "audit-tri-consistency" — 三方一致(看板/记录/审计)。
  test('step3/audit-tri-consistency: the board source mark, the rendered record, and the kernel audit row agree on the SAME actor value', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main')
    const { page } = world

    // ① 看板来源标记。
    const board = await bridgeInvoke<{ tasks: Array<{ key: string; status: string; source: string | null; updatedBy?: string }> }>(page, 'getTaskBoard', [world.projectId])
    const boardRow = board.tasks.find(row => row.key === TASK_1)
    expect(boardRow?.source, '看板来源标记 = session(投影)').toBe('session')

    // ② 执行记录(渲染面,actor 同值)。
    const detail = await bridgeInvoke<{ records: Array<{ summary: string; source: string | null }> }>(page, 'taskGet', [{ projectId: world.projectId, taskKey: TASK_1 }])
    expect(detail.records.some(row => row.summary.includes(RECORD_MARK)), '执行记录在场(同一权威的渲染)').toBe(true)

    // ③ 内核审计行(updated_by = 同一 session 标识)。
    const db = await openKernelDb(world.kernel.userDataDir)
    try {
      const sqlite = db as unknown as { prepare: (sql: string) => { get: (...args: string[]) => { status: string; updated_by: string } } }
      const row = sqlite.prepare('SELECT status, updated_by FROM task WHERE project_id = ? AND task_key = ?').get(world.projectId, TASK_1)
      expect(row.updated_by, '审计 actor 与看板来源同源(session:<id>)').toBe(actor)
      expect(boardRow?.updatedBy, '看板投影审计列 = 同一值(三方一致)').toBe(row.updated_by)
    } finally {
      ;(db as unknown as { close(): void }).close()
    }
  })

  // Outcome "task-key-invalid" — 工具面白名单双闸 + 更正重试闭环。
  test('step3/task-key-invalid: a malformed taskKey → ERR_TASK_KEY_INVALID (kernel write face untouched); corrected retry succeeds', async ({ }, testInfo) => {
    testInfo.setTimeout(420_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main')
    const { page } = world

    // 重置骑手任务为 in_progress(submit 的前置)。
    await bridgeInvoke(page, 'taskReopen', [{ projectId: world.projectId, taskKey: TASK_1 }, actor]).catch(() => {})
    const reclaimed = await bridgeInvoke<{ status: string }>(page, 'taskClaim', [{ projectId: world.projectId, taskKey: TASK_1 }, actor])
    expect(reclaimed.status).toBe('in_progress')

    // 非法形态(缺段)→ 工具面白名单拒绝,零触达内核写面。
    let message: string | undefined
    try {
      await bridgeInvoke(page, 'taskSubmit', [{ projectId: world.projectId, taskKey: 'not-a-board-address' }, actor])
    } catch (error) {
      message = String((error as Error).message)
    }
    expect(message ?? '', 'ERR_TASK_KEY_INVALID(形态说明)').toContain('ERR_TASK_KEY_INVALID')

    // 更正-重试闭环:合法 <featureSlug>/<localId> 地址成功。
    const submitted = await bridgeInvoke<{ status: string }>(page, 'taskSubmit', [{ projectId: world.projectId, taskKey: TASK_1 }, actor])
    expect(submitted.status, '更正后重试成功').toBe('completed')
  })
})
