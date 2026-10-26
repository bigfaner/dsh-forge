// loop-event-delivery 1.9 · 消息面事件折叠条目组定义单测：
//   - stream fold 分组语义（连续事件同组追加 / 人类插话开新组 / 他形消息不分不染）
//   - 组节点发射判定（末成员独发 / 交棒重放 / isLatest 默认展开标记）
//   - 重放保真（fold 纯函数——事件重放/会话 fork 恒等）
// 引擎语义模拟：stream 单 Context（id 常量，start 首拍 + update 续拍）；组定义每消息
// 一 Context，stream revision 变更后全体重放（start 重跑 + 最新 reader）——官方
// ConversationNodeAssembler replay 语义同构最小面。
import { describe, expect, it } from 'vitest'
import {
  EMPTY_FORGE_EVENT_STREAM,
  FORGE_EVENT_NODE_KIND,
  forgeEventBadge,
  forgeEventGroupDefinition,
  forgeEventStreamDefinition,
  forgeEventTitle,
  foldForgeEventMessage,
  type ForgeEventStreamState,
  type ForgeMessageEventLike,
} from './forge-event-node.js'

/** forge notice 消息构造（faces.ts forgeUserMessage 铸造形状镜像） */
function forgeMsg(seq: number, id: string, badge: string, body: string, time = 1_700_000_000_000 + seq): ForgeMessageEventLike {
  return {
    type: 'user/message',
    seq,
    time,
    data: {
      id,
      role: 'user',
      content: [{ type: 'text', text: `[forge·${badge}] 任务源: feat-x\n任务: 2.3 折叠条目组\n${body}` }],
      source: { kind: 'forge-dispatch', form: 'notice', summary: `${badge} · 2.3 折叠条目组` },
    },
  }
}

/** 人类插话消息构造（source.kind 'user'） */
function humanMsg(seq: number, id: string, text: string): ForgeMessageEventLike {
  return {
    type: 'user/message',
    seq,
    time: 1_700_000_000_000 + seq,
    data: { id, role: 'user', content: [{ type: 'text', text }], source: { kind: 'user', rpcId: id } },
  }
}

/** 非人类非 forge 注入消息（skill-invocation——分组不分不染） */
function injectMsg(seq: number, id: string): ForgeMessageEventLike {
  return {
    type: 'user/message',
    seq,
    data: { id, role: 'user', content: [{ type: 'text', text: 'instructions' }], source: { kind: 'skill-invocation', form: 'instructions', name: 't' } },
  }
}

/** 引擎同构最小面：全会话事件按序喂入 → stream 状态 + 各 forge 消息 Context 的节点 */
function simulate(events: readonly ForgeMessageEventLike[]): {
  stream: ForgeEventStreamState
  nodes: Map<string, ReturnType<typeof forgeEventGroupDefinition.buildViewNode>>
} {
  let streamState: ForgeEventStreamState | undefined
  const states = new Map<string, ReturnType<typeof forgeEventGroupDefinition.start>>()
  for (const event of events) {
    if (streamState === undefined) {
      streamState = forgeEventStreamDefinition.start(undefined, { event }, { previous: () => undefined })
    } else {
      streamState = forgeEventStreamDefinition.update({ state: streamState }, { event })
    }
    // stream revision++ → 组 Context 全体重放（start 重跑 + 最新 stream 快照）
    const reader = { previous: (kind: string) => (kind === forgeEventStreamDefinition.kind ? { state: streamState } : undefined) }
    for (const [msgId, _state] of states) {
      const eventOf = events.find((candidate) => (candidate.data as { id?: string })?.id === msgId)
      if (eventOf !== undefined) states.set(msgId, forgeEventGroupDefinition.start(undefined, { event: eventOf }, reader))
    }
    const match = forgeEventGroupDefinition.match(event)
    if (match !== null) states.set(match.id, forgeEventGroupDefinition.start(undefined, { event }, reader))
  }
  const reader = { previous: (kind: string) => (kind === forgeEventStreamDefinition.kind && streamState !== undefined ? { state: streamState } : undefined) }
  const nodes = new Map<string, ReturnType<typeof forgeEventGroupDefinition.buildViewNode>>()
  let index = 0
  for (const [msgId, state] of states) {
    const eventOf = events.find((candidate) => (candidate.data as { id?: string })?.id === msgId)
    void eventOf
    nodes.set(msgId, forgeEventGroupDefinition.buildViewNode({ key: `k-${index}`, id: msgId, state, start: { location: { kind: 'unresolved' } } }))
    index += 1
  }
  void reader
  return { stream: streamState ?? EMPTY_FORGE_EVENT_STREAM, nodes }
}

describe('foldForgeEventMessage 分组语义（人类插话 = 分组锚点）', () => {
  it('连续 forge 事件同组追加；人类插话后事件开新组（前组条目保留）', () => {
    let state = foldForgeEventMessage(EMPTY_FORGE_EVENT_STREAM, forgeMsg(1, 'm1', '启动', '接续执行'))
    state = foldForgeEventMessage(state, forgeMsg(2, 'm2', '领取', '2.3'))
    state = foldForgeEventMessage(state, humanMsg(3, 'h1', '继续'))
    state = foldForgeEventMessage(state, forgeMsg(4, 'm3', '完成', '2.3 — 完成'))
    expect(state.groups).toHaveLength(2)
    expect(state.groups[0]?.entries.map((entry) => entry.id)).toEqual(['m1', 'm2'])
    expect(state.groups[1]?.entries.map((entry) => entry.id)).toEqual(['m3'])
  })
  it('非人类非 forge 消息（skill-invocation 等）不分不染——同组继续追加', () => {
    let state = foldForgeEventMessage(EMPTY_FORGE_EVENT_STREAM, forgeMsg(1, 'm1', '启动', '从头执行'))
    state = foldForgeEventMessage(state, injectMsg(2, 'i1'))
    state = foldForgeEventMessage(state, forgeMsg(3, 'm2', '领取', '2.3'))
    expect(state.groups).toHaveLength(1)
    expect(state.groups[0]?.entries.map((entry) => entry.id)).toEqual(['m1', 'm2'])
  })
  it('他事件类型（forge/progress 等）原引用返回——零污染', () => {
    const state = EMPTY_FORGE_EVENT_STREAM
    expect(foldForgeEventMessage(state, { type: 'forge/progress', seq: 9 })).toBe(state)
  })
  it('turn 戳：turn/start 记当前 turn、条目带 turnId；turn/end 记结束 seq 并清当前', () => {
    let state = foldForgeEventMessage(EMPTY_FORGE_EVENT_STREAM, { type: 'turn/start', seq: 1, data: { turn: 't-1' } })
    state = foldForgeEventMessage(state, forgeMsg(2, 'm1', '启动', 'x'))
    expect(state.currentTurn).toBe('t-1')
    expect(state.groups[0]?.entries[0]?.turnId).toBe('t-1')
    state = foldForgeEventMessage(state, { type: 'turn/end', seq: 3, data: { turn: 't-1', reason: { kind: 'completed' } } })
    expect(state.currentTurn).toBeUndefined()
    expect(state.turnEndSeqs).toEqual({ 't-1': 3 })
  })
  it('summary 回退首行剥徽记（source.summary 缺席——截图污面收口）', () => {
    const event: ForgeMessageEventLike = {
      type: 'user/message',
      seq: 1,
      data: {
        id: 'm9',
        role: 'user',
        content: [{ type: 'text', text: '[forge·启动] expert-squad（feature）· 接续执行未完成 1.50' }],
        source: { kind: 'forge-loop', form: 'notice' },
      },
    }
    const state = foldForgeEventMessage(EMPTY_FORGE_EVENT_STREAM, event)
    expect(state.groups[0]?.entries[0]?.summary).toBe('expert-squad（feature）· 接续执行未完成 1.50')
    expect(state.groups[0]?.entries[0]?.badge).toBe('启动')
  })
  it('条目解析：徽记/任务标题/摘要 headline 回退首行', () => {
    const state = foldForgeEventMessage(EMPTY_FORGE_EVENT_STREAM, forgeMsg(1, 'm1', '启动', '从头执行'))
    const entry = state.groups[0]?.entries[0]
    expect(entry?.badge).toBe('启动')
    expect(entry?.title).toBe('2.3 折叠条目组')
    expect(entry?.summary).toBe('启动 · 2.3 折叠条目组')
    expect(entry?.time).toBe(1_700_000_000_001)
  })
  it('纯文本解析面：forgeEventBadge / forgeEventTitle', () => {
    expect(forgeEventBadge('[forge·阻塞] 任务源: feat-x')).toBe('阻塞')
    expect(forgeEventBadge('无徽记行')).toBe('')
    expect(forgeEventTitle('x\n任务: 2.3 折叠条目组\n下一步动作: 无')).toBe('2.3 折叠条目组')
    expect(forgeEventTitle('任务源: feat-x（feature）')).toBe('feat-x（feature）')
    expect(forgeEventTitle('缺任务行')).toBe('')
  })
})

describe('forgeEventGroupDefinition 发射判定（末成员独发 + 交棒）', () => {
  it('match：仅 forge source user/message 命中（id = 消息 id）；人类/注入/他事件 → null', () => {
    expect(forgeEventGroupDefinition.match(forgeMsg(1, 'm1', '启动', 'x'))).toEqual({ id: 'm1', role: 'start' })
    expect(forgeEventGroupDefinition.match(humanMsg(2, 'h1', 'y'))).toBeNull()
    expect(forgeEventGroupDefinition.match(injectMsg(3, 'i1'))).toBeNull()
    expect(forgeEventGroupDefinition.match({ type: 'forge/progress', seq: 4 })).toBeNull()
  })
  it('两组三事件：组1末成员交棒 null、组2末成员独发（isLatest=true、anchorSeq=组末 seq）', () => {
    const { stream, nodes } = simulate([forgeMsg(1, 'm1', '启动', 'a'), forgeMsg(2, 'm2', '领取', 'b'), humanMsg(3, 'h1', '继续'), forgeMsg(4, 'm3', '完成', 'c')])
    expect(stream.groups).toHaveLength(2)
    expect(nodes.get('m1')).toBeNull()
    const g1 = nodes.get('m2')
    expect(g1).toMatchObject({ kind: FORGE_EVENT_NODE_KIND, anchorSeq: 2, visibility: 'visible' })
    expect((g1 as { data: { isLatest: boolean; entries: unknown[] } }).data.isLatest).toBe(false)
    expect((g1 as { data: { entries: unknown[] } }).data.entries).toHaveLength(2)
    const g2 = nodes.get('m3')
    expect(g2).toMatchObject({ anchorSeq: 4 })
    expect((g2 as { data: { isLatest: boolean; entries: unknown[] } }).data.isLatest).toBe(true)
    expect((g2 as { data: { entries: unknown[] } }).data.entries).toHaveLength(1)
    expect(nodes.size).toBe(3)
  })
  it('stream 缺席（reader 空）= 不发射（fail-soft 零残留）', () => {
    const state = forgeEventGroupDefinition.start(undefined, { event: forgeMsg(1, 'm1', '启动', 'x') }, { previous: () => undefined })
    expect(state.emit).toBe(false)
    expect(forgeEventGroupDefinition.buildViewNode({ key: 'k', id: 'm1', state })).toBeNull()
  })
  it('re-anchor：turn 结束后组卡锚 = turn/end seq（≥ answerAnchorSeq——卡片落回复下方）', () => {
    const { nodes } = simulate([
      { type: 'turn/start', seq: 1, data: { turn: 't-1' } },
      forgeMsg(2, 'm1', '启动', 'a'),
      forgeMsg(3, 'm2', '完成', 'b'),
      { type: 'turn/end', seq: 9, data: { turn: 't-1', reason: { kind: 'completed' } } },
    ])
    // stream revision 随 turn/end 变更 → 组 Context 重放 → 锚移 turn/end seq
    expect(nodes.get('m2')).toMatchObject({ anchorSeq: 9 })
    expect(nodes.get('m1')).toBeNull() // 交棒：末成员独发
  })
  it('turn 未结束 = 锚组末 seq（活跃 turn 过程折叠恒开——卡可见随组尾）', () => {
    const { nodes } = simulate([
      { type: 'turn/start', seq: 1, data: { turn: 't-1' } },
      forgeMsg(2, 'm1', '启动', 'a'),
    ])
    expect(nodes.get('m1')).toMatchObject({ anchorSeq: 2 })
  })
  it('重放保真：同日志重放节点恒等（fold 纯函数——事件重放/会话 fork 保留渲染）', () => {
    const events = [forgeMsg(1, 'm1', '启动', 'a'), forgeMsg(2, 'm2', '领取', 'b'), humanMsg(3, 'h1', '继续'), forgeMsg(4, 'm3', '完成', 'c')]
    const first = simulate(events)
    const second = simulate(events)
    expect(first.stream).toEqual(second.stream)
    expect([...first.nodes.entries()]).toEqual([...second.nodes.entries()])
  })
})

describe('forgeEventStreamDefinition（状态机注册形状）', () => {
  it('match：user/message 一律命中（id 常量单 Context）；他事件 → null', () => {
    expect(forgeEventStreamDefinition.match(forgeMsg(1, 'm1', '启动', 'x'))).toEqual({ id: 'stream', role: 'start' })
    expect(forgeEventStreamDefinition.match(humanMsg(2, 'h1', 'y'))).toEqual({ id: 'stream', role: 'start' })
    expect(forgeEventStreamDefinition.match({ type: 'assistant/message', seq: 3 })).toBeNull()
  })
  it("publication 'none'——state-only Context 零渲染成本（inboxDefinition 同型）", () => {
    expect(forgeEventStreamDefinition.publication()).toBe('none')
  })
})
