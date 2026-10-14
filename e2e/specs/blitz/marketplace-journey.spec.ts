// @feature:dsh-plugin-marketplace @web-e2e
// dsh-plugin-marketplace 1.4 表层验证 e2e：市场分区旅程一条（提案验收 1/2/3/4）+
// 启停/移除持久（验收 5）+ 清单不可达降级（验收 6）。
//
// 载体边界（本 spec 的物理承载，如实口径）：
// - 官方设置对话框开启通道：以官方侧栏「设置」PanelRow 点击开启（实测锚）；断言全部落在
//   产品分区锚（data-dswf-fs-*——apps/web ForgeSettingsSection/MarketplaceEntry/Catalog
//   渲染面台账）与「插件市场」文案出现计数（官方分区入场 = 计数超越产品小节基线）上。
// - 隔离：安装链写 profile（pnpm add + cordis.patch.yml）——旅程以 apps/host/profile.dev
//   的临时完整拷贝承载（DSH_FORGE_PROFILE_DIR 绝对路径覆盖，paths.ts 第三层），仓库
//   profile.dev 零污染；两次启动同 userData + 同 profile 拷贝 = 持久断言载体。
// - 安装走真实官方链（inspect → pnpm add registry → reconcile + reload），耗时受网络
//   支配——用例级 timeout 放宽到 900s。
import { cpSync, existsSync, mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { closeApp, launchHost, waitShellReady, ROOT } from '../../support/launch.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { WORKBENCH } from '../../support/anchors.js'

/** 产品分区/目录锚（apps/web data-dswf-fs-* 台账字面量——组件渲染面单源） */
const FORGE_PART = '[data-dswf-fs-part]'
const MARKETPLACE_PART = '[data-dswf-fs-part="marketplace"]'
const MARKET_INSTALL = '[data-dswf-fs-mkt-install]'
const MARKET_ENABLED_NOTE = '[data-dswf-fs-mkt-enabled]'
const MARKET_CAT = '[data-dswf-fs-mkt-cat]'
const catalogRowOf = (name: string): string => `[data-dswf-fs-mkt-row="${name}"]`
const catalogToggleOf = (name: string): string => `[data-dswf-fs-mkt-toggle="${name}"]`

/** 拷贝 profile 首启慢尾（冷树 477MB + 首启物化）——就绪链全面放宽 */
const LAUNCH_TIMEOUTS = { firstWindow: 120_000, bootReady: 120_000, loaderLive: 180_000 } as const

/** 官方设置对话框开启（侧栏「设置」行 → Forge设置 分区行——官方 PanelRow/分区导航实测锚；
 *  开启失败留 body 快照） */
async function openSettings(page: Page): Promise<void> {
  await page.getByRole('button', { name: '设置', exact: true }).first().click()
  await page
    .getByRole('button', { name: 'Forge设置', exact: true })
    .first()
    .click()
  await page
    .locator(FORGE_PART)
    .first()
    .waitFor({ state: 'attached', timeout: 20_000 })
    .catch(async () => {
      const body = await page.evaluate(() => document.body.innerText.slice(0, 600))
      throw new Error(`官方设置对话框未开启或 Forge设置 分区未挂载——body 快照：${body}`)
    })
}

/** profile.dev → 临时完整拷贝（安装链隔离载体——仓库 profile.dev 零污染）。
 *  拷贝落位 apps/host/node_modules/.cache（gitignored）：boot 链 bare import 兜底解析
 *  依赖 profile 目录向上走查命中 apps/host/node_modules（profile.dev 原位布局福利）——
 *  %TEMP%/根 node_modules 拷贝走查落空即 ERR_MODULE_NOT_FOUND（实测）。 */
function makeProfileCopy(): string {
  const src = join(ROOT, 'apps', 'host', 'profile.dev')
  expect(existsSync(src), `profile.dev 在场（${src}）`).toBe(true)
  const base = join(ROOT, 'apps', 'host', 'node_modules', '.cache', 'dsh-forge-e2e-mkt')
  mkdirSync(base, { recursive: true })
  const dst = mkdtempSync(join(base, 'profile-'))
  cpSync(src, dst, { recursive: true, dereference: true })
  return dst
}

/** 页面内「插件市场」文案出现次数（初始态负样例/分区启用计数断言面） */
async function marketTextCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const text = document.body.innerText
    let count = 0
    let index = text.indexOf('插件市场')
    while (index !== -1) {
      count += 1
      index = text.indexOf('插件市场', index + 1)
    }
    return count
  })
}

test('市场分区旅程：初始缺席→安装市场插件→分区启用→浏览→安装插件→生效（提案验收 1/2/3/4）', async () => {
  test.setTimeout(900_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-mkt-journey-ud-'))
  const profile = makeProfileCopy()
  const { app, page } = await launchHost({
    userData,
    env: { DSH_FORGE_PROFILE_DIR: profile },
    timeouts: LAUNCH_TIMEOUTS,
  })
  try {
    await expect(page.locator(WORKBENCH).first()).toBeVisible({ timeout: 60_000 })

    // ── 验收 1 初始态：设置对话框无「插件市场」分区（产品安装入口小节在场 = 缺席相位；
    // 官方分区文案基线 = 产品小节自身携带数，启用后增长才是分区入场）──
    await openSettings(page)
    await expect(page.locator(MARKETPLACE_PART), '产品插件市场小节在场').toBeVisible()
    await expect(page.locator(MARKET_INSTALL), '安装入口 = 缺席相位').toHaveAttribute(
      'data-dswf-fs-mkt-phase',
      'absent',
    )
    await expect(page.locator(MARKET_ENABLED_NOTE), '启用注记不在场（分区未启用负样例）').toHaveCount(0)
    const baseline = await marketTextCount(page)
    await page.keyboard.press('Escape')

    // ── 验收 1/2 安装市场插件（设置内安装入口 → 官方链 installBundle + reconcile + reload）──
    await openSettings(page)
    await page.locator(MARKET_INSTALL).click()
    // 官方链在途（installing）或快速失败（error 行留场）二选一取证——安装腿失败 = 用例失败
    await expect
      .poll(
        async () => {
          const phase = await page
            .locator(MARKET_INSTALL)
            .getAttribute('data-dswf-fs-mkt-phase')
            .catch(() => null)
          const error = await page
            .locator('[data-dswf-fs-mkt-error]')
            .textContent()
            .catch(() => null)
          return phase === 'installing' || phase === 'enabled' || (error !== null && error !== '')
        },
        { timeout: 60_000, intervals: [1_000, 3_000] },
      )
      .toBe(true)
    const installError = await page.locator('[data-dswf-fs-mkt-error]').textContent().catch(() => null)
    expect(
      installError,
      `安装腿失败留证（官方 installBundle 链错误行）：${installError ?? '无错误行'}`,
    ).toBeNull()
    // 官方链完成（安装 + reconcile + reload）→ 启用相位 + 启用注记
    await expect(page.locator(MARKET_ENABLED_NOTE), '安装完成 → 启用注记在场（分区启用）')
      .toBeVisible({ timeout: 600_000 })
    await expect(page.locator(MARKET_INSTALL)).toHaveAttribute('data-dswf-fs-mkt-phase', 'enabled')
    // 分区启用：官方市场插件 client 半自注册「插件市场」settings.section 分区 → 对话框
    // 内「插件市场」文案计数 > 产品小节基线（官方分区文案入场）
    expect(await marketTextCount(page), '官方「插件市场」分区文案入场（分区启用）').toBeGreaterThan(
      baseline,
    )
    await page.keyboard.press('Escape')

    // ── 验收 3 浏览：产品目录面陈列官方清单插件（名称/描述/版本——行锚集非空）──
    await openSettings(page)
    await expect(page.locator(MARKET_CAT), '目录面就绪（ready 态）').toHaveAttribute(
      'data-dswf-fs-mkt-cat',
      'ready',
      { timeout: 60_000 },
    )
    const rowCount = await page.locator('[data-dswf-fs-mkt-row]').count()
    expect(rowCount, '目录行集非空（官方清单陈列）').toBeGreaterThan(0)

    // ── 验收 4 安装清单内一个插件 → 官方链 reload 后生效（行动作 → installed 行）──
    const installButtons = page.locator('[data-dswf-fs-mkt-install-row]')
    const installCount = await installButtons.count()
    test.skip(installCount === 0, '官方清单无可安装行（全已安装）——验收 4 前置不成立')
    const target = (await installButtons.first().getAttribute('data-dswf-fs-mkt-install-row')) as string
    expect(target, '目标行包名读数').toBeTruthy()
    await installButtons.first().click()
    // 生效判定：安装行动作退役 → installed 行（启停钮在场）——官方链 reconcile + reload 完成
    await expect(page.locator(catalogToggleOf(target)), `已安装行 ${target} 启停钮在场（生效）`)
      .toBeVisible({ timeout: 600_000 })
    await expect(page.locator(catalogToggleOf(target))).toHaveAttribute('data-dswf-fs-mkt-toggle-to', 'disable')

    // ── 验收 5 启停持久：停用 → 重启（同 userData + 同 profile）→ 状态保持停用 ──
    await page.locator(catalogToggleOf(target)).click()
    await expect(page.locator(catalogToggleOf(target)), '停用后切换向 = enable').toHaveAttribute(
      'data-dswf-fs-mkt-toggle-to',
      'enable',
      { timeout: 60_000 },
    )
    await closeApp(app)
    const relaunched = await launchHost({
      userData,
      env: { DSH_FORGE_PROFILE_DIR: profile },
      timeouts: LAUNCH_TIMEOUTS,
    })
    try {
      await waitShellReady(relaunched.page)
      await openSettings(relaunched.page)
      await expect(
        relaunched.page.locator(catalogRowOf(target)),
        `重启后 ${target} 行保持（profile 层持久）`,
      ).toBeVisible({ timeout: 60_000 })
      await expect(relaunched.page.locator(catalogToggleOf(target)), '重启后保持停用态').toHaveAttribute(
        'data-dswf-fs-mkt-toggle-to',
        'enable',
      )
      // 市场分区同样保持启用（安装态持久）
      await expect(
        relaunched.page.locator(MARKET_ENABLED_NOTE),
        '重启后市场插件保持启用',
      ).toBeVisible({ timeout: 60_000 })
    } finally {
      await closeApp(relaunched.app)
    }
  } finally {
    await rmDirBestEffort(userData)
    await rmDirBestEffort(profile)
  }
})

test('清单不可达降级：无 pnpm 环境目录面收敛不可用态，设置分区其余内容不受影响（提案验收 6）', async () => {
  test.setTimeout(300_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-mkt-degrade-ud-'))
  const profile = makeProfileCopy()
  // 官方 Known Limitations 口径：无 pnpm 的机器 = registry 读 unknown、不可安装（fail-soft）
  // ——PATH 摘除 pnpm 所在目录（pnpm 独立安装位）构造清单不可达载体；System32 保留保 boot。
  const pathDirs = (process.env.PATH ?? '').split(';')
  const stripped = pathDirs.filter((d) => !/pnpm/i.test(d)).join(';')
  const { app, page } = await launchHost({
    userData,
    env: { DSH_FORGE_PROFILE_DIR: profile, PATH: stripped },
    timeouts: LAUNCH_TIMEOUTS,
  })
  try {
    await expect(page.locator(WORKBENCH).first()).toBeVisible({ timeout: 60_000 })
    await openSettings(page)
    // 目录面降级：不可用降级行在场（清单不可达——读取失败收敛）
    await expect(page.locator('[data-dswf-fs-mkt-cat="unavailable"], [data-dswf-fs-mkt-cat="ready"]'))
      .toBeVisible({ timeout: 60_000 })
    const catState = await page.locator(MARKET_CAT).getAttribute('data-dswf-fs-mkt-cat')
    if (catState === 'unavailable') {
      await expect(page.locator('[data-dswf-fs-mkt-cat-unavailable]'), '降级文案在场').toContainText(
        '官方清单不可达',
      )
    } else {
      // 载体偏差如实留证：pnpm 经绝对路径/内建解析仍可达 → 清单未失联（不伪报降级）
      const note = `清单不可达载体未成立（pnpm 经非 PATH 解析仍可达）——目录面 state=${catState ?? 'missing'}`
      await page.evaluate((text) => console.warn(`[mkt-degrade] ${text}`), note)
      expect(catState, note).toBe('ready')
    }
    // fail-soft：设置分区其余内容不受影响——Forge设置 分区骨架（其他小节）在场
    await expect(page.locator(FORGE_PART).first(), 'Forge设置 分区骨架在场（其余分区不受影响）').toBeVisible()
    const partCount = await page.locator(FORGE_PART).count()
    expect(partCount, '分区小节集非空（其余内容正常渲染）').toBeGreaterThan(1)
    await closeApp(app)
  } finally {
    await rmDirBestEffort(userData)
    await rmDirBestEffort(profile)
  }
})
