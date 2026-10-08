// 任务子 tab 纯模型单测 —— AC1 副行承重字段投影 / AC3 泳道列投影 / AC4 计数注记与
// chips 计数单源 / AC5 视图词汇与空态分派 / AC6 feature 解析与 DAG 可见集（chips 过滤
// 三视图统一的数据面——list 结果 = vis 集单源，graph 供边）。
import { describe, expect, it } from 'vitest'
import type { FeatureCard, TaskCard, TaskGraph } from '@dsh-forge/contracts'
import {
  TASK_VIEWS,
  dagVisibleSet,
  listGroupsOf,
  resolveContainer,
  resolveFeatureSlug,
  swimColumnsOf,
  taskCountNote,
  taskStatusTagTone,
  taskSubRowParts,
  tasksEmptyView,
} from './task-tab-model.js'

/** TaskCard 夹具（副行承重字段全覆盖基准） */
export function cardFixture(over: Partial<TaskCard> = {}): TaskCard {
  return {
    taskId: 't-1',
    slug: 'm2-pipeline',
    localId: '2.4',
    title: 'tool 半身对接',
    taskType: 'coding-feature',
    taskStatus: 'completed',
    priority: 'P0',
    estimatedTime: '4h',
    actualDurationMs: (2 * 60 + 31) * 60_000,
    prerequisites: [
      { slug: 'm2-pipeline', localId: '2.3', taskStatus: 'completed' },
    ],
    sessionCount: 2,
    ...over,
  }
}

const FEATURES: readonly FeatureCard[] = [
  {
    featureId: 'f-2',
    slug: 'old-thing',
    title: '旧 feature',
    featureStatus: 'completed',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    byStatus: { pending: 0, in_progress: 0, completed: 1, blocked: 0, suspended: 0, skipped: 0, rejected: 0 },
    docCount: 1,
  },
  {
    featureId: 'f-1',
    slug: 'm2-pipeline',
    title: 'M2 管线',
    featureStatus: 'in-progress',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    byStatus: { pending: 2, in_progress: 1, completed: 3, blocked: 1, suspended: 0, skipped: 0, rejected: 0 },
    docCount: 4,
  },
]

describe('TASK_VIEWS（三视图 seg 词汇）', () => {
  it('列表|DAG|泳道 三值（AC5 seg）', () => {
    expect(TASK_VIEWS.map((v) => v.value)).toEqual(['list', 'dag', 'swim'])
    expect(TASK_VIEWS.map((v) => v.label)).toEqual(['列表', 'DAG', '泳道'])
  })
})

describe('taskSubRowParts（AC1 副行承重：类型/优先级/实际耗时[completed]/前置/挂接/fix 源标）', () => {
  it('全量卡 = 六段全在场（实际耗时 XhYm 格式化）', () => {
    const parts = taskSubRowParts(
      cardFixture({ sourceTask: { slug: 'm2-pipeline', localId: '2.2' } }),
    )
    expect(parts).toEqual([
      'coding-feature',
      'P0',
      '实际耗时 2h31m',
      '←1 前置',
      '⟞2 挂接',
      'fix→2.2',
    ])
  })

  it('非 completed 不显实际耗时（v15 口径）；缺省字段逐项省略', () => {
    const parts = taskSubRowParts(cardFixture({ taskStatus: 'in_progress', priority: undefined, actualDurationMs: undefined, prerequisites: [], sessionCount: 0 }))
    expect(parts).toEqual(['coding-feature'])
  })

  it('completed 但耗时缺/≤0 也不显（formatActualDuration 归一）', () => {
    expect(taskSubRowParts(cardFixture({ actualDurationMs: undefined }))).not.toContain('实际耗时')
    expect(taskSubRowParts(cardFixture({ actualDurationMs: 0 }))).not.toContain('实际耗时')
  })
})

describe('listGroupsOf（列表分组：执行中 + 其余）', () => {
  it('in_progress|blocked 前置组（执行中（N））+ 其余组（两组均在才标「其余」）', () => {
    const groups = listGroupsOf([
      cardFixture({ taskId: 'a', localId: '1', taskStatus: 'pending' }),
      cardFixture({ taskId: 'b', localId: '2', taskStatus: 'in_progress' }),
      cardFixture({ taskId: 'c', localId: '3', taskStatus: 'blocked' }),
    ])
    expect(groups).toHaveLength(2)
    expect(groups[0]?.label).toBe('执行中（2）')
    expect(groups[0]?.tasks.map((t) => t.taskId)).toEqual(['b', 'c'])
    expect(groups[1]?.label).toBe('其余')
    expect(groups[1]?.tasks.map((t) => t.taskId)).toEqual(['a'])
  })

  it('全非执行中 = 单组无标签；全执行中 = 单组', () => {
    expect(listGroupsOf([cardFixture({ taskStatus: 'pending' })])).toEqual([
      { label: undefined, tasks: [cardFixture({ taskStatus: 'pending' })] },
    ])
    const only = listGroupsOf([cardFixture({ taskStatus: 'blocked' })])
    expect(only).toHaveLength(1)
    expect(only[0]?.label).toBeUndefined()
  })
})

describe('taskCountNote（AC4 计数注记）', () => {
  it('搜索在场 = 匹配/总数；否则 = N 条', () => {
    expect(taskCountNote(true, 3, 7)).toBe('3/7')
    expect(taskCountNote(false, 7, 7)).toBe('7 条')
  })
})

describe('dagVisibleSet（AC4 chips 过滤三视图统一——DAG vis 集）', () => {
  const cards = [
    cardFixture({ taskId: 'b', localId: '2' }),
    cardFixture({ taskId: 'a', localId: '1', taskStatus: 'completed' }),
  ]
  const graph: TaskGraph = {
    tasks: [
      cardFixture({ taskId: 'a', localId: '1', taskStatus: 'completed' }),
      cardFixture({ taskId: 'b', localId: '2' }),
      cardFixture({ taskId: 'c', localId: '3' }),
    ],
    edges: [
      { taskId: 'b', prerequisiteId: 'a', origin: 'manual' },
      { taskId: 'b', prerequisiteId: 'c', origin: 'manual' },
      { taskId: 'c', prerequisiteId: 'a', origin: 'manual' },
    ],
  }

  it('节点 = graph.tasks ∩ list 结果（list 序 = 服务端排序）；边 = 两端均可见', () => {
    const vis = dagVisibleSet(cards, graph)
    expect(vis.nodes.map((t) => t.taskId)).toEqual(['b', 'a'])
    expect(vis.edges).toEqual([{ taskId: 'b', prerequisiteId: 'a', origin: 'manual' }])
  })

  it('graph 缺席（非 DAG 视图/在途）= cards 原样 + 空边', () => {
    const vis = dagVisibleSet(cards, undefined)
    expect(vis.nodes).toEqual(cards)
    expect(vis.edges).toEqual([])
  })
})

describe('swimColumnsOf（AC3 七态横向列投影）', () => {
  it('七态行序（contracts TASK_STATUSES）；0 计数列 = 空卡列（折叠归组件）', () => {
    const columns = swimColumnsOf([
      cardFixture({ taskId: 'a', taskStatus: 'pending' }),
      cardFixture({ taskId: 'b', taskStatus: 'completed' }),
      cardFixture({ taskId: 'c', taskStatus: 'pending' }),
    ])
    expect(columns.map((col) => col.status)).toEqual([
      'pending',
      'in_progress',
      'completed',
      'blocked',
      'suspended',
      'skipped',
      'rejected',
    ])
    expect(columns[0]?.cards.map((t) => t.taskId)).toEqual(['a', 'c'])
    expect(columns[1]?.cards).toEqual([])
    expect(columns[2]?.cards.map((t) => t.taskId)).toEqual(['b'])
  })
})

describe('taskStatusTagTone（状态 tag 官方 tone 映射）', () => {
  it('completed=success / blocked·rejected=danger / 其余=neutral', () => {
    expect(taskStatusTagTone('completed')).toBe('success')
    expect(taskStatusTagTone('blocked')).toBe('danger')
    expect(taskStatusTagTone('rejected')).toBe('danger')
    expect(taskStatusTagTone('pending')).toBe('neutral')
    expect(taskStatusTagTone('in_progress')).toBe('neutral')
  })
})

describe('resolveFeatureSlug（AC5 feature pill 解析）', () => {
  it('显式注入优先；否则活跃 feature（非终态优先，否则首行）', () => {
    expect(resolveFeatureSlug(FEATURES, 'old-thing')).toBe('old-thing')
    expect(resolveFeatureSlug(FEATURES, undefined)).toBe('m2-pipeline')
  })

  it('空 feature 列 = undefined', () => {
    expect(resolveFeatureSlug([], 'x')).toBe('x')
    expect(resolveFeatureSlug([], undefined)).toBeUndefined()
  })
})

describe('resolveContainer（容器选中解析——4.6 双轨 + 纯 blitz 回落）', () => {
  const feature = { kind: 'feature', slug: 'feat-a', title: 'A', mode: 'expedition', taskCount: 3 } as const
  const proposal = { kind: 'proposal', slug: 'blitz-p', title: 'P', mode: 'blitz', taskCount: 2 } as const

  it('feature 优先：双轨在场缺省 = feature（活跃缺 → 首 feature）', () => {
    expect(resolveContainer([feature, proposal], undefined, undefined)?.slug).toBe('feat-a')
    expect(resolveContainer([feature, proposal], undefined, 'feat-a')?.slug).toBe('feat-a')
  })

  it('显式注入优先（任意容器——taskFocus 聚焦/用户本地切换）', () => {
    expect(resolveContainer([feature, proposal], { kind: 'proposal', slug: 'blitz-p' }, 'feat-a')?.slug).toBe('blitz-p')
  })

  it('零 feature 选项 = 回落首项（纯 blitz 提案工作区不空转——5.2 e2e 实证处置）', () => {
    expect(resolveContainer([proposal], undefined, undefined)?.slug).toBe('blitz-p')
  })

  it('零选项 = undefined（容器空态）', () => {
    expect(resolveContainer([], undefined, undefined)).toBeUndefined()
  })
})

describe('tasksEmptyView（空态分派——总 0/搜索/过滤组合）', () => {
  const base = { search: '', searchActive: false, hasStatusFilter: false, total: 5 }

  it('有卡 = undefined（非空）', () => {
    expect(tasksEmptyView({ ...base, cards: [cardFixture()] })).toBeUndefined()
  })

  it('feature 总数 0 = 本容器暂无任务', () => {
    const view = tasksEmptyView({ ...base, total: 0, cards: [] })
    expect(view?.title).toBe('本容器暂无任务')
  })

  it('搜索在场空结果 = 无匹配', () => {
    const view = tasksEmptyView({ ...base, searchActive: true, search: '不存在的词', cards: [] })
    expect(view?.title).toBe('无匹配「不存在的词」的任务')
  })

  it('chips 过滤组合空 = 当前过滤组合无任务', () => {
    const view = tasksEmptyView({ ...base, hasStatusFilter: true, cards: [] })
    expect(view?.title).toBe('当前过滤组合无任务')
  })
})
