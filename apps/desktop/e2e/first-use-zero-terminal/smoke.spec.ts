// @feature dsh-forge-m1 | @web-e2e | @journey first-use-zero-terminal
// Journey smoke test (happy path): launch → API key → workspace → session +
// shell tool → approval, success Outcomes in sequence (zero terminal commands).
// Traceability: docs/features/dsh-forge-m1/testing/first-use-zero-terminal/contracts/step-{1..6}-*.md
import { expect, test } from '@playwright/test'
import { launchUpstream, readPersisted } from '../helpers/journeys.ts'

test('first-use-zero-terminal journey smoke: launch → key → workspace → shell tool → approval', async ({ }, testInfo) => {
  testInfo.setTimeout(90_000)
  const up = await launchUpstream({ credential: null })
  try {
    const { page } = up.fixture

    // Step 1-2 — installed bundle first-launches into the carrier (profile init).
    await expect(page.locator('#upstream-ui')).toBeVisible()

    // Step 3 — API key configuration in-app, masked.
    await page.locator('#nav-settings').click()
    await page.locator('#api-key-input').fill('sk-fixture-key-1234567890')
    await page.locator('#save-key-btn').click()
    await expect(page.locator('#masked-key')).toHaveText('sk-fi********7890')

    // Step 4 — workspace selected, session UI ready.
    await page.locator('#nav-chat').click()
    await page.locator('#workspace-select').selectOption('ws-alpha')
    await expect(page.locator('#composer')).toBeVisible()

    // Step 5 — session with a shell tool call.
    await page.locator('#new-session-btn').click()
    await expect(page.locator('#session-title')).toHaveText('new session')
    await page.locator('#composer').fill('please run shell ls')
    await page.locator('#send-btn').click()
    await expect(page.locator('#session-history .entry-tool').last()).toContainText('shell exit=0')

    // Step 6 — approval interaction completes.
    await page.locator('#composer').fill('needs approval to continue')
    await page.locator('#send-btn').click()
    await page.locator('#approve-btn').click()
    await expect(page.locator('#session-history .entry').last()).toContainText('approval:approve')

    // Journey invariants: shared store written only in the upstream format.
    const persisted = await readPersisted(up.stateFile)
    expect(persisted.sessions).toHaveLength(2)
    expect(persisted.credential).toMatchObject({ masked: 'sk-fi********7890' })
  } finally { await up.close() }
})
