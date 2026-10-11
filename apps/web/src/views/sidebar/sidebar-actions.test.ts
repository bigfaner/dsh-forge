// sidebar-actions 单测 —— 导航/变更动作绑定（AC5 会话行 → openSession 官方面单径；
// fix-42：新会话 → startSession 官方面；改名/归档切换 → forge:projects/update patch 面
// + 变更后静默重拉）。失败面：改名失败原样上抛（模态呈现）；归档 fail-soft 吞错。
// D45 增面：会话行动作（置顶/归档/取消归档/分叉/改名）→ 官方 uiWorkspace/sessions 窄面；
// 置顶/取消归档/分叉 = fire-and-forget fail-soft；归档/会话改名 = Promise 原样上抛
// （面板确认流/改名模态消费）；sessionArchiveActiveRefusal = 官方 activeSessionRefusal
// 同判（类身份按 name + rpcError.code）。
import { describe, expect, it, vi } from 'vitest'
import { sessionArchiveActiveRefusal, sidebarActions, type SidebarActionDeps } from './sidebar-actions.js'

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

describe('sidebarActions D45（会话行动作——官方 uiWorkspace/sessions 窄面绑定）', () => {
  it('置顶切换：pinned 位分派 pin/unarchive 官方面（false → unpinSession）', async () => {
    const d = deps({
      pinSession: vi.fn().mockResolvedValue(undefined),
      unpinSession: vi.fn().mockResolvedValue(undefined),
    })
    sidebarActions(d).onSessionPinToggle('s-1', true)
    expect(d.pinSession).toHaveBeenCalledWith('s-1')
    sidebarActions(d).onSessionPinToggle('s-1', false)
    expect(d.unpinSession).toHaveBeenCalledWith('s-1')
  })

  it('置顶切换：官方面缺席 = no-op（面板对应钮不呈现的绑定面兜底）', () => {
    const d = deps({ pinSession: undefined })
    expect(() => {
      sidebarActions(d).onSessionPinToggle('s-1', true)
    }).not.toThrow()
  })

  it('置顶切换失败 fail-soft 吞错（P1 无行内错误面——控制台告警不炸）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const d = deps({ pinSession: vi.fn().mockRejectedValue(new Error('宿主拒')) })
      expect(() => {
        sidebarActions(d).onSessionPinToggle('s-1', true)
      }).not.toThrow()
      await vi.waitFor(() => {
        expect(warn).toHaveBeenCalledTimes(1)
      })
    } finally {
      warn.mockRestore()
    }
  })

  it('归档会话：Promise 原样返回（面板停止并归档确认流消费——拒绝不上吞）+ stopActivity 透传', async () => {
    const d = deps({
      archiveSession: vi.fn().mockResolvedValue(undefined),
    })
    await sidebarActions(d).onSessionArchive('s-1')
    expect(d.archiveSession).toHaveBeenCalledWith('s-1', undefined)
    await sidebarActions(d).onSessionArchive('s-1', { stopActivity: true })
    expect(d.archiveSession).toHaveBeenCalledWith('s-1', { stopActivity: true })
    // 拒绝原样上抛（面板判 sessionArchiveActiveRefusal 开确认模态）
    const refusal = new Error('workspace/session-active') as Error & { rpcError: { code: string } }
    refusal.name = 'WorkspaceArchiveError'
    refusal.rpcError = { code: 'workspace/session-active' }
    const rejected = deps({ archiveSession: vi.fn().mockRejectedValue(refusal) })
    await expect(sidebarActions(rejected).onSessionArchive('s-2')).rejects.toBe(refusal)
  })

  it('取消归档/分叉：fire-and-forget 直发官方面；失败 fail-soft 吞错', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const d = deps({
        unarchiveSession: vi.fn().mockResolvedValue(undefined),
        forkSession: vi.fn().mockResolvedValue('child-1'),
      })
      sidebarActions(d).onSessionUnarchive('s-1')
      expect(d.unarchiveSession).toHaveBeenCalledWith('s-1')
      sidebarActions(d).onSessionFork('s-1')
      expect(d.forkSession).toHaveBeenCalledWith('s-1')
      const failing = deps({
        unarchiveSession: vi.fn().mockRejectedValue(new Error('载体断')),
        forkSession: vi.fn().mockRejectedValue(new Error('宿主拒')),
      })
      expect(() => {
        sidebarActions(failing).onSessionUnarchive('s-1')
        sidebarActions(failing).onSessionFork('s-1')
      }).not.toThrow()
      await vi.waitFor(() => {
        expect(warn).toHaveBeenCalledTimes(2)
      })
    } finally {
      warn.mockRestore()
    }
  })

  it('会话改名：Promise 原样返回（改名模态呈现拒绝——上抛不吞）', async () => {
    const d = deps({ renameSession: vi.fn().mockResolvedValue(undefined) })
    await sidebarActions(d).onSessionRename('s-1', '新标题')
    expect(d.renameSession).toHaveBeenCalledWith('s-1', '新标题')
    const failure = new Error('改名被拒绝')
    const rejected = deps({ renameSession: vi.fn().mockRejectedValue(failure) })
    await expect(sidebarActions(rejected).onSessionRename('s-1', 'x')).rejects.toBe(failure)
  })

  it('sessionArchiveActiveRefusal：官方 activeSessionRefusal 同判（name 类身份 + rpcError.code）', () => {
    const refusal = new Error('active') as Error & { rpcError: { code: string } }
    refusal.name = 'WorkspaceArchiveError'
    refusal.rpcError = { code: 'workspace/session-active' }
    expect(sessionArchiveActiveRefusal(refusal)).toBe(true)
    const otherCode = new Error('x') as Error & { rpcError: { code: string } }
    otherCode.name = 'WorkspaceArchiveError'
    otherCode.rpcError = { code: 'workspace/not-found' }
    expect(sessionArchiveActiveRefusal(otherCode)).toBe(false)
    expect(sessionArchiveActiveRefusal(new Error('plain'))).toBe(false)
    expect(sessionArchiveActiveRefusal('not an error')).toBe(false)
    expect(sessionArchiveActiveRefusal(null)).toBe(false)
  })
})
