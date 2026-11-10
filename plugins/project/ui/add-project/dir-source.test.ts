// 2.8 目录数据源封装单测 —— 相位映射（AC4：错误归一不出浏览器态）+ 缺省 RPC 真身
// （forge:fs/listDir 通道；非 Electron 载体收敛为错误相位，不炸壳）。
import { describe, expect, it, vi } from 'vitest'
import type { DirListing } from '@dsh-forge/contracts'
import { fetchDirListing, rpcDirSource } from './dir-source.js'

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

describe('rpcDirSource 缺省真身（preload RPC 面）', () => {
  it('经 window.dshForge.invoke 发 forge:fs/listDir（payload = { dirPath }）；typed 返回', async () => {
    const invoke = vi.fn(() => Promise.resolve({ ok: true, data: listing }))
    const g = globalThis as { dshForge?: unknown }
    const prev = g.dshForge
    g.dshForge = { invoke }
    try {
      const result = await rpcDirSource()('Z:\\project')
      expect(result).toBe(listing)
      expect(invoke).toHaveBeenCalledExactlyOnceWith('forge:fs/listDir', { dirPath: 'Z:\\project' })
      // 缺省主目录：dirPath undefined 透传（host 侧口径 = homedir）
      await rpcDirSource()()
      expect(invoke).toHaveBeenLastCalledWith('forge:fs/listDir', { dirPath: undefined })
    } finally {
      if (prev === undefined) delete g.dshForge
      else g.dshForge = prev
    }
  })

  it('preload 缺席（非 Electron 载体）→ 调用即拒（由 fetchDirListing 收敛为错误相位，不炸壳）', async () => {
    const g = globalThis as { dshForge?: unknown }
    const prev = g.dshForge
    delete g.dshForge
    try {
      const phase = await fetchDirListing(rpcDirSource())
      expect(phase.phase).toBe('error')
      if (phase.phase === 'error') expect(phase.message).toContain('window.dshForge.invoke 缺席')
    } finally {
      if (prev !== undefined) g.dshForge = prev
    }
  })
})
