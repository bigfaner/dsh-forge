// 'forge/progress' 节点数据守卫单测（自 client-plugin/progress-node.test.ts 随模块迁壳树
// ——边界纪律见 forge-progress-data.ts 头注）。2026-10-12 报障收口：载荷无 seq（seq 在
// 事件信封层；节点时序锚 = anchorSeq）——守卫随 append 契约逐位对齐，缺 seq = 合法。
import { describe, expect, it } from 'vitest'
import { isForgeProgressNodeData } from './forge-progress-data.js'

const DATA = {
  sourceSlug: 'feat-x',
  verb: 'claim',
  status: 'running',
  taskKey: 'feat-x/2.5',
  counts: { pending: 1, running: 1, done: 0 },
  at: 1_700_000_000_000,
}

describe('isForgeProgressNodeData（形状守卫——append 契约逐位同，他形不猜不抛）', () => {
  it('append 契约形状（含可选位缺席/带信封 seq 残留）true', () => {
    expect(isForgeProgressNodeData(DATA)).toBe(true) // 契约整值（无 seq——载荷本就无此位）
    expect(isForgeProgressNodeData({ ...DATA, seq: 7 })).toBe(true) // 冗余位不拒（宽容他形 Extra）
    expect(isForgeProgressNodeData({ sourceSlug: 'feat-x', verb: 'settle', status: 'blocked', at: 1 })).toBe(true) // 可选位缺席
  })
  it('漂移/他形 false', () => {
    expect(isForgeProgressNodeData({ ...DATA, status: 'paused' })).toBe(false)
    expect(isForgeProgressNodeData({ ...DATA, verb: 'reboot' })).toBe(false)
    expect(isForgeProgressNodeData({ ...DATA, at: Number.NaN })).toBe(false)
    expect(isForgeProgressNodeData({ ...DATA, sourceSlug: '' })).toBe(false)
    expect(isForgeProgressNodeData({ ...DATA, taskKey: 42 })).toBe(false)
    expect(isForgeProgressNodeData(null)).toBe(false)
    expect(isForgeProgressNodeData(undefined)).toBe(false)
  })
})
