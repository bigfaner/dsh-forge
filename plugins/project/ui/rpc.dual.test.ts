// 双宿主化传输单测（plugin-project 1.33——connection.rpc.call 优先 + 自家 channels face
// 兜底 + 双缺席诚实降级 + 解析缝逐调用现查不缓存）。
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createForgeRpcClient,
  installOfficialRpcFace,
  officialRouteOf,
  preloadRpcClientFactory,
  RpcClientError,
} from './rpc.js'

/** 页内 dshForge 桥替身（自家 channels face） */
function stubBridge(): { invoke: ReturnType<typeof vi.fn>; restore: () => void } {
  const invoke = vi.fn(async () => ({ ok: true, data: [] }))
  ;(globalThis as { dshForge?: unknown }).dshForge = { invoke }
  return { invoke, restore: () => delete (globalThis as { dshForge?: unknown }).dshForge }
}

/** 官方 connection.rpc.call 替身（记录路由 + 按表回信） */
function stubOfficial(
  table: Record<string, unknown>,
): { face: { call: ReturnType<typeof vi.fn> }; calls: { channel: string; endpoint: string; payload: unknown }[] } {
  const calls: { channel: string; endpoint: string; payload: unknown }[] = []
  const call = vi.fn(async (channel: string, endpoint: string, payload?: unknown) => {
    calls.push({ channel, endpoint, payload })
    return table[`${channel}/${endpoint}`]
  })
  return { face: { call: call as unknown as (...args: unknown[]) => unknown }, calls }
}

afterEach(() => {
  delete (globalThis as { dshForge?: unknown }).dshForge
  installOfficialRpcFace(() => undefined)
})

describe('dualHostTransport（connection.rpc.call 优先 + channels face 兜底）', () => {
  it('官方 face 在场 → forge:projects/list 路由 /forge-projects + endpoint list；value → data 信封投影', async () => {
    const { face, calls } = stubOfficial({ '/forge-projects/list': { ok: true, value: [{ id: 'p1' }] } })
    installOfficialRpcFace(() => face as never)
    const client = preloadRpcClientFactory()
    const rows = await client.projects.list()
    expect(rows).toEqual([{ id: 'p1' }])
    expect(calls[0]).toEqual({ channel: '/forge-projects', endpoint: 'list', payload: undefined })
  })

  it('官方 error 信封 → RpcClientError（code 原样带出，details → data）', async () => {
    const { face } = stubOfficial({
      '/forge-projects/list': {
        ok: false,
        error: { code: 'ERR_ENTRY_NOT_FOUND', message: '未命中', details: { projectCount: 0 } },
      },
    })
    installOfficialRpcFace(() => face as never)
    const client = preloadRpcClientFactory()
    const err = await client.projects.list().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RpcClientError)
    expect((err as RpcClientError).code).toBe('ERR_ENTRY_NOT_FOUND')
    expect((err as RpcClientError).data).toEqual({ projectCount: 0 })
  })

  it('官方 face 缺席 → 自家 channels face 兜底（forge:projects/list 原名走 window.dshForge.invoke）', async () => {
    const bridge = stubBridge()
    const client = preloadRpcClientFactory()
    const rows = await client.projects.list()
    expect(rows).toEqual([])
    expect(bridge.invoke).toHaveBeenCalledWith('forge:projects/list', undefined)
    bridge.restore()
  })

  it('两面皆缺席 → 诚实降级（typed Error 含双面缺席 + diag 钩子留痕，不静默）', async () => {
    const diag = vi.fn()
    installOfficialRpcFace(() => undefined, diag)
    const client = preloadRpcClientFactory()
    const err = await client.projects.list().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toContain('window.dshForge.invoke 缺席')
    expect(diag).toHaveBeenCalledWith(expect.stringContaining('双宿主传输均缺席'))
  })

  it('解析缝逐调用现查不缓存：首调官方缺席退兜底，后续调用官方在场即走官方缝', async () => {
    installOfficialRpcFace(() => undefined)
    const bridge = stubBridge()
    const client = preloadRpcClientFactory()
    await client.projects.list()
    expect(bridge.invoke).toHaveBeenCalledTimes(1)
    const { face, calls } = stubOfficial({ '/forge-projects/list': { ok: true, value: [] } })
    installOfficialRpcFace(() => face as never)
    await client.projects.list()
    expect(calls).toHaveLength(1)
    expect(bridge.invoke).toHaveBeenCalledTimes(1)
    bridge.restore()
  })
})

describe('officialRouteOf（通道命名映射 pin）', () => {
  it('forge:‹family›/‹endpoint› → /forge-‹family› + endpoint（worktree ahead-behind 连字符端点保形）', () => {
    expect(officialRouteOf('forge:projects/list')).toEqual({ channel: '/forge-projects', endpoint: 'list' })
    expect(officialRouteOf('forge:worktree/ahead-behind')).toEqual({
      channel: '/forge-worktree',
      endpoint: 'ahead-behind',
    })
    expect(officialRouteOf('forge:bugs/list')).toEqual({ channel: '/forge-bugs', endpoint: 'list' })
  })

  it('非 forge 族通道 = undefined（不劫持他族通道）', () => {
    expect(officialRouteOf('dsh-forge:boot')).toBeUndefined()
    expect(officialRouteOf('nolist')).toBeUndefined()
  })
})
