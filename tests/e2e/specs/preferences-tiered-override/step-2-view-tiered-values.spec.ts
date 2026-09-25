// @feature dsh-forge-m3 | @web-e2e | @journey preferences-tiered-override
// Traceability: docs/features/dsh-forge-m3/testing/preferences-tiered-override/
// contracts/step-2-view-tiered-values.md — Outcome:
//   success — 三级同键(auto.test.quick 布尔)各设不同值 → 三级值分别可见;
//             生效值 = feature 级值(feature > 项目 > 全局);覆盖来源标识
//             可辨(本级覆盖 Pill / 继承标注)。
// fixture_spec: Project/Feature + PrefEntry ×3(global/project/feature 同键)
// — seeded via the kernel prefs API (setPrefs bridge face, the single write
// path), asserted through the editing surface.

import { expect, test } from '@playwright/test'
import { freshRoot, WorldManager, bridgeInvoke } from '../_lib/journey-world.ts'
import { BOOL_KEY, buildMainWorld, pickPrefFeature, prefRow, switchPrefTier, waitGroupRows, waitPrefsReady } from './harness.ts'
import type { KernelWorld } from '../_lib/journey-world.ts'

test.describe.serial('preferences-tiered-override / step 2: 查看三级值与生效解析', () => {
  const manager = new WorldManager()
  let kernel: KernelWorld | null = null

  test.beforeAll(async () => {
    kernel = await buildMainWorld(freshRoot('prefs-s2'))
  })

  test.afterAll(async () => {
    await manager.closeAll()
  })

  // Outcome "success" — 覆盖序 feature > project > global 的三级可视。
  test('step2/success: the same boolean key set at three tiers with distinct values — per-tier views + effective = feature value + source labels distinguishable', async ({ }, testInfo) => {
    testInfo.setTimeout(420_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main', { tab: 'workbench/overview' })
    const { page } = world

    // fixture:三级同键不同值(经内核偏好 API —— 唯一写路径)。
    await bridgeInvoke(page, 'setPrefs', ['global', [{ key: BOOL_KEY, value: true }]])
    await bridgeInvoke(page, 'setPrefs', [{ project: world.projectId }, [{ key: BOOL_KEY, value: false }]])
    await bridgeInvoke(page, 'setPrefs', [{ feature: `${world.projectId}/${(kernel as KernelWorld).featureSlug}` }, [{ key: BOOL_KEY, value: true }]])

    await waitPrefsReady(page)

    // 全局层视图:本级显式值(true)+ 本级覆盖 Pill。
    await waitGroupRows(page, 'auto')
    const globalToggle = prefRow(page, 'auto', BOOL_KEY).locator('[data-dsh-forge-pref-control="toggle"]')
    await expect(globalToggle, '全局级值可见(true)').toBeChecked()
    await expect(prefRow(page, 'auto', BOOL_KEY).locator('[data-dsh-forge-pref-override]'), '全局级:本级覆盖标识').toBeVisible()

    // 项目层视图:本级显式值(false)压过全局 + 覆盖 Pill。
    await switchPrefTier(page, 'project')
    await waitGroupRows(page, 'auto')
    await expect(prefRow(page, 'auto', BOOL_KEY).locator('[data-dsh-forge-pref-control="toggle"]'), '项目级值可见(false,压过全局)').not.toBeChecked()
    await expect(prefRow(page, 'auto', BOOL_KEY).locator('[data-dsh-forge-pref-override]'), '项目级:本级覆盖标识').toBeVisible()

    // Feature 层视图:生效值 = feature 级(true,压过项目)+ 覆盖 Pill。
    await switchPrefTier(page, 'feature')
    await pickPrefFeature(page, (kernel as KernelWorld).featureSlug, 'auto')
    await expect(prefRow(page, 'auto', BOOL_KEY).locator('[data-dsh-forge-pref-control="toggle"]'), 'Feature 级生效值 = feature 值(覆盖序)').toBeChecked()
    await expect(prefRow(page, 'auto', BOOL_KEY).locator('[data-dsh-forge-pref-override]'), 'Feature 级:本级覆盖标识').toBeVisible()

    // State:生效解析沿链下探(内核面交叉 —— getPrefs 的 source = feature)。
    const featureRows = await bridgeInvoke<Array<{ key: string; value: unknown; source: string | null; override: boolean }>>(
      page, 'getPrefs', [{ feature: `${world.projectId}/${(kernel as KernelWorld).featureSlug}` }],
    )
    const boolRow = featureRows.find(row => row.key === BOOL_KEY)
    expect(boolRow?.value, '生效值 = feature 级值(解析权威)').toBe(true)
    expect(boolRow?.source, '来源 = feature(覆盖序命中最深显式行)').toBe('feature')
    expect(boolRow?.override, '查询级覆盖位').toBe(true)
  })
})
