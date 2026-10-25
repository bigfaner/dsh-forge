// worktree 切换闸安装器单测（bug 267dcac1 官方缝重写）：pending 置位 → conversation.blocks
// 对当前主会话 set block（官方 inert 禁用卡）；敛棋 → 对**置位时点会话**清 block（openWorkspace
// 换主后 mainReference 已易主——清退锚定原会话）；会话/面缺席 = fail-soft 零锁。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installWorktreeSwitchGate } from './worktree-switch-gate-install.js'

interface Harness {
  blocksSets: Array<{ sessionId: string; block: { reason: string } | undefined }>
  setPending: (next: boolean) => void
}

function harness(mainSessionId: string | undefined): Harness {
  const blocksSets: Harness['blocksSets'] = []
  const listeners = new Set<() => void>()
  let pending = false
  ;(globalThis as unknown as Record<string, unknown>)['__dshForgeWorktreeSwitchGate'] = {
    isPending: () => pending,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  const clientCtx = {
    reflect: {
      get: (name: string) =>
        name === 'conversation'
          ? { blocks: { set: (sessionId: string, block: { reason: string } | undefined) => void blocksSets.push({ sessionId, block }) } }
          : undefined,
    },
  }
  const uiWorkspace = { mainReference: mainSessionId === undefined ? undefined : { sessionId: mainSessionId } }
  installWorktreeSwitchGate({ clientCtx, uiWorkspace })
  return {
    blocksSets,
    setPending: (next: boolean) => {
      pending = next
      for (const listener of listeners) listener()
    },
  }
}

describe('worktree 切换闸安装器（官方 composer block 缝）', () => {
  beforeEach(() => {
    delete (globalThis as unknown as Record<string, unknown>)['__dshForgeWorktreeSwitchGate']
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('pending 置位 → 当前主会话 set block（官方 reason 占位）；敛棋 → 清 block', () => {
    const h = harness('s-main')
    h.setPending(true)
    expect(h.blocksSets).toEqual([{ sessionId: 's-main', block: { reason: '正在切换 worktree…' } }])
    h.setPending(false)
    expect(h.blocksSets[1]).toEqual({ sessionId: 's-main', block: undefined })
  })

  it('敛棋前换主（openWorkspace 完成）→ 清退仍锚定置位时点的原会话', () => {
    const h = harness('s-old')
    h.setPending(true)
    expect(h.blocksSets[0]!.sessionId).toBe('s-old')
    // mainReference 易主在安装器外发生（闭包读不到新值亦无妨——清退用捕获值）
    h.setPending(false)
    expect(h.blocksSets[1]!.sessionId).toBe('s-old')
  })

  it('置位时主会话缺席（hero 无 blank）→ 零锁不抛；敛棋零动作', () => {
    const h = harness(undefined)
    h.setPending(true)
    h.setPending(false)
    expect(h.blocksSets).toEqual([])
  })

  it('重复 pending 通知幂等（不重复 set）；重复敛棋幂等', () => {
    const h = harness('s-main')
    h.setPending(true)
    h.setPending(true)
    expect(h.blocksSets.filter((entry) => entry.block !== undefined)).toHaveLength(1)
    h.setPending(false)
    h.setPending(false)
    expect(h.blocksSets).toHaveLength(2)
  })
})
