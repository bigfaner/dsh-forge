// @feature dsh-forge-m1 | @web-e2e | @journey desktop-ui-parity
// Traceability: docs/features/dsh-forge-m1/testing/desktop-ui-parity/contracts/step-3-plan-settings.md
import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { launchUpstream, readPersisted } from '../helpers/journeys.ts'

test('step-3/success: plan and settings read/write work like the web GUI, sensitive values masked', async () => {
  const up = await launchUpstream()
  try {
    const { page } = up.fixture
    await page.locator('#nav-plan').click()
    await expect(page.locator('#plan-view')).toBeVisible()
    await page.locator('#nav-settings').click()
    // Settings write persists to the shared store in the upstream format.
    await page.locator('#model-input').fill('model-x')
    await page.locator('#save-settings-btn').click()
    await expect(page.locator('#settings-msg')).toHaveText('saved')
    const persisted = await readPersisted(up.stateFile)
    expect(persisted.settings.model).toBe('model-x')
    // API key masking behavior: stored key renders masked, never cleartext.
    await page.locator('#api-key-input').fill('sk-fixture-key-1234567890')
    await page.locator('#save-key-btn').click()
    await expect(page.locator('#masked-key')).toHaveText('sk-fi********7890')
    expect(await page.locator('#surface-settings').textContent()).not.toContain('sk-fixture-key-1234567890')
  } finally { await up.close() }
})

test('step-3/settings-confirmation-dialog: upstream confirmation dialog renders and applies on confirm', async () => {
  const up = await launchUpstream()
  try {
    const { page } = up.fixture
    await page.locator('#nav-settings').click()
    await page.locator('#model-input').fill('model-y')
    await page.locator('#save-settings-btn').click()
    // Upstream confirmation flow: change only takes effect on confirm.
    await page.locator('#confirm-dialog-btn').click()
    await expect(page.locator('#settings-msg')).toHaveText('confirmed')
    const persisted = await readPersisted(up.stateFile)
    expect(persisted.settings.model).toBe('model-y')
  } finally { await up.close() }
})

test('step-3/invalid-settings-rejected: upstream validation feedback, previous valid settings preserved', async () => {
  const up = await launchUpstream()
  try {
    const { page } = up.fixture
    const before = await readFile(up.stateFile, 'utf8')
    await page.locator('#nav-settings').click()
    await page.locator('#model-input').fill('invalid!')
    await page.locator('#save-settings-btn').click()
    // Same validation message as the web GUI; no partial write.
    await expect(page.locator('#settings-msg')).toContainText('validation-error')
    expect(await readFile(up.stateFile, 'utf8')).toBe(before) // persisted settings unchanged
  } finally { await up.close() }
})
