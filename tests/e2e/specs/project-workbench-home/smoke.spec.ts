// @feature dsh-forge-m4 | @web-e2e | @journey project-workbench-home
// Journey smoke test — the project-center first-screen loop END TO END in one
// world (happy-path Outcomes only):
//   Step 1 boot 首屏 = 项目工作台(三区整台 + 指针恢复)→ Step 2 全项目树枚举
//   (活跃 + 归档分区)→ Step 3 切换 B(整台跟随 + 指针改写)→ Step 4 三区同页
//   核查(概览子 tab 语料 + 知识区零空占位)→ Step 5 forge 视图巡检(收纳零
//   缩水 + 孤儿 0)→ Step 6 重启恢复(首屏 = 工作台 + 恢复 Step 3 切换后的
//   目标项目)。
// Traceability: docs/features/dsh-forge-m4/testing/project-workbench-home/
// journey.md (Happy Path Steps 1-6) + contracts/step-{1..6}-*.md success faces。

import { expect, test } from '@playwright/test'
import {
  activateProjectByTreeRow, bridgeInvoke, ensureProjectGroupExpanded, focusOverviewSubtab,
  M4WorldManager, newSessionButton, sessionsInProjectBlock, startAutoDismiss,
} from '../_lib/m4-world.ts'
import { bootMainWorld, buildMainJourneyRoot, FEATURE, PROP_LINKED, PROP_ORPHAN, SESS_A, TASK_EXEC, TASK_FREE } from './harness.ts'
import { launchWorkbenchShell } from '../../helpers/app.ts'
import { assertNoActiveDshForgeInstances } from '../../helpers/instance-lock.ts'

test('smoke/project-workbench-home: 首屏工作台 → 树枚举 → 切换 → 三区核查 → 视图巡检 → 重启恢复(单世界 happy path)', async ({ }, testInfo) => {
  testInfo.setTimeout(900_000)
  const manager = new M4WorldManager()
  let stopAutoDismiss: () => void = () => {}
  const built = await buildMainJourneyRoot({ archiveOther: false })
  try {
    const world = await bootMainWorld(manager, 'main', built)
    const { page, kernel, root, dshHome } = world
    const other = built.other
    stopAutoDismiss = startAutoDismiss(page)

    // ---- Step 1:boot 首屏 = 项目工作台(三区整台)------------------------
    await activateProjectByTreeRow(page, kernel.projectId)
    await ensureProjectGroupExpanded(page, kernel.projectId)
    await newSessionButton(page).waitFor({ state: 'visible', timeout: 30_000 })
    await expect(page.locator('[data-dsh-forge-shell]'), 'Step 1:首屏 = conversation(项目工作台)').toHaveCount(0)
    await expect(page.locator('[data-sidebar-right-panel]').first(), 'Step 1:右栏容器在座(三区整台)').toBeAttached({ timeout: 30_000 })

    // ---- Step 2:全项目树枚举(活跃 + 归档分区)---------------------------
    await expect(page.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`),
      'Step 2:活跃项目行在座').toBeVisible()
    expect(await sessionsInProjectBlock(page, kernel.projectId), 'Step 2:活跃项目组挂会话语料').toContain(SESS_A)

    // ---- Step 3:切换 B(整台跟随 + 指针改写 + A 零残留)------------------
    const rowB = page.locator(`[data-dsh-forge-tree-project="${other.projectId}"]`)
    await rowB.click()
    await expect(rowB, 'Step 3:B 行激活').toHaveAttribute('aria-current', 'true', { timeout: 15_000 })
    const stateB = await bridgeInvoke<{ activeProjectId: string | null }>(page, 'getState', [])
    expect(stateB.activeProjectId, 'Step 3:指针改写为 B').toBe(other.projectId)

    // ---- Step 4:三区同页核查(B 上下文:概览子 tab + 零空占位)----------
    await focusOverviewSubtab(page, 'features', '[data-dsh-forge-overview-features]')
    await expect(page.locator('[data-dsh-forge-overview-feature-dir="wb-home-b"]'),
      'Step 4:B 的 feature 目录行在场(概览随台切换)').toBeVisible({ timeout: 20_000 })
    const subtabs = await page.evaluate(() =>
      [...document.querySelectorAll('[data-dsh-forge-overview-subtab]')]
        .map(tab => tab.getAttribute('data-dsh-forge-overview-subtab') ?? ''))
    expect(subtabs.sort(), 'Step 4:子 tab 集恰三面(知识区零空占位)').toEqual(['features', 'proposals', 'tasks'])

    // ---- Step 5:forge 视图巡检(切回 A;收纳零缩水 + 孤儿 0)------------
    await activateProjectByTreeRow(page, kernel.projectId)
    await focusOverviewSubtab(page, 'proposals', '[data-dsh-forge-overview-proposals]')
    await expect(page.locator(`[data-dsh-forge-overview-prop-dir="${PROP_LINKED}"]`),
      'Step 5:关联提案目录行在场(收纳零缩水)').toBeVisible({ timeout: 20_000 })
    await expect(page.locator(`[data-dsh-forge-overview-prop-dir="${PROP_ORPHAN}"]`),
      'Step 5:孤儿提案目录行在场').toBeVisible()
    await focusOverviewSubtab(page, 'tasks', '[data-dsh-forge-overview-tasks]')
    for (const key of [TASK_EXEC, TASK_FREE]) {
      await expect(page.locator(`[data-dsh-forge-overview-task="${key}"]`),
        `Step 5:任务行 ${key} 在场`).toBeVisible({ timeout: 20_000 })
    }
    await expect(page.locator('[data-dsh-forge-tab]'), 'Step 5:retired TabBar 面零残留(孤儿 0)').toHaveCount(0)
    await expect(page.locator('[data-dsh-forge-rail]'), 'Step 5:降级 rail 不在场(孤儿 0)').toHaveCount(0)

    // ---- Step 6:重启恢复(恢复 Step 3 切换后的目标项目)-----------------
    // 语料约束:本 smoke 的 B 未经 Step 3 前的激活记忆 —— Step 5 已切回 A,
    // 重启应恢复 A(最后活跃)。同 userData 冷重启(sc1 ④ 口径)。
    await page.evaluate(() => { localStorage.removeItem('dsh.forge.workbench.view') }).catch(() => {})
    const userDataDir = kernel.userDataDir
    const rootDir = root
    stopAutoDismiss()
    await world.shell.close()
    assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })
    const reborn = await launchWorkbenchShell({ userDataDir, rootDir, env: { DSH_HOME: dshHome, DEEPSEEK_API_KEY: 'm4-e2e-stub-key' } })
    manager.adopt({
      tag: 'reborn', shell: reborn, page: reborn.page, kernel,
      root: rootDir, dshHome, stub: null, mainLog: [],
    })
    try {
      await reborn.uiReady()
      stopAutoDismiss = startAutoDismiss(reborn.page)
      const page2 = reborn.page
      await expect(page2.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`),
        'Step 6:重启恢复最后活跃项目(树行 aria-current)').toHaveAttribute('aria-current', 'true', { timeout: 30_000 })
      const state6 = await bridgeInvoke<{ activeProjectId: string | null }>(page2, 'getState', [])
      expect(state6.activeProjectId, 'Step 6:指针读数 = 最后活跃项目').toBe(kernel.projectId)
      await newSessionButton(page2).waitFor({ state: 'visible', timeout: 30_000 })
      await expect(page2.locator('[data-dsh-forge-shell]'), 'Step 6:首屏仍为项目工作台(conversation)').toHaveCount(0)
      expect(reborn.pageErrors, `renderer pageerrors: ${reborn.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      stopAutoDismiss()
    }
  } finally {
    stopAutoDismiss()
    await manager.closeAll()
  }
})
