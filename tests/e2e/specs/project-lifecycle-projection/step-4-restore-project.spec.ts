// @feature dsh-forge-m4 | @web-e2e | @journey project-lifecycle-projection
// Traceability: docs/features/dsh-forge-m4/testing/project-lifecycle-
// projection/contracts/step-4-restore-project.md — Outcome:
//   success — 归档行菜单恢复 → 项目移回活跃区;投影不变化(workspace 未
//             移除,会话分组保持;dsh 侧零变更)。
// fixture_spec: Project ×1(archived=1)+ Workspace(title/orderIdx 归档期间
// 保持)+ Session(cwd 落 workspace 投影路径)。
// Techniques: sc3-sync ③④(归档/恢复零投影 op —— 实况全等对拍)。

import { expect, test } from '@playwright/test'
import {
  activateProjectByTreeRow, M4WorldManager, readLiveRegistry,
  startAutoDismiss, waitForStatus,
} from '../_lib/m4-world.ts'
import { SESS_A, archiveViaMenu, bootLcWorld, buildLcJourneyRoot, registerLcProjects, restoreViaMenu } from './harness.ts'

test.describe.serial('project-lifecycle-projection / step 4: 恢复归档项目', () => {
  const manager = new M4WorldManager()
  let stopAutoDismiss: () => void = () => {}

  test.afterAll(async () => {
    stopAutoDismiss()
    await manager.closeAll()
  })

  // Outcome "success" — 恢复:活跃区回座 + 投影面全等不动。
  test('step4/success: 归档行菜单恢复 —— 项目移回活跃区 + dsh 侧零变更(workspace/分组/序全等)', async ({ }, testInfo) => {
    testInfo.setTimeout(480_000)
    const built = await buildLcJourneyRoot()
    const world = await bootLcWorld(manager, 'main', built)
    const { page, kernel, dshHome } = world
    stopAutoDismiss = startAutoDismiss(page)
    await registerLcProjects(built, page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await waitForStatus(page, kernel.projectId, row => row.state === 'healthy', 'A healthy(基线)')

    // 就位:归档(实况基线快照取于归档后)。
    await archiveViaMenu(page, kernel.projectId)
    await expect(page.locator(`[data-dsh-forge-tree-archived-row="${kernel.projectId}"]`),
      'A 入归档分区').toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(1_200)
    const archivedSurface = JSON.stringify((readLiveRegistry(dshHome) as NonNullable<ReturnType<typeof readLiveRegistry>>)
      .order.map(row => ({ path: row.path, title: row.title, sessionIds: row.sessionIds })))

    // 恢复(归档行 ⋯ 菜单;confirm-free)。
    await restoreViaMenu(page, kernel.projectId)
    await expect(page.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`),
      '项目移回活跃分区').toBeVisible({ timeout: 15_000 })
    await expect(page.locator(`[data-dsh-forge-tree-archived-row="${kernel.projectId}"]`),
      '归档分区行退场').toHaveCount(0, { timeout: 15_000 })

    // State(forge 面):archived=false + 会话行回树(分组保持)。
    const state = await page.evaluate(async (id: string) => {
      const bridge = (globalThis as { dshForge?: { workbench?: { getState(): Promise<{ projects: Array<{ id: string; archived: boolean }> }> } } }).dshForge?.workbench
      return await bridge?.getState()
    }, kernel.projectId)
    expect(state?.projects.find(row => row.id === kernel.projectId)?.archived,
      'archived=false(恢复位翻转)').toBe(false)
    // 会话分组保持:恢复后项目组重新呈现会话行(展示面回来,分组账从未动)。
    const rowA = page.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`)
    await rowA.click()
    await expect(rowA, 'A 行激活').toHaveAttribute('aria-current', 'true', { timeout: 15_000 })
    await page.waitForTimeout(500)
    let restored: string[] | null = null
    for (let round = 0; round < 30; round += 1) {
      restored = await page.evaluate((id: string) => {
        const row = document.querySelector(`[data-dsh-forge-tree-project="${id}"]`)
        const block = row?.parentElement
        if (block === null || block === undefined) return null
        return [...block.querySelectorAll('[data-dsh-forge-tree-session]')]
          .map(el => el.getAttribute('data-dsh-forge-tree-session') ?? '')
      }, kernel.projectId)
      if (restored !== null && restored.includes(SESS_A)) break
      await page.waitForTimeout(500)
    }
    expect(restored, '恢复后项目组呈现会话行(分组保持)').toContain(SESS_A)

    // State(dsh 实况,深断言):投影面全等(恢复零投影 op)。
    await page.waitForTimeout(1_200)
    expect(JSON.stringify((readLiveRegistry(dshHome) as NonNullable<ReturnType<typeof readLiveRegistry>>)
      .order.map(row => ({ path: row.path, title: row.title, sessionIds: row.sessionIds }))),
    '恢复不触碰投影面(workspace 未移除,会话分组/序全等)').toBe(archivedSurface)
    await waitForStatus(page, kernel.projectId, row => row.state === 'healthy' && row.deviations.length === 0, '恢复后 healthy 零偏差')
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })
})
