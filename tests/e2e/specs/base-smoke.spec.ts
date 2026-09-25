// @feature dsh-forge-m3 | @web-e2e | @journey forge-m3-base
// Traceability: docs/features/dsh-forge-m3/tasks/6.2-e2e-fixture-base.md (AC-3/AC-4)
//
// Task 6.2 base smoke — the ONE leg proving the base is usable (基座可用):
// real shell boot under the base's three disciplines, then the workbench
// tab-order assertion (概览/提案/Feature/任务 — the 5.5 revision):
//
//   1. Hard Rule first: no active dsh-forge instance may hold the machine
//      (M1 lesson — external lock holders poison runs into
//      ERR_SINGLE_INSTANCE); fail fast listing conflicting pids;
//   2. clean environment: the sanitized PATH provably hides the forge CLI
//      (process probe, all faces) and rides into the Electron launch env;
//   3. the dispatch-stub env pair is set at boot (both host seams wired —
//      the stubs must not disturb a production-shaped boot);
//   4. boot → 工作台 → the TabBar order === WORKBENCH_TABS
//      (['workbench/overview','workbench/proposals','workbench/features',
//      'workbench/tasks']) with overview selected by default.
//
// Detailed SC legs are 6.3-6.8; this spec stays a smoke.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { assertNoActiveDshForgeInstances } from '../helpers/instance-lock.ts'
import { assertForgeCliUnavailable, cleanEnv } from '../fixtures/clean-env.ts'
import { createDispatchStub } from '../stubs/dispatch.ts'
import { freshUserDataDir, launchWorkbenchShell } from '../helpers/app.ts'

/** The upstream sidebar's workbench row (the nav-smoke locator). */
const workbenchRow = (page: Page) =>
  page.getByRole('button', { name: /^工作台$|^Workbench$/ }).first()

/** Switch into the workbench tolerating the boot session-restore bounce (3.3). */
async function switchToWorkbench(page: Page): Promise<void> {
  const shellPanel = page.locator('[data-dsh-forge-shell]')
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await workbenchRow(page).click()
    await expect(shellPanel).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(2_500)
    if (await shellPanel.count() > 0) return
  }
  throw new Error('workbench selection never settled (boot session-restore keeps deselecting it)')
}

test('6.2/base-smoke: clean-env boot → 工作台 → tab order 概览/提案/Feature/任务', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)

  // Hard Rule / AC-4 — the instance-lock discipline runs BEFORE any launch.
  assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })

  // AC-1 — the clean environment is asserted, not assumed (process probe).
  const sanitized = cleanEnv()
  assertForgeCliUnavailable(sanitized)

  // The unified dispatch stub home (both host seams; the smoke only proves
  // they coexist with a healthy boot — SC legs drive them).
  const stubDir = mkdtempSync(join(tmpdir(), 'dsh-forge-62-smoke-'))
  const stub = createDispatchStub(stubDir)

  const shell = await launchWorkbenchShell({
    userDataDir: freshUserDataDir(),
    stubEnv: stub.env,
  })
  try {
    await shell.uiReady()
    await switchToWorkbench(shell.page)

    // AC-3 — the tab strip renders in WORKBENCH_TABS order (the 5.5 revision:
    // 提案 second), and overview is the default selection.
    const tabs = shell.page.locator('[data-dsh-forge-tabs] [data-dsh-forge-tab]')
    await expect(tabs).toHaveCount(4)
    const keys = await tabs.evaluateAll(nodes => nodes.map(node => (node as HTMLElement).getAttribute('data-dsh-forge-tab')))
    expect(keys).toEqual(['workbench/overview', 'workbench/proposals', 'workbench/features', 'workbench/tasks'])
    await expect(shell.page.locator('[data-dsh-forge-tab="workbench/overview"]')).toHaveAttribute('aria-selected', 'true')
    await expect(shell.page.locator('[data-dsh-forge-tab="workbench/proposals"]')).toHaveAttribute('aria-selected', 'false')
  } finally {
    await shell.close()
    rmSync(stubDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  }
})
