// 产品侧图标出口模块（DESIGN.md 图标纪律：产品侧统一经一个图标出口模块导出，禁止散落
// 内联 SVG）。官方 `@deepseek-ai/dsh-client-ui-primitives` 图标库已有的 glyph 一律直接
// re-export 消费；本模块只承载官方缺件的自绘 glyph（逐个标注「自绘 + 官方参照件」，
// 并回写 DESIGN.md 图标资源清单）。
import type { ReactNode } from 'react'

/** 官方 IconProps 同形（size/className——currentColor 着色随消费方） */
export interface DswfIconProps {
  readonly size?: number
  readonly className?: string
}

/**
 * IconFlameFillRegular（自绘——官方图标库 flame 缺件核销后补；官方参照件刻度：
 * 16px viewBox / currentColor / 单色填充）。知识卡片热度徽章专用（SC-J J1：
 * 火焰图标 + 数字——零 emoji 占位）。
 */
export function IconFlameFillRegular({ size = 13, className }: DswfIconProps): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      fillRule="evenodd"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 8.6c-1.42 1.51-2.1 2.6-2.1 3.6 0 .99.83 1.8 1.77 1.8.94 0 1.77-.81 1.77-1.8 0-1-.68-2.09-1.44-3.6Z" />
      <path d="M8 1.33c1.6 2.45 4.25 4.41 4.25 7.11 0 2.63-1.97 4.56-4.25 4.56-2.28 0-4.25-1.93-4.25-4.56C3.75 5.74 6.4 3.78 8 1.33Z" />
    </svg>
  )
}
