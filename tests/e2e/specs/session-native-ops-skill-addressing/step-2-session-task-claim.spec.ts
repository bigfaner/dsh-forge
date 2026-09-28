// @feature dsh-forge-m3 | @web-e2e | @journey session-native-ops-skill-addressing
// Traceability: docs/features/dsh-forge-m3/testing/session-native-ops-skill-
// addressing/contracts/step-2-session-task-claim.md — one test per Outcome:
//   success                    — claim → in_progress(状态机合法边)+
//                               updated_by = session 会话标识 + ≤5s 回流。
//   illegal-transition-rejected — 对 completed 任务 claim → ERR_TASK_STATE_
//                               INVALID;状态不变,零审计。
//   deps-unsatisfied-rejected  — 依赖未满足 → ERR_TASK_DEPS_UNSATISFIED;
//                               不产生越序状态。
//   not-authoritative-rejected — files 权威项目写 → ERR_TASK_NOT_AUTHORITATIVE
//                               (引导走 CLI 双形态纪律)。
// fixture_spec: Project(sqlite)/Task(pending + completed + deps-unmet)/
// TaskSnapshot(files 世界)— harness worlds。

import { expect, test } from '@playwright/test'
import { REFLOW_BUDGET_MS, freshRoot, measureReflow, openKernelDb, WorldManager, bridgeInvoke } from '../_lib/journey-world.ts'
import { buildFilesWorld, buildMainWorld, SESS_FEATURE, TASK_1, TASK_2, TASK_3 } from './harness.ts'
import type { KernelWorld } from '../_lib/journey-world.ts'

test.describe.serial('session-native-ops-skill-addressing / step 2: 会话内任务领取(claim)', () => {
  const manager = new WorldManager()
  let kernel: KernelWorld | null = null
  let files: KernelWorld | null = null

  test.beforeAll(async () => {
    kernel = await buildMainWorld(freshRoot('sess-s2a'))
    files = await buildFilesWorld(freshRoot('sess-s2b'))
  })

  test.afterAll(async () => {
    await manager.closeAll()
  })

  /** Expect a bridge call to reject with a message containing the code. */
  async function expectRejectedWith(page: import('@playwright/test').Page, verb: string, args: readonly unknown[], code: string): Promise<string> {
    let message: string | undefined
    try {
      await bridgeInvoke(page, verb, args)
    } catch (error) {
      message = String((error as Error).message)
    }
    expect(message ?? '', `调用被拒(${code})`).toContain(code)
    return message as string
  }

  // [M4 1.8 e2e 迁移·迁移清单 第②行 · M2 看板(workbench/tasks 主视图)] 本测试功能面锚定 1.7 已退役的旧视图宿主,
  // P2 右栏 pane / 概览子 tab(2.1–2.4)落座后按新宿主恢复,2.10 全量复跑收口。
  // 断言本体零删改(零功能删除断言 Hard Rule)—— test.fixme 仅为过渡期挂起。

  // Outcome "success" — 合法领取 + actor 审计 + ≤5s 回流。
  test.fixme('step2/success: claim through the dsh tool face → in_progress, updated_by = session:<id>, ≤5s board reflow', async ({ }, testInfo) => {
    testInfo.setTimeout(420_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main')
    const { page } = world
    const actor = 'session:sess-ops-claim-1'

    const claimMs = await measureReflow(page, TASK_1, 'in_progress', async () => {
      const claimed = await bridgeInvoke<{ status: string; source: string | null }>(page, 'taskClaim', [{ projectId: world.projectId, taskKey: TASK_1 }, actor])
      expect(claimed.status, 'claim 成功(canonical 返回)').toBe('in_progress')
      expect(claimed.source, '来源投影 = [会话]').toBe('session')
    })
    expect(claimMs, `回流 ≤${String(REFLOW_BUDGET_MS)}ms(免手动刷新)`).toBeLessThanOrEqual(REFLOW_BUDGET_MS)

    // State:updated_by 记 session 会话标识(审计可查)。
    const db = await openKernelDb(world.kernel.userDataDir)
    try {
      const sqlite = db as unknown as { prepare: (sql: string) => { get: (...args: string[]) => { status: string; updated_by: string } } }
      const row = sqlite.prepare('SELECT status, updated_by FROM task WHERE project_id = ? AND task_key = ?').get(world.projectId, TASK_1)
      expect(row.status, '内核行 in_progress(经状态机合法边)').toBe('in_progress')
      expect(row.updated_by, 'actor 审计 = session:<id>').toBe(actor)
    } finally {
      ;(db as unknown as { close(): void }).close()
    }
  })

  // Outcome "illegal-transition-rejected" — 终态任务 claim 被状态机拒绝。
  test('step2/illegal-transition-rejected: claiming the completed task → ERR_TASK_STATE_INVALID, status unchanged, zero success audit', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main')
    const { page } = world

    await expectRejectedWith(page, 'taskClaim', [{ projectId: world.projectId, taskKey: TASK_2 }, 'session:sess-ops-illegal'], 'ERR_TASK_STATE_INVALID')

    const db = await openKernelDb(world.kernel.userDataDir)
    try {
      const sqlite = db as unknown as { prepare: (sql: string) => { get: (...args: string[]) => { status: string; updated_by: string | null } } }
      const row = sqlite.prepare('SELECT status, updated_by FROM task WHERE project_id = ? AND task_key = ?').get(world.projectId, TASK_2)
      expect(row.status, '任务状态不变(completed 终态不可逆)').toBe('completed')
      // 拒绝的 claim 不落审计:非法 actor 不出现在 updated_by(摄入基线 'kernel',非 null)。
      expect(row.updated_by, '审计不留成功记录(拒绝的 actor 不落审计)').not.toBe('session:sess-ops-illegal')
    } finally {
      ;(db as unknown as { close(): void }).close()
    }
  })

  // Outcome "deps-unsatisfied-rejected" — 依赖未满足的变更被依赖解析拒绝。
  test('step2/deps-unsatisfied-rejected: claiming the deps-unmet task → ERR_TASK_DEPS_UNSATISFIED (unmet list verbatim), no out-of-order state', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main')
    const { page } = world

    const message = await expectRejectedWith(page, 'taskClaim', [{ projectId: world.projectId, taskKey: TASK_3 }, 'session:sess-ops-deps'], 'ERR_TASK_DEPS_UNSATISFIED')
    expect(message, 'unmet 清单原词(blocker 指向可辨)').toContain(SESS_FEATURE)

    const db = await openKernelDb(world.kernel.userDataDir)
    try {
      const sqlite = db as unknown as { prepare: (sql: string) => { get: (...args: string[]) => { status: string } } }
      expect(sqlite.prepare('SELECT status FROM task WHERE project_id = ? AND task_key = ?').get(world.projectId, TASK_3).status,
        '任务行零变更(不产生越序状态)').toBe('pending')
    } finally {
      ;(db as unknown as { close(): void }).close()
    }
  })

  // Outcome "not-authoritative-rejected" — files 权威项目写被权限界拒绝。
  test('step2/not-authoritative-rejected: claiming on the files-authority project → ERR_TASK_NOT_AUTHORITATIVE (dual-form discipline guidance)', async ({ }, testInfo) => {
    testInfo.setTimeout(420_000)
    const world = await manager.acquire(files as KernelWorld, 'files')
    const { page } = world

    const message = await expectRejectedWith(page, 'taskClaim', [{ projectId: world.projectId, taskKey: TASK_1 }, 'session:sess-ops-files'], 'ERR_TASK_NOT_AUTHORITATIVE')
    expect(message, '引导走 forge CLI(双形态纪律)').toMatch(/CLI|cli/u)
  })
})
