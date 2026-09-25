// @feature dsh-forge-m3 | @web-e2e | @journey preferences-tiered-override
// Traceability: docs/features/dsh-forge-m3/testing/preferences-tiered-override/
// contracts/step-1-open-prefs-panel.md — one test per Outcome:
//   success                  — 三级层级呈现;键集固定分组(auto/worktree/eval/
//                              coverage);surfaces 不在键集;无自由键编辑。
//   no-feature-tier-disabled — 零 feature 项目:Feature 层级禁用 + 说明;
//                              全局/项目级照常可用。
// fixture_spec: Project/Feature(≥1)/PrefEntry(注册键集内)— served by
// harness.buildMainWorld / buildBareWorld.

import { expect, test } from '@playwright/test'
import { freshRoot, WorldManager, bridgeInvoke } from '../_lib/journey-world.ts'
import { buildBareWorld, buildMainWorld, waitPrefsReady } from './harness.ts'
import type { KernelWorld } from '../_lib/journey-world.ts'

test.describe.serial('preferences-tiered-override / step 1: 打开偏好编辑面', () => {
  const manager = new WorldManager()
  let main: KernelWorld | null = null
  let bare: KernelWorld | null = null

  test.beforeAll(async () => {
    main = await buildMainWorld(freshRoot('prefs-s1a'))
    bare = await buildBareWorld(freshRoot('prefs-s1b'))
  })

  test.afterAll(async () => {
    await manager.closeAll()
  })

  // Outcome "success" — 偏好面:三级层级 + 固定键集分组,surfaces 缺席。
  test('step1/success: the prefs panel renders the three tiers and the FIXED key groups (auto/worktree/eval/coverage); surfaces absent, no free-key editing', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const world = await manager.acquire(main as KernelWorld, 'main', { tab: 'workbench/overview' })
    const { page } = world

    await waitPrefsReady(page)

    // 三级层级 segmented(全局/当前项目/当前 feature)。
    for (const tier of ['global', 'project', 'feature']) {
      await expect(page.locator(`[data-dsh-forge-pref-tier="${tier}"]`), `层级 ${tier} 在场`).toBeVisible()
    }

    // 键集固定分组呈现(键集经 API 暴露,UI 分组 = auto/worktree/eval/coverage)。
    for (const group of ['auto', 'worktree', 'eval', 'coverage']) {
      await expect(page.locator(`[data-dsh-forge-pref-group-body="${group}"]`), `键分组 ${group} 在场`).toBeVisible({ timeout: 20_000 })
    }

    // surfaces 不出现在键集;无自由键编辑(零「新增键」入口)。
    await expect(page.locator('[data-dsh-forge-pref-row^="surfaces"]'), 'surfaces 不在键集').toHaveCount(0)
    await expect(page.locator('[data-dsh-forge-pref-add], [data-dsh-forge-prefs-add-key]'), '无自由键编辑入口').toHaveCount(0)

    // State(纯读面):getPrefs 返回全键投影(值/来源/覆盖位 + 类型元数据)。
    const rows = await bridgeInvoke<Array<{ key: string; source: string | null }>>(page, 'getPrefs', [{ project: world.projectId }])
    expect(rows.length, '键投影非空(全键集)').toBeGreaterThan(0)
    expect(rows.some(row => row.key.startsWith('surfaces.')), '键集不含 surfaces(经 API 面复核)').toBe(false)
  })

  // Outcome "no-feature-tier-disabled" — 零 feature → Feature 层级禁用 + 说明。
  test('step1/no-feature-tier-disabled: with zero features the Feature tier is disabled with its tooltip; global/project stay usable', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const world = await manager.acquire(bare as KernelWorld, 'bare', { tab: 'workbench/overview' })
    const { page } = world

    await waitPrefsReady(page)
    await expect(page.locator('[data-dsh-forge-pref-tier="feature"]'), 'Feature 层级禁用(无 feature)').toBeDisabled()
    const title = await page.locator('[data-dsh-forge-pref-tier="feature"]').getAttribute('title')
    expect(title ?? '', '禁用说明在场(tooltip)').toBeTruthy()

    // 全局/项目级查看与修改照常可用(层级可用性 + 键行在场)。
    await expect(page.locator('[data-dsh-forge-pref-tier="global"]'), '全局层级可用').toBeEnabled()
    await expect(page.locator('[data-dsh-forge-pref-tier="project"]'), '项目层级可用').toBeEnabled()
    await expect(page.locator('[data-dsh-forge-pref-group-body="auto"]'), '键行照常呈现').toBeVisible()
  })
})
