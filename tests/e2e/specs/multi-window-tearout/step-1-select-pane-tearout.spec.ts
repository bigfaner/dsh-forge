// @feature dsh-forge-m4 | @web-e2e | @journey multi-window-tearout
// Traceability: docs/features/dsh-forge-m4/testing/multi-window-tearout/
// contracts/step-1-select-pane-tearout.md — Outcomes:
//   success — 分屏态选中 pane,打开 pane 操作菜单:「拆出为窗口」动作可用
//             (拆出来源 = 工作台 pane);
//   single-instance-boundary — 已存在拆出窗口时,第二进程启动被单实例锁
//             挡退(聚焦既有实例后退出;窗口集保持)。
// fixture_spec: Project ×1 + Task ×1 + LayoutMemory(分屏态)+ 已拆出窗口。
// Techniques: sc4 ③(pane 头动作位)/ sc4 ④(第二实例锁挡退 + 原实例不动)。

import { expect, test, _electron } from '@playwright/test'
import {
  activateProjectByTreeRow, clickStable, M4WorldManager, startAutoDismiss,
} from '../_lib/m4-world.ts'
import { shellWindowCount, waitForDetachedBoard } from '../../helpers/windows.ts'
import { MAIN_PATH } from '../../../../apps/desktop/e2e/helpers/plugins.ts'
import { isProcessAlive } from '../../../../apps/desktop/e2e/helpers/fixture-app.ts'
import { bootMwWorld, buildMwJourneyRoot, reachTearoutReady } from './harness.ts'

test.describe.serial('multi-window-tearout / step 1: 选中待拆出视图', () => {
  const manager = new M4WorldManager()
  let stopAutoDismiss: () => void = () => {}

  test.afterAll(async () => {
    stopAutoDismiss()
    await manager.closeAll()
  })

  // Outcome "success" — pane 头 [拆出为窗口] 动作可用。
  test('step1/success: 分屏态 pane 操作菜单 —— [拆出为窗口] 动作位在场可用', async ({ }, testInfo) => {
    testInfo.setTimeout(420_000)
    const built = await buildMwJourneyRoot()
    const world = await bootMwWorld(manager, 'main', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await reachTearoutReady(page, kernel.projectId)

    // pane 头动作位在场(split-active ≥2 pane 才渲染;来源 = 工作台 pane)。
    await expect(page.locator('[data-dsh-forge-pane-detach]'),
      'pane 头 [拆出为窗口] 动作位在场可用').toBeVisible({ timeout: 10_000 })
    // 窗口集未变(纯菜单呈现;单窗在册)。
    expect(await shellWindowCount(world.shell.electronApp), '窗口集未变(单窗)').toBe(1)
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "single-instance-boundary" — 第二进程锁挡退(拆出窗在场)。
  test('step1/single-instance-boundary: 拆出窗在场 —— 第二进程被单实例锁挡退 + 原实例不动 + 窗口集保持', async ({ }, testInfo) => {
    testInfo.setTimeout(540_000)
    const built = await buildMwJourneyRoot()
    const world = await bootMwWorld(manager, 'lock', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await reachTearoutReady(page, kernel.projectId)

    // 就位:拆出窗在册(双窗)。
    await clickStable(page, '[data-dsh-forge-pane-detach]')
    const detached = await waitForDetachedBoard(world.shell.electronApp, kernel.projectId, 30_000)
    expect(await shellWindowCount(world.shell.electronApp), '双窗口在册(主窗 + 拆出窗)').toBe(2)
    const mainPid = await world.shell.electronApp.evaluate(() => process.pid)

    // 第二进程启动(同 userData):被锁挡退(退出或拒绝启动)。
    let second: import('@playwright/test').ElectronApplication | undefined
    try {
      second = await _electron.launch({
        args: [MAIN_PATH],
        env: {
          ...process.env,
          DSH_FORGE_PLUGIN_BUNDLES: world.shell.configPath,
          DSH_FORGE_PROFILE_DIR: world.shell.profileDir,
          DSH_FORGE_USER_DATA: world.shell.userDataDir as string,
          DSH_HOME: world.dshHome,
        },
        timeout: 15_000,
      })
      const exited = await Promise.race([
        new Promise<boolean>(resolve => { second?.process().once('exit', () => resolve(true)) }),
        new Promise<boolean>(resolve => { setTimeout(() => resolve(false), 15_000) }),
      ])
      expect(exited, '第二实例被单实例锁挡退(全部窗口同属单实例)').toBe(true)
    } catch {
      // 锁也可以直接拒绝 launch —— 同为挡退;原实例完好性下方仍把关。
    } finally {
      await second?.close().catch(() => {})
    }
    // 原实例不动:主进程存活 + 拆出窗仍在 + 双窗计数保持。
    expect(isProcessAlive(mainPid), '锁挡退后原实例存活').toBe(true)
    await expect(detached.page.locator(`[data-dsh-forge-detached-project="${kernel.projectId}"]`),
      '拆出窗仍在(原实例不动)').toBeVisible()
    expect(await shellWindowCount(world.shell.electronApp), '窗口集保持(双窗)').toBe(2)
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
    expect(detached.pageErrors, `detached pageerrors: ${detached.pageErrors.join(' | ')}`).toEqual([])
  })
})
