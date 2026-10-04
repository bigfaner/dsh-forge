// 品牌行件（定位：业务——UF-1 品牌行内容；行本体与「整块 = 新会话快捷」交互归官方壳，
// 本件只占 sidebar.brand.mark / sidebar.brand.name 两洞位的内容——品牌语言（fix-38）：
// 「鲸游书海」mark（知识（书海）托举探索者（鲸）前行，docs/brand/whale-sea-mark.svg 母版）
// + dsh-forge 字标；前任 fix-15「书 + 闪电」标退役为历史档）。经产品视图发布面
// （product-views.ts）供插件槽位注册。
import type { ReactNode } from 'react'
import { FISH_LOGO_PATH } from '@deepseek-ai/dsh-client-ui-primitives'
import './sidebar.css'

/** 品牌字标形状（上游 SidebarBrandMarkOwnerProps：壳给定方形边长） */
export interface ForgeBrandMarkProps {
  /** 请求的方形边长（px）——壳品牌行 24 / rail 24（官方刻度） */
  readonly size: number
}

/** 品牌标识（「鲸游书海」mark——fix-38 走查人采纳：知识（书海）托举探索者（鲸）前行，
 * 鲸的喷泉水花即闪电——力量由知识激发；docs/brand/whale-sea-mark.svg 母版三层内联。
 * 鲸剪影 = 官方 FISH_LOGO_PATH 经导出面消费（几何零拷贝——上游几何演进自动跟随；官方
 * 注释明示 exported for consumers that compose their own svg），仅缩放平移：×0.62 ≈
 * 14.4×10.6，腹线没入书浪 = 破浪而行；书页浪双层 + 闪电喷泉为产品自有元素照母版内联。
 * 单一 currentColor 随官方令牌适配明暗主题（沿 fix-15 禁用约定：零固定色值/深底方块）；
 * 16px 可辨锚 = 鲸尾卷 + 闪电；尺寸随壳请求（viewBox 缩放） */
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
      {/* ① 书海（知识——基座，先画；鲸将破浪其上；双页非对称透明度制造翻动层次） */}
      <path
        d="M11.9 15.2 C9.2 13.9 5.6 13.8 2.8 15.1 C2.5 15.2 2.3 15.5 2.3 15.8 V20.0 C2.3 20.6 2.9 21.0 3.4 20.8 C6.1 19.8 9.0 20.0 11.3 21.2 C11.6 21.4 11.9 21.1 11.9 20.7 Z"
        fill="currentColor"
        opacity=".88"
      />
      <path
        d="M12.1 15.2 C14.8 13.9 18.4 13.8 21.2 15.1 C21.5 15.2 21.7 15.5 21.7 15.8 V20.0 C21.7 20.6 21.1 21.0 20.6 20.8 C17.9 19.8 15.0 20.0 12.7 21.2 C12.4 21.4 12.1 21.1 12.1 20.7 Z"
        fill="currentColor"
        opacity=".6"
      />
      {/* ② 原生 dsh 鲸（官方剪影——FISH_LOGO_PATH 经官方导出面 compose 消费，几何零拷贝） */}
      <path d={FISH_LOGO_PATH} fill="currentColor" transform="translate(5.0 4.9) scale(0.62)" />
      {/* ③ 闪电喷泉（力量——鲸背最高处喷出；与 fix-15 闪电同源谱系） */}
      <path d="M13.0 1.1 11.4 3.5 H12.4 L11.1 5.1 13.8 2.6 H12.8 Z" fill="currentColor" />
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
