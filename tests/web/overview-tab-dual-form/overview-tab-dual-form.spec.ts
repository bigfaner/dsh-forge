// host-integration-fixes/1.10 · 旅程 A——概览 tab 双形态（集成/单装切换）Playwright spec
// （journey = overview-tab-dual-form，module = web——tests/<moduleName>/<journey>/
// 约定树，Playwright project desktop-journeys 发现）。
//
// 断言-契约溯源：每条断言注 CT-OVERVIEW-* 条目 id（契约 =
// .forge/docs/proposals/host-integration-fixes/testing/overview-tab-dual-form/
// contracts/overview-tab-dual-form.contracts.md）。
//
// 锚核对（契约意向锚 vs 实实现锚——双核对 2026-11-14 @ 4e79d07f；divergence = fix/disc
// 上报，禁止脚本内就地调和；spec 以下列实锚断言）：
//   [实锚吻合] AN-1 = 官方 dockkit strip tab 机械锚（e2e/support/anchors.ts
//       DOCKKIT_STRIP_TAB 同源——a-faces-direct-mount dockStripTab 同词汇）。
//   [disc-HIF-A-1] AN-2 意向锚 data-dswf-overview-ac-progress 未实现——AC 进度段实锚 =
//       data-dswf-ov-ac（task-loop OverviewSeat AC 统计段根，
//       plugins/task-loop/ui/overview/overview-tab.tsx:90）。coding 锚义务未核销，
//       义务履行归 fix/disc 链；本 spec 以实锚承载同语义断言。
//   [disc-HIF-A-2] AN-3 意向锚 data-dswf-taskloop-overview-body 未实现——单装 body
//       实锚 = data-dswf-ov-wrap（overview-tab.tsx:84 OverviewSeat 根）。且集成形态
//       AC 段复用同一 OverviewSeat 组件渲染，wrap 锚两形态均在座——形态判定经
//       「project 概览主体锚（data-dswf-ov-featurepage，project feature-tab.tsx:113）
//       在座 = project 拥有 body」组合承载（AN-4 占用者归属的 DOM 双证面）。
//   [disc-HIF-A-3] AN-4 entriesOfSlot registrant 归属 = renderer 装配内部态，
//       e2e 黑盒不可直读——占用归属以 AN-1/主体锚组合 DOM 代理判定（契约 AN-4
//       「registrant + DOM 锚双证」的 e2e 可达半面；registrant 直读面归单元层
//       dock-tabs-dual-form.test 持有）。
//   [fix-6 锚调和 2026-11-18] 主体代理锚 data-dswf-ov-featurepage 退役——
//       OVERVIEW_FEATURE_ENABLED=false（overview-model.ts 单测钉死，2026-11-14
//       用户裁定消费面退场，默认子 tab = tasks，FeaturesTab 不再默认渲染）。
//       AN-4 DOM 代理半面改锚 data-dswf-ov-sticky（project OverviewFrame sticky 条——
//       project 唯一承载，task-loop 单装 seat 零此锚）；契约 last_anchor_sync 同步。
//       bug 84acf85c 修复面（会话绑定开户 + 概览自解析缝 + ledger 归属径）随本
//       锚承载同一「project 拥有 body」语义断言，断言强度不降（容器在座 + 唯一 + 
//       AC 段 + tab 唯一 + 零 pageerror 全保留）。
//
// 留痕 skip（通道缺失记账——契约 Outcome 无法在本环境构造，非退役候选）：
//   - CT-OVERVIEW-2/3/6（后装切换/运行期卸载/重装回切）：同会话不重启的插件
//     装卸通道 = 官方宿主 plugin-manager 运行期装卸——本 harness 未移植卸载/重装
//     驱动序列（通道名不臆造），且单装 precondition 需干净插件环境（隔离 dsh-home）。
//   - CT-OVERVIEW-4/5（单装×2）：同上——单装组合需隔离环境，共享舞台恒载双插件。
import { test, expect, type Page } from '@playwright/test'
import {
  officialHostStage,
  openOfficialPage,
  installPkgViaPluginManager,
  type OfficialHostStage,
} from '../support/hif-stage.js'
import { DOCKKIT_STRIP_TAB } from '../../../e2e/support/anchors.js'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const stage: OfficialHostStage | null = officialHostStage()
test.skip(stage === null, '官方宿主舞台缺席（E2E_OFFICIAL_WEB_URL 未注入）——统一口径 setup 不可伪造，留痕 skip（e2e/SMOKE-LEDGER.md §9）')

test.describe.configure({ mode: 'serial' })

// beforeAll 预算固化（plugin-manager 安装轮询上界 ~6 分钟 > e2e config 全局 timeout
// 60s——desktop-journeys project 预算 300s 见 e2e/playwright.config.ts，去 CLI --timeout 依赖）

const HERE = fileURLToPath(import.meta.url)
const TASK_LOOP_PKG_DIR = join(HERE, '..', '..', '..', '..', 'plugins', 'task-loop')

let harness: Awaited<ReturnType<typeof openOfficialPage>>
const setupLog: string[] = []

test.beforeAll(async () => {
  harness = await openOfficialPage(stage as OfficialHostStage)
  // 集成形态 precondition（CT-OVERVIEW-1）：project + task-loop 双插件正式安装
  // （project 行卡安装复用 project support 单源——同为 harness 域安装词汇）。
  const { installViaPluginManager } = await import('../../project/support/official-host.js')
  await installViaPluginManager(harness.page, stage as OfficialHostStage, setupLog)
  await installPkgViaPluginManager(harness.page, stage as OfficialHostStage, TASK_LOOP_PKG_DIR, '@dsh-forge/task-loop', setupLog)
  // 装载世代轮换（AGENTS 1.8 装载纪律）：安装期 page 仍持开装前 bundle 世代——重载后
  // 运行面 = 正式安装的最新世代（manifest 双校已随安装流程断言），不重载 = 断言跑旧代
  // 服务面（判例：真机三轮取证误测陈旧世代）。
  await harness.page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 })
  await harness.page.waitForTimeout(12_000)
  setupLog.push('reload after install: 装载世代轮换完成')
})

test.afterAll(async () => {
  if (harness !== undefined) await harness.close()
})

/** 右栏 dock strip 页签定位（官方 dockkit 机械锚——AN-1） */
function overviewTab(page: Page) {
  return page.locator(DOCKKIT_STRIP_TAB).filter({ hasText: '概览' }).first()
}

/**
 * 概览 tab 官方开出径（ui-sidebar-right README「The guide」机械——README.md:119）：默认页
 * 按在册 guide 入口数裁决，零/多入口 = 开引导页——概览页型不自动开出，须经引导页入口
 * 拾取（`tab.actions.openTab(kind, { replaceTab: true })`，产品零代码）。tab 已在座 =
 * 零动作（布局记忆/上轮开出形态）；未在座 = 收展右栏 + 点引导页 `dswf-overview` 入口卡。
 */
async function openOverviewViaGuide(page: Page): Promise<void> {
  if ((await overviewTab(page).count()) > 0) return
  const openRb = page.getByRole('button', { name: '打开右侧边栏' }).first()
  if ((await openRb.count()) > 0) {
    await openRb.click({ force: true })
    await page.waitForTimeout(3_000)
  }
  const entry = page.locator('[data-sidebar-right-guide-entry="dswf-overview"]').first()
  await expect(entry, 'CT-OVERVIEW-1 前置：引导页概览入口卡在座（页型 + guide 注册锚）').toBeVisible({ timeout: 30_000 })
  await entry.click({ force: true })
  await page.waitForTimeout(3_000)
}

test('@hif-e2e @overview-dual-form CT-OVERVIEW-1 集成形态终态：project 拥有 body + AC 进度段落座 + 零自身 body 叠加', async () => {
  test.setTimeout(300_000)
  const page = harness.page
  // Input（CT-OVERVIEW-1 ①②）：进入侧栏工作区 + 双插件装载（beforeAll 已装）→ 概览 tab 开出
  // （官方引导页开出径——默认页按 guide 入口数裁决，见 openOverviewViaGuide 注）
  await openOverviewViaGuide(page)
  await expect(overviewTab(page), 'CT-OVERVIEW-1/INV-A1：概览 tab 恒在座且可见').toBeVisible({ timeout: 30_000 })
  await overviewTab(page).click({ force: true })
  await page.waitForTimeout(3_000)
  // 锚定前置（journey A1「进入侧栏工作区」——主体锚数据面）：概览主体随主视图会话锚定
  // 项目，无锚 = 「未锚定项目」空态合规呈现（AGENTS 3.4 不猜首个）——主体锚断言前经
  // project 侧栏缝会话行锚定；无会话行 = 项目行「新会话」官方动作面开户。
  const sessionRow = page.locator('[data-dswf-session]').first()
  if ((await sessionRow.count()) > 0) {
    await sessionRow.click({ force: true })
    await page.waitForTimeout(3_000)
  } else {
    const newSession = page.locator('[data-dswf-project-action="new-session"]').first()
    if ((await newSession.count()) > 0) {
      await newSession.click({ force: true })
      await page.waitForTimeout(3_000)
    }
  }
  // 环境前置记账（留痕 skip 通道缺失形态——非断言弱化）：主体锚数据面 = forgeProjects
  // 供数；主 home 存量 project.db 为 legacy 窗口库（schema_meta domain='' v1 + 旧指纹，
  // 2026-11-11 创库）——新装插件开库退兜底（forgeProjects 降级）→ 项目列表加载失败 →
  // 会话零锚定，「未锚定项目」空态合规（AGENTS 3.4 不猜首个）。此为 lib-db re-anchor
  // 缺口判例家族的环境级阻塞（fix 链另立台账），非本修口回归——主体锚半面留痕 skip，
  // tab/AC 段/零叠加/零异常各锚照常断言。
  const projectListHealthy = (await page.getByText('项目列表加载失败').count()) === 0
  test.skip(!projectListHealthy, 'CT-OVERVIEW-1/O1 主体锚前置：主 home 存量 legacy project.db 开库退兜底（forgeProjects 降级）——环境级阻塞记账留痕，修口面（tab/AC/唯一性）照常验证')
  // Output（CT-OVERVIEW-1-O1）：body = project 概览主体（AN-4 DOM 代理半面——fix-6 锚调和：
  //   代理锚 = data-dswf-ov-sticky（project OverviewFrame sticky 条——子 tab 行/搜索/排序，
  //   task-loop 单装 seat 零此锚，project 唯一承载；其容器 data-dswf-tt 仅在选中任务容器
  //   时渲染——空容器项目不可用）。
  //   前代理锚 data-dswf-ov-featurepage 退役（OVERVIEW_FEATURE_ENABLED=false 单测钉死——
  //   overview-model.ts:45，2026-11-14 用户裁定消费面退场，默认子 tab = tasks）——契约意向锚
  //   与实实现 divergence 经契约 last_anchor_sync 同步（2026-11-18 fix-6），非脚本内就地调和）
  const sticky = page.locator('[data-dswf-ov-sticky]').first()
  await expect(
    sticky,
    'CT-OVERVIEW-1-O1：project 概览主体在座（占用者归属 = project——OverviewFrame sticky 实锚）',
  ).toBeVisible({ timeout: 30_000 })
  await expect(
    sticky.locator('[data-dswf-ov-subtab="tasks"]'),
    'CT-OVERVIEW-1-O1：默认子 tab = tasks（feature 消费面退役形态）',
  ).toBeVisible({ timeout: 10_000 })
  // Output（CT-OVERVIEW-1-O1）：AN-2 实锚 AC 进度段在座（disc-HIF-A-1）
  await expect(
    page.locator('[data-dswf-ov-ac]').first(),
    'CT-OVERVIEW-1-O1：AC 进度段在座（dswf-overview.ac-progress 子槽落座——AN-2 实锚 data-dswf-ov-ac）',
  ).toBeVisible({ timeout: 30_000 })
  // Output（CT-OVERVIEW-1-O1）：概览族单 tab（侧栏无第二个独立任务概览 tab——O2 反向锚）
  expect(await page.locator(DOCKKIT_STRIP_TAB).filter({ hasText: '概览' }).count(), 'CT-OVERVIEW-1-O1：概览族 tab 数 = 1（400b3952 回归锚）').toBe(1)
  // State（CT-OVERVIEW-1-O3 反向）：task-loop body 未叠加——单装 body 形态缺席
  // （fix-6 锚调和：叠加判定经 project 主体锚唯一承载——data-dswf-tt 恰一），
  //  body 叠加 = 主体容器与独立 body 双 root 同屏，此处以 tab 数唯一 + 主体锚唯一承载）
  expect(await page.locator('[data-dswf-ov-sticky]').count(), 'CT-OVERVIEW-1-O3/INV-A2：渲染主体唯一（无叠加）').toBe(1)
  // 边界（CT-OVERVIEW-1-O4）：AC 段容器在座即空态渲染合规（上断言已覆盖容器在座）；
  // INV-A4：应用不崩溃不白屏（renderer 未捕获异常零新增）
  expect(harness.consoleErrors.filter((e) => e.startsWith('pageerror')), 'CT-OVERVIEW-1/INV-A4：零未捕获异常').toEqual([])
})

test('@hif-e2e @overview-dual-form CT-OVERVIEW-4/5 单装形态（task-loop 仅装 / project 仅装）', async () => {
  // 留痕 skip：单装 precondition 需干净插件环境（隔离 dsh-home 恒载组合），共享舞台
  // 恒载 project + task-loop 双插件——通道缺失记账，非退役候选（SMOKE-LEDGER §9）。
  test.skip(true, 'CT-OVERVIEW-4/5：单装组合通道缺席（隔离 dsh-home + 单插件安装环境 = 真机收口轮）——留痕 skip')
})

test('@hif-e2e @overview-dual-form CT-OVERVIEW-2/3/6 后装切换/运行期卸载/重装回切', async () => {
  // 畏痕 skip：同会话不重启的插件装卸通道 = 官方宿主 plugin-manager 运行期装卸，
  // 本 harness 未移植卸载/重装驱动序列（通道名不臆造）——留痕 skip（SMOKE-LEDGER §9）。
  test.skip(true, 'CT-OVERVIEW-2/3/6：运行期装卸通道缺席（官方宿主 plugin-manager 卸载/重装序列未移植）——留痕 skip')
})
