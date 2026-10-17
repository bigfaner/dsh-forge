// mobile-ui 1.1 回放 fixtures 形状单源（tech-design T3 录制回放——真实 host 响应钉进
// JSONL：method/url/事件序列；后续 mobile e2e 一律 page.route 回放，离线可重复）。
// 三类记录行：
//   · api-rpc.jsonl           —— POST /api/rpc 真实交换（{method,payload} → {ok,value|error}）
//   · remote-rpc.jsonl        —— POST /remote/__rpc 真实交换（{channel,payload} → RPC 信封）
//   · sse-session-stream.jsonl —— GET /api/session/stream 命名事件帧（snapshot/event，t = 毫秒偏移）
// t 统一 = 距录制起点的 ms 偏移（epoch 由 WireRecorder 持有）——回放按此 timed 序列重放。

/** 一次 JSON RPC 交换（api 面 = {method,payload}；forge 面 = {channel,payload}） */
export interface RpcRecord {
  readonly kind: 'rpc' | 'remote-rpc'
  /** 距录制起点的 ms 偏移 */
  readonly t: number
  /** HTTP 动词（录制面恒 POST） */
  readonly method: string
  /** 请求路径（/api/rpc | /remote/__rpc） */
  readonly url: string
  readonly status: number
  /** 请求体（api 面 {method,payload}；forge 面 {channel,payload}） */
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

/** 一帧命名事件（官方手机页 EventSource 契约：snapshot = 全量、event = 增量） */
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
