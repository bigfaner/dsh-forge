// @feature dsh-forge-m3 | @web-e2e | @journey proposal-board-browsing
// Traceability: docs/features/dsh-forge-m3/testing/proposal-board-browsing/
// contracts/step-3-badge-crossjump.md — Outcome:
//   success — 徽标互跳 → Feature 看板对应条目(详情在场);返回链闭合回提案
//             看板(返回来源页);视图切换零数据变更。
// fixture_spec: Project + Proposal(featureSlug 非空且指向存在的 feature)+
// Feature(slug 与关联值一致)— main world。

import { expect, test } from '@playwright/test'
import { freshRoot, WorldManager, bridgeInvoke } from '../_lib/journey-world.ts'
import { ASSOCIATED, buildMainWorld, PROP_FEATURE } from './harness.ts'
import type { KernelWorld } from '../_lib/journey-world.ts'

test.describe.serial('proposal-board-browsing / step 3: 经徽标互跳 feature 看板', () => {
  const manager = new WorldManager()
  let kernel: KernelWorld | null = null

  test.beforeAll(async () => {
    kernel = await buildMainWorld(freshRoot('prop-s3'))
  })

  test.afterAll(async () => {
    await manager.closeAll()
  })

  // Outcome "success" — proposal → feature → 返回链往返闭合。
  test('step3/success: the feature badge jumps to the Feature board entry and the return chain closes back on the proposal board (zero data change)', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main', { tab: 'workbench/proposals' })
    const { page } = world

    const boardBefore = await bridgeInvoke<Array<{ slug: string }>>(page, 'getProposalBoard', [world.projectId])

    // 互跳入口 = 关联行的 feature 徽标。
    const jumpBadge = page.locator(`[data-dsh-forge-proposal-row="${ASSOCIATED}"] [data-dsh-forge-proposal-feature-jump="${PROP_FEATURE}"]`)
    await expect(jumpBadge, '互跳入口在场').toBeVisible()
    await jumpBadge.click()

    // Feature tab:对应 feature 详情打开(openFeatureDetail 寻址)。
    const featureDetail = page.locator(`[data-dsh-forge-feature-detail="${PROP_FEATURE}"]`)
    await expect(featureDetail, '徽标互跳 → Feature 详情在场').toBeVisible({ timeout: 20_000 })

    // 返回链:feature back → Feature 列表 → 提案 tab → 板(往返闭合)。
    await featureDetail.locator('[data-dsh-forge-feature-back]').click()
    await expect(page.locator(`[data-dsh-forge-feature-card="${PROP_FEATURE}"]`), 'feature back → Feature 列表').toBeVisible({ timeout: 15_000 })
    await page.locator('[data-dsh-forge-tab="workbench/proposals"]').click()
    await expect(page.locator('[data-dsh-forge-proposal-rows], [data-dsh-forge-proposal-list-seat]').first(), '提案 tab → 板(往返闭合)').toBeVisible({ timeout: 15_000 })

    // State:视图切换零数据变更(派生快照不因导航漂移)。
    const boardAfter = await bridgeInvoke<Array<{ slug: string }>>(page, 'getProposalBoard', [world.projectId])
    expect(boardAfter.map(row => row.slug).sort(), '互跳往返零数据变更').toEqual(boardBefore.map(row => row.slug).sort())
  })
})
