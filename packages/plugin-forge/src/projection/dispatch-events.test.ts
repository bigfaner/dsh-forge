// 1.6 投影 unit 单测（loop-event-delivery——forge-dispatch-events 键）：fold 'forge/progress'
// 会话事件派生 {entries, total}（写入即落日志——registry 逐事件驱动 fold，零新增记录）。锚面：
//   - 六字段齐备（dispatch-loop 同构）+ declare-module 键身份锚；
//   - apply 只认 'forge/progress'：他类型/畸形载荷恒同引用返回（registry Object.is 契约）；
//   - 载荷累积：taskTitle/scenario/at/workerSessionId 等字段透传；
//   - 规模上界：entries 封顶 N=200、total 全量计数；
//   - 恢复：stateSchema 种子重放（checkpoint 冷读链）+ viewSchema 校验全绿。
import { describe, expect, it } from 'vitest'
import {
  createForgeDispatchEventsProjection,
  FORGE_DISPATCH_EVENTS_PROJECTION_KEY,
  FORGE_DISPATCH_EVENTS_STATE_VERSION,
  FORGE_DISPATCH_EVENTS_WINDOW_SIZE,
} from './dispatch-events.js'
import type { ForgeDispatchEventsTableKeyAssertion, ForgeDispatchEventsUnitState } from './dispatch-events.js'

/** 会话事件窄构造（官方 SessionEvent 结构切片——fold 只读 type/data） */
function evt(type: string, data: unknown): { type: string; data: unknown } {
  return { type, data }
}

/** 'forge/progress' 事件构造（载荷 = ForgeProgressEventData 切片） */
function progress(data: Record<string, unknown>): { type: string; data: unknown } {
  return evt('forge/progress', { sourceSlug: 'feat-x', verb: 'claim', status: 'running', at: 1, ...data })
}

const unit = createForgeDispatchEventsProjection()

/** 逐事件折叠便捷面 */
function fold(events: readonly { type: string; data: unknown }[]): ForgeDispatchEventsUnitState {
  let state = unit.init({ sessionId: 's-1', cwd: 'C:\\ws', createdAt: 0 }, 0)
  for (const event of events) state = unit.apply(state, event as never)
  return state
}

describe('键面 pin（dispatch-loop 同构——六字段 + declare-module 合并键身份）', () => {
  it('key = forge-dispatch-events、stateVersion = 1、wire 面齐备（view+viewSchema）', () => {
    expect(FORGE_DISPATCH_EVENTS_PROJECTION_KEY).toBe('forge-dispatch-events')
    expect(unit.key).toBe('forge-dispatch-events')
    expect(FORGE_DISPATCH_EVENTS_STATE_VERSION).toBe(1)
    expect(unit.stateVersion).toBe(1)
    expect(FORGE_DISPATCH_EVENTS_WINDOW_SIZE).toBe(200)
    expect(unit.stateSchema).toBeDefined()
    expect(typeof unit.init).toBe('function')
    expect(typeof unit.apply).toBe('function')
    expect(unit.wire).toBeDefined()
    expect(typeof unit.wire?.view).toBe('function')
    expect(unit.wire?.viewSchema).toBeDefined()
  })

  it('init = 空窗口：entries 空 + total 0，且恒过自家 stateSchema（restore 种子面）', () => {
    const state = unit.init({} as never, 0)
    expect(state).toEqual({ entries: [], total: 0 })
    expect(unit.stateSchema.parse(state)).toEqual(state)
  })

  it('declare-module 合并显形（表键身份锚类型承载键常量；合并失败 = never 即编译错）', () => {
    const mergedKey: ForgeDispatchEventsTableKeyAssertion = FORGE_DISPATCH_EVENTS_PROJECTION_KEY
    expect(mergedKey).toBe('forge-dispatch-events')
  })
})

describe('apply：只认 forge/progress（Object.is 同引用契约）', () => {
  it('他类型事件（command/run、turn/start 等）= 同引用原样', () => {
    const base = fold([progress({ at: 1 })])
    expect(unit.apply(base, evt('command/run', { commandId: 'c', name: 'run-dag-tasks' }) as never)).toBe(base)
    expect(unit.apply(base, evt('turn/start', { turn: 1 }) as never)).toBe(base)
    expect(unit.apply(base, evt('user/message', {}) as never)).toBe(base)
  })

  it('forge/progress 畸形载荷（缺 sourceSlug / 非对象）= 同引用原样（不猜不弃行）', () => {
    const base = fold([progress({ at: 1 })])
    expect(unit.apply(base, evt('forge/progress', { verb: 'claim' }) as never)).toBe(base)
    expect(unit.apply(base, evt('forge/progress', 'bogus') as never)).toBe(base)
    expect(unit.apply(base, evt('forge/progress', undefined) as never)).toBe(base)
  })

  it('合法 forge/progress 事件逐条累积（onChanged 逐事件驱动语义——每事件恰好一次新态）', () => {
    const s1 = unit.apply(unit.init({} as never, 0), progress({ at: 1 }) as never)
    expect(s1.total).toBe(1)
    const s2 = unit.apply(s1, progress({ verb: 'settle', status: 'completed', at: 2 }) as never)
    expect(s2.total).toBe(2)
    expect(s2.entries).toHaveLength(2)
  })
})

describe('载荷累积：taskTitle/scenario/at/workerSessionId 透传', () => {
  it('扩展字段逐条保留（事件清单 22 场景的 scenario 值域透传）', () => {
    const state = fold([
      progress({ verb: 'startup', scenario: 'startup/from-scratch', at: 100, taskTitle: 'Root task' }),
      progress({
        verb: 'claim',
        scenario: 'claim/new',
        at: 200,
        taskKey: 'feat-x/1.2',
        taskTitle: 'Impl fold unit',
        workerSessionId: 'ws-1',
        counts: { pending: 2, running: 1, done: 0 },
      }),
      progress({ verb: 'settle', status: 'completed', scenario: 'task/complete', at: 300, note: 'done well' }),
    ])
    expect(state.total).toBe(3)
    expect(state.entries[1]).toEqual({
      sourceSlug: 'feat-x',
      verb: 'claim',
      status: 'running',
      at: 200,
      scenario: 'claim/new',
      taskKey: 'feat-x/1.2',
      taskTitle: 'Impl fold unit',
      workerSessionId: 'ws-1',
      counts: { pending: 2, running: 1, done: 0 },
    })
    expect(state.entries[2]).toMatchObject({ verb: 'settle', scenario: 'task/complete', at: 300, note: 'done well' })
    const view = unit.wire!.view(state)
    expect(view.entries).toEqual(state.entries)
    expect(view.total).toBe(3)
    expect(unit.wire!.viewSchema.parse(view)).toEqual(view)
  })
})

describe('规模上界：entries 封顶 N=200、total 全量计数', () => {
  it('折叠 250 条：entries 恒 200（尾部最新窗口）、total = 250', () => {
    const events = Array.from({ length: 250 }, (_, i) => progress({ at: i + 1 }))
    const state = fold(events)
    expect(state.entries).toHaveLength(FORGE_DISPATCH_EVENTS_WINDOW_SIZE)
    expect(state.total).toBe(250)
    expect(state.entries[0]?.at).toBe(51) // 头部最旧被裁剪
    expect(state.entries[199]?.at).toBe(250) // 尾部最新
    expect(unit.stateSchema.parse(state)).toEqual(state)
  })
})

describe('恢复：stateSchema 种子重放（checkpoint 冷读链）', () => {
  it('parse 后的 state 可继续 apply 增量折叠（Session.fromRestore 还原 → 新 append 续驱动）', () => {
    const cold = unit.stateSchema.parse({
      entries: [progress({ at: 1 }).data, progress({ verb: 'settle', status: 'completed', at: 2 }).data],
      total: 2,
    })
    const resumed = unit.apply(cold, progress({ verb: 'claim', at: 3 }) as never)
    expect(resumed.total).toBe(3)
    expect(resumed.entries).toHaveLength(3)
  })

  it('外来 state 形状（缺键/多键/越界窗口/错型/坏条目）parse 抛错——回退重折', () => {
    const good: ForgeDispatchEventsUnitState = { entries: [], total: 0 }
    expect(() => unit.stateSchema.parse({})).toThrow()
    expect(() => unit.stateSchema.parse({ ...good, extra: 1 })).toThrow()
    expect(() => unit.stateSchema.parse({ ...good, total: -1 })).toThrow()
    expect(() => unit.stateSchema.parse({ ...good, total: 1.5 })).toThrow()
    expect(() => unit.stateSchema.parse({ entries: [{}], total: 1 })).toThrow()
    expect(() =>
      unit.stateSchema.parse({
        entries: Array.from({ length: FORGE_DISPATCH_EVENTS_WINDOW_SIZE + 1 }, () => progress({ at: 1 }).data),
        total: 201,
      }),
    ).toThrow()
  })

  it('viewSchema：合法值通过；缺键/越界词表条目/负 total 抛错', () => {
    expect(unit.wire!.viewSchema.parse({ entries: [], total: 0 })).toEqual({ entries: [], total: 0 })
    expect(() => unit.wire!.viewSchema.parse({ entries: [], total: 0, extra: 1 })).toThrow()
    expect(() => unit.wire!.viewSchema.parse({ entries: [{}], total: 1 })).toThrow()
    expect(() => unit.wire!.viewSchema.parse({ entries: [], total: -1 })).toThrow()
  })
})
