// 同文重复行折叠计数单测（AC6——供 renderer 转发面消费的机制就位）。
import { describe, expect, it } from 'vitest'
import { LineFolder, foldKeyOf, type FoldedLine } from './line-folder.js'
import type { DiagLine } from './appender.js'

function line(message: string, overrides: Partial<DiagLine> = {}): DiagLine {
  return { timestamp: '2026-10-19T04:20:31.123Z', level: 'warn', trace_id: '-', process: 'renderer', message, event: 'console', ...overrides }
}

function collect(): { out: FoldedLine[]; folder: LineFolder } {
  const out: FoldedLine[] = []
  return { out, folder: new LineFolder({ flush: (l) => out.push(l) }) }
}

describe('LineFolder（同文重复行折叠计数）', () => {
  it('连续同文行折叠为单行 + repeat 计数（= 重复次数）', () => {
    const { out, folder } = collect()
    for (let i = 0; i < 5; i++) folder.push(line('404 changes.summary'))
    folder.flush()
    expect(out).toHaveLength(1)
    expect(out[0]!.repeat).toBe(4)
    expect(out[0]!.message).toBe('404 changes.summary')
  })

  it('单行无 repeat 字段（缺席省略语义）', () => {
    const { out, folder } = collect()
    folder.push(line('once'))
    folder.flush()
    expect(out).toHaveLength(1)
    expect(out[0]!.repeat).toBeUndefined()
  })

  it('异文切换即收口上一组（计数不跨文累计）', () => {
    const { out, folder } = collect()
    folder.push(line('a'))
    folder.push(line('a'))
    folder.push(line('b'))
    folder.push(line('b'))
    folder.push(line('b'))
    folder.flush()
    expect(out.map((l) => [l.message, l.repeat])).toEqual([
      ['a', 1],
      ['b', 2],
    ])
  })

  it('时间窗越过即分次收口（timer-free——时钟注入判定）', () => {
    let now = 1_000
    const out: FoldedLine[] = []
    const folder = new LineFolder({ flush: (l) => out.push(l), now: () => now, windowMs: 60_000 })
    folder.push(line('x'))
    now += 61_000
    folder.push(line('x'))
    folder.flush()
    expect(out.map((l) => l.repeat)).toEqual([undefined, undefined])
  })

  it('折叠键不含 stack：同文异栈折叠计数', () => {
    expect(foldKeyOf(line('m', { stack: 'A' }))).toBe(foldKeyOf(line('m', { stack: 'B' })))
  })
})
