/**
 * The lineage derivation service's matrix (M4 task 2.5; tech-design
 * §Testing Strategy·Per-Layer — join 矩阵(命中/未命中/多后代/递归深度/超上限
 * 20/ended 缺席/100ms 超时降级) + 执行中判定矩阵(BIZ-workbench-008) + the
 * guarded adapter/degrade discipline(BIZ-resilience-001). The upstream
 * faces arrive as plain duck-typed fixtures — the vendored shapes'
 * structural twins, exactly what the 1.6-discipline adapters accept.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createLineageDeadline, defaultLineageLog, deriveSessionLineage, deriveTaskBinding,
  judgeExecuting, LINEAGE_BUDGET_MS, LINEAGE_DESCENDANT_LIMIT, lineageSnapshotOf,
  logLineageDegraded, toLineageSessionsSource,
} from '../src/client/lineage'
import type {
  LineageCatalogEntry, LineageSessionRow, LineageSessionsSnapshot,
} from '../src/client/lineage'
import type { SessionLink } from '../src/client/ipc-types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TASK = { key: 'dsh-forge-m4/2.5', title: 'lineage service', status: 'in_progress' } as const

const link = (
  sessionId: string,
  status: 'active' | 'ended',
  startedAt: string,
  endedAt: string | null = null,
): SessionLink => ({
  id: `link-${sessionId}-${startedAt}`, projectId: 'p1', taskKey: TASK.key,
  sessionId, status, startedAt, endedAt,
})

const row = (
  id: string,
  extra: Partial<LineageSessionRow> = {},
): LineageSessionRow => ({ id, ...extra })

const child = (
  id: string,
  mode: 'one-shot' | 'continuable',
  extra: Partial<Extract<LineageCatalogEntry, { kind: 'child' }>> = {},
): LineageCatalogEntry => ({ kind: 'child', id, mode, ...extra })

/** The 递归深度 + 双源 join fixture (catalog ⊕ byId backfill). */
const RICH_SNAPSHOT: LineageSessionsSnapshot = Object.freeze({
  byId: Object.freeze({
    'top-1': Object.freeze(row('top-1', { displayTitle: 'Dispatch', running: true })),
    'top-0': undefined,
    'sub-1': Object.freeze(row('sub-1', {
      title: '2.5 impl', origin: 'subagent', parentId: 'top-1', running: true,
    })),
    'sub-2': Object.freeze(row('sub-2', {
      displayTitle: 'DT-2', origin: 'subagent', parentId: 'top-1', running: false,
    })),
    'sub-1-1': Object.freeze(row('sub-1-1', {
      origin: 'subagent', parentId: 'sub-1', running: true,
    })),
  }),
  subagentsByParent: Object.freeze({
    'top-1': Object.freeze({
      entries: Object.freeze([
        child('sub-1', 'continuable', { activity: 'running', label: 'label-c1' }),
        { kind: 'diagnostic', id: 'sub-x' },
        child('sub-3', 'one-shot', { activity: 'running', label: 'L3' }),
      ] as const),
    }),
    'sub-1': Object.freeze({ entries: Object.freeze([child('sub-1-1', 'one-shot', { activity: 'inactive' })]) }),
  }),
})

const RICH_LINKS: readonly SessionLink[] = Object.freeze([
  link('top-0', 'ended', '2026-09-20T10:00:00.000Z', '2026-09-20T12:00:00.000Z'),
  link('top-1', 'active', '2026-09-22T08:00:00.000Z'),
])

// ---------------------------------------------------------------------------
// 执行中判定矩阵 (BIZ-workbench-008)
// ---------------------------------------------------------------------------

describe('judgeExecuting (BIZ-workbench-008 状态 × 挂接正交)', () => {
  it('in_progress × active 挂接 → 执行中', () => {
    expect(judgeExecuting('in_progress', [link('s1', 'active', '2026-09-22T08:00:00.000Z')]))
      .toEqual({ executing: true, unlinkedInProgress: false })
  })

  it('in_progress 无 active → 常规 + 未挂接标注位 (ended-only 与空集同型)', () => {
    const expected = { executing: false, unlinkedInProgress: true }
    expect(judgeExecuting('in_progress', [link('s1', 'ended', '2026-09-20T10:00:00.000Z')])).toEqual(expected)
    expect(judgeExecuting('in_progress', [])).toEqual(expected)
  })

  it('非 in_progress → 常规 (两标注位皆 false,即便存在 active 挂接)', () => {
    const active = [link('s1', 'active', '2026-09-22T08:00:00.000Z')]
    expect(judgeExecuting('completed', active)).toEqual({ executing: false, unlinkedInProgress: false })
    expect(judgeExecuting('pending', [])).toEqual({ executing: false, unlinkedInProgress: false })
    expect(judgeExecuting('blocked', active)).toEqual({ executing: false, unlinkedInProgress: false })
  })
})

// ---------------------------------------------------------------------------
// The join matrix (命中/未命中/多后代/递归深度/超上限/ended 缺席)
// ---------------------------------------------------------------------------

describe('deriveTaskBinding join matrix', () => {
  it('命中:links active/ended 混排 → 新→旧 + endedAt 透传 + byId join 位', () => {
    const binding = deriveTaskBinding({
      task: TASK, links: RICH_LINKS, sessions: RICH_SNAPSHOT,
      log: () => {},
    })
    expect(binding.links).toEqual([
      {
        sessionId: 'top-1', status: 'active',
        startedAt: '2026-09-22T08:00:00.000Z', lineageAvailable: true,
      },
      {
        sessionId: 'top-0', status: 'ended',
        startedAt: '2026-09-20T10:00:00.000Z', endedAt: '2026-09-20T12:00:00.000Z',
        lineageAvailable: false, // disposed → byId 缺席 → 血缘位「不可用」(行仍在 = 可展开)
      },
    ])
    expect(binding.degraded).toBe(false)
  })

  it('命中 + 递归深度 + 多后代:active 树内 origin=subagent 递归后代,地址三元组逐项对拍', () => {
    const binding = deriveTaskBinding({
      task: TASK, links: RICH_LINKS, sessions: RICH_SNAPSHOT,
      log: () => {},
    })
    // DFS 序:catalog 先(byId title/running 优先)→ 子树递归 → byId-only 回填。
    expect(binding.executingSubagents).toEqual([
      {
        sessionId: 'sub-1', parentSessionId: 'top-1', title: '2.5 impl',
        running: true, depth: 1, address: { parentSessionId: 'top-1', childSessionId: 'sub-1', mode: 'continuable' },
      },
      {
        sessionId: 'sub-1-1', parentSessionId: 'sub-1', title: 'sub-1-1',
        running: true, depth: 2, address: { parentSessionId: 'sub-1', childSessionId: 'sub-1-1', mode: 'one-shot' },
      },
      {
        sessionId: 'sub-3', parentSessionId: 'top-1', title: 'L3',
        running: true, depth: 1, address: { parentSessionId: 'top-1', childSessionId: 'sub-3', mode: 'one-shot' },
      },
      {
        sessionId: 'sub-2', parentSessionId: 'top-1', title: 'DT-2',
        running: false, depth: 1, address: { parentSessionId: 'top-1', childSessionId: 'sub-2', mode: 'one-shot' },
      },
    ])
    expect(binding.executingSubagentTotal).toBe(4)
  })

  it('执行中判定位随 binding 产出 (in_progress × active → executing)', () => {
    const binding = deriveTaskBinding({
      task: TASK, links: RICH_LINKS, sessions: RICH_SNAPSHOT, log: () => {},
    })
    expect(binding.executing).toBe(true)
    expect(binding.unlinkedInProgress).toBe(false)
  })

  it('未命中:active 挂接的会话在快照内无行亦无目录 → 零后代零徽标,不降级', () => {
    const snapshot: LineageSessionsSnapshot = { byId: {} }
    const binding = deriveTaskBinding({
      task: TASK, links: [link('ghost', 'active', '2026-09-22T08:00:00.000Z')],
      sessions: snapshot, log: () => {},
    })
    expect(binding.executingSubagents).toEqual([])
    expect(binding.executingSubagentTotal).toBe(0)
    expect(binding.sessionTaskBadges).toEqual([])
    expect(binding.degraded).toBe(false)
  })

  it('sessionTaskBadges 反向徽标:byId 在位的挂接会话各一枚,disposed 会话跳过', () => {
    const binding = deriveTaskBinding({
      task: TASK, links: RICH_LINKS, sessions: RICH_SNAPSHOT, log: () => {},
    })
    expect(binding.sessionTaskBadges).toEqual([
      { sessionId: 'top-1', taskKey: TASK.key, title: TASK.title },
    ])
  })

  it('in_progress 无 active 挂接:常规 + unlinkedInProgress 位,判定与 join 正交', () => {
    const binding = deriveTaskBinding({
      task: TASK,
      links: [link('top-0', 'ended', '2026-09-20T10:00:00.000Z', '2026-09-20T12:00:00.000Z')],
      sessions: RICH_SNAPSHOT, log: () => {},
    })
    expect(binding.executing).toBe(false)
    expect(binding.unlinkedInProgress).toBe(true)
    // ended 挂接的树不参与 executingSubagents (仅 active 挂接的顶层会话血缘树)。
    expect(binding.executingSubagents).toEqual([])
    expect(binding.degraded).toBe(false)
  })

  it('多 active 挂接:各顶层树并集,跨树去重,重复根只走一次', () => {
    const snapshot: LineageSessionsSnapshot = {
      byId: {
        'top-a': row('top-a'),
        'top-b': row('top-b'),
        'a-1': row('a-1', { origin: 'subagent', parentId: 'top-a' }),
        'b-1': row('b-1', { origin: 'subagent', parentId: 'top-b' }),
      },
      subagentsByParent: {
        'top-a': { entries: [child('a-1', 'one-shot')] },
        'top-b': { entries: [child('b-1', 'continuable')] },
      },
    }
    const links: readonly SessionLink[] = [
      link('top-b', 'active', '2026-09-23T08:00:00.000Z'),
      link('top-a', 'active', '2026-09-22T08:00:00.000Z'),
      link('top-a', 'active', '2026-09-21T08:00:00.000Z'), // 重复根
    ]
    const binding = deriveTaskBinding({ task: TASK, links, sessions: snapshot, log: () => {} })
    expect(binding.executingSubagents.map(hit => hit.sessionId).sort()).toEqual(['a-1', 'b-1'])
    expect(binding.executingSubagentTotal).toBe(2)
  })

  it('超上限 20:executingSubagents 截断为 20,total 保留全量(「查看全部」位)', () => {
    const entries = Array.from({ length: 25 }, (_, i) => child(`sub-${String(i).padStart(2, '0')}`, 'one-shot'))
    const snapshot: LineageSessionsSnapshot = {
      byId: { 'top-1': row('top-1') },
      subagentsByParent: { 'top-1': { entries } },
    }
    const binding = deriveTaskBinding({
      task: TASK, links: [link('top-1', 'active', '2026-09-22T08:00:00.000Z')],
      sessions: snapshot, log: () => {},
    })
    expect(binding.executingSubagents).toHaveLength(LINEAGE_DESCENDANT_LIMIT)
    expect(binding.executingSubagentTotal).toBe(25)
    expect(binding.executingSubagents[19]?.sessionId).toBe('sub-19') // DFS 序截断
  })

  it('血缘环防御:parentId 成环不悬挂、不重复 (visited 集收口)', () => {
    const snapshot: LineageSessionsSnapshot = {
      byId: {
        'top-1': row('top-1'),
        'a': row('a', { origin: 'subagent', parentId: 'b' }),
        'b': row('b', { origin: 'subagent', parentId: 'a' }),
      },
      subagentsByParent: { 'top-1': { entries: [child('a', 'one-shot')] } },
    }
    const binding = deriveTaskBinding({
      task: TASK, links: [link('top-1', 'active', '2026-09-22T08:00:00.000Z')],
      sessions: snapshot, log: () => {},
    })
    expect(binding.executingSubagents.map(hit => hit.sessionId).sort()).toEqual(['a', 'b'])
    expect(binding.degraded).toBe(false)
  })

  it('非 subagent origin 的 byId 行不进血缘树', () => {
    const snapshot: LineageSessionsSnapshot = {
      byId: {
        'top-1': row('top-1'),
        'plain': row('plain', { parentId: 'top-1' }), // 无 origin='subagent'
      },
    }
    const binding = deriveTaskBinding({
      task: TASK, links: [link('top-1', 'active', '2026-09-22T08:00:00.000Z')],
      sessions: snapshot, log: () => {},
    })
    expect(binding.executingSubagents).toEqual([])
  })

  it('不落库纪律:深冻结输入下完整推导(零写路径),产物可随时重算一致', () => {
    const again = deriveTaskBinding({
      task: TASK, links: RICH_LINKS, sessions: RICH_SNAPSHOT, log: () => {},
    })
    expect(again).toEqual(deriveTaskBinding({
      task: TASK, links: RICH_LINKS, sessions: RICH_SNAPSHOT, log: () => {},
    }))
    expect(again.executingSubagentTotal).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// deriveSessionLineage (the C5 row-expand face)
// ---------------------------------------------------------------------------

describe('deriveSessionLineage', () => {
  it('单会话树推导与任务面同构 (命中 + 上限截断)', () => {
    const result = deriveSessionLineage('top-1', RICH_SNAPSHOT)
    expect(result.total).toBe(4)
    expect(result.hits.map(hit => hit.sessionId)).toEqual(['sub-1', 'sub-1-1', 'sub-3', 'sub-2'])
    expect(result.timedOut).toBe(false)
  })

  it('快照缺席 → 空结果不降级标志 (调用方按 byId join 位呈现「不可用」)', () => {
    expect(deriveSessionLineage('top-1', undefined)).toEqual({ hits: [], total: 0, timedOut: false })
  })

  it('超上限:hits 截 20,total 全量', () => {
    const entries = Array.from({ length: 22 }, (_, i) => child(`c-${i}`, 'one-shot'))
    const snapshot: LineageSessionsSnapshot = {
      byId: { 'top-1': row('top-1') },
      subagentsByParent: { 'top-1': { entries } },
    }
    const result = deriveSessionLineage('top-1', snapshot)
    expect(result.hits).toHaveLength(20)
    expect(result.total).toBe(22)
  })
})

// ---------------------------------------------------------------------------
// ≤100ms 预算:超时降级(fake timers)+ 快照缺席降级 + 自动恢复
// ---------------------------------------------------------------------------

/** A flat catalog wide enough to cross two checkpoint cadences (64/128). */
const wideSnapshot = (count: number): LineageSessionsSnapshot => ({
  byId: { 'top-1': row('top-1') },
  subagentsByParent: {
    'top-1': { entries: Array.from({ length: count }, (_, i) => child(`w-${i}`, 'one-shot')) },
  },
})

describe('≤100ms 预算降级 (BIZ-resilience-001: 静默 + 结构化 log)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('规模本身不触发降级:140 后代在同钟下完整产出 (仅超时才降级)', () => {
    vi.useFakeTimers()
    const binding = deriveTaskBinding({
      task: TASK, links: [link('top-1', 'active', '2026-09-22T08:00:00.000Z')],
      sessions: wideSnapshot(140), log: () => {},
    })
    expect(binding.degraded).toBe(false)
    expect(binding.executingSubagentTotal).toBe(140)
  })

  it('超时 → degraded=true 仅顶层(links 保留/后代清零)+ budget-expired 结构化 log,不抛错', () => {
    vi.useFakeTimers()
    // 同一 now 缝驱动 deadline 与检查点:每次读钟 +60ms → 第 128 节点检查点 >100ms。
    const advancingNow = vi.fn(() => {
      vi.advanceTimersByTime(60)
      return Date.now()
    })
    const log = vi.fn()
    const binding = deriveTaskBinding({
      task: TASK, links: RICH_LINKS,
      sessions: wideSnapshot(140), now: advancingNow, log,
    })
    expect(binding.degraded).toBe(true)
    expect(binding.executingSubagents).toEqual([])
    expect(binding.executingSubagentTotal).toBe(0)
    expect(binding.links).toHaveLength(2) // 仅顶层:挂接历史原样保留
    expect(binding.executing).toBe(true) // 判定与降级正交 (无需快照)
    expect(log).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith('[forge-lineage] degraded', {
      reason: 'budget-expired', taskKey: TASK.key, elapsedMs: expect.any(Number),
    })
    expect(advancingNow.mock.calls.length).toBeGreaterThan(2) // 检查点确实读钟
  })

  it('deriveSessionLineage 同预算纪律:超时 → timedOut=true 且不产部分树', () => {
    vi.useFakeTimers()
    let reads = 0
    const advancingNow = (): number => {
      reads += 1
      vi.advanceTimersByTime(60)
      return Date.now()
    }
    const result = deriveSessionLineage('top-1', wideSnapshot(140), { now: advancingNow })
    expect(result.timedOut).toBe(true)
    expect(result.hits).toEqual([])
    expect(result.total).toBe(0)
    expect(reads).toBeGreaterThan(2)
  })

  it('上游快照缺席 → 同降级(仅顶层)+ snapshot-absent log;恢复后自动回完整', () => {
    const log = vi.fn()
    const degradedBinding = deriveTaskBinding({
      task: TASK, links: RICH_LINKS, sessions: undefined, log,
    })
    expect(degradedBinding.degraded).toBe(true)
    expect(degradedBinding.executingSubagents).toEqual([])
    expect(degradedBinding.sessionTaskBadges).toEqual([])
    expect(degradedBinding.links[0]?.sessionId).toBe('top-1') // 仅顶层保留
    expect(log).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith('[forge-lineage] degraded', {
      reason: 'snapshot-absent', taskKey: TASK.key,
    })

    // 自动回完整:同一输入补上快照即完整推导 (纯函数 = 恢复即重算)。
    const recovered = deriveTaskBinding({
      task: TASK, links: RICH_LINKS, sessions: RICH_SNAPSHOT, log,
    })
    expect(recovered.degraded).toBe(false)
    expect(recovered.executingSubagentTotal).toBe(4)
  })

  it('createLineageDeadline:严格大于预算才算过期,默认预算 = 100ms', () => {
    vi.useFakeTimers()
    const deadline = createLineageDeadline(() => 1_000)
    expect(deadline.budgetMs).toBe(LINEAGE_BUDGET_MS)
    expect(deadline.startedAt).toBe(1_000)
    expect(deadline.expired(1_100)).toBe(false) // 恰好 100ms:未超
    expect(deadline.expired(1_100.5)).toBe(true) // >100ms:超
    vi.useRealTimers()
  })
})

// ---------------------------------------------------------------------------
// Guarded adapters (1.6 discipline) + the structured log default
// ---------------------------------------------------------------------------

describe('guarded duck-typed adapters', () => {
  it('toLineageSessionsSource:形准的 ctx.sessions 候选收窄成功', () => {
    const source = toLineageSessionsSource({
      list: { getSnapshot: () => ({ ids: [], byId: {}, subagentsByParent: {} }) },
    })
    expect(source).toBeDefined()
  })

  it('缺 list / getSnapshot 非函数 / 非对象候选 → undefined (degrade, never throw)', () => {
    expect(toLineageSessionsSource(undefined)).toBeUndefined()
    expect(toLineageSessionsSource(null)).toBeUndefined()
    expect(toLineageSessionsSource({})).toBeUndefined()
    expect(toLineageSessionsSource({ list: {} })).toBeUndefined()
    expect(toLineageSessionsSource({ list: { getSnapshot: 'not-fn' } })).toBeUndefined()
  })

  it('lineageSnapshotOf:完好快照双源透传;缺 subagentsByParent 仍可(byId 回填面)', () => {
    const source = toLineageSessionsSource({
      list: { getSnapshot: () => ({ byId: RICH_SNAPSHOT.byId, subagentsByParent: RICH_SNAPSHOT.subagentsByParent }) },
    })
    const snapshot = lineageSnapshotOf(source)
    expect(snapshot?.byId['sub-1']?.id).toBe('sub-1')
    expect(snapshot?.subagentsByParent?.['top-1']?.entries).toHaveLength(3)

    const partial = lineageSnapshotOf(toLineageSessionsSource({
      list: { getSnapshot: () => ({ byId: { 's': row('s') } }) },
    }))
    expect(partial?.byId['s']?.id).toBe('s')
    expect(partial?.subagentsByParent).toBeUndefined()
  })

  it('lineageSnapshotOf:抛错读/畸形快照/缺席源 → undefined(运行时条件可用性)', () => {
    expect(lineageSnapshotOf(undefined)).toBeUndefined()
    expect(lineageSnapshotOf(toLineageSessionsSource({
      list: { getSnapshot: () => { throw new Error('upstream gone') } },
    }))).toBeUndefined()
    expect(lineageSnapshotOf(toLineageSessionsSource({
      list: { getSnapshot: () => ({ ids: [] }) }, // 无 byId
    }))).toBeUndefined()
    expect(lineageSnapshotOf(toLineageSessionsSource({
      list: { getSnapshot: () => 'string snapshot' },
    }))).toBeUndefined()
  })

  it('缺席源经 lineageSnapshotOf → undefined → deriveTaskBinding 走 snapshot-absent 降级', () => {
    const source = toLineageSessionsSource({
      list: { getSnapshot: () => { throw new Error('runtime-conditional') } },
    })
    const log = vi.fn()
    const binding = deriveTaskBinding({
      task: TASK, links: RICH_LINKS, sessions: lineageSnapshotOf(source), log,
    })
    expect(binding.degraded).toBe(true)
    expect(log).toHaveBeenCalledWith('[forge-lineage] degraded', {
      reason: 'snapshot-absent', taskKey: TASK.key,
    })
  })
})

describe('structured log default sink', () => {
  it('defaultLineageLog 走 console.warn 的 [forge-lineage] 结构化单行', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      defaultLineageLog('msg', { a: 1 })
      logLineageDegraded('snapshot-absent', TASK)
      expect(warn).toHaveBeenNthCalledWith(1, 'msg', { a: 1 })
      expect(warn).toHaveBeenNthCalledWith(2, '[forge-lineage] degraded', {
        reason: 'snapshot-absent', taskKey: TASK.key,
      })
    } finally {
      warn.mockRestore()
    }
  })
})
