// @feature dsh-forge-m4 | @web-e2e | @journey project-registration-projection
// Traceability: docs/features/dsh-forge-m4/testing/project-registration-
// projection/contracts/step-5-dispatch-session-grouping.md — Outcome:
//   success — 经项目 cwd 派发的会话归组到对应同名 workspace(sessionIds 命
//             中 + 树项目组行呈现);不落入「未分组」;未注册目录的既有会话
//             仍显示为未分组(不破坏)。
// fixture_spec: Project ×1(投影 healthy)+ Session ×2(其一 cwd = 待注册
// 锚点、其二 cwd = 未注册目录;boot 前 REAL persistence 预种)。
// Techniques: sc3-sync ⑤(DF002 派发归组:bootstrap 按 canonical cwd 归组,
// 注册后 sessionIds 命中 + 树消费面)+ sc3 ④(未分组块呈现面)。

import { expect, test } from '@playwright/test'
import {
  activateProjectByTreeRow, ensureProjectGroupExpanded, M4WorldManager,
  readLiveRegistry, rowAtAnchor, sessionsInProjectBlock, startAutoDismiss,
  ungroupedSessionIds, waitForRegistry, waitForStatus,
} from '../_lib/m4-world.ts'
import {
  DETECT_COPY, SESS_NEUTRAL, SESS_NEW, bootRegWorld, buildRegJourneyRoot,
  openAddCard, typeCodePath, waitDetect,
} from './harness.ts'

test.describe.serial('project-registration-projection / step 5: 验证派发会话归组', () => {
  const manager = new M4WorldManager()
  let stopAutoDismiss: () => void = () => {}

  test.afterAll(async () => {
    stopAutoDismiss()
    await manager.closeAll()
  })

  // Outcome "success" — 注册即归组:锚点会话入账,未注册会话不破坏。
  test('step5/success: 注册即归组 —— 派发会话入 workspace 账 + 树项目组行在场 + 未注册会话仍未分组', async ({ }, testInfo) => {
    testInfo.setTimeout(420_000)
    const built = await buildRegJourneyRoot({ seedGroupingSessions: true })
    const world = await bootRegWorld(manager, 'main', built)
    const { page, kernel, dshHome } = world
    const fixtures = built.fixtures
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await ensureProjectGroupExpanded(page, kernel.projectId)

    // 前置对照:注册前锚点会话经 bootstrap 已有其 workspace(DF002 原生),
    // forge 树未分组块呈现两语料会话(无 forge 项目承载)。
    let ungroupedBefore: string[] | null = null
    for (let round = 0; round < 30; round += 1) {
      ungroupedBefore = await ungroupedSessionIds(page)
      if (ungroupedBefore !== null && ungroupedBefore.includes(SESS_NEW)) break
      await page.waitForTimeout(500)
    }
    expect(ungroupedBefore, '注册前:锚点会话落未分组(无 forge 项目承载)').toContain(SESS_NEW)

    // 经卡注册锚点仓(注册即归组的用户径)。
    await openAddCard(page)
    await typeCodePath(page, fixtures.forgeRepo)
    await waitDetect(page, DETECT_COPY.gitForge, '锚点仓 valid(repo-existing)')
    await page.locator('[data-dsh-forge-confirm-submit]').click()
    await expect(page.locator('[data-dsh-forge-project-toast]'), '注册落位 toast').toBeVisible({ timeout: 30_000 })

    // State(dsh 实况,深断言):锚点 workspace 的 sessionIds 命中派发会话。
    const registry = await waitForRegistry(page, dshHome, candidate =>
      rowAtAnchor(candidate, fixtures.forgeRepo)?.sessionIds.includes(SESS_NEW) === true,
    '注册即归组:锚点 workspace sessionIds 命中')
    const newRow = rowAtAnchor(registry, fixtures.forgeRepo)
    expect(newRow?.sessionIds, '派发会话归组到对应同名 workspace 账').toContain(SESS_NEW)
    // 投影 healthy(同名收敛)。
    const state = await page.evaluate(async () => {
      const bridge = (globalThis as { dshForge?: { workbench?: { getState(): Promise<{ projects: Array<{ id: string; codeRoot: string }> }> } } }).dshForge?.workbench
      return await bridge?.getState()
    })
    const added = state?.projects.find(row => row.codeRoot.replaceAll('\\', '/').toLowerCase() === fixtures.forgeRepo.replaceAll('\\', '/').toLowerCase())
    expect(added, '新项目条目在座').toBeDefined()
    await waitForStatus(page, added?.id as string, row => row.state === 'healthy', '新项目投影 healthy')

    // 树消费面:新项目组呈现派发会话行;未分组不再含之;未注册会话不破坏。
    const newRowRow = page.locator(`[data-dsh-forge-tree-project="${added?.id as string}"]`)
    await newRowRow.click()
    await expect(newRowRow, '新项目行激活').toHaveAttribute('aria-current', 'true', { timeout: 15_000 })
    await ensureProjectGroupExpanded(page, added?.id as string)
    let grouped: string[] | null = null
    for (let round = 0; round < 30; round += 1) {
      grouped = await sessionsInProjectBlock(page, added?.id as string)
      if (grouped !== null && grouped.includes(SESS_NEW)) break
      await page.waitForTimeout(500)
    }
    expect(grouped, '树项目组呈现派发会话行(归组生效)').toContain(SESS_NEW)
    let ungroupedAfter: string[] | null = null
    for (let round = 0; round < 30; round += 1) {
      ungroupedAfter = await ungroupedSessionIds(page)
      if (ungroupedAfter !== null && !ungroupedAfter.includes(SESS_NEW)) break
      await page.waitForTimeout(500)
    }
    expect(ungroupedAfter, '派发会话不再落未分组').not.toContain(SESS_NEW)
    expect(ungroupedAfter, '未注册目录既有会话仍显示未分组(不破坏)').toContain(SESS_NEUTRAL)
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })
})
