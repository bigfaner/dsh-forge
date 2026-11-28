// 1.45 随 dock tab 族注册面自 apps/web 平移本包（装配缝归插件域，AGENTS §1.3）。
// 任务子 tab 纯模型单测 —— AC1 副行承重字段投影 / AC3 泳道列投影 / AC4 计数注记与
// chips 计数单源 / AC5 视图词汇与空态分派 / AC6 feature 解析与 DAG 可见集（chips 过滤
// 三视图统一的数据面——list 结果 = vis 集单源，graph 供边）。
import { describe, expect, it } from 'vitest'
import type { TaskCard, TaskGraph } from '@dsh-forge/lib-api/dto/forge'
import {
  TASK_VIEWS,
  dagVisibleSet,
  listGroupsOf,
  resolveContainer,
  swimColumnsOf,
  taskCountNote,
  taskHoverLabel,
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

describe('taskHoverLabel（m3.1 D36 ⑥——悬停有意义化：face 全名兜底 + 非可见位增量注）', () => {
  it('label = face 前缀 + 状态全称 zh （en）——零可见字面复读（label ≠ face）', () => {
    const label = taskHoverLabel(cardFixture(), 'm2-pipeline/2.4')
    expect(label.startsWith('m2-pipeline/2.4 · ')).toBe(true) // 截断位全名兜底语义保留
    expect(label).toContain('状态 已完成（Completed）') // 状态全称 zh+en（tag 仅中文名——en 非可见位）
    expect(label).not.toBe('m2-pipeline/2.4')
  })

  it('估时在场才带（TaskCard.estimatedTime——行面零承载的非可见位字段）', () => {
    expect(taskHoverLabel(cardFixture(), 'face')).toContain('估时 4h')
    expect(taskHoverLabel(cardFixture({ estimatedTime: undefined }), 'face')).not.toContain('估时')
  })

  it('零复读：优先级/实际耗时已由副行可见——不重入悬停注（缺席字段不硬凑）', () => {
    const label = taskHoverLabel(cardFixture(), 'face') // 夹具含 P0 + actualDurationMs
    expect(label).not.toContain('P0')
    expect(label).not.toContain('实际耗时')
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

describe('swimColumnsOf（AC3 八态横向列投影）', () => {
  it('八态行序（contracts TASK_STATUSES——S3 +interrupted）；0 计数列 = 空卡列（折叠归组件）', () => {
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
      'interrupted',
      'skipped',
      'rejected',
    ])
    expect(columns[0]?.cards.map((t) => t.taskId)).toEqual(['a', 'c'])
    expect(columns[1]?.cards).toEqual([])
    expect(columns[2]?.cards.map((t) => t.taskId)).toEqual(['b'])
  })
})

describe('taskStatusTagTone（状态 tag 官方 tone 映射）', () => {
  it('completed=success / blocked·rejected=danger / 其余=neutral（含 S3 interrupted——暂停态非错误）', () => {
    expect(taskStatusTagTone('completed')).toBe('success')
    expect(taskStatusTagTone('blocked')).toBe('danger')
    expect(taskStatusTagTone('rejected')).toBe('danger')
    expect(taskStatusTagTone('pending')).toBe('neutral')
    expect(taskStatusTagTone('in_progress')).toBe('neutral')
    expect(taskStatusTagTone('interrupted')).toBe('neutral')
  })
})

describe('resolveContainer（容器选中解析——显式命中优先，缺省首项·稳定序）', () => {
  const feature = { kind: 'feature', slug: 'feat-a', title: 'A', mode: 'expedition', taskCount: 3, statusCounts: {} } as const
  const proposal = { kind: 'proposal', slug: 'blitz-p', title: 'P', mode: 'blitz', taskCount: 2, statusCounts: {} } as const

  it('显式注入按 slug 命中（kind 不参与——taskFocus 聚焦/用户本地切换）', () => {
    expect(resolveContainer([feature, proposal], { kind: 'proposal', slug: 'blitz-p' })?.slug).toBe('blitz-p')
    // 聚焦载荷 kind 与选项不一致仍按 slug 命中（修前：kind 不等即回落首项——错容器）
    expect(resolveContainer([feature, proposal], { kind: 'feature', slug: 'blitz-p' })?.slug).toBe('blitz-p')
  })

  it('显式未命中 = 回落首项（稳定排序——slug 聚合序）', () => {
    expect(resolveContainer([feature, proposal], { kind: 'feature', slug: 'ghost' })?.slug).toBe('feat-a')
    expect(resolveContainer([feature, proposal], undefined)?.slug).toBe('feat-a')
    expect(resolveContainer([proposal], undefined)?.slug).toBe('blitz-p')
  })

  it('零选项 = undefined（真真空容器空态）', () => {
    expect(resolveContainer([], undefined)).toBeUndefined()
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

  it('全部容器作用域总数 0 = 暂无任务（不称「容器」）', () => {
    const view = tasksEmptyView({ ...base, total: 0, cards: [], allContainers: true })
    expect(view?.title).toBe('暂无任务')
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
