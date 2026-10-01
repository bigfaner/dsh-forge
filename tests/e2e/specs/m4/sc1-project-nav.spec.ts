// @feature dsh-forge-m4 | @web-e2e | @journey forge-m4-sc1
// Traceability: docs/features/dsh-forge-m4/tasks/1.8-e2e-migration-sc1-sc2.md (AC-3)
// Authorities: tech-design §Testing Strategy·Key Test Scenarios (SC1)、prd-spec
// §Success Criteria SC1 + §导航迁移清单与切换策略(必答② 七行表 + 孤儿视图
// 清零清单)、design/page-map.md(视图键寻址口径:元素与状态,非 URL)。
//
// SC1 — 项目一级导航(启动首屏/panellist「项目」/孤儿视图清零):
//
//   ① 启动首屏 = 工作台恢复活跃项目:真内核语料(注册+迁移)启动 → boot
//      落 conversation(裁决 #26,normalizeBootDefaultView 把 M2 的 persisted
//      workbench 视图归一为 session);活跃项目指针恢复 —— 左栏 forge 项目树
//      行 aria-current=true + getState().activeProjectId === 语料注册行;
//   ② panellist「项目」行:在场 + 首项(order -100,先于 插件/工作台 两行,
//      Integration #4);点击 = selectPanel(null) → 原生 conversation(与
//      page-map View Key 逐字一致);选中态 = activePanelId === null;
//   ③ 孤儿视图清零:retired TabBar 面零残留([data-dsh-forge-tab] 全页 0)、
//      retired 三视图容器(tasks/features/proposals)全页 0、降级 rail 不在
//      场(slot 路径 live);逃生门(workbench main 面板)收缩为 overview 单页
//      —— 唯一内景容器 = dsh-forge-view-overview;
//   ④ 持久化退役键重启腿:手工植入 M2/M3 形状的 stale 视图键
//      {view:'workbench', workbenchTab:'workbench/tasks'} → 同 userData 重启
//      → boot 仍落 conversation(retire-in-place 水合归一 + 启动首屏归一,
//      1.7 view-key.spec 单元契约的真链路面);
//   ⑤ 空注册表腿:C7 确认卡为添加项目唯一入口(迁移清单第 5 行「三区位置
//      选择器」的 P1 在场面)—— 空态引导卡 + [＋] 同开一张卡
//      ([data-dsh-forge-confirm-code])。
//
// 实例锁纪律(Hard Rule):每次 launch 前 assertNoActiveDshForgeInstances。

import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { assertNoActiveDshForgeInstances } from '../../helpers/instance-lock.ts'
import { freshUserDataDir, launchWorkbenchShell } from '../../helpers/app.ts'
import {
  buildKernelWorld, freshRoot, type KernelWorld,
} from '../_lib/journey-world.ts'
import type { PluginShell } from '../../../../apps/desktop/e2e/helpers/plugins.ts'

// ---------------------------------------------------------------------------
// Locators: the M4 project-center faces (page-map 寻址口径 = 元素与状态)
// ---------------------------------------------------------------------------

/** The upstream sidebar's workbench escape-door row (order 10, untouched M1 row). */
const workbenchRow = (page: Page) =>
  page.getByRole('button', { name: /^工作台$|^Workbench$/ }).first()

/** The panellist「项目」row (Integration #4: order -100 首项, null 寻址). */
const projectRow = (page: Page) =>
  page.locator('[aria-label="项目"], [aria-label="Project"]').first()

/** The conversation-ready signal (the native new-session surface). */
const newSessionButton = (page: Page) =>
  page.getByRole('button', { name: /新建会话|New Session/ }).first()

/**
 * The boot-bounce-tolerant escape-door switch (the 3.3 pattern): the upstream
 * home-scoped session list hydrates seconds after ui-ready and its navigation
 * ends in selectPanel(null), deselecting a panel chosen too early — retry
 * until the shell STAYS mounted.
 */
async function switchToEscapeDoor(page: Page): Promise<void> {
  const shellPanel = page.locator('[data-dsh-forge-shell]')
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await workbenchRow(page).click()
    const mounted = await shellPanel.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false)
    if (mounted) {
      await page.waitForTimeout(2_500)
      if (await shellPanel.count() > 0) return
    }
  }
  throw new Error('workbench selection never settled (boot session-restore keeps deselecting it)')
}

/** The in-page preload-bridge verb dispatcher (one evaluate per call). */
async function bridgeInvoke<T>(page: Page, verb: string, args: readonly unknown[]): Promise<T> {
  return await page.evaluate(async (input: { verb: string; args: unknown[] }) => {
    const bridge = (globalThis as { dshForge?: { workbench?: Record<string, (...invoke: unknown[]) => Promise<unknown>> } }).dshForge?.workbench
    if (bridge === undefined || typeof bridge[input.verb] !== 'function') {
      throw new Error(`dshForge.workbench.${input.verb} unavailable in the e2e renderer`)
    }
    return await bridge[input.verb](...input.args)
  }, { verb, args })
}

/** The SC1 kernel corpus: one feature, three tasks (registered + migrated rows). */
function sc1Kernel(root: string): Promise<KernelWorld> {
  return buildKernelWorld(root, {
    feature: { slug: 'sc1-nav', status: 'in-progress', docKinds: ['tasks'], seed: 'dsh-forge-m4-sc1' },
    tasks: [
      { stem: '1.1', localId: '1.1', title: 'sc1 nav task one', status: 'pending', type: 'coding.feature', dependencies: [] },
      { stem: '1.2', localId: '1.2', title: 'sc1 nav task two', status: 'pending', type: 'coding.feature', dependencies: [] },
      { stem: '1.3', localId: '1.3', title: 'sc1 nav task three', status: 'pending', type: 'coding.feature', dependencies: [] },
    ],
  })
}

// ---------------------------------------------------------------------------
// SC1 legs
// ---------------------------------------------------------------------------

test('sc1/project-nav: boot lands conversation + active project restored + panellist「项目」first + orphan views zero', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)
  assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })

  const root = freshRoot('m4-sc1')
  const kernel = await sc1Kernel(root)
  let shell: PluginShell | undefined
  try {
    // ---- Boot ①:启动首屏 = conversation(恢复活跃项目)--------------------
    shell = await launchWorkbenchShell({ userDataDir: kernel.userDataDir, rootDir: kernel.root })
    const { page } = shell
    await shell.uiReady()

    // 显式激活走用户径 = 左栏树行点击(原位换台 #28 的指针写;seat 乐观先行)。
    // (裸 activateProject 动词是列表外指针写,不发 project_list_changed ——
    // 树的活跃标记以 UI 写径为准,这正是换台契约的行为面。)
    const treeRow = page.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`)
    await expect(treeRow, '注册行在树在场(boot 读数)').toBeVisible({ timeout: 30_000 })
    await treeRow.click()
    await expect(treeRow, '激活后左栏项目行 aria-current(树行语言)').toHaveAttribute('aria-current', 'true', { timeout: 15_000 })

    // ---- ② panellist「项目」行:在场 + 首项 -------------------------------
    const row = projectRow(page)
    await expect(row).toBeAttached({ timeout: 15_000 })
    const nav = row.locator('xpath=ancestor::nav[1]')
    const labels = await nav.locator('button').evaluateAll(buttons =>
      buttons.map(button => button.getAttribute('aria-label') ?? ''))
    const projectIndex = labels.findIndex(label => label === '项目' || label === 'Project')
    expect(projectIndex, `「项目」行为 panellist 首项(order -100;实际序 = ${JSON.stringify(labels)}`).toBe(0)

    // ---- ③ 孤儿视图清零(conversation 在座时)----------------------------
    await newSessionButton(page).waitFor({ state: 'visible', timeout: 30_000 })
    await expect(page.locator('[data-dsh-forge-shell]'), '启动首屏 = conversation(无 workbench 面板)').toHaveCount(0)
    await expect(page.locator('[data-dsh-forge-tab]'), 'retired TabBar 面零残留(孤儿清零 ①)').toHaveCount(0)
    for (const retired of ['tasks', 'features', 'proposals'] as const) {
      await expect(page.locator(`[data-dsh-forge-view="dsh-forge-view-${retired}"]`),
        `retired 容器 dsh-forge-view-${retired} 全页零挂载(孤儿清零 ②)`).toHaveCount(0)
    }
    await expect(page.locator('[data-dsh-forge-rail]'), '降级 rail 不在场(slot 路径 live)').toHaveCount(0)

    // ---- 逃生门可达 + 收缩为 overview 单页(孤儿清零 ③)------------------
    await switchToEscapeDoor(page)
    await expect(workbenchRow(page)).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]'),
      '逃生门唯一内景 = overview 单页容器').toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-dsh-forge-shell] [data-dsh-forge-view]'),
      '逃生门内景恰一个挂载容器(单页收缩)').toHaveCount(1)
    await expect(page.locator('[data-dsh-forge-tab]'), '逃生门内零 tab(单页收缩,孤儿清零)').toHaveCount(0)

    // ---- 「项目」行点击 = selectPanel(null) → conversation 原位 -----------
    await projectRow(page).click()
    await expect(page.locator('[data-dsh-forge-shell]'), '项目行点击回 conversation(shell 卸载)').toHaveCount(0, { timeout: 15_000 })
    await expect(projectRow(page), '项目行选中态(activePanelId === null)').toHaveAttribute('aria-current', 'page')
    await expect(workbenchRow(page)).not.toHaveAttribute('aria-current', 'page')

    // 活跃项目指针经 boot 恢复后仍在座(树行语言自绘,指针读数对拍)。
    const state = await bridgeInvoke<{ activeProjectId: string | null }>(page, 'getState', [])
    expect(state.activeProjectId, '活跃项目指针 = 语料注册行').toBe(kernel.projectId)

    // ---- ④ 持久化退役键重启腿:stale M2/M3 视图键 → boot 仍落 conversation -
    await page.evaluate(() => {
      localStorage.setItem('dsh.forge.workbench.view', JSON.stringify({ view: 'workbench', workbenchTab: 'workbench/tasks' }))
    })
    const persisted = await page.evaluate(() => localStorage.getItem('dsh.forge.workbench.view'))
    expect(JSON.parse(persisted ?? 'null'), '植入 stale 退役键(M2/M3 会话形状)').toEqual({ view: 'workbench', workbenchTab: 'workbench/tasks' })
    const rootDir = shell.dir
    const userDataDir = shell.userDataDir
    await shell.close()
    shell = undefined

    assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })
    const reborn = await launchWorkbenchShell({ userDataDir, rootDir })
    shell = reborn
    try {
      await reborn.uiReady()
      await newSessionButton(reborn.page).waitFor({ state: 'visible', timeout: 30_000 })
      await expect(reborn.page.locator('[data-dsh-forge-shell]'),
        'stale workbench 键重启仍落 conversation(启动首屏归一,裁决 #26)').toHaveCount(0, { timeout: 15_000 })
      await expect(reborn.page.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`),
        '重启后活跃项目恢复(指针持久 + 树行 aria-current)').toHaveAttribute('aria-current', 'true', { timeout: 15_000 })
      const state2 = await bridgeInvoke<{ activeProjectId: string | null }>(reborn.page, 'getState', [])
      expect(state2.activeProjectId, '重启后指针读数 = 语料注册行').toBe(kernel.projectId)
      await expect(reborn.page.locator('[data-dsh-forge-tab]'), '重启后 retired tab 面零复活').toHaveCount(0)
      expect(reborn.pageErrors, `renderer pageerrors: ${reborn.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await reborn.close()
      shell = undefined
    }
  } finally {
    if (shell !== undefined) await shell.close().catch(() => {})
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  }
})

test('sc1/empty-registry: conversation 空态引导 + C7 确认卡为唯一添加入口', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)
  assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })

  // 裸目录(code 区无 forge 树/无 .git → 证据第三档「应用管理主路径」默认可提)。
  const root = freshRoot('m4-sc1-empty')
  const codeRoot = join(root, 'proj-alpha')
  mkdirSync(codeRoot, { recursive: true })

  let shell: PluginShell | undefined
  try {
    shell = await launchWorkbenchShell({ userDataDir: freshUserDataDir('dsh-forge-m4-sc1-empty'), rootDir: root })
    const { page } = shell
    await shell.uiReady()

    // 空注册表 → conversation 空态引导卡(非空占位:动作面直达 C7)。
    await expect(page.locator('[data-dsh-forge-project-empty]'), '空态引导卡在场(空注册表)').toBeVisible({ timeout: 30_000 })
    await page.locator('[data-dsh-forge-project-empty-add]').click()
    await expect(page.locator('[data-dsh-forge-confirm-code]'), '引导卡 [＋] 打开 C7 确认卡(唯一入口,清单第 5 行)').toBeVisible({ timeout: 15_000 })

    // 经 C7 完成首个注册(应用管理主路径):代码区唯一必答,提交即原位生效。
    await page.locator('[data-dsh-forge-confirm-code]').fill(codeRoot)
    await page.locator('[data-dsh-forge-confirm-submit]').click()
    await expect(page.locator('[data-dsh-forge-project-toast]'), '注册落位 toast(指针切换 + 原位生效)').toBeVisible({ timeout: 20_000 })
    await expect(page.locator('[data-dsh-forge-tree-project]'), '注册后左栏树呈现项目行(空态让位)').toHaveCount(1, { timeout: 20_000 })
    await expect(page.locator('[data-dsh-forge-project-empty]'), '空态引导卡即消失(非常驻占位)').toHaveCount(0, { timeout: 15_000 })

    // 树区头 [＋] 同开同一张 C7 卡(非空注册表下的唯一添加入口)。
    await page.locator('[data-dsh-forge-tree-add-btn]').click()
    await expect(page.locator('[data-dsh-forge-confirm-code]'), '树区头 [＋] 同开同一张 C7 卡').toBeVisible({ timeout: 15_000 })

    // retired M2/M3 注册向导不再从全局 chrome 可达(孤儿清零:旧入口面零残留)。
    await expect(page.locator('[data-dsh-forge-add-project]'), 'retired TopBar 添加项目入口零残留').toHaveCount(0)
    await expect(page.locator('[data-dsh-forge-switcher-trigger]'), 'retired ProjectSwitcher 零残留').toHaveCount(0)
    expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
  } finally {
    if (shell !== undefined) await shell.close().catch(() => {})
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  }
})
