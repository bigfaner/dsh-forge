// @feature dsh-forge-m1 | @web-e2e | @journey desktop-ui-parity
// Traceability: docs/features/dsh-forge-m1/testing/desktop-ui-parity/contracts/step-4-filetree-workspace-switch.md
import { expect, test } from '@playwright/test'
import { launchUpstream } from '../helpers/journeys.ts'

test('step-4/success: browse file tree and switch workspaces with no state loss', async () => {
  const up = await launchUpstream()
  try {
    const { page } = up.fixture
    await expect(page.locator('#file-tree')).toHaveText('README.md, src/')
    // Open a session, then switch away and back — session/UI state preserved.
    await page.locator('#session-list .session-item').first().click()
    await expect(page.locator('#session-title')).toHaveText('prior session')
    await page.locator('#workspace-select').selectOption('ws-beta')
    await expect(page.locator('#file-tree')).toHaveText('')
    await page.locator('#workspace-select').selectOption('ws-alpha')
    await expect(page.locator('#file-tree')).toHaveText('README.md, src/')
    await expect(page.locator('#session-list li')).toHaveCount(1)
    await expect(page.locator('#session-title')).toHaveText('prior session') // current selection preserved
  } finally { await up.close() }
})

test('step-4/empty-workspace: switching to an empty workspace shows the upstream empty state', async () => {
  const up = await launchUpstream()
  try {
    const { page } = up.fixture
    await page.locator('#workspace-select').selectOption('ws-beta')
    await expect(page.locator('#empty-state')).toBeVisible()
    await expect(page.locator('#empty-state')).toHaveText('no sessions in this workspace')
    await expect(page.locator('#session-list li')).toHaveCount(0) // no phantom session entries
  } finally { await up.close() }
})

test('step-4/session-expired-mid-parity: token lapse surfaces in-app and re-establishes without restart', async ({ }, testInfo) => {
  testInfo.annotations.push({ type: 'note', description: 'Contract surface-required session-expired; token lapse simulated at the fixture host API (401), the in-app feedback/re-establish path is the web-observable behavior.' })
  const up = await launchUpstream()
  try {
    const { page } = up.fixture
    await page.locator('#session-list .session-item').first().click()
    up.state.sessionExpired = true // auth token lapsed while idle
    await page.locator('#composer').fill('any message')
    await page.locator('#send-btn').click()
    await expect(page.locator('#session-expired')).toBeVisible()
    // Re-establish in-app — no carrier restart; already-verified state remains.
    await page.locator('#reauth-btn').click()
    await expect(page.locator('#session-expired')).toBeHidden()
    await expect(page.locator('#session-title')).toHaveText('prior session')
    await page.locator('#composer').fill('after reauth')
    await page.locator('#send-btn').click()
    await expect(page.locator('#session-history .entry').last()).toContainText('assistant: echo: after reauth')
  } finally { await up.close() }
})
