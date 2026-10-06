// workbench-bridge 单测 —— 官方面板导航窄面桥 + 知识抽屉缝（fix-25 形态）。
// createWorkbenchBridge：nav 闭包透传 + 抽屉目标 store（身份稳定快照 + 订阅通知）+ 页内
// 全局发布；openKnowledgeEntry = 跳转复合动作（进知识面板 + 抽屉定位）。
import { describe, expect, it, vi } from 'vitest'
import {
  createWorkbenchBridge,
  initialOverviewContext,
  publishWorkbenchBridge,
  workbenchBridge,
  type ForgeWorkbenchSnapshot,
} from './workbench-bridge.js'

/** 概览上下文缺省（快照 pin 的常量面——避免逐字面量漂移） */
const INITIAL = initialOverviewContext()

function navSpy() {
  return { showKnowledge: vi.fn(), showSession: vi.fn() }
}

describe('createWorkbenchBridge（工厂 + 发布一体）', () => {
  it('nav 闭包透传：showKnowledge/showSession 直达官方 selectPanel 窄面', () => {
    const nav = navSpy()
    createWorkbenchBridge(nav)
    const bridge = workbenchBridge()
    expect(bridge).toBeDefined()
    bridge!.showKnowledge()
    expect(nav.showKnowledge).toHaveBeenCalledTimes(1)
    bridge!.showSession()
    expect(nav.showSession).toHaveBeenCalledTimes(1)
    publishWorkbenchBridge(undefined)
  })

  it('openKnowledgeEntry = 跳转复合动作（进知识面板 + 抽屉定位 + 订阅通知）', () => {
    const nav = navSpy()
    const bridge = createWorkbenchBridge(nav)
    const seen: ForgeWorkbenchSnapshot[] = []
    const dispose = bridge.subscribe(() => {
      seen.push(bridge.getSnapshot())
    })
    bridge.openKnowledgeEntry(42)
    expect(nav.showKnowledge).toHaveBeenCalledTimes(1)
    expect(bridge.getSnapshot()).toEqual({ drawerEntryId: 42, overview: INITIAL })
    expect(seen).toEqual([{ drawerEntryId: 42, overview: INITIAL }])
    dispose()
    publishWorkbenchBridge(undefined)
  })

  it('setDrawerEntry：写回（等值 no-op 不通知；变更通知）；快照身份稳定（未变更恒同引用）', () => {
    const nav = navSpy()
    const bridge = createWorkbenchBridge(nav)
    const first = bridge.getSnapshot()
    bridge.setDrawerEntry(7)
    expect(bridge.getSnapshot()).toEqual({ drawerEntryId: 7, overview: INITIAL })
    const second = bridge.getSnapshot()
    let notified = 0
    const dispose = bridge.subscribe(() => {
      notified += 1
    })
    bridge.setDrawerEntry(7)
    expect(notified).toBe(0)
    expect(bridge.getSnapshot()).toBe(second)
    expect(second).not.toBe(first)
    bridge.setDrawerEntry(null)
    expect(bridge.getSnapshot()).toEqual({ drawerEntryId: null, overview: INITIAL })
    expect(notified).toBe(1)
    dispose()
    publishWorkbenchBridge(undefined)
  })

  it('setOverviewContext（4.1 概览上下文缝）：写回（等值 no-op 不通知；变更通知 + 抽屉面保持）', () => {
    const nav = navSpy()
    const bridge = createWorkbenchBridge(nav)
    expect(bridge.getSnapshot().overview).toEqual({ projectId: null }) // 缺省无锚
    let notified = 0
    const dispose = bridge.subscribe(() => {
      notified += 1
    })
    bridge.setOverviewContext({ projectId: 'p1', sessionCount: 3 })
    expect(bridge.getSnapshot().overview).toEqual({ projectId: 'p1', sessionCount: 3 })
    expect(bridge.getSnapshot().drawerEntryId).toBeNull() // 双缝独立——抽屉面不被概览写回扰动
    expect(notified).toBe(1)
    bridge.setOverviewContext({ projectId: 'p1', sessionCount: 3 })
    expect(notified).toBe(1) // 等值幂等不通知（ShellHost 每渲染效应写回不刷屏）
    bridge.setOverviewContext({ projectId: 'p1', sessionCount: 4 })
    expect(notified).toBe(2)
    dispose()
    publishWorkbenchBridge(undefined)
  })

  it('workbenchBridge 读取器：在场透传 / 缺席 undefined', () => {
    const g = globalThis as { __DSH_FORGE_WORKBENCH__?: unknown }
    const prev = g.__DSH_FORGE_WORKBENCH__
    delete g.__DSH_FORGE_WORKBENCH__
    expect(workbenchBridge()).toBeUndefined()
    const bridge = createWorkbenchBridge(navSpy())
    expect(workbenchBridge()).toBe(bridge)
    publishWorkbenchBridge(undefined)
    expect(workbenchBridge()).toBeUndefined()
    if (prev === undefined) delete g.__DSH_FORGE_WORKBENCH__
    else g.__DSH_FORGE_WORKBENCH__ = prev
  })
})
