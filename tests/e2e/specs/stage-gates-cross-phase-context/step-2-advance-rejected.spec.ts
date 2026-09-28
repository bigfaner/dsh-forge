// @feature dsh-forge-m3 | @web-e2e | @journey stage-gates-cross-phase-context
// Traceability: docs/features/dsh-forge-m3/testing/stage-gates-cross-phase-
// context/contracts/step-2-advance-rejected.md — Outcome:
//   gate-rejected — 总结未生成 → 推进被拒(ERR_STAGE_GATE_UNSATISFIED + 缺失
//                   资产地址 + 生成路径引导);feature 阶段不变(manifest
//                   字节零写);门校验确定性(双调相等 + 活性 fs)。
// fixture_spec: Project/Feature(tasks)/ManifestFile(status= tasks 基线)+
// state_requirement(stages/<当前阶段>.md 不存在)。

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { freshRoot, WorldManager, bridgeInvoke } from '../_lib/journey-world.ts'
import { buildMainWorld, GATE_FEATURE } from './harness.ts'
import type { KernelWorld } from '../_lib/journey-world.ts'

test.describe.serial('stage-gates-cross-phase-context / step 2: 总结未生成时请求推进被拒', () => {
  const manager = new WorldManager()
  let kernel: KernelWorld | null = null

  test.beforeAll(async () => {
    kernel = await buildMainWorld(freshRoot('gate-s2'))
  })

  test.afterAll(async () => {
    await manager.closeAll()
  })

  // [M4 1.8 e2e 迁移·迁移清单 第④行 · M3 阶段资产面板 / Feature 板(workbench/features)] 本测试功能面锚定 1.7 已退役的旧视图宿主,
  // P2 右栏 pane / 概览子 tab(2.1–2.4)落座后按新宿主恢复,2.10 全量复跑收口。
  // 断言本体零删改(零功能删除断言 Hard Rule)—— test.fixme 仅为过渡期挂起。

  // Outcome "gate-rejected" — 编排层硬门:拒绝 + 引导 + 零写入。
  test.fixme('step2/gate-rejected: advancing without the stage summary → ERR_STAGE_GATE_UNSATISFIED with asset-path + tool guidance; stage unchanged (manifest bytes untouched)', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main', { tab: 'workbench/features' })
    const { page } = world
    const manifestPath = join(world.kernel.featuresRoot, GATE_FEATURE, 'manifest.md')
    const manifestBefore = readFileSync(manifestPath, 'utf8')

    const featureCard = page.locator(`[data-dsh-forge-feature-card="${GATE_FEATURE}"]`)
    await featureCard.click()
    const detail = page.locator(`[data-dsh-forge-feature-detail="${GATE_FEATURE}"]`)
    await expect(detail).toBeVisible({ timeout: 10_000 })

    // 推进 → 拒绝:ERR_STAGE_GATE_UNSATISFIED + 引导块(role=alert)。
    const advanceEntry = detail.locator('[data-dsh-forge-advance-entry]')
    await expect(advanceEntry).toBeVisible({ timeout: 10_000 })
    await advanceEntry.click()
    const rejected = detail.locator('[data-dsh-forge-gate-hint-rejected="ERR_STAGE_GATE_UNSATISFIED"]')
    await expect(rejected, '推进被拒 + 引导块(role=alert)').toBeVisible({ timeout: 10_000 })
    await expect(rejected, '引导携带缺失资产地址(stages/<stage>.md)').toContainText('stages/tasks.md')
    await expect(rejected, '引导携带生成路径(forge.stage.summarize)').toContainText('forge')

    // State:拒绝零写入 —— manifest 字节未动;门态不变(确定性 + 活性 fs)。
    expect(readFileSync(manifestPath, 'utf8'), '拒绝零写入:manifest 仍为 tasks').toBe(manifestBefore)
    expect(manifestBefore, '观察基线自证(确在 tasks)').toContain('status: tasks')

    const gateA = await bridgeInvoke<{ summaryGenerated: boolean }>(page, 'getStageGate', [world.projectId, GATE_FEATURE])
    const gateB = await bridgeInvoke<{ summaryGenerated: boolean }>(page, 'getStageGate', [world.projectId, GATE_FEATURE])
    expect(gateA, '门校验确定性(双调逐字段相等,零模型参与)').toEqual(gateB)
    expect(gateA.summaryGenerated, '门仍关(总结未生成)').toBe(false)
  })
})
