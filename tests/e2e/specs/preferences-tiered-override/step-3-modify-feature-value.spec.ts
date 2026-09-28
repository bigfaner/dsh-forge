// @feature dsh-forge-m3 | @web-e2e | @journey preferences-tiered-override
// Traceability: docs/features/dsh-forge-m3/testing/preferences-tiered-override/
// contracts/step-3-modify-feature-value.md — Outcomes:
//   success             — Feature 级布尔键经编辑面修改 + 保存 → 内核 API 持
//                         化(事务原子);生效值即时更新;「本级覆盖」+ 清除
//                         入口呈现。
//   type-validation-error — 数值键非法输入(eval.proposal.target = 'abc')
//                         → 就近 invalid 行(role=alert),不保存,verb 不发。
//   save-channel-error  — 通道异常无注入缝;承载面 = 写入批次的原子性(同批
//                         含非法条目 → 整批拒绝零半写,prefs 表原值)。
//                         // VERIFY: 传输层故障(ERR 通道异常)呈现面需基座
//                         fault seam,见覆盖报告 deferred 清单。
// fixture_spec: Project/Feature/PrefEntry(boolean + number 行)。

import { expect, test } from '@playwright/test'
import { freshRoot, openKernelDb, WorldManager, bridgeInvoke } from '../_lib/journey-world.ts'
import { BOOL_KEY, buildMainWorld, pickPrefFeature, prefRow, settlePrefsToast, switchPrefTier, waitGroupRows, waitPrefsReady } from './harness.ts'
import type { KernelWorld } from '../_lib/journey-world.ts'

const NUMBER_KEY = 'eval.proposal.target'

test.describe.serial('preferences-tiered-override / step 3: 修改 feature 级键值', () => {
  const manager = new WorldManager()
  let kernel: KernelWorld | null = null

  test.beforeAll(async () => {
    kernel = await buildMainWorld(freshRoot('prefs-s3'))
  })

  test.afterAll(async () => {
    await manager.closeAll()
  })

  // Outcome "success" — 编辑面 = 唯一写口(toggle 提交路径)。
  test('step3/success: modify the feature-level boolean through the editing surface → persisted via the kernel API, effective value updates instantly, override pill + clear entry render', async ({ }, testInfo) => {
    testInfo.setTimeout(420_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main', { tab: 'workbench/overview' })
    const { page } = world
    const slug = (kernel as KernelWorld).featureSlug

    // 前置:Feature 级该键无显式行(基线 = 项目级/默认)。
    await bridgeInvoke(page, 'setPrefs', [{ project: world.projectId }, [{ key: BOOL_KEY, value: false }]])

    await waitPrefsReady(page)
    await switchPrefTier(page, 'feature')
    await pickPrefFeature(page, slug, 'auto')

    const toggle = prefRow(page, 'auto', BOOL_KEY).locator('[data-dsh-forge-pref-control="toggle"]')
    await expect(toggle, '基线:继承项目级(false)').not.toBeChecked()
    await expect(prefRow(page, 'auto', BOOL_KEY).locator('[data-dsh-forge-pref-source]'), '基线:继承标注在场').toBeVisible()

    // 修改并保存(toggle change = 提交路径,经内核偏好 API)。
    await toggle.click()
    await expect(prefRow(page, 'auto', BOOL_KEY).locator('[data-dsh-forge-pref-override]'), '保存后:本级覆盖 Pill(权威 refetch)').toBeVisible({ timeout: 15_000 })
    await expect(toggle, '生效值即时更新(true)').toBeChecked()
    await expect(prefRow(page, 'auto', BOOL_KEY).locator('[data-dsh-forge-pref-clear]'), '清除入口呈现').toBeVisible()
    await settlePrefsToast(page)

    // State:prefs 表 feature 级行落库(内核面交叉)。
    const rows = await bridgeInvoke<Array<{ key: string; value: unknown; source: string | null }>>(
      page, 'getPrefs', [{ feature: `${world.projectId}/${slug}` }],
    )
    const boolRow = rows.find(row => row.key === BOOL_KEY)
    expect(boolRow?.value, '内核持久化 = true(单一写路径)').toBe(true)
    expect(boolRow?.source, '来源 = feature(本级行)').toBe('feature')
  })

  // Outcome "type-validation-error" — 非法输入就近报错,零保存零 verb。
  test('step3/type-validation-error: a type-invalid draft on the number key marks the row inline (role=alert) and NEVER fires the verb', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main')
    const { page } = world

    // M4 1.8 迁移改写:逃生门即 overview 单页(harness boot 落点),无需 tab 归位。
    await waitPrefsReady(page)
    await switchPrefTier(page, 'global')
    await waitGroupRows(page, 'eval')

    const numberRow = prefRow(page, 'eval', NUMBER_KEY)
    const input = numberRow.locator('[data-dsh-forge-pref-control="number-input"]')
    const before = await input.inputValue()

    // 非法输入(非整数 —— number 域外)+ Enter → 就近 invalid 行,不保存。
    await input.fill('12.5')
    await input.press('Enter')
    await expect(numberRow.locator('[data-dsh-forge-pref-invalid]'), '类型校验错误就近呈现(role=alert)').toBeVisible()
    await expect(numberRow.locator('[data-dsh-forge-pref-override]'), '未保存(无覆盖 Pill)').toHaveCount(0)

    // State:prefs 表零变更(全局级该键无显式行)。
    const rows = await bridgeInvoke<Array<{ key: string; source: string | null }>>(page, 'getPrefs', ['global'])
    expect(rows.find(row => row.key === NUMBER_KEY)?.source, '零写入(source 仍 default)').toBe('default')

    // 用户改正后可重试:合法值保存成功。
    await input.fill('1000')
    await input.press('Enter')
    await expect(numberRow.locator('[data-dsh-forge-pref-override]'), '改正后保存成功(本级覆盖 Pill)').toBeVisible({ timeout: 15_000 })
    await settlePrefsToast(page)
    expect(await input.inputValue(), '控件值 = 新生效值(1000)').toBe('1000')
    expect(before, '前置基线为注册表默认(900)').toBe('900')
  })

  // Outcome "save-channel-error"(承载面)— 批次原子:非法条目混入 → 整批拒绝。
  test('step3/save-channel-error (carried face): a batch carrying one invalid entry is rejected WHOLESALE — zero partial write, prefs rows keep their prior values', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main')
    const { page } = world

    // 前置:全局级两个键的基线(auto.test.quick 无显式行 → default true)。
    const before = await bridgeInvoke<Array<{ key: string; value: unknown; source: string | null }>>(page, 'getPrefs', ['global'])
    const quickBefore = before.find(row => row.key === BOOL_KEY)

    // 批内一条合法 + 一条非法(布尔键给字符串)→ 整批拒绝(ERR_PREF_VALUE_INVALID)。
    let rejected: string | undefined
    try {
      await bridgeInvoke(page, 'setPrefs', ['global', [
        { key: BOOL_KEY, value: false },
        { key: 'auto.test.full', value: 'not-a-boolean' },
      ]])
    } catch (error) {
      rejected = String((error as Error).message)
    }
    expect(rejected ?? '', '批次校验前置 → ERR_PREF_VALUE_INVALID(通道语义)').toContain('ERR_PREF_VALUE_INVALID')

    // State:不落半写 —— 合法条目也未生效(整批原子)。
    const after = await bridgeInvoke<Array<{ key: string; value: unknown; source: string | null }>>(page, 'getPrefs', ['global'])
    expect(after.find(row => row.key === BOOL_KEY)?.value, '合法条目未部分持久化(零半写)').toBe(quickBefore?.value)
    expect(after.find(row => row.key === BOOL_KEY)?.source, 'source 不变').toBe(quickBefore?.source)
    const db = await openKernelDb(world.kernel.userDataDir)
    try {
      const sqlite = db as unknown as { prepare: (sql: string) => { all: (...args: string[]) => Array<{ key: string }> } }
      const rows = sqlite.prepare('SELECT key FROM prefs WHERE scope = ?').all('global')
      expect(rows.filter(row => row.key === BOOL_KEY), 'prefs 表零残留行').toHaveLength(0)
    } finally {
      ;(db as unknown as { close(): void }).close()
    }
  })
})
