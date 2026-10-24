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
  aggregateDispatchRows,
  dispatchBadgePointerIsClick,
  dispatchEventNoteOf,
  dispatchEventStats,
  dispatchEventTitleOf,
  dispatchEventsAnchor,
  dispatchEventsDragPosition,
  dispatchEventsOf,
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
    expect(markup).toContain('执行中 · 已启动执行')
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
  it('任务轨行形态：rail + 状态点色档 + 标题 + 备注行（场景分组组头已由任务键时间线替换）', () => {
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
    expect(markup).toContain('执行中 · 领取')
    expect(markup).not.toContain('data-dswf-dep-group')
  })
  it('行状态备注：执行中/完成/阻塞/已中断 状态词与注记', () => {
    const markup = body({
      entries: [
        entry({ taskKey: 'a', status: 'running' }),
        entry({ taskKey: 'b', status: 'completed', verb: 'settle', scenario: 'task/complete' }),
        entry({ taskKey: 'c', status: 'blocked', scenario: 'blocked/with-fix', note: '投影类型缺失' }),
        entry({ taskKey: 'd', status: 'interrupted', verb: 'stop', scenario: 'loop/stopped' }),
      ],
      total: 4,
    })
    expect(markup).toContain('执行中')
    expect(markup).toContain('完成')
    expect(markup).toContain('阻塞 · 已带修复 · 投影类型缺失')
    expect(markup).toContain('已中断')
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
