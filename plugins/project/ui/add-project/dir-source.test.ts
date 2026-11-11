// 2.8 目录数据源封装单测 —— 相位映射（AC4：错误归一不出浏览器态）+ 缺省 RPC 真身
// （1.38 正典化——官方 forgeFs.listDir Typert remote 面；face 缺席收敛为错误相位，不炸壳）。
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DirListing } from '@dsh-forge/contracts'
import { fetchDirListing, rpcDirSource } from './dir-source.js'
import { installForgeRemoteFace, type ForgeRemoteFace } from '../rpc.js'

const listing: DirListing = {
  path: 'Z:\\project',
  parentPath: 'Z:\\',
  entries: [{ name: 'dsh', path: 'Z:\\project\\dsh' }],
}

describe('fetchDirListing 相位映射（纯异步面——永不 reject）', () => {
  it('成功 → ready 相位（listing 原样）', async () => {
    const source = vi.fn(() => Promise.resolve(listing))
    await expect(fetchDirListing(source, 'Z:\\project')).resolves.toEqual({
      phase: 'ready',
      listing,
    })
    expect(source).toHaveBeenCalledWith('Z:\\project')
  })

  it('缺省目标透传（undefined = 主目录起始请求）', async () => {
    const source = vi.fn(() => Promise.resolve(listing))
    await fetchDirListing(source)
    expect(source).toHaveBeenCalledWith(undefined)
  })

  it('失败 → error 相位（AC4 拦截数据源：Error.message 归一；非 Error 字符串化）', async () => {
    await expect(
      fetchDirListing(() => Promise.reject(new Error('目录不可达：Z:\\gone（ENOENT）')), 'Z:\\gone'),
    ).resolves.toEqual({ phase: 'error', message: '目录不可达：Z:\\gone（ENOENT）' })
    await expect(fetchDirListing(() => Promise.reject('boom'))).resolves.toEqual({
      phase: 'error',
      message: 'boom',
    })
  })
})

describe('rpcDirSource 缺省真身（官方 forgeFs.listDir Typert remote 面——1.38）', () => {
  /** 六族面替身（只装 forgeFs.listDir 记录缝） */
  function installFace(listDir: (args: unknown[]) => unknown): void {
    const ns = new Proxy({}, {
      get(_t, method: string) {
        if (method !== 'listDir') return undefined
        return (...args: unknown[]) => listDir(args)
      },
    })
    installForgeRemoteFace(() =>
      ({
        forgeProjects: {}, forgeBugs: {}, forgeWorktree: {}, forgeProposals: {}, forgeFeatures: {},
        forgeFs: ns,
      }) as unknown as ForgeRemoteFace,
    )
  }

  afterEach(() => {
    installForgeRemoteFace(() => undefined)
  })

  it('经 forgeFs.listDir 发 dirPath 位置参；RemoteResult → typed 返回', async () => {
    const listDir = vi.fn(() => Promise.resolve({ ok: true, value: listing }))
    installFace((args) => listDir(...(args as [])))
    const result = await rpcDirSource()('Z:\\project')
    expect(result).toBe(listing)
    expect(listDir).toHaveBeenCalledExactlyOnceWith('Z:\\project')
    // 缺省主目录：dirPath undefined 透传（host 侧口径 = homedir）
    await rpcDirSource()()
    expect(listDir).toHaveBeenLastCalledWith(undefined)
  })

  it('face 缺席（宿主形状漂移）→ 调用即拒（由 fetchDirListing 收敛为错误相位，不炸壳）', async () => {
    installForgeRemoteFace(() => undefined)
    const phase = await fetchDirListing(rpcDirSource())
    expect(phase.phase).toBe('error')
    if (phase.phase === 'error') expect(phase.message).toContain('官方 forge remote 面缺席')
  })
})
