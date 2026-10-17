// 回放器纯 Node 面单测：timed SSE 服务按 fixture t 序列分帧 + JSONL 读取过滤
import { mkdtempSync } from 'node:fs'
import { get } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadRpcEntries, loadSse, startTimedSseServer, type ReplaySse } from './replay.js'
import { appendRecordLine } from './wire.js'

function httpGetBody(url: string): Promise<{ body: string; at: number[] }> {
  return new Promise((resolve, reject) => {
    const at: number[] = []
    let body = ''
    const t0 = Date.now()
    get(url, (res) => {
      res.on('data', (chunk: Buffer) => {
        at.push(Date.now() - t0)
        body += chunk.toString('utf8')
      })
      res.on('end', () => resolve({ body, at }))
    }).on('error', reject)
  })
}

describe('startTimedSseServer', () => {
  it('按 t 偏移分帧下发（命名事件原文重放 + 时序保持）', async () => {
    const sse: ReplaySse = {
      start: { kind: 'sse-start', t: 0, url: '/remote/forge-stream', status: 200 },
      frames: [
        { kind: 'sse-frame', t: 10, event: 'snapshot', data: '{"records":[]}' },
        { kind: 'sse-frame', t: 120, event: 'event', data: '{"event":{"type":"user/message"}}' },
      ],
    }
    const port = await startTimedSseServer(sse, 80)
    const { body, at } = await httpGetBody(`http://127.0.0.1:${port}/remote/forge-stream`)
    expect(body).toContain('event: snapshot\ndata: {"records":[]}\n\n')
    expect(body).toContain('event: event\ndata: {"event":{"type":"user/message"}}\n\n')
    expect(at.length).toBe(2)
    expect(at[1]! - at[0]!).toBeGreaterThanOrEqual(80) // 100ms 帧距 − 调度抖动余量
  })
})

describe('loadRpcEntries / loadSse', () => {
  it('按 kind 过滤录制行；SSE 读回 start+帧', () => {
    const dir = mkdtempSync(join(tmpdir(), 'replay-test-'))
    appendRecordLine(join(dir, 'proxy-rpc.jsonl'), { kind: 'proxy', t: 1, method: 'POST', url: '/remote/__rpc', status: 200, request: { channel: 'forge:proxy/session-list', payload: {} }, response: { ok: true, data: {} } })
    appendRecordLine(join(dir, 'api-ref.jsonl'), { kind: 'api-ref', t: 2, method: 'POST', url: '/api/session/list', status: 200, request: { type: 'client-request', rpcId: 'rec-1', method: 'session/list', payload: { args: { _request: {} } } }, response: { ok: true, value: { items: [] } } })
    appendRecordLine(join(dir, 'forge-stream.jsonl'), { kind: 'sse-start', t: 3, url: '/remote/forge-stream', status: 200 })
    appendRecordLine(join(dir, 'forge-stream.jsonl'), { kind: 'sse-frame', t: 40, event: 'snapshot', data: '{}' })

    expect(loadRpcEntries(dir, 'proxy')).toHaveLength(1)
    expect(loadRpcEntries(dir, 'proxy')[0]!.request).toEqual({ channel: 'forge:proxy/session-list', payload: {} })
    expect(loadRpcEntries(dir, 'api-ref')[0]!.request).toEqual({ type: 'client-request', rpcId: 'rec-1', method: 'session/list', payload: { args: { _request: {} } } })
    const sse = loadSse(dir)
    expect(sse?.start.status).toBe(200)
    expect(sse?.frames).toEqual([{ kind: 'sse-frame', t: 40, event: 'snapshot', data: '{}' }])
  })
})
