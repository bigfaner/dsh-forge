// 录制器（1.1——tech-design T3「首跑连真实 host，把 /api/rpc、/api/session/stream、
// /remote/__rpc 真实响应录成回放 fixtures」）。纯 Node 面（undici fetch + cookie 头直携，
// 不经浏览器）：录制目标 = wire 形状，不是页面行为——驱动序列由 record spec 编排。
// 消费面：e2e/fixtures/mobile/ 三 JSONL（形状契约见 wire.ts）。
import { appendRecordLine, parseSseBlocks, type RpcRecord, type SseFrameRecord } from './wire.js'

/** 官方手机页同款信封：POST /api/rpc {method,payload} → {ok, value|error} */
export interface ApiEnvelope {
  readonly ok: boolean
  readonly value?: unknown
  readonly error?: unknown
}

/** forge 桥信封：POST /remote/__rpc {channel,payload} → {ok,data}|{ok,error:{code,reason}} */
export interface RemoteEnvelope {
  readonly ok: boolean
  readonly data?: unknown
  readonly error?: { readonly code: string; readonly reason: string }
}

export interface RecorderOptions {
  /** 基址（webserver 同源——/api 与 /remote 同一 origin） */
  readonly base: string
  /** cookie 头（配对链 jar 导出——dsh-auth-* 会话 cookie + dswf_forge_remote=1） */
  readonly cookie: string
  /** fixtures 落盘目录（e2e/fixtures/mobile/） */
  readonly dir: string
}

export class WireRecorder {
  private readonly epoch = Date.now()

  constructor(private readonly opts: RecorderOptions) {}

  /** 距录制起点的 ms 偏移（全记录行 t 单源） */
  now(): number {
    return Date.now() - this.epoch
  }

  /** 调用并录制一次 /api/rpc 交换 */
  async apiRpc(method: string, payload: unknown = {}): Promise<ApiEnvelope> {
    const res = await fetch(new URL('/api/rpc', this.opts.base), {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: this.opts.cookie },
      body: JSON.stringify({ method, payload }),
    })
    const text = await res.text()
    this.writeRpc('rpc', '/api/rpc', { method, payload }, res.status, text)
    return JSON.parse(text) as ApiEnvelope
  }

  /** 调用并录制一次 /remote/__rpc 交换 */
  async remoteRpc(channel: string, payload: unknown = {}): Promise<RemoteEnvelope> {
    const res = await fetch(new URL('/remote/__rpc', this.opts.base), {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: this.opts.cookie },
      body: JSON.stringify({ channel, payload }),
    })
    const text = await res.text()
    this.writeRpc('remote-rpc', '/remote/__rpc', { channel, payload }, res.status, text)
    return JSON.parse(text) as RemoteEnvelope
  }

  /**
   * SSE 抓帧：GET /api/session/stream?sessionId=…（命名事件 snapshot/event 逐帧——
   * undici ReadableStream 增量喂 parseSseBlocks）。durationMs 后主动断流（录制窗）。
   * 返回抓到的帧序列（record.spec 落盘 + 断言消费双用）。
   */
  async tapSessionStream(sessionId: string, durationMs: number): Promise<SseFrameRecord[]> {
    const url = `/api/session/stream?sessionId=${encodeURIComponent(sessionId)}`
    const res = await fetch(new URL(url, this.opts.base), {
      headers: { cookie: this.opts.cookie, accept: 'text/event-stream' },
    })
    appendRecordLine(this.sseFile, {
      kind: 'sse-start',
      t: this.now(),
      url,
      status: res.status,
    })
    if (res.status !== 200 || res.body === null) return []
    const frames: SseFrameRecord[] = []
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const deadline = Date.now() + durationMs
    try {
      for (;;) {
        const remaining = deadline - Date.now()
        if (remaining <= 0) break
        const chunk = await Promise.race([
          reader.read(),
          new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), remaining)),
        ])
        if (chunk === 'timeout') break
        if (chunk.done) break
        const text = decoder.decode(chunk.value, { stream: true })
        buffer += text
        const parsed = parseSseBlocks(buffer)
        buffer = parsed.rest
        for (const block of parsed.blocks) {
          const frame: SseFrameRecord = { kind: 'sse-frame', t: this.now(), event: block.event, data: block.data }
          frames.push(frame)
          appendRecordLine(this.sseFile, frame)
        }
      }
    } finally {
      await reader.cancel().catch(() => undefined)
    }
    return frames
  }

  /** rpc.jsonl 路径（api 面） */
  private get rpcFile(): string {
    return `${this.opts.dir}/api-rpc.jsonl`
  }

  /** remote-rpc.jsonl 路径（forge 面） */
  private get remoteFile(): string {
    return `${this.opts.dir}/remote-rpc.jsonl`
  }

  /** sse-session-stream.jsonl 路径（SSE 帧） */
  private get sseFile(): string {
    return `${this.opts.dir}/sse-session-stream.jsonl`
  }

  /** 信封容错解析（非 JSON 响应原样入 fixture——错误形状也是 wire 证据） */
  private writeRpc(kind: RpcRecord['kind'], url: string, request: unknown, status: number, text: string): void {
    let response: unknown = text
    try {
      response = JSON.parse(text)
    } catch {
      // 非 JSON 原文保留
    }
    appendRecordLine(kind === 'rpc' ? this.rpcFile : this.remoteFile, {
      kind,
      t: this.now(),
      method: 'POST',
      url,
      status,
      request,
      response,
    })
  }
}

/** cookie 头拼装（Playwright jar → Node fetch；record spec 经 context.cookies() 导出） */
export function cookieHeaderOf(cookies: readonly { name: string; value: string }[]): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ')
}
