import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  authenticateWebHost,
  forwardWebRequest,
  serveStaticFile,
  serveWebDocument,
} from '../src/main/protocol/web-document.ts'
import { createProtocolCarriage, isWebAssetPathname } from '../src/main/protocol/carriage.ts'
import { SHELL_APP_ORIGIN, SHELL_UI_SCRIPT_PATH, SHELL_UI_SCRIPT_URL } from '../src/main/protocol/constants.ts'

const INDEX_HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>'

async function makeWebRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-forge-webroot-'))
  await writeFile(join(root, 'index.html'), INDEX_HTML)
  await mkdir(join(root, 'assets'), { recursive: true })
  return root
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('serveWebDocument (injection pipeline)', () => {
  it('injects the boot gate into <head> and the shell-ui script at the end of <body>', async () => {
    const root = await makeWebRoot()
    const response = await serveWebDocument(new Request(`${SHELL_APP_ORIGIN}/`), root, { shellUiScriptUrl: SHELL_UI_SCRIPT_URL })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    const html = await response.text()
    const gateIndex = html.indexOf('__DSH_BOOT_READY__')
    expect(gateIndex).toBeGreaterThan(-1)
    expect(html.startsWith('<!doctype html><html><head><script>')).toBe(true)
    const scriptIndex = html.indexOf(`<script src="${SHELL_UI_SCRIPT_URL}"></script>`)
    expect(scriptIndex).toBeGreaterThan(-1)
    // Mount point: the shell-ui script is the last element before </body>.
    expect(html.slice(scriptIndex)).toBe(`<script src="${SHELL_UI_SCRIPT_URL}"></script></body></html>`)
    // Boot gate precedes any document content (head-first, upstream literal).
    expect(gateIndex).toBeLessThan(html.indexOf('<body>'))
  })

  it('serves index.html without the shell-ui script when no URL is given', async () => {
    const root = await makeWebRoot()
    const response = await serveWebDocument(new Request(`${SHELL_APP_ORIGIN}/index.html`), root)
    const html = await response.text()
    expect(html).toContain('__DSH_BOOT_READY__')
    expect(html).not.toContain('__dsh_forge_shell__')
  })

  it('serves /index.html for the root pathname and appends the script when </body> is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-forge-webroot-'))
    await writeFile(join(root, 'index.html'), '<html><head></head><body>x')
    const response = await serveWebDocument(new Request(`${SHELL_APP_ORIGIN}/`), root, { shellUiScriptUrl: SHELL_UI_SCRIPT_URL })
    const html = await response.text()
    expect(html.endsWith(`<script src="${SHELL_UI_SCRIPT_URL}"></script>`)).toBe(true)
  })

  it('serves plain assets untouched with the right mime type', async () => {
    const root = await makeWebRoot()
    await writeFile(join(root, 'assets', 'app.js'), 'console.log(1)')
    const response = await serveWebDocument(new Request(`${SHELL_APP_ORIGIN}/assets/app.js`), root)
    expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
    expect(await response.text()).toBe('console.log(1)')
  })

  it('rejects non-GET/HEAD with 405, missing files with 404, and traversal with 403', async () => {
    const root = await makeWebRoot()
    expect((await serveWebDocument(new Request(SHELL_APP_ORIGIN, { method: 'POST' }), root)).status).toBe(405)
    expect((await serveWebDocument(new Request(`${SHELL_APP_ORIGIN}/nope.js`), root)).status).toBe(404)
    const traversal = new Request(`${SHELL_APP_ORIGIN}/${encodeURIComponent('../../etc/passwd')}`)
    expect((await serveWebDocument(traversal, root)).status).toBe(403)
  })
})

describe('serveStaticFile (shell-ui asset)', () => {
  it('serves the shell-ui bootstrap as a classic script', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-forge-shellui-'))
    const file = join(dir, 'shell-ui.js')
    await writeFile(file, ';(function(){})()')
    const response = await serveStaticFile(new Request(`${SHELL_APP_ORIGIN}${SHELL_UI_SCRIPT_PATH}`), file)
    expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
    expect(await response.text()).toBe(';(function(){})()')
    expect((await serveStaticFile(new Request(`${SHELL_APP_ORIGIN}${SHELL_UI_SCRIPT_PATH}`), join(dir, 'missing.js'))).status).toBe(404)
  })
})

describe('authenticateWebHost', () => {
  it('returns the authority cookie from the 303 handshake', async () => {
    const fetchMock = vi.fn(async () => new Response(null, {
      status: 303,
      headers: { 'set-cookie': 'dsh-auth=abc123; Path=/; HttpOnly' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(authenticateWebHost('http://127.0.0.1:19387/x')).resolves.toBe('dsh-auth=abc123')
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:19387/x', { redirect: 'manual' })
  })

  it('rejects a non-303 response or a missing cookie', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('ok', { status: 200 })))
    await expect(authenticateWebHost('http://127.0.0.1:1/')).rejects.toThrow('authentication failed')
  })
})

describe('forwardWebRequest (API carriage, no listening port)', () => {
  it('rewrites the request onto the authenticated host with the cookie and strips page headers', async () => {
    const fetchMock = vi.fn(async (_target: URL, _init: RequestInit) => new Response('{"ok":1}', { headers: { 'content-type': 'application/json', 'set-cookie': 'leak=1' } }))
    vi.stubGlobal('fetch', fetchMock)
    const request = new Request(`${SHELL_APP_ORIGIN}/api/sessions?full=1`, {
      headers: { origin: SHELL_APP_ORIGIN, 'sec-fetch-site': 'same-site', 'x-custom': 'kept' },
    })
    const response = await forwardWebRequest(request, 'http://127.0.0.1:19387/', 'dsh-auth=abc123')
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('{"ok":1}')
    expect(response.headers.get('set-cookie')).toBeNull()
    const [target, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit]
    expect(target instanceof URL || typeof target === 'string').toBe(true)
    expect(String(target)).toBe('http://127.0.0.1:19387/api/sessions?full=1')
    const headers = init.headers as Headers
    expect(headers.get('cookie')).toBe('dsh-auth=abc123')
    expect(headers.get('origin')).toBeNull()
    expect(headers.get('sec-fetch-site')).toBeNull()
    expect(headers.get('x-custom')).toBe('kept')
  })

  it('rejects a foreign page origin with 403', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const request = new Request(`${SHELL_APP_ORIGIN}/api/x`, { headers: { origin: 'https://evil.example' } })
    const response = await forwardWebRequest(request, 'http://127.0.0.1:1/', 'c')
    expect(response.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('createProtocolCarriage (routing)', () => {
  const deps = { webRoot: 'C:/nowhere', shellUiAssetPath: 'C:/nowhere/shell-ui.js' }

  it('isWebAssetPathname matches the upstream routing table', () => {
    for (const pathname of ['/', '/index.html', '/assets/x.js', '/favicon.svg', '/manifest.webmanifest']) {
      expect(isWebAssetPathname(pathname)).toBe(true)
    }
    for (const pathname of ['/api/rpc', '/__dsh_forge_shell__.js', '/../etc']) {
      expect(isWebAssetPathname(pathname)).toBe(false)
    }
  })

  it('answers 404 for foreign hostnames and 503 for API routes before the host is bound', async () => {
    const carriage = createProtocolCarriage(deps)
    expect((await carriage.handle(new Request('dsh-app://evil/'))).status).toBe(404)
    expect((await carriage.handle(new Request(`${SHELL_APP_ORIGIN}/api/rpc`))).status).toBe(503)
  })

  it('bootPayload is undefined until setHost, then carries injections + streamBaseUrl', () => {
    const carriage = createProtocolCarriage(deps)
    expect(carriage.bootPayload()).toBeUndefined()
    carriage.setInjections([{ kind: 'script', line: 'x' }])
    carriage.setHost('http://127.0.0.1:19387/base', 'dsh-auth=t')
    expect(carriage.bootPayload()).toEqual({
      injections: [{ kind: 'script', line: 'x' }],
      streamBaseUrl: 'http://127.0.0.1:19387',
    })
    carriage.clearHost()
    expect(carriage.bootPayload()).toBeUndefined()
  })

  it('forwards API routes to the bound host', async () => {
    const carriage = createProtocolCarriage(deps)
    carriage.setHost('http://127.0.0.1:19387/', 'dsh-auth=t')
    const fetchMock = vi.fn(async (_target: URL, _init: RequestInit) => new Response('[]', { headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const response = await carriage.handle(new Request(`${SHELL_APP_ORIGIN}/api/sessions`))
    expect(response.status).toBe(200)
    expect(String(fetchMock.mock.calls[0]?.[0] as unknown)).toBe('http://127.0.0.1:19387/api/sessions')
  })
})

describe('shell fallback document (disc-1 blank-boot fix)', () => {
  it('serves the built-in fallback when the upstream web dist index is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-forge-fallback-')) // no index.html
    const carriage = createProtocolCarriage({ webRoot: root, shellUiAssetPath: 'C:/nowhere/shell-ui.js' })
    const response = await carriage.handle(new Request(`${SHELL_APP_ORIGIN}/`))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    const html = await response.text()
    // Shell-owned contract: mount point + same shell-ui bundle + resolved gate.
    expect(html).toContain('<div id="dsh-forge-shell-root"></div>')
    expect(html).toContain(`<script src="${SHELL_UI_SCRIPT_URL}"></script>`)
    expect(html).toContain('__DSH_BOOT_READY__.resolve()')
    // No upstream assets referenced (fallback must stand alone).
    expect(html).not.toContain('/assets/')
    // Non-index web assets still 404 (only the document falls back).
    expect((await carriage.handle(new Request(`${SHELL_APP_ORIGIN}/assets/app.js`))).status).toBe(404)
  })

  it('forceShellFallback latches the fallback for index pathnames even with a live dist', async () => {
    const root = await makeWebRoot()
    const carriage = createProtocolCarriage({ webRoot: root, shellUiAssetPath: 'C:/nowhere/shell-ui.js' })
    const before = await carriage.handle(new Request(`${SHELL_APP_ORIGIN}/`))
    expect(await before.text()).toBe(await serveWebDocument(new Request(`${SHELL_APP_ORIGIN}/`), root, { shellUiScriptUrl: SHELL_UI_SCRIPT_URL }).then(r => r.text()))
    carriage.forceShellFallback()
    const after = await carriage.handle(new Request(`${SHELL_APP_ORIGIN}/index.html`))
    expect(await after.text()).toContain('dsh-forge-shell-root')
    expect((await carriage.handle(new Request(`${SHELL_APP_ORIGIN}/`, { method: 'POST' }))).status).toBe(405)
  })

  it('normal path stays untouched: live dist serves the upstream index (not the fallback)', async () => {
    const root = await makeWebRoot()
    const carriage = createProtocolCarriage({ webRoot: root, shellUiAssetPath: 'C:/nowhere/shell-ui.js' })
    const html = await (await carriage.handle(new Request(`${SHELL_APP_ORIGIN}/`))).text()
    expect(html).toContain('<div id="root"></div>')
    expect(html).not.toContain('dsh-forge-shell-root')
  })
})
