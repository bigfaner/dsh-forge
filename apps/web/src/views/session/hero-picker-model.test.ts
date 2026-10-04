// hero-picker-model 单测（fix-24 ① AC5）——项目映射纯函数三口径：
// workspaceId↔project 映射 / archived 排除 / 空集（添加唯一入口 + 直达判据）。
import { describe, expect, it } from 'vitest'
import type { ProjectSummary } from '@dsh-forge/contracts'
import { heroPickerPlan, selectedProjectOf } from './hero-picker-model.js'

const project = (o: { id: string; workspaceId: string; name: string; archived?: boolean }): ProjectSummary => ({
  id: o.id,
  workspaceId: o.workspaceId,
  name: o.name,
  wsPath: `C:\\ws\\${o.id}`,
  archived: o.archived ?? false,
})

const PROJECTS = [
  project({ id: 'p1', workspaceId: 'w-1', name: 'alpha' }),
  project({ id: 'p2', workspaceId: 'w-2', name: 'beta' }),
  project({ id: 'p3', workspaceId: 'w-3', name: 'gamma', archived: true }),
]

describe('heroPickerPlan（行集 + 入口形态）', () => {
  it('行集 = 项目（id=workspaceId、name=label）；archived 排除（过滤口径与左栏一致）', () => {
    const plan = heroPickerPlan(PROJECTS, true)
    expect(plan.rows).toEqual([
      { id: 'w-1', name: 'alpha' },
      { id: 'w-2', name: 'beta' },
    ])
  })

  it('行集非空 → pinAdd=true、addIsTheOnlyEntry=false（添加项入 footer——官方 pinAdd 形态）', () => {
    const plan = heroPickerPlan(PROJECTS, true)
    expect(plan.pinAdd).toBe(true)
    expect(plan.addIsTheOnlyEntry).toBe(false)
  })

  it('空项目集 + 账面已定 → addIsTheOnlyEntry=true（弹层直达产品注册流——官方 :1935-1943 语义对齐）', () => {
    const plan = heroPickerPlan([], true)
    expect(plan.rows).toEqual([])
    expect(plan.pinAdd).toBe(false)
    expect(plan.addIsTheOnlyEntry).toBe(true)
  })

  it('账面未定（loading/error）且行集空 → 直达判据关（弹层仍呈现添加单项——不闪直达）', () => {
    const plan = heroPickerPlan([], false)
    expect(plan.addIsTheOnlyEntry).toBe(false)
    expect(plan.pinAdd).toBe(false)
  })

  it('全归档项目集 = 空行集同口径（archived 排除后直达判据生效）', () => {
    const plan = heroPickerPlan([project({ id: 'px', workspaceId: 'w-x', name: 'x', archived: true })], true)
    expect(plan.rows).toEqual([])
    expect(plan.addIsTheOnlyEntry).toBe(true)
  })
})

describe('selectedProjectOf（workspaceId ↔ 项目映射——owner selectedId 契约）', () => {
  it('selectedId 命中项目行 → 返回该行（onPick/selectedId 以 workspaceId 为键零翻译）', () => {
    const rows = heroPickerPlan(PROJECTS, true).rows
    expect(selectedProjectOf(rows, 'w-2')).toEqual({ id: 'w-2', name: 'beta' })
  })

  it('selectedId 指向未绑定工作区（账本原生行）→ 无命中（零高亮——未绑定工作区不在弹层）', () => {
    const rows = heroPickerPlan(PROJECTS, true).rows
    expect(selectedProjectOf(rows, 'w-native-unbound')).toBeUndefined()
  })

  it('selectedId 指向已归档项目 → 无命中（archived 排除口径的一致面）', () => {
    const rows = heroPickerPlan(PROJECTS, true).rows
    expect(selectedProjectOf(rows, 'w-3')).toBeUndefined()
  })

  it('selectedId 缺席（无 pending 无会话归属）→ undefined', () => {
    expect(selectedProjectOf(heroPickerPlan(PROJECTS, true).rows, undefined)).toBeUndefined()
  })
})
