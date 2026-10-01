// client-plugin 单测 —— 产品 client 插件骨架形状 pin（注册面 id/工厂返回 cordis 插件形状、
// 激活标记）。装载/激活链（掌舵 → 注册 → 物化 → Loader 激活）由 e2e（web-shell.spec）自证；
// id 同源 pin（main.ts 字面量 ↔ 常量）在 tests/structure/web-shell.test.ts（node 面测试）。
import { describe, expect, it } from 'vitest'
import { FORGE_CLIENT_PLUGIN_ID, forgeClientPlugin, moduleLoaderFacade, registerForgeClient } from './plugin.js'
import type { ModuleLoaderFacade, ModuleLoaderRegistration } from '../shell/dsh-globals.js'

describe('forgeClientPlugin 形状（cordis 插件最小面）', () => {
  it('name = 注册键；inject 空（骨架无服务依赖）；apply 幂等立激活标记', () => {
    const marker = (globalThis as { __DSH_FORGE_CLIENT__?: { plugin: string } }).__DSH_FORGE_CLIENT__
    delete (globalThis as { __DSH_FORGE_CLIENT__?: unknown }).__DSH_FORGE_CLIENT__
    const plugin = forgeClientPlugin()
    expect(plugin.name).toBe(FORGE_CLIENT_PLUGIN_ID)
    expect(plugin.inject).toEqual([])
    plugin.apply({})
    const active = (globalThis as { __DSH_FORGE_CLIENT__?: { plugin: string; activatedAt: number } }).__DSH_FORGE_CLIENT__
    expect(active?.plugin).toBe(FORGE_CLIENT_PLUGIN_ID)
    expect(typeof active?.activatedAt).toBe('number')
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
      throw new Error('骨架插件零外部 require')
    })
    expect(exports.name).toBe(FORGE_CLIENT_PLUGIN_ID)
  })
  it('moduleLoaderFacade 缺席即 fail-loud', () => {
    const prev = (globalThis as { __ModuleLoader__?: unknown }).__ModuleLoader__
    delete (globalThis as { __ModuleLoader__?: unknown }).__ModuleLoader__
    expect(() => moduleLoaderFacade()).toThrow(/__ModuleLoader__/)
    if (prev !== undefined) (globalThis as { __ModuleLoader__?: unknown }).__ModuleLoader__ = prev
  })
})
