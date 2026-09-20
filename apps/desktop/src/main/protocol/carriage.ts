// Protocol carriage: dsh-app:// request routing (SC7 foundation).
//
// Owns the mapping between the dsh-app://app/ origin and the two traffic
// classes defined by the tech design (Component Diagram: "dsh-app:// (资源 +
// API 流量)"):
//   1. Web assets  — served from the web frontend dist with the injection
//                    pipeline applied (boot gate + shell-ui body-tail script).
//   2. API traffic — forwarded verbatim to the authenticated upstream Host
//                    URL inherited through the host-protocol/wire seam
//                    (ready.url from the vendored desktop-host handshake).
// The shell itself opens no listening port; the Host is reached as a client.

import { forwardWebRequest, serveStaticFile, serveWebDocument } from './web-document.ts'
import { serveShellFallback } from './shell-fallback.ts'
import { SHELL_UI_SCRIPT_PATH, SHELL_UI_SCRIPT_URL } from './constants.ts'

/** Pathnames served from the web frontend dist (upstream routing table). */
const WEB_ASSET_INDEX_PATHNAMES = ['/', '/index.html']
const WEB_ASSET_PREFIXES = ['/assets/']
const WEB_ASSET_EXTRA_PATHNAMES = ['/favicon.svg', '/manifest.webmanifest']

export function isWebAssetPathname(pathname: string): boolean {
  return WEB_ASSET_INDEX_PATHNAMES.includes(pathname)
    || WEB_ASSET_PREFIXES.some(prefix => pathname.startsWith(prefix))
    || WEB_ASSET_EXTRA_PATHNAMES.includes(pathname)
}

export interface ProtocolCarriageDeps {
  /** Web frontend dist directory (upstream SPA static root). */
  readonly webRoot: string
  /** Absolute path of the compiled shell-ui bootstrap script. */
  readonly shellUiAssetPath: string
}

/** Boot payload returned to the renderer over the boot IPC channel. */
export interface ShellBootPayload {
  readonly injections: readonly unknown[]
  readonly streamBaseUrl: string
}

export interface ProtocolCarriage {
  /** dsh-app:// request handler (wired into protocol.handle by the shell). */
  handle(request: Request): Promise<Response>
  /** Bind the carriage to an authenticated upstream Host. */
  setHost(url: string, cookie: string): void
  /** Drop the Host binding (host exit / restart); API routes answer 503 again. */
  clearHost(): void
  /** Replace the Host-provided boot injections. */
  setInjections(injections: readonly unknown[]): void
  /** Boot IPC payload; undefined until a Host URL is bound. */
  bootPayload(): ShellBootPayload | undefined
  /**
   * Latch the built-in shell fallback document for index pathnames (terminal
   * host-failure state): the upstream SPA can no longer boot, so dsh-app://
   * serves the shell-owned document with the shell-ui mount point instead.
   */
  forceShellFallback(): void
}

export function createProtocolCarriage(deps: ProtocolCarriageDeps): ProtocolCarriage {
  let hostUrl: string | undefined
  let hostCookie: string | undefined
  let injections: readonly unknown[] = []
  let fallbackForced = false

  const serveIndex = async (request: Request): Promise<Response> => {
    if (fallbackForced) return serveShellFallback(request, SHELL_UI_SCRIPT_URL)
    const response = await serveWebDocument(request, deps.webRoot, { shellUiScriptUrl: SHELL_UI_SCRIPT_URL })
    // disc-1: a missing upstream web dist (index 404) must never leave the
    // window on an empty document — serve the built-in shell fallback so the
    // shell-ui overlay and UF4 recovery dialog can mount.
    if (response.status === 404) return serveShellFallback(request, SHELL_UI_SCRIPT_URL)
    return response
  }

  return {
    async handle(request: Request): Promise<Response> {
      const url = new URL(request.url)
      if (url.hostname !== 'app') return new Response(null, { status: 404 })
      if (url.pathname === SHELL_UI_SCRIPT_PATH) {
        return serveStaticFile(request, deps.shellUiAssetPath)
      }
      if (WEB_ASSET_INDEX_PATHNAMES.includes(url.pathname)) {
        return serveIndex(request)
      }
      if (isWebAssetPathname(url.pathname)) {
        return serveWebDocument(request, deps.webRoot, { shellUiScriptUrl: SHELL_UI_SCRIPT_URL })
      }
      if (hostUrl === undefined || hostCookie === undefined) {
        return new Response(null, { status: 503 })
      }
      return forwardWebRequest(request, hostUrl, hostCookie)
    },
    setHost(url: string, cookie: string): void {
      hostUrl = url
      hostCookie = cookie
    },
    clearHost(): void {
      hostUrl = undefined
      hostCookie = undefined
    },
    setInjections(next: readonly unknown[]): void {
      injections = next
    },
    bootPayload(): ShellBootPayload | undefined {
      if (hostUrl === undefined) return undefined
      return { injections, streamBaseUrl: new URL(hostUrl).origin }
    },
    forceShellFallback(): void {
      fallbackForced = true
    },
  }
}
