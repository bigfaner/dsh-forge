// @feature dsh-forge-m1 | @web-e2e | @journey first-use-zero-terminal
// Traceability: docs/features/dsh-forge-m1/testing/first-use-zero-terminal/contracts/step-6-approval-interaction.md
import { expect, test } from '@playwright/test'
import { launchUpstream, readPersisted } from '../helpers/journeys.ts'

test('step-6/success: approving the pending prompt records the decision and continues the session', async () => {
  const up = await launchUpstream()
  try {
    const { page } = up.fixture
    await page.locator('#session-list .session-item').first().click()
    await page.locator('#composer').fill('needs approval to continue')
    await page.locator('#send-btn').click()
    await expect(page.locator('#approval-prompt')).toBeVisible()
    await page.locator('#approve-btn').click()
    await expect(page.locator('#approval-prompt')).toBeHidden()
    await expect(page.locator('#session-history .entry').last()).toContainText('approval:approve')
    // State: decision recorded in the session history (upstream format).
    const persisted = await readPersisted(up.stateFile)
    expect(persisted.sessions[0]!.history.some(h => h.kind === 'approval')).toBe(true)
  } finally { await up.close() }
})

test('step-6/approval-rejected-path: rejection recorded, no tool side-effect executed', async () => {
  const up = await launchUpstream()
  try {
    const { page } = up.fixture
    await page.locator('#session-list .session-item').first().click()
    await page.locator('#composer').fill('needs approval to continue')
    await page.locator('#send-btn').click()
    await page.locator('#reject-btn').click()
    await expect(page.locator('#approval-prompt')).toBeHidden()
    await expect(page.locator('#session-history .entry').last()).toContainText('approval:reject')
    // No tool side-effect executed for the rejected call; session continues (usable).
    expect(await page.locator('#session-history .entry-tool').count()).toBe(0)
    await page.locator('#composer').fill('still going')
    await page.locator('#send-btn').click()
    await expect(page.locator('#session-history .entry').last()).toContainText('assistant: echo: still going')
  } finally { await up.close() }
})
