// 1.12 走查会取证探针（临时捕获 spec——SC-I 对照锚清单：亮/暗双主题 + focus-visible）：
// 逐锚截图 01~09（browse / multiselect-entered / allselected / dialog-view / dialog-edit /
// kwchip-editing / kwchip-new / reject-modal / focus-visible），每锚亮暗两套，
// 落 E2E_EVIDENCE_DIR。锚交互复用旅程 spec 同款稳定 data 属性锚（不断坐标/文案）。
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import {
  bootKnowledgeReview,
  evidenceShot,
  makeReviewCorpus,
  teardownReview,
  type CorpusEntry,
  type ReviewLaunch,
} from '../review-journey-harness.js'

test.setTimeout(600_000)

const CORPUS: readonly CorpusEntry[] = [
  { domain: '前端', id: 'u1', title: '走查 前端待一', summary: '待审核条目一', keywords: ['前端', '待审'] },
  { domain: '前端', id: 'u2', title: '走查 前端待二', summary: '待审核条目二', keywords: ['前端', '待审'] },
  { domain: '前端', id: 'c1', title: '走查 评审样例', summary: '预置已确认条目', keywords: ['评审', '锚点', '样例'], status: 'confirmed', body: '评审样例正文，用于 dialog 走查。' },
  { domain: '前端/框架', id: 'u3', title: '走查 后端待一', summary: '待审核条目三', keywords: ['后端', '待审'] },
  { domain: '后端', id: 'c2', title: '走查 后端已确', summary: '后端预置已确认', keywords: ['后端', '已确认'], status: 'confirmed' },
]

function toggle(page: Page) {
  return page.locator('[data-dswf-kn-multiselect-toggle]')
}
function card(page: Page, title: string) {
  return page.locator('[data-dswf-entry]', { hasText: title }).first()
}
function dlg(page: Page) {
  return page.locator('[data-dswf-kn-dialog]')
}

/** 每锚亮/暗双主题截图（暗 = body[data-ds-dark-theme] 官方主题标记，官方先例同径） */
async function shotPair(page: Page, name: string): Promise<void> {
  await shot(page, `${name}-light.png`)
  await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''))
  await expect(page.locator('body[data-ds-dark-theme]')).toHaveCount(1)
  await shot(page, `${name}-dark.png`)
  await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'))
  await expect(page.locator('body[data-ds-dark-theme]')).toHaveCount(0)
}

/**
 * 截图 + 落盘核验补拍（evidenceShot 尽力而为——electron 截图紧跟交互时合成器忙会挂起超时
 * 且被静默吞掉；此处以文件在场为判据重试补拍，SC-I 锚清单要求全量落盘）
 */
async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.E2E_EVIDENCE_DIR
  for (let attempt = 0; attempt < 3; attempt++) {
    await evidenceShot(page, name)
    if (dir !== undefined && dir !== '' && existsSync(join(dir, name))) return
    await page.waitForTimeout(500)
  }
}

test('SC-I 锚清单走查取证：亮/暗双主题 + focus-visible（01~09）', async () => {
  const { wsDir } = makeReviewCorpus(CORPUS)
  let launched: ReviewLaunch | undefined
  try {
    launched = await bootKnowledgeReview({ wsDir })
    const { page } = launched

    // 01 browse：浏览面全集（域树双域 + 徽记 + 状态 chips + 功能钮在位）
    await expect(card(page, '走查 前端待一')).toBeVisible()
    await expect(card(page, '走查 后端已确')).toBeVisible()
    await shotPair(page, '01-browse')

    // 02 multiselect-entered：功能组五钮 + checkbox 淡入
    await toggle(page).click()
    await expect(toggle(page)).toHaveText('取消')
    await expect(page.locator('[data-dswf-kn-act-confirm]')).toBeVisible()
    await expect(page.locator('[data-dswf-kn-act-reject]')).toBeVisible()
    await expect(page.locator('[data-dswf-kn-act-selectall]')).toBeVisible()
    await expect(page.locator('[data-dswf-kn-card-check]')).toHaveCount(5)
    await shotPair(page, '02-multiselect-entered')

    // 03 multiselect-allselected：全选 = 过滤结果集，计数联动
    await page.locator('[data-dswf-kn-act-selectall]').click()
    await expect(page.locator('[data-dswf-kn-selcount]')).toHaveText('已选 5 / 共 5')
    await shotPair(page, '03-multiselect-allselected')

    // 退出多选（零残留回 01 形态）
    await toggle(page).click()
    await expect(page.locator('[data-dswf-kn-card-check]')).toHaveCount(0)

    // 04 dialog-view：卡片本体开详情，标题栏 [编辑][通过][驳回][✕]（unconfirmed 特有）
    await card(page, '走查 前端待一').click()
    await expect(dlg(page).locator('[data-dswf-kn-dialog-actions]')).toBeVisible({ timeout: 30_000 })
    await expect(dlg(page).locator('[data-dswf-kn-dialog-edit]')).toBeVisible()
    await expect(dlg(page).locator('[data-dswf-kn-dialog-confirm]')).toBeVisible()
    await expect(dlg(page).locator('[data-dswf-kn-dialog-reject]')).toBeVisible()
    await expect(dlg(page).locator('[data-dswf-kn-dialog-close]')).toBeVisible()
    await shotPair(page, '04-dialog-view')

    // 05 dialog-edit：域只读 + 标题同行，字段序 chips→摘要→正文，标题栏 [保存][✕]
    await dlg(page).locator('[data-dswf-kn-dialog-edit]').click()
    await expect(dlg(page).locator('[data-dswf-kn-edit]')).toBeVisible()
    await expect(dlg(page).locator('[data-dswf-kn-dialog-save]')).toBeVisible()
    await shotPair(page, '05-dialog-edit')

    // 06 kwchip-editing：双击关键词 chip 原地改词（accent 描边放大态）
    await dlg(page).locator('[data-dswf-kn-kwedit]').first().waitFor({ state: 'detached' }).catch(() => {})
    await dlg(page).locator('[data-dswf-kn-kwchip]').first().dblclick()
    await expect(dlg(page).locator('[data-dswf-kn-kwedit]')).toBeVisible()
    await shotPair(page, '06-kwchip-editing')
    // 回车收口改词
    await dlg(page).locator('[data-dswf-kn-kwedit]').press('Enter')

    // 06b kwchip-new：＋ 新增空白 chip 放大态
    await dlg(page).locator('[data-dswf-kn-kwadd]').click()
    await expect(dlg(page).locator('[data-dswf-kn-kwedit]')).toBeVisible()
    await shotPair(page, '06b-kwchip-new')

    // Esc 回查看 → 关闭 dialog
    await dlg(page).locator('[data-dswf-kn-kwedit]').press('Escape')
    await page.keyboard.press('Escape')
    await expect(dlg(page).locator('[data-dswf-kn-edit]')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(dlg(page)).toHaveCount(0)

    // 07 reject-modal：dialog 标题栏驳回 → 官方 Modal 确认框叠层
    await card(page, '走查 前端待二').click()
    await expect(dlg(page).locator('[data-dswf-kn-dialog-actions]')).toBeVisible({ timeout: 30_000 })
    await dlg(page).locator('[data-dswf-kn-dialog-reject]').click()
    await expect(page.locator('.dswf-kn-reject-modal')).toBeVisible()
    await shotPair(page, '07-reject-modal')
    // 取消零动作，关 dialog
    await page.locator('.dswf-kn-reject-modal').locator('button', { hasText: '取消' }).first().click()
    await expect(page.locator('.dswf-kn-reject-modal')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(dlg(page)).toHaveCount(0)

    // 08 domain-collapsed：「前端」父行 caret 收合（叶域行 caret = aria-hidden 空占位不可点——
    // bug b49fd496；corpus 携带二级子域「前端/框架」使前端行有实收合效果）
    const domRow = page.locator('[data-dswf-kn-tree] [data-dswf-domain="前端"]')
    await domRow.locator('.dswf-kn-dom-caret').click()
    await expect(page.locator('[data-dswf-kn-tree] [data-dswf-domain="前端/框架"]')).toHaveCount(0)
    await shotPair(page, '08-domain-collapsed')
    await domRow.locator('.dswf-kn-dom-caret').click()
    await expect(page.locator('[data-dswf-kn-tree] [data-dswf-domain="前端/框架"]')).toHaveCount(1)

    // 09 focus-visible：键盘 Shift+Tab 自域树行回走至工具栏功能钮（正向 Tab 越过工具栏到不了
    // ——08 后焦点在树内 caret 钮，工具栏在树之前），官方 focus-ring 亮环双主题
    let focused = false
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Shift+Tab')
      const isActive = await page.evaluate(
        () => document.activeElement?.getAttribute('data-dswf-kn-multiselect-toggle') !== null,
      )
      if (isActive) {
        focused = true
        break
      }
    }
    expect(focused, '键盘 Tab 聚焦到多选功能钮').toBe(true)
    await shotPair(page, '09-focus-visible')
  } finally {
    await teardownReview(launched)
  }
})
