// @feature dsh-forge-m3 | @web-e2e | @journey stage-gates-cross-phase-context
// Traceability: docs/features/dsh-forge-m3/testing/stage-gates-cross-phase-
// context/contracts/step-5-asset-panel-browse.md — one test per Outcome:
//   success              — 「阶段资产」面板:目标 + 摘要只读渲染(frontmatter
//                          + 正文逐字);渲染区零交互元素。
//   markdown-injection-guard — 恶意资产文件经 MarkdownView 白名单:注入
//                          不生效,面板严格只读。
// fixture_spec: Project/Feature/StageAsset(良性 + 恶意内容)。

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { bridgeInvoke, freshRoot, WorldManager } from '../_lib/journey-world.ts'
import { buildMainWorld, GATE_FEATURE, TASKS_GOAL, TASKS_SUMMARY_MARK } from './harness.ts'
import type { KernelWorld } from '../_lib/journey-world.ts'

test.describe.serial('stage-gates-cross-phase-context / step 5: 阶段资产面板只读浏览', () => {
  const manager = new WorldManager()
  let kernel: KernelWorld | null = null

  test.beforeAll(async () => {
    kernel = await buildMainWorld(freshRoot('gate-s5'))
  })

  test.afterAll(async () => {
    await manager.closeAll()
  })

  /** Open the feature detail's assets panel (assumes summary written first). */
  async function openAssetsPanel(world: Awaited<ReturnType<WorldManager['acquire']>>) {
    const { page } = world
    const card = page.locator(`[data-dsh-forge-feature-card="${GATE_FEATURE}"]`)
    await expect(card).toBeVisible({ timeout: 30_000 })
    await card.click()
    const detail = page.locator(`[data-dsh-forge-feature-detail="${GATE_FEATURE}"]`)
    await expect(detail).toBeVisible({ timeout: 10_000 })
    await detail.locator('[data-dsh-forge-feature-doc-tab="assets"]').click()
    const panel = detail.locator('[data-dsh-forge-feature-doc-panel="assets"]')
    await expect(panel).toBeVisible({ timeout: 10_000 })
    return { detail, panel }
  }

  // Outcome "success" — 良性内容只读渲染。
  test('step5/success: the assets panel renders goal + summary read-only (verbatim anchors); ZERO interactive elements in the render area', async ({ }, testInfo) => {
    testInfo.setTimeout(420_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main', { tab: 'workbench/features' })
    const { page } = world

    // 产出良性资产(stageSummarize 写面)。
    const summarized = await bridgeInvoke<{ gateOpen: boolean }>(page, 'stageSummarize', [{
      projectId: world.projectId, featureSlug: GATE_FEATURE, stage: 'tasks', goal: TASKS_GOAL, summary: `${TASKS_SUMMARY_MARK}\n`,
    }])
    expect(summarized.gateOpen).toBe(true)

    const { panel } = await openAssetsPanel(world)
    const tasksCard = panel.locator('[data-dsh-forge-stage-asset="tasks"]')
    await expect(tasksCard, 'tasks 资产卡在场').toBeVisible({ timeout: 15_000 })
    await expect(tasksCard, '目标逐字渲染(frontmatter goal)').toContainText(TASKS_GOAL)
    await expect(tasksCard, '摘要逐字渲染(正文)').toContainText(TASKS_SUMMARY_MARK)
    await expect(tasksCard.locator('button, a, [role="button"]'), '只读纪律:渲染区零交互元素').toHaveCount(0)
  })

  // Outcome "markdown-injection-guard" — 恶意资产白名单渲染。
  test('step5/markdown-injection-guard: a hostile stage-asset file renders through the whitelist — injections stay inert, the panel stays strictly read-only', async ({ }, testInfo) => {
    testInfo.setTimeout(420_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main')
    const { page } = world

    // 恶意资产文件(外部直写形态;frontmatter 保持合法以通过解析)。
    const hostileDir = join(world.kernel.featuresRoot, GATE_FEATURE, 'stages')
    mkdirSync(hostileDir, { recursive: true })
    const hostileBody = [
      '---',
      'stage: design',
      'generated: "2026-09-25T10:00:00.000Z"',
      'goal: "gate-loop 恶意资产目标"',
      '---',
      '',
      'gate-loop 恶意资产正文锚点(白名单渲染验收)。',
      '',
      '<script>window.__gateInjected = true</script>',
      '',
      '<img src=x onerror="window.__gateImgInjected = true" />',
      '',
    ].join('\n')
    writeFileSync(join(hostileDir, 'design.md'), hostileBody, 'utf8')
    expect(existsSync(join(hostileDir, 'design.md')), '恶意资产落盘(前置)').toBe(true)

    // 感知收编 → 面板呈现该资产卡。
    const { panel } = await openAssetsPanel(world)
    const hostileCard = panel.locator('[data-dsh-forge-stage-asset="design"]')
    await hostileCard.waitFor({ state: 'visible', timeout: 20_000 })
    await expect(hostileCard, '语料正文锚点渲染').toContainText('gate-loop 恶意资产正文锚点')
    await expect(hostileCard.locator('script, [onerror], [onclick], [onload]'), '注入结构不生效').toHaveCount(0)
    const injected = await panel.evaluate(() => ({
      script: (window as unknown as { __gateInjected?: boolean }).__gateInjected === true,
      img: (window as unknown as { __gateImgInjected?: boolean }).__gateImgInjected === true,
    }))
    expect(injected, '零执行痕迹(script/img)').toEqual({ script: false, img: false })
    await expect(hostileCard.locator('button, a, input, select, textarea, [role="button"]'), '面板严格只读(无编辑/写入口)').toHaveCount(0)
  })
})
