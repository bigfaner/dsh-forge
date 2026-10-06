// 3.1 写推送事件订阅层 pin（交互二「web/rpc 共享订阅层 50ms 合并重取」裁决落点）：
// 50ms 窗合并（latest-wins）/ 窗外独立结算 / 末监听退订拆底层订阅 / preload 面缺席
// 静默降级 no-op（交互重取兜底）/ 监听方异常隔离。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TASKS_CHANGED_COALESCE_MS, createTasksChangedHub, subscribeTasksChanged, type TasksChangedListener, type TasksChangedSubscribe } from './events.js'

/** 底层订阅替身：记录 cb/退订，测试侧 emit 触发 */
function fakeUnderlying() {
  const listeners: TasksChangedListener[] = []
  const unsubscribe = vi.fn()
  const subscribe: TasksChangedSubscribe = (cb) => {
    listeners.push(cb)
    return unsubscribe
  }
  return {
    subscribe,
    unsubscribe,
    emit: (projectId: string): void => {
      for (const listener of listeners) listener({ projectId })
    },
    listenerCount: (): number => listeners.length,
  }
}

describe('createTasksChangedHub · 50ms 合并重取', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('窗内连发合并为一次通知（载荷 latest-wins）——50ms 后结算', () => {
    const underlying = fakeUnderlying()
    const hub = createTasksChangedHub(underlying.subscribe)
    const notified: string[] = []
    hub.subscribe((payload) => notified.push(payload.projectId))
    underlying.emit('p-1')
    underlying.emit('p-2')
    underlying.emit('p-3')
    expect(notified).toEqual([]) // 窗内未结算
    vi.advanceTimersByTime(TASKS_CHANGED_COALESCE_MS)
    expect(notified).toEqual(['p-3']) // 单次 + 最新载荷
  })

  it('窗外再发独立结算（两个 50ms 窗两次通知）', () => {
    const underlying = fakeUnderlying()
    const hub = createTasksChangedHub(underlying.subscribe)
    const notified: string[] = []
    hub.subscribe((payload) => notified.push(payload.projectId))
    underlying.emit('p-1')
    vi.advanceTimersByTime(TASKS_CHANGED_COALESCE_MS)
    vi.advanceTimersByTime(TASKS_CHANGED_COALESCE_MS * 2) // 静默期
    underlying.emit('p-2')
    vi.advanceTimersByTime(TASKS_CHANGED_COALESCE_MS)
    expect(notified).toEqual(['p-1', 'p-2'])
  })

  it('多监听方扇出 + 监听方异常隔离（不阻断其余监听）', () => {
    const underlying = fakeUnderlying()
    const hub = createTasksChangedHub(underlying.subscribe)
    const a: string[] = []
    const b: string[] = []
    hub.subscribe((payload) => a.push(payload.projectId))
    hub.subscribe(() => {
      throw new Error('listener exploded')
    })
    hub.subscribe((payload) => b.push(payload.projectId))
    underlying.emit('p-9')
    vi.advanceTimersByTime(TASKS_CHANGED_COALESCE_MS)
    expect(a).toEqual(['p-9'])
    expect(b).toEqual(['p-9'])
  })

  it('首监听挂底层订阅、末退订拆订阅（无监听零占用；窗内待发载荷弃置）', () => {
    const underlying = fakeUnderlying()
    const hub = createTasksChangedHub(underlying.subscribe)
    expect(underlying.listenerCount()).toBe(0)
    const off1 = hub.subscribe(() => {})
    const off2 = hub.subscribe(() => {})
    expect(underlying.listenerCount()).toBe(1) // 共享单订阅
    underlying.emit('p-1')
    off1()
    expect(underlying.unsubscribe).not.toHaveBeenCalled() // 仍有监听
    off2()
    expect(underlying.unsubscribe).toHaveBeenCalledTimes(1)
    // 末监听已退——pending 载荷不再结算（重新订阅后由新事件起窗）
    const notified: string[] = []
    hub.subscribe((payload) => notified.push(payload.projectId))
    vi.advanceTimersByTime(TASKS_CHANGED_COALESCE_MS * 2)
    expect(notified).toEqual([]) // 弃置的 p-1 未投递
  })
})

describe('subscribeTasksChanged（共享单例入口 + 降级面）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('preload 面在场：订阅生效（事件 → 50ms 合并通知）', () => {
    const underlying = fakeUnderlying()
    vi.stubGlobal('dshForge', { onForgeTasksChanged: underlying.subscribe })
    const notified: string[] = []
    const off = subscribeTasksChanged((payload) => notified.push(payload.projectId))
    underlying.emit('p-1')
    vi.advanceTimersByTime(TASKS_CHANGED_COALESCE_MS)
    expect(notified).toEqual(['p-1'])
    off()
    expect(underlying.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('preload 面缺席（非 Electron 载体）→ 静默降级 no-op 退订器（交互重取兜底，不抛）', () => {
    vi.stubGlobal('dshForge', undefined)
    const off = subscribeTasksChanged(() => {})
    expect(() => off()).not.toThrow()
  })
})
