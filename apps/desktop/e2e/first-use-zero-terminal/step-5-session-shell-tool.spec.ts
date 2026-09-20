// @feature dsh-forge-m1 | @web-e2e | @journey first-use-zero-terminal
// Traceability: docs/features/dsh-forge-m1/testing/first-use-zero-terminal/contracts/step-5-session-shell-tool.md
import { expect, test } from '@playwright/test'
import { launchUpstream, readPersisted } from '../helpers/journeys.ts'

test('step-5/success: shell tool call executes in-session and its result is visible', async () => {
  const up = await launchUpstream()
  try {
    const { page } = up.fixture
    await page.locator('#session-list .session-item').first().click()
    await page.locator('#composer').fill('please run shell ls')
    await page.locator('#send-btn').click()
    // Result visible in the session UI.
    await expect(page.locator('#session-history .entry-tool').last()).toContainText('shell exit=0')
    // State: tool call + result recorded in the upstream-format history.
    const persisted = await readPersisted(up.stateFile)
    const history = persisted.sessions[0]!.history
    expect(history.some(h => h.kind === 'tool')).toBe(true)
  } finally { await up.close() }
})

test('step-5/waiting-for-user-input: waiting state presented in the GUI, user responds in-app to resume', async () => {
  const up = await launchUpstream()
  try {
    const { page } = up.fixture
    await page.locator('#session-list .session-item').first().click()
    await page.locator('#composer').fill('question: continue?')
    await page.locator('#send-btn').click()
    await expect(page.locator('#user-question')).toBeVisible() // waiting state presented
    await page.locator('#answer-input').fill('go on')
    await page.locator('#answer-btn').click()
    await expect(page.locator('#user-question')).toBeHidden() // resumed, no state loss
    await expect(page.locator('#session-history .entry').last()).toContainText('answer:go on')
  } finally { await up.close() }
})

test('step-5/session-expired-during-first-session: in-app expiry feedback, re-establish without restart', async ({ }, testInfo) => {
  testInfo.annotations.push({ type: 'note', description: 'Token lapse simulated at the fixture host API (401); in-app feedback and re-establishment are the web-observable behavior.' })
  const up = await launchUpstream()
  try {
    const { page } = up.fixture
    await page.locator('#session-list .session-item').first().click()
    await page.locator('#composer').fill('please run shell ls')
    await page.locator('#send-btn').click()
    await expect(page.locator('#session-history .entry-tool').last()).toContainText('shell exit=0')
    const historyCount = await page.locator('#session-history .entry').count()
    up.state.sessionExpired = true // token lapses mid-workflow (extended idle)
    await page.locator('#composer').fill('next step')
    await page.locator('#send-btn').click()
    await expect(page.locator('#session-expired')).toBeVisible()
    // Re-establish in-app — no app restart, persisted history intact.
    await page.locator('#reauth-btn').click()
    await page.locator('#composer').fill('next step')
    await page.locator('#send-btn').click()
    await expect(page.locator('#session-history .entry')).toHaveCount(historyCount + 2)
  } finally { await up.close() }
})
