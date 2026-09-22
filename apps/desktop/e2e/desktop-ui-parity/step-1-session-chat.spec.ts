// @feature dsh-forge-m1 | @web-e2e | @journey desktop-ui-parity
// Traceability: docs/features/dsh-forge-m1/testing/desktop-ui-parity/contracts/step-1-session-chat.md
import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { launchUpstream } from '../helpers/journeys.ts'

test('step-1/success: open existing session and exchange chat inside the carrier', async () => {
  const up = await launchUpstream()
  try {
    const { page } = up.fixture
    await page.locator('#session-list .session-item', { hasText: 'prior session' }).click()
    await expect(page.locator('#session-title')).toHaveText('prior session')
    // Prior history renders (web GUI parity of session history).
    await expect(page.locator('#session-history .entry')).toHaveCount(2)
    // Send a message: appended to history in the upstream format (role:content).
    await page.locator('#composer').fill('hello from desktop carrier')
    await page.locator('#send-btn').click()
    await expect(page.locator('#session-history .entry')).toHaveCount(4)
    await expect(page.locator('#session-history .entry').last()).toContainText('assistant: echo: hello from desktop carrier')
    // State dimension: message persisted into the upstream-format store.
    const persisted = JSON.parse(await readFile(up.stateFile, 'utf8')) as { sessions: Array<{ history: unknown[] }> }
    expect(persisted.sessions[0]!.history).toHaveLength(4)
  } finally { await up.close() }
})

test('step-1/prior-web-gui-sessions-readable: sessions created by web GUI/CLI open with full history, no migration rewrite', async () => {
  const up = await launchUpstream()
  try {
    const { page } = up.fixture
    const before = await readFile(up.stateFile, 'utf8')
    await page.locator('#session-list .session-item').first().click()
    await expect(page.locator('#session-title')).toHaveText('prior session')
    await expect(page.locator('#session-history .entry')).toHaveCount(2) // full history, nothing truncated
    // Read does not rewrite shared $DSH_HOME (State: no migration on read).
    expect(await readFile(up.stateFile, 'utf8')).toBe(before)
  } finally { await up.close() }
})
