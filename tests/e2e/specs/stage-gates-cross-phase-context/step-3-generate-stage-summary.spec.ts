// @feature dsh-forge-m3 | @web-e2e | @journey stage-gates-cross-phase-context
// Traceability: docs/features/dsh-forge-m3/testing/stage-gates-cross-phase-
// context/contracts/step-3-generate-stage-summary.md — one test per Outcome:
//   success                — 应用内通道产出阶段总结(stageSummarize = forge.
//                           stage.summarize 同路由写面)→ 单一规范文件
//                           stages/tasks.md(目标 + 摘要);门态翻转;元数据
//                           入内核(索引行在场)。
//   external-channel-summary — 外部通道直写资产文件 → 门态同样翻转为开
//                           (门判定吃活性 fs,不吃索引时滞;内外一致)。
// fixture_spec: Project/Feature(tasks 中间阶段)/StageAsset(external 腿)。

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { freshRoot, stageAssetMarkdown, WorldManager, bridgeInvoke } from '../_lib/journey-world.ts'
import { buildMainWorld, GATE_FEATURE, TASKS_GOAL, TASKS_SUMMARY_MARK } from './harness.ts'
import type { KernelWorld } from '../_lib/journey-world.ts'

test.describe.serial('stage-gates-cross-phase-context / step 3: 生成阶段总结', () => {
  const manager = new WorldManager()
  let kernel: KernelWorld | null = null

  test.beforeAll(async () => {
    kernel = await buildMainWorld(freshRoot('gate-s3'))
  })

  test.afterAll(async () => {
    await manager.closeAll()
  })

  // [M4 1.8 e2e 迁移·迁移清单 第④行 · M3 阶段资产面板 / Feature 板(workbench/features)] 本测试功能面锚定 1.7 已退役的旧视图宿主,
  // P2 右栏 pane / 概览子 tab(2.1–2.4)落座后按新宿主恢复,2.10 全量复跑收口。
  // 断言本体零删改(零功能删除断言 Hard Rule)—— test.fixme 仅为过渡期挂起。

  // Outcome "success" — 应用内通道:总结生成 → 资产文件 + 门开 + 元数据入内核。
  test.fixme('step3/success: in-app channel summary (stageSummarize) → the canonical stages/tasks.md lands (goal + summary), the gate flips open, metadata enters the kernel', async ({ }, testInfo) => {
    testInfo.setTimeout(420_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main', { tab: 'workbench/features' })
    const { page } = world

    // 应用内通道(与 forge.stage.summarize 工具同路由的内核写面)。
    const summarized = await bridgeInvoke<{ path: string; featureStage: string; gateOpen: boolean; generatedAt: string }>(page, 'stageSummarize', [{
      projectId: world.projectId,
      featureSlug: GATE_FEATURE,
      stage: 'tasks',
      goal: TASKS_GOAL,
      summary: `${TASKS_SUMMARY_MARK}\n`,
    }])
    expect(summarized.path, '写后相对路径 = stages/<stage>.md(单一规范文件)').toBe(`${GATE_FEATURE}/stages/tasks.md`)
    expect(summarized.featureStage, '写时 feature 仍在 tasks').toBe('tasks')
    expect(summarized.gateOpen, '本次写入即开门(gateOpen)').toBe(true)

    // 文件面:frontmatter {stage, goal} + 摘要正文(内核铸造)。
    const assetAbs = join(world.kernel.featuresRoot, GATE_FEATURE, 'stages', 'tasks.md')
    expect(existsSync(assetAbs), '资产文件落于文档根').toBe(true)
    const markdown = readFileSync(assetAbs, 'utf8')
    expect(markdown, 'frontmatter stage = tasks').toContain('stage: tasks')
    expect(markdown, 'frontmatter goal 逐字').toContain(TASKS_GOAL)
    expect(markdown, '正文摘要逐字').toContain(TASKS_SUMMARY_MARK)

    // 门态翻转(重开详情 —— SC4 先例:stepper 门态经重开呈现)。生成稿假设
    // 详情已开;实际到达态是列表 —— 先开详情再走重开链。
    await page.locator(`[data-dsh-forge-feature-card="${GATE_FEATURE}"]`).click()
    const detail = page.locator(`[data-dsh-forge-feature-detail="${GATE_FEATURE}"]`)
    await expect(detail).toBeVisible({ timeout: 10_000 })
    await detail.locator('[data-dsh-forge-feature-back]').click()
    await page.locator(`[data-dsh-forge-feature-card="${GATE_FEATURE}"]`).click()
    await expect(page.locator(`[data-dsh-forge-feature-detail="${GATE_FEATURE}"]`)).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-dsh-forge-stepper-phase="tasks"]'), '总结已生成 → tasks 节点回正常态(current)')
      .toHaveAttribute('data-dsh-forge-stepper-state', 'current', { timeout: 10_000 })
    await expect(page.locator(`[data-dsh-forge-feature-detail="${GATE_FEATURE}"] [data-dsh-forge-gate-hint-line]`),
      '门提示行退场').toHaveCount(0)

    // State:资产元数据入内核(stage_asset 索引;写后即就位,零感知时滞)。
    const gate = await bridgeInvoke<{ summaryGenerated: boolean; gateAssetPath: string | null; assets: Array<{ stage: string }> }>(
      page, 'getStageGate', [world.projectId, GATE_FEATURE],
    )
    expect(gate.summaryGenerated, '门开(内核面)').toBe(true)
    expect(gate.gateAssetPath, '门资产路径 = 相对地址').toBe(`${GATE_FEATURE}/stages/tasks.md`)
    expect(gate.assets.some(asset => asset.stage === 'tasks'), '资产登记行在场(元数据入 SQLite)').toBe(true)
  })

  // Outcome "external-channel-summary" — 外部直写 → 门态一致翻转为开。
  test.fixme('step3/external-channel-summary: an EXTERNALLY-written stages/tasks.md flips the gate open just like the in-app channel (live fs verdict, not index freshness)', async ({ }, testInfo) => {
    testInfo.setTimeout(420_000)
    // 独立世界(门关态:仅 prd 资产,tasks.md 缺席)。
    const externalKernel = await buildMainWorld(freshRoot('gate-s3b'))
    const world = await manager.acquire(externalKernel, 'external', { tab: 'workbench/features' })
    const { page } = world

    const gateBefore = await bridgeInvoke<{ summaryGenerated: boolean }>(page, 'getStageGate', [world.projectId, GATE_FEATURE])
    expect(gateBefore.summaryGenerated, '前置:门关(stages/tasks.md 缺席)').toBe(false)

    // 外部通道直写资产文件(终端/外部会话产出形态)。
    const { mkdirSync, writeFileSync } = await import('node:fs')
    mkdirSync(join(externalKernel.featuresRoot, GATE_FEATURE, 'stages'), { recursive: true })
    writeFileSync(join(externalKernel.featuresRoot, GATE_FEATURE, 'stages', 'tasks.md'),
      stageAssetMarkdown('tasks', 'gate-loop 外部通道目标锚点', 'gate-loop 外部产出摘要锚点。'), 'utf8')

    // 门态经活性 fs 即时翻转(与内部通道结果一致;不吃索引时滞)。
    const gateAfter = await bridgeInvoke<{ summaryGenerated: boolean; gateAssetPath: string | null }>(page, 'getStageGate', [world.projectId, GATE_FEATURE])
    expect(gateAfter.summaryGenerated, '外部产出 → 门开(活性 fs,内外一致)').toBe(true)
    expect(gateAfter.gateAssetPath, '门资产路径 = 外部落位文件').toBe(`${GATE_FEATURE}/stages/tasks.md`)

    // 感知扫描将外部产出收编入登记(≤5s 口径)。
    await expect(async () => {
      const assets = await bridgeInvoke<Array<{ stage: string }>>(page, 'listStageAssets', [world.projectId, GATE_FEATURE])
      expect(assets.some(asset => asset.stage === 'tasks'), '外部产出被收编入资产登记').toBe(true)
    }).toPass({ timeout: 20_000 })
  })
})
