// @feature dsh-forge-m4 | @web-e2e | @journey project-lifecycle-projection
// Traceability: docs/features/dsh-forge-m4/testing/project-lifecycle-
// projection/contracts/step-3-archive-project.md — Outcomes:
//   success — 归档并确认 → forge 侧项目移入归档分区(左栏降透明只读),
//             项目会话列表不再展示;dsh 侧 workspace 保留,会话仍按该项目
//             workspace 分组(sessionIds 断言;历史可按组找回);
//   archived-partition-cross-project — 归档分区在任何活跃项目左栏呈现;
//             归档项目不挂会话;行菜单提供恢复/删除;该项目会话不在当前
//             工作台呈现。
// fixture_spec: Project ×2(其一将归档)+ Session(cwd 落承载 workspace)。
// Techniques: sc3-sync ③(归档语义 + 必答⑤ copy + workspace 保留对拍)。

import { expect, test } from '@playwright/test'
import {
  activateProjectByTreeRow, M4WorldManager, openLifecycleMenu,
  readLiveRegistry, rowAtAnchor, sessionsInProjectBlock, startAutoDismiss,
  ungroupedSessionIds, waitForStatus,
} from '../_lib/m4-world.ts'
import { CARRIER, SESS_A, archiveViaMenu, bootLcWorld, buildLcJourneyRoot, registerLcProjects } from './harness.ts'

test.describe.serial('project-lifecycle-projection / step 3: 归档项目', () => {
  const manager = new M4WorldManager()
  let stopAutoDismiss: () => void = () => {}

  test.afterAll(async () => {
    stopAutoDismiss()
    await manager.closeAll()
  })

  // Outcome "success" — 归档 ≠ 删除:forge 分区 + dsh 保留 + 分组保持。
  test('step3/success: 归档并确认 —— forge 归档分区 + 会话列表不展示 + dsh workspace 保留 + 分组账不动', async ({ }, testInfo) => {
    testInfo.setTimeout(480_000)
    const built = await buildLcJourneyRoot()
    const world = await bootLcWorld(manager, 'main', built)
    const { page, kernel, dshHome } = world
    stopAutoDismiss = startAutoDismiss(page)
    await registerLcProjects(built, page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await waitForStatus(page, kernel.projectId, row => row.state === 'healthy', 'A healthy(基线)')
    const before = readLiveRegistry(dshHome) as NonNullable<ReturnType<typeof readLiveRegistry>>
    const rowBefore = rowAtAnchor(before, kernel.codeRoot)

    // 归档(⋯ 菜单 + 确认 Dialog;必答⑤ copy 断言随行)。
    await archiveViaMenu(page, kernel.projectId)
    // forge 面:归档分区行在座 + 活跃分区行退场 + 会话行不再展示。
    await expect(page.locator(`[data-dsh-forge-tree-archived-row="${kernel.projectId}"]`),
      '归档分区行在座(降透明只读)').toBeVisible({ timeout: 15_000 })
    await expect(page.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`),
      '活跃分区行退场').toHaveCount(0, { timeout: 15_000 })
    await expect(page.locator(`[data-dsh-forge-tree-session="${SESS_A}"]`),
      '项目会话列表不再展示(已归档会话行消失)').toHaveCount(0, { timeout: 15_000 })
    const ungrouped = await ungroupedSessionIds(page)
    expect(ungrouped === null || !(ungrouped as string[]).includes(SESS_A),
      '归档 ≠ 退组:会话不落未分组(dsh 侧仍按项目分组,仅 forge 展示隐藏)').toBe(true)

    // State(dsh 实况,深断言):workspace 保留 —— title/path/sessionIds/序全不变。
    await page.waitForTimeout(1_200)
    const after = readLiveRegistry(dshHome) as NonNullable<ReturnType<typeof readLiveRegistry>>
    const rowAfter = rowAtAnchor(after, kernel.codeRoot)
    expect(rowAfter, '归档 → dsh 侧 workspace 保留(行仍在)').toBeDefined()
    expect(rowAfter?.title, 'title 不变').toBe(rowBefore?.title)
    expect(rowAfter?.sessionIds, '会话仍按项目分组(sessionIds 账不动)').toEqual(rowBefore?.sessionIds)
    expect(after.order.map(row => row.path), '注册表序不变(归档零投影 op)').toEqual(before.order.map(row => row.path))
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "archived-partition-cross-project" — 归档分区跨项目呈现。
  test('step3/archived-partition-cross-project: 归档分区在任何活跃项目左栏呈现 + 不挂会话 + 行菜单恢复/删除 + 会话不在当前工作台', async ({ }, testInfo) => {
    testInfo.setTimeout(480_000)
    const built = await buildLcJourneyRoot()
    const world = await bootLcWorld(manager, 'cross', built)
    const { page, kernel } = world
    const other = built.other
    stopAutoDismiss = startAutoDismiss(page)
    await registerLcProjects(built, page)
    await activateProjectByTreeRow(page, kernel.projectId)

    // 承载项目 A 归档(先就位归档态)。
    await archiveViaMenu(page, kernel.projectId)
    await expect(page.locator(`[data-dsh-forge-tree-archived-row="${kernel.projectId}"]`),
      'A 入归档分区').toBeVisible({ timeout: 15_000 })

    // 切到 B(当前活跃项目 = 另一项目)。
    const rowB = page.locator(`[data-dsh-forge-tree-project="${other.projectId}"]`)
    await rowB.click()
    await expect(rowB, 'B 行激活(当前工作台 = B)').toHaveAttribute('aria-current', 'true', { timeout: 15_000 })

    // 归档分区在 B 的左栏仍呈现(UF1);归档行 ⋯ 菜单提供恢复/删除。
    await expect(page.locator(`[data-dsh-forge-tree-archived-row="${kernel.projectId}"]`),
      '归档分区在任何活跃项目的左栏全项目树中均呈现').toBeVisible()
    await openLifecycleMenu(page, kernel.projectId)
    const menu = page.locator(`[data-dsh-forge-tree-project-menu="${kernel.projectId}"]`)
    for (const label of [/恢复/, /删除项目/]) {
      await expect(menu.locator('[role="menuitem"]', { hasText: label }),
        `归档行菜单动作在座:${String(label)}`).toBeVisible()
    }
    await page.keyboard.press('Escape').catch(() => {})
    // 归档项目不挂会话(分区行块零会话行)+ 该项目会话不在当前工作台呈现。
    const archivedBlock = await sessionsInProjectBlock(page, kernel.projectId)
    expect(archivedBlock, '归档分区块可寻址').not.toBeNull()
    expect((archivedBlock as string[]).length, '归档项目不挂会话(零会话行)').toBe(0)
    await expect(page.locator(`[data-dsh-forge-tree-session="${SESS_A}"]`),
      '该项目会话不在当前工作台呈现').toHaveCount(0)
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })
})
