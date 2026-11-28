// G1 pin ㉑（M3 pin 池扩池 #21，任务 5.1）：ForgePluginEvent 判别联合完备性（exhaustiveness）。
// 权威：tech-design Appendix「契约面 pin 扩池」第 21 项（事件两层联合类型——判别联合完备性）
// + §Interface 3（两层抽象：信封 × 十事件内型（triage-progress-row 1.1 增 triage-decided/triage-outcome））。
// 审计面（机械断言，非行为测试）：
//   1. 联合 type 判别集 ↔ FORGE_PLUGIN_EVENT_TYPES 常量全等（编译期 Record 键封闭 + 运行期枚举）。
// （原 pin ㉑-2/㉑-3 为旧包 plugin-forge 源发射面代码审计与 bus.ts 单源审计——旧包随 M1 阶段B
//   退役整段删除；继任事件面 pin = plugins/task-loop/tests/events/bus.test.ts。）
import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  FORGE_PLUGIN_EVENT_TYPES,
  type ForgePluginEvent,
  type ForgePluginEventEnvelope,
  type ForgePluginEventType,
} from '../../packages/contracts/src/dto/forge.js'

describe('pin ㉑-1 判别联合 ↔ 运行期枚举全等（两层抽象）', () => {
  it('事件类型全集 = 十事件初集（FORGE_PLUGIN_EVENT_TYPES 常量本尊）', () => {
    expect([...FORGE_PLUGIN_EVENT_TYPES]).toEqual([
      'task-claimed',
      'task-spawned',
      'task-progress',
      'task-submitted',
      'task-worker-done',
      'no-ready-task',
      'tool-error',
      'proposal-created',
      'triage-decided',
      'triage-outcome',
    ])
  })

  it('type 判别 exhaustiveness：Record<ForgePluginEvent[type], ...> 键封闭（增删联合成员即编译红）', () => {
    const exhaustive: Record<ForgePluginEvent['type'], ForgePluginEventType> = {
      'task-claimed': 'task-claimed',
      'task-spawned': 'task-spawned',
      'task-progress': 'task-progress',
      'task-submitted': 'task-submitted',
      'task-worker-done': 'task-worker-done',
      'no-ready-task': 'no-ready-task',
      'tool-error': 'tool-error',
      'proposal-created': 'proposal-created',
      'triage-decided': 'triage-decided',
      'triage-outcome': 'triage-outcome',
    }
    expectTypeOf<keyof typeof exhaustive>().toEqualTypeOf<ForgePluginEventType>()
    expect(Object.keys(exhaustive).sort()).toEqual([...FORGE_PLUGIN_EVENT_TYPES].sort())
  })

  it('信封 = 恒 { ts, sessionId, slug }（事件必从某会话发出——两层抽象的外层）', () => {
    expectTypeOf<ForgePluginEventEnvelope>().toHaveProperty('ts')
    expectTypeOf<ForgePluginEventEnvelope>().toHaveProperty('sessionId')
    expectTypeOf<ForgePluginEventEnvelope>().toHaveProperty('slug')
    expectTypeOf<ForgePluginEvent['type']>().toEqualTypeOf<ForgePluginEventType>()
  })
})
