/**
 * The C3 overflow fold row (task 1.4; ui-design §Component C3 Overflow /
 * workbench-layout-v2 §2.3): each group keeps its first {@link
 * TREE_OVERFLOW_LIMIT} sessions and folds the rest behind「⋯ 展开其余 N 个
 * 会话 / 收起」(h28). The open/closed bit rides the layout memory's
 * overflowOpen array (per-group key), exposed through onToggle — the P4
 * wiring persists it with the project.
 */
import { useState } from 'react'
import { FOCUS_RING } from '../chrome/ChromeButton'
import { TREE_OVERFLOW_LIMIT } from './tree-derive'
import type { TreeTranslate } from './SessionRow'

export interface OverflowRowProps {
  t: TreeTranslate
  /** Layout-memory key: a projectId or the 未分组 sentinel. */
  groupKey: string
  /** Total top-level sessions in the group. */
  total: number
  open: boolean
  onToggle: (groupKey: string) => void
}

const buttonStyle = {
  alignItems: 'center',
  background: 'transparent',
  border: 'none',
  borderRadius: '12px',
  color: 'var(--dsw-alias-label-secondary, GrayText)',
  cursor: 'pointer',
  display: 'flex',
  fontSize: '12px',
  height: '28px',
  lineHeight: '18px',
  padding: '0 8px 0 20px',
  textAlign: 'left',
  width: '100%',
} as const

/** The per-group fold toggle:「⋯ 展开其余 N 个会话」⇄「收起」. */
export function OverflowRow(props: OverflowRowProps) {
  const [focused, setFocused] = useState(false)
  const hidden = Math.max(0, props.total - TREE_OVERFLOW_LIMIT)
  return (
    <button
      type="button"
      data-dsh-forge-tree-overflow={props.groupKey}
      style={{ ...buttonStyle, ...(focused ? FOCUS_RING : undefined) }}
      aria-expanded={props.open ? 'true' : 'false'}
      onFocus={() => { setFocused(true) }}
      onBlur={() => { setFocused(false) }}
      onClick={() => { props.onToggle(props.groupKey) }}
    >
      {props.open
        ? props.t('tree.overflow.collapse')
        : `⋯ ${props.t('tree.overflow.expand').replace('{n}', String(hidden))}`}
    </button>
  )
}
