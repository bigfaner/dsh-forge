// S1c · 循环独占守卫单测（run-tasks-host-command/1.5 验收面——SC5）：活循环任务源拒绝
// 外部 dispatchTask——显式 slug 径（claim 前）与盲选径（claimTask exclusivityGuard 进核，
// 目标命中即抛）均被拒并附指引；循环自身 loopSourced claim 豁免（decisions #18 身份参数化）。
// tasks/spawn 全桩；登记表 = 模块级易失（resetExclusiveLoopSources 跨用例复位）。
import { afterEach, describe, expect, it } from 'vitest'
import type { ClaimTaskResult, ForgeTasksService, TaskSnapshot, TaskStats, TaskStatus } from '@dsh-forge/contracts'
import { claimForDispatch, dispatchCore } from './core.js'
import type { DispatchCoreArgs, DispatchCoreDeps, DispatchCoreExec } from './core.js'
import {
  clearExclusiveLoopSource,
  exclusiveLoopSourceOf,
  exclusiveScopedRejection,
  externalExclusivityGuard,
  hasExclusiveLoopSources,
  LOOP_EXCLUSIVE_GUIDANCE,
  LoopSourceExclusiveError,
  resetExclusiveLoopSources,
  setExclusiveLoopSource,
} from './exclusivity.js'
import type { ForgeEventSink } from '../events/sink.js'
import type { SpawnWorkerHandle } from './spawn.js'

// ─────────────────────────── 夹具 ───────────────────────────

afterEach(() => {
  resetExclusiveLoopSources()
})

function snapshot(slug = 'feat-x', localId = '2.5'): TaskSnapshot {
  return {
    taskId: 't-1',
    slug,
    localId,
    source: { kind: 'feature', slug },
    title: 'Implement the thing',
    taskType: 'coding-fix',
    taskStatus: 'in_progress',
    breaking: false,
    complexity: 'high',
    createdAt: '2026-10-11T00:00:00.000Z',
    updatedAt: '2026-10-11T00:00:00.000Z',
  }
}

function statsOf(pending: number): TaskStats {
  const byStatus: Record<TaskStatus, number> = {
    pending,
    in_progress: 0,
    blocked: 0,
    completed: 0,
    skipped: 0,
    rejected: 0,
    suspended: 0,
    interrupted: 0,
  }
  return { total: pending, byStatus, unmetPending: 0 }
}

interface Harness {
  deps: DispatchCoreDeps
  claimInputs: unknown[]
  setClaim(result: ClaimTaskResult): void
  /** 让 claimTask 桩模仿真核：exclusivityGuard 在场即对目标行调用（命中独占源 → 抛） */
  setClaimAppliesGuard(apply: boolean): void
}

function harness(claimedTask: TaskSnapshot | null): Harness {
  const claimInputs: unknown[] = []
  let claimResult: ClaimTaskResult = {
    task: claimedTask,
    dispatchPrompt: 'PERSONA + <task-context>',
    digest: 'digestabc123',
    reclaimed: false,
  }
  let applyGuard = false
  const tasks = {
    claimTask: async (input: unknown) => {
      claimInputs.push(input)
      // 模仿真核（S1c 守卫契约）：守卫在场即对目标行判——命中独占源抛（事务回滚归真核单测）
      if (applyGuard) {
        const guard = (input as { exclusivityGuard?: (t: unknown) => void }).exclusivityGuard
        guard?.({ sourceKind: 'feature', slug: claimedTask?.slug ?? 'feat-x', localId: claimedTask?.localId ?? '2.5', taskStatus: 'pending' })
      }
      return claimResult
    },
    taskStats: async () => statsOf(0),
    queryTask: async () => {
      throw new Error('not expected')
    },
    listTasks: async () => [],
    submitTask: async () => {
      throw new Error('not expected')
    },
  } as unknown as ForgeTasksService
  const sink: ForgeEventSink = { emit: () => {}, prepare: async () => {}, dirOf: () => undefined, remember: () => {} }
  const deps: DispatchCoreDeps = {
    tasks,
    events: sink,
    spawn: async (): Promise<SpawnWorkerHandle> => {
      throw new Error('not expected')
    },
  }
  return {
    deps,
    claimInputs,
    setClaim: (r) => {
      claimResult = r
    },
    setClaimAppliesGuard: (apply) => {
      applyGuard = apply
    },
  }
}

function execOf(): DispatchCoreExec {
  const attribution: { slug?: string } = {}
  return { attribution, parent: { agentTag: 'parent' }, signal: undefined, verb: 'dispatchTask' }
}

function argsOf(over: Partial<DispatchCoreArgs> = {}): DispatchCoreArgs {
  return {
    identity: { sessionId: 's-external', loopSourced: false },
    guardKey: 's-external',
    projectId: 'p-1',
    ...over,
  }
}

// ─────────────────────────── 登记表机械 ───────────────────────────

describe('独占登记表（模块级易失——驱动器 start/终态维护）', () => {
  it('set → 独占在读；clear 同实例 → 撤销；clear 异实例（旧迟到清除）→ 不误删新登记', () => {
    const source = { kind: 'feature' as const, slug: 'feat-x' }
    expect(hasExclusiveLoopSources()).toBe(false)
    expect(exclusiveLoopSourceOf(source)).toBeUndefined()
    setExclusiveLoopSource(source, 'loop-1')
    expect(hasExclusiveLoopSources()).toBe(true)
    expect(exclusiveLoopSourceOf(source)).toEqual({ loopId: 'loop-1' })
    clearExclusiveLoopSource(source, 'loop-stale') // 旧实例迟到清除——归属校验拦截
    expect(exclusiveLoopSourceOf(source)).toEqual({ loopId: 'loop-1' })
    clearExclusiveLoopSource(source, 'loop-1')
    expect(exclusiveLoopSourceOf(source)).toBeUndefined()
    clearExclusiveLoopSource(source, 'loop-1') // 幂等（不存在零效应）
  })

  it('kind 区分同 slug 撞键（feature::x 与 proposal::x 互不波及）', () => {
    setExclusiveLoopSource({ kind: 'feature', slug: 'x' }, 'loop-1')
    expect(exclusiveLoopSourceOf({ kind: 'proposal', slug: 'x' })).toBeUndefined()
    expect(exclusiveLoopSourceOf({ kind: 'feature', slug: 'x' })).toBeDefined()
  })
})

// ─────────────────────────── ① 显式 source 径（claim 前即拒） ───────────────────────────

describe('显式 slug 径：活循环任务源的外部 dispatchTask 被拒（claim 前，不触池不领任务）', () => {
  it('外部 scoped claim 命中独占源 → 抛 LoopSourceExclusiveError（附 slug/loopId/指引），claimTask 零调用', async () => {
    const h = harness(snapshot())
    setExclusiveLoopSource({ kind: 'feature', slug: 'feat-x' }, 'loop-1')
    const err = await claimForDispatch(h.deps, execOf(), argsOf({ source: { kind: 'feature', slug: 'feat-x' } })).catch(
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(LoopSourceExclusiveError)
    const exclusive = err as LoopSourceExclusiveError
    expect(exclusive.message).toContain('feat-x')
    expect(exclusive.message).toContain('loop-1')
    expect(exclusive.data).toEqual({ slug: 'feat-x', sourceKind: 'feature', loopId: 'loop-1', guidance: LOOP_EXCLUSIVE_GUIDANCE })
    expect(exclusive.code).toBe('ERR_SPAWN_FAILED') // 「本次派发未发生」承载码（先例——run_in_background 降级拒绝）
    expect(h.claimInputs).toHaveLength(0)
  })

  it('池态无关：独占源无就绪任务也拒（源本身独占）；指引行三向齐备', () => {
    setExclusiveLoopSource({ kind: 'feature', slug: 'feat-x' }, 'loop-1')
    const rejection = exclusiveScopedRejection({ kind: 'feature', slug: 'feat-x' })
    expect(rejection).toBeInstanceOf(LoopSourceExclusiveError)
    expect(LOOP_EXCLUSIVE_GUIDANCE.length).toBeGreaterThanOrEqual(3)
    expect(LOOP_EXCLUSIVE_GUIDANCE.some((g) => g.includes('/stop-dag-tasks'))).toBe(true)
    expect(exclusiveScopedRejection({ kind: 'feature', slug: 'other' })).toBeUndefined()
  })

  it('循环自身 claim 豁免：loopSourced=true 不触发显式拒绝（同源照常领取）', async () => {
    const h = harness(snapshot())
    setExclusiveLoopSource({ kind: 'feature', slug: 'feat-x' }, 'loop-1')
    const claim = await claimForDispatch(h.deps, execOf(), argsOf({ identity: { sessionId: 'owner-1', loopSourced: true }, guardKey: 'loop-1', source: { kind: 'feature', slug: 'feat-x' } }))
    expect(claim.kind).toBe('claimed')
    expect(h.claimInputs).toHaveLength(1)
  })
})

// ─────────────────────────── ② 盲选径（claimTask 守卫回调进核） ───────────────────────────

describe('盲选径：exclusivityGuard 随 claimTask 进核，目标命中独占源行即抛', () => {
  it('有活跃独占时外部 claim 携带守卫；守卫对独占源目标抛、对其它源目标放行', async () => {
    const h = harness(snapshot('feat-x'))
    setExclusiveLoopSource({ kind: 'feature', slug: 'feat-x' }, 'loop-1')
    const guard = externalExclusivityGuard()
    expect(guard).toBeDefined()
    expect(() => guard?.({ sourceKind: 'feature', slug: 'feat-x', localId: '2.5', taskStatus: 'pending' })).toThrowError(LoopSourceExclusiveError)
    expect(() => guard?.({ sourceKind: 'feature', slug: 'other', localId: '1.1', taskStatus: 'pending' })).not.toThrow()

    // 全链形状：claimTask 入参携带守卫键（桩模仿真核——命中即抛传导出 dispatchCore）
    h.setClaimAppliesGuard(true)
    await expect(dispatchCore(h.deps, execOf(), argsOf())).rejects.toBeInstanceOf(LoopSourceExclusiveError)
    const input = h.claimInputs[0] as Record<string, unknown>
    expect(typeof input.exclusivityGuard).toBe('function')
  })

  it('无活跃独占 → 外部 claim 不携带守卫键（冷路径入参逐字节等价）', async () => {
    const h = harness(snapshot())
    expect(externalExclusivityGuard()).toBeUndefined()
    await claimForDispatch(h.deps, execOf(), argsOf())
    expect(h.claimInputs[0]).toEqual({ projectId: 'p-1', sessionId: 's-external' })
  })

  it('盲选未触达独占源（选中其它源任务）→ 放行不拒', async () => {
    const h = harness(snapshot('other')) // 盲选命中其它源
    setExclusiveLoopSource({ kind: 'feature', slug: 'feat-x' }, 'loop-1')
    h.setClaimAppliesGuard(true) // 真核对目标行判——other 不命中 → 放行
    const claim = await claimForDispatch(h.deps, execOf(), argsOf())
    expect(claim.kind).toBe('claimed')
  })
})
