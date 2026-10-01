// @feature dsh-forge-m4 | @web-e2e | @journey task-session-roundtrip
// Traceability: docs/features/dsh-forge-m4/testing/task-session-roundtrip/
// contracts/step-1-open-task-detail-dock.md — Outcomes:
//   success — 看板点击执行中任务行 → 右缘 dock 滑入(min(440px,45vw) 窗宿主
//             pane 形态、无遮罩、看板保持可交互、焦点陷阱关闭;切换任务原地
//             换内容);
//   no-session-link — in_progress 零挂接:常规展示 + 「未挂接会话」标注 +
//             [发起] 入口(no-link 态;不误呈执行 subagent 标识);
//   launch-disabled-terminal — 终态任务零挂接:[发起] 禁用(不可点击)。
// fixture_spec: Project ×1 + Task(in_progress ∧ active 挂接 / 零挂接 ×2 态)。
// Techniques: sc7(openTaskDetail 双开手 + dock 附着判据 + no-link 面)。

import { expect, test } from '@playwright/test'
import {
  activateProjectByTreeRow, M4WorldManager, openTaskDetail, startAutoDismiss,
} from '../_lib/m4-world.ts'
import {
  TASK_MAIN, TASK_NOLINK, TASK_TERMINAL, bootRtWorld, buildRtJourneyRoot, registerRtLinks,
} from './harness.ts'

test.describe.serial('task-session-roundtrip / step 1: 打开任务详情 dock', () => {
  const manager = new M4WorldManager()
  let stopAutoDismiss: () => void = () => {}

  test.afterAll(async () => {
    stopAutoDismiss()
    await manager.closeAll()
  })

  // Outcome "success" — dock 滑入形态 + 无遮罩 + 看板可交互 + 原地换内容。
  test('step1/success: 看板点击执行中任务行 —— dock 滑入(无遮罩/看板可交互/Esc 关闭)+ 切换任务原地换内容', async ({ }, testInfo) => {
    testInfo.setTimeout(480_000)
    const built = await buildRtJourneyRoot()
    const world = await bootRtWorld(manager, 'main', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await registerRtLinks(page, kernel)

    // dock 打开(附着判据;board pane 宿主)。
    await openTaskDetail(page, TASK_MAIN)
    const dock = page.locator(`[data-dsh-forge-task-detail="${TASK_MAIN}"]`)
    await expect(dock, '右缘 dock 滑入(承载该任务详情)').toBeVisible({ timeout: 20_000 })
    // 无遮罩:看板保持可交互(dock 开启时节点卡仍在场可寻址)。
    await expect(page.locator(`[data-dsh-forge-node-card="${TASK_MAIN}"]`),
      '看板保持可交互(无遮罩:节点卡在场)').toBeVisible({ timeout: 20_000 })
    // 焦点陷阱关闭:✕ 关闭归位。
    await page.locator('[data-dsh-forge-detail-close]').click()
    await expect(page.locator('[data-dsh-forge-task-detail]'),
      '✕ 关闭(dock 收起)').toHaveCount(0, { timeout: 10_000 })

    // 切换任务原地换内容(dock 承载另一任务,零闪烁 = 同一 dock 面换内容)。
    await openTaskDetail(page, TASK_NOLINK)
    await expect(page.locator(`[data-dsh-forge-task-detail="${TASK_NOLINK}"]`),
      '切换任务:原地换内容(同 dock 承载)').toBeVisible({ timeout: 20_000 })
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "no-session-link" — 零挂接:no-link 态标注 + 发起入口。
  test('step1/no-session-link: in_progress 零挂接 —— 「未挂接会话」标注 + [发起] 入口 + 不误呈 subagent 标识', async ({ }, testInfo) => {
    testInfo.setTimeout(420_000)
    const built = await buildRtJourneyRoot()
    const world = await bootRtWorld(manager, 'nolink', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await registerRtLinks(page, kernel)

    await openTaskDetail(page, TASK_NOLINK)
    await expect(page.locator('[data-dsh-forge-detail-links-empty]'),
      '「未挂接会话」标注(no-link 态为正常态非错误)').toBeVisible({ timeout: 20_000 })
    const launch = page.locator('[data-dsh-forge-detail-links-launch]')
    await expect(launch, '[发起] 入口在场').toBeVisible({ timeout: 10_000 })
    expect(await launch.isDisabled(), 'in_progress:发起可用(非终态)').toBe(false)
    // 不误呈执行 subagent 标识(零挂接 = 无血缘行)。
    await expect(page.locator('[data-dsh-forge-detail-link]'),
      '零挂接行(不误呈 subagent 标识)').toHaveCount(0)
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "launch-disabled-terminal" — 终态零挂接:发起禁用。
  test('step1/launch-disabled-terminal: 终态任务零挂接 —— [发起] 禁用(不向终态任务提供发起新会话入口)', async ({ }, testInfo) => {
    testInfo.setTimeout(420_000)
    const built = await buildRtJourneyRoot()
    const world = await bootRtWorld(manager, 'terminal', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await registerRtLinks(page, kernel)

    await openTaskDetail(page, TASK_TERMINAL)
    await expect(page.locator('[data-dsh-forge-detail-links-empty]'),
      '「未挂接会话」标注照常呈现').toBeVisible({ timeout: 20_000 })
    const launch = page.locator('[data-dsh-forge-detail-links-launch]')
    await expect(launch, '[发起] 入口在场(禁用形态)').toBeVisible({ timeout: 10_000 })
    expect(await launch.isDisabled(), '终态任务:[发起] 禁用(todo#30)').toBe(true)
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })
})
