// @feature dsh-forge-m1 | @web-e2e | @journey desktop-ui-parity
// Traceability: docs/features/dsh-forge-m1/testing/desktop-ui-parity/contracts/step-2-approval-surface.md
import { expect, test } from '@playwright/test'
import { launchUpstream } from '../helpers/journeys.ts'

test('step-2/success: approval prompt appears during a turn and resolves like the web GUI', async () => {
  const up = await launchUpstream()
  try {
    const { page } = up.fixture
    await page.locator('#session-list .session-item').first().click()
    await page.locator('#composer').fill('needs approval to continue')
    await page.locator('#send-btn').click()
    await expect(page.locator('#approval-prompt')).toBeVisible()
    await page.locator('#approve-btn').click()
    // Session proceeds per the decision: decision recorded, prompt gone, turn continues.
    await expect(page.locator('#approval-prompt')).toBeHidden()
    await expect(page.locator('#session-history .entry').last()).toContainText('approval:approve')
  } finally { await up.close() }
})

test('step-2/rapid-surface-switch-mid-turn: switching chat/plan/settings mid-turn preserves session state', async () => {
  const up = await launchUpstream()
  try {
    const { page } = up.fixture
    await page.locator('#session-list .session-item').first().click()
    await page.locator('#composer').fill('needs approval to continue')
    await page.locator('#send-btn').click()
    await expect(page.locator('#approval-prompt')).toBeVisible()
    // Switch surfaces mid-turn, then return to chat.
    await page.locator('#nav-plan').click()
    await expect(page.locator('#surface-plan')).toBeVisible()
    await page.locator('#nav-settings').click()
    await expect(page.locator('#surface-settings')).toBeVisible()
    await page.locator('#nav-chat').click()
    // No state break: same session, same pending turn, no duplication.
    await expect(page.locator('#session-title')).toHaveText('prior session')
    await expect(page.locator('#session-history .entry')).toHaveCount(3)
    await expect(page.locator('#approval-prompt')).toBeVisible()
    await page.locator('#approve-btn').click()
    await expect(page.locator('#session-history .entry').last()).toContainText('approval:approve')
  } finally { await up.close() }
})
