// workbench/indexer/source — 变更来源判定序(任务 2.5)。
//
// tech-design §Interface 3 判定序(只读消费,不写 forge 数据):
//   ① forge 记录中的 actor 标记 —— FORGE_ACTOR 透传(spike-1-findings §4:
//      可行但仅覆盖 submit 记录,且 forge 仓改造列为可选增强)。落点 =
//      记录 .md frontmatter 的 `actor:` 行,值形如 `session:<linkId>`。
//      该槽位在当前 forge 方言中恒空 —— 保留接口位,不视为异常。
//   ② 推断兜底(主路径):变更任务存在 status='active' 的挂接 → 'session',
//      否则 'terminal'。
//
// 挂接推断读取 session_links(BIZ-task-ops-001:看板仅呈现、不写回——本
// 模块对 forge 文件与挂接表均零写入)。挂接的 task_key 采用看板地址形态
// `<featureSlug>/<localId>`(见 scan.ts 方言适配说明)。

import type { ChangeSource } from '../repos/types.ts'

/**
 * 路径①:解析记录 .md frontmatter 的 actor 值(FORGE_ACTOR 透传槽)。
 * 已定义值域:`session:<linkId>`(前缀判定,linkId 不解码)与字面量
 * `terminal`;其余值不虚构归类,返回 null 落入路径②。
 */
export function resolveActorSource(actor: string | null | undefined): ChangeSource | null {
  if (typeof actor !== 'string' || actor.trim() === '') return null
  if (actor.startsWith('session:')) return 'session'
  if (actor.trim() === 'terminal') return 'terminal'
  return null
}

/** 路径②输入:该任务当前是否存在 status='active' 的挂接(只读查询产物)。 */
export interface SourceInferenceInput {
  /** 记录 .md 透传的 actor 原值;槽位为空时为 null。 */
  readonly actor: string | null
  /** session_links 中该任务是否存在 active 挂接。 */
  readonly hasActiveSessionLink: boolean
}

/**
 * Interface 3 判定序的纯函数形态:①actor 可辨 → 透传;②active 挂接 →
 * 'session';否则 'terminal'。三条路径由单测固定(AC3)。
 */
export function determineSource(input: SourceInferenceInput): ChangeSource {
  const actorSource = resolveActorSource(input.actor)
  if (actorSource !== null) return actorSource
  return input.hasActiveSessionLink ? 'session' : 'terminal'
}
