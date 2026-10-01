// @feature dsh-forge-m4 | @web-e2e | @journey forge-m4-sc2
// Traceability: docs/features/dsh-forge-m4/tasks/1.8-e2e-migration-sc1-sc2.md (AC-4)
// Authorities: tech-design §Testing Strategy·Key Test Scenarios (SC2)、prd-spec
// §Success Criteria SC2(三区同页/知识区零空占位)、design/page-map.md 项目工作台
// Layout(AppFrame → ConversationPanel + forge 注入)。
//
// SC2 布局腿(1.8 口径 = 布局可见性;「右栏 M3 面收纳」全量断言留 2.10 ——
// 右栏 forge tabs 是 P2 2.2/2.3 的交付面,本腿只证三区容器同页在场):
//
//   ① 三区同页:左栏 forge 项目树座位([data-dsh-forge-project-seat],C3
//      替换渲染)+ 中间原生会话面板(conversation 在座、forge shell 不挂载)
//      + 右栏容器(原生 rightbar dockkit 面板根 data-sidebar-right-panel,
//      P2 起 forge tabs 的宿主)同页可见 —— 一屏之内,无独立列表页/无页级
//      切换(page-map:顶层互斥 main 面板只有 conversation 与逃生门);
//   ② 知识区零空占位(不建空占位纪律):无 forge tab 面挂载(P2 右栏 tabs
//      未落地前,不预置任何空 tab/空视图)、无预置知识数据面、唯一空态
//      引导 = 项目空态卡(动作面直达 C7,功能性引导非占位)—— 注册项目后
//      即消失;
//   ③ 逃生门语义对照:workbench main 面板 = overview 单页(SC5 过渡载体),
//      三区布局只在 conversation 侧成立 —— 互斥 main 面板口径的对照腿。
//
// 实例锁纪律(Hard Rule):launch 前 assertNoActiveDshForgeInstances。

import { rmSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { assertNoActiveDshForgeInstances } from '../../helpers/instance-lock.ts'
import { freshUserDataDir, launchWorkbenchShell } from '../../helpers/app.ts'
import { buildKernelWorld, freshRoot, type KernelWorld } from '../_lib/journey-world.ts'
import type { PluginShell } from '../../../../apps/desktop/e2e/helpers/plugins.ts'

/** The upstream sidebar's workbench escape-door row. */
const workbenchRow = (page: Page) =>
  page.getByRole('button', { name: /^工作台$|^Workbench$/ }).first()

/** The conversation-ready signal (the native new-session surface). */
const newSessionButton = (page: Page) =>
  page.getByRole('button', { name: /新建会话|New Session/ }).first()

/** The in-page preload-bridge verb dispatcher (one evaluate per call). */
async function bridgeInvoke<T>(page: Page, verb: string, args: readonly unknown[]): Promise<T> {
  return await page.evaluate(async (input: { verb: string; args: unknown[] }) => {
    const bridge = (globalThis as { dshForge?: { workbench?: Record<string, (...invoke: unknown[]) => Promise<unknown>> } }).dshForge?.workbench
    if (bridge === undefined || typeof bridge[input.verb] !== 'function') {
      throw Error(`dshForge.workbench.${input.verb} unavailable in the e2e renderer`)
    }
    return await bridge[input.verb](...input.args)
  }, { verb, args })
}

/** The SC2 kernel corpus (one project, one feature, two tasks). */
function sc2Kernel(root: string): Promise<KernelWorld> {
  return buildKernelWorld(root, {
    feature: { slug: 'sc2-layout', status: 'in-progress', docKinds: ['tasks'], seed: 'dsh-forge-m4-sc2' },
    tasks: [
      { stem: '1.1', localId: '1.1', title: 'sc2 layout task one', status: 'pending', type: 'coding.feature', dependencies: [] },
      { stem: '1.2', localId: '1.2', title: 'sc2 layout task two', status: 'pending', type: 'coding.feature', dependencies: [] },
    ],
  })
}

test('sc2/workbench-layout: three zones on one page (left tree seat + native conversation + rightbar container); knowledge zone carries zero empty placeholders', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)
  assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })

  const root = freshRoot('m4-sc2')
  const kernel = await sc2Kernel(root)
  let shell: PluginShell | undefined
  try {
    shell = await launchWorkbenchShell({ userDataDir: kernel.userDataDir, rootDir: kernel.root })
    const { page } = shell
    await shell.uiReady()
    await newSessionButton(page).waitFor({ state: 'visible', timeout: 30_000 })

    // ---- ① 三区同页 ------------------------------------------------------
    // 左栏:forge 项目树座位替换渲染(Integration #1 单槽 shadowing)。
    await expect(page.locator('[data-dsh-forge-project-seat]'),
      '左栏 = forge 项目树座位(sidebar.workspaces 替换渲染)').toBeVisible({ timeout: 30_000 })
    // 中间:原生会话面板(conversation 在座;forge main 面板不挂载)。
    await expect(page.locator('[data-dsh-forge-shell]'),
      '中间 = 原生 conversation(工作台即会话面板,无 forge main 挂载)').toHaveCount(0)
    await expect(newSessionButton(page), 'conversation 交互面在场(新建会话)').toBeVisible()
    // 右栏:原生 rightbar dockkit 容器(P2 forge tabs 的宿主;在场即可,
    // pane 内容断言留 2.10)。
    await expect(page.locator('[data-sidebar-right-panel]').first(),
      '右栏容器在场(原生 rightbar dockkit 面板根)').toBeAttached({ timeout: 30_000 })
    // 同页判据:三区同属一个 document 且互斥 main 面板无页级切换痕迹。
    const samePage = await page.evaluate(() => ({
      seat: document.querySelector('[data-dsh-forge-project-seat]') !== null,
      rightbar: document.querySelector('[data-sidebar-right-panel]') !== null,
      shell: document.querySelector('[data-dsh-forge-shell]') !== null,
    }))
    expect(samePage, '三区容器同 document 同页(seat + conversation + rightbar;无独立列表页)').toEqual({
      seat: true, rightbar: true, shell: false,
    })

    // ---- ② 知识区零空占位 ------------------------------------------------
    await expect(page.locator('[data-dsh-forge-tab]'),
      '零 forge tab 挂载(P2 右栏 tabs 未落地,不预置空 tab)').toHaveCount(0)
    await expect(page.locator('[data-dsh-forge-view]'),
      '零 forge 视图容器挂载(conversation 侧无 forge main 内景)').toHaveCount(0)
    // 唯一空态面 = 项目空态卡;激活项目后即消失(功能性引导,非占位)。
    await expect(page.locator('[data-dsh-forge-project-empty]'),
      '已注册激活后无空态引导卡(空态即消失,非常驻占位)').toHaveCount(0)
    await expect(page.locator('[data-dsh-forge-project-seat] [data-dsh-forge-tree-project]'),
      '左栏树呈现项目行(真实数据面,非预置占位)').toHaveCount(1)

    // ---- ③ 互斥 main 面板对照:逃生门 = overview 单页 ---------------------
    await workbenchRow(page).click()
    await expect(page.locator('[data-dsh-forge-shell]')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-dsh-forge-project-seat]'),
      '逃生门在座时左栏座位仍在(全局座位不随 main 面板切换)').toBeVisible()
    await expect(page.locator('[data-dsh-forge-shell] [data-dsh-forge-view]'),
      '逃生门内景 = 单容器(SC5 过渡载体单页收缩)').toHaveCount(1)

    expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
  } finally {
    if (shell !== undefined) await shell.close().catch(() => {})
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  }
})

test('sc2/empty-registry-layout: 空注册表下三区骨架同页 + 空态引导非常驻占位', async ({ }, testInfo) => {
  testInfo.setTimeout(240_000)
  assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })

  let shell: PluginShell | undefined
  try {
    shell = await launchWorkbenchShell({ userDataDir: freshUserDataDir('dsh-forge-m4-sc2-empty') })
    const { page } = shell
    await shell.uiReady()
    await newSessionButton(page).waitFor({ state: 'visible', timeout: 30_000 })

    // 空注册表:左栏座位 + 中间 conversation + 右栏容器骨架同页;空态引导
    // 卡在场且直达 C7(动作面,非空占位 —— 「知识区零空占位」的空注册表口径:
    // 引导卡承载真实动作,C7 打开即证)。
    await expect(page.locator('[data-dsh-forge-project-seat]')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-dsh-forge-project-empty]')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-sidebar-right-panel]').first()).toBeAttached({ timeout: 30_000 })
    await expect(page.locator('[data-dsh-forge-tab]'), '空注册表亦零空 tab').toHaveCount(0)
    await expect(page.locator('[data-dsh-forge-project-empty-add]'), '空态卡动作面在场(＋ → C7)').toBeVisible()
    expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
  } finally {
    if (shell !== undefined) await shell.close().catch(() => {})
  }
})
