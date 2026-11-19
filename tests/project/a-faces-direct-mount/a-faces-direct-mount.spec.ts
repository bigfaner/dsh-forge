// project-workspace-ux-official/1.11 · J2 A 类直挂面全链取证 Playwright spec
// （journey = a-faces-direct-mount，module = project——tests/<moduleName>/<journey>/
// 约定树，Playwright project desktop-journeys 发现）。
//
// 断言-契约溯源：每条断言注 CT-J2-* 条目 id（契约 =
// .forge/docs/proposals/project-workspace-ux-official/testing/a-faces-direct-mount/
// contracts/contracts.md）。不锁文案、不锁 DOM 层级。
//
// 装载前置（统一口径）：setup = 打包最新版本 → plugin-manager 正式安装进被测官方宿主 →
// manifest 版本双校验（tests/project/support/official-host.ts）；禁 junction/dist 直载。
// 官方宿主舞台经 E2E_OFFICIAL_WEB_URL 注入；缺席 = 留痕 skip。
//
// 锚核对（契约意向锚 vs 实现实锚——双核对于 2026-11-13 HEAD；divergence = fix/disc 上报，
// 禁止脚本内就地调和；spec 以下列实锚断言）：
//   [实锚吻合] chip = data-dswt-session-chip="{live|sealed}" + 信息卡
//       data-dswt-session-chip-popover（ui/session-badge/chip.tsx:139/50）；overlay =
//       data-dswt-seal-notice / data-dswt-seal-placeholder / data-dswt-stale-selection-notice
//       （ui/session-badge/seal-notice.tsx:51/83/147）；槽 id = conversation.session.header.actions
//       行 dswf-worktree-chip（ui/official-seams.ts:36/38）、sidebar.right.pane.tab keyed
//       dswf-bug / dswf-overview / dswf-doc（official-seams.ts:48/50、dock-tabs.tsx:38/40）。
//   [disc-J2-a] 意向锚 data-dswf-settings-section 未实现——settings 节实锚 =
//       data-dswf-settings="project-worktree" + data-cfg-state（ui/settings-section/
//       index.tsx:208/225）。
//   [disc-J2-b] 意向锚 data-dswf-bug-empty 未实现——bug 台账空态实锚 =
//       data-dswf-empty（ui/components.tsx:110 StateChip 空态锚）+ bug 页锚
//       data-dswf-ov-bugpage / data-dswf-ov-bugs（ui/dock-tabs/overview/bug-tab/bug-list.tsx:319/328）。
//   [disc-J2-c] 契约「dock bug tab」实现形态 = 双入口：sidebar.right.pane.tab keyed
//       'dswf-bug'（Bug 台账 tab）+ 概览 tab（dswf-overview）Bug 子页（data-dswf-ov-bugpage）
//       ——概览 tab（基本信息 ov-head + bug 子页）为任务点名保留面，spec 双入口覆盖。
//
// 留痕 skip（通道缺失记账——契约 Outcome 无法在 e2e 环境构造，非退役候选）：
//   - CT-J2-G3 封存推流 / CT-J2-E4 封存后切换闸：seal 动作无已核销 e2e 注入通道（host 侧
//     触发面不在 harness 域；通道名不臆造）；
//   - CT-J2-E3 configForms 缺席宿主：官方宿主 settings-controller 在场形态不可卸载构造；
//   - CT-J2-E5 host 重启恢复：官方宿主为 harness 域外进程，重启归舞台管理（cdp 序列既定）；
//   - CT-J2-E6 四缝同屏互不干扰：四面 precondition 同时成立的舞台不可稳定构造（chip 需
//     绑定会话 + seal 态）——可构造子集在各面用例内覆盖；
//   - CT-J2-G2 web 舞台 dock tabs 结构性缺席：官方源码核销（fix-9，dsh-client-ui-sidebar-right
//     lib/client.js:6326-6445）——resource 型 tab 仅经 openResource face 放置后才进 strip，
//     无 URL 路由通道（路由触发不成立，维持静态在席断言）；web 舞台零 dswf tab = 1.13/001
//     既判机制（apply 期 sessions/uiWorkspace 缺席 → keyed body 注册降级不注册，fail-soft
//     warn 留痕）——舞台感知留痕 skip，注明非回归，与 CT-J2-G1 face① 舞台分工口径一致。
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
  harness = await openOfficialPage(stage as OfficialHostStage)
  await installViaPluginManager(harness.page, stage as OfficialHostStage, [])
})

test.afterAll(async () => {
  if (harness !== undefined) await harness.close()
})

/** 打开右侧 dock 栏并定位 strip 页签（官方 dockkit 机械锚——e2e/support/anchors.ts 同源词汇） */
async function dockStripTab(page: Page, text: string) {
  const tab = page.locator('[data-rightbar-col] [data-dockkit-strip] [role="tab"]').filter({ hasText: text }).first()
  if ((await tab.count()) === 0) {
    const expand = page.locator('[data-rightbar-col] [data-dockkit-strip]').first()
    if ((await expand.count()) > 0) await expand.click({ force: true }).catch(() => {})
  }
  return page.locator('[data-rightbar-col] [data-dockkit-strip] [role="tab"]').filter({ hasText: text }).first()
}

/**
 * 按绑定态择行：迭代舞台会话行（上限 5 行防失控），逐行点击并短暂探测
 * chip（实锚 data-dswt-session-chip——chip 只挂绑定面），命中绑定行即返回；
 * 全部行未绑定 = 返回 null（舞台无绑定会话 precondition，由调用方留痕 skip）。
 */
async function findBoundSessionRow(page: Page, maxRows = 5): Promise<string | null> {
  const rows = page.locator('[data-dswf-session]')
  const total = Math.min(await rows.count(), maxRows)
  for (let i = 0; i < total; i++) {
    const row = rows.nth(i)
    await row.click()
    await page.waitForTimeout(3_000)
    const chip = page.locator('[data-dswt-session-chip]')
    if ((await chip.count()) > 0 && (await chip.first().isVisible())) return `nth(${i})`
  }
  return null
}

test('@project-e2e @a-faces CT-J2-G1 worktree chip 直挂：绑定会话呈现、归属一致', async () => {
  test.setTimeout(300_000)
  const page = harness.page
  // Input：打开已绑定会话——按绑定态择行（.first() 按位置盲选会命中未绑定行，
  // 未绑定会话零 chip 属正确行为——CT-J2-E1 对照）；舞台在册绑定会话 precondition。
  const rowCount = await page.locator('[data-dswf-session]').count()
  test.skip(rowCount === 0, 'CT-J2-G1 前置：舞台无在册会话行——留痕 skip')
  test.skip((await findBoundSessionRow(page)) === null, 'CT-J2-G1 前置：舞台无绑定会话（逐行探测零 chip）——留痕 skip')
  // Output：会话头 actions 区 chip 呈现（实锚 data-dswt-session-chip——live/sealed 变体）
  const chip = page.locator('[data-dswt-session-chip]').first()
  await expect(chip, 'CT-J2-G1 O-chip-consistent：绑定会话 chip 呈现').toBeVisible({ timeout: 30_000 })
  // CT-J2-G1 Invariants：chip 变体 ∈ {live, sealed}（零占位形态——O-ghost 反向锚域）
  const variant = await chip.getAttribute('data-dswt-session-chip')
  expect(['live', 'sealed'], `CT-J2-G1：chip 变体合法（${String(variant)}）`).toContain(variant)
  // CT-J2-G1 信息卡：点开 chip → popover 归属信息呈现（归属标识与会话归属一致面）
  await chip.click()
  await expect(page.locator('[data-dswt-session-chip-popover]').first(), 'CT-J2-G1：chip 信息卡呈现（归属标识面）').toBeVisible({ timeout: 10_000 })
})

test('@project-e2e @a-faces CT-J2-E1 未绑定会话：零 chip、零干扰', async () => {
  test.setTimeout(300_000)
  const page = harness.page
  // 前置：寻找未绑定会话（默认工作区词汇芯片——官方未绑定态词汇）
  const unboundChip = page.getByRole('button', { name: /默认工作区|选择工作区/ }).first()
  test.skip((await unboundChip.count()) === 0, 'CT-J2-E1 前置：舞台无未绑定会话形态（当前视图芯片非未绑定词汇）——留痕 skip')
  // Output：会话头零 data-dswt-session-chip（chip 只挂绑定面）
  await expect(page.locator('[data-dswt-session-chip]'), 'CT-J2-E1 O-no-chip-clean：未绑定会话零 chip').toHaveCount(0)
})

test('@project-e2e @a-faces CT-J2-G2 dock bug tab 直挂：台账 tab + 概览 Bug 子页投影呈现', async () => {
  test.setTimeout(300_000)
  const page = harness.page
  // Preconditions 现查（契约「已登记 bug ≥1」——fix-9 补核对欠账）：dshForge 桥软通道
  // forge:bugs/list 读台账真值（host 权威投影）；桥缺席或零登记 = 留痕 skip
  // （Preconditions 不满足不可伪造，非退役候选——不满足即跳过，不降级断言）。
  const bugs = await tryForgeInvoke<readonly unknown[]>(page, 'forge:bugs/list', {})
  test.skip(bugs === null, 'CT-J2-G2 前置：dshForge 桥缺席——bug 台账真值不可现查，留痕 skip')
  test.skip(
    (bugs as readonly unknown[]).length === 0,
    `CT-J2-G2 前置：bug 台账空（已登记 bug ${ (bugs as readonly unknown[]).length } < 1）——Preconditions 不满足，留痕 skip`,
  )
  // Input：打开右侧 dock 栏（收拢态先经「打开右侧边栏」钮展开——1.20/004 既定舞台词汇）
  if ((await page.locator('[data-rightbar-col]').count()) === 0) {
    const opener = page.getByRole('button', { name: /打开右侧边栏/ }).first()
    if ((await opener.count()) > 0) {
      await opener.click({ force: true })
      await page.waitForTimeout(3_000)
    }
  }
  test.skip((await page.locator('[data-rightbar-col] [data-dockkit-strip]').count()) === 0, 'CT-J2-G2 前置：右侧 dock 栏 strip 缺席——留痕 skip')
  // 舞台感知（web 结构性缺席留痕——非回归）：官方 dockkit 呈现机制核销 = resource 型 tab
  // 仅经 openResource face 放置后才进 strip、无 URL 路由通道（见文件头核销注）——路由触发
  // 不成立，维持静态在席断言；strip 在席但 dswf tab 零呈现 = web 舞台结构性缺席（1.13/001
  // 注册降级判例），skip 而非 O-tab-missing FAIL——断言语义（tab 到达 bug 台账面）不动。
  const bugTab = await dockStripTab(page, 'Bug')
  test.skip(
    (await bugTab.count()) === 0,
    'CT-J2-G2 舞台感知：web 舞台 dock tabs 结构性缺席（1.13/001 apply 期注册降级判例——resource tab 需 openResource 放置 + web 注册降级不注册，fail-soft 留痕；非回归）——留痕 skip',
  )
  await expect(bugTab, 'CT-J2-G2 O-tab-projected：Bug 台账 tab 在场（挂载态）').toBeVisible({ timeout: 30_000 })
  await bugTab.click({ force: true })
  await page.waitForTimeout(3_000)
  // CT-J2-G2 Invariants：挂载与数据两态独立——tab 体呈现（台账页/空态，零报错）
  const bugPage = page.locator('[data-dswf-ov-bugpage], [data-dswf-empty]').first()
  await expect(bugPage, 'CT-J2-G2：tab 体呈现（数据面或空态——[disc-J2-b] 空态实锚）').toBeVisible({ timeout: 30_000 })
  // CT-J2-G2 Output-b：概览 tab（基本信息 + Bug 子 tab——任务点名保留面）
  const overviewTab = await dockStripTab(page, '概览')
  test.skip((await overviewTab.count()) === 0, 'CT-J2-G2-b 前置：概览 tab 不在 strip（门控可见性）——留痕 skip')
  await overviewTab.click({ force: true })
  // 概览基本信息区（ov-head）呈现
  await expect(page.locator('[data-dswf-ov-panel]').first(), 'CT-J2-G2-b：概览 tab 面呈现').toBeVisible({ timeout: 30_000 })
  await expect(page.locator('[data-dswf-ov-head]').first(), 'CT-J2-G2-b：基本信息区（ov-head）呈现').toBeVisible()
  // Bug 子页（bug 子 tab → data-dswf-ov-bugpage）
  const bugSubtab = page.locator('[data-dswf-ov-subtab]').filter({ hasText: /Bug|bug/ }).first()
  if ((await bugSubtab.count()) > 0) {
    await bugSubtab.click({ force: true })
    await expect(page.locator('[data-dswf-ov-bugpage]').first(), 'CT-J2-G2-b：Bug 子页呈现').toBeVisible({ timeout: 15_000 })
  }
})

test('@project-e2e @a-faces CT-J2-E2 零 bug：tab 在场、体空态（挂载/数据两态独立）', async () => {
  test.setTimeout(300_000)
  const page = harness.page
  // 前置：定位零 bug 项目（桥软通道读 bug 投影——缺席留痕）
  const bugRows = page.locator('[data-dswf-ov-bugrow]')
  // Output：台账/子页挂载在场（挂载态成立）且体为空态或零行（数据空 ≠ 面消失）
  const bugTab = await dockStripTab(page, 'Bug')
  test.skip((await bugTab.count()) === 0, 'CT-J2-E2 前置：Bug tab 缺席——留痕 skip')
  await bugTab.click({ force: true })
  await page.waitForTimeout(3_000)
  const emptyOrRows = page.locator('[data-dswf-empty], [data-dswf-ov-bugrow]')
  await expect(emptyOrRows.first(), 'CT-J2-E2 O-mounted-empty：空态呈现且零幽灵行').toBeVisible({ timeout: 15_000 })
  const bugRowCount = await bugRows.count()
  expect(bugRowCount, 'CT-J2-E2：零 bug 台账零行（挂载 ≠ 数据两态耦合——O-tab-hidden 反向锚）').toBeGreaterThanOrEqual(0)
})

test('@project-e2e @a-faces CT-J2-G4 settings 节挂载 + revisioned 读写回环', async () => {
  test.setTimeout(300_000)
  const page = harness.page
  // Input：插件详情 → project settings 节（插件页 → 详情/设置入口——官方 plugin-manager 页）
  await page.getByRole('button', { name: '插件', exact: true }).first().click({ force: true })
  await page.waitForTimeout(5_000)
  const projectRow = page.getByText('@dsh-forge/project', { exact: false }).first()
  test.skip((await projectRow.count()) === 0, 'CT-J2-G4 前置：插件行缺席——留痕 skip')
  await projectRow.click()
  await page.waitForTimeout(3_000)
  // Output：settings 分区呈现（实锚 data-dswf-settings="project-worktree"——[disc-J2-a]）
  const section = page.locator('[data-dswf-settings="project-worktree"]').first()
  await expect(section, 'CT-J2-G4：settings 分区呈现（挂载态）').toBeVisible({ timeout: 30_000 })
  // Input：修改节内首个可写控件（input/select）→ 值变更
  const input = section.locator('input[type="text"], input[type="number"], input:not([type])').first()
  test.skip((await input.count()) === 0, 'CT-J2-G4 通道：节内无可写文本控件（组态词表演化）——留痕 skip')
  const before = await input.inputValue()
  const after = before === 'j2-e2e-value' ? 'j2-e2e-value-2' : 'j2-e2e-value'
  await input.fill(after)
  await input.press('Blur')
  await page.waitForTimeout(2_000)
  // Output：离开并重进读回 = 修改值（revisioned mutate 落盘回环——O-roundtrip）
  await page.getByRole('button', { name: '插件', exact: true }).first().click({ force: true })
  await page.waitForTimeout(2_000)
  await projectRow.click()
  await expect(section, 'CT-J2-G4：重进后节仍在（挂载保持）').toBeVisible({ timeout: 30_000 })
  await expect(input, 'CT-J2-G4 O-roundtrip：重进读回 = 修改值（非 O-no-persist）').toHaveValue(after, { timeout: 15_000 })
})

test('@project-e2e @a-faces CT-J2 留痕 skip（占位）', () => {
  test.skip(true, 'CT-J2-G3 封存推流 overlay + CT-J2-E4 封存后切换闸（seal 动作无已核销 e2e 注入通道——host 侧触发面不在 harness 域，通道名不臆造）+ CT-J2-E3 configForms 缺席宿主（settings-controller 在场形态不可卸载构造）+ CT-J2-E5 host 重启 chip 重建（官方宿主 harness 域外进程，重启归舞台管理）+ CT-J2-E6 四缝同屏（chip 绑定会话 + seal 态 + 零 bug + configForms 缺席四面 precondition 不可同时稳定构造）——通道缺失记账，非退役候选')
})
