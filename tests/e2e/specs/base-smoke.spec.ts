// @feature dsh-forge-m3 | @web-e2e | @journey forge-m3-base
// Traceability: docs/features/dsh-forge-m3/tasks/6.2-e2e-fixture-base.md (AC-3/AC-4)
//
// Task 6.2 base smoke — the ONE leg proving the base is usable (基座可用):
// real shell boot under the base's three disciplines, then the workbench
// view-key face (M4 task 1.8 迁移改写:1.7 退役 TabBar/内景收缩后,原 TabBar
// 顺序断言迁移为「逃生门单页 + retired 面零残留」口径 —— 迁移清单 #9):
//
//   1. Hard Rule first: no active dsh-forge instance may hold the machine
//      (M1 lesson — external lock holders poison runs into
//      ERR_SINGLE_INSTANCE); fail fast listing conflicting pids;
//   2. clean environment: the sanitized PATH provably hides the forge CLI
//      (process probe, all faces) and rides into the Electron launch env;
//   3. the dispatch-stub env pair is set at boot (both host seams wired —
//      the stubs must not disturb a production-shaped boot);
//   4. boot → 工作台(逃生门)= overview 单页:唯一内景容器
//      dsh-forge-view-overview 在场、[data-dsh-forge-tab] 面零残留
//      (retired TabBar 孤儿清零)、无 retired 三视图容器挂载。
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

test('6.2/base-smoke: clean-env boot → 工作台(逃生门)= overview 单页 + retired 视图面零残留', async ({ }, testInfo) => {
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

    // AC-3 (M4 1.8 迁移改写)— the escape door IS the overview single page:
    // the retired TabBar strip is gone entirely (zero [data-dsh-forge-tab]),
    // the overview container is the ONLY interior mount, and no retired view
    // container (tasks/features/proposals) leaks anywhere in the document.
    await expect(shell.page.locator('[data-dsh-forge-tab]'),
      'retired TabBar 面零残留(孤儿视图清零)').toHaveCount(0)
    await expect(shell.page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]'),
      '逃生门唯一内景 = overview 单页容器').toBeVisible({ timeout: 15_000 })
    await expect(shell.page.locator('[data-dsh-forge-shell] [data-dsh-forge-view]'),
      '内景恰一个挂载容器(单页收缩)').toHaveCount(1)
    for (const retired of ['tasks', 'features', 'proposals'] as const) {
      await expect(shell.page.locator(`[data-dsh-forge-view="dsh-forge-view-${retired}"]`),
        `retired 容器 dsh-forge-view-${retired} 全页零挂载`).toHaveCount(0)
    }
  } finally {
    await shell.close()
    rmSync(stubDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  }
})
