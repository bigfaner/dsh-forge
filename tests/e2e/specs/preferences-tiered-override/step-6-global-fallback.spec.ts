// @feature dsh-forge-m3 | @web-e2e | @journey preferences-tiered-override
// Traceability: docs/features/dsh-forge-m3/testing/preferences-tiered-override/
// contracts/step-6-global-fallback.md — Outcome:
//   success — 依次清除项目级与 feature 级覆盖 → 生效值 = 全局值(兜底恒有
//             值,继承链完整);无默认键(worktree.*)呈现空值语义。
// fixture_spec: Project + PrefEntry(global 显式行;project/feature 行已清)。

import { expect, test } from '@playwright/test'
import { freshRoot, WorldManager, bridgeInvoke } from '../_lib/journey-world.ts'
import {
  BOOL_KEY,
  buildMainWorld,
  pickPrefFeature,
  prefRow,
  settlePrefsToast,
  switchPrefTier,
  waitGroupRows,
  waitPrefsReady,
} from './harness.ts'
import type { KernelWorld } from '../_lib/journey-world.ts'

test.describe.serial('preferences-tiered-override / step 6: 全局兜底', () => {
  const manager = new WorldManager()
  let kernel: KernelWorld | null = null

  test.beforeAll(async () => {
    kernel = await buildMainWorld(freshRoot('prefs-s6'))
  })

  test.afterAll(async () => {
    await manager.closeAll()
  })

  // Outcome "success" — 全局层兜底 + 无默认键空值语义。
  test('step6/success: clear the project and feature overrides in order → effective = the global value (fallback always present); the no-default key renders its unset semantics', async ({ }, testInfo) => {
    testInfo.setTimeout(420_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main', { tab: 'workbench/overview' })
    const { page } = world
    const slug = (kernel as KernelWorld).featureSlug

    // fixture:三级齐设(全局 true / 项目 false / feature true)。
    await bridgeInvoke(page, 'setPrefs', ['global', [{ key: BOOL_KEY, value: true }]])
    await bridgeInvoke(page, 'setPrefs', [{ project: world.projectId }, [{ key: BOOL_KEY, value: false }]])
    await bridgeInvoke(page, 'setPrefs', [{ feature: `${world.projectId}/${slug}` }, [{ key: BOOL_KEY, value: true }]])

    await waitPrefsReady(page)

    // 清除 feature 级 → 回落项目(false)。
    await switchPrefTier(page, 'feature')
    await pickPrefFeature(page, slug, 'auto')
    await prefRow(page, 'auto', BOOL_KEY).locator('[data-dsh-forge-pref-clear]').click()
    await expect(prefRow(page, 'auto', BOOL_KEY).locator('[data-dsh-forge-pref-source]'), '清除 feature → 继承项目').toBeVisible({ timeout: 15_000 })
    await settlePrefsToast(page)

    // 清除项目级 → 回落全局(true;兜底)。
    await switchPrefTier(page, 'project')
    await waitGroupRows(page, 'auto')
    await prefRow(page, 'auto', BOOL_KEY).locator('[data-dsh-forge-pref-clear]').click()
    await expect(prefRow(page, 'auto', BOOL_KEY).locator('[data-dsh-forge-pref-source]'), '清除 project → 继承全局(兜底)').toBeVisible({ timeout: 15_000 })
    await expect(prefRow(page, 'auto', BOOL_KEY).locator('[data-dsh-forge-pref-control="toggle"]'), '生效值 = 全局值(true)').toBeChecked()
    await settlePrefsToast(page)

    // State:三级解析走至 global 行(source = global;继承链完整)。
    const rows = await bridgeInvoke<Array<{ key: string; value: unknown; source: string | null }>>(
      page, 'getPrefs', [{ feature: `${world.projectId}/${slug}` }],
    )
    const boolRow = rows.find(row => row.key === BOOL_KEY)
    expect(boolRow?.value, '兜底生效值 = 全局值').toBe(true)
    expect(boolRow?.source, '解析走至 global 行').toBe('global')

    // 无值键(worktree.* 无注册表默认)呈现空值语义(source 空缺)。
    const worktreeRow = rows.find(row => row.key === 'worktree.source-branch')
    expect(worktreeRow === undefined || worktreeRow.source === null || worktreeRow.source === undefined,
      '无默认键 = 空值语义(source 空缺,非伪来源)').toBe(true)
    await switchPrefTier(page, 'global')
    await waitGroupRows(page, 'worktree')
    await expect(prefRow(page, 'worktree', 'worktree.source-branch').locator('[data-dsh-forge-pref-source]'),
      '空值键渲染未置标注(继承链仍完整,正常态)').toBeVisible()
  })
})
