// followSeal 贡献卸载 abort 分类单测（bug 99951e7b R3——1.2 复核欠账）：官方
// mountContribution/installNamespace 撤销链 token.abort（无 reason）→ 在途流
// AbortError / 'signal is aborted without reason' 分类为贡献卸载静默终态——
// 零 console.warn、已投影保投影标 live（不落 error 相位）、首帧前挂起不消。
// 另含评审 L 粘滞降级收口时序单测：installForgeRemoteFace 子纤维激活前的首拉失败
// （面缺席）→ mount 落座后重取一次数据到达（修前必红——一次性失败后整会话不重试）。
// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import {
  FORGE_REMOTE_FACE_ANCHOR_KEY,
  FORGE_REMOTE_MOUNT_SETTLED_ANCHOR_KEY,
  FORGE_REMOTE_MOUNT_WAITERS_KEY,
  markForgeRemoteMountSettled,
  type WorktreeFacesRpc,
} from '../rpc.js'
import type { WorktreeSealResult } from '@dsh-forge/contracts'
import {
  ForgeWorktreeSealOverlay,
  isContributionUnloadAbort,
} from './seal-notice.js'

const baseline: WorktreeSealResult = {
  isGit: true,
  sealed: true,
  binding: { branch: 'feat-b', worktreePath: 'C:/repo/.forge/worktrees/wt-a' },
  worktreeName: 'wt-a',
} as WorktreeSealResult

/** abort 形状两态（官方无 reason abort()——DOMException.name 族 + 文案族） */
const abortByName = Object.assign(new Error('aborted'), { name: 'AbortError' })
const abortByMessage = new Error('signal is aborted without reason')

function abortRpc(cause: unknown, afterFrame: boolean): () => WorktreeFacesRpc {
  return () =>
    ({
      worktree: {
        followSeal: async function* (): AsyncIterable<WorktreeSealResult> {
          if (afterFrame) yield baseline
          throw cause
        },
      },
    }) as unknown as WorktreeFacesRpc
}

async function renderOverlay(makeRpc: () => WorktreeFacesRpc): Promise<HTMLElement> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(<ForgeWorktreeSealOverlay sessionId="s1" makeRpc={makeRpc} />)
  })
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  return host
}

describe('isContributionUnloadAbort（贡献卸载 abort 分类）', () => {
  it('AbortError name / 无 reason 文案 → true；通道故障 → false', () => {
    expect(isContributionUnloadAbort(abortByName)).toBe(true)
    expect(isContributionUnloadAbort(abortByMessage)).toBe(true)
    expect(isContributionUnloadAbort(new Error('transport failure'))).toBe(false)
    expect(isContributionUnloadAbort(undefined)).toBe(false)
  })
})

describe('useWorktreeSeal followSeal abort 分类（静默终态不告警）', () => {
  afterEach(() => {
    document.body.replaceChildren()
    vi.restoreAllMocks()
  })

  it('已投影后 abort（卸载竞速）→ 零 console.warn + 保投影（封存占位仍呈现）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const host = await renderOverlay(abortRpc(abortByName, true))
    expect(warn).not.toHaveBeenCalled()
    expect(host.querySelector('[data-dswt-seal-placeholder]')).not.toBeNull()
  })

  it('首帧前 abort（mount 前卸载）→ 零 console.warn + 挂起不消（不落 error 告警通道）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const host = await renderOverlay(abortRpc(abortByMessage, false))
    expect(warn).not.toHaveBeenCalled()
    expect(host.querySelector('[data-dswt-seal-placeholder]')).toBeNull()
  })
})

// ── 评审 L 粘滞降级收口：缝未装首拉失败 → mount 落座后重取一次 ──

/** 时序替身：首次 followSeal = 面缺席 throw（mount 前竞速窗口）；其后 = 正常 baseline 流 */
function faceAbsentThenOkRpc(): () => WorktreeFacesRpc {
  let calls = 0
  return () =>
    ({
      worktree: {
        followSeal: () => {
          calls++
          if (calls === 1) throw new Error('官方 forge remote 面缺席（forgeWorktree.followSeal）——通道不可用（诚实降级）')
          return (async function* (): AsyncIterable<WorktreeSealResult> {
            yield baseline
          })()
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

describe('useWorktreeSeal mount 等待重取（评审 L 粘滞降级收口——修前必红）', () => {
  beforeEach(resetMountAnchors)
  afterEach(() => {
    document.body.replaceChildren()
    vi.restoreAllMocks()
    resetMountAnchors()
  })

  it('首拉面缺席（mount 未落座）→ error 相位；mark 落座后重取一次 → 数据到达（sealed 投影呈现）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const host = await renderOverlay(faceAbsentThenOkRpc())
    expect(host.querySelector('[data-dswt-seal-placeholder]')).toBeNull()
    await act(async () => {
      markForgeRemoteMountSettled()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(host.querySelector('[data-dswt-seal-placeholder]'), 'mount 落座重取后 baseline 应到达').not.toBeNull()
    // 落座后失败不重试：二次失败落 error 相位（零额外 warn 之外的既有降级语义不变）
    expect(warn).toHaveBeenCalled()
  })
})
