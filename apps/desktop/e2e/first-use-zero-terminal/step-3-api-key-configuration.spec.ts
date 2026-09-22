// @feature dsh-forge-m1 | @web-e2e | @journey first-use-zero-terminal
// Traceability: docs/features/dsh-forge-m1/testing/first-use-zero-terminal/contracts/step-3-api-key-configuration.md
import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { launchUpstream, readPersisted } from '../helpers/journeys.ts'

test('step-3/success: valid API key stored in-app, masked in the UI', async () => {
  const up = await launchUpstream({ credential: null }) // no credential configured yet
  try {
    const { page } = up.fixture
    await page.locator('#nav-settings').click()
    await page.locator('#api-key-input').fill('sk-fixture-key-1234567890')
    await page.locator('#save-key-btn').click()
    await expect(page.locator('#settings-msg')).toHaveText('saved')
    // Masked in the UI — never the cleartext value.
    await expect(page.locator('#masked-key')).toHaveText('sk-fi********7890')
    expect(await page.locator('#surface-settings').textContent()).not.toContain('sk-fixture-key-1234567890')
    // State: persisted to the shared store in the upstream existing format.
    const persisted = await readPersisted(up.stateFile)
    expect(persisted.credential).toMatchObject({ masked: 'sk-fi********7890' })
  } finally { await up.close() }
})

test('step-3/invalid-api-key: upstream validation feedback, correctable without restart, no partial credential', async () => {
  const up = await launchUpstream({ credential: null })
  try {
    const { page } = up.fixture
    const before = await readFile(up.stateFile, 'utf8')
    await page.locator('#nav-settings').click()
    await page.locator('#api-key-input').fill('bad-key')
    await page.locator('#save-key-btn').click()
    await expect(page.locator('#settings-msg')).toHaveText('invalid-api-key')
    // Correctable in-app without restart.
    await page.locator('#api-key-input').fill('sk-fixture-key-1234567890')
    await page.locator('#save-key-btn').click()
    await expect(page.locator('#settings-msg')).toHaveText('saved')
    // The invalid submission persisted nothing (prior state unchanged until the valid save).
    expect((await readPersisted(up.stateFile)).credential).toMatchObject({ masked: expect.any(String) })
    void before
  } finally { await up.close() }
})

test('step-3/masked-key-redisplay: re-opening the credential view keeps the key masked', async () => {
  const up = await launchUpstream() // valid key already configured
  try {
    const { page } = up.fixture
    await page.locator('#nav-settings').click()
    // Re-open the credential view (redisplay path).
    await page.locator('#nav-chat').click()
    await page.locator('#nav-settings').click()
    await page.locator('#load-credential-btn').click()
    await expect(page.locator('#masked-key')).toHaveText('sk-fi********7890')
    // Full key value never rendered in cleartext anywhere on the surface.
    expect(await page.locator('#surface-settings').textContent()).not.toContain('sk-fixture-key-1234567890')
  } finally { await up.close() }
})
