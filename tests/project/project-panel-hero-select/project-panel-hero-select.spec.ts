// project-workspace-ux-official/1.11 · J1 项目化 sidebar 面板 + hero 双 select Playwright spec
// （journey = project-panel-hero-select，module = project——tests/<moduleName>/<journey>/
// 约定树，Playwright project desktop-journeys 发现）。
//
// 断言-契约溯源：每条断言注 CT-J1-* 条目 id（契约 =
// .forge/docs/proposals/project-workspace-ux-official/testing/project-panel-hero-select/
// contracts/contracts.md）。不锁文案、不锁 DOM 层级。
//
// 装载前置（统一口径）：setup = 打包最新版本 → plugin-manager 正式安装进被测官方宿主 →
// manifest 版本双校验（tests/project/support/official-host.ts）；禁 junction/dist 直载。
// 官方宿主舞台经 E2E_OFFICIAL_WEB_URL 注入（外部进程，harness 域外）；缺席 = 留痕 skip。
//
// 锚核对（契约意向锚 vs 实现实锚——双核对于 2026-11-13 HEAD；divergence = fix/disc 上报，
// 禁止脚本内就地调和；spec 以下列实锚断言）：
//   [disc-J1-a] 意向锚 data-dswf-project-panel（面板根）未实现——面板无根锚；行实锚 =
//       data-dswf-project="<projectId>"（ui/sidebar/ForgeWorkspacePanel.tsx:570）。
//   [disc-J1-b] 意向锚 data-dswf-project-row 未实现——同上行实锚 data-dswf-project。
//   [disc-J1-c] 意向锚 data-dswf-wt-row（侧栏项目树 worktree 行）未实现——实现投影 =
//       项目 → 会话行（data-dswf-session）；worktree 维度归 hero 双 select（实现演化，
//       ui/sidebar/ForgeWorkspacePanel.tsx）。data-dswf-wt-row 现役位 = detail-section
//       概览 wt 行（data-path 键——语义不同位，J2 域）。
//   [disc-J1-d] 意向锚 data-dswf-hero-dual/-project/-worktree 未实现——hero picker 无
//       data 锚；实锚 = 可访问名/结构词（chip aria 名、role=menu ∪ .dswf-hero-picker-list
//       双锚——e2e/support/rpc.ts 既定兼容形态）。
//   [锚差-合流] 意向锚 data-dswf-hero-empty → 实现实锚 = data-dswf-hero（HeroEmpty.tsx:26）
//       + data-dswf-cta="add-project"（CTA）。
//   槽 id 机械锚全部实锚吻合：sidebar.workspaces / conversation.hero.workspace
//   （ui/sidebar-face.ts:39、ui/hero-picker-face.ts:37）。
//
// 留痕 skip（通道缺失记账——契约 Outcome 无法在 e2e 环境构造，非退役候选）：
//   - CT-J1-E2 数据链断裂注入 / CT-J1-G5 反轮询计量：无故障注入缝；
//   - CT-J1-E1 零项目空态：统一口径舞台为在册宿主（项目非空），零项目态不可在不重建
//     官方宿主前提下构造；
//   - host 真值对照（tryForgeInvoke）：桥缺席形态如实降级为 UI 侧断言（单校形态标注）。
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
let consoleErrorsTail: readonly string[] = []

test.beforeAll(async () => {
  harness = await openOfficialPage(stage as OfficialHostStage)
  await installViaPluginManager(harness.page, stage as OfficialHostStage, [])
  consoleErrorsTail = harness.consoleErrors
})

test.afterAll(async () => {
  if (harness !== undefined) await harness.close()
})

/** 项目行定位（实锚 data-dswf-project，行键 = projectId） */
function projectRow(page: Page, projectId: string) {
  return page.locator(`[data-dswf-project="${projectId}"]`).first()
}

test('@project-e2e @project-panel CT-J1-G1 槽顶替注册生效：项目列表整段呈现、官方 WorkspaceBrowser 离场', async () => {
  test.setTimeout(300_000)
  const page = harness.page
  // CT-J1-G1 Output：插件顶替组件行集呈现（≥1 行——统一口径舞台在册项目）
  await expect(page.locator('[data-dswf-project]').first(), 'CT-J1-G1 O-mounted：项目行呈现（data-dswf-project）').toBeVisible({ timeout: 60_000 })
  // CT-J1-G1 Invariants：官方 WorkspaceBrowser 词汇零呈现（顶替语义完整——插件行在场 + 官方
  // 单条目形态缺席。反向锚 = 顶替组件动作词汇在场即占位者为本件）
  await page.locator('[data-dswf-project] .dswf-sidebar-project-row').first().hover() // 动作面 = 行尾 hover 槽（官方 rowActions 同型，默认隐藏）；hover 须落标题行本体
  await expect(page.locator('[data-dswf-project-action]').first(), 'CT-J1-G1：顶替组件动作面在场（官方占用者被取代）').toBeVisible()
  // CT-J1-G1 Outcome 边界：零报错（fail-soft 纪律——O-error-toast FAIL 分支反向锚）
  expect(consoleErrorsTail, 'CT-J1-G1：零渲染报错（O-error-toast 反向锚）').toEqual([])
})

test('@project-e2e @project-panel CT-J1-G2 层级投影一致：项目行展开 → 会话行投影与 host 登记一致', async () => {
  test.setTimeout(300_000)
  const page = harness.page
  // host 真值（bridge 软通道——缺席 = 单校形态留痕，不伪造对照）
  const projects = await tryForgeInvoke<readonly { id: string; name: string }[]>(page, 'forge:projects/list')
  test.skip(projects === null, 'CT-J1-G2 host 真值对照：dshForge 桥缺席（单校形态）——对照留痕 skip')
  const first = (projects as readonly { id: string; name: string }[])[0] as { id: string; name: string }
  expect(first.id, 'CT-J1-G2 前置：host 登记项目非空').toBeTruthy()
  await expect(projectRow(page, first.id), 'CT-J1-G2：host 登记项目在面板投影中（行键 = projectId）').toBeVisible({ timeout: 30_000 })
  // CT-J1-G2 Output：展开行 → 子投影行呈现（实锚 data-dswf-session——[disc-J1-c] 投影维度
  // 实现为项目 → 会话行；契约意向 wt-row 维度 divergence 已 disc 上报，不就地调和）
  await projectRow(page, first.id).click()
  await expect(page.locator(`[data-dswf-project="${first.id}"] [data-dswf-session]`).first(), 'CT-J1-G2：展开后子投影行呈现').toBeVisible({ timeout: 15_000 })
})

test('@project-e2e @project-panel CT-J1-G3 行点击 openWorkspace 等价链路：主视图切至所点项目上下文', async () => {
  test.setTimeout(300_000)
  const page = harness.page
  const projects = await tryForgeInvoke<readonly { id: string; name: string }[]>(page, 'forge:projects/list')
  test.skip(projects === null, 'CT-J1-G3 项目名对照：dshForge 桥缺席——留痕 skip')
  const target = (projects as readonly { id: string; name: string }[])[0] as { id: string; name: string }
  expect(target.id, 'CT-J1-G3 前置：host 登记项目非空').toBeTruthy()
  // CT-J1-G3 Input：点击项目行（行点击 = openWorkspace 等价链路——ui/sidebar/README 洞位语义）
  await projectRow(page, target.id).click()
  // CT-J1-G3 Output：主视图装配切换到该上下文（hero 芯片可访问名 = 选中项词汇——所见即所得）
  await expect(
    page.getByRole('button', { name: new RegExp(target.name) }).first(),
    'CT-J1-G3 O-opened：上下文芯片呈现所点项目（WYSIWYG）',
  ).toBeVisible({ timeout: 30_000 })
})

test('@project-e2e @project-panel CT-J1-G4 hero 双 select：级联收敛 + WYSIWYG 归属', async () => {
  test.setTimeout(300_000)
  const page = harness.page
  // CT-J1-G4 Input：hero 芯片开弹层（双锚兼容——官方 Menu ∪ 影子弹层卡，rpc.ts 既定形态）
  const chip = page.getByRole('button', { name: /默认工作区|选择工作区/ }).first()
  test.skip((await chip.count()) === 0, 'CT-J1-G4 前置：hero 芯片（未绑定词汇）缺席——舞台已绑定态，留痕 skip')
  await chip.click()
  // 实锚 = role=menu ∪ .dswf-hero-picker-list（[disc-J1-d]——意向 data 锚未实现，divergence 已上报）
  const menu = page.locator('[role="menu"], .dswf-hero-picker-list').first()
  await expect(menu, 'CT-J1-G4：项目弹层在场（第一级）').toBeVisible({ timeout: 15_000 })
  const firstItem = menu.locator('button, [role="menuitem"], [role="menuitemradio"], [role="option"]').first()
  const projectName = (await firstItem.innerText()).trim()
  await firstItem.click()
  // CT-J1-G4 Invariants：第二级收敛 = 第一级所选项目的 worktree 集合（弹层换层呈现）
  await expect(menu, 'CT-J1-G4：第二级（worktree）弹层收敛呈现').toBeVisible({ timeout: 15_000 })
  const wtItem = menu.locator('button, [role="menuitem"], [role="menuitemradio"], [role="option"]').first()
  const wtName = (await wtItem.innerText()).trim()
  await wtItem.click()
  // 跨树改选风险确认门（1.19 官方词汇）——在场即确认
  const confirm = page.getByRole('button', { name: /确认|继续/ }).first()
  if ((await confirm.count()) > 0) await confirm.click({ force: true }).catch(() => {})
  // CT-J1-G4 Output：芯片回填所选值（显示 = 归属，O-wysiwyg-bound）
  // bug 3d453e91 弱断言修复④：拆 OR 断言——一级项目名与二级 worktree 归属分别独立断言
  //   （原 `${projectName}|${wtName}` OR 式：二级归属缺失时仅凭项目名命中即绿，弱断言失效）
  const boundChip = page.getByRole('button', { name: new RegExp(projectName) }).first()
  await expect(boundChip, 'CT-J1-G4 O-wysiwyg-bound（一级）：芯片回填一级项目名').toBeVisible({ timeout: 30_000 })
  await expect(boundChip, 'CT-J1-G4 O-wysiwyg-bound（二级）：芯片呈现二级 worktree 归属（WYSIWYG 归属缺失红）').toContainText(wtName)
})

test('@project-e2e @project-panel CT-J1-G5 follow 流推送：新项目零刷新出现', async () => {
  test.setTimeout(300_000)
  const page = harness.page
  const before = await page.locator('[data-dswf-project]').count()
  test.skip(before === 0, 'CT-J1-G5 前置：面板零行（桥缺席或空态）——留痕 skip')
  // Input：host 侧登记新项目（tool 面等价径 = forge:projects/register——正典注册通道）
  const registered = await tryForgeInvoke<{ projectId: string }>(page, 'forge:projects/register', {
    workspaceDir: process.env.E2E_J1_FIXTURE_DIR ?? '',
    name: 'j1-follow-probe',
    forgeDir: '',
  })
  test.skip(registered === null, 'CT-J1-G5 注入通道：dshForge 桥缺席 / 夹具未配（E2E_J1_FIXTURE_DIR）——留痕 skip')
  // Output：不刷新页面前提下推流到达自动出现（零 page.reload——推流 vs 轮询分界）
  await expect(page.locator('[data-dswf-project]').nth(before), 'CT-J1-G5 O-pushed：新行推流到达自动出现').toBeVisible({ timeout: 60_000 })
})

test('@project-e2e @project-panel CT-J1-E3 插件停用：顶替离场、零残骸（恢复官方占用语义）', async () => {
  test.setTimeout(300_000)
  const page = harness.page
  const before = await page.locator('[data-dswf-project]').count()
  test.skip(before === 0, 'CT-J1-E3 前置：顶替不在场——留痕 skip')
  // Input：插件页停用 project（plugin-manager UI——顶替随插件生命周期挂卸）
  await page.getByRole('button', { name: '插件', exact: true }).first().click({ force: true })
  await page.waitForTimeout(5_000)
  const disable = page.getByRole('button', { name: /^(停用|禁用)$/ }).first()
  test.skip((await disable.count()) === 0, 'CT-J1-E3 通道：停用控件缺席（已停用形态）——留痕 skip')
  await disable.click({ force: true })
  await page.waitForTimeout(8_000)
  // Output：插件 DOM 零残骸（O-residue FAIL 分支反向锚；官方组件恢复 = 顶替行集离场）
  await expect(page.locator('[data-dswf-project]'), 'CT-J1-E3 O-restored：插件面板零残骸').toHaveCount(0)
  // 清理：恢复启用（舞台交接纪律——被测插件回运行态）
  const enable = page.getByRole('button', { name: /^启用$/ }).first()
  if ((await enable.count()) > 0) {
    await enable.click({ force: true })
    await page.waitForTimeout(8_000)
  }
})

test('@project-e2e @project-panel CT-J1 留痕 skip（占位）', () => {
  test.skip(true, 'CT-J1-E1 零项目空态（统一口径舞台在册宿主，空态不可构造）+ CT-J1-E2 数据链断裂注入/恢复回正（无故障注入缝）+ CT-J1-E4 单 worktree 项目级联（依赖夹具注册通道）+ CT-J1-G5 反轮询计量（断言窗口内拉取增量不可观测）——通道缺失记账，非退役候选')
})
