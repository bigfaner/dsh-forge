// selfProbeOf 单测（bug a99a7293 同族——官方 gateway 2.x invoke 请求必携 Peer）：
// ① owner Peer 形态（principal.kind = owner + AbortSignal）；② 探针结算即 dispose
// （lifetime signal aborted——零悬空 Peer）；③ gateway 缺席如实抛错（fail-soft 归注册面）。
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { selfProbeOf } from '../../host/index.js'

describe('selfProbeOf（owner Peer 直探缝）', () => {
  it('invoke 请求携 owner Peer；结算后 Peer dispose（signal aborted）', async () => {
    const requests: unknown[] = []
    const ctx = new Context()
    ctx.provide('typertGateway', {
      invoke: async (request: unknown) => {
        requests.push(request)
        return { ok: true }
      },
    } as never)
    const probe = selfProbeOf(ctx)
    await expect(probe('forgeTasks', 'list', { projectId: '' })).resolves.toEqual({ ok: true })
    expect(requests).toHaveLength(1)
    const req = requests[0] as {
      namespace: string
      method: string
      args: Record<string, unknown>
      peer: { principal: { kind: string }; signal: AbortSignal }
    }
    expect(req.namespace).toBe('forgeTasks')
    expect(req.method).toBe('list')
    expect(req.args).toEqual({ projectId: '' })
    expect(req.peer.principal.kind).toBe('owner')
    expect(req.peer.signal).toBeInstanceOf(AbortSignal)
    await vi.waitFor(() => expect(req.peer.signal.aborted).toBe(true))
  })

  it('gateway 缺席 → 缺席错误', async () => {
    const probe = selfProbeOf(new Context())
    await expect(probe('forgeTasks', 'list')).rejects.toThrow('typertGateway 服务缺席')
  })
})
