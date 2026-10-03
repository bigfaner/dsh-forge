// 品牌行件（定位：业务——UF-1 品牌行内容；行本体与「整块 = 新会话快捷」交互归官方壳，
// 本件只占 sidebar.brand.mark / sidebar.brand.name 两洞位的内容——品牌语言（fix-15）：
// 「书 + 闪电」mark（知识就是力量，docs/brand/dsh-forge-mark.svg 母版）+ dsh-forge 字标）。
// 经产品视图发布面（product-views.ts）供插件槽位注册。
import type { ReactNode } from 'react'
import './sidebar.css'

/** 品牌字标形状（上游 SidebarBrandMarkOwnerProps：壳给定方形边长） */
export interface ForgeBrandMarkProps {
  /** 请求的方形边长（px）——壳品牌行 24 / rail 24（官方刻度） */
  readonly size: number
}

/** 品牌标识（「书 + 闪电」mark——知识就是力量：翻开的书托举自书脊升起的闪电；
 * docs/brand/dsh-forge-mark.svg 母版三路径内联渲染，单一 currentColor 随官方令牌
 * 适配明暗主题（fix-15：废弃深色填充底——近黑方块根因）；尺寸随壳请求（viewBox 缩放） */
export function ForgeBrandMark({ size }: ForgeBrandMarkProps): ReactNode {
  return (
    <svg
      className="dswf-sidebar-brand-mark"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      {/* 闪电：自书脊升起，尖端向上（力量） */}
      <path d="M13.6 1.5 9.1 9.7h2.7l-1.5 3.7 5.7-7.5h-2.8l1.4-4.4z" fill="currentColor" />
      {/* 左书页（知识；书页降透明度制造翻动层次） */}
      <path
        d="M11.4 15.6C9 14.1 5.7 14 2.9 15.3c-.3.1-.5.4-.5.7v4.6c0 .6.6 1 1.1.8 2.7-1 5.6-.8 7.9.5v-6.3z"
        fill="currentColor"
        opacity=".88"
      />
      {/* 右书页 */}
      <path
        d="M12.6 15.6c2.4-1.5 5.7-1.6 8.5-.3.3.1.5.4.5.7v4.6c0 .6-.6 1-1.1.8-2.7-1-5.6-.8-7.9.5v-6.3z"
        fill="currentColor"
        opacity=".6"
      />
    </svg>
  )
}

/** 品牌字名形状（上游 SidebarBrandNameOwnerProps：占位者自持内容与宽度） */
export interface ForgeBrandNameProps {
  /** 上游契约标记：占位者自持内容（不接受壳注入 children） */
  readonly children?: never
}

/** 品牌字名（dsh-forge 字标——原型 sb-wordmark 同型） */
export function ForgeBrandName(_props: ForgeBrandNameProps): ReactNode {
  return <span className="dswf-sidebar-brand-name">dsh-forge</span>
}
