// Web document serving + authenticated Host forwarding over dsh-app://.
//
// Logic inherited from the upstream desktop shell (apps/desktop/src/web-document.ts
// of deepseek-harness, pinned SHA c36ba648) with one extension: the served
// index.html additionally receives the shell-ui bootstrap <script> appended at
// the end of <body> — after the upstream injection sequence — so the overlay
// mounts at document.body end (tech-design Integration Specs insertion point).

import { readFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { SHELL_APP_ORIGIN } from './constants.ts'

const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

/**
 * Head-first boot gate injected into index.html (upstream literal): the
 * upstream web entry resolves it after applying Host boot injections.
 */
const BOOT_GATE_SCRIPT = '<script>globalThis.__DSH_BOOT_READY__ = Promise.withResolvers()</script>'

/** Static-file response options. */
export interface ServeWebDocumentOptions {
  /**
   * Absolute URL of the shell-ui bootstrap script appended at the end of
   * <body> (mount point: document.body tail; upstream injection sequence
   * runs first because it precedes this node in document order).
   */
  readonly shellUiScriptUrl?: string
}

function staticResponse(request: Request, body: Buffer, pathnameTarget: string): Response {
  return new Response(request.method === 'HEAD' ? null : new Uint8Array(body), {
    headers: { 'content-type': MIME[extname(pathnameTarget)] ?? 'application/octet-stream' },
  })
}

/**
 * Read an application-owned static asset; the index additionally receives the
 * boot gate (head, first) and the shell-ui bootstrap script (body, last).
 * @param request - Local application request.
 * @param root - Web frontend dist directory.
 * @param options - Injection pipeline options.
 * @returns Static response, or a missing/invalid path response.
 */
export async function serveWebDocument(request: Request, root: string, options: ServeWebDocumentOptions = {}): Promise<Response> {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 })
  const url = new URL(request.url)
  let pathname: string
  try { pathname = decodeURIComponent(url.pathname) } catch { return new Response(null, { status: 400 }) }
  const target = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname))
  const directory = resolve(root)
  if (!target.startsWith(directory + sep)) return new Response(null, { status: 403 })
  let body: Buffer
  try {
    body = await readFile(target)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Response(null, { status: 404 })
    throw error
  }
  const isIndex = pathname === '/' || pathname === '/index.html'
  if (!isIndex) return staticResponse(request, body, target)
  let html = body.toString().replace('<head>', `<head>${BOOT_GATE_SCRIPT}`)
  if (options.shellUiScriptUrl !== undefined) {
    const script = `<script src="${options.shellUiScriptUrl}"></script>`
    html = html.includes('</body>') ? html.replace('</body>', `${script}</body>`) : html + script
  }
  return new Response(request.method === 'HEAD' ? null : html, {
    headers: { 'content-type': MIME['.html'] as string },
  })
}

/**
 * Serve a single shell-owned static file inside the dsh-app:// origin
 * (used for the shell-ui bootstrap script).
 * @param request - Local application request.
 * @param file - Absolute path of the asset file.
 */
export async function serveStaticFile(request: Request, file: string): Promise<Response> {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 })
  let body: Buffer
  try {
    body = await readFile(file)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Response(null, { status: 404 })
    throw error
  }
  return staticResponse(request, body, file)
}

/**
 * Exchange the Host launch URL for an authority-bound browser cookie.
 * @param url - Authenticated URL reported by the owned Host process.
 * @returns Cookie header for requests forwarded to that Host.
 */
export async function authenticateWebHost(url: string): Promise<string> {
  const response = await fetch(url, { redirect: 'manual' })
  const cookie = response.headers.get('set-cookie')
  await response.body?.cancel()
  if (response.status !== 303 || cookie === null) throw new Error('Desktop Host authentication failed')
  const end = cookie.indexOf(';')
  return end < 0 ? cookie : cookie.slice(0, end)
}

/**
 * Forward local application requests to its authenticated Host, preserving
 * streaming and cancellation. The shell itself opens no listening port.
 * @param request - Request from the application origin.
 * @param host - Owned Host URL.
 * @param cookie - Host-issued authentication cookie.
 * @returns Host response without network-only encoding headers.
 */
export async function forwardWebRequest(request: Request, host: string, cookie: string): Promise<Response> {
  const source = new URL(request.url)
  const origin = request.headers.get('origin')
  if (origin !== null && origin !== SHELL_APP_ORIGIN) return new Response(null, { status: 403 })
  const target = new URL(host)
  target.pathname = source.pathname
  target.search = source.search
  const headers = new Headers(request.headers)
  for (const name of ['host', 'origin', 'cookie', 'sec-fetch-site']) headers.delete(name)
  headers.set('cookie', cookie)
  const init = { method: request.method, headers, body: request.body, signal: request.signal, duplex: 'half', redirect: 'manual' as const }
  const response = await fetch(target, init)
  const outgoing = new Headers(response.headers)
  for (const name of ['content-encoding', 'content-length', 'set-cookie']) outgoing.delete(name)
  return new Response(response.body, { status: response.status, headers: outgoing })
}
