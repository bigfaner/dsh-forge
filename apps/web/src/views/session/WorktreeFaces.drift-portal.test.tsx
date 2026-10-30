// 漂移 banner 挂载位单测（bug ed28400a——真实 DOM 链路，quote-reference 判例同构：
// 文件级 happy-dom 环境声明）。断言面：BranchDriftNotice 经 portal 落官方 chat 列顶部锚
// （[data-chat-flow] 首位 = worktree chip 之下、消息列表之上）；锚缺席 = 回落 composer
// overlay 原位（fail-soft，官方改版不炸不丢）。
// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import type { ForgeRpcClient } from '../../rpc/client.js'
import { ForgeWorktreeSealOverlay } from './WorktreeFaces.js'

/** rpc 替身：seal 相位直接给漂移判定（非封存 live 态） */
function driftRpc(): () => ForgeRpcClient {
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
    }) as unknown as ForgeRpcClient
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
