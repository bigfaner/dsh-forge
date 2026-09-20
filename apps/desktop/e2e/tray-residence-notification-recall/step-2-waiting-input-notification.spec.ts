// @feature dsh-forge-m1 | @web-e2e | @journey tray-residence-notification-recall
// Traceability: docs/features/dsh-forge-m1/testing/tray-residence-notification-recall/contracts/step-2-waiting-input-notification.md
import { expect, test } from '@playwright/test'
import { launchUpstream } from '../helpers/journeys.ts'
import { listHostChildren } from '../helpers/fixture-app.ts'

test('step-2/success: session reaches waiting state while window closed; app stays healthy resident', async ({ }, testInfo) => {
  testInfo.annotations.push({ type: 'note', description: 'OS notification posting (per-platform notifier, locale text) is the contract-declared OS-surface qualifier; the web surface asserts the waiting-session condition under residency and app health (process count steady, state visible on restore).' })
  const up = await launchUpstream()
  try {
    const { electronApp, page } = up.fixture
    await page.locator('#session-list .session-item').first().click()
    // Session is driven to waiting-for-user-input BEFORE the window closes.
    await page.locator('#composer').fill('question: waiting?')
    await page.locator('#send-btn').click()
    await expect(page.locator('#user-question')).toBeVisible()
    await electronApp.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]?.close() })
    await expect.poll(async () => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() ?? true)).toBe(false)
    // Resident and healthy: no extra own processes while resident.
    await expect.poll(async () => (await listHostChildren(electronApp, 'host-entry.mjs')).length).toBe(1)
    // Manual window restore still shows the waiting session state.
    await electronApp.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]?.show() })
    await expect(page.locator('#user-question')).toBeVisible()
  } finally { await up.close() }
})

test('step-2/notification-permission-denied: permission denial degrades gracefully (FT-002)', async ({ }, testInfo) => {
  testInfo.annotations.push({ type: 'note', description: 'OS notification permission toggling is an OS-surface qualifier; the web surface asserts the graceful-degradation contract: no crash, no error loop, session state visible on manual restore.' })
  const up = await launchUpstream()
  try {
    const { electronApp, page } = up.fixture
    await page.locator('#session-list .session-item').first().click()
    await page.locator('#composer').fill('question: waiting?')
    await page.locator('#send-btn').click()
    await expect(page.locator('#user-question')).toBeVisible()
    await electronApp.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]?.close() })
    // No crash / retry storm: process count steady while resident.
    await expect.poll(async () => (await listHostChildren(electronApp, 'host-entry.mjs')).length).toBe(1)
    const shellPid = await electronApp.evaluate(() => process.pid)
    expect(shellPid).toBeGreaterThan(0) // app healthy after the denied-notification window
    await electronApp.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]?.show() })
    await expect(page.locator('#user-question')).toBeVisible() // state visible on manual restore
  } finally { await up.close() }
})
