// @feature dsh-forge-m4 | @web-e2e | @journey project-workbench-home
// Traceability: docs/features/dsh-forge-m4/testing/project-workbench-home/
// contracts/step-2-project-tree-enumeration.md — Outcome:
//   success — 全部注册项目可枚举,归档项目呈树内降透明只读分区(不挂会话);
//             不存在独立项目列表页入口(枚举/切换/归档分区并入左栏)。
// fixture_spec: Project ×2(1 活跃 + 1 归档)+ Session ×1(属于活跃项目,
// cwd = 活跃项目 codeRoot 的 REAL 会话语料)。
// Techniques: sc3-sync ①(tree-project/archived-row 面)+ sc1 ③(retired
// 独立列表页入口零残留)。

import { expect, test } from '@playwright/test'
import {
  activateProjectByTreeRow, bridgeInvoke, ensureProjectGroupExpanded, M4WorldManager,
  newSessionButton, sessionsInProjectBlock, startAutoDismiss,
} from '../_lib/m4-world.ts'
import { bootMainWorld, buildMainJourneyRoot, SESS_A } from './harness.ts'

test.describe.serial('project-workbench-home / step 2: 左栏全项目树枚举', () => {
  const manager = new M4WorldManager()
  let stopAutoDismiss: () => void = () => {}

  test.afterAll(async () => {
    stopAutoDismiss()
    await manager.closeAll()
  })

  // Outcome "success" — 全项目树枚举 + 归档分区只读不挂会话 + 零独立列表页入口。
  test('step2/success: 左栏全项目树枚举 —— 活跃/归档分区齐备 + 归档不挂会话 + 注册表对拍 + 独立列表页入口零残留', async ({ }, testInfo) => {
    testInfo.setTimeout(360_000)
    const built = await buildMainJourneyRoot()
    const world = await bootMainWorld(manager, 'main', built)
    const { page, kernel } = world
    const other = built.other
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await ensureProjectGroupExpanded(page, kernel.projectId)
    await newSessionButton(page).waitFor({ state: 'visible', timeout: 30_000 })

    // 活跃项目行在座 + 归档分区行在座(树内分区,非独立页)。
    await expect(page.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`),
      '活跃项目行在座').toBeVisible({ timeout: 30_000 })
    await expect(page.locator(`[data-dsh-forge-tree-archived-row="${other.projectId}"]`),
      '归档分区行在座(树内降透明只读分区)').toBeVisible({ timeout: 30_000 })
    // 归档行不在活跃区(分区隔离)。
    await expect(page.locator(`[data-dsh-forge-tree-project="${other.projectId}"]`),
      '归档项目不在活跃分区').toHaveCount(0)

    // State(深断言):树枚举与 forge 注册表一致(listProjects 投影对拍)。
    const state = await bridgeInvoke<{
      projects: Array<{ id: string; displayName: string; archived: boolean }>
    }>(page, 'getState', [])
    expect(state.projects.length, '注册表行数 = 语料两项目').toBe(2)
    expect(state.projects.find(row => row.id === kernel.projectId)?.archived,
      '活跃项目 archived=false').toBe(false)
    expect(state.projects.find(row => row.id === other.projectId)?.archived,
      '归档项目 archived=true(注册表位与树分区一致)').toBe(true)

    // 活跃项目组挂会话语料(归组经 REAL workspace bootstrap:cwd canonical)。
    const block = await sessionsInProjectBlock(page, kernel.projectId)
    expect(block, '活跃项目组呈现会话行(数据面承载)').toContain(SESS_A)
    // 归档分区不挂会话(归档项目的会话行不在树呈现 —— B 零语料 + 分区只读)。
    const archivedBlock = await sessionsInProjectBlock(page, other.projectId)
    expect(archivedBlock, '归档分区块可寻址(行在场)').not.toBeNull()
    expect((archivedBlock as string[]).length, '归档分区不挂会话(零会话行)').toBe(0)

    // 不存在独立项目列表页入口:retired M2/M3 入口面零残留(sc1 口径)。
    await expect(page.locator('[data-dsh-forge-add-project]'), 'retired TopBar 添加项目入口零残留').toHaveCount(0)
    await expect(page.locator('[data-dsh-forge-switcher-trigger]'), 'retired ProjectSwitcher 零残留').toHaveCount(0)
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })
})
