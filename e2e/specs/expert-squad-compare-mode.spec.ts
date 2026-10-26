// expert-squad 1.64 评审修复 e2e：Dialog 对比态单一选择控件（pick-list）+ Esc 两段语义
// 真机取证——bug f4020406（评审 bug 7ee8cff5 Major + 七项 Minor 收敛面）。
// 打开动线：launchHost 隔离 profile → 夹具工作区 code-reviewer.md（project 层覆盖随包
// 内置同键档案 → 同键聚组 + 被遮蔽 shadow）→ 左栏「专家团」→ 聚组生效卡 → 详情 Dialog
// → 「对比」进入对比态。
// data 锚（detail-dialog.tsx / expert-panel.tsx 事实表）：Dialog .dswf-dlg[role=dialog]；
// 对比态 pick-list .dswf-cmp-pick-list 行 [data-cmp-target]；chips（聚组语汇）
// [data-cmp-chip] 不应在 Dialog 内；头部「返回」钮 aria-label=退出对比。
// 拦截纪律：零拦截（纯 UI 面）；Hard Rules：零产品源码改动，断言失败 → 归因上报。
// @feature expert-squad @web-e2e
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeApp, launchHost } from '../support/launch.js'
import { registerProject } from '../support/rpc.js'
import { dismissOnboardingModals } from '../support/modals.js'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'

const PANEL_ROW = 'button[aria-label="专家团"]'
const PANEL_ROOT = '[data-dswf-expert-panel]'
const GROUP_MULTI = '.dswf-xgroup.multi'
const GROUP_CARD = `${GROUP_MULTI} .dswf-xcard`
const OVERLAY = '.dswf-dlg-overlay[data-dswf-detail-dialog]'
const DIALOG = '.dswf-dlg[role="dialog"]'
const PICK_LIST = `${DIALOG} .dswf-cmp-pick-list`
const CMP_TARGET = `${PICK_LIST} [data-cmp-target]`
const DIALOG_CHIPS = `${DIALOG} [data-cmp-chip]`
const EXIT_COMPARE = `${DIALOG} button[aria-label="退出对比"]`

const KEY = 'code-reviewer' // 随包内置专家键（packages/plugins/expert-squad/experts/）

/** project 层覆盖档案（与内置同键 → 聚组 + 被遮蔽 shadow）。 */
function expertMd(): string {
  return [
    '---',
    `name: ${KEY}`,
    'description: >-',
    '  Fixture project-layer override of the builtin reviewer for compare-mode e2e.',
    'title: 项目层评审',
    'tools: [read, grep]',
    'skills: [review, fixture]',
    '---',
    '',
    '## 职责',
    '',
    '项目层定制评审职责。',
    '',
  ].join('\n')
}

function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-xsq-compare-ws-'))
  const expertsDir = join(dir, '.dsh', 'experts')
  mkdirSync(expertsDir, { recursive: true })
  writeFileSync(join(expertsDir, `${KEY}.md`), expertMd())
  return dir
}

interface PanelSession {
  readonly page: Page
  readonly app: ElectronApplication
  readonly wsDir: string
  readonly userData: string
}

async function openPanelWithShadowFixture(): Promise<PanelSession> {
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-xsq-compare-ud-'))
  const wsDir = makeWorkspace()
  const launched = await launchHost({ userData })
  const page = launched.page
  await registerProject(page, wsDir, 'xsq-compare-fixture')
  await dismissOnboardingModals(page)
  const row = page.locator(PANEL_ROW)
  await expect(row, '左栏「专家团」行在场').toBeVisible({ timeout: 30_000 })
  await row.click()
  await expect(page.locator(PANEL_ROOT), '专家面板挂载').toBeVisible({ timeout: 30_000 })
  // 同键聚组收敛：multi 组 + 被遮蔽 shadow 行（轮询 ≤5s 预算）
  await expect(page.locator(GROUP_MULTI), '同键聚组（project 覆盖内置）').toBeVisible({ timeout: 30_000 })
  await expect(page.locator(`${GROUP_MULTI} .dswf-xshadow`), '被遮蔽 shadow 行在场').toBeVisible()
  return { page, app: launched.app, wsDir, userData }
}

async function openCompareMode(session: PanelSession): Promise<void> {
  const { page } = session
  await page.locator(GROUP_CARD).click()
  await expect(page.locator(OVERLAY), '详情 Dialog 打开').toBeVisible({ timeout: 10_000 })
  await page.locator(`${DIALOG} button[aria-label="对比"]`).click()
  await expect(page.locator(PICK_LIST), '对比态 pick-list 呈现').toBeVisible({ timeout: 10_000 })
}

async function closeSession(session: PanelSession): Promise<void> {
  try {
    await closeApp(session.app)
  } catch {
    /* closeApp 尽力而为——进程残留由 Job Object 整树回收兜底 */
  }
  rmSync(session.userData, { recursive: true, force: true })
  rmSync(session.wsDir, { recursive: true, force: true })
}

test('@feature expert-squad compare step-1：对比态单一选择控件——pick-list 在场、chips（聚组语汇）不在 Dialog', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithShadowFixture()
  try {
    await openCompareMode(session)
    const { page } = session
    // 单选候选 = 同键其它来源（内置 plugin 层）
    await expect(page.locator(CMP_TARGET), 'pick-list 候选行（内置来源）').toHaveCount(1)
    await expect(page.locator(`${CMP_TARGET}[data-cmp-target="plugin"]`)).toHaveCount(1)
    // bug f4020406 收敛：Dialog 内零 chips
    await expect(page.locator(DIALOG_CHIPS), 'Dialog 内无 CompareChips').toHaveCount(0)
    // 两列表（生效 vs target）
    await expect(page.locator(`${DIALOG} th.cmp-eff`)).toHaveCount(1)
    await expect(page.locator(`${DIALOG} th.cmp-tgt`)).toHaveCount(1)
    // 退出入口在场
    await expect(page.locator(EXIT_COMPARE), '退出对比钮在场').toBeVisible()
  } finally {
    await closeSession(session)
  }
})

test('@feature expert-squad compare step-2：Esc 两段语义——对比态先退对比回查看态，再按才关 Dialog', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithShadowFixture()
  try {
    await openCompareMode(session)
    const { page } = session
    // 第一段：Esc → 退对比（Dialog 仍在场、回查看态：退出对比钮消失、编辑钮回归）
    await page.keyboard.press('Escape')
    await expect(page.locator(OVERLAY), '第一段 Esc：Dialog 不关').toBeVisible()
    await expect(page.locator(EXIT_COMPARE), '第一段 Esc：退出对比钮消失（回查看态）').toHaveCount(0)
    await expect(page.locator(`${DIALOG} button:has-text("编辑")`), '查看态编辑钮回归').toBeVisible()
    await expect(page.locator(PICK_LIST), 'pick-list 不在查看态').toHaveCount(0)
    // 第二段：再按 Esc → 关 Dialog
    await page.keyboard.press('Escape')
    await expect(page.locator(OVERLAY), '第二段 Esc：Dialog 关闭').toHaveCount(0)
  } finally {
    await closeSession(session)
  }
})
