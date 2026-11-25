// @vitest-environment happy-dom -- rc.5 Menu 装载期即触 DOM（useMenuSubmenu）——闭态 SSR 渲染需 document 在场
// HeroWorktreePicker 单测 —— 原型「新会话」卡逐位对照：
// 行面纯函数 heroWorktreeRows 直测（一行一 worktree、来源标记 DSH、失配行、徽标）+
// 组件闭态渲染面（官方 Menu 开弹层门户面 SSR 不可达——apps/web HeroWorkspacePicker.test
// 头注同口径；开弹层交互归 e2e）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { HeroWorktreePicker, heroWorktreeRows, pickerRowDisabled } from './hero-worktree-picker.js'
import { ForgeHeroWorkspacePicker } from './hero-workspace-picker.js'
import { pendingAheadBehindPaths, type WorktreeRow } from './model.js'
import {
  FORGE_REMOTE_FACE_ANCHOR_KEY,
  FORGE_REMOTE_MOUNT_SETTLED_ANCHOR_KEY,
  FORGE_REMOTE_MOUNT_WAITERS_KEY,
  markForgeRemoteMountSettled,
  type ForgeRpcClient,
} from '../rpc.js'
import { openAddProjectFlow } from '../add-project/flow-open.js'
import type { ProjectSummary } from '@dsh-forge/contracts'

vi.mock('../add-project/flow-open.js', () => ({ openAddProjectFlow: vi.fn() }))

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
  it('三行在场：分支名 + worktree 名 + 主行标记逐位透传（失配行已被源头过滤）', () => {
    const rows = heroWorktreeRows(ROWS, WORKTREE_DIR, new Map())
    expect(rows).toHaveLength(3)
    expect(rows.map((row) => row.branch)).toEqual(['main', 'feat/api', 'experiment/ui'])
    expect(rows.map((row) => row.worktreeName)).toEqual([
      'dsh-forge（主 worktree）',
      'wt-api',
      'ui-lab',
    ])
    expect(rows[0]!.isMain).toBe(true)
  })

  it('来源标记：所配目录内行 = dsh（徽标文案 DSH），自定义路径行 = null 无标记', () => {
    const rows = heroWorktreeRows(ROWS, WORKTREE_DIR, new Map())
    expect(rows.map((row) => row.source)).toEqual([null, 'dsh', null]) // 主行不在所配目录内
  })

  it('bug e62a448c：盘上失配行（present=false）隐藏不展示——菜单只留在场可用的树', () => {
    const rows = heroWorktreeRows(ROWS, WORKTREE_DIR, new Map())
    expect(rows.map((row) => row.path)).not.toContain('Z:/proj/.forge/worktrees/wt-old')
    expect(rows).toHaveLength(3)
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

// ── 评审 L 粘滞降级收口：缝未装首拉失败 → 零行 + mount 未落座不判「仅剩添加」，落座后重取 ──

const project: ProjectSummary = {
  workspaceId: 'ws-1',
  name: 'P1',
  wsPath: 'C:/proj',
  archived: false,
} as ProjectSummary

/** 时序替身：forgeProjects/list 首次 = 面缺席 throw（mount 前竞速窗口）；其后 = 单行 */
function listAbsentThenOkRpc(): () => ForgeRpcClient {
  let calls = 0
  return () => ({
    projects: {
      list: async () => {
        calls++
        if (calls === 1) throw new Error('官方 forge remote 面缺席（forgeProjects.list）——通道不可用（诚实降级）')
        return [project]
      },
    },
    worktree: { list: async () => ({ worktrees: [] }) },
  }) as unknown as ForgeRpcClient
}

/** 页内 mount 锚清理（用例隔离——锚/waiters 是 globalThis 页内单例） */
function resetMountAnchors(): void {
  const scope = globalThis as Record<string, unknown>
  delete scope[FORGE_REMOTE_MOUNT_SETTLED_ANCHOR_KEY]
  delete scope[FORGE_REMOTE_FACE_ANCHOR_KEY]
  delete scope[FORGE_REMOTE_MOUNT_WAITERS_KEY]
}

describe('ForgeHeroWorkspacePicker mount 等待重取（评审 L 粘滞降级收口——修前必红）', () => {
  beforeEach(() => {
    resetMountAnchors()
    vi.mocked(openAddProjectFlow).mockClear()
  })
  afterEach(() => {
    document.body.replaceChildren()
    resetMountAnchors()
    vi.restoreAllMocks()
  })

  async function renderPicker(makeRpc: () => ForgeRpcClient): Promise<HTMLElement> {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(
        <ForgeHeroWorkspacePicker open onPick={() => {}} onClose={() => {}} makeRpc={makeRpc} />,
      )
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    return host
  }

  it('首拉面缺席（mount 未落座）→ 点开零行不得直弹「添加项目」；mark 落座后重取一次 → 行集就位', async () => {
    await renderPicker(listAbsentThenOkRpc())
    expect(openAddProjectFlow, 'mount 未落座零行不得直弹添加项目').not.toHaveBeenCalled()
    await act(async () => {
      markForgeRemoteMountSettled()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(openAddProjectFlow, '落座重取后行集就位仍不弹添加项目').not.toHaveBeenCalled()
    expect(document.querySelector('.dswf-hero-picker-list'), '落座重取后弹层行集应呈现（Menu portal 面在 document）').not.toBeNull()
  })
})
