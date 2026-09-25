// tests/e2e/specs/out-of-repo-docs-root/harness — the journey's worlds and
// wizard drivers (T-test-gen-scripts, contract-derived).
//
// Traceability: docs/features/dsh-forge-m3/testing/out-of-repo-docs-root/
// contracts/step-{1..4}-*.md. Worlds:
//   pure   — 代码仓(git 基线 + .forge,零 docs/)+ 仓外文档根语料(测试
//            扮演落文档角色写至 <userData>/workbench/docs/<dirname>)—
//            Step 1/2 默认仓外腿;
//   legacy — 未注册、仓内已有过程文档但无 index.json(fixture 3;Step 2e →
//            step-3 legacy-in-repo-docs-invisible);
//   inrepo — 既有仓内文档项目(index.json 在仓内)经向导显式仓内注册 +
//            迁移(Step 4 兼容腿)。
// The registration paths run through the REAL wizard (the contract's anchor).

import { execSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { buildKernelWorld, type KernelWorld, type TaskSpec } from '../_lib/journey-world.ts'

export const OOR_FEATURE = 'oor-docs-root'

const TASKS: readonly TaskSpec[] = [
  { stem: '1-x', localId: '1', title: '仓外文档根管线任务(oor-docs-root)', status: 'pending', type: 'coding.feature', dependencies: [] },
]

const SHAPE = { slug: OOR_FEATURE, status: 'tasks', docKinds: ['prd', 'design'] }

/** The app-managed default docs root of one repo dir name under one root. */
export const managedDocRoot = (root: string, repoDir = 'repo'): string =>
  join(join(root, 'user-data'), 'workbench', 'docs', repoDir)

/** git-init a code root and commit the baseline (SC9 leg-1 discipline). */
export function gitInitBaseline(codeRoot: string): void {
  execSync('git init -q .', { cwd: codeRoot, timeout: 30_000 })
  execSync('git add -A', { cwd: codeRoot, timeout: 30_000 })
  execSync('git -c user.name=dsh-e2e -c user.email=dsh-e2e@local commit -qm "oor baseline"', { cwd: codeRoot, timeout: 30_000 })
}

/** The pure code-repo world: unregistered tree, docs at the MANAGED doc root. */
export async function buildPureWorld(root: string): Promise<KernelWorld> {
  const world = await buildKernelWorld(root, {
    feature: SHAPE,
    tasks: TASKS,
    register: false,
    repoDir: 'repo',
    docsRoot: managedDocRoot(root, 'repo'),
    stageAssets: [{ stage: 'design', goal: 'oor-docs-root 目标锚点(仓外资产)', summaryMark: 'oor-docs-root 摘要锚点。' }],
  })
  gitInitBaseline(world.codeRoot)
  return world
}

/** The legacy in-repo world: unregistered, in-repo process docs, NO index.json. */
export async function buildLegacyWorld(root: string): Promise<KernelWorld> {
  const world = await buildKernelWorld(root, { feature: SHAPE, tasks: TASKS, register: false })
  rmSync(join(world.featuresRoot, OOR_FEATURE, 'tasks', 'index.json'), { force: true })
  expect(existsSync(join(world.featuresRoot, OOR_FEATURE, 'tasks', 'index.json')), 'legacy 前置:index.json 已移除').toBe(false)
  return world
}

/** The in-repo compat world: unregistered tree with index.json in the repo. */
export async function buildInRepoWorld(root: string): Promise<KernelWorld> {
  return await buildKernelWorld(root, { feature: SHAPE, tasks: TASKS, register: false })
}

// ---------------------------------------------------------------------------
// The wizard drivers (the REAL registration paths)
// ---------------------------------------------------------------------------

/** Register through the wizard with the DEFAULT external doc root (authorized). */
export async function registerExternalViaWizard(page: Page, codeRoot: string, options: { expectMigration?: boolean } = {}): Promise<void> {
  const expectMigration = options.expectMigration ?? true
  await page.locator('[data-dsh-forge-add-project]').click()
  await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]')).toBeVisible({ timeout: 10_000 })
  await page.locator('[data-dsh-forge-wizard-path-input]').fill(codeRoot)
  await expect(page.locator('[data-dsh-forge-wizard-probe="detected"]'), 'forge 检出通过').toBeVisible({ timeout: 15_000 })
  await page.locator('[data-dsh-forge-wizard-next]').click()
  await expect(page.locator('[data-dsh-forge-wizard-step-doc]')).toBeVisible()
  await expect(page.locator('[data-dsh-forge-wizard-doc-external]'), '默认 = 仓外(external 单选选中)').toBeChecked()
  await page.locator('[data-dsh-forge-wizard-authorize]').check()
  await page.locator('[data-dsh-forge-wizard-next]').click()
  if (expectMigration) {
    // 文档根语料携 index.json → 条件迁移步骤(默认开)。
    await expect(page.locator('[data-dsh-forge-wizard-step-migrate]'), '文档根检出 index.json → 迁移步骤在场').toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-dsh-forge-wizard-migrate-toggle]')).toBeChecked()
    await page.locator('[data-dsh-forge-wizard-next]').click()
    await expect(page.locator('[data-dsh-forge-wizard-step-summary]')).toBeVisible()
    await page.locator('[data-dsh-forge-wizard-finish]').click()
    await expect(page.locator('[data-dsh-forge-wizard-step="migration"]')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-dsh-forge-migration-run="done"]')).toBeVisible({ timeout: 120_000 })
    await expect(page.locator('[data-dsh-forge-migration-parity-ok]')).toBeVisible()
    await page.locator('[data-dsh-forge-wizard-migration-enter]').click()
    await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]')).toHaveCount(0, { timeout: 15_000 })
    return
  }
  // 无迁移(已迁移过的重注册路径):直达摘要 → 完成。
  await expect(page.locator('[data-dsh-forge-wizard-step-migrate]')).toHaveCount(0)
  await expect(page.locator('[data-dsh-forge-wizard-step-summary]'), '直达摘要(无迁移步骤)').toBeVisible({ timeout: 10_000 })
  await page.locator('[data-dsh-forge-wizard-finish]').click()
  await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]')).toHaveCount(0, { timeout: 15_000 })
}

/** Register through the wizard EXPLICITLY in-repo (migration ON). */
export async function registerInRepoViaWizard(page: Page, codeRoot: string): Promise<void> {
  await page.locator('[data-dsh-forge-add-project]').click()
  await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]')).toBeVisible({ timeout: 10_000 })
  await page.locator('[data-dsh-forge-wizard-path-input]').fill(codeRoot)
  await expect(page.locator('[data-dsh-forge-wizard-probe="detected"]')).toBeVisible({ timeout: 15_000 })
  await page.locator('[data-dsh-forge-wizard-next]').click()
  await expect(page.locator('[data-dsh-forge-wizard-step-doc]')).toBeVisible()
  await expect(page.locator('[data-dsh-forge-wizard-doc-external]'), '前置:默认仍为仓外(M3 翻转)').toBeChecked()
  await page.locator('[data-dsh-forge-wizard-doc-in-repo]').click()
  await page.locator('[data-dsh-forge-wizard-next]').click()
  await expect(page.locator('[data-dsh-forge-wizard-step-migrate]'), '仓内树检出 index.json → 迁移步骤').toBeVisible({ timeout: 15_000 })
  await expect(page.locator('[data-dsh-forge-wizard-migrate-toggle]')).toBeChecked()
  await page.locator('[data-dsh-forge-wizard-next]').click()
  await expect(page.locator('[data-dsh-forge-wizard-step-summary]')).toBeVisible()
  await page.locator('[data-dsh-forge-wizard-finish]').click()
  await expect(page.locator('[data-dsh-forge-wizard-step="migration"]')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('[data-dsh-forge-migration-run="done"]')).toBeVisible({ timeout: 120_000 })
  await expect(page.locator('[data-dsh-forge-migration-parity-ok]')).toBeVisible()
  await page.locator('[data-dsh-forge-wizard-migration-enter]').click()
  await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]')).toHaveCount(0, { timeout: 15_000 })
}
