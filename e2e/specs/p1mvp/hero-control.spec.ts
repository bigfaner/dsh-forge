// @feature:dsh-forge-p1-mvp @web-e2e
// fix-24 验收面：新会话输入框上方工作区控件 → 项目选择/切换控件（① 影子弹层列项目 +
// ② 注册时 workspace 标题对齐项目名——chip 文案免费显示项目名）。
//
// 断言面（任务 fix-24 验收 1/2/3/5）：
//   - AC1 多项目 + 未绑定账本行：弹层只列项目名（dsh 账本原生行不出现——假未绑定行 =
//     注册后删应用侧行留 dsh 工作区，WAL 活删同 fix-28 口径）；
//   - AC2 切换：点项目 → chip 显示所选项目名（= ② 标题对齐经真 workspaceController.rename
//     的端到端实证——官方 chip label 读 workspace.title）；重开弹层选中行随选高亮（✓ 记号）；
//   - AC3 「添加项目…」→ 产品注册流端到端（回退内嵌浏览器面：OS 对话框不可 e2e——
//     DSH_FORGE_DIRECTORY_PICKER=off，fix-14 口径）→ 注册完成新项目即入弹层、chip 可选；
//   - AC4（rename 幂等/补偿零残留）= core project-service 单测钉（本 spec 不重复注入面）。
// 隔离：独立 userData + 独立端口（e2e 单实例纪律——端口经 e2e/support 分配器，fix-37）。
// 载体面（launch/dismiss/close/RPC/db-seed）经 e2e/support（fix-37 支撑层）。
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { closeApp, launchHost } from '../../support/launch.js'
import { registerProject } from '../../support/rpc.js'
import { openStateDb, deleteProjectRowById } from '../../support/sqlite.js'
import { addProjectPhase, AP_ANY, COMPOSER_INPUT, WORKBENCH } from '../../support/anchors.js'
import { rmDirBestEffort } from '../../support/cleanup.js'

/** 工作区夹具根：{root}/<name> 三目录（alpha/beta 列表行 + gamma 未绑定行源） */
function makeFixtureRoot(names: readonly string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-hero-'))
  for (const name of names) {
    mkdirSync(join(root, name, '.knowledge'), { recursive: true })
    writeFileSync(join(root, name, 'fixture-file.txt'), 'sentinel', 'utf8')
  }
  return root
}

/** hero 控件交互面（fix-24 ①：chip = 官方 owner 触发器；弹层卡 = .dswf-hero-picker-list） ─── */

/** 官方 chip 触发器（aria-label 恒「选择工作区」——label 随选中态变，锚用 aria） */
function heroChip(page: Page): ReturnType<Page['locator']> {
  return page.locator('button[aria-label="选择工作区"]').first()
}

/** 影子弹层卡（Menu listClassName——portal 面锚） */
function heroMenu(page: Page) {
  return page.locator('.dswf-hero-picker-list')
}

/** 弹层行（文本精确匹配——防前缀碰撞） */
function menuItem(page: Page, label: string) {
  return heroMenu(page).locator('[role="menuitem"]', { hasText: new RegExp(`(?:^|\\s)${label}(?=\\s|$)`) })
}

/** 打开弹层并等待行集就绪（静默重拉落定：至少一行可见） */
async function openHeroMenu(page: Page): Promise<void> {
  const composer = page.locator(COMPOSER_INPUT).last()
  await expect(composer, '官方会话面 composer 在场（chip 宿主）').toBeVisible({ timeout: 60_000 })
  await expect(heroChip(page)).toBeVisible({ timeout: 30_000 })
  await heroChip(page).click()
  await expect(heroMenu(page), '影子弹层卡渲染（fix-24 ① Menu 复用）').toBeVisible({ timeout: 15_000 })
}

// ─────────────────────────────────────────────────────────────────────────────
// AC1 + AC2：弹层只列项目（未绑定账本行不出现）+ 切换 → chip 显示项目名 + 选中随选高亮
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp hero-control·AC1/AC2 弹层列项目 + 未绑定行不出现 + 切换对齐 chip 文案', async () => {
  test.setTimeout(300_000)
  const fixtureRoot = makeFixtureRoot(['proj-alpha', 'proj-beta', 'proj-gamma'])
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-hero-ud-'))
  const { app, page, pageErrors } = await launchHost({ userData, stablePhase: 'none' })
  try {
    // 前置：RPC 直注三项目 → gamma 删应用侧行（dsh 侧工作区留存 = 假未绑定账本行）
    await registerProject(page, join(fixtureRoot, 'proj-alpha'), 'proj-alpha')
    await registerProject(page, join(fixtureRoot, 'proj-beta'), 'proj-beta')
    const gamma = await registerProject(page, join(fixtureRoot, 'proj-gamma'), 'proj-gamma')
    const db = openStateDb(userData)
    deleteProjectRowById(db, gamma.id)
    db.close()
    await expect(page.locator(WORKBENCH)).toHaveAttribute('data-dswf-phase', 'session', { timeout: 30_000 })
    await page.waitForTimeout(3_000)

    // AC1：弹层只列项目名——alpha/beta 在列；未绑定行（gamma 留存工作区）不出现；
    // 隔离 home 的原生行（默认工作区等）不出现；「添加项目…」恒在（footer 入口）
    await openHeroMenu(page)
    await expect(menuItem(page, 'proj-alpha'), '项目行在列（行源 = forge 项目）').toBeVisible({ timeout: 15_000 })
    await expect(menuItem(page, 'proj-beta'), '项目行在列（多项目）').toBeVisible()
    await expect(menuItem(page, 'proj-gamma'), '未绑定账本行不出现（初版过滤口径被子集覆盖）').toHaveCount(0)
    await expect(menuItem(page, '默认工作区'), '原生工作区不出现').toHaveCount(0)
    await expect(menuItem(page, '添加项目…'), '添加入口恒在（footer）').toBeVisible()

    // AC2：切换到 beta —— chip 文案随选显示项目名（= ② 标题对齐经真 rename 链的端到端面：
    // 官方 chip label 读 workspace.title，注册链已 rename('proj-beta')）
    await menuItem(page, 'proj-beta').click()
    await expect(heroMenu(page)).toHaveCount(0, { timeout: 15_000 }) // 拾取即收
    await expect(heroChip(page)).toHaveText(/proj-beta/, { timeout: 30_000 })

    // 重开弹层：选中行随选高亮（✓ 记号 = 行内第二枚 svg：文件夹 + check）
    await openHeroMenu(page)
    const betaRow = menuItem(page, 'proj-beta')
    const alphaRow = menuItem(page, 'proj-alpha')
    await expect(betaRow.locator('svg'), '选中行带 ✓ 记号（selectedId 随选）').toHaveCount(2, { timeout: 15_000 })
    await expect(alphaRow.locator('svg'), '未选中行无 ✓ 记号').toHaveCount(1)
    await page.keyboard.press('Escape')

    // 会话面无回归：切换后新会话引导态在场（composer 恒可聚焦——官方 selectWorkspace 链零变化）
    await expect(page.locator(COMPOSER_INPUT).last()).toBeVisible()
    // 影子占用/拾取链零渲染期错误（fix-24 ① 注册面自证——官方件复用不炸 owner 树）
    expect(pageErrors, '页面零未捕获错误').toEqual([])
  } finally {
    await closeApp(app)
    await rmDirBestEffort(userData)
    await rmDirBestEffort(fixtureRoot)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// AC3：「添加项目…」→ 产品注册流端到端（OS 选取回退内嵌浏览器面）→ 新项目即入弹层、chip 可选
// （fix-37 ⑦：pageErrors 收集补终态断言——原死收集（解构后 void）转正为零错误断言）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp hero-control·AC3 「添加项目…」→ 注册流端到端 → 新项目入弹层 + chip 可选', async () => {
  test.setTimeout(300_000)
  const fixtureRoot = makeFixtureRoot(['hero-add-base', 'hero-add-new'])
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-hero-ud-'))
  const { app, page, pageErrors } = await launchHost({ userData, stablePhase: 'none' })
  try {
    // 前置：单项目（弹层行集非空——添加项在 footer 形态）
    await registerProject(page, join(fixtureRoot, 'hero-add-base'), 'hero-add-base')
    await expect(page.locator(WORKBENCH)).toHaveAttribute('data-dswf-phase', 'session', { timeout: 30_000 })
    await page.waitForTimeout(3_000)

    // 弹层 → footer「添加项目…」→ 产品注册流（回退内嵌浏览器面起步）
    await openHeroMenu(page)
    await expect(menuItem(page, 'hero-add-base')).toBeVisible({ timeout: 15_000 })
    await menuItem(page, '添加项目…').click()
    await expect(page.locator(addProjectPhase('browser')), '产品注册流打开（回退浏览器面）').toBeVisible({ timeout: 15_000 })

    // 段一：home → AppData → Local → Temp → 夹具根 → 选中 hero-add-new → 下一步
    const dirRow = (name: string) =>
      page.locator('.dswf-fb-item', { hasText: new RegExp(`(?:^|\\s)${name}(?=\\s|$|[^\\w.-])`) }).first()
    async function enterDir(name: string): Promise<void> {
      await dirRow(name).dblclick()
      await expect(page.locator('.dswf-fb-crumb-current')).toHaveText(name, { timeout: 15_000 })
    }
    for (const segment of ['AppData', 'Local', 'Temp']) await enterDir(segment)
    await enterDir(fixtureRoot.split('\\').at(-1) as string)
    await dirRow('hero-add-new').click()
    await page.locator('.dswf-fb-confirm', { hasText: '下一步' }).click()
    await expect(page.locator(addProjectPhase('form'))).toBeVisible()

    // 段二：默认值确认 → 注册 → 成功反馈 → 自动关闭
    await expect(page.locator('[data-dswf-rf-name]')).toHaveValue('hero-add-new')
    await page.locator('button', { hasText: /^确认$/ }).click()
    await expect(page.locator(addProjectPhase('executing')).or(page.locator(addProjectPhase('success'))).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.locator(AP_ANY)).toHaveCount(0, { timeout: 30_000 })

    // 收口：新项目即入弹层（静默重拉落定）→ 点选 → chip 显示新项目名
    await openHeroMenu(page)
    await expect(menuItem(page, 'hero-add-new'), '注册完成新项目即入弹层').toBeVisible({ timeout: 30_000 })
    await menuItem(page, 'hero-add-new').click()
    await expect(heroChip(page)).toHaveText(/hero-add-new/, { timeout: 30_000 })
    // fix-37 ⑦ 补断言：注册流端到端 + 影子拾取链零渲染期错误（原死收集转正）
    expect(pageErrors, '注册流端到端零渲染期错误（pageerror 面）').toEqual([])
  } finally {
    await closeApp(app)
    await rmDirBestEffort(userData)
    await rmDirBestEffort(fixtureRoot)
  }
})
