// worktree 六卡挂载面单测（fix-2——SSR 渲染期纯判读：能力位条件渲染零注入路径；
// 数据面经 makeRpc 替身注入。RPC 相位驱动路径（chip 呈现/封存双通道/清单行）为效应回调
// ——SSR 不可达，归集成模式实机走查（1.8 e2e 同口径惯例）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createForgeRpcClient, type ForgeRpcClient } from '../../rpc/client.js'
import {
  ForgeHeroWorktreeMount,
  ForgeSessionWorktreeChip,
  ForgeWorktreeSealOverlay,
  ForgeWorktreeSwitchOverlay,
  anchorDefaultWorktreePath,
  createFollowup,
} from './WorktreeFaces.js'
import { beginWorktreeSwitch, isWorktreeSwitchPending } from '../../state/worktree-switch-gate.js'

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

// ───────── bug 267dcac1 切换闸 overlay（SSR 判读；键击/指针拦截效应归 e2e）─────────

describe('切换闸 overlay（bug 267dcac1——pending 窗口虚线外框禁输）', () => {
  it('空闲 → 零渲染（正常会话零扰动）', () => {
    expect(isWorktreeSwitchPending()).toBe(false)
    expect(renderToStaticMarkup(<ForgeWorktreeSwitchOverlay />)).toBe('')
  })

  it('切换 pending → 虚线外框面板呈现（data-dswt-switch-gate + 禁输文案）', () => {
    const settle = beginWorktreeSwitch()
    try {
      const markup = renderToStaticMarkup(<ForgeWorktreeSwitchOverlay />)
      expect(markup).toContain('data-dswt-switch-gate')
      expect(markup).toContain('正在切换 worktree')
    } finally {
      settle()
    }
    expect(renderToStaticMarkup(<ForgeWorktreeSwitchOverlay />)).toBe('')
  })
})

// ───────────── bug 6593d708 创建跟进次序（纯编排——createFollowup）─────────────

describe('创建跟进次序（bug 6593d708——清单刷新先于选中态落定）', () => {
  it('创建成功后先刷新清单、后落选中态（防陈旧自愈以创建前旧行集误判新树盘上失配）', async () => {
    const order: string[] = []
    await createFollowup('C:/repo/.forge/worktrees/super-composer', {
      refresh: async () => {
        order.push('refresh')
      },
      onSelectConfirmed: () => {
        order.push('select')
      },
    })
    expect(order).toEqual(['refresh', 'select'])
  })
})

// ───────────── bug 82e92933：点选即换绑编排退役（binding-derivation §2.3 口径——
// 换绑由官方 blank 复用天然生效，点选回归纯选中态；通道 host 注册已删，web 残留消费
// 必 not-found + rebindOnSelect fail-soft 静默失效 / maybeRebind unhandled rejection）─────────────

describe('点选即换绑编排退役（bug 82e92933）', () => {
  it('rpc client worktree 面零 sessionCreate 方法——点选路径零 forge 建会话 RPC', () => {
    const client = createForgeRpcClient(async () => {
      throw new Error('no-op')
    })
    expect('sessionCreate' in client.worktree).toBe(false)
  })
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
