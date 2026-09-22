// @feature dsh-forge-m1 | @web-e2e | @journey update-awareness-crash-recovery
// Journey smoke test (happy path): detect update → allowlisted release-page
// jump → host crash → automatic recovery restart → session restored.
// Traceability: docs/features/dsh-forge-m1/testing/update-awareness-crash-recovery/contracts/step-{1..4}-*.md
import { readFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { expect, test } from '@playwright/test'
import { launchUpstream } from '../helpers/journeys.ts'
import { listHostChildren } from '../helpers/fixture-app.ts'

const NEW_VERSION = '99.0.0'
const RELEASE_URL = `https://github.com/bigfaner/dsh-forge/releases/tag/v${NEW_VERSION}`
const FEED_XML = `<feed><entry><title>v${NEW_VERSION}</title><link rel="alternate" type="text/html" href="${RELEASE_URL}"/></entry></feed>`

test('update-awareness-crash-recovery journey smoke: banner → jump → crash → recover', async ({ }, testInfo) => {
  testInfo.setTimeout(180_000)
  const server: Server = createServer((req, res) => {
    if (req.url === '/feed.atom') { res.setHeader('content-type', 'application/atom+xml'); res.end(FEED_XML); return }
    res.statusCode = 404; res.end()
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const feedUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}/feed.atom`
  const up = await launchUpstream({}, { env: { DSH_FORGE_RELEASE_FEED_URL: feedUrl } })
  try {
    const { electronApp, page, pidFile } = up.fixture

    // Step 1 — update hint within 60s of startup.
    const banner = page.locator('#dsh-forge-update-banner')
    await expect(banner).toBeVisible({ timeout: 60_000 })
    await expect(banner).toContainText(NEW_VERSION)

    // Step 2 — jump to the allowlisted release page; app keeps running.
    await electronApp.evaluate(({ shell }) => {
      const sink = globalThis as { __e2eOpenedUrls?: string[] }
      sink.__e2eOpenedUrls = []
      shell.openExternal = (async (url: string) => { sink.__e2eOpenedUrls?.push(url) }) as typeof shell.openExternal
    })
    await banner.locator('.dfw-banner-btn').click()
    const opened = await electronApp.evaluate(() => (globalThis as { __e2eOpenedUrls?: string[] }).__e2eOpenedUrls ?? [])
    expect(opened).toEqual([RELEASE_URL])

    // Session live before the crash.
    await page.locator('#session-list .session-item').first().click()
    await expect(page.locator('#session-title')).toHaveText('prior session')

    // Step 3 — force-kill the host mid-session: shell alive, notice shown.
    const firstPid = Number((await readFile(pidFile, 'utf8')).trim().split('\n')[0])
    process.kill(firstPid, 'SIGKILL')
    type RecoveryBridge = { dshForge?: { recovery: { getState: () => Promise<string> } } }
    await expect.poll(() => page.evaluate(() => (globalThis as RecoveryBridge).dshForge?.recovery.getState()), { timeout: 10_000 }).toBe('restarting')
    await expect(page.locator('#dsh-forge-crash-recovery')).toBeVisible()

    // Step 4 — automatic restart restores the session; process count back to 2.
    await expect.poll(() => page.evaluate(() => (globalThis as RecoveryBridge).dshForge?.recovery.getState()), { timeout: 60_000 }).toBe('recovered')
    await expect.poll(async () => (await listHostChildren(electronApp, 'host-entry.mjs')).length, { timeout: 15_000 }).toBe(1)
    await page.locator('#session-list .session-item').first().click()
    await expect(page.locator('#session-title')).toHaveText('prior session')
    await page.locator('#composer').fill('resumed work')
    await page.locator('#send-btn').click()
    await expect(page.locator('#session-history .entry').last()).toContainText('assistant: echo: resumed work')
  } finally { await up.close(); server.close() }
})
