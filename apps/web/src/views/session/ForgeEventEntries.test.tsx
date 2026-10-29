// loop-event-delivery 1.9 · ForgeEventEntries 组件单测（renderToStaticMarkup 静态面——
// ForgeProgressNode.test 同型）：组头摘要 + 逐条行族色 + 他形零残留 + 默认展开语义。
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ForgeEventGroupData } from './forge-event-data.js'
import { ForgeEventEntries, forgeEventEntryDetail, forgeEventGroupSummary } from './ForgeEventEntries.js'

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
    expect(html).toContain('领取') // 剥掉 title 前缀后的徽记词 detail
    expect(html).not.toContain('领取 · 2.3 折叠条目组') // §2.5：summary 同文去重
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

// ─────────────────── 1.2 循环进度卡形态 ───────────────────

const progAt = (n: number): number => new Date(2026, 9, 24, 14, n, 0).getTime()

const PROGRESS = [
  { seq: 3, sourceSlug: 'feat-x', verb: 'startup', status: 'running', at: progAt(1), note: '从头执行' },
  { seq: 4, sourceSlug: 'feat-x', verb: 'claim', status: 'running', taskKey: 'feat-x/2.3', taskTitle: '折叠条目组', at: progAt(2) },
  {
    seq: 9,
    sourceSlug: 'feat-x',
    verb: 'settle',
    status: 'completed',
    taskKey: 'feat-x/2.3',
    taskTitle: '折叠条目组',
    at: progAt(30), // 28 分钟跨度
  },
]

const PROGRESS_DATA: ForgeEventGroupData = { ...DATA, lastSeq: 9, progress: PROGRESS }

describe('ForgeEventEntries 循环进度卡（1.2——任务行原地更新语义的呈现面）', () => {
  it('任务行 = 标题/状态/开始/结束/耗时（事件时戳口径）；同任务键后写覆盖单行', () => {
    const html = renderToStaticMarkup(<ForgeEventEntries node={nodeOf(PROGRESS_DATA)} />)
    expect(html).toContain('折叠条目组') // 任务标题（次写 taskTitle 保留）
    expect(html).toContain('data-dswf-progress-status="completed"') // 最新态（后写覆盖）
    expect(html).toContain('14:02:00') // 开始
    expect(html).toContain('14:30:00') // 结束
    expect(html).toContain('28分0秒') // 耗时 = 结束 − 开始
    expect(html).toContain('1 任务 · 今日 14:01–14:30') // 头计数：任务数 + 进度起止范围
  })
  it('bug 6a3ccc4d：纯 progress 组计数 = 卡内渲染行数（progress 行计入——（0）不再出现）', () => {
    const pure: ForgeEventGroupData = { ...PROGRESS_DATA, entries: [] }
    expect(forgeEventGroupSummary(pure)).toContain('（2）') // 循环行 1 + 任务行 1（同任务键后写覆盖单行）
    expect(forgeEventGroupSummary(pure)).not.toContain('（0）')
  })
  it('循环级事件收敛单行（最新覆盖——`循环`徽记 + 状态 + 备注），先于任务行', () => {
    const html = renderToStaticMarkup(<ForgeEventEntries node={nodeOf(PROGRESS_DATA)} />)
    expect(html).toContain('dswf-event-entries-loop')
    expect(html).toContain('循环')
    expect(html).toContain('14:01:00')
    expect(html.indexOf('dswf-event-entries-loop')).toBeLessThan(html.indexOf('dswf-event-entries-progress'))
  })
  it('执行中行：结束时刻 = 「—」、零耗时徽标', () => {
    const running: ForgeEventGroupData = { ...DATA, progress: [PROGRESS[1]!] }
    const html = renderToStaticMarkup(<ForgeEventEntries node={nodeOf(running)} />)
    expect(html).toContain('data-dswf-progress-status="running"')
    expect(html).toContain('执行中')
    expect(html).toContain('—')
    expect(html).not.toContain('dswf-event-entries-duration')
  })
  it('重试计数随进度事件持久（任务行渲染 note——组卡从投影/会话日志重建后仍可见，非仅活行瞬态）', () => {
    const retried: ForgeEventGroupData = {
      ...DATA,
      progress: [
        { seq: 4, sourceSlug: 'feat-x', verb: 'claim', status: 'running', taskKey: 'feat-x/2.3', taskTitle: '折叠条目组', at: progAt(2) },
        {
          seq: 5,
          sourceSlug: 'feat-x',
          verb: 'retry',
          status: 'blocked',
          taskKey: 'feat-x/2.3',
          taskTitle: '折叠条目组',
          note: '第 2/3 次 — worker crashed mid-run',
          at: progAt(4),
        },
      ],
    }
    const html = renderToStaticMarkup(<ForgeEventEntries node={nodeOf(retried)} />)
    expect(html).toContain('data-dswf-progress-status="blocked"') // 最新态（后写覆盖）
    expect(html).toContain('第 2/3 次 — worker crashed mid-run') // 重试计数（note）在行内
  })
  it('bug 35571877：条目行与任务行同构——文本在前、徽标右置、时间入右侧簇（归一类）', () => {
    const html = renderToStaticMarkup(<ForgeEventEntries node={nodeOf(DATA)} />)
    const textIdx = html.indexOf('dswf-event-entries-msg-text')
    const badgeIdx = html.indexOf('data-tone="run"') // 首条目徽标（启动）
    const timeIdx = html.indexOf('14:02:11')
    expect(textIdx).toBeGreaterThan(-1)
    expect(badgeIdx).toBeGreaterThan(textIdx) // 徽标在文本之后（右置，同任务行）
    expect(timeIdx).toBeGreaterThan(badgeIdx) // 时间在徽标之后（右侧簇）
    expect(html).toContain('dswf-event-entries-entry') // 行结构/对齐归一类（同任务行 center）
  })
  it('消息条目保留概要一行（结算/异常卡不重复展开明细）；progress 缺席 = 纯消息列表（旧形态兼容）', () => {
    const html = renderToStaticMarkup(<ForgeEventEntries node={nodeOf(DATA)} />)
    expect(html).not.toContain('领取 · 2.3 折叠条目组') // 消息条目 title/detail 去重（§2.5）
    expect(html).not.toContain('dswf-event-entries-progress')
    expect(html).toContain('3 条 · 今日 14:02–14:02')
  })
})

// ─────────────────── 2.5 条目行去重并换行 ───────────────────

describe('forgeEventEntryDetail（§2.5——summary 段命中 title 字面剥前缀）', () => {
  it('title 整段命中即剥（taskTitle/slug）；差异信息保留', () => {
    expect(forgeEventEntryDetail({ title: '2.3 折叠条目组', summary: '领取 · 2.3 折叠条目组' })).toBe('领取')
    expect(forgeEventEntryDetail({ title: '2.3', summary: '阻塞 · 2.3 · 已创建修复任务' })).toBe('阻塞 · 已创建修复任务')
    expect(forgeEventEntryDetail({ title: 'feat-x', summary: 'feat-x' })).toBe('')
  })
  it('未命中 / title 缺席 = summary 原样（数据面不动）', () => {
    expect(forgeEventEntryDetail({ title: 'a', summary: '启动 · 接续执行' })).toBe('启动 · 接续执行')
    expect(forgeEventEntryDetail({ title: '', summary: '启动' })).toBe('启动')
  })
  it('条目行 title 与 detail 分行渲染（msg-text 块级两行，不并一行）', () => {
    const html = renderToStaticMarkup(<ForgeEventEntries node={nodeOf(DATA)} />)
    expect(html).toContain('dswf-event-entries-msg-text')
    expect(html).toContain('dswf-event-entries-msg-detail')
    expect(html).not.toContain(' — ') // 不再同行 em-dash 拼接
  })
})
