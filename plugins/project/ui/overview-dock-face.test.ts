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

/** 形状合法 ctx（sidebarRightTabs 同型假体——register 可预占 id 抛错 + subscribe 同步失效通知，
 *  官方 SidebarRightTabRegistry 同型：register disposer 内 refresh()→notify） */
function fakeCtx(taken: readonly string[] = []): {
  get(name: string): unknown
  effects: [string, () => (() => void) | undefined][]
  notifyRegistry(): void
  releaseOverviewType(): void
} {
  const effects: [string, () => (() => void) | undefined][] = []
  const listeners = new Set<() => void>()
  const takenIds = [...taken]
  const notify = (): void => {
    for (const listener of listeners) listener()
  }
  return {
    effects,
    notifyRegistry: notify,
    releaseOverviewType: () => {
      // task-loop 让位 = dispose 其页型注册（预占集移除 + registry 同步失效通知）
      const i = takenIds.indexOf(OVERVIEW_KEY)
      if (i >= 0) takenIds.splice(i, 1)
      notify()
    },
    get: (name: string) =>
      name === 'sidebarRightTabs'
        ? {
            register: (definition: { readonly id: string }) => {
              if (takenIds.includes(definition.id)) throw new Error(`sidebarRight: tab type id "${definition.id}" is already registered`)
              const dispose = (): void => {
                const i = takenIds.indexOf(definition.id)
                if (i >= 0) takenIds.splice(i, 1)
                notify()
              }
              return dispose
            },
            subscribe: (listener: () => void) => {
              listeners.add(listener)
              return () => {
                listeners.delete(listener)
              }
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

  it('类型撞车补判（真机 task-loop 先装序）：撞车 deferred → 让位 dispose 即同步补判落座', () => {
    const slots = officialishSlots()
    const taken: string[] = [OVERVIEW_KEY]
    const ctx = fakeCtx(taken)
    const diag = registerOverviewDockFace(ctx, slots)
    expect(diag.registered).not.toContain('dswf-overview: dock tab type')
    // task-loop 集成切换 dispose 页型——官方 registry disposer 内同步失效通知驱动补判
    // （不经 slots 槽变更代理——真机 r4 实证该代理通道补判未生效）
    ctx.releaseOverviewType()
    expect(diag.registered.filter((n) => n === 'dswf-overview: dock tab type')).toHaveLength(1)
    // 落座后后续通知零重复注册
    ctx.notifyRegistry()
    expect(diag.registered.filter((n) => n === 'dswf-overview: dock tab type')).toHaveLength(1)
  })

  it('类型撞车补判重挫不自灭：撞车未清的通知到达后仍可再试（直至落座）', () => {
    const slots = officialishSlots()
    const taken: string[] = [OVERVIEW_KEY]
    const ctx = fakeCtx(taken)
    const diag = registerOverviewDockFace(ctx, slots)
    expect(diag.registered).not.toContain('dswf-overview: dock tab type')
    // 无关注册变更通知（撞车仍在座）——补判重挫但订阅链不灭
    taken.push('dswf-doc')
    ctx.notifyRegistry()
    expect(diag.registered).not.toContain('dswf-overview: dock tab type')
    // 撞车清后再通知 → 落座
    ctx.releaseOverviewType()
    expect(diag.registered.filter((n) => n === 'dswf-overview: dock tab type')).toHaveLength(1)
  })

  it('registry subscribe 缺席宿主：撞车 fail-soft 记挫不炸装配（无补判通道诚实降级）', () => {
    const slots = officialishSlots()
    const ctx = fakeCtx([OVERVIEW_KEY])
    const tabs = (ctx.get('sidebarRightTabs') as { subscribe?: unknown }) as Record<string, unknown>
    delete tabs['subscribe']
    expect(() => registerOverviewDockFace(ctx, slots)).not.toThrow()
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
