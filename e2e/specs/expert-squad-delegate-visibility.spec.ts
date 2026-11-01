// expert-squad 1.46 ② 收口 e2e（bug cf2fc46b——tools.restrict deny 落点）：委派可见性真机取证。
// 断言面（零产品源码改动；工具目录无 GUI 观测面——desktop renderer 无 agent-presets/tools
// IPC 通道，forge:proxy/agent-presets 仅 remote HTTP RPC 面——运行时可见性终证归
// apps/host/src/boot/delegate-visibility-smoke.test.ts 真机 boot + 官方机械实跑 probe3）：
//   · 主会话面健康：dev profile 全局 expert-squad 行装载 → 左栏「专家团」行在座 + 面板激活
//     数据态（全局单实例注册链活体——delegate_expert 注册与面板同源同 apply）。
//   · 猎头预设部署面在场（GUI 观测）：hero 预设座位菜单含「猎头模式」项（官方形制：
//     healthy 预设显示显示名、broken 回退 id——m3 形制；HR preset 无 expert-squad 组合专行，
//     mount 健康由通用装配链承载）。
// 拦截纪律（fix-3 判例）：本 spec 零 fetch 拦截需求。
// e2e-fast-shared-launch 存量迁移（1.5）：共享 launch fixture（e2e/support/fixtures.js B2
// 形态——launchHost 整 spec 一次 + 用例间 tmp 夹具档案重播种 + crash 自动重启续跑）。
// @feature expert-squad @web-e2e
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createSharedLaunchFixture } from '../support/fixtures.js'
import { SEAT_ROOT } from '../support/m3.js'
import { expect } from '@playwright/test'

// ── 锚（expert-panel.tsx / 官方 hero 座位——本 spec 字面量单源） ──
const PANEL_ROW = 'button[aria-label="专家团"]'
const PANEL_ROOT = '[data-dswf-expert-panel]'
const CARD_ANY = '.dswf-card-grid .dswf-xcard'

/** 猎头预设显示名（apps/host/src/profile/presets/headhunter.patch.yml config.name——座位标签文本） */
const HR_PRESET_LABEL = '猎头模式'

/** project 层夹具专家档案（面板数据态收敛用）。 */
function expertMd(name: string, title: string): string {
  return [
    '---',
    `name: ${name}`,
    'description: >-',
    '  Fixture expert for delegate-visibility e2e.',
    `title: ${title}`,
    'tools: [read, grep]',
    'skills: [review]',
    '---',
    '',
    '## 职责',
    '',
    '夹具人设正文：用于面板数据态的固定文本。',
    '',
  ].join('\n')
}

// ── 共享 launch fixture（spec 级单次 launchHost；夹具重播种 + crash 自动重启） ──

function seedWorkspace(dir: string): void {
  const expertsDir = join(dir, '.dsh', 'experts')
  mkdirSync(expertsDir, { recursive: true })
  writeFileSync(join(expertsDir, 'test-reviewer.md'), expertMd('test-reviewer', '夹具评审'))
}

const { test } = createSharedLaunchFixture({
  seedWorkspace,
  workspaceName: 'xsq-visibility-fixture',
})

test('@feature expert-squad delegate-visibility：主会话面（专家团全局实例）+ 猎头预设部署面在场', async ({ sharedLaunch }) => {
  test.setTimeout(180_000)
  const { page, pageErrors } = sharedLaunch
  // 猎头预设部署面（GUI 观测，blank hero 期——座位在面板视图切换后退场）：hero 预设座位
  // 菜单含「猎头模式」（显示名形态 = mount 健康）
  const seatButton = page.locator(SEAT_ROOT).locator('button').first()
  await expect(seatButton, 'hero 预设座位在场（blank 期）').toBeVisible({ timeout: 30_000 })
  await seatButton.click()
  const headhunterItem = page.getByText(HR_PRESET_LABEL, { exact: true }).first()
  await expect(headhunterItem, '预设菜单含猎头模式（healthy 显示名形态）').toBeVisible({ timeout: 10_000 })
  await page.keyboard.press('Escape')
  // 主会话面：全局单实例装载 → 左栏行在座 + 面板激活数据态（注册链活体）
  const row = page.locator(PANEL_ROW)
  await expect(row, '左栏「专家团」行在场（全局行注册缝）').toBeVisible({ timeout: 30_000 })
  await row.click()
  await expect(page.locator(PANEL_ROOT), '专家面板挂载').toBeVisible({ timeout: 30_000 })
  await expect(page.locator(CARD_ANY).first(), '卡片网格数据态').toBeVisible({ timeout: 30_000 })
  // 不变量：renderer 零未捕获异常
  expect(pageErrors, 'renderer 零未捕获异常').toEqual([])
})
