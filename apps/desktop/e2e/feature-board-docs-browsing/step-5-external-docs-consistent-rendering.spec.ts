// @feature dsh-forge-m2 | @web-e2e | @journey feature-board-docs-browsing
// Traceability: docs/features/dsh-forge-m2/testing/feature-board-docs-browsing/contracts/step-5-external-docs-consistent-rendering.md
//
// Step 5 仓外文档一致渲染:
//   success —— 仓外项目(Step 4 同构:向导 external 注册 + 激活)feature
//     详情带仓外角标(DF005 工作台自有状态);五类文档与仓内同一渲染面,
//     内容与仓外 fixture 文件规范化全等(仓内/仓外同口径)。
//   external-path-invalid-repoint —— 路径失效(删第一棵仓外树的 docs)→
//     概览失联卡 + 重新指向入口 + 卡失联徽标;文档读取逐次复验 → 文档错误
//     卡;已扫快照不被静默清空(feature 列表仍在);重指向向导(编辑模式,
//     步骤① codeRoot 只读直进)→ 指向第二仓外树(同构五类齐备、不同 slug
//     —— eval 残差要求的恢复目标树约束)+ 重确认授权 → 失联消退、快照按
//     新树重建(旧 slug 消失、新 slug 入列、文档随新树)。
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { FORGE_WORKBENCH_STAGED_AT, forgeWorkbenchTarball } from '../helpers/plugins.ts'
import { writeForgeProject } from '../fixtures/forge-project.ts'
import { cleanupViewKey, closeAndAwaitExit, createAppSessionFactory, switchToWorkbench } from '../tests/m2/helpers/restart-app.ts'
import {
  cardOf, externalDocBytes, externalTaskSet, fixtureTextProjection, getStateProjects, normalizeDoc,
  panelText, wizardExternal, workbenchBundles,
} from './helpers.ts'

const EXT_ONE_SLUG = 'fixture-ext-one'
const EXT_TWO_SLUG = 'fixture-ext-two'

/** 仓外项目注册 + 激活的公共前奏(step-4 同构配方)。 */
async function registerExternalProject(
  page: Page, codeRoot: string, externalDocs: string, displayName: string,
): Promise<void> {
  await switchToWorkbench(page)
  await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible()
  await page.locator('[data-dsh-forge-add-project]').click()
  await wizardExternal(page, codeRoot, externalDocs)
  await expect(cardOf(page, displayName)).toBeVisible({ timeout: 30_000 })
  await cardOf(page, displayName).locator('[data-dsh-forge-card-action="activate"]').click()
  await expect(cardOf(page, displayName)).toHaveAttribute('data-active', 'true', { timeout: 10_000 })
}

test('step-5/success [@web-e2e @journey feature-board-docs-browsing]: external feature detail carries the 仓外 badge and all five docs render identically to the external fixture files', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-fb5-'))
  const externalDocs = join(root, 'fb5-ext-docs')
  const project = writeForgeProject(externalTaskSet(EXT_ONE_SLUG, 'fb5ext'), {
    codeRoot: join(root, 'proj-fb5-ext'),
    docsRoot: externalDocs,
  })
  const projectName = 'proj-fb5-ext'

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
      await registerExternalProject(page, project.codeRoot, externalDocs, projectName)

      // feature 详情:仓外角标(DF005)+ 五类文档同口径对比。
      await page.getByRole('tab', { name: /^feature$|^Features$/ }).click()
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-features"]')).toBeVisible()
      const extCard = page.locator(`[data-dsh-forge-feature-card="${EXT_ONE_SLUG}"]`)
      await expect(extCard).toBeVisible({ timeout: 30_000 })
      await extCard.click()
      const detail = page.locator(`[data-dsh-forge-feature-detail="${EXT_ONE_SLUG}"]`)
      await expect(detail).toBeVisible({ timeout: 15_000 })
      await expect(detail.locator('[data-dsh-forge-badge="external-docs"]'),
        '仓外文档角标(文档位置来源 = 工作台自有状态)').toBeVisible()

      for (const kind of ['manifest', 'prd', 'design', 'ui', 'tasks'] as const) {
        const tab = page.locator(`[data-dsh-forge-feature-doc-tab="${kind}"]`)
        await expect(tab, `${kind} tab enabled(仓外同构五类齐备)`).toBeEnabled()
        await tab.click()
        await expect.poll(async () => normalizeDoc(await panelText(detail, kind)), {
          timeout: 30_000,
          message: `${kind}: rendered ≁ external fixture file (same normalized compare as in_repo)`,
        }).toBe(fixtureTextProjection(externalDocBytes(externalDocs, EXT_ONE_SLUG, kind)))
      }

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
    expect(existsSync(root)).toBe(false)
  }
})

test('step-5/external-path-invalid-repoint [@web-e2e @journey feature-board-docs-browsing]: invalid external path → lost card + doc error with snapshot retained; repoint to the second isomorphic tree rebuilds from it', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-fb5r-'))
  const externalDocsOne = join(root, 'fb5-ext-docs-1')
  const externalDocsTwo = join(root, 'fb5-ext-docs-2')
  const project = writeForgeProject(externalTaskSet(EXT_ONE_SLUG, 'fb5r1'), {
    codeRoot: join(root, 'proj-fb5-repoint'),
    docsRoot: externalDocsOne,
  })
  // 第二仓外树:恢复目标 —— 同构五类齐备、不同 slug(eval 残差约束)。
  writeForgeProject(externalTaskSet(EXT_TWO_SLUG, 'fb5r2'), {
    codeRoot: join(root, 'proj-fb5-repoint-scratch'),
    docsRoot: externalDocsTwo,
  })
  const projectName = 'proj-fb5-repoint'

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
      await registerExternalProject(page, project.codeRoot, externalDocsOne, projectName)

      // ---- 失效注入:删第一棵仓外树的 docs(被 watch 的 features 随父消失)。--
      rmSync(join(externalDocsOne, 'docs'), { recursive: true, force: true })
      await page.getByRole('tab', { name: /^概览$|^Overview$/ }).click()
      await expect(page.locator('[data-dsh-forge-overview-lost]'),
        '激活的仓外项目失联卡(FT-053 错误卡 + 重新指向引导)').toBeVisible({ timeout: 60_000 })
      await expect(page.locator('[data-dsh-forge-overview-repoint]'), '重新指向入口').toBeVisible()
      await expect(cardOf(page, projectName).locator('[data-dsh-forge-card-lost-badge]'), '卡失联徽标').toBeVisible()

      // 已扫快照不被静默清空:feature 列表仍在;文档读取逐次复验 → 错误卡。
      await page.getByRole('tab', { name: /^feature$|^Features$/ }).click()
      await expect(page.locator(`[data-dsh-forge-feature-card="${EXT_ONE_SLUG}"]`),
        '既有 feature 快照保留(错误态不清数据)').toBeVisible({ timeout: 30_000 })
      await page.locator(`[data-dsh-forge-feature-card="${EXT_ONE_SLUG}"]`).click()
      const detailOne = page.locator(`[data-dsh-forge-feature-detail="${EXT_ONE_SLUG}"]`)
      await expect(detailOne).toBeVisible({ timeout: 15_000 })
      await expect(detailOne.locator('[data-dsh-forge-feature-doc-error]'),
        '路径失效 → 文档读取复验失败(UF4 error)').toBeVisible({ timeout: 30_000 })

      // ---- 重新指向:失联卡入口 → 向导编辑模式 → 第二仓外树 + 重确认授权。--
      await page.getByRole('tab', { name: /^概览$|^Overview$/ }).click()
      await page.locator('[data-dsh-forge-overview-repoint]').click()
      // 编辑模式:步骤① codeRoot 只读直进;步骤② 改路径 + 重确认授权。
      await page.locator('[data-dsh-forge-wizard-next]').click()
      await page.locator('[data-dsh-forge-wizard-external-input]').fill(externalDocsTwo)
      await page.locator('[data-dsh-forge-wizard-authorize]').check()
      await expect(page.locator('[data-dsh-forge-wizard-next]')).toBeEnabled()
      await page.locator('[data-dsh-forge-wizard-next]').click()
      await page.locator('[data-dsh-forge-wizard-finish]').click()

      // 恢复:失联卡消退;落库路径 = 第二仓外树(FT-036)。
      await expect(page.locator('[data-dsh-forge-overview-lost]'), '错误态消退').toHaveCount(0, { timeout: 30_000 })
      const repointed = (await getStateProjects(page)).find(row => row.displayName === projectName)
      expect(repointed?.docLocationType).toBe('external')
      expect(repointed?.docLocationPath).toBe(externalDocsTwo.replaceAll('\\', '/'))

      // 快照按新树重建:旧 slug 出集、新 slug 入集;文档内容随新树。
      await page.getByRole('tab', { name: /^feature$|^Features$/ }).click()
      await expect(page.locator(`[data-dsh-forge-feature-card="${EXT_TWO_SLUG}"]`),
        '新树 slug 入列(重建)').toBeVisible({ timeout: 30_000 })
      await expect(page.locator(`[data-dsh-forge-feature-card="${EXT_ONE_SLUG}"]`),
        '旧树 slug 出集').toHaveCount(0)
      await page.locator(`[data-dsh-forge-feature-card="${EXT_TWO_SLUG}"]`).click()
      const detailTwo = page.locator(`[data-dsh-forge-feature-detail="${EXT_TWO_SLUG}"]`)
      await expect(detailTwo).toBeVisible({ timeout: 15_000 })
      await expect(detailTwo.locator('[data-dsh-forge-badge="external-docs"]'), '仓外角标(新树)').toBeVisible()
      await expect.poll(async () => normalizeDoc(await panelText(detailTwo, 'manifest')), {
        timeout: 30_000,
        message: 'recovered manifest: rendered ≁ tree-2 fixture file',
      }).toBe(fixtureTextProjection(externalDocBytes(externalDocsTwo, EXT_TWO_SLUG, 'manifest')))

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
    expect(existsSync(root)).toBe(false)
  }
})
