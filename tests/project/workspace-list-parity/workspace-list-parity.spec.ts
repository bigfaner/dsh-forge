// project-workspace-ux-official/1.11 · J3 项目列表五功能复刻（官方对齐）Playwright spec
// （journey = workspace-list-parity，module = project——tests/<moduleName>/<journey>/
// 约定树，Playwright project desktop-journeys 发现）。
//
// 断言-契约溯源：每条断言注 CT-J3-* 条目 id（契约 =
// .forge/docs/proposals/project-workspace-ux-official/testing/workspace-list-parity/
// contracts/contracts.md）。不锁文案、不锁 DOM 层级。
//
// 装载前置（统一口径）：setup = 打包最新版本 → plugin-manager 正式安装进被测官方宿主 →
// manifest 版本双校验（tests/project/support/official-host.ts）；禁 junction/dist 直载。
// 官方宿主舞台经 E2E_OFFICIAL_WEB_URL 注入；缺席 = 留痕 skip。
//
// 锚核对（契约意向锚 vs 实现实锚——双核对于 2026-11-13 HEAD；divergence = fix/disc 上报，
// 禁止脚本内就地调和；spec 以下列实锚断言）：
//   [disc-J3-a] 意向锚 data-dswf-project-search 未实现——搜索实锚 =
//       data-dswf-search-toggle（搜索钮）+ data-dswf-searchrow（迁段头内嵌搜索槽）+
//       data-dswf-filterempty（无匹配空态）（ui/sidebar/ForgeWorkspacePanel.tsx:769/956/1097）。
//   [disc-J3-b] 意向锚 data-dswf-project-pin 未实现——排序复刻形态 = HTML5 原生拖拽
//       （project-manual-order 1.2 拖拽缝 + sortOrders 落盘，ForgeWorkspacePanel.tsx:573-600）；
//       pin affordance 锚缺席（拖拽 e2e 不可稳定驱动——留痕 skip + disc）。
//   [disc-J3-c] 意向锚 data-dswf-project-rename 未实现——rename 实锚 =
//       data-dswf-project-action="menu"（行菜单）→ 菜单 rename 项 → data-dswf-rename-input
//       （ForgeWorkspacePanel.tsx:648 + e2e/support/anchors.ts RENAME_INPUT）。
//   [disc-J3-d] 意向锚 data-dswf-project-archive 未实现——archive 实锚 = 同上菜单 archive 项
//       → 行 data-archived 属性（ForgeWorkspacePanel.tsx:571）。
//   [disc-J3-e] 意向锚 data-dswf-project-grouping 未实现——分组/视图态实锚 =
//       data-dswf-view-menu（视图菜单控件，ForgeWorkspacePanel.tsx:1125）。
//   [实锚吻合] 项目行 = data-dswf-project="<projectId>" + data-archived；
//       「＋ 添加项目」入口缺席反向锚域 = data-dswf-flatlist（列表根）。
//
// 官方对齐判据（契约「既有机械锚」表）：五项行为与官方 WorkspaceBrowser 同语义对照——
// 走查截图取证归 walkthrough/（不属 spec 断言域，spec 断行为语义）。
//
// 留痕 skip（通道缺失记账——契约 Outcome 无法在 e2e 环境构造，非退役候选）：
//   - CT-J3-G2 pin 重启持久 / CT-J3-G4 分组态重启不落盘 / CT-J3-G5 archive 重启保持：
//     官方宿主为 harness 域外进程，重启归舞台管理（cdp 序列既定）——持久化断言的
//     重启腿留痕；UI 即时腿在各用例内覆盖；
//   - CT-J3-E3 断连期间写：无故障注入缝（推流断连不可构造）；
//   - CT-J3-G2 pin 拖拽即时腿：HTML5 原生拖拽 Playwright 不可稳定驱动（意向锚缺席 +
//     拖拽缝语义，[disc-J3-b]）。
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import {
  officialHostStage,
  openOfficialPage,
  installViaPluginManager,
  tryForgeInvoke,
  type OfficialHostStage,
  type OfficialPage,
} from '../support/official-host.js'

const stage: OfficialHostStage | null = officialHostStage()
test.skip(stage === null, '官方宿主舞台缺席（E2E_OFFICIAL_WEB_URL 未注入）——统一口径 setup 不可伪造，留痕 skip')

test.describe.configure({ mode: 'serial' })

let harness: OfficialPage

test.beforeAll(async () => {
  // 安装轮询有界 6 分钟（official-host.ts 既定上界）——beforeAll hook 级超时随其上调
  test.setTimeout(420_000)
  harness = await openOfficialPage(stage as OfficialHostStage)
  await installViaPluginManager(harness.page, stage as OfficialHostStage, [])
})

test.afterAll(async () => {
  if (harness !== undefined) await harness.close()
})

/** 打开项目行操作菜单（实锚 data-dswf-project-action="menu"——[disc-J3-c]） */
async function openProjectMenu(page: Page): Promise<boolean> {
  const row = page.locator('[data-dswf-project]').first()
  if ((await row.count()) === 0) return false
  const menuButton = row.locator('[data-dswf-project-action="menu"]').first()
  if ((await menuButton.count()) === 0) return false
  // 模态/菜单 mask 清场前导（fix-16）：前序改名流可能留开模态（空名被拒 = 模态留场 +
  //   错误提示，官方 Modal 同型）——Escape 关闭在场 overlay，防 mask 拦截 hover 挂死
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  // 动作面 = 行尾 hover 槽（官方 rowActions 同型，默认隐藏）——先 hover 标题行本体再点
  await row.locator('.dswf-sidebar-project-row').first().hover()
  await menuButton.click({ force: true })
  await page.waitForTimeout(1_000)
  return true
}

test('@project-e2e @list-parity CT-J3-G1 搜索过滤：投影层实时过滤、清空恢复', async () => {
  test.setTimeout(300_000)
  const page = harness.page
  const before = await page.locator('[data-dswf-project]').count()
  test.skip(before < 2, `CT-J3-G1 前置：≥2 项目（实测 ${before}）——留痕 skip`)
  // Input：搜索钮 → 搜索槽呈现 → 输入首行项目名片段
  await page.locator('[data-dswf-search-toggle]').first().click({ force: true })
  const searchRow = page.locator('[data-dswf-searchrow]').first()
  await expect(searchRow, 'CT-J3-G1：搜索槽呈现（实锚 data-dswf-searchrow）').toBeVisible({ timeout: 10_000 })
  const firstRow = page.locator('[data-dswf-project]').first()
  const name = (await firstRow.innerText()).trim().slice(0, 4)
  await searchRow.locator('input').first().fill(name)
  // Output：实时过滤（零网络往返——客户端投影过滤：行集收敛且首行为匹配行）
  await expect(page.locator('[data-dswf-project]').first(), 'CT-J3-G1 O-filter-and-restore：过滤后行呈现匹配项').toBeVisible({ timeout: 10_000 })
  const filtered = await page.locator('[data-dswf-project]').count()
  expect(filtered, `CT-J3-G1：过滤行集收敛（${filtered} ≤ ${before}）`).toBeLessThanOrEqual(before)
  // 过滤语义钉住（bug 3d453e91 弱断言修复）：未匹配项必须被排除——零失败过滤器
  //   （行集原样透传）在此红。可见行标题全部含查询片段 = 排除语义成立。
  const visibleTitles = (await page.locator('[data-dswf-project] .dswf-sidebar-project-title').allInnerTexts()).map((t) => t.trim())
  expect(visibleTitles.length, 'CT-J3-G1：过滤后行集非空（过滤生效前置）').toBeGreaterThan(0)
  expect(
    visibleTitles.filter((t) => !t.includes(name)),
    'CT-J3-G1 O-filter-and-restore：过滤语义钉住——未匹配项被排除（零失败过滤器红）',
  ).toEqual([])
  // 清空 → 完整列表恢复
  await searchRow.locator('input').first().fill('')
  await expect(page.locator('[data-dswf-project]')).toHaveCount(before, { timeout: 10_000 })
})

test('@project-e2e @list-parity CT-J3-E1 搜索无匹配：空态不清空崩溃', async () => {
  test.setTimeout(60_000)
  const page = harness.page
  // 消串（bug c04a4c1c 修法）：搜索控件锚定 scoped locator——限定项目列表面板域内
  // （.dswf-sidebar-projects 段：搜索钮/搜索槽/空态均在段内；rail 态另一枚
  // data-dswf-search-toggle 在段外，页面级 first() 会串场命中）。
  const panel = page.locator('.dswf-sidebar-projects').first()
  // 在场前置：空列表先经正典注册通道登记一项目（桥缺席 = 留痕 skip——零行态不可在不
  // 重建宿主前提下构造，注册即面板行 + 官方快照入场）
  if ((await page.locator('[data-dswf-project]').count()) === 0) {
    const wsDir = mkE1FixtureDir()
    const registered = await tryForgeInvoke<{ projectId: string }>(page, 'forge:projects/register', {
      workspaceDir: wsDir,
      name: 'disc4-e1-probe',
      forgeDir: '',
    })
    test.skip(registered === null, 'CT-J3-E1 前置：dshForge 桥缺席（注册通道不可用）——留痕 skip')
    await expect(panel.locator('[data-dswf-project]').first(), 'CT-J3-E1 前置：注册项目行呈现').toBeVisible({ timeout: 15_000 })
  }
  const toggle = panel.locator('[data-dswf-search-toggle]').first()
  const searchRow = panel.locator('[data-dswf-searchrow]').first()
  // 消串第二腿：G1 可留开搜索槽串场——toggle 是开合语义，盲点会反向关闭槽，
  // 后续 fill 盲等 300s 挂死并截断 serial 后续用例。先核对在场性：串场残留 = 先关复位。
  if (await searchRow.isVisible()) {
    await toggle.click({ force: true })
    await expect(searchRow, 'CT-J3-E1 消串：串场残留搜索槽先复位').toBeHidden({ timeout: 10_000 })
  }
  await toggle.click({ force: true })
  // 搜索输入锚定 + 有界等待：槽未呈现 = 立即 fail 留痕（不盲等不挂死）
  await expect(searchRow, 'CT-J3-E1：搜索槽呈现（有界 fail 留痕，不挂死）').toBeVisible({ timeout: 10_000 })
  const searchInput = searchRow.locator('input').first()
  await searchInput.fill('zz-no-such-project-xyz')
  // Output：无匹配空态呈现（实锚 data-dswf-filterempty，面板域内）、零崩溃（O-crash 反向锚）
  await expect(panel.locator('[data-dswf-filterempty]').first(), 'CT-J3-E1 O-no-match-empty：无匹配空态呈现').toBeVisible({ timeout: 10_000 })
  await searchInput.fill('')
  await expect(panel.locator('[data-dswf-filterempty]'), 'CT-J3-E1：清空即恢复（空态退场）').toHaveCount(0, { timeout: 10_000 })
})

test('@project-e2e @list-parity CT-J3-G3 rename：行内改名生效 + 非法输入零落盘', async () => {
  test.setTimeout(300_000)
  const page = harness.page
  test.skip((await page.locator('[data-dswf-project]').count()) === 0, 'CT-J3-G3 前置：≥1 项目——留痕 skip')
  const opened = await openProjectMenu(page)
  test.skip(!opened, 'CT-J3-G3 通道：行菜单缺席——留痕 skip')
  // Input：菜单 rename 项 → rename 输入（实锚 data-dswf-rename-input）
  const renameItem = page.getByRole('menuitem', { name: /重命名|改名/ }).first()
  test.skip((await renameItem.count()) === 0, 'CT-J3-G3 通道：rename 菜单项缺席——留痕 skip')
  await renameItem.click()
  const renameInput = page.locator('[data-dswf-rename-input]').first()
  await expect(renameInput, 'CT-J3-G3：rename 输入态呈现').toBeVisible({ timeout: 10_000 })
  const original = (await renameInput.inputValue()).trim()
  const renamed = original.endsWith('-j3') ? original.slice(0, -3) : `${original}-j3`
  await renameInput.fill(renamed)
  await renameInput.press('Enter')
  // Output：行内改名生效（合法路径——精确标题比对，fix-16 修订：原 toContainText 存在子串歧义）
  await expect(page.locator('[data-dswf-project] .dswf-sidebar-project-title').first(), 'CT-J3-G3 O-renamed-synced：改名后面板行标题=新名').toHaveText(renamed, { timeout: 15_000, useInnerText: true })
  // 边界分支：空串输入被拒（O-rename-rejected——非法输入零落盘、无空名行）
  const reopened = await openProjectMenu(page)
  if (reopened) {
    const renameAgain = page.getByRole('menuitem', { name: /重命名|改名/ }).first()
    if ((await renameAgain.count()) > 0) {
      await renameAgain.click()
      const input2 = page.locator('[data-dswf-rename-input]').first()
      await input2.fill('')
      await input2.press('Enter')
      await page.waitForTimeout(1_000)
      // 空名被拒 = 模态留场 + 错误提示（官方 Modal 同型——确认阻断不关场）
      await expect(page.locator('[role="alert"]').first(), 'CT-J3-G3：空名拒绝错误提示在场').toBeVisible({ timeout: 10_000 })
      // fix-16 修订：原 not.toContainText('') 为恒假恒真式（空串是任意文本子串）——
      // 改为行名非空断言（空名输入被拒 = 行名保持非空原值）
      const rowTitle = (await page.locator('[data-dswf-project] .dswf-sidebar-project-title').first().innerText()).trim()
      expect(rowTitle.length, 'CT-J3-G3 O-rename-rejected：空名未落盘（行名保持非空，输入被拒）').toBeGreaterThan(0)
    }
  }
  // 清理：改回原名（舞台交接）
  const restored = await openProjectMenu(page)
  if (restored) {
    const renameBack = page.getByRole('menuitem', { name: /重命名|改名/ }).first()
    if ((await renameBack.count()) > 0) {
      await renameBack.click()
      const input3 = page.locator('[data-dswf-rename-input]').first()
      await input3.fill(original)
      await input3.press('Enter')
    }
  }
})

test('@project-e2e @list-parity CT-J3-G4 分组态：纯视图重排（重启不落盘腿留痕）', async () => {
  test.setTimeout(300_000)
  const page = harness.page
  test.skip((await page.locator('[data-dswf-project]').count()) < 2, 'CT-J3-G4 前置：≥2 项目（可分组维度）——留痕 skip')
  // Input：视图菜单（实锚 data-dswf-view-menu——[disc-J3-e]）
  const viewMenu = page.locator('[data-dswf-view-menu]').first()
  test.skip((await viewMenu.count()) === 0, 'CT-J3-G4 通道：视图菜单控件缺席——留痕 skip')
  const beforeList = await page.locator('[data-dswf-project]').allInnerTexts()
  await viewMenu.click({ force: true })
  await page.waitForTimeout(1_000)
  // Output：切换后列表呈现语义变化（分组重排为视图态——零 host 写入面 UI 侧可见）
  const menuItems = page.locator('[role="menuitem"], [role="menu"] button')
  test.skip((await menuItems.count()) === 0, 'CT-J3-G4 通道：视图菜单未展开——留痕 skip')
  const groupItem = menuItems.filter({ hasText: /分组/ }).first()
  test.skip((await groupItem.count()) === 0, 'CT-J3-G4 通道：分组菜单项缺席（视图词表演化）——留痕 skip')
  await groupItem.click()
  await page.waitForTimeout(2_000)
  const afterList = await page.locator('[data-dswf-project]').allInnerTexts()
  expect(afterList.length, 'CT-J3-G4 O-grouping-viewonly：重排零丢行（投影不变——视图态语义）').toBe(beforeList.length)
})

test('@project-e2e @list-parity CT-J3-G5 archive 归档：退场 + 归档态呈现', async () => {
  test.setTimeout(300_000)
  const page = harness.page
  test.skip((await page.locator('[data-dswf-project]').count()) < 2, 'CT-J3-G5 前置：≥2 项目——留痕 skip')
  const before = await page.locator('[data-dswf-project]:not([data-archived])').count()
  const opened = await openProjectMenu(page)
  test.skip(!opened, 'CT-J3-G5 通道：行菜单缺席——留痕 skip')
  const archiveItem = page.getByRole('menuitem', { name: /归档/ }).first()
  test.skip((await archiveItem.count()) === 0, 'CT-J3-G5 通道：archive 菜单项缺席——留痕 skip')
  await archiveItem.click()
  await page.waitForTimeout(2_000)
  // 确认门（含活跃会话项目归档路径——官方确认词汇）在场即确认
  const confirm = page.getByRole('button', { name: /确认|归档|继续/ }).first()
  if ((await confirm.count()) > 0) await confirm.click({ force: true }).catch(() => {})
  await page.waitForTimeout(2_000)
  // Output：归档后默认列表退场或呈归档态（实锚 data-archived——O-archived-synced UI 腿）
  const after = await page.locator('[data-dswf-project]:not([data-archived])').count()
  expect(after, `CT-J3-G5 O-archived-synced：默认列表退场（${before} → ${after}）`).toBeLessThan(before)
})

test('@project-e2e @list-parity CT-J3-E2 添加项目入口缺席（装配级负向断言）', async () => {
  test.setTimeout(300_000)
  const page = harness.page
  // Output：列表域（data-dswf-flatlist 及侧栏项目面板域）内零「＋ 添加项目」入口
  // （用户裁决 2026-11-12——O-entry-in-list FAIL 分支反向锚；CTA/NAV 入口归宿在域外）
  const listRoot = page.locator('[data-dswf-flatlist]').first()
  test.skip((await listRoot.count()) === 0, 'CT-J3-E2 前置：列表根缺席——留痕 skip')
  await expect(
    listRoot.locator('[data-dswf-cta="add-project"], [data-dswf-nav="add-project"]'),
    'CT-J3-E2 O-entry-absent：列表域零添加入口（裁决回归反向锚）',
  ).toHaveCount(0)
})

test('@project-e2e @list-parity CT-J3 留痕 skip（占位）', () => {
  test.skip(true, 'CT-J3-G2 pin 置顶（意向锚未实现——实现为拖拽排序缝 [disc-J3-b]，HTML5 拖拽 Playwright 不可稳定驱动；重启持久腿 = 官方宿主域外重启）+ CT-J3-G4/G5 重启腿（分组态不落盘 / 归档持久——官方宿主 harness 域外进程，重启归舞台管理）+ CT-J3-E3 断连期间写（无推流故障注入缝）——通道缺失记账，非退役候选')
})

/** E1 fixture：git 仓库夹具目录（注册通道 workspaceDir 实体） */
function mkE1FixtureDir(): string {
  const wsDir = join(tmpdir(), 'disc4-e1ws-' + String(Date.now()))
  mkdirSync(wsDir, { recursive: true })
  const git = (args: string[]): string =>
    execFileSync('git', args, { cwd: wsDir, encoding: 'utf8', timeout: 30_000, shell: true })
  git(['init', '-b', 'main'])
  writeFileSync(join(wsDir, 'README.md'), 'disc4 e1 fixture\n', 'utf8')
  git(['-c', 'user.email=spec@forge.test', '-c', 'user.name=spec', 'add', '-A'])
  git(['-c', 'user.email=spec@forge.test', '-c', 'user.name=spec', 'commit', '-m', 'init'])
  return wsDir
}
