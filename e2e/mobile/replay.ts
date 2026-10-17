// 回放器（1.1——后续 mobile e2e 一律 page.route 回放：/api/rpc 与 /remote/__rpc 按录制
// 交换原样 fulfill；SSE 起本地 timed 流服务按 fixture 的 t 序列重放，经 route.fulfill
// {response: APIResponse} 透传流式体——route.fulfill 直填 body 无分帧时序，AC 明确 timed）。
import { createServer, type Server } from 'node:http'
import type { Page, Route } from '@playwright/test'
import { readRecordLines, type RpcRecord, type SseFrameRecord, type SseStartRecord } from './wire.js'

export interface ReplaySse {
  readonly start: SseStartRecord
  readonly frames: readonly SseFrameRecord[]
}

/** 读 api 面 RPC 交换（按 kind 过滤；录制序保持） */
export function loadRpcEntries(dir: string, kind: 'rpc' | 'remote-rpc'): RpcRecord[] {
  const file = kind === 'rpc' ? `${dir}/api-rpc.jsonl` : `${dir}/remote-rpc.jsonl`
  return readRecordLines(file).filter((r): r is RpcRecord => r.kind === kind)
}

/** 读 SSE 流（start 行 + 帧序列；缺席 = undefined） */
export function loadSse(dir: string): ReplaySse | undefined {
  const lines = readRecordLines(`${dir}/sse-session-stream.jsonl`)
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
 * 全量回放装配：api/forge RPC 按请求体 method（api）/channel（forge）匹配录制条目、
 * 同名 FIFO 依次 fulfill（同方法多次调用按录制序重放；未录方法 = 404 JSON——缺口显性化，
 * 不静默空成功）；SSE route → 本地 timed 服务透传。CORS 头放开（回放页跨源取数冒烟）。
 */
export async function installReplay(page: Page, fixtureDir: string): Promise<void> {
  const apiEntries = loadRpcEntries(fixtureDir, 'rpc')
  const remoteEntries = loadRpcEntries(fixtureDir, 'remote-rpc')

  const serveRpc = (entries: RpcRecord[], keyOf: (request: unknown) => string) =>
    entries.reduce((table, entry) => {
      const key = keyOf(entry.request)
      ;(table[key] ??= []).push(entry)
      return table
    }, {} as Record<string, RpcRecord[]>)

  const apiTable = serveRpc(apiEntries, (request) => {
    const m = (request as { method?: unknown }).method
    return typeof m === 'string' ? m : '(none)'
  })
  const remoteTable = serveRpc(remoteEntries, (request) => {
    const c = (request as { channel?: unknown }).channel
    return typeof c === 'string' ? c : '(none)'
  })

  const rpcHandler = (table: Record<string, RpcRecord[]>) => async (route: Route) => {
    const raw = route.request().postData()
    let body: { method?: string; channel?: string } | null = null
    try {
      body = raw === null ? null : (JSON.parse(raw) as { method?: string; channel?: string })
    } catch {
      body = null
    }
    const key = typeof body?.method === 'string' ? body.method : typeof body?.channel === 'string' ? body.channel : '(none)'
    const queue = table[key]
    const entry = queue?.shift()
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

  await page.route('**/api/rpc', rpcHandler(apiTable))
  await page.route('**/remote/__rpc', rpcHandler(remoteTable))

  const sse = loadSse(fixtureDir)
  if (sse !== undefined && sse.frames.length > 0) {
    const port = await startTimedSseServer(sse)
    const replayUrl = `http://127.0.0.1:${port}/api/session/stream`
    await page.route('**/api/session/stream**', async (route) => {
      const response = await page.context().request.get(replayUrl)
      await route.fulfill({ response, headers: { 'access-control-allow-origin': '*' } })
    })
  }
}
