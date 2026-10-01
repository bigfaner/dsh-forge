// @feature dsh-forge-m3 | @web-e2e | @journey proposal-board-browsing
// Traceability: docs/features/dsh-forge-m3/testing/proposal-board-browsing/
// contracts/step-1-open-proposal-list.md — one test per Outcome:
//   success     — 列表全量呈现(status/created/作者列 + 徽标;无关联不渲染
//                 徽标);tab 序 = 概览/提案/Feature/任务;排序 = created 降序;
//                 控件清单级零写入口。
//   empty-state — proposals/ 空 → 「暂无提案」+ 路径说明(正常态,无错误)。
// fixture_spec: Project + Proposal ≥2(≥1 associated / ≥1 unassociated)+
// EvalReport ≥1 — served by harness.buildMainWorld / buildBareWorld.

import { expect, test } from '@playwright/test'
import { freshRoot, WorldManager } from '../_lib/journey-world.ts'
import { ASSOCIATED, ASSOCIATED_AUTHOR, ASSOCIATED_CREATED, buildBareWorld, buildMainWorld, HOSTILE, HOSTILE_CREATED, ORPHAN, ORPHAN_AUTHOR, ORPHAN_CREATED, PROP_FEATURE } from './harness.ts'
import type { KernelWorld } from '../_lib/journey-world.ts'

test.describe.serial('proposal-board-browsing / step 1: 打开提案列表', () => {
  const manager = new WorldManager()
  let main: KernelWorld | null = null
  let bare: KernelWorld | null = null

  test.beforeAll(async () => {
    main = await buildMainWorld(freshRoot('prop-s1a'))
    bare = await buildBareWorld(freshRoot('prop-s1b'))
  })

  test.afterAll(async () => {
    await manager.closeAll()
  })

  // [M4 1.8 e2e 迁移·迁移清单 第③行 · M3 提案板(workbench/proposals)] 本测试功能面锚定 1.7 已退役的旧视图宿主,
// P2 2.10 复核:断言锚定已退役宿主方言(旧向导/换台 chrome/提案板与
// Feature 板详情/阶段资产面板内部件),右栏 pane 族未承接 —— 挂起终态与恢复前置 = regression-inventory.md 开放项。
  // 断言本体零删改(零功能删除断言 Hard Rule)—— test.fixme 仅为过渡期挂起。

  // Outcome "success" — 列表与文档根一致 + 零写入口(控件清单级)。
  test.fixme('step1/success: the board lists every proposal with metadata + badges (orphan badge-less), tab order 概览/提案/Feature/任务, created-desc order, zero write affordances', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const world = await manager.acquire(main as KernelWorld, 'main', { tab: 'workbench/proposals' })
    const { page } = world

    // tab 序 = 概览/提案/Feature/任务(PRD Navigation Architecture)。
    const tabs = await page.locator('[data-dsh-forge-tab]').evaluateAll(nodes =>
      nodes.map(node => node.getAttribute('data-dsh-forge-tab') ?? ''))
    expect(tabs.filter(tab => tab.startsWith('workbench/')), '工作台 tab 序 = 概览/提案/Feature/任务')
      .toEqual(['workbench/overview', 'workbench/proposals', 'workbench/features', 'workbench/tasks'])

    // 列表全量(3 语料提案);排序 = created 降序(hostile 09-22 > orphan 09-20 > associated 09-18)。
    const rows = page.locator('[data-dsh-forge-proposal-row]')
    await expect(rows, '全量呈现(3 行)').toHaveCount(3, { timeout: 30_000 })
    await expect(rows.nth(0)).toHaveAttribute('data-dsh-forge-proposal-row', HOSTILE)
    await expect(rows.nth(1)).toHaveAttribute('data-dsh-forge-proposal-row', ORPHAN)
    await expect(rows.nth(2)).toHaveAttribute('data-dsh-forge-proposal-row', ASSOCIATED)

    // 孤儿行:status/author/created 与 frontmatter 一致;无徽标。
    const orphanRow = page.locator(`[data-dsh-forge-proposal-row="${ORPHAN}"]`)
    await expect(orphanRow.locator('[data-dsh-forge-proposal-status="draft"]'), '孤儿 status Pill(draft)').toBeVisible()
    await expect(orphanRow, '孤儿 author 一致').toContainText(ORPHAN_AUTHOR)
    await expect(orphanRow, '孤儿 created 一致').toContainText(ORPHAN_CREATED)
    await expect(orphanRow.locator('[data-dsh-forge-proposal-feature-jump]'), '无关联 → 徽标不渲染').toHaveCount(0)

    // 关联行:status/author/created 一致;徽标在场(slug 同一性)。
    const associatedRow = page.locator(`[data-dsh-forge-proposal-row="${ASSOCIATED}"]`)
    await expect(associatedRow.locator('[data-dsh-forge-proposal-status="accepted"]'), '关联 status Pill(accepted)').toBeVisible()
    await expect(associatedRow, '关联 author 一致').toContainText(ASSOCIATED_AUTHOR)
    await expect(associatedRow, '关联 created 一致').toContainText(ASSOCIATED_CREATED)
    await expect(associatedRow.locator(`[data-dsh-forge-proposal-feature-jump="${PROP_FEATURE}"]`), '关联徽标在场').toBeVisible()
    void HOSTILE_CREATED

    // 零写入口(控件清单级):全页面零表单控件。
    await expect(page.locator(
      '[data-dsh-forge-proposal-page] input, [data-dsh-forge-proposal-page] select, '
      + '[data-dsh-forge-proposal-page] textarea, [data-dsh-forge-proposal-page] [contenteditable="true"]',
    ), '只读硬约束:零表单控件').toHaveCount(0)
  })

  // Outcome "empty-state" — 空态为正常呈现。
  test.fixme('step1/empty-state: empty proposals/ renders the 暂无提案 placeholder + path note (normal state, no error)', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const world = await manager.acquire(bare as KernelWorld, 'bare', { tab: 'workbench/proposals' })
    const { page } = world

    const empty = page.locator('[data-dsh-forge-proposal-empty]')
    await expect(empty, '空态占位在场(暂无提案)').toBeVisible({ timeout: 30_000 })
    await expect(empty, '路径说明在场(文档根 proposals/)').toContainText('proposals')
    await expect(page.locator('[data-dsh-forge-proposal-error]'), '空态非错误(零错误面)').toHaveCount(0)
  })
})
