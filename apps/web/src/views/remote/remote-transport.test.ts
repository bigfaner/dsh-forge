// fix-25 传输缝单测：①传输选择单源（preload 优先 → fetch 兜底，禁组件内散判）；
// ②HTTP 传输走相对路径同源 POST /remote/__rpc（会话 cookie 同源自携）；
// ③回退判定校准（首请求竞态不回退——重试后仍失败才 unreachable）。
import { afterEach, describe, expect, it } from 'vitest'
import { REMOTE_CHANNELS } from '@dsh-forge/contracts'
import {
  REMOTE_HTTP_RPC_ENDPOINT,
  createHttpTransport,
  initialRemoteFaceState,
  remoteFacePhaseOf,
  resolveRemoteTransport,
  type DshForgeInvokeGlobal,
} from './remote-transport.js'

function fetchOk(envelope: unknown): typeof fetch {
  return (async () => new Response(JSON.stringify(envelope), { status: 200 })) as typeof fetch
}

afterEach(() => {
  delete (globalThis as { dshForge?: DshForgeInvokeGlobal }).dshForge
  delete (globalThis as { fetch?: unknown }).fetch
})

describe('resolveRemoteTransport 传输选择单源', () => {
  it('preload 桥在场 → preload 传输（桌面形态不变）', async () => {
    ;(globalThis as { dshForge?: DshForgeInvokeGlobal }).dshForge = { invoke: async (c: string) => ({ channel: c, via: 'preload' }) }
    const transport = resolveRemoteTransport()
    expect(transport).toBeDefined()
    expect((await transport?.('forge:remote/progress'))).toMatchObject({ via: 'preload' })
  })

  it('preload 缺席 → fetch 传输（手机形态——不返回 undefined 不炸单页）', async () => {
    ;(globalThis as { fetch?: unknown }).fetch = fetchOk({ ok: true, data: [] })
    const transport = resolveRemoteTransport()
    expect(transport).toBeDefined()
    expect(await transport?.(REMOTE_CHANNELS.progress)).toMatchObject({ ok: true })
  })

  it('注入传输最高优先（测试替身径）', async () => {
    const injected = async () => ({ via: 'injected' })
    ;(globalThis as { dshForge?: DshForgeInvokeGlobal }).dshForge = { invoke: async () => ({ via: 'preload' }) }
    expect(await resolveRemoteTransport(injected)?.('x')).toMatchObject({ via: 'injected' })
  })
})

describe('createHttpTransport', () => {
  it('POST 相对路径 /remote/__rpc + JSON {channel,payload}；信封原样透传', async () => {
    let seen: { url: string; init: RequestInit } | undefined
    ;(globalThis as { fetch?: unknown }).fetch = (async (url: string, init: RequestInit) => {
      seen = { url, init }
      return new Response(JSON.stringify({ ok: true, data: { tasks: [] } }), { status: 200 })
    }) as typeof fetch
    const transport = createHttpTransport()
    const out = (await transport(REMOTE_CHANNELS.progress, { projectId: 'p-1' })) as { ok: boolean }
    expect(out.ok).toBe(true)
    expect(seen?.url).toBe(REMOTE_HTTP_RPC_ENDPOINT)
    expect(seen?.init.method).toBe('POST')
    expect(JSON.parse(String(seen?.init.body))).toEqual({
      channel: REMOTE_CHANNELS.progress,
      payload: { projectId: 'p-1' },
    })
  })

  it('HTTP 401/403 → 抛错（信封失败——回退判据消费面）', async () => {
    ;(globalThis as { fetch?: unknown }).fetch = (async () => new Response('denied', { status: 401 })) as typeof fetch
    await expect(createHttpTransport()(REMOTE_CHANNELS.progress)).rejects.toThrow(/401/)
  })
})

describe('remoteFacePhaseOf 回退判定校准', () => {
  it('初始 = connecting（不立即回退引导页——首请求竞态不回退）', () => {
    expect(initialRemoteFaceState().phase).toBe('connecting')
  })

  it('首败仍在 connecting（调度重试——不回退）', () => {
    const next = remoteFacePhaseOf(initialRemoteFaceState(), 'fail')
    expect(next.phase).toBe('connecting')
  })

  it('重试仍失败 → unreachable（数据面不可达判据成立——才回退引导页）', () => {
    let state = remoteFacePhaseOf(initialRemoteFaceState(), 'fail')
    state = remoteFacePhaseOf(state, 'fail')
    expect(state.phase).toBe('unreachable')
  })

  it('成功 → ready；ready 期瞬时失败不回退（保持上次快照面）', () => {
    const ready = remoteFacePhaseOf(initialRemoteFaceState(), 'ok')
    expect(ready.phase).toBe('ready')
    expect(remoteFacePhaseOf(ready, 'fail').phase).toBe('ready')
  })

  it('unreachable 后成功可恢复（轮询重连径）', () => {
    let state = remoteFacePhaseOf(initialRemoteFaceState(), 'fail')
    state = remoteFacePhaseOf(state, 'fail')
    expect(remoteFacePhaseOf(state, 'ok').phase).toBe('ready')
  })
})
