// expert-squad 1.31 旅程 e2e：[召唤] 官方会话缝（panel-card-grid step-1 迁出的召唤钮断言
// ——fix-3 判例承接，依赖 1.21 装配 onSummon）真机取证。
// journey = .forge/docs/features/expert-squad/testing/panel-card-grid/journey.md 步骤1（召唤入口）
// contracts = 同目录 contracts/step-1-activate-panel.md（头部结构含召唤钮）。
// 断言口径（AC）：1.21 装配 onSummon 后召唤钮在 panellist（左栏行）/面板头部可见且可触发。
// 触发结果双分支（装配事实，walkthrough phase4-fix13/fix14 实证）：e2e 载体下官方
// openWorkspace 缝形状解析失败 → 阶段化降级引导条（[data-dswf-summon-notice]，role=status，
// 人话文案、原始错误 console 留痕——fix-14）；preset-hr 真机部署场景 → 官方会话视图切换。
// 两分支均以官方视图切换或降级条任一呈现为触发成立判据，面板本体不炸（fail-soft）。
// 拦截纪律（fix-3 判例）：本 spec 零 fetch 拦截需求（召唤走官方服务缝非 fetch）；若后续
// 需拦截一律 addInitScript / 页面上下文内包装 window.fetch，禁 page.route（dsh-forge:// scheme）。
// Hard Rules：零产品源码改动；夹具 = 仓外 tmp；data 锚单源 = expert-panel.tsx（事实表）。
// @feature expert-squad @web-e2e
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeApp, launchHost } from '../support/launch.js'
import { registerProject } from '../support/rpc.js'
import { dismissOnboardingModals } from '../support/modals.js'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'

// ── 面板/召唤锚（expert-panel.tsx data 锚——本 spec 字面量单源） ──
const PANEL_ROW = 'button[aria-label="专家团"]'
const PANEL_ROOT = '[data-dswf-expert-panel]'
const CARD_ANY = '.dswf-card-grid .dswf-xcard'
const SUMMON_BTN = 'button[aria-label="召唤 HR 预设会话"]'
const SUMMON_NOTICE = '[data-dswf-summon-notice]'
const VIEW_ROOT = '[data-dswf-view]'

/** project 层夹具专家档案（面板数据态收敛用——召唤前置 = 面板已激活在数据态）。 */
function expertMd(name: string, title: string): string {
  return [
    '---',
    `name: ${name}`,
    'description: >-',
    '  Fixture expert for summon e2e; delegates when fixture flows are needed.',
    `title: ${title}`,
    'tools: [read, grep]',
    'skills: [review]',
    '---',
    '',
    '## 职责',
    '',
    '夹具人设正文：用于召唤前置数据态的固定文本。',
    '',
  ].join('\n')
}

/** 夹具工作区（两份启用 project 层档案） */
function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-xsq-summon-ws-'))
  const expertsDir = join(dir, '.dsh', 'experts')
  mkdirSync(expertsDir, { recursive: true })
  writeFileSync(join(expertsDir, 'test-reviewer.md'), expertMd('test-reviewer', '夹具评审'))
  writeFileSync(join(expertsDir, 'data-miner.md'), expertMd('data-miner', '夹具挖掘'))
  return dir
}

interface PanelSession {
  readonly page: Page
  readonly app: ElectronApplication
  readonly pageErrors: string[]
  readonly wsDir: string
  readonly userData: string
}

/** 启动 → 注册夹具工作区 → 激活面板（数据态收敛；召唤缝为官方服务缝，零 fetch 拦截）。 */
async function openPanelWithFixture(): Promise<PanelSession> {
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-xsq-summon-ud-'))
  const wsDir = makeWorkspace()
  const launched = await launchHost({ userData })
  const page = launched.page
  await registerProject(page, wsDir, 'xsq-summon-fixture')
  await dismissOnboardingModals(page)
  const row = page.locator(PANEL_ROW)
  await expect(row, '左栏「专家团」行在场（panellist 注册缝——召唤入口归属面）').toBeVisible({ timeout: 30_000 })
  await row.click()
  await expect(page.locator(PANEL_ROOT), '专家面板挂载').toBeVisible({ timeout: 30_000 })
  await expect(page.locator(CARD_ANY).first(), '卡片网格数据态（骨架收敛）').toBeVisible({ timeout: 30_000 })
  return { page, app: launched.app, pageErrors: launched.pageErrors, wsDir, userData }
}

/** 例终收口：closeApp + tmp 夹具清理（尽力而为）。 */
async function closeSession(session: PanelSession): Promise<void> {
  try {
    await closeApp(session.app)
  } catch {
    /* closeApp 尽力而为——进程残留由 Job Object 整树回收兜底 */
  }
  rmSync(session.userData, { recursive: true, force: true })
  rmSync(session.wsDir, { recursive: true, force: true })
}

/** 召唤触发成立判据（双分支轮询）：官方主视图切换（data-dswf-view 值变化——openWorkspace
 *  成功形态）或阶段化降级条呈现（缝缺席/被拒形态）。两分支任一即触发成立。 */
async function expectSummonTriggered(page: Page, viewBefore: string): Promise<string> {
  let verdict = ''
  await expect
    .poll(
      async () => {
        const viewNow = await page.locator(VIEW_ROOT).getAttribute('data-dswf-view')
        if (viewNow !== null && viewNow !== viewBefore) {
          verdict = `official-view:${String(viewNow)}`
          return true
        }
        if ((await page.locator(SUMMON_NOTICE).count()) > 0) {
          verdict = 'degrade-notice'
          return true
        }
        return false
      },
      { timeout: 30_000, message: '召唤触发成立（官方视图切换 或 降级条呈现）' },
    )
    .toBe(true)
  return verdict
}

// ── step-1（panel-card-grid 迁出断言）：召唤钮可见可触发 ──

test('@feature expert-squad summon step-1：召唤钮在面板头部可见可触发（1.21 装配 onSummon）', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page } = session
    // panellist 归属面：左栏行在场（AC「在panellist/面板内可见」前半）
    await expect(page.locator(PANEL_ROW), 'panellist「专家团」行在场').toBeVisible()
    // 面板头部召唤钮：可见 + 启用（onSummon 装配 = 钮呈现；未装配 = 钮不渲染——expert-panel.tsx 条件挂载）
    const summon = page.locator(SUMMON_BTN)
    await expect(summon, '召唤钮在面板头部呈现（onSummon 已装配）').toBeVisible()
    await expect(summon, '召唤钮启用态（非 busy）').toBeEnabled()
    await expect(summon, '召唤钮文案').toHaveText('召唤')
  } finally {
    await closeSession(session)
  }
})

test('@feature expert-squad summon step-1 trigger：点击触发——官方视图切换或阶段化降级条；面板不炸', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page } = session
    const viewBefore = (await page.locator(VIEW_ROOT).getAttribute('data-dswf-view')) ?? ''
    await page.locator(SUMMON_BTN).click()
    const verdict = await expectSummonTriggered(page, viewBefore)
    if (verdict === 'degrade-notice') {
      // 降级分支（e2e 载体实证形态——fix-14 阶段化）：role=status + 人话文案、零原始异常文本直出
      const notice = page.locator(SUMMON_NOTICE)
      await expect(notice, '降级条 role=status').toHaveAttribute('role', 'status')
      await expect(notice, '阶段化人话文案（create/workspace/preset 三阶段其一）').toContainText(
        /未找到当前打开的工作区|召唤会话打开失败|召唤失败|HR 预设/,
      )
      expect(await notice.innerText(), '零原始 TypeError 文本直出（fix-14）').not.toContain('Cannot read properties')
    }
    // 面板本体不炸（fail-soft）：面板根与卡片网格仍在场；召唤钮退出 busy 回可用
    await expect(page.locator(PANEL_ROOT), '面板根仍挂载').toBeVisible()
    await expect(page.locator(CARD_ANY).first(), '卡片网格仍在场').toBeVisible()
    await expect(page.locator(SUMMON_BTN), '召唤钮退出 busy 回可用').toBeEnabled({ timeout: 10_000 })
    expect(session.pageErrors, 'renderer 零未捕获异常').toEqual([])
  } finally {
    await closeSession(session)
  }
})

// ── Journey 冒烟（恰一条——激活 → 网格 → 召唤触发全依序） ──

test('@feature expert-squad summon 冒烟：激活面板 → 网格数据态 → 召唤触发 → 面板原状', async () => {
  test.setTimeout(240_000)
  const session = await openPanelWithFixture()
  try {
    const { page } = session
    // 步骤1 前半：激活已在 openPanelWithFixture 依序完成；数据态在场
    await expect(page.locator('.dswf-panel-title'), '面板标题').toHaveText('专家团')
    await expect(page.locator(SUMMON_BTN), '召唤钮在场（头部三段 + 召唤入口）').toBeVisible()
    // 召唤触发（双分支任一）
    const viewBefore = (await page.locator(VIEW_ROOT).getAttribute('data-dswf-view')) ?? ''
    await page.locator(SUMMON_BTN).click()
    await expectSummonTriggered(page, viewBefore)
    // 不变量：面板原状（fail-soft 不炸面板；网格原样）
    await expect(page.locator(PANEL_ROOT), '面板根仍挂载').toBeVisible()
    expect(await page.locator(CARD_ANY).count(), '网格卡数不变（≥2 夹具 + 内置）').toBeGreaterThanOrEqual(2)
    expect(session.pageErrors, 'renderer 零未捕获异常').toEqual([])
  } finally {
    await closeSession(session)
  }
})
