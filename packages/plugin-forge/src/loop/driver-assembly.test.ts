// 装配层测试（bug 548ea94b——机械③/④生产装配断链复核）：与既有 driver.test.ts 直调带桩
// 单测不同，本文件验证 createLoopDriver 依赖注入齐备后，**生产运行路径**会真实落检查点标记：
// checkpoints 面以 ctx.forgeCheckpoints 的真实形状（appendCheckpoint/ensureCheckpoint/
// listCheckpoints——ensure 语义同构域侧：在场 no-op/缺席 append）直传注入，
// resolveProposalId/resolveHeadCommit 同 index.ts 装配形态注入——first-pass-complete 与
// review-wave-N 各至少一例真实落行。
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  AddTaskInput,
  ClaimTaskResult,
  ForgePluginEvent,
  ForgeTasksService,
  QueryTaskResult,
  TaskCard,
  TaskSnapshot,
  TaskStats,
  TaskStatus,
} from '@dsh-forge/contracts'
import { createLoopDriver } from './driver.js'
import type { LoopCheckpointRowLite, LoopCheckpointSnapshot, LoopCheckpointsFace } from './driver.js'
import type { LoopDriverDeps } from './driver.js'
import { createNarrator } from '../notify/index.js'
import type { NarrationChannel, Narrator } from '../notify/index.js'
import type { ForgeEventSink } from '../events/sink.js'
import type { SpawnWorker, SpawnWorkerHandle } from '../dispatch-core/index.js'
import { resetExclusiveLoopSources } from '../dispatch-core/index.js'

const OWNER = 'owner-session-1'
const PROJECT = 'p-1'
const SOURCE = { kind: 'feature', slug: 'feat-x' } as const

afterEach(() => {
  resetExclusiveLoopSources()
})

function snapshot(over: Partial<TaskSnapshot> = {}): TaskSnapshot {
  return {
    taskId: 't-1',
    slug: 'feat-x',
    localId: '2.5',
    source: { kind: 'feature', slug: 'feat-x' },
    title: 'Fix the thing',
    taskType: 'coding-fix',
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
    pending: 0,
    in_progress: 0,
    blocked: 0,
    completed: 0,
    skipped: 0,
    rejected: 0,
    suspended: 0,
    interrupted: 0,
    ...over,
  }
  return { total: 1, byStatus, unmetPending: 0 }
}

const NO_TASK: ClaimTaskResult = { task: null, dispatchPrompt: '', persona: 'PERSONA-MATRIX', digest: '', reclaimed: false }

function claimed(localId = '2.5'): ClaimTaskResult {
  return { task: snapshot({ localId }), dispatchPrompt: 'PERSONA + <task-context>', persona: 'PERSONA-MATRIX', digest: 'digestabc123', reclaimed: false }
}

function queryOf(status: TaskStatus): QueryTaskResult {
  return {
    task: snapshot({ taskStatus: status }),
    container: { kind: 'feature', slug: 'feat-x', title: 'feat-x' },
    records:
      status === 'completed'
        ? [{ verb: 'submit', toStatus: 'completed', summary: 'did it', commitHash: 'abc1234', actor: 'plugin-tool', createdAt: '2026-10-11T01:00:00.000Z' }]
        : [],
  }
}

function cardOf(localId: string, over: Partial<TaskCard> = {}): TaskCard {
  return {
    taskId: `card-feat-x-${localId}`,
    slug: 'feat-x',
    localId,
    title: `Task ${localId}`,
    taskType: 'coding-fix',
    taskStatus: 'pending',
    prerequisites: [],
    sessionCount: 0,
    ...over,
  }
}

/** ctx.forgeCheckpoints 同形域面桩（appendCheckpoint/ensureCheckpoint/listCheckpoints——ensure
 *  幂等语义同构域侧：标记在场 no-op（零底层 append），缺席真实追加；录追加行） */
function coreCheckpointsStub() {
  const appends: Array<{ projectId: string; proposalId: string; mark: string; baseCommitHash: string; snapshots: LoopCheckpointSnapshot }> = []
  const rows: LoopCheckpointRowLite[] = []
  const core: LoopCheckpointsFace = {
    ensureCheckpoint: async (input) => {
      if (rows.some((r) => r.mark === input.mark)) return { appended: false }
      await core.appendCheckpoint(input)
      return { appended: true }
    },
    appendCheckpoint: async (input) => {
      appends.push({ projectId: input.projectId, proposalId: input.proposalId, mark: input.mark, baseCommitHash: input.baseCommitHash, snapshots: input.snapshots })
      rows.push({ mark: input.mark, ...input.snapshots })
      return { id: rows.length }
    },
    listCheckpoints: async (q) => rows.filter((r) => q.marks === undefined || q.marks.includes(r.mark)),
  }
  return { core, appends }
}

/** tasks 服务桩（claim 队列 + 完成态 stats；listTasks 返回 created 桶） */
function tasksStub(options: { claim: ClaimTaskResult[]; lists?: TaskCard[] }) {
  const addTaskInputs: AddTaskInput[] = []
  const claimQueue = [...options.claim]
  const shift = <T,>(queue: T[]): T => (queue.length > 1 ? (queue.shift() as T) : (queue[0] as T))
  let statsQueue: TaskStats[] = [statsOf({ completed: 1 })]
  const tasks = {
    claimTask: async () => shift(claimQueue),
    taskStats: async () => shift(statsQueue),
    listTasks: async () => options.lists ?? [],
    queryTask: async () => queryOf('completed'),
    addTask: async (input: AddTaskInput) => {
      addTaskInputs.push(input)
      return { taskId: 'retro-uuid', slug: input.source.slug, localId: '9.1', reused: false }
    },
    submitTask: async () => {
      throw new Error('loop must never submit')
    },
    reconcileInterrupted: async () => {
      throw new Error('loop must never reconcile')
    },
  } as unknown as ForgeTasksService
  return {
    tasks,
    addTaskInputs,
    setStats: (q: TaskStats[]) => {
      statsQueue = q
    },
  }
}

function build(options: { claim: ClaimTaskResult[]; stats?: TaskStats[]; lists?: TaskCard[] }) {
  const calls: Array<{ method: string; text: string }> = []
  const channel: NarrationChannel = {
    notice: async (_sessionId, text) => {
      calls.push({ method: 'notice', text })
    },
    followup: async (_sessionId, text) => {
      calls.push({ method: 'followup', text })
    },
  }
  const narrator: Narrator = createNarrator({ channel })
  const events: ForgePluginEvent[] = []
  const sink: ForgeEventSink = { emit: (e) => events.push(e), prepare: async () => {}, dirOf: () => undefined, remember: () => {} }
  const h = tasksStub({ claim: options.claim, lists: options.lists })
  if (options.stats !== undefined) h.setStats(options.stats)
  const cp = coreCheckpointsStub()
  let seq = 0
  const spawn: SpawnWorker = async () => {
    seq += 1
    const handle: SpawnWorkerHandle = {
      workerSessionId: `worker-${seq}`,
      result: Promise.resolve({ stopReason: 'completed', output: '' }),
      dispose: async () => {},
    }
    return handle
  }
  // index.ts 装配同形：ctx.forgeCheckpoints 真实形状面（含域侧 ensure）直传注入
  const deps: LoopDriverDeps = {
    projectId: PROJECT,
    tasks: h.tasks,
    spawn,
    narrator,
    events: sink,
    checkpoints: cp.core,
    resolveProposalId: async () => 'prop-1',
    resolveHeadCommit: async () => 'head-9',
    commitLanding: async () => ({ ok: true, branch: 'feat-x' }),
    delays: { backoffBaseMs: 1, patiencePauseMs: 1, quiescenceWindowMs: 1, quiescencePollMs: 1 },
  }
  return { driver: createLoopDriver(deps), h, appends: cp.appends, calls }
}

async function untilSettled(driver: { activeOf(id: string): unknown }): Promise<void> {
  await vi.waitFor(
    () => {
      expect(driver.activeOf(OWNER)).toBeUndefined()
    },
    { timeout: 2000, interval: 5 },
  )
}

describe('机械③/④ · createLoopDriver 生产装配落标记（bug 548ea94b）', () => {
  it('first-pass：no-task done 生产路径经 ensure 语义包装真实落 first-pass-complete + 派生复盘任务', async () => {
    const built = build({
      claim: [NO_TASK],
      stats: [statsOf({ completed: 1 }), statsOf({ completed: 1 }), statsOf({ completed: 1 }), statsOf({ completed: 1 })],
    })
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {}, worktree: 'Z:\\wt\\feat-x' })
    await untilSettled(built.driver)
    // 生产路径真实落行：mark/proposalId/HEAD 锚/幂等（无重复追加）
    const firstPass = built.appends.filter((a) => a.mark === 'first-pass-complete')
    expect(firstPass).toHaveLength(1)
    expect(firstPass[0]).toMatchObject({ projectId: PROJECT, proposalId: 'prop-1', baseCommitHash: 'head-9' })
    // 复盘任务随标记派生（机械③承接面同轮真实发生）
    expect(built.h.addTaskInputs).toHaveLength(1)
    expect(built.h.addTaskInputs[0]).toMatchObject({ type: 'doc', title: 'first-pass 复盘：feat-x' })
  })

  it('review-wave：coding-fix 任务结算生产路径经 loop.core 透传真实落 review-wave-N（proposalId 映射到场）', async () => {
    const built = build({
      claim: [claimed('3.1'), NO_TASK],
      stats: [
        statsOf({ pending: 1 }), // 启动读
        statsOf({ in_progress: 1 }), // claim 领取通知读
        statsOf({ in_progress: 1 }), // 结算核池读
        statsOf({ completed: 1 }), // 次轮 no-task 池读
        statsOf({ completed: 1 }), // 标记快照计数读
        statsOf({ completed: 1 }),
        statsOf({ completed: 1 }),
      ],
      lists: [cardOf('3.1')],
    })
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {}, worktree: 'Z:\\wt\\feat-x' })
    await untilSettled(built.driver)
    const wave = built.appends.filter((a) => a.mark === 'review-wave-N')
    expect(wave).toHaveLength(1)
    expect(wave[0]).toMatchObject({ projectId: PROJECT, proposalId: 'prop-1', baseCommitHash: 'head-9' })
    // 同轮 first-pass 也由生产路径落行（机械③装配同链验证）
    expect(built.appends.filter((a) => a.mark === 'first-pass-complete')).toHaveLength(1)
  })
})
