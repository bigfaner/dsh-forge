// UF4 e2e (task 6.1): 状态机由真实杀宿主子进程驱动 — kill the host child,
// observe restarting → restoring → recovered through the main-side machine
// (real IPC getState + renderer push history), the UF4 mask overlay covering
// the window during restarting, the carriage rebound to the rebooted host,
// exactly one host child again afterwards (SC3 invariant), and — while the
// mask is up — a fake-feed update-available QUEUES (banner hidden) and only
// shows after the mask exits (mask-queued 入队断言).
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createServer, type Server } from 'node:http'
import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { isProcessAlive, launchFixtureApp, listHostChildren } from './helpers/fixture-app.ts'

const SESSIONS = { sessions: [{ id: 's1', title: 'uf4 recovery' }] }
const FAKE_VERSION = '99.0.0'
const RELEASE_URL = `https://github.com/bigfaner/dsh-forge/releases/tag/v${FAKE_VERSION}`
const FEED_XML = `<feed><entry><title>v${FAKE_VERSION}</title><link rel="alternate" type="text/html" href="${RELEASE_URL}"/></entry></feed>`

test('UF4 state machine: kill host child → restarting → restoring → recovered; queued banner under mask', async () => {
  // Fake feed held until released, so update-available lands INSIDE the mask.
  let releaseFeed: () => void = () => {}
  const feedGate = new Promise<void>((resolve) => { releaseFeed = resolve })
  const feedServer: Server = createServer((req, res) => {
    if (req.url === '/feed.atom') {
      void feedGate.then(() => {
        res.setHeader('content-type', 'application/atom+xml')
        res.end(FEED_XML)
      })
      return
    }
    res.statusCode = 404
    res.end()
  })
  await new Promise<void>(resolve => feedServer.listen(0, '127.0.0.1', resolve))
  const feedUrl = `http://127.0.0.1:${(feedServer.address() as { port: number }).port}/feed.atom`

  const fixture = await launchFixtureApp({
    handleRequest: (req: IncomingMessage, res: ServerResponse) => {
      if (req.url === '/api/sessions') {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(SESSIONS))
        return true
      }
      return false
    },
    env: { DSH_FORGE_RELEASE_FEED_URL: feedUrl },
  })
  try {
    const { electronApp, page, pidFile } = fixture

    // Carriage live pre-kill, banner still hidden (feed held).
    await expect.poll(() => page.evaluate(async () => (await (await fetch('api/sessions')).json()).sessions.length)).toBe(1)
    type UpdateBridge = { dshForge?: { update: { getState: () => Promise<{ phase: string }> } } }
    expect((await page.evaluate(() => (globalThis as UpdateBridge).dshForge?.update.getState())).phase).toBe('hidden')

    // Record renderer recovery-state push history over real IPC.
    await page.evaluate(() => {
      const bridge = (globalThis as { dshForge?: { recovery: { onState: (cb: (s: { state: string }) => void) => unknown } } }).dshForge
      ;(globalThis as { __recoveryHistory?: string[] }).__recoveryHistory = []
      bridge?.recovery.onState((s) => { (globalThis as { __recoveryHistory?: string[] }).__recoveryHistory?.push(s.state) })
    })

    // --- kill the real host child process --------------------------------
    const firstPid = Number((await readFile(pidFile, 'utf8')).trim().split('\n')[0])
    process.kill(firstPid, 'SIGKILL')

    // AC: restarting — mask overlay up, machine state visible over IPC.
    type RecoveryBridge = { dshForge?: { recovery: { getState: () => Promise<string> } } }
    await expect.poll(() => page.evaluate(() => (globalThis as RecoveryBridge).dshForge?.recovery.getState()), { timeout: 10_000 }).toBe('restarting')
    await expect(page.locator('#dsh-forge-crash-recovery')).toBeVisible()

    // AC (mask-queued): update-available arriving under the mask QUEUES.
    releaseFeed()
    await expect.poll(() => page.evaluate(() => (globalThis as UpdateBridge).dshForge?.update.getState()), { timeout: 15_000 }).toMatchObject({ phase: 'queued', version: FAKE_VERSION })
    expect(await page.locator('#dsh-forge-update-banner').count()).toBe(0) // queued renders nothing

    // AC: full ladder restarting → restoring → recovered observed via pushes.
    await expect
      .poll(() => page.evaluate(() => (globalThis as { __recoveryHistory?: string[] }).__recoveryHistory ?? []), { timeout: 30_000 })
      .toEqual(expect.arrayContaining(['restarting', 'restoring', 'recovered']))
    const history = await page.evaluate(() => (globalThis as { __recoveryHistory?: string[] }).__recoveryHistory ?? [])
    const order = ['restarting', 'restoring', 'recovered'].map(s => history.indexOf(s))
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(order.every(i => i >= 0)).toBe(true)

    // AC: mask exits — overlay removed, recovery toast, queued banner shows.
    await expect(page.locator('#dsh-forge-crash-recovery')).toHaveCount(0)
    const banner = page.locator('#dsh-forge-update-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText(FAKE_VERSION)
    expect(await page.locator('.dfw-crash-toast').textContent()).toContain('已恢复最近会话')

    // AC: carriage rebound to the rebooted host; SC3 invariant holds again.
    await expect.poll(() => page.evaluate(async () => (await (await fetch('api/sessions')).json()).sessions.length)).toBe(1)
    const pids = (await readFile(pidFile, 'utf8')).trim().split('\n').map(Number)
    expect(pids).toHaveLength(2)
    expect(isProcessAlive(pids[0])).toBe(false)
    expect(isProcessAlive(pids[1])).toBe(true)
    const children = await listHostChildren(electronApp, 'host-entry.mjs')
    expect(children).toHaveLength(1)
    expect(children[0].pid).toBe(pids[1])
    await expect.poll(() => page.evaluate(() => (globalThis as RecoveryBridge).dshForge?.recovery.getState())).toBe('recovered')
  } finally {
    await fixture.close()
    feedServer.close()
  }
})
