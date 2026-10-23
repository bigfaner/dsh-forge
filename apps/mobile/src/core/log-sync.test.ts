/** log-sync 单测：节流重拉与完成通知语义。 */
import { describe, expect, it } from 'vitest'
import { createLogSync, type LogSyncTimers } from './log-sync.ts'
import type { WireEvent } from './wire.ts'

function wireEvent(seq: number, type = 'user/message'): WireEvent {
  return { seq, type, at: seq, data: { text: `t${seq}` } } as unknown as WireEvent
}

/** 手动 timer 队列（models.test 同款模式） */
function manualTimers(): LogSyncTimers & { fire(): number } {
  let pending: Array<{ fn: () => void }> = []
  return {
    setTimeout: (fn) => {
      pending.push({ fn })
      return pending.length
    },
    clearTimeout: () => {},
    fire(): number {
      const current = pending
      pending = []
      for (const item of current) item.fn()
      return current.length
    },
  }
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

describe('log-sync', () => {
  it('schedule：节流窗口内去重，单 timer', () => {
    const timers = manualTimers()
    const sync = createLogSync({
      history: async () => [wireEvent(1)],
      coerce: (raw) => ({ entries: raw as WireEvent[] }),
      notify: () => {},
      timers,
    })
    sync.schedule('s-1')
    sync.schedule('s-1')
    expect(timers.fire()).toBe(1)
  })

  it('bug 55d50769：schedule 触发的重拉完成后必须 notify（当前实现读旧缓存=渲染滞后一拍）', async () => {
    const timers = manualTimers()
    let notified = 0
    const sync = createLogSync({
      history: async () => [wireEvent(1), wireEvent(2)],
      coerce: (raw) => ({ entries: raw as WireEvent[] }),
      notify: () => {
        notified += 1
      },
      timers,
    })
    sync.schedule('s-1')
    timers.fire()
    await flush()
    expect(notified).toBe(1) // 重拉完成后通知监听器重读缓存
  })

  it('refresh：拉取成功写缓存并 notify；失败保旧快照不 notify', async () => {
    let notified = 0
    let fail = false
    const sync = createLogSync({
      history: async () => {
        if (fail) throw new Error('down')
        return [wireEvent(1)]
      },
      coerce: (raw) => ({ entries: raw as WireEvent[] }),
      notify: () => {
        notified += 1
      },
    })
    await sync.refresh('s-1')
    expect(sync.get('s-1')).toHaveLength(1)
    expect(notified).toBe(1)
    fail = true
    await sync.refresh('s-1')
    expect(sync.get('s-1')).toHaveLength(1) // 旧快照保留
    expect(notified).toBe(1) // 失败不通知
  })
})
