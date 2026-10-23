import { describe, expect, it } from 'vitest'
import type { Projection, WireEvent } from '../core/wire.ts'
import {
  anchorDelta,
  coerceHistoryWindow,
  formatDuration,
  HISTORY_PAGE_SIZE,
  isAtBottom,
  mergeOlderPage,
  partitionTurnSegments,
  turnFoldMeta,
} from './chat.ts'

const event = (type: string, seq: number): WireEvent =>
  ({ type, seq, time: 0, data: {} }) as WireEvent

const timedEvent = (type: string, seq: number, time: number): WireEvent =>
  ({ type, seq, time, data: {} }) as WireEvent

const _proj = (p: Partial<Projection> & { kind: Projection['kind']; seq: number }): Projection => p as Projection
const userBubble = (seq: number, text = 'hi'): Projection => ({ kind: 'user-bubble', seq, text })
const assistantText = (seq: number, text = '回复'): Projection => ({ kind: 'assistant-message', seq, text, reasoning: '', toolCalls: [] })
const think = (seq: number): Projection => ({ kind: 'assistant-message', seq, text: '', reasoning: '想', toolCalls: [] })
const toolCall = (seq: number, callId = 'c'): Projection => ({ kind: 'tool-call', seq, callId, name: 'grep', arguments: '{}' })
const _toolResult = (seq: number, callId = 'c'): Projection => ({ kind: 'tool-result', seq, callId, isError: false, text: 'ok' })

describe('历史窗口收敛（默认最近 10 条）', () => {
  it('entries 形状 + hasMore 直传', () => {
    const window = coerceHistoryWindow({ entries: [event('user/message', 1)], hasMore: true }, HISTORY_PAGE_SIZE)
    expect(window.entries).toHaveLength(1)
    expect(window.hasMore).toBe(true)
  })

  it('缺 hasMore 时按请求量 fail-soft 推导', () => {
    const full = coerceHistoryWindow({ entries: Array.from({ length: 10 }, (_, index) => event('e', index)) }, 10)
    expect(full.hasMore).toBe(true)
    const partial = coerceHistoryWindow({ entries: [event('e', 1)] }, 10)
    expect(partial.hasMore).toBe(false)
  })

  it('messages 别名兼容 + 空 payload 安全', () => {
    expect(coerceHistoryWindow({ messages: [event('e', 1)] }, 10).entries).toHaveLength(1)
    expect(coerceHistoryWindow(null, 10)).toEqual({ entries: [], hasMore: false })
  })
})

describe('上翻分页合并 + 滚动锚保持', () => {
  it('旧页 prepend 按 seq 去重升序，seq 单调不重复', () => {
    const current = [event('a', 5), event('b', 6)]
    const older = [event('z', 3), event('y', 4), event('a', 5)]
    const merged = mergeOlderPage(current, older)
    expect(merged.map((item) => item.seq)).toEqual([3, 4, 5, 6])
  })

  it('anchorDelta = 补偿 scrollTop 差值', () => {
    expect(anchorDelta(1000, 1500)).toBe(500)
    expect(anchorDelta(1500, 1500)).toBe(0)
  })
})

describe('触底判据（滚动到底 / 未读归零口径）', () => {
  it('距底 < 24px = 触底', () => {
    expect(isAtBottom(976, 1000, 600)).toBe(true) // 差 16
    expect(isAtBottom(300, 1000, 600)).toBe(false)
  })
})

describe('turn 分段折叠 v2（官方 turn/end 边界——尾随活动/打断 turn 也正确折叠）', () => {
  it('无活动段 = 不折叠（纯对话）', () => {
    const segments = partitionTurnSegments([userBubble(1), assistantText(2)], -1)
    expect(segments).toHaveLength(1)
    expect(segments[0]!.collapsed).toBe(false)
    expect(segments[0]!.activitySeqs).toEqual([])
  })
  it('活动全部落在 turn/end 之前 = 折叠（历史 turn——含尾随 ask 工具）', () => {
    const segments = partitionTurnSegments([userBubble(1), think(2), toolCall(3), assistantText(4), toolCall(5, 'ask')], 6)
    expect(segments[0]!.collapsed).toBe(true)
    expect(segments[0]!.activitySeqs).toEqual([2, 3, 5])
  })
  it('活动在最后一个 turn/end 之后 = 展开（进行中 turn）', () => {
    const segments = partitionTurnSegments([userBubble(1), think(2), toolCall(3)], 1)
    expect(segments[0]!.collapsed).toBe(false)
    expect(segments[0]!.activitySeqs).toEqual([2, 3])
  })
  it('无 turn/end（中断 turn）= 展开', () => {
    const segments = partitionTurnSegments([userBubble(1), think(2), toolCall(3)], -1)
    expect(segments[0]!.collapsed).toBe(false)
  })
  it('多 turn：end 前折叠、end 后展开，各段独立', () => {
    const segments = partitionTurnSegments([
      userBubble(1), think(2), assistantText(3), // turn1（end#4）
      userBubble(5), think(6), toolCall(7),      // turn2 进行中
    ], 4)
    expect(segments).toHaveLength(2)
    expect(segments[0]!.collapsed).toBe(true)
    expect(segments[0]!.activitySeqs).toEqual([2])
    expect(segments[1]!.collapsed).toBe(false)
    expect(segments[1]!.activitySeqs).toEqual([6, 7])
  })
})
describe('turnFoldMeta / formatDuration（折叠组摘要：状态·步数·耗时）', () => {
  const turn = (start: number, end: number, stepCount: number): WireEvent[] => {
    const entries = [timedEvent('turn/start', start, 1000)]
    for (let index = 0; index < stepCount; index++) entries.push(timedEvent('step/end', start + 1 + index, 2000 + index * 1000))
    entries.push(timedEvent('turn/end', end, 1000 + (stepCount + 1) * 25000))
    return entries
  }

  it('状态/步数/耗时：step/end 计数 + turn/start→turn/end 时长', () => {
    const entries = turn(1, 10, 3) // seq: start=1, step/end=2..4, end=10
    const meta = turnFoldMeta(entries, [5, 6, 7])
    expect(meta.status).toBe('已完成')
    expect(meta.steps).toBe(3)
    expect(meta.durationMs).toBe(100000)
  })

  it('无 step 事件回退活动项数；无 turn 事件时长为 0', () => {
    const entries = [event('user/message', 1), event('assistant/message', 3)]
    const meta = turnFoldMeta(entries, [2])
    expect(meta.steps).toBe(1)
    expect(meta.durationMs).toBe(0)
  })

  it('空活动段：零值元信息', () => {
    expect(turnFoldMeta([], [])).toEqual({ status: '已完成', steps: 0, durationMs: 0 })
  })

  it('formatDuration：分秒/仅秒', () => {
    expect(formatDuration(145_000)).toBe('2 分 25 秒')
    expect(formatDuration(45_000)).toBe('45 秒')
  })
})