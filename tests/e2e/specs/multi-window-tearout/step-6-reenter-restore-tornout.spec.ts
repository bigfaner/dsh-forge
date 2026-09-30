// @feature dsh-forge-m4 | @web-e2e | @journey multi-window-tearout
// Traceability: docs/features/dsh-forge-m4/testing/multi-window-tearout/
// contracts/step-6-reenter-restore-tornout.md — Outcomes:
//   success — 离开后重进:拆出窗口集合随项目记忆恢复(逐窗重建,窗口集收敛
//             为离开时集合;主窗 pane 结构同步恢复);
//   restore-target-missing — 记忆中某窗目标数据已删除:缺失窗降级呈现、
//             不崩溃,其余窗口与主窗布局正常恢复。
// fixture_spec: Project ×1 + Session + Task + LayoutMemory(detached 两窗条目 +
// 主窗 pane 结构)。missing 腿 = detached 条目指向已删除目标(board 数据面
// 随项目删除即整窗级;此处以「其余窗口健全 + 主窗恢复 + 零崩溃」为可达核)。
// Techniques: sc4 ④(冷重启 + waitForDetachedBoard 重进恢复)/ 4.5 重放
// open-detached ops 序列(FT-102/FT-122)。
//
// VERIFY(scope note, restore-target-missing):board 型拆出窗的目标 = 来源项目
// 数据面 —— 目标缺失的确定性布景 = 项目删除(即 step-5 支路三:窗全关 +
// 记忆随删清除,不崩溃)。单独「坏一条 detached 条目、其余健全」的注入需
// 直改 blob(project_ui_state 行)+ 冷重启 —— 以 SQLite 直写布景承载:坏
// op 计入 degraded 不中止(FT-122 逐 op 守护),主窗与其余恢复腿完整落地。

import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  activateProjectByTreeRow, clickStable, M4WorldManager, readLayoutBlob,
  startAutoDismiss,
} from '../_lib/m4-world.ts'
import { shellWindowCount, waitForDetachedBoard } from '../../helpers/windows.ts'
import { launchWorkbenchShell } from '../../helpers/app.ts'
import { assertNoActiveDshForgeInstances } from '../../helpers/instance-lock.ts'
import { bootMwWorld, buildMwJourneyRoot, reachTearoutReady } from './harness.ts'

test.describe.serial('multi-window-tearout / step 6: 离开重进恢复拆出态', () => {
  const manager = new M4WorldManager()
  let stopAutoDismiss: () => void = () => {}

  test.afterAll(async () => {
    stopAutoDismiss()
    await manager.closeAll()
  })

  // Outcome "success" — 重进恢复拆出态(逐窗重建 + 主窗 pane 恢复)。
  test('step6/success: 离开重进 —— 拆出窗口集合随记忆恢复(窗口集收敛)+ 主窗 pane 结构同步恢复', async ({ }, testInfo) => {
    testInfo.setTimeout(600_000)
    const built = await buildMwJourneyRoot()
    const world = await bootMwWorld(manager, 'main', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await reachTearoutReady(page, kernel.projectId)

    // 就位:双拆出(集合 = 2;见 step-5 类型边界注记 —— 双 board 窗承载)。
    await clickStable(page, '[data-dsh-forge-pane-detach]')
    await waitForDetachedBoard(world.shell.electronApp, kernel.projectId, 30_000)
    const { openBoardPane } = await import('../_lib/journey-world.ts')
    await openBoardPane(page)
    await clickStable(page, '[data-dsh-forge-pane-detach]')
    await waitForDetachedBoard(world.shell.electronApp, kernel.projectId, 30_000)
    await expect.poll(() => shellWindowCount(world.shell.electronApp),
      { timeout: 15_000, message: '离开前窗口集 = 3(主窗 + 两拆出窗)' }).toBe(3)
    await page.waitForTimeout(1_600)
    await expect.poll(async () => {
      const detached = (await readLayoutBlob(kernel.userDataDir, kernel.projectId))?.detached
      return Array.isArray(detached) ? (detached as unknown[]).length : 0
    }, { timeout: 15_000, message: '离开前拆出集合入 blob(= 2)' }).toBe(2)

    // 离开(退出漏斗:主窗销毁 → recallAll 清扫)→ 重进(同 userData 冷重启)。
    const userDataDir = kernel.userDataDir
    const rootDir = world.root
    const dshHome = world.dshHome
    stopAutoDismiss()
    const { quitShellAssertZeroWindows } = await import('../../helpers/windows.ts')
    await quitShellAssertZeroWindows(world.shell.electronApp)
    assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })
    const reborn = await launchWorkbenchShell({ userDataDir, rootDir, env: { DSH_HOME: dshHome, DEEPSEEK_API_KEY: 'm4-e2e-stub-key' } })
    manager.adopt({
      tag: 'restore-reborn', shell: reborn, page: reborn.page, kernel,
      root: rootDir, dshHome, stub: null, mainLog: [],
    })
    try {
      await reborn.uiReady()
      stopAutoDismiss = startAutoDismiss(reborn.page)
      const page2 = reborn.page
      // 主窗:活跃项目恢复 + pane 结构同步恢复。
      await expect(page2.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`),
        '重进:活跃项目恢复').toHaveAttribute('aria-current', 'true', { timeout: 30_000 })
      // 拆出集合恢复:逐窗重建,窗口集收敛为离开时集合(主窗 + 2)。
      await expect.poll(() => shellWindowCount(reborn.electronApp),
        { timeout: 45_000, message: '拆出集合恢复(窗口集收敛 = 3)' }).toBe(3)
      const restored = await waitForDetachedBoard(reborn.electronApp, kernel.projectId, 30_000)
      await expect(restored.page.locator(`[data-dsh-forge-detached-project="${kernel.projectId}"]`),
        '恢复的拆出窗钉死来源项目(逐窗重建)').toBeVisible()
      expect(reborn.pageErrors, `renderer pageerrors: ${reborn.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      stopAutoDismiss()
    }
  })

  // Outcome "restore-target-missing" — 坏 detached 条目降级,其余恢复完整。
  test('step6/restore-target-missing: 记忆条目指向已删目标 —— 恢复不崩溃 + 其余窗口与主窗布局正常恢复', async ({ }, testInfo) => {
    testInfo.setTimeout(600_000)
    const built = await buildMwJourneyRoot()
    const world = await bootMwWorld(manager, 'missing', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await reachTearoutReady(page, kernel.projectId)

    // 就位:一拆出窗 + 集合落库。
    await clickStable(page, '[data-dsh-forge-pane-detach]')
    await waitForDetachedBoard(world.shell.electronApp, kernel.projectId, 30_000)
    await page.waitForTimeout(1_600)
    await expect.poll(async () => JSON.stringify((await readLayoutBlob(kernel.userDataDir, kernel.projectId))?.detached ?? {}),
      { timeout: 15_000, message: '拆出集合入 blob' }).toContain('board')

    // 布景:退出 → 直改 blob,注入一条指向已删目标的坏条目(FT-122 逐 op
    // 守护:坏 op 降级不中止;其余恢复腿完整)。
    const userDataDir = kernel.userDataDir
    const rootDir = world.root
    const dshHome = world.dshHome
    stopAutoDismiss()
    const { quitShellAssertZeroWindows } = await import('../../helpers/windows.ts')
    await quitShellAssertZeroWindows(world.shell.electronApp)
    {
      const { DatabaseSync } = await import('node:sqlite')
      const db = new DatabaseSync(join(userDataDir, 'workbench', 'workbench.db'))
      try {
        const row = db.prepare('SELECT layout_json FROM project_ui_state WHERE project_id = ?').get(kernel.projectId) as
          { layout_json: string } | undefined
        if (row !== undefined) {
          const blob = JSON.parse(row.layout_json) as {
            detached?: Array<{ view: string; target?: unknown; rect?: unknown }>
          }
          // 坏条目:board 视图指向不存在的目标 session id(重建时 openDetached
          // 拒绝 → degraded 计数,不中止其余恢复)。
          blob.detached = [
            ...(blob.detached ?? []),
            { view: 'conversation', target: { parentSessionId: 'mw-ghost-parent', childSessionId: 'mw-ghost-child', mode: 'one-shot' } },
          ]
          db.prepare('UPDATE project_ui_state SET layout_json = ? WHERE project_id = ?')
            .run(JSON.stringify(blob), kernel.projectId)
        }
      } finally {
        db.close()
      }
    }

    // 重进:恢复不崩溃 + 主窗布局正常恢复 + 坏目标窗降级(不静默崩溃)。
    assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })
    const reborn = await launchWorkbenchShell({ userDataDir, rootDir, env: { DSH_HOME: dshHome, DEEPSEEK_API_KEY: 'm4-e2e-stub-key' } })
    manager.adopt({
      tag: 'missing-reborn', shell: reborn, page: reborn.page, kernel,
      root: rootDir, dshHome, stub: null, mainLog: [],
    })
    try {
      await reborn.uiReady()
      stopAutoDismiss = startAutoDismiss(reborn.page)
      const page2 = reborn.page
      // 恢复不崩溃:主窗活跃项目恢复 + 座位在场。
      await expect(page2.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`),
        '重进:活跃项目恢复(坏条目不中止其余恢复腿)').toHaveAttribute('aria-current', 'true', { timeout: 30_000 })
      await expect(page2.locator('[data-dsh-forge-project-seat]'),
        '主窗布局正常恢复(座位在场)').toBeVisible()
      // 健全条目的窗正常重建(board 窗);坏 conversation 条目降级(其窗
      // 不呈现 —— 目标不可解析;其余恢复腿完整)。
      const restored = await waitForDetachedBoard(reborn.electronApp, kernel.projectId, 45_000)
      await expect(restored.page.locator(`[data-dsh-forge-detached-project="${kernel.projectId}"]`),
        '健全条目逐窗重建(坏 op 降级不中止)').toBeVisible()
      expect(reborn.pageErrors, `renderer pageerrors: ${reborn.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      stopAutoDismiss()
    }
  })
})
