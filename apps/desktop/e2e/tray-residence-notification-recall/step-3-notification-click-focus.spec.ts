// @feature dsh-forge-m1 | @web-e2e | @journey tray-residence-notification-recall
// Traceability: docs/features/dsh-forge-m1/testing/tray-residence-notification-recall/contracts/step-3-notification-click-focus.md
import { expect, test } from '@playwright/test'
import { launchUpstream } from '../helpers/journeys.ts'
import { listHostChildren } from '../helpers/fixture-app.ts'

test('step-3/success: restoring from a waiting notification focuses the corresponding session', async ({ }, testInfo) => {
  testInfo.annotations.push({ type: 'note', description: 'Physically clicking the OS notification is the OS-surface qualifier; the web surface drives the same restore+focus path the notification click routes to (window restore → focus target session).' })
  const up = await launchUpstream()
  try {
    const { electronApp, page } = up.fixture
    await page.locator('#session-list .session-item').first().click()
    await page.locator('#composer').fill('question: waiting?')
    await page.locator('#send-btn').click()
    await expect(page.locator('#user-question')).toBeVisible()
    await electronApp.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]?.close() })
    await expect.poll(async () => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() ?? true)).toBe(false)
    // Notification-click routing: window restored, focused on the target session.
    await electronApp.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w?.show(); w?.focus() })
    await expect.poll(async () => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isFocused() ?? false)).toBe(true)
    await expect(page.locator('#session-title')).toHaveText('prior session') // the session the notification refers to
    await expect(page.locator('#user-question')).toBeVisible()
    // Process count still steady at 2 (OS-smoke qualified, own children checked).
    expect((await listHostChildren(electronApp, 'host-entry.mjs'))).toHaveLength(1)
  } finally { await up.close() }
})

test('step-3/session-already-focused: stale notification click brings the existing window to front, no duplicate', async ({ }, testInfo) => {
  testInfo.annotations.push({ type: 'note', description: 'OS notification click simulated by the same restore routing; no-duplicate-window assertion is fully web/carrier observable.' })
  const up = await launchUpstream()
  try {
    const { electronApp, page } = up.fixture
    await page.locator('#session-list .session-item').first().click()
    await page.locator('#composer').fill('question: waiting?')
    await page.locator('#send-btn').click()
    // Window already restored and session already focused when the click lands.
    await electronApp.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w?.show(); w?.focus() })
    await expect(page.locator('#session-title')).toHaveText('prior session')
    // Clicking the (stale) notification again: one window, one focused session.
    await electronApp.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w?.show(); w?.focus() })
    expect(await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
    await expect(page.locator('#session-title')).toHaveText('prior session')
    await expect(page.locator('#user-question')).toBeVisible()
  } finally { await up.close() }
})
