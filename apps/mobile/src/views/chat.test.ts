import { describe, expect, it } from 'vitest'
import type { WireEvent } from '../core/wire.ts'
import {
  anchorDelta,
  coerceHistoryWindow,
  HISTORY_PAGE_SIZE,
  isAtBottom,
  mergeOlderPage,
} from './chat.ts'

const event = (type: string, seq: number): WireEvent =>
  ({ type, seq, time: 0, data: {} }) as WireEvent

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
