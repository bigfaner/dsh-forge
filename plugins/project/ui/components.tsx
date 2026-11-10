// 领域无关小件（定位：基础——apps/web src/components 同源镜像：ErrorBar / SkeletonRows /
// StateChip / EmptyState 四件）。add-project 流程与 Bug 台账 pane 迁入插件 client bundle
// 后的承载副本（inventory §2.4「组件本体进插件 client bundle」）；宿主壳侧正本仍归
// apps/web/src/components（其余壳内视图消费），漂移由 bug-preview.test 静态标记对账。
// 本件零样式持有——令牌与刻度归各域 CSS（className 注入）；壳全局样式表
// （components.css 等）由壳侧装载，插件渲染 DOM 共享同一全局层。
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ReactNode } from 'react'

export interface ErrorBarProps {
  /** 容器 class（域 CSS 错误条节——如 dswf-sidebar-error） */
  readonly className: string
  /** 错误文案（含前缀语调用方拼好） */
  readonly message: ReactNode
  /** 重试钮 class（域 CSS 文本钮刻度） */
  readonly retryClassName: string
  /** 重试（缺席 = 无重试入口的纯呈现面） */
  readonly onRetry?: () => void
  /** 容器 data 锚名（域前缀——如 'data-dswf-fb-error'；缺席 = 无锚） */
  readonly anchor?: string
  /** 重试钮 data 锚名 */
  readonly retryAnchor?: string
  /** 文案 span class（缺席 = 无 class 原样 span） */
  readonly textClassName?: string
}

/** 错误条（role=alert 可达性面 + 可选重试文本钮——fail-soft 呈现，不炸壳） */
export function ErrorBar({
  className,
  message,
  retryClassName,
  onRetry,
  anchor,
  retryAnchor,
  textClassName,
}: ErrorBarProps): ReactNode {
  return (
    <div className={className} role="alert" {...(anchor === undefined ? {} : { [anchor]: '' })}>
      <span className={textClassName}>{message}</span>
      {onRetry === undefined ? null : (
        <button
          type="button"
          className={retryClassName}
          {...(retryAnchor === undefined ? {} : { [retryAnchor]: '' })}
          onClick={onRetry}
        >
          重试
        </button>
      )}
    </div>
  )
}

export interface SkeletonRowsProps {
  /** 容器 class（域 CSS 骨架节） */
  readonly className: string
  /** 占位行 class（域 CSS 行刻度） */
  readonly rowClassName: string
  /** 占位行数 */
  readonly rows: number
  /** 容器 data 锚名（域前缀，与 className 对齐） */
  readonly anchor: string
}

/** 骨架行容器（装载在途占位——aria-hidden 装饰面，无可读内容） */
export function SkeletonRows({ className, rowClassName, rows, anchor }: SkeletonRowsProps): ReactNode {
  return (
    <div className={className} {...{ [anchor]: '' }} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={rowClassName} />
      ))}
    </div>
  )
}

export interface StateChipProps {
  /** 状态值（原样呈现；语义与配色归业务层） */
  readonly status: string
  /** 布局类名（透传官方 Tag；间距归消费方） */
  readonly className?: string
}

/** 状态徽章（官方 Tag 包装——中性 tone 承载） */
export function StateChip({ status, className }: StateChipProps): ReactNode {
  const cls = className === undefined ? 'dswf-state-chip' : `dswf-state-chip ${className}`
  return (
    <Tag tone="neutral" className={cls}>
      {status}
    </Tag>
  )
}

export interface EmptyStateProps {
  /** 空态标题（一句话说明空的是什么） */
  readonly title: string
  /** 补充描述（可选） */
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
