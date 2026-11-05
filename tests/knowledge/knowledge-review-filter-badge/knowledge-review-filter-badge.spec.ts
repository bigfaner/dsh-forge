// 旅程⑤ knowledge-review-filter-badge——状态过滤与待审核徽记（journey.md J5-1~J5-3）。
// 覆盖：状态 chips 服务端过滤（全部/待审核/已确认三态各自正确 + aria-pressed 激活态）、
// 域树计数行（过滤切换零抖动——未过滤口径正交性）、空过滤结果空态可判定、
// 过滤 + 多选全选组合（勾选集 = 过滤结果集，M = 过滤计数）、裁决动作后重拉联动。
// 徽记缺口说明：DomainNode.unconfirmedCount（待审核徽记未过滤口径）契约字段已落
// contracts DTO，但 DomainTree P1 形态渲染 entryCount（过滤无关的域条目计数）——
// 「徽记 = unconfirmedCount 数字形态」断言待徽记面任务落位后补钉，本套件以
// entryCount 零抖动承载 E2「过滤独立性」口径。
import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  bootKnowledgeReview,
  evidenceShot,
  makeReviewCorpus,
  teardownReview,
  type CorpusEntry,
  type ReviewLaunch,
} from '../review-journey-harness.js'

test.setTimeout(600_000)

// corpus（旅程⑤口径：≥2 域，各含 confirmed 与 unconfirmed 混合）
const J5_CORPUS: readonly CorpusEntry[] = [
  { domain: '前端', id: 'f-u1', title: '过滤前端待一', summary: '前端待审核一', keywords: ['前端'] },
  { domain: '前端', id: 'f-u2', title: '过滤前端待二', summary: '前端待审核二', keywords: ['前端'] },
  { domain: '前端', id: 'f-c1', title: '过滤前端确认', summary: '前端已确认', keywords: ['前端'], status: 'confirmed' },
  { domain: '后端', id: 'b-u1', title: '过滤后端待一', summary: '后端待审核一', keywords: ['后端'] },
  { domain: '后端', id: 'b-c1', title: '过滤后端确认', summary: '后端已确认', keywords: ['后端'], status: 'confirmed' },
]

function statusChip(page: Page, value: string): Locator {
  return page.locator(`[data-dswf-kn-statuschip="${value}"]`)
}

function card(page: Page, title: string): Locator {
  return page.locator('[data-dswf-entry]', { hasText: title }).first()
}

function domainCount(page: Page, domainPath: string): Locator {
  return page.locator(`[data-dswf-domain="${domainPath}"] .dswf-kn-dom-count`)
}

async function expectChipActive(page: Page, value: string, active: boolean): Promise<void> {
  await expect(statusChip(page, value)).toHaveAttribute('aria-pressed', String(active))
}

test('J5·状态过滤三态 + 域树计数正交 + 过滤全选组合 + 裁决后重拉', async () => {
  const { root, wsDir } = makeReviewCorpus(J5_CORPUS)
  let launched: ReviewLaunch | undefined
  try {
    launched = await bootKnowledgeReview({ wsDir })
    const { page } = launched

    // 步骤 1：默认「全部」态——网格 = 全集；chips 激活态 = 全部
    await expect(page.locator('[data-dswf-entry]')).toHaveCount(5)
    await expectChipActive(page, 'all', true)
    await expectChipActive(page, 'unconfirmed', false)
    const frontCountBefore = (await domainCount(page, '前端').textContent()) ?? ''
    const backCountBefore = (await domainCount(page, '后端').textContent()) ?? ''
    expect(Number(frontCountBefore)).toBe(3)
    expect(Number(backCountBefore)).toBe(2)

    // 步骤 2：待审核 chip——网格只剩 unconfirmed（服务端 statusFilter 执行）；域树计数不抖动
    await statusChip(page, 'unconfirmed').click()
    await expectChipActive(page, 'unconfirmed', true)
    await expectChipActive(page, 'all', false)
    await expect(page.locator('[data-dswf-entry]')).toHaveCount(3)
    for (const title of ['过滤前端待一', '过滤前端待二', '过滤后端待一']) {
      await expect(card(page, title).locator('.dswf-state-chip')).toHaveText('unconfirmed')
    }
    await expect(card(page, '过滤前端确认')).toHaveCount(0)
    await expect(card(page, '过滤后端确认')).toHaveCount(0)
    await expect(domainCount(page, '前端')).toHaveText(frontCountBefore)
    await expect(domainCount(page, '后端')).toHaveText(backCountBefore)
    await evidenceShot(page, 'j5-golden-2-filter-unconfirmed.png')

    // 步骤 3：已确认 chip——网格只剩 confirmed；域树计数依旧不变（E2 过滤独立性）
    await statusChip(page, 'confirmed').click()
    await expectChipActive(page, 'confirmed', true)
    await expect(page.locator('[data-dswf-entry]')).toHaveCount(2)
    for (const title of ['过滤前端确认', '过滤后端确认']) {
      await expect(card(page, title).locator('.dswf-state-chip')).toHaveText('confirmed')
    }
    await expect(domainCount(page, '前端')).toHaveText(frontCountBefore)
    await expect(domainCount(page, '后端')).toHaveText(backCountBefore)
    await evidenceShot(page, 'j5-golden-3-filter-confirmed.png')

    // 边界（J5-3 过滤 + 全选组合）：待审核过滤下进多选并全选 → 勾选集恰为过滤结果集
    await statusChip(page, 'unconfirmed').click()
    await page.locator('[data-dswf-kn-multiselect-toggle]').click()
    await expect(page.locator('[data-dswf-kn-selcount]')).toBeVisible()
    await expect(page.locator('[data-dswf-kn-selcount]')).toBeVisible()
    await expect(page.locator('[data-dswf-kn-selcount]')).toHaveText('已选 0 / 共 3')
    await page.locator('[data-dswf-kn-act-selectall]').click()
    await expect(page.locator('[data-dswf-kn-selcount]')).toHaveText('已选 3 / 共 3')
    for (const title of ['过滤前端待一', '过滤前端待二', '过滤后端待一']) {
      await expect(card(page, title).locator('input[type="checkbox"]')).toBeChecked()
    }
    await expect(card(page, '过滤前端确认').locator('[data-dswf-kn-card-check]')).toHaveCount(0)

    // 步骤 4：过滤态下批量通过 → 视图按当前过滤重拉（过滤结果集清空 = 空态可判定）；
    // 回「已确认」= 通过条目均 confirmed；域树计数过滤无关
    await page.locator('[data-dswf-kn-act-confirm]').click()
    await expect(page.locator('.dswf-kn-reject-modal')).toHaveCount(0)
    await expect(page.locator('[data-dswf-kn-cards]')).toHaveCount(0)
    await expect(page.locator('[data-dswf-clear-filters]')).toBeVisible()
    await evidenceShot(page, 'j5-golden-4-empty-after-confirm.png')
    await statusChip(page, 'confirmed').click()
    await expect(page.locator('[data-dswf-entry]')).toHaveCount(5)
    for (const entry of J5_CORPUS) {
      await expect(card(page, entry.title).locator('.dswf-state-chip')).toHaveText('confirmed')
    }
    await statusChip(page, 'unconfirmed').click()
    await expect(page.locator('[data-dswf-entry]')).toHaveCount(0)
    await expect(page.locator('[data-dswf-clear-filters]')).toBeVisible()
    // 域树计数行 = 未过滤口径聚合（过滤切换零抖动）
    await expect(domainCount(page, '前端')).toHaveText(frontCountBefore)
    await expect(domainCount(page, '后端')).toHaveText(backCountBefore)
  } finally {
    await teardownReview(launched, [root])
  }
})

// 旅程⑤边界 1：域过滤 + 状态过滤组合（空结果/零交叉污染 + 清除过滤）
test('J5·边界：域过滤 + 状态过滤组合与空结果空态可判定', async () => {
  const { root, wsDir } = makeReviewCorpus(J5_CORPUS)
  let launched: ReviewLaunch | undefined
  try {
    launched = await bootKnowledgeReview({ wsDir })
    const { page } = launched

    // 域过滤：后端（2 条）→ 再切待审核（后端 1 条）→ 再切已确认（后端 1 条）——零交叉污染
    await page.locator('[data-dswf-domain="后端"]').first().click()
    await expect(page.locator('[data-dswf-entry]')).toHaveCount(2)
    await statusChip(page, 'unconfirmed').click()
    await expect(page.locator('[data-dswf-entry]')).toHaveCount(1)
    await expect(card(page, '过滤后端待一')).toBeVisible()
    await statusChip(page, 'confirmed').click()
    await expect(page.locator('[data-dswf-entry]')).toHaveCount(1)
    await expect(card(page, '过滤后端确认')).toBeVisible()
    await evidenceShot(page, 'j5-boundary-domain-status-combo.png')

    // 域 + 关键词组合零命中 = 无匹配空态（清除过滤入口在场，不误渲染他域条目）
    await statusChip(page, 'all').click()
    await page.locator('.dswf-kn-search input').fill('前端')
    await expect(page.locator('[data-dswf-entry]')).toHaveCount(0)
    await expect(page.getByText('无匹配知识')).toBeVisible()
    // 清除过滤 = 域 + 关键词一并复位（回到全集）
    await page.locator('[data-dswf-clear-filters]').click()
    await expect(page.locator('[data-dswf-entry]')).toHaveCount(5)
  } finally {
    await teardownReview(launched, [root])
  }
})
