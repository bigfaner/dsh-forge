// loop-event-delivery 1.9 · ForgeEventEntries 组件单测（renderToStaticMarkup 静态面——
// ForgeProgressNode.test 同型）：组头摘要 + 逐条行族色 + 他形零残留 + 默认展开语义。
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ForgeEventGroupData } from './forge-event-data.js'
import { ForgeEventEntries, forgeEventGroupSummary } from './ForgeEventEntries.js'

const entryBase = {
  seq: 7,
  time: new Date(2026, 9, 24, 14, 2, 11).getTime(),
  badge: '启动',
  title: 'loop-event-delivery',
  summary: '启动 · 接续执行',
  text: '[forge·启动] 任务源: loop-event-delivery（feature）',
}

const DATA: ForgeEventGroupData = {
  key: 'm1',
  firstSeq: 7,
  lastSeq: 9,
  isLatest: true,
  entries: [
    { ...entryBase, id: 'm1' },
    { ...entryBase, id: 'm2', seq: 8, badge: '领取', title: '2.3 折叠条目组', summary: '领取 · 2.3 折叠条目组' },
    { ...entryBase, id: 'm3', seq: 9, badge: '阻塞', title: '2.3', summary: '阻塞 · 2.3 · 已创建修复任务' },
  ],
}

function nodeOf(data: unknown, kind = 'forge-event-group'): { kind: string; data: unknown } {
  return { kind, data }
}

describe('forgeEventGroupSummary（组头单行摘要）', () => {
  it('`forge · 任务循环事件（N）· HH:mm–HH:mm`；单条只显一个时点', () => {
    expect(forgeEventGroupSummary(DATA)).toBe('forge · 任务循环事件（3）· 14:02–14:02')
    expect(forgeEventGroupSummary({ ...DATA, entries: [DATA.entries[0]!] })).toBe('forge · 任务循环事件（1）· 14:02')
  })
})

describe('ForgeEventEntries（折叠条目组块）', () => {
  it('组头 = `[forge·调度] {source}` + 右贴计数；展开逐条行（时间/场景章/任务标题/摘要）', () => {
    const html = renderToStaticMarkup(<ForgeEventEntries node={nodeOf(DATA)} />)
    expect(html).toContain('[forge·调度] loop-event-delivery') // 来源标识（任务源行值去修饰）
    expect(html).toContain('dswf-event-entries-count') // 计数右贴位
    expect(html).toContain('3 条 · 今日 14:02–14:02')
    expect(html).not.toContain('（feature）· </b>') // 来源修饰已剥
    expect(html).toContain('14:02:11') // 条目秒级时刻
    expect(html).toContain('2.3 折叠条目组') // 任务标题
    expect(html).toContain('领取 · 2.3 折叠条目组') // 摘要
    expect(html).toContain('data-tone="blk"') // 场景章族色（阻塞琥珀）
    expect(html).toContain('data-tone="run"') // 启动/领取 = 进行蓝
    expect(html).toContain('data-latest') // 最新组标记（默认展开语义锚）
  })
  it('任务源缺席 = 回落旧摘要串（计数并入标题，不叠贴）', () => {
    const noSource: ForgeEventGroupData = {
      ...DATA,
      entries: [{ ...DATA.entries[0]!, text: '[forge·启动] 无任务源行' }],
    }
    const html = renderToStaticMarkup(<ForgeEventEntries node={nodeOf(noSource)} />)
    expect(html).toContain('forge · 任务循环事件（1）· 14:02')
    expect(html).not.toContain('dswf-event-entries-count')
  })
  it('他形数据 / kind 漂移 = null（官方流零残留）', () => {
    expect(renderToStaticMarkup(<ForgeEventEntries node={nodeOf({ key: 'x' })} />)).toBe('')
    expect(renderToStaticMarkup(<ForgeEventEntries node={nodeOf(DATA, 'other')} />)).toBe('')
    expect(renderToStaticMarkup(<ForgeEventEntries node={undefined as unknown as { kind: string; data: unknown }} />)).toBe('')
  })
})
