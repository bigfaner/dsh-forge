// 3b · registry 挂起字段单测（dispatch-loop-hardening 1.8）：LoopRecord.suspended +
// takeoverSessions 生命周期与登记绑定——终局 registry.remove 整体蒸发（注入面零清除代码）。
import { describe, expect, it } from 'vitest'
import { createLoopRegistry } from './registry.js'
import type { LoopRecord } from './registry.js'

function recordOf(over: Partial<LoopRecord> = {}): LoopRecord {
  return {
    id: 'loop-1',
    source: { kind: 'feature', slug: 'feat-x' },
    ownerSessionId: 'owner-1',
    projectId: 'p-1',
    takeoverSessions: new Set<string>(),
    ...over,
  }
}

describe('LoopRecord 挂起字段（3b——suspended + takeoverSessions，生命周期与登记绑定）', () => {
  it('suspended 在场 = 挂起态投影事实；处置回流清除后回退 active 投影', () => {
    const registry = createLoopRegistry()
    const record = recordOf()
    registry.register(record)
    expect(registry.get('loop-1')?.suspended).toBeUndefined() // active
    // 写点① suspendForVerdict：挂起即投影挂起
    registry.get('loop-1')!.suspended = {
      escalation: {
        kind: 'blocked-ask-user',
        ownerSessionId: 'owner-1',
        source: { kind: 'feature', slug: 'feat-x' },
        task: { taskId: 't-1', slug: 'feat-x', localId: '2.5', source: { kind: 'feature', slug: 'feat-x' }, title: 'T', taskType: 'coding-fix', taskStatus: 'blocked', breaking: false, complexity: 'low', createdAt: '', updatedAt: '' },
        reason: 'r',
        history: [],
      },
      since: 1234,
    }
    expect(registry.get('loop-1')?.suspended?.since).toBe(1234)
    // 写点② 处置回流：清 suspended 回落 active
    registry.get('loop-1')!.suspended = undefined
    expect(registry.get('loop-1')?.suspended).toBeUndefined()
  })

  it('takeoverSessions 接管集可增（工具侧唯一写点）；registry.remove 整体蒸发——suspended/takeoverSessions 随登记消失，无泄漏', () => {
    const registry = createLoopRegistry()
    const record = recordOf()
    registry.register(record)
    registry.get('loop-1')!.takeoverSessions.add('session-2')
    expect(registry.get('loop-1')?.takeoverSessions.has('session-2')).toBe(true)
    registry.remove('loop-1')
    expect(registry.get('loop-1')).toBeUndefined()
    expect(registry.all()).toEqual([]) // 挂起字段无独立存储——蒸发即零残留
  })
})
