// forge-progress-card-invariant-hardening 1.5 · 真实日志回放 + 形态矩阵回归（提案配套纪律 4）：
//   - 真实日志回放：案发样本 session-637fab65 事件序列（fixture 灌入 fold 纯函数）逐 seq
//     断言组模型与 anchorSeq——bug fafc1fb7 回归面（同序列重放任意次组模型恒等）。
//   - 形态矩阵：官方 turn 形态（有/无 answer、工具收尾、插话打断）× 窗口裁剪 × replay
//     时序组合——断言锚定行为（组模型成员集、anchorSeq、可见性），不锚实现路径。
// 窗口裁剪 = start 时点 state 被官方置 void / previousStateOf 交棒路径（1.3/1.4 后形态）。
import { describe, expect, it } from 'vitest'
import { INCIDENT_SESSION_637FAB65 } from './forge-event-node.fixture.js'
import {
  EMPTY_FORGE_EVENT_STREAM,
  FORGE_EVENT_NODE_KIND,
  forgeEventGroupDefinition,
  forgeEventStreamDefinition,
  foldForgeEventMessage,
  type ForgeEventStreamState,
  type ForgeMessageEventLike,
} from './forge-event-node.js'

/** forge notice 消息构造（既有 forge-event-node.test.ts 同型——矩阵形态用） */
function forgeMsg(seq: number, id: string, badge: string): ForgeMessageEventLike {
  return {
    type: 'user/message',
    seq,
    time: 1_700_000_000_000 + seq,
    data: {
      id,
      role: 'user',
      content: [{ type: 'text', text: `[forge·${badge}] 任务源: feat-x\n任务: 形态矩阵` }],
      source: { kind: 'forge-dispatch', form: 'notice', summary: `${badge} · 形态矩阵` },
    },
  }
}

/** 人类插话消息构造 */
function humanMsg(seq: number, id: string): ForgeMessageEventLike {
  return {
    type: 'user/message',
    seq,
    time: 1_700_000_000_000 + seq,
    data: { id, role: 'user', content: [{ type: 'text', text: '插话' }], source: { kind: 'user', rpcId: id } },
  }
}

/** 'forge/progress' 事件构造 */
function progressEvt(seq: number): ForgeMessageEventLike {
  return { type: 'forge/progress', seq, time: 1_700_000_000_000 + seq, data: { sourceSlug: 'feat-x', verb: 'claim', status: 'running', at: 1_700_000_000_000 + seq } }
}

/** 引擎同构最小面（既有测试 simulate 同型）：全会话事件按序喂入 → stream 状态 + 各组块节点 */
function simulate(events: readonly ForgeMessageEventLike[]): {
  stream: ForgeEventStreamState
  nodes: Map<string, ReturnType<typeof forgeEventGroupDefinition.buildViewNode>>
} {
  let streamState: ForgeEventStreamState | undefined
  const states = new Map<string, ReturnType<typeof forgeEventGroupDefinition.start>>()
  const sources = new Map<string, ForgeMessageEventLike>()
  for (const event of events) {
    if (streamState === undefined) {
      streamState = forgeEventStreamDefinition.start(undefined, { event }, { previous: () => undefined })
    } else {
      streamState = forgeEventStreamDefinition.update({ state: streamState }, { event })
    }
    const reader = { previous: (kind: string) => (kind === forgeEventStreamDefinition.kind ? { state: streamState } : undefined) }
    for (const [ctxId, source] of sources) {
      states.set(ctxId, forgeEventGroupDefinition.start(undefined, { event: source }, reader))
    }
    const match = forgeEventGroupDefinition.match(event)
    if (match !== null) {
      states.set(match.id, forgeEventGroupDefinition.start(undefined, { event }, reader))
      sources.set(match.id, event)
    }
  }
  const nodes = new Map<string, ReturnType<typeof forgeEventGroupDefinition.buildViewNode>>()
  let index = 0
  for (const [ctxId, state] of states) {
    nodes.set(ctxId, forgeEventGroupDefinition.buildViewNode({ key: `k-${index}`, id: ctxId, state, start: { location: { kind: 'unresolved' } } }))
    index += 1
  }
  return { stream: streamState ?? EMPTY_FORGE_EVENT_STREAM, nodes }
}

/** 逐事件 fold 至 seq 处的 stream 状态（回放断言用） */
function foldUpTo(events: readonly ForgeMessageEventLike[], seq: number): ForgeEventStreamState {
  let state: ForgeEventStreamState = EMPTY_FORGE_EVENT_STREAM
  for (const event of events) {
    if (event.seq > seq) break
    state = foldForgeEventMessage(state, event)
  }
  return state
}

describe('真实日志回放：案发样本 session-637fab65（bug fafc1fb7 回归面）', () => {
  it('逐 seq 断言组模型：注入消息零污染、progress 逐枚入组、answer/turn 零参与', () => {
    // seq 5（turn/start）——turn 生命周期零参与折叠：空模型原样
    expect(foldUpTo(INCIDENT_SESSION_637FAB65, 5)).toEqual(EMPTY_FORGE_EVENT_STREAM)
    // seq 9（人类首条指令）——closed 收口标记，无组可收
    const after9 = foldUpTo(INCIDENT_SESSION_637FAB65, 9)
    expect(after9.groups).toHaveLength(0)
    expect(after9.closed).toBe(true)
    // seq 10–12（agent-instructions / runtime-context / skill-catalog 注入）——非人类非 forge 不分不染
    const after12 = foldUpTo(INCIDENT_SESSION_637FAB65, 12)
    expect(after12).toEqual(after9)
    const inject = INCIDENT_SESSION_637FAB65.find((event) => event.seq === 12)
    expect(inject).toBeDefined()
    expect(foldForgeEventMessage(after12, inject as ForgeMessageEventLike)).toBe(after12) // 原引用返回零污染
    // seq 27（首枚 forge/progress）——开新组（key = forge-progress-<首枚 seq>）
    const after27 = foldUpTo(INCIDENT_SESSION_637FAB65, 27)
    expect(after27.groups).toHaveLength(1)
    expect(after27.groups[0]).toMatchObject({ key: 'forge-progress-27', firstSeq: 27, lastSeq: 27 })
    expect(after27.groups[0]?.progress).toHaveLength(1)
    // seq 29 / 30——progress 逐枚追加，lastSeq 随组尾推进
    const after30 = foldUpTo(INCIDENT_SESSION_637FAB65, 30)
    expect(after30.groups[0]).toMatchObject({ key: 'forge-progress-27', firstSeq: 27, lastSeq: 30 })
    expect(after30.groups[0]?.progress?.map((entry) => entry.seq)).toEqual([27, 29, 30])
    // seq 36（组末成员）——anchorSeq 从数据重导出 = 36
    const after36 = foldUpTo(INCIDENT_SESSION_637FAB65, 36)
    expect(after36.groups[0]).toMatchObject({ key: 'forge-progress-27', firstSeq: 27, lastSeq: 36 })
    expect(after36.groups[0]?.progress).toHaveLength(4)
    // seq 37（answer = assistant/message）与 seq 39（turn/end）——零参与：组模型恒等 + 单事件原引用返回
    expect(foldUpTo(INCIDENT_SESSION_637FAB65, 37)).toEqual(after36)
    expect(foldUpTo(INCIDENT_SESSION_637FAB65, 39)).toEqual(after36)
    const answer = INCIDENT_SESSION_637FAB65.find((event) => event.seq === 37)
    const turnEnd = INCIDENT_SESSION_637FAB65.find((event) => event.seq === 39)
    expect(answer).toBeDefined()
    expect(turnEnd).toBeDefined()
    expect(foldForgeEventMessage(after36, answer as ForgeMessageEventLike)).toBe(after36)
    expect(foldForgeEventMessage(after36, turnEnd as ForgeMessageEventLike)).toBe(after36)
  })

  it('组模型成员集与 anchorSeq：单组 4 枚 progress 成员，anchorSeq = 组末成员真实 seq 36', () => {
    const { stream, nodes } = simulate(INCIDENT_SESSION_637FAB65)
    expect(stream.groups).toHaveLength(1)
    const group = stream.groups[0]
    expect(group?.key).toBe('forge-progress-27')
    expect(group?.progress?.map((entry) => entry.seq)).toEqual([27, 29, 30, 36])
    expect(group?.progress?.[1]).toMatchObject({ taskKey: 'forge-dirs-query-tool/1.1', expertKey: 'feature-builder' })
    // 尾成员独发：anchorSeq 36、visible、isLatest
    const tail = nodes.get('forge-event-progress-36')
    expect(tail).toMatchObject({ kind: FORGE_EVENT_NODE_KIND, anchorSeq: 36, visibility: 'visible' })
    expect((tail as { data: { isLatest: boolean; progress: unknown[] } }).data.isLatest).toBe(true)
    expect((tail as { data: { progress: unknown[] } }).data.progress).toHaveLength(4)
    // 前成员交棒 hidden——真成员序列不丢
    for (const id of ['forge-event-progress-27', 'forge-event-progress-29', 'forge-event-progress-30']) {
      const node = nodes.get(id) as { visibility: string; anchorSeq: number; data: { progress: unknown[] } } | null
      expect(node).not.toBeNull()
      expect(node?.visibility).toBe('hidden')
      expect(node?.anchorSeq).toBe(36)
      expect(node?.data.progress).toHaveLength(4)
    }
  })

  it('fafc1fb7 回归面：同序列重放任意次组模型与节点恒等（先在场后消失不自愈禁绝）', () => {
    const first = simulate(INCIDENT_SESSION_637FAB65)
    for (let round = 2; round <= 5; round += 1) {
      const replay = simulate(INCIDENT_SESSION_637FAB65)
      expect(replay.stream).toEqual(first.stream)
      expect([...replay.nodes.entries()]).toEqual([...first.nodes.entries()])
    }
    // 裁剪重放（仅保留 fold 消费面事件——turn 生命周期/answer 剔除后终态组模型恒等）
    const trimmed = INCIDENT_SESSION_637FAB65.filter((event) => event.type === 'user/message' || event.type === 'forge/progress')
    expect(simulate(trimmed).stream).toEqual(first.stream)
  })
})

/** 形态矩阵形状定义：官方 turn 形态四型（每个 = 事件序列 + 终态组模型期望） */
const MATRIX_SHAPES = [
  {
    name: '有 answer（正文收尾 turn）',
    events: [
      { type: 'turn/start', seq: 10, data: { turn: 1 } },
      forgeMsg(11, 'm1', '领取'),
      progressEvt(12),
      { type: 'assistant/message', seq: 13, data: { message: { content: [{ type: 'text', text: 'answer' }] } } },
      { type: 'turn/end', seq: 14, data: { turn: 1, reason: { kind: 'completed' } } },
    ] as const,
    groups: 1,
    tailAnchor: 12,
    tailId: 'forge-event-progress-12',
  },
  {
    name: '无 answer（progress 后 turn 直接收口）',
    events: [
      { type: 'turn/start', seq: 10, data: { turn: 1 } },
      forgeMsg(11, 'm1', '领取'),
      progressEvt(12),
      { type: 'turn/end', seq: 14, data: { turn: 1, reason: { kind: 'completed' } } },
    ] as const,
    groups: 1,
    tailAnchor: 12,
    tailId: 'forge-event-progress-12',
  },
  {
    name: '工具收尾（tool/call + tool/result 后 turn/end）',
    events: [
      { type: 'turn/start', seq: 10, data: { turn: 1 } },
      forgeMsg(11, 'm1', '领取'),
      progressEvt(12),
      { type: 'tool/call', seq: 13, data: { callId: 'c1', name: 't', arguments: '{}' } },
      { type: 'tool/result', seq: 14, data: { callId: 'c1' } },
      { type: 'turn/end', seq: 15, data: { turn: 1, reason: { kind: 'completed' } } },
    ] as const,
    groups: 1,
    tailAnchor: 12,
    tailId: 'forge-event-progress-12',
  },
  {
    name: '插话打断（人类插话 = 分组锚点，前后两组）',
    events: [
      { type: 'turn/start', seq: 10, data: { turn: 1 } },
      forgeMsg(11, 'm1', '启动'),
      progressEvt(12),
      humanMsg(13, 'h1'),
      forgeMsg(14, 'm2', '领取'),
      progressEvt(15),
      { type: 'turn/end', seq: 16, data: { turn: 1, reason: { kind: 'completed' } } },
    ] as const,
    groups: 2,
    tailAnchor: 15,
    tailId: 'forge-event-progress-15',
  },
] as const

describe('形态矩阵：官方 turn 形态 × 窗口裁剪 × replay 时序（断言行为：成员集/anchorSeq/可见性）', () => {
  for (const shape of MATRIX_SHAPES) {
    describe(`形态：${shape.name}`, () => {
      it('replay：全量重放组模型与 anchorSeq 稳定；重复重放恒等', () => {
        const events = [...shape.events] as unknown as ForgeMessageEventLike[]
        const { stream, nodes } = simulate(events)
        expect(stream.groups).toHaveLength(shape.groups)
        const tail = nodes.get(shape.tailId)
        expect(tail).not.toBeNull()
        expect(tail).toMatchObject({ anchorSeq: shape.tailAnchor, visibility: 'visible' })
        const replay = simulate(events)
        expect(replay.stream).toEqual(stream)
        expect([...replay.nodes.entries()]).toEqual([...nodes.entries()])
      })

      it('窗口裁剪（state 被置 void + previousStateOf 交棒）：不产 hidden 空组、已物化卡不被顶掉', () => {
        const events = [...shape.events] as unknown as ForgeMessageEventLike[]
        const { nodes } = simulate(events)
        const tail = nodes.get(shape.tailId) as { anchorSeq: number; data: Record<string, unknown> } | null
        expect(tail).not.toBeNull()
        // 官方窗口裁剪后重放帧：state 缺席（void），current 持上次物化节点（组模型真数据）
        const trimmed = forgeEventGroupDefinition.buildViewNode({
          key: 'k-trim',
          id: shape.tailId,
          current: new Map([['chat', { visibility: 'visible', anchorSeq: tail?.anchorSeq, data: tail?.data }]]),
        }) as { visibility: string; anchorSeq: number; data: { entries: unknown[]; progress: unknown[] } } | null
        // 负向断言一：不回 null（已物化卡不被顶掉——D2 曾物化态）
        expect(trimmed).not.toBeNull()
        // 负向断言二：hidden 但必携真成员序列（hidden 空组不可产出）
        expect(trimmed?.visibility).toBe('hidden')
        const members = (trimmed?.data.entries.length ?? 0) + (trimmed?.data.progress.length ?? 0)
        expect(members).toBeGreaterThan(0)
        // 真锚：从交棒数据重导出 = 组末成员真实 seq
        expect(trimmed?.anchorSeq).toBe(shape.tailAnchor)
      })

      it('start 时点 state void（窗口外 start match——stream reader 空）：组块节点从交棒数据恢复真锚', () => {
        const events = [...shape.events] as unknown as ForgeMessageEventLike[]
        const { nodes } = simulate(events)
        const tail = nodes.get(shape.tailId) as { anchorSeq: number; data: Record<string, unknown> } | null
        expect(tail).not.toBeNull()
        const tailEvent = events.find((event) => event.type === 'forge/progress' && event.seq === shape.tailAnchor)
        expect(tailEvent).toBeDefined()
        // 窗口外 start：reader 查不到 stream（窗口裁剪置 void）→ start 保底空组
        const state = forgeEventGroupDefinition.start(undefined, { event: tailEvent as ForgeMessageEventLike }, { previous: () => undefined })
        expect(state.emit).toBe(false)
        expect(state.group.entries).toHaveLength(0)
        // buildViewNode 从 previousStateOf 交棒恢复——真成员 + 真锚，非空组非 null
        const node = forgeEventGroupDefinition.buildViewNode({
          key: 'k-void',
          id: shape.tailId,
          state,
          current: new Map([['chat', { visibility: 'visible', anchorSeq: tail?.anchorSeq, data: tail?.data }]]),
        }) as { visibility: string; anchorSeq: number; data: { entries: unknown[]; progress: unknown[] } } | null
        expect(node).not.toBeNull()
        expect(node?.visibility).toBe('hidden')
        expect((node?.data.entries.length ?? 0) + (node?.data.progress.length ?? 0)).toBeGreaterThan(0)
        expect(node?.anchorSeq).toBe(shape.tailAnchor)
      })
    })
  }

  it('replay 时序 × 窗口裁剪交叉：裁剪帧后新事件到达（重放恢复）——组模型回真、尾成员重发可见', () => {
    const events = [
      { type: 'turn/start', seq: 10, data: { turn: 1 } },
      forgeMsg(11, 'm1', '领取'),
      progressEvt(12),
    ] as unknown as ForgeMessageEventLike[]
    const before = simulate(events)
    const tail = before.nodes.get('forge-event-progress-12') as { data: Record<string, unknown> } | null
    expect(tail).not.toBeNull()
    // 窗口裁剪帧（state void）交棒
    const trimmed = forgeEventGroupDefinition.buildViewNode({
      key: 'k',
      id: 'forge-event-progress-12',
      current: new Map([['chat', { visibility: 'visible', data: tail?.data }]]),
    })
    expect(trimmed).not.toBeNull()
    // 新 progress 到达 → 全量重放：恢复帧被当帧 fold 覆盖，尾成员交棒真发
    const after = simulate([...events, progressEvt(13)])
    const newTail = after.nodes.get('forge-event-progress-13')
    expect(newTail).toMatchObject({ anchorSeq: 13, visibility: 'visible' })
    expect((newTail as { data: { progress: unknown[] } }).data.progress).toHaveLength(2)
    expectHiddenNode(after.nodes.get('forge-event-progress-12'))
  })
})

/** hidden 节点断言（非 null + hidden + 真成员） */
function expectHiddenNode(node: unknown): void {
  const typed = node as { visibility: string; data: { entries: unknown[]; progress: unknown[] } } | null
  expect(typed).not.toBeNull()
  expect(typed?.visibility).toBe('hidden')
  expect((typed?.data.entries.length ?? 0) + (typed?.data.progress.length ?? 0)).toBeGreaterThan(0)
}
