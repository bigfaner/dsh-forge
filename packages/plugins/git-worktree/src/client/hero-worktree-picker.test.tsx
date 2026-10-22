// HeroWorktreePicker 单测 —— 原型「新会话」卡逐位对照：
// 行面纯函数 heroWorktreeRows 直测（一行一 worktree、来源标记 DSH、失配行、徽标）+
// 组件闭态渲染面（官方 Menu 开弹层门户面 SSR 不可达——apps/web HeroWorkspacePicker.test
// 头注同口径；开弹层交互归 e2e）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { HeroWorktreePicker, heroWorktreeRows, pickerRowDisabled } from './hero-worktree-picker.js'
import { pendingAheadBehindPaths, type WorktreeRow } from './model.js'

const ROWS: WorktreeRow[] = [
  { path: 'Z:/proj', branch: 'main', worktreeName: 'dsh-forge（主 worktree）', isMain: true, present: true },
  { path: 'Z:/proj/.forge/worktrees/wt-api', branch: 'feat/api', worktreeName: 'wt-api', isMain: false, present: true },
  { path: 'D:/scratch/ui-lab', branch: 'experiment/ui', worktreeName: 'ui-lab', isMain: false, present: true },
  { path: 'Z:/proj/.forge/worktrees/wt-old', branch: 'spike/old', worktreeName: 'wt-old', isMain: false, present: false },
]
const WORKTREE_DIR = 'Z:/proj/.forge/worktrees'

function renderPicker(props: Partial<Parameters<typeof HeroWorktreePicker>[0]> = {}): string {
  return renderToStaticMarkup(
    <HeroWorktreePicker
      isGit
      rows={ROWS}
      worktreeDir={WORKTREE_DIR}
      selectedPath="Z:/proj/.forge/worktrees/wt-api"
      onSelect={() => {}}
      onCreate={() => {}}
      onDelete={() => {}}
      {...props}
    />,
  )
}

describe('heroWorktreeRows（菜单行面纯函数——一行一 worktree 逐位对照）', () => {
  it('四行全量：分支名 + worktree 名 + 主行标记逐位透传', () => {
    const rows = heroWorktreeRows(ROWS, WORKTREE_DIR, new Map())
    expect(rows).toHaveLength(4)
    expect(rows.map((row) => row.branch)).toEqual(['main', 'feat/api', 'experiment/ui', 'spike/old'])
    expect(rows.map((row) => row.worktreeName)).toEqual([
      'dsh-forge（主 worktree）',
      'wt-api',
      'ui-lab',
      'wt-old',
    ])
    expect(rows[0]!.isMain).toBe(true)
  })

  it('来源标记：所配目录内行 = dsh（徽标文案 DSH），自定义路径行 = null 无标记', () => {
    const rows = heroWorktreeRows(ROWS, WORKTREE_DIR, new Map())
    expect(rows.map((row) => row.source)).toEqual([null, 'dsh', null, 'dsh']) // 主行不在所配目录内
  })

  it('失配行：present=false（置灰不可选语义）且徽标区清空', () => {
    const rows = heroWorktreeRows(ROWS, WORKTREE_DIR, new Map())
    expect(rows[3]!.present).toBe(false)
    expect(rows[3]!.ahead).toBeNull()
    expect(rows[3]!.behind).toBeNull()
  })

  it('ahead/behind 徽标：缓存命中行 ↑2 ↓1；未加载/零值行为空（不闪空徽标）', () => {
    const cache = new Map([[ROWS[1]!.path, { ahead: 2, behind: 1 }]])
    const rows = heroWorktreeRows(ROWS, WORKTREE_DIR, cache)
    expect(rows[1]!.ahead).toBe('↑2')
    expect(rows[1]!.behind).toBe('↓1')
    expect(rows[0]!.ahead).toBeNull()
    expect(rows[0]!.behind).toBeNull()
  })
})

describe('HeroWorktreePicker（组件闭态渲染面）', () => {
  it('git 项目：触发 chip 在册（一体两属性 feat/api · wt-api + 分支图标）；闭态零弹层', () => {
    const markup = renderPicker()
    expect(markup).toContain('data-dswt-hero-trigger')
    expect(markup).toContain('feat/api · wt-api')
    expect(markup).not.toContain('role="menu"')
    expect(markup).not.toContain('新建 worktree…')
  })

  it('非 git 项目：零注入（hero 区不渲染任何 chip/菜单——退回现状）', () => {
    expect(renderPicker({ isGit: false })).toBe('')
  })

  it('bug 488e860d（桌面同族）：detached 行（branch null）禁选——预铸挂靠契约一 worktree 一分支，选中必被 session-create typed 拒绝', () => {
    const rows: WorktreeRow[] = [
      { path: 'Z:/proj', branch: 'main', worktreeName: 'main', isMain: true, present: true },
      { path: 'Z:\\tmp', branch: null, worktreeName: 'tmp', isMain: false, present: true },
      { path: 'Z:/gone', branch: 'feat/gone', worktreeName: 'gone', isMain: false, present: false },
    ]
    expect(pickerRowDisabled(rows[0]!)).toBe(false) // 健康行可选
    expect(pickerRowDisabled(rows[1]!)).toBe(true) // detached 行禁选（present 但无分支）
    expect(pickerRowDisabled(rows[2]!)).toBe(true) // 失配行禁选（既有语义）
  })
})

describe('ahead/behind 懒加载待拉判定（懒加载纪律同源——model 单测深测）', () => {
  it('展开才拉、缓存免重拉；失配/detached 行不拉；收起恒空', () => {
    const cache = new Map([[ROWS[1]!.path, { ahead: 2, behind: 1 }]])
    expect(pendingAheadBehindPaths(true, ROWS, cache)).toEqual(['Z:/proj', 'D:/scratch/ui-lab'])
    expect(pendingAheadBehindPaths(false, ROWS, new Map())).toEqual([])
  })
})
