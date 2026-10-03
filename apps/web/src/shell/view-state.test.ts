// shell/view-state 单测 —— 视图态机骨架转移表 pin（SC1 互换 / SC8 右栏隐藏恢复、页签跟随）。
// zones/（2.5）消费本态机；此处 pin 转移语义不变式。
import { describe, expect, it } from 'vitest'
import { createShellViewState, dispatchShellView } from './view-state.js'

describe('初始态', () => {
  it('会话视图 + 右栏收起（UF-7 默认轨道归零） + 无锚 + 无显式偏好', () => {
    expect(createShellViewState()).toEqual({
      center: 'session',
      rightDock: false,
      rightDockPreference: null,
      focus: { projectId: null, sessionId: null },
    })
  })
})

describe('SC8 知识模式右栏隐藏/恢复', () => {
  it('进知识视图右栏强制隐藏（已展开也隐藏，偏好不被联动改写）；回会话按记忆恢复原展开态', () => {
    let s = createShellViewState()
    s = dispatchShellView(s, { type: 'toggle-right-dock' })
    expect(s.rightDock).toBe(true)
    s = dispatchShellView(s, { type: 'show-knowledge' })
    expect(s.center).toBe('knowledge')
    expect(s.rightDock).toBe(false)
    expect(s.rightDockPreference).toBe(true)
    s = dispatchShellView(s, { type: 'show-session' })
    expect(s.center).toBe('session')
    expect(s.rightDock).toBe(true)
  })
  it('从未显式切换：往返知识视图保持默认收起（恢复口径 = 偏好 ?? false）', () => {
    let s = createShellViewState()
    s = dispatchShellView(s, { type: 'show-knowledge' })
    s = dispatchShellView(s, { type: 'show-session' })
    expect(s.rightDock).toBe(false)
  })
  it('知识视图内手动开启 = 显式偏好，回会话保留', () => {
    let s = createShellViewState()
    s = dispatchShellView(s, { type: 'show-knowledge' })
    s = dispatchShellView(s, { type: 'toggle-right-dock' })
    expect(s.rightDock).toBe(true)
    expect(s.rightDockPreference).toBe(true)
    s = dispatchShellView(s, { type: 'show-session' })
    expect(s.rightDock).toBe(true)
  })
  it('会话视图手动展开再收起 = 显式偏好 false，往返知识视图后保留', () => {
    let s = createShellViewState()
    s = dispatchShellView(s, { type: 'toggle-right-dock' })
    s = dispatchShellView(s, { type: 'toggle-right-dock' })
    expect(s.rightDock).toBe(false)
    expect(s.rightDockPreference).toBe(false)
    s = dispatchShellView(s, { type: 'show-knowledge' })
    s = dispatchShellView(s, { type: 'show-session' })
    expect(s.rightDock).toBe(false)
  })
})

describe('页签跟随与锚', () => {
  it('select-project 更新项目锚且不切视图（选择 ≠ 导航）', () => {
    let s = dispatchShellView(createShellViewState(), { type: 'show-knowledge' })
    s = dispatchShellView(s, { type: 'select-project', projectId: 'p1' })
    expect(s.center).toBe('knowledge')
    expect(s.focus.projectId).toBe('p1')
  })
  it('项目锚跨视图保留（SC8 页签跟随项目）', () => {
    let s = dispatchShellView(createShellViewState(), { type: 'select-project', projectId: 'p1' })
    s = dispatchShellView(s, { type: 'show-knowledge' })
    s = dispatchShellView(s, { type: 'show-session' })
    expect(s.focus.projectId).toBe('p1')
  })
  it('select-session 锚定会话并回 session 视图；clear-session 置空锚但不切视图', () => {
    let s = dispatchShellView(createShellViewState(), { type: 'show-knowledge' })
    s = dispatchShellView(s, { type: 'select-session', sessionId: 's1' })
    expect(s.center).toBe('session')
    expect(s.focus.sessionId).toBe('s1')
    s = dispatchShellView(s, { type: 'clear-session' })
    expect(s.focus.sessionId).toBeNull()
    expect(s.center).toBe('session')
  })
  it('select-session 回会话视图右栏按偏好恢复（fix-11：与 show-session 同径——知识视图隐藏后会话行切回不得钉在收起态）', () => {
    // 展开偏好 → 知识视图（强制隐藏）→ 会话行切回 = 恢复展开
    let s = dispatchShellView(createShellViewState(), { type: 'toggle-right-dock' })
    s = dispatchShellView(s, { type: 'show-knowledge' })
    expect(s.rightDock).toBe(false)
    s = dispatchShellView(s, { type: 'select-session', sessionId: 's1' })
    expect(s.center).toBe('session')
    expect(s.rightDock).toBe(true)
    // 无显式偏好（默认收起）→ 切回保持收起
    let t = dispatchShellView(createShellViewState(), { type: 'show-knowledge' })
    t = dispatchShellView(t, { type: 'select-session', sessionId: 's2' })
    expect(t.rightDock).toBe(false)
  })
})
