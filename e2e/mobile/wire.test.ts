// wire 形状单源单测（纯逻辑——parseSseBlocks 增量边界/命名事件/注释行 + JSONL 往返/坏行容错）
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { appendRecordLine, parseSseBlocks, readRecordLines, type RpcRecord, type SseFrameRecord } from './wire.js'

describe('parseSseBlocks', () => {
  it('完整块：命名事件 + 多 data 行拼接', () => {
    const { blocks, rest } = parseSseBlocks('event: snapshot\ndata: {"a":1}\n\nevent: event\ndata: {"b":\ndata:2}\n\n')
    expect(blocks).toEqual([
      { event: 'snapshot', data: '{"a":1}' },
      { event: 'event', data: '{"b":\n2}' },
    ])
    expect(rest).toBe('')
  })

  it('增量半块留在 rest（chunk 边界安全）', () => {
    const first = parseSseBlocks('event: snapshot\ndata: {"a"')
    expect(first.blocks).toEqual([])
    expect(first.rest).toBe('event: snapshot\ndata: {"a"')
    const second = parseSseBlocks(first.rest + ':1}\n\nevent: event\ndata: x\n\n')
    expect(second.blocks).toEqual([
      { event: 'snapshot', data: '{"a":1}' },
      { event: 'event', data: 'x' },
    ])
  })

  it('注释行与无 data 块跳过；缺 event 名 = message；CRLF 归一', () => {
    const { blocks } = parseSseBlocks(': heartbeat\r\n\r\nevent: event\r\ndata: y\r\n\r\ndata: z\r\n\r\n')
    expect(blocks).toEqual([
      { event: 'event', data: 'y' },
      { event: 'message', data: 'z' },
    ])
  })
})

describe('JSONL 往返', () => {
  it('append → read 原样往返（两类记录行混写）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wire-test-'))
    const file = join(dir, 'api-rpc.jsonl')
    const rpc: RpcRecord = { kind: 'rpc', t: 12, method: 'POST', url: '/api/rpc', status: 200, request: { method: 'session.list', payload: {} }, response: { ok: true, value: { items: [] } } }
    const frame: SseFrameRecord = { kind: 'sse-frame', t: 34, event: 'snapshot', data: '{"records":[]}' }
    appendRecordLine(file, rpc)
    appendRecordLine(file, frame)
    expect(readRecordLines(file)).toEqual([rpc, frame])
  })

  it('坏行（录制中断半行）跳过不抛；缺席文件 = 空数组', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wire-test-'))
    const file = join(dir, 'broken.jsonl')
    writeFileSync(file, '{"kind":"rpc","t":1}\n{"kind":"sse-fr', 'utf8')
    const rows = readRecordLines(file)
    expect(rows).toEqual([{ kind: 'rpc', t: 1 }])
    expect(readRecordLines(join(dir, 'absent.jsonl'))).toEqual([])
  })
})
