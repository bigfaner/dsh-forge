// @feature dsh-forge-m1 | @web-e2e | @journey multi-install-coexistence
// Traceability: docs/features/dsh-forge-m1/testing/multi-install-coexistence/contracts/step-3-mutate-shared-data.md
import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { launchUpstream, readPersisted } from '../helpers/journeys.ts'

test('step-3/success: new session + settings writes persist upstream-format, no schema change', async () => {
  const up = await launchUpstream()
  try {
    const { page } = up.fixture
    await page.locator('#new-session-btn').click()
    await expect(page.locator('#session-title')).toHaveText('new session')
    await page.locator('#nav-settings').click()
    await page.locator('#model-input').fill('model-from-dsh-forge')
    await page.locator('#save-settings-btn').click()
    await expect(page.locator('#settings-msg')).toHaveText('saved')
    // Persisted in the upstream format: same JSON shape, no migration keys.
    const persisted = await readPersisted(up.stateFile)
    expect(persisted.sessions).toHaveLength(2)
    expect(Object.keys(persisted.sessions[1]!).sort()).toEqual(['created_by', 'history', 'id', 'state', 'title', 'workspace'])
    expect(persisted.settings.model).toBe('model-from-dsh-forge')
  } finally { await up.close() }
})

test('step-3/credential-updated-by-cli-between-sessions: externally updated credential picked up without stale state', async () => {
  const up = await launchUpstream()
  try {
    const { page } = up.fixture
    // While dsh-forge is open, the CLI updates the shared credential file.
    up.state.credential = { value: 'sk-new-cli-key-123456', masked: 'sk-ne********3456' }
    // Resume: start a new session and read the credential view.
    await page.locator('#nav-chat').click()
    await page.locator('#new-session-btn').click()
    await expect(page.locator('#session-title')).toHaveText('new session')
    await page.locator('#nav-settings').click()
    await page.locator('#load-credential-btn').click()
    await expect(page.locator('#masked-key')).toHaveText('sk-ne********3456') // fresh value, no stale-state failure
    const persisted = await readPersisted(up.stateFile)
    expect(persisted.credential).toMatchObject({ masked: 'sk-ne********3456' }) // valid and consistent
  } finally { await up.close() }
})

test('step-3/settings-write-visible-to-cli: dsh-forge-written settings round-trip in the upstream format', async ({ }, testInfo) => {
  testInfo.annotations.push({ type: 'note', description: 'The CLI read-back is an OS-surface qualifier; the web surface asserts the written settings file parses as upstream-format JSON with every key intact (the format the CLI reads).' })
  const up = await launchUpstream()
  try {
    const { page } = up.fixture
    await page.locator('#nav-settings').click()
    await page.locator('#model-input').fill('model-roundtrip')
    await page.locator('#save-settings-btn').click()
    await expect(page.locator('#settings-msg')).toHaveText('saved')
    const raw = await readFile(up.stateFile, 'utf8')
    const parsed = JSON.parse(raw) as { settings: Record<string, unknown> }
    expect(parsed.settings.model).toBe('model-roundtrip')
    expect(parsed.settings.theme).toBe('dark') // no keys lost
  } finally { await up.close() }
})
