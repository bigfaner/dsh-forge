// knowledgeGateOf 双门控单测（knowledge-plugin-migration 1.4——CT-KN-GATE 两形态 fake 注入）：
//   G-A dsh-forge 集成态：壳缝 __DSH_FORGE_HOST_PLUGINS__.knowledge 优先读；
//   G-B 官方宿主态：壳缝缺席 → whileServed 现查 ctx.reflect.get('knowledge')。
// 判据 = 契约 testing/contracts/shared-anchors-channels.md §3：双门控取或；现查禁 memoize
//（AGENTS §1.6——装卸序列下读数即刻翻转）；fail-closed（双缺 = false 零登记）。
import { describe, expect, it } from 'vitest'
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

describe('knowledgeGateOf 双门控取或（CT-KN-GATE）', () => {
  it('G-A 壳缝形态：__DSH_FORGE_HOST_PLUGINS__.knowledge=true → true（服务缺席同真——壳缝优先读）', () => {
    const g = { __DSH_FORGE_HOST_PLUGINS__: { knowledge: true } } as never
    expect(knowledgeGateOf({}, g)).toBe(true)
    expect(knowledgeGateOf(undefined, g)).toBe(true)
  })

  it('G-B whileServed 形态：壳缝缺席 + reflect.get("knowledge") 在场 → true（官方宿主修复面）', () => {
    const ctx = { reflect: { get: (key: string) => (key === 'knowledge' ? { browse: () => {} } : undefined) } }
    expect(knowledgeGateOf(ctx, {})).toBe(true)
  })

  it('取或语义：壳缝 false + 服务在场 → true（不因壳缝 false 恒 false——fail-closed 修复面）', () => {
    const g = { __DSH_FORGE_HOST_PLUGINS__: { knowledge: false } } as never
    const ctx = { reflect: { get: () => ({}) } }
    expect(knowledgeGateOf(ctx, g)).toBe(true)
  })

  it('双缺 = false（fail-closed——零登记零异常）；壳缝 false + 服务缺席同径', () => {
    expect(knowledgeGateOf({}, {})).toBe(false)
    expect(knowledgeGateOf(undefined, {})).toBe(false)
    const g = { __DSH_FORGE_HOST_PLUGINS__: { knowledge: false } } as never
    expect(knowledgeGateOf({}, g)).toBe(false)
  })

  it('服务形状漂移 = false（原语/undefined 不作在场——不虚报）', () => {
    expect(knowledgeGateOf({ reflect: { get: () => undefined } }, {})).toBe(false)
    expect(knowledgeGateOf({ reflect: { get: () => 'knowledge' } }, {})).toBe(false)
  })

  it('reflect 异常 = false（fail-closed 不炸 apply）', () => {
    const ctx = { reflect: { get: () => { throw new Error('service teardown race') } } }
    expect(knowledgeGateOf(ctx, {})).toBe(false)
  })

  it('现查禁 memoize（AGENTS §1.6 守卫）：装卸序列下读数即刻翻转（CT-U1.O5）', () => {
    let present = true
    const ctx = { reflect: { get: (key: string) => (present && key === 'knowledge' ? {} : undefined) } }
    expect(knowledgeGateOf(ctx, {})).toBe(true)
    present = false // 卸载——无缓存残留
    expect(knowledgeGateOf(ctx, {})).toBe(false)
    present = true // 重装——读数即刻回正
    expect(knowledgeGateOf(ctx, {})).toBe(true)
  })
})

describe('registerKnowledgeFaces 编排（diag 读数 = A-KN-8 语义）', () => {
  it('门控 false → 零登记零异常（registered 恒空）', () => {
    const slots = fakeSlots()
    const out: KnowledgeFacesDiagnostics = registerKnowledgeFaces(slots, fakeLocale(), {})
    expect(out).toEqual({ registered: [], knowledgeEnabled: false })
    expect(slots.registered).toEqual([])
  })

  it('门控 true（G-B fake 注入）→ 三面落座：[dswf-knowledge, panellist:dswf-knowledge, dswf-recall]', () => {
    const slots = fakeSlots()
    const locale = fakeLocale()
    const ctx = { reflect: { get: () => ({}) } }
    const out = registerKnowledgeFaces(slots, locale, ctx)
    expect(out.knowledgeEnabled).toBe(true)
    expect(out.registered).toEqual(['dswf-knowledge', 'panellist:dswf-knowledge', 'dswf-recall'])
  })

  it('apply 编排：词典登记 = knowledge 自有 NS（词条随迁锚）+ 三面 registered 读数 + 项目台知识目录节（1.5）', () => {
    const slots = fakeSlots()
    const locale = fakeLocale()
    const ctx = { reflect: { get: () => ({}) }, slots, locale }
    expect(knowledgeClient.apply(ctx)).toBeUndefined()
    expect(locale.namespaces).toEqual(['dsh-forge.knowledge'])
    expect(slots.registered).toEqual([
      'main:dswf-knowledge',
      'sidebar.panellist:dswf-knowledge',
      'conversation.view:dswf-recall',
      'project.section.knowledge-dir:dswf-knowledge-dir',
    ])
  })
})

describe('knowledgeClient 组合插件对象（client-modules 装载契约）', () => {
  it('inject 声明边 = [slots, locale]（缺声明 = apply 期 cannot get property）', () => {
    expect(knowledgeClient.inject).toEqual(['slots', 'locale'])
  })

  it('apply 返回值铁律：恒 undefined（cordis 组合把返回值当 effect 消费）', () => {
    expect(knowledgeClient.apply({})).toBeUndefined()
    expect(knowledgeClient.apply({ reflect: { get: () => ({}) }, slots: fakeSlots(), locale: fakeLocale() })).toBeUndefined()
  })

  it('gate false → 零登记（fail-closed）；slots 缺席 → fail-soft 不炸 apply', () => {
    expect(knowledgeClient.apply({})).toBeUndefined()
    // 服务在场但 slots 劣形 = warn 降级（不炸组合）
    expect(knowledgeClient.apply({ reflect: { get: () => ({}) } })).toBeUndefined()
  })
})
