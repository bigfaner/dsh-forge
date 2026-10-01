// 品牌行件（定位：业务——UF-1 品牌行内容；行本体与「整块 = 新会话快捷」交互归官方壳，
// 本件只占 sidebar.brand.mark / sidebar.brand.name 两洞位的内容——原型品牌语言：
// 「知」字标 + dsh-forge 字标）。经产品视图发布面（product-views.ts）供插件槽位注册。
import type { ReactNode } from 'react'
import './sidebar.css'

/** 品牌字标形状（上游 SidebarBrandMarkOwnerProps：壳给定方形边长） */
export interface ForgeBrandMarkProps {
  /** 请求的方形边长（px）——壳品牌行 24 / rail 24（官方刻度） */
  readonly size: number
}

/** 品牌字标（「知」字标——原型 app-brand-mark 同型；尺寸随壳请求） */
export function ForgeBrandMark({ size }: ForgeBrandMarkProps): ReactNode {
  return (
    <span
      className="dswf-sidebar-brand-mark"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      知
    </span>
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
