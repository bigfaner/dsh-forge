// hero-picker-face 注册面单测（1.7 B 类顶替②）——两段式声明缝 + inject 双面 + 缺席降级：
// 官方服务在场 = 落座（-100 影子 + workspaces 快照源 + openWorkspace 官方面 inject）；
// workspaces/uiWorkspace 缺席 = 不注册（官方 WorkspacePicker 保持）；sessions 缺席 =
// 注册仍落座（草稿迁移零迁移 fail-soft）。
import { describe, expect, it, vi } from 'vitest'
import {
  HERO_SHADOW_PRIORITY,
  HERO_WORKSPACE_SLOT,
  registerHeroPickerFace,
  type HeroPickerFaceCtx,
} from './hero-picker-face.js'
import type { SectionSlotsFace } from './keyed-section.js'
import type { SnapshotSource } from './sidebar/sidebar-model.js'

/** 官方 slots 服务替身（声明缝 cb 收集 + register 记账——plugin.test fake 同型） */
function fakeSlots(): {
  slots: SectionSlotsFace
  registers: Array<{ options: Record<string, unknown>; component: unknown }>
} {
  const registers: Array<{ options: Record<string, unknown>; component: unknown }> = []
  const slots: SectionSlotsFace = {
    inject: (key: string, callback: () => (() => void) | undefined) => {
      const dispose = callback()
      return dispose ?? (() => {})
    },
    register: (options: Record<string, unknown>, component: unknown) => {
      registers.push({ options, component })
      return () => {}
    },
  }
  return { slots, registers }
}

const snapshotSource = (items: readonly unknown[]): SnapshotSource<{ items: readonly unknown[] }> => ({
  getSnapshot: () => ({ items }),
  subscribe: () => () => {},
})

const baseCtx = (overrides?: Partial<Record<string, unknown>>): HeroPickerFaceCtx => {
  const services: Record<string, unknown> = {
    sessions: { binding: () => undefined },
    workspaces: { list: snapshotSource([{ workspaceId: 'w-1', path: 'C:/ws/p1' }]) },
    uiWorkspace: {
      openWorkspace: vi.fn(() => Promise.resolve()),
      mainReference: { sessionId: undefined },
      openSession: () => {},
      startSession: () => {},
    },
    ...overrides,
  }
  return {
    get: (name) => services[name],
    reflect: { get: () => undefined },
  }
}

describe('registerHeroPickerFace（conversation.hero.workspace 顶替注册——1.7 B 类顶替②）', () => {
  it('官方服务在场 → 恰一落座：slot 名/priority -100/零 children/keyed 面零 id/key；inject = workspaces 快照源 + openWorkspace 官方面', () => {
    const { slots, registers } = fakeSlots()
    const diag = registerHeroPickerFace(baseCtx(), slots)
    expect(diag.registered).toEqual([HERO_WORKSPACE_SLOT])
    expect(registers).toHaveLength(1)
    const row = registers[0]!
    expect(row.options.name).toBe(HERO_WORKSPACE_SLOT)
    expect(row.options.priority).toBe(HERO_SHADOW_PRIORITY)
    expect(row.options.priority).toBeLessThan(0) // lowest renders——官方 WorkspacePicker（priority 0）保持在场落选
    expect(row.options.children).toBeUndefined() // 官方登记行 children 持续供养 directoryFlow 子洞
    expect(row.options.id).toBeUndefined()
    expect(row.options.key).toBeUndefined()
    const inject = row.options.inject as () => Record<string, unknown>
    const face = inject()
    expect(typeof (face.workspaces as SnapshotSource<unknown>).getSnapshot).toBe('function')
    expect(typeof face.openWorkspace).toBe('function')
    expect(row.component).toBeDefined()
  })

  it('workspaces 缺席 → 不注册（官方 WorkspacePicker 保持）', () => {
    const { slots, registers } = fakeSlots()
    const diag = registerHeroPickerFace(baseCtx({ workspaces: undefined }), slots)
    expect(diag.registered).toEqual([])
    expect(registers).toHaveLength(0)
  })

  it('workspaces.list 形状漂移（getSnapshot 缺席）→ 不注册', () => {
    const { slots, registers } = fakeSlots()
    const diag = registerHeroPickerFace(baseCtx({ workspaces: { list: {} } }), slots)
    expect(diag.registered).toEqual([])
    expect(registers).toHaveLength(0)
  })

  it('uiWorkspace.openWorkspace 缺席 → 不注册（worktree 点选链无承载面，整面退官方）', () => {
    const { slots, registers } = fakeSlots()
    const diag = registerHeroPickerFace(baseCtx({ uiWorkspace: { openSession: () => {} } }), slots)
    expect(diag.registered).toEqual([])
    expect(registers).toHaveLength(0)
  })

  it('sessions 缺席 → 注册仍落座（草稿迁移零迁移 fail-soft——openWorkspace 主链不受影响）', () => {
    const { slots, registers } = fakeSlots()
    const diag = registerHeroPickerFace(baseCtx({ sessions: undefined }), slots)
    expect(diag.registered).toEqual([HERO_WORKSPACE_SLOT])
    expect(registers).toHaveLength(1)
  })

  it('openWorkspace 注入面：基线在场 → 直接委派官方 openWorkspace（beforeOpen 零迁移——mainReference.sessionId 缺席）', async () => {
    const openSpy = vi.fn(() => Promise.resolve())
    const { slots, registers } = fakeSlots()
    registerHeroPickerFace(
      baseCtx({
        uiWorkspace: {
          openWorkspace: openSpy,
          mainReference: { sessionId: undefined },
          openSession: () => {},
          startSession: () => {},
        },
      }),
      slots,
    )
    const open = (registers[0]!.options.inject as () => Record<string, unknown>)().openWorkspace as (
      id: string,
    ) => Promise<void>
    await open('w-1')
    expect(openSpy, '委派到官方 uiWorkspace.openWorkspace').toHaveBeenCalledWith('w-1', undefined)
  })

  it('openWorkspace 注入面：目标不在官方基线（waiting 上限到点）→ 放行委派（fail-open 官方错误面保真——d353536f 同口径）', async () => {
    const openSpy = vi.fn(() => Promise.resolve())
    const { slots, registers } = fakeSlots()
    registerHeroPickerFace(
      baseCtx({
        uiWorkspace: {
          openWorkspace: openSpy,
          mainReference: { sessionId: undefined },
          openSession: () => {},
          startSession: () => {},
        },
      }),
      slots,
    )
    const open = (registers[0]!.options.inject as () => Record<string, unknown>)().openWorkspace as (
      id: string,
    ) => Promise<void>
    await open('w-absent')
    expect(openSpy, '上限到点仍缺席 = 放行委派（真不在场由官方 createFailed 呈现）').toHaveBeenCalledWith(
      'w-absent',
      undefined,
    )
  })

  it('slots.inject 缺席 → throw（装配断裂 fail-loud——sidebar-face 同口径）', () => {
    expect(() => registerHeroPickerFace(baseCtx(), {} as SectionSlotsFace)).toThrow()
  })
})
