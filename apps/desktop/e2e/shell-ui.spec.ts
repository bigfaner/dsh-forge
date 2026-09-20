import type { AddressInfo } from 'node:net'
import { createServer, type Server } from 'node:http'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, _electron } from '@playwright/test'

// Task 5.3 integration e2e (carrier-level UF3/UF4 visibility): the shell-ui
// components render inside the real Electron carrier on top of the upstream
// GUI container, the z ladder holds (UF4 mask z1200 > UF3 banner/toast z1100),
// the banner queues while the mask is up and shows when it exits, and the
// upstream document keeps working around the overlay (SC7 smoke).
//
// The main-side state machines cannot be driven end-to-end here (host-exit
// wiring and the fake update feed belong to their own tasks); the real
// dshForge getState verbs are exercised over real IPC, and the visual states
// are driven through the page-exposed factories against the REAL overlay root.

const SESSIONS = { sessions: [{ id: 's1', title: 'shell-ui smoke' }] }

test('UF3/UF4 shell-ui integration: carrier visibility, z ladder, queued→shown, upstream unaffected', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-forge-shell-ui-'))

  // --- fixture authenticated Host (same contract as protocol-carriage.spec) ------
  const hostServer: Server = createServer((req, res) => {
    if (req.url === '/') {
      res.statusCode = 303
      res.setHeader('set-cookie', 'dsh-auth=fixture-token; Path=/')
      res.end()
      return
    }
    if (req.url === '/api/sessions') {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(SESSIONS))
      return
    }
    res.statusCode = 404
    res.end()
  })
  await new Promise<void>(resolve => hostServer.listen(0, '127.0.0.1', resolve))
  const hostUrl = `http://127.0.0.1:${(hostServer.address() as AddressInfo).port}/`

  const hostEntry = join(dir, 'host-entry.mjs')
  await writeFile(hostEntry, [
    `const url = ${JSON.stringify(hostUrl)}`,
    'const send = (message) => { if (process.send) process.send(message) }',
    `send({ type: 'ready', url, injections: ${JSON.stringify([])} })`,
    'process.on(\'message\', (m) => { if (m && m.type === \'shutdown\') { send({ type: \'shutdown-complete\' }); if (process.connected) process.disconnect(); process.exit(0) } })',
    'process.once(\'disconnect\', () => process.exit(0))',
    'setInterval(() => {}, 60_000)',
  ].join('\n'))

  const webRoot = join(dir, 'web')
  await mkdir(webRoot, { recursive: true })
  await writeFile(join(webRoot, 'index.html'), `<!doctype html>
<html>
<head><meta charset="utf-8"><title>fixture</title></head>
<body>
<div id="root"><button id="upstream-btn">upstream</button></div>
<script>
(function () {
  var gate = globalThis.__DSH_BOOT_READY__
  var boot = globalThis.dshDesktopBoot
  if (boot === undefined || gate === undefined) throw new Error('fixture web: carrier contract missing')
  boot.ready().then(function (payload) {
    globalThis.__DSH_TRANSPORT__ = { ownsHost: true, streamBaseUrl: payload.streamBaseUrl }
    gate.resolve()
  }).catch(function (error) { gate.reject(error) })
})()
</script>
</body>
</html>
`)

  const appDir = join(fileURLToPath(new URL('..', import.meta.url)))
  const electronApp = await _electron.launch({
    args: [join(appDir, 'dist', 'main.cjs')],
    env: {
      ...process.env,
      DSH_FORGE_WEB_ROOT: webRoot,
      DSH_FORGE_PROFILE_DIR: join(dir, 'profile'),
      DSH_FORGE_HOST_ENTRY: hostEntry,
    },
  })
  try {
    const page = await electronApp.firstWindow()
    await page.waitForURL(url => url.href.startsWith('dsh-app://app/'), { timeout: 15_000 })

    // AC: overlay root mounts at body end after the boot gate; components registered.
    await page.waitForFunction(() => {
      const last = document.body.lastElementChild
      return last !== null && last.id === 'dsh-forge-shell-root'
    })
    expect(await page.evaluate(() => [
      typeof (globalThis as { __DSH_FORGE_UPDATE_BANNER__?: unknown }).__DSH_FORGE_UPDATE_BANNER__,
      typeof (globalThis as { __DSH_FORGE_CRASH_RECOVERY__?: unknown }).__DSH_FORGE_CRASH_RECOVERY__,
    ])).toEqual(['object', 'object'])

    // AC: real dshForge state verbs answer over real IPC (main-side machines).
    type ForgeBridge = { dshForge?: { update: { getState: () => Promise<{ phase: string; version?: string }> } } }
    const bannerState = await page.evaluate(() => (globalThis as ForgeBridge).dshForge?.update.getState())
    expect(typeof bannerState?.phase).toBe('string')
    expect(['hidden', 'queued', 'shown', 'dismissed']).toContain(bannerState?.phase)
    type RecoveryBridge = { dshForge?: { recovery: { getState: () => Promise<string> } } }
    await expect.poll(() => page.evaluate(() => (globalThis as RecoveryBridge).dshForge?.recovery.getState())).toBe('idle')

    // AC: z ladder + queued-while-mask + recovered toast, against the REAL root.
    const visibility = await page.evaluate(() => {
      const root = document.getElementById('dsh-forge-shell-root')
      if (root === null) throw new Error('shell root missing')
      type Controller = { applyState: (s: unknown) => unknown; element: () => Element | null }
      type Factory = { create: (o: unknown) => Controller }
      const factories = globalThis as unknown as {
        __DSH_FORGE_UPDATE_BANNER__: Factory
        __DSH_FORGE_CRASH_RECOVERY__: Factory
      }
      const banner = factories.__DSH_FORGE_UPDATE_BANNER__.create({ document, root, dshForge: { update: {} } })
      const overlay = factories.__DSH_FORGE_CRASH_RECOVERY__.create({ document, root, dshForge: { recovery: {} } })
      const out: Record<string, unknown> = {}
      // queued renders nothing (banner waits for the mask to exit).
      banner.applyState({ phase: 'queued', version: '9.9.9' })
      out.queuedElement = banner.element() !== null
      // mask up (restarting) → overlay visible at z1200, banner still absent.
      overlay.applyState({ state: 'restarting' })
      out.overlayZ = overlay.element() === null ? null : getComputedStyle(overlay.element() as Element).zIndex
      // mask exits (recovered) → overlay removed + 「已恢复最近会话」 toast.
      overlay.applyState({ state: 'recovered' })
      out.overlayAfterRecovery = overlay.element() !== null
      out.recoveredToast = root.querySelector('.dfw-crash-toast')?.textContent
      // queued → shown once the mask is gone: banner visible at z1100.
      banner.applyState({ phase: 'shown', version: '9.9.9' })
      const el = banner.element()
      out.bannerZ = el === null ? null : getComputedStyle(el).zIndex
      out.bannerText = el?.textContent ?? null
      out.bannerTop = el === null ? null : getComputedStyle(el).top
      return out
    })
    expect(visibility.queuedElement).toBe(false)
    expect(visibility.overlayZ).toBe('1200')
    expect(visibility.overlayAfterRecovery).toBe(false)
    expect(visibility.recoveredToast).toBe('已恢复最近会话')
    expect(visibility.bannerZ).toBe('1100')
    expect(String(visibility.bannerText)).toContain('9.9.9')
    expect(visibility.bannerTop).toBe('40px')

    // AC: failure detail renders and is truncated to ≤120 chars (ui-design UF4).
    const failed = await page.evaluate(() => {
      const root = document.getElementById('dsh-forge-shell-root')
      type Controller = { applyState: (s: unknown) => unknown; element: () => Element | null }
      const overlay = (globalThis as unknown as { __DSH_FORGE_CRASH_RECOVERY__: { create: (o: unknown) => Controller } })
        .__DSH_FORGE_CRASH_RECOVERY__.create({ document, root: root as Element, dshForge: { recovery: {} } })
      overlay.applyState({ state: 'failed', reason: 'x'.repeat(500) })
      const reason = overlay.element()?.querySelector('.dfw-crash-reason')?.textContent ?? ''
      const restart = overlay.element()?.querySelector('.dfw-crash-restart')?.textContent
      reason.length && overlay.element()?.remove()
      return { length: reason.length, restart }
    })
    expect(failed.length).toBeLessThanOrEqual(120)
    expect(failed.restart).toBe('重启应用')

    // AC: upstream GUI interaction unaffected by the injection (SC7 smoke).
    expect(await page.evaluate(() => document.getElementById('upstream-btn') !== null)).toBe(true)
    const clicked = await page.evaluate(() => {
      let hit = false
      document.getElementById('upstream-btn')?.addEventListener('click', () => { hit = true }, { once: true })
      document.getElementById('upstream-btn')?.click()
      return hit
    })
    expect(clicked).toBe(true)
    const sessions = await page.evaluate(async () => await (await fetch('api/sessions')).json())
    expect(sessions).toEqual(SESSIONS)
  } finally {
    await electronApp.close()
    hostServer.close()
  }
})
