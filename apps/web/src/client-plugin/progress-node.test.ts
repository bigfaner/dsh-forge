// 1.17 · 'forge/progress' Chat 节点定义单测：match 判别（他事件零匹配）/ start-update /
// buildViewNode 形状 / 重放保真（fold 为日志纯函数——事件重放/会话 fork 保留渲染）。
import { describe, expect, it } from 'vitest'
import {
  FORGE_PROGRESS_EVENT_TYPE,
  FORGE_PROGRESS_NODE_KIND,
  forgeProgressDefinition,
  isForgeProgressNodeData,
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
      visibility: 'visible',
      data: DATA,
    })
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
  it('形状守卫：合法数据 true；他形/漂移 false', () => {
    expect(isForgeProgressNodeData({ ...DATA, seq: 7 })).toBe(true)
    expect(isForgeProgressNodeData(DATA)).toBe(false) // 缺 seq（节点数据必带时序锚）
    expect(isForgeProgressNodeData({ ...DATA, seq: 7, status: 'paused' })).toBe(false)
    expect(isForgeProgressNodeData(null)).toBe(false)
  })
})
