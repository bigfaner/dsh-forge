// 3.3 单测 —— AC1 产品自建进程内事件总线：信封 {ts,sessionId,slug,type,payload}
// 恒全（emit 入口守卫 fail-loud）+ 订阅面（订阅序送达/退订器/订阅方异常隔离——
// events.ts 桥推送同纪律）。零上游 import 面由 boundaries.test.ts pin（deps 恒
// contracts + path-key），此处不重复。
import { describe, expect, it, vi } from 'vitest'
import type { ForgePluginEvent } from '@dsh-forge/contracts'
import { assertForgeEventEnvelope, createForgeEventBus } from './bus.js'

/** 合法事件基线（no-ready-task 最小载荷）；overrides 覆盖单字段构造非法变体
 *  （守卫单测面 = 运行期任意输入，故整对象单点 cast——基线本身恒合法） */
function ev(overrides: Record<string, unknown> = {}): ForgePluginEvent {
  return {
    ts: 1_760_000_000_000,
    sessionId: 'sess-1',
    slug: 'ctx-slug',
    type: 'no-ready-task',
    payload: {},
    ...overrides,
  } as ForgePluginEvent
}

describe('assertForgeEventEnvelope（信封恒全守卫——AC1）', () => {
  it('合法信封通过（五字段齐备）', () => {
    expect(() => assertForgeEventEnvelope(ev())).not.toThrow()
  })

  it.each([
    ['ts 非数字', ev({ ts: '1760000000000' })],
    ['ts 非有限数', ev({ ts: Number.NaN })],
    ['sessionId 空串', ev({ sessionId: '' })],
    ['sessionId 非字符串', ev({ sessionId: 7 })],
    ['slug 空串', ev({ slug: '' })],
    ['type 越出七事件全集', ev({ type: 'unknown-verb' })],
    ['payload null', ev({ payload: null })],
  ])('%s → TypeError（装配 bug fail-loud）', (_name, event) => {
    expect(() => assertForgeEventEnvelope(event)).toThrow(TypeError)
  })

  it('拒绝信息聚合（一处不完整逐项列出）', () => {
    expect(() => assertForgeEventEnvelope(ev({ sessionId: '', slug: '' }))).toThrow(/sessionId.*slug|slug.*sessionId/)
  })
})

describe('createForgeEventBus（emit/subscribe 订阅面）', () => {
  it('emit 同步按订阅序送达；退订器移除后不再收', () => {
    const bus = createForgeEventBus()
    const order: string[] = []
    const offA = bus.on(() => order.push('a'))
    bus.on(() => order.push('b'))
    bus.emit(ev())
    expect(order).toEqual(['a', 'b'])
    offA()
    bus.emit(ev({ sessionId: 'sess-2' }))
    expect(order).toEqual(['a', 'b', 'b'])
  })

  it('同一 handler 重复订阅只送达一次（Set 去重）', () => {
    const bus = createForgeEventBus()
    const handler = vi.fn()
    const off1 = bus.on(handler)
    bus.on(handler)
    bus.emit(ev())
    expect(handler).toHaveBeenCalledTimes(1)
    off1()
    bus.emit(ev())
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('订阅方抛错隔离：先订阅者抛错不阻断其余订阅；emit 不抛（发射永不拖垮工具闭包）', () => {
    const bus = createForgeEventBus()
    const good = vi.fn()
    bus.on(() => {
      throw new Error('listener boom')
    })
    bus.on(good)
    expect(() => bus.emit(ev())).not.toThrow()
    expect(good).toHaveBeenCalledTimes(1)
  })

  it('emit 入口先守卫后分发：不完整信封零送达', () => {
    const bus = createForgeEventBus()
    const handler = vi.fn()
    bus.on(handler)
    expect(() => bus.emit(ev({ slug: '' }))).toThrow(TypeError)
    expect(handler).not.toHaveBeenCalled()
  })

  it('两总线实例订阅表隔离（装配单例语义）', () => {
    const bus1 = createForgeEventBus()
    const bus2 = createForgeEventBus()
    const handler = vi.fn()
    bus1.on(handler)
    bus2.emit(ev())
    expect(handler).not.toHaveBeenCalled()
    bus1.emit(ev())
    expect(handler).toHaveBeenCalledTimes(1)
  })
})
