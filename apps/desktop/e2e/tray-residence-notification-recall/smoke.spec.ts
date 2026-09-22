// @feature dsh-forge-m1 | @web-e2e | @journey tray-residence-notification-recall
// Journey smoke test (happy path): residency → waiting under residency →
// notification-restore focus → turn-completed return → tray restore + exit.
// Traceability: docs/features/dsh-forge-m1/testing/tray-residence-notification-recall/contracts/step-{1..5}-*.md
import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { launchUpstream } from '../helpers/journeys.ts'
import { isProcessAlive } from '../helpers/fixture-app.ts'

test('tray-residence-notification-recall journey smoke: close→waiting→restore→return→exit', async ({ }, testInfo) => {
  testInfo.setTimeout(90_000)
  const up = await launchUpstream()
  try {
    const { electronApp, pidFile, page } = up.fixture

    // Step 1 — close window: tray residency, shell + host stay alive.
    await page.locator('#session-list .session-item').first().click()
    await electronApp.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]?.close() })
    await expect.poll(async () => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() ?? true)).toBe(false)
    const shellPid = await electronApp.evaluate(() => process.pid)
    expect(isProcessAlive(shellPid)).toBe(true)

    // Step 2/3 — waiting session under residency; restore focuses that session.
    await electronApp.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w?.show(); w?.focus() })
    await page.locator('#composer').fill('question: waiting?')
    await page.locator('#send-btn').click()
    await expect(page.locator('#user-question')).toBeVisible()
    await electronApp.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]?.close() })
    await expect.poll(async () => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() ?? true)).toBe(false)
    await electronApp.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w?.show(); w?.focus() })
    await expect(page.locator('#session-title')).toHaveText('prior session')
    await expect(page.locator('#user-question')).toBeVisible()

    // Step 4 — answer, another turn completes, return shows it.
    await page.locator('#answer-input').fill('go')
    await page.locator('#answer-btn').click()
    await expect(page.locator('#user-question')).toBeHidden()
    await page.locator('#composer').fill('final turn')
    await page.locator('#send-btn').click()
    await expect(page.locator('#session-history .entry').last()).toContainText('assistant: echo: final turn')

    // Step 5 — tray restore then full exit: no processes remain, data persisted.
    const hostPid = Number((await readFile(pidFile, 'utf8')).trim().split('\n')[0])
    await electronApp.close()
    await expect.poll(() => isProcessAlive(hostPid), { timeout: 10_000 }).toBe(false)
    const persisted = JSON.parse(await readFile(up.stateFile, 'utf8')) as { sessions: Array<{ id: string }> }
    expect(persisted.sessions[0]!.id).toBe('s1')
  } finally { await up.fixture.hostServer.close() }
})
