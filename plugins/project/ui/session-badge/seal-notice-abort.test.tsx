// followSeal 贡献卸载 abort 分类单测（bug 99951e7b R3——1.2 复核欠账）：官方
// mountContribution/installNamespace 撤销链 token.abort（无 reason）→ 在途流
// AbortError / 'signal is aborted without reason' 分类为贡献卸载静默终态——
// 零 console.warn、已投影保投影标 live（不落 error 相位）、首帧前挂起不消。
// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import type { WorktreeFacesRpc } from '../rpc.js'
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
