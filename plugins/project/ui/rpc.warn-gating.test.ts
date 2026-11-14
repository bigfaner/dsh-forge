// 消费面 warn 门控钉（fix-2 竞速分类钉）：contribution mount 终态前的面缺席属装配时序
// 竞速窗口——typed Error 照抛（调用方降级语义不变），console 诊断静默；mount 终态后
// （FORGE_REMOTE_MOUNT_SETTLED_ANCHOR_KEY 在场 / face 解析缝锚在场）的真缺席保持诚实
// diag/warn（AGENTS §7 可观测性——mount 后静默缺席不可接受）。
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createForgeRpcClient,
  FORGE_REMOTE_FACE_ANCHOR_KEY,
  FORGE_REMOTE_MOUNT_SETTLED_ANCHOR_KEY,
  markForgeRemoteMountSettled,
} from './rpc.js'

afterEach(() => {
  delete (globalThis as Record<string, unknown>)[FORGE_REMOTE_FACE_ANCHOR_KEY]
  delete (globalThis as Record<string, unknown>)[FORGE_REMOTE_MOUNT_SETTLED_ANCHOR_KEY]
  vi.restoreAllMocks()
})

describe('消费面 warn 门控（mount 终态锚）', () => {
  it('竞速窗口（零锚在场）：面缺席 → typed Error 照抛 + console 零记录（静默）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(createForgeRpcClient().projects.list()).rejects.toThrow('官方 forge remote 面缺席')
    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  it('mount 终态（markForgeRemoteMountSettled）：面缺席 → 诚实 warn（console 兜底）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    markForgeRemoteMountSettled()
    await expect(createForgeRpcClient().projects.list()).rejects.toThrow('官方 forge remote 面缺席')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('通道不可用')
  })

  it('face 解析缝锚在场（installForgeRemoteFace 已装配）= 视同 mount 终态 → diag 诚实留痕', async () => {
    const diag = vi.fn()
    ;(globalThis as Record<string, unknown>)[FORGE_REMOTE_FACE_ANCHOR_KEY] = {
      resolver: () => undefined,
      diag,
    }
    await expect(createForgeRpcClient().projects.list()).rejects.toThrow('官方 forge remote 面缺席')
    expect(diag).toHaveBeenCalledWith(expect.stringContaining('通道不可用'))
  })

  it('竞速窗口流面（followSeal）同样静默照抛', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const client = createForgeRpcClient()
    await expect(async () => {
      for await (const _frame of client.worktree.followSeal({ sessionId: 's1' })) void _frame
    }).rejects.toThrow('官方 forge remote 面缺席')
    expect(warn).not.toHaveBeenCalled()
  })
})
