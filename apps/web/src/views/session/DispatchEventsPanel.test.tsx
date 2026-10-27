// DispatchEventsPanel 单测（loop-event-delivery 1.8）——悬浮进度流面板（派发任务面板的
// 继任面）。数据 = 账本行 projectionValues['forge-dispatch-events'] 窄读 + 官方账本 store
// subscribe 实时刷新（零新增读取 API）；条目按场景码 major 分组渲染；行状态章 = 载荷
// status 四值；行点击 = workerSessionId 跳 worker 子会话（缺席回退父反查兜底）。
// 渲染断言经 renderToStaticMarkup（零 effect 同全仓口径——DispatchPanel.test 同径）。
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  DEP_BADGE_WIDTH,
  DEP_WIDTH,
  DispatchEventsPanel,
  DispatchEventsPanelBody,
  aggregateDispatchRowItems,
  aggregateDispatchRows,
  dispatchBadgePointerIsClick,
  dispatchEventClockLabel,
  dispatchEventDetailOf,
  dispatchEventDurationLabel,
  dispatchEventNoteOf,
  dispatchEventStats,
  dispatchEventTitleOf,
  dispatchEventsAnchor,
  dispatchEventsDragPosition,
  dispatchEventsOf,
  dispatchFollowKeyOf,
  dispatchLoopInstanceEntries,
  dispatchPanelEntriesOf,
  dispatchPanelTaskCountOf,
  dispatchWindowLost,
  isLoopInstanceEndEntry,
  isLoopInstanceStartEntry,
  dispatchPanelBadgeAnchor,
  dispatchPanelExpandGeometry,
  dispatchPanelBadgeGeometry,
  dispatchRowSessionOf,
  type DispatchAnchorRects,
  type DispatchEventEntry,
  type DispatchPanelGeometry,
} from './DispatchEventsPanel.js'
import type { LedgerSessionsSnapshot, SnapshotSource } from '../sidebar/sidebar-model.js'

// ─────────────────── 夹具 ───────────────────

function entry(overrides: Partial<DispatchEventEntry> = {}): DispatchEventEntry {
  return {
    sourceSlug: 'feat-x',
    verb: 'claim',
    status: 'running',
    taskKey: 'feat-x/2.4',
    taskTitle: 'web 进度流渲染',
    at: Date.parse('2026-10-24T14:02:19Z'),
    ...overrides,
  }
}

/** 账本快照（projectionValues 携带 forge-dispatch-events 投影整值） */
function ledgerWith(projectionValues: unknown): LedgerSessionsSnapshot {
  return {
    ids: ['s-1'],
    byId: { 's-1': { id: 's-1', displayTitle: '编排', updatedAt: 0, projectionValues: projectionValues as never } },
    phase: 'ready',
  }
}

/** 账本快照源窄面（SSR 渲染面只消费 getSnapshot——subscribe 零注册） */
function sourceOf(snap: LedgerSessionsSnapshot): SnapshotSource<LedgerSessionsSnapshot> {
  return { getSnapshot: () => snap, subscribe: () => () => {} }
}

function body(overrides: Partial<Parameters<typeof DispatchEventsPanelBody>[0]> = {}): string {
  const props: Parameters<typeof DispatchEventsPanelBody>[0] = {
    entries: [entry()],
    total: 1,
    geometry: { left: 900, top: 96 },
    collapsed: false,
    dragged: false,
    now: Date.parse('2026-10-24T14:05:00Z'),
    onCollapse: () => {},
    onExpand: () => {},
    onOpenWorker: undefined,
    ...overrides,
  }
  return renderToStaticMarkup(<DispatchEventsPanelBody {...props} />)
}

// ─────────────────── 投影窄读 ───────────────────

describe('dispatchEventsOf（projectionValues 按键窄读——形状防御）', () => {
  const VIEW = { entries: [entry()], total: 3 }
  it('bug e56d8351：传入 projectionValues 映射自身按键窄读 forge-dispatch-events（非直喂视图）', () => {
    expect(dispatchEventsOf({ 'forge-dispatch-events': VIEW })).toEqual(VIEW)
    expect(dispatchEventsOf({ 'other-key': VIEW })).toBeUndefined()
    expect(dispatchEventsOf({})).toBeUndefined()
  })
  it('键缺席/形状漂移 → undefined（面板隐藏）', () => {
    expect(dispatchEventsOf(undefined)).toBeUndefined()
    expect(dispatchEventsOf('garbage')).toBeUndefined()
    expect(dispatchEventsOf({ 'forge-dispatch-events': { entries: 'x', total: 1 } })).toBeUndefined()
    expect(dispatchEventsOf({ 'forge-dispatch-events': { entries: [], total: 'x' } })).toBeUndefined()
  })
  it('畸形条目逐条剔除（合法行保留——渲染面不猜不炸）', () => {
    const view = dispatchEventsOf({ 'forge-dispatch-events': { entries: [entry(), { sourceSlug: '' }, 42], total: 3 } })
    expect(view?.entries).toHaveLength(1)
    expect(view?.total).toBe(3)
  })
  it('1.16 pending 可选字段：数字透传 / 缺席 undefined / 错型整体拒绝', () => {
    expect(dispatchEventsOf({ 'forge-dispatch-events': { entries: [], total: 0, pending: 4 } })?.pending).toBe(4)
    expect(dispatchEventsOf({ 'forge-dispatch-events': { entries: [], total: 0 } })?.pending).toBeUndefined()
    expect(dispatchEventsOf({ 'forge-dispatch-events': { entries: [], total: 0, pending: 'x' } })).toBeUndefined()
  })
})

// ─────────────────── 任务键行聚合 / 备注行 / 跳转锚 ───────────────────

describe('aggregateDispatchRows（1.16 任务键时间线——每任务最新态一行）', () => {
  it('每任务最新态一行（后写覆盖），行按时间时序；循环级事件各占一行', () => {
    const rows = aggregateDispatchRows([
      entry({ taskKey: 'a', at: 100 }),
      entry({ taskKey: 'b', verb: 'settle', status: 'completed', scenario: 'task/complete', at: 200 }),
      entry({ taskKey: 'a', at: 150 }), // a 的最新态
      entry({ taskKey: undefined, verb: 'finish-all', status: 'completed', scenario: 'loop/finish-all', at: 300 }),
    ])
    expect(rows.map((r) => r.taskKey ?? r.verb)).toEqual(['a', 'b', 'finish-all'])
    expect(rows[0]?.at).toBe(150)
  })
  it('池级 pending 快照（pool/pending）不进时间线——只承载统计条计数', () => {
    const rows = aggregateDispatchRows([
      entry({ taskKey: 'a', at: 100 }),
      entry({ taskKey: undefined, verb: 'loop', scenario: 'pool/pending', at: 150 }),
    ])
    expect(rows).toHaveLength(1)
  })
  it('bug 3bd8b829：claim/spawned 确认事件后写覆盖——执行中行即取到 workerSessionId（可交互）', () => {
    const rows = aggregateDispatchRows([
      entry({ taskKey: 'a', scenario: 'claim/new', at: 100 }),
      entry({ taskKey: 'a', scenario: 'claim/spawned', workerSessionId: 'w-1', at: 150 }),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: 'running', scenario: 'claim/spawned', workerSessionId: 'w-1' })
    // 行可交互：聚合行跳转锚直跳命中（↗ 徽标 + 点击打开 worker 子会话）
    expect(dispatchRowSessionOf(rows[0]!, undefined)).toBe('w-1')
    const markup = body({ entries: rows, onOpenWorker: () => {} })
    expect(markup).toContain('role="button"')
    expect(markup).toContain('data-dswf-dep-row="w-1"')
    expect(markup).toContain('data-dswf-dep-jump')
    expect(markup).toContain('dswf-dep-status-run">执行中')
    expect(markup).toContain('dswf-dep-row-title">web 进度流渲染') // 次行 title 独占（bug 3d05b2d7 口径）
  })
})

describe('aggregateDispatchRowItems（聚合行携启动时间——任务键首事件时戳）', () => {
  it('同任务键首事件时戳 = startAt（终态后写覆盖不前移）；循环级单行 = 自身时戳', () => {
    const rows = aggregateDispatchRowItems([
      entry({ taskKey: 'a', at: 100 }),
      entry({ taskKey: 'a', verb: 'settle', status: 'completed', scenario: 'task/complete', at: 900 }),
      entry({ taskKey: undefined, verb: 'finish-all', status: 'completed', scenario: 'loop/finish-all', at: 300 }),
    ])
    expect(rows.map((r) => r.entry.taskKey ?? r.entry.verb)).toEqual(['finish-all', 'a'])
    expect(rows[0]?.startAt).toBe(300)
    expect(rows[1]?.startAt).toBe(100)
    expect(rows[1]?.entry.at).toBe(900)
  })
  it('行序 = 纯时序（执行中行不置顶——可见性由滚动跟随承担）', () => {
    const rows = aggregateDispatchRowItems([
      entry({ taskKey: 'b', verb: 'settle', status: 'completed', scenario: 'task/complete', at: 200 }),
      entry({ taskKey: 'c', at: 300 }),
      entry({ taskKey: 'd', at: 400 }),
      entry({ taskKey: 'd', verb: 'settle', status: 'completed', scenario: 'task/complete', at: 500 }),
      entry({ taskKey: 'z', at: 900 }),
    ])
    expect(rows.map((r) => r.entry.taskKey)).toEqual(['b', 'c', 'd', 'z'])
  })
  it('aggregateDispatchRows 条目视图与 items 同序同集', () => {
    const entries = [entry({ taskKey: 'a', at: 100 }), entry({ taskKey: 'a', at: 150 })]
    expect(aggregateDispatchRows(entries)).toEqual(aggregateDispatchRowItems(entries).map((r) => r.entry))
  })
})

describe('dispatchEventClockLabel / dispatchEventDurationLabel（绝对启动时间 + 耗时标签）', () => {
  it('时钟 = 本地时区 YYYY-MM-DD HH:mm（两位补零）', () => {
    const ts = new Date(2026, 9, 24, 14, 5).getTime()
    expect(dispatchEventClockLabel(ts)).toBe('2026-10-24 14:05')
    expect(dispatchEventClockLabel(new Date(2026, 0, 3, 8, 7).getTime())).toBe('2026-01-03 08:07')
  })
  it('耗时 zh 紧凑两段档', () => {
    expect(dispatchEventDurationLabel(0, 45_000)).toBe('45秒')
    expect(dispatchEventDurationLabel(0, 185_000)).toBe('3分5秒')
    expect(dispatchEventDurationLabel(0, 3 * 3600_000 + 5 * 60_000)).toBe('3小时5分')
    expect(dispatchEventDurationLabel(0, 2 * 86400_000 + 3 * 3600_000)).toBe('2天3小时')
    expect(dispatchEventDurationLabel(5_000, 1_000)).toBe('0秒')
  })
})

describe('dispatchEventDetailOf（标题次行补充语义——状态词由徽标承载）', () => {
  it('场景章 + 注记（不含状态词头）；全缺 = undefined', () => {
    expect(dispatchEventDetailOf(entry({ scenario: 'claim/spawned' }))).toBe('已启动执行')
    expect(dispatchEventDetailOf(entry({ status: 'blocked', scenario: 'blocked/with-fix', note: '投影类型缺失' }))).toBe(
      '已带修复 · 投影类型缺失',
    )
    expect(dispatchEventDetailOf(entry({ scenario: 'claim/new', note: '窄读类型缺失' }))).toBe('领取 · 窄读类型缺失')
    expect(dispatchEventDetailOf(entry())).toBeUndefined()
  })
})

describe('dispatchEventNoteOf（备注行「状态 · 摘要」——分组/章语义并入文案）', () => {
  it('状态词 + 场景章 + 叙述注记', () => {
    expect(dispatchEventNoteOf(entry({ scenario: 'claim/new' }))).toBe('执行中 · 领取')
    expect(dispatchEventNoteOf(entry({ verb: 'settle', status: 'completed', scenario: 'task/complete', note: '契约测试 8 通过' }))).toBe(
      '完成 · 契约测试 8 通过',
    )
    expect(dispatchEventNoteOf(entry({ scenario: 'blocked/auto-fixed', status: 'blocked', note: '窄读类型缺失' }))).toBe(
      '阻塞 · 已自动处理 · 窄读类型缺失',
    )
  })
  it('仅状态可辨（无场景无注记）= undefined 不渲染备注行', () => {
    expect(dispatchEventNoteOf(entry())).toBeUndefined()
  })
})

describe('dispatchFollowKeyOf（滚动跟随键——当前执行中任务身份）', () => {
  it('执行中行 = taskKey（循环级行兜底 verb）；无执行中行 = undefined', () => {
    expect(dispatchFollowKeyOf(aggregateDispatchRowItems([entry({ taskKey: 'a', at: 100 })]))).toBe('a')
    expect(
      dispatchFollowKeyOf(
        aggregateDispatchRowItems([
          entry({ taskKey: 'b', verb: 'settle', status: 'completed', scenario: 'task/complete', at: 100 }),
        ]),
      ),
    ).toBeUndefined()
    expect(
      dispatchFollowKeyOf(
        aggregateDispatchRowItems([
          entry({ taskKey: undefined, verb: 'finish-all', status: 'completed', scenario: 'loop/finish-all', at: 100 }),
          entry({ taskKey: 'c', at: 200 }),
        ]),
      ),
    ).toBe('c')
  })
})

describe('dispatchRowSessionOf（跳转锚——直跳 → 父反查命中 → 落空非交互）', () => {
  it("workerSessionId 在场直跳；缺席走反查表；落空（''）= undefined", () => {
    const e = entry({ workerSessionId: 'w-1' })
    expect(dispatchRowSessionOf(e, undefined)).toBe('w-1')
    const plain = entry()
    expect(dispatchRowSessionOf(plain, new Map([['feat-x/2.4', 'w-2']]))).toBe('w-2')
    expect(dispatchRowSessionOf(plain, new Map([['feat-x/2.4', '']]))).toBeUndefined()
    expect(dispatchRowSessionOf(plain, undefined)).toBeUndefined()
    expect(dispatchRowSessionOf(entry({ taskKey: undefined }), new Map<string, string>())).toBeUndefined()
  })
})

// ─────────────────── 状态 / 统计 / 标题 ───────────────────

describe('状态章与统计（执行中/已完成/阻塞/已中断——⑰ inFlightTaskKey 中断态随载荷）', () => {
  it('dispatchEventStats：任务键最新态归桶；循环级事件不计', () => {
    const stats = dispatchEventStats([
      entry({ taskKey: 'a', status: 'running' }),
      entry({ taskKey: 'a', status: 'completed' }),
      entry({ taskKey: 'b', status: 'blocked', scenario: 'blocked/with-fix' }),
      entry({ taskKey: 'c', status: 'interrupted', verb: 'stop', scenario: 'loop/stopped' }),
      entry({ taskKey: undefined, status: 'completed', verb: 'finish-all', scenario: 'loop/finish-all' }),
    ])
    expect(stats).toEqual({ running: 0, completed: 1, blocked: 1, interrupted: 1 })
  })
  it('dispatchEventTitleOf：taskTitle 优先 → taskKey → sourceSlug 兜底', () => {
    expect(dispatchEventTitleOf(entry())).toBe('web 进度流渲染')
    expect(dispatchEventTitleOf(entry({ taskTitle: undefined }))).toBe('feat-x/2.4')
    expect(dispatchEventTitleOf(entry({ taskTitle: undefined, taskKey: undefined }))).toBe('feat-x')
  })
})

// ─────────────────── 纯渲染（展开面板形态） ───────────────────

describe('DispatchEventsPanelBody 纯渲染（展开态）', () => {
  it('面板壳 + head（任务进度 + live · 不经模型）+ 折叠钮', () => {
    const markup = body()
    expect(markup).toContain('data-dswf-dep')
    expect(markup).toContain('任务进度')
    expect(markup).toContain('live · 不经模型')
    expect(markup).toContain('data-dswf-dep-collapse')
  })
  it('双行任务轨行形态：rail + 状态点色档 + 首行 key/状态徽标 + 次行 title + 场景章补充', () => {
    const markup = body({
      entries: [
        entry({ taskKey: 'a', scenario: 'claim/new', at: 100 }),
        entry({ taskKey: 'b', verb: 'settle', status: 'completed', scenario: 'task/complete', at: 200 }),
      ],
      total: 2,
    })
    expect(markup).toContain('dswf-dep-rail')
    expect(markup).toContain('dswf-dep-run')
    expect(markup).toContain('dswf-dep-done')
    expect(markup).toContain('dswf-dep-row-key">b')
    expect(markup).toContain('dswf-dep-status-done">完成')
    expect(markup).toContain('dswf-dep-status-run">执行中')
    expect(markup).toContain('data-dswf-dep-running')
    expect(markup).not.toContain('data-dswf-dep-group')
  })
  it('bug 3d05b2d7：任务行首行 = key + 状态徽标 + 时间 + 耗时 + 跳转同线；次行 = title 独占（过长省略，零 detail 混入）', () => {
    const e = entry({ scenario: 'claim/spawned', workerSessionId: 'w-1' })
    const markup = body({ entries: [e], now: e.at + 185_000, onOpenWorker: () => {} })
    expect(markup).not.toContain('dswf-dep-row-full')
    // 首行同线序：key → 状态徽标 → 时间 → 耗时 → 跳转
    const keyAt = markup.indexOf('dswf-dep-row-key">feat-x/2.4')
    const badgeAt = markup.indexOf('dswf-dep-status-run')
    const timeAt = markup.indexOf('dswf-dep-row-time')
    const durAt = markup.indexOf('dswf-dep-row-dur')
    const jumpAt = markup.indexOf('data-dswf-dep-jump')
    expect(Math.min(keyAt, badgeAt, timeAt, durAt, jumpAt)).toBe(keyAt)
    expect(badgeAt).toBeLessThan(timeAt)
    expect(timeAt).toBeLessThan(durAt)
    expect(durAt).toBeLessThan(jumpAt)
    expect(markup).toContain(`dswf-dep-row-time">${dispatchEventClockLabel(e.at)}`)
    expect(markup).toContain('dswf-dep-row-dur">3分5秒')
    // 次行 = title 独占（detail 不混入任务行）
    expect(markup).toContain('dswf-dep-row-title">web 进度流渲染')
    expect(markup).not.toContain('已启动执行')
  })
  it('bug 3d05b2d7：执行中行与终态行同构（同一双行形态——无状态特例分支）', () => {
    const running = body({ entries: [entry({ scenario: 'claim/spawned' })], now: Date.parse('2026-10-24T14:05:00Z') })
    const done = body({ entries: [entry({ verb: 'settle', status: 'completed', scenario: 'task/complete' })] })
    for (const markup of [running, done]) {
      expect(markup).toContain('dswf-dep-row-head')
      expect(markup).toContain('dswf-dep-row-title')
    }
    expect(running).toContain('dswf-dep-status-run">执行中')
    expect(done).toContain('dswf-dep-status-done">完成')
  })
  it('bug 7114a5a0：循环级行 = slug + 循环徽标 + action 简要说明（次行）', () => {
    const markup = body({
      entries: [entry({ taskKey: undefined, taskTitle: undefined, verb: 'stop', status: 'interrupted', scenario: 'loop/stopped', note: '按你的指令停止' })],
    })
    expect(markup).toContain('dswf-dep-row-key">feat-x')
    expect(markup).toContain('dswf-dep-status-loop">循环')
    expect(markup).toContain('dswf-dep-row-title">已停止 · 按你的指令停止')
  })
  it('耗时徽标口径：执行中 = now 起算实时耗时；终态单事件行（时长不可辨）不呈现', () => {
    const start = Date.parse('2026-10-24T14:00:00Z')
    const running = body({
      entries: [entry({ taskKey: 'a', at: start }), entry({ taskKey: 'a', scenario: 'claim/spawned', at: start + 60_000 })],
      now: start + 125_000,
    })
    expect(running).toContain('dswf-dep-row-dur">2分5秒')
    const terminal = body({ entries: [entry({ verb: 'settle', status: 'completed', scenario: 'task/complete' })] })
    expect(terminal).not.toContain('dswf-dep-row-dur')
    const terminalSpan = body({
      entries: [entry({ taskKey: 'b', at: 0 }), entry({ taskKey: 'b', verb: 'settle', status: 'completed', scenario: 'task/complete', at: 75_000 })],
      now: 90_000,
    })
    expect(terminalSpan).toContain('dswf-dep-row-dur">1分15秒')
  })
  it('循环级瞬时事件（无 taskKey）= 无耗时徽标；任务行执行中 = now 起算实时耗时', () => {
    const start = Date.parse('2026-10-24T14:00:00Z')
    const markup = body({
      entries: [
        entry({ taskKey: undefined, verb: 'finish-all', status: 'completed', scenario: 'loop/finish-all', at: start }),
        entry({ taskKey: 'a', at: start }),
      ],
      now: start + 185_000,
    })
    const dur = markup.match(/dswf-dep-row-dur">([^<]+)</)
    expect(dur).not.toBeNull()
    expect(dur![1]).toBe('3分5秒')
    // 仅任务行一枚耗时徽标（循环级瞬时行零徽标）；循环级行 = 「循环」独特徽标（中性档）
    expect(markup.split('dswf-dep-row-dur').length - 1).toBe(1)
    expect(markup).toContain('dswf-dep-status-loop">循环')
    expect(markup).not.toContain('dswf-dep-status-done')
  })
  it('无 taskTitle 行 = 仅 key 首行（title 兜底链不重复次行）', () => {
    const markup = body({ entries: [entry({ taskTitle: undefined })] })
    expect(markup).toContain('dswf-dep-row-key">feat-x/2.4')
    expect(markup).not.toContain('dswf-dep-row-title')
  })
  it('行点击跳 worker 子会话：直跳行 = role button + jump 徽标；反查命中行同交互；落空 = 非交互无徽标', () => {
    const direct = body({ entries: [entry({ workerSessionId: 'w-1' })], onOpenWorker: () => {} })
    expect(direct).toContain('role="button"')
    expect(direct).toContain('data-dswf-dep-row="w-1"')
    expect(direct).toContain('data-dswf-dep-jump')
    const resolved = body({
      entries: [entry()],
      onOpenWorker: () => {},
      resolvedWorker: new Map([['feat-x/2.4', 'w-2']]),
    })
    expect(resolved).toContain('role="button"')
    expect(resolved).toContain('data-dswf-dep-row="w-2"')
    const plain = body({ entries: [entry()], onOpenWorker: () => {} })
    expect(plain).not.toContain('role="button"')
    expect(plain).not.toContain('data-dswf-dep-jump')
    const noFace = body({ entries: [entry({ workerSessionId: 'w-1' })] })
    expect(noFace).not.toContain('role="button"')
  })
  it('底部统计条：完成/执行中/阻塞/已中断 + 待执行（pending 在场呈现，缺席不呈现）', () => {
    const withPending = body({
      entries: [entry({ status: 'completed', verb: 'settle', scenario: 'task/complete' }), entry()],
      total: 3,
      pending: 2,
    })
    expect(withPending).toContain('data-dswf-dep-stat')
    expect(withPending).toContain('待执行')
    expect(withPending).toContain('完成')
    const withoutPending = body({ entries: [entry()], total: 1 })
    expect(withoutPending).toContain('data-dswf-dep-stat')
    expect(withoutPending).not.toContain('待执行')
  })
})

// ─────────────────── 纯渲染（⟡N 悬浮球折叠态——半透明） ───────────────────

describe('DispatchEventsPanelBody 纯渲染（折叠悬浮球）', () => {
  it('半透明悬浮球 = 计数 + 展开锚；两态切换锚齐备', () => {
    const markup = body({ collapsed: true })
    expect(markup).toContain('data-dswf-dep-badge')
    expect(markup).toContain('data-dswf-dep-badge-count')
    expect(markup).toContain('aria-label="展开任务进度面板"')
  })
})

// ─────────────────── 几何纯函数（锚定/拖移/两态承接） ───────────────────

describe('几何纯函数（对话列右上锚 + 视口钳制拖移 + 展开/折叠承接）', () => {
  const rects: DispatchAnchorRects = {
    convRight: 1280,
    convTop: 64,
    tabsBottom: 96,
    viewportWidth: 1440,
  }
  it('默认锚 = 对话列右缘内收 16 + 页签行下沿 + 8；宽度 = 480 单源', () => {
    expect(DEP_WIDTH).toBe(480)
    const anchor = dispatchEventsAnchor(rects)
    expect(anchor.top).toBe(104)
    // rightGap = viewport - convRight + 16（dock 展开随对话列左移的同径几何）
    expect(anchor.left).toBe(784)
  })
  it('拖移钳制：四向边距 4，纵向顶出保头行可拖回', () => {
    const start: DispatchPanelGeometry = { left: 700, top: 300 }
    const next = dispatchEventsDragPosition(start, { x: 0, y: 0 }, { x: 4000, y: -400 }, { width: 1440, height: 900 })
    expect(next.left).toBe(1440 - 4 - DEP_WIDTH)
    expect(next.top).toBe(4)
  })
  it('悬浮球锚 = 面板右上角；拖移位优先；展开承接角标位', () => {
    expect(DEP_BADGE_WIDTH).toBe(52)
    const anchor = dispatchEventsAnchor(rects)
    const badge = dispatchPanelBadgeAnchor(anchor)
    expect(badge).toEqual({ left: anchor.left + DEP_WIDTH - DEP_BADGE_WIDTH, top: anchor.top })
    expect(dispatchPanelBadgeGeometry(null, anchor)).toEqual(anchor)
    expect(dispatchPanelBadgeGeometry({ left: 10, top: 20 }, anchor)).toEqual({ left: 10, top: 20 })
    const expand = dispatchPanelExpandGeometry({ left: 10, top: 20 }, null, anchor)
    expect(expand).toEqual({ dragged: true, geometry: { left: 10, top: 20 } })
    expect(dispatchPanelExpandGeometry(null, null, anchor)).toEqual({ dragged: false, geometry: anchor })
  })
  it('角标位移斜差判点击（≤3px = 点击展开）', () => {
    expect(dispatchBadgePointerIsClick({ x: 10, y: 10 }, { x: 12, y: 9 })).toBe(true)
    expect(dispatchBadgePointerIsClick({ x: 10, y: 10 }, { x: 30, y: 10 })).toBe(false)
  })
})

// ─────────────────── 装载壳（可见性 + SSR 首帧） ───────────────────

describe('DispatchEventsPanel 装载壳（SSR 首帧——effect 零执行）', () => {
  it('账本缺席 = null（不崩不出场）', () => {
    expect(renderToStaticMarkup(<DispatchEventsPanel sessionId="s-1" />)).toBe('')
  })
  it('非循环会话（投影键缺席/零条目）= 可见性判读隐藏（dispatchEventsOf 零条目）', () => {
    expect(dispatchEventsOf(undefined)).toBeUndefined()
    expect(dispatchEventsOf({ 'forge-dispatch-events': { entries: [], total: 0 } })?.entries).toHaveLength(0)
  })
  it('SSR 首帧（effect 零执行——锚定缺席不出场）；可见性条目判读 + 锚定归 e2e', () => {
    expect(renderToStaticMarkup(<DispatchEventsPanel sessionId="s-1" />)).toBe('')
    expect(
      renderToStaticMarkup(
        <DispatchEventsPanel sessionId="s-1" sessions={sourceOf(ledgerWith({ entries: [entry()], total: 1 }))} />,
      ),
    ).toBe('')
  })
})

// ─────────────────── 循环实例边界 + 回放兜底 + 小球口径（loop-message-consolidation 1.3） ───────────────────

describe('循环实例边界标记（启动 ↔ 结算/停止配对）', () => {
  it('启动标记 = 循环级 startup；终局标记 = 循环级 settle/stop/halt/timeout', () => {
    expect(isLoopInstanceStartEntry(entry({ taskKey: undefined, taskTitle: undefined, verb: 'startup', scenario: 'startup/from-scratch' }))).toBe(true)
    expect(isLoopInstanceStartEntry(entry({ verb: 'startup' }))).toBe(false) // 任务级不算
    expect(isLoopInstanceStartEntry(entry({ taskKey: undefined, taskTitle: undefined, verb: 'claim' }))).toBe(false)
    for (const verb of ['settle', 'stop', 'halt', 'timeout'] as const) {
      expect(isLoopInstanceEndEntry(entry({ taskKey: undefined, taskTitle: undefined, verb, status: 'completed' }))).toBe(true)
      expect(isLoopInstanceEndEntry(entry({ verb, status: 'completed' }))).toBe(false) // 任务级结算不算
    }
    expect(isLoopInstanceEndEntry(entry({ taskKey: undefined, taskTitle: undefined, verb: 'loop' }))).toBe(false)
  })
})

describe('dispatchLoopInstanceEntries（会话日志回放筛选——按容器圈定本循环实例）', () => {
  const loopRow = (overrides: Partial<DispatchEventEntry>): DispatchEventEntry => entry({ taskKey: undefined, taskTitle: undefined, ...overrides })
  const t = Date.parse('2026-10-28T10:00:00Z')

  it('多实例会话：以最近一枚启动为界配对结算——各实例任务正确归属（前轮不混入）', () => {
    const log = [
      loopRow({ verb: 'startup', scenario: 'startup/from-scratch', at: t }),
      entry({ taskKey: 'feat-x/1.1', at: t + 1 }),
      entry({ taskKey: 'feat-x/1.1', verb: 'settle', status: 'completed', scenario: 'task/complete', at: t + 2 }),
      loopRow({ verb: 'settle', status: 'completed', scenario: 'loop/finish-all', at: t + 3 }),
      loopRow({ verb: 'startup', scenario: 'startup/resume-stopped', at: t + 4 }),
      entry({ taskKey: 'feat-x/1.2', at: t + 5 }),
      loopRow({ verb: 'settle', status: 'completed', scenario: 'loop/finish-all', at: t + 6 }),
    ]
    const replayed = dispatchLoopInstanceEntries(log)
    expect(replayed.map((e) => e.at)).toEqual([t + 4, t + 5, t + 6])
    expect(replayed.some((e) => e.taskKey === 'feat-x/1.1')).toBe(false)
  })

  it('运行中实例（未结算）：区间延伸到日志尾', () => {
    const log = [
      loopRow({ verb: 'startup', scenario: 'startup/from-scratch', at: t }),
      entry({ taskKey: 'feat-x/1.1', at: t + 1 }),
      loopRow({ verb: 'loop', scenario: 'pool/pending', at: t + 2 }),
    ]
    expect(dispatchLoopInstanceEntries(log)).toHaveLength(3)
  })

  it('容器筛选：他容器事件不混入本实例区间', () => {
    const log = [
      loopRow({ verb: 'startup', scenario: 'startup/from-scratch', at: t }),
      entry({ sourceSlug: 'other-slug', taskKey: 'other-slug/9.9', at: t + 1 }),
      entry({ taskKey: 'feat-x/1.1', at: t + 2 }),
    ]
    const replayed = dispatchLoopInstanceEntries(log)
    expect(replayed.map((e) => e.at)).toEqual([t, t + 2])
  })

  it('无启动标记（旧会话）= 空数组不回放', () => {
    expect(dispatchLoopInstanceEntries([entry({ taskKey: 'feat-x/1.1' })])).toEqual([])
    expect(dispatchLoopInstanceEntries([])).toEqual([])
  })
})

describe('dispatchPanelEntriesOf（消费侧兜底装配——窗口丢失时回放重建）', () => {
  const loopRow = (overrides: Partial<DispatchEventEntry>): DispatchEventEntry => entry({ taskKey: undefined, taskTitle: undefined, ...overrides })
  const t = Date.parse('2026-10-28T10:00:00Z')

  it('窗口未截断 = 投影窗口原样（total ≤ entries.length）', () => {
    const view = { entries: [entry()], total: 1 }
    expect(dispatchWindowLost(view)).toBe(false)
    expect(dispatchPanelEntriesOf(view, undefined)).toBe(view.entries)
    expect(dispatchWindowLost({ entries: [entry()], total: 3 })).toBe(true)
  })

  it('窗口丢失 + 回放源在场 = 本循环实例回放重建（早于窗口的任务行不失）', () => {
    const windowEntries = [entry({ taskKey: 'feat-x/1.9', at: t + 500 })]
    const view = { entries: windowEntries, total: 400 }
    const log = [
      loopRow({ verb: 'startup', scenario: 'startup/from-scratch', at: t }),
      entry({ taskKey: 'feat-x/1.1', at: t + 1 }),
      entry({ taskKey: 'feat-x/1.9', at: t + 500 }),
    ]
    const merged = dispatchPanelEntriesOf(view, log)
    expect(merged).toHaveLength(3)
    expect(merged.some((e) => e.taskKey === 'feat-x/1.1')).toBe(true)
  })

  it('窗口丢失 + 回放源缺席/无启动标记 = 退回窗口（fail-soft 降级现状）', () => {
    const view = { entries: [entry()], total: 400 }
    expect(dispatchPanelEntriesOf(view, undefined)).toEqual(view.entries)
    expect(dispatchPanelEntriesOf(view, [entry({ taskKey: 'feat-x/1.9' })])).toEqual(view.entries)
  })

  it('跨会话串扰防御：回放不含窗口容器的事件 = 退回窗口', () => {
    const view = { entries: [entry({ sourceSlug: 'feat-x' })], total: 400 }
    const log = [
      loopRow({ sourceSlug: 'other', verb: 'startup', scenario: 'startup/from-scratch', at: t }),
      entry({ sourceSlug: 'other', taskKey: 'other/9.9', at: t + 1 }),
    ]
    expect(dispatchPanelEntriesOf(view, log)).toEqual(view.entries)
  })
})

describe('小球口径（投影汇总任务数 = 任务行聚合 + pending 快照）', () => {
  it('任务键后写覆盖计数 + pending 池级计数；循环级行不计入', () => {
    const entries = [
      entry({ taskKey: 'feat-x/1.1', status: 'completed', verb: 'settle' }),
      entry({ taskKey: 'feat-x/1.1', status: 'completed' }),
      entry({ taskKey: 'feat-x/1.2', status: 'running' }),
      entry({ taskKey: undefined, taskTitle: undefined, verb: 'startup', scenario: 'startup/from-scratch' }),
    ]
    expect(dispatchPanelTaskCountOf(entries, undefined)).toBe(2)
    expect(dispatchPanelTaskCountOf(entries, 3)).toBe(5)
  })

  it('折叠悬浮球数字 = 汇总任务数（非事件条数）', () => {
    const entries = [
      entry({ taskKey: 'feat-x/1.1', status: 'completed', verb: 'settle' }),
      entry({ taskKey: 'feat-x/1.2', status: 'running' }),
      entry({ taskKey: undefined, taskTitle: undefined, verb: 'startup', scenario: 'startup/from-scratch' }),
      entry({ taskKey: undefined, taskTitle: undefined, verb: 'loop', scenario: 'pool/pending' }),
    ]
    const markup = body({ collapsed: true, entries, pending: 4 })
    expect(markup).toContain('data-dswf-dep-badge-count')
    expect(markup).toContain('>6</span>') // 2 任务行 + 4 pending（循环级两行不计）
  })
})

describe('循环级行收敛（aggregateDispatchRowItems——后写覆盖单行）', () => {
  it('多条无 taskKey 事件收敛为最新一行；任务行不受影响', () => {
    const t = Date.parse('2026-10-28T10:00:00Z')
    const rows = aggregateDispatchRowItems([
      entry({ taskKey: undefined, taskTitle: undefined, verb: 'startup', scenario: 'startup/from-scratch', note: '从头执行', at: t }),
      entry({ taskKey: 'feat-x/1.1', at: t + 1 }),
      entry({ taskKey: undefined, taskTitle: undefined, verb: 'loop', scenario: 'pool/pending', at: t + 2 }),
      entry({ taskKey: undefined, taskTitle: undefined, verb: 'startup', scenario: 'startup/resume-stopped', note: '接续执行', at: t + 3 }),
    ])
    const loopRows = rows.filter((row) => row.entry.taskKey === undefined)
    expect(loopRows).toHaveLength(1)
    expect(loopRows[0]?.entry.note).toBe('接续执行')
    expect(rows.some((row) => row.entry.taskKey === 'feat-x/1.1')).toBe(true)
  })
})
