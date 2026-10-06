// 4.3 派生数据源封装单测 —— Integration #1（RPC 单源下发 + 疑似移动拒绝路径）：
// fetchDerivePhase 相位映射（成功 ready 逐字 / ERR_SUSPECTED_MOVE → suspected-move
// （guidance 单源 core 载荷透传）/ 其余失败 → error 兜底——tech-design Propagation
// 「未映射码 → 通用错误条」永不裸 code 泄漏）+ 缺省 RPC 真身（forge:projects/
// deriveTaskStoreDir 通道；非 Electron 载体收敛为 error 相位，不炸壳）。
import { describe, expect, it, vi } from 'vitest'
import type { DeriveTaskStoreDirResult, SuspectedMoveData } from '@dsh-forge/contracts'
import { RpcClientError } from '../../rpc/index.js'
import { fetchDerivePhase, rpcDeriveSource } from './derive-source.js'

const DERIVED: DeriveTaskStoreDirResult = { dir: 'Z:\\forge-workspaces\\Z-project-dsh@a1b2c3d4' }

const MOVE_DATA: SuspectedMoveData = {
  existingDir: 'Z:\\forge-workspaces\\Z-project-dsh@e5f6a7b8',
  derivedDir: 'Z:\\forge-workspaces\\Z-project-dsh@a1b2c3d4',
  guidance:
    '疑似移动：本次推导目录 Z:\\forge-workspaces\\Z-project-dsh@a1b2c3d4，但同扁平化主体异 hash8 目录已在场。' +
    '请手工处置（认领对话框 = M3）。',
}

describe('fetchDerivePhase 相位映射（纯异步面——永不 reject）', () => {
  it('成功 → ready 相位（dir 逐字透传——SC2 断言锚：与实际建库位置逐字一致）', async () => {
    const source = vi.fn(() => Promise.resolve(DERIVED))
    await expect(fetchDerivePhase(source, 'Z:\\project\\dsh')).resolves.toEqual({
      state: 'ready',
      dir: DERIVED.dir,
    })
    expect(source).toHaveBeenCalledWith('Z:\\project\\dsh')
  })

  it('RpcClientError{ERR_SUSPECTED_MOVE} → suspected-move 相位（SuspectedMoveData 载荷原样透传）', async () => {
    const move = new RpcClientError({
      code: 'ERR_SUSPECTED_MOVE',
      message: '注册碰撞：同扁平化主体异 hash8',
      data: MOVE_DATA,
    })
    await expect(fetchDerivePhase(() => Promise.reject(move), 'Z:\\moved\\dsh')).resolves.toEqual({
      state: 'suspected-move',
      data: MOVE_DATA,
    })
  })

  it('ERR_SUSPECTED_MOVE 但 data 载荷畸形（guidance 缺席）→ error 兜底（不捏造指引文案）', async () => {
    const malformed = new RpcClientError({
      code: 'ERR_SUSPECTED_MOVE',
      message: '注册碰撞：同扁平化主体异 hash8',
      data: { existingDir: 'Z:\\x@0' },
    })
    const phase = await fetchDerivePhase(() => Promise.reject(malformed), 'Z:\\moved\\dsh')
    expect(phase.state).toBe('error')
    if (phase.state === 'error') expect(phase.message).toContain('注册碰撞')
  })

  it('其余 RpcClientError（未映射码）→ error 兜底（message 归一，永无裸 code 泄漏）', async () => {
    const unmapped = new RpcClientError({ code: 'ERR_TASK_NOT_FOUND', message: '任务未命中', data: null })
    await expect(fetchDerivePhase(() => Promise.reject(unmapped), 'Z:\\x')).resolves.toEqual({
      state: 'error',
      message: '任务未命中',
    })
  })

  it('普通异常 → error 相位（Error.message 归一；非 Error 字符串化）', async () => {
    await expect(fetchDerivePhase(() => Promise.reject(new Error('bridge 服务缺席')), 'Z:\\x')).resolves.toEqual(
      { state: 'error', message: 'bridge 服务缺席' },
    )
    await expect(fetchDerivePhase(() => Promise.reject('boom'), 'Z:\\x')).resolves.toEqual({
      state: 'error',
      message: 'boom',
    })
  })
})

describe('rpcDeriveSource 缺省真身（preload RPC 面）', () => {
  it('经 window.dshForge.invoke 发 forge:projects/deriveTaskStoreDir（payload = { workspaceDir }）；typed 返回', async () => {
    const invoke = vi.fn(() => Promise.resolve({ ok: true, data: DERIVED }))
    const g = globalThis as { dshForge?: unknown }
    const prev = g.dshForge
    g.dshForge = { invoke }
    try {
      const result = await rpcDeriveSource()('Z:\\project\\dsh')
      expect(result).toBe(DERIVED)
      expect(invoke).toHaveBeenCalledExactlyOnceWith('forge:projects/deriveTaskStoreDir', {
        workspaceDir: 'Z:\\project\\dsh',
      })
    } finally {
      if (prev === undefined) delete g.dshForge
      else g.dshForge = prev
    }
  })

  it('preload 缺席（非 Electron 载体）→ error 相位收敛（不炸壳）', async () => {
    const g = globalThis as { dshForge?: unknown }
    const prev = g.dshForge
    delete g.dshForge
    try {
      const phase = await fetchDerivePhase(rpcDeriveSource(), 'Z:\\project\\dsh')
      expect(phase.state).toBe('error')
      if (phase.state === 'error') expect(phase.message).toContain('window.dshForge.invoke 缺席')
    } finally {
      if (prev !== undefined) g.dshForge = prev
    }
  })
})
