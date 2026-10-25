// 1.17 · ForgeProgressNode 组件单测（renderToStaticMarkup 静态面——仓内同型先例）：
// 折叠单行摘要 + 详情两态标记 + 他形零残留。2026-10-12「去掉状态计数」——进度行移除。
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ForgeProgressNodeData } from './forge-progress-data.js'
import { ForgeProgressDetail, ForgeProgressNode, forgeProgressSummary } from './ForgeProgressNode.js'

const DATA: ForgeProgressNodeData = {
  sourceSlug: 'feat-x',
  verb: 'claim',
  status: 'running',
  taskKey: 'feat-x/2.5',
  counts: { pending: 2, running: 1, done: 3 },
  at: new Date('2026-10-11T12:34:56').getTime(),
}

function nodeOf(data: unknown): { kind: string; data: unknown } {
  return { kind: 'forge-progress', data }
}

describe('forgeProgressSummary（纯模型面）', () => {
  it('摘要 = `动词 · 任务键 · 状态`；无任务键回退任务源', () => {
    expect(forgeProgressSummary(DATA)).toBe('领取 · feat-x/2.5 · 进行中')
    expect(forgeProgressSummary({ verb: 'settle', status: 'completed', sourceSlug: 'feat-x' })).toBe('结算 · feat-x · 已完成')
  })
  it('taskTitle 优先显示（任务键前）', () => {
    expect(forgeProgressSummary({ ...DATA, taskTitle: '登录修复' })).toBe('领取 · 登录修复 · 进行中')
    expect(forgeProgressSummary({ ...DATA, taskTitle: '登录修复', note: '等待外部任务先完成' })).toBe(
      '领取 · 登录修复 · 进行中 · 等待外部任务先完成',
    )
    expect(forgeProgressSummary({ ...DATA, note: '原因'.repeat(20) })).toBe(`领取 · feat-x/2.5 · 进行中 · ${'原因'.repeat(12)}…`)
  })
  it('verb 标签随扩展同步（新场景事件用户视角动词，不吞）', () => {
    expect(forgeProgressSummary({ verb: 'startup', status: 'running', sourceSlug: 'feat-x' })).toBe('启动 · feat-x · 进行中')
    expect(forgeProgressSummary({ verb: 'retry', status: 'running', sourceSlug: 'feat-x' })).toBe('自动重试 · feat-x · 进行中')
    expect(forgeProgressSummary({ verb: 'halt', status: 'blocked', sourceSlug: 'feat-x' })).toBe('受阻停止 · feat-x · 阻塞')
    expect(forgeProgressSummary({ verb: 'timeout', status: 'blocked', sourceSlug: 'feat-x' })).toBe('超时结束 · feat-x · 阻塞')
    expect(forgeProgressSummary({ verb: 'finish-all', status: 'completed', sourceSlug: 'feat-x' })).toBe('全部完成 · feat-x · 已完成')
    expect(forgeProgressSummary({ verb: 'loop', status: 'blocked', sourceSlug: 'feat-x' })).toBe('循环 · feat-x · 阻塞')
    expect(forgeProgressSummary({ verb: 'stop', status: 'interrupted', sourceSlug: 'feat-x' })).toBe('停止 · feat-x · 已中断')
  })
})

describe('ForgeProgressNode（DisclosureRow 同族折叠行）', () => {
  it('折叠行 = 单行摘要（展开前内容缝不渲染——DisclosureRow 折叠语义）', () => {
    const html = renderToStaticMarkup(<ForgeProgressNode node={nodeOf(DATA)} />)
    expect(html).toContain('领取 · feat-x/2.5 · 进行中') // 折叠 = 单行摘要
    expect(html).not.toContain('任务源') // 详情未展开
    expect(html).toContain('data-dswf-progress-status="running"') // 状态数据面（样式/测试锚）
  })
  it('展开态 = 事件详情（任务源/任务/状态/时间——零进度行；时间 = 完整本地日期时间）', () => {
    const html = renderToStaticMarkup(<ForgeProgressDetail data={DATA} />)
    expect(html).toContain('任务源')
    expect(html).toContain('feat-x')
    expect(html).toContain('feat-x/2.5')
    expect(html).toContain('进行中')
    expect(html).toContain('2026-10-11 12:34:56') // LocalDateTime 完整口径
    expect(html).not.toContain('待执行') // 2026-10-12「去掉状态计数」——进度行不再呈现
    expect(html).not.toContain('已完成 3')
  })
  it('展开态呈现扩展字段（taskTitle 优先 + 任务键括注；场景/备注行；扩展位缺席零残留）', () => {
    const html = renderToStaticMarkup(
      <ForgeProgressDetail
        data={{ ...DATA, taskTitle: '登录修复', scenario: 'blocked/with-fix', note: '等待外部任务先完成', status: 'blocked' }}
      />,
    )
    expect(html).toContain('登录修复')
    expect(html).toContain('feat-x/2.5') // taskTitle 优先、任务键括注保留
    expect(html).toContain('场景')
    expect(html).toContain('blocked/with-fix')
    expect(html).toContain('备注')
    expect(html).toContain('等待外部任务先完成')
    const bare = renderToStaticMarkup(<ForgeProgressDetail data={DATA} />)
    expect(bare).not.toContain('场景')
    expect(bare).not.toContain('备注')
  })
  it('他形数据 / kind 漂移 = null（官方流零残留）', () => {
    expect(renderToStaticMarkup(<ForgeProgressNode node={nodeOf({ sourceSlug: 'x' })} />)).toBe('')
    expect(renderToStaticMarkup(<ForgeProgressNode node={{ kind: 'other', data: DATA }} />)).toBe('')
    expect(renderToStaticMarkup(<ForgeProgressNode node={undefined as unknown as { kind: string; data: unknown }} />)).toBe('')
  })
})
