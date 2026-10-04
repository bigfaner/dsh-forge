// sidebar-actions 单测 —— 导航动作绑定（AC5 会话行 → openSession 官方面单径）。
// fix-25：知识入口迁官方 sidebar.panellist 行（PanelRow → layout.selectPanel），本模块
// 随收缩——桥消费面（workbenchBridge 读取器）迁 workbench/workbench-bridge 测试。
import { describe, expect, it, vi } from 'vitest'
import { sidebarActions } from './sidebar-actions.js'

describe('sidebarActions（导航绑定）', () => {
  it('会话行 → openSession（官方 uiWorkspace.openSession 单径——选择+呈现+回会话面板一体）', () => {
    const openSession = vi.fn()
    sidebarActions(openSession).onSessionActivate('s-1')
    expect(openSession).toHaveBeenCalledWith('s-1')
  })
})
