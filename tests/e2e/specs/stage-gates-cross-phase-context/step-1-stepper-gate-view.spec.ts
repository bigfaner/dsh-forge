// @feature dsh-forge-m3 | @web-e2e | @journey stage-gates-cross-phase-context
// Traceability: docs/features/dsh-forge-m3/testing/stage-gates-cross-phase-
// context/contracts/step-1-stepper-gate-view.md — one test per Outcome:
//   success     — Feature 看板:列表呈现当前阶段;详情 stepper + 门态
//                 (gate-pending)+ 门提示行;偏离标识缺席(无偏离)。
//   asset-empty — 早期 feature(prd)打开「阶段资产」面板 → 无资产占位说明
//                 (asset-empty 正常态,无错误)。
// fixture_spec: Project(sqlite)/Feature(tasks 中间阶段)/ManifestFile +
// (early 世界:Feature(prd) + stages/ 缺席)。

import { expect, test } from '@playwright/test'
import { freshRoot, WorldManager, bridgeInvoke } from '../_lib/journey-world.ts'
import { buildEarlyWorld, buildMainWorld, EARLY_FEATURE, GATE_FEATURE } from './harness.ts'
import type { KernelWorld } from '../_lib/journey-world.ts'

test.describe.serial('stage-gates-cross-phase-context / step 1: 查看阶段 stepper 与门状态', () => {
  const manager = new WorldManager()
  let main: KernelWorld | null = null
  let early: KernelWorld | null = null

  test.beforeAll(async () => {
    main = await buildMainWorld(freshRoot('gate-s1a'))
    early = await buildEarlyWorld(freshRoot('gate-s1b'))
  })

  test.afterAll(async () => {
    await manager.closeAll()
  })

  // [M4 1.8 e2e 迁移·迁移清单 第④行 · M3 阶段资产面板 / Feature 板(workbench/features)] 本测试功能面锚定 1.7 已退役的旧视图宿主,
// P2 2.10 复核:断言锚定已退役宿主方言(旧向导/换台 chrome/提案板与
// Feature 板详情/阶段资产面板内部件),右栏 pane 族未承接 —— 挂起终态与恢复前置 = regression-inventory.md 开放项。
  // 断言本体零删改(零功能删除断言 Hard Rule)—— test.fixme 仅为过渡期挂起。

  // Outcome "success" — stepper + 门态被动面(纯读零写)。
  test.fixme('step1/success: the Feature board lists the stage; the detail stepper shows the gate-pending face + hint line; no deviation badge', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const world = await manager.acquire(main as KernelWorld, 'main', { tab: 'workbench/features' })
    const { page } = world

    const featureCard = page.locator(`[data-dsh-forge-feature-card="${GATE_FEATURE}"]`)
    await expect(featureCard, 'Feature 卡在场(列表呈现)').toBeVisible({ timeout: 30_000 })
    await expect(featureCard.locator('[data-dsh-forge-badge="deviation"]'), '无偏离徽标(前置)').toHaveCount(0)
    await featureCard.click()

    const detail = page.locator(`[data-dsh-forge-feature-detail="${GATE_FEATURE}"]`)
    await expect(detail).toBeVisible({ timeout: 10_000 })

    // stepper:当前阶段 tasks 节点 gate-pending(总结未生成的门态被动面)。
    const stepperTasks = detail.locator('[data-dsh-forge-stepper-phase="tasks"]')
    await expect(stepperTasks, 'tasks 节点 gate-pending 态').toHaveAttribute('data-dsh-forge-stepper-state', 'gate-pending', { timeout: 10_000 })
    await expect(detail.locator('[data-dsh-forge-gate-hint-line]'), '门提示行在场(总结未生成)').toBeVisible()

    // State:门态由文档根在场性即时判定(活性 fs;与推进门同口径)。
    const gate = await bridgeInvoke<{ stage: string; summaryGenerated: boolean; gateAssetPath: string | null }>(
      page, 'getStageGate', [world.projectId, GATE_FEATURE],
    )
    expect(gate.stage, '检查对象 = feature 当前阶段 tasks').toBe('tasks')
    expect(gate.summaryGenerated, 'stages/tasks.md 缺席 → 门未开').toBe(false)
    expect(gate.gateAssetPath, '门资产路径空').toBeNull()
  })

  // Outcome "asset-empty" — 无阶段资产的空态(正常态)。
  test.fixme('step1/asset-empty: an early-stage feature with zero stage assets renders the asset-empty placeholder (normal, no error)', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const world = await manager.acquire(early as KernelWorld, 'early', { tab: 'workbench/features' })
    const { page } = world

    const featureCard = page.locator(`[data-dsh-forge-feature-card="${EARLY_FEATURE}"]`)
    await expect(featureCard).toBeVisible({ timeout: 30_000 })
    await featureCard.click()
    const detail = page.locator(`[data-dsh-forge-feature-detail="${EARLY_FEATURE}"]`)
    await expect(detail).toBeVisible({ timeout: 10_000 })

    // 「阶段资产」tab → 面板空态占位(无错误)。
    await detail.locator('[data-dsh-forge-feature-doc-tab="assets"]').click()
    const assetsPanel = detail.locator('[data-dsh-forge-feature-doc-panel="assets"]')
    await expect(assetsPanel, '资产面板在场').toBeVisible({ timeout: 10_000 })
    await expect(assetsPanel.locator('[data-dsh-forge-stage-assets-empty]').first(),
      '空态占位说明在场(asset-empty 正常态)').toBeVisible({ timeout: 15_000 })
  })
})
