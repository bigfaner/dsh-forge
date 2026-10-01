// shell/boot 单测 —— boot manifest 消费的纯面（G1 第 1/2 项缝的 renderer 侧 pin）：
// 形状校验、carrier 推导、掌舵入图（追加语义 + 负样例）。DOM/IPC 面由 e2e（web-shell.spec）覆盖。
import { afterEach, describe, expect, it } from 'vitest'
import { steerBootGraph, type ProductClientEntry } from './boot.js'
import { transportCarrierFor } from './carrier.js'
import { assertBootManifestShape, type BootManifestPayload, preloadBridge } from './bridge.js'

const manifest = (over: Partial<BootManifestPayload> = {}): BootManifestPayload => ({
  url: 'http://127.0.0.1:19500/',
  injections: [{ kind: 'global', name: '__DSH_BOOT__', value: { entries: [], batches: [] } }],
  ...over,
})

const product = (): ProductClientEntry => ({ id: '@dsh-forge/web-client', url: 'forge-client.js?rev=b1', rev: 'b1' })

const graph = () => ({
  entries: [{ id: '@deepseek-ai/dsh-client-ui-theme', url: 'plugins/x?rev=r1', rev: 'r1', immediately: true }],
  batches: [{ phase: 'bootstrap' as const, url: 'plugins/b0?rev=r0', rev: 'r0', entries: ['@deepseek-ai/dsh-client-modules'] }],
})

describe('boot manifest 形状校验（与 host buildBootManifest 同律）', () => {
  it('合法形状原样通过', () => {
    const payload = manifest()
    expect(assertBootManifestShape(payload)).toBe(payload)
  })
  it('url 非 http(s) / injections 非数组即拒（fail-loud）', () => {
    expect(() => assertBootManifestShape(manifest({ url: 'file:///x' }))).toThrow(/url/)
    expect(() => assertBootManifestShape({ url: 'http://127.0.0.1:1/', injections: null as unknown as readonly unknown[] })).toThrow(/injections/)
  })
})

describe('carrier 推导（G1 第 2 项：__DSH_TRANSPORT__ 形状）', () => {
  it('ownsHost=true + streamBaseUrl=已认证 URL origin', () => {
    expect(transportCarrierFor('http://127.0.0.1:19500/?token=v1.abc')).toEqual({
      ownsHost: true,
      streamBaseUrl: 'http://127.0.0.1:19500',
    })
  })
})

describe('steerBootGraph 掌舵入图（产品 client 插件行追加）', () => {
  it('追加 entry（immediately 预取 + 零 inject）与独立 application 批；宿主行原序不动', () => {
    const g = graph()
    const out = steerBootGraph(g, product())
    expect(out).toBe(g) // 原位变更（global 即线上形状）
    expect(g.entries.map((r) => r.id)).toEqual(['@deepseek-ai/dsh-client-ui-theme', '@dsh-forge/web-client'])
    expect(g.entries[1]).toEqual({ id: '@dsh-forge/web-client', url: 'forge-client.js?rev=b1', rev: 'b1', inject: [], immediately: true })
    expect(g.batches[1]).toEqual({ phase: 'application', url: 'forge-client.js?rev=b1', rev: 'b1', entries: ['@dsh-forge/web-client'] })
  })
  it('图缺席/形状非法即拒（global 行未生效 = 装配断裂）', () => {
    expect(() => steerBootGraph(undefined, product())).toThrow(/__DSH_BOOT__/)
    expect(() => steerBootGraph({ entries: [] }, product())).toThrow(/形状非法/)
  })
  it('重复掌舵（id 或批 url 已在图）即拒', () => {
    const g = steerBootGraph(graph(), product())
    expect(() => steerBootGraph(g, product())).toThrow(/重复掌舵/)
  })
})

describe('preload 桥 fail-loud', () => {
  afterEach(() => {
    delete (globalThis as { dshForge?: unknown }).dshForge
  })
  it('window.dshForge 缺席即抛（host preload 未接入）', () => {
    expect(() => preloadBridge()).toThrow(/getBootManifest/)
  })
})
