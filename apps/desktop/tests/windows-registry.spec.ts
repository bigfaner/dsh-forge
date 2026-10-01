// 任务 4.2 — 壳层窗口注册表单测(tech-design §Interfaces·Interface 5
// 「窗口注册表(主窗 + detached 集)」;AC-1 的记账面)。
//
// 纯 DI 面(零 Electron):主窗 set/get、detached 增删查、destroyed 活性
// 过滤、项目域过滤、liveWebContents/liveWebContentsIds(fan-out 与 WS 逐窗
// 注册的输入面)。'closed' 编排(移除 + 事件)归 detached.ts,本 spec 只
// 钉记账语义。

import { describe, expect, it } from 'vitest'
import { createWindowRegistry, type RegistryWindow } from '../src/main/windows/registry.ts'

let contentsSeq = 0

function fakeContents(): { id: number; sent: Array<[string, unknown]>; isDestroyed(): boolean } {
  return {
    id: ++contentsSeq,
    sent: [],
    isDestroyed: () => false,
  }
}

function fakeWindow(state: { destroyed?: boolean } = {}): RegistryWindow & { contents: ReturnType<typeof fakeContents> } {
  const contents = fakeContents()
  return {
    contents,
    isDestroyed: () => state.destroyed ?? false,
    webContents: {
      id: contents.id,
      isDestroyed: () => state.destroyed ?? false,
      send: (channel: string, payload: unknown) => { contents.sent.push([channel, payload]) },
    },
  }
}

describe('window registry — main window bookkeeping', () => {
  it('stores and returns the main window; undefined stays undefined', () => {
    const registry = createWindowRegistry()
    expect(registry.getMainWindow()).toBeUndefined()
    const win = fakeWindow()
    registry.setMainWindow(win)
    expect(registry.getMainWindow()).toBe(win)
    registry.setMainWindow(undefined)
    expect(registry.getMainWindow()).toBeUndefined()
  })

  it('filters a destroyed main window out of reads', () => {
    const registry = createWindowRegistry()
    const win = fakeWindow()
    registry.setMainWindow(win)
    win.isDestroyed = () => true
    expect(registry.getMainWindow()).toBeUndefined()
    expect(registry.liveWebContents()).toEqual([])
  })

  it('re-registering a fresh main window replaces the stale one', () => {
    const registry = createWindowRegistry()
    const stale = fakeWindow()
    registry.setMainWindow(stale)
    const fresh = fakeWindow()
    registry.setMainWindow(fresh)
    expect(registry.getMainWindow()).toBe(fresh)
    expect(registry.liveWebContentsIds()).toEqual(new Set([fresh.webContents.id]))
  })
})

describe('window registry — detached set (add/remove/query)', () => {
  it('adds, queries and removes detached entries by windowId', () => {
    const registry = createWindowRegistry()
    const entry = { windowId: 'detached-1', projectId: 'p-1', view: 'board' as const, window: fakeWindow() }
    registry.addDetached(entry)
    expect(registry.getDetached('detached-1')).toBe(entry)
    expect(registry.listDetached()).toEqual([entry])

    expect(registry.removeDetached('detached-1')).toBe(entry)
    expect(registry.removeDetached('detached-1')).toBeUndefined() // 二次移除 = 无事发生(事件恰好一次的根基)
    expect(registry.getDetached('detached-1')).toBeUndefined()
    expect(registry.listDetached()).toEqual([])
  })

  it('same windowId re-add overwrites the previous entry', () => {
    const registry = createWindowRegistry()
    const first = { windowId: 'w', projectId: 'p-1', view: 'board' as const, window: fakeWindow() }
    const second = { windowId: 'w', projectId: 'p-2', view: 'conversation' as const, window: fakeWindow() }
    registry.addDetached(first)
    registry.addDetached(second)
    expect(registry.getDetached('w')).toBe(second)
    expect(registry.listDetached()).toHaveLength(1)
  })

  it('a destroyed detached window reads as absent and is filtered from listings', () => {
    const registry = createWindowRegistry()
    const entry = { windowId: 'detached-1', projectId: 'p-1', view: 'board' as const, window: fakeWindow() }
    registry.addDetached(entry)
    entry.window.isDestroyed = () => true
    expect(registry.getDetached('detached-1')).toBeUndefined()
    expect(registry.listDetached()).toEqual([])
    expect(registry.listDetachedByProject('p-1')).toEqual([])
  })

  it('filters detached entries by project (removeProject 关窗 hook 的输入面)', () => {
    const registry = createWindowRegistry()
    const a1 = { windowId: 'w1', projectId: 'p-a', view: 'board' as const, window: fakeWindow() }
    const a2 = { windowId: 'w2', projectId: 'p-a', view: 'conversation' as const, window: fakeWindow() }
    const b1 = { windowId: 'w3', projectId: 'p-b', view: 'board' as const, window: fakeWindow() }
    for (const entry of [a1, a2, b1]) registry.addDetached(entry)
    expect(registry.listDetachedByProject('p-a')).toEqual([a1, a2])
    expect(registry.listDetachedByProject('p-b')).toEqual([b1])
    expect(registry.listDetachedByProject('p-c')).toEqual([])
  })
})

describe('window registry — live webContents view (fan-out / WS registration input)', () => {
  it('includes main + all detached live webContents', () => {
    const registry = createWindowRegistry()
    const main = fakeWindow()
    registry.setMainWindow(main)
    const d1 = { windowId: 'w1', projectId: 'p-1', view: 'board' as const, window: fakeWindow() }
    const d2 = { windowId: 'w2', projectId: 'p-1', view: 'conversation' as const, window: fakeWindow() }
    registry.addDetached(d1)
    registry.addDetached(d2)
    expect(registry.liveWebContents().map(contents => contents.id)).toEqual([
      main.webContents.id,
      d1.window.webContents.id,
      d2.window.webContents.id,
    ])
    expect(registry.liveWebContentsIds()).toEqual(new Set([
      main.webContents.id,
      d1.window.webContents.id,
      d2.window.webContents.id,
    ]))
  })

  it('main-only registry answers a singleton id set (M1 行为不变的输入面)', () => {
    const registry = createWindowRegistry()
    const main = fakeWindow()
    registry.setMainWindow(main)
    expect(registry.liveWebContentsIds()).toEqual(new Set([main.webContents.id]))
  })
})
