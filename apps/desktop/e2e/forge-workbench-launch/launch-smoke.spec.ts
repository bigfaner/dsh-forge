// @feature dsh-forge-m2 | @web-e2e | @journey forge-workbench-launch
// Traceability: docs/features/dsh-forge-m2/tasks/5.11-session-launch-entry-integrate.md
import { expect, test } from '@playwright/test'
import {
  BASE_BUNDLES, FORGE_WORKBENCH, FORGE_WORKBENCH_STAGED_AT, forgeWorkbenchTarball, launchPluginShell,
} from '../helpers/plugins.ts'

// Task 5.11 e2e smoke (AC5, the legs the pre-5.14/5.15 app can carry):
// the REAL rpc chain this task mounted — the client namespace contribution
// (forgeBridge/getTaskPrompt) crossing to the 4.1 host half and BACK —
// observed through the entry's availability states, which are the host's own
// answers (fail-closed by design until the shell env feed lands, 6.1):
//
//   leg A — no env seam: DSH_FORGE_PROJECT_ROOTS unset → the allowlist gate
//           rejects the board project root → ERR_NO_PROMPT → both mounts
//           render the entry DISABLED with the no-prompt tooltip;
//   leg B — the seam half-fed: the roots allowlisted, PATH pinned to a
//           forge-free dir → the resolution gate fails → ERR_FORGE_CLI_
//           UNAVAILABLE → the OTHER tooltip (proves DSH_FORGE_PROJECT_ROOTS
//           is consumed by the host half end-to-end);
//   both legs assert the dual-mount geometry (node-card hover slot + the
//           dock's panel-primary) and a pageerror-clean boot.
//
// The 发起→跳转→徽标→结束撤除 UI chain rides the same machine (the
// integration suite drives it over the service seam); its STUB-CHANNEL e2e
// leg needs the launch probe to answer AVAILABLE, which requires a stub forge
// binary whose script the prompt spawn can resolve from the BOARD's project
// root — a fixture the mock-chrome board fixes to the real repo path, so the
// full stub leg belongs to 6.1's fixture 工程 + 6.3 (detailed legs), after the
// 5.14/5.15 assemblies feed the board its real project context.

/** The minimal product config: base bundles + the mandatory forge core. */
function launchBundles() {
  return [
    ...BASE_BUNDLES,
    { name: FORGE_WORKBENCH, source: `tarball:${FORGE_WORKBENCH_STAGED_AT}`, mandatory: true } as const,
  ]
}

function launchTarballs() {
  return [{ at: FORGE_WORKBENCH_STAGED_AT, from: forgeWorkbenchTarball() }]
}

/**
 * The PATH pin that keeps CLI resolution deterministic on any machine:
 * System32 alone (the app boots fine with it — verified — and no forge
 * binary ships in System32).
 */
const FORGE_FREE_PATH = 'C:\\Windows\\System32'

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

/**
 * Land on the tasks tab and wait for the DAG's FIRST node launch entry to
 * carry the expected probe state (the real rpc round-trip's observable).
 */
async function openTasksBoard(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('tab', { name: /^任务$|^Tasks$/ }).click()
  await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-tasks"]')).toBeVisible()
  await expect(page.locator('[data-dsh-forge-task-toolbar]')).toBeVisible({ timeout: 30_000 })
}

/** The hover entries mounted in the DAG node cards (view A is the default). */
const nodeHoverTriggers = (page: import('@playwright/test').Page) =>
  page.locator('.dsh-forge-dag [data-dsh-forge-node-launch] [data-dsh-forge-launch-trigger][data-mount="node-hover"]')

test('5.11/launch-smoke leg A: real probe round-trip, fail-closed (no env seam) disables both mounts', async ({ }, testInfo) => {
  testInfo.setTimeout(240_000)
  // PATH pinned to an empty temp dir: no forge candidate can resolve on ANY
  // machine (hermetic — the host child inherits this env).
  const shell = await launchPluginShell({
    bundles: launchBundles(),
    stageTarballs: launchTarballs(),
    env: { PATH: FORGE_FREE_PATH },
  })
  try {
    await shell.uiReady()
    await switchToWorkbench(shell.page)
    await openTasksBoard(shell.page)

    // The dual-mount geometry: the reserved hover slots carry the entries.
    await expect(nodeHoverTriggers(shell.page).first()).toBeVisible({ timeout: 30_000 })
    const count = await nodeHoverTriggers(shell.page).count()
    expect(count).toBeGreaterThan(0)

    // The REAL rpc round-trip: the probe crossed to the host half and the
    // fail-closed allowlist answered ERR_NO_PROMPT (no roots fed).
    const first = nodeHoverTriggers(shell.page).first()
    await expect(first).toHaveAttribute('data-probe', 'unavailable', { timeout: 30_000 })
    await expect(first).toBeDisabled()
    await expect(first).toHaveAttribute('title', /prompt|执行|发起/i)

    // The dock's panel-primary entry carries the same state after a selection
    // (the NODE wrapper — real ReactFlow keys edges by data-id too; 5.6 is a
    // task the build-stage detail mock covers, so the dock opens with content).
    await shell.page.locator('.dsh-forge-dag .react-flow__node[data-id="dsh-forge-m2/5.6"]').click()
    const dockEntry = shell.page.locator('[data-dsh-forge-task-detail] [data-dsh-forge-launch-trigger][data-mount="panel-primary"]')
    await expect(dockEntry).toBeVisible({ timeout: 10_000 })
    await expect(dockEntry).toHaveAttribute('data-probe', 'unavailable')
    await expect(dockEntry).toBeDisabled()

    // Boot hygiene: the client bundle (namespace mount included) threw nothing.
    expect(shell.pageErrors).toEqual([])
  } finally {
    // The probe userData storage is shared across journeys (the nav smoke
    // normalizes first-boot expectations against it) — leave no view behind.
    await shell.page.evaluate(() => { localStorage.removeItem('dsh.forge.workbench.view') }).catch(() => {})
    await shell.close()
  }
})

test('5.11/launch-smoke leg B: DSH_FORGE_PROJECT_ROOTS consumed by the host (cli-unavailable reason)', async ({ }, testInfo) => {
  testInfo.setTimeout(240_000)
  // The seam half-fed: the BOARD's project root allowlisted (the mock chrome's
  // fixed codeRoot — the real repo path, as a STRING only), PATH still
  // forge-free → the allowlist gate passes, resolution fails → the OTHER
  // disabled reason. This is the env feed's contract, exercised end-to-end.
  const shell = await launchPluginShell({
    bundles: launchBundles(),
    stageTarballs: launchTarballs(),
    env: {
      PATH: FORGE_FREE_PATH,
      DSH_FORGE_PROJECT_ROOTS: JSON.stringify(['Z:/project/dsh/dsh-forge']),
    },
  })
  try {
    await shell.uiReady()
    await switchToWorkbench(shell.page)
    await openTasksBoard(shell.page)

    const first = nodeHoverTriggers(shell.page).first()
    await expect(first).toBeVisible({ timeout: 30_000 })
    await expect(first).toHaveAttribute('data-probe', 'unavailable', { timeout: 30_000 })
    await expect(first).toBeDisabled()
    // ERR_FORGE_CLI_UNAVAILABLE's tooltip (distinct from leg A's no-prompt one).
    await expect(first).toHaveAttribute('title', /CLI|forge/i)
    expect(shell.pageErrors).toEqual([])
  } finally {
    // The probe userData storage is shared across journeys (the nav smoke
    // normalizes first-boot expectations against it) — leave no view behind.
    await shell.page.evaluate(() => { localStorage.removeItem('dsh.forge.workbench.view') }).catch(() => {})
    await shell.close()
  }
})
