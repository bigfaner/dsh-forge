// SessionWorktreeChip / SealNotice 单测 —— 会话头一体 chip（SSR 面）：
// 样式对齐官方 AgentPresetLabel（icon + radius-xs pill）、完整信息卡经官方 HoverCard
// 承载（悬停/键盘聚焦展开，portal 到 body——SSR 初始收起；卡片为导出呈现面单测直测）、
// 封存三通道、非 git 零注入。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SessionWorktreeChip, SessionWorktreeInfoCard } from './chip.js'
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

  it('悬停目标面：可聚焦锚点（键盘可开）+ 分支图标（一体化展示）+ 官方标签同款底色；非按钮（点击非开合控件）', () => {
    const markup = chip({ worktreePath: 'Z:/repo/.forge/worktrees/wt-api', projectRoot: 'Z:/repo' })
    expect(markup).toContain('<svg') // 官方 IconBranchOutlineRegular（icon 一体）
    expect(markup).toContain('var(--dsw-alias-fill-tsp-secondary)') // 官方标签同款底色
    expect(markup).toMatch(/<span[^>]*data-dswt-session-chip="live"[^>]*tabindex="0"/) // 键盘聚焦可开（HoverCard inline）
    expect(markup).not.toContain('<button') // 不再是点击开合控件
    expect(markup).not.toContain('aria-haspopup')
    expect(markup).not.toContain('aria-expanded')
    // 初始收起：完整信息卡不在初始 markup（HoverCard 展开态才 portal）
    expect(markup).not.toContain('data-dswt-session-chip-popover')
  })

  it('根因钉：卡片经官方 HoverCard portal 承载——chip.tsx 零自定位卡片（absolute 卡片被官方头容器 overflow:clip 裁成一条线）', () => {
    const src = readFileSync(join(import.meta.dirname, 'chip.tsx'), 'utf8')
    expect(src).toContain("import { HoverCard } from '@deepseek-ai/dsh-client-ui-primitives'")
    expect(src, '信息卡不得自定位（position absolute/top/left/zIndex 壳退役）').not.toMatch(/position:\s*'absolute'/)
    expect(src, '官方头容器裁剪判例：卡片不得挂 zIndex 壳').not.toMatch(/zIndex:\s*30\b/)
    const card = renderToStaticMarkup(<SessionWorktreeInfoCard branch="b" worktreeName="w" />)
    expect(card).not.toContain('position:absolute')
  })

  it('ahead/behind 次级小字：↑2 ↓1（低频展示，不进消息流）', () => {
    const markup = chip({ aheadBehind: { ahead: 2, behind: 1 } })
    expect(markup).toContain('data-dswt-chip-ab')
    expect(markup).toContain('↑2 ↓1')
  })

  it('无 ahead/behind 值 = 次级小字不占位（懒加载未到不闪空徽标）', () => {
    expect(chip()).not.toContain('data-dswt-chip-ab')
  })

  it('封存态：失效变体（警示色 + 删除线）', () => {
    const markup = chip({ sealed: true })
    expect(markup).toContain('data-dswt-session-chip="sealed"')
    expect(markup).toContain('line-through')
  })

  it('非 git 项目：零注入（会话头 actions 槽不出现 chip）', () => {
    expect(chip({ isGit: false })).toBe('')
  })
})

describe('SessionWorktreeInfoCard（HoverCard 承载的完整信息卡）', () => {
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
    expect(markup).toContain('nowrap') // 路径行不换行（宽度贴合内容由 HoverCard fitContent 承担）
  })

  it('封存警示行：worktree 已删除 + 不可发送提示', () => {
    const markup = card({ sealed: true })
    expect(markup).toContain('已被删除，会话已封存——可查看历史，不可发送消息')
  })

  it('各行不换行 + 卡面宽度贴合内容：chip.css 经内容根反选官方卡面解除 300 宽度上限、仅留视口上限', () => {
    const css = readFileSync(join(import.meta.dirname, 'chip.css'), 'utf8')
    expect(css).toContain('div:has(> [data-dswt-session-chip-popover])')
    expect(css).toMatch(/max-width:\s*calc\(100vw - 16px\)\s*!important/)
    expect(css).toMatch(/\[data-dswt-session-chip-popover\]\s*\{[^}]*white-space:\s*nowrap/)
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
