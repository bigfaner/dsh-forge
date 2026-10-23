import { describe, expect, it } from 'vitest'
import {
  badgeText,
  collapsedKey,
  coerceGrouped,
  coerceReadCursors,
  DRAWER_TOP_N,
  DRAWER_WINDOW_MS,
  filterSessions,
  nextStatusFailStreak,
  orderVisible,
  pinnedKey,
  READ_STATE_CHANNEL,
  READ_STATE_WRITE_CHANNEL,
  splitWorkers,
  statusDisplayOk,
  STATUS_FAIL_STREAK_THRESHOLD,
  toggleString,
  unreadOf,
  type DrawerSession,
} from './drawer.ts'

const session = (overrides: Partial<DrawerSession> & { sessionId: string }): DrawerSession => ({
  title: overrides.sessionId,
  updatedAt: 1000,
  running: false,
  asOfSeq: null,
  worker: false,
  ...overrides,
})

describe('grouped 响应收敛（缺字段 fail-soft）', () => {
  const groupedPayload = {
    generatedAt: 42,
    projects: [
      {
        id: 'p1',
        name: 'dsh-forge',
        archived: false,
        worktrees: [{ path: 'Z:/wt/a', branch: 'main', isMain: true, present: true, worktreeName: null }],
        sessions: [
          {
            sessionId: 's-1',
            updatedAt: 1792263003699,
            running: true,
            projections: { kind: 'sequenced', asOfSeq: 12, values: { title: '手机远程审批' } },
          },
          { sessionId: 's-2', origin: 'subagent', parentSessionId: 's-1', projections: { asOfSeq: 5, values: { title: 'worker' } } },
          { sessionId: 's-3', updatedAt: 100, projections: { asOfSeq: 3, values: { title: null } } },
          { noSessionId: true },
        ],
      },
      { id: 'p-archived', name: '旧项目', archived: true, sessions: [] },
      { noId: true },
    ],
    unassigned: [{ sessionId: 's-9', updatedAt: 50, projections: { asOfSeq: 9 } }],
  }

  it('归档项目剔除；worktrees 忽略；SessionSummary 字段收敛', () => {
    const grouped = coerceGrouped(groupedPayload)
    expect(grouped.generatedAt).toBe(42)
    expect(grouped.projects).toHaveLength(1)
    const project = grouped.projects[0]!
    expect(project.name).toBe('dsh-forge')
    expect(project.sessions).toHaveLength(3)
    expect(project.sessions[0]).toMatchObject({ sessionId: 's-1', running: true, asOfSeq: 12, title: '手机远程审批', worker: false })
    expect(project.sessions[1]).toMatchObject({ sessionId: 's-2', worker: true })
    expect(project.sessions[2]).toMatchObject({ sessionId: 's-3', asOfSeq: 3, title: '' })
    expect(grouped.unassigned).toHaveLength(1)
  })

  it('空/畸形 payload 安全', () => {
    expect(coerceGrouped(null)).toEqual({ generatedAt: null, projects: [], unassigned: [] })
    expect(coerceGrouped({}).projects).toHaveLength(0)
  })
})

describe('双级未读（host 侧游标——bug 1dd4b437 localStorage 随 origin churn 丢失）', () => {
  it('unreadOf = asOfSeq − lastReadSeq；游标缺席 = 全量；不可知 = 0', () => {
    const row = session({ sessionId: 'a', asOfSeq: 12 })
    expect(unreadOf(row, undefined)).toBe(12)
    expect(unreadOf(row, 10)).toBe(2)
    expect(unreadOf(row, 12)).toBe(0)
    expect(unreadOf(row, 99)).toBe(0)
    expect(unreadOf(session({ sessionId: 'b', asOfSeq: null }), undefined)).toBe(0)
  })

  it('badgeText：0 隐藏 / 数字 / 99+ 封顶', () => {
    expect(badgeText(0)).toBe('')
    expect(badgeText(3)).toBe('3')
    expect(badgeText(100)).toBe('99+')
  })

  it('游标 host 通道名钉死（host proxy-channels 同源）+ read-state 响应收敛 fail-soft', () => {
    expect(READ_STATE_CHANNEL).toBe('forge:remote/read-state')
    expect(READ_STATE_WRITE_CHANNEL).toBe('forge:remote/read-state-write')
    expect(coerceReadCursors({ cursors: { 's-1': 12, 's-2': 3 } })).toEqual({ 's-1': 12, 's-2': 3 })
    expect(coerceReadCursors({})).toEqual({})
    expect(coerceReadCursors(null)).toEqual({})
    expect(coerceReadCursors({ cursors: { bad: 'x', ok: 2.5, good: 7 } })).toEqual({ good: 7 })
  })
})

describe('排序窗口（置顶 → running → updatedAt 降序；24h top10 可配）', () => {
  const now = 24 * 60 * 60 * 1000 // epoch + 24h
  const rows = [
    session({ sessionId: 'old', updatedAt: now - DRAWER_WINDOW_MS - 1 }), // 窗外
    session({ sessionId: 'fresh1', updatedAt: now - 1000 }),
    session({ sessionId: 'fresh2', updatedAt: now - 2000 }),
    session({ sessionId: 'run', updatedAt: now - 5000, running: true }), // running 排前
  ]

  it('running 排前 + updatedAt 降序 + 窗外剔除', () => {
    const visible = orderVisible(rows, [], now)
    expect(visible.map((row) => row.sessionId)).toEqual(['run', 'fresh1', 'fresh2'])
  })

  it('置顶豁免窗口并按 pin 序居首', () => {
    const visible = orderVisible(rows, ['old', 'fresh2'], now)
    expect(visible.map((row) => row.sessionId)).toEqual(['old', 'fresh2', 'run', 'fresh1'])
  })

  it('top N 截断（置顶额外豁免）', () => {
    const many = Array.from({ length: DRAWER_TOP_N + 3 }, (_, index) =>
      session({ sessionId: `s-${index}`, updatedAt: now - index * 1000 }),
    )
    const visible = orderVisible(many, [], now)
    expect(visible).toHaveLength(DRAWER_TOP_N)
    const pinned = orderVisible(many, ['s-9'], now)
    expect(pinned[0]?.sessionId).toBe('s-9')
    expect(pinned).toHaveLength(DRAWER_TOP_N + 1)
  })
})

describe('worker 筛选 + 检索 + 偏好 toggle', () => {
  it('splitWorkers：origin subagent 行出主列表入 worker 组', () => {
    const rows = [session({ sessionId: 'a' }), session({ sessionId: 'w', worker: true })]
    const { main, workers } = splitWorkers(rows)
    expect(main.map((row) => row.sessionId)).toEqual(['a'])
    expect(workers.map((row) => row.sessionId)).toEqual(['w'])
  })

  it('filterSessions：title/sessionId 子串不区分大小写；空白全量', () => {
    const rows = [session({ sessionId: 's-1', title: '手机 UI 设计' }), session({ sessionId: 's-2', title: '' })]
    expect(filterSessions(rows, 'ui')).toHaveLength(1)
    expect(filterSessions(rows, 'S-2')).toHaveLength(1)
    expect(filterSessions(rows, '  ')).toHaveLength(2)
  })

  it('toggleString 加减 + 视图偏好键按配对域隔离', () => {
    expect(toggleString(['a'], 'a')).toEqual([])
    expect(toggleString(['a'], 'b')).toEqual(['a', 'b'])
    expect(pinnedKey('pair')).toBe('dshf.mobile.drawer.pins.pair')
    expect(collapsedKey('pair')).toBe('dshf.mobile.drawer.collapsed.pair')
  })
})

describe('状态闪断抑制（激活后首包 unauthorized 瞬态不翻断开）', () => {
  it('单次失败计 1 未达阈值仍显已连接；连续达阈值才断开；成功清零', () => {
    expect(STATUS_FAIL_STREAK_THRESHOLD).toBe(2)
    let streak = nextStatusFailStreak(0, false)
    expect(statusDisplayOk(streak)).toBe(true) // 第 1 次失败——瞬态不闪
    streak = nextStatusFailStreak(streak, false)
    expect(statusDisplayOk(streak)).toBe(false) // 第 2 次连续失败——真断开
    streak = nextStatusFailStreak(streak, true)
    expect(streak).toBe(0)
    expect(statusDisplayOk(streak)).toBe(true)
  })
})
