// @feature dsh-forge-m4 | @web-e2e | @journey project-lifecycle-projection
// Journey smoke test — the C8 lifecycle loop END TO END in one world
// (happy-path Outcomes only):
//   Step 1 healthy 状态行 → Step 2 改名(投影同步 + 分组保持)→ Step 3 归档
//   (workspace 保留 + 会话列表不展示)→ Step 4 恢复(投影不变化)→ Step 5
//   删除(经确认对话:条目删除 + workspace 移除 + 退未分组 + 历史不删除 +
//   布局记忆清除)。
// Traceability: docs/features/dsh-forge-m4/testing/project-lifecycle-
// projection/journey.md (Happy Path Steps 1-5) + contracts/step-{1..5}-*.md
// success faces。

import { expect, test } from '@playwright/test'
import { readCorpusSession } from '../../stubs/lineage-corpus.ts'
import {
  activateProjectByTreeRow, M4WorldManager, openOverviewForActiveProject,
  projectionStatusRow, readLayoutBlob, readLiveRegistry, rowAtAnchor,
  startAutoDismiss, ungroupedSessionIds, waitForRegistry, waitForStatus,
} from '../_lib/m4-world.ts'
import { openBoardPane } from '../_lib/journey-world.ts'
import {
  CARRIER, CARRIER_RENAMED, SESS_A, archiveViaMenu, bootLcWorld,
  buildLcJourneyRoot, registerLcProjects, removeViaMenu, restoreViaMenu, renameViaMenu,
} from './harness.ts'

test('smoke/project-lifecycle-projection: healthy → 改名 → 归档 → 恢复 → 删除(单世界 happy path)', async ({ }, testInfo) => {
  testInfo.setTimeout(900_000)
  const manager = new M4WorldManager()
  let stopAutoDismiss: () => void = () => {}
  const built = await buildLcJourneyRoot()
  try {
    const world = await bootLcWorld(manager, 'main', built)
    const { page, kernel, dshHome } = world
    const other = built.other
    stopAutoDismiss = startAutoDismiss(page)
    await registerLcProjects(built, page)
    await activateProjectByTreeRow(page, kernel.projectId)

    // ---- Step 1:投影状态 healthy -----------------------------------------
    await waitForStatus(page, kernel.projectId, row => row.state === 'healthy' && row.deviations.length === 0,
      'Step 1:A healthy(对账一致)')
    await openOverviewForActiveProject(page, CARRIER, `[data-dsh-forge-tree-project="${kernel.projectId}"]`)
    await expect(projectionStatusRow(page), 'Step 1:healthy 状态行').toHaveAttribute('data-state', 'healthy', { timeout: 15_000 })

    // 布局记忆语料(Step 5 清除断言面;A 开 board pane → blob)。
    await openBoardPane(page)
    await page.waitForTimeout(1_600)
    await expect.poll(async () => (await readLayoutBlob(kernel.userDataDir, kernel.projectId) === undefined ? 0 : 1),
      { timeout: 15_000, message: 'A 布局记忆行在座' }).toBe(1)

    // ---- Step 2:改名(投影同步 + 分组保持)------------------------------
    await renameViaMenu(page, kernel.projectId, CARRIER_RENAMED)
    await expect(page.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`),
      'Step 2:forge 新名').toContainText(CARRIER_RENAMED, { timeout: 15_000 })
    await waitForRegistry(page, dshHome, registry =>
      rowAtAnchor(registry, kernel.codeRoot)?.title === CARRIER_RENAMED,
    'Step 2:dsh workspace 同名收敛')
    const renamedRegistry = readLiveRegistry(dshHome) as NonNullable<ReturnType<typeof readLiveRegistry>>
    expect(rowAtAnchor(renamedRegistry, kernel.codeRoot)?.sessionIds,
      'Step 2:会话分组随 workspace 保持').toContain(SESS_A)

    // ---- Step 3:归档(workspace 保留 + 会话列表不展示)------------------
    const beforeArchive = readLiveRegistry(dshHome) as NonNullable<ReturnType<typeof readLiveRegistry>>
    await archiveViaMenu(page, kernel.projectId)
    await expect(page.locator(`[data-dsh-forge-tree-archived-row="${kernel.projectId}"]`),
      'Step 3:forge 归档分区行').toBeVisible({ timeout: 15_000 })
    await expect(page.locator(`[data-dsh-forge-tree-session="${SESS_A}"]`),
      'Step 3:会话列表不再展示').toHaveCount(0, { timeout: 15_000 })
    await page.waitForTimeout(1_200)
    const afterArchive = readLiveRegistry(dshHome) as NonNullable<ReturnType<typeof readLiveRegistry>>
    expect(rowAtAnchor(afterArchive, kernel.codeRoot), 'Step 3:dsh workspace 保留').toBeDefined()
    expect(rowAtAnchor(afterArchive, kernel.codeRoot)?.sessionIds,
      'Step 3:会话仍按项目 workspace 分组').toEqual(rowAtAnchor(beforeArchive, kernel.codeRoot)?.sessionIds)
    expect(afterArchive.order.map(row => row.path), 'Step 3:注册表序不变(零投影 op)')
      .toEqual(beforeArchive.order.map(row => row.path))

    // ---- Step 4:恢复(投影不变化)--------------------------------------
    const archivedSurface = JSON.stringify(afterArchive.order.map(row => ({ path: row.path, title: row.title, sessionIds: row.sessionIds })))
    await restoreViaMenu(page, kernel.projectId)
    await expect(page.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`),
      'Step 4:项目移回活跃分区').toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(1_200)
    expect(JSON.stringify((readLiveRegistry(dshHome) as NonNullable<ReturnType<typeof readLiveRegistry>>)
      .order.map(row => ({ path: row.path, title: row.title, sessionIds: row.sessionIds }))),
    'Step 4:投影面全等(恢复零投影 op)').toBe(archivedSurface)

    // ---- Step 5:删除(经确认对话;四面板终态)---------------------------
    await removeViaMenu(page, kernel.projectId)
    await expect(page.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`),
      'Step 5:条目删除(树行零残留)').toHaveCount(0, { timeout: 15_000 })
    await waitForRegistry(page, dshHome, registry => rowAtAnchor(registry, kernel.codeRoot) === undefined,
      'Step 5:workspace 移除收敛')
    let ungrouped: string[] | null = null
    for (let round = 0; round < 30; round += 1) {
      ungrouped = await ungroupedSessionIds(page)
      if (ungrouped !== null && ungrouped.includes(SESS_A)) break
      await page.waitForTimeout(500)
    }
    expect(ungrouped, 'Step 5:会话退未分组').toContain(SESS_A)
    const reread = await readCorpusSession({ dshHome, sessionId: SESS_A })
    expect(reread.header.id, 'Step 5:历史不删除(REAL backend 可读)').toBe(SESS_A)
    expect(await readLayoutBlob(kernel.userDataDir, kernel.projectId),
      'Step 5:布局记忆随之清除').toBeUndefined()
    const state = await page.evaluate(async () => {
      const bridge = (globalThis as { dshForge?: { workbench?: { getState(): Promise<{ activeProjectId: string | null }> } } }).dshForge?.workbench
      return await bridge?.getState()
    })
    expect(state?.activeProjectId, 'Step 5:指针不指向已删 id').not.toBe(kernel.projectId)
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  } finally {
    stopAutoDismiss()
    await manager.closeAll()
  }
})
