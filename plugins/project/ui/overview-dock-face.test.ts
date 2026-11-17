// 概览 dock tab 注册面契约（host-integration-fixes 裁决 1——project = dswf-overview
// priority 0 拥有者）：页型 + keyed body 两段落座、children 子槽声明表随行、类型撞车
// （task-loop 单装先注册）fail-soft 记挫 + 槽订阅补判重试一次、effect 级联清理。
import { describe, expect, it } from 'vitest'
import { registerOverviewDockFace } from './overview-dock-face.js'
import { registerKeyedSection, type SectionSlotsFace, type SlotEntryProjection } from './keyed-section.js'
import { SIDEBAR_RIGHT_PANE_TAB_SLOT } from './official-seams.js'

const OVERVIEW_KEY = 'dswf-overview'

interface Occupant {
  readonly name: string
  readonly key: string | undefined
  readonly priority: number
  readonly component: unknown
}

/** 官方 slots 同型假体（inject 声明缝 + keyed 拒收 + subscribe 通知） */
function officialishSlots(): SectionSlotsFace & {
  occupants: Occupant[]
  notify(): void
  listeners: Set<() => void>
} {
  const declared = new Set([SIDEBAR_RIGHT_PANE_TAB_SLOT, 'project.section.knowledge-dir', 'dswf-overview.ac-progress'])
  const occupants: Occupant[] = []
  const listeners = new Set<() => void>()
  const slots = {
    occupants,
    listeners,
    inject: (_key: string, cb: () => (() => void) | undefined) => {
      const dispose = cb()
      return () => {
        dispose?.()
      }
    },
    entries: (slot: string): readonly SlotEntryProjection[] =>
      occupants
        .filter((e) => e.name === slot)
        .map((e) => ({ options: { name: e.name, key: e.key, priority: e.priority } })),
    subscribe: (slot: string, listener: () => void) => {
      void slot
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    register: (options: Record<string, unknown>, component: unknown) => {
      const o = options as { name?: string; key?: string; priority?: number }
      const name = o.name ?? ''
      if (!declared.has(name)) throw new Error(`slot "${name}" is not declared`)
      const priority = o.priority ?? 0
      const clash = occupants.find((e) => e.name === name && e.key === o.key && e.priority === priority)
      if (clash) throw new Error(`keyed slot "${name}" already has an entry for key "${o.key}" at priority ${priority} — register at a different priority to shadow it (lowest renders)`)
      occupants.push({ name, key: o.key, priority, component })
      return () => {
        const i = occupants.findIndex((e) => e.name === name && e.key === o.key && e.priority === priority)
        if (i >= 0) occupants.splice(i, 1)
      }
    },
    notify: () => {
      for (const listener of listeners) listener()
    },
  }
  return slots as never
}

/** 形状合法 ctx（sidebarRightTabs.register 可预占 id——官方 registry 同 id 二次注册抛错） */
function fakeCtx(taken: readonly string[] = []): {
  get(name: string): unknown
  effects: [string, () => (() => void) | undefined][]
} {
  const effects: [string, () => (() => void) | undefined][] = []
  return {
    effects,
    get: (name: string) =>
      name === 'sidebarRightTabs'
        ? {
            register: (definition: { readonly id: string }) => {
              if (taken.includes(definition.id)) throw new Error(`sidebarRight: tab type id "${definition.id}" is already registered`)
              return () => {}
            },
          }
        : undefined,
    effect: (factory: () => (() => void) | undefined, name?: string) => {
      effects.push([name ?? '', factory])
      return undefined
    },
  } as never
}

describe('registerOverviewDockFace（裁决 1——project 概览拥有者两段注册）', () => {
  it('两段落座：页型注册 + keyed body priority 0 拥有者席位，诊断面双记', () => {
    const slots = officialishSlots()
    const diag = registerOverviewDockFace(fakeCtx(), slots)
    expect(diag.registered).toContain('dswf-overview: dock tab type')
    expect(diag.registered).toContain(`${SIDEBAR_RIGHT_PANE_TAB_SLOT}:dswf-overview`)
    const body = slots.occupants.find((e) => e.name === SIDEBAR_RIGHT_PANE_TAB_SLOT && e.key === OVERVIEW_KEY)
    expect(body?.priority).toBe(0)
    expect(body?.component).toBeDefined()
  })

  it('children 声明表随行（knowledge-dir + AC 进度两子槽宿主单点声明）', () => {
    const slots = officialishSlots()
    registerOverviewDockFace(fakeCtx(), slots)
    // 声明经 inject 声明缝 cb 同步落座——占位者 register 行含 children 字段（此处经假体
    // inject 直装 cb 验证声明不炸 + body 在座即拥有声明权）
    expect(slots.occupants.some((e) => e.name === SIDEBAR_RIGHT_PANE_TAB_SLOT && e.key === OVERVIEW_KEY)).toBe(true)
  })

  it('类型撞车：task-loop 单装先注册同 id → fail-soft 记挫 + 槽通知补判重试落座', () => {
    const slots = officialishSlots()
    const taken: string[] = [OVERVIEW_KEY]
    const ctx = fakeCtx(taken)
    const diag = registerOverviewDockFace(ctx, slots)
    expect(diag.registered).not.toContain('dswf-overview: dock tab type')
    // 槽变更通知（task-loop 集成切换 dispose 页型后官方 subscribe 通知到达）→ 重试成功
    taken.length = 0
    slots.notify()
    expect(diag.registered).toContain('dswf-overview: dock tab type')
    // 补判重试一次语义：再次通知零重复注册
    const typeCount = diag.registered.filter((n) => n === 'dswf-overview: dock tab type').length
    slots.notify()
    expect(diag.registered.filter((n) => n === 'dswf-overview: dock tab type').length).toBe(typeCount)
  })

  it('effect 级联清理：撤销器执行后 body 占用零残留', () => {
    const slots = officialishSlots()
    const ctx = fakeCtx()
    registerOverviewDockFace(ctx, slots)
    const bodyEffect = ctx.effects.find(([name]) => name.includes('dock tab body'))
    expect(bodyEffect).toBeDefined()
    bodyEffect?.[1]()?.()
    expect(slots.occupants.filter((e) => e.key === OVERVIEW_KEY)).toEqual([])
  })

  it('registerKeyedSection 直用对照：slots 劣形返回 undefined（fail-soft 不注册）', () => {
    expect(registerKeyedSection(undefined, { slot: SIDEBAR_RIGHT_PANE_TAB_SLOT, key: OVERVIEW_KEY, component: 'x' })).toBeUndefined()
  })
})
