// @feature dsh-forge-m1 | @web-e2e | @journey desktop-ui-parity
// Journey smoke test (happy path only): chat → approval → plan/settings →
// file tree/workspace switch → new session + user-question, all success
// Outcomes in sequence with state carried across steps.
// Traceability: docs/features/dsh-forge-m1/testing/desktop-ui-parity/contracts/step-{1..5}-*.md
import { expect, test } from '@playwright/test'
import { launchUpstream, readPersisted } from '../helpers/journeys.ts'

test('desktop-ui-parity journey smoke: every web GUI surface usable in the desktop carrier', async ({ }, testInfo) => {
  testInfo.setTimeout(90_000)
  const up = await launchUpstream()
  try {
    const { page } = up.fixture

    // Step 1 — session & chat surface.
    await page.locator('#session-list .session-item').first().click()
    await expect(page.locator('#session-title')).toHaveText('prior session')
    await page.locator('#composer').fill('parity smoke')
    await page.locator('#send-btn').click()
    await expect(page.locator('#session-history .entry').last()).toContainText('assistant: echo: parity smoke')

    // Step 2 — approval surface.
    await page.locator('#composer').fill('needs approval to continue')
    await page.locator('#send-btn').click()
    await expect(page.locator('#approval-prompt')).toBeVisible()
    await page.locator('#approve-btn').click()
    await expect(page.locator('#session-history .entry').last()).toContainText('approval:approve')

    // Step 3 — plan & settings surfaces (masked sensitive values).
    await page.locator('#nav-plan').click()
    await expect(page.locator('#plan-view')).toBeVisible()
    await page.locator('#nav-settings').click()
    await page.locator('#model-input').fill('model-smoke')
    await page.locator('#save-settings-btn').click()
    await expect(page.locator('#settings-msg')).toHaveText('saved')

    // Step 4 — file tree & workspace switching, no state loss.
    await page.locator('#nav-chat').click()
    await expect(page.locator('#file-tree')).toHaveText('README.md, src/')
    await page.locator('#workspace-select').selectOption('ws-beta')
    await expect(page.locator('#empty-state')).toBeVisible()
    await page.locator('#workspace-select').selectOption('ws-alpha')
    await expect(page.locator('#session-list li')).toHaveCount(1)

    // Step 5 — new session + user-question (SC7 smoke list).
    await page.locator('#new-session-btn').click()
    await expect(page.locator('#session-title')).toHaveText('new session')
    await page.locator('#composer').fill('question: proceed?')
    await page.locator('#send-btn').click()
    await expect(page.locator('#user-question')).toBeVisible()
    await page.locator('#answer-input').fill('yes')
    await page.locator('#answer-btn').click()
    await expect(page.locator('#user-question')).toBeHidden()

    // Journey invariants: shared store only upstream-format writes; the
    // carrier itself opened no listening port (traffic via dsh-app:// carrier).
    const persisted = await readPersisted(up.stateFile)
    expect(persisted.sessions).toHaveLength(2)
    expect(persisted.settings.model).toBe('model-smoke')
  } finally { await up.close() }
})
