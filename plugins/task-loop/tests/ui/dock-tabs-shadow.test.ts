// dock tab 键控注册契约（fix-10 bug 400b3952 起家，host-integration-fixes 裁决 1 收口）：
// 官方 slots runtime 语义（probes/host-integration-fixes/slots-keyed-probe.md 核销）：keyed
// 同 key 同 priority 才拒收，报错明示「register at a different priority to shadow it
// (lowest renders)」——低 priority 遮蔽占用者是官方留的正缝；裁决 1 后概览键按双形态切换
// （project 在场 = 集成，task-loop 不注册自身 body；缺席 = 单装 -10 兜底），本门测锁定
// 假体机械语义（同键同 priority 拒收 + 升序分发）与集成/单装两端形态。
import { describe, expect, it } from 'vitest'
import { registerDockTabsFace } from '../../ui/dock-tabs-face.js'
import { DSWF_OVERVIEW_AC_PROGRESS_SLOT, PRIORITY_PROJECT_OVERVIEW_OWNER, PRIORITY_TASK_LOOP_FALLBACK } from '@dsh-forge/lib-ui'
import { registerKeyedSection, type SectionSlotsFace, type SlotEntryProjection } from '../../ui/keyed-section.js'
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
  const declared = new Set(['sidebar.right.pane.tab', 'sidebar.right.pane.tab.title', DSWF_OVERVIEW_AC_PROGRESS_SLOT])
  const occupants: Occupant[] = occupied.map((o) => ({ name: o.name, key: o.key, priority: o.priority ?? 0, component: 'project-body' }))
  const slots: SectionSlotsFace & { occupants: Occupant[]; dispatch(name: string, key: string): unknown } = {
    occupants,
    inject: (_key, cb) => {
      cb()
      return () => {}
    },
    entries: (slot: string): readonly SlotEntryProjection[] =>
      occupants
        .filter((e) => e.name === slot)
        .map((e) => ({ options: { name: e.name, key: e.key, priority: e.priority } })),
    subscribe: () => () => {},
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

describe('dock tab 键控注册（fix-10 bug 400b3952 + 裁决 1 双形态收口）', () => {
  it('集成形态：project 同键 priority 0 在场 → task-loop 零自身 body entry，AC 段按子槽键落座', () => {
    const slots = officialishSlots([
      { name: 'sidebar.right.pane.tab', key: 'dswf-overview', priority: PRIORITY_PROJECT_OVERVIEW_OWNER },
      { name: 'sidebar.right.pane.tab', key: 'dswf-doc', priority: PRIORITY_PROJECT_OVERVIEW_OWNER },
    ])
    const diag = registerDockTabsFace(fakeCtx(['dswf-overview', 'dswf-doc']) as never, slots, fakeLocale())
    expect(diag.mode).toBe('integrated')
    const ownBody = slots.occupants.find((e) => e.name === 'sidebar.right.pane.tab' && e.key === 'dswf-overview' && e.priority !== PRIORITY_PROJECT_OVERVIEW_OWNER)
    expect(ownBody).toBeUndefined()
    expect(slots.dispatch('sidebar.right.pane.tab', 'dswf-overview')).toBe('project-body')
    expect(slots.occupants.find((e) => e.name === DSWF_OVERVIEW_AC_PROGRESS_SLOT)).toBeDefined()
  })

  it('集成形态：chip 标题段让位 project（零 task-loop 题写注册）', () => {
    const slots = officialishSlots([{ name: 'sidebar.right.pane.tab', key: 'dswf-overview', priority: PRIORITY_PROJECT_OVERVIEW_OWNER }])
    const diag = registerDockTabsFace(fakeCtx(['dswf-overview', 'dswf-doc']) as never, slots, fakeLocale())
    expect(diag.mode).toBe('integrated')
    expect(slots.occupants.find((e) => e.name === 'sidebar.right.pane.tab.title')).toBeUndefined()
  })

  it('单装形态：body/title 恒以 -10 兜底落座（零竞争零行为差异）', () => {
    const slots = officialishSlots()
    const diag = registerDockTabsFace(fakeCtx() as never, slots, fakeLocale())
    expect(diag.mode).toBe('standalone')
    const overview = slots.occupants.find((e) => e.name === 'sidebar.right.pane.tab' && e.key === 'dswf-overview')
    expect(overview?.priority).toBe(PRIORITY_TASK_LOOP_FALLBACK)
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
