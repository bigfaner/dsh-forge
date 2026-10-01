// @feature dsh-forge-m4 | @web-e2e | @journey project-workbench-home
// Traceability: docs/features/dsh-forge-m4/testing/project-workbench-home/
// contracts/step-1-boot-first-screen.md — Outcomes:
//   success — 首屏 = 项目工作台(project 视图键),恢复上次活跃项目;三区
//             容器整台呈现;不以 dsh 原生会话列表或旧全局平铺导航为首屏;
//   empty-first-boot — 全新安装零注册表:空态 hero 引导「添加项目」;不渲染
//             空项目树/空三区骨架;无报错。
// fixture_spec: Project ×2(1 活跃 + 1 归档)+ AppState.active_project_id →
// 经真内核语料 + 树行激活(用户径写指针)承载;empty 腿 = 零注册表 userData。
// Techniques: sc1 ①(boot 落 conversation + 指针恢复)/ sc1 ⑤(空态引导卡)。

import { expect, test } from '@playwright/test'
import {
  bridgeInvoke, M4WorldManager, newSessionButton, startAutoDismiss,
} from '../_lib/m4-world.ts'
import { bootBareWorld, bootMainWorld, buildMainJourneyRoot } from './harness.ts'

test.describe.serial('project-workbench-home / step 1: 启动进入项目工作台首屏', () => {
  const manager = new M4WorldManager()
  let built: Awaited<ReturnType<typeof buildMainJourneyRoot>> | null = null
  let stopAutoDismiss: () => void = () => {}

  test.afterAll(async () => {
    stopAutoDismiss()
    await manager.closeAll()
  })

  // Outcome "success" — 首屏 = 项目工作台,三区整台,指针恢复。
  test('step1/success: boot 落项目工作台首屏 —— 恢复上次活跃项目 + 三区容器整台呈现 + 孤儿视图零残留', async ({ }, testInfo) => {
    testInfo.setTimeout(360_000)
    built = await buildMainJourneyRoot()
    const world = await bootMainWorld(manager, 'main', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)

    // 激活走用户径(树行点击)—— 「上次活跃项目」的指针写(boot 后首次)。
    const treeRow = page.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`)
    await expect(treeRow, '左栏项目树呈现活跃项目行(三区之左栏在座)').toBeVisible({ timeout: 30_000 })
    await treeRow.click()
    await expect(treeRow, '激活后树行 aria-current').toHaveAttribute('aria-current', 'true', { timeout: 15_000 })

    // 首屏 = 项目工作台:中间原生会话面板在座(conversation 交互面)、
    // forge main 面板(旧工作台逃生门)不自动挂载 —— 不以旧全局平铺为首屏。
    await newSessionButton(page).waitFor({ state: 'visible', timeout: 30_000 })
    await expect(page.locator('[data-dsh-forge-shell]'),
      '首屏 = conversation(项目工作台;旧 workbench main 面板不挂载)').toHaveCount(0)
    // 右栏容器在座(三区之右栏;forge tabs 宿主)。
    await expect(page.locator('[data-sidebar-right-panel]').first(),
      '右栏 dockkit 容器在座(三区整台)').toBeAttached({ timeout: 30_000 })
    // 三区同页判据(同 document)。
    const samePage = await page.evaluate(() => ({
      seat: document.querySelector('[data-dsh-forge-project-seat]') !== null,
      rightbar: document.querySelector('[data-sidebar-right-panel]') !== null,
      shell: document.querySelector('[data-dsh-forge-shell]') !== null,
    }))
    expect(samePage, '三区容器同 document 同页(座位 + conversation + rightbar)').toEqual({
      seat: true, rightbar: true, shell: false,
    })

    // 孤儿视图清零(retired 面零残留 —— SC1 口径)。
    await expect(page.locator('[data-dsh-forge-tab]'), 'retired TabBar 面零残留').toHaveCount(0)
    for (const retired of ['tasks', 'features', 'proposals'] as const) {
      await expect(page.locator(`[data-dsh-forge-view="dsh-forge-view-${retired}"]`),
        `retired 容器 dsh-forge-view-${retired} 零挂载`).toHaveCount(0)
    }
    await expect(page.locator('[data-dsh-forge-rail]'), '降级 rail 不在场').toHaveCount(0)

    // State:active_project_id 恢复指向(重启恢复腿的基线;内核面交叉)。
    const state = await bridgeInvoke<{ activeProjectId: string | null }>(page, 'getState', [])
    expect(state.activeProjectId, '活跃指针 = 承载项目(树行用户径写指针)').toBe(kernel.projectId)
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "empty-first-boot" — 零注册表:空态 hero 引导,零空骨架。
  test('step1/empty-first-boot: 全新安装零注册表 —— 空态 hero 引导「添加项目」+ 零空树/零空骨架 + 无报错', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const { world } = await bootBareWorld(manager, 'bare')
    const { page } = world
    stopAutoDismiss = startAutoDismiss(page)

    // 空态 hero 引导(动作面直达 C7;唯一空态呈现)。
    await expect(page.locator('[data-dsh-forge-project-empty]'),
      '空态引导卡在场(零注册表)').toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-dsh-forge-project-empty-add]'),
      '空态卡动作面在场([＋] → C7 确认卡)').toBeVisible()
    // 不渲染空项目树/空三区骨架:知识区零空占位(SC2 口径)。
    await expect(page.locator('[data-dsh-forge-tab]'), '零 forge tab(空骨架不渲染)').toHaveCount(0)
    await expect(page.locator('[data-dsh-forge-view]'), '零 forge 视图容器(空骨架不渲染)').toHaveCount(0)
    // State:零注册项目保持;不产生半注册数据(内核面交叉)。
    const state = await bridgeInvoke<{ activeProjectId: string | null; projects: unknown[] }>(page, 'getState', [])
    expect(state.projects, '注册表零行(全新安装)').toEqual([])
    expect(state.activeProjectId, 'active_project_id 为空').toBeNull()
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })
})
