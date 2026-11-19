// taskLoopClient 装载契约门测（fix-5——bug d731b785：apply 期越缝直取 ctx.locale
// 无官方 inject 缝 → cannot get property "locale" without inject → dock tab 注册链
// 中断 → 概览 tab 零挂载）。
// 缝选型 = 官方同型先例 knowledge/ui/faces-gate.test.ts:134：locale 走 inject 名单
// 声明边（cordis 装载契：声明边等待官方 locale 服务就绪），缺席 fail-soft 不中断注册链。
import { describe, expect, it } from 'vitest'
import { taskLoopClient } from '../../ui/index.js'
import type { SectionSlotsFace } from '../../ui/keyed-section.js'
import type { LocaleServiceFace } from '../../ui/locale.js'

/** 形状合法假 slots（inject 子缝直调 + register 落座计数） */
function fakeSlots(): SectionSlotsFace & { registered: string[] } {
  const registered: string[] = []
  return {
    registered,
    inject: (_key, cb) => {
      cb()
      return () => {}
    },
    register: (options) => {
      const o = options as { name?: string; key?: string }
      registered.push(`${o.name ?? ''}:${o.key ?? ''}`)
      return () => {}
    },
  }
}

/** 形状合法假 locale（register 计录 NS） */
function fakeLocale(): LocaleServiceFace & { namespaces: string[] } {
  const namespaces: string[] = []
  return {
    namespaces,
    register: (ns) => {
      namespaces.push(ns)
      return () => {}
    },
    bind: () => (key: string) => key,
  }
}

describe('taskLoopClient 装载契约（fix-5 bug d731b785）', () => {
  it('inject 声明边含 locale（官方缝——缺声明 = apply 期 cannot get property "locale"）', () => {
    expect(taskLoopClient.inject).toContain('locale')
  })

  it('apply：locale 在场 → 词典登记自有 NS + dock tab faces 注册链完整', () => {
    const slots = fakeSlots()
    const locale = fakeLocale()
    expect(taskLoopClient.apply({ slots, locale, get: () => undefined })).toBeUndefined()
    expect(locale.namespaces).toEqual(['dsh-forge.task-loop'])
    expect(slots.registered).toContain('sidebar.right.pane.tab:dswf-overview')
  })

  it('apply：locale 缺席 → fail-soft 不中断注册链（label 回退 NS 键名）', () => {
    const slots = fakeSlots()
    expect(taskLoopClient.apply({ slots, get: () => undefined })).toBeUndefined()
    expect(slots.registered).toContain('sidebar.right.pane.tab:dswf-overview')
  })
})
