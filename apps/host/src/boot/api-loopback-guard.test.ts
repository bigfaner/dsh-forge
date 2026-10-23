// 1.32 /api 非回环拦截单测（纯 handler——fake req/res，零真实 socket；mobile-ui/1.32）。
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import {
  API_LOOPBACK_GUARD_BODY,
  apiLoopbackGuardListener,
  isApiPath,
  isLoopbackHost,
  shouldBlockApiRequest,
} from './api-loopback-guard.js'

const fakeReq = (host: string | undefined, url: string): IncomingMessage =>
  ({ headers: host === undefined ? {} : { host }, url }) as unknown as IncomingMessage

const fakeRes = () => {
  const res = {
    statusCode: 0,
    headers: undefined as Record<string, unknown> | undefined,
    body: '',
    writeHead(code: number, headers?: Record<string, unknown>) {
      this.statusCode = code
      this.headers = headers
    },
    end(body?: string) {
      this.body = body ?? ''
    },
  }
  return res as unknown as ServerResponse & { statusCode: number; body: string; headers?: Record<string, unknown> }
}

describe('isLoopbackHost 回环 Host 判定', () => {
  it('回环形态：localhost / *.localhost / 127.x / ::1（含端口与方括号形态）/ 缺席 = true', () => {
    expect(isLoopbackHost('localhost')).toBe(true)
    expect(isLoopbackHost('localhost:19400')).toBe(true)
    expect(isLoopbackHost('sub.localhost')).toBe(true)
    expect(isLoopbackHost('127.0.0.1')).toBe(true)
    expect(isLoopbackHost('127.8.8.8:19400')).toBe(true)
    expect(isLoopbackHost('[::1]:19400')).toBe(true)
    expect(isLoopbackHost(undefined)).toBe(true)
    expect(isLoopbackHost('')).toBe(true)
  })

  it('非回环形态：LAN IP 字面量 / 域名 / 畸形 Host = false（fail-closed）', () => {
    expect(isLoopbackHost('192.168.1.7')).toBe(false)
    expect(isLoopbackHost('192.168.1.7:19400')).toBe(false)
    expect(isLoopbackHost('10.0.0.3')).toBe(false)
    expect(isLoopbackHost('desktop.example.com')).toBe(false)
    expect(isLoopbackHost('x.trycloudflare.com:443')).toBe(false)
    expect(isLoopbackHost('not a host')).toBe(false)
  })
})

describe('isApiPath /api 面判定', () => {
  it('/api 与 /api/… 命中；/api-evil、/__rpc、/remote、/、/pair 不命中', () => {
    expect(isApiPath('/api')).toBe(true)
    expect(isApiPath('/api/session/list')).toBe(true)
    expect(isApiPath('/api-evil')).toBe(false)
    expect(isApiPath('/remote/__rpc')).toBe(false)
    expect(isApiPath('/remote/')).toBe(false)
    expect(isApiPath('/pair')).toBe(false)
    expect(isApiPath('/')).toBe(false)
  })
})

describe('shouldBlockApiRequest 拦截判定（四形态验收矩阵）', () => {
  it('① 回环 /api → false（放行）；② LAN IP /api → true；③ 隧道域 /api → true；④ 非 /api 面（LAN IP）→ false', () => {
    expect(shouldBlockApiRequest('127.0.0.1:19400', '/api/session/list')).toBe(false)
    expect(shouldBlockApiRequest('192.168.1.7:19400', '/api/session/list')).toBe(true)
    expect(shouldBlockApiRequest('x.trycloudflare.com', '/api/session/list')).toBe(true)
    expect(shouldBlockApiRequest('192.168.1.7:19400', '/remote/')).toBe(false)
    expect(shouldBlockApiRequest('192.168.1.7:19400', '/pair')).toBe(false)
  })
})

describe('apiLoopbackGuardListener waterfall 监听器', () => {
  it('① 回环 /api → next() 放行（桌面 /api 零影响——不写响应）', async () => {
    const listener = apiLoopbackGuardListener()
    const res = fakeRes()
    const next = vi.fn(async () => {})
    await listener(fakeReq('localhost:19400', '/api/session/list'), res, next)
    expect(next).toHaveBeenCalledOnce()
    expect(res.statusCode).toBe(0)
  })

  it('②③ 非回环（LAN IP / 隧道域）/api → 恒定 403 + 恒定体，零 next()（无错误 oracle）', async () => {
    const listener = apiLoopbackGuardListener()
    for (const host of ['192.168.1.7:19400', 'x.trycloudflare.com']) {
      const res = fakeRes()
      const next = vi.fn(async () => {})
      await listener(fakeReq(host, '/api/session/list'), res, next)
      expect(next).not.toHaveBeenCalled()
      expect(res.statusCode).toBe(403)
      expect(res.body).toBe(API_LOOPBACK_GUARD_BODY)
      expect(res.headers).toEqual({ 'content-type': 'text/plain; charset=utf-8' })
    }
  })

  it('④ /__rpc、/remote、/pair 等非 /api 面 → next() 放行不受扰', async () => {
    const listener = apiLoopbackGuardListener()
    for (const url of ['/remote/__rpc', '/remote/', '/pair?token=t', '/__rvdiag?line=x']) {
      const res = fakeRes()
      const next = vi.fn(async () => {})
      await listener(fakeReq('192.168.1.7:19400', url), res, next)
      expect(next).toHaveBeenCalledOnce()
      expect(res.statusCode).toBe(0)
    }
  })

  it('拒绝诊断只经 onReject 回调（落 harness.log），不出响应面', async () => {
    const onReject = vi.fn()
    const listener = apiLoopbackGuardListener(onReject)
    const res = fakeRes()
    await listener(fakeReq('192.168.1.7', '/api/session/list'), res, async () => {})
    expect(onReject).toHaveBeenCalledOnce()
    expect(onReject.mock.calls[0]?.[0]).toContain('[api-guard]')
  })
})
