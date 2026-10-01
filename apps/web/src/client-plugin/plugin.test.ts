// client-plugin 单测 —— 产品 client 插件形状 + 槽位路线 A 注册面（2.7 AC1）。
// 装载/激活链（掌舵 → 注册 → 物化 → Loader 激活）由 e2e（web-shell.spec）自证；
// id 同源 pin（main.ts 字面量 ↔ 常量）在 tests/structure/web-shell.test.ts（node 面测试）。
// 洞名/影子优先级/注入面 = G1 契约面清单第 3 项（S2 残留 #1——本任务清点入池）的常量 pin。
import { describe, expect, it, vi } from 'vitest'
import {
  FORGE_CLIENT_INJECT,
  FORGE_CLIENT_PLUGIN_ID,
  SIDEBAR_BRAND_MARK_SLOT,
  SIDEBAR_BRAND_NAME_SLOT,
  SIDEBAR_SHADOW_PRIORITY,
  SIDEBAR_WORKSPACES_SLOT,
  forgeClientPlugin,
  moduleLoaderFacade,
  publishedViews,
  registerForgeClient,
  type ForgeClientCtx,
  type ForgeSlotsService,
} from './plugin.js'
import type { ModuleLoaderFacade, ModuleLoaderRegistration } from '../shell/dsh-globals.js'

/** 注册记录（fake slots 服务收集） */
interface RegisterCall {
  key: string
  options: { name: string; priority?: number; inject?: () => object }
  component: unknown
}

/** 假 ctx：slots 收集 inject/register，sessions/workspaces 经 get 递达 */
function fakeClientCtx(): { ctx: ForgeClientCtx; registers: RegisterCall[]; injectedKeys: string[]; open: ReturnType<typeof vi.fn> } {
  const registers: RegisterCall[] = []
  const injectedKeys: string[] = []
  const open = vi.fn()
  const slots: ForgeSlotsService = {
    inject: (key, callback) => {
      injectedKeys.push(key)
      return callback() ?? (() => {})
    },
    register: (options, component) => {
      registers.push({ key: options.name, options, component })
      return () => {}
    },
  }
  const sessions = { list: { tag: 'sessions-list' }, open }
  const workspaces = { list: { tag: 'workspaces-list' } }
  const ctx: ForgeClientCtx = {
    slots,
    get: (name) => {
      if (name === 'sessions') return sessions
      if (name === 'workspaces') return workspaces
      throw new Error(`unexpected service: ${name}`)
    },
  }
  return { ctx, registers, injectedKeys, open }
}

/** 假产品视图发布面 */
function publishFakeViews(): { ForgeSidebarSlot: unknown; ForgeBrandMark: unknown; ForgeBrandName: unknown } {
  const views = { ForgeSidebarSlot: 'COMP:sidebar-slot', ForgeBrandMark: 'COMP:brand-mark', ForgeBrandName: 'COMP:brand-name' }
  ;(globalThis as { __DSH_FORGE_VIEWS__?: unknown }).__DSH_FORGE_VIEWS__ = views
  return views
}

function unpublishViews(): void {
  delete (globalThis as { __DSH_FORGE_VIEWS__?: unknown }).__DSH_FORGE_VIEWS__
}

describe('forgeClientPlugin 形状（cordis 插件面）', () => {
  it('name = 注册键；inject = 三服务（slots/sessions/workspaces）；apply 幂等立激活标记', () => {
    const marker = (globalThis as { __DSH_FORGE_CLIENT__?: { plugin: string } }).__DSH_FORGE_CLIENT__
    delete (globalThis as { __DSH_FORGE_CLIENT__?: unknown }).__DSH_FORGE_CLIENT__
    const views = publishFakeViews()
    const plugin = forgeClientPlugin()
    expect(plugin.name).toBe(FORGE_CLIENT_PLUGIN_ID)
    expect(plugin.inject).toEqual([...FORGE_CLIENT_INJECT])
    expect(plugin.inject).toEqual(['slots', 'sessions', 'workspaces'])
    plugin.apply(fakeClientCtx().ctx)
    const active = (globalThis as { __DSH_FORGE_CLIENT__?: { plugin: string; activatedAt: number } }).__DSH_FORGE_CLIENT__
    expect(active?.plugin).toBe(FORGE_CLIENT_PLUGIN_ID)
    expect(typeof active?.activatedAt).toBe('number')
    unpublishViews()
    if (marker === undefined) delete (globalThis as { __DSH_FORGE_CLIENT__?: unknown }).__DSH_FORGE_CLIENT__
    else (globalThis as { __DSH_FORGE_CLIENT__?: unknown }).__DSH_FORGE_CLIENT__ = marker
    void views
  })
})

describe('槽位路线 A 注册（AC1：sidebar.workspaces 替换 + 品牌行内容洞位）', () => {
  it('三洞位经 slots.inject 声明依赖；workspaces 注册 = 发布组件 + 影子优先级；诊断回填落座', () => {
    const views = publishFakeViews()
    const { ctx, registers, injectedKeys } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    expect(injectedKeys).toEqual([SIDEBAR_WORKSPACES_SLOT, SIDEBAR_BRAND_MARK_SLOT, SIDEBAR_BRAND_NAME_SLOT])
    const workspaces = registers.find((r) => r.key === SIDEBAR_WORKSPACES_SLOT)
    expect(workspaces).toBeDefined()
    expect(workspaces!.options.priority).toBe(SIDEBAR_SHADOW_PRIORITY)
    expect(workspaces!.options.priority).toBeLessThan(0) // lowest renders——影子官方占用者（priority 0）
    expect(workspaces!.component).toBe(views.ForgeSidebarSlot)
    const mark = registers.find((r) => r.key === SIDEBAR_BRAND_MARK_SLOT)
    const name = registers.find((r) => r.key === SIDEBAR_BRAND_NAME_SLOT)
    expect(mark!.component).toBe(views.ForgeBrandMark)
    expect(name!.component).toBe(views.ForgeBrandName)
    // 诊断面：三洞位落座 + 无错误（e2e 排障锚）
    const marker = (globalThis as { __DSH_FORGE_CLIENT__?: { sidebar?: { registered?: string[]; error?: string } } }).__DSH_FORGE_CLIENT__
    expect(marker?.sidebar?.registered).toEqual([SIDEBAR_WORKSPACES_SLOT, SIDEBAR_BRAND_MARK_SLOT, SIDEBAR_BRAND_NAME_SLOT])
    expect(marker?.sidebar?.error).toBeUndefined()
    unpublishViews()
  })

  it('注入面 = dsh 账本/归属快照源 + openSession（面板数据与动作的唯一通道）', () => {
    publishFakeViews()
    const { ctx, registers, open } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    const workspaces = registers.find((r) => r.key === SIDEBAR_WORKSPACES_SLOT)!
    const face = workspaces.options.inject!()
    expect(face).toEqual({
      sessions: { tag: 'sessions-list' },
      workspaces: { tag: 'workspaces-list' },
      openSession: expect.any(Function),
    })
    ;(face as { openSession: (id: string) => void }).openSession('s-1')
    expect(open).toHaveBeenCalledWith('s-1')
    unpublishViews()
  })

  it('发布面缺席 → 诊断面记录（激活不炸——标记仍在，错误可查；publishedViews 直调仍 fail-loud）', () => {
    const marker = (globalThis as { __DSH_FORGE_CLIENT__?: unknown }).__DSH_FORGE_CLIENT__
    unpublishViews()
    expect(() => publishedViews()).toThrow(/__DSH_FORGE_VIEWS__/)
    forgeClientPlugin().apply(fakeClientCtx().ctx)
    const after = (globalThis as { __DSH_FORGE_CLIENT__?: { sidebar?: { registered?: string[]; error?: string } } }).__DSH_FORGE_CLIENT__
    expect(after?.sidebar?.error).toMatch(/__DSH_FORGE_VIEWS__/)
    expect(after?.sidebar?.registered).toBeUndefined()
    if (marker === undefined) delete (globalThis as { __DSH_FORGE_CLIENT__?: unknown }).__DSH_FORGE_CLIENT__
    else (globalThis as { __DSH_FORGE_CLIENT__?: unknown }).__DSH_FORGE_CLIENT__ = marker
  })
})

describe('注册面', () => {
  it('registerForgeClient 经 __ModuleLoader__.load 提交工厂（id = 插件名）', () => {
    const registrations: ModuleLoaderRegistration[] = []
    const facade: ModuleLoaderFacade = {
      mode: 'live',
      pendingQueue: [],
      load: (registration) => {
        registrations.push(registration)
      },
      create: () => {
        throw new Error('unexpected')
      },
    }
    registerForgeClient(facade)
    expect(registrations).toHaveLength(1)
    expect(registrations[0]!.id).toBe(FORGE_CLIENT_PLUGIN_ID)
    const exports = registrations[0]!.factory(() => {
      throw new Error('插件组件源走发布面——工厂零外部 require')
    }) as { name: string }
    expect(exports.name).toBe(FORGE_CLIENT_PLUGIN_ID)
  })
  it('moduleLoaderFacade 缺席即 fail-loud；在场透传', () => {
    const prev = (globalThis as { __ModuleLoader__?: unknown }).__ModuleLoader__
    delete (globalThis as { __ModuleLoader__?: unknown }).__ModuleLoader__
    expect(() => moduleLoaderFacade()).toThrow(/__ModuleLoader__/)
    const fake = { mode: 'live', pendingQueue: [], load: () => {}, create: () => {} }
    ;(globalThis as { __ModuleLoader__?: unknown }).__ModuleLoader__ = fake
    expect(moduleLoaderFacade()).toBe(fake)
    if (prev === undefined) delete (globalThis as { __ModuleLoader__?: unknown }).__ModuleLoader__
    else (globalThis as { __ModuleLoader__?: unknown }).__ModuleLoader__ = prev
  })
  it('publishedViews 在场透传', () => {
    const views = publishFakeViews()
    expect(publishedViews()).toBe(views)
    unpublishViews()
  })
})
