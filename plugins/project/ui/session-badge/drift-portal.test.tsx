// 漂移 banner 挂载位单测（bug ed28400a——真实 DOM 链路，quote-reference 判例同构：
// 文件级 happy-dom 环境声明）。断言面：BranchDriftNotice 经 portal 落官方 chat 列顶部锚
// （[data-chat-flow] 首位 = worktree chip 之下、消息列表之上）；锚缺席 = 回落 composer
// overlay 原位（fail-soft，官方改版不炸不丢）。
// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import {
  FORGE_REMOTE_FACE_ANCHOR_KEY,
  FORGE_REMOTE_MOUNT_SETTLED_ANCHOR_KEY,
  FORGE_REMOTE_MOUNT_WAITERS_KEY,
  markForgeRemoteMountSettled,
  type WorktreeFacesRpc,
} from '../rpc.js'
import type { WorktreeAheadBehindResult, WorktreeSealResult } from '@dsh-forge/lib-api/dto/worktree'
import { ForgeSessionWorktreeChip } from './chip.js'
import { ForgeWorktreeSealOverlay } from './seal-notice.js'

/** rpc 替身：seal 相位直接给漂移判定（非封存 live 态） */
function driftRpc(): () => WorktreeFacesRpc {
  return () =>
    ({
      worktree: {
        seal: async () => ({
          isGit: true,
          sealed: false,
          binding: { branch: 'feat-b', worktreePath: 'C:/repo/.forge/worktrees/wt-a' },
          worktreeName: 'wt-a',
          branchDrift: { bindBranch: 'main', branch: 'feat-b' },
        }),
      },
    }) as unknown as WorktreeFacesRpc
}

// ── 评审 L 粘滞降级收口（chip info/aheadBehind——首拉面缺席 → mount 落座后重取一次）──

const liveFrame = {
  isGit: true,
  sealed: false,
  binding: { branch: 'feat-b', worktreePath: 'C:/repo/.forge/worktrees/wt-a' },
  worktreeName: 'wt-a',
  projectRoot: 'C:/repo',
} as WorktreeSealResult

/** 时序替身：followSeal/seal 正常；aheadBehind 首次 = 面缺席 throw（mount 前竞速窗口） */
function aheadBehindAbsentThenOkRpc(): () => WorktreeFacesRpc {
  let calls = 0
  return () =>
    ({
      worktree: {
        followSeal: async function* (): AsyncIterable<WorktreeSealResult> {
          yield liveFrame
        },
        seal: async () => liveFrame,
        aheadBehind: async () => {
          calls++
          if (calls === 1) throw new Error('官方 forge remote 面缺席——通道不可用（诚实降级）')
          return { counts: { ahead: 2, behind: 1 } } as WorktreeAheadBehindResult
        },
      },
    }) as unknown as WorktreeFacesRpc
}

/** 页内 mount 锚清理（用例隔离——锚/waiters 是 globalThis 页内单例） */
function resetMountAnchors(): void {
  const scope = globalThis as Record<string, unknown>
  delete scope[FORGE_REMOTE_MOUNT_SETTLED_ANCHOR_KEY]
  delete scope[FORGE_REMOTE_FACE_ANCHOR_KEY]
  delete scope[FORGE_REMOTE_MOUNT_WAITERS_KEY]
}

async function renderOverlay(): Promise<HTMLElement> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(<ForgeWorktreeSealOverlay sessionId="s1" makeRpc={driftRpc()} />)
  })
  await act(async () => {
    await Promise.resolve()
  })
  return host
}

describe('漂移 banner 挂载位（bug ed28400a——chat-view 顶部 portal）', () => {
  afterEach(() => {
    document.body.replaceChildren() // 用例隔离：portal 锚/宿主不跨用例残留
  })

  it('漂移判定在场 → banner 落官方 chat 列顶部锚（[data-chat-flow] 内），不在 composer overlay 原位', async () => {
    const chatFlow = document.createElement('div')
    chatFlow.setAttribute('data-chat-flow', '')
    document.body.appendChild(chatFlow)
    const host = await renderOverlay()
    const banner = document.querySelector('[data-dswt-bind-drift-notice]')
    expect(banner, '漂移 banner 应呈现').not.toBeNull()
    expect(chatFlow.contains(banner), 'banner 应落 chat 列顶部锚内').toBe(true)
    expect(host.contains(banner), 'banner 不应留在 composer overlay 原位').toBe(false)
  })

  it('chat 列锚缺席（官方改版/降级）→ banner 回落 composer overlay 原位（fail-soft 不丢失）', async () => {
    const host = await renderOverlay()
    const banner = document.querySelector('[data-dswt-bind-drift-notice]')
    expect(banner, '回落路径 banner 仍应呈现').not.toBeNull()
    expect(host.contains(banner)).toBe(true)
  })
})

describe('会话头 chip mount 等待重取（评审 L 粘滞降级收口——修前必红）', () => {
  beforeEach(resetMountAnchors)
  afterEach(() => {
    document.body.replaceChildren()
    resetMountAnchors()
  })

  it('aheadBehind 首拉面缺席（mount 未落座）→ 零 ahead/behind 小字；mark 落座后重取一次 → 小字出现', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(<ForgeSessionWorktreeChip sessionId="s1" makeRpc={aheadBehindAbsentThenOkRpc()} />)
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(host.querySelector('[data-dswt-chip-ab]'), 'mount 前首拉失败 = 零小字').toBeNull()
    await act(async () => {
      markForgeRemoteMountSettled()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(host.querySelector('[data-dswt-chip-ab]'), 'mount 落座重取后 ahead/behind 应到达').not.toBeNull()
  })
})
