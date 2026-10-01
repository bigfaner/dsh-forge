// @feature dsh-forge-m4 | @web-e2e | @journey task-session-roundtrip
// Traceability: docs/features/dsh-forge-m4/testing/task-session-roundtrip/
// contracts/step-2-view-link-history.md — Outcomes:
//   success — active 与 ended 挂接完整呈现、新→旧排序;ended 行可展开查看
//             历史;会话运行中徽标呈现(active 挂接存在);
//   ended-lineage-unavailable — ended 挂接的会话已 disposed(上游快照缺席):
//             行可展开、挂接历史条目照常呈现;血缘位「不可用」说明。
// fixture_spec: Project ×1 + Task + SessionLink ×2(active + ended)。
// Techniques: sc7 ①(挂接行 + 新→旧 + 行展开 + 运行中徽标)。
//
// disposed 布景:GHOST_SESSION 从不落盘 = 上游 byId 永远缺席 —— ended 挂接
// 行指向幽灵会话即「会话已 disposed」的确定性形态(快照缺席,血缘无从推导)。

import { expect, test } from '@playwright/test'
import {
  activateProjectByTreeRow, clickStable, expandLinkRow, M4WorldManager,
  openTaskDetail, startAutoDismiss,
} from '../_lib/m4-world.ts'
import {
  GHOST_SESSION, TASK_GHOST, TASK_MAIN, TOP_A, TOP_B, TOP_M,
  bootRtWorld, buildRtJourneyRoot, registerRtLinks,
} from './harness.ts'

test.describe.serial('task-session-roundtrip / step 2: 查看挂接历史', () => {
  const manager = new M4WorldManager()
  let stopAutoDismiss: () => void = () => {}

  test.afterAll(async () => {
    stopAutoDismiss()
    await manager.closeAll()
  })

  // Outcome "success" — active/ended 齐 + 新→旧 + 展开 + 运行中徽标。
  test('step2/success: 挂接历史 —— active/ended 完整呈现 + 新→旧排序 + ended 行展开 + 会话运行中徽标', async ({ }, testInfo) => {
    testInfo.setTimeout(480_000)
    const built = await buildRtJourneyRoot()
    const world = await bootRtWorld(manager, 'main', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await registerRtLinks(page, kernel)

    await openTaskDetail(page, TASK_MAIN)
    // active 行(TOP_A)在场 + 会话运行中徽标(active 挂接存在)。
    await expect(page.locator(`[data-dsh-forge-detail-link="${TOP_A}"]`),
      'active 挂接行在场').toHaveAttribute('data-link-status', 'active', { timeout: 20_000 })
    await expect(page.locator(`[data-dsh-forge-badge="link:active"]`),
      '会话运行中徽标呈现(active 挂接存在)').toBeVisible({ timeout: 10_000 })
    // ended 行两行,新→旧(M 新于 B:startedAt 降序)。
    const endedRows = page.locator('[data-dsh-forge-detail-link][data-link-status="ended"]')
    await expect(endedRows, 'ended 挂接两行').toHaveCount(2, { timeout: 10_000 })
    await expect(endedRows.nth(0), '新→旧:M 行在前(startedAt 降序)').toContainText(TOP_M)
    await expect(endedRows.nth(1), '旧在后:B 行居次').toContainText(TOP_B)
    // ended 行可展开查看历史(B 行;M 的展开面归 step-3 的上限腿)。
    await expandLinkRow(page, TOP_B)
    await expect(page.locator(`[data-dsh-forge-detail-link-body="${TOP_B}"] [data-dsh-forge-detail-descendant]`),
      'ended 行展开 = 历史快照查看(UF5)').toBeVisible({ timeout: 10_000 })
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "ended-lineage-unavailable" — disposed 会话的血缘位「不可用」。
  test('step2/ended-lineage-unavailable: disposed 会话 ended 行 —— 行可展开 + 挂接条目照常 + 血缘位「不可用」(不报错)', async ({ }, testInfo) => {
    testInfo.setTimeout(480_000)
    const built = await buildRtJourneyRoot()
    const world = await bootRtWorld(manager, 'disposed', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await registerRtLinks(page, kernel)
    // 布景:GHOST 挂接转为 ended(幽灵会话 = byId 永远缺席 = disposed 形态)。
    const { bridgeInvoke } = await import('../_lib/m4-world.ts')
    const detail = await bridgeInvoke<{ links: Array<{ id: string; sessionId: string; status: string }> }>(
      page, 'getTaskDetail', [kernel.projectId, TASK_GHOST])
    for (const link of detail.links) {
      if (link.sessionId === GHOST_SESSION && link.status === 'active') {
        await bridgeInvoke<void>(page, 'endSessionLink', [link.id])
      }
    }

    await openTaskDetail(page, TASK_GHOST)
    await expect(page.locator(`[data-dsh-forge-detail-link="${GHOST_SESSION}"]`),
      'disposed ended 行在场').toHaveAttribute('data-link-status', 'ended', { timeout: 20_000 })
    // 行可展开 + 挂接历史条目照常呈现;血缘位「不可用」说明。
    await expandLinkRow(page, GHOST_SESSION)
    await expect(page.locator(`[data-dsh-forge-detail-link-body="${GHOST_SESSION}"]`),
      '行可展开(挂接历史条目照常呈现)').toBeVisible({ timeout: 10_000 })
    await expect(page.locator(`[data-dsh-forge-detail-lineage-unavailable="${GHOST_SESSION}"]`),
      '血缘位「不可用」说明(会话已清理,血缘无从推导)').toBeVisible({ timeout: 10_000 })
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })
})
