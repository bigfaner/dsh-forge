import { describe, expect, it } from 'vitest'
import type { SessionEventLikeEntry } from '@deepseek-ai/dsh-api-session-controller/client'
import {
  clampLastReadSeq,
  createAttemptSettler,
  createSeqGate,
  latestTodosOf,
  todoProgressLabel,
  mergeBySeq,
  projectEvent,
  projectHistory,
  visibleCount,
  type Projection,
} from './wire.ts'
import { DURABLE_SAMPLES, ev, OFFICIAL_SESSION_EVENT_TYPES, liveChunk, USER_MESSAGE_SAMPLE } from './wire.fixtures.ts'

// ---------------------------------------------------------------------------
// 37 类持久事件样本：逐类型处置表（AD-4 白名单五档）
// ---------------------------------------------------------------------------

const EXPECTED_KIND: Record<string, string | null> = {
  // E 忽略
  'permission/preset': null,
  'sandbox/mode': null,
  'approval/policy': null,
  'agent-preset/selected': null,
  'agent/inbox/spliced': null,
  'turn/start': null,
  'turn/end': null,
  'step/start': null,
  'step/end': null,
  'system/message': null,
  'request/header': null,
  'request/context': null,
  'session/title-llm-request': null,
  'workspace/changes': null,
  'web/deepseek-search-llm-request': null,
  'session/end-seed': null,
  'llm/retry': null,
  'llm/retry-started': null,
  'compaction/start': null,
  'compaction/end': null,
  'compaction/prune': null,
  'subagent/catalog': null,
  'model/selection': null,
  'command/done': null,
  // A 消息流
  'user/message': 'user-bubble',
  'assistant/message': 'assistant-message',
  'tool/call': 'tool-call',
  'tool/result': 'tool-result',
  // B 系统层轻投影
  'forge/progress': 'loop-progress',
  'session/title': null, // 标题只在顶栏（deriveTitle）——正文零渲染
  'compaction/summary': 'compaction-summary-line',
  'command/run': 'command-chip',
  'deliverables/presented': 'deliverables-card',
  'plan/mode': 'plan-mode-chip',
  // C 只读审批
  'approval/asked': 'approval-card',
  'approval/decided': 'approval-card',
  // D 特判
  'assistant/attempt': null,
}

describe('wire 投影：37 类持久事件样本', () => {
  it('样本数 = 37（无遗漏类型）', () => {
    expect(DURABLE_SAMPLES.length).toBe(37)
    expect(new Set(DURABLE_SAMPLES.map((e) => e.type)).size).toBe(37)
    expect(new Set(Object.keys(EXPECTED_KIND))).toEqual(new Set(DURABLE_SAMPLES.map((e) => e.type)))
  })

  for (const event of DURABLE_SAMPLES) {
    it(`${event.type} → ${EXPECTED_KIND[event.type] ?? 'null'}`, () => {
      const projection = projectEvent(event)
      expect(projection === null).toBe(EXPECTED_KIND[event.type] === null)
      if (EXPECTED_KIND[event.type] !== null) expect(projection).toMatchObject({ kind: EXPECTED_KIND[event.type] })
    })
  }

  it('投影字段保真：user-bubble 携带 text 与 rpcId', () => {
    expect(projectEvent(USER_MESSAGE_SAMPLE)).toMatchObject({
      kind: 'user-bubble',
      rpcId: '375df8f8',
      text: expect.stringContaining('/brainstorm'),
    })
  })

  it('assistant-message 携带 reasoning + toolCalls', () => {
    const card = projectEvent(DURABLE_SAMPLES.find((e) => e.type === 'assistant/message')!)
    expect(card).toMatchObject({
      kind: 'assistant-message',
      reasoning: expect.stringContaining('深度探索'),
      toolCalls: [{ id: 'call_a4e818eb', name: 'read' }],
    })
  })

  it('surfaceOp 不作为投影判据：无 surfaceOp 的 user/message 仍投影', () => {
    const bare = ev('user/message', 99, USER_MESSAGE_SAMPLE.data)
    expect(projectEvent(bare)).toMatchObject({ kind: 'user-bubble' })
  })

  it('user/message source.kind 分派：user → 蓝气泡 / forge-loop → 叙述卡 / model-selection → chip / 未知 → 中性系统行', () => {
    const data = USER_MESSAGE_SAMPLE.data as { content: unknown; source: { kind: string } }
    const forgeLoop = ev('user/message', 30, {
      ...data,
      source: { kind: 'forge-loop', runId: 'run-1', state: 'followup' },
    })
    expect(projectEvent(forgeLoop)).toMatchObject({
      kind: 'loop-narrative',
      runId: 'run-1',
      state: 'followup',
    })
    const modelSelection = ev('user/message', 31, { ...data, source: { kind: 'model-selection' } })
    expect(projectEvent(modelSelection)).toMatchObject({ kind: 'model-selection-chip' })
    const unknownKind = ev('user/message', 32, { ...data, source: { kind: 'mystery' } })
    expect(projectEvent(unknownKind)).toMatchObject({ kind: 'neutral-line' })
  })

  it('bug f796e254：harness 机械注入（runtime-context / skill-catalog）零渲染——真机取证 kind 实值', () => {
    // 真机形（session-6c491ef3 session-history 取证）：kind=form 快照/目录 + 长文本
    const runtimeContext = ev('user/message', 9, {
      content: [{ type: 'text', text: 'Current runtime context. This snapshot supersedes…' }],
      source: { kind: 'runtime-context', form: 'snapshot', sections: [] },
    })
    expect(projectEvent(runtimeContext)).toBeNull()
    const skillCatalog = ev('user/message', 10, {
      content: [{ type: 'text', text: '<system-reminder>\nA skill is a reusable…' }],
      source: { kind: 'skill-catalog', form: 'catalog', entries: [] },
    })
    expect(projectEvent(skillCatalog)).toBeNull()
  })

  it('bug f796e254：未知 kind 有文本 = 文本预览中性行（不再裸渲 type 名）；无文本回退 type 名', () => {
    const unknownWithText = ev('user/message', 32, {
      content: [{ type: 'text', text: '一段生产者注入文本' }],
      source: { kind: 'mystery' },
    })
    expect(projectEvent(unknownWithText)).toMatchObject({ kind: 'neutral-line', type: '一段生产者注入文本' })
    const unknownNoText = ev('user/message', 33, { content: [], source: { kind: 'mystery' } })
    expect(projectEvent(unknownNoText)).toMatchObject({ kind: 'neutral-line', type: 'user/message' })
  })

  it('bug f796e254：model-selection 官方 notice summary 优先（真机形 summary="旧 → 新"）', () => {
    const notice = ev('user/message', 96, {
      content: [{ type: 'text', text: '[model changed: …]' }],
      source: { kind: 'model-selection', form: 'notice', summary: 'glm-5.3-flash → glm-5.3' },
    })
    expect(projectEvent(notice)).toMatchObject({ kind: 'model-selection-chip', model: 'glm-5.3-flash → glm-5.3' })
  })

  it('forge-loop source 字段缺席 = runId/state 空串兜底（face 不强求调用方知情）', () => {
    const data = USER_MESSAGE_SAMPLE.data as { content: unknown; source: { kind: string } }
    const bare = ev('user/message', 33, { ...data, source: { kind: 'forge-loop' } })
    expect(projectEvent(bare)).toMatchObject({ kind: 'loop-narrative', runId: '', state: '' })
  })

  it('deliverables/presented size 元数据透传（缺席 = 无 size 键）', () => {
    const withSize = ev('deliverables/presented', 60, {
      files: [{ path: 'a.md', size: 6349 }, { path: 'b.txt' }],
    })
    const card = projectEvent(withSize)
    expect(card).toMatchObject({
      kind: 'deliverables-card',
      files: [{ path: 'a.md', size: 6349 }, { path: 'b.txt' }],
    })
  })

  it('assistant/message interrupted 前缀保留中断标记', () => {
    const interrupted = ev('assistant/message', 40, {
      turn: 1,
      step: 2,
      message: { role: 'assistant', content: [{ type: 'text', text: '部分前缀' }] },
      interrupted: true,
    })
    expect(projectEvent(interrupted)).toMatchObject({ kind: 'assistant-message', interrupted: true, text: '部分前缀' })
  })

  it('非 ignorable 未知类型 → error-card（不静默吞）；ignorable → 跳过', () => {
    expect(projectEvent(ev('brand/new-thing', 50, {}))).toMatchObject({ kind: 'error-card', type: 'brand/new-thing' })
    expect(projectEvent(ev('brand/new-skip', 51, {}, { ignorable: true }))).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 成对纪律：command run/done、approval asked/decided
// ---------------------------------------------------------------------------

describe('成对纪律', () => {
  it('command/done 并入同名 commandId 的 command-chip', () => {
    const cards = projectHistory([
      ev('command/run', 100, { commandId: 'cmd-1', name: 'compact', args: '' }),
      ev('command/done', 101, { commandId: 'cmd-1', kind: 'success', text: 'done!' }),
    ])
    expect(cards).toEqual([
      expect.objectContaining({ kind: 'command-chip', commandId: 'cmd-1', done: { kind: 'success', text: 'done!' } }),
    ])
  })

  it('终态缺失：开始态保持可收起 chip（无悬挂常驻）', () => {
    const cards = projectHistory([ev('command/run', 100, { commandId: 'cmd-1', name: 'compact', args: '' })])
    expect(cards[0]).not.toHaveProperty('done')
  })

  it('approval/decided 更新 asked 卡（成对）', () => {
    const cards = projectHistory([
      ev('approval/asked', 200, { id: 'ap-1', toolName: 'pwsh' }),
      ev('approval/decided', 201, { id: 'ap-1', outcome: 'allowed-once' }),
    ])
    expect(cards).toEqual([expect.objectContaining({ kind: 'approval-card', phase: 'decided', outcome: 'allowed-once' })])
  })
})

// ---------------------------------------------------------------------------
// 瞬态判别集（录制形状 = 官方类型单源）：per-attemptId 结算状态机
// ---------------------------------------------------------------------------

describe('per-attemptId 结算状态机', () => {
  it('Idle→Streaming：live-chunk 开新子状态机并累计 text/reasoning delta', () => {
    const settler = createAttemptSettler()
    settler.chunk(liveChunk(60, 'att-1', { type: 'block-start', index: 0, blockType: 'reasoning' }))
    settler.chunk(liveChunk(61, 'att-1', { type: 'reasoning-delta', index: 0, text: '思考' }))
    settler.chunk(liveChunk(62, 'att-1', { type: 'block-start', index: 1, blockType: 'text' }))
    settler.chunk(liveChunk(63, 'att-1', { type: 'text-delta', index: 1, text: '回答' }))
    expect(settler.rows()).toEqual([
      { attemptId: 'att-1', text: '回答', reasoning: '思考', state: 'streaming', lastSeq: 63 },
    ])
  })

  it('同 attempt 重复 chunk（seq 单调去重）不重复追加', () => {
    const settler = createAttemptSettler()
    settler.chunk(liveChunk(70, 'att-1', { type: 'text-delta', index: 0, text: 'a' }))
    settler.chunk(liveChunk(70, 'att-1', { type: 'text-delta', index: 0, text: 'a' }))
    settler.chunk(liveChunk(71, 'att-1', { type: 'text-delta', index: 0, text: 'b' }))
    expect(settler.rows()[0]).toMatchObject({ text: 'ab', lastSeq: 71 })
  })

  it('settle-assistant：Streaming→Settled，text 清空（持久卡取代）reasoning 保留（折叠面）', () => {
    const settler = createAttemptSettler()
    settler.chunk(liveChunk(80, 'att-1', { type: 'block-start', index: 0, blockType: 'reasoning' }))
    settler.chunk(liveChunk(80, 'att-1', { type: 'reasoning-delta', index: 0, text: '思考' }))
    settler.chunk(liveChunk(80, 'att-1', { type: 'text-delta', index: 1, text: 'live' }))
    settler.settle('att-1', {
      type: 'event',
      event: ev('assistant/message', 81, { turn: 1, step: 1, message: { role: 'assistant', content: [] }, stream: [] }),
    } as SessionEventLikeEntry)
    expect(settler.rows()).toEqual([{ attemptId: 'att-1', text: '', reasoning: '思考', state: 'settled', lastSeq: 80 }])
  })

  it('abandoned 判别帧：Streaming→Abandoned，保留前缀 + 中断标记', () => {
    const settler = createAttemptSettler()
    settler.chunk(liveChunk(90, 'att-1', { type: 'text-delta', index: 0, text: 'prefix' }))
    settler.abandon('att-1')
    expect(settler.rows()).toEqual([{ attemptId: 'att-1', text: 'prefix', reasoning: '', state: 'abandoned', lastSeq: 90 }])
  })

  it('迟到 chunk：Settled/Abandoned 后终态吸收（丢弃）', () => {
    const settler = createAttemptSettler()
    settler.chunk(liveChunk(100, 'att-1', { type: 'text-delta', index: 0, text: 'x' }))
    settler.settle('att-1')
    settler.chunk(liveChunk(101, 'att-1', { type: 'text-delta', index: 0, text: 'late' }))
    settler.chunk(liveChunk(102, 'att-2', { type: 'text-delta', index: 0, text: 'late' }))
    settler.abandon('att-2')
    expect(settler.rows()).toEqual([
      { attemptId: 'att-1', text: '', reasoning: '', state: 'settled', lastSeq: 100 },
      { attemptId: 'att-2', text: 'late', reasoning: '', state: 'abandoned', lastSeq: 102 },
    ])
  })

  it('多 attempt 并存 = 多子状态机并行互不干扰', () => {
    const settler = createAttemptSettler()
    settler.chunk(liveChunk(110, 'att-1', { type: 'text-delta', index: 0, text: 'one' }))
    settler.chunk(liveChunk(111, 'att-2', { type: 'text-delta', index: 0, text: 'two' }))
    settler.settle('att-1')
    expect(settler.rows()).toEqual([
      { attemptId: 'att-1', text: '', reasoning: '', state: 'settled', lastSeq: 110 },
      { attemptId: 'att-2', text: 'two', reasoning: '', state: 'streaming', lastSeq: 111 },
    ])
  })
})

// ---------------------------------------------------------------------------
// seq 单调门 + 双通道乱序去重合并
// ---------------------------------------------------------------------------

describe('seq 单调门', () => {
  it('严格大于才放行并推进游标；≤ 已应用 seq 丢弃', () => {
    const gate = createSeqGate()
    expect(gate.appliedSeq()).toBe(-1)
    expect(gate.admit(5)).toBe(true)
    expect(gate.admit(5)).toBe(false)
    expect(gate.admit(4)).toBe(false)
    expect(gate.admit(6)).toBe(true)
    expect(gate.appliedSeq()).toBe(6)
  })

  it('双通道乱序写入按 seq 去重合并（SSE 增量 ∪ 轮询快照）', () => {
    const sseDeltas = [
      ev('tool/call', 20, { callId: 'a', name: 'r', arguments: '' }),
      ev('tool/call', 23, { callId: 'b', name: 'r', arguments: '' }),
    ]
    const pollSnapshot = [
      ev('tool/call', 21, { callId: 'c', name: 'r', arguments: '' }),
      ev('tool/call', 23, { callId: 'b', name: 'r', arguments: '' }),
    ]
    const merged = mergeBySeq(mergeBySeq([], sseDeltas), pollSnapshot)
    expect(merged.map((e) => e.seq)).toEqual([20, 21, 23])
  })

  it('mergeBySeq 保留 current 侧同 seq 原项（先到先得，不改写已应用行）', () => {
    const current = [ev('user/message', 9, { content: [{ type: 'text', text: 'first' }], source: { kind: 'user' } })]
    const incoming = [ev('user/message', 9, { content: [{ type: 'text', text: 'second' }], source: { kind: 'user' } })]
    expect(mergeBySeq(current, incoming)).toEqual(current)
  })
})

// ---------------------------------------------------------------------------
// 未读可见计数（AD-6）：白名单计数 + prune 钳制
// ---------------------------------------------------------------------------

describe('未读可见计数', () => {
  const history = [
    ev('user/message', 9, { content: [{ type: 'text', text: 'hi' }], source: { kind: 'user' } }),
    ev('turn/start', 10, { turn: 1 }), // 机械事件不计
    ev('forge/progress', 11, { sourceSlug: 's', verb: 'claim', status: 'running', taskKey: 's/1', counts: {} }),
    ev('tool/call', 12, { callId: 'a', name: 'r', arguments: '' }),
  ]

  it('可见白名单计数：A/B 档才计，机械事件不计', () => {
    expect(visibleCount(history)).toBe(3)
  })

  it('compaction/prune 被裁事件不计为未读', () => {
    const pruned = [...history, ev('compaction/prune', 13, { shadowedRange: { start: 11, end: 11 }, shadowedSeqs: [11] })]
    expect(visibleCount(pruned)).toBe(2)
  })

  it('lastReadSeq 落在被裁区间时钳制回退', () => {
    expect(clampLastReadSeq(12, history)).toBe(12)
    expect(
      clampLastReadSeq(11, [...history, ev('compaction/prune', 13, { shadowedRange: { start: 11, end: 11 }, shadowedSeqs: [11] })]),
    ).toBe(10)
  })
})

// 类型面 pin：Projection 判别集可穷举收窄（编译期守卫）
describe('投影判别集形状', () => {
  it('command-chip 与 approval-card 的 phase 字面量收窄', () => {
    const chip: Projection = { kind: 'command-chip', seq: 1, commandId: 'c', name: 'n', args: '' }
    if (chip.kind === 'command-chip') expect(chip.done).toBeUndefined()
    const approval: Projection = { kind: 'approval-card', seq: 2, id: 'a', phase: 'asked' }
    expect(approval.phase).toBe('asked')
  })
})

describe('bug db09ac00：官方词表覆盖守卫（projectEvent 永不落 error-card）', () => {
  for (const type of OFFICIAL_SESSION_EVENT_TYPES) {
    it(`${type} → 投影或忽略，绝不 error-card`, () => {
      const projection = projectEvent(ev(type, 1, {}))
      expect(projection === null ? null : projection.kind).not.toBe('error-card')
    })
  }

  it('todo/write → 零渲染（bug ed37dee6：TODO 面板承载，消息流不重复）', () => {
    expect(projectEvent(ev('todo/write', 1, { todos: [{ content: 'a' }, { content: 'b' }] }))).toBeNull()
  })

  it('developer/message → 中性行文本预览（data.message.content 同消息形）', () => {
    expect(projectEvent(ev('developer/message', 2, { message: { role: 'developer', content: [{ type: 'text', text: '开发指引' }] } }))).toMatchObject({
      kind: 'neutral-line',
      type: expect.stringContaining('开发指引'),
    })
  })
})
describe('消息元信息投影（桌面端对齐：time + usage）', () => {
  it('user/message → user-bubble 携 time（epoch ms）', () => {
    const event = ev('user/message', 9, { content: [{ type: 'text', text: 'hi' }], source: { kind: 'user' } })
    const projection = projectEvent(event)
    expect(projection?.kind).toBe('user-bubble')
    expect((projection as { time?: number }).time).toBe(event.time)
  })

  it('assistant/message → 携 time 与 usage.totalTokens', () => {
    const event = ev('assistant/message', 16, { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: '回' }] }, usage: { inputTokens: 100, outputTokens: 5, totalTokens: 105 } })
    const projection = projectEvent(event)
    expect((projection as { usage?: number }).usage).toBe(105)
    expect((projection as { time?: number }).time).toBe(event.time)
  })

  it('usage 缺席 = undefined（不显示）', () => {
    const projection = projectEvent(ev('assistant/message', 16, { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: '回' }] } }))
    expect((projection as { usage?: number }).usage).toBeUndefined()
  })
})
describe('latestTodosOf（TODO 面板数据源——桌面端 composer 上方对齐）', () => {
  it('取最后一条 todo/write 的 todos（content+status 归一）', () => {
    const entries = [
      ev('todo/write', 1, { todos: [{ content: 'a', status: 'completed' }] }),
      ev('assistant/message', 2, { message: { content: [] } }),
      ev('todo/write', 3, { todos: [{ content: 'b', status: 'in_progress' }, { content: 'c' }] }),
    ]
    const todos = latestTodosOf(entries)
    expect(todos).toEqual([
      { content: 'b', status: 'in_progress' },
      { content: 'c', status: 'pending' },
    ])
  })

  it('无 todo/write = null（面板隐藏）', () => {
    expect(latestTodosOf([ev('user/message', 1, { content: [], source: { kind: 'user' } })])).toBeNull()
  })

  it('todos 形状非法 = null；空 content 项剔除', () => {
    expect(latestTodosOf([ev('todo/write', 1, {})])).toBeNull()
    expect(latestTodosOf([ev('todo/write', 1, { todos: [{ content: '' }, { content: 'ok', status: 'completed' }] })])).toEqual([
      { content: 'ok', status: 'completed' },
    ])
  })
})
describe('todoProgressLabel（桌面端 todo.progress 同构）', () => {
  const item = (status: 'pending' | 'in_progress' | 'completed'): { content: string; status: 'pending' | 'in_progress' | 'completed' } => ({ content: 'x', status })
  it('计数段拼接 · 分隔，零段省略', () => {
    expect(todoProgressLabel([item('completed'), item('completed'), item('in_progress'), item('pending')])).toBe('2 已完成 · 1 进行中 · 1 待处理')
    expect(todoProgressLabel([item('in_progress'), item('pending')])).toBe('1 进行中 · 1 待处理')
    expect(todoProgressLabel([item('completed')])).toBe('1 已完成')
  })
})