// WebSocket header-rewrite decision logic (ported from upstream
// apps/desktop/src/main.ts onBeforeSendHeaders, lines ~431-442).
//
// The renderer's stream client opens a DIRECT WebSocket to the Host
// (ws://127.0.0.1:19387/api/remote.mux, streamBaseUrl = host origin from the
// boot payload). The Host's Origin fence rejects that request: the
// dsh-app://app origin is not the host authority (403) and the
// authority-bound SameSite=Strict cookie is not attached cross-site (401).
// The shell main process therefore rewrites those WS request headers before
// they leave the session: origin → host origin, cookie → host cookie,
// sec-fetch-site → same-origin. Anything that is not exactly the main window
// speaking for dsh-app://app toward the bound host authority is left alone
// (or cancelled for a foreign origin claiming our scheme).

import { SHELL_APP_ORIGIN } from './constants.ts'

/** URL pattern for the webRequest filter (host binds 127.0.0.1, upstream precedent). */
export const WS_REWRITE_URL_FILTER = { urls: ['ws://127.0.0.1/*'] } as const

/** Inputs the decision needs from the shell wiring. */
export interface WsHeaderRewriteInput {
  /** Bound host URL (ready.url) — undefined while no host is bound. */
  readonly hostUrl: string | undefined
  /** Host authority cookie — undefined while no host is bound. */
  readonly hostCookie: string | undefined
  /** webContents id of the primary window (undefined when no window exists). */
  readonly mainWebContentsId: number | undefined
  /** Request details as delivered by webRequest.onBeforeSendHeaders. */
  readonly details: {
    readonly url: string
    readonly webContentsId: number | undefined
    readonly requestHeaders: Record<string, string>
  }
}

/** Decision result handed to the onBeforeSendHeaders callback. */
export type WsHeaderRewriteResult =
  | { readonly passthrough: true }
  | { readonly passthrough: false; readonly cancel: true }
  | { readonly passthrough: false; readonly cancel: false; readonly requestHeaders: Record<string, string> }

export function resolveWsHeaderRewrite(input: WsHeaderRewriteInput): WsHeaderRewriteResult {
  const { hostUrl, hostCookie, mainWebContentsId, details } = input
  if (hostUrl === undefined || hostCookie === undefined) return { passthrough: true }
  if (mainWebContentsId === undefined || details.webContentsId !== mainWebContentsId) {
    return { passthrough: true }
  }
  const target = new URL(hostUrl)
  const requested = new URL(details.url)
  if (requested.host !== target.host) return { passthrough: true }
  const headers = Object.fromEntries(
    Object.entries(details.requestHeaders).map(([name, value]) => [name.toLowerCase(), value] as const),
  )
  if (headers.origin !== SHELL_APP_ORIGIN) return { passthrough: false, cancel: true }
  return {
    passthrough: false,
    cancel: false,
    requestHeaders: {
      ...headers,
      origin: target.origin,
      cookie: hostCookie,
      'sec-fetch-site': 'same-origin',
    },
  }
}
