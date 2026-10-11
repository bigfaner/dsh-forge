// S7 投影 unit 单测（run-tasks-host-command 1.8——SC8 折叠面）：forge-dispatch-loop 键
// 折叠既有 command/run + command/done 日志派生 {sourceSlug, status}（零新增记录——fold
// 只读不 append）。锚面：
//   - 状态迁移全表：idle→starting→running（成功）/failed（启动失败）→stopping→stopped
//     （停止成功）/running（停止失败回写）——含状态迁移（AC）；
//   - 无关事件恒同引用返回（registry Object.is 零下游工作契约——dsh-session-projection
//     index.js advanceCell/drive 判别面）；
//   - schema 双面：stateSchema/viewSchema.parse 校验（registry restore/view 唯一消费位）；
//   - 键与版本常量 pin（装配方与测试同源）。
import { describe, expect, it } from 'vitest'
import {
  createForgeDispatchLoopProjection,
  FORGE_DISPATCH_LOOP_PROJECTION_KEY,
  FORGE_DISPATCH_LOOP_STATE_VERSION,
} from './dispatch-loop.js'
import type { ForgeDispatchLoopTableKeyAssertion, ForgeDispatchLoopUnitState } from './dispatch-loop.js'

/** 会话事件窄构造（官方 SessionEvent 结构切片——fold 只读 type/data） */
function evt(type: string, data: unknown): { type: string; data: unknown } {
  return { type, data }
}

/** command/run 两指令构造（官方事件形状：commandId + name + args?） */
function run(name: string, commandId: string, args?: string): { type: string; data: unknown } {
  return evt('command/run', { commandId, name, ...(args !== undefined ? { args } : {}) })
}

function done(commandId: string, kind: 'success' | 'error'): { type: string; data: unknown } {
  return evt('command/done', { commandId, kind })
}

const unit = createForgeDispatchLoopProjection()

/** 逐事件折叠便捷面 */
function fold(events: readonly { type: string; data: unknown }[]): ForgeDispatchLoopUnitState {
  let state = unit.init({ sessionId: 's-1', cwd: 'C:\\ws', createdAt: 0 }, 0)
  for (const event of events) state = unit.apply(state, event as never)
  return state
}

describe('键面 pin（/plan 同构——declare-module 合并进 SessionProjectionMap 的键身份）', () => {
  it('key = forge-dispatch-loop、stateVersion = 1、wire 面齐备（view+viewSchema）', () => {
    expect(FORGE_DISPATCH_LOOP_PROJECTION_KEY).toBe('forge-dispatch-loop')
    expect(unit.key).toBe('forge-dispatch-loop')
    expect(FORGE_DISPATCH_LOOP_STATE_VERSION).toBe(1)
    expect(unit.stateVersion).toBe(1)
    expect(unit.wire).toBeDefined()
    expect(typeof unit.wire?.view).toBe('function')
    expect(unit.wire?.viewSchema).toBeDefined()
    expect(unit.stateSchema).toBeDefined()
  })

  it('init = 全空态：running/stopping 双空 + sourceSlug null + status idle', () => {
    const state = unit.init({} as never, 0)
    expect(state).toEqual({ running: null, stopping: null, sourceSlug: null, status: 'idle' })
    // init 恒通过自家 stateSchema（restore 种子面）
    expect(unit.stateSchema.parse(state)).toEqual(state)
  })

  it('declare-module 合并显形（/plan 同构——表键身份锚类型承载键常量；合并失败 = never 即编译错）', () => {
    const mergedKey: ForgeDispatchLoopTableKeyAssertion = FORGE_DISPATCH_LOOP_PROJECTION_KEY
    expect(mergedKey).toBe('forge-dispatch-loop')
  })
})

describe('折叠：run-dag-tasks 指令生命周期（启动族迁移）', () => {
  it('带参启动：command/run → starting（sourceSlug 取 args）→ done success → running（含状态迁移 AC）', () => {
    const state = fold([run('run-dag-tasks', 'c-1', ' my-feature '), done('c-1', 'success')])
    expect(state.status).toBe('running')
    expect(state.sourceSlug).toBe('my-feature') // args trim 单点
    expect(state.running).toBeNull() // 配对结算后摘牌
    expect(unit.wire?.view(state)).toEqual({ sourceSlug: 'my-feature', status: 'running' })
  })

  it('启动失败：done error → failed（sourceSlug 保留——失败事实可辨）', () => {
    const state = fold([run('run-dag-tasks', 'c-2', 'f'), done('c-2', 'error')])
    expect(state.status).toBe('failed')
    expect(state.sourceSlug).toBe('f')
    expect(state.running).toBeNull()
  })

  it('无参启动（问询选择路径）：args 缺席 → sourceSlug null（日志不可知，零猜测）', () => {
    const state = fold([run('run-dag-tasks', 'c-3'), done('c-3', 'success')])
    expect(state.status).toBe('running')
    expect(state.sourceSlug).toBeNull()
    expect(unit.wire?.view(state)).toEqual({ sourceSlug: null, status: 'running' })
  })

  it('进行中再触发（查看/停止/替换问询径）：最近一次 run/done 对胜出，终态回 running', () => {
    const state = fold([
      run('run-dag-tasks', 'c-4', 'f1'),
      done('c-4', 'success'),
      run('run-dag-tasks', 'c-5', 'f1'),
      done('c-5', 'success'),
    ])
    expect(state.status).toBe('running')
    expect(state.running).toBeNull()
  })
})

describe('折叠：stop-dag-tasks 指令生命周期（停止族迁移）', () => {
  it('活循环停止成功：running → stopping（stop run）→ done success → stopped', () => {
    const state = fold([
      run('run-dag-tasks', 'c-6', 'f'),
      done('c-6', 'success'),
      run('stop-dag-tasks', 'c-7'),
      done('c-7', 'success'),
    ])
    expect(state.status).toBe('stopped')
    expect(state.stopping).toBeNull()
    expect(unit.wire?.view(state)).toEqual({ sourceSlug: 'f', status: 'stopped' })
  })

  it('停止失败：done error → running 回写（循环仍在——stop 仅于活循环族被 fold 接受）', () => {
    const state = fold([
      run('run-dag-tasks', 'c-8', 'f'),
      done('c-8', 'success'),
      run('stop-dag-tasks', 'c-9'),
      done('c-9', 'error'),
    ])
    expect(state.status).toBe('running')
    expect(state.stopping).toBeNull()
  })

  it('非活循环族的 stop（idle/no-op stop）= 同引用原样——从未派发的会话零徽标（零归属泄露同源）', () => {
    const before = unit.init({} as never, 0)
    const after = unit.apply(before, run('stop-dag-tasks', 'c-10') as never)
    expect(after).toBe(before)
    const stopped = fold([
      run('run-dag-tasks', 'c-11', 'f'),
      done('c-11', 'success'),
      run('stop-dag-tasks', 'c-12'),
      done('c-12', 'success'),
    ])
    const afterStopped = unit.apply(stopped, run('stop-dag-tasks', 'c-13') as never)
    expect(afterStopped).toBe(stopped)
  })
})

describe('折叠：无关事件零下游（Object.is 同引用契约）', () => {
  it('无关 command（plan 等）/ 非 command 事件 / 不配对的 done = 同引用', () => {
    const base = fold([run('run-dag-tasks', 'c-14', 'f'), done('c-14', 'success')])
    expect(unit.apply(base, run('plan', 'c-15', 'on') as never)).toBe(base)
    expect(unit.apply(base, evt('turn/start', { turn: 1 }) as never)).toBe(base)
    expect(unit.apply(base, done('c-99', 'success') as never)).toBe(base)
    // 配对中（running 在场）收到他指令 done 同样零迁移
    const mid = fold([run('run-dag-tasks', 'c-16', 'f')])
    expect(unit.apply(mid, done('c-99', 'error') as never)).toBe(mid)
  })
})

describe('schema 双面（registry restore/view 唯一消费位——parse 抛错契约）', () => {
  it('stateSchema：合法态通过；外来形状（缺键/多键/错型/越界 status）parse 抛错', () => {
    const good: ForgeDispatchLoopUnitState = {
      running: { commandId: 'c', sourceSlug: 'f' },
      stopping: null,
      sourceSlug: 'f',
      status: 'starting',
    }
    expect(unit.stateSchema.parse(good)).toEqual(good)
    expect(() => unit.stateSchema.parse({})).toThrow()
    expect(() => unit.stateSchema.parse({ ...good, extra: 1 })).toThrow()
    expect(() => unit.stateSchema.parse({ ...good, status: 'bogus' })).toThrow()
    expect(() => unit.stateSchema.parse({ ...good, sourceSlug: 42 })).toThrow()
  })

  it('viewSchema：合法 wire 值通过；错型抛错——view 产物恒过自家 viewSchema', () => {
    expect(unit.wire?.viewSchema.parse({ sourceSlug: null, status: 'idle' })).toEqual({
      sourceSlug: null,
      status: 'idle',
    })
    expect(() => unit.wire?.viewSchema.parse({ sourceSlug: 'f' })).toThrow()
    expect(() => unit.wire?.viewSchema.parse({ sourceSlug: 'f', status: 'bogus' })).toThrow()
    // 全状态迁移序：view 产物逐站过 viewSchema
    const events = [
      run('run-dag-tasks', 'c-17', 'f'),
      done('c-17', 'success'),
      run('stop-dag-tasks', 'c-18'),
      done('c-18', 'success'),
    ]
    let state = unit.init({} as never, 0)
    for (const event of events) {
      state = unit.apply(state, event as never)
      expect(unit.wire?.viewSchema.parse(unit.wire!.view(state))).toEqual(unit.wire!.view(state))
    }
  })
})
