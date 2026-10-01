// @feature dsh-forge-m4 | @web-e2e | @journey task-session-roundtrip
// Traceability: docs/features/dsh-forge-m4/testing/task-session-roundtrip/
// contracts/step-4-open-top-session.md — Outcome:
//   success — 点击挂接行顶层会话条目:经会话打开通道打开(顶层入参 = 会话
//             id)并定位到会话视图;任务→会话打开路径 ≤1 次点击。
// fixture_spec: Project ×1 + Task + SessionLink(active)+ Session(顶层可打开)。
// Techniques: sc7 ③(clickSelfUnmounting + sessionOpenLanded + 树行 aria-current)。

import { expect, test } from '@playwright/test'
import {
  activateProjectByTreeRow, clickSelfUnmounting, M4WorldManager,
  openTaskDetail, sessionOpenLanded, startAutoDismiss,
} from '../_lib/m4-world.ts'
import { TASK_MAIN, TOP_A, bootRtWorld, buildRtJourneyRoot, registerRtLinks } from './harness.ts'

test.describe.serial('task-session-roundtrip / step 4: 打开顶层派发会话', () => {
  const manager = new M4WorldManager()
  let stopAutoDismiss: () => void = () => {}

  test.afterAll(async () => {
    stopAutoDismiss()
    await manager.closeAll()
  })

  // Outcome "success" — 顶层打开 ≤1 次点击,定位到会话视图。
  test('step4/success: 顶层会话条目 [打开] —— ≤1 次点击经打开通道定位到会话视图(树行选中)', async ({ }, testInfo) => {
    testInfo.setTimeout(480_000)
    const built = await buildRtJourneyRoot()
    const world = await bootRtWorld(manager, 'main', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await registerRtLinks(page, kernel)

    await openTaskDetail(page, TASK_MAIN)
    await expect(page.locator(`[data-dsh-forge-detail-link="${TOP_A}"]`),
      '挂接历史行 = active 顶层 A').toHaveAttribute('data-link-status', 'active', { timeout: 20_000 })
    await expect(page.locator(`[data-dsh-forge-detail-enter="${TOP_A}"]`),
      '[打开] 行尾 ghost 在场(顶层通道)').toBeVisible({ timeout: 10_000 })

    // ≤1 次点击:打开落位(右栏会话域随会话切换挂新面 = 打开完成的信号)。
    await clickSelfUnmounting(
      page, `[data-dsh-forge-detail-enter="${TOP_A}"]`,
      async () => await sessionOpenLanded(page)()
        && await page.locator(`[data-dsh-forge-tree-session="${TOP_A}"]`)
          .getAttribute('aria-current').catch(() => null) === 'true',
    )
    // 定位断言:会话视图选中该顶层会话(树行 aria-current)。
    await expect(page.locator(`[data-dsh-forge-tree-session="${TOP_A}"]`),
      '顶层会话打开并定位(树行 aria-current = 会话视图选中)').toHaveAttribute('aria-current', 'true', { timeout: 15_000 })
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })
})
