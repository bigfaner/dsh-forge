// @feature dsh-forge-m3 | @web-e2e | @journey stage-gates-cross-phase-context
// Traceability: docs/features/dsh-forge-m3/testing/stage-gates-cross-phase-
// context/contracts/step-6-new-stage-injection.md — Outcomes:
//   success — 推进后新派发:确认链三要素说明 + 详情侧板就位标识;注入
//             PhaseSummary 锚 = 最新先行阶段资产(tasks.md)绝对路径,
//             旧锚(prd)退场;oracle 四件套;可派发集按状态界定(pending
//             可派发,in_progress 对照被拒 + 单执行者原因)。
//   host-channel-unavailable — 宿主通道不可用(真链路可达面 = launch 注错,
//             SC3 注记口径)→ 行 failed + 原因 + 重派发恢复,无半状态。
// fixture_spec: Project/Feature(新阶段)/StageAsset/Task(pending ×1 +
// in_progress ×1 对照)/Dispatch。

import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  dispatchFromBoard,
  freshRoot,
  getDispatchRows,
  openKernelDb,
  recomputePresynth,
  waitForOrchBadge,
  waitForPromptRow,
  WorldManager,
  bridgeInvoke,
} from '../_lib/journey-world.ts'
import { verifyPromptInjection } from '../../stubs/oracle.ts'
import { buildMainWorld, GATE_FEATURE, TASK_2, TASKS_GOAL, TASKS_SUMMARY_MARK } from './harness.ts'
import type { KernelWorld } from '../_lib/journey-world.ts'

const IN_PROGRESS_TASK = `${GATE_FEATURE}/3`

test.describe.serial('stage-gates-cross-phase-context / step 6: 新阶段会话注入断言', () => {
  const manager = new WorldManager()
  let kernel: KernelWorld | null = null

  test.beforeAll(async () => {
    kernel = await buildMainWorld(freshRoot('gate-s6'))
  })

  test.afterAll(async () => {
    await manager.closeAll()
  })

  /** Summarize tasks + advance (the post-advance precondition). */
  async function advanceToInProgress(world: Awaited<ReturnType<WorldManager['acquire']>>): Promise<void> {
    const summarized = await bridgeInvoke<{ gateOpen: boolean }>(world.page, 'stageSummarize', [{
      projectId: world.projectId, featureSlug: GATE_FEATURE, stage: 'tasks', goal: TASKS_GOAL, summary: `${TASKS_SUMMARY_MARK}\n`,
    }])
    expect(summarized.gateOpen).toBe(true)
    const advanced = await bridgeInvoke<{ status: string }>(world.page, 'advanceStage', [world.projectId, GATE_FEATURE])
    expect(advanced.status, '推进 → in-progress(新阶段)').toBe('in-progress')
  }

  // Outcome "success" — 新阶段注入锚 = 最新先行阶段资产;单执行者对照。
  test('step6/success: post-advance dispatch injects the LATEST stage asset anchor (tasks.md; prd retreats), oracle verifies; the in_progress contrast task is refused (single executor)', async ({ }, testInfo) => {
    testInfo.setTimeout(600_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main')
    const { page, stub } = world
    if (stub === null) throw new Error('the dispatch stub must ride this world')

    await advanceToInProgress(world)

    // 可派发集按状态界定:pending 可派发;in_progress 对照被拒(单执行者)。
    await page.locator('[data-dsh-forge-tab="workbench/tasks"]').click()
    await page.locator('[data-dsh-forge-dispatch-entry]').click()
    await expect(page.locator('[data-dsh-forge-selection-layer="active"]')).toBeVisible({ timeout: 10_000 })
    const contrastWrap = page.locator(`[data-dsh-forge-select-chk="${IN_PROGRESS_TASK}"]`)
    await expect(contrastWrap.locator('[data-dsh-forge-select-chk-input]'), 'in_progress 对照:勾选禁用(单执行者)').toBeDisabled()
    const contrastTitle = await contrastWrap.getAttribute('title')
    expect(contrastTitle ?? '', '拒绝原因 = 单执行者').toContain('执行')
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-dsh-forge-selection-layer="active"]')).toHaveCount(0, { timeout: 10_000 })

    // 新阶段派发:产物齐(对照任务满足 in-progress 行)→ 无警告直达确认。
    const t0 = await dispatchFromBoard(page, [TASK_2])
    await expect(page.locator('[data-dsh-forge-dialog="dispatch-warning"]'), '产物齐 → 零警告').toHaveCount(0)
    await waitForOrchBadge(page, TASK_2, 'running', 20_000)

    // 详情侧板:预合成要素就位标识 + hash。
    await page.locator(`[data-dsh-forge-node-card="${TASK_2}"]`).click()
    const orch = page.locator(`[data-dsh-forge-task-detail="${TASK_2}"] [data-dsh-forge-orchestration-section]`)
    await expect(orch.locator('[data-dsh-forge-orch-presynth-line]'), '预合成要素就位标识').toBeVisible({ timeout: 10_000 })

    // 注入断言:PhaseSummary 锚 = 最新(tasks)资产绝对路径;旧(prd)锚退场。
    const row = (await getDispatchRows(page, world.projectId)).find(candidate => candidate.taskKey === TASK_2)
    if (row === undefined) throw new Error('dispatch row missing')
    const prompt = await waitForPromptRow(page, stub, row.sessionId as string)
    expect(prompt.text, '新阶段注入含 PhaseSummary 块').toContain('## PhaseSummary')
    expect(prompt.text, '锚 = 最新(tasks)阶段资产绝对路径').toContain(join(world.kernel.featuresRoot, GATE_FEATURE, 'stages', 'tasks.md'))
    expect(prompt.text, '旧(prd)锚退场(推进后最新一份语义)').not.toContain(join(world.kernel.featuresRoot, GATE_FEATURE, 'stages', 'prd.md'))
    void t0

    const db = await openKernelDb(world.kernel.userDataDir)
    try {
      expect(verifyPromptInjection({
        journalText: prompt.text,
        presynthContent: recomputePresynth(db, world.kernel.featuresRoot, world.projectId, TASK_2),
        promptHash: row.promptHash,
        sessionId: row.sessionId as string,
        requestId: prompt.requestId,
      }), '注入 oracle 四件套(推进后链口径)').toEqual({ ok: true })
    } finally {
      ;(db as unknown as { close(): void }).close()
    }
  })

  // Outcome "host-channel-unavailable" — launch 注错面(SC3 口径)。
  test('step6/host-channel-unavailable: channel fault (launch injection) → failed row + reason + redispatch recovery, no residual half state', async ({ }, testInfo) => {
    testInfo.setTimeout(600_000)
    const kernelB = await buildMainWorld(freshRoot('gate-s6b'))
    const world = await manager.acquire(kernelB, 'fault')
    const { page, stub } = world
    if (stub === null) throw new Error('the dispatch stub must ride this world')

    await advanceToInProgress(world)
    await page.locator('[data-dsh-forge-tab="workbench/tasks"]').click()

    stub.writeControl({ create: 'fail', createError: 'gate-loop host channel unavailable' })
    await dispatchFromBoard(page, [TASK_2]).catch(() => {})
    await waitForOrchBadge(page, TASK_2, 'failed', 30_000)
    const failedRow = (await getDispatchRows(page, world.projectId)).find(candidate => candidate.taskKey === TASK_2)
    expect(failedRow?.state, '通道异常 → 行 failed(不静默)').toBe('failed')
    expect(failedRow?.error, '失败原因留档').toContain('gate-loop host channel unavailable')

    // 恢复:清错 → 重派发(二次确认)→ 新行 running;无半状态残留。
    stub.writeControl({})
    await page.locator(`[data-dsh-forge-node-card="${TASK_2}"]`).click()
    const orch = page.locator(`[data-dsh-forge-task-detail="${TASK_2}"] [data-dsh-forge-orchestration-section]`)
    await expect(orch).toBeVisible({ timeout: 10_000 })
    await orch.locator(`[data-dsh-forge-orch-redispatch="${failedRow?.id}"]`).click()
    const confirm = page.locator('[data-dsh-forge-dialog="redispatch-confirm"]')
    await expect(confirm, '重派发二次确认').toBeVisible({ timeout: 10_000 })
    await confirm.locator('[data-dsh-forge-redispatch-go]').click()
    await waitForOrchBadge(page, TASK_2, 'running', 30_000)
    const rows = (await getDispatchRows(page, world.projectId)).filter(candidate => candidate.taskKey === TASK_2)
    expect(rows, '恢复后无残留半状态(旧行审计 + 新行运行)').toHaveLength(2)
    expect(rows.some(candidate => candidate.state === 'running'), '新行 running').toBe(true)
  })
})
