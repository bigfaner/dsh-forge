// overview-model 单测 —— AC3（子 tab 切换清空三态）+ AC5（chips 过滤接口）+ AC1（默认折叠）
// + 排序/搜索参归一（Hard Rule 服务端承载的模型侧锚：关键词只转查询参，不做本地过滤）。
import { describe, expect, it } from 'vitest'
import { TASK_STATUSES, type TaskStatus } from '@dsh-forge/contracts'
import {
  OVERVIEW_SORT_LABELS,
  clearPhaseFilter,
  clearProposalStatusFilter,
  OVERVIEW_SUBTABS,
  clearStatusFilter,
  featureRowKey,
  hasActiveStatusFilter,
  initialOverviewFilter,
  isChipDisabled,
  nextSort,
  overviewHeadSummary,
  proposalRowKey,
  searchPlaceholderOf,
  searchQueryOf,
  statusFilterParam,
  switchSubtab,
  toggleHead,
  togglePhaseFilter,
  toggleProposalStatusFilter,
  toggleOpenRow,
  toggleStatusFilter,
  activeFeatureSlug,
} from './overview-model.js'

const ALL_STATUS = new Set<TaskStatus>(TASK_STATUSES)

describe('OVERVIEW_SUBTABS（AC2 三子 tab 用户定向顺序）', () => {
  it('顺序 = 提案 | feature | 任务（用户定向——非字母序非任务前置）', () => {
    expect(OVERVIEW_SUBTABS.map((t) => t.value)).toEqual(['proposals', 'features', 'tasks'])
    expect(OVERVIEW_SUBTABS.map((t) => t.label)).toEqual(['提案', 'feature', '任务'])
  })
})

describe('initialOverviewFilter（AC1 默认态）', () => {
  it('默认子 tab = 提案（定向顺序首位）；排序 = 活跃优先；搜索空；chips/展开态空；ov-head 折叠', () => {
    const state = initialOverviewFilter()
    expect(state.subtab).toBe('proposals')
    expect(state.sort).toBe('active')
    expect(state.search).toBe('')
    expect(state.activeStatuses.size).toBe(0)
    expect(state.openRows.size).toBe(0)
    expect(state.headOpen).toBe(false)
  })
})

describe('switchSubtab（AC3 切换清空）', () => {
  it('切换 = 清空搜索 + 清空 chips + 收起全部展开态', () => {
    let state = initialOverviewFilter()
    state = { ...state, search: '网关', openRows: new Set([proposalRowKey('p-1'), featureRowKey('f-1')]) }
    state = toggleStatusFilter(state, 'blocked')
    const next = switchSubtab(state, 'tasks')
    expect(next.subtab).toBe('tasks')
    expect(next.search).toBe('')
    expect(next.activeStatuses.size).toBe(0)
    expect(next.openRows.size).toBe(0)
  })

  it('ov-head 展开态跨子 tab 保持（路径详情与内容区正交）；同值切换原样返回（引用相等）', () => {
    let state = initialOverviewFilter()
    state = toggleHead(state)
    const next = switchSubtab(state, 'features')
    expect(next.headOpen).toBe(true)
    expect(switchSubtab(next, 'features')).toBe(next)
  })
})

describe('排序（AC2 ⇅ 活跃优先 ↔ 最新创建）', () => {
  it('nextSort 双向翻转；标签常量中英口径', () => {
    expect(nextSort('active')).toBe('created')
    expect(nextSort('created')).toBe('active')
    expect(OVERVIEW_SORT_LABELS.active).toBe('活跃优先')
    expect(OVERVIEW_SORT_LABELS.created).toBe('最新创建')
  })
})

describe('searchQueryOf / searchPlaceholderOf（Hard Rule 服务端承载——参归一）', () => {
  it('非空 trim 透传；空白/空串 = undefined（不带 search 参）', () => {
    expect(searchQueryOf(' 网关 ')).toBe('网关')
    expect(searchQueryOf('gateway')).toBe('gateway')
    expect(searchQueryOf('   ')).toBeUndefined()
    expect(searchQueryOf('')).toBeUndefined()
  })

  it('占位文案逐子 tab（提案/slug/状态 · feature/文档 · 标题/类型/状态中英）', () => {
    expect(searchPlaceholderOf('proposals')).toContain('提案')
    expect(searchPlaceholderOf('features')).toContain('feature')
    expect(searchPlaceholderOf('tasks')).toContain('中英')
  })
})

describe('chips 过滤接口（AC5——三视图统一，3.6 消费）', () => {
  it('toggleStatusFilter 翻转集合（不影响他态）；clearStatusFilter 全清', () => {
    let state = initialOverviewFilter()
    state = toggleStatusFilter(state, 'blocked')
    state = toggleStatusFilter(state, 'in_progress')
    expect([...state.activeStatuses].sort()).toEqual(['blocked', 'in_progress'])
    state = toggleStatusFilter(state, 'blocked')
    expect([...state.activeStatuses]).toEqual(['in_progress'])
    const cleared = clearStatusFilter(state)
    expect(cleared.activeStatuses.size).toBe(0)
  })

  it('statusFilterParam = contracts 七态行序白名单；空集 = 空参（= 全部）', () => {
    const active = new Set<TaskStatus>(['rejected', 'blocked', 'pending'])
    expect(statusFilterParam(active)).toEqual(['pending', 'blocked', 'rejected'])
    expect(statusFilterParam(new Set())).toEqual([])
  })

  it('hasActiveStatusFilter / isChipDisabled：0 计数禁用判据', () => {
    expect(hasActiveStatusFilter(new Set())).toBe(false)
    expect(hasActiveStatusFilter(new Set<TaskStatus>(['pending']))).toBe(true)
    expect(isChipDisabled(0)).toBe(true)
    expect(isChipDisabled(3)).toBe(false)
  })

  it('七态词汇序 = contracts TASK_STATUSES（chips 渲染行序单源）', () => {
    expect([...ALL_STATUS]).toEqual([
      'pending',
      'in_progress',
      'completed',
      'blocked',
      'suspended',
      'skipped',
      'rejected',
    ])
  })
})

describe('父行展开（AC4 多开并存）', () => {
  it('toggleOpenRow 集合翻转——多行并存互不影响；键方案 prop:{id} / feat:{slug}', () => {
    let state = initialOverviewFilter()
    const pk = proposalRowKey('uuid-1')
    const fk = featureRowKey('m2-pipeline')
    expect(pk).toBe('prop:uuid-1')
    expect(fk).toBe('feat:m2-pipeline')
    state = toggleOpenRow(state, pk)
    state = toggleOpenRow(state, fk)
    expect(state.openRows.has(pk)).toBe(true)
    expect(state.openRows.has(fk)).toBe(true)
    state = toggleOpenRow(state, pk)
    expect(state.openRows.has(pk)).toBe(false)
    expect(state.openRows.has(fk)).toBe(true)
  })
})

describe('ov-head 摘要合成', () => {
  it('「feature · N 会话 · N 完成」；活跃 feature 缺席 = —；会话计数缺席 = 省略段', () => {
    expect(overviewHeadSummary({ activeFeature: 'm2-pipeline', sessionCount: 2, completedCount: 7 })).toBe(
      'm2-pipeline · 2 会话 · 7 完成',
    )
    expect(overviewHeadSummary({ completedCount: 3 })).toBe('— · 3 完成')
  })

  it('activeFeatureSlug：非终态（completed/archived 之外）优先，否则首行；空集 = undefined', () => {
    const card = (slug: string, featureStatus: 'prd' | 'completed' | 'archived') => ({
      featureId: `id-${slug}`,
      slug,
      title: slug,
      featureStatus,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
      byStatus: {} as Record<TaskStatus, number>,
      docCount: 0,
    })
    expect(activeFeatureSlug([card('done', 'completed'), card('live', 'prd')])).toBe('live')
    expect(activeFeatureSlug([card('a', 'completed'), card('b', 'archived')])).toBe('a')
    expect(activeFeatureSlug([])).toBeUndefined()
  })
})

// ─────────────────────────── 4.6 UF-1/UF-4 chips 族 ───────────────────────────

describe('提案五态 / feature 阶段 chips（4.6——toggle 与清空语义）', () => {
  it('toggleProposalStatusFilter：集合翻转（多选并集）', () => {
    let state = initialOverviewFilter()
    state = toggleProposalStatusFilter(state, 'under-review')
    expect([...state.activeProposalStatuses]).toEqual(['under-review'])
    state = toggleProposalStatusFilter(state, 'accepted')
    expect([...state.activeProposalStatuses]).toEqual(['under-review', 'accepted'])
    state = toggleProposalStatusFilter(state, 'under-review')
    expect([...state.activeProposalStatuses]).toEqual(['accepted'])
  })

  it('clearProposalStatusFilter：全清（与 toggle 族互不影响他族态）', () => {
    let state = initialOverviewFilter()
    state = toggleProposalStatusFilter(state, 'draft')
    state = toggleStatusFilter(state, 'blocked')
    const cleared = clearProposalStatusFilter(state)
    expect(cleared.activeProposalStatuses.size).toBe(0)
    expect(cleared.activeStatuses.size).toBe(1) // 任务七态不受累
  })

  it('togglePhaseFilter / clearPhaseFilter：阶段族同语义', () => {
    let state = initialOverviewFilter()
    state = togglePhaseFilter(state, 'in-progress')
    state = togglePhaseFilter(state, 'completed')
    expect([...state.activePhases]).toEqual(['in-progress', 'completed'])
    state = togglePhaseFilter(state, 'in-progress')
    expect(clearPhaseFilter(state).activePhases.size).toBe(0)
  })

  it('子 tab 切换清空三族 chips（AC6 切换清空语义）', () => {
    let state = initialOverviewFilter()
    state = toggleStatusFilter(state, 'blocked')
    state = toggleProposalStatusFilter(state, 'accepted')
    state = togglePhaseFilter(state, 'completed')
    state = { ...state, search: '关键词', openRows: new Set(['prop:p-1']) }
    const next = switchSubtab(state, 'tasks')
    expect(next.search).toBe('')
    expect(next.activeStatuses.size).toBe(0)
    expect(next.activeProposalStatuses.size).toBe(0)
    expect(next.activePhases.size).toBe(0)
    expect(next.openRows.size).toBe(0)
  })
})

// M3.1 D12：概览 tab 宽度模型（OVERVIEW_WIDTH_* / clampOverviewWidth /
// overviewWidthFromDrag）随定宽管线整体退役——内容弹性填满整 tab（用户裁决 #1）。
// 退役否定断言（零弱化台账）：模型面宽度符号零导出——本测试文件零引用即编译面守卫
// （tsconfig 类型检查 + oxlint no-unused-vars 双机械通道）；帧面否定断言见 OverviewTab.test。
