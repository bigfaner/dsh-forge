// mobile-ui 1.1 回放 fixtures 形状单源（R12 重定义——mobile 消费面 = `__rpc` `forge:proxy/*`
// + forge-stream，不触 /api 官方面；tech-research R12 #1/#2）。JSONL 三文件：
//   · proxy-rpc.jsonl   —— POST /remote/__rpc 交换（{channel,payload} → RPC 信封）——mobile 唯一消费面
//   · api-ref.jsonl     —— 官方 /api typert 端点交换（client-request 信封）——协议形状参照（R12#4）
//   · forge-stream.jsonl —— SSE 逐帧（GET /remote/forge-stream 与 /api/session/stream 两源，
//                          snapshot/event 命名事件；url 字段区分来源）
// t 统一 = 距录制起点的 ms 偏移（epoch 由 WireRecorder 持有）——回放按此 timed 序列重放。

/** POST /remote/__rpc 端点（mobile 单呼通道） */
export const PROXY_RPC_PATH = '/remote/__rpc'

/** forge:proxy/* 通道集（R12 录制清单——端点名钉死单源） */
export const PROXY_CHANNELS = {
  sessionList: 'forge:proxy/session-list',
  sessionPage: 'forge:proxy/session-page',
  sessionPrompt: 'forge:proxy/session-prompt',
  sessionCancel: 'forge:proxy/session-cancel',
  sessionProjections: 'forge:proxy/session-projections',
  sessionModelCatalog: 'forge:proxy/session-model-catalog',
  sessionSelectModel: 'forge:proxy/session-select-model',
  sessionRename: 'forge:proxy/session-rename',
  sessionGrouped: 'forge:proxy/session-grouped',
  userQuestionsAnswer: 'forge:proxy/user-questions-answer',
  commandsList: 'forge:proxy/commands-list',
  commandsExecute: 'forge:proxy/commands-execute',
} as const

/** forge:remote/* 通道（forge 原生——录制清单含 approval/disconnect 两写动词） */
export const REMOTE_PROXY_CHANNELS = {
  progress: 'forge:remote/progress',
  approval: 'forge:remote/approval',
  disconnect: 'forge:remote/disconnect',
} as const

/** PSK 信封形态标记（tunnel-psk v3 §4——v/sid/epoch/iv/seq 信封头；明文 LAN 裸形态 = 'plain'） */
export type EnvelopeForm = 'plain' | 'psk'

/** 一次 RPC 交换（proxy 面 = {channel,payload}；api 参照面 = client-request 信封） */
export interface RpcRecord {
  readonly kind: 'proxy' | 'api-ref'
  /** 距录制起点的 ms 偏移 */
  readonly t: number
  /** HTTP 动词（录制面恒 POST） */
  readonly method: string
  /** 请求路径（/remote/__rpc | /api/<namespace>/<method>） */
  readonly url: string
  readonly status: number
  /** 信封形态（proxy 面专用——PSK v3 或 LAN 裸形态） */
  readonly envelope?: EnvelopeForm
  /** 请求体（proxy = {channel,payload}；api-ref = {type,rpcId,method,payload:{args}}） */
  readonly request: unknown
  /** 响应体（JSON 解析失败 = 原文 string） */
  readonly response: unknown
}

/** SSE 流开始行（响应头到达时刻 + 终态码） */
export interface SseStartRecord {
  readonly kind: 'sse-start'
  readonly t: number
  readonly url: string
  readonly status: number
}

/** 一帧命名事件（snapshot = 全量、event = 增量——官方流契约） */
export interface SseFrameRecord {
  readonly kind: 'sse-frame'
  readonly t: number
  readonly event: string
  readonly data: string
}

export type WireRecord = RpcRecord | SseStartRecord | SseFrameRecord

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** 单条已解析 SSE 事件块 */
export interface SseBlock {
  readonly event: string
  readonly data: string
}

/**
 * SSE 帧解析（增量安全）：输入累积 buffer，吐出全部完整块（\n\n|\r\n\r\n 分隔），
 * 返回剩余半截。行语法：`event: x` / `data: y`（多 data 行以 \n 连接）/ `:comment` 跳过 /
 * 其余忽略（retry 等官方心跳行不进帧）。
 */
export function parseSseBlocks(buffer: string): { blocks: SseBlock[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, '\n')
  const blocks: SseBlock[] = []
  let rest = normalized
  for (;;) {
    const end = rest.indexOf('\n\n')
    if (end === -1) break
    const raw = rest.slice(0, end)
    rest = rest.slice(end + 2)
    let event = 'message'
    const data: string[] = []
    for (const line of raw.split('\n')) {
      if (line === '' || line.startsWith(':')) continue
      const colon = line.indexOf(':')
      const field = colon === -1 ? line : line.slice(0, colon)
      let value = colon === -1 ? '' : line.slice(colon + 1)
      if (value.startsWith(' ')) value = value.slice(1)
      if (field === 'event') event = value
      else if (field === 'data') data.push(value)
    }
    if (data.length > 0) blocks.push({ event, data: data.join('\n') })
  }
  return { blocks, rest }
}

/** 追加一行 JSONL（录制面；逐行 flush——进程崩溃已写行不丢） */
export function appendRecordLine(file: string, record: WireRecord): void {
  mkdirSync(dirname(file), { recursive: true })
  appendFileSync(file, `${JSON.stringify(record)}\n`, 'utf8')
}

/** 读回 JSONL（回放面；坏行跳过不抛——录制中断半行不毒化回放） */
export function readRecordLines(file: string): WireRecord[] {
  if (!existsSync(file)) return []
  const out: WireRecord[] = []
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (line.trim() === '') continue
    try {
      out.push(JSON.parse(line) as WireRecord)
    } catch {
      // 坏行（录制中断半行）跳过
    }
  }
  return out
}
