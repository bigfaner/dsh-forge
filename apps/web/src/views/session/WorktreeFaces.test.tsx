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
  anchorDefaultWorktreePath,
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
      <ForgeHeroWorktreeMount projectRoot={null} makeRpc={fakeRpc({})} />,
    )
    expect(markup).toBe('')
  })

  it('hero mount：非 git 项目（list isGit false 相位）→ 触发 chip 不呈现', () => {
    const rpc = fakeRpc({ list: async () => ({ isGit: false, entries: [] }) })
    const markup = renderToStaticMarkup(
      <ForgeHeroWorktreeMount projectRoot="C:/foreign" makeRpc={rpc} />,
    )
    expect(markup).not.toContain('data-dswt-hero-trigger')
  })
  // 注：选中态回填（selectedPath → chip 一体两属性）的相位数据面 SSR 不可达（list 为效应
  // 回调——本文件头注口径）；透传锚归 packages git-worktree hero-worktree-picker.test
  // （selectedPath 在册即回填 feat/api · wt-api），选中闭环交互归 e2e worktree-hero-chip。
})

describe('1.17 hero 默认回填锚定链（纯函数——anchorDefaultWorktreePath）', () => {
  const row = (path: string, branch: string | null, isMain = false) => ({ path, branch, isMain })

  it('主行检出 feature 分支 → 映射到检出该分支的行（分支所在树，不硬编码 main）', () => {
    const rows = [row('C:/repo', 'feat/x', true), row('C:/repo/.forge/worktrees/wt-a', 'feat/a')]
    expect(anchorDefaultWorktreePath(rows)).toBe('C:/repo')
  })

  it('主行检出 main 且分支在主行 → 映射即主行自身（分支→worktree 一对一）', () => {
    const rows = [row('C:/repo', 'main', true), row('C:/repo/.forge/worktrees/wt-a', 'feat/a')]
    expect(anchorDefaultWorktreePath(rows)).toBe('C:/repo')
  })

  it('主行 detached（branch null）→ 锚定失败，undefined 退回占位现状', () => {
    expect(anchorDefaultWorktreePath([row('C:/repo', null, true), row('C:/wt-a', 'feat/a')])).toBeUndefined()
  })

  it('仅主行单行集 → 自映射（主行分支所在树即自身；映射缺失与 branch null 同退占位）', () => {
    expect(anchorDefaultWorktreePath([row('C:/repo', 'main', true)])).toBe('C:/repo')
  })

  it('空行集 / 无主行（isMain 缺席）→ undefined（映射行缺失退占位）', () => {
    expect(anchorDefaultWorktreePath([])).toBeUndefined()
    expect(anchorDefaultWorktreePath([row('C:/wt-a', 'feat/a')])).toBeUndefined()
  })
})
