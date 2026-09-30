// @feature dsh-forge-m4 | @web-e2e | @journey project-registration-projection
// Journey smoke test — the C7 registration loop END TO END in one world
// (happy-path Outcomes only):
//   Step 1 打开确认卡 → Step 2 给定 git 仓路径侦测(valid + 名自动取)→
//   Step 3 文档位置三档门控核验(本仓 forge 树 = 沿用仓内)→ Step 4 确认添加
//   (forge 权威条目 + 实况同名同序)→ Step 5 派发会话归组(入账 + 未注册
//   会话不破坏)。
// Traceability: docs/features/dsh-forge-m4/testing/project-registration-
// projection/journey.md (Happy Path Steps 1-5) + contracts/step-{1..5}-*.md
// success faces。

import { expect, test } from '@playwright/test'
import {
  activateProjectByTreeRow, ensureProjectGroupExpanded, foldPath, M4WorldManager,
  rowAtAnchor, sessionsInProjectBlock, startAutoDismiss, ungroupedSessionIds,
  waitForRegistry, waitForStatus,
} from '../_lib/m4-world.ts'
import {
  DETECT_COPY, SESS_NEUTRAL, SESS_NEW, bootRegWorld, buildRegJourneyRoot,
  openAddCard, submitDisabled, typeCodePath, waitDetect,
} from './harness.ts'

test('smoke/project-registration-projection: 开卡 → 侦测 → 三档预览 → 确认注册(同名同序)→ 派发归组(单世界 happy path)', async ({ }, testInfo) => {
  testInfo.setTimeout(780_000)
  const manager = new M4WorldManager()
  let stopAutoDismiss: () => void = () => {}
  const built = await buildRegJourneyRoot({ seedGroupingSessions: true })
  try {
    const world = await bootRegWorld(manager, 'main', built)
    const { page, kernel, dshHome } = world
    const fixtures = built.fixtures
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)

    // ---- Step 1:打开确认卡(区头 ＋;唯一入口)---------------------------
    await openAddCard(page)
    await expect(page.locator('[data-dsh-forge-confirm-code]'), 'Step 1:代码区输入在场(唯一必答)').toBeVisible()
    expect(await submitDisabled(page), 'Step 1:idle 添加禁用').toBe(true)

    // ---- Step 2:给定 git 仓路径侦测(valid + 名自动)--------------------
    await typeCodePath(page, fixtures.forgeRepo)
    await waitDetect(page, DETECT_COPY.gitForge, 'Step 2:valid(git + forge 树)')
    expect(await submitDisabled(page), 'Step 2:valid 添加可用').toBe(false)
    await expect(page.locator('[data-dsh-forge-confirm-name]'),
      'Step 2:项目名自动取文件夹名').toHaveValue('probe-forge-repo')

    // ---- Step 3:文档位置预览(repo-existing 沿用仓内)------------------
    await expect(page.locator('[data-dsh-forge-confirm-preview-note]'),
      'Step 3:预选 = 沿用仓内(证据三档门控)').toContainText('已检出 forge 文档', { timeout: 15_000 })
    await expect(page.locator('[data-dsh-forge-confirm-preview-path]'),
      'Step 3:预览路径 = 仓内 docs').toContainText('docs')

    // ---- Step 4:确认添加(forge 权威 + 实况同名同序)-------------------
    await page.locator('[data-dsh-forge-confirm-submit]').click()
    await expect(page.locator('[data-dsh-forge-project-toast]'), 'Step 4:注册落位 toast').toBeVisible({ timeout: 30_000 })
    const state = await page.evaluate(async () => {
      const bridge = (globalThis as { dshForge?: { workbench?: { getState(): Promise<{ projects: Array<{ id: string; displayName: string; codeRoot: string }> }> } } }).dshForge?.workbench
      return await bridge?.getState()
    })
    const added = state?.projects.find(row => row.codeRoot.replaceAll('\\', '/').toLowerCase() === fixtures.forgeRepo.replaceAll('\\', '/').toLowerCase())
    expect(added, 'Step 4:forge 条目在座(权威)').toBeDefined()
    const registry = await waitForRegistry(page, dshHome, candidate =>
      rowAtAnchor(candidate, fixtures.forgeRepo)?.title === added?.displayName,
    'Step 4:实况同名收敛')
    expect(foldPath(rowAtAnchor(registry, fixtures.forgeRepo)?.path ?? ''),
      'Step 4:实况条目 = 锚点仓(同址)').toBe(foldPath(fixtures.forgeRepo))
    await waitForStatus(page, added?.id as string, row => row.state === 'healthy', 'Step 4:投影 healthy')

    // ---- Step 5:派发会话归组(入账 + 树消费面 + 未注册不破坏)----------
    expect(rowAtAnchor(registry, fixtures.forgeRepo)?.sessionIds,
      'Step 5:派发会话入 workspace 账').toContain(SESS_NEW)
    const newRowRow = page.locator(`[data-dsh-forge-tree-project="${added?.id as string}"]`)
    await newRowRow.click()
    await expect(newRowRow, 'Step 5:新项目行激活').toHaveAttribute('aria-current', 'true', { timeout: 15_000 })
    await ensureProjectGroupExpanded(page, added?.id as string)
    let grouped: string[] | null = null
    for (let round = 0; round < 30; round += 1) {
      grouped = await sessionsInProjectBlock(page, added?.id as string)
      if (grouped !== null && grouped.includes(SESS_NEW)) break
      await page.waitForTimeout(500)
    }
    expect(grouped, 'Step 5:树项目组呈现派发会话行').toContain(SESS_NEW)
    const ungrouped = await ungroupedSessionIds(page)
    expect(ungrouped, 'Step 5:派发会话不落未分组').not.toContain(SESS_NEW)
    expect(ungrouped, 'Step 5:未注册会话仍显示未分组(不破坏)').toContain(SESS_NEUTRAL)
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  } finally {
    stopAutoDismiss()
    await manager.closeAll()
  }
})
