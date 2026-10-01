// @feature dsh-forge-m4 | @web-e2e | @journey project-workbench-home
// Traceability: docs/features/dsh-forge-m4/testing/project-workbench-home/
// contracts/step-3-switch-project.md — Outcomes:
//   success — 点击项目行:工作台整台跟随切换(左栏会话组/中间会话面板/
//             右栏项目概览均切到目标项目);active_project_id 由 A 改写为 B;
//             无项目 A 内容残留;
//   path-degraded-switch — 目标项目路径探测失败:切换完成、不白屏、不静默
//             失败(降级以角标/提示呈现 —— 见 header 注记)。
// fixture_spec: Project ×2(A 活跃承载 + B 切换目标含任务数据)+ Session(Task
// 语料经 REAL 会话承载)。degraded 腿布景 = B 的 codeRoot 目录 pre-boot 移除。
// Techniques: sc6 Face 1(项目切换 + 指针读数 + 前活跃行让位)/ sc4(换台重置:
// A 的 board pane 随切换退场 —— 无残留断言面)。
//
// VERIFY(deferred face, path-degraded):「项目行路径健康角标」的运行时载体 =
// sync-error 事件通道(workbench-state.lostProjectIds → 概览 lost 卡);e2e 无
// 确定性注错缝(后台 sync 循环触发),本腿钉契约的可达核(切换完成 + 不白屏
// + 不静默失败 + 零 pageErrors),角标呈现面以 sync-error 通道为权威后续补缝。

import { expect, test } from '@playwright/test'
import {
  activateProjectByTreeRow, bridgeInvoke, M4WorldManager, newSessionButton, startAutoDismiss,
} from '../_lib/m4-world.ts'
import { openBoardPane } from '../_lib/journey-world.ts'
import { bootMainWorld, buildMainJourneyRoot, FEATURE, TASK_OTHER } from './harness.ts'

test.describe.serial('project-workbench-home / step 3: 点击项目行切换工作台', () => {
  const manager = new M4WorldManager()
  let stopAutoDismiss: () => void = () => {}

  test.afterAll(async () => {
    stopAutoDismiss()
    await manager.closeAll()
  })

  // Outcome "success" — 整台跟随切换 + 指针改写 + 无残留。
  test('step3/success: 点击项目行整台跟随 —— 指针 A→B + 前活跃行让位 + A 内容零残留(换台重置)', async ({ }, testInfo) => {
    testInfo.setTimeout(420_000)
    const built = await buildMainJourneyRoot({ archiveOther: false })
    const world = await bootMainWorld(manager, 'main', built)
    const { page, kernel } = world
    const other = built.other
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await newSessionButton(page).waitFor({ state: 'visible', timeout: 30_000 })

    // 前置:A 侧打开看板 pane(承载 A 语料节点 —— 残留断言的对照锚点)。
    await openBoardPane(page)
    await expect(page.locator(`[data-dsh-forge-node-card="${FEATURE}/1.1"]`),
      'A 侧看板节点在场(切换前对照)').toBeVisible({ timeout: 30_000 })

    // 切换:B 树行点击(用户径)。
    const rowB = page.locator(`[data-dsh-forge-tree-project="${other.projectId}"]`)
    await expect(rowB, 'B 行在座(切换目标)').toBeVisible({ timeout: 30_000 })
    await rowB.click()
    await expect(rowB, 'B 行激活(aria-current)').toHaveAttribute('aria-current', 'true', { timeout: 15_000 })
    await expect(page.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`),
      '前活跃行让位(aria-current 翻转)').not.toHaveAttribute('aria-current', 'true')

    // State(深断言):指针读数 = B;A 的 board pane 随换台关闭(无残留)。
    const state = await bridgeInvoke<{ activeProjectId: string | null }>(page, 'getState', [])
    expect(state.activeProjectId, '指针改写 A→B').toBe(other.projectId)
    await expect(page.locator('[data-dsh-forge-task-board]'),
      '换台重置:A 的 board pane 退场(B 侧默认面,无 A 残留)').toHaveCount(0, { timeout: 15_000 })
    // B 侧重开看板 = B 语料节点(整台跟随到 B 的数据面)。
    await openBoardPane(page)
    await expect(page.locator(`[data-dsh-forge-node-card="${TASK_OTHER}"]`),
      'B 侧看板承载 B 语料节点(整台跟随)').toBeVisible({ timeout: 30_000 })
    await expect(page.locator(`[data-dsh-forge-node-card="${FEATURE}/1.1"]`),
      'A 节点不在 B 侧看板(零串台残留)').toHaveCount(0)
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "path-degraded-switch" — 路径异常项目切换不白屏、不静默失败。
  test('step3/path-degraded-switch: 路径异常项目行点击 —— 切换完成 + 不白屏 + 不静默失败', async ({ }, testInfo) => {
    testInfo.setTimeout(360_000)
    const built = await buildMainJourneyRoot({ archiveOther: false, removeOtherCodeRoot: true })
    const world = await bootMainWorld(manager, 'degraded', built)
    const { page, kernel } = world
    const other = built.other
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await newSessionButton(page).waitFor({ state: 'visible', timeout: 30_000 })

    // 点击路径异常项目 B 行(目录已移除;注册行仍在)。
    const rowB = page.locator(`[data-dsh-forge-tree-project="${other.projectId}"]`)
    await expect(rowB, '路径异常项目行在座(注册行保持)').toBeVisible({ timeout: 30_000 })
    await rowB.click()

    // State:切换完成、指针落 B、不回滚(降级不阻断切换语义)。
    await expect(rowB, 'B 行激活(aria-current;切换不回滚)').toHaveAttribute('aria-current', 'true', { timeout: 20_000 })
    const state = await bridgeInvoke<{ activeProjectId: string | null }>(page, 'getState', [])
    expect(state.activeProjectId, '指针切到 B(降级不回滚切换)').toBe(other.projectId)

    // 不白屏:三区骨架仍在场(conversation + 座位 + 右栏容器)。
    await newSessionButton(page).waitFor({ state: 'visible', timeout: 30_000 })
    await expect(page.locator('[data-dsh-forge-project-seat]'), '左栏座位仍在(不白屏)').toBeVisible()
    await expect(page.locator('[data-sidebar-right-panel]').first(), '右栏容器仍在(不白屏)').toBeAttached()
    // 不静默失败:零渲染错误(降级以呈现面承载,不以崩溃承载)。
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })
})
