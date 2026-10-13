// worker-exec-evidence-replay/1.4 单测 —— worker-script 录制器扩展：dogfood 会话转录抓
// assistant 回合（digest 键 + 有序动作序列）。覆盖：正常抓取（tool/call + assistant/message
// 按事件序）/ digest 键 = 首条 user/message 指纹 / 非 worker 会话 undefined /
// arguments 带伤 fail-loud / extractWorkerScripts 会话树遍历（zstd 夹具往返）。
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdCompressSync } from 'node:zlib'
import { afterAll, describe, expect, it } from 'vitest'
import type { SessionEvent } from '../session-files.js'
import { extractWorkerScripts, workerScriptOf } from './worker-script.js'

const BRIEF = 'worker 简报全文（digest 键源）'
function digestOf(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 12)
}

function userMessage(text: string, seq: number): SessionEvent {
  return { type: 'user/message', seq, data: { content: [{ type: 'text', text }] } } as SessionEvent
}

describe('workerScriptOf：assistant 回合抓取（三源合并器扩展）', () => {
  it('tool/call → 工具动作、assistant/message → 文本回合，按事件序；digest = 首条 user/message 指纹', () => {
    const events: SessionEvent[] = [
      { type: 'system/message', seq: 1, data: { message: { content: [{ type: 'text', text: 'system prompt' }] } } },
      userMessage(BRIEF, 2),
      { type: 'assistant/message', seq: 3, data: { message: { content: [{ type: 'text', text: '我先加任务' }] } } },
      { type: 'tool/call', seq: 4, data: { name: 'forgeTasks', arguments: JSON.stringify({ op: 'addTask', title: 'x' }) } },
      { type: 'tool/result', seq: 5, data: {} },
      { type: 'tool/call', seq: 6, data: { name: 'forgeTasks', arguments: '{"op":"submitTask"}' } },
      { type: 'assistant/message', seq: 7, data: { message: { content: [{ type: 'text', text: 'done' }] } } },
    ]
    const script = workerScriptOf(events)
    expect(script?.digest).toBe(digestOf(BRIEF))
    expect(script?.actions).toEqual([
      { kind: 'text', seq: 3, text: '我先加任务' },
      { kind: 'tool', seq: 4, name: 'forgeTasks', args: { op: 'addTask', title: 'x' } },
      { kind: 'tool', seq: 6, name: 'forgeTasks', args: { op: 'submitTask' } },
      { kind: 'text', seq: 7, text: 'done' },
    ])
  })

  it('多 text 块拼接为单文本回合；seq 缺席按出现序补位；后续 user/message 不改键', () => {
    const events: SessionEvent[] = [
      userMessage(BRIEF, 1),
      { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] } } } as SessionEvent,
      userMessage('工具结果转记面', 3),
      { type: 'assistant/message', seq: 4, data: { message: { content: [{ type: 'text', text: 'c' }] } } },
    ]
    const script = workerScriptOf(events)
    expect(script?.digest).toBe(digestOf(BRIEF))
    expect(script?.actions).toEqual([
      { kind: 'text', seq: 1, text: 'a\nb' },
      { kind: 'text', seq: 4, text: 'c' },
    ])
  })

  it('非 worker 会话（无 user/message）→ undefined；纯 user 无动作 → 空动作序列脚本', () => {
    expect(workerScriptOf([{ type: 'system/message', seq: 1, data: {} } as SessionEvent])).toBeUndefined()
    const empty = workerScriptOf([userMessage(BRIEF, 1)])
    expect(empty).toEqual({ digest: digestOf(BRIEF), actions: [] })
  })

  it('fail-loud：tool/call arguments 非 JSON / 非对象 → 抛错（录制源不可带伤）', () => {
    const base: SessionEvent[] = [userMessage(BRIEF, 1)]
    expect(() =>
      workerScriptOf([...base, { type: 'tool/call', seq: 2, data: { name: 'forgeTasks', arguments: 'not-json{' } }]),
    ).toThrowError(/\[worker-script\] tool\/call arguments 非 JSON/)
    expect(() =>
      workerScriptOf([...base, { type: 'tool/call', seq: 2, data: { name: 'forgeTasks', arguments: '[1,2]' } }]),
    ).toThrowError(/arguments 须为对象/)
  })
})

describe('extractWorkerScripts：会话树遍历（zstd 转录往返）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-worker-script-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  function writeSession(ws: string, id: string, events: readonly SessionEvent[]): void {
    const d = join(dir, 'sessions', ws, id)
    mkdirSync(d, { recursive: true })
    writeFileSync(join(d, 'session.jsonl.zstd'), zstdCompressSync(Buffer.from(events.map((e) => JSON.stringify(e)).join('\n'), 'utf8')))
  }

  it('worker 会话逐个入键（digest 键）；dispatcher 会话（简报非首条形态）自然排除', () => {
    writeSession('ws-a', 'session-worker-1', [
      userMessage(BRIEF, 1),
      { type: 'tool/call', seq: 2, data: { name: 'forgeTasks', arguments: '{}' } },
    ])
    writeSession('ws-b', 'session-worker-2', [userMessage('另一简报', 1), { type: 'assistant/message', seq: 2, data: { message: { content: [{ type: 'text', text: 'ok' }] } } }])
    const scripts = extractWorkerScripts(dir)
    expect(scripts.size).toBe(2)
    expect(scripts.get(digestOf(BRIEF))?.actions).toEqual([{ kind: 'tool', seq: 2, name: 'forgeTasks', args: {} }])
    expect(scripts.get(digestOf('另一简报'))?.actions).toEqual([{ kind: 'text', seq: 2, text: 'ok' }])
  })

  it('无 sessions 树 → 空 Map（不抛）', () => {
    expect(extractWorkerScripts(join(dir, 'absent'))).toEqual(new Map())
  })
})
