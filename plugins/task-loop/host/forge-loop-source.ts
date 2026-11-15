// forge-loop · 循环哨兵 source（1.18 批次③先行——tech-design AD-4 / api-handbook 4.3）。
// 桌面循环注入面（faces.ts forgeUserMessage followup 径 / notify/ 通道 / run-dag-tasks.ts
// 指令单行）一律声明 source.kind='forge-loop'：任务循环注入的 user-role 消息不带类型化
// source 会被当人工输入渲染（蓝气泡）——类型化后消费端按 kind 分派（循环叙述卡/系统行）。
//
// 官方机械锚（@deepseek-ai/dsh-llm lib/types/message.d.ts）：`MessageSourceMap` 为
// merge-extensible sum type——「each producer declares its own kind in its own module；
// consumers fall through unknown kinds（documented opaque default）」。本模块即 plugin-forge
// 自有的声明合并落点：S7 投影同型纪律（boundaries.test 白名单成员）——devDependency
// 类型面 + declare-module 合并 + import type 解析锚，零运行时 import（faces.ts 结构化
// 最小面纪律不受影响）。合并锚 = 声明模块 '@deepseek-ai/dsh-llm/message'
// （MessageSourceMap 的 declaring module——重导出根不可合并）。
import type { ContextFormed } from '@deepseek-ai/dsh-llm/message'

/** MessageSourceMap 声明合并（api-handbook 4.3——kind 'forge-loop' 挂结构化字段 + ContextForm） */
declare module '@deepseek-ai/dsh-llm/message' {
  interface MessageSourceMap {
    'forge-loop': ForgeLoopMessageSource
  }
}

/** forge 循环注入消息的 source kind（消费端 user/message 判据——'forge-loop' → 循环叙述卡） */
export const FORGE_LOOP_SOURCE_KIND = 'forge-loop'

/** 循环族别（现役唯一次发现 = 派发循环；字面量单源，未来循环族在此扩） */
export const FORGE_LOOP_KIND_DISPATCH = 'dispatch'

/** ContextForm notice 形态（官方 ContextFormed 单成员窄取——form='notice' 必带 summary） */
export type ForgeLoopContextForm = Extract<ContextFormed, { readonly form: 'notice' }>

/** forge 循环注入消息的 source 形状（MessageSourceMap['forge-loop'] 正本） */
export type ForgeLoopMessageSource = {
  readonly kind: 'forge-loop'
  /** 循环族别（'dispatch' = 派发循环） */
  readonly loopKind: string
  /** 注入时点铸发的唯一 run id（crypto.randomUUID——一次铸发一个，无共享） */
  readonly runId: string
  /** 叙述指向的任务键（循环级消息 = 任务源 slug；任务不可知 = 空串） */
  readonly task: string
  /** 注入时点的循环状态词（如 'followup' / 'dispatch' / 阻塞场景 id） */
  readonly state: string
} & ForgeLoopContextForm

/** 循环叙述的调用方已知上下文（可选——缺席字段落空串兜底，face 不强求调用方知情） */
export interface ForgeLoopNarrationMeta {
  /** 叙述指向的任务键 / 任务源 slug */
  readonly task?: string
  /** 循环状态词 */
  readonly state?: string
}

/** 铸发 forge-loop source（runId 铸发唯一；form='notice' + summary——ContextFormed notice 形态） */
export function forgeLoopSource(meta: ForgeLoopNarrationMeta & { summary: string }): ForgeLoopMessageSource {
  return {
    kind: FORGE_LOOP_SOURCE_KIND,
    loopKind: FORGE_LOOP_KIND_DISPATCH,
    runId: crypto.randomUUID(),
    task: meta.task ?? '',
    state: meta.state ?? 'followup',
    form: 'notice',
    summary: meta.summary,
  }
}
