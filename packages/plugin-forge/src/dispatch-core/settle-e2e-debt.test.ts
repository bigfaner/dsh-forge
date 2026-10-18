// 改进7（dispatch-loop-hardening · e2e 取证债）定向单测：
// ① settleWorkerRun 欠账任务生成——success 结算 submit record 携带 evidenceDebt（实现态
//    部分结算）→ 自动生成同容器 test-run 欠账任务（dependsOn 实现卡 localId）；
// ② fail-soft——addTask 落库故障不回滚已定结算（result 零 evidenceDebt）；
// ③ blocked / 无欠账 → 零 addTask；
// ④ claimForDispatch e2eBaselineRed 透传 claimTask（简报红灯清单载体）。
import { describe, expect, it, vi } from 'vitest'
import type {
  AddTaskInput,
  ClaimTaskResult,
  ForgeTasksService,
  QueryTaskResult,
  TaskSnapshot,
  TaskStats,
  TaskStatus,
} from '@dsh-forge/contracts'
import { claimForDispatch } from './core.js'
import { settleWorkerRun } from './settle.js'
import type { DispatchCoreArgs, DispatchCoreDeps, DispatchCoreExec } from './core.js'
import type { SpawnWorkerHandle } from './spawn.js'

function snapshot(over: Partial<TaskSnapshot> = {}): TaskSnapshot {
  return {
    taskId: 't-1',
    slug: 'feat-x',
    localId: '2.5',
    source: { kind: 'feature', slug: 'feat-x' },
    title: 'Implement the thing',
    taskType: 'coding-feature',
    taskStatus: 'in_progress',
    breaking: false,
    complexity: 'high',
    createdAt: '2026-10-11T00:00:00.000Z',
    updatedAt: '2026-10-11T00:00:00.000Z',
    ...over,
  }
}

function statsOf(over: Partial<Record<TaskStatus, number>> = {}): TaskStats {
  const byStatus: Record<TaskStatus, number> = {
    pending: 0, in_progress: 0, blocked: 0, completed: 0,
    skipped: 0, rejected: 0, suspended: 0, interrupted: 0, ...over,
  }
  return { total: 1, byStatus, unmetPending: 0 }
}

function handle(): SpawnWorkerHandle {
  return { workerSessionId: 'worker-1', result: Promise.resolve({ stopReason: 'completed', output: '' }), dispose: async () => {} }
}

interface Harness {
  tasks: ForgeTasksService
  addTaskInputs: AddTaskInput[]
  setQuery: (q: QueryTaskResult) => void
  setAddTaskError: (e: Error | undefined) => void
}

function harness(initial: QueryTaskResult): Harness {
  const addTaskInputs: AddTaskInput[] = []
  let queryResult = initial
  let addTaskError: Error | undefined
  const tasks = {
    queryTask: async () => queryResult,
    taskStats: async () => statsOf({ completed: 1 }),
    listTasks: async () => [],
    addTask: async (input: AddTaskInput) => {
      if (addTaskError !== undefined) throw addTaskError
      addTaskInputs.push(input)
      return { taskId: 'debt-uuid', slug: input.source.slug, localId: '2.6', reused: false }
    },
  } as unknown as ForgeTasksService
  return {
    tasks,
    addTaskInputs,
    setQuery: (q) => {
      queryResult = q
    },
    setAddTaskError: (e) => {
      addTaskError = e
    },
  }
}

function ctxOf(over: Partial<TaskSnapshot> = {}): { projectId: string; task: TaskSnapshot; digest: string; handle: SpawnWorkerHandle; spawnStartedAt: number } {
  return { projectId: 'p-1', task: snapshot(over), digest: 'digestabc123', handle: handle(), spawnStartedAt: Date.now() }
}

const DEBT = { suite: 'e2e', specs: ['e2e/specs/race-window.spec.ts'], note: '竞速窗断言待真机取证' }

function completedQuery(withDebt: boolean): QueryTaskResult {
  return {
    task: snapshot({ taskStatus: 'completed' }),
    container: { kind: 'feature', slug: 'feat-x', title: 'feat-x' },
    records: [
      {
        verb: 'submit',
        toStatus: 'completed',
        summary: '实现+单测绿',
        commitHash: 'abc1234',
        ...(withDebt ? { evidenceDebt: DEBT } : {}),
        actor: 'plugin-tool',
        createdAt: '2026-10-11T01:00:00.000Z',
      },
    ],
  }
}

describe('改进7 · e2e 取证债（settleWorkerRun 欠账任务生成）', () => {
  it('success + evidenceDebt：自动生成同容器 test-run 欠账任务（dependsOn 实现卡）+ spawned 结果携带 evidenceDebt', async () => {
    const h = harness(completedQuery(true))
    const settlement = await settleWorkerRun({ tasks: h.tasks }, ctxOf())
    expect(settlement.case).toBe('settled')
    if (settlement.case !== 'settled') return
    expect(h.addTaskInputs).toHaveLength(1)
    expect(h.addTaskInputs[0]).toMatchObject({
      projectId: 'p-1',
      source: { kind: 'feature', slug: 'feat-x' },
      type: 'test-run',
      priority: 'P1',
      dependsOn: ['2.5'],
    })
    expect(h.addTaskInputs[0]!.taskDesc).toContain('e2e/specs/race-window.spec.ts')
    expect(settlement.result.evidenceDebt).toEqual({
      taskRef: { slug: 'feat-x', localId: '2.6' },
      suite: 'e2e',
      specs: DEBT.specs,
    })
  })

  it('addTask 落库故障 fail-soft：结算保持 success（不回滚），result 零 evidenceDebt', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const h = harness(completedQuery(true))
      h.setAddTaskError(new Error('db locked'))
      const settlement = await settleWorkerRun({ tasks: h.tasks }, ctxOf())
      expect(settlement.case).toBe('settled')
      if (settlement.case !== 'settled') return
      expect(settlement.result.outcome).toBe('success')
      expect(settlement.result.evidenceDebt).toBeUndefined()
    } finally {
      warn.mockRestore()
    }
  })

  it('success 无欠账 / blocked：零 addTask（欠账任务只由欠账声明触发）', async () => {
    const plain = harness(completedQuery(false))
    const s1 = await settleWorkerRun({ tasks: plain.tasks }, ctxOf())
    expect(s1.case).toBe('settled')
    expect(plain.addTaskInputs).toHaveLength(0)

    const blocked = harness({
      task: snapshot({ taskStatus: 'blocked' }),
      container: { kind: 'feature', slug: 'feat-x', title: 'feat-x' },
      records: [{ verb: 'submit', toStatus: 'blocked', reason: 'e2e red', actor: 'plugin-tool', createdAt: '2026-10-11T01:00:00.000Z' }],
    })
    const s2 = await settleWorkerRun({ tasks: blocked.tasks }, ctxOf())
    expect(s2.case).toBe('settled')
    if (s2.case !== 'settled') return
    expect(s2.result.outcome).toBe('blocked')
    expect(blocked.addTaskInputs).toHaveLength(0)
  })
})

describe('改进7 · e2e 红灯基线清单透传（claimForDispatch → claimTask）', () => {
  it('args.e2eBaselineRed 随 claimTask 入参递达（简报 E2E_BASELINE_RED 行载体）', async () => {
    const claimInputs: unknown[] = []
    const claim: ClaimTaskResult = {
      task: snapshot(),
      dispatchPrompt: 'P',
      persona: 'PERSONA',
      digest: 'digestabc123',
      reclaimed: false,
    }
    const tasks = {
      claimTask: async (input: unknown) => {
        claimInputs.push(input)
        return claim
      },
      taskStats: async () => statsOf({ in_progress: 1 }),
    } as unknown as ForgeTasksService
    const deps: DispatchCoreDeps = { tasks, spawn: async () => handle() }
    const attribution: { slug?: string } = {}
    const exec: DispatchCoreExec = { attribution, parent: {}, signal: undefined, verb: 'run-dag-tasks' }
    const args: DispatchCoreArgs = {
      identity: { sessionId: 'owner-1', loopSourced: true },
      guardKey: 'loop-1',
      projectId: 'p-1',
      source: { kind: 'feature', slug: 'feat-x' },
      e2eBaselineRed: ['e2e/specs/a.spec.ts'],
    }
    const result = await claimForDispatch(deps, exec, args)
    expect(result.kind).toBe('claimed')
    expect(claimInputs[0]).toMatchObject({ e2eBaselineRed: ['e2e/specs/a.spec.ts'] })
  })
})
