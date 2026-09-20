// @feature dsh-forge-m1 | @web-e2e | @journey multi-install-coexistence
// Journey smoke test (happy path): launch alongside → read shared data →
// mutate shared data → alternate back, success Outcomes in sequence.
// Traceability: docs/features/dsh-forge-m1/testing/multi-install-coexistence/contracts/step-{1..4}-*.md
import { expect, test } from '@playwright/test'
import { launchUpstream, readPersisted } from '../helpers/journeys.ts'

test('multi-install-coexistence journey smoke: coexist → read → mutate → alternate back', async ({ }, testInfo) => {
  testInfo.setTimeout(90_000)
  const up = await launchUpstream({
    sessions: [
      { id: 's1', title: 'cli session', created_by: 'cli', workspace: 'ws-alpha', state: 'idle', history: [] },
      { id: 's2', title: 'official desktop session', created_by: 'official-desktop', workspace: 'ws-alpha', state: 'idle', history: [] },
    ],
  })
  try {
    const { page } = up.fixture

    // Step 1 — launch alongside pre-existing upstream data, distinct profile.
    await expect(page.locator('#upstream-ui')).toBeVisible()

    // Step 2 — read shared data created by other forms.
    await expect(page.locator('#session-list li')).toHaveCount(2)
    await page.locator('#session-list li').first().click()
    await expect(page.locator('#session-title')).toHaveText('cli session')

    // Step 3 — mutate shared data from dsh-forge.
    await page.locator('#new-session-btn').click()
    await expect(page.locator('#session-title')).toHaveText('new session')
    await page.locator('#nav-settings').click()
    await page.locator('#model-input').fill('model-coexist')
    await page.locator('#save-settings-btn').click()
    await expect(page.locator('#settings-msg')).toHaveText('saved')

    // Step 4 — alternate back: shared data intact, all forms' sessions readable.
    await up.close()
    const persisted = await readPersisted(up.stateFile)
    expect(persisted.sessions.map(s => s.created_by).sort()).toEqual(['cli', 'dsh-forge', 'official-desktop'])
    expect(persisted.settings.model).toBe('model-coexist')
  } finally { await up.fixture.hostServer.close() }
})
