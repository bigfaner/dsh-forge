// worker-script 录制器扩展（worker-exec-evidence-replay/1.4——三源合并器扩展抓 assistant 回合）。
// dogfood 真跑会话转录（隔离 DSH_HOME sessions 树）→ worker 回放脚本：digest 键（首条
// user/message 全文 sha256 前 12——5.4 简报抽取同式）+ 有序 assistant 动作序列
// （tool/call → 工具动作；assistant/message text 块 → 文本回合）。形状与
// packages/plugin-forge/src/spawn/replay-driver.ts 的 ReplayScript 结构同源（类型双轨
// 独立——digest 独立实现同哲学，防单侧漂移静默通过）。fail-loud：工具 arguments 非 JSON
// 对象即抛（录制源不可带伤——与 dogfood-record 完整性门同哲学）。
import { createHash } from 'node:crypto'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { SessionEvent } from '../session-files.js'
import { bestSessionLog, decodeSessionFile } from '../session-files.js'

/** 录制的 assistant 工具调用（与 replay-driver.ReplayToolAction 结构同源） */
export interface RecordedToolAction {
  readonly kind: 'tool'
  readonly seq: number
  readonly name: string
  readonly args: Record<string, unknown>
}

/** 录制的 assistant 文本回合（与 replay-driver.ReplayTextAction 结构同源） */
export interface RecordedTextAction {
  readonly kind: 'text'
  readonly seq: number
  readonly text: string
}

export type RecordedAction = RecordedToolAction | RecordedTextAction

/** 一个 worker 会话的回放脚本（digest 键 = 首条 user/message 全文指纹） */
export interface RecordedScript {
  readonly digest: string
  readonly actions: readonly RecordedAction[]
}

/** sha-256(全文) 前 12 hex（5.4 digestOfText 同式独立实现） */
function digestOfText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 12)
}

/**
 * 会话事件流 → 回放脚本。digest 键 = 首条 user/message 全文指纹（非 worker 形态会话——
 * 无 user/message 或全文为空——返回 undefined）；assistant 回合按事件序入列：
 * tool/call（data.name + data.arguments JSON）→ 工具动作；assistant/message text 块
 * 拼接 → 文本回合。seq 取事件 seq（缺席按出现序递增补位——录制序即回放序）。
 * fail-loud：tool/call arguments 非 JSON 对象（转录不可带伤）。
 */
export function workerScriptOf(events: readonly SessionEvent[]): RecordedScript | undefined {
  let brief: string | undefined
  const actions: RecordedAction[] = []
  let fallbackSeq = 0
  for (const event of events) {
    const seq = typeof event.seq === 'number' ? event.seq : ++fallbackSeq
    if (brief === undefined && event.type === 'user/message') {
      const blocks =
        (event.data as { readonly content?: readonly { readonly type?: string; readonly text?: string }[] } | undefined)?.content ?? []
      const parts = blocks.filter((b) => b.type === 'text' && typeof b.text === 'string').map((b) => b.text as string)
      if (parts.length > 0) brief = parts.join('\n')
      continue
    }
    if (event.type === 'tool/call') {
      const name = event.data?.name ?? ''
      let args: unknown
      try {
        args = JSON.parse(event.data?.arguments ?? '')
      } catch {
        throw new Error(`[worker-script] tool/call arguments 非 JSON（digest 会话录制源带伤）：name=${name} raw=${(event.data?.arguments ?? '').slice(0, 60)}`)
      }
      if (typeof args !== 'object' || args === null || Array.isArray(args)) {
        throw new Error(`[worker-script] tool/call arguments 须为对象：name=${name}`)
      }
      actions.push({ kind: 'tool', seq, name, args: args as Record<string, unknown> })
    } else if (event.type === 'assistant/message') {
      const blocks = event.data?.message?.content ?? []
      const parts = blocks.filter((b) => b.type === 'text' && typeof b.text === 'string').map((b) => b.text as string)
      if (parts.length > 0) actions.push({ kind: 'text', seq, text: parts.join('\n') })
    }
  }
  if (brief === undefined || brief === '') return undefined
  return { digest: digestOfText(brief), actions }
}

/**
 * 隔离 DSH_HOME 会话树 → worker 回放脚本 Map（digest → script）。逐会话现行日志解码
 * （5.4 extractWorkerBriefTexts 同式遍历），worker 形态会话（首条 user/message 在场）
 * 逐个入键；同 digest 多会话后到覆盖（重跑同简报 = 取最后一次录制）。
 */
export function extractWorkerScripts(dshHome: string): Map<string, RecordedScript> {
  const out = new Map<string, RecordedScript>()
  const sessionsDir = join(dshHome, 'sessions')
  if (!existsSync(sessionsDir)) return out
  for (const wsDir of readdirSync(sessionsDir, { withFileTypes: true })) {
    if (!wsDir.isDirectory()) continue
    for (const sDir of readdirSync(join(sessionsDir, wsDir.name), { withFileTypes: true })) {
      if (!sDir.isDirectory()) continue
      const log = bestSessionLog(join(sessionsDir, wsDir.name, sDir.name))
      if (log === undefined) continue
      const script = workerScriptOf(decodeSessionFile(log))
      if (script !== undefined) out.set(script.digest, script)
    }
  }
  return out
}
