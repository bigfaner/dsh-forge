// @feature dsh-forge-m3 | @web-e2e | @journey preferences-tiered-override
// Traceability: docs/features/dsh-forge-m3/testing/preferences-tiered-override/
// contracts/step-4-clear-override.md — one test per Outcome:
//   success              — 清除 feature 级覆盖 → 生效值回落项目级值;来源
//                          标识回到「继承自上级」。
//   roundtrip-consistency — 重设同键覆盖再清除 → 往返后状态与首次清除后
//                          等价(行集一致,无残留中间态)。
// fixture_spec: Project/Feature + PrefEntry(feature 覆盖行 + project 显式行)。

import { expect, test } from '@playwright/test'
import { freshRoot, WorldManager, bridgeInvoke } from '../_lib/journey-world.ts'
import { BOOL_KEY, buildMainWorld, pickPrefFeature, prefRow, settlePrefsToast, switchPrefTier, waitGroupRows, waitPrefsReady } from './harness.ts'
import type { KernelWorld } from '../_lib/journey-world.ts'

test.describe.serial('preferences-tiered-override / step 4: 清除覆盖回落', () => {
  const manager = new WorldManager()
  let kernel: KernelWorld | null = null

  test.beforeAll(async () => {
    kernel = await buildMainWorld(freshRoot('prefs-s4'))
  })

  test.afterAll(async () => {
    await manager.closeAll()
  })

  // Outcome "success" — 清除 feature 覆盖 → 回落项目级(继承标注复现)。
  test('step4/success: clear the feature-level override → the effective value falls back to the project value and the source label returns to inherited', async ({ }, testInfo) => {
    testInfo.setTimeout(420_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main', { tab: 'workbench/overview' })
    const { page } = world
    const slug = (kernel as KernelWorld).featureSlug

    // fixture:项目级显式值(false)+ feature 覆盖(true)。
    await bridgeInvoke(page, 'setPrefs', [{ project: world.projectId }, [{ key: BOOL_KEY, value: false }]])
    await bridgeInvoke(page, 'setPrefs', [{ feature: `${world.projectId}/${slug}` }, [{ key: BOOL_KEY, value: true }]])

    await waitPrefsReady(page)
    await switchPrefTier(page, 'feature')
    await pickPrefFeature(page, slug, 'auto')
    await expect(prefRow(page, 'auto', BOOL_KEY).locator('[data-dsh-forge-pref-control="toggle"]'), '前置:feature 覆盖生效(true)').toBeChecked()

    // 清除 feature 级覆盖。
    await prefRow(page, 'auto', BOOL_KEY).locator('[data-dsh-forge-pref-clear]').click()
    await expect(prefRow(page, 'auto', BOOL_KEY).locator('[data-dsh-forge-pref-source]'), '回落:继承标注复现').toBeVisible({ timeout: 15_000 })
    await expect(prefRow(page, 'auto', BOOL_KEY).locator('[data-dsh-forge-pref-control="toggle"]'), '生效值回落项目级(false)').not.toBeChecked()
    await settlePrefsToast(page)

    // State:feature 行删除;解析链回落(内核面)。
    const rows = await bridgeInvoke<Array<{ key: string; value: unknown; source: string | null }>>(
      page, 'getPrefs', [{ feature: `${world.projectId}/${slug}` }],
    )
    const boolRow = rows.find(row => row.key === BOOL_KEY)
    expect(boolRow?.value, '生效值 = 项目级值').toBe(false)
    expect(boolRow?.source, '来源回落 = project').toBe('project')
  })

  // Outcome "roundtrip-consistency" — 覆盖-清除往返等价,无残留中间态。
  test('step4/roundtrip-consistency: re-set then re-clear the same override → the row state equals the first post-clear state exactly (kernel row-set equivalence)', async ({ }, testInfo) => {
    testInfo.setTimeout(420_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main')
    const { page } = world
    const slug = (kernel as KernelWorld).featureSlug
    const scope = { feature: `${world.projectId}/${slug}` }

    // 首次清除后的行集锚(承接 success 的终态:feature 行已删)。
    const rowsAfterFirstClear = await bridgeInvoke<Array<{ key: string; value: unknown; source: string | null }>>(page, 'getPrefs', [scope])

    // 重新设置同键 feature 级覆盖(经编辑面写口)。
    // M4 1.8 迁移改写:逃生门即 overview 单页,无需 tab 归位。
    await waitPrefsReady(page)
    await switchPrefTier(page, 'feature')
    await pickPrefFeature(page, slug, 'auto')
    const toggle = prefRow(page, 'auto', BOOL_KEY).locator('[data-dsh-forge-pref-control="toggle"]')
    await toggle.click()
    await expect(prefRow(page, 'auto', BOOL_KEY).locator('[data-dsh-forge-pref-override]'), '重设覆盖生效').toBeVisible({ timeout: 15_000 })
    await settlePrefsToast(page)

    // 再次清除。
    await prefRow(page, 'auto', BOOL_KEY).locator('[data-dsh-forge-pref-clear]').click()
    await expect(prefRow(page, 'auto', BOOL_KEY).locator('[data-dsh-forge-pref-source]'), '再次清除 → 继承标注').toBeVisible({ timeout: 15_000 })
    await settlePrefsToast(page)

    // 往返后行集与首次清除后等价(无残留中间态)。
    const rowsAfterRoundtrip = await bridgeInvoke<Array<{ key: string; value: unknown; source: string | null }>>(page, 'getPrefs', [scope])
    expect(rowsAfterRoundtrip.find(row => row.key === BOOL_KEY)?.source, '往返等价:来源 = project(继承)').toBe('project')
    expect(rowsAfterRoundtrip.find(row => row.key === BOOL_KEY)?.value, '往返等价:生效值 = 项目级').toBe(false)
    expect(rowsAfterFirstClear.find(row => row.key === BOOL_KEY)?.source, '锚对照:首次清除后同为 project').toBe('project')
  })
})
