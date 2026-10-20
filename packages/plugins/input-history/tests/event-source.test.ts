// 会话事件历史源单测（tech-design ②：binding.eventSource 解包适配内联本包）：
// 官方 SessionEventSource（ObservableSnapshot<SessionEventWindow>）→ 插件裸事件 feed。
import { describe, expect, it, vi } from 'vitest'
import { historyFeedOf } from '../src/client/event-source.js'

/** 官方窗口条目包装形（{type:'event',event}|{type:'transient',…}） */
function wrappedEvent(type: string, seq: number): unknown {
  return { type: 'event', event: { type, seq, data: {} } }
}

function fakeEventSource(entries: unknown[]) {
  return {
    getSnapshot: () => ({ entries }),
    subscribe: (cb: () => void) => {
      cbs.push(cb)
      return () => {
        const i = cbs.indexOf(cb)
        if (i >= 0) cbs.splice(i, 1)
      }
    },
  }
}

let cbs: (() => void)[] = []

describe('historyFeedOf（binding.eventSource 解包适配）', () => {
  it('解包 {type:event,event} 条目为裸事件流；transient 条目丢弃', () => {
    const feed = historyFeedOf({ eventSource: fakeEventSource([wrappedEvent('user/message', 1), { type: 'transient' }, wrappedEvent('turn/start', 2)]) })
    expect(feed).toBeDefined()
    expect(feed!.snapshot()).toEqual([
      { type: 'user/message', seq: 1, data: {} },
      { type: 'turn/start', seq: 2, data: {} },
    ])
  })

  it('subscribe 透传上游发布；退订器撤上游监听', () => {
    cbs = []
    const feed = historyFeedOf({ eventSource: fakeEventSource([]) })!
    const listener = vi.fn()
    const dispose = feed.subscribe(listener)
    expect(cbs).toHaveLength(1)
    cbs[0]!()
    expect(listener).toHaveBeenCalledTimes(1)
    dispose()
    expect(cbs).toHaveLength(0)
  })

  it('binding/eventSource 缺席或形状漂移 = undefined（fail-soft 空态）', () => {
    expect(historyFeedOf(undefined)).toBeUndefined()
    expect(historyFeedOf({})).toBeUndefined()
    expect(historyFeedOf({ eventSource: {} })).toBeUndefined()
    expect(historyFeedOf({ eventSource: { getSnapshot: 'x', subscribe: () => undefined } })).toBeUndefined()
    expect(historyFeedOf({ eventSource: { getSnapshot: () => ({}), subscribe: 'x' } })).toBeUndefined()
  })

  it('snapshot 异常 = 空数组（不外溢）', () => {
    const feed = historyFeedOf({
      eventSource: {
        getSnapshot: () => {
          throw new Error('boom')
        },
        subscribe: () => () => undefined,
      },
    })
    expect(feed!.snapshot()).toEqual([])
  })
})
