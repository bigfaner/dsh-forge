// G1 pin ㉑（M3 pin 池扩池 #21，任务 5.1）：ForgePluginEvent 判别联合完备性（exhaustiveness）。
// 权威：tech-design Appendix「契约面 pin 扩池」第 21 项（事件两层联合类型——判别联合完备性）
// + §Interface 3（两层抽象：信封 × 七事件内型）。
// 审计面（机械断言，非行为测试）：
//   1. 联合 type 判别集 ↔ FORGE_PLUGIN_EVENT_TYPES 常量全等（编译期 Record 键封闭 + 运行期枚举）；
//   2. 发射面代码审计——plugin-forge 源内一切事件 type 字面量（`type: '...'` 记号 +
//      DispatchEventPayloads 接口键面）⊆ 联合全集（未入联合的新事件名即红）；
//   3. 总线守卫面 = FORGE_PLUGIN_EVENT_TYPES.includes（bus.ts 单源消费——信封+类型双守卫）。
// 发射点现状（3.4/3.5 落地）：dispatchTask 流五事件（claimed/spawned/worker-done/no-ready-task/
// tool-error）+ submitTask task-submitted + 全 tool 面 tool-error（emitToolError）；
// proposal-created 载荷类型在联合而无发射点（快速通道创建径事件化 = 后续按需——审计断言
// 为 ⊆ 非 =，不强迫发射面穷举）。
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  FORGE_PLUGIN_EVENT_TYPES,
  type ForgePluginEvent,
  type ForgePluginEventEnvelope,
  type ForgePluginEventType,
} from '../../packages/contracts/src/dto/forge.js'
import { ROOT } from './pins.js'

const PLUGIN_SRC = join(ROOT, 'packages/plugin-forge/src')

/** 递归收集非测试 .ts 源文本（file = POSIX 相对路径——win32 反斜杠归一） */
function sourceTexts(dir: string): Array<{ file: string; text: string }> {
  const out: Array<{ file: string; text: string }> = []
  const walk = (d: string): void => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name)
      if (entry.isDirectory()) walk(p)
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        out.push({ file: p.slice(PLUGIN_SRC.length + 1).replace(/\\/g, '/'), text: readFileSync(p, 'utf8') })
      }
    }
  }
  walk(dir)
  return out
}

/** 事件名形状：kebab 且 ∈ 事件前缀族（task-/no-/tool-/proposal-）——排除 schema 的 type: 'object' 等 */
const isEventNameShape = (token: string): boolean => /^(task|no|tool|proposal)-[a-z-]+$/.test(token)

describe('pin ㉑-1 判别联合 ↔ 运行期枚举全等（两层抽象）', () => {
  it('事件类型全集 = 七事件初集（FORGE_PLUGIN_EVENT_TYPES 常量本尊）', () => {
    expect([...FORGE_PLUGIN_EVENT_TYPES]).toEqual([
      'task-claimed',
      'task-spawned',
      'task-submitted',
      'task-worker-done',
      'no-ready-task',
      'tool-error',
      'proposal-created',
    ])
  })

  it('type 判别 exhaustiveness：Record<ForgePluginEvent[type], ...> 键封闭（增删联合成员即编译红）', () => {
    const exhaustive: Record<ForgePluginEvent['type'], ForgePluginEventType> = {
      'task-claimed': 'task-claimed',
      'task-spawned': 'task-spawned',
      'task-submitted': 'task-submitted',
      'task-worker-done': 'task-worker-done',
      'no-ready-task': 'no-ready-task',
      'tool-error': 'tool-error',
      'proposal-created': 'proposal-created',
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

describe('pin ㉑-2 发射面代码审计（emit 字面量 ⊆ 联合全集）', () => {
  const sources = sourceTexts(PLUGIN_SRC)

  it('type 记号事件名字面量（kebab 事件形状）⊆ 联合七事件', () => {
    const literals = new Set<string>()
    for (const { text } of sources) {
      for (const m of text.matchAll(/type: '([a-z][a-z-]+)'/g)) {
        if (isEventNameShape(m[1]!)) literals.add(m[1]!)
      }
    }
    // 现发射面：task-submitted + tool-error（dispatch 流四事件经 DispatchEventPayloads 键面——㉑-3 审计）
    expect([...literals].sort()).toEqual(['task-submitted', 'tool-error'])
    for (const name of literals) {
      expect(FORGE_PLUGIN_EVENT_TYPES, `发射字面量 ${name} 不在联合`).toContain(name)
    }
  })

  it('dispatchTask 流事件键面（DispatchEventPayloads 接口键）⊆ 联合七事件', () => {
    const dispatch = sources.find((s) => s.file === 'tools/dispatch-task.ts')!
    const block = /interface DispatchEventPayloads \{([\s\S]*?)\n\}/.exec(dispatch.text)
    expect(block, 'DispatchEventPayloads 接口在场').toBeTruthy()
    const keys = [...block![1]!.matchAll(/^ {2}'([a-z-]+)': /gm)].map((m) => m[1]!)
    expect(keys.sort()).toEqual(['no-ready-task', 'task-claimed', 'task-spawned', 'task-worker-done'])
    for (const key of keys) {
      expect(FORGE_PLUGIN_EVENT_TYPES, `dispatch 流事件 ${key} 不在联合`).toContain(key)
    }
  })

  it('总线守卫单源：bus.ts 消费 FORGE_PLUGIN_EVENT_TYPES.includes（信封+类型双守卫）', () => {
    const bus = sources.find((s) => s.file === 'events/bus.ts')!
    expect(bus.text).toContain('FORGE_PLUGIN_EVENT_TYPES.includes')
    expect(bus.text).toContain("import { FORGE_PLUGIN_EVENT_TYPES, type ForgePluginEvent } from '@dsh-forge/contracts'")
  })
})
