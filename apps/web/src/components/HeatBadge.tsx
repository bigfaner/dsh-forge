// HeatBadge —— 热度徽章（定位：基础）。热度 = 事件计数展示（PRD UF-6 Data Requirements：
// 热度数字必须等于使用事件计数——本件只做数值原样呈现，不做阈值/隐藏等数值语义判断，
// 可见性策略归消费方）。官方 Tag 复用（quiet tone：比 neutral 更安静的事实陈述——
// 卡片/召回行中与 StateChip 中性底相区分）。零业务语义：props 原始形状（count: number）。
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ReactNode } from 'react'

export interface HeatBadgeProps {
  /** 热度计数（原样呈现——与使用事件计数一致的展示值） */
  readonly count: number
  /** 布局类名（透传官方 Tag；间距归消费方） */
  readonly className?: string
}

/** 热度徽章（官方 Tag 包装——数值展示） */
export function HeatBadge({ count, className }: HeatBadgeProps): ReactNode {
  const cls = className === undefined ? 'dswf-heat-badge' : `dswf-heat-badge ${className}`
  return (
    <Tag tone="quiet" className={cls}>
      {`热度 ${count}`}
    </Tag>
  )
}
