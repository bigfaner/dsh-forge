// loop-event-delivery 1.10——mobile 进度流消费（投影键 forge-dispatch-events）单测：
// 纯逻辑面（投影值收敛 / RPC 全量键读取 / 行模型）；实时刷新腿 = forge-stream
// session/projection 帧镜像（host 侧装配，接线面由 tests/mobile 结构断言钉住）。
import { describe, expect, it } from 'vitest'
import {
  DISPATCH_EVENTS_PROJECTION_KEY,
  coerceDispatchEvents,
  loadDispatchEvents,
  progressRow,
  progressTone,
} from './progress.ts'

const entry = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  sourceSlug: 'loop-event-delivery',
  verb: 'claim',
  status: 'running',
  taskKey: 'loop-event-delivery/1.10',
  taskTitle: 'mobile 进度流消费',
  at: new Date(2026, 0, 1, 14, 31, 0).getTime(),
  ...overrides,
})

describe('coerceDispatchEvents（投影值收敛）', () => {
  it('合法 {entries, total} 收敛；非法行 fail-soft 丢弃', () => {
    const view = coerceDispatchEvents({ entries: [entry(), entry({ sourceSlug: '' }), entry({ status: 'weird' }), entry({ verb: 'settle', status: 'completed' }), 'x', null], total: 3 })
    expect(view).toEqual({ entries: [entry(), entry({ verb: 'settle', status: 'completed' })], total: 3 })
  })

  it('整体形状非法 = undefined（键缺席/负 total/entries 非数组）', () => {
    expect(coerceDispatchEvents(undefined)).toBeUndefined()
    expect(coerceDispatchEvents({})).toBeUndefined()
    expect(coerceDispatchEvents({ entries: [], total: -1 })).toBeUndefined()
    expect(coerceDispatchEvents({ entries: 'x', total: 0 })).toBeUndefined()
  })
})

describe('loadDispatchEvents（既有 session-projections RPC 全量键读取——零传输改动）', () => {
  const okRpc = (data: unknown) => ({
    call: async <T,>(channel: string, payload: unknown): Promise<{ ok: boolean; data?: T }> => {
      expect(channel).toBe('forge:proxy/session-projections')
      expect(payload).toEqual({ sessionId: 's-1' })
      return { ok: true, data: data as never }
    },
  })

  it('values[forge-dispatch-events] 窄读（新键自动到达 values）', async () => {
    const view = await loadDispatchEvents(okRpc({ values: { [DISPATCH_EVENTS_PROJECTION_KEY]: { entries: [entry()], total: 1 } }, title: 't' }), 's-1')
    expect(view).toEqual({ entries: [entry()], total: 1 })
  })

  it('键缺席 / RPC 失败 / 空会话 = undefined（诚实降级；空会话零调用）', async () => {
    expect(await loadDispatchEvents(okRpc({ values: {} }), 's-1')).toBeUndefined()
    expect(await loadDispatchEvents({ call: async () => ({ ok: false }) }, 's-1')).toBeUndefined()
    let calls = 0
    expect(await loadDispatchEvents({ call: async () => { calls++; return { ok: true } } }, '')).toBeUndefined()
    expect(calls).toBe(0)
  })
})

describe('行模型（prototype mobile 窄幅：单列轨 + 状态点 + title）', () => {
  it('tone 四态映射；title 优先级 taskTitle > taskKey > sourceSlug', () => {
    expect(progressTone('running')).toBe('run')
    expect(progressTone('completed')).toBe('done')
    expect(progressTone('blocked')).toBe('blk')
    expect(progressTone('interrupted')).toBe('stop')
    expect(progressRow(entry() as never).title).toBe('mobile 进度流消费')
    expect(progressRow(entry({ taskTitle: undefined }) as never).title).toBe('loop-event-delivery/1.10')
    expect(progressRow(entry({ taskTitle: undefined, taskKey: undefined }) as never).title).toBe('loop-event-delivery')
  })

  it('note = 状态词（+ 叙述注记）；when = HH:MM', () => {
    expect(progressRow(entry() as never)).toMatchObject({ note: '执行中', when: '14:31' })
    expect(progressRow(entry({ status: 'blocked', note: '依赖缺失' }) as never).note).toBe('阻塞 · 依赖缺失')
  })
})
