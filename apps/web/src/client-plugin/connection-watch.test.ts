// 断连终态横幅编排单测（bug 问题①——官方 connection.state 订阅，connecting 卡死升级终态）：
// 判据：①connection 服务缺席（undefined）= no-op 零抛；②connecting 持续超阈值 → onShow
// 恰一次（重复通知幂等）；③connected → onHide 自动撤除；④disconnected（网络停转态——
// 官方语义等网络恢复，「请重启」建议不适用）零触发且计时复位；⑤disposer 撤订阅零回调。
import { describe, expect, it } from 'vitest'
import { installConnectionWatch, type ConnectionStateFace } from './connection-watch.js'

/** 手动驱动状态面替身（getSnapshot/subscribe 官方形状） */
function fakeStateFace(): {
  face: ConnectionStateFace
  set(state: string | undefined): void
  emit(): void
  listenerCount(): number
} {
  let snapshot: string | undefined
  const listeners = new Set<() => void>()
  return {
    face: {
      getSnapshot: () => snapshot,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    },
    set(state) {
      snapshot = state
    },
    emit() {
      for (const listener of Array.from(listeners)) listener() // 快照迭代（listener 内可能撤订阅）
    },
    listenerCount: () => listeners.size,
  }
}

interface Harness {
  face: ReturnType<typeof fakeStateFace>
  setNow(ms: number): void
  shown(): number
  hidden(): number
  dispose(): void
}

function harness(thresholdMs = 60_000): Harness {
  const fake = fakeStateFace()
  let now = 0
  let showCount = 0
  let hideCount = 0
  const dispose = installConnectionWatch(fake.face, {
    now: () => now,
    thresholdMs,
    onShow: () => {
      showCount++
    },
    onHide: () => {
      hideCount++
    },
  })
  return {
    face: fake,
    setNow: (ms) => {
      now = ms
    },
    shown: () => showCount,
    hidden: () => hideCount,
    dispose,
  }
}

describe('installConnectionWatch（断连终态横幅编排——bug 问题①）', () => {
  it('connection 服务缺席（undefined）= no-op 零抛，disposer 幂等', () => {
    expect(() => {
      const dispose = installConnectionWatch(undefined, { onShow: () => {}, onHide: () => {} })
      dispose()
      dispose()
    }).not.toThrow()
  })

  it('connecting 持续超阈值 → onShow 恰一次（重复通知幂等）；未达阈值零触发', () => {
    const h = harness()
    h.face.set('connecting')
    h.setNow(0)
    h.face.emit() // connecting 起算
    expect(h.shown()).toBe(0)
    h.setNow(59_999)
    h.face.emit() // 未达阈值
    expect(h.shown()).toBe(0)
    h.setNow(60_000)
    h.face.emit() // 达阈值
    expect(h.shown()).toBe(1)
    h.setNow(120_000)
    h.face.emit() // 已呈现，重复通知幂等
    expect(h.shown()).toBe(1)
  })

  it('connected → onHide 自动撤除；重新 connecting 重置计时零重复呈现', () => {
    const h = harness()
    h.face.set('connecting')
    h.setNow(0)
    h.face.emit()
    h.setNow(61_000)
    h.face.emit()
    expect(h.shown()).toBe(1)
    h.face.set('connected')
    h.face.emit() // 重连成功
    expect(h.hidden()).toBe(1)
    h.face.set('connecting')
    h.setNow(62_000)
    h.face.emit() // 重新 connecting——新一轮计时（旧展示不残留）
    expect(h.shown()).toBe(1) // 未超新一轮阈值，零重复
    h.setNow(62_000 + 60_000)
    h.face.emit()
    expect(h.shown()).toBe(2)
  })

  it('disconnected（网络停转态）零触发且计时复位——「请重启」建议不适用于网络中断', () => {
    const h = harness()
    h.face.set('connecting')
    h.setNow(0)
    h.face.emit()
    h.setNow(70_000)
    h.face.set('disconnected')
    h.face.emit()
    expect(h.shown()).toBe(0)
    h.face.set('connecting')
    h.face.emit() // 计时已复位——重新起算，不立即触发
    expect(h.shown()).toBe(0)
  })

  it('disposer 撤订阅：dispose 后状态变化零回调；重复 dispose 幂等', () => {
    const h = harness()
    expect(h.face.listenerCount()).toBe(1)
    h.dispose()
    expect(h.face.listenerCount()).toBe(0)
    h.face.set('connecting')
    h.setNow(999_999)
    h.face.emit()
    expect(h.shown()).toBe(0)
    expect(() => h.dispose()).not.toThrow()
  })
})
