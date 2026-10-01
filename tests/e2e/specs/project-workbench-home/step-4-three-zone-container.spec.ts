// @feature dsh-forge-m4 | @web-e2e | @journey project-workbench-home
// Traceability: docs/features/dsh-forge-m4/testing/project-workbench-home/
// contracts/step-4-three-zone-container.md — Outcomes:
//   success — 代码区(会话列表/worktree・工作区状态)与 forge 文件区同页可见;
//             概览子 tab(提案/feature/任务)内容与项目数据一致;知识区零空
//             占位(空 tab/空视图/预置数据计数 0;管线入口以导航占位呈现 =
//             未启用即不渲染 —— 不建空占位纪律);
//   workbench-load-error — 工作台数据加载出错 → error 态 + 重试按钮 + 重试
//             可恢复(DEFERRED —— 见下方 VERIFY 注记)。
// fixture_spec: Project ×1 + Proposal ×1 + Feature ×1 + Task ×3 + StageAsset ×1。
// Techniques: sc2-full ②(概览三子 tab + 逐面语料)/ sc2 ②(知识区零空占位)。
//
// VERIFY(deferred outcome, workbench-load-error):概览 error 态 + [重试] 的
// 组件面在场(OverviewPage phase='load-error' → [data-dsh-forge-overview-
// load-error] + [data-dsh-forge-overview-retry]),但 e2e 无工作台数据通道的
// 注错缝(Interface 1 读径 getState 无故障 env 缝;phase='error' 需读取本身失
// 败)。该 Outcome 的权威覆盖 = 面板组件单元(降级呈现)+ BIZ-resilience-001
// 家族;gen 侧按 M3 纪律不造假腿、不落无条件 skip 占位。

import { expect, test } from '@playwright/test'
import {
  activateProjectByTreeRow, clickStable, focusOverviewSubtab, M4WorldManager,
  newSessionButton, startAutoDismiss,
} from '../_lib/m4-world.ts'
import { bootMainWorld, buildMainJourneyRoot, FEATURE, PROP_LINKED, PROP_ORPHAN, SESS_A, TASK_EXEC, TASK_FREE } from './harness.ts'

test.describe.serial('project-workbench-home / step 4: 同页核查三区容器', () => {
  const manager = new M4WorldManager()
  let stopAutoDismiss: () => void = () => {}

  test.afterAll(async () => {
    stopAutoDismiss()
    await manager.closeAll()
  })

  // Outcome "success" — 三区同页 + 概览子 tab 语料一致 + 知识区零空占位。
  test('step4/success: 三区同页 —— 代码区与 forge 文件区同屏 + 概览子 tab 语料对拍 + 知识区零空占位', async ({ }, testInfo) => {
    testInfo.setTimeout(420_000)
    const built = await buildMainJourneyRoot()
    const world = await bootMainWorld(manager, 'main', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await newSessionButton(page).waitFor({ state: 'visible', timeout: 30_000 })

    // 代码区:左栏树承载活跃项目组 + 会话行(REAL 会话语料)。
    await page.waitForTimeout(300)
    const blockSessions = await page.evaluate((id: string) => {
      const row = document.querySelector(`[data-dsh-forge-tree-project="${id}"]`)
      const block = row?.parentElement
      if (block === null || block === undefined) return []
      return [...block.querySelectorAll('[data-dsh-forge-tree-session]')]
        .map(el => el.getAttribute('data-dsh-forge-tree-session') ?? '')
    }, kernel.projectId)
    expect(blockSessions, '代码区会话列表承载语料会话(左栏组内)').toContain(SESS_A)

    // forge 文件区:概览三子 tab 齐备 + 逐面语料对拍。
    await focusOverviewSubtab(page, 'features', '[data-dsh-forge-overview-features]')
    await expect(page.locator(`[data-dsh-forge-overview-feature-dir="${FEATURE}"]`),
      'feature 目录行在场(概览 feature 面)').toBeVisible({ timeout: 20_000 })
    await expect(page.locator(`[data-dsh-forge-overview-feature-status="${FEATURE}"]`),
      'feature 状态词在场(语料一致)').toContainText('in-progress')

    await focusOverviewSubtab(page, 'proposals', '[data-dsh-forge-overview-proposals]')
    await expect(page.locator(`[data-dsh-forge-overview-prop-dir="${PROP_LINKED}"]`),
      '关联提案目录行在场(概览提案面)').toBeVisible({ timeout: 20_000 })
    await expect(page.locator(`[data-dsh-forge-overview-prop-dir="${PROP_ORPHAN}"]`),
      '孤儿提案目录行在场(提案面语料一致)').toBeVisible()

    await focusOverviewSubtab(page, 'tasks', '[data-dsh-forge-overview-tasks]')
    for (const key of [TASK_EXEC, TASK_FREE]) {
      await expect(page.locator(`[data-dsh-forge-overview-task="${key}"]`),
        `任务列表行 ${key} 在场(概览任务面语料一致)`).toBeVisible({ timeout: 20_000 })
    }
    // 子 tab 集恰为三面(扩展位未启用即不渲染)—— 在 dock 交互前读:任务行
    // 点击会 bring board pane forward,概览 tab 非 active 时其体卸载。
    const subtabs = await page.evaluate(() =>
      [...document.querySelectorAll('[data-dsh-forge-overview-subtab]')]
        .map(tab => tab.getAttribute('data-dsh-forge-overview-subtab') ?? ''))
    expect(subtabs.sort(), '概览子 tab 集 = 提案/feature/任务(扩展位未启用即不渲染)').toEqual(['features', 'proposals', 'tasks'])

    // 既有操作可达(同页可操作面):任务行点击 → 任务详情 dock。
    await clickStable(page, `[data-dsh-forge-overview-task="${TASK_FREE}"]`)
    await expect(page.locator(`[data-dsh-forge-task-detail="${TASK_FREE}"]`),
      '任务详情 dock 打开(代码区↔forge 文件区同页可操作)').toBeVisible({ timeout: 20_000 })
    await clickStable(page, '[data-dsh-forge-detail-close]')

    // 知识区零空占位:零空 tab(在场 tab 均为用户打开的功能面)、conversation
    // 侧零 forge main 内景、无预置知识数据面。
    await expect(page.locator('[data-dsh-forge-shell]'),
      'conversation 侧零 forge main 内景(无预置视图)').toHaveCount(0)
    const tabChips = await page.evaluate(() =>
      [...document.querySelectorAll('[data-sidebar-right-panel] [role="tab"]')]
        .map(tab => tab.textContent?.trim() ?? ''))
    expect(tabChips.length, '在场 tab ≥1(用户打开的功能面)').toBeGreaterThan(0)
    for (const chip of tabChips) {
      expect(chip, `在场 tab 均为功能面(无空 tab):${chip}`).not.toBe('')
    }
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })
})
