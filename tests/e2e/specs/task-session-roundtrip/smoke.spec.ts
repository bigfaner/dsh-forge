// @feature dsh-forge-m4 | @web-e2e | @journey task-session-roundtrip
// Journey smoke test — the task↔session roundtrip loop END TO END in one world
// (happy-path Outcomes only):
//   Step 1 看板点击执行中任务 → dock 滑入 → Step 2 挂接历史(active/ended 新→
//   旧 + 运行中徽标)→ Step 3 行展开识别 subagent(命名遵循 + 递归)→
//   Step 4 顶层会话 [打开] ≤1 点击 → Step 5 subagent [打开](SubagentAddress)→
//   Step 6 bound 元数据条 + 「查看任务」跳回 dock(双向)→ Step 7 会话树归拢
//   反向标识。
// Traceability: docs/features/dsh-forge-m4/testing/task-session-roundtrip/
// journey.md (Happy Path Steps 1-7) + contracts/step-{1..7}-*.md success faces。

import { expect, test } from '@playwright/test'
import { namingCompliantName } from '../../stubs/lineage-corpus.ts'
import {
  activateProjectByTreeRow, clickSelfUnmounting, clickStable, ensureProjectGroupExpanded,
  expandLinkRow, M4WorldManager, openTaskDetail, sessionOpenLanded, startAutoDismiss,
} from '../_lib/m4-world.ts'
import {
  SUB_NESTED, SUB_OK, TASK_MAIN, TITLE_MAIN, TOP_A, TOP_B, TOP_M,
  bootRtWorld, buildRtJourneyRoot, registerRtLinks,
} from './harness.ts'

test('smoke/task-session-roundtrip: dock → 挂接历史 → 识别 subagent → 双通道打开 → C6 双向 → 树归拢(单世界 happy path)', async ({ }, testInfo) => {
  testInfo.setTimeout(900_000)
  const manager = new M4WorldManager()
  let stopAutoDismiss: () => void = () => {}
  const built = await buildRtJourneyRoot()
  try {
    const world = await bootRtWorld(manager, 'main', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await registerRtLinks(page, kernel)
    await ensureProjectGroupExpanded(page, kernel.projectId)

    // ---- Step 1:看板点击执行中任务 → dock 滑入。------------------------
    await openTaskDetail(page, TASK_MAIN)
    await expect(page.locator(`[data-dsh-forge-task-detail="${TASK_MAIN}"]`),
      'Step 1:dock 滑入(承载该任务)').toBeVisible({ timeout: 20_000 })

    // ---- Step 2:挂接历史(active + ended 新→旧 + 运行中徽标)。---------
    await expect(page.locator(`[data-dsh-forge-detail-link="${TOP_A}"]`),
      'Step 2:active 行(TOP_A)').toHaveAttribute('data-link-status', 'active', { timeout: 20_000 })
    await expect(page.locator('[data-dsh-forge-badge="link:active"]'),
      'Step 2:会话运行中徽标').toBeVisible({ timeout: 10_000 })
    const endedRows = page.locator('[data-dsh-forge-detail-link][data-link-status="ended"]')
    await expect(endedRows, 'Step 2:ended 两行').toHaveCount(2, { timeout: 10_000 })
    await expect(endedRows.nth(0), 'Step 2:新→旧(M 前)').toContainText(TOP_M)

    // ---- Step 3:行展开识别 subagent(命名遵循 + depth-2)。-------------
    await expandLinkRow(page, TOP_A)
    const subOkRow = page.locator(`[data-dsh-forge-detail-descendant="${SUB_OK}"]`)
    await expect(subOkRow, 'Step 3:血缘命中行在场').toBeVisible({ timeout: 10_000 })
    await expect(subOkRow, 'Step 3:命名遵循(任务 id + title)').toContainText(
      namingCompliantName(TASK_MAIN, TITLE_MAIN))
    await expect(page.locator(`[data-dsh-forge-detail-descendant="${SUB_NESTED}"]`),
      'Step 3:depth-2 递归在场').toBeVisible({ timeout: 10_000 })

    // ---- Step 4:顶层会话 [打开] ≤1 点击。-------------------------------
    // (先证归拢面:顶层树行在场;打开后归位断言见 Step 7 前置。)
    await openTaskDetail(page, TASK_MAIN)
    await clickSelfUnmounting(
      page, `[data-dsh-forge-detail-enter="${TOP_A}"]`,
      async () => await sessionOpenLanded(page)()
        && await page.locator(`[data-dsh-forge-tree-session="${TOP_A}"]`)
          .getAttribute('aria-current').catch(() => null) === 'true',
    )
    await expect(page.locator(`[data-dsh-forge-tree-session="${TOP_A}"]`),
      'Step 4:顶层打开定位(树行选中)').toHaveAttribute('aria-current', 'true', { timeout: 15_000 })

    // ---- Step 5:subagent [打开](SubagentAddress 通道)≤1 点击。-------
    await openTaskDetail(page, TASK_MAIN)
    await expandLinkRow(page, TOP_A)
    await clickSelfUnmounting(
      page, `[data-dsh-forge-detail-descendant-open="${SUB_OK}"]`,
      sessionOpenLanded(page),
    )
    await expect(page.locator(`[data-dsh-forge-tree-session="${SUB_OK}"]`),
      'Step 5:subagent 打开定位(树行选中)').toHaveAttribute('aria-current', 'true', { timeout: 15_000 })

    // ---- Step 6:bound 元数据条 + 「查看任务」跳回 dock(双向)。-------
    const bar = page.locator('[data-dsh-forge-metadata-bar]')
    await expect(bar, 'Step 6:C6 条 bound').toBeVisible({ timeout: 20_000 })
    await expect(bar, 'Step 6:任务号 = 血缘推导').toHaveAttribute('data-dsh-forge-metadata-task', TASK_MAIN)
    await page.locator('[data-dsh-forge-metadata-open]').click()
    await expect(page.locator(`[data-dsh-forge-task-detail="${TASK_MAIN}"]`),
      'Step 6:查看任务 → 任务详情 dock(双向互通)').toBeVisible({ timeout: 20_000 })

    // ---- Step 7:会话树归拢反向标识(默认收起 + 展开 + 互证)。---------
    await expect(page.locator('[data-dsh-forge-tree-kind="subagent"]'),
      'Step 7:归拢默认收起(树面互证)').toHaveCount(0)
    await clickStable(page, `[data-dsh-forge-tree-caret="${TOP_A}"]`)
    await expect(page.locator(`[data-dsh-forge-tree-session="${SUB_OK}"]`),
      'Step 7:展开后 subagent 归拢行在场').toBeVisible({ timeout: 10_000 })
    await expect(page.locator(`[data-dsh-forge-tree-session="${TOP_B}"]`),
      'Step 7:顶层会话树承载(反查互证之树侧)').toBeVisible()
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  } finally {
    stopAutoDismiss()
    await manager.closeAll()
  }
})
