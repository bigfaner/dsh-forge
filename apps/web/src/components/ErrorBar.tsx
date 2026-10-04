// 错误条共享件（定位：基础——fix-36 收敛：sidebar / 浏览器 / 知识 / 召回四域近同构
// 「role=alert 文案行 + 重试文本钮」错误条的单一 JSX 来源；EmptyState 先例）。
// 令牌与刻度归各域 CSS（className / retryClassName 注入——本件零样式持有）；data 锚
// 由调用方注入（域前缀，缺席 = 无锚面）。
import type { ReactNode } from 'react'

export interface ErrorBarProps {
  /** 容器 class（域 CSS 错误条节——如 dswf-sidebar-error） */
  readonly className: string
  /** 错误文案（含前缀语调用方拼好——如「目录加载失败：xxx」） */
  readonly message: ReactNode
  /** 重试钮 class（域 CSS 文本钮刻度） */
  readonly retryClassName: string
  /** 重试（缺席 = 无重试入口的纯呈现面） */
  readonly onRetry?: () => void
  /** 容器 data 锚名（域前缀——如 'data-dswf-fb-error'；缺席 = 无锚） */
  readonly anchor?: string
  /** 重试钮 data 锚名（如 'data-dswf-recall-retry'；缺席 = 无锚） */
  readonly retryAnchor?: string
  /** 文案 span class（fb 域有专用行；缺席 = 无 class 原样 span） */
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
