import type { AddressInfo } from 'node:net'
import { createServer, type Server } from 'node:http'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, _electron } from '@playwright/test'

// Task 3.3 SC7-foundation e2e: dsh-app:// protocol carriage over the host
// seam, without requiring the installed upstream dependency closure.
//
// Fixtures:
//   - web root: index.html mimicking the upstream web entry contract
//     (apps/web/src/main.ts): waits on __DSH_BOOT_READY__, calls the
//     dshDesktopBoot preload verb, installs __DSH_TRANSPORT__ =
//     { ownsHost: true, streamBaseUrl }, applies injections, resolves the gate.
//   - host server: loopback HTTP server playing the authenticated upstream
//     Host (303 + set-cookie handshake; /api/sessions answering the smoke
//     session list). The shell reaches it as a CLIENT — the shell itself must
//     not open any listening port.
//   - host entry: child-process entry sending { type: 'ready', url,
//     injections } through the supervisor seam.

const SESSIONS = { sessions: [{ id: 's1', title: 'carriage smoke' }, { id: 's2', title: 'second' }] }

test('dsh-app:// carriage: SPA load, carrier injection, shell-ui body-tail mount, API forward, no listening ports', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-forge-carriage-'))

  // --- fixture authenticated Host ------------------------------------------------
  const seenCookies = new Set<string>()
  const hostServer: Server = createServer((req, res) => {
    if (req.url === '/') {
      res.statusCode = 303
      res.setHeader('set-cookie', 'dsh-auth=fixture-token; Path=/')
      res.end()
      return
    }
    seenCookies.add(String(req.headers.cookie ?? ''))
    if (req.url === '/api/sessions') {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(SESSIONS))
      return
    }
    res.statusCode = 404
    res.end()
  })
  await new Promise<void>(resolve => hostServer.listen(0, '127.0.0.1', resolve))
  const hostPort = (hostServer.address() as AddressInfo).port
  const hostUrl = `http://127.0.0.1:${String(hostPort)}/`

  // --- fixture host entry (supervisor seam) --------------------------------------
  const hostEntry = join(dir, 'host-entry.mjs')
  const shutdownLines = [
    'process.on(\'message\', (m) => {',
    '  if (m && m.type === \'shutdown\') {',
    '    send({ type: \'shutdown-complete\' })',
    '    if (process.connected) process.disconnect()',
    '    process.exit(0)',
    '  }',
    '})',
  ]
  await writeFile(hostEntry, [
    `const url = ${JSON.stringify(hostUrl)}`,
    'const send = (message) => { if (process.send) process.send(message) }',
    `send({ type: 'ready', url, injections: ${JSON.stringify([])} })`,
    ...shutdownLines,
    'process.once(\'disconnect\', () => process.exit(0))',
    'setInterval(() => {}, 60_000)',
  ].join('\n'))

  // --- fixture web root (upstream web-entry contract) -----------------------------
  const webRoot = join(dir, 'web')
  await mkdir(webRoot, { recursive: true })
  await writeFile(join(webRoot, 'index.html'), `<!doctype html>
<html>
<head><meta charset="utf-8"><title>fixture</title></head>
<body>
<div id="root"></div>
<script>
(function () {
  var gate = globalThis.__DSH_BOOT_READY__
  var boot = globalThis.dshDesktopBoot
  if (boot === undefined || gate === undefined) throw new Error('fixture web: carrier contract missing')
  boot.ready().then(function (payload) {
    globalThis.__DSH_TRANSPORT__ = { ownsHost: true, streamBaseUrl: payload.streamBaseUrl }
    payload.injections.forEach(function (injection) {
      if (injection.kind === 'script') { var el = document.createElement('script'); el.textContent = injection.line; document.head.append(el) }
    })
    gate.resolve()
  }).catch(function (error) { gate.reject(error) })
})()
</script>
</body>
</html>
`)

  // --- launch the shell ------------------------------------------------------------
  const appDir = join(fileURLToPath(new URL('..', import.meta.url)))
  const profileDir = join(dir, 'profile')
  const electronApp = await _electron.launch({
    args: [join(appDir, 'dist', 'main.cjs')],
    env: {
      ...process.env,
      DSH_FORGE_WEB_ROOT: webRoot,
      DSH_FORGE_PROFILE_DIR: profileDir,
      DSH_FORGE_HOST_ENTRY: hostEntry,
    },
  })
  try {
    const page = await electronApp.firstWindow()

    // AC: renderer loads the SPA over dsh-app:// (no white screen: gate resolves).
    await page.waitForURL(url => url.href.startsWith('dsh-app://app/'), { timeout: 15_000 })
    type Gate = { __DSH_BOOT_READY__?: { promise: Promise<void> } }
    await page.waitForFunction(() => (globalThis as Gate).__DSH_BOOT_READY__ !== undefined, undefined, { timeout: 10_000 })

    // AC: carrier injection — upstream UI can talk to the host through the seam.
    type Carrier = { __DSH_TRANSPORT__?: { ownsHost: boolean; streamBaseUrl: string } }
    await page.waitForFunction(() => (globalThis as Carrier).__DSH_TRANSPORT__ !== undefined)
    const transport = await page.evaluate(() => (globalThis as Carrier).__DSH_TRANSPORT__)
    expect(transport).toEqual({ ownsHost: true, streamBaseUrl: `http://127.0.0.1:${String(hostPort)}` })

    // AC: shell-ui injection pipeline — mount point is the last child of document.body.
    await page.waitForFunction(() => {
      const last = document.body.lastElementChild
      return last !== null && last.id === 'dsh-forge-shell-root'
    })
    const mountCount = await page.evaluate(() => document.querySelectorAll('#dsh-forge-shell-root').length)
    expect(mountCount).toBe(1)

    // AC smoke (session list): API traffic rides dsh-app:// → authenticated host.
    const sessions = await page.evaluate(async () => await (await fetch('api/sessions')).json())
    expect(sessions).toEqual(SESSIONS)
    expect(seenCookies.has('dsh-auth=fixture-token')).toBe(true)

    // AC: the shell opens no listening port (client-only outbound carriage).
    const resources = await electronApp.evaluate(() => process.getActiveResourcesInfo())
    expect(resources).not.toContain('TCPServer')
    expect(resources).not.toContain('TCPSERVERWRAP')
  } finally {
    await electronApp.close()
    hostServer.close()
  }
})
