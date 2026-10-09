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

/** 全快照缺省（m3.1 D23 扩两缝：drawerTaskId/transitionFocus——快照 pin 的常量面） */
const INITIAL_SNAPSHOT: ForgeWorkbenchSnapshot = {
  drawerEntryId: null,
  overview: INITIAL,
  taskFocus: null,
  drawerTaskId: null,
  transitionFocus: null,
}

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
    expect(bridge.getSnapshot()).toEqual({ ...INITIAL_SNAPSHOT, drawerEntryId: 42 })
    expect(seen).toEqual([{ ...INITIAL_SNAPSHOT, drawerEntryId: 42 }])
    dispose()
    publishWorkbenchBridge(undefined)
  })

  it('setDrawerEntry：写回（等值 no-op 不通知；变更通知）；快照身份稳定（未变更恒同引用）', () => {
    const nav = navSpy()
    const bridge = createWorkbenchBridge(nav)
    const first = bridge.getSnapshot()
    bridge.setDrawerEntry(7)
    expect(bridge.getSnapshot()).toEqual({ ...INITIAL_SNAPSHOT, drawerEntryId: 7 })
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
    expect(bridge.getSnapshot()).toEqual(INITIAL_SNAPSHOT)
    expect(notified).toBe(1)
    dispose()
    publishWorkbenchBridge(undefined)
  })

  it('setOverviewContext（4.1 概览上下文缝）：写回（等值 no-op 不通知；变更通知 + 抽屉面保持）', () => {
    const nav = navSpy()
    const bridge = createWorkbenchBridge(nav)
    expect(bridge.getSnapshot().overview).toEqual({ projectId: null, workspaceId: null }) // 缺省无锚
    let notified = 0
    const dispose = bridge.subscribe(() => {
      notified += 1
    })
    bridge.setOverviewContext({ projectId: 'p1', workspaceId: 'w-1', sessionCount: 3 })
    expect(bridge.getSnapshot().overview).toEqual({ projectId: 'p1', workspaceId: 'w-1', sessionCount: 3 })
    expect(bridge.getSnapshot().drawerEntryId).toBeNull() // 双缝独立——抽屉面不被概览写回扰动
    expect(notified).toBe(1)
    bridge.setOverviewContext({ projectId: 'p1', workspaceId: 'w-1', sessionCount: 3 })
    expect(notified).toBe(1) // 等值幂等不通知（ShellHost 每渲染效应写回不刷屏）
    bridge.setOverviewContext({ projectId: 'p1', workspaceId: 'w-1', sessionCount: 4 })
    expect(notified).toBe(2)
    dispose()
    publishWorkbenchBridge(undefined)
  })

  it('openTaskFocus 任务聚焦缝（4.2 UF-3 流程 7）：写快照 + 订阅通知；nonce 单调自增（同载荷重复点击也重聚焦）', () => {
    const nav = navSpy()
    const bridge = createWorkbenchBridge(nav)
    expect(bridge.getSnapshot().taskFocus).toBeNull() // 缺省无聚焦
    let notified = 0
    const seen: ForgeWorkbenchSnapshot[] = []
    const dispose = bridge.subscribe(() => {
      notified += 1
      seen.push(bridge.getSnapshot())
    })
    bridge.openTaskFocus({ taskId: 't-1', featureSlug: 'm2-pipeline' })
    expect(bridge.getSnapshot().taskFocus).toEqual({ taskId: 't-1', featureSlug: 'm2-pipeline', nonce: 1 })
    // 多缝独立：知识抽屉目标与概览上下文不被聚焦写回扰动
    expect(bridge.getSnapshot().drawerEntryId).toBeNull()
    expect(bridge.getSnapshot().overview).toEqual(INITIAL)
    expect(notified).toBe(1)
    // 同载荷重复点击 → nonce 自增恒通知（重复聚焦重开抽屉——consume 语义归消费侧 nonce 对照）
    bridge.openTaskFocus({ taskId: 't-1', featureSlug: 'm2-pipeline' })
    expect(bridge.getSnapshot().taskFocus).toEqual({ taskId: 't-1', featureSlug: 'm2-pipeline', nonce: 2 })
    expect(notified).toBe(2)
    expect(seen[1]!.taskFocus!.nonce).toBeGreaterThan(seen[0]!.taskFocus!.nonce)
    // 快照身份稳定注记不适用本缝（nonce 恒新——身份恒变是语义本体）
    dispose()
    publishWorkbenchBridge(undefined)
  })

  it('openTaskDrawer/closeTaskDrawer 任务弹窗缝（m3.1 D21/D23）：开/关写快照（幂等 no-op 不通知）；聚焦/转移缝独立', () => {
    const nav = navSpy()
    const bridge = createWorkbenchBridge(nav)
    expect(bridge.getSnapshot().drawerTaskId).toBeNull() // 缺省关闭
    let notified = 0
    const dispose = bridge.subscribe(() => {
      notified += 1
    })
    bridge.openTaskDrawer('t-7')
    expect(bridge.getSnapshot().drawerTaskId).toBe('t-7')
    expect(notified).toBe(1)
    // 幂等：同任务重开（消费侧单例换内容语义）不通知
    bridge.openTaskDrawer('t-7')
    expect(notified).toBe(1)
    // 切换任务（单例原位换内容）= 变更通知
    bridge.openTaskDrawer('t-8')
    expect(bridge.getSnapshot().drawerTaskId).toBe('t-8')
    expect(notified).toBe(2)
    // 关闭（幂等）
    bridge.closeTaskDrawer()
    expect(bridge.getSnapshot().drawerTaskId).toBeNull()
    expect(notified).toBe(3)
    bridge.closeTaskDrawer()
    expect(notified).toBe(3)
    // 缝独立：taskFocus/transitionFocus 不被弹窗写回扰动
    bridge.openTaskFocus({ taskId: 't-7', featureSlug: 'f' })
    bridge.openTaskTransition({ taskId: 't-7' })
    expect(bridge.getSnapshot().taskFocus).toEqual({ taskId: 't-7', featureSlug: 'f', nonce: 1 })
    expect(bridge.getSnapshot().transitionFocus).toEqual({ taskId: 't-7', featureSlug: '', nonce: 1 })
    expect(bridge.getSnapshot().drawerTaskId).toBeNull()
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
