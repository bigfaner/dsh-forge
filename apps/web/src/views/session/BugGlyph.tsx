// Bug 引用字形（composer-bug-reference 1.2——@ 补全菜单 Bug 组候选行图标件）。
// 官方 icon set（dsh-client-ui-primitives icons）无 bug 几何、ReferenceIconKind 词表冻结
// 在 file/folder/session——产品自带 IconProps 组件（几何口径对齐官方件：currentColor +
// 一像素描边 + viewBox 24），经发布面 __DSH_FORGE_VIEWS__ 递达 client 插件（React 单例：
// 组件本体居壳 bundle——client bundle 自含禁跨 chunk import）。
import type { ReactNode } from 'react'
import type { IconProps } from '@deepseek-ai/dsh-client-ui-primitives'

/** 发布面 props（IconProps 透传——size/className 消费切片） */
export type ForgeBugGlyphProps = IconProps

/** Bug 台账候选行字形（甲虫几何：椭圆体 + 中线 + 六腿 + 双触角；装饰性——aria-hidden） */
export function ForgeBugGlyph({ size, className }: IconProps): ReactNode {
  return (
    <svg
      width={size ?? 16}
      height={size ?? 16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* 体（椭圆）+ 头 */}
      <ellipse cx="12" cy="13.5" rx="5" ry="6" />
      <path d="M10 7.5a2 2 0 0 1 4 0v1h-4v-1Z" />
      {/* 中线（鞘翅缝） */}
      <path d="M12 9.5v10" />
      {/* 腿 ×6 */}
      <path d="M7 11 4.5 9.5M7 14H4M7 17l-2.5 1.5M17 11l2.5-1.5M17 14h3M17 17l2.5 1.5" />
      {/* 触角 */}
      <path d="M10 6 8.5 4M14 6l1.5-2" />
    </svg>
  )
}
