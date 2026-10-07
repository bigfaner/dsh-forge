// 终态判定单测 —— AC3：nonTerminalOf 纯函数全态（未终态 = pending/in_progress/blocked/
// suspended——与相位推导机口径同源·终态 = completed/skipped/rejected）+ stats 单源计数
// （未过滤——chips/搜索过滤不改判）+ runningTaskOf 双路由第一判据（最新 in_progress）。
import { describe, expect, it } from 'vitest'
import type { TaskCard, TaskStatus, TaskStats } from '@dsh-forge/contracts'
import {
  NON_TERMINAL_TASK_STATUSES,
  TERMINAL_TASK_STATUSES,
  hasNonTerminalTask,
  isTerminalTaskStatus,
  nonTerminalCountOf,
  nonTerminalOf,
  runningTaskOf,
} from './terminal-state.js'
import { cardFixture } from './task-tab-model.test.js'

function card(localId: string, taskStatus: TaskStatus): TaskCard {
  return cardFixture({ taskId: `t-${localId}`, localId, taskStatus })
}

/** 七态全谱（contracts TASK_STATUSES 行序） */
const ALL_STATUSES: readonly TaskStatus[] = [
  'pending',
  'in_progress',
  'completed',
  'blocked',
  'suspended',
  'skipped',
  'rejected',
]

function statsOf(byStatus: Partial<Record<TaskStatus, number>>): TaskStats {
  const full = { pending: 0, in_progress: 0, completed: 0, blocked: 0, suspended: 0, skipped: 0, rejected: 0 } as Record<
    TaskStatus,
    number
  >
  for (const status of ALL_STATUSES) full[status] = byStatus[status] ?? 0
  const total = ALL_STATUSES.reduce((sum, status) => sum + full[status], 0)
  return { total, byStatus: full, unmetPending: 0 }
}

describe('终态集口径（与相位推导机同源——core TERMINAL_TASK_STATUSES 镜像）', () => {
  it('终态 = completed/skipped/rejected；未终态 = pending/in_progress/blocked/suspended（七态穷尽两分）', () => {
    expect(TERMINAL_TASK_STATUSES).toEqual(['completed', 'skipped', 'rejected'])
    expect(NON_TERMINAL_TASK_STATUSES).toEqual(['pending', 'in_progress', 'blocked', 'suspended'])
    for (const status of ALL_STATUSES) {
      const expected = (TERMINAL_TASK_STATUSES as readonly TaskStatus[]).includes(status)
      expect(isTerminalTaskStatus(status)).toBe(expected)
    }
  })
})

describe('nonTerminalOf（AC3 卡片集投影——容器全集喂入）', () => {
  it('七态混合集 → 仅四未终态成员（保序）', () => {
    const cards = [
      card('1.1', 'completed'),
      card('1.2', 'pending'),
      card('1.3', 'in_progress'),
      card('1.4', 'skipped'),
      card('1.5', 'blocked'),
      card('1.6', 'suspended'),
      card('1.7', 'rejected'),
    ]
    expect(nonTerminalOf(cards).map((t) => t.localId)).toEqual(['1.2', '1.3', '1.5', '1.6'])
  })

  it('全终态 → 空集；全未终态 → 全集；空集 → 空集', () => {
    expect(nonTerminalOf([card('a', 'completed'), card('b', 'skipped'), card('c', 'rejected')])).toEqual([])
    expect(nonTerminalOf([card('a', 'pending')])).toHaveLength(1)
    expect(nonTerminalOf([])).toEqual([])
  })
})

describe('stats 单源计数（未过滤判据——服务端过滤集 load.cards 不作判据）', () => {
  it('nonTerminalCountOf = 四未终态之和；与 completed/skipped/rejected 互补 total', () => {
    const stats = statsOf({ pending: 2, in_progress: 1, completed: 3, blocked: 1, suspended: 0, skipped: 1, rejected: 1 })
    expect(nonTerminalCountOf(stats)).toBe(4)
    expect(stats.total - nonTerminalCountOf(stats)).toBe(5)
  })

  it('hasNonTerminalTask：未终态在场 = true；全终态 = false；零任务 = false（无可派发）', () => {
    expect(hasNonTerminalTask(statsOf({ pending: 1 }))).toBe(true)
    expect(hasNonTerminalTask(statsOf({ blocked: 2 }))).toBe(true)
    expect(hasNonTerminalTask(statsOf({ completed: 2, skipped: 1 }))).toBe(false)
    expect(hasNonTerminalTask(statsOf({}))).toBe(false)
  })
})

describe('runningTaskOf（AC4 双路由第一判据——最新 in_progress）', () => {
  it('在场 → 取末位 in_progress（最新）；缺席 = undefined（blocked/pending 不算执行中）', () => {
    const cards = [card('2.4', 'in_progress'), card('2.5', 'blocked'), card('2.6', 'in_progress'), card('2.7', 'pending')]
    expect(runningTaskOf(cards)?.localId).toBe('2.6')
    expect(runningTaskOf([card('2.5', 'blocked'), card('2.7', 'pending')])).toBeUndefined()
    expect(runningTaskOf([])).toBeUndefined()
  })
})
