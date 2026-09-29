// @feature dsh-forge-m2 | @web-e2e | @journey feature-board-docs-browsing
// Journey smoke test (happy path): 健康双样板 → feature 看板(Pill + 徽标 +
// 计数)→ 双样板 stepper → 五类 tab 启用矩阵 + 规范化对比 + 返回导航 →
// 向导 external 注册仓外项目 → 激活 → 仓外角标 + manifest 与仓外文件全等。
// Traceability: docs/features/dsh-forge-m2/testing/feature-board-docs-browsing/contracts/step-{1..5}-*.md
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { FORGE_WORKBENCH_STAGED_AT, forgeWorkbenchTarball } from '../helpers/plugins.ts'
import { registerFixtureProject, writeForgeProject } from '../fixtures/forge-project.ts'
import { cleanupViewKey, closeAndAwaitExit, createAppSessionFactory } from '../tests/m2/helpers/restart-app.ts'
import {
  COMPLETED_SAMPLE_SLUG, FIVE_KINDS, LIVE_SAMPLE_SLUG, boardTaskSet, cardOf, externalDocBytes,
  externalTaskSet, fixtureDocBytes, fixtureTextProjection, normalizeDoc, openFeaturesTab, panelText,
  wizardExternal, workbenchBundles,
} from './helpers.ts'

const EXT_SMOKE_SLUG = 'fixture-ext-smoke'

// [M4 1.8 e2e 迁移·迁移清单 第④行 · M3 阶段资产面板 / Feature 板(workbench/features)] 本测试功能面锚定 1.7 已退役的旧视图宿主,
// P2 2.10 复核:断言锚定已退役宿主方言(旧向导/换台 chrome/提案板与
// Feature 板详情/阶段资产面板内部件),右栏 pane 族未承接 —— 挂起终态与恢复前置 = regression-inventory.md 开放项。
// 断言本体零删改(零功能删除断言 Hard Rule)—— test.fixme 仅为过渡期挂起。
test.fixme('smoke/happy-path [@web-e2e @journey feature-board-docs-browsing]: board(Pill+badge+counts) → steppers → five tabs + compare + back → register external → activate → external badge + manifest compare', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)

  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-fbsmoke-'))
  const inRepo = writeForgeProject(boardTaskSet(), { codeRoot: join(root, 'proj-fb-smoke') })
  const externalDocs = join(root, 'fb-smoke-ext-docs')
  const externalProject = writeForgeProject(externalTaskSet(EXT_SMOKE_SLUG, 'fbsmokeext'), {
    codeRoot: join(root, 'proj-fb-smoke-ext'),
    docsRoot: externalDocs,
  })

  const session = createAppSessionFactory({
    bundles: workbenchBundles(),
    stageTarballs: [{ at: FORGE_WORKBENCH_STAGED_AT, from: forgeWorkbenchTarball() }],
    rootDir: join(root, 'shell'),
    userDataDir: join(root, 'user-data'),
  })
  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      await registerFixtureProject(page, inRepo)

      // ---- Step 1:看板双样板(Pill + 徽标 + 计数)。--------------------------
      await openFeaturesTab(page)
      const doneCard = page.locator(`[data-dsh-forge-feature-card="${COMPLETED_SAMPLE_SLUG}"]`)
      const liveCard = page.locator(`[data-dsh-forge-feature-card="${LIVE_SAMPLE_SLUG}"]`)
      await expect(doneCard).toBeVisible({ timeout: 30_000 })
      await expect(liveCard).toBeVisible({ timeout: 30_000 })
      await expect(doneCard.locator('[data-dsh-forge-feature-status="completed"]')).toBeVisible()
      await expect(liveCard.locator('[data-dsh-forge-feature-status="in-progress"]')).toBeVisible()
      await expect(doneCard).toHaveAttribute('data-dsh-forge-feature-complete', '')
      await expect(doneCard.locator('[data-dsh-forge-feature-completed]')).toBeVisible()
      await expect(liveCard.locator('[data-dsh-forge-feature-completed]')).toHaveCount(0)
      await expect(doneCard.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '4')
      await expect(doneCard.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '4')
      await expect(liveCard.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
      await expect(liveCard.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '3')

      // ---- Step 2:双样板 stepper(manifest 词表透传)。------------------------
      await doneCard.click()
      const doneDetail = page.locator(`[data-dsh-forge-feature-detail="${COMPLETED_SAMPLE_SLUG}"]`)
      await expect(doneDetail).toBeVisible({ timeout: 15_000 })
      await expect(doneDetail.locator('[data-dsh-forge-feature-stepper] [data-dsh-forge-stepper-state="current"]'))
        .toHaveAttribute('data-dsh-forge-stepper-phase', 'completed')
      await page.locator('[data-dsh-forge-feature-back]').click()
      await liveCard.click()
      const liveDetail = page.locator(`[data-dsh-forge-feature-detail="${LIVE_SAMPLE_SLUG}"]`)
      await expect(liveDetail).toBeVisible({ timeout: 15_000 })
      // M3 UF2(任务 4.4):样板无阶段资产 → 当前节点呈现 gate-pending 态
      // (warn 描边;总结未生成),非 current。
      await expect(liveDetail.locator('[data-dsh-forge-feature-stepper] [data-dsh-forge-stepper-state="gate-pending"]'))
        .toHaveAttribute('data-dsh-forge-stepper-phase', 'in-progress')

      // ---- Step 3:五类 tab 启用矩阵 + 规范化对比 + 返回导航。----------------
      await page.locator('[data-dsh-forge-feature-back]').click()
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-features"]')).toBeVisible()
      await doneCard.click()
      await expect(doneDetail).toBeVisible({ timeout: 15_000 })
      for (const kind of FIVE_KINDS) {
        const tab = page.locator(`[data-dsh-forge-feature-doc-tab="${kind}"]`)
        await expect(tab).toBeEnabled()
        await tab.click()
        await expect.poll(async () => normalizeDoc(await panelText(doneDetail, kind)), { timeout: 30_000 })
          .toBe(fixtureTextProjection(fixtureDocBytes(inRepo, COMPLETED_SAMPLE_SLUG, kind)))
      }
      await page.locator('[data-dsh-forge-feature-back]').click()
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-features"]')).toBeVisible()

      // ---- Step 4/5:向导 external 注册仓外项目 → 激活 → 仓外角标 + 对比。----
      await page.getByRole('tab', { name: /^概览$|^Overview$/ }).click()
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible()
      await page.locator('[data-dsh-forge-add-project]').click()
      await wizardExternal(page, externalProject.codeRoot, externalDocs)
      await expect(cardOf(page, 'proj-fb-smoke-ext')).toBeVisible({ timeout: 30_000 })
      await cardOf(page, 'proj-fb-smoke-ext').locator('[data-dsh-forge-card-action="activate"]').click()
      await expect(cardOf(page, 'proj-fb-smoke-ext')).toHaveAttribute('data-active', 'true', { timeout: 10_000 })

      await page.getByRole('tab', { name: /^Feature$|^Features$/ }).click()
      const extCard = page.locator(`[data-dsh-forge-feature-card="${EXT_SMOKE_SLUG}"]`)
      await expect(extCard).toBeVisible({ timeout: 30_000 })
      await extCard.click()
      const extDetail = page.locator(`[data-dsh-forge-feature-detail="${EXT_SMOKE_SLUG}"]`)
      await expect(extDetail).toBeVisible({ timeout: 15_000 })
      await expect(extDetail.locator('[data-dsh-forge-badge="external-docs"]'), '仓外文档角标').toBeVisible()
      await expect.poll(async () => normalizeDoc(await panelText(extDetail, 'manifest')), { timeout: 30_000 })
        .toBe(fixtureTextProjection(externalDocBytes(externalDocs, EXT_SMOKE_SLUG, 'manifest')))

      // Journey invariant face:仓外树文件未被注册/浏览改动(只读渲染,直读口径)。
      const manifestPath = join(externalDocs, 'docs', 'features', EXT_SMOKE_SLUG, 'manifest.md')
      expect(readFileSync(manifestPath, 'utf8'), '仓外 fixture 文件零改写').toBe(externalDocBytes(externalDocs, EXT_SMOKE_SLUG, 'manifest'))

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
    expect(existsSync(root)).toBe(false)
  }
})
