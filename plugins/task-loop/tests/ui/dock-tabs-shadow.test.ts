// dock tab 遮蔽注册契约（fix-10——bug 400b3952：task-loop 与 project 同键撞车，keyed
// slot sidebar.right.pane.tab 的 dswf-overview/dswf-doc 键已被 project 占 priority 0，
// task-loop 注册全降级 → 概览 tab 渲染 project 旧版工作台，AC 核销概览零渲染）。
// 官方 slots runtime 语义（dsh-web-frontend bundle 核销）：keyed 同 key 同 priority 才
// 拒收，报错明示「register at a different priority to shadow it (lowest renders)」——
// 低 priority 遮蔽占用者是官方留的正缝。本门测镜像该语义：同键同 priority 拒收 +
// ascending priority 排序分发（最低者渲染）。
import { describe, expect, it } from 'vitest'
import { registerDockTabsFace } from '../../ui/dock-tabs-face.js'
import { registerKeyedSection, type SectionSlotsFace } from '../../ui/keyed-section.js'
import type { LocaleServiceFace } from '../../ui/locale.js'

interface Occupant {
  readonly name: string
  readonly key: string | undefined
  readonly priority: number
  readonly component: unknown
}

/** 官方 slots 同型假体：slot 须先声明；keyed 同 key 同 priority 拒收；entries 按 priority 升序分发 */
function officialishSlots(occupied: readonly { name: string; key: string; priority?: number }[] = []): SectionSlotsFace & {
  occupants: Occupant[]
  dispatch(name: string, key: string): unknown
} {
  const declared = new Set(['sidebar.right.pane.tab', 'sidebar.right.pane.tab.title'])
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

function fakeLocale(): LocaleServiceFace {
  return { register: () => () => {}, bind: () => (key: string) => key }
}

/** 形状合法 ctx（sidebarRightTabs.register 同型拒收重复 id——官方 registry 语义） */
function fakeCtx(taken: readonly string[] = []): { get(name: string): unknown } {
  return {
    get: (name: string) =>
      name === 'sidebarRightTabs'
        ? {
            register: (definition: { readonly id: string }) => {
              if (taken.includes(definition.id)) throw new Error(`sidebarRight: tab type id "${definition.id}" is already registered`)
              return () => {}
            },
          }
        : undefined,
  }
}

describe('dock tab 遮蔽注册（fix-10 bug 400b3952）', () => {
  it('project 同键占用 priority 0 在场 → task-loop body 以低 priority 遮蔽落座且分发胜出', () => {
    const slots = officialishSlots([
      { name: 'sidebar.right.pane.tab', key: 'dswf-overview', priority: 0 },
      { name: 'sidebar.right.pane.tab', key: 'dswf-doc', priority: 0 },
    ])
    const diag = registerDockTabsFace(fakeCtx(['dswf-overview', 'dswf-doc']) as never, slots, fakeLocale())
    const body = slots.dispatch('sidebar.right.pane.tab', 'dswf-overview')
    expect(body).toBeDefined()
    expect(body).not.toBe('project-body')
    const overview = slots.occupants.find((e) => e.name === 'sidebar.right.pane.tab' && e.key === 'dswf-overview' && e.priority < 0)
    expect(overview).toBeDefined()
    expect(diag.registered).toContain('sidebar.right.pane.tab:dswf-overview')
  })

  it('chip 标题段：sidebar.right.pane.tab.title keyed dswf-overview 落座（任务概览题写）', () => {
    const slots = officialishSlots([{ name: 'sidebar.right.pane.tab', key: 'dswf-overview', priority: 0 }])
    registerDockTabsFace(fakeCtx(['dswf-overview', 'dswf-doc']) as never, slots, fakeLocale())
    const title = slots.dispatch('sidebar.right.pane.tab.title', 'dswf-overview')
    expect(title).toBeDefined()
    expect(title).not.toBe('project-body')
  })

  it('零竞争常态：body/title 恒以 shadow priority 落座（单装形态零行为差异）', () => {
    const slots = officialishSlots()
    registerDockTabsFace(fakeCtx() as never, slots, fakeLocale())
    const overview = slots.occupants.find((e) => e.name === 'sidebar.right.pane.tab' && e.key === 'dswf-overview')
    expect(overview?.priority).toBeLessThan(0)
  })

  it('registerKeyedSection 同步落座失败如实返回 undefined（诊断假阳性修型——=== undefined 门可判）', () => {
    const slots = officialishSlots([
      { name: 'sidebar.right.pane.tab', key: 'dswf-overview' },
      { name: 'sidebar.right.pane.tab', key: 'dswf-doc' },
    ])
    const result = registerKeyedSection(slots, {
      slot: 'sidebar.right.pane.tab',
      key: 'dswf-overview',
      component: 'task-loop-body',
    })
    expect(result).toBeUndefined()
  })

  it('registerKeyedSection 成功落座返回登记撤销器（非 undefined）', () => {
    const slots = officialishSlots()
    const result = registerKeyedSection(slots, {
      slot: 'sidebar.right.pane.tab',
      key: 'dswf-overview',
      component: 'task-loop-body',
    })
    expect(typeof result).toBe('function')
  })
})
