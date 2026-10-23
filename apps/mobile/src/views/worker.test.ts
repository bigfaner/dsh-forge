import { describe, expect, it } from 'vitest'
import type { WireEvent } from '../core/wire.ts'
import {
  catalogProjection,
  coerceSessionRows,
  deriveWorkers,
  PROXY_SESSION_LIST_CHANNEL,
  type WorkerRow,
} from './worker.ts'

const catalog = (seq: number, childId: string, mode: string, label: string): WireEvent =>
  ({
    type: 'subagent/catalog',
    seq,
    time: 0,
    data: { version: 0, childId, childCreatedAt: 0, mode, label },
  }) as WireEvent

const sessionRow = (overrides: Record<string, unknown> & { sessionId: string }): Record<string, unknown> => ({
  origin: 'user',
  running: false,
  updatedAt: '2026-10-19T00:00:00Z',
  ...overrides,
})

describe('catalogProjection（父会话 subagent/catalog 持久事件投影）', () => {
  it('同 childId 以最新 seq 为准；不同 childId 各自成行', () => {
    const map = catalogProjection([
      catalog(1, 'c-1', 'one-shot', '旧标签'),
      catalog(2, 'c-2', 'continuable', '续聊任务'),
      catalog(3, 'c-1', 'continuable', '新标签'),
    ])
    expect(map.get('c-1')).toEqual({ mode: 'continuable', label: '新标签' })
    expect(map.get('c-2')).toEqual({ mode: 'continuable', label: '续聊任务' })
  })

  it('缺 childId 行 fail-soft 丢弃；缺 mode 归 one-shot', () => {
    const map = catalogProjection([
      { type: 'subagent/catalog', seq: 1, time: 0, data: { mode: 'one-shot' } } as WireEvent,
      { type: 'subagent/catalog', seq: 2, time: 0, data: { childId: 'c-9' } } as WireEvent,
    ])
    expect(map.size).toBe(1)
    expect(map.get('c-9')).toEqual({ mode: 'one-shot', label: '' })
  })
})

describe('deriveWorkers（官方 session.list 视图过滤——零专用通道）', () => {
  const rows = [
    sessionRow({ sessionId: 'main' }),
    sessionRow({ sessionId: 'w1', parentSessionId: 'main', origin: 'subagent', running: true }),
    sessionRow({ sessionId: 'w2', parentSessionId: 'main', origin: 'subagent', running: false }),
    sessionRow({ sessionId: 'w3', parentSessionId: 'other', origin: 'subagent' }),
    sessionRow({ sessionId: 'w4', parentSessionId: 'main', origin: 'subagent', updatedAt: '2026-10-19T01:00:00Z' }),
    sessionRow({ sessionId: 'w5', parentSessionId: 'main', origin: 'subagent', running: true }),
  ]
  const cat = new Map([
    ['w1', { mode: 'continuable', label: '评审提案' }],
    ['w2', { mode: 'one-shot', label: '跑测试' }],
  ])

  it('只留 parentSessionId === 当前会话 且 origin subagent；sessionId 缺行丢弃', () => {
    const workers = deriveWorkers(rows, 'main', cat)
    expect(workers.map((w) => w.sessionId)).toEqual(['w1', 'w5', 'w2', 'w4'])
  })

  it('mode/label 取 catalog 投影；activity 取 SessionSummary.running；running 置前', () => {
    const workers = deriveWorkers(rows, 'main', cat)
    expect(workers[0]).toMatchObject({ sessionId: 'w1', mode: 'continuable', label: '评审提案', running: true })
    expect(workers[1]).toMatchObject({ sessionId: 'w5', running: true })
    expect(workers[2]).toMatchObject({ sessionId: 'w2', mode: 'one-shot', label: '跑测试', running: false })
  })

  it('无 catalog 行 fail-soft 兜底（mode one-shot / label 空）；未知 mode 归 one-shot（只读安全侧）', () => {
    const workers = deriveWorkers(
      [sessionRow({ sessionId: 'w9', parentSessionId: 'main', origin: 'subagent' })],
      'main',
      new Map([['w9', { mode: 'plan', label: 'x' }]]),
    )
    expect(workers[0]).toMatchObject({ mode: 'one-shot', label: 'x' })
  })
})

describe('coerceSessionRows（session-list 响应三形收敛）', () => {
  it('数组 / {items} / {sessions}；异常 → []', () => {
    expect(coerceSessionRows([sessionRow({ sessionId: 'a' })])).toHaveLength(1)
    expect(coerceSessionRows({ items: [sessionRow({ sessionId: 'a' })] })).toHaveLength(1)
    expect(coerceSessionRows({ sessions: [sessionRow({ sessionId: 'a' })] })).toHaveLength(1)
    expect(coerceSessionRows(null)).toEqual([])
    expect(coerceSessionRows('x')).toEqual([])
  })

  it('通道名 = forge:proxy/session-list（零专用通道：官方 list 直调透传）', () => {
    expect(PROXY_SESSION_LIST_CHANNEL).toBe('forge:proxy/session-list')
  })
})

export type { WorkerRow }
