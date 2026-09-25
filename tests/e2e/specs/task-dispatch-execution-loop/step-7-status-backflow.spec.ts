// @feature dsh-forge-m3 | @web-e2e | @journey task-dispatch-execution-loop
// Traceability: docs/features/dsh-forge-m3/testing/task-dispatch-execution-loop/
// contracts/step-7-status-backflow.md — one test per Outcome:
//   backflow-success           — agent 经 dsh tool claim/submit → ≤5s 逐笔回
//                                流;完成态呈现;库审计(updated_by=session:<id>)
//                                + 执行记录渲染入内核(taskGet records)。
//   redispatch                 — 失败态 + 原因 + 二次确认重派发 → 新行 running;
//                                旧行保留审计(不抹除)。
//   concurrent-serial-backflow — 两笔提交先后到达 → 每笔 ≤5s 独立回流,最终
//                                板 = 内核权威行集。
// fixture_spec: Project/Task(in_progress)/Dispatch(running)/(+ failed 行 for
// redispatch)— served by harness.buildMainWorld + stub injections.

import { join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import {
  REFLOW_BUDGET_MS,
  dispatchFromBoard,
  freshRoot,
  getDispatchRows,
  measureReflow,
  openKernelDb,
  recordMarkdown,
  recomputePresynth,
  waitForOrchBadge,
  WorldManager,
  bridgeInvoke,
} from '../_lib/journey-world.ts'
import { verifyPromptInjection } from '../../stubs/oracle.ts'
import { buildMainWorld, TASK_1, TASK_2, TASK_3, TASK_5 } from './harness.ts'
import type { KernelWorld } from '../_lib/journey-world.ts'

test.describe.serial('task-dispatch-execution-loop / step 7: agent 提交后状态回流看板', () => {
  const manager = new WorldManager()
  let kernel: KernelWorld | null = null

  test.beforeAll(async () => {
    kernel = await buildMainWorld(freshRoot('disp-loop-s7'))
  })

  test.afterAll(async () => {
    await manager.closeAll()
  })

  // Outcome "backflow-success" — claim/submit 留 actor;回流 ≤5s;记录入内核。
  test('step7/backflow-success: claim → submit through the dsh tool verb face → ≤5s reflow per write, completed state, actor audit + rendered record', async ({ }, testInfo) => {
    testInfo.setTimeout(600_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main')
    const { page } = world

    await dispatchFromBoard(page, [TASK_1])
    await waitForOrchBadge(page, TASK_1, 'running', 20_000)
    const row = (await getDispatchRows(page, world.projectId)).find(candidate => candidate.taskKey === TASK_1)
    const actor = `session:${row?.sessionId as string}`

    // 执行记录先落(记录方言:records/<stem>.md,写_ONCE 形态)。
    const recordsDir = join(world.kernel.featuresRoot, world.kernel.featureSlug, 'tasks', 'records')
    mkdirSync(recordsDir, { recursive: true })
    const recordMark = 'disp-loop 回流腿执行记录锚点 — submit 后经 taskGet 渲染。'
    writeFileSync(join(recordsDir, '1-x.md'), recordMarkdown({ actor, summary: recordMark }), 'utf8')

    // claim → in_progress(≤5s 回流,真实时钟)。
    const claimMs = await measureReflow(page, TASK_1, 'in_progress', async () => {
      const claimed = await bridgeInvoke<{ status: string; source: string | null }>(page, 'taskClaim', [{ projectId: world.projectId, taskKey: TASK_1 }, actor])
      expect(claimed.status).toBe('in_progress')
      expect(claimed.source, '来源投影 = [会话]').toBe('session')
    })
    expect(claimMs, `claim 回流 ≤${String(REFLOW_BUDGET_MS)}ms`).toBeLessThanOrEqual(REFLOW_BUDGET_MS)

    // submit → completed(≤5s 回流)。
    const submitMs = await measureReflow(page, TASK_1, 'completed', async () => {
      const submitted = await bridgeInvoke<{ status: string }>(page, 'taskSubmit', [{ projectId: world.projectId, taskKey: TASK_1 }, actor])
      expect(submitted.status).toBe('completed')
    })
    expect(submitMs, `submit 回流 ≤${String(REFLOW_BUDGET_MS)}ms`).toBeLessThanOrEqual(REFLOW_BUDGET_MS)

    // 深断言:库审计 + 记录渲染(三方一致面)。
    const db = await openKernelDb(world.kernel.userDataDir)
    try {
      const taskRow = (db as unknown as { prepare: (sql: string) => { get: (...args: string[]) => { status: string; updated_by: string } } })
        .prepare('SELECT status, updated_by FROM task WHERE project_id = ? AND task_key = ?').get(world.projectId, TASK_1)
      expect(taskRow.status, '库内终态 completed').toBe('completed')
      expect(taskRow.updated_by, '审计主体 = session:<id>(actor 留痕)').toBe(actor)
    } finally {
      ;(db as unknown as { close(): void }).close()
    }
    const detail = await bridgeInvoke<{ records: Array<{ summary: string }> }>(page, 'taskGet', [{ projectId: world.projectId, taskKey: TASK_1 }])
    expect(detail.records.some(record => record.summary.includes(recordMark)), '执行记录渲染入内核(逐字锚点)').toBe(true)
  })

  // Outcome "redispatch" — 失败呈现 + 二次确认 + 新行承载重试(旧行审计保留)。
  test('step7/redispatch: failed card + reason → explicit redispatch (double confirm) → new subagent running; the failed row stays as audit trail', async ({ }, testInfo) => {
    testInfo.setTimeout(600_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main')
    const { page, stub } = world
    if (stub === null) throw new Error('the dispatch stub must ride this world')

    stub.writeControl({ create: 'fail', createError: 'disp-loop redispatch leg failure' })
    await dispatchFromBoard(page, [TASK_2]).catch(() => {})
    await waitForOrchBadge(page, TASK_2, 'failed', 30_000)
    const failedRow = (await getDispatchRows(page, world.projectId)).find(candidate => candidate.taskKey === TASK_2)
    expect(failedRow?.error, '失败原因留档').toContain('disp-loop redispatch leg failure')

    await page.locator(`[data-dsh-forge-node-card="${TASK_2}"]`).click()
    const orch = page.locator(`[data-dsh-forge-task-detail="${TASK_2}"] [data-dsh-forge-orchestration-section]`)
    await expect(orch.locator('[data-dsh-forge-orch-reason]'), '失败原因呈现').toContainText('disp-loop redispatch leg failure')

    stub.writeControl({})
    await orch.locator(`[data-dsh-forge-orch-redispatch="${failedRow?.id}"]`).click()
    const confirm = page.locator('[data-dsh-forge-dialog="redispatch-confirm"]')
    await expect(confirm, '重派发需二次确认').toBeVisible({ timeout: 10_000 })
    await confirm.locator('[data-dsh-forge-redispatch-go]').click()
    await waitForOrchBadge(page, TASK_2, 'running', 30_000)

    // State:原 failed 行保留(审计轨迹),新行 running(重走检查/预合成)。
    const rows = (await getDispatchRows(page, world.projectId)).filter(candidate => candidate.taskKey === TASK_2)
    expect(rows, '两行(旧审计 + 新承载)').toHaveLength(2)
    const retried = rows.find(candidate => candidate.id !== failedRow?.id)
    expect(retried?.state, '新行重新进入运行态').toBe('running')

    // 重派发重走链口径:注入 oracle 复验。
    const prompt = await (async () => {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const found = stub.readJournal().find(entry => entry.kind === 'prompt' && entry.sessionId === retried?.sessionId)
        if (found !== undefined) return { text: found.text as string, requestId: found.requestId as string }
        await page.waitForTimeout(100)
      }
      throw new Error('redispatch prompt row never landed')
    })()
    const db = await openKernelDb(world.kernel.userDataDir)
    try {
      const oracle = verifyPromptInjection({
        journalText: prompt.text,
        presynthContent: recomputePresynth(db, world.kernel.featuresRoot, world.projectId, TASK_2),
        promptHash: retried?.promptHash as string,
        sessionId: retried?.sessionId as string,
        requestId: prompt.requestId,
      })
      expect(oracle, '重派发注入 oracle 四件套(重走链口径不变)').toEqual({ ok: true })
    } finally {
      ;(db as unknown as { close(): void }).close()
    }
  })

  // Outcome "concurrent-serial-backflow" — 多笔提交逐笔回流,互不串扰。
  test('step7/concurrent-serial-backflow: two parallel subagents submit one after another → each reflows ≤5s independently; final board = kernel rows', async ({ }, testInfo) => {
    testInfo.setTimeout(600_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main')
    const { page } = world

    await dispatchFromBoard(page, [TASK_3, TASK_5])
    await waitForOrchBadge(page, TASK_3, 'running', 20_000)
    await waitForOrchBadge(page, TASK_5, 'running', 20_000)
    const rows = await getDispatchRows(page, world.projectId)
    const row3 = rows.find(candidate => candidate.taskKey === TASK_3)
    const row5 = rows.find(candidate => candidate.taskKey === TASK_5)
    const actor3 = `session:${row3?.sessionId as string}`
    const actor5 = `session:${row5?.sessionId as string}`

    // 两笔先后提交:每笔独立回流计时(≤5s)。
    await bridgeInvoke(page, 'taskClaim', [{ projectId: world.projectId, taskKey: TASK_3 }, actor3])
    await bridgeInvoke(page, 'taskClaim', [{ projectId: world.projectId, taskKey: TASK_5 }, actor5])
    const submit3Ms = await measureReflow(page, TASK_3, 'completed', async () => {
      await bridgeInvoke(page, 'taskSubmit', [{ projectId: world.projectId, taskKey: TASK_3 }, actor3])
    })
    expect(submit3Ms, `第一笔提交回流 ≤${String(REFLOW_BUDGET_MS)}ms`).toBeLessThanOrEqual(REFLOW_BUDGET_MS)
    const submit5Ms = await measureReflow(page, TASK_5, 'completed', async () => {
      await bridgeInvoke(page, 'taskSubmit', [{ projectId: world.projectId, taskKey: TASK_5 }, actor5])
    })
    expect(submit5Ms, `第二笔提交回流 ≤${String(REFLOW_BUDGET_MS)}ms`).toBeLessThanOrEqual(REFLOW_BUDGET_MS)

    // 最终板 = 内核权威行集(状态与 actor 一致;互不串扰)。
    const board = await bridgeInvoke<{ tasks: Array<{ key: string; status: string; updatedBy?: string }> }>(page, 'getTaskBoard', [world.projectId])
    expect(board.tasks.find(candidate => candidate.key === TASK_3)?.status, 'TASK_3 终态 completed').toBe('completed')
    expect(board.tasks.find(candidate => candidate.key === TASK_5)?.status, 'TASK_5 终态 completed').toBe('completed')
    expect(board.tasks.find(candidate => candidate.key === TASK_3)?.updatedBy, 'TASK_3 actor 留痕').toBe(actor3)
    expect(board.tasks.find(candidate => candidate.key === TASK_5)?.updatedBy, 'TASK_5 actor 留痕(互不串扰)').toBe(actor5)
  })
})
