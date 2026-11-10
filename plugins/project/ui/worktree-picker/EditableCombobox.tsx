// EditableCombobox —— 通用可输入过滤组合框（定位：基础；官方件组合零自绘样式）：
// 官方 Input（输入面）+ Menu（浮层与选项行）胶水装配——受控 value/onChange/options/
// onFilter（输入过滤回调）/placeholder/disabled；键盘语义：↑↓ 选择、Enter 确认回填、
// Esc 关闭；失焦与点击外部关闭（失焦守卫放行浮层行取焦，外部关闭由 Menu onClose 承接）。
// 交互语义权威源 = combobox-model.ts 纯函数面；零业务语义（options/value/filter 受控）。
import { useMemo, useState, type CSSProperties, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Input, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import { commitOption, comboboxKey, defaultFilterOptions, isMenuFocusTarget, moveActive, type ComboboxOption } from './combobox-model.js'

export type { ComboboxOption } from './combobox-model.js'

export interface EditableComboboxProps {
  /** 受控值（输入即回填——过滤查询与自由手写共用同一值） */
  readonly value: string
  readonly onChange: (value: string) => void
  /** 全量候选（未过滤——排序/去重归消费方给定） */
  readonly options: readonly ComboboxOption[]
  /** 输入过滤回调（当前输入值 → 过滤后候选；缺省 = 大小写不敏感子串默认过滤） */
  readonly onFilter?: (query: string) => readonly ComboboxOption[]
  readonly placeholder?: string
  readonly disabled?: boolean
  /** 输入面 data-* 锚透传（消费方走查锚，如 data-dswt-branch-input） */
  readonly inputData?: Readonly<Record<string, string>>
  /** 输入面样式透传（等宽基准归消费方——官方 Input style 落内部原生 input） */
  readonly inputStyle?: CSSProperties
  /** 输入壳类名透传（官方 Input className 落外层 .wrap 可见描边盒——宽度基准归消费方：
   * .wrap 是 inline-flex shrink-to-fit，等宽须由消费方类在其上钉宽） */
  readonly inputWrapClassName?: string
  /** 浮层卡类名透传（官方 Menu listClassName——消费方走查锚） */
  readonly listClassName?: string
}

/** 通用可输入过滤组合框（单一控件 = 输入 + 浮层候选；外观与同表单 Input 一致） */
export function EditableCombobox({
  value,
  onChange,
  options,
  onFilter,
  placeholder,
  disabled,
  inputData,
  inputStyle,
  inputWrapClassName,
  listClassName,
}: EditableComboboxProps): ReactNode {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const filtered = useMemo(
    () => (onFilter ? onFilter(value) : defaultFilterOptions(options, value)),
    [onFilter, options, value],
  )
  // 活动行随过滤收缩钳制（过滤后清单变短不越界）
  const active = Math.min(activeIndex, Math.max(filtered.length - 1, 0))
  const close = (): void => setOpen(false)
  const commit = (): void => {
    const id = commitOption(filtered, active)
    if (id !== null) {
      onChange(id)
      close()
    }
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    const action = comboboxKey(event.key, open, filtered.length)
    if (action === null) return
    event.preventDefault()
    if (action === 'close') {
      close()
    } else if (action === 'commit') {
      commit()
    } else {
      const delta = action === 'down' ? 1 : -1
      setOpen(true)
      setActiveIndex((index) => moveActive(Math.min(index, Math.max(filtered.length - 1, 0)), delta, filtered.length))
    }
  }
  return (
    <Menu
      open={open && filtered.length > 0}
      onClose={close}
      anchor={
        <Input
          data-dswf-combobox-input=""
          {...inputData}
          className={inputWrapClassName}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          style={inputStyle}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            onChange(event.currentTarget.value)
            setOpen(true)
            setActiveIndex(0)
          }}
          onFocus={() => setOpen(true)}
          onBlur={(event) => {
            if (!isMenuFocusTarget(event.relatedTarget)) close()
          }}
          onKeyDown={handleKeyDown}
        />
      }
      items={filtered.map((option) => ({ id: option.id, label: option.label }))}
      selectedId={filtered[active]?.id}
      onSelect={(id) => {
        onChange(id)
        close()
      }}
      listClassName={listClassName}
    />
  )
}
