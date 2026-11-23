// 概览 tab 双形态注册切换契约（host-integration-fixes 裁决 1 + AC 段注入面退役）：
//   · 集成形态：project（priority 0 拥有者）在场 → task-loop 零自身 body entry，
//     概览主体归 project（AC 进度段注入面已随概览 AC 段拔除退役）；
//   · 单装形态：project 缺席 → priority -10 独立任务概览 body 兜底；
//   · 后装/卸载：slots.subscribe 通知驱动 dispose/重注册切换（装载顺序无关）；
//   · subscribe 订阅与当前代注册 disposer wire 进 ctx.effect（卸载级联清理）。
// 官方 slots 机械核销正本：.forge/docs/probes/host-integration-fixes/slots-keyed-probe.md。
import { describe, expect, it } from 'vitest'
import { registerDockTabsFace } from '../../ui/dock-tabs-face.js'
import { PRIORITY_PROJECT_OVERVIEW_OWNER, PRIORITY_TASK_LOOP_FALLBACK } from '@dsh-forge/lib-ui'
import { SIDEBAR_RIGHT_PANE_TAB_SLOT, SIDEBAR_RIGHT_PANE_TAB_TITLE_SLOT } from '../../ui/official-seams.js'
import type { SectionSlotsFace, SlotEntryProjection } from '../../ui/keyed-section.js'
import type { LocaleServiceFace } from '../../ui/locale.js'

const OVERVIEW_KEY = 'dswf-overview'

interface Occupant {
  readonly name: string
  readonly key: string | undefined
  readonly priority: number
  readonly component: unknown
}

/** 官方 slots 同型假体（ledger 查询 + subscribe 通知 + 同 key 同 priority 拒收——裁决 1 切换面） */
function dualSlots(occupied: readonly { name: string; key?: string; priority?: number }[] = []): SectionSlotsFace & {
  occupants: Occupant[]
  notify(): void
  dispatch(name: string, key: string): unknown
} {
  const declared = new Set([SIDEBAR_RIGHT_PANE_TAB_SLOT, SIDEBAR_RIGHT_PANE_TAB_TITLE_SLOT])
  const occupants: Occupant[] = occupied.map((o) => ({ name: o.name, key: o.key, priority: o.priority ?? PRIORITY_PROJECT_OVERVIEW_OWNER, component: 'project-body' }))
  const listeners = new Set<() => void>()
  const slots: SectionSlotsFace & { occupants: Occupant[]; notify(): void; dispatch(name: string, key: string): unknown } = {
    occupants,
    inject: (_key, cb) => {
      cb()
      return () => {}
    },
    entries: (slot: string): readonly SlotEntryProjection[] =>
      occupants
        .filter((e) => e.name === slot)
        .map((e) => ({ options: { name: e.name, key: e.key, priority: e.priority } })),
    subscribe: (slot: string, listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    register: (options, component) => {
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

/** 形状合法 ctx（effect 工厂捕获[带 name]——卸载级联断言面；register 记 dispose 调用——页型级联断言面） */
function fakeCtx(): {
  get(name: string): unknown
  effects: [string, () => (() => void) | undefined][]
  disposedTypes: string[]
} {
  const effects: [string, () => (() => void) | undefined][] = []
  const disposedTypes: string[] = []
  return {
    effects,
    disposedTypes,
    get: (name: string) =>
      name === 'sidebarRightTabs'
        ? {
            register: (definition: { readonly id: string }) => () => {
              disposedTypes.push(definition.id)
            },
          }
        : undefined,
    // OfficialSeamCtx.effect 同形窄面
    effect: (factory: () => (() => void) | undefined, name?: string) => {
      effects.push([name ?? '', factory])
      return undefined
    },
  } as never
}

/** 取双形态切换级联 disposer（ctx.effect 挂载段——按 name 锚取，非按序末位） */
function dualFormDisposerOf(ctx: ReturnType<typeof fakeCtx>): (() => void) | undefined {
  const hit = ctx.effects.find(([name]) => name.includes('双形态注册切换'))
  expect(hit, 'ctx.effect 双形态注册切换挂载段缺席').not.toBeUndefined()
  return hit?.[1]()
}

/** project 概览占用条目入座（集成形态裁决键——priority 0 拥有者；返回撤销器供卸载分支） */
function seatProject(slots: ReturnType<typeof dualSlots>): () => void {
  return slots.register({ name: SIDEBAR_RIGHT_PANE_TAB_SLOT, key: OVERVIEW_KEY, priority: PRIORITY_PROJECT_OVERVIEW_OWNER }, 'project-body')
}

describe('概览 tab 双形态注册切换（裁决 1）', () => {
  it('集成形态：project 在场 → 零自身 body entry + 零 AC 段注册（注入面已退役）', () => {
    const slots = dualSlots([{ name: SIDEBAR_RIGHT_PANE_TAB_SLOT, key: OVERVIEW_KEY, priority: PRIORITY_PROJECT_OVERVIEW_OWNER }])
    const diag = registerDockTabsFace(fakeCtx() as never, slots, fakeLocale())
    expect(diag.mode).toBe('integrated')
    const ownBody = slots.occupants.find((e) => e.name === SIDEBAR_RIGHT_PANE_TAB_SLOT && e.key === OVERVIEW_KEY && e.priority !== PRIORITY_PROJECT_OVERVIEW_OWNER)
    expect(ownBody).toBeUndefined()
    expect(diag.registered.every((n) => !n.includes('dswf-ac-progress')), 'AC 段注入面退役——零 AC 注册').toBe(true)
    expect(diag.registered, '文档 tab 两段注册不受形态影响').toContain('dswf-doc')
    expect(slots.dispatch(SIDEBAR_RIGHT_PANE_TAB_SLOT, OVERVIEW_KEY)).toBe('project-body')
  })

  it('单装形态：project 缺席 → 页型 + priority -10 独立 body + chip 标题段，AC 段零注册', () => {
    const slots = dualSlots()
    const diag = registerDockTabsFace(fakeCtx() as never, slots, fakeLocale())
    expect(diag.mode).toBe('standalone')
    expect(diag.registered, '单装形态页型兜底注册（guide 入口卡载体）').toContain('dswf-overview: dock tab type')
    const body = slots.occupants.find((e) => e.name === SIDEBAR_RIGHT_PANE_TAB_SLOT && e.key === OVERVIEW_KEY)
    expect(body?.priority).toBe(PRIORITY_TASK_LOOP_FALLBACK)
    expect(slots.dispatch(SIDEBAR_RIGHT_PANE_TAB_TITLE_SLOT, OVERVIEW_KEY)).not.toBeUndefined()
  })

  it('集成形态零页型注册（project 拥有者——官方 registry 同 id 撞车零触发）', () => {
    const slots = dualSlots([{ name: SIDEBAR_RIGHT_PANE_TAB_SLOT, key: OVERVIEW_KEY, priority: PRIORITY_PROJECT_OVERVIEW_OWNER }])
    const diag = registerDockTabsFace(fakeCtx() as never, slots, fakeLocale())
    expect(diag.mode).toBe('integrated')
    expect(diag.registered, '集成形态页型归 project——task-loop 零页型注册').not.toContain('dswf-overview: dock tab type')
  })

  it('后装分支：task-loop 先启 → project 后到注册通知 → dispose 自身 body 切集成', () => {
    const slots = dualSlots()
    const ctx = fakeCtx()
    const diag = registerDockTabsFace(ctx as never, slots, fakeLocale())
    expect(diag.mode).toBe('standalone')
    seatProject(slots)
    slots.notify()
    expect(diag.mode).toBe('integrated')
    // 页型随切换级联让位（官方 registry 同 id 二次注册抛错——project 拥有者重试落座前提）
    expect(ctx.disposedTypes, '切集成时单装页型已 dispose').toContain(OVERVIEW_KEY)
    expect(slots.occupants.find((e) => e.name === SIDEBAR_RIGHT_PANE_TAB_SLOT && e.key === OVERVIEW_KEY && e.priority !== PRIORITY_PROJECT_OVERVIEW_OWNER)).toBeUndefined()
    expect(slots.dispatch(SIDEBAR_RIGHT_PANE_TAB_SLOT, OVERVIEW_KEY)).toBe('project-body')
  })

  it('运行期卸载：集成形态 → project 条目移除通知 → 重注册独立 body 回切单装', () => {
    const slots = dualSlots()
    const removeProject = seatProject(slots)
    const diag = registerDockTabsFace(fakeCtx() as never, slots, fakeLocale())
    expect(diag.mode).toBe('integrated')
    // 运行期卸载 project（官方 register 撤销器——移除占用条目后通知）
    removeProject()
    slots.notify()
    expect(diag.mode).toBe('standalone')
    const body = slots.occupants.find((e) => e.name === SIDEBAR_RIGHT_PANE_TAB_SLOT && e.key === OVERVIEW_KEY)
    expect(body?.priority).toBe(PRIORITY_TASK_LOOP_FALLBACK)
  })

  it('subscribe 订阅与当前代 disposer wire 进 ctx.effect：级联清理后通知零重绑、占用零残留', () => {
    const slots = dualSlots()
    const ctx = fakeCtx()
    registerDockTabsFace(ctx as never, slots, fakeLocale())
    expect(ctx.effects.some(([name]) => name.includes('双形态注册切换'))).toBe(true)
    const dispose = dualFormDisposerOf(ctx)
    expect(typeof dispose).toBe('function')
    dispose?.()
    expect(slots.occupants.filter((e) => e.key === OVERVIEW_KEY)).toEqual([])
    // 订阅已撤销——project 后到通知不再驱动重绑
    seatProject(slots)
    slots.notify()
    expect(slots.occupants.find((e) => e.name === SIDEBAR_RIGHT_PANE_TAB_SLOT && e.key === OVERVIEW_KEY && e.priority !== PRIORITY_PROJECT_OVERVIEW_OWNER)).toBeUndefined()
  })

  it('越权哨兵：单装 body 恒以 -10 落座（同 key 同 priority 0 注册被官方拒收的形态零触发）', () => {
    const slots = dualSlots()
    registerDockTabsFace(fakeCtx() as never, slots, fakeLocale())
    const priorities = slots.occupants.filter((e) => e.key === OVERVIEW_KEY).map((e) => e.priority)
    expect(priorities).not.toContain(PRIORITY_PROJECT_OVERVIEW_OWNER)
    for (const priority of priorities) expect(priority).toBeLessThan(0)
  })
})
