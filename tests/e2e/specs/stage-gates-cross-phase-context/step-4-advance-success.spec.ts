// @feature dsh-forge-m3 | @web-e2e | @journey stage-gates-cross-phase-context
// Traceability: docs/features/dsh-forge-m3/testing/stage-gates-cross-phase-
// context/contracts/step-4-advance-success.md — one test per Outcome:
//   success            — 门满足 → 推进成功:manifest 阶段字段原位替换
//                        (tasks → in-progress)、stepper 前移、详情 Pill 回流、
//                        stage_advanced 事件(呈现面 = 三面一致)。
//   multi-advance-accumulation — 多次推进后「阶段资产」面板逐阶段完整累积
//                        (≥2 资产卡),面板内容与文档根文件一致。
//   manifest-unreadable-rejected — manifest 阶段头部不可解析 → 推进被拒
//                        (ERR_STAGE_MANIFEST_UNREADABLE);manifest 原文零改动。
// fixture_spec: Project/Feature(tasks 首次待推进)/ManifestFile/StageAsset。

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { freshRoot, WorldManager, bridgeInvoke } from '../_lib/journey-world.ts'
import { buildMainWorld, GATE_FEATURE, TASKS_GOAL, TASKS_SUMMARY_MARK } from './harness.ts'
import type { KernelWorld } from '../_lib/journey-world.ts'

test.describe.serial('stage-gates-cross-phase-context / step 4: 推进成功', () => {
  const manager = new WorldManager()
  let kernel: KernelWorld | null = null
  let unreadable: KernelWorld | null = null

  test.beforeAll(async () => {
    kernel = await buildMainWorld(freshRoot('gate-s4a'))
    unreadable = await buildMainWorld(freshRoot('gate-s4b'))
  })

  test.afterAll(async () => {
    await manager.closeAll()
  })

  /** Generate the tasks-stage summary over the bridge (the gate-opening write). */
  async function summarizeTasks(world: Awaited<ReturnType<WorldManager['acquire']>>): Promise<void> {
    const summarized = await bridgeInvoke<{ gateOpen: boolean }>(world.page, 'stageSummarize', [{
      projectId: world.projectId, featureSlug: GATE_FEATURE, stage: 'tasks', goal: TASKS_GOAL, summary: `${TASKS_SUMMARY_MARK}\n`,
    }])
    expect(summarized.gateOpen, '总结写入即开门').toBe(true)
  }

  // Outcome "success" — 首次生效推进(三面一致)。
  test('step4/success: the gate satisfied → advance succeeds: manifest stage replaced in place (tasks → in-progress), stepper moves, detail pill refluxes', async ({ }, testInfo) => {
    testInfo.setTimeout(420_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main', { tab: 'workbench/features' })
    const { page } = world
    const manifestPath = join(world.kernel.featuresRoot, GATE_FEATURE, 'manifest.md')

    await summarizeTasks(world)
    expect(readFileSync(manifestPath, 'utf8'), '前置:manifest 在 tasks').toContain('status: tasks')

    // 到达态是列表;详情经卡片点击打开(生成稿假设详情已开)。
    await page.locator(`[data-dsh-forge-feature-card="${GATE_FEATURE}"]`).click()
    const detail = page.locator(`[data-dsh-forge-feature-detail="${GATE_FEATURE}"]`)
    await expect(detail).toBeVisible({ timeout: 10_000 })
    const advanceEntry = detail.locator('[data-dsh-forge-advance-entry]')
    await advanceEntry.click()

    // 三面:推进按钮态翻 advanced + 详情状态 Pill = in-progress + stepper reached。
    await expect(advanceEntry, '推进按钮态翻 advanced').toHaveAttribute('data-dsh-forge-advance-state', 'advanced', { timeout: 10_000 })
    await expect(detail.locator('[data-dsh-forge-feature-status="in-progress"]'), '详情状态 Pill = in-progress(板回流)').toBeVisible({ timeout: 10_000 })
    await expect(detail.locator('[data-dsh-forge-stepper-phase="tasks"]'), 'stepper:tasks 已越过(reached)')
      .toHaveAttribute('data-dsh-forge-stepper-state', 'reached', { timeout: 10_000 })

    // State:manifest 阶段字段原位替换(内核唯一写面;其余字段保留)。
    const manifestAfter = readFileSync(manifestPath, 'utf8')
    expect(manifestAfter, '内核写 manifest status(in-progress)').toContain('status: in-progress')
    expect(manifestAfter.includes('status: tasks'), '旧阶段值退场').toBe(false)
  })

  // Outcome "multi-advance-accumulation" — 资产逐阶段累积(≥2 卡)。
  test('step4/multi-advance-accumulation: after a SECOND advance the assets panel accumulates both stage cards, panel content = doc-root files', async ({ }, testInfo) => {
    testInfo.setTimeout(600_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main', { tab: 'workbench/features' })
    const { page } = world

    // 第二程:in-progress 阶段总结 + 再推进(in-progress → completed)。
    const secondGoal = 'gate-loop in-progress 阶段目标锚点(第二程推进)'
    const secondMark = 'gate-loop in-progress 摘要锚点(第二程)。'
    await bridgeInvoke(page, 'stageSummarize', [{
      projectId: world.projectId, featureSlug: GATE_FEATURE, stage: 'in-progress', goal: secondGoal, summary: `${secondMark}\n`,
    }])
    const detail = page.locator(`[data-dsh-forge-feature-detail="${GATE_FEATURE}"]`)
    await expect(detail).toBeVisible({ timeout: 10_000 })
    await detail.locator('[data-dsh-forge-advance-entry]').click()
    await expect(detail.locator('[data-dsh-forge-feature-status="completed"]'), '第二程推进 → completed').toBeVisible({ timeout: 15_000 })

    // 「阶段资产」tab:≥3 张资产卡(prd + tasks + in-progress)按阶段累积。
    await detail.locator('[data-dsh-forge-feature-doc-tab="assets"]').click()
    const assetsPanel = detail.locator('[data-dsh-forge-feature-doc-panel="assets"]')
    await expect(assetsPanel.locator('[data-dsh-forge-stage-asset]'), '资产卡累积(≥3)').toHaveCount(3, { timeout: 15_000 })
    await expect(assetsPanel.locator('[data-dsh-forge-stage-asset="tasks"]'), 'tasks 资产卡在场').toBeVisible()
    await expect(assetsPanel.locator('[data-dsh-forge-stage-asset="tasks"]'), '面板内容与文档根一致(goal 逐字)').toContainText(TASKS_GOAL)
    await expect(assetsPanel.locator('[data-dsh-forge-stage-asset="in-progress"]'), 'in-progress 资产卡在场(第二程)').toBeVisible()
    await expect(assetsPanel.locator('[data-dsh-forge-stage-asset="in-progress"]'), '第二程 goal 逐字').toContainText(secondGoal)
  })

  // Outcome "manifest-unreadable-rejected" — manifest 损坏 → 拒绝合并写入。
  test('step4/manifest-unreadable-rejected: a corrupt manifest head → advance refused (ERR_STAGE_MANIFEST_UNREADABLE), stage unchanged, manifest bytes untouched', async ({ }, testInfo) => {
    testInfo.setTimeout(420_000)
    const world = await manager.acquire(unreadable as KernelWorld, 'unreadable', { tab: 'workbench/features' })
    const { page } = world

    // 开门(总结在场)+ 损坏 manifest(frontmatter 阶段字段不可解析)。
    await summarizeTasks(world)
    const manifestPath = join(world.kernel.featuresRoot, GATE_FEATURE, 'manifest.md')
    const corrupted = '---\nstatus: [broken yaml {{{\n---\n# broken\n'
    writeFileSync(manifestPath, corrupted, 'utf8')

    // 到达态是列表;详情经卡片点击打开(与同文件 success 腿同口径)。
    await page.locator(`[data-dsh-forge-feature-card="${GATE_FEATURE}"]`).click()
    const detail = page.locator(`[data-dsh-forge-feature-detail="${GATE_FEATURE}"]`)
    await expect(detail).toBeVisible({ timeout: 10_000 })
    await detail.locator('[data-dsh-forge-advance-entry]').click()

    // 拒绝呈现:错误码在推进动作位附近;零写入。
    const rejected = detail.locator('[data-dsh-forge-gate-hint-rejected="ERR_STAGE_MANIFEST_UNREADABLE"], [role="alert"]').first()
    await expect(rejected, '推进被拒(近动作位可观察)').toBeVisible({ timeout: 15_000 })
    const kernelRejected = await (async () => {
      try {
        await bridgeInvoke(page, 'advanceStage', [world.projectId, GATE_FEATURE])
        return undefined
      } catch (error) {
        return String((error as Error).message)
      }
    })()
    expect(kernelRejected ?? '', '内核拒绝码(ERR_STAGE_MANIFEST_UNREADABLE)').toContain('ERR_STAGE_MANIFEST_UNREADABLE')
    expect(readFileSync(manifestPath, 'utf8'), 'manifest 原文零改动(拒绝合并写入)').toBe(corrupted)
  })
})
