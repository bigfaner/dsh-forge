// knowledgeGateOf 门控单测（knowledge-plugin-migration fix-3——bug ad88e0f5 G-B 门控缝修订）：
//   官方形态（新语义）：client bundle 在场 = 挂载态本体（官方装载协议 apply 期无条件注册，
//     上游 fixture-live-client 核销）——壳缝缺席（__DSH_FORGE_HOST_PLUGINS__ 不存在）→ true；
//   G-A dsh-forge 集成态：壳发布壳缝，knowledge:true → true（恒 true 路径不变）；
//     knowledge:false → false（集成态显式关闭 = 唯一 fail-closed 分支——卸载态壳掌舵让位）。
//   G-B reflect 现查分支已删除：官方宿主 client isolate 里 Node 侧服务永不可见（run3 真机
//     事实 + 上游正本核销），reflect 分支结构性恒 false = 缝选错，非迟到问题。
// 判据 = 契约 testing/contracts/shared-anchors-channels.md §3（fix-3 修订版）。
import { describe, expect, it, vi } from 'vitest'
import { knowledgeGateOf, knowledgeClient, registerKnowledgeFaces, type KnowledgeFacesDiagnostics } from './faces.js'
import type { SectionSlotsFace } from './keyed-section.js'
import type { LocaleServiceFace } from './locale.js'

/** 形状合法假 slots（inject 声明缝 + register 落座均计数） */
function fakeSlots(): SectionSlotsFace & { registered: string[] } {
  const registered: string[] = []
  return {
    registered,
    inject: (key, cb) => {
      cb()
      return () => {}
    },
    register: (options) => {
      const o = options as { name?: string; id?: string; key?: string }
      registered.push(`${o.name ?? ''}:${o.key ?? o.id ?? ''}`)
      return () => {}
    },
  }
}

/** 形状合法假 locale（bind 回 ns 键名；register 计录 NS） */
function fakeLocale(): LocaleServiceFace & { namespaces: string[] } {
  const namespaces: string[] = []
  return {
    namespaces,
    register: (ns) => {
      namespaces.push(ns)
      return () => {}
    },
    bind: () => (key) => key,
  }
}

describe('knowledgeGateOf 门控（CT-KN-GATE fix-3 修订：官方形态 bundle 在场即挂载）', () => {
  it('官方形态：壳缝整体缺席（无 __DSH_FORGE_HOST_PLUGINS__）→ true（bundle 在场 = 挂载态本体）', () => {
    expect(knowledgeGateOf({})).toBe(true)
    expect(knowledgeGateOf(undefined)).toBe(true)
    expect(knowledgeGateOf()).toBe(true)
  })

  it('G-A 壳缝 true：__DSH_FORGE_HOST_PLUGINS__.knowledge=true → true（集成态恒 true 路径不变）', () => {
    const g = { __DSH_FORGE_HOST_PLUGINS__: { knowledge: true } } as never
    expect(knowledgeGateOf(g)).toBe(true)
  })

  it('G-A 壳缝 false：集成态显式关闭 → false（唯一 fail-closed 分支——壳掌舵让位 + 零登记）', () => {
    const g = { __DSH_FORGE_HOST_PLUGINS__: { knowledge: false } } as never
    expect(knowledgeGateOf(g)).toBe(false)
  })

  it('reflect 现查分支已删除：ctx.reflect 读数不参与门控（官方宿主 Node 服务结构性不可见——缝已裁撤）', () => {
    const _ctx = { reflect: { get: (key: string) => (key === 'knowledge' ? { browse: () => {} } : undefined) } }
    expect(knowledgeGateOf({})).toBe(true) // 官方形态不受 ctx 读数影响
    const g = { __DSH_FORGE_HOST_PLUGINS__: { knowledge: false } } as never
    expect(knowledgeGateOf(g)).toBe(false) // 服务在场也不翻转——壳缝 false 是集成态终裁
  })

  it('集成态壳缝失效兜底（bug a7f231c6 F3）：壳缝整体缺席 + 壳发布面 __DSH_FORGE_VIEWS__ 在场 → false（boot 缝失效不宽判半挂载）', () => {
    const g = { __DSH_FORGE_VIEWS__: { ForgeShellHost: () => {} } } as never
    expect(knowledgeGateOf(g)).toBe(false)
  })

  it('官方形态判别不受牵连：壳缝缺席且零壳发布面（无 __DSH_FORGE_VIEWS__）→ true（官方分支不变）', () => {
    expect(knowledgeGateOf({})).toBe(true)
  })
})

describe('registerKnowledgeFaces 编排（diag 读数 = A-KN-8 语义）', () => {
  it('门控 false（集成态壳缝 false）→ 零登记零异常（registered 恒空）', () => {
    const slots = fakeSlots()
    const g = { __DSH_FORGE_HOST_PLUGINS__: { knowledge: false } } as never
    const out: KnowledgeFacesDiagnostics = registerKnowledgeFaces(slots, fakeLocale(), g)
    expect(out).toEqual({ registered: [], knowledgeEnabled: false })
    expect(slots.registered).toEqual([])
  })

  it('官方形态（壳缝缺席）→ 三面落座：[dswf-knowledge, panellist:dswf-knowledge, dswf-recall]', () => {
    const slots = fakeSlots()
    const locale = fakeLocale()
    const out = registerKnowledgeFaces(slots, locale, {})
    expect(out.knowledgeEnabled).toBe(true)
    expect(out.registered).toEqual(['dswf-knowledge', 'panellist:dswf-knowledge', 'dswf-recall'])
  })

  it('集成态壳缝失效（壳发布面在场、boot 缝缺席）→ 门 false 零登记零异常（bug a7f231c6 F3 反例）', () => {
    const slots = fakeSlots()
    const g = { __DSH_FORGE_VIEWS__: {} } as never
    const out: KnowledgeFacesDiagnostics = registerKnowledgeFaces(slots, fakeLocale(), g)
    expect(out).toEqual({ registered: [], knowledgeEnabled: false })
    expect(slots.registered).toEqual([])
  })

  it('apply 编排（官方形态默认参数）：词典登记 = knowledge 自有 NS（词条随迁锚）+ 三面 registered 读数 + 项目台知识目录节（1.5）', () => {
    const slots = fakeSlots()
    const locale = fakeLocale()
    const ctx = { slots, locale }
    expect(knowledgeClient.apply(ctx)).toBeUndefined()
    expect(locale.namespaces).toEqual(['dsh-forge.knowledge'])
    expect(slots.registered).toEqual([
      'main:dswf-knowledge',
      'sidebar.panellist:dswf-knowledge',
      'conversation.view:dswf-recall',
      'project.section.knowledge-dir:dswf-knowledge-dir',
    ])
  })

  it('fiber reload 重跑 apply：词典 disposer 经 ctx.effect 承接——旧登记随 fiber 释放，二次登记零 already has locale', () => {
    // 官方 dsh-client-locale 语义同型：同 ns+locale 重复登记抛错，register 返回 disposer
    const dicts = new Set<string>()
    const locale = {
      ...fakeLocale(),
      register: (ns: string) => {
        if (dicts.has(ns)) throw new Error(`locale namespace "${ns}" already has locale "zh"`)
        dicts.add(ns)
        return () => void dicts.delete(ns)
      },
    } as LocaleServiceFace & { namespaces: string[] }
    const disposers: Array<() => void> = []
    const ctx = {
      slots: fakeSlots(),
      locale,
      effect: (setup: () => unknown) => {
        const out = setup()
        if (typeof out === 'function') disposers.push(out as () => void)
        return out
      },
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      knowledgeClient.apply(ctx)
      expect(dicts.size).toBe(1)
      for (const dispose of disposers.splice(0)) dispose() // fiber reload：旧 fiber effect 清理
      knowledgeClient.apply(ctx)
      expect(dicts.size).toBe(1)
      expect(warn.mock.calls.map((c) => String(c[0])).some((line) => line.includes('already has locale'))).toBe(false)
    } finally {
      warn.mockRestore()
    }
  })

  it('apply 编排（集成态壳缝 true）：同上四面落座（G-A 恒 true 路径行为等价）', () => {
    const slots = fakeSlots()
    const locale = fakeLocale()
    const ctx = { slots, locale }
    const prev = (globalThis as { __DSH_FORGE_HOST_PLUGINS__?: unknown }).__DSH_FORGE_HOST_PLUGINS__
    ;(globalThis as { __DSH_FORGE_HOST_PLUGINS__?: unknown }).__DSH_FORGE_HOST_PLUGINS__ = { knowledge: true }
    try {
      expect(knowledgeClient.apply(ctx)).toBeUndefined()
      expect(slots.registered).toHaveLength(4)
    } finally {
      if (prev === undefined) delete (globalThis as { __DSH_FORGE_HOST_PLUGINS__?: unknown }).__DSH_FORGE_HOST_PLUGINS__
      else (globalThis as { __DSH_FORGE_HOST_PLUGINS__?: unknown }).__DSH_FORGE_HOST_PLUGINS__ = prev
    }
  })
})

describe('knowledgeClient 组合插件对象（client-modules 装载契约）', () => {
  it("inject 声明边 = [slots, locale, connection]（fix-9 增 connection 边——缺声明 = apply 期 cannot get property）", () => {
    expect(knowledgeClient.inject).toEqual(['slots', 'locale', 'connection'])
  })

  it('apply 返回值铁律：恒 undefined（cordis 组合把返回值当 effect 消费）', () => {
    expect(knowledgeClient.apply({})).toBeUndefined()
    expect(knowledgeClient.apply({ slots: fakeSlots(), locale: fakeLocale() })).toBeUndefined()
  })

  it('官方形态 slots/locale 缺席 → fail-soft 不炸 apply（CT-M1 修订：官方形态无服务缺席分支，劣形只降级）', () => {
    expect(knowledgeClient.apply({})).toBeUndefined()
    expect(knowledgeClient.apply({ slots: fakeSlots() })).toBeUndefined()
    expect(knowledgeClient.apply({ locale: fakeLocale() })).toBeUndefined()
  })

  it('无迟到补偿订阅（fix-3 裁撤：官方宿主 internal/service 事件永不携带 Node 服务——订阅即死代码）', () => {
    const listeners: Array<(name: string) => void> = []
    knowledgeClient.apply({
      slots: fakeSlots(),
      locale: fakeLocale(),
      on: (event: string, listener: (name: string) => void) => {
        listeners.push(listener)
        return () => {}
      },
    })
    expect(listeners).toEqual([])
  })
})
