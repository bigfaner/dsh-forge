// @feature dsh-forge-m1 | @web-e2e | @journey update-awareness-crash-recovery
// Traceability: docs/features/dsh-forge-m1/testing/update-awareness-crash-recovery/contracts/step-2-jump-to-release-page.md
import { createServer, type Server } from 'node:http'
import { expect, test } from '@playwright/test'
import { launchUpstream } from '../helpers/journeys.ts'

const INSTALLED_VERSION = '0.1.0' // apps/desktop package.json version (fact table)
const NEW_VERSION = '99.0.0'
const ALLOWED_URL = `https://github.com/bigfaner/dsh-forge/releases/tag/v${NEW_VERSION}`
const EVIL_URL = 'https://attacker.example.com/download'

function feedXml(version: string, url: string): string {
  return `<feed><entry><title>v${version}</title><link rel="alternate" type="text/html" href="${url}"/></entry></feed>`
}

async function withFeed(xml: string): Promise<{ url: string; close: () => void }> {
  const server: Server = createServer((req, res) => {
    if (req.url === '/feed.atom') { res.setHeader('content-type', 'application/atom+xml'); res.end(xml); return }
    res.statusCode = 404; res.end()
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return { url: `http://127.0.0.1:${(server.address() as { port: number }).port}/feed.atom`, close: () => server.close() }
}

test('step-2/success: clicking the hint opens the allowlisted release page (FT-009), app keeps running', async () => {
  const feed = await withFeed(feedXml(NEW_VERSION, ALLOWED_URL))
  const up = await launchUpstream({}, { env: { DSH_FORGE_RELEASE_FEED_URL: feed.url } })
  try {
    const { electronApp, page } = up.fixture
    await electronApp.evaluate(({ shell }) => {
      const sink = globalThis as { __e2eOpenedUrls?: string[] }
      sink.__e2eOpenedUrls = []
      shell.openExternal = (async (url: string) => { sink.__e2eOpenedUrls?.push(url) }) as typeof shell.openExternal
    })
    const banner = page.locator('#dsh-forge-update-banner')
    await expect(banner).toBeVisible({ timeout: 60_000 })
    await banner.locator('.dfw-banner-btn').click()
    const opened = await electronApp.evaluate(() => (globalThis as { __e2eOpenedUrls?: string[] }).__e2eOpenedUrls ?? [])
    expect(opened).toEqual([ALLOWED_URL]) // only the allowlisted release page
    // App continues running normally after the jump.
    await page.locator('#session-list .session-item').first().click()
    await expect(page.locator('#session-title')).toHaveText('prior session')
  } finally { await up.close(); feed.close() }
})

test('step-2/feed-same-version: feed reporting the installed version shows no hint', async ({ }, testInfo) => {
  testInfo.setTimeout(60_000)
  const feed = await withFeed(feedXml(INSTALLED_VERSION, ALLOWED_URL))
  const up = await launchUpstream({}, { env: { DSH_FORGE_RELEASE_FEED_URL: feed.url } })
  try {
    const { page } = up.fixture
    await expect(page.locator('#upstream-ui')).toBeVisible()
    type UpdateBridge = { dshForge?: { update: { getState: () => Promise<{ phase: string }> } } }
    // Give the (equal-version) check time to resolve: still hidden, no banner.
    await page.waitForTimeout(3_000)
    expect((await page.evaluate(() => (globalThis as UpdateBridge).dshForge?.update.getState()))?.phase).toBe('hidden')
    await expect(page.locator('#dsh-forge-update-banner')).toHaveCount(0)
  } finally { await up.close(); feed.close() }
})

test('step-2/dismiss-hint: dismissal is terminal for the run (FT-010)', async ({ }, testInfo) => {
  testInfo.setTimeout(90_000)
  const feed = await withFeed(feedXml(NEW_VERSION, ALLOWED_URL))
  const up = await launchUpstream({}, { env: { DSH_FORGE_RELEASE_FEED_URL: feed.url } })
  try {
    const { page } = up.fixture
    const banner = page.locator('#dsh-forge-update-banner')
    await expect(banner).toBeVisible({ timeout: 60_000 })
    await banner.click() // focus inside the banner, then Esc dismisses (F4 semantics)
    await page.keyboard.press('Escape')
    await expect(banner).toHaveCount(0)
    // Dismissed is terminal until restart — no re-show within this run.
    await page.waitForTimeout(5_000)
    await expect(banner).toHaveCount(0)
    type UpdateBridge = { dshForge?: { update: { getState: () => Promise<{ phase: string }> } } }
    expect((await page.evaluate(() => (globalThis as UpdateBridge).dshForge?.update.getState()))?.phase).toBe('dismissed')
  } finally { await up.close(); feed.close() }
})

test('step-2/non-whitelisted-url-rejected: external open blocked for a non-allowlisted releaseUrl (FT-005)', async ({ }, testInfo) => {
  testInfo.setTimeout(90_000)
  const feed = await withFeed(feedXml(NEW_VERSION, EVIL_URL))
  const up = await launchUpstream({}, { env: { DSH_FORGE_RELEASE_FEED_URL: feed.url } })
  try {
    const { electronApp, page } = up.fixture
    await electronApp.evaluate(({ shell }) => {
      const sink = globalThis as { __e2eOpenedUrls?: string[] }
      sink.__e2eOpenedUrls = []
      shell.openExternal = (async (url: string) => { sink.__e2eOpenedUrls?.push(url) }) as typeof shell.openExternal
    })
    const banner = page.locator('#dsh-forge-update-banner')
    await expect(banner).toBeVisible({ timeout: 60_000 })
    await banner.locator('.dfw-banner-btn').click()
    await page.waitForTimeout(1_000)
    const opened = await electronApp.evaluate(() => (globalThis as { __e2eOpenedUrls?: string[] }).__e2eOpenedUrls ?? [])
    expect(opened).toEqual([]) // no browser/page opened for the non-whitelisted URL
    // App continues running normally without crash.
    await page.locator('#session-list .session-item').first().click()
    await expect(page.locator('#session-title')).toHaveText('prior session')
  } finally { await up.close(); feed.close() }
})
