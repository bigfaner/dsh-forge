// 对话面 keyed 槽遮蔽注册契约（fix-12 bug ea968ae4——fix-10 dock tab shadow 治理残余面）：
// tool.call.toolview keyed 'dispatchTask' 与 conversation.chat.node keyed 'forge-event-group'
// 在 project 插件先装宿主内同键被占 priority 0，task-loop 同 priority 注册被官方 slots 拒收
// → 两 UI 槽降级不注册。治理 = 与 dock tab 族同缝：KEYED_SHADOW_PRIORITY 遮蔽落座。
// 官方 slots 同型假体语义与 dock-tabs-shadow.test.ts 同源（keyed 同 key 同 priority 拒收 +
// ascending priority 分发最低者渲染）。
import { describe, expect, it } from 'vitest'
import { registerConversationToolFaces } from '../../ui/conversation-views-face.js'
import { TOOL_CALL_TOOLVIEW_SLOT } from '../../ui/conversation-views-face.js'
import { FORGE_EVENT_NODE_KIND, FORGE_EVENT_NODE_SLOT } from '../../ui/event-node/forge-event-node.js'
import { DISPATCH_TASK_TOOL_KEY } from '../../ui/conversation-views-face.js'
import type { SectionSlotsFace } from '../../ui/keyed-section.js'

interface Occupant {
  readonly name: string
  readonly key: string | undefined
  readonly priority: number
  readonly component: unknown
}

/** 官方 slots 同型假体：slot 须先声明；keyed 同 key 同 priority 拒收；entries 按 priority 升序分发 */
function officialishSlots(
  declaredNames: readonly string[],
  occupied: readonly { name: string; key: string; priority?: number }[] = [],
): SectionSlotsFace & {
  occupants: Occupant[]
  dispatch(name: string, key: string): unknown
} {
  const declared = new Set(declaredNames)
  const occupants: Occupant[] = occupied.map((o) => ({ name: o.name, key: o.key, priority: o.priority ?? 0, component: 'project-body' }))
  const slots: SectionSlotsFace & { occupants: Occupant[]; dispatch(name: string, key: string): unknown } = {
    occupants,
    inject: (_key, cb) => {
      cb()
      return () => {}
    },
    register: (options, component) => {
      const o = options as { name?: string; key?: string; priority?: number }
      const name = o.name ?? ''
      if (!declared.has(name)) throw new Error(`slot "${name}" is not declared`)
      const priority = o.priority ?? 0
      const clash = occupants.find((e) => e.name === name && e.key === o.key && e.priority === priority)
      if (clash) throw new Error(`keyed slot "${name}" already has an entry for key "${o.key}" at priority ${priority} (registered by WC) — register at a different priority to shadow it (lowest renders)`)
      occupants.push({ name, key: o.key, priority, component })
      return () => {}
    },
    dispatch: (name, key) => {
      const hits = occupants
        .filter((e) => e.name === name && e.key === key)
        .sort((a, b) => a.priority - b.priority)
      return hits[0]?.component
    },
  }
  return slots
}

/** 形状合法 ctx（uiConversation.events.register 同型——stream/组定义登记面） */
function fakeCtx(): { uiConversation: { events: { register: () => () => void } } } {
  return {
    uiConversation: {
      events: {
        register: () => () => {},
      },
    },
  }
}

const DECLARED = [TOOL_CALL_TOOLVIEW_SLOT, FORGE_EVENT_NODE_SLOT]

describe('对话面 keyed 遮蔽注册（fix-12 bug ea968ae4）', () => {
  it('toolview keyed 键 = 官方宿主 snake_case wire 名（fix-12 真机判例——camelCase 永不命中，业务行静默落官方通用行）', () => {
    expect(DISPATCH_TASK_TOOL_KEY).toBe('dispatch_task')
  })

  it('project 同键占用 priority 0 在场 → 两槽以低 priority 遮蔽落座且分发胜出', () => {
    const slots = officialishSlots(DECLARED, [
      { name: TOOL_CALL_TOOLVIEW_SLOT, key: DISPATCH_TASK_TOOL_KEY, priority: 0 },
      { name: FORGE_EVENT_NODE_SLOT, key: FORGE_EVENT_NODE_KIND, priority: 0 },
    ])
    const diag = registerConversationToolFaces(fakeCtx() as never, slots)
    for (const [slot, key] of [
      [TOOL_CALL_TOOLVIEW_SLOT, DISPATCH_TASK_TOOL_KEY],
      [FORGE_EVENT_NODE_SLOT, FORGE_EVENT_NODE_KIND],
    ] as const) {
      const body = slots.dispatch(slot, key)
      expect(body, `${slot}:${key} 分发落空`).toBeDefined()
      expect(body, `${slot}:${key} 仍渲染 project 占用版`).not.toBe('project-body')
      const shadow = slots.occupants.find((e) => e.name === slot && e.key === key && e.priority < 0)
      expect(shadow, `${slot}:${key} 零负 priority 遮蔽落座`).toBeDefined()
    }
    expect(diag.registered).toContain(DISPATCH_TASK_TOOL_KEY)
    expect(diag.registered).toContain(FORGE_EVENT_NODE_KIND)
  })

  it('零竞争常态：两槽恒以 shadow priority 落座（单装形态零行为差异）', () => {
    const slots = officialishSlots(DECLARED)
    registerConversationToolFaces(fakeCtx() as never, slots)
    const toolview = slots.occupants.find((e) => e.name === TOOL_CALL_TOOLVIEW_SLOT && e.key === DISPATCH_TASK_TOOL_KEY)
    const eventNode = slots.occupants.find((e) => e.name === FORGE_EVENT_NODE_SLOT && e.key === FORGE_EVENT_NODE_KIND)
    expect(toolview?.priority).toBeLessThan(0)
    expect(eventNode?.priority).toBeLessThan(0)
  })
})
