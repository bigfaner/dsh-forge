// shell/boot 单测 —— boot manifest 消费的纯面（G1 第 1/2 项缝的 renderer 侧 pin）：
// 形状校验、carrier 推导、掌舵入图（追加语义 + 负样例）、宿主插件位发布（bug 2ffb0a82）。
// DOM/IPC 面由 e2e（web-shell.spec）覆盖。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bootShell, steerBootGraph, type ProductClientEntry } from './boot.js'
import { transportCarrierFor } from './carrier.js'
import { assertBootManifestShape, type BootManifestPayload, preloadBridge } from './bridge.js'

const manifest = (over: Partial<BootManifestPayload> = {}): BootManifestPayload => ({
  url: 'http://127.0.0.1:19500/',
  injections: [{ kind: 'global', name: '__DSH_BOOT__', value: { entries: [], batches: [] } }],
  ...over,
})

const product = (): ProductClientEntry => ({ id: '@dsh-forge/web-client', url: 'forge-client.js?rev=b1', rev: 'b1' })
const inputHistory = (): ProductClientEntry => ({
  id: '@dsh-forge/input-history',
  url: 'input-history-client.js?rev=b1',
  rev: 'b1',
  inject: ['@deepseek-ai/dsh-api-session-controller'],
})

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

describe('bootShell 宿主插件位发布（bug 2ffb0a82：manifest.knowledgePlugin → __DSH_FORGE_HOST_PLUGINS__ 页内缝）', () => {
  afterEach(() => {
    delete (globalThis as { dshForge?: unknown }).dshForge
    delete (globalThis as { __DSH_BOOT__?: unknown }).__DSH_BOOT__
    delete (globalThis as { __DSH_BOOT_READY__?: unknown }).__DSH_BOOT_READY__
    delete (globalThis as { __DSH_TRANSPORT__?: unknown }).__DSH_TRANSPORT__
    delete (globalThis as { __DSH_FORGE_HOST_PLUGINS__?: unknown }).__DSH_FORGE_HOST_PLUGINS__
  })
  it('多产品行逐条掌舵入图（本体 + input-history 插件行，行序 = 传入序）', async () => {
    ;(globalThis as { __DSH_BOOT__?: unknown }).__DSH_BOOT__ = { entries: [], batches: [] }
    ;(globalThis as { dshForge?: unknown }).dshForge = {
      getBootManifest: () => Promise.resolve(manifest()),
    }
    await bootShell([product(), inputHistory()])
    const g = (globalThis as { __DSH_BOOT__?: { entries: { id: string }[] } }).__DSH_BOOT__
    expect(g?.entries.map((r) => r.id)).toEqual(['@dsh-forge/web-client', '@dsh-forge/input-history'])
    expect(g?.entries[1]).toEqual({
      id: '@dsh-forge/input-history',
      url: 'input-history-client.js?rev=b1',
      rev: 'b1',
      inject: ['@deepseek-ai/dsh-api-session-controller'],
      immediately: true,
    })
  })
  it('产品行已在图（官方 plugin-manager 装载在场）→ 壳掌舵让位幂等跳过，官方行原样保留', async () => {
    // 官方行来源 = 官方花名册经 global 注入行写 __DSH_BOOT__（applyIndexInjections 落值）
    const officialRow = { id: '@dsh-forge/input-history', url: 'input-history-client.js?rev=official', rev: 'official', immediately: true }
    ;(globalThis as { __DSH_BOOT__?: unknown }).__DSH_BOOT__ = { entries: [], batches: [] }
    ;(globalThis as { dshForge?: unknown }).dshForge = {
      getBootManifest: () =>
        Promise.resolve(manifest({
          injections: [{ kind: 'global', name: '__DSH_BOOT__', value: { entries: [officialRow], batches: [] } }],
        })),
    }
    const warn: string[] = []
    const spy = vi.spyOn(console, 'warn').mockImplementation((line) => void warn.push(String(line)))
    try {
      await bootShell([product(), inputHistory()])
    } finally {
      spy.mockRestore()
    }
    const g = (globalThis as { __DSH_BOOT__?: { entries: { id: string }[]; batches: unknown[] } }).__DSH_BOOT__
    // 本体行照常掌舵；input-history 官方行原样保留（不追加壳行、不改写官方 url/rev）
    expect(g?.entries.map((r) => r.id)).toEqual(['@dsh-forge/input-history', '@dsh-forge/web-client'])
    expect(g?.entries[0]).toBe(officialRow)
    expect(g?.batches).toHaveLength(1) // 仅本体 application 批——壳未为 input-history 追加批
    expect(warn.some((line) => line.includes('@dsh-forge/input-history'))).toBe(true)
  })
  it('knowledgePlugin:true → { knowledge: true }；位缺席/旧宿主 → { knowledge: false }（fail-closed——知识面隐藏单源）', async () => {
    const boot = (manifestOver: Partial<BootManifestPayload>) => {
      ;(globalThis as { __DSH_BOOT__?: unknown }).__DSH_BOOT__ = { entries: [], batches: [] }
      ;(globalThis as { dshForge?: unknown }).dshForge = {
        getBootManifest: () => Promise.resolve(manifest(manifestOver)),
      }
      return bootShell([product()])
    }
    await boot({ knowledgePlugin: true })
    expect((globalThis as { __DSH_FORGE_HOST_PLUGINS__?: { knowledge: boolean } }).__DSH_FORGE_HOST_PLUGINS__).toEqual({ knowledge: true })
    await boot({})
    expect((globalThis as { __DSH_FORGE_HOST_PLUGINS__?: { knowledge: boolean } }).__DSH_FORGE_HOST_PLUGINS__).toEqual({ knowledge: false })
  })
})
