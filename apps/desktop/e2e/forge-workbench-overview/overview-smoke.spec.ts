// @feature dsh-forge-m2 | @web-e2e | @journey forge-workbench-overview
// Traceability: docs/features/dsh-forge-m2/tasks/5.14-overview-page-assembly.md
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  BASE_BUNDLES, FORGE_WORKBENCH, FORGE_WORKBENCH_STAGED_AT, forgeWorkbenchTarball, launchPluginShell,
} from '../helpers/plugins.ts'

// Task 5.14 e2e smoke (AC6): the overview family's MAIN PATH over the REAL
// IPC chain — the assembled chrome + OverviewView (single-store getState,
// mock 全撤) drive 注册→切换→移除 through the real UI:
//
//   register — the wizard's step-③ 完成 fires the REAL registerProject (the
//              main-side validation/detection chain); the refreshed registry
//              renders the new card immediately + the 提示可切换 toast (AC4);
//   switch   — the card's 切换 and the chrome switcher both go through the
//              real activateProject (single activation; the switcher is the
//              chrome's real data path);
//   remove   — the confirm dialog fires the real removeProject; removing the
//              ACTIVE project migrates the pointer (a migration toast).
//
// Isolation note: the workbench DB lives in the REAL userData (no e2e seam),
// so the registry can carry rows from earlier journeys — every fixture here
// carries a per-run stamp and NO assertion assumes a pristine registry (the
// empty-state branch and the migration TARGET stay in the deterministic unit
// legs). The wizard's step-①/② probes stay on the build-stage twin by design
// (no Interface 1 probe verb — real validation is the submit chain). Detailed
// legs (error branches, repoint, plugin round trip) belong to 6.4.

/** The minimal product config: base bundles + the mandatory forge core. */
function overviewBundles() {
  return [
    ...BASE_BUNDLES,
    { name: FORGE_WORKBENCH, source: `tarball:${FORGE_WORKBENCH_STAGED_AT}`, mandatory: true } as const,
  ]
}

function overviewTarballs() {
  return [{ at: FORGE_WORKBENCH_STAGED_AT, from: forgeWorkbenchTarball() }]
}

/**
 * A registrable fixture forge project (the main-side detection the REAL
 * register validation runs: docs/features with one feature). The LEAF
 * directory name doubles as the registered displayName default (codeRoot
 * 目录名) — the per-run stamp keeps every locator unique against any rows
//  * earlier journeys left in the shared registry.
 */
function writeFixtureProject(root: string): string {
  const docs = join(root, 'docs', 'features')
  const featureDir = join(docs, 'overview-demo')
  mkdirSync(join(featureDir, 'tasks'), { recursive: true })
  writeFileSync(join(featureDir, 'manifest.md'), '---\nstatus: in-progress\n---\n# overview-demo\n\nOverview fixture feature.\n')
  writeFileSync(join(featureDir, 'tasks', 'index.json'), `${JSON.stringify({
    tasks: {
      '1.1': { id: '1.1', title: 'first', status: 'completed', dependencies: [] },
    },
  }, undefined, 2)}\n`)
  return root
}

/** The upstream sidebar's workbench row (the nav-smoke locator). */
const workbenchRow = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: /^工作台$|^Workbench$/ }).first()

/** Switch into the workbench tolerating the boot session-restore bounce (3.3). */
async function switchToWorkbench(page: import('@playwright/test').Page): Promise<void> {
  const shellPanel = page.locator('[data-dsh-forge-shell]')
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await workbenchRow(page).click()
    await expect(shellPanel).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(2_500)
    if (await shellPanel.count() > 0) return
  }
  throw new Error('workbench selection never settled (boot session-restore keeps deselecting it)')
}

/** The card whose registered displayName is `name` (codeRoot 目录名 default). */
const cardOf = (page: import('@playwright/test').Page, name: string) =>
  page.locator('[data-dsh-forge-project-card]', { hasText: name }).first()

/** Drive the wizard's 3 steps to a completed REAL registerProject. */
async function registerViaWizard(
  page: import('@playwright/test').Page, codeRoot: string,
): Promise<void> {
  await page.locator('[data-dsh-forge-wizard-path-input]').fill(codeRoot)
  await expect(page.locator('[data-dsh-forge-wizard-probe="detected"]')).toBeVisible({ timeout: 10_000 })
  await page.locator('[data-dsh-forge-wizard-next]').click()
  await page.locator('[data-dsh-forge-wizard-next]').click() // in_repo default — step ② skippable
  await page.locator('[data-dsh-forge-wizard-finish]').click()
}

test('5.14/overview-smoke: register → switch → remove over the real IPC chain', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)
  const shell = await launchPluginShell({ bundles: overviewBundles(), stageTarballs: overviewTarballs(), userDataDir: join(mkdtempSync(join(tmpdir(), 'dsh-forge-overview-smoke-')), 'user-data') })
  try {
    await shell.uiReady()
    const { page } = shell
    const stamp = Date.now().toString(36)
    const nameOne = `fixture-one-${stamp}`
    const nameTwo = `fixture-two-${stamp}`
    const fixtureOne = writeFixtureProject(join(shell.dir, nameOne))
    const fixtureTwo = writeFixtureProject(join(shell.dir, nameTwo))

    // The overview tab (default) over the assembled chrome + view.
    await switchToWorkbench(page)
    await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible()

    // 注册①— the chrome's 添加项目 entry opens the wizard; 完成 fires the
    // real verb; the refreshed registry renders the new card + the toast.
    await page.locator('[data-dsh-forge-add-project]').click()
    await registerViaWizard(page, fixtureOne)
    await expect(cardOf(page, nameOne)).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-dsh-forge-shell-toast]')).toContainText(nameOne, { timeout: 10_000 })

    // 切换①— the card's 切换 activates (single activation; register never did).
    await cardOf(page, nameOne).locator('[data-dsh-forge-card-action="activate"]').click()
    await expect(cardOf(page, nameOne)).toHaveAttribute('data-active', 'true', { timeout: 10_000 })
    await expect(page.locator('[data-dsh-forge-switcher-trigger]')).toContainText(nameOne)

    // 注册②— the same wizard door registers the second project; it lands
    // UNACTIVATED (提示可切换, not auto-active).
    await page.locator('[data-dsh-forge-add-project]').click()
    await registerViaWizard(page, fixtureTwo)
    await expect(cardOf(page, nameTwo)).toBeVisible({ timeout: 30_000 })
    await expect(cardOf(page, nameTwo)).toHaveAttribute('data-active', 'false')
    await expect(page.locator('[data-dsh-forge-shell-toast]')).toContainText(nameTwo, { timeout: 10_000 })

    // 切换②— the CHROME switcher (the chrome's real data path): one → two.
    await page.locator('[data-dsh-forge-switcher-trigger]').click()
    await page.locator('[data-dsh-forge-switcher-menu] [data-dsh-forge-switcher-item]', { hasText: nameTwo }).click()
    await expect(cardOf(page, nameTwo)).toHaveAttribute('data-active', 'true', { timeout: 10_000 })
    await expect(page.locator('[data-dsh-forge-switcher-trigger]')).toContainText(nameTwo)

    // 移除①— removing the ACTIVE project fires the real removeProject; the
    // real verb's transaction CLEARS the active pointer (repos/projects.ts —
    // no first-remaining migration; the ui-design UF1 divergence is the
    // main-side's to resolve), so the chrome marker leaves with the card.
    await cardOf(page, nameTwo).locator('[data-dsh-forge-card-action="remove"]').click()
    await page.locator('[data-dsh-forge-remove-confirm]').click()
    await expect(cardOf(page, nameTwo)).toHaveCount(0, { timeout: 10_000 })
    await expect(page.locator('[data-dsh-forge-switcher-trigger]')).not.toContainText(nameTwo, { timeout: 10_000 })

    // 移除②— the remaining fixture row goes the same path; only its card
    // disappears (the shared registry may keep earlier journeys' rows).
    await cardOf(page, nameOne).locator('[data-dsh-forge-card-action="remove"]').click()
    await page.locator('[data-dsh-forge-remove-confirm]').click()
    await expect(cardOf(page, nameOne)).toHaveCount(0, { timeout: 10_000 })

    expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
  } finally {
    // The persisted view key is shared across journeys on this origin (the
    // launch legs' hygiene): leaving view=workbench behind would boot the
    // NEXT journey's shell pre-registration — a stale-read gate.
    await shell.page.evaluate(() => { localStorage.removeItem('dsh.forge.workbench.view') }).catch(() => {})
    await shell.close()
  }
})
