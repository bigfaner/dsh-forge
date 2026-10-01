// 2.4 传输面——preload 桥读取（fail-loud）与转发。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { preloadTransport } from './transport.js'

const globalWithBridge = globalThis as { dshForge?: { invoke(channel: string, payload?: unknown): Promise<unknown> } }

afterEach(() => {
  delete globalWithBridge.dshForge
})

describe('preloadTransport', () => {
  it('window.dshForge.invoke 在场 → 通道/负载原样转发', async () => {
    const invoke = vi.fn().mockResolvedValue({ ok: true, data: [] })
    globalWithBridge.dshForge = { invoke }
    const transport = preloadTransport()
    await transport('forge:projects/list', undefined)
    expect(invoke).toHaveBeenCalledWith('forge:projects/list', undefined)
  })

  it('桥缺席 → fail-loud（装配断裂不静默）', () => {
    delete globalWithBridge.dshForge
    expect(() => preloadTransport()).toThrow(/window\.dshForge\.invoke 缺席/)
  })

  it('桥形状不对（无 invoke 函数）→ fail-loud', () => {
    globalWithBridge.dshForge = {} as { invoke: never }
    expect(() => preloadTransport()).toThrow(/缺席/)
  })
})
