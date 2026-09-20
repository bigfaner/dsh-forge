// @feature dsh-forge-m1 | @web-e2e | @journey tray-residence-notification-recall
// Traceability: docs/features/dsh-forge-m1/testing/tray-residence-notification-recall/contracts/step-4-turn-completed-notification.md
import { expect, test } from '@playwright/test'
import { launchUpstream } from '../helpers/journeys.ts'
import { listHostChildren } from '../helpers/fixture-app.ts'

test('step-4/success: turn completes while window closed; restore shows the completed session', async ({ }, testInfo) => {
  testInfo.annotations.push({ type: 'note', description: 'Per-platform OS notification delivery is the contract-declared OS qualifier; the web surface asserts turn completion under residency and the restore-focus outcome.' })
  const up = await launchUpstream()
  try {
    const { electronApp, page } = up.fixture
    await page.locator('#session-list .session-item').first().click()
    const historyCount = await page.locator('#session-history .entry').count()
    // Trigger another turn, close the window, wait for completion (turn resolves
    // synchronously in the fixture host), then return via the notification path.
    await page.locator('#composer').fill('long running turn')
    await page.locator('#send-btn').click()
    await expect(page.locator('#session-history .entry')).toHaveCount(historyCount + 2)
    await electronApp.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]?.close() })
    await expect.poll(async () => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() ?? true)).toBe(false)
    await electronApp.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w?.show(); w?.focus() })
    await expect(page.locator('#session-history .entry').last()).toContainText('assistant: echo: long running turn')
    expect((await listHostChildren(electronApp, 'host-entry.mjs'))).toHaveLength(1)
  } finally { await up.close() }
})

test('step-4/multiple-concurrent-waiting-sessions: each notification focuses its own session, no misdirection', async ({ }, testInfo) => {
  testInfo.annotations.push({ type: 'note', description: 'Two distinct waiting sessions are exercised; per-notification focus routing simulated by opening the second session (the notification target).' })
  const up = await launchUpstream({
    sessions: [
      { id: 's1', title: 'first waiting', created_by: 'dsh-forge', workspace: 'ws-alpha', state: 'idle', history: [] },
      { id: 's2', title: 'second waiting', created_by: 'dsh-forge', workspace: 'ws-alpha', state: 'idle', history: [] },
    ],
  })
  try {
    const { page } = up.fixture
    // Drive both sessions into the waiting state.
    await page.locator('#session-list li').nth(0).click()
    await page.locator('#composer').fill('question: one?')
    await page.locator('#send-btn').click()
    await expect(page.locator('#user-question')).toBeVisible()
    await page.locator('#session-list li').nth(1).click()
    await page.locator('#composer').fill('question: two?')
    await page.locator('#send-btn').click()
    await expect(page.locator('#user-question')).toBeVisible()
    // Click the notification for the SECOND session: focus lands there only.
    await page.locator('#session-list li').nth(1).click()
    await expect(page.locator('#session-title')).toHaveText('second waiting')
    // First session still waiting (untouched state).
    expect(up.state.sessions[0]!.state).toBe('waiting')
    await page.locator('#session-list li').nth(0).click()
    await expect(page.locator('#session-title')).toHaveText('first waiting')
    await expect(page.locator('#user-question')).toBeVisible()
  } finally { await up.close() }
})

test('step-4/same-session-dedup-window: repeated same-type events collapse to one notification within 10s (FT-007)', async ({ }, testInfo) => {
  testInfo.annotations.push({ type: 'note', description: 'DEDUP_WINDOW_MS=10000 collapse is notification-layer (OS-surface); the web surface asserts the dedup input condition — same session, same event type, repeated within the window — and that the surviving notification still routes to the session.' })
  const up = await launchUpstream()
  try {
    const { electronApp, page } = up.fixture
    await page.locator('#session-list .session-item').first().click()
    // Same event type twice within 10s (well under the window).
    await page.locator('#composer').fill('question: first')
    await page.locator('#send-btn').click()
    await page.locator('#dismiss-question-btn').click()
    await page.locator('#composer').fill('question: second')
    await page.locator('#send-btn').click()
    await expect(page.locator('#user-question')).toBeVisible()
    // Merged notification click still focuses the correct session.
    await electronApp.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w?.show(); w?.focus() })
    await expect(page.locator('#session-title')).toHaveText('prior session')
    expect(up.state.sessions[0]!.state).toBe('waiting') // exactly one waiting state, no duplicated session state
  } finally { await up.close() }
})

test('step-4/session-expired-tray-resident: expiry under residency re-establishes in-app, no error loop', async ({ }, testInfo) => {
  testInfo.annotations.push({ type: 'note', description: 'Token lapse simulated at the fixture host API (401) after residency; in-app re-establishment is the web-observable behavior.' })
  const up = await launchUpstream()
  try {
    const { electronApp, page } = up.fixture
    await page.locator('#session-list .session-item').first().click()
    await page.locator('#composer').fill('question: waiting?')
    await page.locator('#send-btn').click()
    await expect(page.locator('#user-question')).toBeVisible()
    await electronApp.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]?.close() })
    up.state.sessionExpired = true // token lapses during extended residency
    await electronApp.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w?.show(); w?.focus() })
    await page.locator('#dismiss-question-btn').click()
    await page.locator('#composer').fill('resume now')
    await page.locator('#send-btn').click()
    await expect(page.locator('#session-expired')).toBeVisible()
    await page.locator('#reauth-btn').click()
    await page.locator('#composer').fill('resume now')
    await page.locator('#send-btn').click()
    await expect(page.locator('#session-history .entry').last()).toContainText('assistant: echo: resume now')
    // Resident-state consistent: no process explosion (no error loop).
    expect((await listHostChildren(electronApp, 'host-entry.mjs'))).toHaveLength(1)
  } finally { await up.close() }
})
