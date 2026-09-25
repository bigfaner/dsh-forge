// @feature dsh-forge-m3 | @web-e2e | @journey stage-gates-cross-phase-context
// Journey smoke test — the stage-gate chain END TO END in one world
// (happy-path Outcomes only):
//   Step 1 stepper + gate-pending → Step 2 advance refused (guidance, zero
//   write) → Step 3 summarize (asset lands, gate flips) → Step 4 advance
//   succeeds (manifest in-place, stepper moves) → Step 5 assets panel
//   read-only render → Step 6 post-advance dispatch injects the LATEST asset
//   anchor (oracle).
// Traceability: docs/features/dsh-forge-m3/testing/stage-gates-cross-phase-
// context/journey.md (Happy Path Steps 1-6) + contracts success faces.

import { existsSync, readFileSync } from 'node:fs'
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

test('smoke/stage-gates-cross-phase-context: 门态查看 → 无总结推进被拒 → 总结生成(资产落文档根)→ 推进成功 → 资产面板只读 → 新阶段派发注入最新资产(oracle)', async ({ }, testInfo) => {
  testInfo.setTimeout(900_000)
  const manager = new WorldManager()
  const kernel = await buildMainWorld(freshRoot('gate-smoke'))
  try {
    const world = await manager.acquire(kernel, 'main', { tab: 'workbench/features' })
    const { page, stub } = world
    if (stub === null) throw new Error('the dispatch stub must ride this world')
    const manifestPath = join(kernel.featuresRoot, GATE_FEATURE, 'manifest.md')

    // ---- Step 1:查看阶段 stepper 与门状态 --------------------------------
    const card = page.locator(`[data-dsh-forge-feature-card="${GATE_FEATURE}"]`)
    await expect(card).toBeVisible({ timeout: 30_000 })
    await card.click()
    const detail = page.locator(`[data-dsh-forge-feature-detail="${GATE_FEATURE}"]`)
    await expect(detail).toBeVisible({ timeout: 10_000 })
    await expect(detail.locator('[data-dsh-forge-stepper-phase="tasks"]'), 'Step 1:tasks 节点 gate-pending')
      .toHaveAttribute('data-dsh-forge-stepper-state', 'gate-pending', { timeout: 10_000 })

    // ---- Step 2:总结未生成 → 推进被拒 ----------------------------------
    const advanceEntry = detail.locator('[data-dsh-forge-advance-entry]')
    await advanceEntry.click()
    const rejected = detail.locator('[data-dsh-forge-gate-hint-rejected="ERR_STAGE_GATE_UNSATISFIED"]')
    await expect(rejected, 'Step 2:拒绝 + 引导(缺失资产地址 + 生成路径)').toBeVisible({ timeout: 10_000 })
    expect(readFileSync(manifestPath, 'utf8'), 'Step 2:拒绝零写入(manifest 仍 tasks)').toContain('status: tasks')

    // ---- Step 3:生成阶段总结(应用内通道)------------------------------
    const summarized = await bridgeInvoke<{ path: string; gateOpen: boolean }>(page, 'stageSummarize', [{
      projectId: world.projectId, featureSlug: GATE_FEATURE, stage: 'tasks', goal: TASKS_GOAL, summary: `${TASKS_SUMMARY_MARK}\n`,
    }])
    expect(summarized.path, 'Step 3:单一规范文件').toBe(`${GATE_FEATURE}/stages/tasks.md`)
    expect(summarized.gateOpen, 'Step 3:写入即开门').toBe(true)
    const assetAbs = join(kernel.featuresRoot, GATE_FEATURE, 'stages', 'tasks.md')
    expect(existsSync(assetAbs), 'Step 3:资产落文档根').toBe(true)
    expect(readFileSync(assetAbs, 'utf8'), 'Step 3:goal 逐字').toContain(TASKS_GOAL)

    // ---- Step 4:推进成功 -----------------------------------------------
    await detail.locator('[data-dsh-forge-feature-back]').click()
    await card.click()
    await expect(page.locator(`[data-dsh-forge-feature-detail="${GATE_FEATURE}"]`)).toBeVisible({ timeout: 10_000 })
    await advanceEntry.click()
    await expect(advanceEntry, 'Step 4:推进按钮态翻 advanced').toHaveAttribute('data-dsh-forge-advance-state', 'advanced', { timeout: 10_000 })
    await expect(page.locator(`[data-dsh-forge-feature-detail="${GATE_FEATURE}"] [data-dsh-forge-feature-status="in-progress"]`),
      'Step 4:详情 Pill = in-progress').toBeVisible({ timeout: 10_000 })
    expect(readFileSync(manifestPath, 'utf8'), 'Step 4:manifest 阶段原位替换').toContain('status: in-progress')

    // ---- Step 5:阶段资产面板只读浏览 -----------------------------------
    const detailNow = page.locator(`[data-dsh-forge-feature-detail="${GATE_FEATURE}"]`)
    await detailNow.locator('[data-dsh-forge-feature-doc-tab="assets"]').click()
    const panel = detailNow.locator('[data-dsh-forge-feature-doc-panel="assets"]')
    const tasksCard = panel.locator('[data-dsh-forge-stage-asset="tasks"]')
    await expect(tasksCard, 'Step 5:tasks 资产卡').toBeVisible({ timeout: 15_000 })
    await expect(tasksCard, 'Step 5:goal 逐字渲染').toContainText(TASKS_GOAL)
    await expect(tasksCard.locator('button, a, [role="button"]'), 'Step 5:渲染区零交互(只读)').toHaveCount(0)

    // ---- Step 6:新阶段会话注入断言(最新资产锚 + oracle)--------------
    await page.locator('[data-dsh-forge-tab="workbench/tasks"]').click()
    await dispatchFromBoard(page, [TASK_2])
    await waitForOrchBadge(page, TASK_2, 'running', 20_000)
    const row = (await getDispatchRows(page, world.projectId)).find(candidate => candidate.taskKey === TASK_2)
    if (row === undefined) throw new Error('dispatch row missing')
    const prompt = await waitForPromptRow(page, stub, row.sessionId as string)
    expect(prompt.text, 'Step 6:PhaseSummary 块在场').toContain('## PhaseSummary')
    expect(prompt.text, 'Step 6:锚 = 最新(tasks)资产绝对路径').toContain(assetAbs)
    expect(prompt.text, 'Step 6:旧(prd)锚退场').not.toContain(join(kernel.featuresRoot, GATE_FEATURE, 'stages', 'prd.md'))

    const db = await openKernelDb(kernel.userDataDir)
    try {
      expect(verifyPromptInjection({
        journalText: prompt.text,
        presynthContent: recomputePresynth(db, kernel.featuresRoot, world.projectId, TASK_2),
        promptHash: row.promptHash,
        sessionId: row.sessionId as string,
        requestId: prompt.requestId,
      }), 'Step 6:注入 oracle 四件套').toEqual({ ok: true })
    } finally {
      ;(db as unknown as { close(): void }).close()
    }
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await manager.closeAll()
  }
})
