// @feature dsh-forge-m2 | @web-e2e | @journey forge-workbench-features
// Traceability: docs/features/dsh-forge-m2/tasks/5.16-features-page-assembly.md
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  BASE_BUNDLES, FORGE_WORKBENCH, FORGE_WORKBENCH_STAGED_AT, forgeWorkbenchTarball, launchPluginShell,
} from '../helpers/plugins.ts'

// Task 5.16 e2e smoke (AC6): the features page's MAIN PATH over the REAL IPC
// chain — the dshForge.workbench bridge carries registration + activation
// (the main-process chain incl. the immediate rescan), then the assembled
// FeaturesView (getState-sourced project + getFeatureBoard/readFeatureDoc
// faces, mock 全撤) renders list → detail → doc browsing → breadcrumb back.
// The m1-completed 样板 leg (AC4) rides the fixture's fully-completed
// feature (taskCompleted=taskTotal judged on the DTO counters). Detailed
// legs (filtering, live refresh, error paths) belong to 6.4.

/** The minimal product config: base bundles + the mandatory forge core. */
function featuresBundles() {
  return [
    ...BASE_BUNDLES,
    { name: FORGE_WORKBENCH, source: `tarball:${FORGE_WORKBENCH_STAGED_AT}`, mandatory: true } as const,
  ]
}

function featuresTarballs() {
  return [{ at: FORGE_WORKBENCH_STAGED_AT, from: forgeWorkbenchTarball() }]
}

/**
 * The fixture forge project (the indexer's dialect, parse-feature.ts anchors):
 * two features — demo-done fully completed carrying all five doc kinds (the
 * completed-badge leg), demo-live in progress with a missing ui doc (the
 * disabled-tab matrix). Registration detection needs docs/features; no
 * .forge/ dir required (forge-detect accepts either indicator).
 */
function writeFixtureProject(root: string): string {
  const docs = join(root, 'docs', 'features')
  const doneDir = join(docs, 'demo-done')
  const liveDir = join(docs, 'demo-live')
  mkdirSync(join(doneDir, 'prd'), { recursive: true })
  mkdirSync(join(doneDir, 'design'), { recursive: true })
  mkdirSync(join(doneDir, 'ui'), { recursive: true })
  mkdirSync(join(doneDir, 'tasks'), { recursive: true })
  mkdirSync(join(liveDir, 'tasks'), { recursive: true })
  writeFileSync(join(doneDir, 'manifest.md'), '---\nstatus: completed\n---\n# demo-done\n\nCompleted fixture feature.\n')
  writeFileSync(join(doneDir, 'prd', 'prd-spec.md'), '# demo-done PRD\n\nE2E fixture PRD body — the prd tab reads this file.\n')
  writeFileSync(join(doneDir, 'design', 'tech-design.md'), '# demo-done design\n\nFixture design doc.\n')
  writeFileSync(join(doneDir, 'ui', 'ui-design.md'), '# demo-done ui\n\nFixture ui doc.\n')
  writeFileSync(join(doneDir, 'tasks', 'index.json'), `${JSON.stringify({
    tasks: {
      '1.1': { id: '1.1', title: 'first', status: 'completed', dependencies: [] },
      '1.2': { id: '1.2', title: 'second', status: 'completed', dependencies: ['1.1'] },
    },
  }, undefined, 2)}\n`)
  writeFileSync(join(liveDir, 'manifest.md'), '---\nstatus: in-progress\n---\n# demo-live\n\nFixture in-progress feature.\n')
  writeFileSync(join(liveDir, 'tasks', 'index.json'), `${JSON.stringify({
    tasks: {
      '2.1': { id: '2.1', title: 'alpha', status: 'completed', dependencies: [] },
      '2.2': { id: '2.2', title: 'beta', status: 'pending', dependencies: ['2.1'] },
    },
  }, undefined, 2)}\n`)
  return root
}

/** The register/activate subset the smoke drives over the real bridge. */
interface RegisterBridge {
  registerProject(input: { codeRoot: string; docLocationType: 'in_repo' }): Promise<{ id: string }>
  activateProject(id: string): Promise<void>
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

test('5.16/features-smoke: list → detail → doc browsing over the real IPC chain', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)
  const shell = await launchPluginShell({ bundles: featuresBundles(), stageTarballs: featuresTarballs(), userDataDir: join(mkdtempSync(join(tmpdir(), 'dsh-forge-features-smoke-')), 'user-data') })
  try {
    await shell.uiReady()
    const { page } = shell
    const fixtureRoot = writeFixtureProject(join(shell.dir, 'fixture-project'))

    // Registration + activation over the REAL bridge: the main-process chain
    // (validation → registry → single activation → immediate rescan) runs
    // before the verb resolves, so the first board read is already populated.
    const registered = await page.evaluate(async (codeRoot: string) => {
      const bridge = (globalThis as { dshForge?: { workbench?: RegisterBridge } }).dshForge?.workbench
      if (bridge?.registerProject === undefined || bridge.activateProject === undefined) {
        throw new Error('dshForge.workbench bridge is unavailable in the e2e renderer')
      }
      const project = await bridge.registerProject({ codeRoot, docLocationType: 'in_repo' })
      await bridge.activateProject(project.id)
      return project
    }, fixtureRoot)
    expect(typeof registered.id).toBe('string')

    // The features tab over the assembled view.
    await switchToWorkbench(page)
    await page.getByRole('tab', { name: /^feature$|^Features$/ }).click()
    await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-features"]')).toBeVisible()

    // List: REAL board data (the fixture slugs — the mock twins' dsh-forge-m1/m2
    // never render), the completed 样板 badge on the fully-done feature (AC4).
    await expect(page.locator('[data-dsh-forge-feature-card="demo-done"]')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-dsh-forge-feature-card="demo-done"]')).toHaveAttribute('data-dsh-forge-feature-complete', '')
    await expect(page.locator('[data-dsh-forge-feature-card="demo-live"]')).toBeVisible()
    await expect(page.locator('[data-dsh-forge-feature-card="demo-live"]')).not.toHaveAttribute('data-dsh-forge-feature-complete', '')
    await expect(page.locator('[data-dsh-forge-feature-card="dsh-forge-m1"]')).toHaveCount(0)

    // Detail: enter through the card (the view-key machine's subview).
    await page.locator('[data-dsh-forge-feature-card="demo-done"]').click()
    await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-feature-detail"]')).toBeVisible()
    const detail = page.locator('[data-dsh-forge-feature-detail="demo-done"]')
    await expect(detail).toBeVisible()
    await expect(detail.locator('[data-dsh-forge-feature-completed]')).toBeVisible()

    // Doc browsing: the default manifest tab renders the REAL file's markdown;
    // the prd tab switches to another real doc; the missing-kind matrix holds
    // (demo-live's ui tab would be disabled — demo-done carries all five).
    await expect(detail.locator('[data-dsh-forge-feature-doc-panel="manifest"]'))
      .toContainText('Completed fixture feature.', { timeout: 30_000 })
    await page.locator('[data-dsh-forge-feature-doc-tab="prd"]').click()
    await expect(detail.locator('[data-dsh-forge-feature-doc-panel="prd"]'))
      .toContainText('E2E fixture PRD body', { timeout: 30_000 })

    // Back: the breadcrumb returns to the list (the reserved container swaps).
    await page.locator('[data-dsh-forge-feature-back]').click()
    await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-features"]')).toBeVisible()
    await expect(page.locator('[data-dsh-forge-feature-card="demo-done"]')).toBeVisible()

    expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
  } finally { await shell.close() }
})
