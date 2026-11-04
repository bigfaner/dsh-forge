// loop-event-delivery 1.9 · 消息面事件折叠条目组定义单测：
//   - stream fold 分组语义（连续事件同组追加 / 人类插话开新组 / 他形消息不分不染）
//   - 组节点发射判定（末成员独发 / 交棒重放 / isLatest 默认展开标记）
//   - 重放保真（fold 纯函数——事件重放/会话 fork 恒等）
// forge-progress-card-invariant-hardening 1.3（D1+D3+D4）后形态：
//   - D3：turn 台账拆除——turn/start、turn/end、assistant/message 零参与折叠与锚定，
//     anchorSeq 恒 = 组末成员真实 seq（每帧重导出）；既有锚定用例按新形态改写。
//   - D1：previousStateOf 只透传组数据——visible/anchorSeq 不由恢复值参与。
// 引擎语义模拟：stream 单 Context（id 常量，start 首拍 + update 续拍）；组定义每消息
// 一 Context，stream revision 变更后全体重放（start 重跑 + 最新 reader）——官方
// ConversationNodeAssembler replay 语义同构最小面。
import { describe, expect, it } from 'vitest'
import {
  EMPTY_FORGE_EVENT_STREAM,
  FORGE_EVENT_NODE_KIND,
  forgeEventBadge,
  forgeEventGroupAnchorSeq,
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

/** 'forge/progress' 会话事件构造（plugin-forge emitProgress 载荷形状镜像） */
function progressEvt(seq: number, data: Record<string, unknown>): ForgeMessageEventLike {
  return {
    type: 'forge/progress',
    seq,
    data: { sourceSlug: 'feat-x', verb: 'claim', status: 'running', at: 1_700_000_000_000 + seq, ...data },
  }
}

/** 引擎同构最小面：全会话事件按序喂入 → stream 状态 + 各组块 Context 的节点 */
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
    // stream revision++ → 组 Context 全体重放（start 重跑 + 最新 stream 快照）
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

/** 交棒/空组保底断言：同 key 同 id、visibility 'hidden' 的组块节点（官方钦定形态） */
function expectHidden(node: unknown): void {
  expect(node).not.toBeNull()
  expect(node).toMatchObject({ kind: FORGE_EVENT_NODE_KIND, visibility: 'hidden' })
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
  it('他事件类型原引用返回——零污染；畸形 progress 载荷（缺 sourceSlug/at）同样弃置', () => {
    const state = EMPTY_FORGE_EVENT_STREAM
    expect(foldForgeEventMessage(state, { type: 'assistant/message', seq: 9 })).toBe(state)
    expect(foldForgeEventMessage(state, { type: 'forge/progress', seq: 9 })).toBe(state)
    expect(foldForgeEventMessage(state, progressEvt(9, { sourceSlug: undefined }))).toBe(state)
  })
  it("1.2 progress 条目同组 fold：开组中追加（lastSeq 推进）；插话后开新组（'forge-progress-<seq>' 键）", () => {
    let state = foldForgeEventMessage(EMPTY_FORGE_EVENT_STREAM, progressEvt(1, { taskKey: 'feat-x/1.2', taskTitle: '标题' }))
    state = foldForgeEventMessage(state, progressEvt(2, { taskKey: 'feat-x/1.2', status: 'completed', verb: 'settle' }))
    expect(state.groups).toHaveLength(1)
    expect(state.groups[0]?.key).toBe('forge-progress-1')
    expect(state.groups[0]?.lastSeq).toBe(2)
    expect(state.groups[0]?.progress).toHaveLength(2)
    expect(state.groups[0]?.progress?.at(-1)?.status).toBe('completed')
    state = foldForgeEventMessage(state, humanMsg(3, 'h1', '继续'))
    state = foldForgeEventMessage(state, progressEvt(4, { taskKey: 'feat-x/1.3' }))
    expect(state.groups).toHaveLength(2)
    expect(state.groups[1]?.key).toBe('forge-progress-4')
    expect(state.groups[1]?.progress).toHaveLength(1)
  })
  it("1.2 progress 与消息同组混叠：消息到达不丢 progress（entries/progress 双轨推进）", () => {
    let state = foldForgeEventMessage(EMPTY_FORGE_EVENT_STREAM, progressEvt(1, { taskKey: 'feat-x/1.2' }))
    state = foldForgeEventMessage(state, forgeMsg(2, 'm1', '结算', '任务源: feat-x'))
    expect(state.groups).toHaveLength(1)
    expect(state.groups[0]?.entries).toHaveLength(1)
    expect(state.groups[0]?.progress).toHaveLength(1)
    expect(state.groups[0]?.lastSeq).toBe(2)
  })
  it('D3：turn 生命周期与 assistant 消息零参与折叠——原引用返回零污染，state 无 turn 台账位', () => {
    let state = foldForgeEventMessage(EMPTY_FORGE_EVENT_STREAM, forgeMsg(1, 'm1', '启动', 'x'))
    const before = state
    state = foldForgeEventMessage(state, { type: 'turn/start', seq: 2, data: { turn: 5 } })
    state = foldForgeEventMessage(state, { type: 'assistant/message', seq: 3, data: { message: { content: [{ type: 'text', text: '正文' }] } } })
    state = foldForgeEventMessage(state, { type: 'turn/end', seq: 4, data: { turn: 5, reason: { kind: 'completed' } } })
    expect(state).toBe(before) // 三分支全量拆除——他形事件原引用返回
    expect(state.groups).toHaveLength(1)
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
  it('match：forge source user/message（id = 消息 id）+ forge/progress（id = 前缀+seq）命中；人类/注入/turn → null', () => {
    expect(forgeEventGroupDefinition.match(forgeMsg(1, 'm1', '启动', 'x'))).toEqual({ id: 'm1', role: 'start' })
    expect(forgeEventGroupDefinition.match(humanMsg(2, 'h1', 'y'))).toBeNull()
    expect(forgeEventGroupDefinition.match(injectMsg(3, 'i1'))).toBeNull()
    expect(forgeEventGroupDefinition.match(progressEvt(4, {}))).toEqual({ id: 'forge-event-progress-4', role: 'start' })
    expect(forgeEventGroupDefinition.match({ type: 'turn/start', seq: 5, data: { turn: 6 } })).toBeNull()
    expect(forgeEventGroupDefinition.match({ type: 'assistant/message', seq: 6, data: { message: { content: [] } } })).toBeNull()
  })
  it('两组三事件：组1末成员交棒 hidden、组2末成员独发（isLatest=true、anchorSeq=组末成员真实 seq）', () => {
    const { stream, nodes } = simulate([forgeMsg(1, 'm1', '启动', 'a'), forgeMsg(2, 'm2', '领取', 'b'), humanMsg(3, 'h1', '继续'), forgeMsg(4, 'm3', '完成', 'c')])
    expect(stream.groups).toHaveLength(2)
    expectHidden(nodes.get('m1'))
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
  it('stream 缺席（reader 空）= 不发射（fail-soft——hidden 保底不回 null）', () => {
    const state = forgeEventGroupDefinition.start(undefined, { event: forgeMsg(1, 'm1', '启动', 'x') }, { previous: () => undefined })
    expect(state.emit).toBe(false)
    expectHidden(forgeEventGroupDefinition.buildViewNode({ key: 'k', id: 'm1', state }))
  })
  it('D3：turn/end 到达不改锚——anchorSeq 恒组末成员真实 seq（台账 re-anchor 退役，改写自旧 re-anchor 用例）', () => {
    const { nodes } = simulate([
      { type: 'turn/start', seq: 1, data: { turn: 't-1' } },
      forgeMsg(2, 'm1', '启动', 'a'),
      forgeMsg(3, 'm2', '完成', 'b'),
      { type: 'turn/end', seq: 9, data: { turn: 't-1', reason: { kind: 'completed' } } },
    ])
    // turn/end 不命中 stream match → 无重放；即使重放，锚也从组模型数据重导出 = 组末 seq
    expect(nodes.get('m2')).toMatchObject({ anchorSeq: 3 })
    expectHidden(nodes.get('m1')) // 交棒：末成员独发
  })
  it('D3：运行期锚 = 组末成员真实 seq（旧 start-1 顶层逃逸口径退役，改写自运行期脱折叠用例）', () => {
    const { stream, nodes } = simulate([
      { type: 'turn/start', seq: 1, data: { turn: 't-1' } },
      forgeMsg(2, 'm1', '启动', 'a'),
      forgeMsg(3, 'm2', '运行中', 'b'),
    ])
    expect(stream).not.toHaveProperty('turnStartSeqs')
    expect(nodes.get('m2')).toMatchObject({ anchorSeq: 3, visibility: 'visible' })
  })
  it('D3：progress 轨组末成员主导锚；turn 生命周期事件零影响（改写自 6a3ccc4d/0e5eba85 形态用例）', () => {
    const events = [
      { type: 'turn/start', seq: 1, data: { turn: 5 } },
      forgeMsg(2, 'm1', '启动', 'a'),
      progressEvt(5, { taskKey: 'feat-x/1.2', status: 'running' }),
      progressEvt(6, { taskKey: 'feat-x/1.2', status: 'completed', verb: 'settle' }),
      { type: 'assistant/message', seq: 7, data: { message: { content: [{ type: 'text', text: '正文回复' }] } } },
    ] as const
    const { nodes } = simulate([...events])
    expect(nodes.get('forge-event-progress-6')).toMatchObject({ anchorSeq: 6 })
    const after = simulate([...events, { type: 'turn/end', seq: 9, data: { turn: 5, reason: { kind: 'completed' } } } as ForgeMessageEventLike])
    expect(after.nodes.get('forge-event-progress-6')).toMatchObject({ anchorSeq: 6 }) // 锚不随 turn/end 漂移
  })
  it('D3 数据即锚：forgeEventGroupAnchorSeq 直测——entries/progress 双轨取真实尾成员；空组回 lastSeq', () => {
    // 改写自旧台账参数直测用例：签名收敛为单一 group 参数（纯函数、零台账）
    expect(forgeEventGroupAnchorSeq({ key: 'k', firstSeq: 2, lastSeq: 6, entries: [] })).toBe(6) // 空组回 lastSeq
    expect(
      forgeEventGroupAnchorSeq({
        key: 'k',
        firstSeq: 6,
        lastSeq: 6,
        entries: [],
        progress: [{ seq: 6, sourceSlug: 's', status: 'running', verb: 'claim', at: 0 }],
      }),
    ).toBe(6)
    // 双轨取真实尾成员（非 lastSeq 字段）：尾 progress seq 大于尾消息 seq → 取 progress
    expect(
      forgeEventGroupAnchorSeq({
        key: 'k',
        firstSeq: 2,
        lastSeq: 2,
        entries: [{ id: 'm1', seq: 2, time: 0, badge: '', title: '', summary: '', text: '' }],
        progress: [{ seq: 7, sourceSlug: 's', status: 'running', verb: 'claim', at: 0 }],
      }),
    ).toBe(7)
    // 反向：尾消息 seq 大于尾 progress seq → 取消息
    expect(
      forgeEventGroupAnchorSeq({
        key: 'k',
        firstSeq: 2,
        lastSeq: 9,
        entries: [{ id: 'm1', seq: 9, time: 0, badge: '', title: '', summary: '', text: '' }],
        progress: [{ seq: 4, sourceSlug: 's', status: 'running', verb: 'claim', at: 0 }],
      }),
    ).toBe(9)
  })
  it('重放保真：同日志重放节点恒等（fold 纯函数——事件重放/会话 fork 保留渲染）', () => {
    const events = [
      forgeMsg(1, 'm1', '启动', 'a'),
      forgeMsg(2, 'm2', '领取', 'b'),
      humanMsg(3, 'h1', '继续'),
      forgeMsg(4, 'm3', '完成', 'c'),
      { type: 'assistant/message', seq: 5, data: { message: { content: [{ type: 'text', text: 'done' }] } } },
    ]
    const first = simulate(events)
    const second = simulate(events)
    expect(first.stream).toEqual(second.stream)
    expect([...first.nodes.entries()]).toEqual([...second.nodes.entries()])
  })
})

describe('1.2 循环进度卡发射（progress 到达 = 组块原地更新——尾成员交棒）', () => {
  it('消息组收到 progress：消息节点交棒 hidden，progress 节点独发携全量条目（零新卡）', () => {
    const { nodes } = simulate([
      forgeMsg(1, 'm1', '启动', 'a'),
      progressEvt(2, { taskKey: 'feat-x/1.2', taskTitle: '标题', status: 'running' }),
      progressEvt(3, { taskKey: 'feat-x/1.2', taskTitle: '标题', status: 'completed', verb: 'settle' }),
    ])
    expectHidden(nodes.get('m1'))
    const tail = nodes.get('forge-event-progress-3')
    expect(tail).not.toBeNull()
    expect(tail).toMatchObject({ kind: FORGE_EVENT_NODE_KIND, anchorSeq: 3, visibility: 'visible' })
    const data = (tail as { data: { progress: unknown[]; entries: unknown[]; isLatest: boolean } }).data
    expect(data.progress).toHaveLength(2)
    expect(data.entries).toHaveLength(1)
    expect(data.isLatest).toBe(true)
    expectHidden(nodes.get('forge-event-progress-2')) // 前 progress 交棒
  })
  it('纯 progress 组（零消息——1.1 后正常路径）：恰一枚尾节点发射', () => {
    const { stream, nodes } = simulate([
      progressEvt(1, { taskKey: 'feat-x/1.2', status: 'running' }),
      progressEvt(2, { taskKey: 'feat-x/1.3', status: 'running' }),
    ])
    expect(stream.groups).toHaveLength(1)
    expectHidden(nodes.get('forge-event-progress-1'))
    expect(nodes.get('forge-event-progress-2')).toMatchObject({ anchorSeq: 2 })
  })
  it('turn 已结束后 progress 到达：锚 = progress seq（活跃进度轨随组尾）', () => {
    const { nodes } = simulate([
      { type: 'turn/start', seq: 1, data: { turn: 5 } },
      forgeMsg(2, 'm1', '启动', 'a'),
      { type: 'turn/end', seq: 9, data: { turn: 5, reason: { kind: 'completed' } } },
      progressEvt(10, { taskKey: 'feat-x/1.2', status: 'running' }),
    ])
    expect(nodes.get('forge-event-progress-10')).toMatchObject({ anchorSeq: 10 })
    expectHidden(nodes.get('m1'))
  })
  it('D3：终局 settle 先于 turn 生命周期到达（c75df032 场景）——锚恒组末成员真实 seq，不猜 turn 归属（改写自台账回落用例）', () => {
    const { stream, nodes } = simulate([
      progressEvt(2, { taskKey: 'feat-x/1.16', status: 'completed', verb: 'settle' }),
      { type: 'turn/start', seq: 5, data: { turn: 6 } },
      { type: 'turn/end', seq: 9, data: { turn: 6, reason: { kind: 'completed' } } },
    ])
    expect(stream.groups[0]?.entries).toHaveLength(0)
    expect(nodes.get('forge-event-progress-2')).toMatchObject({ anchorSeq: 2, visibility: 'visible' })
    expect(stream.groups[0]?.progress?.at(-1)).not.toHaveProperty('turnId') // turnId 戳退役
  })
  it('stream match：forge/progress 命中（revision++ 驱动组块重放）；turn/assistant 不命中', () => {
    expect(forgeEventStreamDefinition.match(progressEvt(4, {}))).toEqual({ id: 'stream', role: 'start' })
    expect(forgeEventStreamDefinition.match({ type: 'turn/start', seq: 5, data: { turn: 6 } })).toBeNull()
    expect(forgeEventStreamDefinition.match({ type: 'turn/end', seq: 6, data: { turn: 6 } })).toBeNull()
    expect(forgeEventStreamDefinition.match({ type: 'assistant/message', seq: 7, data: { message: { content: [] } } })).toBeNull()
  })
})

describe('forgeEventStreamDefinition（状态机注册形状）', () => {
  it('match：user/message 一律命中（id 常量单 Context）；他事件 → null', () => {
    expect(forgeEventStreamDefinition.match(forgeMsg(1, 'm1', '启动', 'x'))).toEqual({ id: 'stream', role: 'start' })
    expect(forgeEventStreamDefinition.match(humanMsg(2, 'h1', 'y'))).toEqual({ id: 'stream', role: 'start' })
    // D3：assistant/turn 事件不再命中（answer 感知 fold 已随台账拆除）
    expect(forgeEventStreamDefinition.match({ type: 'assistant/message', seq: 3, data: { message: { content: [] } } })).toBeNull()
  })
  it("publication 'none'——state-only Context 零渲染成本（inboxDefinition 同型）", () => {
    expect(forgeEventStreamDefinition.publication()).toBe('none')
  })
})

describe('bug：交棒/空组回 null 撞官方 withdrew 断言（hidden 保底）', () => {
  it('emit true→false 交棒：同 key 同 id + visibility hidden（官方钦定，client.js:2505），组快照保留', () => {
    const { nodes } = simulate([forgeMsg(1, 'm1', '启动', 'a'), forgeMsg(2, 'm2', '领取', 'b')])
    const handoff = nodes.get('m1') as { key: string; id: string; visibility: string; data: { entries: unknown[] } } | null
    expect(handoff).not.toBeNull()
    expect(handoff?.key).toBe('k-0')
    expect(handoff?.id).toBe('m1')
    expect(handoff?.visibility).toBe('hidden')
    expect(handoff?.data.entries).toHaveLength(2) // 组快照不丢
  })
  it('空组保底（entries+progress 全空）：hidden 而非 null', () => {
    const state = forgeEventGroupDefinition.start(undefined, { event: forgeMsg(1, 'm1', '启动', 'x') }, { previous: () => undefined })
    expect(state.group.entries).toHaveLength(0)
    expectHidden(forgeEventGroupDefinition.buildViewNode({ key: 'k', id: 'm1', state, start: { location: { kind: 'unresolved' } } }))
  })
  it('bug f511c6a7：state === undefined（官方 replayContexts 淘汰 start match 置空）已物化 Context 回 hidden 保底而非 null——同 key 同 id 不触 withdrew 断言', () => {
    const node = forgeEventGroupDefinition.buildViewNode({ key: 'k', id: 'm1' })
    expect(node).not.toBeNull()
    expectHidden(node)
    expect(node).toMatchObject({ key: 'k', id: 'm1', target: 'chat' })
    expect((node as { data: { entries: unknown[]; progress: unknown[] } }).data.entries).toHaveLength(0)
  })
})

describe('bug 141624ed：现算源②碎片卡防护（组归属不可判定 = 让位 hidden）', () => {
  /** 官方 buildNode 以单参 contextSnapshot 调 buildViewNode——座上无 reader，携带成员
   *  是否组末不可判定；现算源②一律让位 hidden（透传面 previousStateOf 承担组数据保真）。 */
  it('窗口裁剪（state=undefined + current 缺失，携带组内事件）：让位 hidden 空组——不产 key=自身 id 的可见碎片卡', () => {
    const carried = forgeMsg(12, 'm9', '完成', 'c')
    const node = forgeEventGroupDefinition.buildViewNode({
      key: 'k',
      id: 'm9',
      start: { location: { kind: 'unresolved' }, event: carried },
      matches: [{ event: carried }],
    })
    expectHidden(node)
    expect((node as { data: { entries: unknown[]; progress: unknown[] } }).data.entries).toHaveLength(0)
    expect((node as { data: { entries: unknown[]; progress: unknown[] } }).data.progress).toHaveLength(0)
  })
  it('初始分页（start 被裁，matches 仍携带事件）：同判 hidden（progress 组同型）', () => {
    const carried = progressEvt(20, { taskKey: 'feat-x/1.9', status: 'running' })
    const node = forgeEventGroupDefinition.buildViewNode({
      key: 'k',
      id: 'forge-event-progress-20',
      matches: [{ event: carried }],
    })
    expectHidden(node)
    expect((node as { data: { progress: unknown[] } }).data.progress).toHaveLength(0)
  })
  it('progress 载荷畸形（progressEntryOf 回 undefined）：组空仍 hidden（不回 null——withdrew 红线）', () => {
    const malformed = { type: 'forge/progress', seq: 7, data: { sourceSlug: '', verb: 'claim' } }
    const node = forgeEventGroupDefinition.buildViewNode({
      key: 'k',
      id: 'forge-event-progress-7',
      matches: [{ event: malformed }],
    })
    expect(node).not.toBeNull()
    expectHidden(node)
    expect((node as { data: { progress: unknown[] } }).data.progress).toHaveLength(0)
  })
  it('非 forge source 消息（人类插话 / 注入）：组空仍 hidden（不产可见碎片卡）', () => {
    const human = forgeEventGroupDefinition.buildViewNode({ key: 'k', id: 'h9', matches: [{ event: humanMsg(9, 'h9', '继续') }] })
    expectHidden(human)
    expect((human as { data: { entries: unknown[] } }).data.entries).toHaveLength(0)
    const inject = forgeEventGroupDefinition.buildViewNode({ key: 'k', id: 'i9', matches: [{ event: injectMsg(10, 'i9') }] })
    expectHidden(inject)
    expect((inject as { data: { entries: unknown[] } }).data.entries).toHaveLength(0)
  })
  it('D1 单快照：context.current 恢复值只透传组数据——visible/anchorSeq 不由恢复值参与（原 visible 卡在 state 缺席帧降 hidden，改写自「visible 保 visible」用例）', () => {
    const group = { key: 'g1', firstSeq: 2, lastSeq: 6, isLatest: false, entries: [{ id: 'm1' }, { id: 'm2' }], progress: [] }
    const recovered = forgeEventGroupDefinition.buildViewNode({
      key: 'k',
      id: 'm2',
      current: new Map([['chat', { visibility: 'visible', anchorSeq: 9, data: group }]]),
    })
    // 判例 fafc1fb7 根治：决策只由当帧 fold 状态现算——恢复值不再把 hidden 帧顶回 visible
    expectHidden(recovered)
    expect((recovered as { anchorSeq: number }).anchorSeq).toBe(0) // fallbackSeq（无 start/matches 携带事件）
    expect((recovered as { data: { entries: unknown[] } }).data.entries).toHaveLength(2) // 组数据透传保真
    const handoff = forgeEventGroupDefinition.buildViewNode({
      key: 'k',
      id: 'm1',
      current: new Map([['chat', { visibility: 'hidden', anchorSeq: 6, data: group }]]),
    })
    expectHidden(handoff)
  })
  it('零数据（无 state/start/matches/current）：hidden 空组保底不变（不回 null——withdrew 红线）', () => {
    const node = forgeEventGroupDefinition.buildViewNode({ key: 'k', id: 'm1' })
    expectHidden(node)
    expect((node as { data: { entries: unknown[]; progress: unknown[] } }).data.entries).toHaveLength(0)
  })
})

describe('loop-card-task-context：ForgeProgressEntry expertKey 可选镜像（同语义窄收——畸形弃字段不抛）', () => {
  it('载荷携带 expertKey = 条目镜像；载荷畸形 expertKey（非 string）= 字段缺省不弃行', () => {
    const { stream } = simulate([
      progressEvt(4, { taskKey: 'feat-x/2.3', expertKey: 'squad/dev' }),
      progressEvt(5, { taskKey: 'feat-x/2.3', expertKey: 42 }),
    ])
    const group = stream.groups.at(-1)
    expect(group?.progress).toHaveLength(2)
    expect(group?.progress?.[0]).toMatchObject({ taskKey: 'feat-x/2.3', expertKey: 'squad/dev' })
    expect(group?.progress?.[1]?.expertKey).toBeUndefined()
  })
})

describe('triage attempt 序号镜像（bug df44fcfa——结构化载荷窄收，畸形弃字段不弃行）', () => {
  it('载荷携带 attempt = 条目镜像；畸形 attempt（非正整数）= 字段缺省不弃行；缺省容忍（旧载荷）', () => {
    const { stream } = simulate([
      progressEvt(4, { verb: 'triage', taskKey: 'feat-x/2.5', attempt: 1 }),
      progressEvt(5, { verb: 'triage', taskKey: 'feat-x/2.5', attempt: 0 }),
      progressEvt(6, { verb: 'triage', taskKey: 'feat-x/2.5', attempt: '2' }),
      progressEvt(7, { verb: 'triage', taskKey: 'feat-x/2.5' }),
    ])
    const group = stream.groups.at(-1)
    expect(group?.progress).toHaveLength(4)
    expect(group?.progress?.[0]?.attempt).toBe(1)
    expect(group?.progress?.[1]?.attempt).toBeUndefined()
    expect(group?.progress?.[2]?.attempt).toBeUndefined()
    expect(group?.progress?.[3]?.attempt).toBeUndefined()
  })
})

describe('D1+D3 形态回归：锚定/物化不随 turn 形态分叉（裁决让渡——折叠归属归官方谓词）', () => {
  it('工具收尾 turn（0e5eba85 场景）与正文收尾 turn：锚同为组末成员真实 seq', () => {
    const { nodes } = simulate([
      { type: 'turn/start', seq: 10, data: { turn: 7 } },
      forgeMsg(12, 'm1', '领取', 'a'),
      progressEvt(14, { taskKey: 'feat-x/1.11', status: 'completed', verb: 'settle' }),
      { type: 'assistant/message', seq: 16, data: { message: { content: [] } } },
      { type: 'tool/call', seq: 17, data: {} },
      { type: 'turn/end', seq: 20, data: { turn: 7, reason: { kind: 'completed' } } },
    ])
    expect(nodes.get('forge-event-progress-14')).toMatchObject({ anchorSeq: 14, visibility: 'visible' })
    expect(nodes.get('m1')).toMatchObject({ anchorSeq: 14 }) // 组末成员 = progress(14)
  })
  it('正文收尾 turn：锚维持组末成员真实 seq（数据即锚，口径统一）', () => {
    const { nodes } = simulate([
      { type: 'turn/start', seq: 10, data: { turn: 7 } },
      forgeMsg(12, 'm1', '完成', 'a'),
      { type: 'assistant/message', seq: 16, data: { message: { content: [{ type: 'text', text: '任务完成总结' }] } } },
      { type: 'turn/end', seq: 20, data: { turn: 7, reason: { kind: 'completed' } } },
    ])
    expect(nodes.get('m1')).toMatchObject({ anchorSeq: 12 })
  })
  it('fold 畸形防御：assistant 消息任意载荷一律原引用返回零污染（台账分支已拆除）', () => {
    const state = EMPTY_FORGE_EVENT_STREAM
    expect(foldForgeEventMessage(state, { type: 'assistant/message', seq: 9, data: { message: { content: [{ type: 'text', text: 'x' }] } } })).toBe(state)
    expect(foldForgeEventMessage(state, { type: 'assistant/message', seq: 9 })).toBe(state)
    expect(foldForgeEventMessage(state, { type: 'turn/start', seq: 8, data: { turn: 3 } })).toBe(state)
  })
  it('活跃 turn 期间（无 turn/end）锚 = 组末成员真实 seq', () => {
    const { nodes } = simulate([
      { type: 'turn/start', seq: 10, data: { turn: 7 } },
      forgeMsg(12, 'm1', '运行中', 'a'),
      { type: 'assistant/message', seq: 14, data: { message: { content: [] } } },
    ])
    expect(nodes.get('m1')).toMatchObject({ anchorSeq: 12 })
  })
})
