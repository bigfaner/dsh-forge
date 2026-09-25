// @feature dsh-forge-m3 | @web-e2e | @journey preferences-tiered-override
// Journey smoke test — the SC5 ladder END TO END in one world (happy-path
// Outcomes only):
//   Step 1 open the panel (tiers + fixed key groups, surfaces absent) →
//   Step 2 the tiered view (default → set global → project inherits → set
//   project → feature inherits → set feature) → Step 3 modify + save →
//   Step 4 clear feature → fall back to project; clear project → fall back to
//   global → Step 6 global fallback → Step 5 dispatch consumes the final
//   effective value (oracle-verified, same source as the editing surface).
// Traceability: docs/features/dsh-forge-m3/testing/preferences-tiered-override/
// journey.md (Happy Path Steps 1-6) + contracts/step-{1..6}-*.md success faces.

import { expect, test } from '@playwright/test'
import {
  dispatchFromBoard,
  freshRoot,
  getDispatchRows,
  openKernelDb,
  recomputePresynth,
  waitForOrchBadge,
  waitForPromptRow,
  WorldManager,
  bridgeInvoke,
} from '../_lib/journey-world.ts'
import { verifyPromptInjection } from '../../stubs/oracle.ts'
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

const COVERAGE_KEY = 'coverage.coding.feature'
const TASK_1 = 'prefs-loop/1'

test('smoke/preferences-tiered-override: 打开面板 → 三级查看与覆盖序(默认→全局→项目→feature)→ 修改保存 → 清除回落 → 全局兜底 → 派发消费生效值(oracle)', async ({ }, testInfo) => {
  testInfo.setTimeout(900_000)
  const manager = new WorldManager()
  const kernel = await buildMainWorld(freshRoot('prefs-smoke'))
  try {
    const world = await manager.acquire(kernel, 'main', { tab: 'workbench/overview' })
    const { page, stub } = world
    if (stub === null) throw new Error('the dispatch stub must ride this world')
    const slug = kernel.featureSlug
    const coverageRow = () => page.locator(`[data-dsh-forge-pref-group-body="coverage"] [data-dsh-forge-pref-row="${COVERAGE_KEY}"]`)

    // ---- Step 1:打开偏好编辑面 ------------------------------------------
    await waitPrefsReady(page)
    for (const group of ['auto', 'worktree', 'eval', 'coverage']) {
      await expect(page.locator(`[data-dsh-forge-pref-group-body="${group}"]`), `Step 1:键分组 ${group}`).toBeVisible({ timeout: 20_000 })
    }
    await expect(page.locator('[data-dsh-forge-pref-row^="surfaces"]'), 'Step 1:surfaces 不在键集').toHaveCount(0)

    // ---- Step 2:三级同键不同值 + 生效解析(coverage 梯子,SC5 口径)----
    await expect(coverageRow().locator('[data-dsh-forge-pref-source]'), 'Step 2 基线:继承 · 默认:80%')
      .toHaveText('继承 · 默认:80%', { timeout: 20_000 })

    const commitCoverage = async (percentage: string): Promise<void> => {
      const input = coverageRow().locator('[data-dsh-forge-pref-control="coverage-input"]')
      await input.fill(percentage)
      await input.press('Enter')
      await expect(coverageRow().locator('[data-dsh-forge-pref-override]'), `提交 ${percentage}(本级覆盖 Pill)`).toBeVisible({ timeout: 15_000 })
      await settlePrefsToast(page)
    }

    // 全局 88 → 项目视图继承全局 → 项目 77 → Feature 视图继承项目 → feature 66。
    await waitGroupRows(page, 'coverage')
    await commitCoverage('88')
    await switchPrefTier(page, 'project')
    await waitGroupRows(page, 'coverage')
    await expect(coverageRow().locator('[data-dsh-forge-pref-source]'), 'Step 2:项目视图继承全局(88)').toHaveText('继承 · 全局:88%')
    await commitCoverage('77')
    await switchPrefTier(page, 'feature')
    await pickPrefFeature(page, slug, 'coverage')
    await expect(coverageRow().locator('[data-dsh-forge-pref-source]'), 'Step 2:Feature 视图继承项目(77)').toHaveText('继承 · 项目:77%')
    await commitCoverage('66')

    // ---- Step 3:修改 feature 级键值(布尔键同面)------------------------
    const boolToggle = prefRow(page, 'auto', BOOL_KEY).locator('[data-dsh-forge-pref-control="toggle"]')
    await boolToggle.click()
    await expect(prefRow(page, 'auto', BOOL_KEY).locator('[data-dsh-forge-pref-override]'), 'Step 3:保存 → 本级覆盖 + 生效值即时更新').toBeVisible({ timeout: 15_000 })
    await settlePrefsToast(page)

    // ---- Step 4:清除 feature 级覆盖 → 回落项目 -------------------------
    await prefRow(page, 'auto', BOOL_KEY).locator('[data-dsh-forge-pref-clear]').click()
    await expect(prefRow(page, 'auto', BOOL_KEY).locator('[data-dsh-forge-pref-source]'), 'Step 4:回落继承标注').toBeVisible({ timeout: 15_000 })
    await settlePrefsToast(page)
    await expect(coverageRow().locator('[data-dsh-forge-pref-override]'), 'coverage 覆盖仍在(feature 66)').toBeVisible()

    // ---- Step 6(前半):清除项目级 coverage → 全局兜底 ------------------
    await switchPrefTier(page, 'project')
    await waitGroupRows(page, 'coverage')
    await coverageRow().locator('[data-dsh-forge-pref-clear]').click()
    await expect(coverageRow().locator('[data-dsh-forge-pref-source]'), 'Step 6:清除 project → 回落全局(88,兜底)').toBeVisible({ timeout: 15_000 })
    await settlePrefsToast(page)

    // ---- Step 5:派发消费生效值(feature 66 仍压过全局 88)--------------
    await page.locator('[data-dsh-forge-tab="workbench/tasks"]').click()
    await dispatchFromBoard(page, [TASK_1])
    await waitForOrchBadge(page, TASK_1, 'running', 20_000)
    const row = (await getDispatchRows(page, world.projectId)).find(candidate => candidate.taskKey === TASK_1)
    if (row === undefined) throw new Error('dispatch row missing')
    const prompt = await waitForPromptRow(page, stub, row.sessionId as string)
    expect(prompt.text, 'Step 5:注入 = feature 级生效值(66;覆盖序压过 88/80)').toContain('Target: Achieve 66% test coverage')
    expect(prompt.text, 'Step 5:默认 80 退场').not.toContain('Achieve 80% test coverage')

    const rows = await bridgeInvoke<Array<{ key: string; value: unknown; source: string | null }>>(
      page, 'getPrefs', [{ feature: `${world.projectId}/${slug}` }],
    )
    expect(rows.find(candidate => candidate.key === COVERAGE_KEY)?.value, 'Step 5:编辑面生效值与派发消费同源(66)').toEqual({ type: 'percentage', percentage: 66 })

    const db = await openKernelDb(kernel.userDataDir)
    try {
      expect(verifyPromptInjection({
        journalText: prompt.text,
        presynthContent: recomputePresynth(db, kernel.featuresRoot, world.projectId, TASK_1),
        promptHash: row.promptHash,
        sessionId: row.sessionId as string,
        requestId: prompt.requestId,
      }), 'Step 5:注入 oracle 四件套').toEqual({ ok: true })
    } finally {
      ;(db as unknown as { close(): void }).close()
    }
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await manager.closeAll()
  }
})
