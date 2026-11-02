// expert-squad plugins.item 呈现旅程 e2e（builtin-plugin-item-presentation 1.5 实现
// 1c9e2daf 收口欠账）：官方插件管理页 plugins.item 缝注册的官方组条目 + item 详情页头部
// 呈现品牌标识「专家团（dsh-forge）」——两处断言（条目名 + 详情页头部），文案单源 =
// packages/plugins/expert-squad/src-client/settings/index.tsx 的 ITEM_LABEL / ITEM_DESCRIPTION
// （注册字段实测形态：label「专家团（dsh-forge）」、view:"summary" 一行简介
// 「dsh-forge 专家团配置与默认 Agent 路由」，id = expert-squad、order = 40）。
// 导航径（走查批 1 cdp/bw14-open-plugins.js 同径）：官方导航「插件」钮（textContent 精确
// 等值——hasText 子串会误中他钮）→ 官方组卡片 → item 详情页（「返回插件列表」面包屑 +
// 条目名 heading + 默认 Agent 选项表单）。
// 断言锚：官方组条目走文本锚（官方 client.js 卡片 class 为 hash 类名——非稳定 data 锚；
// 品牌标识文案本身即本任务被测面），自绘面走 data-dswf-* / class 锚（.dswf-cfg-card）。
// Hard Rules：零产品源码改动；不动 builtin-shadow spec（1.7 刚收口）；夹具 = 仓外 tmp。
// @feature builtin-plugin-item-presentation @web-e2e
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createSharedLaunchFixture } from '../support/fixtures.js'
import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

/** 品牌标识文案（1.5 实现 1c9e2daf 注册字段正本——ITEM_LABEL，单源不双写） */
const ITEM_LABEL = '专家团（dsh-forge）'
/** 官方组条目一行简介（ITEM_DESCRIPTION——view:"summary" 渲染面） */
const ITEM_DESCRIPTION = 'dsh-forge 专家团配置与默认 Agent 路由'
/** item 详情页自绘面板锚（DefaultAgentOptionsTab 渲染面——data-cfg-state ready 态） */
const DETAIL_PANEL = '.dswf-cfg-card[data-cfg-state="ready"]'

function seedWorkspace(dir: string): void {
  mkdirSync(join(dir, '.dsh', 'experts'), { recursive: true })
}

const { test } = createSharedLaunchFixture({
  seedWorkspace,
  workspaceName: 'xsq-item-presentation-fixture',
})

/** 官方组条目卡定位（li 卡片 hasText 品牌标识——hasText 子串匹配限定在卡片 li 内，
 *  官方组 ul 容器非 li 不会误中祖先；官方 hash class 不作锚） */
function officialCard(page: Page): ReturnType<Page['locator']> {
  return page.locator('li').filter({ hasText: ITEM_LABEL })
}

/** 导航收敛：官方导航「插件」钮（name 精确等值——防「插件列表」等子串误中）→ 插件管理页
 *  就绪门 = 官方组条目卡在场（本 spec 被测面即该卡，直卡作门零中间假设）。 */
async function openPluginsPage(page: Page): Promise<void> {
  const nav = page.getByRole('button', { name: '插件', exact: true }).first()
  await expect(nav, '左栏官方导航「插件」入口在场').toBeVisible({ timeout: 30_000 })
  await nav.click()
  await expect(officialCard(page).first(), '插件管理页官方组「专家团」条目就绪').toBeVisible({
    timeout: 30_000,
  })
}

// ── 断言一：官方组条目呈现品牌标识 ──

test('@feature expert-squad item-presentation：插件页官方组条目呈现「专家团（dsh-forge）」+ 一行简介', async ({ sharedLaunch }) => {
  test.setTimeout(180_000)
  const { page, pageErrors } = sharedLaunch
  await openPluginsPage(page)
  const card = officialCard(page).first()
  await expect(card, '条目名呈品牌标识（ITEM_LABEL）').toContainText(ITEM_LABEL)
  await expect(card, '条目一行简介（ITEM_DESCRIPTION summary view）').toContainText(ITEM_DESCRIPTION)
  // 不变量：renderer 零未捕获异常
  expect(pageErrors, 'renderer 零未捕获异常').toEqual([])
})

// ── 断言二：item 详情页头部呈现品牌标识 ──

test('@feature expert-squad item-presentation：item 详情页头部呈「专家团（dsh-forge）」+ 默认 Agent 选项面板', async ({ sharedLaunch }) => {
  test.setTimeout(180_000)
  const { page, pageErrors } = sharedLaunch
  await openPluginsPage(page)
  // 点击官方组条目卡进入详情页（卡片内 button 承载点击——bw14-click-xsq 同径）
  await officialCard(page).first().locator('button').first().click()
  // 详情页头部：面包屑「返回插件列表」钮 + 条目名 heading 品牌标识（ItemDetail 头部同读
  // ITEM_LABEL——官方 client.js ItemDetail detailTitle 渲染 item.label）
  const breadcrumb = page.getByRole('button', { name: '返回插件列表', exact: true }).first()
  await expect(breadcrumb, '详情页「返回插件列表」面包屑在场').toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('heading', { name: ITEM_LABEL, exact: true }), '详情页头部条目名呈品牌标识').toBeVisible()
  // 详情页 body：默认 Agent 选项表单面板挂载（plugins.detail.section 同缝呈现——既有缝零回归）
  await expect(page.locator(DETAIL_PANEL), '默认 Agent 选项面板挂载（ready）').toBeVisible({ timeout: 30_000 })
  await expect(page.locator(DETAIL_PANEL).locator('h2'), '面板标题「默认 Agent 选项」').toContainText('默认 Agent 选项')
  // 结构性无卸载（官方 subagent 详情页同形态——调研报告 §5 落点 A）
  expect(await page.getByText('卸载', { exact: false }).count(), 'item 详情页无卸载按钮').toBe(0)
  // 不变量：renderer 零未捕获异常
  expect(pageErrors, 'renderer 零未捕获异常').toEqual([])
})
