// client face 组合 apply 接线单测（AC：组合 apply 正确接线、不依赖宿主 wiring 注入）：
// sessions 注入缝 + binding.eventSource 历史源 + DOM 键源 + mention 守卫 + 活跃会话跟随
// 全在包内 apply 装配（fake ctx/fake document 驱动）。
import { afterEach, describe, expect, it } from 'vitest'
import { inputHistoryClient, wireInputHistoryClient } from '../src/client/index.js'
import type { ForgeComposerDomKeyEvent, ForgeComposerEventTarget } from '../src/client/composer-keys.js'

// globalThis.document 手工注入的还原缝：断言失败不向后续用例泄漏污染。
afterEach(() => {
  ;(globalThis as { document?: unknown }).document = undefined
})

// --- fake 官方面 ---------------------------------------------------------------

function editableTarget(): unknown {
  return { closest: (s: string) => (s === '[contenteditable="true"]' ? { __lexicalEditor: {} } : undefined) }
}

interface FakeDoc extends ForgeComposerEventTarget {
  dispatch(key: string, target: unknown): void
}

function fakeDoc(): FakeDoc {
  let listener: ((event: ForgeComposerDomKeyEvent) => void) | undefined
  const target: ForgeComposerEventTarget = {
    addEventListener: (_type, l) => {
      listener = l
    },
    removeEventListener: () => {
      listener = undefined
    },
  }
  return Object.assign(target, {
    dispatch(key: string, eventTarget: unknown): void {
      listener?.({
        key,
        target: eventTarget,
        preventDefault: () => {},
        stopImmediatePropagation: () => {},
      })
    },
  })
}

/** 官方窗口源假件（binding.eventSource——快照 + 订阅；subscribe 可追踪退订） */
function fakeEventSource(userTexts: { seq: number; text: string }[], disposes?: { count: number }[]) {
  return {
    getSnapshot: () => ({
      entries: userTexts.map((m) => ({ type: 'event', event: { type: 'user/message', seq: m.seq, data: { source: { kind: 'user' }, content: [{ type: 'text', text: m.text }] } } })),
    }),
    subscribe: (_cb: () => void) => {
      const tracked = { count: 0 }
      disposes?.push(tracked)
      return () => {
        tracked.count++
      }
    },
  }
}

interface World {
  doc: FakeDoc
  ctx: Record<string, unknown>
  drafts: Map<string, string>
  bindings: Map<string, unknown>
  listListeners: (() => void)[]
  listSnapshot: { byId: Record<string, unknown> }
}

/** 组装 fake 宿主世界：sessions（binding/list）+ conversation（input 缝）+ document */
function fakeWorld(byId: Record<string, unknown> = {}): World {
  const doc = fakeDoc()
  const drafts = new Map<string, string>()
  const bindings = new Map<string, unknown>()
  const listListeners: (() => void)[] = []
  const listSnapshot = { byId }
  const sessions = {
    binding: (id: string) => bindings.get(id),
    list: {
      getSnapshot: () => listSnapshot,
      subscribe: (cb: () => void) => {
        listListeners.push(cb)
        return () => {
          const i = listListeners.indexOf(cb)
          if (i >= 0) listListeners.splice(i, 1)
        }
      },
    },
  }
  const conversation = {
    input: {
      inputTriggers: (id: string) => ({
        launcher: {
          getSnapshot: () => (id === 'menu-open' ? 'command' : null),
        },
      }),
      for: (actx: { sessionId?: string }) => ({
        setDraft: (text: string) => {
          drafts.set(actx.sessionId ?? '', text)
        },
        state: { getSnapshot: () => ({ draft: drafts.get(actx.sessionId ?? '') ?? '' }) },
      }),
    },
  }
  const ctx = {
    sessions,
    conversation,
    reflect: { get: (name: string) => (name === 'conversation' ? conversation : undefined) },
    // 活跃会话绑定上下文（conversation.input.for 消费切片寻址键）
  }
  ;(globalThis as { document?: unknown }).document = doc
  return { doc, ctx, drafts, bindings, listListeners, listSnapshot }
}

function setDoc(doc: unknown): void {
  ;(globalThis as { document?: unknown }).document = doc
}

function worldWithSession(world: World, id: string, texts: { seq: number; text: string }[], disposes?: { count: number }[]): void {
  world.bindings.set(id, { sessionId: id, ctx: { sessionId: id }, eventSource: fakeEventSource(texts, disposes) })
  world.listSnapshot.byId[id] = { id, retainedBy: { mainView: 1 } }
}

/** 官方生命周期缝假件（cordis ctx.effect——记录 effect 产物，unload() 模拟 fiber 卸载） */
function mountEffectRecorder(world: World): { unload(): void } {
  const disposers: (() => void)[] = []
  ;(world.ctx as { effect?: (execute: () => () => void) => unknown }).effect = (execute) => {
    const disposer = execute()
    disposers.push(disposer)
    return disposer
  }
  return {
    unload(): void {
      for (const d of disposers.splice(0)) d()
    },
  }
}

describe('wireInputHistoryClient（组合接线面）', () => {
  it('sessions 缺席 = 空态降级（sessionsAvailable=false，不炸组合）', () => {
    setDoc(undefined)
    const face = wireInputHistoryClient({} as never)
    expect(face.sessionsAvailable).toBe(false)
    expect(() => face.dispose()).not.toThrow()
  })

  it('全缝在场：活跃会话自动 attach，ArrowUp 翻出已发送消息并置稿（DOM 键源 → 历史）', () => {
    const world = fakeWorld()
    worldWithSession(world, 's1', [{ seq: 1, text: '会话一消息' }])
    const face = wireInputHistoryClient(world.ctx as never)
    expect(face.sessionsAvailable).toBe(true)
    expect(face.history?.attachedSession()).toBe('s1')
    world.doc.dispatch('ArrowUp', editableTarget())
    expect(world.drafts.get('s1')).toBe('会话一消息')
    // ArrowDown 翻过最新一条恢复暂存（空草稿）
    world.doc.dispatch('ArrowDown', editableTarget())
    expect(world.drafts.get('s1')).toBe('')
    face.dispose()
  })

  it('mention 菜单开时不抢键：方向键不进历史', () => {
    const world = fakeWorld()
    worldWithSession(world, 'menu-open', [{ seq: 1, text: '消息' }])
    const face = wireInputHistoryClient(world.ctx as never)
    world.doc.dispatch('ArrowUp', editableTarget())
    expect(world.drafts.get('menu-open') ?? '').toBe('')
    face.dispose()
  })

  it('会话切换即切源：list 快照换活跃会话后翻出新会话消息', () => {
    const world = fakeWorld()
    worldWithSession(world, 's1', [{ seq: 1, text: '会话一消息' }])
    worldWithSession(world, 's2', [{ seq: 10, text: '会话二消息' }])
    const face = wireInputHistoryClient(world.ctx as never)
    expect(face.history?.attachedSession()).toBe('s1')
    // 模拟宿主切换活跃会话：s1 退留、s2 在留
    world.listSnapshot.byId['s1'] = { id: 's1', retainedBy: { mainView: 0 } }
    for (const cb of world.listListeners) cb()
    expect(face.history?.attachedSession()).toBe('s2')
    world.doc.dispatch('ArrowUp', editableTarget())
    expect(world.drafts.get('s2')).toBe('会话二消息')
    face.dispose()
  })

  it('dispose 后键源退订：方向键不再触发置稿', () => {
    const world = fakeWorld()
    worldWithSession(world, 's1', [{ seq: 1, text: '消息' }])
    const face = wireInputHistoryClient(world.ctx as never)
    face.dispose()
    world.doc.dispatch('ArrowUp', editableTarget())
    expect(world.drafts.size).toBe(0)
  })

  it('apply 生产路径 dispose 挂 ctx.effect：fiber unload 时 keydown/list/feed 全量退订', () => {
    const world = fakeWorld()
    const feedDisposes: { count: number }[] = []
    worldWithSession(world, 's1', [{ seq: 1, text: '消息' }], feedDisposes)
    const fiber = mountEffectRecorder(world)
    inputHistoryClient.apply(world.ctx as never)
    expect(world.drafts.size).toBe(0)
    world.doc.dispatch('ArrowUp', editableTarget())
    expect(world.drafts.get('s1')).toBe('消息') // 卸载前接线有效
    fiber.unload() // 模拟 fiber 卸载
    world.doc.dispatch('ArrowUp', editableTarget())
    expect(world.drafts.get('s1')).toBe('消息') // keydown 已退订，不再触发
    expect(world.listListeners).toHaveLength(0) // list.subscribe 已退订
    expect(feedDisposes.reduce((n, t) => n + t.count, 0)).toBeGreaterThan(0) // feed 订阅已释放
  })

  it('apply late-wiring 路径同样挂 ctx.effect：inject 晚到接线后 unload 全量退订', () => {
    const world = fakeWorld()
    const feedDisposes: { count: number }[] = []
    // 先不提供 sessions——走 inject 兜底路径
    const sessions = (world.ctx as { sessions: unknown }).sessions
    delete (world.ctx as { sessions?: unknown }).sessions
    const fiber = mountEffectRecorder(world)
    const injectListeners: ((scope: unknown) => void)[] = []
    ;(world.ctx as { inject?: unknown }).inject = (_names: readonly string[], cb: (scope: unknown) => void) => {
      injectListeners.push(cb)
    }
    inputHistoryClient.apply(world.ctx as never)
    expect(injectListeners).toHaveLength(1)
    // sessions 晚到：注入回调触发接线
    ;(world.ctx as { sessions?: unknown }).sessions = sessions
    worldWithSession(world, 's1', [{ seq: 1, text: '消息' }], feedDisposes)
    for (const cb of injectListeners) cb(world.ctx)
    world.doc.dispatch('ArrowUp', editableTarget())
    expect(world.drafts.get('s1')).toBe('消息') // 晚到接线有效
    fiber.unload()
    world.doc.dispatch('ArrowUp', editableTarget())
    expect(world.drafts.get('s1')).toBe('消息') // 卸载后不再触发
    expect(world.listListeners).toHaveLength(0)
    expect(feedDisposes.reduce((n, t) => n + t.count, 0)).toBeGreaterThan(0)
  })
})
