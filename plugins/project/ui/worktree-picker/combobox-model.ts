// EditableCombobox 纯逻辑面（UI 只消费，零 React 依赖）——过滤 / 键盘动作 / 环绕移动 /
// 选择回填 / 失焦守卫五件套。组件层（EditableCombobox.tsx）只做官方 Input + Menu 装配，
// 交互语义单一权威源在本文件（无 jsdom 环境下单测直测面）。
import type { ReactNode } from 'react'

/** 组合框候选行（id = 回填值；label = 浮层行呈现，含样式与注释小字） */
export interface ComboboxOption {
  readonly id: string
  readonly label: ReactNode
}

/** 默认输入过滤：大小写不敏感子串匹配；空白查询 = 全量候选 */
export function defaultFilterOptions(
  options: readonly ComboboxOption[],
  query: string,
): readonly ComboboxOption[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return options
  return options.filter((option) => option.id.toLowerCase().includes(needle))
}

/** 键盘动作（keydown 单一映射——组件层据此操作开合/活动行/回填） */
export type ComboboxKeyAction = 'close' | 'up' | 'down' | 'commit' | null

/**
 * 键盘语义：↑↓ 选择（收起态也响应——先展开再走）、Enter 确认回填（展开且有候选才
 * 截获——收起或零候选时不拦，自由手写直落）、Esc 关闭；其余按键零动作。
 */
export function comboboxKey(key: string, open: boolean, count: number): ComboboxKeyAction {
  switch (key) {
    case 'ArrowDown':
      return 'down'
    case 'ArrowUp':
      return 'up'
    case 'Enter':
      return open && count > 0 ? 'commit' : null
    case 'Escape':
      return 'close'
    default:
      return null
  }
}

/** 活动行环绕移动（向下到尾回首、向上到首回尾；零候选恒 0 不越界） */
export function moveActive(index: number, delta: number, count: number): number {
  if (count === 0) return 0
  return (index + delta + count) % count
}

/** 选择回填：活动行 id；越界/空候选 = null（不回填） */
export function commitOption(options: readonly ComboboxOption[], index: number): string | null {
  return options[index]?.id ?? null
}

/**
 * 失焦守卫：blur 相关目标落在浮层内（role=menu 子树取焦——浮层行点击先取焦后触发
 * onSelect）= 不关；外部取焦或无目标（点击非取焦区/窗口失焦）= 关。
 * relatedTarget 为跨环境 unknown——按「有 closest 方法且命中」鸭型判定，Node 侧可测。
 */
export function isMenuFocusTarget(target: unknown): boolean {
  if (target === null || typeof target !== 'object') return false
  const candidate = target as { closest?: (selector: string) => unknown }
  return typeof candidate.closest === 'function' && candidate.closest('[role="menu"]') !== null
}
