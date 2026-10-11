// 'forge/progress' 节点数据守卫单测（自 client-plugin/progress-node.test.ts 随模块迁壳树
// ——边界纪律见 forge-progress-data.ts 头注）。
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

describe('isForgeProgressNodeData（形状守卫——他形不猜不抛）', () => {
  it('合法数据 true；他形/漂移 false', () => {
    expect(isForgeProgressNodeData({ ...DATA, seq: 7 })).toBe(true)
    expect(isForgeProgressNodeData(DATA)).toBe(false) // 缺 seq（节点数据必带时序锚）
    expect(isForgeProgressNodeData({ ...DATA, seq: 7, status: 'paused' })).toBe(false)
    expect(isForgeProgressNodeData(null)).toBe(false)
  })
})
