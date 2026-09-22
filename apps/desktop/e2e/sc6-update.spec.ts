// SC6 e2e (task 6.1, tech-design Testing Strategy 载体级): fake update feed —
// the startup check resolves against a local fixture atom feed (via the
// DSH_FORGE_RELEASE_FEED_URL seam) and the UF3 banner appears within the 60s
// startup budget; 查看发布页 jumps to the allowlisted GitHub release page
// (openExternal intercepted in the real main process); UF3 Esc dismissal only
// while focus is inside the banner, and the dismissed latch terminalizes
// openRelease for the run.
import { createServer, type Server } from 'node:http'
import { expect, test } from '@playwright/test'
import { launchFixtureApp } from './helpers/fixture-app.ts'

const FAKE_VERSION = '99.0.0'
const RELEASE_URL = `https://github.com/bigfaner/dsh-forge/releases/tag/v${FAKE_VERSION}`
const FEED_XML = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry><title>v${FAKE_VERSION}</title><link rel="alternate" type="text/html" href="${RELEASE_URL}"/></entry>
</feed>`

test('SC6 fake feed: UF3 banner within 60s + allowlisted release-page jump', async () => {
  const feedServer: Server = createServer((req, res) => {
    if (req.url === '/feed.atom') {
      res.setHeader('content-type', 'application/atom+xml')
      res.end(FEED_XML)
      return
    }
    res.statusCode = 404
    res.end()
  })
  await new Promise<void>(resolve => feedServer.listen(0, '127.0.0.1', resolve))
  const feedUrl = `http://127.0.0.1:${(feedServer.address() as { port: number }).port}/feed.atom`

  const startupStartedAt = Date.now()
  const fixture = await launchFixtureApp({ env: { DSH_FORGE_RELEASE_FEED_URL: feedUrl } })
  try {
    const { electronApp, page } = fixture

    // Intercept openExternal in the real main process (before any click).
    await electronApp.evaluate(({ shell }) => {
      const sink = globalThis as { __e2eOpenedUrls?: string[] }
      sink.__e2eOpenedUrls = []
      shell.openExternal = (async (url: string) => {
        sink.__e2eOpenedUrls?.push(url)
      }) as typeof shell.openExternal
    })

    // AC: banner appears within the 60s SC6 startup budget with the fake feed.
    const banner = page.locator('#dsh-forge-update-banner')
    await expect(banner).toBeVisible({ timeout: 60_000 })
    const elapsedMs = Date.now() - startupStartedAt
    expect(elapsedMs).toBeLessThan(60_000)
    await expect(banner).toContainText(FAKE_VERSION)

    // AC: release-page jump goes through openRelease with the allowlisted URL
    // (the jump also dismisses the banner for this run — F4-D2 semantics).
    await expect(banner.locator('.dfw-banner-btn')).toHaveText('查看发布页')
    await banner.locator('.dfw-banner-btn').click()
    const opened = await electronApp.evaluate(() => (globalThis as { __e2eOpenedUrls?: string[] }).__e2eOpenedUrls ?? [])
    expect(opened).toEqual([RELEASE_URL])
    await expect(banner).toHaveCount(0)
  } finally {
    await fixture.close()
    feedServer.close()
  }
})

test('UF3 Esc: closes only while focus is inside the banner; dismissed latches openRelease for the run', async () => {
  const feedServer: Server = createServer((req, res) => {
    if (req.url === '/feed.atom') {
      res.setHeader('content-type', 'application/atom+xml')
      res.end(FEED_XML)
      return
    }
    res.statusCode = 404
    res.end()
  })
  await new Promise<void>(resolve => feedServer.listen(0, '127.0.0.1', resolve))
  const feedUrl = `http://127.0.0.1:${(feedServer.address() as { port: number }).port}/feed.atom`

  const fixture = await launchFixtureApp({ env: { DSH_FORGE_RELEASE_FEED_URL: feedUrl } })
  try {
    const { electronApp, page } = fixture
    await electronApp.evaluate(({ shell }) => {
      const sink = globalThis as { __e2eOpenedUrls?: string[] }
      sink.__e2eOpenedUrls = []
      shell.openExternal = (async (url: string) => {
        sink.__e2eOpenedUrls?.push(url)
      }) as typeof shell.openExternal
    })

    const banner = page.locator('#dsh-forge-update-banner')
    await expect(banner).toBeVisible({ timeout: 60_000 })

    // UF3: Esc with focus OUTSIDE the banner does not close it.
    await page.locator('#root').click()
    await page.keyboard.press('Escape')
    await expect(banner).toBeVisible()

    // UF3: Esc with focus inside the banner closes it; phase terminalizes.
    await banner.focus()
    await page.keyboard.press('Escape')
    await expect(banner).toHaveCount(0)
    type UpdateBridge = { dshForge?: { update: { getState: () => Promise<{ phase: string }> } } }
    await expect.poll(() => page.evaluate(() => (globalThis as UpdateBridge).dshForge?.update.getState())).toMatchObject({ phase: 'dismissed' })

    // AC: dismissed is a terminal latch for this run — openRelease is a no-op.
    await page.evaluate(async () => {
      const bridge = (globalThis as { dshForge?: { update: { openRelease: () => Promise<void> } } }).dshForge
      await bridge?.update.openRelease()
    })
    const openedAfterDismiss = await electronApp.evaluate(() => (globalThis as { __e2eOpenedUrls?: string[] }).__e2eOpenedUrls ?? [])
    expect(openedAfterDismiss).toEqual([])
  } finally {
    await fixture.close()
    feedServer.close()
  }
})
