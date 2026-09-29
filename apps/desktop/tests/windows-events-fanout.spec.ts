// 任务 4.2 — 壳推送按 webContents fan-out 单测(tech-design §Interfaces·
// Interface 5「事件推送按 webContents fan-out(订阅登记逐窗;destroyed 自动
// 退订)」;AC-3)。
//
// 泛化语义:update-state / recovery-state / window-changed 等壳推送从
// 「仅主窗」泛化为「主窗 + detached 逐存活 webContents 直发」。M1 行为
// 不变面:仅主窗在场时,同通道、同载荷、恰好一次 —— 与旧 pushToRenderer
// 逐字等价;destroyed 目标静默跳过(渲染层经 getState 拉动词追平)。
// workbench 事件批量通道的逐窗订阅/退订面(createWorkbenchEventSubscriptions)
// 本就多订阅者 + destroyed 钩子 —— detached 窗经同一 subscribe 动词入册,
// 此处以回归断言钉住该面在双窗语义下依旧成立。

import { describe, expect, it } from 'vitest'
import { createWindowPushFanout, type PushTarget } from '../src/main/windows/events-fanout.ts'
import { createWindowRegistry } from '../src/main/windows/registry.ts'
import { createWorkbenchEventSubscriptions, type WorkbenchEventSender } from '../src/main/workbench/ipc/handlers.ts'
import { WORKBENCH_EVENT_CHANNEL } from '../src/main/workbench/ipc/channel-allowlist.ts'

function fakeTarget(state: { destroyed?: boolean } = {}): PushTarget & { sent: Array<[string, unknown]> } {
  const target: PushTarget & { sent: Array<[string, unknown]> } = {
    sent: [],
    isDestroyed: () => state.destroyed ?? false,
    send: (channel: string, payload: unknown) => { target.sent.push([channel, payload]) },
  }
  return target
}

describe('createWindowPushFanout — per-webContents shell pushes', () => {
  it('delivers to every live target with identical channel+payload', () => {
    const main = fakeTarget()
    const detachedA = fakeTarget()
    const detachedB = fakeTarget()
    const fanout = createWindowPushFanout({ targets: () => [main, detachedA, detachedB] })

    fanout.push('dsh-forge:update-state', { phase: 'shown', version: '1.2.3' })

    for (const target of [main, detachedA, detachedB]) {
      expect(target.sent).toEqual([['dsh-forge:update-state', { phase: 'shown', version: '1.2.3' }]])
    }
  })

  it('main-only registry = byte-stable M1 behavior (one window, one send)', () => {
    const main = fakeTarget()
    const fanout = createWindowPushFanout({ targets: () => [main] })
    fanout.push('dsh-forge:recovery-state', { state: 'restarting' })
    expect(main.sent).toEqual([['dsh-forge:recovery-state', { state: 'restarting' }]])
  })

  it('silently skips destroyed targets (no crash, no partial delivery to the dead)', () => {
    const main = fakeTarget()
    const dead = fakeTarget({ destroyed: true })
    const alive = fakeTarget()
    const fanout = createWindowPushFanout({ targets: () => [main, dead, alive] })
    fanout.push('dsh-forge:window-changed', { type: 'detached-opened' })
    expect(dead.sent).toEqual([])
    expect(main.sent).toHaveLength(1)
    expect(alive.sent).toHaveLength(1)
  })

  it('empty target set is a no-op (registry drained mid-push)', () => {
    const fanout = createWindowPushFanout({ targets: () => [] })
    expect(() => fanout.push('dsh-forge:toast', 'x')).not.toThrow()
  })

  it('targets resolve per push (windows opened/closed between pushes are reflected)', () => {
    const main = fakeTarget()
    const targets: PushTarget[] = [main]
    const fanout = createWindowPushFanout({ targets: () => targets })
    fanout.push('dsh-forge:toast', 'one')
    const detached = fakeTarget()
    targets.push(detached)
    fanout.push('dsh-forge:toast', 'two')
    expect(main.sent).toHaveLength(2)
    expect(detached.sent).toEqual([['dsh-forge:toast', 'two']])
  })
})

describe('registry-backed fan-out (production wiring shape)', () => {
  it('liveWebContents feeds the fan-out: main + detached receive, closed detached drops out', () => {
    const registry = createWindowRegistry()
    const seen: Array<Array<[string, unknown]>> = []
    const mkContents = (id: number, destroyed = false) => ({
      id,
      isDestroyed: () => destroyed,
      send: (channel: string, payload: unknown) => { seen.push([[channel, payload]]) },
    })
    const main = { isDestroyed: () => false, webContents: mkContents(1) }
    const detachedWindow = { isDestroyed: () => false, webContents: mkContents(2) }
    registry.setMainWindow(main)
    registry.addDetached({ windowId: 'detached-1', projectId: 'p-1', view: 'board' as const, window: detachedWindow })

    const fanout = createWindowPushFanout({ targets: () => registry.liveWebContents() })
    fanout.push('dsh-forge:window-changed', { type: 'detached-opened', windowId: 'detached-1' })
    expect(seen).toHaveLength(2)

    // detached 关闭('closed' 编排移除)后:推送面收缩回主窗单发。
    registry.removeDetached('detached-1')
    seen.length = 0
    fanout.push('dsh-forge:window-changed', { type: 'detached-closed', windowId: 'detached-1' })
    expect(seen).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// workbench 事件通道的逐窗订阅面(detached 同册;回归钉)
// ---------------------------------------------------------------------------

function fakeSender(): WorkbenchEventSender & {
  sent: Array<[string, unknown]>
  destroy(): void
} {
  const destroyedListeners: Array<() => void> = []
  let destroyed = false
  const sender: WorkbenchEventSender & { sent: Array<[string, unknown]>; destroy(): void } = {
    sent: [],
    isDestroyed: () => destroyed,
    // 订阅面的生产调用形态 = send(channel, batch)(单载荷;与
    // workbench-ipc.spec 的 fakeSender 同款记录口径)。
    send: (channel: string, payload: unknown) => { sender.sent.push([channel, payload]) },
    once: (_event, listener) => { destroyedListeners.push(listener) },
    destroy: () => {
      destroyed = true
      for (const listener of [...destroyedListeners]) listener()
    },
  }
  return sender
}

describe('workbench event subscriptions — multi-window fan-out & destroyed unsubscribe', () => {
  it('main and a detached window both subscribe and both receive the batch', () => {
    const subs = createWorkbenchEventSubscriptions()
    const main = fakeSender()
    const detached = fakeSender()
    subs.subscribe(main)
    subs.subscribe(detached)
    expect(subs.size).toBe(2)

    const batch = [{ type: 'project_list_changed' }]
    subs.sink(batch)
    expect(main.sent).toEqual([[WORKBENCH_EVENT_CHANNEL, batch]])
    expect(detached.sent).toEqual([[WORKBENCH_EVENT_CHANNEL, batch]])
  })

  it('a destroyed window auto-unsubscribes; the surviving windows keep receiving', () => {
    const subs = createWorkbenchEventSubscriptions()
    const main = fakeSender()
    const detached = fakeSender()
    subs.subscribe(main)
    subs.subscribe(detached)

    detached.destroy()
    expect(subs.size).toBe(1)

    const batch = [{ type: 'sync', projectId: 'p-1' }]
    subs.sink(batch)
    expect(detached.sent).toEqual([])
    expect(main.sent).toEqual([[WORKBENCH_EVENT_CHANNEL, batch]])
  })

  it('sink sweeps a destroyed-but-unhooked sender defensively (second fence)', () => {
    const subs = createWorkbenchEventSubscriptions()
    const stale = fakeSender()
    subs.subscribe(stale)
    // 模拟 destroyed 钩子未及执行(极端时序):isDestroyed 已真,钩子未跑。
    ;(stale as unknown as { isDestroyed: () => boolean }).isDestroyed = () => true
    subs.sink([{ type: 'project_list_changed' }])
    expect(stale.sent).toEqual([])
    expect(subs.size).toBe(0)
  })
})
