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
// 隔离：独立 userData + 独立端口（e2e 单实例纪律，沿既有 specs）。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..', '..')
const HOST_DIR = join(ROOT, 'apps', 'host')

const electronBinary = createRequire(join(HOST_DIR, 'package.json'))('electron') as unknown as string

/** 工作区夹具根：{root}/<name> 三目录（alpha/beta 列表行 + gamma 未绑定行源） */
function makeFixtureRoot(names: readonly string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-hero-'))
  for (const name of names) {
    mkdirSync(join(root, name, '.knowledge'), { recursive: true })
    writeFileSync(join(root, name, 'fixture-file.txt'), 'sentinel', 'utf8')
  }
  return root
}

/** 运行期模态收起（API Key onboarding「稍后配置」——project-registration.spec 同源） */
async function dismissOnboardingModals(page: Page): Promise<void> {
  const deadline = Date.now() + 30_000
  for (let dismissed = 0; dismissed < 3; dismissed++) {
    const dismissButton = page.locator('[role="dialog"] button', { hasText: /^稍后配置$/ }).first()
    while (!(await dismissButton.isVisible().catch(() => false))) {
      if (Date.now() > deadline) return
      await page.waitForTimeout(500)
    }
    await dismissButton.click({ timeout: 10_000 })
    await page.waitForTimeout(1_000)
  }
}

let bootSeq = 0

interface Launched {
  readonly app: ElectronApplication
  readonly page: Page
  readonly userData: string
  readonly pageErrors: string[]
}

/** 启动薄宿主走完就绪链 + 相位稳定（phase hero 起步——项目由 RPC 前置注入后翻 session） */
async function launchReady(): Promise<Launched> {
  const { _electron } = await import('@playwright/test')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-hero-ud-'))
  const app = await _electron.launch({
    executablePath: electronBinary,
    args: ['.'],
    cwd: HOST_DIR,
    env: {
      ...process.env,
      DSH_FORGE_DEV_PROFILE: 'dev',
      DSH_FORGE_USER_DATA: userData,
      DSH_FORGE_PORT: String(19860 + (process.pid % 120) + (bootSeq++ % 20)),
      DSH_FORGE_DIRECTORY_PICKER: 'off', // fix-14：回退内嵌浏览器面（OS 对话框不可 e2e）
    } as Record<string, string>,
  })
  const page = await app.firstWindow()
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))
  await page.waitForFunction(
    () => (globalThis as { __DSH_BOOT_READY__?: unknown }).__DSH_BOOT_READY__ !== undefined,
    undefined,
    { timeout: 60_000 },
  )
  await page.waitForFunction(
    () => {
      const g = globalThis as { __ModuleLoader__?: { mode: string }; __DSH_FORGE_CLIENT__?: unknown }
      return g.__ModuleLoader__?.mode === 'live' && g.__DSH_FORGE_CLIENT__ !== undefined
    },
    undefined,
    { timeout: 90_000 },
  )
  await expect(page.locator('[data-dswf-workbench]').first()).toBeVisible({ timeout: 60_000 })
  await dismissOnboardingModals(page)
  return { app, page, userData, pageErrors }
}

/** 关闭宿主并等待主进程退出（句柄/端口复用竞态防护——既有 specs 同源） */
async function closeApp(app: ElectronApplication): Promise<void> {
  const proc = app.process()
  await app.close().catch(() => undefined)
  if (proc.exitCode === null) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 10_000)
      proc.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }
  await new Promise((resolve) => setTimeout(resolve, 2_000))
}

/** renderer forge RPC 面（preload dshForge.invoke——信封 {ok,data} 由调用侧解包） */
async function forgeInvoke<T>(page: Page, channel: string, payload?: unknown): Promise<T> {
  const data = await page.evaluate(async ({ ch, args }) => {
    const forge = (globalThis as { dshForge?: { invoke(c: string, p?: unknown): Promise<{ ok: boolean; data?: unknown; message?: string }> } }).dshForge
    if (forge === undefined) throw new Error('dshForge preload 面缺席')
    const envelope = await forge.invoke(ch, args)
    if (!envelope.ok) throw new Error(`forge RPC ${ch} 失败：${JSON.stringify(envelope)}`)
    return envelope.data
  }, { ch: channel, args: payload })
  return data as T
}

interface ProjectSummaryLike {
  readonly id: string
  readonly workspaceId: string
  readonly name: string
  readonly wsPath: string
}

/** RPC 直注注册（输入同表单面——workspaceDir canonical 化由注册链承接） */
async function registerProject(page: Page, dir: string, name: string): Promise<ProjectSummaryLike> {
  const result = await forgeInvoke<{ projectId: string }>(page, 'forge:projects/register', {
    workspaceDir: dir,
    name,
    forgeDir: `${dir}\\.forge`,
    knowledgeDir: `${dir}\\.knowledge`,
  })
  const projects = await forgeInvoke<readonly ProjectSummaryLike[]>(page, 'forge:projects/list')
  return projects.find((p) => p.id === result.projectId)!
}

// ── better-sqlite3 最小结构面（假未绑定账本行注入：删应用侧行保 dsh 侧工作区） ───
interface MinimalStmt {
  get(...args: unknown[]): unknown
  all(...args: unknown[]): unknown[]
  run(...args: unknown[]): unknown
}
interface MinimalDb {
  prepare(sql: string): MinimalStmt
  pragma(source: string): unknown
  close(): unknown
}
const requireFromCore = createRequire(join(ROOT, 'packages', 'core', 'package.json'))
type SqliteCtor = new (path: string) => MinimalDb
const openStateDb = (userData: string): MinimalDb =>
  new (requireFromCore('better-sqlite3') as SqliteCtor)(join(userData, 'state.db'))

// ── hero 控件交互面（fix-24 ①：chip = 官方 owner 触发器；弹层卡 = .dswf-hero-picker-list） ───

/** 官方 chip 触发器（aria-label 恒「选择工作区」——label 随选中态变，锚用 aria） */
function heroChip(page: Page): ReturnType<Page['locator']> {
  return page.locator('button[aria-label="选择工作区"]').first()
}

/** 影子弹层卡（Menu listClassName——portal 面锚） */
function heroMenu(page: Page): ReturnType<Page['locator']> {
  return page.locator('.dswf-hero-picker-list')
}

/** 弹层行（文本精确匹配——防前缀碰撞） */
function menuItem(page: Page, label: string): ReturnType<Page['locator']> {
  return heroMenu(page).locator('[role="menuitem"]', { hasText: new RegExp(`(?:^|\\s)${label}(?=\\s|$)`) })
}

/** 打开弹层并等待行集就绪（静默重拉落定：至少一行可见） */
async function openHeroMenu(page: Page): Promise<void> {
  const composer = page.locator('[data-composer-input]').last()
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
  const { app, page, userData, pageErrors } = await launchReady()
  try {
    // 前置：RPC 直注三项目 → gamma 删应用侧行（dsh 侧工作区留存 = 假未绑定账本行）
    await registerProject(page, join(fixtureRoot, 'proj-alpha'), 'proj-alpha')
    await registerProject(page, join(fixtureRoot, 'proj-beta'), 'proj-beta')
    const gamma = await registerProject(page, join(fixtureRoot, 'proj-gamma'), 'proj-gamma')
    const db = openStateDb(userData)
    db.prepare('DELETE FROM projects WHERE id = ?').run(gamma.id)
    db.close()
    await expect(page.locator('[data-dswf-workbench]')).toHaveAttribute('data-dswf-phase', 'session', { timeout: 30_000 })
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
    await expect(page.locator('[data-composer-input]').last()).toBeVisible()
    // 影子占用/拾取链零渲染期错误（fix-24 ① 注册面自证——官方件复用不炸 owner 树）
    expect(pageErrors, '页面零未捕获错误').toEqual([])
  } finally {
    await closeApp(app)
    for (const dir of [userData, fixtureRoot]) {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
      } catch {
        // 残留兜底（句柄长期占用）——不掩盖用例结论
      }
    }
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// AC3：「添加项目…」→ 产品注册流端到端（OS 选取回退内嵌浏览器面）→ 新项目即入弹层、chip 可选
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp hero-control·AC3 「添加项目…」→ 注册流端到端 → 新项目入弹层 + chip 可选', async () => {
  test.setTimeout(300_000)
  const fixtureRoot = makeFixtureRoot(['hero-add-base', 'hero-add-new'])
  const { app, page, userData, pageErrors: _pageErrors } = await launchReady()
  void _pageErrors
  try {
    // 前置：单项目（弹层行集非空——添加项在 footer 形态）
    await registerProject(page, join(fixtureRoot, 'hero-add-base'), 'hero-add-base')
    await expect(page.locator('[data-dswf-workbench]')).toHaveAttribute('data-dswf-phase', 'session', { timeout: 30_000 })
    await page.waitForTimeout(3_000)

    // 弹层 → footer「添加项目…」→ 产品注册流（回退内嵌浏览器面起步）
    await openHeroMenu(page)
    await expect(menuItem(page, 'hero-add-base')).toBeVisible({ timeout: 15_000 })
    await menuItem(page, '添加项目…').click()
    await expect(page.locator('.dswf-ap[data-dswf-ap="browser"]'), '产品注册流打开（回退浏览器面）').toBeVisible({ timeout: 15_000 })

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
    await expect(page.locator('.dswf-ap[data-dswf-ap="form"]')).toBeVisible()

    // 段二：默认值确认 → 注册 → 成功反馈 → 自动关闭
    await expect(page.locator('[data-dswf-rf-name]')).toHaveValue('hero-add-new')
    await page.locator('button', { hasText: /^确认$/ }).click()
    await expect(page.locator('.dswf-ap[data-dswf-ap="executing"]').or(page.locator('.dswf-ap[data-dswf-ap="success"]')).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.dswf-ap')).toHaveCount(0, { timeout: 30_000 })

    // 收口：新项目即入弹层（静默重拉落定）→ 点选 → chip 显示新项目名
    await openHeroMenu(page)
    await expect(menuItem(page, 'hero-add-new'), '注册完成新项目即入弹层').toBeVisible({ timeout: 30_000 })
    await menuItem(page, 'hero-add-new').click()
    await expect(heroChip(page)).toHaveText(/hero-add-new/, { timeout: 30_000 })
  } finally {
    await closeApp(app)
    for (const dir of [userData, fixtureRoot]) {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
      } catch {
        // 残留兜底（句柄长期占用）——不掩盖用例结论
      }
    }
  }
})
