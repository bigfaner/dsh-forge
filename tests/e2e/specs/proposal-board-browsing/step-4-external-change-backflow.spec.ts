// @feature dsh-forge-m3 | @web-e2e | @journey proposal-board-browsing
// Traceability: docs/features/dsh-forge-m3/testing/proposal-board-browsing/
// contracts/step-4-external-change-backflow.md — Outcomes:
//   success             — 外部新增提案 → 列表新行 ≤5s(免手动刷新);外部改
//                         status → 行 Pill 翻转 ≤5s;回流内容与文件一致。
//   sync-error-degraded — DEFERRED(无注入缝):watcher/扫描故障注入在 6.2
//                         基座无 seam(不可选择性破坏感知链而不连带整面);
//                         「保留最后良好视图 + 文件恒为事实源」的不变量由
//                         success 腿的派生快照语义部分承载。覆盖留待缝位
//                         (见覆盖报告)。
// fixture_spec: Project + Proposal(外部写者的落位目标)— main world。

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { REFLOW_BUDGET_MS, freshRoot, proposalMarkdown, WorldManager } from '../_lib/journey-world.ts'
import { buildMainWorld, ORPHAN } from './harness.ts'
import type { KernelWorld } from '../_lib/journey-world.ts'

test.describe.serial('proposal-board-browsing / step 4: 外部变更回流', () => {
  const manager = new WorldManager()
  let kernel: KernelWorld | null = null

  test.beforeAll(async () => {
    kernel = await buildMainWorld(freshRoot('prop-s4'))
  })

  test.afterAll(async () => {
    await manager.closeAll()
  })

  // [M4 1.8 e2e 迁移·迁移清单 第③行 · M3 提案板(workbench/proposals)] 本测试功能面锚定 1.7 已退役的旧视图宿主,
  // P2 右栏 pane / 概览子 tab(2.1–2.4)落座后按新宿主恢复,2.10 全量复跑收口。
  // 断言本体零删改(零功能删除断言 Hard Rule)—— test.fixme 仅为过渡期挂起。

  // Outcome "success" — 外部新增 + 外部改 status,双 ≤5s 回流。
  test.fixme('step4/success: external ADD lands as a new row ≤5s and an external status flip turns the row pill ≤5s — no manual refresh, content = file', async ({ }, testInfo) => {
    testInfo.setTimeout(420_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main', { tab: 'workbench/proposals' })
    const { page } = world

    // ---- 外部新增(测试扮演外部写者:应用外直接落 proposal.md)---------
    const externalSlug = 'prop-external-add'
    const externalDir = join((kernel as KernelWorld).docsRoot, 'docs', 'proposals', externalSlug)
    mkdirSync(externalDir, { recursive: true })
    const tAdd = Date.now()
    writeFileSync(join(externalDir, 'proposal.md'), proposalMarkdown({
      status: 'rejected', author: 'external-agent', created: '2026-09-25', title: '外部新增提案(回流腿)', mark: 'prop-board 外部新增回流锚点。',
    }), 'utf8')

    const externalRow = page.locator(`[data-dsh-forge-proposal-row="${externalSlug}"]`)
    await externalRow.waitFor({ state: 'visible', timeout: 20_000 })
    const addMs = Date.now() - tAdd
    expect(addMs, `外部新增 → 列表新行 ≤${String(REFLOW_BUDGET_MS)}ms(实际 ${String(addMs)}ms)`).toBeLessThanOrEqual(REFLOW_BUDGET_MS)
    await expect(externalRow.locator('[data-dsh-forge-proposal-status="rejected"]'), '新行 status Pill 与文件一致').toBeVisible()

    // ---- 外部改 status(draft → accepted)→ Pill 翻转 ≤5s --------------
    const orphanPath = join((kernel as KernelWorld).docsRoot, 'docs', 'proposals', ORPHAN, 'proposal.md')
    const before = readFileSync(orphanPath, 'utf8')
    const tStatus = Date.now()
    writeFileSync(orphanPath, before.replace('status: draft', 'status: accepted'), 'utf8')
    await page.locator(`[data-dsh-forge-proposal-row="${ORPHAN}"] [data-dsh-forge-proposal-status="accepted"]`)
      .waitFor({ state: 'visible', timeout: 20_000 })
    const statusMs = Date.now() - tStatus
    expect(statusMs, `外部改 status → Pill 翻转 ≤${String(REFLOW_BUDGET_MS)}ms(实际 ${String(statusMs)}ms)`).toBeLessThanOrEqual(REFLOW_BUDGET_MS)

    // 回流内容与文件一致(文件恒为事实源;板为派生快照)。
    expect(readFileSync(orphanPath, 'utf8'), '写者侧文件 = 修改后内容').toContain('status: accepted')
  })
})
