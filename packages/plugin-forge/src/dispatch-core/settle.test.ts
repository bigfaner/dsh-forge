// settleWorkerRun 失败判词定向单测（bug 63112ab2——无结算失败原因携带 worker 输出原文，
// 流控分类的载体；缺输出 = 判词只有 stopReason，循环侧无法识别限流）。
// 机械④（forge-verification-hardening）：review-wave-N 修正波标记——多波递增、快照口径、
// 触发面（fix 链收口 / Blocker 返工批）与 fail-soft 缺席零变化。
import { describe, expect, it } from 'vitest'
import type { ForgeTasksService, QueryTaskResult, TaskCard, TaskEvidenceDebt, TaskSnapshot } from '@dsh-forge/contracts'
import { settleWorkerRun } from './settle.js'
import type { SettleCheckpointsFace, WaveSnapshot } from './settle.js'
import type { SpawnWorkerHandle } from './spawn.js'

function snapshot(): TaskSnapshot {
  return {
    taskId: 't-1',
    slug: 'feat-x',
    localId: '2.5',
    source: { kind: 'feature', slug: 'feat-x' },
    title: 'Implement the thing',
    taskType: 'coding-fix',
    taskStatus: 'in_progress',
    breaking: false,
    complexity: 'high',
    createdAt: '2026-10-11T00:00:00.000Z',
    updatedAt: '2026-10-11T00:00:00.000Z',
  }
}

function harness(): ForgeTasksService {
  const query: QueryTaskResult = {
    task: snapshot(),
    container: { kind: 'feature', slug: 'feat-x', title: 'feat-x' },
    records: [],
  }
  return { queryTask: async () => query } as unknown as ForgeTasksService
}

function okHandle(): SpawnWorkerHandle {
  return {
    workerSessionId: 'worker-1',
    result: Promise.resolve({ stopReason: 'end_turn', output: 'done' }),
    dispose: async () => {},
  }
}

function recordingCheckpoints(): { face: SettleCheckpointsFace; calls: Array<Record<string, unknown>> } {
  const calls: Array<Record<string, unknown>> = []
  const face: SettleCheckpointsFace = {
    appendCheckpoint: async (input) => {
      calls.push(input as unknown as Record<string, unknown>)
      return { id: calls.length }
    },
  }
  return { face, calls }
}

const ZERO_SNAPSHOT: WaveSnapshot = { tasksTotal: 0, commitsTotal: 0, fixesTotal: 0, evidenceDebtsTotal: 0 }

/** 结算态任务域桩：settled 终态 + 卡片清单 + 逐卡记录（快照口径数据源） */
function waveHarness(options: {
  readonly settledStatus: 'completed' | 'blocked'
  readonly cards?: readonly Partial<TaskCard>[]
  readonly recordsByTask?: Record<string, readonly { commitHash?: string; evidenceDebt?: TaskEvidenceDebt }[]>
}): ForgeTasksService {
  const base = snapshot()
  const cards: TaskCard[] = (options.cards ?? []).map((c, i) => ({
    taskId: `t-${String(i)}`,
    slug: base.slug,
    localId: c.localId ?? String(i),
    title: `card ${String(i)}`,
    taskType: c.taskType ?? 'coding-enhancement',
    taskStatus: c.taskStatus ?? 'completed',
    prerequisites: [],
    sessionCount: 0,
    ...(c.sourceTask !== undefined ? { sourceTask: c.sourceTask } : {}),
  }))
  const detail = (localId: string): QueryTaskResult => ({
    task: { ...base, localId, taskStatus: options.settledStatus },
    container: { kind: 'feature', slug: base.slug, title: base.slug },
    records: (options.recordsByTask?.[localId] ?? []).map((r) => ({
      verb: 'submit' as const,
      actor: 'plugin-tool' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
      ...(r.commitHash !== undefined ? { commitHash: r.commitHash } : {}),
      ...(r.evidenceDebt !== undefined ? { evidenceDebt: r.evidenceDebt } : {}),
    })),
  })
  const completed = cards.filter((c) => c.taskStatus === 'completed')
  const byStatus = { completed: completed.length } as never
  return {
    queryTask: async (input: { taskRef: { localId: string } }) => detail(input.taskRef.localId),
    listTasks: async () => cards,
    taskStats: async () => ({ total: cards.length, byStatus, unmetPending: 0 }),
    // 1.16 批量结算读面桩（快照口径数据源——替代逐卡 queryTask）
    taskSettlements: async () =>
      completed.map((c) => {
        const records = options.recordsByTask?.[c.localId] ?? []
        return {
          slug: c.slug,
          localId: c.localId,
          taskType: c.taskType,
          fixDerived: c.sourceTask !== undefined,
          commitHashes: records.map((r) => r.commitHash).filter((h): h is string => h !== undefined && h !== ''),
          evidenceDebtCount: records.filter((r) => r.evidenceDebt !== undefined).length,
        }
      }),
  } as unknown as ForgeTasksService
}

const RUN = { projectId: 'p-1', task: snapshot(), digest: 'd', handle: okHandle(), spawnStartedAt: Date.now() }

describe('settleWorkerRun 失败判词（bug 63112ab2）', () => {
  it('无结算失败原因携带 worker 输出原文（限流分类载体）', async () => {
    const handle: SpawnWorkerHandle = {
      workerSessionId: 'worker-1',
      result: Promise.resolve({ stopReason: 'error', output: 'provider error: 429 rate limit exceeded' }),
      dispose: async () => {},
    }
    const settlement = await settleWorkerRun({ tasks: harness() }, { projectId: 'p-1', task: snapshot(), digest: 'd', handle, spawnStartedAt: Date.now() })
    expect(settlement.case).toBe('failed')
    if (settlement.case !== 'failed') return
    const message = settlement.cause instanceof Error ? settlement.cause.message : String(settlement.cause)
    expect(message).toContain('stopReason: error')
    expect(message).toContain('429 rate limit exceeded')
  })

  it('输出为空 = 判词零冒号尾（不引入空尾巴）', async () => {
    const handle: SpawnWorkerHandle = {
      workerSessionId: 'worker-1',
      result: Promise.resolve({ stopReason: 'error', output: '' }),
      dispose: async () => {},
    }
    const settlement = await settleWorkerRun({ tasks: harness() }, { projectId: 'p-1', task: snapshot(), digest: 'd', handle, spawnStartedAt: Date.now() })
    if (settlement.case !== 'failed') return expect.fail('expected failed')
    const message = settlement.cause instanceof Error ? settlement.cause.message : String(settlement.cause)
    expect(message).toBe('worker run ended without a settlement (stopReason: error)')
  })
})

describe('机械④ · review-wave-N 修正波标记（settleWorkerRun）', () => {
  it('fix 链收口：coding-fix success 结算落 review-wave-N 标记——proposalId/baseCommitHash/快照齐备', async () => {
    const { face, calls } = recordingCheckpoints()
    const tasks = waveHarness({
      settledStatus: 'completed',
      cards: [
        { localId: '1', taskStatus: 'completed' },
        { localId: '2', taskType: 'coding-fix', taskStatus: 'completed' },
      ],
      recordsByTask: {
        '1': [{ commitHash: 'c1' }, { commitHash: 'c1' }, { commitHash: 'c2' }],
        '2': [{ commitHash: 'c3', evidenceDebt: { suite: 'e2e', specs: ['a.spec.ts'] } }],
      },
    })
    const settlement = await settleWorkerRun(
      { tasks, checkpoints: face, resolveHeadCommit: async () => 'head-abc' },
      { ...RUN, worktreeCwd: 'C:\\wt', proposalId: 'prop-1' },
    )
    expect(settlement.case).toBe('settled')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({
      projectId: 'p-1',
      proposalId: 'prop-1',
      mark: 'review-wave-N',
      baseCommitHash: 'head-abc',
      // 快照口径：tasks_total=2（completed 数）；commits_total=3（c1/c2/c3 去重——c1 双记去重）；
      // fixes_total=1（coding-fix）；evidence_debts_total=1（evidenceDebt 声明一次）
      snapshots: { tasksTotal: 2, commitsTotal: 3, fixesTotal: 1, evidenceDebtsTotal: 1 },
    })
  })

  it('多波递增：连续两次 fix 结算各落一行，wave_seq 缺省由域自动递增（调用方免记序数）', async () => {
    const { face, calls } = recordingCheckpoints()
    const tasks = waveHarness({ settledStatus: 'completed', cards: [{ localId: '0', taskType: 'coding-fix' }] })
    const deps = { tasks, checkpoints: face, resolveHeadCommit: async () => 'head-1' }
    const ctx = { ...RUN, worktreeCwd: 'C:\\wt', proposalId: 'prop-1' }
    await settleWorkerRun(deps, ctx)
    await settleWorkerRun(deps, ctx)
    expect(calls).toHaveLength(2)
    expect(calls[0]?.['mark']).toBe('review-wave-N')
    expect(calls[1]?.['mark']).toBe('review-wave-N')
    expect('waveSeq' in calls[0]!).toBe(false)
    expect('waveSeq' in calls[1]!).toBe(false)
  })

  it('Blocker 返工批：blocked 结算同样落修正波标记', async () => {
    const { face, calls } = recordingCheckpoints()
    const tasks = waveHarness({ settledStatus: 'blocked', cards: [{ localId: '0', taskType: 'coding-fix' }] })
    const settlement = await settleWorkerRun(
      { tasks, checkpoints: face, resolveHeadCommit: async () => 'head-2' },
      { ...RUN, worktreeCwd: 'C:\\wt', proposalId: 'prop-1' },
    )
    expect(settlement.case).toBe('settled')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.['mark']).toBe('review-wave-N')
    expect(calls[0]?.['baseCommitHash']).toBe('head-2')
  })

  it('非波点不落标记：普通 coding-feature success 结算零标记调用', async () => {
    const { face, calls } = recordingCheckpoints()
    const tasks = waveHarness({ settledStatus: 'completed', cards: [{ localId: '0' }] })
    const task: TaskSnapshot = { ...RUN.task, taskType: 'coding-feature', sourceTaskId: undefined }
    await settleWorkerRun(
      { tasks, checkpoints: face, resolveHeadCommit: async () => 'head-3' },
      { ...RUN, task, proposalId: 'prop-1' },
    )
    expect(calls).toHaveLength(0)
  })

  it('依赖缺席零变化：无 checkpoints 面或无 proposalId 映射 = 不落标记且零异常', async () => {
    const { face, calls } = recordingCheckpoints()
    const tasks = waveHarness({ settledStatus: 'completed', cards: [{ localId: '0', taskType: 'coding-fix' }] })
    const deps = { tasks, checkpoints: face, resolveHeadCommit: async () => 'head-4' }
    await settleWorkerRun(deps, RUN) // 无 proposalId
    await settleWorkerRun({ tasks, resolveHeadCommit: async () => 'head-4' }, { ...RUN, proposalId: 'prop-1' }) // 无 checkpoints 面
    expect(calls).toHaveLength(0)
  })

  it('标记失败 fail-soft：appendCheckpoint 抛出不回滚已定结算', async () => {
    const face: SettleCheckpointsFace = {
      appendCheckpoint: async () => {
        throw new Error('db locked')
      },
    }
    const tasks = waveHarness({ settledStatus: 'completed', cards: [{ localId: '0', taskType: 'coding-fix' }] })
    const settlement = await settleWorkerRun(
      { tasks, checkpoints: face, resolveHeadCommit: async () => 'head-5' },
      { ...RUN, proposalId: 'prop-1' },
    )
    expect(settlement.case).toBe('settled')
    if (settlement.case !== 'settled') return
    expect(settlement.result.outcome).toBe('success')
  })

  it('base commit 回退链：无 worktreeCwd/解析器缺 HEAD 时回落 submit commit hash；双缺 = 跳过标记', async () => {
    const { face, calls } = recordingCheckpoints()
    const tasks = waveHarness({ settledStatus: 'completed', cards: [{ localId: '0', taskType: 'coding-fix' }] })
    const submit = { verb: 'submit' as const, commitHash: 'submit-abc' }
    const tasksWithSubmit = {
      ...tasks,
      queryTask: async () => ({
        task: { ...snapshot(), taskStatus: 'completed' },
        container: { kind: 'feature', slug: 'feat-x', title: 'feat-x' },
        records: [submit],
      }),
    } as unknown as ForgeTasksService
    await settleWorkerRun({ tasks: tasksWithSubmit, checkpoints: face }, { ...RUN, proposalId: 'prop-1' })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.['baseCommitHash']).toBe('submit-abc')
  })

  it('快照口径：in_progress 卡不计入 tasks_total/fixes_total（结算成功才入账）', async () => {
    const { face, calls } = recordingCheckpoints()
    const tasks = waveHarness({
      settledStatus: 'completed',
      cards: [
        { localId: '0', taskStatus: 'completed' },
        { localId: '1', taskType: 'coding-fix', taskStatus: 'in_progress' },
        { localId: '2', sourceTask: { slug: 'feat-x', localId: '0' }, taskStatus: 'completed' },
      ],
      recordsByTask: { '0': [{ commitHash: 'c9' }] },
    })
    await settleWorkerRun(
      { tasks, checkpoints: face, resolveHeadCommit: async () => 'head-6' },
      { ...RUN, worktreeCwd: 'C:\\wt', proposalId: 'prop-1' },
    )
    expect(calls[0]?.['snapshots']).toEqual({ tasksTotal: 2, commitsTotal: 1, fixesTotal: 1, evidenceDebtsTotal: 0 })
    expect(ZERO_SNAPSHOT.tasksTotal).toBe(0)
  })
})
