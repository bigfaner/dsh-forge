// @feature dsh-forge-m2 | @web-e2e | @journey feature-board-docs-browsing
// Traceability: docs/features/dsh-forge-m2/testing/feature-board-docs-browsing/contracts/step-4-register-external-docs-project.md
//
// Step 4 注册仓外文档项目:
//   success —— 代码根目录与仓外 docs 树分离的 forge 项目,经向导步骤②
//     (external + 显式授权勾选)注册并激活(SC5 wizardExternal 配方;
//     feature 旅程无发起面 → 无 stub CLI/DSH_FORGE_PROJECT_ROOTS 供给)。
//     断言:注册卡在场并激活;getState 落库形态 = docLocationType external、
//     docLocationPath = 仓外路径(≠ codeRoot,FT-036);feature 列表读仓外树
//     (slug 与仓外 fixture 一致);文档内容与仓外树文件规范化全等(仓内/
//     仓外同口径)。
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { FORGE_WORKBENCH_STAGED_AT, forgeWorkbenchTarball } from '../helpers/plugins.ts'
import { writeForgeProject } from '../fixtures/forge-project.ts'
import { cleanupViewKey, closeAndAwaitExit, createAppSessionFactory, switchToWorkbench } from '../tests/m2/helpers/restart-app.ts'
import {
  cardOf, externalDocBytes, externalTaskSet, fixtureTextProjection, getStateProjects, normalizeDoc,
  panelText, wizardExternal, workbenchBundles,
} from './helpers.ts'

const EXT_SLUG = 'fixture-ext-alpha'

test('step-4/success [@web-e2e @journey feature-board-docs-browsing]: wizard external leg registers + activates the project whose features and docs read the external tree', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-fb4-'))
  const externalDocs = join(root, 'fb4-ext-docs')
  // 代码根与仓外 docs 树分离(writeForgeProject 的 docsRoot 缝)。
  const project = writeForgeProject(externalTaskSet(EXT_SLUG, 'fb4ext'), {
    codeRoot: join(root, 'proj-fb4-ext'),
    docsRoot: externalDocs,
  })
  const projectName = 'proj-fb4-ext'

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

      // 概览 → 注册向导:步骤① codeRoot 探测 → 步骤② external + 授权 → 完成。
      await switchToWorkbench(page)
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible()
      await page.locator('[data-dsh-forge-add-project]').click()
      await wizardExternal(page, project.codeRoot, externalDocs)
      await expect(cardOf(page, projectName), '注册卡在场').toBeVisible({ timeout: 30_000 })

      // 落库形态读数对拍(FT-036:external 位置必带路径且 ≠ codeRoot)。
      const rows = await getStateProjects(page)
      const registered = rows.find(row => row.displayName === projectName)
      expect(registered, 'getState 行在场').toBeDefined()
      expect(registered?.docLocationType).toBe('external')
      expect(registered?.docLocationPath).toBe(externalDocs.replaceAll('\\', '/'))
      expect(registered?.docLocationPath).not.toBe(registered?.codeRoot)

      // 激活(注册完成后的单激活事务)。
      await cardOf(page, projectName).locator('[data-dsh-forge-card-action="activate"]').click()
      await expect(cardOf(page, projectName)).toHaveAttribute('data-active', 'true', { timeout: 10_000 })

      // feature 列表读仓外树:slug 与仓外 fixture 一致;文档内容与仓外树文件全等。
      await page.getByRole('tab', { name: /^Feature$|^Features$/ }).click()
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-features"]')).toBeVisible()
      const extCard = page.locator(`[data-dsh-forge-feature-card="${EXT_SLUG}"]`)
      await expect(extCard, '仓外树的 feature slug 入列').toBeVisible({ timeout: 30_000 })
      await extCard.click()
      const detail = page.locator(`[data-dsh-forge-feature-detail="${EXT_SLUG}"]`)
      await expect(detail).toBeVisible({ timeout: 15_000 })
      await expect.poll(async () => normalizeDoc(await panelText(detail, 'manifest')), {
        timeout: 30_000,
        message: '仓外 manifest: rendered ≁ external fixture file (normalized compare)',
      }).toBe(fixtureTextProjection(externalDocBytes(externalDocs, EXT_SLUG, 'manifest')))

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
