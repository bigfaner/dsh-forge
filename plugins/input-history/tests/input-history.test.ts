// input-history client 面单测（composer-correction 参考分支移植判例）：历史源
// （user/message 事件订阅 + 会话切换切源）+ readline 键位判定（空草稿/首行行首
// ArrowUp、ArrowDown 回翻、翻到底恢复暂存草稿、多行草稿编辑中保持原生）+ 键位经
// 窄缝绑定（preventDefault 语义）。
import { describe, expect, it, vi } from 'vitest'
import {
  browseDown,
  browseUp,
  createHistorySource,
  createInputHistory,
  historyEntriesOf,
  initialBrowseState,
  isSentUserMessageEvent,
  userMessageTextOf,
  type HistoryEventFeed,
  type HistorySessionEvent,
} from '../src/client/input-history.js'

// --- 会话事件 feed 假件（官方事件流消费切片——snapshot + subscribe） -------

function userMessage(seq: number, text: string, kind = 'user'): HistorySessionEvent {
  return {
    type: 'user/message',
    seq,
    data: { source: { kind }, content: [{ type: 'text', text }] },
  }
}

class FakeFeed implements HistoryEventFeed {
  private listeners = new Set<() => void>()
  constructor(public events: HistorySessionEvent[]) {}
  snapshot(): readonly HistorySessionEvent[] {
    return this.events
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  emit(event: HistorySessionEvent): void {
    this.events = [...this.events, event]
    for (const listener of this.listeners) listener()
  }
}

class TrackedFeed extends FakeFeed {
  disposeCount = 0
  override subscribe(listener: () => void): () => void {
    const upstream = super.subscribe(listener)
    return () => {
      this.disposeCount++
      upstream()
    }
  }
}

// --- 历史源 -----------------------------------------------------------------------

describe('historyEntriesOf / isSentUserMessageEvent / userMessageTextOf', () => {
  it('只收人工发送的 user/message，按 seq 发送序提取文本', () => {
    const events = [
      userMessage(1, '第一条'),
      { type: 'turn/start', seq: 2, data: { turn: 1 } },
      userMessage(3, '第二条'),
      userMessage(4, '模型代发', 'model'),
      { type: 'assistant/message', seq: 5, data: { content: [{ type: 'text', text: '回复' }] } },
    ]
    expect(events.filter(isSentUserMessageEvent).map((e) => e.seq)).toEqual([1, 3])
    expect(historyEntriesOf(events)).toEqual([
      { seq: 1, text: '第一条' },
      { seq: 3, text: '第二条' },
    ])
  })

  it('userMessageTextOf 拼接多段 text、非 text 段忽略', () => {
    const event: HistorySessionEvent = {
      type: 'user/message',
      seq: 7,
      data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'a' }, { type: 'image' }, { type: 'text', text: 'b' }] },
    }
    expect(userMessageTextOf(event)).toBe('ab')
    expect(userMessageTextOf({ type: 'user/message', seq: 8 })).toBeUndefined()
  })
})

describe('createHistorySource', () => {
  it('listener 全退路径走幂等旗标——全退后再 dispose 至多退订一次', () => {
    const feed = new TrackedFeed([userMessage(1, '一')])
    const source = createHistorySource('s1', feed)
    const d1 = source.subscribe(vi.fn())
    const d2 = source.subscribe(vi.fn())
    d1()
    d2() // 全退 → 触发释放
    source.dispose() // 换源 / handle dispose 复用同一释放点——不得二次退订
    expect(feed.disposeCount).toBe(1)
  })

  it('订阅 feed：新事件到达即重算条目，退订后不再通知', () => {
    const feed = new FakeFeed([userMessage(1, '第一条')])
    const source = createHistorySource('s1', feed)
    expect(source.entries()).toEqual([{ seq: 1, text: '第一条' }])
    const listener = vi.fn()
    const dispose = source.subscribe(listener)
    feed.emit(userMessage(2, '第二条'))
    expect(listener).toHaveBeenCalledTimes(1)
    expect(source.entries()).toHaveLength(2)
    dispose()
    feed.emit(userMessage(3, '第三条'))
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('listener 归零后再 subscribe 恢复 feed 失效通知（不死源）', () => {
    const feed = new FakeFeed([userMessage(1, '第一条')])
    const source = createHistorySource('s1', feed)
    const d1 = source.subscribe(vi.fn())
    d1() // 归零 → 释放 feed 订阅
    const listener = vi.fn()
    const d2 = source.subscribe(listener)
    feed.emit(userMessage(2, '第二条'))
    expect(listener).toHaveBeenCalledTimes(1) // 修复前：feedDisposed 不可逆 → 永不再通知
    d2()
    feed.emit(userMessage(3, '第三条'))
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('归零释放后再 subscribe 而后 dispose：feed 至多退订一次（幂等不叠订）', () => {
    const feed = new TrackedFeed([userMessage(1, '一')])
    const source = createHistorySource('s1', feed)
    const d1 = source.subscribe(vi.fn())
    d1() // 归零 → 释放
    const d2 = source.subscribe(vi.fn()) // 重订阅 → 恢复
    d2()
    source.dispose()
    expect(feed.disposeCount).toBe(2) // 归零一次 + dispose 一次，无叠订
  })
})

describe('browseUp / browseDown（readline 键位判定）', () => {
  const entries = [
    { seq: 1, text: '第一条' },
    { seq: 2, text: '第二条' },
  ]

  it('空草稿 ArrowUp：暂存草稿并翻出最后一条', () => {
    const { state, step } = browseUp(initialBrowseState, entries, '', 0)
    expect(step).toEqual({ handled: true, text: '第二条' })
    expect(state).toEqual({ index: 1, stash: '' })
  })

  it('草稿非空但光标在首行行首（caret=0）ArrowUp：同样触发', () => {
    const { state, step } = browseUp(initialBrowseState, entries, '未提交草稿', 0)
    expect(step).toEqual({ handled: true, text: '第二条' })
    expect(state.stash).toBe('未提交草稿')
  })

  it('草稿非空且光标不在首行行首 ArrowUp：不拦截（原生光标移动）', () => {
    expect(browseUp(initialBrowseState, entries, 'abc', 1).step).toEqual({ handled: false })
    expect(browseUp(initialBrowseState, entries, 'ab\ncd', 5).step).toEqual({ handled: false })
  })

  it('无历史时 ArrowUp：不拦截', () => {
    expect(browseUp(initialBrowseState, [], '', 0).step).toEqual({ handled: false })
  })

  it('翻阅中 ArrowUp：逐条上翻；已在最旧一条则停住（仍拦截）', () => {
    const first = browseUp(initialBrowseState, entries, '', 0)
    const second = browseUp(first.state, entries, '第二条', 0)
    expect(second.step).toEqual({ handled: true, text: '第一条' })
    expect(second.state.index).toBe(0)
    const stuck = browseUp(second.state, entries, '第一条', 0)
    expect(stuck.step).toEqual({ handled: true, text: '第一条' })
    expect(stuck.state.index).toBe(0)
  })

  it('翻阅中 ArrowDown：逐条回翻；翻过最新一条恢复暂存草稿', () => {
    let out = browseUp(initialBrowseState, entries, '草稿X', 0)
    out = browseUp(out.state, entries, '第二条', 0)
    expect(out.step).toEqual({ handled: true, text: '第一条' })
    const back = browseDown(out.state, entries, '第一条')
    expect(back.step).toEqual({ handled: true, text: '第二条' })
    const restored = browseDown(back.state, entries, '第二条')
    expect(restored.step).toEqual({ handled: true, text: '草稿X' })
    expect(restored.state).toEqual(initialBrowseState)
  })

  it('未翻阅时 ArrowDown：不拦截（原生光标移动）', () => {
    expect(browseDown(initialBrowseState, entries, '').step).toEqual({ handled: false })
  })

  it('翻阅中用户编辑了回忆文本：ArrowUp 重新以编辑稿为暂存起点；ArrowDown 归还暂存', () => {
    const up = browseUp(initialBrowseState, entries, '', 0)
    const edited = browseUp(up.state, entries, '第二条（改）', 3)
    expect(edited.step).toEqual({ handled: true, text: '第一条' })
    expect(edited.state).toEqual({ index: 0, stash: '第二条（改）' })
    const downAfterEdit = browseDown(edited.state, entries, '第一条（改）')
    expect(downAfterEdit.step).toEqual({ handled: true, text: '第二条（改）' })
    expect(downAfterEdit.state).toEqual(initialBrowseState)
  })
})

// --- 键位绑定（窄缝——按键源与草稿缝由消费者注入） ---------------------------------

describe('createInputHistory', () => {
  function draftSeam(initial: string) {
    const seam = { draft: initial, caret: 0, setCalls: [] as string[] }
    return {
      seam,
      face: {
        getDraft: () => seam.draft,
        getCaret: () => seam.caret,
        setDraft(text: string) {
          seam.setCalls.push(text)
          seam.draft = text
          seam.caret = text.length
        },
      },
    }
  }

  function keySource() {
    let handler: ((gesture: { key: string; preventDefault(): void }) => void) | undefined
    return {
      fire(key: string): boolean {
        let prevented = false
        handler?.({ key, preventDefault: () => (prevented = true) })
        return prevented
      },
      face: {
        subscribe(h: (gesture: { key: string; preventDefault(): void }) => void): () => void {
          handler = h
          return () => (handler = undefined)
        },
      },
    }
  }

  it('键位经窄缝绑定：ArrowUp 翻历史并 preventDefault；ArrowDown 未翻阅不拦截', () => {
    const feed = new FakeFeed([userMessage(1, '第一条')])
    const history = createInputHistory()
    history.attach('s1', feed)
    const keys = keySource()
    const { seam, face } = draftSeam('')
    const dispose = history.bind(keys.face, face)
    expect(keys.fire('ArrowUp')).toBe(true)
    expect(seam.setCalls).toEqual(['第一条'])
    // 单条历史：ArrowDown 翻过最新一条 → 恢复翻阅前空草稿
    expect(keys.fire('ArrowDown')).toBe(true)
    expect(seam.setCalls).toEqual(['第一条', ''])
    dispose()
    expect(keys.fire('ArrowUp')).toBe(false)
  })

  it('翻到底 ArrowDown 恢复暂存草稿；非方向键不拦截', () => {
    const feed = new FakeFeed([userMessage(1, '第一条'), userMessage(2, '第二条')])
    const history = createInputHistory()
    history.attach('s1', feed)
    const keys = keySource()
    const { seam, face } = draftSeam('草稿Y')
    history.bind(keys.face, face)
    keys.fire('ArrowUp')
    keys.fire('ArrowUp')
    expect(seam.draft).toBe('第一条')
    expect(keys.fire('ArrowDown')).toBe(true)
    expect(keys.fire('ArrowDown')).toBe(true)
    expect(seam.setCalls).toEqual(['第二条', '第一条', '第二条', '草稿Y'])
    seam.draft = 'ab'
    seam.caret = 1
    expect(keys.fire('ArrowDown')).toBe(false)
    expect(keys.fire('Enter')).toBe(false)
  })

  it('会话切换即切换历史源（翻出的是新会话消息，翻阅态与暂存重置）', () => {
    const feed1 = new FakeFeed([userMessage(1, '会话一消息')])
    const feed2 = new FakeFeed([userMessage(10, '会话二消息')])
    const history = createInputHistory()
    history.attach('s1', feed1)
    const keys = keySource()
    const { seam, face } = draftSeam('旧会话草稿')
    history.bind(keys.face, face)
    keys.fire('ArrowUp')
    expect(seam.draft).toBe('会话一消息')

    history.attach('s2', feed2)
    expect(history.attachedSession()).toBe('s2')
    seam.draft = ''
    seam.caret = 0
    expect(keys.fire('ArrowUp')).toBe(true)
    expect(seam.setCalls).toEqual(['会话一消息', '会话二消息'])
  })

  it('attach 换源释放旧 feed 订阅（含零 listener 场景——多次切换零积压）', () => {
    const feeds = [new TrackedFeed([userMessage(1, '一')]), new TrackedFeed([]), new TrackedFeed([userMessage(2, '三')])]
    const history = createInputHistory()
    history.attach('s1', feeds[0]!) // 零 listener：旧源从未有消费者也要释放 feed 订阅
    history.attach('s2', feeds[1]!)
    history.attach('s3', feeds[2]!)
    feeds[0]!.emit(userMessage(9, '迟到的会话一消息'))
    expect(history.attachedSession()).toBe('s3')
    expect(history.entries()).toEqual([{ seq: 2, text: '三' }])
    history.dispose()
    expect(feeds.map((feed) => feed.disposeCount)).toEqual([1, 1, 1])
  })

  it('dispose 退订按键源与会话源', () => {
    const feed = new FakeFeed([])
    const history = createInputHistory()
    history.attach('s1', feed)
    const keys = keySource()
    const { face } = draftSeam('')
    history.bind(keys.face, face)
    history.dispose()
    expect(keys.fire('ArrowUp')).toBe(false)
    feed.emit(userMessage(1, 'x'))
    expect(history.entries()).toEqual([])
  })
})
