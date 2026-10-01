// zones/dock 单测 —— UF-7 页签跟随纯逻辑 pin：可见集口径（当前项目 + 全局页签）、
// 登记表 fail-loud/幂等语义、激活页签回落与恢复（推导即跟随——切项目换集、切回恢复）。
import { describe, expect, it } from 'vitest'
import {
  globalDockTab,
  projectDockTab,
  registerDockTab,
  resolveActiveDockTab,
  unregisterDockTab,
  visibleDockTabs,
  type DockTabSet,
} from './dock.js'

const tabs: DockTabSet = [
  globalDockTab('start', '开始'),
  projectDockTab('p1', 'doc-p1', 'P1 文档'),
  projectDockTab('p2', 'doc-p2', 'P2 文档'),
  globalDockTab('help', '帮助'),
]

describe('可见集口径（UF-7 Validation：可见 = 当前项目页签 + 全局页签）', () => {
  it('当前项目锚：全局页签常驻可见 + 仅本项目页签（注册序），他项目页签不可见', () => {
    expect(visibleDockTabs(tabs, 'p1').map((t) => t.id)).toEqual(['start', 'doc-p1', 'help'])
    expect(visibleDockTabs(tabs, 'p2').map((t) => t.id)).toEqual(['start', 'doc-p2', 'help'])
  })
  it('无项目锚（null）：仅全局页签', () => {
    expect(visibleDockTabs(tabs, null).map((t) => t.id)).toEqual(['start', 'help'])
  })
  it('页签集为推导值：切项目换集、切回恢复（同锚同集）', () => {
    const atP1 = visibleDockTabs(tabs, 'p1').map((t) => t.id)
    const afterRound = visibleDockTabs(visibleDockTabs(tabs, 'p2') && tabs, 'p1').map((t) => t.id)
    expect(afterRound).toEqual(atP1)
  })
})

describe('登记表语义', () => {
  it('registerDockTab 追加保注册序；id 重复即拒（fail-loud）', () => {
    const set = registerDockTab([], globalDockTab('a', 'A'))
    expect(set.map((t) => t.id)).toEqual(['a'])
    expect(() => registerDockTab(set, projectDockTab('p1', 'a', '重复'))).toThrow(/重复登记.*a/)
  })
  it('unregisterDockTab 幂等过滤（缺席 = 无操作）', () => {
    const set = unregisterDockTab(registerDockTab([], projectDockTab('p1', 'x', 'X')), 'x')
    expect(set).toEqual([])
    expect(unregisterDockTab(set, 'x')).toEqual([])
  })
})

describe('激活页签推导（回落与恢复）', () => {
  it('无显式选择 → 首个可见页签；空集 → null', () => {
    const p1 = visibleDockTabs(tabs, 'p1')
    expect(resolveActiveDockTab(p1, null)?.id).toBe('start')
    expect(resolveActiveDockTab([], null)).toBeNull()
  })
  it('显式选择仍在可见集 → 保持；选择随他项目（不可见）→ 回落首个可见', () => {
    const p1 = visibleDockTabs(tabs, 'p1')
    const p2 = visibleDockTabs(tabs, 'p2')
    expect(resolveActiveDockTab(p1, 'doc-p1')?.id).toBe('doc-p1')
    expect(resolveActiveDockTab(p2, 'doc-p1')?.id).toBe('start')
  })
  it('切回原项目 → 原选择恢复（推导保留选择态）', () => {
    const againP1 = visibleDockTabs(tabs, 'p1')
    expect(resolveActiveDockTab(againP1, 'doc-p1')?.id).toBe('doc-p1')
  })
})
