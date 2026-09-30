// @feature dsh-forge-m4 | @web-e2e | @journey task-session-roundtrip
// Traceability: docs/features/dsh-forge-m4/testing/task-session-roundtrip/
// contracts/step-5-open-subagent-session.md — Outcomes:
//   success — 点击执行 subagent 会话条目:经原生打开通道(SubagentAddress
//             三元组入参)打开;≤1 次点击;零侵入;
//   open-target-missing — 待打开会话已不存在或已清理(陈旧地址/幽灵挂接):
//             明确错误提示「会话不存在或已清理」(open-failed 态),不静默
//             不崩溃。
// fixture_spec: Project ×1 + Task + SessionLink(active)+ Session(顶层)+
// SubagentSession(地址可解析)。missing 腿 = active 挂接指向从不落盘的幽灵
// 会话(行经 session_links 渲染,行尾 [打开] 常在 —— 打开通道拒绝)。
// Techniques: sc7 ③⑤(descendant-open + sessionOpenLanded)/ LinkHistory
// openFailed toast 面(ERR_SESSION_OPEN_FAILED → C5 toast,不静默)。

import { expect, test } from '@playwright/test'
import {
  activateProjectByTreeRow, clickSelfUnmounting, expandLinkRow, M4WorldManager,
  openTaskDetail, sessionOpenLanded, startAutoDismiss,
} from '../_lib/m4-world.ts'
import {
  GHOST_SESSION, SUB_OK, TASK_GHOST, TASK_MAIN, TOP_A,
  bootRtWorld, buildRtJourneyRoot, registerRtLinks,
} from './harness.ts'

test.describe.serial('task-session-roundtrip / step 5: 打开 subagent 执行会话', () => {
  const manager = new M4WorldManager()
  let stopAutoDismiss: () => void = () => {}

  test.afterAll(async () => {
    stopAutoDismiss()
    await manager.closeAll()
  })

  // Outcome "success" — subagent 打开(SubagentAddress 通道)≤1 次点击。
  test('step5/success: subagent 会话条目 [打开] —— SubagentAddress 三元组入参,≤1 次点击定位会话视图', async ({ }, testInfo) => {
    testInfo.setTimeout(480_000)
    const built = await buildRtJourneyRoot()
    const world = await bootRtWorld(manager, 'main', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await registerRtLinks(page, kernel)

    await openTaskDetail(page, TASK_MAIN)
    await expandLinkRow(page, TOP_A)
    await expect(page.locator(`[data-dsh-forge-detail-descendant="${SUB_OK}"]`),
      '血缘命中行在场(地址三元组可解析)').toBeVisible({ timeout: 10_000 })

    // ≤1 次点击:subagent 打开(与顶层同一通道,入参分工 = 地址三元组)。
    await clickSelfUnmounting(
      page, `[data-dsh-forge-detail-descendant-open="${SUB_OK}"]`,
      sessionOpenLanded(page),
    )
    // 定位断言:会话视图切至该 subagent 会话(树行选中;零侵入 = 会话视图
    // 功能不受影响,零渲染错误)。
    await expect(page.locator(`[data-dsh-forge-tree-session="${SUB_OK}"]`),
      'subagent 会话打开并定位(树行选中)').toHaveAttribute('aria-current', 'true', { timeout: 15_000 })
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "open-target-missing" — 幽灵挂接打开 → open-failed toast。
  test('step5/open-target-missing: 打开目标缺失 —— 「会话不存在或已清理」错误提示(open-failed 态),不静默不崩溃', async ({ }, testInfo) => {
    testInfo.setTimeout(480_000)
    const built = await buildRtJourneyRoot()
    const world = await bootRtWorld(manager, 'ghost', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await registerRtLinks(page, kernel)

    // 幽灵挂接:行渲染(session_links 驱动)+ [打开] 常在。
    await openTaskDetail(page, TASK_GHOST)
    await expect(page.locator(`[data-dsh-forge-detail-link="${GHOST_SESSION}"]`),
      '幽灵挂接行在场(挂接数据驱动)').toHaveAttribute('data-link-status', 'active', { timeout: 20_000 })
    await expect(page.locator(`[data-dsh-forge-detail-enter="${GHOST_SESSION}"]`),
      '[打开] 在场(打开动作可发起)').toBeVisible({ timeout: 10_000 })

    // 打开 → 通道拒绝(ERR_SESSION_OPEN_FAILED)→ C5 toast(不静默)。
    await page.locator(`[data-dsh-forge-detail-enter="${GHOST_SESSION}"]`).click()
    await expect(page.locator('[data-dsh-forge-detail-links-toast]'),
      'open-failed toast:明确错误提示(不静默)').toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-dsh-forge-detail-links-toast]'),
      '错误词面 = 会话不存在或已清理').toContainText('会话不存在或已清理')
    // 不崩溃:dock 仍在、工作台状态不受损。
    await expect(page.locator(`[data-dsh-forge-task-detail="${TASK_GHOST}"]`),
      'dock 仍在(open-failed 不崩溃)').toBeVisible()
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })
})
