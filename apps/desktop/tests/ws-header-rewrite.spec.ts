import { describe, expect, it } from 'vitest'
import { SHELL_APP_ORIGIN } from '../src/main/protocol/constants.ts'
import { resolveWsHeaderRewrite } from '../src/main/protocol/ws-header-rewrite.ts'

const HOST_URL = 'http://127.0.0.1:19387'
const HOST_COOKIE = 'dsh-host-auth=secret'
const STREAM_URL = 'ws://127.0.0.1:19387/api/remote.mux'

function baseInput(overrides: Partial<Parameters<typeof resolveWsHeaderRewrite>[0]> = {}) {
  return {
    hostUrl: HOST_URL,
    hostCookie: HOST_COOKIE,
    shellWebContentsIds: new Set([7]),
    details: {
      url: STREAM_URL,
      webContentsId: 7,
      requestHeaders: { Origin: SHELL_APP_ORIGIN, 'Sec-Fetch-Site': 'cross-site' },
    },
    ...overrides,
  }
}

describe('resolveWsHeaderRewrite (upstream main.ts port)', () => {
  it('passes through when no host binding exists', () => {
    expect(resolveWsHeaderRewrite(baseInput({ hostUrl: undefined }))).toEqual({ passthrough: true })
    expect(resolveWsHeaderRewrite(baseInput({ hostCookie: undefined }))).toEqual({ passthrough: true })
  })

  it('passes through when the request is not from a shell-owned window', () => {
    expect(resolveWsHeaderRewrite(baseInput({ shellWebContentsIds: undefined }))).toEqual({ passthrough: true })
    expect(resolveWsHeaderRewrite(baseInput({ shellWebContentsIds: new Set<number>([]) }))).toEqual({ passthrough: true })
    expect(resolveWsHeaderRewrite(baseInput({ details: { ...baseInput().details, webContentsId: 42 } }))).toEqual({ passthrough: true })
    const noIdDetails = { ...baseInput().details, webContentsId: undefined }
    expect(resolveWsHeaderRewrite(baseInput({ details: noIdDetails }))).toEqual({ passthrough: true })
  })

  it('rewrites for a detached window registered in the shell webContents set (task 4.2 per-window registration)', () => {
    // 主窗 7 + detached 9 同集注册:两窗的 WS 流量同判,主窗行为不变。
    const result = resolveWsHeaderRewrite(baseInput({
      shellWebContentsIds: new Set([7, 9]),
      details: { url: STREAM_URL, webContentsId: 9, requestHeaders: { Origin: SHELL_APP_ORIGIN, 'Sec-Fetch-Site': 'cross-site' } },
    }))
    expect(result).toEqual({
      passthrough: false,
      cancel: false,
      requestHeaders: {
        origin: 'http://127.0.0.1:19387',
        'sec-fetch-site': 'same-origin',
        cookie: HOST_COOKIE,
      },
    })
  })

  it('passes through when the requested host differs from the host authority', () => {
    const input = baseInput({ details: { url: 'ws://127.0.0.1:9999/api/remote.mux', webContentsId: 7, requestHeaders: { Origin: SHELL_APP_ORIGIN } } })
    expect(resolveWsHeaderRewrite(input)).toEqual({ passthrough: true })
  })

  it('cancels when the origin is not the shell app origin', () => {
    const input = baseInput({ details: { url: STREAM_URL, webContentsId: 7, requestHeaders: { Origin: 'https://evil.example' } } })
    expect(resolveWsHeaderRewrite(input)).toEqual({ passthrough: false, cancel: true })
  })

  it('cancels when the origin header is missing', () => {
    const input = baseInput({ details: { url: STREAM_URL, webContentsId: 7, requestHeaders: {} } })
    expect(resolveWsHeaderRewrite(input)).toEqual({ passthrough: false, cancel: true })
  })

  it('rewrites origin, injects the host cookie and forces sec-fetch-site for shell-window traffic', () => {
    const result = resolveWsHeaderRewrite(baseInput())
    expect(result).toEqual({
      passthrough: false,
      cancel: false,
      requestHeaders: {
        origin: 'http://127.0.0.1:19387',
        'sec-fetch-site': 'same-origin',
        cookie: HOST_COOKIE,
      },
    })
  })

  it('lowercases all original header names before rewriting', () => {
    const input = baseInput({
      details: {
        url: STREAM_URL,
        webContentsId: 7,
        requestHeaders: { Origin: SHELL_APP_ORIGIN, 'User-Agent': 'electron', 'X-Mixed-Case': 'v' },
      },
    })
    const result = resolveWsHeaderRewrite(input)
    expect(result.passthrough).toBe(false)
    if (result.passthrough || result.cancel) throw new Error('unreachable')
    expect(Object.keys(result.requestHeaders).every(name => name === name.toLowerCase())).toBe(true)
    expect(result.requestHeaders['user-agent']).toBe('electron')
    expect(result.requestHeaders['x-mixed-case']).toBe('v')
  })
})
