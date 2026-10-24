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
  DISPATCH_EVENT_MAJOR_LABELS,
  DispatchEventsPanel,
  DispatchEventsPanelBody,
  dispatchBadgePointerIsClick,
  dispatchEventMajorOf,
  dispatchEventStats,
  dispatchEventTitleOf,
  dispatchEventsAnchor,
  dispatchEventsDragPosition,
  dispatchEventsOf,
  dispatchPanelBadgeAnchor,
  dispatchPanelExpandGeometry,
  dispatchPanelBadgeGeometry,
  groupDispatchEvents,
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
    sourceSlug: 'feat-x',
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
})

// ─────────────────── 场景码分组 ───────────────────

describe('dispatchEventMajorOf / groupDispatchEvents（场景码 major 分组）', () => {
  it('scenario 在场 = major 取 scenario 前缀', () => {
    expect(dispatchEventMajorOf(entry({ scenario: 'blocked/with-fix' }))).toBe('blocked')
    expect(dispatchEventMajorOf(entry({ scenario: 'loop/finish-all' }))).toBe('loop')
  })
  it('scenario 缺席（旧载荷兼容）= verb 回退映射', () => {
    expect(dispatchEventMajorOf(entry({ verb: 'claim-resume' }))).toBe('claim')
    expect(dispatchEventMajorOf(entry({ verb: 'settle' }))).toBe('task')
    expect(dispatchEventMajorOf(entry({ verb: 'finish-all' }))).toBe('loop')
    expect(dispatchEventMajorOf(entry({ verb: 'suspend' }))).toBe('suspend')
  })
  it('分组保首次出现序；minor 行随组内时序', () => {
    const groups = groupDispatchEvents([
      entry({ taskKey: 'a', scenario: 'claim/new' }),
      entry({ taskKey: 'b', verb: 'settle', status: 'completed', scenario: 'task/complete' }),
      entry({ taskKey: 'c', scenario: 'claim/interrupted' }),
    ])
    expect(groups.map((g) => g.major)).toEqual(['claim', 'task'])
    expect(groups[0]?.label).toBe(DISPATCH_EVENT_MAJOR_LABELS['claim'])
    expect(groups[0]?.entries).toHaveLength(2)
  })
  it('未知 major（守卫外形状）落 loop 组兜底不炸', () => {
    const groups = groupDispatchEvents([entry({ scenario: 'weird/xx' } as unknown as DispatchEventEntry)])
    expect(groups).toHaveLength(1)
  })
})

// ─────────────────── 状态章 / 统计 / 标题 ───────────────────

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
  it('面板壳 + 标题（任务进度 · slug）+ live 标记 + 折叠钮', () => {
    const markup = body()
    expect(markup).toContain('data-dswf-dep')
    expect(markup).toContain('任务进度')
    expect(markup).toContain('feat-x')
    expect(markup).toContain('live')
    expect(markup).toContain('data-dswf-dep-collapse')
  })
  it('major 分组渲染 = 组头（中文章 + 计数）+ 组内细分行', () => {
    const markup = body({
      entries: [
        entry({ taskKey: 'a', scenario: 'claim/new' }),
        entry({ taskKey: 'b', verb: 'settle', status: 'completed', scenario: 'task/complete' }),
      ],
      total: 2,
    })
    expect(markup).toContain('data-dswf-dep-group')
    expect(markup).toContain('领取')
    expect(markup).toContain('任务')
  })
  it('行状态章：执行中/已完成/阻塞/已中断', () => {
    const markup = body({
      entries: [
        entry({ taskKey: 'a', status: 'running' }),
        entry({ taskKey: 'b', status: 'completed', verb: 'settle' }),
        entry({ taskKey: 'c', status: 'blocked', scenario: 'blocked/with-fix', note: '投影类型缺失' }),
        entry({ taskKey: 'd', status: 'interrupted', verb: 'stop', scenario: 'loop/stopped' }),
      ],
      total: 4,
    })
    expect(markup).toContain('执行中')
    expect(markup).toContain('已完成')
    expect(markup).toContain('阻塞')
    expect(markup).toContain('已中断')
    expect(markup).toContain('投影类型缺失')
  })
  it('行点击跳 worker 子会话：workerSessionId 在场 = role button + 打开锚；缺席 = 非交互行', () => {
    const interactive = body({ entries: [entry({ workerSessionId: 'w-1' })], onOpenWorker: () => {} })
    expect(interactive).toContain('role="button"')
    expect(interactive).toContain('data-dswf-dep-row="w-1"')
    const plain = body({ entries: [entry()], onOpenWorker: () => {} })
    expect(plain).not.toContain('role="button"')
    const noFace = body({ entries: [entry({ workerSessionId: 'w-1' })] })
    expect(noFace).not.toContain('role="button"')
  })
  it('底部统计条：完成/执行中/阻塞/已中断计数', () => {
    const markup = body({
      entries: [entry({ status: 'completed', verb: 'settle' }), entry()],
      total: 2,
    })
    expect(markup).toContain('data-dswf-dep-stat')
    expect(markup).toContain('完成')
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
