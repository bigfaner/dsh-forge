// 1.17 · 'forge/progress' Chat 节点定义单测：match 判别（他事件零匹配）/ start-update /
// buildViewNode 形状 / 重放保真（fold 为日志纯函数——事件重放/会话 fork 保留渲染）。
// 数据守卫面随模块迁壳树（views/session/forge-progress-data.test.ts——2026-10-11 报障收口）。
import { describe, expect, it } from 'vitest'
import {
  FORGE_PROGRESS_EVENT_TYPE,
  FORGE_PROGRESS_NODE_KIND,
  forgeProgressDefinition,
  type ForgeProgressEventLike,
} from './progress-node.js'

/** 事件构造（官方 SessionEvent 消费切片——type/data/seq） */
function evt(seq: number, data: unknown): ForgeProgressEventLike {
  return { type: FORGE_PROGRESS_EVENT_TYPE, seq, data }
}

const DATA = {
  sourceSlug: 'feat-x',
  verb: 'claim',
  status: 'running',
  taskKey: 'feat-x/2.5',
  counts: { pending: 1, running: 1, done: 0 },
  at: 1_700_000_000_000,
}

describe('forgeProgressDefinition（uiConversation.events.register 消费形状）', () => {
  it('match：forge/progress → {id, role start}（id 含 seq）；他事件/缺席 → null', () => {
    expect(forgeProgressDefinition.match(evt(7, DATA))).toEqual({ id: 'forge-progress-7', role: 'start' })
    expect(forgeProgressDefinition.match({ type: 'user/message', seq: 8 })).toBeNull()
    expect(forgeProgressDefinition.match({ type: 'command/run', seq: 9, data: {} })).toBeNull()
  })
  it('start/update/buildViewNode：节点 kind/anchorSeq/visibility 齐备——data 原样透传', () => {
    const state = forgeProgressDefinition.start(undefined, { event: evt(7, DATA) })
    expect(state).toEqual({ seq: 7, data: DATA })
    expect(forgeProgressDefinition.update({ state })).toBe(state) // 零折叠——状态原样
    const node = forgeProgressDefinition.buildViewNode({ key: 'k-1', id: 'forge-progress-7', state })
    expect(node).toEqual({
      key: 'k-1',
      kind: FORGE_PROGRESS_NODE_KIND,
      id: 'forge-progress-7',
      target: 'chat',
      anchorSeq: 7,
      location: { kind: 'unresolved' }, // location 契约必填——官方 store 直读 location.kind
      visibility: 'visible',
      data: DATA,
    })
  })
  it('buildViewNode location 透传：context 携带 start/matches location 时透传（contextLocation 同序）', () => {
    const state = forgeProgressDefinition.start(undefined, { event: evt(7, DATA) })
    const loc = { kind: 'step' as const, turn: { turn: 2, status: 'running' as const }, step: { step: 1 } }
    const viaStart = forgeProgressDefinition.buildViewNode({ key: 'k-1', id: 'i', state, start: { location: loc } })
    expect(viaStart?.location).toBe(loc)
    const viaMatches = forgeProgressDefinition.buildViewNode({
      key: 'k-2', id: 'i', state, matches: [{ location: loc }],
    })
    expect(viaMatches?.location).toBe(loc)
  })
  it('零折叠·seq 天然交错：两枚事件各自独立成节点（anchorSeq 各归各事件）', () => {
    const n1 = forgeProgressDefinition.buildViewNode({
      key: 'k-1',
      id: 'forge-progress-7',
      state: forgeProgressDefinition.start(undefined, { event: evt(7, DATA) }),
    })
    const n2 = forgeProgressDefinition.buildViewNode({
      key: 'k-2',
      id: 'forge-progress-11',
      state: forgeProgressDefinition.start(undefined, {
        event: evt(11, { ...DATA, verb: 'settle', status: 'completed', at: DATA.at + 5_000 }),
      }),
    })
    expect(n1?.anchorSeq).toBe(7)
    expect(n2?.anchorSeq).toBe(11)
    expect(n1?.id).not.toBe(n2?.id)
  })
  it('重放保真：同日志重放（fold 纯函数）节点恒等（事件重放/会话 fork 保留渲染）', () => {
    const fold = (): unknown[] =>
      [evt(7, DATA), evt(11, { ...DATA, verb: 'settle', status: 'completed' })].map((event) => {
        const state = forgeProgressDefinition.start(undefined, { event })
        return forgeProgressDefinition.buildViewNode({ key: `k-${event.seq}`, id: `forge-progress-${event.seq}`, state })
      })
    expect(fold()).toEqual(fold())
  })
})
