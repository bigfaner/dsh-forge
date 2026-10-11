// 1.17 · ForgeProgressNode 组件单测（renderToStaticMarkup 静态面——仓内同型先例）：
// 折叠单行摘要 + 详情两态标记 + 他形零残留。
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ForgeProgressNodeData } from './forge-progress-data.js'
import { ForgeProgressDetail, ForgeProgressNode, forgeProgressCountsLabel, forgeProgressSummary } from './ForgeProgressNode.js'

const DATA: ForgeProgressNodeData = {
  sourceSlug: 'feat-x',
  verb: 'claim',
  status: 'running',
  taskKey: 'feat-x/2.5',
  counts: { pending: 2, running: 1, done: 3 },
  at: new Date('2026-10-11T12:34:56').getTime(),
  seq: 7,
}

function nodeOf(data: unknown): { kind: string; data: unknown } {
  return { kind: 'forge-progress', data }
}

describe('forgeProgressSummary / countsLabel（纯模型面）', () => {
  it('摘要 = `动词 · 任务键 · 状态`；无任务键回退任务源', () => {
    expect(forgeProgressSummary(DATA)).toBe('领取 · feat-x/2.5 · 进行中')
    expect(forgeProgressSummary({ verb: 'settle', status: 'completed', sourceSlug: 'feat-x' })).toBe('结算 · feat-x · 已完成')
  })
  it('计数行 = `待执行 N · 执行中 N · 已完成 N`；缺席 = undefined', () => {
    expect(forgeProgressCountsLabel(DATA.counts)).toBe('待执行 2 · 执行中 1 · 已完成 3')
    expect(forgeProgressCountsLabel(undefined)).toBeUndefined()
  })
})

describe('ForgeProgressNode（DisclosureRow 同族折叠行）', () => {
  it('折叠行 = 单行摘要（展开前内容缝不渲染——DisclosureRow 折叠语义）', () => {
    const html = renderToStaticMarkup(<ForgeProgressNode node={nodeOf(DATA)} />)
    expect(html).toContain('领取 · feat-x/2.5 · 进行中') // 折叠 = 单行摘要
    expect(html).not.toContain('任务源') // 详情未展开
    expect(html).toContain('data-dswf-progress-status="running"') // 状态数据面（样式/测试锚）
  })
  it('展开态 = 事件详情（任务源/任务/状态/进度/时间——DisclosureRow 内容缝本体）', () => {
    const html = renderToStaticMarkup(<ForgeProgressDetail data={DATA} />)
    expect(html).toContain('任务源')
    expect(html).toContain('feat-x')
    expect(html).toContain('feat-x/2.5')
    expect(html).toContain('进行中')
    expect(html).toContain('待执行 2 · 执行中 1 · 已完成 3')
    expect(html).toContain('12:34:56') // 时间详情
  })
  it('他形数据 / kind 漂移 = null（官方流零残留）', () => {
    expect(renderToStaticMarkup(<ForgeProgressNode node={nodeOf({ sourceSlug: 'x' })} />)).toBe('')
    expect(renderToStaticMarkup(<ForgeProgressNode node={{ kind: 'other', data: DATA }} />)).toBe('')
    expect(renderToStaticMarkup(<ForgeProgressNode node={undefined as unknown as { kind: string; data: unknown }} />)).toBe('')
  })
})
