// forge remote 传输单测（plugin-project 1.38——官方 Typert remote face 解析缝 + RemoteResult
// 信封投影 + 缺席诚实降级 + 解析缝逐调用现查不缓存；1.33 双宿主化传输随本批退役）。
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createForgeRpcClient,
  installForgeRemoteFace,
  RpcClientError,
  type ForgeRemoteFace,
} from './rpc.js'

/** 官方 ctx.remote 六族面替身（namespace 记录调用 + 按表回信 RemoteResult 信封） */
function stubRemoteFace(table: Record<string, (args: unknown[]) => unknown>): ForgeRemoteFace {
  const make = (ns: string): Record<string, unknown> =>
    new Proxy({}, {
      get(_t, method: string) {
        const key = `${ns}.${method}`
        if (table[key] === undefined) return undefined
        return (...args: unknown[]) => table[key](args)
      },
    })
  return {
    forgeProjects: make('forgeProjects') as ForgeRemoteFace['forgeProjects'],
    forgeFs: make('forgeFs') as ForgeRemoteFace['forgeFs'],
    forgeBugs: make('forgeBugs') as ForgeRemoteFace['forgeBugs'],
    forgeWorktree: make('forgeWorktree') as ForgeRemoteFace['forgeWorktree'],
    forgeProposals: make('forgeProposals') as ForgeRemoteFace['forgeProposals'],
    forgeFeatures: make('forgeFeatures') as ForgeRemoteFace['forgeFeatures'],
  }
}

afterEach(() => {
  installForgeRemoteFace(() => undefined)
})

describe('forge remote 传输（Typert RemoteResult 信封投影）', () => {
  it('face 在场 → forgeProjects.list 位置参直透；value → data 信封投影', async () => {
    const list = vi.fn(async () => ({ ok: true, value: [{ id: 'p1' }] }))
    installForgeRemoteFace(() =>
      stubRemoteFace({ 'forgeProjects.list': (args) => list(...args) }) as ForgeRemoteFace,
    )
    const client = createForgeRpcClient()
    const rows = await client.projects.list()
    expect(rows).toEqual([{ id: 'p1' }])
    expect(list).toHaveBeenCalledWith()
  })

  it('worktree.delete 调用 ns.delete（exportName 别名——host 半 remove 同端点）+ query 单参透传', async () => {
    const del = vi.fn(async () => ({ ok: true, value: { deleted: true } }))
    installForgeRemoteFace(() =>
      stubRemoteFace({ 'forgeWorktree.delete': (args) => del(...args) }) as ForgeRemoteFace,
    )
    const client = createForgeRpcClient()
    const result = await client.worktree.delete({ projectRoot: '/r', path: '/r/.forge/worktrees/wt' } as never)
    expect(result).toEqual({ deleted: true })
    expect(del).toHaveBeenCalledTimes(1)
  })

  it('failure 信封 → RpcClientError（code 原样带出，details → data）', async () => {
    installForgeRemoteFace(() =>
      stubRemoteFace({
        'forgeProjects.list': () => ({
          ok: false,
          error: { code: 'ERR_ENTRY_NOT_FOUND', message: '未命中', details: { projectCount: 0 } },
        }),
      }) as ForgeRemoteFace,
    )
    const client = createForgeRpcClient()
    const err = await client.projects.list().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RpcClientError)
    expect((err as RpcClientError).code).toBe('ERR_ENTRY_NOT_FOUND')
    expect((err as RpcClientError).data).toEqual({ projectCount: 0 })
  })

  it('face 缺席 → 诚实降级（typed Error + diag 钩子留痕，不静默）', async () => {
    const diag = vi.fn()
    installForgeRemoteFace(() => undefined, diag)
    const client = createForgeRpcClient()
    const err = await client.projects.list().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toContain('官方 forge remote 面缺席')
    expect((err as Error).message).toContain('forgeProjects.list')
    expect(diag).toHaveBeenCalledWith(expect.stringContaining('通道不可用'))
  })

  it('解析缝逐调用现查不缓存：首调缺席降级，装上 face 后同 client 即走 remote', async () => {
    installForgeRemoteFace(() => undefined)
    const client = createForgeRpcClient()
    await expect(client.projects.list()).rejects.toThrow('官方 forge remote 面缺席')
    let calls = 0
    installForgeRemoteFace(() =>
      stubRemoteFace({
        'forgeProjects.list': () => {
          calls += 1
          return { ok: true, value: [] }
        },
      }) as ForgeRemoteFace,
    )
    await client.projects.list()
    expect(calls).toBe(1)
  })

  it('followSeal 流帧直透（AsyncIterable——AC② 封存通知推流消费面）', async () => {
    async function* frames(): AsyncGenerator<unknown> {
      yield { isGit: true, sealed: false, binding: { worktreePath: '/w', branch: 'main' } }
      yield { isGit: true, sealed: true, binding: { worktreePath: '/w', branch: 'main' } }
    }
    const follow = vi.fn(() => frames())
    installForgeRemoteFace(() =>
      stubRemoteFace({ 'forgeWorktree.followSeal': (args) => follow(...args) }) as unknown as ForgeRemoteFace,
    )
    const client = createForgeRpcClient()
    const got: unknown[] = []
    for await (const frame of client.worktree.followSeal({ sessionId: 's-1' })) got.push(frame)
    expect(got).toHaveLength(2)
    expect((got[1] as { sealed: boolean }).sealed).toBe(true)
    expect(follow).toHaveBeenCalledWith({ sessionId: 's-1' })
  })
})
