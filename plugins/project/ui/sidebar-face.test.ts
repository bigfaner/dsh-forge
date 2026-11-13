// sidebar-face 单测 —— sidebar.workspaces 顶替注册面（AC1：插件注册即取代官方
// WorkspaceBrowser，负优先级恒选胜；AC2：注入面 = 账本/归属快照源 + openSession +
// startSession 契约）。1.6 自 apps/web 壳侧 plugin.test 槽位路线 A 组迁入本包——注册面
// 归插件域，壳侧零登记（apps/web plugin.test 对应组改钉零登记断言）。
import { describe, expect, it, vi } from 'vitest'
import { ForgeSidebarSlot } from './sidebar/ForgeSidebarSlot.js'
import {
  registerSidebarFace,
  SIDEBAR_SHADOW_PRIORITY,
  SIDEBAR_WORKSPACES_SLOT,
} from './sidebar-face.js'
import type { SnapshotSource } from './sidebar/sidebar-model.js'

/** 官方 slots 服务假体（inject 声明缝 + register 记账面——cordis 形状同型镜像） */
function fakeSlots(): {
  slots: { inject(key: string, cb: () => (() => void) | undefined): () => void; register(options: Record<string, unknown>, component: unknown): () => void }
  registers: Array<{ key: string; options: Record<string, unknown>; component: unknown }>
} {
  const registers: Array<{ key: string; options: Record<string, unknown>; component: unknown }> = []
  const slots = {
    inject(key: string, cb: () => (() => void) | undefined): () => void {
      cb()
      return () => {}
    },
    register(options: Record<string, unknown>, component: unknown): () => void {
      registers.push({ key: options['name'] as string, options, component })
      return () => {}
    },
  }
  return { slots, registers }
}

function fakeSource<T>(snap: T): SnapshotSource<T> {
  return { getSnapshot: () => snap, subscribe: () => () => {} }
}

/** 官方服务假体（sessions/workspaces/uiWorkspace——ctx.get 现查消费切片） */
function fakeServices(extras?: {
  uiWorkspace?: Record<string, unknown>
  sessionsUsing?: unknown
  workspacesList?: unknown
}): {
  ctx: { get(name: string): unknown }
  open: ReturnType<typeof vi.fn>
  start: ReturnType<typeof vi.fn>
} {
  const open = vi.fn()
  const start = vi.fn()
  const sessions = {
    list: fakeSource({ ids: [], byId: {}, phase: 'ready' as const }),
    ...(extras?.sessionsUsing !== undefined ? { using: extras.sessionsUsing } : {}),
  }
  const workspaces = { list: extras?.workspacesList ?? fakeSource({ items: [] }) }
  const uiWorkspace = { openSession: open, startSession: start, ...extras?.uiWorkspace }
  const ctx = {
    get(name: string): unknown {
      if (name === 'sessions') return sessions
      if (name === 'workspaces') return workspaces
      if (name === 'uiWorkspace') return uiWorkspace
      throw new Error(`unexpected service: ${name}`)
    },
  }
  return { ctx, open, start }
}

describe('registerSidebarFace（sidebar.workspaces 顶替注册——AC1）', () => {
  it('single 槽影子登记：priority -100（lowest renders——官方 WorkspaceBrowser priority 0 落选）+ 组件 = ForgeSidebarSlot', () => {
    const { slots, registers } = fakeSlots()
    const { ctx } = fakeServices()
    const diag = registerSidebarFace(ctx, slots)
    expect(diag.registered).toEqual([SIDEBAR_WORKSPACES_SLOT])
    expect(registers).toHaveLength(1)
    expect(registers[0]!.key).toBe(SIDEBAR_WORKSPACES_SLOT)
    expect(registers[0]!.options.priority).toBe(SIDEBAR_SHADOW_PRIORITY)
    expect(registers[0]!.options.priority).toBeLessThan(0)
    expect(registers[0]!.component).toBe(ForgeSidebarSlot)
  })

  it('声明缝 cb 内官方服务缺席 = 不注册（官方 WorkspaceBrowser 保持；apply 期零读取——时序纪律）', () => {
    const { slots, registers } = fakeSlots()
    const ctx = { get: () => undefined }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const diag = registerSidebarFace(ctx, slots)
      expect(diag.registered).toEqual([])
      expect(registers).toHaveLength(0)
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('absent'))
    } finally {
      warn.mockRestore()
    }
  })

  it('slots 面劣形（inject 缺席）= 抛错归调用面 fail-soft', () => {
    expect(() => registerSidebarFace({ get: () => undefined }, {} as never)).toThrow('inject absent')
  })

  it('注入面 = 账本/归属快照源 + openSession 直通官方（fix-11 口径）', () => {
    const { slots, registers } = fakeSlots()
    const { ctx, open } = fakeServices()
    registerSidebarFace(ctx, slots)
    const face = registers[0]!.options.inject!() as {
      sessions: unknown
      workspaces: unknown
      openSession: (id: string) => void
      startSession: (id: string) => void
    }
    expect((face.sessions as { getSnapshot(): unknown }).getSnapshot()).toEqual({ ids: [], byId: {}, phase: 'ready' })
    expect(face.workspaces).toBeDefined()
    face.openSession('s-1')
    expect(open).toHaveBeenCalledWith('s-1')
  })

  it('bug d353536f 同因面：startSession 经在场门（快照面不可核验 = 放行）异步委派官方', async () => {
    const { slots, registers } = fakeSlots()
    // 快照面缺席（workspaces.list 无 getSnapshot——不可核验）= 放行——直接委派
    const { ctx, start } = fakeServices({ workspacesList: {} })
    registerSidebarFace(ctx, slots)
    const face = registers[0]!.options.inject!() as { startSession: (id: string) => void }
    face.startSession('w-1')
    await vi.waitFor(() => expect(start).toHaveBeenCalledWith('w-1'))
  })

  it('bug d353536f：官方基线未就位 → 等待在场后才委派官方', async () => {
    const { slots, registers } = fakeSlots()
    const list = { getSnapshot: () => ({ items: [] as { workspaceId: string }[] }) }
    const { ctx, start } = fakeServices({ workspacesList: list })
    registerSidebarFace(ctx, slots)
    const face = registers[0]!.options.inject!() as { startSession: (id: string) => void }
    face.startSession('w-late')
    expect(start).not.toHaveBeenCalled()
    setTimeout(() => {
      ;(list as { getSnapshot: () => unknown }).getSnapshot = () => ({ items: [{ workspaceId: 'w-late' }] })
    }, 30)
    await vi.waitFor(() => expect(start).toHaveBeenCalledWith('w-late'), { timeout: 5000 })
  })

  it('D45 会话行动作面：官方面在场 = 注入面携带；缺席 = 键缺席（P1 口径）', () => {
    const withFace = fakeSlots()
    const bare = fakeSlots()
    const using = vi.fn().mockImplementation(
      (_id: string, _o: { source: string }, op: (r: unknown) => unknown) =>
        Promise.resolve(op({ binding: { session: { rename: () => Promise.resolve({ ok: true, value: {} }) } } })),
    )
    const archive = vi.fn().mockResolvedValue(undefined)
    const pin = vi.fn().mockResolvedValue(undefined)
    const a = fakeServices({ uiWorkspace: { archiveSession: archive, pinSession: pin }, sessionsUsing: using })
    registerSidebarFace(a.ctx, withFace.slots)
    const face = withFace.registers[0]!.options.inject!() as Record<string, unknown>
    expect(typeof face['archiveSession']).toBe('function')
    expect(typeof face['pinSession']).toBe('function')
    expect(typeof face['renameSession']).toBe('function')
    void face['archiveSession']!('s-1')
    expect(archive).toHaveBeenCalledWith('s-1', undefined)

    const b = fakeServices()
    registerSidebarFace(b.ctx, bare.slots)
    const bareFace = bare.registers[0]!.options.inject!() as Record<string, unknown>
    expect(bareFace['archiveSession']).toBeUndefined()
    expect(bareFace['unarchiveSession']).toBeUndefined()
    expect(bareFace['pinSession']).toBeUndefined()
    expect(bareFace['unpinSession']).toBeUndefined()
    expect(bareFace['forkSession']).toBeUndefined()
  })
})
