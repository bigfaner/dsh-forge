// sidebar-actions 单测 —— 导航动作绑定（AC3 知识库入口 → show-knowledge；AC5 会话行 →
// openSession + select-session 不重置其它视图态）。桥缺席 = fail-soft（AC3 半边 no-op 不抛）。
import { describe, expect, it, vi } from 'vitest'
import { sidebarActions, workbenchBridge, type WorkbenchBridge } from './sidebar-actions.js'

function fakeBridge(): WorkbenchBridge & { events: unknown[] } {
  const events: unknown[] = []
  return { events, dispatch: (event) => { events.push(event) } }
}

describe('sidebarActions（导航绑定）', () => {
  it('知识库入口 → dispatch show-knowledge（AC3）', () => {
    const bridge = fakeBridge()
    const openSession = vi.fn()
    sidebarActions(openSession, bridge).onOpenKnowledge()
    expect(bridge.events).toEqual([{ type: 'show-knowledge' }])
    expect(openSession).not.toHaveBeenCalled()
  })

  it('会话行 → openSession + dispatch select-session（AC5：回会话视图 + 锚定）', () => {
    const bridge = fakeBridge()
    const openSession = vi.fn()
    sidebarActions(openSession, bridge).onSessionActivate('s-1')
    expect(openSession).toHaveBeenCalledWith('s-1')
    expect(bridge.events).toEqual([{ type: 'select-session', sessionId: 's-1' }])
  })

  it('桥缺席：知识入口 no-op 不抛（warn）；会话仍打开（dsh 面不依赖桥）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const openSession = vi.fn()
    const actions = sidebarActions(openSession, undefined)
    expect(() => actions.onOpenKnowledge()).not.toThrow()
    actions.onSessionActivate('s-2')
    expect(openSession).toHaveBeenCalledWith('s-2')
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})

describe('workbenchBridge（全局挂点读取）', () => {
  it('读 __DSH_FORGE_WORKBENCH__（在场透传 / 缺席 undefined）', () => {
    const g = globalThis as { __DSH_FORGE_WORKBENCH__?: WorkbenchBridge }
    const prev = g.__DSH_FORGE_WORKBENCH__
    const bridge = fakeBridge()
    g.__DSH_FORGE_WORKBENCH__ = bridge
    expect(workbenchBridge()).toBe(bridge)
    delete g.__DSH_FORGE_WORKBENCH__
    expect(workbenchBridge()).toBeUndefined()
    if (prev === undefined) delete g.__DSH_FORGE_WORKBENCH__
    else g.__DSH_FORGE_WORKBENCH__ = prev
  })
})
