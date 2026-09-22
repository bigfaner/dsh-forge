// @feature dsh-forge-m1 | @web-e2e | @journey tray-residence-notification-recall
// Traceability: docs/features/dsh-forge-m1/testing/tray-residence-notification-recall/contracts/step-5-tray-menu-restore-exit.md
import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { launchUpstream } from '../helpers/journeys.ts'
import { isProcessAlive, listHostChildren } from '../helpers/fixture-app.ts'

test('step-5/success: tray restore reopens with state intact, then full exit terminates cleanly', async () => {
  const up = await launchUpstream()
  try {
    const { electronApp, pidFile, page } = up.fixture
    await page.locator('#session-list .session-item').first().click()
    await page.locator('#composer').fill('before residency')
    await page.locator('#send-btn').click()
    await electronApp.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]?.close() })
    await expect.poll(async () => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() ?? true)).toBe(false)
    // Tray-menu restore: window reopens with session state intact.
    await electronApp.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]?.show() })
    await expect.poll(async () => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() ?? false)).toBe(true)
    await expect(page.locator('#session-history .entry').last()).toContainText('assistant: echo: before residency')
    // Full exit: app and child processes terminate.
    const hostPid = Number((await readFile(pidFile, 'utf8')).trim().split('\n')[0])
    await electronApp.close()
    await expect.poll(() => isProcessAlive(hostPid), { timeout: 10_000 }).toBe(false)
  } finally { await up.fixture.hostServer.close() }
})

test('step-5/tray-unavailable-linux: window close must not orphan a resident process when no tray exists', async ({ }, testInfo) => {
  test.skip(process.platform !== 'linux', 'ERR_TRAY_UNAVAILABLE degradation is Linux-no-tray specific (FT-001); the fixture carrier always has a tray-capable main process on win/mac.')
  testInfo.annotations.push({ type: 'note', description: 'Requires a Linux environment without a system tray; asserts no orphaned headless resident process after window close.' })
  const up = await launchUpstream()
  try {
    const { electronApp, page } = up.fixture
    await expect(page.locator('#upstream-ui')).toBeVisible()
    await electronApp.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]?.close() })
    // Degradation must keep the app user-reachable, not orphan it invisibly.
    await expect.poll(async () => (await listHostChildren(electronApp, 'host-entry.mjs')).length).toBe(1)
    await electronApp.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]?.show() })
    await expect(page.locator('#upstream-ui')).toBeVisible()
  } finally { await up.close() }
})
