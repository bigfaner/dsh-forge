// 骨架行容器共享件（定位：基础——fix-36 收敛：sidebar / 浏览器 / 知识网格 / 召回四域
// 近同构「N 行占位 + aria-hidden」骨架的单一 JSX 来源；EmptyState 先例）。
// 令牌与刻度归各域 CSS（className / rowClassName 注入——本件零样式持有）；data 锚
// 域前缀（data-dswf-<域>-skeleton）由调用方注入，与 className 同域对齐。
import type { ReactNode } from 'react'

export interface SkeletonRowsProps {
  /** 容器 class（域 CSS 骨架节——如 dswf-sidebar-skeleton） */
  readonly className: string
  /** 占位行 class（域 CSS 行刻度） */
  readonly rowClassName: string
  /** 占位行数（域刻度：sidebar/recall 3、浏览器 4、知识网格 8） */
  readonly rows: number
  /** 容器 data 锚名（域前缀——如 'data-dswf-sidebar-skeleton'，与 className 对齐） */
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
