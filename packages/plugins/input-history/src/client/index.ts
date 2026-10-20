// @dsh-forge/input-history —— client face（浏览器半；打包脚本 scripts/bundle-client.mjs
// 按官方 clientBundle 配方产出 dist/client.js，经 exports["./client"] 以 classic
// <script> 装载）。
//
// 半完整 cordis 插件：组合 apply（{ apply } 对象）——对策 annotutor
// gotcha-web-boot:43 判例（client face 为 DI 库件、无 apply → 真机 cordis
// `invalid plugin, expect function or object with an "apply" method`）。
// 本任务落最小 face：组合 apply + sessions 缝运行期存在性检查（fail-soft）；
// readline 状态机/键位源/mention 守卫/会话事件历史源接线由下任务移植
// （tech-design ②：desktop 组合在 client root ctx 以服务键 `sessions` 提供
// ISessions，本包经 dsh.client.inject 声明装配期注入边，运行期
// ctx.sessions.binding(id)?.eventSource 解包——binding 对未保留代返回 undefined，
// 消费面须空态容错）。
import { createElement, type ReactElement } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'

/** client face 激活产物（最小面；下任务接线后扩展历史源/键位源成员）。 */
export interface InputHistoryClientFace {
  /** sessions 注入缝在场性（desktop 组合常态供给；缺席 = 空态降级，不炸组合） */
  readonly sessionsAvailable: boolean
}

/**
 * 组合 apply 插件对象（非裸 DI 库件——装载器物化后由 cordis 组合调用 apply）。
 * 类型化具名服务取法：type-only import 官方包保留 ctx.sessions 全量类型安全
 * （AGENTS.md §1.5），运行期存在性检查承担 fail-soft。
 */
export const inputHistoryClient = {
  apply(ctx: Context): InputHistoryClientFace {
    const sessions = (ctx as { sessions?: ISessions }).sessions
    return { sessionsAvailable: sessions != null }
  },
}

/**
 * react 消费点占位（装载契约：react 等平台基线经 factory 的 require 走壳层
 * 冻结种子表、永不内联——守卫测试钉死 require("react") 在场）。下任务接线
 * 替换为真实渲染面时保持 react import 在场即可。
 */
export const inputHistoryPlaceholder: ReactElement = createElement('div', {
  'data-input-history': 'skeleton',
})
