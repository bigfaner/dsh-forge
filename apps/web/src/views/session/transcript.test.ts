// views/session/transcript 单测 —— 转录视图模型与轨迹台账投影（S2 §2.2 ConversationNode 族消费切片）。
// 断言锚点 = 任务 2.11 AC-3（台账与转录数据一致：消息/工具调用交错时序）+ AC-2（恢复链路全量呈现）。
import { describe, expect, it } from 'vitest'
import { buildTrajectoryLedger, type TranscriptEntry, type TranscriptEntryKind } from './transcript.js'

const entry = (
  key: string,
  seq: number,
  kind: TranscriptEntryKind,
  extra: Partial<TranscriptEntry> = {},
): TranscriptEntry => ({ key, seq, kind, turn: 1, ...extra })

describe('buildTrajectoryLedger 投影（AC-3 台账与转录一致）', () => {
  it('时序唯一依据 = seq 升序：乱序输入按 seq 归位，消息/工具调用交错次序保持', () => {
    const rows = buildTrajectoryLedger([
      entry('r', 40, 'tool-result', { toolName: 'read' }),
      entry('a', 10, 'assistant-message', { text: '结论是…' }),
      entry('u', 1, 'user-message', { text: '查一下' }),
      entry('s', 20, 'tool-started', { toolName: 'read' }),
      entry('u2', 30, 'user-message', { text: '顺便看看' }),
      entry('run', 25, 'tool-running', { toolName: 'read' }),
    ])
    expect(rows.map((row) => row.key)).toEqual(['u', 'a', 's', 'run', 'u2', 'r'])
    expect(rows.map((row) => row.seq)).toEqual([1, 10, 20, 25, 30, 40])
  })

  it('同 seq 稳定（输入序即输出序——快照重放不重排）', () => {
    const rows = buildTrajectoryLedger([
      entry('late', 7, 'assistant-message', { text: '后到' }),
      entry('early', 7, 'user-message', { text: '先到' }),
    ])
    expect(rows.map((row) => row.key)).toEqual(['late', 'early'])
  })

  it('输入类 → 行类全表映射（消息侧别 / 工具相位 / 事件 / 错误）', () => {
    const rows = buildTrajectoryLedger([
      entry('k1', 1, 'user-message', { text: '提问' }),
      entry('k2', 2, 'command', { text: '/compact' }),
      entry('k3', 3, 'assistant-message', { text: '回答' }),
      entry('k4', 4, 'tool-started', { toolName: 'knowledge_search' }),
      entry('k5', 5, 'tool-running', { toolName: 'knowledge_search' }),
      entry('k6', 6, 'tool-result', { toolName: 'knowledge_search' }),
      entry('k7', 7, 'system', { text: '上下文已压缩' }),
      entry('k8', 8, 'turn-error', { text: '回合中止' }),
    ])
    expect(rows.map((row) => row.kind)).toEqual([
      'message', 'message', 'message', 'tool', 'tool', 'tool', 'event', 'error',
    ])
    expect(rows[0]).toMatchObject({ side: 'user', text: '提问' })
    expect(rows[1]).toMatchObject({ side: 'user', text: '/compact' })
    expect(rows[2]).toMatchObject({ side: 'assistant', text: '回答' })
    expect(rows[3]).toMatchObject({ phase: 'started', toolName: 'knowledge_search' })
    expect(rows[4]).toMatchObject({ phase: 'running', toolName: 'knowledge_search' })
    expect(rows[5]).toMatchObject({ phase: 'result', toolName: 'knowledge_search' })
    expect(rows[6]).toMatchObject({ text: '上下文已压缩' })
    expect(rows[7]).toMatchObject({ text: '回合中止' })
  })

  it('行字段透传：key/seq/turn 原样进入行（行键 = 转录锚键，渲染复用锚）', () => {
    const rows = buildTrajectoryLedger([entry('anchor-9', 9, 'tool-result', { toolName: 't', turn: 4 })])
    expect(rows[0]).toMatchObject({ key: 'anchor-9', seq: 9, turn: 4 })
  })

  it('text 缺席的消息/事件/错误行回退空串；toolName 缺省回退空名（渲染面不炸）', () => {
    const rows = buildTrajectoryLedger([
      entry('m', 1, 'assistant-message'),
      entry('t', 2, 'tool-result'),
      entry('e', 3, 'system'),
      entry('x', 4, 'turn-error'),
    ])
    expect(rows[0]).toMatchObject({ kind: 'message', text: '' })
    expect(rows[1]).toMatchObject({ kind: 'tool', toolName: '' })
    expect(rows[2]).toMatchObject({ kind: 'event', text: '' })
    expect(rows[3]).toMatchObject({ kind: 'error', text: '' })
  })

  it('零条目 → 零行（空台账空态由渲染面承载）；输入数组不被变异', () => {
    const input: readonly TranscriptEntry[] = [entry('z', 2, 'user-message', { text: 'b' }), entry('a', 1, 'user-message', { text: 'a' })]
    const snapshot = [...input]
    expect(buildTrajectoryLedger([])).toEqual([])
    const rows = buildTrajectoryLedger(input)
    expect(rows.map((row) => row.key)).toEqual(['a', 'z'])
    expect(input).toEqual(snapshot)
  })
})
