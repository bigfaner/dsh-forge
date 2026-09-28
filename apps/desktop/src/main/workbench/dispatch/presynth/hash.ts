// workbench/dispatch/presynth/hash — prompt_hash 口径 + 注入 oracle(任务 3.4)。
//
// 口径权威 = spike-3 §4(定形):
//   - hash 对象 = **组合首条消息全文** = `预合成内容原文 + "\n\n" + 追加行`(即经
//     channel.prompt 交付的 content[0].text 字符串本身),不是 systemPrompt;
//   - 算法 = sha256(utf-8 bytes) hex 小写(与 M2 e2e step-4 spec 同式);
//   - 落库时机 = dispatch 行创建时一次定型:内核预铸 sessionId(caller-minted,
//     create({sessionId}) 幂等 adopt)→ 组合消息确定 → prompt_hash 随行落库 →
//     dispatch-launch(3.5)以同 sessionId 走 create/prompt —— hash 与 launch
//     解耦,重派发不因会话重建漂移。
//
// oracle 形态(M2 e2e channel stub journal 逐字符比对的接口预留,SC3 断言
// 锚点):内核侧三查 —— ① sha256(journal.text) === dispatch.prompt_hash;
// ② journal.text 以预合成内容逐字节开头(原文不改写);③ 追加行恰好两行 +
// 逐行前缀对拍(Interface 7 两行化口径,任务 2.8:第一行 ATTRIBUTION_MARKER
// 前缀、第二行 NAMING_MARKER 前缀、无第三行)。第四件(requestId 确定性 =
// deriveLaunchRequestId(sessionId, message))属 host 侧派生,由 3.5
// dispatch-launch / e2e 层消费,不在内核重复实现。

import { createHash } from 'node:crypto'
import { NAMING_MARKER } from './templates.ts'

/** 注入内容 sha256(组合首条消息全文;spike③ 口径,hex 小写)。 */
export function promptHashOf(combinedMessage: string): string {
  return createHash('sha256').update(combinedMessage, 'utf8').digest('hex')
}

/** 归因行(追加第一行)的稳定标记前缀(逐行前缀对拍锚点;M2 oracle 同款用法)。 */
export const ATTRIBUTION_MARKER = '[dsh-forge workbench] Attribution:'

/** oracle 失败码(逐字符比对四件套的内核侧三查)。 */
export type InjectionOracleFailure =
  | 'hash-mismatch' // ① sha256(journal.text) ≠ prompt_hash
  | 'prefix-rewritten' // ② journal.text 不以预合成内容逐字节开头
  | 'appendix-not-two-lines' // ③ 追加行非「恰好两行 + 逐行前缀对拍」形态

/** oracle 入参(journal text 来自 M2 同型 channel stub journal 的 prompt 行 text 字段)。 */
export interface InjectionOracleInput {
  /** 通道 journal 记录的注入消息全文。 */
  readonly journalText: string
  /** 预合成内容原文(组合消息的前缀部分)。 */
  readonly presynthContent: string
  /** dispatch 行 prompt_hash(断言锚点)。 */
  readonly promptHash: string
}

/** oracle 结果:ok 或逐项失败码集合(全部检查执行后汇总,不短路)。 */
export type InjectionOracleResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly failures: readonly InjectionOracleFailure[] }

/**
 * M2 e2e 逐字符比对形态的内核侧 oracle(接口预留,3.5/e2e 消费):给定通道
 * journal 记录的注入消息全文,对照预合成内容原文与 dispatch 行 hash 执行
 * 三查。任何一项不满足 → failures 携带全部失败码。
 *
 * ③ 两行纪律:journalText 剥离预合成前缀后须为 "\n\n" + 归因行 + "\n" +
 * 命名行(恰好两行;第一行 ATTRIBUTION_MARKER 前缀、第二行 NAMING_MARKER
 * 前缀;标题/任务键在行内自由,前缀外不比对)。
 */
export function checkInjectionOracle(input: InjectionOracleInput): InjectionOracleResult {
  const failures: InjectionOracleFailure[] = []
  if (promptHashOf(input.journalText) !== input.promptHash) failures.push('hash-mismatch')
  if (!input.journalText.startsWith(input.presynthContent)) failures.push('prefix-rewritten')
  const appendix = input.journalText.slice(input.presynthContent.length)
  const lines = appendix.startsWith('\n\n') ? appendix.slice(2).split('\n') : appendix.split('\n')
  const twoLineShape = lines.length === 2
    && (lines[0] ?? '').startsWith(ATTRIBUTION_MARKER)
    && (lines[1] ?? '').startsWith(NAMING_MARKER)
  if (!twoLineShape) failures.push('appendix-not-two-lines')
  return failures.length === 0 ? { ok: true } : { ok: false, failures }
}
