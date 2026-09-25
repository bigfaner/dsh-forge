// tests/e2e/specs/preferences-tiered-override/harness — the journey's worlds
// and prefs-surface helpers (T-test-gen-scripts, contract-derived).
//
// Traceability: docs/features/dsh-forge-m3/testing/preferences-tiered-override/
// contracts/step-{1..6}-*.md. Worlds:
//   main — feature `prefs-loop` at tasks (prd+design ⇒ 派发无警告), stage
//          asset design.md(要素②),1 个零依赖 pending coding.feature 任务
//          (Step 5 派发消费腿);
//   bare — 注册项目但零 feature(feature 层级不可编辑腿)。
// The prefs editing-surface dialect (SC5 proven selectors) lives here.

import { expect, type Page } from '@playwright/test'
import { buildKernelWorld, type KernelWorld, type TaskSpec } from '../_lib/journey-world.ts'
import type { GeneratedTaskSet } from '../../../../apps/desktop/e2e/fixtures/task-generator.ts'

export const PREFS_FEATURE = 'prefs-loop'
export const PREFS_TASK = `${PREFS_FEATURE}/1`

/** The ladder keys: a boolean (contract fixture) + the coverage trio carrier. */
export const BOOL_KEY = 'auto.test.quick'
export const COVERAGE_KEY = 'coverage.coding.feature'

const MAIN_TASKS: readonly TaskSpec[] = [
  { stem: '1-x', localId: '1', title: '偏好派发消费腿任务一(prefs-loop,coding.feature 协议)', status: 'pending', type: 'coding.feature', dependencies: [] },
  { stem: '2-x', localId: '2', title: '偏好不追溯腿任务二(prefs-loop,coding.feature 协议)', status: 'pending', type: 'coding.feature', dependencies: [] },
  { stem: '3-x', localId: '3', title: '新值消费腿任务三(prefs-loop,coding.feature 协议)', status: 'pending', type: 'coding.feature', dependencies: [] },
]

/** The main world (artifacts-complete; the prefs + dispatch carrier). */
export async function buildMainWorld(root: string): Promise<KernelWorld> {
  return await buildKernelWorld(root, {
    feature: { slug: PREFS_FEATURE, status: 'tasks', docKinds: ['prd', 'design'] },
    tasks: MAIN_TASKS,
    stageAssets: [{ stage: 'design', goal: 'prefs-loop 目标锚点 — 三级偏好覆盖旅程的目标', summaryMark: 'prefs-loop 摘要锚点。' }],
  })
}

/** The bare world (registered project, ZERO features — the disabled-tier leg). */
export async function buildBareWorld(root: string): Promise<KernelWorld> {
  const emptySet: GeneratedTaskSet = {
    options: { seed: 'dsh-forge-m3-prefs-bare', taskCount: 0, featureCount: 0, danglingRate: 0, recordRate: 0, tasksPerPhase: 6, gates: false, statusWeights: {} },
    features: [],
    facts: { taskCount: 0, featureCount: 0, statusCounts: {}, edgeCount: 0, dangling: [], tasksWithRecord: 0, recordsWithSessionActor: 0, recordsWithTerminalActor: 0 },
  }
  const { writeForgeProject } = await import('../../../../apps/desktop/e2e/fixtures/forge-project.ts')
  const { openDatabase } = await import('../../../../apps/desktop/src/main/workbench/store/db.ts')
  const { registerProject } = await import('../../../../apps/desktop/src/main/workbench/repos/projects.ts')
  const { scanForgeFiles } = await import('../../../../apps/desktop/src/main/workbench/indexer/scan.ts')
  const { join } = await import('node:path')
  const { mkdirSync } = await import('node:fs')
  const codeRoot = join(root, 'repo')
  const written = writeForgeProject(emptySet, { codeRoot })
  const userDataDir = join(root, 'user-data')
  mkdirSync(userDataDir, { recursive: true })
  const { db } = await openDatabase(userDataDir)
  try {
    const project = registerProject(db, { codeRoot: written.codeRoot, docLocationType: 'in_repo' })
    scanForgeFiles(db, { id: project.id, codeRoot: written.codeRoot, docLocationPath: null })
    return { root, codeRoot: written.codeRoot, docsRoot: written.docsRoot, featuresRoot: join(written.docsRoot, 'docs', 'features'), userDataDir, projectId: project.id, featureSlug: '', set: emptySet }
  } finally {
    db.close()
  }
}

// ---------------------------------------------------------------------------
// The prefs editing-surface dialect (SC5 proven selectors)
// ---------------------------------------------------------------------------

/** Wait until the section's rows are READY for the current scope. */
export async function waitPrefsReady(page: Page): Promise<void> {
  await expect(page.locator('[data-dsh-forge-prefs-section]')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('[data-dsh-forge-pref-group-body="auto"]')).toBeVisible({ timeout: 30_000 })
}

/** Switch the segmented tier (the caller settles the rows afterwards). */
export async function switchPrefTier(page: Page, tier: 'global' | 'project' | 'feature'): Promise<void> {
  await page.locator(`[data-dsh-forge-pref-tier="${tier}"]`).click()
}

/** Pick the feature in the Feature tier's Menu card and settle the rows. */
export async function pickPrefFeature(page: Page, slug: string, group: string): Promise<void> {
  await page.locator('[data-dsh-forge-prefs-feature-trigger]').click()
  await page.locator(`[data-dsh-forge-prefs-feature-item="${slug}"]`).click()
  await expect(page.locator(`[data-dsh-forge-pref-group-body="${group}"]`)).toBeVisible({ timeout: 30_000 })
}

/** Settle on the loaded rows of the current scope. */
export async function waitGroupRows(page: Page, group: string): Promise<void> {
  await expect(page.locator(`[data-dsh-forge-pref-group-body="${group}"]`)).toBeVisible({ timeout: 30_000 })
}

/** One key's row inside a group body. */
export const prefRow = (page: Page, group: string, key: string) =>
  page.locator(`[data-dsh-forge-pref-group-body="${group}"] [data-dsh-forge-pref-row="${key}"]`)

/** Dismiss the saved toast if present (it overlays the lower-right corner). */
export async function settlePrefsToast(page: Page): Promise<void> {
  const dismiss = page.locator('[data-dsh-forge-prefs-toast-dismiss]')
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click()
  await expect(page.locator('[data-dsh-forge-prefs-toast]')).toHaveCount(0, { timeout: 10_000 })
}
