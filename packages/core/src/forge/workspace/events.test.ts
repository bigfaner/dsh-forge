// 任务 1.2 测试 —— 事件发射器底座（AC5：emitTasksChanged(projectId) 挂点 + 桥事件信封
// process.send 防护发送；direct 形态 IPC 缺席静默降级）。
import { describe, expect, it, vi } from 'vitest'
import { FORGE_EVENT_CHANNELS } from '@dsh-forge/contracts'
import { createForgeTaskEvents } from './events.js'

describe('AC5 事件发射器底座（emitTasksChanged 挂点）', () => {
  it('emitTasksChanged：进程内订阅者收 { projectId } 载荷', () => {
    const events = createForgeTaskEvents()
    const received: string[] = []
    events.onTasksChanged((p) => received.push(p.projectId))

    events.emitTasksChanged('p1')
    events.emitTasksChanged('p2')
    expect(received).toEqual(['p1', 'p2'])
  })

  it('多订阅者全部送达；退订后不再收', () => {
    const events = createForgeTaskEvents()
    const a: string[] = []
    const b: string[] = []
    const offA = events.onTasksChanged((p) => a.push(p.projectId))
    events.onTasksChanged((p) => b.push(p.projectId))

    events.emitTasksChanged('p1')
    offA()
    events.emitTasksChanged('p2')
    expect(a).toEqual(['p1'])
    expect(b).toEqual(['p1', 'p2'])
  })

  it('订阅者抛错不阻断其余订阅与发射（隔离降级）', () => {
    const events = createForgeTaskEvents()
    const ok: string[] = []
    events.onTasksChanged(() => {
      throw new Error('listener boom')
    })
    events.onTasksChanged((p) => ok.push(p.projectId))

    expect(() => events.emitTasksChanged('p1')).not.toThrow()
    expect(ok).toEqual(['p1'])
  })

  it('桥事件信封：process.send 在场 → BridgeEventMessage { type: event, channel, payload }', () => {
    const sent: unknown[] = []
    const original = process.send
    Object.defineProperty(process, 'send', {
      value: (message: unknown) => {
        sent.push(message)
        return true
      },
      configurable: true,
    })
    try {
      const events = createForgeTaskEvents()
      events.emitTasksChanged('p1')
    } finally {
      if (original === undefined) {
        Object.defineProperty(process, 'send', { value: undefined, configurable: true })
        delete process.send
      } else {
        Object.defineProperty(process, 'send', { value: original, configurable: true })
      }
    }
    expect(sent).toEqual([
      { type: 'event', channel: FORGE_EVENT_CHANNELS.tasksChanged, payload: { projectId: 'p1' } },
    ])
  })

  it('桥通道缺席（direct 形态 process.send undefined）→ 静默降级不抛（交互重取兜底）', () => {
    // 桩定缺席（direct 形态 = IPC 通道不在；vitest 线程/ forks 池环境差异免疫）
    const original = process.send
    Object.defineProperty(process, 'send', { value: undefined, configurable: true })
    try {
      const events = createForgeTaskEvents()
      expect(() => events.emitTasksChanged('p1')).not.toThrow()
    } finally {
      if (original === undefined) {
        Object.defineProperty(process, 'send', { value: undefined, configurable: true })
        delete process.send
      } else {
        Object.defineProperty(process, 'send', { value: original, configurable: true })
      }
    }
  })

  it('桥通道关闭（process.send 返回 false / 抛错）→ 静默降级不抛', () => {
    const original = process.send
    Object.defineProperty(process, 'send', {
      value: () => {
        throw new Error('channel closed')
      },
      configurable: true,
    })
    try {
      const events = createForgeTaskEvents()
      expect(() => events.emitTasksChanged('p1')).not.toThrow()
    } finally {
      if (original === undefined) {
        Object.defineProperty(process, 'send', { value: undefined, configurable: true })
        delete process.send
      } else {
        Object.defineProperty(process, 'send', { value: original, configurable: true })
      }
    }
  })
})

describe('发射器实例隔离（vi.fn 桩验证发射器不缓存订阅闭包外的状态）', () => {
  it('两实例订阅表互不相通', () => {
    const e1 = createForgeTaskEvents()
    const e2 = createForgeTaskEvents()
    const got: string[] = []
    e1.onTasksChanged((p) => got.push(`e1:${p.projectId}`))
    e2.onTasksChanged((p) => got.push(`e2:${p.projectId}`))

    e1.emitTasksChanged('p1')
    expect(got).toEqual(['e1:p1'])
    vi.restoreAllMocks()
  })
})
