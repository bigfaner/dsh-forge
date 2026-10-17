// 录制器（1.1 R12 改形——mobile 消费面 = POST /remote/__rpc `forge:proxy/*` 通道 + forge-stream
// SSE；官方 /api typert 端点腿 = 协议形状参照（R12#4）。纯 Node 面（undici fetch + cookie 头直携，
// 不经浏览器）：录制目标 = wire 形状，不是页面行为——驱动序列由 record spec 编排。
// 消费面：e2e/fixtures/mobile/ 三 JSONL（形状契约见 wire.ts）。
// 信封形态：LAN 裸形态（cookie 旧门）全通道录制；PSK v3 形态按 tunnel-psk §4 信封头录代表通道
//（v/sid/epoch/iv/seq 头形钉死；宿主未布 PSK 时真实响应 = 旧门语义，错误形状同样是 wire 证据）。
import { appendRecordLine, parseSseBlocks, PROXY_RPC_PATH, type EnvelopeForm, type RpcRecord, type SseFrameRecord } from './wire.js'

/** 官方 /api typert HTTP 信封（client-request → {ok,value}|{ok:false,error} 族） */
export interface ApiEnvelope {
  readonly ok: boolean
  readonly value?: unknown
  readonly error?: unknown
}

/** forge 桥信封：POST /remote/__rpc {channel,payload} → {ok,data}|{ok,error:{...}} */
export interface RemoteEnvelope {
  readonly ok: boolean
  readonly data?: unknown
  readonly error?: unknown
}

export interface RecorderOptions {
  /** 基址（配对 origin——回环 authority，connection-probe 锚点同径） */
  readonly base: string
  /** cookie 头（配对链 jar 导出——dsh-auth-* 会话 cookie [+ dswf_forge_remote=1]） */
  readonly cookie: string
  /** fixtures 落盘目录（e2e/fixtures/mobile/） */
  readonly dir: string
}

export class WireRecorder {
  private readonly epoch = Date.now()
  private rpcSeq = 0

  constructor(private readonly opts: RecorderOptions) {}

  /** 距录制起点的 ms 偏移（全记录行 t 单源） */
  now(): number {
    return Date.now() - this.epoch
  }

  /** 调用并录制一次 /remote/__rpc 交换（mobile 唯一消费面） */
  async proxyRpc(channel: string, payload: unknown = {}, envelope: EnvelopeForm = 'plain'): Promise<RemoteEnvelope> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      cookie: this.opts.cookie,
    }
    if (envelope === 'psk') Object.assign(headers, pskEnvelopeHeaders())
    const res = await fetch(new URL(PROXY_RPC_PATH, this.opts.base), { method: 'POST', headers, body: JSON.stringify({ channel, payload }) })
    const text = await res.text()
    this.writeRpc({ kind: 'proxy', t: this.now(), method: 'POST', url: PROXY_RPC_PATH, status: res.status, envelope, request: { channel, payload }, response: parseMaybeJson(text) })
    return parseMaybeJson(text) as RemoteEnvelope
  }

  /**
   * 官方 /api typert 端点单呼（协议形状参照腿——R12#4 不作 mobile 消费面）：
   * POST /api/<endpoint>，body = client-request 信封 {type,rpcId,method,payload:{args}}。
   * args 按官方 strict descriptor 逐参给齐（session/list 需 reserved `_request`）。
   */
  async apiRpc(endpoint: string, args: unknown = {}): Promise<ApiEnvelope> {
    const url = `/api/${endpoint}`
    const body = { type: 'client-request', rpcId: `rec-${++this.rpcSeq}`, method: endpoint, payload: { args } }
    const res = await fetch(new URL(url, this.opts.base), {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: this.opts.cookie },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    this.writeRpc({ kind: 'api-ref', t: this.now(), method: 'POST', url, status: res.status, request: body, response: parseMaybeJson(text) })
    // wire 外层 = {type:'server-response',rpcId,result:{ok,value|error}}——录制原样，返回内层信封
    const wire = parseMaybeJson(text) as { result?: ApiEnvelope }
    return wire.result ?? (wire as unknown as ApiEnvelope)
  }

  /**
   * SSE 抓帧：GET <path>（命名事件 snapshot/event 逐帧——undici ReadableStream 增量喂
   * parseSseBlocks）。durationMs 后主动断流（录制窗）。返回抓到的帧序列。
   */
  async tapStream(path: string, durationMs: number): Promise<SseFrameRecord[]> {
    const res = await fetch(new URL(path, this.opts.base), {
      headers: { cookie: this.opts.cookie, accept: 'text/event-stream' },
    })
    appendRecordLine(this.streamFile, { kind: 'sse-start', t: this.now(), url: path, status: res.status })
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
        buffer += decoder.decode(chunk.value, { stream: true })
        const parsed = parseSseBlocks(buffer)
        buffer = parsed.rest
        for (const block of parsed.blocks) {
          const frame: SseFrameRecord = { kind: 'sse-frame', t: this.now(), event: block.event, data: block.data }
          frames.push(frame)
          appendRecordLine(this.streamFile, frame)
        }
      }
    } finally {
      await reader.cancel().catch(() => undefined)
    }
    return frames
  }

  /**
   * SSE 形状帧落盘（mux 转写通道）：帧数据来自官方 WS mux（/api/remote.mux——本宿主真身
   * 实时通道）的页内采集（Node 全局 WebSocket 无法携 cookie 头，admission 拒证 close(1006)
   * 实证——cookie/origin 由页面自携），Node 侧轮询取回后按 forge-stream 消费面形状转写
   * （首帧 = snapshot、后续 = event；数据真实、形状 = mobile 消费面契约）。
   */
  writeSseFrame(event: string, data: string): SseFrameRecord {
    const frame: SseFrameRecord = { kind: 'sse-frame', t: this.now(), event, data }
    appendRecordLine(this.streamFile, frame)
    return frame
  }

  /** proxy-rpc.jsonl 路径（mobile 消费面） */
  private get proxyFile(): string {
    return `${this.opts.dir}/proxy-rpc.jsonl`
  }

  /** api-ref.jsonl 路径（官方协议形状参照腿） */
  private get apiFile(): string {
    return `${this.opts.dir}/api-ref.jsonl`
  }

  /** forge-stream.jsonl 路径（SSE 帧——forge-stream 与 mux 转写帧混录，注释标注来源） */
  private get streamFile(): string {
    return `${this.opts.dir}/forge-stream.jsonl`
  }

  private writeRpc(record: RpcRecord): void {
    appendRecordLine(record.kind === 'proxy' ? this.proxyFile : this.apiFile, record)
  }
}

/**
 * tunnel-psk v3 信封头形（§4：v/sid/epoch/iv/seq——录制面用占位值钉形；密文体需真实 PSK
 * 材料，宿主未布 PSK 时该形态请求的真实响应（旧门语义）原样入 fixture——错误形状即证据。
 */
function pskEnvelopeHeaders(): Record<string, string> {
  const iv = Array.from({ length: 12 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('')
  return {
    'x-forge-psk-v': '3',
    'x-forge-psk-sid': 'record-probe-sid',
    'x-forge-psk-epoch': '0',
    'x-forge-psk-iv': iv,
    'x-forge-psk-seq': '0',
  }
}

/** 信封容错解析（非 JSON 响应原样——错误形状也是 wire 证据） */
function parseMaybeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/** cookie 头拼装（Playwright jar → Node fetch；record spec 经 cookies 导出） */
export function cookieHeaderOf(cookies: readonly { name: string; value: string }[]): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ')
}
