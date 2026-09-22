// @feature dsh-forge-m1 | @web-e2e | @journey update-awareness-crash-recovery
// Traceability: docs/features/dsh-forge-m1/testing/update-awareness-crash-recovery/contracts/step-1-detect-new-version.md
import { readFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { expect, test } from '@playwright/test'
import { launchUpstream } from '../helpers/journeys.ts'

const FAKE_VERSION = '99.0.0'
const RELEASE_URL = `https://github.com/bigfaner/dsh-forge/releases/tag/v${FAKE_VERSION}`
const FEED_XML = `<feed><entry><title>v${FAKE_VERSION}</title><link rel="alternate" type="text/html" href="${RELEASE_URL}"/></entry></feed>`

async function feedServing(xml: string): Promise<{ url: string; close: () => void }> {
  const server: Server = createServer((req, res) => {
    if (req.url === '/feed.atom') { res.setHeader('content-type', 'application/atom+xml'); res.end(xml); return }
    res.statusCode = 404; res.end()
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return { url: `http://127.0.0.1:${(server.address() as { port: number }).port}/feed.atom`, close: () => server.close() }
}

test('step-1/success: newer feed version shows the in-app update hint within 60s', async () => {
  const feed = await feedServing(FEED_XML)
  const up = await launchUpstream({}, { env: { DSH_FORGE_RELEASE_FEED_URL: feed.url } })
  try {
    const { page } = up.fixture
    const banner = page.locator('#dsh-forge-update-banner')
    await expect(banner).toBeVisible({ timeout: 60_000 }) // contract: within 60 seconds of startup
    await expect(banner).toContainText(FAKE_VERSION)
    // App otherwise in normal running state: dismiss the hint and use the app.
    await banner.click()
    await page.keyboard.press('Escape')
    await expect(banner).toHaveCount(0)
    await page.locator('#session-list .session-item').first().click()
    await expect(page.locator('#session-title')).toHaveText('prior session')
  } finally { await up.close(); feed.close() }
})

test('step-1/feed-unreachable-offline: update check fails silently, startup not blocked (FT-004)', async () => {
  const up = await launchUpstream({}, { env: { DSH_FORGE_RELEASE_FEED_URL: 'http://127.0.0.1:1/feed.atom' } })
  try {
    const { page } = up.fixture
    // Startup not blocked: carrier usable immediately.
    await expect(page.locator('#upstream-ui')).toBeVisible()
    // No error dialog surface and no banner — failed-silent.
    type UpdateBridge = { dshForge?: { update: { getState: () => Promise<{ phase: string }> } } }
    expect((await page.evaluate(() => (globalThis as UpdateBridge).dshForge?.update.getState()))?.phase).toBe('hidden')
    await expect(page.locator('#dsh-forge-update-banner')).toHaveCount(0)
  } finally { await up.close() }
})

test('step-1/banner-queued-under-recovery-mask: banner queues under the UF4 mask, shows after mask exit (FT-010)', async ({ }, testInfo) => {
  testInfo.setTimeout(120_000)
  // Feed held until the mask is up, so update-available lands INSIDE recovery.
  let releaseFeed: () => void = () => {}
  const feedGate = new Promise<void>(resolve => { releaseFeed = resolve })
  const server: Server = createServer((req, res) => {
    if (req.url === '/feed.atom') { void feedGate.then(() => { res.setHeader('content-type', 'application/atom+xml'); res.end(FEED_XML) }); return }
    res.statusCode = 404; res.end()
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const feedUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}/feed.atom`
  const up = await launchUpstream({}, { env: { DSH_FORGE_RELEASE_FEED_URL: feedUrl } })
  try {
    const { electronApp, page, pidFile } = up.fixture
    type UpdateBridge = { dshForge?: { update: { getState: () => Promise<{ phase: string }> } } }
    type RecoveryBridge = { dshForge?: { recovery: { getState: () => Promise<string> } } }
    expect((await page.evaluate(() => (globalThis as UpdateBridge).dshForge?.update.getState()))?.phase).toBe('hidden')
    // Drive the mask: kill the real host child mid-session.
    const firstPid = Number((await readFile(pidFile, 'utf8')).trim().split('\n')[0])
    process.kill(firstPid, 'SIGKILL')
    await expect.poll(() => page.evaluate(() => (globalThis as RecoveryBridge).dshForge?.recovery.getState()), { timeout: 10_000 }).toBe('restarting')
    await expect(page.locator('#dsh-forge-crash-recovery')).toBeVisible()
    // Update result arrives under the mask → queued, not shown over the mask.
    releaseFeed()
    await expect.poll(() => page.evaluate(() => (globalThis as UpdateBridge).dshForge?.update.getState()), { timeout: 15_000 }).toMatchObject({ phase: 'queued', version: FAKE_VERSION })
    expect(await page.locator('#dsh-forge-update-banner').count()).toBe(0)
    // Mask exits with recovery completed → queued banner transitions to shown.
    await expect.poll(() => page.evaluate(() => (globalThis as RecoveryBridge).dshForge?.recovery.getState()), { timeout: 30_000 }).toBe('recovered')
    await expect(page.locator('#dsh-forge-crash-recovery')).toHaveCount(0)
    await expect(page.locator('#dsh-forge-update-banner')).toBeVisible()
    await expect(page.locator('#dsh-forge-update-banner')).toContainText(FAKE_VERSION)
    void electronApp
  } finally { await up.close(); server.close() }
})
