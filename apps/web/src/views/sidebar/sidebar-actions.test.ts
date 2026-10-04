// sidebar-actions 单测 —— 导航/变更动作绑定（AC5 会话行 → openSession 官方面单径；
// fix-42：新会话 → startSession 官方面；改名/归档切换 → forge:projects/update patch 面
// + 变更后静默重拉）。失败面：改名失败原样上抛（模态呈现）；归档 fail-soft 吞错。
import { describe, expect, it, vi } from 'vitest'
import { sidebarActions, type SidebarActionDeps } from './sidebar-actions.js'

function deps(overrides: Partial<SidebarActionDeps> = {}): SidebarActionDeps {
  return {
    openSession: vi.fn(),
    startSession: vi.fn(),
    updateProject: vi.fn().mockResolvedValue(undefined),
    onProjectsMutated: vi.fn(),
    ...overrides,
  }
}

describe('sidebarActions（导航绑定）', () => {
  it('会话行 → openSession（官方 uiWorkspace.openSession 单径——选择+呈现+回会话面板一体）', () => {
    const d = deps()
    sidebarActions(d).onSessionActivate('s-1')
    expect(d.openSession).toHaveBeenCalledWith('s-1')
  })

  it('项目「新会话」→ startSession(workspaceId)（官方新会话流——fix-42 行尾动作）', () => {
    const d = deps()
    sidebarActions(d).onStartSession('w-1')
    expect(d.startSession).toHaveBeenCalledWith('w-1')
  })
})

describe('sidebarActions（变更绑定——forge:projects/update patch 面）', () => {
  it('改名：update({name}) 成功后静默重拉（应用侧行改写不触发 workspace 快照锚）', async () => {
    const d = deps()
    await sidebarActions(d).onRenameProject('p-1', '新名')
    expect(d.updateProject).toHaveBeenCalledWith('p-1', { name: '新名' })
    expect(d.onProjectsMutated).toHaveBeenCalledTimes(1)
  })

  it('改名：RPC 失败原样上抛（模态内呈现——官方 rename 错误面同型）且不重拉', async () => {
    const failure = new Error('通道未注册')
    const d = deps({ updateProject: vi.fn().mockRejectedValue(failure) })
    await expect(sidebarActions(d).onRenameProject('p-1', '新名')).rejects.toBe(failure)
    expect(d.onProjectsMutated).not.toHaveBeenCalled()
  })

  it('归档切换：update({archived}) 成功后静默重拉（fire-and-forget）', async () => {
    const d = deps()
    sidebarActions(d).onArchiveToggle('p-1', true)
    await vi.waitFor(() => {
      expect(d.onProjectsMutated).toHaveBeenCalledTimes(1)
    })
    expect(d.updateProject).toHaveBeenCalledWith('p-1', { archived: true })
  })

  it('归档切换：RPC 失败 fail-soft 吞错（P1 无行内错误面——控制台告警，不重拉不炸）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const d = deps({ updateProject: vi.fn().mockRejectedValue(new Error('RPC 断')) })
      expect(() => {
        sidebarActions(d).onArchiveToggle('p-1', false)
      }).not.toThrow()
      await vi.waitFor(() => {
        expect(warn).toHaveBeenCalledTimes(1)
      })
      expect(d.onProjectsMutated).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})
