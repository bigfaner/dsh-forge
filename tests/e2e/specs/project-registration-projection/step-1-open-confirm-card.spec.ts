// @feature dsh-forge-m4 | @web-e2e | @journey project-registration-projection
// Traceability: docs/features/dsh-forge-m4/testing/project-registration-
// projection/contracts/step-1-open-confirm-card.md — Outcome:
//   success — 左栏区头「＋」→ 添加项目确认卡原位弹出(不跳页);唯一必答 =
//             代码区文件夹;知识区不上卡(M4 不渲染);注册表零变更。
// fixture_spec: Project ×1(基线项目,已注册且路径健康)。
// Techniques: sc1 ⑤(树区头 [＋] = C7 唯一入口)+ confirm-card.spec.tsx AC1
// (idle 面:代码区输入在场 + submit 禁用 + 留痕灰字)。

import { expect, test } from '@playwright/test'
import { bridgeInvoke, M4WorldManager, startAutoDismiss } from '../_lib/m4-world.ts'
import { bootRegWorld, buildRegJourneyRoot, cancelAddCard, openAddCard, submitDisabled } from './harness.ts'

test.describe.serial('project-registration-projection / step 1: 打开添加项目确认卡', () => {
  const manager = new M4WorldManager()
  let stopAutoDismiss: () => void = () => {}

  test.afterAll(async () => {
    stopAutoDismiss()
    await manager.closeAll()
  })

  // Outcome "success" — 卡原位弹出 + 唯一必答 + 知识区不上卡 + 零变更。
  test('step1/success: 左栏区头「＋」—— C7 确认卡原位弹出(唯一必答 = 代码区)+ 知识区不上卡 + 注册表零变更', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const built = await buildRegJourneyRoot()
    const world = await bootRegWorld(manager, 'main', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)

    // 基线项目行在座(fixture_spec:已注册基线)。
    await expect(page.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`),
      '基线项目行在座(同名同序断言基线)').toBeVisible({ timeout: 30_000 })

    // 左栏区头「＋」→ 卡原位弹出(不跳页:同 document,Dialog 浮层)。
    await openAddCard(page)
    // 唯一必答 = 代码区文件夹(拖拽/粘贴入口在卡;浏览钮按实现收窄隐藏)。
    await expect(page.locator('[data-dsh-forge-confirm-code]'),
      '代码区输入在卡(唯一必答项)').toBeVisible()
    // idle 面:提交禁用(未给定路径)、留痕灰字在场。
    expect(await submitDisabled(page), 'idle:添加禁用(路径未给定)').toBe(true)
    await expect(page.locator('[data-dsh-forge-confirm-trace]'),
      '过程留痕灰字在场(卡形态完整)').toBeVisible()
    // 知识区不上卡(M4 不渲染):卡内零知识区/管线位面。
    await expect(page.locator('[data-dsh-forge-dialog="confirm-card"] [data-dsh-forge-overview-subtab]'),
      '知识区面不上卡(零子 tab)').toHaveCount(0)
    await expect(page.locator('[data-dsh-forge-dialog="confirm-card"] [data-dsh-forge-confirm-preview]'),
      'idle:文档位置预览行未渲染(未给定路径,零空占位)').toHaveCount(0)

    // State:注册表零变更(内核面交叉)。
    const state = await bridgeInvoke<{ projects: Array<{ id: string }> }>(page, 'getState', [])
    expect(state.projects.length, '注册表零变更(恰基线一行)').toBe(1)

    // 取消收卡(对话可退出;仍零变更)。
    await cancelAddCard(page)
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })
})
