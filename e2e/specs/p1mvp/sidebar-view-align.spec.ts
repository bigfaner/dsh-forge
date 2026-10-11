// @feature:dsh-forge-p1-mvp @web-e2e
// fix-42：侧栏项目列表/树对齐原生 dsh 工作区（WorkspaceBrowser 母本）——e2e 行为面。
// 单测已钉：视图投影纯函数（sidebar-model.test）、行语言静态面（ForgeWorkspacePanel.test）、
// 菜单项数据面（SIDEBAR_VIEW_MENU_ITEMS/projectMenuItemsOf）。本 spec 承载开弹层/壳回调
// 面（官方 Menu/Modal portal 静态不可渲染——fix-24 同裁）：
//   1. rail 图标列（fix-42 空轨道退役）：收起态搜索钮/「＋」随轨在场（DOM 在场
//      断言——Windows titlebar 模式收起态 .regionArea 整域 display:none 系 fix-40 官方
//      壳设计，官方 WorkspaceBrowser rail 同域同藏；点击展开行为归单测钉 + 非 titlebar
//      形态消费）；项目 folder 图标列 2026-10-11 用户裁决退役（「收起的左侧栏多了一个
//      dsh-forge 图标按钮，功能跟第一个图标一样，移除」——负向断言钉零回归）；
//   2. 新会话钮（AC2 行尾动作）：官方 startSession(workspaceId) 链路——盘侧 session 目录
//      增生实证（installer-smoke fixtureSessionEvents 同径）。blank 行入侧栏树需 workspace
//      成员传播 + 选中态（fresh blank 仅选中者可见——官方口径），零凭据 e2e 面以盘侧增生
//      为断言（行显示面归 dogfood 台账，fix-42 任务文件记边界）；
//   3. 视图菜单实装（AC2）：groupBy 平铺切换（段头标签 + 平铺容器）+ archivedFilter 三态
//      （归档切换走真实 ellipsis 菜单动作——RPC + 静默重拉链一并覆盖；D41-① 后缺省 = hide，
//      归档行落地即离场——弱化标记改经「仅归档」视图在场面断言）；
//   4. 项目改名：ellipsis 改名 → 官方 Modal → RPC → 行标题更新。
// 载体面（launch/close/RPC/清理）经 e2e/support（fix-37 ①）；每测试独立 boot（dismiss
// 毒化纪律——单 boot 单测试）。
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { closeApp, launchHost } from '../../support/launch.js'
import { registerProject } from '../../support/rpc.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import {
  NAV_ADD_PROJECT,
  RAIL_PROJECT_ANY,
  RENAME_INPUT,
  SIDEBAR_COLLAPSE_BUTTON,
  SIDEBAR_EXPAND_BUTTON,
  SIDEBAR_FLATLIST,
  projectActionOf,
  projectRowOf,
  sidebarOf,
} from '../../support/anchors.js'

/** 工作区夹具目录（{root}/<name>——注册链承接 canonical 化） */
function makeWorkspaceFixture(name: string): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-sva-'))
  mkdirSync(join(root, name, '.knowledge'), { recursive: true })
  writeFileSync(join(root, name, 'fixture-file.txt'), 'sentinel', 'utf8')
  return root
}

/** dsh-home 会话目录台账（盘侧——官方 startSession 增生断言面） */
function sessionDirIds(userData: string): readonly string[] {
  const base = join(userData, 'dsh-home', 'sessions')
  try {
    const out: string[] = []
    for (const sanitized of readdirSync(base)) {
      for (const entry of readdirSync(join(base, sanitized))) out.push(entry)
    }
    return out
  } catch {
    return []
  }
}

/** 视图菜单项点击厂（portal 菜单 [role=menu] 内按文案过滤——selectWorkspaceViaChip 同径） */
async function pickViewMenuItem(page: Page, text: string): Promise<void> {
  await page.locator('[data-dswf-view-menu]').first().click()
  const menu = page.locator('[role="menu"]').first()
  await expect(menu, '视图选项菜单开（portal）').toBeVisible({ timeout: 10_000 })
  const item = menu
    .locator('button, [role="menuitem"], [role="menuitemradio"], [role="option"]')
    .filter({ hasText: text })
    .first()
  await expect(item, `菜单项在列（${text}）`).toBeVisible({ timeout: 10_000 })
  await item.click()
  await expect(menu, '选择后菜单收').toBeHidden({ timeout: 10_000 })
}

test('@web-e2e @p1mvp sidebar-view-align·rail 图标列：搜索/＋在轨（项目 folder 图标列退役）', async () => {
  test.setTimeout(240_000)
  const root = makeWorkspaceFixture('甲')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-sva-ud-'))
  const { app, page } = await launchHost({ userData })
  try {
    const project = await registerProject(page, join(root, '甲'), '甲项目')
    await expect(page.locator(projectRowOf(project.id)), '宽态项目行在场').toBeVisible({ timeout: 30_000 })

    // 收起 → rail：搜索钮 + 「＋」在轨；项目 folder 图标列退役（2026-10-11 用户裁决
    // 「收起的左侧栏多了一个 dsh-forge 图标按钮，功能跟第一个图标一样，移除」——
    // 图标点击 = 展开侧栏 + 选中项目首会话，收起态可见效果与轨首展开钮重复）。
    // 几何边界（fix-40 官方壳设计）：Windows titlebar 模式收起态 .regionArea 整域
    // display:none（官方 WorkspaceBrowser rail 同域同藏——官方平价）——e2e 台（win
    // titlebar 形态）以 DOM 在场（toBeAttached）为断言面；图标点击/搜索径展开 = 壳
    // 供几何时的行为（非 titlebar 形态），交互面归单测钉（SidebarRail 静态渲染）。
    await page.locator(SIDEBAR_COLLAPSE_BUTTON).first().click()
    const rail = page.locator(sidebarOf('rail'))
    await expect(rail, 'rail 分支在场（wide=false 透传）').toBeAttached({ timeout: 15_000 })
    await expect(page.locator(RAIL_PROJECT_ANY), 'rail 项目 folder 图标退役（2026-10-11 用户裁决）').toHaveCount(0)
    await expect(page.locator(`${sidebarOf('rail')} [data-dswf-search-toggle]`), 'rail 搜索钮在轨').toBeAttached()
    await expect(page.locator(`${sidebarOf('rail')} ${NAV_ADD_PROJECT}`), 'rail「＋」在轨').toBeAttached()
    // rail 态不渲染宽态内容（零会话行/项目块）
    await expect(page.locator(`${sidebarOf('rail')} [data-dswf-session]`)).toHaveCount(0)
    await expect(page.locator(`${sidebarOf('rail')} [data-dswf-project]`)).toHaveCount(0)

    // 展开往返收口（官方 toggle——Step1b 同径保底，宽态恢复完整导航）
    await page.locator(SIDEBAR_EXPAND_BUTTON).first().click()
    await expect(page.locator(sidebarOf('wide'))).toBeVisible({ timeout: 15_000 })
    await expect(page.locator(projectRowOf(project.id)), '展开恢复项目行').toBeVisible({ timeout: 15_000 })
  } finally {
    await closeApp(app)
    await rmDirBestEffort(userData)
    await rmDirBestEffort(root)
  }
})

test('@web-e2e @p1mvp sidebar-view-align·行尾新会话钮：官方 startSession(workspaceId) 链（盘侧会话增生）', async () => {
  test.setTimeout(240_000)
  const root = makeWorkspaceFixture('乙')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-sva-ud-'))
  const { app, page } = await launchHost({ userData })
  try {
    const project = await registerProject(page, join(root, '乙'), '乙项目')
    await expect(page.locator(projectRowOf(project.id))).toBeVisible({ timeout: 30_000 })
    const before = sessionDirIds(userData)

    // 行尾动作 = hover 呈现（官方 rowActions 同型），先悬停行再点钮
    await page.locator(projectRowOf(project.id)).hover()
    await page.locator(`${projectRowOf(project.id)} ${projectActionOf('new-session')}`).click()
    await expect
      .poll(async () => sessionDirIds(userData).length, { timeout: 30_000 })
      .toBeGreaterThan(before.length)
    // blank 行入树需 workspace 成员传播 + 选中态（官方「仅选中 blank 可见」口径）——
    // 行显示面归 dogfood 台账（任务文件记边界），零凭据面以盘侧增生收口
  } finally {
    await closeApp(app)
    await rmDirBestEffort(userData)
    await rmDirBestEffort(root)
  }
})

test('@web-e2e @p1mvp sidebar-view-align·视图菜单实装：平铺切换 + 归档过滤三态（ellipsis 归档动作真实链）', async () => {
  test.setTimeout(240_000)
  const root = makeWorkspaceFixture('丙')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-sva-ud-'))
  const { app, page } = await launchHost({ userData })
  try {
    const active = await registerProject(page, join(root, '丙', '一'), '丙项目')
    const old = await registerProject(page, join(root, '丙', '二'), '丙旧档')
    await expect(page.locator(projectRowOf(active.id))).toBeVisible({ timeout: 30_000 })
    await expect(page.locator(projectRowOf(old.id))).toBeVisible({ timeout: 30_000 })

    // 归档切换走真实 ellipsis 菜单动作（RPC update + 静默重拉一并覆盖）——hover 呈现行尾动作
    await page.locator(projectRowOf(old.id)).hover()
    await page.locator(`${projectRowOf(old.id)} ${projectActionOf('menu')}`).click()
    const menu = page.locator('[role="menu"]').first()
    await expect(menu).toBeVisible({ timeout: 10_000 })
    await menu
      .locator('button, [role="menuitem"], [role="menuitemradio"], [role="option"]')
      .filter({ hasText: '归档项目' })
      .first()
      .click()
    // D41-①（2026-10-10 用户裁决）：归档项目缺省隐藏（SIDEBAR_VIEW_DEFAULT.archivedFilter
    // = hide）——RPC 落地 + 静默重拉后归档行直接离场；弱化标记改经「仅归档」视图断言（见下）
    await expect(page.locator(projectRowOf(old.id)), 'D41-① 归档缺省隐藏（RPC 落地 + 静默重拉）').toHaveCount(0, {
      timeout: 15_000,
    })

    // groupBy=flat：段头标签切换 + 平铺容器在场（零会话态 = 空容器——行投影归单测）
    await pickViewMenuItem(page, '平铺')
    await expect(page.locator('.dswf-sidebar-sectionlabel'), '段头标签随 groupBy 切换（会话）').toHaveText('会话')
    await expect(page.locator(SIDEBAR_FLATLIST), '平铺容器在场').toBeAttached({ timeout: 10_000 })
    await expect(page.locator('[data-dswf-project]'), '平铺态无项目块').toHaveCount(0)
    await pickViewMenuItem(page, '按项目树')
    await expect(page.locator(projectRowOf(active.id)), '回树形（菜单往返）').toBeVisible({ timeout: 10_000 })

    // archivedFilter：不含归档 = 归档行离场；仅归档 = 只剩归档行
    await pickViewMenuItem(page, '不含归档')
    await expect(page.locator(projectRowOf(active.id))).toBeVisible({ timeout: 10_000 })
    await expect(page.locator(projectRowOf(old.id)), '不含归档：归档项目离场').toHaveCount(0)
    await pickViewMenuItem(page, '仅归档')
    await expect(page.locator(projectRowOf(old.id)), '仅归档：归档项目在场').toBeVisible({ timeout: 10_000 })
    await expect(
      page.locator(`${projectRowOf(old.id)}[data-archived]`),
      '归档弱化标记（仅归档视图在场面——D41-① 后弱化标记唯一可见口径）',
    ).toBeVisible()
    await expect(page.locator(projectRowOf(active.id)), '仅归档：活跃项目离场').toHaveCount(0)
  } finally {
    await closeApp(app)
    await rmDirBestEffort(userData)
    await rmDirBestEffort(root)
  }
})

test('@web-e2e @p1mvp sidebar-view-align·项目改名：ellipsis 改名 → Modal → RPC → 行标题更新', async () => {
  test.setTimeout(240_000)
  const root = makeWorkspaceFixture('丁')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-sva-ud-'))
  const { app, page } = await launchHost({ userData })
  try {
    const project = await registerProject(page, join(root, '丁'), '丁项目')
    await expect(page.locator(projectRowOf(project.id))).toBeVisible({ timeout: 30_000 })

    await page.locator(projectRowOf(project.id)).hover()
    await page.locator(`${projectRowOf(project.id)} ${projectActionOf('menu')}`).click()
    const menu = page.locator('[role="menu"]').first()
    await expect(menu).toBeVisible({ timeout: 10_000 })
    await menu
      .locator('button, [role="menuitem"], [role="menuitemradio"], [role="option"]')
      .filter({ hasText: '改名' })
      .first()
      .click()
    const input = page.locator(RENAME_INPUT)
    await expect(input, '改名模态开（官方 Modal——fix-42 改名面）').toBeVisible({ timeout: 10_000 })
    await input.fill('丁项目新名')
    await page.locator('[role="dialog"] button', { hasText: /^改名$/ }).click()
    await expect(input, '确认后模态收').toBeHidden({ timeout: 10_000 })
    await expect(
      page.locator(`${projectRowOf(project.id)} .dswf-sidebar-project-title`),
      '行标题更新（RPC update + 静默重拉）',
    ).toHaveText('丁项目新名', { timeout: 15_000 })
  } finally {
    await closeApp(app)
    await rmDirBestEffort(userData)
    await rmDirBestEffort(root)
  }
})
