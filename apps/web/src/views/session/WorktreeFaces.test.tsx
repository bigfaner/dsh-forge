// worktree 六卡挂载面单测（fix-2——SSR 渲染期纯判读：能力位条件渲染零注入路径；
// 数据面经 makeRpc 替身注入。RPC 相位驱动路径（chip 呈现/封存双通道/清单行）为效应回调
// ——SSR 不可达，归集成模式实机走查（1.8 e2e 同口径惯例）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ForgeRpcClient } from '../../rpc/client.js'
import {
  ForgeHeroWorktreeMount,
  ForgeSessionWorktreeChip,
  ForgeWorktreeSealOverlay,
} from './WorktreeFaces.js'

/** rpc 替身（worktree 面按用例给值；其余族不被触达） */
function fakeRpc(worktree: Partial<ForgeRpcClient['worktree']>): () => ForgeRpcClient {
  return () => ({ worktree }) as unknown as ForgeRpcClient
}

describe('零注入路径（SSR 同步判读——能力位条件渲染）', () => {
  it('会话头 chip：非 git / 无绑定（seal isGit false 相位未落亦同）→ 零渲染', () => {
    const rpc = fakeRpc({ seal: async () => ({ isGit: false, sealed: false, binding: null }) })
    expect(renderToStaticMarkup(<ForgeSessionWorktreeChip sessionId="s1" makeRpc={rpc} />)).toBe('')
  })

  it('封存 overlay：未封存 / 非 git → 零渲染（提示性视觉不扰正常会话）', () => {
    const rpc = fakeRpc({ seal: async () => ({ isGit: false, sealed: false, binding: null }) })
    expect(renderToStaticMarkup(<ForgeWorktreeSealOverlay sessionId="s1" makeRpc={rpc} />)).toBe('')
  })

  it('hero mount：projectRoot null（未选中项目）→ 零注入退回现状', () => {
    const markup = renderToStaticMarkup(
      <ForgeHeroWorktreeMount projectRoot={null} onSelect={() => {}} makeRpc={fakeRpc({})} />,
    )
    expect(markup).toBe('')
  })

  it('hero mount：非 git 项目（list isGit false 相位）→ 触发 chip 不呈现', () => {
    const rpc = fakeRpc({ list: async () => ({ isGit: false, entries: [] }) })
    const markup = renderToStaticMarkup(
      <ForgeHeroWorktreeMount projectRoot="C:/foreign" onSelect={() => {}} makeRpc={rpc} />,
    )
    expect(markup).not.toContain('data-dswt-hero-trigger')
  })
})
