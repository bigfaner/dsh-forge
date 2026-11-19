// EditableCombobox 纯逻辑面单测 —— 过滤 / 键盘动作 / 选择回填（组件只消费，零 React 依赖）。
import { describe, expect, it } from 'vitest'
import {
  commitOption,
  comboboxKey,
  defaultFilterOptions,
  isMenuFocusTarget,
  moveActive,
  type ComboboxOption,
} from './combobox-model.js'

const OPTIONS: readonly ComboboxOption[] = [
  { id: 'wt-a', label: 'wt-a' },
  { id: 'worktree-branch-management', label: 'worktree-branch-management' },
  { id: 'dispatch-loop-hardening', label: 'dispatch-loop-hardening' },
]

describe('defaultFilterOptions 输入过滤', () => {
  it('大小写不敏感子串匹配', () => {
    expect(defaultFilterOptions(OPTIONS, 'WT').map((option) => option.id)).toEqual(['wt-a'])
    expect(defaultFilterOptions(OPTIONS, 'Loop').map((option) => option.id)).toEqual(['dispatch-loop-hardening'])
  })
  it('空查询 = 全量候选（首尾空白忽略）', () => {
    expect(defaultFilterOptions(OPTIONS, '  ')).toEqual(OPTIONS)
    expect(defaultFilterOptions(OPTIONS, ' branch-management ')).toHaveLength(1)
  })
  it('无命中 = 空清单（自由手写不受候选约束）', () => {
    expect(defaultFilterOptions(OPTIONS, 'nope')).toEqual([])
  })
})

describe('comboboxKey 键盘动作', () => {
  it('↑↓ = 上下移动（收起态也响应——先展开再走）', () => {
    expect(comboboxKey('ArrowDown', false, 3)).toBe('down')
    expect(comboboxKey('ArrowUp', true, 3)).toBe('up')
  })
  it('Enter = 展开且有候选时确认回填；收起或零候选不截获（自由手写直落）', () => {
    expect(comboboxKey('Enter', true, 3)).toBe('commit')
    expect(comboboxKey('Enter', true, 0)).toBeNull()
    expect(comboboxKey('Enter', false, 3)).toBeNull()
  })
  it('Esc = 关闭浮层；其余按键零动作', () => {
    expect(comboboxKey('Escape', true, 3)).toBe('close')
    expect(comboboxKey('a', true, 3)).toBeNull()
    expect(comboboxKey('Tab', true, 3)).toBeNull()
  })
})

describe('moveActive 环绕移动', () => {
  it('向下到尾回绕到首，向上到首回绕到尾', () => {
    expect(moveActive(2, 1, 3)).toBe(0)
    expect(moveActive(0, -1, 3)).toBe(2)
    expect(moveActive(0, 1, 3)).toBe(1)
  })
  it('零候选恒 0（不越界）', () => {
    expect(moveActive(5, 1, 0)).toBe(0)
  })
})

describe('commitOption 选择回填', () => {
  it('回填当前活动行 id；越界 = null（不回填）', () => {
    expect(commitOption(OPTIONS, 1)).toBe('worktree-branch-management')
    expect(commitOption(OPTIONS, 9)).toBeNull()
    expect(commitOption([], 0)).toBeNull()
  })
})

describe('isMenuFocusTarget 失焦守卫（浮层行取焦不关——点击选择先于 blur 关闭）', () => {
  it('浮层内取焦（closest 命中 role=menu）= 不关', () => {
    expect(isMenuFocusTarget({ closest: () => ({}) })).toBe(true)
  })
  it('外部取焦 / 失焦无目标 = 关', () => {
    expect(isMenuFocusTarget({ closest: () => null })).toBe(false)
    expect(isMenuFocusTarget(null)).toBe(false)
    expect(isMenuFocusTarget('text')).toBe(false)
  })
})
