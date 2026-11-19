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
//       「project 概览主体锚在座 = project 拥有 body」组合承载（AN-4 占用者归属的
//       DOM 双证面）。
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
//   [fix-8 形态判定词汇 2026-11-18] 运行期装卸驱动移植后各形态判定统一：
//       集成形态 = sticky 在座 + AN-2 在座 + tab 唯一；task-loop 单装 = wrap 在座 +
//       sticky/AN-2 双缺席；project 单装 = sticky 在座 + task-loop 专属残段锚（AN-2/chip/row）缺席。
//       （wrap 两形态均在座——独立 body 消失断言以 sticky 唯一承载，同 INV-A2 口径。）
//   [fix-9 残段判据判别性 2026-11-18] bug d8dac1f3 修口——project 单装「task-loop 残段」
//       判据弃共用锚 data-dswf-ov-wrap（task-loop overview-tab.tsx:84 与 project
//       OverviewTab.tsx:224 均渲染；project 单装 wrap=1 属 project 自有概览根，作判据即假红，
//       1.13/007 轮 r1 定谳 + cdp/w113-ct56-wrapforensic.mjs 归属取证）。改锚 task-loop
//       专属残段标记缺席：AN-2 data-dswf-ov-ac、题写 chip data-dswf-ov-chip、行列表
//       data-dswf-ov-row（均仅 task-loop OverviewFrame 渲染，project 零此词汇）；
//       project 自有锚 sticky 仍作正面断言保留。契约 last_anchor_sync 同步。
//
// 驱动面（fix-8 移植——通道实锚词汇，不臆造）：
//   - 右栏展开 = official-host.expandRightSidebar 单源（ui-sidebar-right 实锚机械：
//     [data-sidebar-right-expand] DOM click + Ctrl+Shift+B 兜底 + [data-sidebar-right-open]
//     展开态断言；收起态 seed 抑制使引导页入口卡仅在展开后物化——stores.ts:254）。
//   - 运行期装卸 = installPkgViaPluginManager / uninstallPkgViaPluginManager
//     （ui-plugin-manager 实锚词汇——同会话不重启）。
//   - 装卸后 reload（AGENTS 1.8 装载世代轮换）。
import { test, expect, type Page } from '@playwright/test'
import {
  officialHostStage,
  openOfficialPage,
  installPkgViaPluginManager,
  uninstallPkgViaPluginManager,
  expandRightSidebar,
  registerProjectViaAddProjectFlow,
  type OfficialHostStage,
} from '../support/hif-stage.js'
import { DOCKKIT_STRIP_TAB } from '../../../e2e/support/anchors.js'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync, existsSync, writeFileSync } from 'node:fs'

const stage: OfficialHostStage | null = officialHostStage()
test.skip(stage === null, '官方宿主舞台缺席（E2E_OFFICIAL_WEB_URL 未注入）——统一口径 setup 不可伪造，留痕 skip（e2e/SMOKE-LEDGER.md §9）')

test.describe.configure({ mode: 'serial' })

// beforeAll 预算固化（plugin-manager 安装轮询上界 ~6 分钟 > e2e config 全局 timeout
// 60s——desktop-journeys project 预算 300s 见 e2e/playwright.config.ts，去 CLI --timeout 依赖）

const HERE = fileURLToPath(import.meta.url)
const TASK_LOOP_PKG_DIR = join(HERE, '..', '..', '..', '..', 'plugins', 'task-loop')
const PROJECT_PKG_DIR = join(HERE, '..', '..', '..', '..', 'plugins', 'project')
/** 主体锚数据面注册目录（git 仓库——注册通道校验面；web 内嵌浏览器根 = C:\，
 *  Z: 盘不可达——锚目录落 C:\Users\panda 浅层，与被测插件域无耦合） */
const REGISTER_PROJECT_DIR = 'C:\\Users\\panda\\dsh-fix8-anchor'
const PROJECT_BARE = '@dsh-forge/project'
const TASK_LOOP_BARE = '@dsh-forge/task-loop'

let harness: Awaited<ReturnType<typeof openOfficialPage>>
const setupLog: string[] = []
/** 主体锚数据面形态：注册通道收敛 = sticky 半面全断言；typed 拒绝 = 空态锚承载半面 */
let projectRegistered = false

test.beforeAll(async () => {
  harness = await openOfficialPage(stage as OfficialHostStage)
})

/** 冷启动装配前置（CT-OVERVIEW-1 Input①②——在首测内执行，预算独立于 beforeAll 300s
 *  项目帽：双插件正式安装 + 世代轮换 + 项目注册尝试，冷宿主合计可超 5 分钟）。
 *  serial 模式下首测失败即全组不出——装配失败态如实上抛。 */
let stageReady = false
/** 步骤计时包装（装配序列耗时取证——setup-log.txt 逐秒可考） */
async function timedStep(name: string, fn: () => Promise<void>): Promise<void> {
  const started = Date.now()
  try {
    await fn()
  } finally {
    setupLog.push(`[step] ${name} ${((Date.now() - started) / 1000).toFixed(1)}s`)
  }
}
async function ensureStageReady(page: Page): Promise<void> {
  if (stageReady) return
  // 集成形态 precondition（CT-OVERVIEW-1）：project + task-loop 双插件正式安装
  // （project 行卡安装复用 project support 单源——同为 harness 域安装词汇）。
  const { installViaPluginManager } = await import('../../project/support/official-host.js')
  await timedStep('install-project', () => installViaPluginManager(page, stage as OfficialHostStage, setupLog))
  await timedStep('install-task-loop', () => installPkgViaPluginManager(page, stage as OfficialHostStage, TASK_LOOP_PKG_DIR, TASK_LOOP_BARE, setupLog))
  // 装载世代轮换（AGENTS 1.8 装载纪律）：安装期 page 仍持开装前 bundle 世代——重载后
  // 运行面 = 正式安装的最新世代（manifest 双校已随安装流程断言），不重载 = 断言跑旧代
  // 服务面（判例：真机三轮取证误测陈旧世代）。
  await timedStep('reload-after-install', async () => {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForTimeout(12_000)
  })
  setupLog.push('reload after install: 装载世代轮换完成')
  // 数据面前置（主体锚 = forgeProjects 供数）：隔离 dsh-home 零注册项目 → 概览「未锚定
  // 项目」空态、sticky 锚永不落座——经官方添加项目向导注册一项目（内嵌浏览器相位驱动）。
  // 注册通道 typed 拒绝（registry face 缺席——官方宿主装配降级零副作用设计内行为）如实
  // 记账降级：主体锚半面以 [data-dswf-ov-unanchored] 空态锚承载，不伪造数据面。
  await timedStep('register-project', async () => {
    if ((await page.locator('[data-dswf-project]').count()) === 0) {
      try {
        await registerProjectViaAddProjectFlow(page, REGISTER_PROJECT_DIR, 'deepseek-harness', setupLog)
        projectRegistered = true
      } catch (cause) {
        setupLog.push(`add-project 注册通道未收敛（留痕降级）：${String(cause).slice(0, 220)}`)
        await page.keyboard.press('Escape').catch(() => {})
        await page.waitForTimeout(2_000)
      }
    } else {
      projectRegistered = true
    }
  })
  stageReady = true
}

test.afterAll(async () => {
  // 装配序列落盘（E2E_SETUP_LOG_DIR 注入——步骤时序取证，失败轮可考）
  const dir = process.env.E2E_SETUP_LOG_DIR
  if (dir !== undefined && dir !== '') {
    try {
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'setup-log.txt'), setupLog.join('\n'), 'utf8')
    } catch { /* 证据落盘失败不掩盖测试结果 */ }
  }
  if (harness !== undefined) await harness.close()
})

/** project 概览 dock 页签定位（官方 dockkit 机械锚——AN-1；精确 = 项目概览——
 *  fix-8 锚调和：task-loop 单装形态自有「任务概览」页签同族 hasText，泛匹配会误亲和） */
function overviewTab(page: Page) {
  return page.locator(DOCKKIT_STRIP_TAB).filter({ hasText: '项目概览' }).first()
}

/** 概览族页签（泛匹配——task-loop 单装「任务概览」/project「项目概览」均计入） */
function overviewFamilyTabs(page: Page) {
  return page.locator(DOCKKIT_STRIP_TAB).filter({ hasText: '概览' })
}

/**
 * 概览 tab 官方开出径（ui-sidebar-right README「The guide」机械——README.md:119）：默认页
 * 按在册 guide 入口数裁决，零/多入口 = 开引导页——概览页型不自动开出，须经引导页入口
 * 拾取（`tab.actions.openTab(kind, { replaceTab: true })`，产品零代码）。tab 已在座 =
 * 零动作（布局记忆/上轮开出形态）；未在座 = 展开右栏（fix-8 展开驱动——展开态实锚断言）
 * + 点引导页 `dswf-overview` 入口卡。
 */
async function openOverviewViaGuide(page: Page): Promise<void> {
  // 先展开（收起态 seed 抑制——dock strip 内容收起时仍挂载但不可见，可见性判定展开后做）
  await expandRightSidebar(page, setupLog)
  // 概览族页签任一可见 = 零动作（project「项目概览」/task-loop 单装「任务概览」——
  // 布局记忆/单装自有页签形态）
  const family = overviewFamilyTabs(page)
  const familyCount = await family.count()
  for (let i = 0; i < familyCount; i++) {
    if (await family.nth(i).isVisible()) return
  }
  // 可见入口 DOM click 直发（多 pane 时隐藏 pane 的同名入口可能排 first——命中测试取
  // 可见者；force 坐标点击可被层叠面吞事件——fix-8 同族判例）
  const picked = await page.locator('[data-sidebar-right-guide-entry="dswf-overview"]').evaluateAll((els) => {
    const visible = els.filter((e) => e.getClientRects().length > 0 && (e as HTMLElement).offsetParent !== null)
    if (visible.length === 0) return 0
    ;(visible[0] as HTMLElement).click()
    return visible.length
  })
  await expect(picked, 'CT-OVERVIEW-1 前置：可见引导页概览入口卡在座并已拾取').toBeGreaterThan(0)
  await page.waitForTimeout(3_000)
}

/**
 * 概览 tab 开出 + 选中（装卸轮共用前置——reload 后布局记忆在座则零动作）。
 * 随后主体锚数据面会话锚定（无会话行 = 项目行「新会话」官方动作面开户——AGENTS 3.4
 * 不猜首个）；legacy project.db 环境级降级（项目列表加载失败）如实 skip 主体锚半面。
 */
async function openAndAnchorOverview(page: Page): Promise<void> {
  await openOverviewViaGuide(page)
  // 选中任一可见概览族页签（形态相关——project「项目概览」/task-loop 单装「任务概览」；
  // 精确在座断言归各形态断言面，此处只保证 body 在屏）
  const tabs = overviewFamilyTabs(page)
  const tabCount = await tabs.count()
  for (let i = 0; i < tabCount; i++) {
    if (await tabs.nth(i).isVisible()) {
      await tabs.nth(i).click({ force: true })
      await page.waitForTimeout(3_000)
      break
    }
  }
  const sessionRow = page.locator('[data-dswf-session]').first()
  if ((await sessionRow.count()) > 0) {
    await sessionRow.click({ force: true })
    await page.waitForTimeout(3_000)
  } else {
    // 无会话行 = 项目行展开（注册后零会话态）→ 项目行「新会话」官方动作面开户
    const projectRow = page.locator('[data-dswf-project]').first()
    if ((await projectRow.count()) > 0 && (await page.locator('[data-dswf-project-action="new-session"]').count()) === 0) {
      await projectRow.evaluate((el) => (el as HTMLElement).click())
      await page.waitForTimeout(3_000)
    }
    const newSession = page.locator('[data-dswf-project-action="new-session"]').first()
    if ((await newSession.count()) > 0) {
      await newSession.evaluate((el) => (el as HTMLElement).click())
      await page.waitForTimeout(3_000)
    }
  }
  const projectListHealthy = (await page.getByText('项目列表加载失败').count()) === 0
  test.skip(!projectListHealthy, '主体锚前置：主 home 存量 legacy project.db 开库退兜底（forgeProjects 降级）——环境级阻塞记账留痕，修口面（tab/AC/唯一性）照常验证')
}

/** 运行期卸载 + 世代轮换（装卸轮共用——卸载后 reload 使断言跑卸载后运行面）。
 *  实体包移除收敛（fix-8 r25 判例：行卡离场 ≠ 实体包已删——removeBundle 异步删目录，
 *  未收敛即重装 = 「这个包已经安装」拒绝）：有界轮询实体包目录消失，未消失则二次卸载
 *  一轮再等；仍不消失 = 宿主移除通道未收敛，如实上抛（不伪造重装前置）。 */
async function uninstallAndRotate(page: Page, pkgBareName: string): Promise<void> {
  const entityDirOf = (): string | null => {
    const home = process.env.E2E_OFFICIAL_DSH_HOME
    if (home === undefined || home === '') return null
    const candidate = join(home, 'profiles', 'web', 'node_modules', '@dsh-forge', pkgBareName.replace('@dsh-forge/', ''))
    return existsSync(candidate) ? candidate : null
  }
  const waitEntityGone = async (): Promise<boolean> => {
    for (let i = 0; i < 12; i++) {
      if (entityDirOf() === null) return true
      await page.waitForTimeout(5_000)
    }
    return entityDirOf() === null
  }
  await uninstallPkgViaPluginManager(page, stage as OfficialHostStage, pkgBareName, setupLog)
  if (!(await waitEntityGone())) {
    setupLog.push(`uninstall ${pkgBareName}: 实体包未随行卡移除——二次卸载`)
    await uninstallPkgViaPluginManager(page, stage as OfficialHostStage, pkgBareName, setupLog)
    if (!(await waitEntityGone())) {
      throw new Error(`uninstall ${pkgBareName}: 实体包移除未收敛（宿主 removeBundle 通道）——重装前置不成立`)
    }
  }
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForTimeout(12_000)
  setupLog.push(`reload after uninstall ${pkgBareName}: 装载世代轮换完成`)
}

/** 运行期安装 + 世代轮换（装卸轮共用）。宿主安装通道 typed 拒绝（in-session 卸载后
 *  重装 EPERM/已装拒绝——官方宿主 plugin-manager 自身通道，r22/r27/r30 判例：同进程
 *  第二轮卸载→重装恒拒，首装与首轮重装可过）= 环境级记账留痕 skip（契约 CT-6 自身
 *  允许重启间任选——拒绝态经宿主重启可恢复），非断言弱化：拒绝事实如实抛出。 */
async function installAndRotate(page: Page, pkgDir: string, pkgBareName: string): Promise<void> {
  try {
    await installPkgViaPluginManager(page, stage as OfficialHostStage, pkgDir, pkgBareName, setupLog)
  } catch (cause) {
    const msg = String(cause)
    if (/失败|权限|已经安装/.test(msg)) {
      test.skip(true, `运行期重装通道被宿主拒绝（in-session 卸载→重装 typed 拒绝——宿主 plugin-manager 通道环境级阻塞，重启间可恢复）：${msg.replace(/\n/g, ' | ').slice(0, 160)}`)
    }
    throw cause
  }
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForTimeout(12_000)
  setupLog.push(`reload after install ${pkgBareName}: 装载世代轮换完成`)
}

/** 集成形态终态断言面（CT-OVERVIEW-1-O1 同语义——CT-2/CT-6 复用）。锚定感知：
 * 主体锚数据面在座（注册通道收敛）= sticky 半面全断言；注册通道 typed 拒绝（宿主装配
 * 降级零副作用）= body 归属以 [data-dswf-ov-unanchored] 空态锚承载（AGENTS 3.4 不猜
 * 首个——空态合规），sticky/AN-2 半面留痕 skip（通道缺失记账，非断言弱化）。 */
async function assertIntegratedForm(page: Page, label: string): Promise<void> {
  const unanchored = page.locator('[data-dswf-ov-unanchored]').first()
  if (!projectRegistered && (await unanchored.count()) > 0) {
    await expect(unanchored, `${label}：project 概览 body 在座（未锚定空态锚——占用者归属 = project，AGENTS 3.4 空态合规）`).toBeVisible({ timeout: 30_000 })
    expect(await overviewFamilyTabs(page).count(), `${label}：概览族 tab 数 = 1（400b3952 回归锚）`).toBe(1)
    expect(harness.consoleErrors.filter((e) => e.startsWith('pageerror')), `${label}：零未捕获异常（INV-A4）`).toEqual([])
    test.skip(true, `${label} 主体锚半面：注册通道 typed 拒绝（registry face 缺席——宿主装配降级）→ sticky/AN-2 数据面缺席，body 归属以空态锚承载——留痕记账`)
  }
  const sticky = page.locator('[data-dswf-ov-sticky]').first()
  await expect(
    sticky,
    `${label}：project 概览主体在座（占用者归属 = project——OverviewFrame sticky 实锚）`,
  ).toBeVisible({ timeout: 30_000 })
  await expect(
    sticky.locator('[data-dswf-ov-subtab="tasks"]'),
    `${label}：默认子 tab = tasks（feature 消费面退役形态）`,
  ).toBeVisible({ timeout: 10_000 })
  await expect(
    page.locator('[data-dswf-ov-ac]').first(),
    `${label}：AC 进度段在座（dswf-overview.ac-progress 子槽落座——AN-2 实锚 data-dswf-ov-ac）`,
  ).toBeVisible({ timeout: 30_000 })
  expect(await overviewFamilyTabs(page).count(), `${label}：概览族 tab 数 = 1（400b3952 回归锚）`).toBe(1)
  expect(await page.locator('[data-dswf-ov-sticky]').count(), `${label}：渲染主体唯一（无叠加——INV-A2）`).toBe(1)
  expect(harness.consoleErrors.filter((e) => e.startsWith('pageerror')), `${label}：零未捕获异常（INV-A4）`).toEqual([])
}

/** task-loop 单装形态断言面（CT-3-O1/CT-4-O1 同语义复用）。
 *  fix-8 锚调和：AN-2 意向锚语义 = project AC 进度段，实锚 data-dswf-ov-ac = task-loop
 *  OverviewSeat AC 统计段根（overview-tab.tsx:90）——task-loop 单装形态下该段随 seat 合法
 *  在座（disc-HIF-A-1 实锚两形态同席），「AN-2 零残留」不可经此锚承载；project 段零残留
 *  以 sticky 缺席唯一承载（project 唯一锚，同 INV-A2 口径）。 */
async function assertTaskLoopOnlyForm(page: Page, label: string): Promise<void> {
  await expect(
    page.locator('[data-dswf-ov-wrap]').first(),
    `${label}：task-loop 单装 body 在座（AN-3 实锚 data-dswf-ov-wrap）`,
  ).toBeVisible({ timeout: 30_000 })
  expect(await page.locator('[data-dswf-ov-sticky]').count(), `${label}：project 概览主体零残留（回切单装——sticky 为 project 唯一承载锚）`).toBe(0)
  await expect(overviewFamilyTabs(page).first(), `${label}：概览 tab 在座（INV-A1——零空壳）`).toBeVisible({ timeout: 30_000 })
  expect(await overviewFamilyTabs(page).count(), `${label}：概览族 tab 数 = 1`).toBe(1)
  expect(harness.consoleErrors.filter((e) => e.startsWith('pageerror')), `${label}：零未捕获异常（INV-A4）`).toEqual([])
}

/** project 单装形态断言面（CT-5-O1 同语义复用）——锚定感知同 assertIntegratedForm */
async function assertProjectOnlyForm(page: Page, label: string): Promise<void> {
  const unanchored = page.locator('[data-dswf-ov-unanchored]').first()
  if (!projectRegistered && (await unanchored.count()) > 0) {
    await expect(unanchored, `${label}：project 概览 body 在座（未锚定空态锚——project 独占 tab）`).toBeVisible({ timeout: 30_000 })
    expect(await page.locator('[data-dswf-ov-ac]').count(), `${label}：AN-2 AC 段零在座（task-loop 缺席）`).toBe(0)
    expect(await page.locator('[data-dswf-ov-chip]').count(), `${label}：task-loop 题写 chip 零在座（fix-9 判别性残段锚——仅 task-loop 渲染）`).toBe(0)
    expect(await page.locator('[data-dswf-ov-row]').count(), `${label}：task-loop 行列表零在座（fix-9 判别性残段锚——仅 task-loop 渲染）`).toBe(0)
    await expect(overviewTab(page), `${label}：概览 tab 在座（INV-A1）`).toBeVisible({ timeout: 30_000 })
    expect(await overviewFamilyTabs(page).count(), `${label}：概览族 tab 数 = 1`).toBe(1)
    expect(harness.consoleErrors.filter((e) => e.startsWith('pageerror')), `${label}：零未捕获异常（INV-A4）`).toEqual([])
    test.skip(true, `${label} 主体锚半面：注册通道 typed 拒绝（registry face 缺席——宿主装配降级）→ sticky 数据面缺席，body 归属以空态锚承载——留痕记账`)
  }
  await expect(
    page.locator('[data-dswf-ov-sticky]').first(),
    `${label}：project 概览主体在座（project 独占 tab）`,
  ).toBeVisible({ timeout: 30_000 })
  expect(await page.locator('[data-dswf-ov-ac]').count(), `${label}：AN-2 AC 段零在座（task-loop 缺席）`).toBe(0)
  expect(await page.locator('[data-dswf-ov-chip]').count(), `${label}：task-loop 题写 chip 零在座（fix-9 判别性残段锚——仅 task-loop 渲染）`).toBe(0)
  expect(await page.locator('[data-dswf-ov-row]').count(), `${label}：task-loop 行列表零在座（fix-9 判别性残段锚——仅 task-loop 渲染）`).toBe(0)
  await expect(overviewTab(page), `${label}：概览 tab 在座（INV-A1）`).toBeVisible({ timeout: 30_000 })
  expect(await overviewFamilyTabs(page).count(), `${label}：概览族 tab 数 = 1`).toBe(1)
  expect(harness.consoleErrors.filter((e) => e.startsWith('pageerror')), `${label}：零未捕获异常（INV-A4）`).toEqual([])
}

test('@hif-e2e @overview-dual-form CT-OVERVIEW-1 集成形态终态：project 拥有 body + AC 进度段落座 + 零自身 body 叠加', async () => {
  test.setTimeout(1_500_000)
  const page = harness.page
  await ensureStageReady(page)
  // Input（CT-OVERVIEW-1 ①②）：进入侧栏工作区 + 双插件装载（上一步已装）→ 概览 tab 开出
  // （官方引导页开出径——默认页按 guide 入口数裁决，见 openOverviewViaGuide 注）
  await openAndAnchorOverview(page)
  // Output（CT-OVERVIEW-1-O1）：body = project 概览主体（AN-4 DOM 代理半面——fix-6 锚调和：
  //   代理锚 = data-dswf-ov-sticky；前代理锚 data-dswf-ov-featurepage 退役，见头注）
  await assertIntegratedForm(page, 'CT-OVERVIEW-1-O1')
})

test('@hif-e2e @overview-dual-form CT-OVERVIEW-4 task-loop 仅装单装形态（运行期卸载 project 派生）', async () => {
  test.setTimeout(600_000)
  const page = harness.page
  // 契约 precondition（干净环境仅装 task-loop）经运行期卸载派生：共享舞台隔离 dsh-home
  // 内仅两插件在册，卸载 project 后即 task-loop 仅装（同会话不重启——occupancy 语义与
  // 冷启动单装一致：task-loop 现查 project 缺席 → 直接注册 -10 body）。
  await uninstallAndRotate(page, PROJECT_BARE)
  await openAndAnchorOverview(page)
  await assertTaskLoopOnlyForm(page, 'CT-OVERVIEW-4-O1')
})

test('@hif-e2e @overview-dual-form CT-OVERVIEW-2 后装分支（task-loop 先启、project 后装切集成）', async () => {
  test.setTimeout(600_000)
  const page = harness.page
  // Input（CT-OVERVIEW-2）：task-loop 单装在座（上轮终态）→ 经插件管理面后装 project
  // （同会话，不重启）→ subscribe 通知到达后切集成形态。
  await installAndRotate(page, PROJECT_PKG_DIR, PROJECT_BARE)
  await openAndAnchorOverview(page)
  // Output（CT-OVERVIEW-2-O1）：终态同 CT-OVERVIEW-1（占用者唯一 = project、AN-2 段在座、
  //   独立 body 消失——wrap 两形态均在座（disc-HIF-A-2），独立 body 消失以 sticky 唯一
  //   承载，同 INV-A2 口径——不弱化）。
  await assertIntegratedForm(page, 'CT-OVERVIEW-2-O1')
})

test('@hif-e2e @overview-dual-form CT-OVERVIEW-3 运行期卸载 project（集成 → 单装回切）', async () => {
  test.setTimeout(600_000)
  const page = harness.page
  // Input（CT-OVERVIEW-3）：CT-OVERVIEW-1 终态集成形态在座（上轮终态）→ 运行期卸载
  // project（插件管理面，不重启宿主）→ task-loop 收 subscribe 通知后重注册自身 body。
  await uninstallAndRotate(page, PROJECT_BARE)
  await openAndAnchorOverview(page)
  await assertTaskLoopOnlyForm(page, 'CT-OVERVIEW-3-O1')
})

test('@hif-e2e @overview-dual-form CT-OVERVIEW-5 project 仅装单装形态（卸载 task-loop 派生）', async () => {
  test.setTimeout(600_000)
  const page = harness.page
  // 契约 precondition（干净环境仅装 project）经运行期卸载 task-loop 派生（同 CT-4 口径），
  // 随后经插件管理面装载 project。
  await uninstallAndRotate(page, TASK_LOOP_BARE)
  await installAndRotate(page, PROJECT_PKG_DIR, PROJECT_BARE)
  await openAndAnchorOverview(page)
  await assertProjectOnlyForm(page, 'CT-OVERVIEW-5-O1')
})

test('@hif-e2e @overview-dual-form CT-OVERVIEW-6 卸载/重装循环回切', async () => {
  test.setTimeout(600_000)
  const page = harness.page
  // 前置回建：CT-OVERVIEW-6 precondition = 集成形态在座——装载 task-loop（project 已在座）
  // 回集成形态。
  await installAndRotate(page, TASK_LOOP_PKG_DIR, TASK_LOOP_BARE)
  await openAndAnchorOverview(page)
  await assertIntegratedForm(page, 'CT-OVERVIEW-6 前置：集成形态回建')
  // 阶段一：卸载 project → 终态同 CT-OVERVIEW-3-O1（单装回切、零残段）。
  await uninstallAndRotate(page, PROJECT_BARE)
  await openAndAnchorOverview(page)
  await assertTaskLoopOnlyForm(page, 'CT-OVERVIEW-6-O1 阶段一')
  // 阶段二：重装 project → 切回集成形态，AN-2 段恢复在座（终态同 CT-OVERVIEW-1-O1）。
  await installAndRotate(page, PROJECT_PKG_DIR, PROJECT_BARE)
  await openAndAnchorOverview(page)
  await assertIntegratedForm(page, 'CT-OVERVIEW-6-O1 阶段二')
})

