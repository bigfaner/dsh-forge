// Shared e2e fixture stack (task 6.1): fixture Host HTTP server + host child
// entry + fixture web root + Playwright _electron launch. Same carrier
// contract as protocol-carriage.spec.ts / shell-ui.spec.ts (boot gate →
// dshDesktopBoot.ready → __DSH_TRANSPORT__), parameterized per spec.
import { execSync } from 'node:child_process'
import type { AddressInfo } from 'node:net'
import { createServer, type RequestListener, type Server } from 'node:http'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ElectronApplication, Page } from '@playwright/test'
import { _electron } from '@playwright/test'

export interface FixtureApp {
  electronApp: ElectronApplication
  page: Page
  dir: string
  hostServer: Server
  /** Host child pids in boot order (one line per boot; recovery appends). */
  pidFile: string
  hostUrl: string
  /** Tear everything down (electron first, then the fixture servers). */
  close(): Promise<void>
}

export interface FixtureAppOptions {
  /** Extra host-server request handler mounted BEFORE the default routes. */
  handleRequest?: RequestListener
  /** Fixture SPA body HTML injected into the boot-gate page. */
  spaBody?: string
  /** Extra env for the Electron launch (e.g. DSH_FORGE_RELEASE_FEED_URL). */
  env?: Record<string, string>
  /** Extra <script> content appended after the boot-gate bootstrap script. */
  spaScript?: string
  /** Omit the fixture index.html (upstream web dist missing, disc-1 path). */
  webIndexMissing?: boolean
  /** Host child that exits before the ready handshake (first-boot failure). */
  failingHost?: boolean
}

/**
 * Fixture SPA boot-gate page: the carrier contract (dshDesktopBoot + gate)
 * plus whatever body/script the spec injects. Everything runs on dsh-app://
 * inside the real Electron carrier.
 */
export function bootGatePage(options: FixtureAppOptions): string {
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>fixture</title></head>
<body>
${options.spaBody ?? '<div id="root">fixture</div>'}
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
${options.spaScript ?? ''}
</body>
</html>
`
}

export async function launchFixtureApp(options: FixtureAppOptions = {}): Promise<FixtureApp> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-forge-e2e-'))

  // --- fixture authenticated Host (same contract as protocol-carriage.spec) ------
  const hostServer: Server = createServer((req, res) => {
    if (options.handleRequest?.(req, res) === true) return
    if (req.url === '/') {
      res.statusCode = 303
      res.setHeader('set-cookie', 'dsh-auth=fixture-token; Path=/')
      res.end()
      return
    }
    res.statusCode = 404
    res.end()
  })
  await new Promise<void>(resolve => hostServer.listen(0, '127.0.0.1', resolve))
  const hostUrl = `http://127.0.0.1:${(hostServer.address() as AddressInfo).port}/`

  const hostEntry = join(dir, 'host-entry.mjs')
  const pidFile = join(dir, 'host.pid')
  await writeFile(hostEntry, options.failingHost === true
    ? [
        "import { appendFileSync } from 'node:fs'",
        `const pidFile = ${JSON.stringify(pidFile)}`,
        'appendFileSync(pidFile, String(process.pid) + \'\\n\')',
        'process.exit(1)',
      ].join('\n')
    : [
        `const url = ${JSON.stringify(hostUrl)}`,
        `const pidFile = ${JSON.stringify(pidFile)}`,
        "import { appendFileSync } from 'node:fs'",
        'const send = (message) => { if (process.send) process.send(message) }',
        'appendFileSync(pidFile, String(process.pid) + \'\\n\')',
        `send({ type: 'ready', url, injections: ${JSON.stringify([])} })`,
        'process.on(\'message\', (m) => { if (m && m.type === \'shutdown\') { send({ type: \'shutdown-complete\' }); if (process.connected) process.disconnect(); process.exit(0) } })',
        'process.once(\'disconnect\', () => process.exit(0))',
        'setInterval(() => {}, 60_000)',
      ].join('\n'))

  const webRoot = join(dir, 'web')
  await mkdir(webRoot, { recursive: true })
  if (options.webIndexMissing !== true) await writeFile(join(webRoot, 'index.html'), bootGatePage(options))

  const appDir = join(fileURLToPath(new URL('..', import.meta.url)), '..')
  const electronApp = await _electron.launch({
    args: [join(appDir, 'dist', 'main.cjs')],
    env: {
      ...process.env,
      DSH_FORGE_WEB_ROOT: webRoot,
      DSH_FORGE_PROFILE_DIR: join(dir, 'profile'),
      DSH_FORGE_HOST_ENTRY: hostEntry,
      ...options.env,
    },
  })
  const page = await electronApp.firstWindow()
  await page.waitForURL(url => url.href.startsWith('dsh-app://app/'), { timeout: 15_000 })
  await page.waitForFunction(() => document.getElementById('dsh-forge-shell-root') !== null)
  return {
    electronApp,
    page,
    dir,
    pidFile,
    hostServer,
    hostUrl,
    async close() {
      await electronApp.close().catch(() => {})
      hostServer.close()
    },
  }
}

/**
 * List the host child processes of the running shell (SC3): direct children
 * of the Electron main process whose command line runs the host entry.
 * Enumerated from the test process against the OS process table.
 */
export async function listHostChildren(
  electronApp: ElectronApplication,
  entryMarker: string,
): Promise<Array<{ pid: number; command: string }>> {
  // The real Electron main pid (electronApp.process() is the Playwright
  // driver that spawned electron.exe, not the main process itself).
  const mainPid = await electronApp.evaluate(() => process.pid)
  type Row = { pid: number; command: string }
  let rows: Array<Row> = []
  if (process.platform === 'win32') {
    const out = execSync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter 'ParentProcessId=${String(mainPid)}' | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress"`,
      { encoding: 'utf8' },
    )
    const parsed = JSON.parse(out.trim() === '' ? '[]' : out.trim()) as { ProcessId: number; CommandLine: string | null } | Array<{ ProcessId: number; CommandLine: string | null }>
    rows = (Array.isArray(parsed) ? parsed : [parsed]).map(row => ({ pid: Number(row.ProcessId), command: row.CommandLine ?? '' }))
  } else {
    const out = execSync('ps -eo pid=,ppid=,command=', { encoding: 'utf8' })
    for (const line of out.split('\n')) {
      const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line)
      if (m === null) continue
      if (Number(m[2]) === mainPid) rows.push({ pid: Number(m[1]), command: m[3] })
    }
  }
  return rows.filter(row => row.command.includes(entryMarker))
}

/**
 * Is a process with the given pid still alive? (test-process probe, signal 0)
 */
export function isProcessAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}
