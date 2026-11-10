// SessionWorktreeChip / SealNotice 单测 —— 会话头一体 chip（SSR 面）：
// 样式对齐官方 AgentPresetLabel（icon + radius-xs pill）、点击展示完整信息卡
// （交互态 SSR 不可达——卡片为导出呈现面单测直测）、封存三通道、非 git 零注入。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SessionWorktreeChip, SessionWorktreeInfoCard } from './session-worktree-chip.js'
import { SealNotice, SealedComposerPlaceholder, StaleSelectionNotice, BranchDriftNotice } from './seal-notice.js'

const chip = (over: Partial<Parameters<typeof SessionWorktreeChip>[0]> = {}): string =>
  renderToStaticMarkup(<SessionWorktreeChip isGit branch="feat/api" worktreeName="wt-api" {...over} />)

describe('SessionWorktreeChip（会话头 actions 槽一体 chip）', () => {
  it('一体形态：feat/api · wt-api（分支 + 分隔点 + worktree 名）', () => {
    const markup = chip()
    expect(markup).toContain('data-dswt-session-chip')
    expect(markup).toContain('feat/api')
    expect(markup).toContain('·')
    expect(markup).toContain('wt-api')
  })

  it('同名去重（hero chip 同口径）：branch ≡ worktree 名 → 单段展示零分隔点', () => {
    const markup = chip({ branch: 'test-02', worktreeName: 'test-02' })
    expect(markup).toContain('test-02')
    expect(markup).not.toContain('·')
  })

  it('样式对齐官方模式标签：button 触发面 + 分支图标（一体化展示）+ 完整信息卡触发语义', () => {
    const markup = chip({ worktreePath: 'Z:/repo/.forge/worktrees/wt-api', projectRoot: 'Z:/repo' })
    expect(markup).toContain('<button')
    expect(markup).toContain('aria-haspopup="dialog"')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).toContain('<svg') // 官方 IconBranchOutlineRegular（icon 一体）
    expect(markup).toContain('var(--dsw-alias-fill-tsp-secondary)') // 官方标签同款底色
    // 初始收起：完整信息卡不在初始 markup（交互态）
    expect(markup).not.toContain('data-dswt-session-chip-popover')
  })

  it('ahead/behind 次级小字：↑2 ↓1（低频展示，不进消息流）', () => {
    const markup = chip({ aheadBehind: { ahead: 2, behind: 1 } })
    expect(markup).toContain('data-dswt-chip-ab')
    expect(markup).toContain('↑2 ↓1')
  })

  it('无 ahead/behind 值 = 次级小字不占位（懒加载未到不闪空徽标）', () => {
    expect(chip()).not.toContain('data-dswt-chip-ab')
  })

  it('封存态：失效变体（警示色 + 删除线 + tooltip「worktree 已被删除」）', () => {
    const markup = chip({ sealed: true })
    expect(markup).toContain('data-dswt-session-chip="sealed"')
    expect(markup).toContain('line-through')
    expect(markup).toContain('worktree 已被删除')
  })

  it('非 git 项目：零注入（会话头 actions 槽不出现 chip）', () => {
    expect(chip({ isGit: false })).toBe('')
  })
})

describe('SessionWorktreeInfoCard（点击展示的完整信息卡）', () => {
  const card = (over: Partial<Parameters<typeof SessionWorktreeInfoCard>[0]> = {}): string =>
    renderToStaticMarkup(
      <SessionWorktreeInfoCard
        branch="feat/api"
        worktreeName="wt-api"
        worktreePath="Z:/repo/.forge/worktrees/wt-api"
        projectRoot="Z:/repo"
        aheadBehind={{ ahead: 2, behind: 1 }}
        {...over}
      />,
    )

  it('§2.3.1 完整信息卡：分支（内联 2↓ 16↑）/worktree/项目/工作区 逐行——行序 分支→worktree→项目→工作区', () => {
    const markup = card()
    expect(markup).toContain('data-dswt-session-chip-popover')
    expect(markup).toContain('feat/api')
    expect(markup).toContain('wt-api')
    expect(markup).toContain('Z:/repo/.forge/worktrees/wt-api')
    expect(markup).toContain('Z:/repo')
    expect(markup).toContain('1↓ 2↑') // ahead/behind 内联于分支名旁（落后在前）
    expect(markup).toContain('工作区') // 「路径」label 更名「工作区」
    expect(markup).not.toContain('路径')
    expect(markup).not.toContain('领先/落后') // 独立领先/落后行移除
    expect(markup.indexOf('分支')).toBeLessThan(markup.indexOf('worktree'))
    expect(markup.indexOf('worktree')).toBeLessThan(markup.indexOf('项目'))
    expect(markup.indexOf('项目')).toBeLessThan(markup.indexOf('工作区'))
    expect(markup).toContain('max-content') // 卡片随内容加宽——路径不换行
    expect(markup).toContain('nowrap')
  })

  it('封存警示行：worktree 已删除 + 不可发送提示', () => {
    const markup = card({ sealed: true })
    expect(markup).toContain('已被删除，会话已封存——可查看历史，不可发送消息')
  })

  it('可选行缺席不占位（worktreePath/projectRoot/aheadBehind 缺省）', () => {
    const markup = renderToStaticMarkup(<SessionWorktreeInfoCard branch="b" worktreeName="w" />)
    expect(markup).not.toContain('工作区')
    expect(markup).not.toContain('项目')
    expect(markup).not.toContain('↑')
  })
})

describe('BranchDriftNotice（binding-derivation §2.2——branch 漂移 warning banner）', () => {
  it('警告形态 + 引述两侧分支名 + 非阻断（无关闭态——切回即消失）', () => {
    const markup = renderToStaticMarkup(<BranchDriftNotice bindBranch="main" branch="feat/x" />)
    expect(markup).toContain('data-dswt-bind-drift-notice')
    expect(markup).toContain('main')
    expect(markup).toContain('feat/x')
    expect(markup).toContain('切回')
    expect(markup).not.toContain('-close')
  })
})

describe('封存三通道（worktree 被删提示）', () => {
  it('② notice banner：警告色 + 引述 worktree 名 + 一次性关闭 + 置顶形态锚', () => {
    const markup = renderToStaticMarkup(<SealNotice worktreeName="wt-api" onClose={() => {}} />)
    expect(markup).toContain('data-dswt-seal-notice')
    expect(markup).toContain('已被删除，会话已封存——可查看历史，不可发送消息')
    expect(markup).toContain('wt-api')
    expect(markup).toContain('data-dswt-seal-notice-close')
    expect(markup).toContain('border-top:none') // 紧贴会话头分界线（上边线免除）
  })

  it('③ composer 占位文案（提示性，不硬禁用）', () => {
    const markup = renderToStaticMarkup(<SealedComposerPlaceholder />)
    expect(markup).toContain('data-dswt-seal-placeholder')
    expect(markup).toContain('worktree 已删除，会话已封存——可查看历史')
  })
})

describe('hero 选中树失效 notice（bug 4a30b193——StaleSelectionNotice）', () => {
  it('警告形态 + 引述树名 + 已切回主树文案 + 一次性关闭锚', () => {
    const markup = renderToStaticMarkup(<StaleSelectionNotice worktreeName="wt-gone" onClose={() => {}} />)
    expect(markup).toContain('data-dswt-stale-selection-notice')
    expect(markup).toContain('已不存在（可能已被删除），已切回主树')
    expect(markup).toContain('wt-gone')
    expect(markup).toContain('data-dswt-stale-selection-notice-close')
  })
})
