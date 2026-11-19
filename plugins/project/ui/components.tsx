// 领域无关小件（定位：基础——apps/web src/components 同源镜像：ErrorBar / SkeletonRows /
// StateChip / EmptyState 四件）。add-project 流程与 Bug 台账 pane 迁入插件 client bundle
// 后的承载副本（inventory §2.4「组件本体进插件 client bundle」）；宿主壳侧正本仍归
// apps/web/src/components（其余壳内视图消费），漂移由 bug-preview.test 静态标记对账。
// 1.45 增补 ModeChip（components/ModeChip.tsx）与相对时间标签（components/time-label.ts
// 的 timeLabelZh/isoTimeLabelZh）——概览/提案子 tab 随 dock tab 族迁入的消费面。
// 本件零样式持有——令牌与刻度归各域 CSS（className 注入）；壳全局样式表
// （components.css 等）由壳侧装载，插件渲染 DOM 共享同一全局层。
import { Tag, Tooltip, relativeTime } from '@deepseek-ai/dsh-client-ui-primitives'
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

// ───────────── ModeChip.tsx 镜像（1.45——apps/web src/components/ModeChip.tsx 逐字） ─────────────

/** 模式双值（contracts MODES 同词汇——基础层零 contracts 引入 pin 的本地声明面） */
export type ModeChipMode = 'expedition' | 'blitz'

/** 模式中文标签（mode chip 紧凑面：远征/突击） */
export const MODE_CHIP_LABELS: Readonly<Record<ModeChipMode, string>> = {
  expedition: '远征',
  blitz: '突击',
}

/** 未标记缺省占位文案（扫描吸收旧行 = mode NULL 键缺席） */
export const MODE_CHIP_UNMARKED_LABEL = '未标记'

/** 未标记悬停说明（ui-design UF-1 States「mode 缺省」行） */
export const MODE_CHIP_UNMARKED_TITLE = '扫描吸收的旧提案无溯源'

/** 可点态悬停说明（唯一正门不因快捷方式分叉——ui-design UF-1 mode chip 形态注记） */
export const MODE_CHIP_OPEN_TITLE = '打开模式更改对话框（同 ⋯ 菜单唯一正门）'

export interface ModeChipProps {
  /** 模式溯源（undefined = 未标记缺省占位——不可点 + 悬停说明） */
  readonly mode: ModeChipMode | undefined
  /** 模式更改快捷入口（在场且 mode 有值 = 可点；缺席 = 只读呈现） */
  readonly onOpenChangeMode?: () => void
  /** 布局类名（透传） */
  readonly className?: string
}

/** 模式溯源 chip（三态：远征蓝点 / 突击琥珀点 / 未标记中性不可点） */
export function ModeChip({ mode, onOpenChangeMode, className }: ModeChipProps): ReactNode {
  const unmarked = mode === undefined
  const clickable = !unmarked && onOpenChangeMode !== undefined
  const cls = ['dswf-mode-chip', unmarked ? 'is-unset' : '', className ?? '']
    .filter(Boolean)
    .join(' ')
  return (
    // D30：原生 title 退役——悬停说明走官方 Tooltip（禁用态锚定 = dswf-tipwrap 包裹 span）
    <Tooltip
      label={
        unmarked
          ? MODE_CHIP_UNMARKED_TITLE
          : clickable
            ? MODE_CHIP_OPEN_TITLE
            : `模式溯源：${MODE_CHIP_LABELS[mode]}`
      }
      portal
    >
      <span className="dswf-tipwrap">
        <button
          type="button"
          className={cls}
          data-dswf-mode-chip={mode ?? 'unmarked'}
          disabled={!clickable}
          onClick={clickable ? onOpenChangeMode : undefined}
        >
          {unmarked ? null : <span className="dswf-mode-chip-dot" data-mode={mode} aria-hidden="true" />}
          <span className="dswf-mode-chip-label">
            {unmarked ? MODE_CHIP_UNMARKED_LABEL : MODE_CHIP_LABELS[mode]}
          </span>
        </button>
      </span>
    </Tooltip>
  )
}

// ───────────── time-label.ts 镜像（1.45——apps/web src/components/time-label.ts 逐字） ─────────────

/**
 * 毫秒时戳 → 官方桶化 zh 标签（纯函数）。桶枚举封闭——未知桶 fail-loud（契约面保证
 * relativeTime 返回封闭联合，default 支即不可达证明）。
 */
export function timeLabelZh(ts: number, now: number): string {
  const bucket = relativeTime(ts, now)
  switch (bucket.unit) {
    case 'now':
      return '刚刚'
    case 'minutes':
      return `${bucket.n} 分钟前`
    case 'hours':
      return `${bucket.n} 小时前`
    case 'days':
      return `${bucket.n} 天前`
    case 'months':
      return `${bucket.n} 个月前`
    case 'years':
      return `${bucket.n} 年前`
    default: {
      const exhaustive: never = bucket.unit
      throw new Error(`dsh-forge web: 未知相对时间桶：${String(exhaustive)}`)
    }
  }
}

/**
 * ISO-8601 串 → 桶化 zh 标签（纯函数）：不可解析原文返回（fail-soft 不炸卡片/行——
 * core 写入面保证 ISO，此为防御面）。
 */
export function isoTimeLabelZh(iso: string, now: number): string {
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) return iso
  return timeLabelZh(ts, now)
}
