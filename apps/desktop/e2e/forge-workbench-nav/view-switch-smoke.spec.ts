// @feature dsh-forge-m2 | @web-e2e | @journey forge-workbench-nav
// Traceability: docs/features/dsh-forge-m2/tasks/3.3-nav-injection-view-switch.md
// M4 task 1.8 迁移改写(迁移清单 #9 / 必答② 第①行):全局导航 → 项目一级
// 导航后,本旅程的双视图契约面 = 会话(= 项目工作台,panellist「项目」行
// null 寻址)⇄ 工作台逃生门(overview 单页)二元切换。TabBar/TopBar/
// ProjectSwitcher 随 1.7 退役;M2 AC4「重启回到上次视图」被 M4 裁决 #26 取代
// (启动首屏 = conversation,normalizeBootDefaultView 在 apply 期归一;逃生门
// 会话期内经 workbench 行可达)。断言迁移面 = 入口/视图键;切换行为契约
// (click/keyboard 同一原生按钮面、aria、单写径)原样保留。
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  BASE_BUNDLES, FORGE_WORKBENCH, FORGE_WORKBENCH_STAGED_AT, forgeWorkbenchTarball, launchPluginShell,
} from '../helpers/plugins.ts'

// Task 3.3 view-switch smoke (slot path — the preferred form, live), M4
// 1.8 form: the binary session(项目工作台)⇄ workbench(逃生门)switch keeps
// its M2 behavior contract — clicking and keyboard activation switch with zero
// shell code, the workbench row carries aria-current when presenting, the
// first boot defaults to the session view. The retired interior (tab strip,
// tasks view addressing) died with 1.7; the restart leg now asserts the M4
// boot normalization (裁决 #26) instead of the M2 last-view restore. The
// fallback rail cannot be forced in a live boot without removing the upstream
// bundles (which kills the SPA the rail switches back into), so its automated
// leg stays the jsdom mount in packages/plugins/forge-workbench/tests/rail.spec.tsx
// against the SAME machine, controller, and shell component.

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

/** Ensure an ACTIVE project exists (the left tree's data face). */
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

/** The upstream sidebar's workbench escape-door row (ui-sidebar PanelRow). */
const workbenchRow = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: /^工作台$|^Workbench$/ }).first()

/** The panellist「项目」row (M4 Integration #4: order 首项, null 寻址). */
const projectRow = (page: import('@playwright/test').Page) =>
  page.locator('[aria-label="项目"], [aria-label="Project"]').first()

/** The conversation-ready signal (the native new-session surface). */
const newSessionButton = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: /新建会话|New Session/ }).first()

/**
 * Switch into the workbench (escape door) tolerating the upstream boot-time
 * session auto-restore: the home-scoped session list hydrates seconds after
 * ui-ready and its navigation ends in selectPanel(null) (ui-workspace
 * replaceMain), which deselects a panel chosen too early. The machine
 * correctly follows that bounce; the test simply retries until it sticks.
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

test('3.3/slot-path(M4): 会话(项目工作台)⇄工作台(逃生门)switch by click and keyboard, aria; panellist「项目」首项; session-view first boot', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)
  const { root, fixtureRoot } = navFixtureRoot()
  const shell = await launchPluginShell({ bundles: navBundles(), stageTarballs: navTarballs(), rootDir: root, userDataDir: join(root, 'user-data') })
  try {
    const { page } = shell
    await shell.uiReady()
    await ensureActiveProject(page, fixtureRoot)
    // AC4 first boot (M4 form): nothing persisted for our view key → the
    // conversation IS the project workbench. The probe userData is shared
    // across journey boots, so a prior run may have persisted a stale view —
    // normalize it away before asserting the first-boot default.
    await page.evaluate(() => { localStorage.removeItem('dsh.forge.workbench.view') })
    const shellPanel = page.locator('[data-dsh-forge-shell]')
    if (await shellPanel.count() > 0) {
      await newSessionButton(page).first().click()
      await expect(shellPanel).toHaveCount(0)
      await page.evaluate(() => { localStorage.removeItem('dsh.forge.workbench.view') })
    }
    await newSessionButton(page).waitFor({ state: 'visible', timeout: 30_000 })
    await expect(shellPanel).toHaveCount(0)

    // 迁移清单第①行:panellist「项目」行 = 项目工作台寻址行,在场且首项。
    const prow = projectRow(page)
    await expect(prow).toBeAttached({ timeout: 15_000 })
    const nav = prow.locator('xpath=ancestor::nav[1]')
    const labels = await nav.locator('button').evaluateAll(buttons =>
      buttons.map(button => button.getAttribute('aria-label') ?? ''))
    const projectIndex = labels.findIndex(label => label === '项目' || label === 'Project')
    expect(projectIndex, `「项目」行为 panellist 首项(order -100;实际序 = ${JSON.stringify(labels)}`).toBe(0)

    // AC1: the workbench escape-door row sits in the upstream navigation, not selected.
    const row = workbenchRow(page)
    await expect(row).toBeVisible()
    await expect(row).not.toHaveAttribute('aria-current', 'page')

    // AC1 click switch (settled past the boot session-restore bounce).
    await switchToWorkbench(page)
    await expect(row).toHaveAttribute('aria-current', 'page')

    // M4: the escape door is the overview single page — no tab strip, the one
    // interior container, and the persisted projection keeps its (single-member
    // workbenchTab) shape.
    await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-dsh-forge-tab]'), 'retired TabBar 面零残留').toHaveCount(0)

    // AC1/AC6 back to 会话 via the panellist「项目」row (click = selectPanel(null)),
    // then keyboard activation (native button: Enter) re-enters the escape door.
    await projectRow(page).click()
    await expect(page.locator('[data-dsh-forge-shell]')).toHaveCount(0, { timeout: 15_000 })
    await expect(projectRow(page), '项目行选中态(activePanelId === null)').toHaveAttribute('aria-current', 'page')
    await row.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-dsh-forge-shell]')).toBeVisible({ timeout: 10_000 })

    // AC1 back: New Session navigates the conversation (selectPanel(null)) —
    // the upstream flow, no reload.
    await newSessionButton(page).first().click()
    await expect(page.locator('[data-dsh-forge-shell]')).toHaveCount(0)
    await expect(row).not.toHaveAttribute('aria-current', 'page')

    // AC4: the last view persisted through the machine's own write path
    // (single-member workbenchTab — the M4 projection shape).
    const persisted = await page.evaluate(() => localStorage.getItem('dsh.forge.workbench.view'))
    expect(JSON.parse(persisted ?? 'null')).toEqual({ view: 'session', workbenchTab: 'workbench/overview' })
    expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
  } finally { await shell.close() }
})

test('3.3/restart(M4): persisted workbench view normalizes to the conversation at boot (裁决 #26); escape door stays reachable in-session', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-nav-e2e-'))
  const shell = await launchPluginShell({ bundles: navBundles(), stageTarballs: navTarballs(), rootDir: root, userDataDir: join(root, 'user-data') })
  const rootDir = shell.dir
  try {
    const { page } = shell
    await shell.uiReady()
    await page.evaluate(() => { localStorage.removeItem('dsh.forge.workbench.view') })
    // Boot 1: enter the escape door and leave the workbench view persisted
    // (even a RETIRED-tab projection shape — the retire-in-place hydrate face).
    await switchToWorkbench(page)
    await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible({ timeout: 15_000 })
    await page.evaluate(() => {
      localStorage.setItem('dsh.forge.workbench.view', JSON.stringify({ view: 'workbench', workbenchTab: 'workbench/tasks' }))
    })
  } finally { await shell.close() }

  // Boot 2 (same root dir → same config/profile/userData): M4 裁决 #26 — the
  // boot lands the CONVERSATION (the project workbench) even with a persisted
  // workbench view (normalizeBootDefaultView in apply; the stale retired-tab
  // member hydrates safely). The escape door remains one click away.
  const reborn = await launchPluginShell({ bundles: navBundles(), stageTarballs: [], rootDir, userDataDir: shell.userDataDir })
  try {
    await reborn.uiReady()
    await newSessionButton(reborn.page).waitFor({ state: 'visible', timeout: 30_000 })
    await expect(reborn.page.locator('[data-dsh-forge-shell]'),
      'M4 启动首屏 = conversation(persisted workbench 被归一,非 M2 restore)').toHaveCount(0, { timeout: 15_000 })
    await expect(projectRow(reborn.page), '项目行在座(首屏即项目工作台)').toBeAttached({ timeout: 15_000 })
    // 会话期内逃生门仍可达(单次点击;持久键水合不抛、不复活 retired 视图)。
    await switchToWorkbench(reborn.page)
    await expect(workbenchRow(reborn.page)).toHaveAttribute('aria-current', 'page')
    await expect(reborn.page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible({ timeout: 15_000 })
    await expect(reborn.page.locator('[data-dsh-forge-tab]'), 'retired tab 面零复活').toHaveCount(0)
    expect(reborn.pageErrors, `renderer pageerrors: ${reborn.pageErrors.join(' | ')}`).toEqual([])
  } finally { await reborn.close() }
})
