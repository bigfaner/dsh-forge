// @feature dsh-forge-m3 | @web-e2e | @journey proposal-board-browsing
// Traceability: docs/features/dsh-forge-m3/testing/proposal-board-browsing/
// contracts/step-2-proposal-detail-eval.md — one test per Outcome:
//   success               — 详情双 tab(proposal/eval)只读渲染,内容与文档根
//                           文件一致(逐字锚点);返回回列表。
//   no-feature-badge      — 孤儿提案:列表无徽标,详情浏览照常(正常态)。
//   markdown-injection-guard — 恶意 markdown 经白名单渲染:注入不生效(零
//                           script/事件/危险链接),面板零交互元素。
// fixture_spec: Project + Proposal(body 非空)+ EvalReport — main world。

import { expect, test } from '@playwright/test'
import { freshRoot, WorldManager } from '../_lib/journey-world.ts'
import { ASSOCIATED, ASSOCIATED_AUTHOR, ASSOCIATED_CREATED, ASSOCIATED_H1, ASSOCIATED_MARK, buildMainWorld, EVAL_H1, EVAL_MARK, HOSTILE, HOSTILE_MARK, ORPHAN, ORPHAN_H1 } from './harness.ts'
import type { KernelWorld } from '../_lib/journey-world.ts'

test.describe.serial('proposal-board-browsing / step 2: 查看提案详情与 eval 报告', () => {
  const manager = new WorldManager()
  let kernel: KernelWorld | null = null

  test.beforeAll(async () => {
    kernel = await buildMainWorld(freshRoot('prop-s2'))
  })

  test.afterAll(async () => {
    await manager.closeAll()
  })

  // Outcome "success" — 详情双 tab 渲染一致 + 返回。
  test('step2/success: detail renders the proposal body AND the eval report verbatim (MarkdownView whitelist); the breadcrumb returns to the board', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main', { tab: 'workbench/proposals' })
    const { page } = world

    await page.locator(`[data-dsh-forge-proposal-row="${ASSOCIATED}"]`).click()
    const detail = page.locator(`[data-dsh-forge-proposal-detail="${ASSOCIATED}"]`)
    await expect(detail, '详情子视图在场').toBeVisible({ timeout: 15_000 })
    await expect(detail.locator('[data-dsh-forge-proposal-detail-title]'), '详情标题 = slug').toHaveText(ASSOCIATED)
    await expect(detail.locator('[data-dsh-forge-proposal-header]'), '头部 meta = author · created(frontmatter 一致)')
      .toContainText(`${ASSOCIATED_AUTHOR} · ${ASSOCIATED_CREATED}`)

    // proposal tab:渲染与文件一致(逐字锚点)。
    const proposalPanel = detail.locator('[data-dsh-forge-proposal-doc-panel="proposal"]')
    await expect(proposalPanel, 'proposal H1 一致').toContainText(ASSOCIATED_H1)
    await expect(proposalPanel, 'proposal 正文锚点一致').toContainText(ASSOCIATED_MARK)

    // eval tab:渲染与 eval/final-report.md 一致。
    await detail.locator('[data-dsh-forge-proposal-doc-tab="eval"]').click()
    const evalPanel = detail.locator('[data-dsh-forge-proposal-doc-panel="eval"]')
    await expect(evalPanel, 'eval H1 一致').toContainText(EVAL_H1)
    await expect(evalPanel, 'eval 锚点一致').toContainText(EVAL_MARK)

    // 渲染区零交互元素(只读)。
    await expect(proposalPanel.locator('button, a, input, select, textarea, [role="button"]'), 'proposal 渲染区零交互').toHaveCount(0)
    await expect(evalPanel.locator('button, a, input, select, textarea, [role="button"]'), 'eval 渲染区零交互').toHaveCount(0)

    // 返回回到提案看板。
    await detail.locator('[data-dsh-forge-proposal-back]').click()
    await expect(page.locator('[data-dsh-forge-proposal-list-seat], [data-dsh-forge-proposal-rows]').first(), '返回 → 列表').toBeVisible({ timeout: 15_000 })
  })

  // Outcome "no-feature-badge" — 孤儿详情照常(正常态,非错误)。
  test('step2/no-feature-badge: the unassociated proposal browses normally (detail + proposal body); NULL feature is a legal early-pipeline shape', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main', { tab: 'workbench/proposals' })
    const { page } = world

    await page.locator(`[data-dsh-forge-proposal-row="${ORPHAN}"]`).click()
    const detail = page.locator(`[data-dsh-forge-proposal-detail="${ORPHAN}"]`)
    await expect(detail, '孤儿详情在场(正常态)').toBeVisible({ timeout: 15_000 })
    await expect(detail.locator('[data-dsh-forge-proposal-doc-panel="proposal"]'), '孤儿正文渲染与文件一致').toContainText(ORPHAN_H1)
    await expect(detail.locator('[data-dsh-forge-proposal-doc-tab="eval"]'), '无 eval → tab 禁用(不隐藏)').toBeDisabled()
    await detail.locator('[data-dsh-forge-proposal-back]').click()
  })

  // Outcome "markdown-injection-guard" — 白名单渲染,注入不生效。
  test('step2/markdown-injection-guard: the hostile proposal renders through the whitelist — zero script execution, zero handler attributes, zero javascript: links', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main', { tab: 'workbench/proposals' })
    const { page } = world

    await page.locator(`[data-dsh-forge-proposal-row="${HOSTILE}"]`).click()
    const detail = page.locator(`[data-dsh-forge-proposal-detail="${HOSTILE}"]`)
    await expect(detail).toBeVisible({ timeout: 15_000 })

    // 正文锚点在场(内容渲染),而注入结构全部不生效。
    const panel = detail.locator('[data-dsh-forge-proposal-doc-panel="proposal"]')
    await expect(panel, '语料正文锚点渲染').toContainText(HOSTILE_MARK)
    await expect(panel.locator('script'), '零 <script> 元素').toHaveCount(0)
    await expect(panel.locator('[onerror], [onclick], [onload]'), '零事件属性').toHaveCount(0)
    const injected = await detail.evaluate(() => ({
      script: (window as unknown as { __injected?: boolean }).__injected === true,
      img: (window as unknown as { __imgInjected?: boolean }).__imgInjected === true,
      link: (window as unknown as { __linkInjected?: boolean }).__linkInjected === true,
    }))
    expect(injected, '注入不生效(script/img/link 三面零执行痕迹)').toEqual({ script: false, img: false, link: false })

    // eval 面(恶意 eval 报告)同口径。
    await detail.locator('[data-dsh-forge-proposal-doc-tab="eval"]').click()
    const evalPanel = detail.locator('[data-dsh-forge-proposal-doc-panel="eval"]')
    await expect(evalPanel.locator('script, [onerror], [onclick], [onload]'), 'eval 渲染零注入结构').toHaveCount(0)
  })
})
