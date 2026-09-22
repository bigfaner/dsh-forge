// @feature dsh-forge-m2 | @web-e2e | @journey forge-workbench-nav
// Traceability: docs/features/dsh-forge-m2/tasks/3.3-nav-injection-view-switch.md
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  BASE_BUNDLES, FORGE_WORKBENCH, FORGE_WORKBENCH_STAGED_AT, forgeWorkbenchTarball, launchPluginShell,
} from '../helpers/plugins.ts'

// Task 3.3 view-switch smoke (slot path — the preferred form, live): the
// workbench entry appears in the upstream sidebar navigation (AC1), clicking
// and keyboard activation switch 会话⇄工作台 with zero shell code, the shell's
// tab strip carries role=tab/aria-selected (AC6), the first boot defaults to
// the session view and the last view survives a restart (AC4). The fallback
// rail cannot be forced in a live boot without removing the upstream bundles
// (which kills the SPA the rail switches back into), so its automated leg is
// the jsdom mount in packages/plugins/forge-workbench/tests/rail.spec.tsx
// against the SAME machine, controller, and shell component.
//
// 5.14 amendment: the shell's chrome now reads the REAL workbench registry —
// the retired mock always carried an active project, so the tasks tab's
// reserved container was ungated by construction. With no active project the
// page-map state gate (spec-correct) occupies the tab; this journey's
// tab-addressing assertion needs a container, so the boot activates a
// registered project over the real bridge (registering a fixture only when
// the shared registry is empty — activation alone on any existing row).

/** The minimal product config: base bundles + the mandatory forge core. */
function navBundles() {
  return [
    ...BASE_BUNDLES,
    { name: FORGE_WORKBENCH, source: `tarball:${FORGE_WORKBENCH_STAGED_AT}`, mandatory: true } as const,
  ]
}

function navTarballs() {
  return [{ at: FORGE_WORKBENCH_STAGED_AT, from: forgeWorkbenchTarball() }]
}

/** A registrable fixture forge project (only used when the registry is empty). */
function navFixtureRoot(): { root: string; fixtureRoot: string } {
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-nav-e2e-'))
  const fixtureRoot = join(root, 'fixture-project')
  const featureDir = join(fixtureRoot, 'docs', 'features', 'nav-demo')
  mkdirSync(join(featureDir, 'tasks'), { recursive: true })
  writeFileSync(join(featureDir, 'manifest.md'), '---\nstatus: in-progress\n---\n# nav-demo\n\nNav fixture feature.\n')
  writeFileSync(join(featureDir, 'tasks', 'index.json'), `${JSON.stringify({
    tasks: { '1.1': { id: '1.1', title: 'first', status: 'completed', dependencies: [] } },
  }, undefined, 2)}\n`)
  return { root, fixtureRoot }
}

/** The registry subset the prelude drives over the real bridge. */
interface NavRegistryBridge {
  getState(): Promise<{ projects: { id: string }[]; activeProjectId: string | null }>
  registerProject(input: { codeRoot: string; docLocationType: 'in_repo' }): Promise<{ id: string }>
  activateProject(id: string): Promise<void>
}

/** Ensure an ACTIVE project exists (5.14: the real chrome's gate input). */
async function ensureActiveProject(
  page: import('@playwright/test').Page, fixtureRoot: string,
): Promise<void> {
  await page.evaluate(async (codeRoot: string) => {
    const bridge = (globalThis as { dshForge?: { workbench?: NavRegistryBridge } }).dshForge?.workbench
    if (bridge === undefined) throw new Error('dshForge.workbench bridge is unavailable in the e2e renderer')
    const state = await bridge.getState()
    if (state.activeProjectId !== null) return
    const target = state.projects[0] ?? await bridge.registerProject({ codeRoot, docLocationType: 'in_repo' })
    await bridge.activateProject(target.id)
  }, fixtureRoot)
}

/** The upstream sidebar's workbench row (ui-sidebar PanelRow: native button + aria-label from our locale). */
const workbenchRow = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: /^工作台$|^Workbench$/ }).first()

/**
 * Switch into the workbench tolerating the upstream boot-time session
 * auto-restore: the home-scoped session list hydrates seconds after ui-ready
 * and its navigation ends in selectPanel(null) (ui-workspace replaceMain),
 * which deselects a panel chosen too early. The machine correctly follows
 * that bounce; the test simply retries until the selection sticks.
 */
async function switchToWorkbench(page: import('@playwright/test').Page): Promise<void> {
  const shellPanel = page.locator('[data-dsh-forge-shell]')
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await workbenchRow(page).click()
    await expect(shellPanel).toBeVisible({ timeout: 10_000 })
    // Settle window: longer than the observed hydration bounce.
    await page.waitForTimeout(2_500)
    if (await shellPanel.count() > 0) return
  }
  throw new Error('workbench selection never settled (boot session-restore keeps deselecting it)')
}

test('3.3/slot-path: 会话⇄工作台 switch by click and keyboard, aria, session-view first boot', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)
  const { root, fixtureRoot } = navFixtureRoot()
  const shell = await launchPluginShell({ bundles: navBundles(), stageTarballs: navTarballs(), rootDir: root })
  try {
    const { page } = shell
    await shell.uiReady()
    // 5.14: an active project for the tasks tab's container (see amendment).
    await ensureActiveProject(page, fixtureRoot)
    // AC4 first boot: nothing persisted for our view key → the session view.
    // The probe userData (dsh-app:// origin storage) is shared across journey
    // boots, so a prior run may have restored a stale workbench view —
    // normalize it away before asserting the first-boot default.
    await page.evaluate(() => { localStorage.removeItem('dsh.forge.workbench.view') })
    const shellPanel = page.locator('[data-dsh-forge-shell]')
    if (await shellPanel.count() > 0) {
      await page.getByRole('button', { name: /新建会话|New Session/ }).first().click()
      await expect(shellPanel).toHaveCount(0)
      await page.evaluate(() => { localStorage.removeItem('dsh.forge.workbench.view') })
    }
    await expect(shellPanel).toHaveCount(0)

    // AC1: the entry sits in the upstream navigation area, not selected.
    const row = workbenchRow(page)
    await expect(row).toBeVisible()
    await expect(row).not.toHaveAttribute('aria-current', 'page')

    // AC1 click switch (settled past the boot session-restore bounce).
    await switchToWorkbench(page)
    await expect(row).toHaveAttribute('aria-current', 'page')

    // AC1/AC6 back to 会话, then keyboard activation (native button: Enter)
    // switches to 工作台 again.
    await page.getByRole('button', { name: /新建会话|New Session/ }).first().click()
    await expect(page.locator('[data-dsh-forge-shell]')).toHaveCount(0)
    await row.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-dsh-forge-shell]')).toBeVisible({ timeout: 10_000 })

    // AC5/AC6: the shell's tab strip — role=tab + aria-selected per tab; the
    // active view key addresses its reserved mount container.
    const overviewTab = page.getByRole('tab', { name: /^概览$|^Overview$/ })
    const tasksTab = page.getByRole('tab', { name: /^任务$|^Tasks$/ })
    await expect(overviewTab).toHaveAttribute('aria-selected', 'true')
    await expect(tasksTab).toHaveAttribute('aria-selected', 'false')
    await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible()
    await tasksTab.click()
    await expect(tasksTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-tasks"]')).toBeVisible()

    // AC1 back: New Session navigates the conversation (selectPanel(null)) —
    // the upstream flow, no reload.
    await page.getByRole('button', { name: /新建会话|New Session/ }).first().click()
    await expect(page.locator('[data-dsh-forge-shell]')).toHaveCount(0)
    await expect(row).not.toHaveAttribute('aria-current', 'page')

    // AC4: the last view persisted through the machine's own write path.
    const persisted = await page.evaluate(() => localStorage.getItem('dsh.forge.workbench.view'))
    expect(JSON.parse(persisted ?? 'null')).toEqual({ view: 'session', workbenchTab: 'workbench/tasks' })
    expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
  } finally { await shell.close() }
})

test('3.3/restart: the last view survives an application restart (two boots, one profile)', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)
  const shell = await launchPluginShell({ bundles: navBundles(), stageTarballs: navTarballs() })
  const rootDir = shell.dir
  try {
    const { page } = shell
    await shell.uiReady()
    await page.evaluate(() => { localStorage.removeItem('dsh.forge.workbench.view') })
    // Boot 1: switch into the workbench on the overview tab (deterministic —
    // a prior journey may have retained another tab in the shared storage)
    // and leave the workbench the active view.
    await switchToWorkbench(page)
    await page.getByRole('tab', { name: /^概览$|^Overview$/ }).click()
    expect(
      JSON.parse(await page.evaluate(() => localStorage.getItem('dsh.forge.workbench.view')) ?? 'null'),
    ).toEqual({ view: 'workbench', workbenchTab: 'workbench/overview' })
  } finally { await shell.close() }

  // Boot 2 (same root dir → same config/profile/userData): the persisted
  // workbench view restores WITHOUT any interaction — the slot carrier's
  // attach-time projection re-selects the panel at boot.
  const reborn = await launchPluginShell({ bundles: navBundles(), stageTarballs: [], rootDir })
  try {
    await reborn.uiReady()
    await expect(reborn.page.locator('[data-dsh-forge-shell]')).toBeVisible()
    await expect(workbenchRow(reborn.page)).toHaveAttribute('aria-current', 'page')
    await expect(reborn.page.getByRole('tab', { name: /^概览$|^Overview$/ })).toHaveAttribute('aria-selected', 'true')
    expect(reborn.pageErrors, `renderer pageerrors: ${reborn.pageErrors.join(' | ')}`).toEqual([])
  } finally { await reborn.close() }
})
