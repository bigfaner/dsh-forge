// StateChip —— 状态徽章（定位：基础）。官方 Tag 复用（样式纪律第 2 条：官方已有件一律复用
// 禁止重造——徽章骨架/令牌化配色全部官方携带）。P1 仅承载展示：状态值原样呈现、统一中性 tone
// （PRD UF-6：状态 chips 阈值配色 M4/M5——届时在包装内映射 tone，消费方零改动）。
// 零业务语义：props 原始形状（status: string），不含 RPC / 不含 forge·知识域类型。
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ReactNode } from 'react'

export interface StateChipProps {
  /** 状态值（原样呈现；语义与配色归业务层/M4 阈值） */
  readonly status: string
  /** 布局类名（透传官方 Tag；间距归消费方） */
  readonly className?: string
}

/** 状态徽章（官方 Tag 包装——P1 中性承载，M4/M5 扩阈值配色） */
export function StateChip({ status, className }: StateChipProps): ReactNode {
  const cls = className === undefined ? 'dswf-state-chip' : `dswf-state-chip ${className}`
  return (
    <Tag tone="neutral" className={cls}>
      {status}
    </Tag>
  )
}
