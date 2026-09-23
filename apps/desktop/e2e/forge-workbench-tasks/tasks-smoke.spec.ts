// @feature dsh-forge-m2 | @web-e2e | @journey forge-workbench-tasks
// Traceability: docs/features/dsh-forge-m2/tasks/5.15-tasks-page-assembly.md
import { mkdirSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  BASE_BUNDLES, FORGE_WORKBENCH, FORGE_WORKBENCH_STAGED_AT, forgeWorkbenchTarball, launchPluginShell,
} from '../helpers/plugins.ts'

// Task 5.15 e2e smoke (AC6): the tasks page's MAIN PATH over the REAL IPC
// chain — the dshForge.workbench bridge carries registration + activation,
// then the assembled TasksView (ONE getTaskBoard first paint + the 回流
// event loop over the shared single-subscriber channel, mock 全撤) renders
// the three views, the UF3 dock links off a row activation, and a REAL file
// mutation lands as a ≤5s refresh (SC3's 页面侧 budget — Playwright's own
// assertion timeout IS the budget check). Detailed legs (filters, error
// paths, source badges) belong to 6.2/6.3.
//
// Isolation note (the 5.14 discipline): the workbench DB lives in the REAL
// userData (no e2e seam), so the registry can carry rows from earlier
// journeys — the fixture codeRoot lives under the per-run temp shell dir
// (unique per run), and no assertion assumes a pristine registry.

/** The minimal product config: base bundles + the mandatory forge core. */
function tasksBundles() {
  return [
    ...BASE_BUNDLES,
    { name: FORGE_WORKBENCH, source: `tarball:${FORGE_WORKBENCH_STAGED_AT}`, mandatory: true } as const,
  ]
}

function tasksTarballs() {
  return [{ at: FORGE_WORKBENCH_STAGED_AT, from: forgeWorkbenchTarball() }]
}

/** The fixture's tasks/index.json body (the indexer's authority file). */
function tasksIndex(statusOf11: string): string {
  return `${JSON.stringify({
    tasks: {
      one: { id: '1.1', title: 'First fixture task', status: statusOf11, dependencies: [] },
      two: { id: '1.2', title: 'Second fixture task', status: 'pending', dependencies: ['1.1'] },
    },
  }, undefined, 2)}\n`
}

/**
 * A registrable fixture forge project: docs/features/<slug>/tasks with the
 * index + per-task .md bodies (the dock's description source). The LEAF
 * directory name doubles as the registered displayName default.
 */
function writeFixtureProject(root: string, slug: string): string {
  const featureDir = join(root, 'docs', 'features', slug)
  const tasksDir = join(featureDir, 'tasks')
  mkdirSync(tasksDir, { recursive: true })
  // The dialect gate (parse-feature.ts): a feature dir WITHOUT manifest.md
  // is silently ignored — the manifest carries the status the snapshot reads.
  writeFileSync(join(featureDir, 'manifest.md'), '---\nstatus: in-progress\n---\n# tasks demo\n\nFixture feature for the tasks smoke.\n')
  writeFileSync(join(tasksDir, 'index.json'), tasksIndex('pending'))
  writeFileSync(join(tasksDir, 'one.md'), '# 1.1 — First fixture task\n\nThe FIRST fixture description body.\n')
  writeFileSync(join(tasksDir, 'two.md'), '# 1.2 — Second fixture task\n\nThe SECOND fixture description body.\n')
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

test('5.15/tasks-smoke: three views + dock linkage + a ≤5s real-mutation refresh over the real IPC chain', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)
  const shell = await launchPluginShell({ bundles: tasksBundles(), stageTarballs: tasksTarballs(), userDataDir: join(mkdtempSync(join(tmpdir(), 'dsh-forge-tasks-smoke-')), 'user-data') })
  try {
    await shell.uiReady()
    const { page } = shell
    const stamp = Date.now().toString(36)
    const slug = `tasks-demo-${stamp}`
    const fixtureRoot = writeFixtureProject(join(shell.dir, slug), slug)

    // Registration + activation over the REAL bridge (the features-smoke
    // precedent): the main-process chain (validation → registry → single
    // activation → immediate rescan) runs before the verb resolves.
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

    // The tasks tab over the assembled view.
    await switchToWorkbench(page)
    await page.getByRole('tab', { name: /^任务$|^Tasks$/ }).click()
    await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-tasks"]')).toBeVisible()

    // View A (依赖树, the default) renders the REAL engine over REAL data;
    // the view switcher walks A → B → C and back (AC6 三视图切换).
    await expect(page.locator('[data-dsh-forge-board-panel="tree"]')).toBeVisible({ timeout: 30_000 })
    await page.locator('[data-dsh-forge-board-view="grouped"]').click()
    await expect(page.locator('[data-dsh-forge-board-panel="grouped"]')).toBeVisible()

    // REAL board data: the fixture's qualified keys render; the build-stage
    // mock fixtures never do (mock 全撤).
    const card11 = page.locator(`[data-dsh-forge-task-card="${slug}/1.1"]`)
    await expect(card11).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-dsh-forge-task-card="dsh-forge-m2/5.5"]')).toHaveCount(0)
    await page.locator('[data-dsh-forge-board-view="list"]').click()
    await expect(page.locator('[data-dsh-forge-board-panel="list"]')).toBeVisible()
    await expect(page.locator('[data-dsh-forge-task-row="dsh-forge-m2/5.5"]')).toHaveCount(0)
    await page.locator('[data-dsh-forge-board-view="grouped"]').click()
    await expect(page.locator('[data-dsh-forge-board-panel="grouped"]')).toBeVisible()

    // 侧板联动: a row/card activation opens the UF3 dock with the REAL
    // detail (the fixture .md body renders as the description).
    await card11.click()
    const dock = page.locator('[data-dsh-forge-detail-section="description"]')
    await expect(dock).toBeVisible({ timeout: 30_000 })
    await expect(dock).toContainText('FIRST fixture description body', { timeout: 30_000 })
    await page.locator('[data-dsh-forge-detail-close]').click()
    await expect(page.locator('[data-dsh-forge-detail-section="description"]')).toHaveCount(0)

    // 回流 (AC3, SC3 页面侧 ≤5s): mutate the authority file's status → the
    // watcher (400ms) → rescan → task_updated push (≤500ms) → the store's
    // coalesce window (400ms) → ONE getTaskBoard → the row updates IN PLACE.
    // Playwright's 5s assertion timeout IS the budget check.
    const indexPath = join(fixtureRoot, 'docs', 'features', slug, 'tasks', 'index.json')
    expect(readFileSync(indexPath, 'utf8')).toContain('"status": "pending"')
    writeFileSync(indexPath, tasksIndex('in_progress'))
    await expect(card11).toContainText(/进行中|In progress/, { timeout: 5_000 })

    expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
  } finally {
    // The persisted view key is shared across journeys on this origin (the
    // 5.14 hygiene): leaving view=workbench behind would boot the NEXT
    // journey's shell pre-registration — a stale-read gate.
    await shell.page.evaluate(() => { localStorage.removeItem('dsh.forge.workbench.view') }).catch(() => {})
    await shell.close()
  }
})
