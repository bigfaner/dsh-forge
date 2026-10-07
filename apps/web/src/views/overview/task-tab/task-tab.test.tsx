// 任务子 tab 组装单测 —— AC4/AC5：ov-taskbar（feature pill + 计数 + 三视图 seg）+
// chips 统一过滤（StatusChips 复用）+ 三视图分派 + 三态面（骨架/错误/空态）+ seg 切换
// 保持过滤态（受控注入——chips 来自帧侧 ctx）。装载壳 effect 面 = 4.1/5.2；纯渲染体
// TasksTabBody 全相位静态可测。featureMenuItems/Select 菜单映射纯函数直测。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { FeatureCard, TaskStatus, TaskGraph, TaskStats } from '@dsh-forge/contracts'
import {
  TasksTabBody,
  featureMenuItems,
  featureMenuSelect,
} from './task-tab.js'
import type { TasksTabLoadState } from './task-tab-data.js'
import { cardFixture } from './task-tab-model.test.js'

const NOOP = (): void => {}

/** 菜单行 label 取值（MenuItem 窄化 + 缺席 = 空——测试辅助面） */
function menuRowLabel(items: readonly MenuEntry[], index: number): ReactNode {
  const entry = items[index]
  if (entry === undefined || !('label' in entry)) return null
  return entry.label
}

const FEATURES: readonly FeatureCard[] = [
  {
    featureId: 'f-1',
    slug: 'm2-pipeline',
    title: 'M2 管线',
    featureStatus: 'in-progress',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    byStatus: { pending: 1, in_progress: 0, completed: 1, blocked: 0, suspended: 0, skipped: 0, rejected: 0 },
    docCount: 4,
  },
  {
    featureId: 'f-2',
    slug: 'p1-mvp',
    title: 'P1',
    featureStatus: 'completed',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    byStatus: { pending: 0, in_progress: 0, completed: 2, blocked: 0, suspended: 0, skipped: 0, rejected: 0 },
    docCount: 2,
  },
]

const STATS: TaskStats = {
  total: 2,
  byStatus: { pending: 1, in_progress: 0, completed: 1, blocked: 0, suspended: 0, skipped: 0, rejected: 0 },
  unmetPending: 0,
}

const GRAPH: TaskGraph = { tasks: [cardFixture()], edges: [] }

function load(over: Partial<TasksTabLoadState> = {}): TasksTabLoadState {
  return {
    phase: 'ready',
    cards: [cardFixture()],
    graph: undefined,
    stats: STATS,
    busy: false,
    error: undefined,
    ...over,
  }
}

const base = {
  projectId: 'p-1',
  search: '',
  sort: 'active' as const,
  activeStatuses: new Set<TaskStatus>(),
  features: FEATURES,
  featureSlug: 'm2-pipeline',
  onToggleStatus: NOOP,
  onClearStatuses: NOOP,
  onFeatureSelect: NOOP,
  onViewChange: NOOP,
  featureMenuOpen: false,
  onFeatureMenuOpenChange: NOOP,
  onRetry: NOOP,
}

const render = (over: Partial<Parameters<typeof TasksTabBody>[0]> = {}): string =>
  renderToStaticMarkup(<TasksTabBody {...base} view="list" load={load()} onOpenTask={NOOP} {...over} />)

describe('TasksTabBody · ov-taskbar（AC5 feature pill + 计数 + 三视图 seg）', () => {
  it('feature pill（slug + 状态完成比 chip）+ 计数注记（N 条）+ 三 seg', () => {
    const html = render()
    expect(html).toContain('data-dswf-tt-taskbar=""')
    expect(html).toContain('data-dswf-tt-featpill="m2-pipeline"')
    expect(html).toContain('m2-pipeline')
    expect(html).toContain('进行中 1/2')
    expect(html).toContain('data-dswf-tt-count=""')
    expect(html).toContain('2 条')
    expect(html).toContain('data-dswf-tt-view="list"')
    expect(html).toContain('data-dswf-tt-view="dag"')
    expect(html).toContain('data-dswf-tt-view="swim"')
    expect(html).toContain('列表')
    expect(html).toContain('泳道')
  })

  it('搜索在场计数 = 匹配/总数（服务端过滤面）', () => {
    const html = render({ search: '评估' })
    expect(html).toContain('1/2')
  })

  it('seg 激活态类位（aria-pressed）——切视图过滤/排序态保持（chips 由帧侧注入）', () => {
    const html = render({ activeStatuses: new Set<TaskStatus>(['completed']) })
    expect(html).toContain('aria-pressed="true"') // chip 激活
    expect(html).toMatch(/dswf-tt-seg-btn is-active" data-dswf-tt-view="list"/)
  })
})

describe('TasksTabBody · chips 统一过滤（AC4）', () => {
  it('七态 chips（StatusChips 复用）+ 计数 = feature 域 stats 单源', () => {
    const html = render()
    expect(html).toContain('data-dswf-ov-stchips=""')
    expect(html).toContain('data-dswf-ov-stchip="completed"')
    expect(html).toContain('data-dswf-ov-stchip="pending"')
  })

  it('stats 在途 = 全 0 计数（chips 全禁用——不可点出空态）', () => {
    const html = render({ load: load({ stats: undefined }) })
    expect(html).toContain('disabled')
  })
})

describe('TasksTabBody · 三视图分派（AC1/AC2/AC3）', () => {
  it('list（缺省）：两行布局列表', () => {
    const html = render({ view: 'list' })
    expect(html).toContain('data-dswf-tt-list=""')
    expect(html).toContain('data-dswf-tt-item="t-1"')
  })

  it('dag：SVG 画布 + 节点 + 边（graph 在场）', () => {
    const html = render({ view: 'dag', load: load({ graph: GRAPH }) })
    expect(html).toContain('data-dswf-tt-dag=""')
    expect(html).toContain('data-dswf-tt-node="t-1"')
  })

  it('dag 视图 graph 在途 = 骨架（不炸不空白）', () => {
    const html = render({ view: 'dag', load: load({ graph: undefined }) })
    expect(html).toContain('data-dswf-tt-skeleton')
  })

  it('swim：七态横向列', () => {
    const html = render({ view: 'swim' })
    expect(html).toContain('data-dswf-tt-swim=""')
    expect(html).toContain('data-dswf-tt-col="pending"')
  })
})

describe('TasksTabBody · 三态面与空态', () => {
  it('首装在途 = 骨架行（taskbar 保持）', () => {
    const html = render({ load: load({ phase: 'loading', cards: undefined, stats: undefined, busy: true }) })
    expect(html).toContain('data-dswf-tt-taskbar')
    expect(html).toContain('data-dswf-tt-skeleton')
  })

  it('错误无旧内容 = 错误条 + 重试', () => {
    const html = render({ load: load({ phase: 'error', cards: undefined, error: { message: '装载失败', uiState: 'error-bar' } }) })
    expect(html).toContain('data-dswf-tt-error')
    expect(html).toContain('装载失败')
  })

  it('错误有旧内容 = 错误条置顶 + 列表保持（重取失败不掏空）', () => {
    const html = render({ load: load({ error: { message: '重取失败', uiState: 'error-bar' }, busy: true }) })
    expect(html).toContain('data-dswf-tt-error')
    expect(html).toContain('data-dswf-tt-item="t-1"')
  })

  it('空态分派：feature 总数 0 / 搜索无匹配 / 过滤组合空', () => {
    const zero: TaskStats = { total: 0, byStatus: { pending: 0, in_progress: 0, completed: 0, blocked: 0, suspended: 0, skipped: 0, rejected: 0 }, unmetPending: 0 }
    expect(render({ load: load({ cards: [], stats: zero }) })).toContain('本 feature 暂无任务')
    expect(render({ search: '不存在', load: load({ cards: [] }) })).toContain('无匹配「不存在」的任务')
    expect(render({ activeStatuses: new Set<TaskStatus>(['blocked']), load: load({ cards: [] }) })).toContain('当前过滤组合无任务')
  })

  it('无 feature = feature 空态（无 taskbar）', () => {
    const html = render({ features: [], featureSlug: undefined })
    expect(html).toContain('暂无 feature')
    expect(html).not.toContain('data-dswf-tt-taskbar')
  })
})

describe('featureMenuItems / featureMenuSelect（AC5 feature pill 菜单映射）', () => {
  it('行集 = feature slug + 状态完成比（feature 卡 byStatus 聚合）', () => {
    const items = featureMenuItems(FEATURES)
    expect(items.map((entry) => entry.id)).toEqual(['m2-pipeline', 'p1-mvp'])
    const first = renderToStaticMarkup(menuRowLabel(items, 0))
    expect(first).toContain('m2-pipeline')
    expect(first).toContain('进行中 1/2')
    const second = renderToStaticMarkup(menuRowLabel(items, 1))
    expect(second).toContain('已完成 2/2')
  })

  it('选中映射 id → slug（未知 id = undefined 不派发）', () => {
    expect(featureMenuSelect(FEATURES, 'p1-mvp')).toBe('p1-mvp')
    expect(featureMenuSelect(FEATURES, 'ghost')).toBeUndefined()
  })
})

describe('TasksTab 装载壳（静态首帧——effect 未跑）', () => {
  it('首帧 = taskbar 壳 + 骨架（拉取不阻塞结构呈现）', async () => {
    const { TasksTab } = await import('./task-tab.js')
    const html = renderToStaticMarkup(
      <TasksTab
        projectId="p-1"
        search=""
        sort="active"
        activeStatuses={new Set<TaskStatus>()}
        statusFilter={[]}
        features={FEATURES}
        onToggleStatus={NOOP}
        onClearStatuses={NOOP}
      />,
    )
    expect(html).toContain('data-dswf-tt-taskbar')
    expect(html).toContain('data-dswf-tt-skeleton')
    expect(html).toContain('data-dswf-tt-featpill="m2-pipeline"') // 活跃 feature 缺省解析
  })
})
