// @feature dsh-forge-m3 | @web-e2e | @journey proposal-board-browsing
// Journey smoke test — the read-only board chain END TO END in one world
// (happy-path Outcomes only):
//   Step 1 open the list (metadata + badges + created-desc + zero write face)
//   → Step 2 detail proposal/eval verbatim render + return → Step 3 badge
//   crossjump to the Feature board + return chain → Step 4 external add +
//   status flip reflux ≤5s each (file = source of truth).
// Traceability: docs/features/dsh-forge-m3/testing/proposal-board-browsing/
// journey.md (Happy Path Steps 1-4) + contracts/step-{1..4}-*.md success faces.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { REFLOW_BUDGET_MS, freshRoot, proposalMarkdown, WorldManager } from '../_lib/journey-world.ts'
import {
  ASSOCIATED, ASSOCIATED_AUTHOR, ASSOCIATED_CREATED, ASSOCIATED_H1, ASSOCIATED_MARK,
  buildMainWorld, EVAL_H1, EVAL_MARK, HOSTILE, ORPHAN, PROP_FEATURE,
} from './harness.ts'

// [M4 1.8 e2e 迁移·迁移清单 第③行 · M3 提案板(workbench/proposals)] 本测试功能面锚定 1.7 已退役的旧视图宿主,
// P2 右栏 pane / 概览子 tab(2.1–2.4)落座后按新宿主恢复,2.10 全量复跑收口。
// 断言本体零删改(零功能删除断言 Hard Rule)—— test.fixme 仅为过渡期挂起。
test.fixme('smoke/proposal-board-browsing: 列表(元数据/徽标/排序/零写)→ 详情双 tab 逐字一致 → 徽标互跳往返 → 外部变更 ≤5s 回流', async ({ }, testInfo) => {
  testInfo.setTimeout(900_000)
  const manager = new WorldManager()
  const kernel = await buildMainWorld(freshRoot('prop-smoke'))
  try {
    const world = await manager.acquire(kernel, 'main', { tab: 'workbench/proposals' })
    const { page } = world

    // ---- Step 1:打开提案列表 ------------------------------------------
    const rows = page.locator('[data-dsh-forge-proposal-row]')
    await expect(rows, 'Step 1:全量呈现(3 行)').toHaveCount(3, { timeout: 30_000 })
    await expect(page.locator(`[data-dsh-forge-proposal-row="${ORPHAN}"] [data-dsh-forge-proposal-feature-jump]`), 'Step 1:孤儿无徽标').toHaveCount(0)
    await expect(page.locator(
      '[data-dsh-forge-proposal-page] input, [data-dsh-forge-proposal-page] select, '
      + '[data-dsh-forge-proposal-page] textarea, [data-dsh-forge-proposal-page] [contenteditable="true"]',
    ), 'Step 1:零表单控件(Invariant)').toHaveCount(0)

    // ---- Step 2:详情 + eval 逐字一致 + 返回 ---------------------------
    await page.locator(`[data-dsh-forge-proposal-row="${ASSOCIATED}"]`).click()
    const detail = page.locator(`[data-dsh-forge-proposal-detail="${ASSOCIATED}"]`)
    await expect(detail).toBeVisible({ timeout: 15_000 })
    await expect(detail.locator('[data-dsh-forge-proposal-doc-panel="proposal"]')).toContainText(ASSOCIATED_H1)
    await expect(detail.locator('[data-dsh-forge-proposal-doc-panel="proposal"]')).toContainText(ASSOCIATED_MARK)
    await expect(detail.locator('[data-dsh-forge-proposal-header]')).toContainText(`${ASSOCIATED_AUTHOR} · ${ASSOCIATED_CREATED}`)
    await detail.locator('[data-dsh-forge-proposal-doc-tab="eval"]').click()
    await expect(detail.locator('[data-dsh-forge-proposal-doc-panel="eval"]')).toContainText(EVAL_H1)
    await expect(detail.locator('[data-dsh-forge-proposal-doc-panel="eval"]')).toContainText(EVAL_MARK)
    await detail.locator('[data-dsh-forge-proposal-back]').click()

    // ---- Step 3:徽标互跳 → Feature 看板 → 返回链闭合 ------------------
    await page.locator(`[data-dsh-forge-proposal-row="${ASSOCIATED}"] [data-dsh-forge-proposal-feature-jump="${PROP_FEATURE}"]`).click()
    const featureDetail = page.locator(`[data-dsh-forge-feature-detail="${PROP_FEATURE}"]`)
    await expect(featureDetail, 'Step 3:互跳 → Feature 详情').toBeVisible({ timeout: 20_000 })
    await featureDetail.locator('[data-dsh-forge-feature-back]').click()
    await page.locator('[data-dsh-forge-tab="workbench/proposals"]').click()
    await expect(rows.first(), 'Step 3:返回链闭合(板在场)').toBeVisible({ timeout: 20_000 })

    // ---- Step 4:外部变更回流 ≤5s --------------------------------------
    const externalDir = join(kernel.docsRoot, 'docs', 'proposals', 'prop-smoke-external')
    mkdirSync(externalDir, { recursive: true })
    const tAdd = Date.now()
    writeFileSync(join(externalDir, 'proposal.md'), proposalMarkdown({
      status: 'draft', author: 'smoke-external', created: '2026-09-25', title: 'smoke 外部新增提案', mark: 'smoke 回流锚点。',
    }), 'utf8')
    const externalRow = page.locator('[data-dsh-forge-proposal-row="prop-smoke-external"]')
    await externalRow.waitFor({ state: 'visible', timeout: 20_000 })
    expect(Date.now() - tAdd, 'Step 4:外部新增 → 新行 ≤5s(免手动刷新)').toBeLessThanOrEqual(REFLOW_BUDGET_MS + 1_000)

    const hostilePath = join(kernel.docsRoot, 'docs', 'proposals', HOSTILE, 'proposal.md')
    const tStatus = Date.now()
    writeFileSync(hostilePath, readFileSync(hostilePath, 'utf8').replace('status: review', 'status: accepted'), 'utf8')
    await page.locator(`[data-dsh-forge-proposal-row="${HOSTILE}"] [data-dsh-forge-proposal-status="accepted"]`)
      .waitFor({ state: 'visible', timeout: 20_000 })
    expect(Date.now() - tStatus, 'Step 4:外部改 status → Pill 翻转 ≤5s').toBeLessThanOrEqual(REFLOW_BUDGET_MS + 1_000)

    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await manager.closeAll()
  }
})
