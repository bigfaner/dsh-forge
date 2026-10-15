// SessionWorktreeChip / SealNotice 单测 —— 原型第二/三卡逐位对照（SSR 面）：
// 会话头只读一体 chip（ahead/behind 次级小字、无切换入口）、封存三通道
// （chip 失效态 / notice banner / composer 占位文案）、非 git 零注入。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SessionWorktreeChip } from './session-worktree-chip.js'
import { SealNotice, SealedComposerPlaceholder } from './seal-notice.js'

const chip = (over: Partial<Parameters<typeof SessionWorktreeChip>[0]> = {}): string =>
  renderToStaticMarkup(<SessionWorktreeChip isGit branch="feat/api" worktreeName="wt-api" {...over} />)

describe('SessionWorktreeChip（会话头 actions 槽只读一体 chip）', () => {
  it('一体形态：feat/api · wt-api（分支 + 分隔点 + worktree 名）', () => {
    const markup = chip()
    expect(markup).toContain('data-dswt-session-chip')
    expect(markup).toContain('feat/api')
    expect(markup).toContain('·')
    expect(markup).toContain('wt-api')
  })

  it('只读无切换入口：纯展示 span（非 button/menuitem，无交互语义）', () => {
    const markup = chip()
    expect(markup.startsWith('<span')).toBe(true)
    expect(markup).not.toContain('<button')
    expect(markup).not.toContain('menuitem')
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
