// @feature dsh-forge-m1 | @web-e2e | @journey first-use-zero-terminal
// Traceability: docs/features/dsh-forge-m1/testing/first-use-zero-terminal/contracts/step-1-download-install.md
//
// The installer flow itself is an OS-surface concern; the web-observable
// carrier-level equivalents are exercised here: the built app bundle boots
// into the carrier (zero terminal interaction by the user) and offline launch
// fails the update check silently without blocking startup.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchUpstream } from '../helpers/journeys.ts'

test('step-1/success: installed app bundle boots into the carrier with zero terminal interaction', async ({ }, testInfo) => {
  testInfo.annotations.push({ type: 'note', description: 'OS installer surface (GitHub Releases download, OS security prompt) is qualified out at the web surface; the built bundle launch over the dsh-app:// carrier is the observable.' })
  const up = await launchUpstream()
  try {
    const { page, dir } = up.fixture
    // Carrier booted: dsh-app:// page with shell root mounted (installed, bundled runtime present).
    expect(page.url().startsWith('dsh-app://app/')).toBe(true)
    // Independent profile directory initialized by the launch.
    expect(existsSync(join(dir, 'profile'))).toBe(true)
    await expect(page.locator('#upstream-ui')).toBeVisible()
  } finally { await up.close() }
})

test('step-1/fully-offline-install: unreachable update feed fails silently, startup not blocked (FT-004)', async () => {
  // Port 1 on localhost is closed — "no network after obtaining the installer".
  const up = await launchUpstream({}, { env: { DSH_FORGE_RELEASE_FEED_URL: 'http://127.0.0.1:1/feed.atom' } })
  try {
    const { page } = up.fixture
    // App enters normally: carrier page live, upstream UI usable.
    await expect(page.locator('#upstream-ui')).toBeVisible()
    await page.locator('#session-list .session-item').first().click()
    await expect(page.locator('#session-title')).toHaveText('prior session')
    // No error dialog surface: no update banner, no crash — failed-silent.
    type UpdateBridge = { dshForge?: { update: { getState: () => Promise<{ phase: string }> } } }
    expect((await page.evaluate(() => (globalThis as UpdateBridge).dshForge?.update.getState()))?.phase).toBe('hidden')
    await expect(page.locator('#dsh-forge-update-banner')).toHaveCount(0)
  } finally { await up.close() }
})
