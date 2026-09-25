// @feature dsh-forge-m3 | @web-e2e | @journey task-dispatch-execution-loop
// Traceability: docs/features/dsh-forge-m3/testing/task-dispatch-execution-loop/
// contracts/step-3-confirm-dispatch-launch.md — one test per Outcome:
//   success              — 3-task batch → 同批单 batch_id、每任务独立行、
//                          session_id 互异回填、running 角标、派发 → 可交互
//                          ≤3s、注入 oracle 四件套 ×3(深断言)。
//   type-not-dispatchable — restricted-type task (eval.contract): 派发被拒
//                          (ERR_TASK_TYPE_NOT_DISPATCHABLE 呈现),零落行零启动。
//   launch-failed        — stub create 注错 → 行 starting→failed + 原因留档;
//                          独立行独立结局(清错后新派发照常 running,旧行保留)。
// fixture_spec: Project(sqlite)/Task×3 pending typed (+ restricted rider) —
// served by harness.buildMainWorld / buildRestrictedWorld.
// 注:SC3 半链注记口径 —— 「通道不可用 → failed」的真链路可达面 = launch
// 注错(starting→failed);本文件按该口径承载 launch-failed。

import { expect, test } from '@playwright/test'
import {
  DISPATCH_INTERACTIVE_BUDGET_MS,
  dispatchFromBoard,
  freshRoot,
  getDispatchRows,
  openKernelDb,
  recomputePresynth,
  waitForOrchBadge,
  waitForPromptRows,
  WorldManager,
  bridgeInvoke,
} from '../_lib/journey-world.ts'
import { verifyPromptInjection } from '../../stubs/oracle.ts'
import { buildMainWorld, buildRestrictedWorld, FEATURE, PROTOCOL_SENTENCES, RESTRICTED_TASK, TASK_1, TASK_2, TASK_3, TASK_5 } from './harness.ts'
import type { KernelWorld } from '../_lib/journey-world.ts'

test.describe.serial('task-dispatch-execution-loop / step 3: 确认派发,subagent 启动', () => {
  const manager = new WorldManager()
  let kernel: KernelWorld | null = null
  let restricted: KernelWorld | null = null

  test.beforeAll(async () => {
    kernel = await buildMainWorld(freshRoot('disp-loop-s3'))
  })

  test.afterAll(async () => {
    await manager.closeAll()
  })

  // Outcome "success" — 确认派发 → 并行 3 subagent 独立启动(行/会话/角标三面)。
  test('step3/success: confirmed 3-task batch → one batch_id, 3 independent rows/sessions, running badges, ≤3s interactive, oracle ×3', async ({ }, testInfo) => {
    testInfo.setTimeout(600_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main')
    const { page, stub } = world
    if (stub === null) throw new Error('the dispatch stub must ride this world')

    // 要素③ 前置:feature 级偏好覆盖(非默认锚点,SC3 同型)。
    await bridgeInvoke(page, 'setPrefs', [
      { feature: `${world.projectId}/${FEATURE}` },
      [
        { key: 'coverage.coding.feature', value: { type: 'percentage', percentage: 62 } },
        { key: 'coverage.coding.fix', value: { type: 'percentage', percentage: 57 } },
        { key: 'coverage.coding.enhancement', value: { type: 'percentage', percentage: 72 } },
      ],
    ])

    const t0 = await dispatchFromBoard(page, [TASK_1, TASK_2, TASK_3])

    // journal:3 次独立 create + 3 条 prompt 行(= 3 个 subagent 已建且可交互)。
    const prompts = await waitForPromptRows(page, stub, 3)
    const creates = stub.readJournal().filter(row => row.kind === 'create')
    expect(creates, 'stub journal 记录 3 次独立 create').toHaveLength(3)
    const interactiveMs = Date.now() - t0
    expect(interactiveMs, `派发 → subagent 可交互 ≤${String(DISPATCH_INTERACTIVE_BUDGET_MS)}ms(实际 ${String(interactiveMs)}ms)`)
      .toBeLessThanOrEqual(DISPATCH_INTERACTIVE_BUDGET_MS)

    // State:行独立、同批聚合、session 互异(kernel 权威面)。
    const rows = (await getDispatchRows(page, world.projectId)).filter(row => [TASK_1, TASK_2, TASK_3].includes(row.taskKey))
    expect(rows, '3 条独立派发行').toHaveLength(3)
    expect(new Set(rows.map(row => row.id)).size, '行 id 互异').toBe(3)
    expect(new Set(rows.map(row => row.batchId)).size, '同批单 batch_id 聚合').toBe(1)
    expect(new Set(rows.map(row => row.sessionId)).size, 'session_id 互异(互不共享会话)').toBe(3)
    expect(new Set(prompts.map(row => row.text)).size, '3 份注入内容互异(类型协议不同)').toBe(3)

    // Output:卡片呈现 running 态(角标谱回流)。
    for (const key of [TASK_1, TASK_2, TASK_3]) {
      await waitForOrchBadge(page, key, 'running', 20_000)
    }

    // 深断言:注入 oracle 四件套 ×3(测试侧重算 + prompt_hash 对拍)。
    const db = await openKernelDb(world.kernel.userDataDir)
    try {
      for (const key of [TASK_1, TASK_2, TASK_3]) {
        const row = rows.find(candidate => candidate.taskKey === key)
        const prompt = prompts.find(candidate => candidate.sessionId === row?.sessionId)
        if (row === undefined || prompt === undefined) throw new Error(`dispatch/prompt row missing for ${key}`)
        const oracle = verifyPromptInjection({
          journalText: prompt.text,
          presynthContent: recomputePresynth(db, world.kernel.featuresRoot, world.projectId, key),
          promptHash: row.promptHash,
          sessionId: row.sessionId as string,
          requestId: prompt.requestId,
        })
        expect(oracle, `${key} 注入 oracle 四件套(hash/逐字节前缀/单追加行/requestId)`).toEqual({ ok: true })
        // 要素① 锚:类型专属协议句(路由证据)。
        expect(prompt.text, `${key} 要素① 类型协议句`).toContain(PROTOCOL_SENTENCES[key])
      }
    } finally {
      ;(db as unknown as { close(): void }).close()
    }
  })

  // Outcome "type-not-dispatchable" — 受限类型在派发路由面被拒,零落行。
  test('step3/type-not-dispatchable: restricted type (eval.contract) dispatch → explicit error dialog, zero rows, zero subagents', async ({ }, testInfo) => {
    testInfo.setTimeout(420_000)
    restricted = await buildRestrictedWorld(freshRoot('disp-loop-s3r'))
    const world = await manager.acquire(restricted, 'restricted')
    const { page } = world

    // 全链驱动:进入选择 → 勾选受限任务 → 派发 → 确认 → 动词拒绝(受限
    // 类型的拒绝发生在确认后的派发动词,呈现 = 错误对话框)。
    await page.locator('[data-dsh-forge-dispatch-entry]').click()
    await expect(page.locator('[data-dsh-forge-selection-layer="active"]')).toBeVisible({ timeout: 10_000 })
    await page.locator(`[data-dsh-forge-select-chk="${RESTRICTED_TASK}"] [data-dsh-forge-select-chk-input]`).check()
    await page.locator('[data-dsh-forge-dispatch-go]').click()
    const confirm = page.locator('[data-dsh-forge-dialog="dispatch-confirm"]')
    await expect(confirm, '产物齐全 → 直达确认').toBeVisible({ timeout: 10_000 })
    await page.locator('[data-dsh-forge-dispatch-confirm-go]').click()

    // 拒绝呈现:错误对话框(ERR_TASK_TYPE_NOT_DISPATCHABLE 语义 + 引导)。
    const errorDialog = page.locator('[data-dsh-forge-dialog="dispatch-error"]')
    await expect(errorDialog, '受限类型 → 派发错误对话框(不静默)').toBeVisible({ timeout: 15_000 })
    await expect(errorDialog.locator('[data-dsh-forge-dispatch-error-body]'), '错误体含受限语义/引导')
      .toContainText(/restricted|受限|external session|eval/i)
    await errorDialog.locator('[data-dsh-forge-dispatch-error-close]').click()
    await expect(errorDialog).toHaveCount(0, { timeout: 10_000 })

    // State:预合成路由拒绝发生在落行之前 —— 零派发行、零 journal。
    expect(await getDispatchRows(page, world.projectId), '零派发行').toHaveLength(0)
    expect(world.stub?.readJournal() ?? [], '零 subagent 启动').toHaveLength(0)
  })

  // Outcome "launch-failed" — host 启动回调失败 → 行 failed + 原因;独立行独立结局。
  test('step3/launch-failed: stub create failure → row failed with reason; after clearing the fault a fresh dispatch runs (independent rows, old row preserved)', async ({ }, testInfo) => {
    testInfo.setTimeout(600_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main')
    const { page, stub } = world
    if (stub === null) throw new Error('the dispatch stub must ride this world')

    stub.writeControl({ create: 'fail', createError: 'disp-loop orchestrated launch failure' })
    await dispatchFromBoard(page, [TASK_5]).catch(() => {})
    await waitForOrchBadge(page, TASK_5, 'failed', 30_000)

    const failedRows = (await getDispatchRows(page, world.projectId)).filter(row => row.taskKey === TASK_5)
    expect(failedRows, '失败程恰一行').toHaveLength(1)
    expect(failedRows[0]?.state, '行态 failed(ERR_DISPATCH_LAUNCH_FAILED 面)').toBe('failed')
    expect(failedRows[0]?.error, '失败原因留档').toContain('disp-loop orchestrated launch failure')

    // 独立行独立结局:清错后同一任务的新派发照常 running(旧行保留审计)。
    stub.writeControl({})
    await dispatchFromBoard(page, [TASK_5])
    await waitForOrchBadge(page, TASK_5, 'running', 30_000)
    const rowsAfter = (await getDispatchRows(page, world.projectId)).filter(row => row.taskKey === TASK_5)
    expect(rowsAfter, '新行落库,旧行保留(审计轨迹)').toHaveLength(2)
    const retried = rowsAfter.find(row => row.id !== failedRows[0]?.id)
    expect(retried?.state, '新行 running(同批失败不殃及后续)').toBe('running')
    expect(retried?.sessionId, '新行新预铸 session id(≠ 失败行)').not.toBe(failedRows[0]?.sessionId)
  })
})
