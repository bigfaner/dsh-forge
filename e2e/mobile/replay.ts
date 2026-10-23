// 回放器（1.1 R12——后续 mobile e2e 一律 page.route 回放：/remote/__rpc proxy 通道与 /api
// 参照腿按录制交换原样 fulfill；SSE 起本地 timed 流服务按 fixture 的 t 序列重放，经 route.fulfill
// {response: APIResponse} 透传流式体——route.fulfill 直填 body 无分帧时序，AC 明确 timed）。
import { createServer, type Server } from 'node:http'
import type { Page, Route } from '@playwright/test'
import { readRecordLines, type RpcRecord, type SseFrameRecord, type SseStartRecord } from './wire.js'

export interface ReplaySse {
  readonly start: SseStartRecord
  readonly frames: readonly SseFrameRecord[]
}

/** 读 RPC 交换（kind = proxy（mobile 消费面）| api-ref（官方参照腿）；录制序保持） */
export function loadRpcEntries(dir: string, kind: RpcRecord['kind']): RpcRecord[] {
  const file = kind === 'proxy' ? `${dir}/proxy-rpc.jsonl` : `${dir}/api-ref.jsonl`
  return readRecordLines(file).filter((r): r is RpcRecord => r.kind === kind)
}

/** 读 SSE 流（start 行 + 帧序列；缺席 = undefined） */
export function loadSse(dir: string): ReplaySse | undefined {
  const lines = readRecordLines(`${dir}/forge-stream.jsonl`)
  const start = lines.find((r): r is SseStartRecord => r.kind === 'sse-start')
  if (start === undefined) return undefined
  return { start, frames: lines.filter((r): r is SseFrameRecord => r.kind === 'sse-frame') }
}

/**
 * 本地 timed SSE 服务：按 `t - 基准偏移` 逐帧下发（event:/data: 原文重放），末帧后短暂
 * 挂住再关连接（EventSource 原生重连语义不受扰）。返回 port 供 route 透传。
 */
export function startTimedSseServer(sse: ReplaySse, holdMs = 500): Promise<number> {
  return new Promise((resolve, reject) => {
    const base = sse.frames[0]?.t ?? sse.start.t
    const timers: NodeJS.Timeout[] = []
    const server: Server = createServer((req, res) => {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
        'access-control-allow-origin': '*',
      })
      for (const frame of sse.frames) {
        timers.push(
          setTimeout(() => {
            res.write(`event: ${frame.event}\ndata: ${frame.data}\n\n`)
          }, Math.max(0, frame.t - base)),
        )
      }
      timers.push(
        setTimeout(() => {
          res.end()
        }, Math.max(0, (sse.frames[sse.frames.length - 1]?.t ?? 0) - base) + holdMs),
      )
      req.on('close', () => timers.forEach(clearTimeout))
    })
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (addr === null || typeof addr === 'string') reject(new Error('timed sse server: no port'))
      else resolve(addr.port)
    })
  })
}

/**
 * 全量回放装配：proxy 面按请求体 channel、api 参照腿按请求体 method 匹配录制条目、同名 FIFO
 * 依次 fulfill（未录方法/通道 = 404 JSON——缺口显性化，不静默空成功）；SSE route → 本地
 * timed 服务透传（forge-stream 与 session/stream 两 URL 同源帧序列）。CORS 头放开。
 */
export async function installReplay(page: Page, fixtureDir: string): Promise<void> {
  const proxyEntries = loadRpcEntries(fixtureDir, 'proxy')
  const apiEntries = loadRpcEntries(fixtureDir, 'api-ref')

  const serveRpc = (entries: RpcRecord[], keyOf: (request: unknown) => string) =>
    entries.reduce((table, entry) => {
      const key = keyOf(entry.request)
      ;(table[key] ??= []).push(entry)
      return table
    }, {} as Record<string, RpcRecord[]>)

  const proxyTable = serveRpc(proxyEntries, (request) => {
    const c = (request as { channel?: unknown }).channel
    return typeof c === 'string' ? c : '(none)'
  })
  const apiTable = serveRpc(apiEntries, (request) => {
    const m = (request as { method?: unknown }).method
    return typeof m === 'string' ? m : '(none)'
  })

  const rpcHandler = (table: Record<string, RpcRecord[]>, keyField: 'channel' | 'method') => async (route: Route) => {
    const raw = route.request().postData()
    let key = '(none)'
    if (raw !== null) {
      try {
        const body = JSON.parse(raw) as Record<string, unknown>
        if (typeof body[keyField] === 'string') key = body[keyField] as string
      } catch {
        key = '(none)'
      }
    }
    const entry = table[key]?.shift()
    if (entry === undefined) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ ok: false, error: `replay: no fixture for ${key}` }),
      })
      return
    }
    await route.fulfill({
      status: entry.status,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: typeof entry.response === 'string' ? entry.response : JSON.stringify(entry.response),
    })
  }

  await page.route('**/remote/__rpc', rpcHandler(proxyTable, 'channel'))
  await page.route('**/api/**', (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    return rpcHandler(apiTable, 'method')(route)
  })

  const sse = loadSse(fixtureDir)
  if (sse !== undefined && sse.frames.length > 0) {
    const port = await startTimedSseServer(sse)
    const replayUrl = `http://127.0.0.1:${port}${sse.start.url}`
    await page.route('**/remote/forge-stream**', (route) => replaySse(page, replayUrl, route))
    await page.route('**/api/session/stream**', (route) => replaySse(page, replayUrl, route))
  }
}

async function replaySse(page: Page, replayUrl: string, route: Route): Promise<void> {
  const response = await page.context().request.get(replayUrl)
  // headers 显式全覆盖（fulfill 传 headers 时覆盖 response 头——content-type 缺失会被
  // EventSource 以 MIME 不是 text/event-stream 拒连，实测取证）
  await route.fulfill({
    response,
    headers: { 'access-control-allow-origin': '*', 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
  })
}
