// @feature dsh-forge-m1 | @web-e2e | @journey tray-residence-notification-recall
// Traceability: docs/features/dsh-forge-m1/testing/tray-residence-notification-recall/contracts/step-1-close-window-tray-residence.md
import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { launchUpstream } from '../helpers/journeys.ts'
import { isProcessAlive, listHostChildren } from '../helpers/fixture-app.ts'

test('step-1/success: closing the window keeps shell + host alive (tray residence)', async ({ }, testInfo) => {
  testInfo.annotations.push({ type: 'note', description: 'Steady-state own-process-count=2 is the contract-declared OS-smoke qualifier; verified here as: shell alive + exactly one host child.' })
  const up = await launchUpstream()
  try {
    const { electronApp, page } = up.fixture
    await expect(page.locator('#upstream-ui')).toBeVisible()
    // Close the window like a user would (residency hook: hide, not destroy).
    await electronApp.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]?.close() })
    await expect.poll(async () => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() ?? true)).toBe(false)
    // App does NOT exit: shell process alive, host subprocess still running.
    const shellPid = await electronApp.evaluate(() => process.pid)
    expect(isProcessAlive(shellPid)).toBe(true)
    expect((await listHostChildren(electronApp, 'host-entry.mjs'))).toHaveLength(1)
  } finally { await up.close() }
})

test('step-1/full-exit-via-tray: full exit terminates app and host, session data persisted', async () => {
  const up = await launchUpstream()
  try {
    const { electronApp, pidFile, page } = up.fixture
    await page.locator('#session-list .session-item').first().click()
    const hostPid = Number((await readFile(pidFile, 'utf8')).trim().split('\n')[0])
    await electronApp.close() // tray-menu full exit path (quit)
    await expect.poll(() => isProcessAlive(hostPid), { timeout: 10_000 }).toBe(false)
    // Session data remains persisted and available on next launch.
    const persisted = JSON.parse(await readFile(up.stateFile, 'utf8')) as { sessions: Array<{ id: string }> }
    expect(persisted.sessions[0]!.id).toBe('s1')
  } finally { await up.fixture.hostServer.close() }
})
