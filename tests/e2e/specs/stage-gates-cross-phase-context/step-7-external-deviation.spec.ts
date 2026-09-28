// @feature dsh-forge-m3 | @web-e2e | @journey stage-gates-cross-phase-context
// Traceability: docs/features/dsh-forge-m3/testing/stage-gates-cross-phase-
// context/contracts/step-7-external-deviation.md — one test per Outcome:
//   success              — 外部跨阶段操作(manifest status 直改)→ 看板偏离
//                          徽标呈现;不硬阻断三面(manifest 字节原样 / 详情
//                          可开 / 动词面应答)。
//   no-blocking-interaction — 偏离标识呈现中:点击标识 + 继续编排操作 → 零
//                          阻断弹窗/锁定;正常派发与浏览照旧。
// fixture_spec: Project/Feature(snapshotPresent)/ManifestFile(status 被外部
// 改写为不同阶段)。

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { freshRoot, WorldManager, bridgeInvoke } from '../_lib/journey-world.ts'
import { buildMainWorld, GATE_FEATURE } from './harness.ts'
import type { KernelWorld } from '../_lib/journey-world.ts'

test.describe.serial('stage-gates-cross-phase-context / step 7: 外部会话跨阶段操作的偏离呈现', () => {
  const manager = new WorldManager()
  let kernel: KernelWorld | null = null

  test.beforeAll(async () => {
    kernel = await buildMainWorld(freshRoot('gate-s7'))
  })

  test.afterAll(async () => {
    await manager.closeAll()
  })

  // [M4 1.8 e2e 迁移·迁移清单 第④行 · M3 阶段资产面板 / Feature 板(workbench/features)] 本测试功能面锚定 1.7 已退役的旧视图宿主,
  // P2 右栏 pane / 概览子 tab(2.1–2.4)落座后按新宿主恢复,2.10 全量复跑收口。
  // 断言本体零删改(零功能删除断言 Hard Rule)—— test.fixme 仅为过渡期挂起。

  // Outcome "success" — 偏离徽标 + 不硬阻断三面。
  test.fixme('step7/success: an external cross-stage manifest rewrite surfaces the deviation badge; the app does NOT block (bytes intact, detail openable, verbs answer)', async ({ }, testInfo) => {
    testInfo.setTimeout(420_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main', { tab: 'workbench/features' })
    const { page } = world
    const manifestPath = join(world.kernel.featuresRoot, GATE_FEATURE, 'manifest.md')

    const featureCard = page.locator(`[data-dsh-forge-feature-card="${GATE_FEATURE}"]`)
    await expect(featureCard).toBeVisible({ timeout: 30_000 })
    await expect(featureCard.locator('[data-dsh-forge-badge="deviation"]'), '前置:无偏离徽标').toHaveCount(0)

    // 外部跨阶段操作(测试内模拟外部会话):manifest status 直改 tasks → completed。
    const manifestBefore = readFileSync(manifestPath, 'utf8')
    const externalManifest = manifestBefore.replace('status: tasks', 'status: completed')
    expect(externalManifest, '替换确实发生').not.toBe(manifestBefore)
    writeFileSync(manifestPath, externalManifest, 'utf8')

    // watcher(400ms debounce)→ 偏离检测 → 看板回流 → 「偏离」徽标呈现。
    await featureCard.locator('[data-dsh-forge-badge="deviation"]').waitFor({ state: 'visible', timeout: 20_000 })

    // 不硬阻断三面:① manifest 字节原样(感知零写回,外部操作不被撤销)。
    expect(readFileSync(manifestPath, 'utf8'), '偏离 ≠ 阻断:外部 manifest 字节原样(零写回)').toBe(externalManifest)
    // ② 详情仍可打开(头部同徽标,卡 + 详情同源)。
    await featureCard.click()
    const detail = page.locator(`[data-dsh-forge-feature-detail="${GATE_FEATURE}"]`)
    await expect(detail, '详情仍可打开(不阻断导航)').toBeVisible({ timeout: 10_000 })
    await expect(detail.locator('[data-dsh-forge-badge="deviation"]'), '详情头部偏离徽标').toBeVisible()
    // ③ 动词面仍应答(内核未进入阻断态)。
    const state = await bridgeInvoke<{ activeProjectId: string | null }>(page, 'getState', [])
    expect(state.activeProjectId, '动词面仍应答').toBe(world.projectId)
  })

  // Outcome "no-blocking-interaction" — 偏离不产生阻断交互。
  test.fixme('step7/no-blocking-interaction: with the badge presented, clicking it and continuing orchestration produce ZERO blocking dialogs; normal browsing stays available', async ({ }, testInfo) => {
    testInfo.setTimeout(420_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main', { tab: 'workbench/features' })
    const { page } = world

    // 前置:偏离徽标呈现中(承接 success 的外部改写;若未回流则再触发)。
    // 复用世界可能停在上一测试的详情态 —— 先归位 features 列表。
    await page.locator('[data-dsh-forge-tab="workbench/features"]').click()
    const carriedDetail = page.locator(`[data-dsh-forge-feature-detail="${GATE_FEATURE}"]`)
    if (await carriedDetail.isVisible().catch(() => false)) {
      await carriedDetail.locator('[data-dsh-forge-feature-back]').click()
      await expect(carriedDetail).toHaveCount(0, { timeout: 10_000 })
    }
    const featureCard = page.locator(`[data-dsh-forge-feature-card="${GATE_FEATURE}"]`)
    await expect(featureCard.locator('[data-dsh-forge-badge="deviation"]'), '偏离徽标在场(前置)').toBeVisible({ timeout: 20_000 })

    // 点击偏离标识 → 零阻断弹窗/锁定(任何 dialog 不出现)。
    await featureCard.locator('[data-dsh-forge-badge="deviation"]').click()
    await page.waitForTimeout(800)
    await expect(page.locator('[data-dsh-forge-dialog]'), '点击徽标:零阻断弹窗').toHaveCount(0)

    // 正常编排操作照旧:详情可开、任务看板可浏览(标识仅呈现)。徽标点击
    // 会冒泡至卡片(徽标非交互元素)而开详情 —— 已开即导航已证,未开再点卡。
    const detailAfterBadge = page.locator(`[data-dsh-forge-feature-detail="${GATE_FEATURE}"]`)
    if (!(await detailAfterBadge.isVisible().catch(() => false))) {
      await featureCard.click()
    }
    await expect(detailAfterBadge, '正常浏览照旧可用').toBeVisible({ timeout: 10_000 })
    await page.locator('[data-dsh-forge-tab="workbench/tasks"]').click()
    await expect(page.locator('[data-dsh-forge-node-card]').first(), '任务看板照旧可浏览').toBeVisible({ timeout: 20_000 })
    await expect(page.locator('[data-dsh-forge-dialog]'), '全程零阻断弹窗').toHaveCount(0)
  })
})
