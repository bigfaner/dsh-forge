// @feature dsh-forge-m4 | @web-e2e | @journey split-pane-layout-memory
// Traceability: docs/features/dsh-forge-m4/testing/split-pane-layout-memory/
// contracts/step-1-single-view-default.md — Outcome:
//   success — 打开项目工作台:内容区单视图呈现(single 默认态);无布局记忆
//             时无残留布局(无 project_ui_state 行 → 零重放)。
// fixture_spec: Project ×1 + Session ×1(REAL 会话语料)+ 该项目无
// project_ui_state 行(stored:false 首次进入)。
// Techniques: sc4 ②(project_ui_state 卫生面 = DELETE 后 boot)+ sc2(右栏
// 默认姿态:无分隔条)。

import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  activateProjectByTreeRow, M4WorldManager, readLayoutBlob, startAutoDismiss,
} from '../_lib/m4-world.ts'
import { bootSpWorld, buildSpJourneyRoot } from './harness.ts'

test.describe.serial('split-pane-layout-memory / step 1: 进入单视图默认态', () => {
  const manager = new M4WorldManager()
  let stopAutoDismiss: () => void = () => {}

  test.afterAll(async () => {
    stopAutoDismiss()
    await manager.closeAll()
  })

  // Outcome "success" — 单视图默认态 + 无残留布局。
  test('step1/success: 首次进入 —— 单视图默认态呈现 + 无分隔条 + 零布局记忆重放', async ({ }, testInfo) => {
    testInfo.setTimeout(360_000)
    const built = await buildSpJourneyRoot()
    // 布局记忆卫生:pre-boot 删除可能存在的 project_ui_state 行(sc6 纪律,
    // 防首 seam 写入的默认行毒化 —— determinstic stored:false)。
    {
      const { DatabaseSync } = await import('node:sqlite')
      const db = new DatabaseSync(join(built.kernel.userDataDir, 'workbench', 'workbench.db'))
      try { db.exec('DELETE FROM project_ui_state') } finally { db.close() }
    }
    const world = await bootSpWorld(manager, 'main', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)

    // 单视图默认态:无分隔条(≥2 pane 才渲染)、无 pane 头动作位。
    await expect(page.locator('[data-dsh-forge-split-separator]'),
      'single 默认态:无分隔条').toHaveCount(0)
    await expect(page.locator('[data-dsh-forge-pane-header]'),
      'single 默认态:无 pane 头').toHaveCount(0)
    // State(深断言):无布局记忆行(零重放;首 seam 报告前的读数)。
    expect(await readLayoutBlob(kernel.userDataDir, kernel.projectId),
      '无 project_ui_state 行(stored:false 默认布局,零重放)').toBeUndefined()
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })
})
