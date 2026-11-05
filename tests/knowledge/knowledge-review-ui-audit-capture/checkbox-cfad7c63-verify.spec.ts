// 1.19 bug cfad7c63 修复复验探针（临时 spec）：多选模式官方 Checkbox 勾选框本体
// 真机可见可点——computed rect 非 0×0（≥14×14 像素读数）+ 点击勾选联动计数
// + 亮/暗双主题截图对质归档（机检读数 vs 截图证据）。
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import {
  bootKnowledgeReview,
  evidenceShot,
  makeReviewCorpus,
  teardownReview,
  type CorpusEntry,
} from '../review-journey-harness.js'

test.setTimeout(600_000)

const CORPUS: readonly CorpusEntry[] = [
  { domain: '前端', id: 'u1', title: '复验 前端待一', summary: '待审核条目一', keywords: ['前端', '复验'] },
  { domain: '前端', id: 'u2', title: '复验 前端待二', summary: '待审核条目二', keywords: ['前端', '复验'] },
]

async function shotPair(page: Page, name: string): Promise<void> {
  await shot(page, `${name}-light.png`)
  await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''))
  await expect(page.locator('body[data-ds-dark-theme]')).toHaveCount(1)
  await shot(page, `${name}-dark.png`)
  await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'))
  await expect(page.locator('body[data-ds-dark-theme]')).toHaveCount(0)
}

/** 截图 + 落盘核验补拍（electron 截图合成器忙会静默吞掉——以文件在场为判据重试） */
async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.E2E_EVIDENCE_DIR
  for (let attempt = 0; attempt < 3; attempt++) {
    await evidenceShot(page, name)
    if (dir !== undefined && dir !== '' && existsSync(join(dir, name))) return
    await page.waitForTimeout(500)
  }
}

test('cfad7c63 复验：多选 checkbox 真机可见（rect 非 0×0）可点 + 双主题截图', async () => {
  const { wsDir } = makeReviewCorpus(CORPUS)
  let launched: Awaited<ReturnType<typeof bootKnowledgeReview>> | undefined
  try {
    launched = await bootKnowledgeReview({ wsDir })
    const { page } = launched

    await expect(page.locator('[data-dswf-entry]', { hasText: '复验 前端待一' })).toBeVisible()
    await page.locator('[data-dswf-kn-multiselect-toggle]').click()
    await expect(page.locator('[data-dswf-kn-card-check]')).toHaveCount(2)

    // 机检读数：勾选框本体 input rect 非 0×0（官方 Checkbox input 16×16）
    const input = page.locator('[data-dswf-kn-card-check] input[type=checkbox]').first()
    const box = await input.boundingBox()
    const readings = {
      bug: 'cfad7c63',
      inputBoundingBox: box,
      visible: await input.isVisible(),
      checkedBefore: await input.isChecked(),
    }
    console.log('[cfad7c63-verify]', JSON.stringify(readings))
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(14)
    expect(box!.height).toBeGreaterThanOrEqual(14)
    expect(readings.visible).toBe(true)

    // 可点：点击勾选 → 计数联动「已选 1 / 共 2」
    await input.click()
    await expect(page.locator('[data-dswf-kn-selcount]')).toHaveText('已选 1 / 共 2')
    expect(await input.isChecked()).toBe(true)

    // 双主题截图对质（含勾选态）
    await shotPair(page, '10-checkbox-fixed')
  } finally {
    await teardownReview(launched)
  }
})
