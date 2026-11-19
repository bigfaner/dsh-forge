// selfProbeOf 单测（bug a99a7293 同族——官方 gateway 2.x invoke 请求必携 Peer）：
// ① owner Peer 形态（principal.kind = owner + AbortSignal）；② 探针结算即 dispose
// （lifetime signal aborted——零悬空 Peer）；③ gateway 缺席如实抛错（fail-soft 归注册面）。
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { loadOwnerPeerCtor, selfProbeOf } from '../../host/index.js'

describe('selfProbeOf（owner Peer 直探缝）', () => {
  it('invoke 请求携 owner Peer；结算后 Peer dispose（signal aborted）', async () => {
    const requests: unknown[] = []
    // 类形态桩（invoke 走原型链——receiver 解绑即红：bare extraction 调用丢 this）
    class GatewayStub {
      async invoke(request: unknown) {
        requests.push(request)
        return { ok: true }
      }
    }
    const ctx = new Context()
    ctx.provide('typertGateway', new GatewayStub() as never)
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

  it('workspace 解析面 owner Peer ctor 在场（官方 0.2.2-rc.2 导出面核销——Peer 具名导出）', async () => {
    const ctor = await loadOwnerPeerCtor()
    expect(ctor).toBeTypeOf('function')
  })

  it('官方导出面无 Peer → 探针降级错误（bug e4aa1a5f——宿主解析面 0.2.0-rc.2 仅 OperatorPeer，fail-soft 不炸 entry 装载）', async () => {
    class GatewayStub {
      async invoke() {
        return { ok: true }
      }
    }
    const ctx = new Context()
    ctx.provide('typertGateway', new GatewayStub() as never)
    const probe = selfProbeOf(ctx, { peerLoader: async () => undefined })
    await expect(probe('forgeTasks', 'list')).rejects.toThrow('Peer')
  })
})
