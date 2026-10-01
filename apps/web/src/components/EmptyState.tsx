// EmptyState —— 统一空态简版（定位：基础；P1 简版，M8 打磨）。官方无对应件（ui-primitives
// 无空态组件），自绘限本件且全令牌。消费方（page-map Shared Components）：知识库空库引导
// （UF-6）/ 会话召回 tab 无召回（UF-4）/ 会话列表空态。引导插槽 = action（ReactNode，
// 消费方注入 CTA / 清除过滤入口等引导动作）。零业务语义：props = string + ReactNode。
import type { ReactNode } from 'react'
import './components.css'

export interface EmptyStateProps {
  /** 空态标题（一句话说明空的是什么） */
  readonly title: string
  /** 补充描述（可选——如引导说明目录位置） */
  readonly description?: string
  /** 引导插槽（可选——CTA / 清除过滤入口等；内容由消费方注入） */
  readonly action?: ReactNode
  /** 布局类名（透传；间距归消费方） */
  readonly className?: string
}

/** 统一空态（标题 + 可选描述 + 可选引导插槽；容器自居中占满） */
export function EmptyState({ title, description, action, className }: EmptyStateProps): ReactNode {
  const cls = className === undefined ? 'dswf-empty' : `dswf-empty ${className}`
  return (
    <div className={cls} data-dswf-empty="">
      <p className="dswf-empty-title">{title}</p>
      {description !== undefined ? <p className="dswf-empty-description">{description}</p> : null}
      {action !== undefined ? <div className="dswf-empty-action">{action}</div> : null}
    </div>
  )
}
