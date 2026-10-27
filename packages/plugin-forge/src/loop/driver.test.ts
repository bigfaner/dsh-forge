// S1b · 宿主派发循环驱动器单测（run-tasks-host-command/1.4 验收面）：
// runRound 状态机全链（领取→领取通知→spawn→结算→结果通知→判定→续派）宿主代码驱动、
// 任意时刻 in-flight ≤1（串行跟踪）、no-task 三态判词（settled 收口/等待 patience/halted）、
// adopt 逐个恢复重入、blocked 有 fix 机械续领 / 无 fix 处置钩子桩（三动作）、spawn 失败
// 退避 ×3 halted 粘性、worker 异常终止 bounded 重入超限升级、停止（in-flight 真化
// interrupted + ⑰ 收口）、v1 单活守卫。spawn/tasks/narrator 通道全桩（真 narrator 渲染 +
// 录制通道；incident 仓缺目录 = 零 I/O）。
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  AddTaskInput,
  ClaimTaskInput,
  ClaimTaskResult,
  ForgePluginEvent,
  ForgeTasksService,
  ListTasksQuery,
  QueryTaskResult,
  TaskCard,
  TaskSnapshot,
  TaskStats,
  TaskStatus,
  TransitionTaskInput,
} from '@dsh-forge/contracts'
import { FIX_CHAIN_DEPTH_LIMIT } from '@dsh-forge/contracts'
import { createLoopDriver } from './driver.js'
import { createLoopRegistry } from './registry.js'
import type { LoopDriver, LoopDriverDeps, LoopEscalation, LoopTriageDecision, LoopTriageHook, LoopTriageInput } from './driver.js'
import type { LoopRecord } from './registry.js'
import { backoffDelayMs, isRateLimitFailure, isTriageInvalidOutput, LOOP_RESUME_RESTORE_REASON, LOOP_TRIAGE_MAX_ATTEMPTS, TRIAGE_FIX_CHAIN_DEPTH_LIMIT, triageFailureSummary } from './driver.js'
import { createNarrator } from '../notify/index.js'
import type { IncidentStore, NarrationChannel, Narrator } from '../notify/index.js'
import type { ForgeProgressEventData } from '../progress/index.js'
import type { ForgeEventSink } from '../events/sink.js'
import { createTriageHook, TriageDecisionInvalidError } from '../triage/index.js'
import { exclusiveLoopSourceOf, HALTED_REASON, resetExclusiveLoopSources } from '../dispatch-core/index.js'
import type { SpawnWorker, SpawnWorkerHandle, SpawnWorkerRequest } from '../dispatch-core/index.js'
import type { CommitLandingVerifier } from '../dispatch-core/index.js'

// ─────────────────────────── 夹具 ───────────────────────────

const OWNER = 'owner-session-1'
const PROJECT = 'p-1'
const SOURCE = { kind: 'feature', slug: 'feat-x' } as const

afterEach(() => {
  resetExclusiveLoopSources() // S1c 独占登记表 = 模块级状态——跨用例复位
})

function snapshot(over: Partial<TaskSnapshot> = {}): TaskSnapshot {
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
    ...over,
  }
}

function statsOf(over: Partial<Record<TaskStatus, number>> & { unmetPending?: number } = {}): TaskStats {
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
  return { total: 1, byStatus, unmetPending: over.unmetPending ?? 0 }
}

function card(slug: string, localId: string, over: Partial<TaskCard> = {}): TaskCard {
  return {
    taskId: `card-${slug}-${localId}`,
    slug,
    localId,
    title: `Task ${localId}`,
    taskType: 'coding-fix',
    taskStatus: 'pending',
    prerequisites: [],
    sessionCount: 0,
    ...over,
  }
}

const NO_TASK: ClaimTaskResult = { task: null, dispatchPrompt: '', persona: 'PERSONA-MATRIX', digest: '', reclaimed: false }

/** 永不结算的 spawn 桩（生命周期用例——在飞保持确定性） */
function parkedSpawn(_n: number): Promise<SpawnWorkerHandle> {
  return Promise.resolve({
    workerSessionId: 'worker-parked',
    result: new Promise(() => {}),
    dispose: async () => {},
  })
}

function claimed(localId = '2.5', digest = 'digestabc123'): ClaimTaskResult {
  return { task: snapshot({ localId }), dispatchPrompt: 'PERSONA + <task-context>', persona: 'PERSONA-MATRIX', digest, reclaimed: false }
}

function queryOf(status: TaskStatus, over: Partial<TaskSnapshot> = {}): QueryTaskResult {
  return {
    task: snapshot({ taskStatus: status, ...over }),
    container: { kind: 'feature', slug: 'feat-x', title: 'feat-x' },
    records:
      status === 'completed'
        ? [{ verb: 'submit', toStatus: 'completed', summary: 'did the thing', commitHash: 'abc1234', actor: 'plugin-tool', createdAt: '2026-10-11T01:00:00.000Z' }]
        : status === 'blocked'
          ? [{ verb: 'submit', toStatus: 'blocked', reason: 'tests hang on flaky selector', files: ['packages/x/src/changed.ts'], actor: 'plugin-tool', createdAt: '2026-10-11T01:00:00.000Z' }]
          : [],
  }
}

/** 无进展 blocked 的结算记录（零 commit hash 零 files——硬停门直达挂起） */
function queryOfBlockedNoProgress(): QueryTaskResult {
  return {
    task: snapshot({ taskStatus: 'blocked' }),
    container: { kind: 'feature', slug: 'feat-x', title: 'feat-x' },
    records: [{ verb: 'submit', toStatus: 'blocked', reason: 'needs human verdict', actor: 'plugin-tool', createdAt: '2026-10-11T01:00:00.000Z' }],
  }
}

/** 结算尾延迟句柄（live 并发跟踪——maxLive 断言串行 ≤1 的机械证据） */
function trackedSpawn(): { spawn: SpawnWorker; requests: SpawnWorkerRequest[]; maxLive: () => number; setBehavior: (b: (n: number) => Promise<SpawnWorkerHandle>) => void } {
  const requests: SpawnWorkerRequest[] = []
  let live = 0
  let max = 0
  let n = 0
  let behavior: (n: number) => Promise<SpawnWorkerHandle> = async (seq) => {
    live += 1
    max = Math.max(max, live)
    const result = new Promise<{ stopReason: string; output: string }>((resolve) => {
      setTimeout(() => {
        live -= 1
        resolve({ stopReason: 'completed', output: '' })
      }, 5)
    })
    return { workerSessionId: `worker-${seq}`, result, dispose: async () => {} }
  }
  return {
    requests,
    maxLive: () => max,
    setBehavior: (b) => {
      behavior = b
    },
    spawn: async (req) => {
      requests.push(req)
      n += 1
      return behavior(n)
    },
  }
}

/** tasks 服务桩（脚本队列 shift-末项重复；读写全记录） */
function tasksHarness() {
  const claimInputs: ClaimTaskInput[] = []
  const statsInputs: unknown[] = []
  const listInputs: ListTasksQuery[] = []
  const addTaskInputs: AddTaskInput[] = []
  const transitions: TransitionTaskInput[] = []
  let claimQueue: ClaimTaskResult[] = [claimed()]
  let statsQueue: TaskStats[] = [statsOf({ pending: 1 })]
  let queryQueue: QueryTaskResult[] = [queryOf('completed')]
  const lists: Record<'interrupted' | 'in_progress' | 'blocked' | 'created' | 'suspended', TaskCard[]> = {
    interrupted: [],
    in_progress: [],
    blocked: [],
    created: [],
    suspended: [], // task-pause-primitive：resume 批量恢复读面（suspended paused 卡桶）
  }
  const shift = <T,>(queue: T[]): T => (queue.length > 1 ? (queue.shift() as T) : (queue[0] as T))
  const tasks = {
    claimTask: async (input: ClaimTaskInput) => {
      claimInputs.push(input)
      // 状态推进模拟：adopt 领取将任务移出 interrupted 集（真实 claimTask 置 in_progress）
      if (input.adopt !== undefined) {
        lists.interrupted = lists.interrupted.filter(
          (c) => !(c.slug === input.adopt?.slug && c.localId === input.adopt?.localId),
        )
      }
      return shift(claimQueue)
    },
    taskStats: async (input: unknown) => {
      statsInputs.push(input)
      return shift(statsQueue)
    },
    listTasks: async (q: ListTasksQuery) => {
      listInputs.push(q)
      const bucket = q.statusFilter?.[0]
      if (bucket === 'interrupted') return lists.interrupted
      if (bucket === 'in_progress') return lists.in_progress
      if (bucket === 'blocked') return lists.blocked
      if (bucket === 'suspended') return lists.suspended
      return lists.created
    },
    queryTask: async () => shift(queryQueue),
    // 1.16 批量结算读面桩（wave 快照数据源——completed created 桶投影，commit/债计数零值）
    taskSettlements: async () =>
      lists.created
        .filter((c) => c.taskStatus === 'completed')
        .map((c) => ({
          slug: c.slug,
          localId: c.localId,
          taskType: c.taskType,
          fixDerived: c.sourceTask !== undefined,
          commitHashes: ['abc1234'], // 同 queryOf('completed') 结算记录 commit——快照口径数据源同值
          evidenceDebtCount: 0,
        })),
    addTask: async (input: AddTaskInput) => {
      addTaskInputs.push(input)
      return { taskId: 'fix-uuid', slug: input.source.slug, localId: 'fix-2', reused: false }
    },
    transitionTask: async (input: TransitionTaskInput) => {
      transitions.push(input)
      return snapshot({ taskStatus: input.toStatus })
    },
    submitTask: async () => {
      throw new Error('loop must never submit (workers settle themselves)')
    },
    reconcileInterrupted: async () => {
      throw new Error('loop must never reconcile (plugin assembly owns it)')
    },
  } as unknown as ForgeTasksService
  return {
    tasks,
    claimInputs,
    statsInputs,
    listInputs,
    addTaskInputs,
    transitions,
    lists,
    setClaim: (q: ClaimTaskResult[]) => {
      claimQueue = q
    },
    setStats: (q: TaskStats[]) => {
      statsQueue = q
    },
    setQuery: (q: QueryTaskResult[]) => {
      queryQueue = q
    },
  }
}

type NarrationCall = {
  readonly method: 'notice' | 'followup' | 'settle'
  readonly sessionId: string
  readonly text: string
  /** loop-event-delivery 投递面：原始 send options 直录（form 铸造形态 + wakeup 路由） */
  readonly form: 'notice' | 'followup' | 'settle'
  readonly wakeup: boolean
}

/** NarrationChannel send 桩（loop-event-delivery 接口收窄——form/wakeup 原样直录，
 *  method = 兼容换算：settle 形态 → settle / wakeup=true → followup / 其余 → notice） */
function sendRecordingChannel(calls: NarrationCall[], onSend?: (sessionId: string, text: string) => void): NarrationChannel {
  return {
    send: async (sessionId, text, options) => {
      const form = options?.form ?? 'notice'
      const wakeup = options?.wakeup === true
      const method = form === 'settle' ? 'settle' : wakeup ? 'followup' : 'notice'
      calls.push({ method, sessionId, text, form, wakeup })
      onSend?.(sessionId, text)
    },
  }
}

interface Built {
  driver: LoopDriver
  calls: NarrationCall[]
  events: ForgePluginEvent[]
  h: ReturnType<typeof tasksHarness>
  spawn: ReturnType<typeof trackedSpawn>
  escalations: LoopEscalation[]
  /** 1.17 进度事件录制面（'forge/progress' append 形状观察） */
  progressCalls: ForgeProgressEventData[]
  /** 机械③ checkpoints 域 ensure 调用录制（mark/baseCommitHash/snapshots/appended 形状断言） */
  cpEnsures: Array<{ projectId: string; proposalId: string; mark: string; baseCommitHash: string; snapshots: unknown; appended: boolean }>
}

function build(options: {
  claim?: ClaimTaskResult[]
  stats?: TaskStats[]
  query?: QueryTaskResult[]
  triage?: (input: LoopTriageInput) => Promise<LoopTriageDecision>
  /** 真钩子注册径（1.11 装配接线收口——SC4 端到端）：工厂收到 tasks 桩，装配期建钩子 */
  triageHook?: (h: ReturnType<typeof tasksHarness>) => LoopTriageHook
  /** 事件仓桩（blocked 族落盘委派观察——projectId 解析缝载体断言） */
  incidents?: IncidentStore
  spawnBehavior?: (h: ReturnType<typeof trackedSpawn>) => void
  /** 改进 6⑤ 已知容器集读面桩（wait-external.externalSlug 存在性校验） */
  knownContainers?: (projectId: string) => Promise<readonly string[]>
  /** 改进 6② 退避基长注入（缺省 1ms——立即重试径的节奏断言用大值区分两径） */
  backoffBaseMs?: number
  /** 3c 最大轮次上限注入（缺省 LOOP_MAX_ROUNDS——生产值；测试注入小值触发终局） */
  limits?: { readonly maxRounds?: number }
  /** 3c 宽限窗基长注入（缺省 1ms——立即收敛；窗内叫停用例注入大值保持确定性） */
  quiescenceWindowMs?: number
  /** 改进7（e2e 取证债）：红灯基线门注入——runSuite 桩返回 reporter 输出；readHead 桩返回 worktree HEAD */
  e2eBaseline?: {
    runSuite: () => Promise<string>
    readHead?: (worktree: string) => Promise<string | undefined>
    /** bug 006d8bfe 后续：持久化缓存路径缝（{slug, worktree} → 缓存文件；缺席 = 无持久化）——
     *  形状随 LoopDriverDeps.e2eBaseline.cacheFile（e0c4b6e7 输入形，镜像同步） */
    cacheFile?: (input: { readonly slug: string; readonly worktree?: string }) => string | undefined
  }
  /** 1.18 落点核验器注入（错分支提交场景——settleWorkerRun commitLanding 缝） */
  commitLanding?: CommitLandingVerifier
  /** 机械③ checkpoints 域桩（初始行集——ensure 追加进行集模拟域侧幂等） */
  checkpointRows?: Array<{ mark: string; tasksTotal: number; commitsTotal: number; fixesTotal: number; evidenceDebtsTotal: number }>
  /** 机械③ 标记落库故障注入（前 N 次 ensureCheckpoint 抛错——append 失败窄窗口模拟） */
  ensureFailures?: number
  /** 机械③ 容器 → 提案 id 解析桩 */
  resolveProposalId?: () => Promise<string | undefined>
  /** 机械③ 容器分支 HEAD 解析桩（worktree 在场时标记 base_commit_hash 来源） */
  resolveHeadCommit?: (worktree: string) => Promise<string | undefined>
} = {}): Built {
  const h = tasksHarness()
  if (options.claim !== undefined) h.setClaim(options.claim)
  if (options.stats !== undefined) h.setStats(options.stats)
  if (options.query !== undefined) h.setQuery(options.query)
  const calls: NarrationCall[] = []
  const channel: NarrationChannel = sendRecordingChannel(calls)
  const narrator: Narrator = createNarrator({
    channel,
    // incident 仓缺目录解析 = 零 I/O fail-soft；显式桩时观察落盘委派
    ...(options.incidents !== undefined ? { incidents: options.incidents } : {}),
  })
  const events: ForgePluginEvent[] = []
  const sink: ForgeEventSink = {
    emit: (e) => events.push(e),
    prepare: async () => {},
    dirOf: () => undefined,
    remember: () => {},
  }
  const spawn = trackedSpawn()
  if (options.spawnBehavior !== undefined) options.spawnBehavior(spawn)
  const escalations: LoopEscalation[] = []
  // 机械③ checkpoints 域桩（ensure 追加进行集——域侧幂等语义同构：行集已含 mark = no-op）
  const cpEnsures: Array<{ projectId: string; proposalId: string; mark: string; baseCommitHash: string; snapshots: unknown; appended: boolean }> = []
  const cpRows = [...(options.checkpointRows ?? [])]
  let ensureFails = options.ensureFailures ?? 0
  const checkpoints = options.checkpointRows === undefined ? undefined : {
    ensureCheckpoint: async (input: { projectId: string; proposalId: string; mark: string; baseCommitHash: string; snapshots: unknown }) => {
      if (ensureFails > 0) {
        ensureFails -= 1
        throw new Error('checkpoint append failed')
      }
      if (cpRows.some((r) => r.mark === input.mark)) {
        cpEnsures.push({ ...input, appended: false })
        return { appended: false as const }
      }
      cpEnsures.push({ ...input, appended: true })
      cpRows.push({ mark: input.mark, tasksTotal: 0, commitsTotal: 0, fixesTotal: 0, evidenceDebtsTotal: 0 })
      return { appended: true as const }
    },
    appendCheckpoint: async (_input: { projectId: string; proposalId: string; mark: string; baseCommitHash: string; snapshots: unknown }) => ({}),
    listCheckpoints: async (q: { marks?: readonly string[] }) => cpRows.filter((r) => q.marks === undefined || q.marks.includes(r.mark)),
  }
  // 1.17 进度事件录制（'forge/progress' append 形状——形状/序断言消费）
  const progressCalls: ForgeProgressEventData[] = []
  const deps: LoopDriverDeps = {
    projectId: PROJECT,
    tasks: h.tasks,
    spawn: spawn.spawn,
    narrator,
    events: sink,
    progress: {
      append: (_sessionId, data) => {
        progressCalls.push(data)
      },
    },
    ...(options.triage !== undefined ? { triage: { run: options.triage } } : {}),
    ...(options.triageHook !== undefined ? { triage: options.triageHook(h) } : {}),
    ...(options.knownContainers !== undefined ? { knownContainers: options.knownContainers } : {}),
    ...(options.commitLanding !== undefined ? { commitLanding: options.commitLanding } : {}),
    ...(options.e2eBaseline !== undefined ? { e2eBaseline: options.e2eBaseline } : {}),
    ...(checkpoints !== undefined ? { checkpoints } : {}),
    ...(options.resolveProposalId !== undefined ? { resolveProposalId: options.resolveProposalId } : {}),
    ...(options.resolveHeadCommit !== undefined ? { resolveHeadCommit: options.resolveHeadCommit } : {}),
    escalation: {
      escalate: async (e) => {
        escalations.push(e)
      },
    },
    delays: {
      backoffBaseMs: options.backoffBaseMs ?? 1,
      patiencePauseMs: 1,
      quiescenceWindowMs: options.quiescenceWindowMs ?? 1,
      quiescencePollMs: 1,
    },
    ...(options.limits !== undefined ? { limits: options.limits } : {}),
  }
  return { driver: createLoopDriver(deps), calls, events, h, spawn, escalations, progressCalls, cpEnsures }
}

/** 等待循环终局（登记表注销 = 终态唯一机械信号） */
async function untilSettled(driver: LoopDriver): Promise<void> {
  await vi.waitFor(
    () => {
      expect(driver.activeOf(OWNER)).toBeUndefined()
    },
    { timeout: 2000, interval: 5 },
  )
}

/** 等待循环挂起（3b——record.suspended 在场 = 挂起唯一机械信号）；返回挂起载荷供断言 */
async function untilSuspended(driver: LoopDriver): Promise<NonNullable<LoopRecord['suspended']>> {
  await vi.waitFor(
    () => {
      expect(driver.activeOf(OWNER)?.suspended).toBeDefined()
    },
    { timeout: 2000, interval: 5 },
  )
  return driver.activeOf(OWNER)!.suspended!
}

// ─────────────────────────── 每轮流转全链（SC2） ───────────────────────────

describe('runRound 全链（领取→领取通知→spawn→结算→结果通知→判定→续派）', () => {
  it('两轮流转 + settled 收口：claim 携带 loopSourced/主会话 id/source；叙述四连（①④⑥⑯）；事件三连+no-ready-task；串行 maxLive=1', async () => {
    const built = build({
      claim: [claimed(), NO_TASK],
      stats: [
        statsOf({ pending: 1 }), // 启动读（待执行 1）
        statsOf({ in_progress: 1 }), // 领取通知读（执行中 1）
        statsOf({ in_progress: 1 }), // 结算读（settle 核池快照——断言不涉）
        statsOf({ completed: 1 }), // no-task 池读（done 判词）
        statsOf({ completed: 1 }), // ⑯ 收口读
      ],
    })
    const start = await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: { tag: 'parent' } })
    expect(start).toEqual({ ok: true, loopId: expect.any(String) })
    await untilSettled(built.driver)

    // claim：主会话真实 id + loopSourced 循环来源标记 + source 对（无 adopt——就绪盲选）；
    // 次轮 no-task 判词后收口——claim 恰两次（第二轮零 adopt 键）
    expect(built.h.claimInputs).toHaveLength(2)
    expect(built.h.claimInputs[0]).toEqual({ projectId: PROJECT, sessionId: OWNER, source: SOURCE, loopSourced: true })
    expect(built.h.claimInputs[1]).toEqual({ projectId: PROJECT, sessionId: OWNER, source: SOURCE, loopSourced: true })
    // spawn：全文 prompt + label（任务键 · 任务名）+ parent 透传
    expect(built.spawn.requests).toHaveLength(1)
    expect(built.spawn.requests[0]).toMatchObject({
      prompt: 'PERSONA + <task-context>',
      label: 'feat-x/2.5 · Implement the thing',
      parent: { tag: 'parent' },
    })
    // 消息面单径（loop-message-consolidation）：①④⑥ notice 退出——仅 ⑯ 结算单点（settle·wakeup=true）
    expect(built.calls.map((c) => c.method)).toEqual(['settle'])
    expect(built.calls.map((c) => c.form)).toEqual(['settle'])
    expect(built.calls.map((c) => c.wakeup)).toEqual([true])
    expect(built.calls[0]?.text).toContain('[forge·结束] 任务源: feat-x — 全部任务已完成')
    expect(built.calls[0]?.text).toContain('完成 1 · 阻塞 0')
    // 结算概要（驱动侧与 progress 事件同源的起止记录——按 slug 分组：组首行状态计数 +
    // 任务行 `slug/local-id 标题 — 终态 · 耗时`；用户裁决 2026-10-28）
    expect(built.calls[0]?.text).toContain('任务概要: feat-x（完成 1 · 阻塞 0）')
    expect(built.calls[0]?.text).toMatch(/任务概要: feat-x\/2\.5 Implement the thing — 完成 · \d+[sm]/)
    // 事件透传（logs/<slug>.jsonl 里程碑不断流）
    expect(built.events.map((e) => e.type)).toEqual(['task-claimed', 'task-spawned', 'task-worker-done', 'no-ready-task'])
    // 串行机械证据：worker 并发峰值 = 1（v1 严格串行——in-flight ≤1）
    expect(built.spawn.maxLive()).toBe(1)
  })

  it('登记表字段完整 + 重启即空：新驱动器实例登记表为空（进程内不持久化——S3 对账判据）', async () => {
    const fresh = build()
    expect(fresh.driver.activeOf(OWNER)).toBeUndefined()
    const running = build({ claim: [claimed(), NO_TASK], stats: [statsOf({ pending: 1 }), statsOf({ in_progress: 1 }), statsOf({ completed: 1 }), statsOf({ completed: 1 })] })
    await running.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await vi.waitFor(
      () => {
        expect(running.driver.activeOf(OWNER)?.inFlight).toBeDefined()
      },
      { timeout: 2000, interval: 5 },
    )
    const record = running.driver.activeOf(OWNER)
    expect(record).toMatchObject({
      source: { kind: 'feature', slug: 'feat-x' },
      ownerSessionId: OWNER,
      projectId: PROJECT,
    })
    expect(record?.inFlight).toMatchObject({
      taskRef: { slug: 'feat-x', localId: '2.5' },
      taskKey: 'feat-x/2.5',
      taskId: 't-1',
      workerSessionId: 'worker-1',
    })
    await running.driver.stop({ ownerSessionId: OWNER })
  })
})

// ─────────────────────────── 改进7 · e2e 红灯基线门 ───────────────────────────

describe('e2e 红灯基线门（dispatch-loop-hardening 改进7）', () => {
  // 工厂形制（bug 006d8bfe 测试随迁教训）：claim 队列被 harness shift **原地 mutate**——
  // 共享常量数组会让「先跑的测试掏空后跑测试的队列」（首消费者之前不能再排测试）。
  const FULL_FLOW = () => ({
    claim: [claimed(), NO_TASK],
    stats: [
      statsOf({ pending: 1 }),
      statsOf({ in_progress: 1 }),
      statsOf({ in_progress: 1 }),
      statsOf({ completed: 1 }),
      statsOf({ completed: 1 }),
    ],
  })

  it('bug 006d8bfe：基线门后台化——runSuite 挂死不阻塞 start 回执（工具调用面零阻塞）；放行后循环照常领取（红灯入简报 + 归因卡）', async () => {
    let release!: (output: string) => void
    const gate = new Promise<string>((resolve) => {
      release = resolve
    })
    const built = build({
      ...FULL_FLOW(),
      e2eBaseline: { runSuite: () => gate },
    })
    // start 立即返回启动回执（200ms 预算——挂死套件不得拖住工具调用面）
    const started = built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    const raced = await Promise.race([
      started.then(() => 'started'),
      new Promise<string>((resolve) => setTimeout(() => resolve('blocked'), 200)),
    ])
    expect(raced).toBe('started')
    expect(built.h.claimInputs).toHaveLength(0) // 基线在途——零领取（简报等基线，红灯语义不破）
    // 放行套件 → 后台 fiber 续跑：红灯入简报 + 归因卡生成（既有语义零变化）
    release('FAIL e2e/specs/a.spec.ts > suite')
    await untilSettled(built.driver)
    expect(built.h.claimInputs[0]).toMatchObject({ e2eBaselineRedCases: ['e2e/specs/a.spec.ts > suite'] })
    expect(built.h.addTaskInputs).toHaveLength(1)
  })

  it('基线红灯：启动即生成归因卡（逐红灯 spec 一张 test-run）+ 红灯清单随 claim 简报入参递达', async () => {
    const built = build({
      ...FULL_FLOW(),
      e2eBaseline: {
        runSuite: async () =>
          ['FAIL e2e/specs/b.spec.ts', 'FAIL e2e/specs/a.spec.ts', 'PASS e2e/specs/green.spec.ts'].join('\n'),
      },
    })
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSettled(built.driver)
    // 归因卡：逐红灯用例一张（parseE2eRedCases 字母序——a 先 b 后），type=test-run + 三分流指示
    expect(built.h.addTaskInputs).toHaveLength(2)
    expect(built.h.addTaskInputs[0]).toMatchObject({
      projectId: PROJECT,
      source: SOURCE,
      title: 'e2e 基线红灯排查：e2e/specs/a.spec.ts',
      type: 'test-run',
      priority: 'P1',
      vars: { BASELINE_SPEC: 'e2e/specs/a.spec.ts' },
    })
    expect(built.h.addTaskInputs[0]!.taskDesc).toContain('环境')
    expect(built.h.addTaskInputs[0]!.taskDesc).toContain('陈旧断言')
    expect(built.h.addTaskInputs[0]!.taskDesc).toContain('真回归')
    // 红灯清单随本实例全部 claim 简报入参递达（机械判定载体——首轮 claim + 次轮 no-task 领取尝试同带）
    expect(built.h.claimInputs).toHaveLength(2)
    expect(built.h.claimInputs[0]).toMatchObject({
      e2eBaselineRedCases: ['e2e/specs/a.spec.ts', 'e2e/specs/b.spec.ts'],
    })
  })

  it('基线套件执行故障：fail-soft 空清单（零归因卡、简报零基线行）——循环派发不受阻', async () => {
    const built = build({
      ...FULL_FLOW(),
      e2eBaseline: { runSuite: async () => { throw new Error('e2e harness missing') } },
    })
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSettled(built.driver)
    expect(built.h.addTaskInputs).toHaveLength(0)
    // 工厂化队列（bug 006d8bfe 随迁）：claim + no-task 尝试两径如实计数（旧期望 1 系共享数组
    // 被前序测试掏空后的伪语义）
    expect(built.h.claimInputs).toHaveLength(2)
    expect(built.h.claimInputs[0]).not.toHaveProperty('e2eBaselineRedCases')
    expect(built.h.claimInputs[1]).not.toHaveProperty('e2eBaselineRedCases')
  })

  it('disc-2 判例回归：fix 中途落地（HEAD 漂移）后简报反映新基线——旧红灯行不再烤死于循环启动时点', async () => {
    // 时序：start（HEAD c1 · 旧红灯）→ claim1（c1 复用）→ worker1 结算（fix 落地 = c2）
    // → claim2（c2 漂移重算 · 新红灯）→ claim3（c2 磁盘命中复用）→ no-task 收口。
    // 套件执行恰 2 次（磁盘为唯一缓存层——稳定 HEAD 零重跑）。
    const cacheDir = mkdtempSync(join(tmpdir(), 'forge-baseline-cache-'))
    let head = 'c1'
    let output = 'FAIL e2e/specs/old.spec.ts'
    let suiteRuns = 0
    let headReads = 0
    const built = build({
      claim: [claimed(), claimed(), NO_TASK],
      stats: [
        statsOf({ pending: 1 }),
        statsOf({ in_progress: 1 }),
        statsOf({ in_progress: 1 }),
        statsOf({ completed: 2 }),
        statsOf({ completed: 2 }),
        statsOf({ completed: 2 }),
        statsOf({ completed: 2 }),
      ],
      e2eBaseline: {
        runSuite: async () => {
          suiteRuns += 1
          return output
        },
        readHead: async () => {
          headReads += 1
          if (headReads >= 2) {
            head = 'c2'
            output = 'FAIL e2e/specs/new.spec.ts'
          }
          return head
        },
        cacheFile: () => join(cacheDir, '.forge', 'caches', 'feat-x', 'e2e-baseline', 'cache.json'),
      },
      // worktree 在场 + completed 提交 → 落点核验触发（1.18）——落点命中桩（本用例零涉核验）
      commitLanding: async () => ({ ok: true, branch: 'feat-x' }),
    })
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {}, worktree: 'Z:\\wt\\feat-x' })
    await untilSettled(built.driver)
    expect(built.h.claimInputs).toHaveLength(3)
    expect(built.h.claimInputs[0]).toMatchObject({ e2eBaselineRedCases: ['e2e/specs/old.spec.ts'] })
    // commit 落地后：简报携带新基线，旧红灯行消失（claim2 起）
    expect(built.h.claimInputs[1]).toMatchObject({ e2eBaselineRedCases: ['e2e/specs/new.spec.ts'] })
    expect(built.h.claimInputs[2]).toMatchObject({ e2eBaselineRedCases: ['e2e/specs/new.spec.ts'] })
    // 成本约束：磁盘唯一缓存层——稳定 HEAD 零额外套件执行（漂移重算一次后命中复用）
    expect(suiteRuns).toBe(2)
    rmSync(cacheDir, { recursive: true, force: true })
  })

  it('bug 006d8bfe 后续：基线缓存持久化跨实例——同 HEAD 重启后套件零重跑（error 形态不落缓存）', async () => {
    // 真机判例：宿主重启丢 ActiveLoop 实例缓存 → 同 HEAD 全量套件重跑（启动税 24 分钟）。
    // 修法（用户裁决 2026-10-18）：缓存落各 worktree 自身 .forge/caches/{slug}/e2e-baseline/
    // （cacheFile 注入缝——随检出走、容器隔离、跨重启复用）。
    const cacheDir = mkdtempSync(join(tmpdir(), 'forge-baseline-cache-'))
    const cacheFile = join(cacheDir, '.forge', 'caches', 'feat-x', 'e2e-baseline', 'cache.json')
    try {
      let suiteRuns = 0
      const makeBuild = () =>
        build({
          ...FULL_FLOW(),
          // worktree 在场 → 落点核验触发（1.18）——命中桩（本组用例零涉核验面）
          commitLanding: async () => ({ ok: true, branch: 'feat-x' }),
          e2eBaseline: {
            runSuite: async () => {
              suiteRuns += 1
              return 'FAIL e2e/specs/a.spec.ts > suite'
            },
            readHead: async () => 'c1',
            cacheFile: () => cacheFile,
          },
        })
      // 实例 A：首算（套件跑 1 次）+ 缓存落盘（worktree 在场——HEAD 键与持久化键同源）
      const a = makeBuild()
      await a.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {}, worktree: 'Z:\\wt\\feat-x' })
      await untilSettled(a.driver)
      expect(suiteRuns).toBe(1)
      expect(existsSync(cacheFile)).toBe(true)
      // 实例 B（模拟重启后新循环）：同 HEAD → 缓存命中，套件零重跑；红灯照常入简报
      const b = makeBuild()
      await b.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {}, worktree: 'Z:\\wt\\feat-x' })
      await untilSettled(b.driver)
      expect(suiteRuns).toBe(1)
      expect(b.h.claimInputs[0]).toMatchObject({ e2eBaselineRedCases: ['e2e/specs/a.spec.ts > suite'] })
      expect(b.h.addTaskInputs).toHaveLength(1) // 归因卡照常（缓存命中径同样补发）
    } finally {
      rmSync(cacheDir, { recursive: true, force: true })
    }
  })

  it('bug 006d8bfe 后续：error 形态（基线不可得）不落缓存——下实例重跑而非沿用「不可得」', async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'forge-baseline-cache-'))
    const cacheFile = join(cacheDir, '.forge', 'caches', 'feat-x', 'e2e-baseline', 'cache.json')
    try {
      let throwing = true
      const makeBuild = () =>
        build({
          ...FULL_FLOW(),
          commitLanding: async () => ({ ok: true, branch: 'feat-x' }),
          e2eBaseline: {
            runSuite: async () => {
              if (throwing) throw new Error('baseline unavailable')
              return 'FAIL e2e/specs/a.spec.ts > suite'
            },
            readHead: async () => 'c1',
            cacheFile: () => cacheFile,
          },
        })
      const a = makeBuild()
      await a.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {}, worktree: 'Z:\\wt\\feat-x' })
      await untilSettled(a.driver)
      expect(existsSync(cacheFile)).toBe(false) // 不可得 ≠ 全绿——不落缓存（637fcb9e 语义保持）
      throwing = false
      const b = makeBuild()
      await b.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
      await untilSettled(b.driver)
      expect(b.h.claimInputs[0]).toMatchObject({ e2eBaselineRedCases: ['e2e/specs/a.spec.ts > suite'] })
    } finally {
      rmSync(cacheDir, { recursive: true, force: true })
    }
  })

  it('R2-minor⑥：HEAD 漂移重算的新增红灯补生成归因卡（与启动时点行为一致；已发不重发）', async () => {
    // 同 disc-2 漂移场景：start（c1 · 旧红灯 → 归因卡 old）→ fix 落地（c2）→ claim2 重算
    // （新红灯 → 归因卡 new 补发）→ claim3（同基线零重复卡）→ no-task 收口。
    let head = 'c1'
    let output = 'FAIL e2e/specs/old.spec.ts'
    let headReads = 0
    const built = build({
      claim: [claimed(), claimed(), NO_TASK],
      stats: [
        statsOf({ pending: 1 }),
        statsOf({ in_progress: 1 }),
        statsOf({ in_progress: 1 }),
        statsOf({ completed: 2 }),
        statsOf({ completed: 2 }),
        statsOf({ completed: 2 }),
        statsOf({ completed: 2 }),
      ],
      e2eBaseline: {
        runSuite: async () => output,
        readHead: async () => {
          headReads += 1
          if (headReads >= 3) {
            head = 'c2'
            output = 'FAIL e2e/specs/new.spec.ts'
          }
          return head
        },
      },
      commitLanding: async () => ({ ok: true, branch: 'feat-x' }),
    })
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {}, worktree: 'Z:\\wt\\feat-x' })
    await untilSettled(built.driver)
    expect(built.h.addTaskInputs.map((t) => t.title)).toEqual([
      'e2e 基线红灯排查：e2e/specs/old.spec.ts', // 启动时点
      'e2e 基线红灯排查：e2e/specs/new.spec.ts', // 漂移重算新增——补发
    ])
    expect(built.h.addTaskInputs[1]).toMatchObject({ type: 'test-run', vars: { BASELINE_SPEC: 'e2e/specs/new.spec.ts' } })
  })

  it('disc-2 fail-soft：readHead 故障（git 不可用）——复用现有缓存，简报基线行保留，循环不阻', async () => {
    const built = build({
      ...FULL_FLOW(),
      e2eBaseline: {
        runSuite: async () => 'FAIL e2e/specs/a.spec.ts > suite',
        readHead: async () => {
          throw new Error('git not available')
        },
      },
      // worktree 在场 + completed 提交 → 落点核验触发（1.18）——落点命中桩（本用例零涉核验）
      commitLanding: async () => ({ ok: true, branch: 'feat-x' }),
    })
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {}, worktree: 'Z:\\wt\\feat-x' })
    await untilSettled(built.driver)
    // start 径 readHead 故障 = 基线机制静默关闭（fail-soft 同套件故障形态）
    expect(built.h.addTaskInputs).toHaveLength(0)
    expect(built.h.claimInputs[0]).not.toHaveProperty('e2eBaselineRedCases')
  })
})

// ─────────────────────────── 机械③（forge-verification-hardening） ───────────────────────────

// ensure no-op/append 语义用例落域侧（core implementation-checkpoints.test.ts），此处不再
// 于插件域复刻包装（ensure 经 LoopCheckpointsFace 直传域面——直传装配由 driver-assembly
// 生产路径测试覆盖）。


describe('机械③ · first-pass 标记 + 复盘派生 + merged lazy 补标记', () => {
  it('first-pass 幂等 + 复盘派生（未越阈）：首次 done 落标记一枚（HEAD 回落结算 commit）+ doc 复盘任务注入指标/交叉核验/learn；次 done 不重落不重派', async () => {
    const built = build({
      claim: [claimed(), NO_TASK, claimed('9.1'), NO_TASK],
      stats: [
        statsOf({ pending: 1 }), // 启动读
        statsOf({ in_progress: 1 }), // claim1 领取通知读
        statsOf({ in_progress: 1 }), // claim1 结算核池读
        statsOf({ completed: 1 }), // claim1 review-wave 快照计数读（机械④结算点真实触发——装配修复后）
        statsOf({ completed: 1 }), // 次轮 no-task 池读（first-pass done）
        statsOf({ completed: 1 }), // 派生时点池快照计数读（bug 9c350e5f——先派生后落标记序）
        statsOf({ completed: 1 }), // 标记快照计数读（completed 1 = first-pass 基线）
        statsOf({ in_progress: 1 }), // 复盘任务领取通知读
        statsOf({ in_progress: 1 }), // 复盘任务结算核池读
        statsOf({ completed: 2 }), // 末轮 no-task 池读（标记已在校）
        statsOf({ completed: 2 }), // quiescence/收口读
      ],
      checkpointRows: [],
      resolveProposalId: async () => 'prop-1',
    })
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSettled(built.driver)
    // first-pass-complete 标记：已锚定后（ensureFirstPassClosure list 前置判读）不再重复 ensure——
    // 恰一次调用、一次 appended；HEAD = 结算 commit 回落锚
    expect(built.cpEnsures).toHaveLength(1)
    expect(built.cpEnsures.filter((c) => c.appended)).toHaveLength(1)
    expect(built.cpEnsures[0]).toMatchObject({
      projectId: PROJECT,
      proposalId: 'prop-1',
      mark: 'first-pass-complete',
      baseCommitHash: 'abc1234',
      appended: true,
      snapshots: { tasksTotal: 1 },
    })
    // 复盘任务派生：恰一次，type=doc + 指标/越阈规则/交叉核验/learn 全注入；未越阈零 AC 硬门
    expect(built.h.addTaskInputs).toHaveLength(1)
    const retro = built.h.addTaskInputs[0]!
    expect(retro).toMatchObject({ projectId: PROJECT, source: SOURCE, type: 'doc', priority: 'P1', title: 'first-pass 复盘：feat-x' })
    expect(retro.taskDesc).toContain('一次通过率')
    expect(retro.taskDesc).toContain('返工增量比')
    expect(retro.taskDesc).toContain('修正波次')
    expect(retro.taskDesc).toContain('reviewWaveThreshold')
    expect(retro.taskDesc).toContain('默认值 6')
    expect(retro.taskDesc).toContain('交叉核验')
    expect(retro.taskDesc).toContain('learn')
    expect(retro.taskDesc).toContain('.knowledge/')
    expect(retro.taskDesc).toContain('< 6 → 未越阈')
    expect(retro.acceptanceCriteria).toBeUndefined()
    // 复盘任务被循环续领后照常收口（⑯ 结束叙述在场）
    expect(built.calls.at(-1)?.text).toContain('[forge·结束]')
    // 复盘任务成功结算后再次 done：标记不重落（appended 仍 1）、复盘不重派（addTask 仍 1）
    expect(built.cpEnsures.filter((c) => c.appended)).toHaveLength(1)
    expect(built.h.addTaskInputs).toHaveLength(1)
  })

  it('幂等防护（评审建议2）：addTask 成功后落标记失败——复盘任务已在场时二次进入不重复派生，仅补落标记', async () => {
    const built = build({
      claim: [NO_TASK, NO_TASK, claimed('9.1'), NO_TASK],
      stats: [
        statsOf({ pending: 1 }), // 启动读
        statsOf({ completed: 1 }), // 轮1 claim 池读
        statsOf({ completed: 1 }), // 轮1 派生时点池快照读（在场判定前置 computeWaveSnapshot）
        statsOf({ completed: 1 }), // 轮1 静默窗池读①（终态 → 窗内再询）
        statsOf({ pending: 1 }), // 轮1 静默窗池读②（复盘任务 pending → 续派）
        statsOf({ completed: 1 }), // 轮2 claim 池读
        statsOf({ completed: 1 }), // 轮2 标记快照计数读（补落标记）
        statsOf({ in_progress: 1 }), // 复盘任务领取通知读
        statsOf({ in_progress: 1 }), // 复盘任务结算核池读
        statsOf({ completed: 1 }), // review-wave 快照计数读
        statsOf({ completed: 2 }), // 轮3 no-task 池读（标记已在校）
        statsOf({ completed: 2 }), // 静默窗池读
      ],
      checkpointRows: [],
      ensureFailures: 1,
      resolveProposalId: async () => 'prop-1',
      resolveHeadCommit: async () => 'head-1',
      commitLanding: async () => ({ ok: true, branch: 'feat-x' }),
    })
    // 窄窗口现场：上一轮派生成功（addTask 已入池）、落标记失败——池中留有 pending 复盘任务
    built.h.lists.created.push({
      taskId: 'card-feat-x-9.1',
      slug: 'feat-x',
      localId: '9.1',
      title: 'first-pass 复盘：feat-x',
      taskType: 'doc',
      taskStatus: 'pending',
      prerequisites: [],
      sessionCount: 0,
    })
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {}, worktree: 'Z:\\wt\\feat-x' })
    await untilSettled(built.driver)
    // 二次进入：在场 doc 复盘任务即不重派（addTask 零调用）——幂等窗口消除
    expect(built.h.addTaskInputs).toHaveLength(0)
    // 失败留待重试语义保持：标记下轮补落恰一次（首次 ensure 抛错、二次 appended）
    expect(built.cpEnsures.filter((c) => c.appended)).toHaveLength(1)
    expect(built.cpEnsures[0]).toMatchObject({ mark: 'first-pass-complete', baseCommitHash: 'head-1' })
  })

  it('复盘指标真值（bug 9c350e5f）：先派生后落标记窗口内以派生时点池快照合成 first 帧——fixDensity 不恒兜底', async () => {
    const built = build({
      claim: [NO_TASK],
      stats: [statsOf({ completed: 1 })], // shift-末项重复——派生/落标记快照计数读同值
      checkpointRows: [{ mark: 'review-wave-N', tasksTotal: 2, commitsTotal: 3, fixesTotal: 1, evidenceDebtsTotal: 0 }],
      resolveProposalId: async () => 'prop-1',
      resolveHeadCommit: async () => 'head-9',
    })
    // 池中一枚 completed fix 类任务（带 commit 记录）——派生时点快照 = tasks 1 / commits 1 / fixes 1
    built.h.lists.created.push({
      taskId: 'card-feat-x-2.5',
      slug: 'feat-x',
      localId: '2.5',
      title: 'Task 2.5',
      taskType: 'coding-fix',
      taskStatus: 'completed',
      prerequisites: [],
      sessionCount: 0,
    })
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {}, worktree: 'Z:\\wt\\feat-x' })
    await untilSettled(built.driver)
    expect(built.h.addTaskInputs).toHaveLength(1)
    // 真值：first 帧合成（tasks 1 / fixes 1）= current 帧 → fix 密度 = 1/1；兜底缺陷下恒 0.0%
    expect(built.h.addTaskInputs[0]!.taskDesc).toContain('fix 密度：100.0%')
  })

  it('复盘指标真值（bug 9c350e5f）：merged 帧在场 + first 帧合成——reworkRatio 取 (current-baseline)/current 真值', async () => {
    const built = build({
      claim: [NO_TASK],
      stats: [statsOf({ completed: 1 })],
      checkpointRows: [
        { mark: 'merged', tasksTotal: 2, commitsTotal: 3, fixesTotal: 1, evidenceDebtsTotal: 0 },
        { mark: 'review-wave-N', tasksTotal: 2, commitsTotal: 3, fixesTotal: 1, evidenceDebtsTotal: 0 },
      ],
      resolveProposalId: async () => 'prop-1',
      resolveHeadCommit: async () => 'head-9',
    })
    built.h.lists.created.push({
      taskId: 'card-feat-x-2.5',
      slug: 'feat-x',
      localId: '2.5',
      title: 'Task 2.5',
      taskType: 'coding-fix',
      taskStatus: 'completed',
      prerequisites: [],
      sessionCount: 0,
    })
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {}, worktree: 'Z:\\wt\\feat-x' })
    await untilSettled(built.driver)
    expect(built.h.addTaskInputs).toHaveLength(1)
    // 真值：first 基线 commits 1（合成帧）、current = merged 帧 commits 3 → (3-1)/3；兜底缺陷下恒 0.0%
    expect(built.h.addTaskInputs[0]!.taskDesc).toContain('返工增量比：66.7%')
  })

  it('复盘派生（越阈）：修正波次 ≥ 阈值（默认 6）→ AC 硬门「已注册改进提案」入验收清单', async () => {
    const wave = { mark: 'review-wave-N', tasksTotal: 8, commitsTotal: 12, fixesTotal: 3, evidenceDebtsTotal: 1 }
    const built = build({
      claim: [claimed(), NO_TASK],
      stats: [statsOf({ pending: 1 }), statsOf({ in_progress: 1 }), statsOf({ in_progress: 1 }), statsOf({ completed: 1 }), statsOf({ completed: 1 })],
      checkpointRows: [
        { mark: 'merged', tasksTotal: 8, commitsTotal: 12, fixesTotal: 3, evidenceDebtsTotal: 1 },
        wave, wave, wave, wave, wave, wave,
      ],
      resolveProposalId: async () => 'prop-1',
    })
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSettled(built.driver)
    expect(built.h.addTaskInputs).toHaveLength(1)
    const retro = built.h.addTaskInputs[0]!
    expect(retro.acceptanceCriteria).toEqual([expect.stringContaining('已注册改进提案')])
    expect(retro.acceptanceCriteria?.[0]).toContain('未注册不得 success')
    expect(retro.taskDesc).toContain('≥ 6 → 已越阈')
    expect(retro.taskDesc).toContain('修正波次：6')
  })

  it('merged 漏标记 lazy 兜底：循环启动时 first-pass + retro-done 在场、merged 缺席、池全终态 → 补 merged 标记', async () => {
    const built = build({
      claim: [NO_TASK],
      stats: [statsOf({ completed: 3 }), statsOf({ completed: 3 }), statsOf({ completed: 3 }), statsOf({ completed: 3 })],
      checkpointRows: [
        { mark: 'first-pass-complete', tasksTotal: 5, commitsTotal: 8, fixesTotal: 1, evidenceDebtsTotal: 0 },
        { mark: 'retro-done', tasksTotal: 6, commitsTotal: 9, fixesTotal: 1, evidenceDebtsTotal: 0 },
      ],
      resolveProposalId: async () => 'prop-1',
      resolveHeadCommit: async () => 'head-9',
    })
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {}, worktree: 'Z:\\wt\\feat-x' })
    await untilSettled(built.driver)
    // 补标记：mark=merged + baseCommitHash = 循环检出 HEAD（解析缝桩）+ 收口时刻计数快照；
    // 首轮 done：first-pass 已在校 = 已锚定（ensureFirstPassClosure list 前置判读）→ 零 ensure 零复盘派生
    expect(built.cpEnsures).toHaveLength(1)
    const mergedCall = built.cpEnsures.find((c) => c.mark === 'merged')
    expect(mergedCall).toMatchObject({
      projectId: PROJECT,
      proposalId: 'prop-1',
      mark: 'merged',
      baseCommitHash: 'head-9',
      appended: true,
      snapshots: { tasksTotal: 3 },
    })
    // 首轮 done：first-pass 已在校 → 零重落零复盘派生（addTask 为空）
    expect(built.h.addTaskInputs).toHaveLength(0)
  })

  it('merged lazy 兜底判据不满足：retro-done 缺席（收口前置=复盘已结算）→ 不补标记', async () => {
    const built = build({
      claim: [NO_TASK],
      stats: [statsOf({ completed: 3 }), statsOf({ completed: 3 }), statsOf({ completed: 3 }), statsOf({ completed: 3 })],
      checkpointRows: [{ mark: 'first-pass-complete', tasksTotal: 5, commitsTotal: 8, fixesTotal: 1, evidenceDebtsTotal: 0 }],
      resolveProposalId: async () => 'prop-1',
    })
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {}, worktree: 'Z:\\wt\\feat-x' })
    await untilSettled(built.driver)
    expect(built.cpEnsures).toHaveLength(0)
  })
})

// ─────────────────────────── adopt 逐个恢复 + 启动分类 ───────────────────────────

describe('adopt 重入与启动分类（①②③）', () => {
  it('interrupted 在场：② 启动接续 + 首轮 adopt 定向领最早中断（claimTask.adopt = 中断序首项）+ ⑤ 领取（恢复中断）', async () => {
    const built = build({
      claim: [claimed('2.5'), claimed('2.6'), NO_TASK],
      stats: [
        statsOf({ pending: 1, interrupted: 2 }),
        statsOf({ pending: 1, interrupted: 1, in_progress: 1 }),
        statsOf({ pending: 1, interrupted: 1, in_progress: 1 }),
        statsOf({ pending: 1, interrupted: 1, in_progress: 1 }),
        statsOf({ pending: 1, interrupted: 1, in_progress: 1 }),
        statsOf({ pending: 0, interrupted: 0, completed: 2 }),
        statsOf({ pending: 0, interrupted: 0, completed: 2 }),
      ],
    })
    built.h.lists.interrupted = [card('feat-x', '2.5', { taskStatus: 'interrupted' }), card('feat-x', '2.6', { taskStatus: 'interrupted' })]
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSettled(built.driver)
    // 启动列表读：中断序升序（最早中断优先——S3 数据面）
    expect(built.h.listInputs[0]).toEqual({ projectId: PROJECT, source: SOURCE, statusFilter: ['interrupted'], sort: 'interrupted' })
    // 首轮 adopt 定向领取（不经 pending 池）；次轮 adopt 领下一个中断（2.6——逐个恢复）；
    // 第三轮 adopt 缺席（中断集已清空——就绪盲选径）
    expect(built.h.claimInputs[0]).toMatchObject({ adopt: { slug: 'feat-x', localId: '2.5' }, loopSourced: true })
    expect(built.h.claimInputs[1]?.adopt).toEqual({ slug: 'feat-x', localId: '2.6' })
    expect(built.h.claimInputs[2]?.adopt).toBeUndefined()
    // ② 启动接续 + ⑤ 领取（恢复中断）——零消息（loop-message-consolidation），进度事件单源投影
    expect(built.calls.filter((c) => c.method !== 'settle')).toEqual([])
    expect(built.progressCalls.find((e) => e.verb === 'startup')).toMatchObject({ scenario: 'startup/resume-stopped', taskKey: 'feat-x/2.5' })
    expect(built.progressCalls.find((e) => e.verb === 'claim-resume')).toMatchObject({ scenario: 'claim/interrupted', taskKey: 'feat-x/2.5' })
  })

  it('in_progress 遗留（skill 路线）而无 interrupted：③ 启动接续在飞——claim 无可领 → wait 判词 → patience 耗尽 ⑮ 收口', async () => {
    const built = build({
      claim: [NO_TASK],
      stats: [statsOf({ in_progress: 2 }), statsOf({ in_progress: 2 }), statsOf({ in_progress: 2 }), statsOf({ in_progress: 2 }), statsOf({ in_progress: 2, completed: 3 })],
    })
    built.h.lists.in_progress = [card('feat-x', '2.7', { taskStatus: 'in_progress' })]
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSettled(built.driver)
    // ③ 启动接续在飞——零消息（进度事件投影）；⑮ 收口照旧
    expect(built.calls.filter((c) => c.method !== 'settle')).toEqual([])
    expect(built.calls.at(-1)?.text).toContain('结束（等待超时）')
    expect(built.calls.at(-1)?.text).toContain('提示用户"稍后重新执行 /run-dag-tasks feat-x"')
    // 1.5 场景码：③ 启动接续在飞 + ⑮ 等待超时（循环级）
    expect(built.progressCalls.find((e) => e.verb === 'startup')).toMatchObject({ scenario: 'startup/resume-inflight', taskKey: 'feat-x/2.7', taskTitle: 'Task 2.7' })
    expect(built.progressCalls.find((e) => e.verb === 'timeout')).toMatchObject({ verb: 'timeout', status: 'blocked', scenario: 'loop/timeout', note: '等待超时' })
  })

  it('干净任务源：① 启动从头执行（pending 计数）', async () => {
    const built = build({
      claim: [NO_TASK],
      stats: [statsOf({ pending: 6 }), statsOf({ pending: 6 }), statsOf({ pending: 6 }), statsOf({ pending: 6 })],
    })
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSettled(built.driver)
    // ① 启动从头执行——零消息（进度事件投影；no-task done 收口 settle 恰一次）
    expect(built.calls.filter((c) => c.method !== 'settle')).toEqual([])
    expect(built.progressCalls.find((e) => e.verb === 'startup')).toMatchObject({ scenario: 'startup/from-scratch' })
  })
})

// ─────────────────────────── blocked 分支（fix 链机械续领 / 处置钩子桩） ───────────────────────────

describe('blocked 结算分支（图 C）', () => {
  function blockedScript(built: Built): void {
    built.h.lists.created = [] // 无 worker 派生 fix（findFixTaskRef 落空 → followUp 缺席）
  }

  /** 无进展硬停门的结算记录变体（commit/files 两进展信号任选——门判定面） */
  function queryOfBlocked(over: { commitHash?: string; files?: string[] } = {}): QueryTaskResult {
    return {
      task: snapshot({ taskStatus: 'blocked' }),
      container: { kind: 'feature', slug: 'feat-x', title: 'feat-x' },
      records: [
        {
          verb: 'submit',
          toStatus: 'blocked',
          reason: 'tests hang on flaky selector',
          actor: 'plugin-tool',
          createdAt: '2026-10-11T01:00:00.000Z',
          ...(over.commitHash !== undefined ? { commitHash: over.commitHash } : {}),
          ...(over.files !== undefined ? { files: over.files } : {}),
        },
      ],
    }
  }

  it('无进展硬停门：blocked 零 commit hash 且零 files 增量 → 处置阶梯零调用 + ⑩ followup 问询升级 → 挂起待裁决（3b）', async () => {
    const built = build({
      claim: [claimed('2.5'), claimed('should-not-claim')],
      stats: [
        statsOf({ pending: 1 }),
        statsOf({ in_progress: 1, blocked: 1 }),
        statsOf({ in_progress: 1, blocked: 1 }),
      ],
      query: [queryOfBlocked()],
      triage: async () => {
        throw new Error('triage ladder must not run on zero-progress blocked settlement')
      },
    })
    blockedScript(built)
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    const suspended = await untilSuspended(built.driver)
    // 处置阶梯零调用：triage 钩子抛错即失败（用例绿 = 零调用）；宿主零 addTask（零 fix 链）
    expect(built.h.addTaskInputs).toEqual([])
    // ⑩ followup 叙述在场（唤醒主 agent 分析——blocked-ask-user 挂起族通道）
    const ask = built.calls.find((c) => c.method === 'followup')
    expect(ask?.text).toContain('无法自动处理——已向你发起问询')
    // ⑩ 即时唤醒（AC）：send(nextStep, true)——阻塞上下文随 claim 整批进入主 agent
    expect(ask?.form).toBe('followup')
    expect(ask?.wakeup).toBe(true)
    // 直达挂起：blocked-ask-user + 无进展处置历史（跳过阶梯的机械证据）进挂起载荷
    expect(suspended.escalation).toEqual({
      kind: 'blocked-ask-user',
      ownerSessionId: OWNER,
      source: SOURCE,
      task: expect.objectContaining({ localId: '2.5' }),
      reason: 'tests hang on flaky selector',
      history: ['本次阻塞没有任何进展信号（无提交、无文件改动）——按规则不再自动重试，直接向你询问'],
    })
    expect(suspended.since).toEqual(expect.any(Number))
    expect(built.h.claimInputs).toHaveLength(1) // 挂起停驻——零续领
    // 1.5 场景码：⑩ 阻塞（循环无法自行处理——无进展硬停）
    expect(built.progressCalls.find((e) => e.verb === 'settle' && e.status === 'blocked')).toMatchObject({ scenario: 'blocked/ask-user', taskKey: 'feat-x/2.5', note: 'tests hang on flaky selector' })
    await built.driver.stop({ ownerSessionId: OWNER }) // 断言后收口
  })

  it('无进展门放行：带 commit hash（零 files）的 blocked 结算照常入处置阶梯', async () => {
    let triageCalls = 0
    const built = build({
      claim: [claimed('2.5'), NO_TASK],
      stats: [
        statsOf({ pending: 1 }),
        statsOf({ in_progress: 1, blocked: 1 }),
        statsOf({ in_progress: 1, blocked: 1 }),
        statsOf({ pending: 0, blocked: 1 }),
        statsOf({ pending: 0, blocked: 1 }),
      ],
      query: [queryOfBlocked({ commitHash: 'feed1234' })],
      triage: async () => {
        triageCalls += 1
        return { action: 'wait-external', externalSlug: 'feature-b' }
      },
    })
    blockedScript(built)
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    // 3b：wait-external 记录等待后续领（NO_TASK）；池 blocked 无 pending → deadlock 挂起待裁决
    await untilSuspended(built.driver)
    expect(triageCalls).toBe(1)
    // ⑨ 自愈阻塞静默（R-Q4）——零消息，进度事件投影
    expect(built.calls.some((c) => c.text.includes('等待 feature-b 先完成，先执行其它任务'))).toBe(false)
    expect(built.progressCalls.find((e) => e.verb === 'settle' && e.status === 'blocked')).toMatchObject({ scenario: 'blocked/wait-external', taskKey: 'feat-x/2.5' })
    await built.driver.stop({ ownerSessionId: OWNER })
  })

  it('blocked 且结算携带 followUp → ⑦ 静默（R-Q4）+ 机械续领 fix（不升级）', async () => {
    const built = build({
      claim: [claimed('2.5'), claimed('fix-1'), NO_TASK],
      stats: [
        statsOf({ pending: 2 }),
        statsOf({ in_progress: 1, blocked: 1 }),
        statsOf({ in_progress: 1, blocked: 1 }),
        statsOf({ in_progress: 1 }),
        statsOf({ in_progress: 1 }),
        statsOf({ completed: 2 }),
        statsOf({ completed: 2 }),
      ],
      query: [queryOf('blocked'), queryOf('completed')],
    })
    built.h.lists.created = [card('feat-x', 'fix-1', { sourceTask: { slug: 'feat-x', localId: '2.5' } })]
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSettled(built.driver)
    // ⑦ 自愈阻塞静默（R-Q4）——零消息，进度事件投影（reason 在 note、fix 键在概要注记）
    expect(built.calls.some((c) => c.text.includes('[forge·阻塞]'))).toBe(false)
    expect(built.calls.some((c) => c.text.includes('已自动创建修复任务 fix-1'))).toBe(false)
    expect(built.progressCalls.find((e) => e.verb === 'settle' && e.status === 'blocked')).toMatchObject({ scenario: 'blocked/with-fix', taskKey: 'feat-x/2.5' })
    // 续领次序：2.5 → fix-1（fix ready 自然被领——零智能介入）
    expect(built.h.claimInputs[1]?.source).toEqual(SOURCE)
    expect(built.spawn.requests[1]?.label).toContain('feat-x/fix-1')
    // 处置钩子未注入时 blocked-with-fix 不触发（fix 链已在 worker 侧机械闭合）
    expect(built.calls.some((c) => c.text.includes('[forge·自动处理]'))).toBe(false)
  })

  it('投递面全景（loop-event-delivery AC）：一次含 ⑦ 自愈阻塞的运行——进行中事件全 send(nextStep, false)，真终局唯一 settle send(nextStep, true)，零 steer 插队', async () => {
    const built = build({
      claim: [claimed('2.5'), claimed('fix-1'), NO_TASK],
      stats: [
        statsOf({ pending: 2 }),
        statsOf({ in_progress: 1, blocked: 1 }),
        statsOf({ in_progress: 1, blocked: 1 }),
        statsOf({ in_progress: 1 }),
        statsOf({ in_progress: 1 }),
        statsOf({ completed: 2 }),
        statsOf({ completed: 2 }),
      ],
      query: [queryOf('blocked'), queryOf('completed')],
    })
    built.h.lists.created = [card('feat-x', 'fix-1', { sourceTask: { slug: 'feat-x', localId: '2.5' } })]
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSettled(built.driver)
    // 消息面单径（loop-message-consolidation）：进行中事件零消息——唯一唤醒 = 真终局 settle
    const settles = built.calls.filter((c) => c.method === 'settle')
    expect(settles).toHaveLength(1)
    expect(settles[0]?.form).toBe('settle')
    expect(settles[0]?.wakeup).toBe(true)
    // 全运行消息 = 终局单点（⑦ 自愈阻塞静默零消息；运行中零 steer 插队）
    expect(built.calls).toEqual(settles)
  })

  it('静默边界（改进 1）：后继任务自身 blocked 且无再下级活后继 → 问询恢复上浮（triage ask-user 挂起待裁决）', async () => {
    const built = build({
      claim: [claimed('2.5'), claimed('should-not-claim')],
      stats: [
        statsOf({ pending: 1 }),
        statsOf({ in_progress: 1, blocked: 1 }),
        statsOf({ in_progress: 1, blocked: 1 }),
      ],
      query: [queryOf('blocked')],
      triage: async () => ({ action: 'ask-user' }),
    })
    built.h.lists.created = [card('feat-x', 'fix-1', { sourceTask: { slug: 'feat-x', localId: '2.5' }, taskStatus: 'blocked' })]
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    const suspended = await untilSuspended(built.driver)
    // 死后继不静默：⑦ 静默径零出现（零自愈消息），blocked-ask-user followup + 挂起在场
    expect(built.calls.some((c) => c.text.includes('已自动创建修复任务'))).toBe(false)
    expect(built.calls.some((c) => c.text.includes('无法自动处理——已向你发起问询'))).toBe(true)
    expect(suspended.escalation.kind).toBe('blocked-ask-user')
    expect(built.h.claimInputs).toHaveLength(1) // 挂起停驻——零续领
    await built.driver.stop({ ownerSessionId: OWNER })
  })

  it('静默边界（R2-minor④）：interrupted 后继计入活后继——上轮 stop 真化的 fix 不触发问询硬停', async () => {
    const built = build({
      claim: [claimed('2.5'), NO_TASK],
      stats: [
        statsOf({ pending: 1 }),
        statsOf({ in_progress: 1, blocked: 1 }),
        statsOf({ in_progress: 1, blocked: 1 }),
        statsOf({ completed: 1 }),
        statsOf({ completed: 1 }),
      ],
      query: [queryOf('blocked')],
    })
    built.h.lists.created = [card('feat-x', 'fix-1', { sourceTask: { slug: 'feat-x', localId: '2.5' }, taskStatus: 'interrupted' })]
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSettled(built.driver)
    // 活后继在场（interrupted 待 adopt 恢复）→ ⑦ 静默（R-Q4 零消息），零问询硬停
    expect(built.calls.some((c) => c.text.includes('已自动创建修复任务 fix-1'))).toBe(false)
    expect(built.calls.some((c) => c.text.includes('无法自动处理——已向你发起问询'))).toBe(false)
    expect(built.progressCalls.find((e) => e.verb === 'settle' && e.status === 'blocked')).toMatchObject({ scenario: 'blocked/with-fix', taskKey: 'feat-x/2.5' })
  })

  it('静默边界（改进 1）：后继任务被 rejected → 问询恢复上浮', async () => {
    const built = build({
      claim: [claimed('2.5'), claimed('should-not-claim')],
      stats: [
        statsOf({ pending: 1 }),
        statsOf({ in_progress: 1, blocked: 1 }),
        statsOf({ in_progress: 1, blocked: 1 }),
      ],
      query: [queryOf('blocked')],
      triage: async () => ({ action: 'ask-user' }),
    })
    built.h.lists.created = [card('feat-x', 'fix-1', { sourceTask: { slug: 'feat-x', localId: '2.5' }, taskStatus: 'rejected' })]
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    const suspended = await untilSuspended(built.driver)
    // 死后继（rejected）不静默：⑦ 静默径零出现，blocked-ask-user followup + 挂起在场
    expect(built.calls.some((c) => c.text.includes('已自动创建修复任务'))).toBe(false)
    expect(built.calls.some((c) => c.text.includes('无法自动处理——已向你发起问询'))).toBe(true)
    expect(suspended.escalation.kind).toBe('blocked-ask-user')
    await built.driver.stop({ ownerSessionId: OWNER })
  })

  it('静默边界（改进 1）：后继 blocked 但其自有活后继在场（fix-2 pending）→ 静默 notify（后继键进叙述）+ 零升级', async () => {
    const built = build({
      claim: [claimed('2.5'), NO_TASK],
      stats: [
        statsOf({ pending: 2 }),
        statsOf({ in_progress: 1, blocked: 1 }),
        statsOf({ in_progress: 1, blocked: 1 }),
        statsOf({ pending: 0, blocked: 2 }),
        statsOf({ pending: 0, blocked: 2 }),
      ],
      query: [queryOf('blocked')],
    })
    built.h.lists.created = [
      card('feat-x', 'fix-2', { sourceTask: { slug: 'feat-x', localId: 'fix-1' }, taskStatus: 'pending' }),
      card('feat-x', 'fix-1', { sourceTask: { slug: 'feat-x', localId: '2.5' }, taskStatus: 'blocked' }),
    ]
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    // 3b：静默 notify 后续领（NO_TASK）；池 blocked 无 pending → deadlock 挂起待裁决
    await untilSuspended(built.driver)
    // ⑦ 静默（R-Q4）：零消息——reason/后继键只进进度事件 note 与落盘（1.5 场景码断言在下方）
    expect(built.calls.some((c) => c.text.includes('已自动创建修复任务'))).toBe(false)
    // 零 blocked-ask-user 挂起（静默径——挂起为 deadlock 族）
    expect(built.driver.activeOf(OWNER)?.suspended?.escalation.kind).toBe('deadlock')
    // 1.5 场景码：⑦ 阻塞（已带修复任务——静默 notify 同点）
    expect(built.progressCalls.find((e) => e.verb === 'settle' && e.status === 'blocked')).toMatchObject({ scenario: 'blocked/with-fix', taskKey: 'feat-x/2.5', taskTitle: 'Implement the thing', workerSessionId: 'worker-1' })
    await built.driver.stop({ ownerSessionId: OWNER })
  })

  it('blocked 无 follow-up + 处置钩子 add-fix：钩子收到任务/reason 全文 → 宿主 addTask（blockSource 链）→ ⑧ 叙述 → 续领', async () => {
    const built = build({
      claim: [claimed('2.5'), NO_TASK],
      stats: [
        statsOf({ pending: 1 }),
        statsOf({ in_progress: 1, blocked: 1 }),
        statsOf({ in_progress: 1, blocked: 1 }),
        statsOf({ pending: 1, blocked: 1 }),
        statsOf({ pending: 1, blocked: 1 }),
      ],
      query: [queryOf('blocked')],
      triage: async (input) => {
        expect(input.task.localId).toBe('2.5')
        expect(input.reason).toBe('tests hang on flaky selector')
        return { action: 'add-fix', title: 'Fix: flaky selector', note: '修选择器等待' }
      },
    })
    blockedScript(built)
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSettled(built.driver)
    // 宿主忠实执行 add-fix：addTask 带 sourceTask + blockSource（fix 链机械面——源同事务置 blocked）
    expect(built.h.addTaskInputs).toEqual([
      expect.objectContaining({
        projectId: PROJECT,
        source: SOURCE,
        title: 'Fix: flaky selector',
        type: 'coding-fix',
        sourceTask: { slug: 'feat-x', localId: '2.5' },
        blockSource: true,
      }),
    ])
    // ⑧ 自愈阻塞静默（R-Q4）——零消息，进度事件投影
    expect(built.calls.some((c) => c.text.includes('已自动分析原因并创建修复任务'))).toBe(false)
    // 1.5 场景码：⑧ blocked/auto-fixed
    expect(built.progressCalls.find((e) => e.verb === 'settle' && e.status === 'blocked')).toMatchObject({ scenario: 'blocked/auto-fixed', taskKey: 'feat-x/2.5' })
  })

  it('blocked 无 follow-up + 处置钩子 split-remainder：addTask(blockSource:false) 继任落账 + 源任务保持 blocked + ⑧b 叙述 → 续领', async () => {
    const built = build({
      claim: [claimed('2.5'), NO_TASK],
      stats: [
        statsOf({ pending: 1 }),
        statsOf({ in_progress: 1, blocked: 1 }),
        statsOf({ in_progress: 1, blocked: 1 }),
        statsOf({ pending: 1, blocked: 1 }),
        statsOf({ pending: 1, blocked: 1 }),
      ],
      query: [queryOf('blocked')],
      triage: async () => ({ action: 'split-remainder', title: 'Split: remaining scope', taskDesc: '承接 C/D', note: '已完成 A/B' }),
    })
    blockedScript(built)
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSettled(built.driver)
    // disc-N 机械：blockSource:false——继任承接剩余范围，源任务同事务不置恢复链（保持 blocked）
    expect(built.h.addTaskInputs).toEqual([
      expect.objectContaining({
        projectId: PROJECT,
        source: SOURCE,
        title: 'Split: remaining scope',
        sourceTask: { slug: 'feat-x', localId: '2.5' },
        blockSource: false,
      }),
    ])
    // 源任务保持 blocked 不恢复：零 pending 方向的状态迁移（不重头开始的结构保证）
    expect(built.h.transitions.every((t) => t.toStatus !== 'pending')).toBe(true)
    // ⑧b 分割静默（R-Q4）——零消息，进度事件投影
    expect(built.calls.some((c) => c.text.includes('已创建继任任务'))).toBe(false)
    // 循环续领：分割后继续 claim（pending 继任路径在场——池态判词不误报）
    expect(built.h.claimInputs.length).toBeGreaterThanOrEqual(2)
    // 1.5 场景码：⑧b blocked/split
    expect(built.progressCalls.find((e) => e.verb === 'settle' && e.status === 'blocked')).toMatchObject({ scenario: 'blocked/split', taskKey: 'feat-x/2.5' })
  })

  it('blocked 无 follow-up + 处置钩子 wait-external → ⑨ 叙述 → 续领（后池 blocked → deadlock 挂起，3b）', async () => {
    const built = build({
      claim: [claimed('2.5'), NO_TASK],
      stats: [
        statsOf({ pending: 1 }),
        statsOf({ in_progress: 1, blocked: 1 }),
        statsOf({ in_progress: 1, blocked: 1 }),
        statsOf({ pending: 0, blocked: 1 }),
        statsOf({ pending: 0, blocked: 1 }),
      ],
      query: [queryOf('blocked')],
      triage: async () => ({ action: 'wait-external', externalSlug: 'feature-b' }),
    })
    blockedScript(built)
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSuspended(built.driver)
    // ⑨ 自愈阻塞静默（R-Q4）——零消息，进度事件投影
    expect(built.calls.some((c) => c.text.includes('等待 feature-b 先完成，先执行其它任务'))).toBe(false)
    expect(built.progressCalls.find((e) => e.verb === 'settle' && e.status === 'blocked')).toMatchObject({ scenario: 'blocked/wait-external' })
    expect(built.h.claimInputs).toHaveLength(2) // 续领发生过（wait-external → 下一轮）
    await built.driver.stop({ ownerSessionId: OWNER })
  })

  it('blocked 无 follow-up + 处置钩子 ask-user → ⑩ 叙述 + 挂起待裁决（3b——不再续领）', async () => {
    const built = build({
      claim: [claimed('2.5'), claimed('should-not-claim')],
      stats: [
        statsOf({ pending: 1 }),
        statsOf({ in_progress: 1, blocked: 1 }),
        statsOf({ in_progress: 1, blocked: 1 }),
      ],
      query: [queryOf('blocked')],
      triage: async () => ({ action: 'ask-user' }),
    })
    blockedScript(built)
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    const suspended = await untilSuspended(built.driver)
    expect(built.calls.some((c) => c.text.includes('无法自动处理——已向你发起问询'))).toBe(true)
    expect(suspended.escalation).toEqual({
      kind: 'blocked-ask-user',
      ownerSessionId: OWNER,
      source: SOURCE,
      task: expect.objectContaining({ localId: '2.5' }),
      reason: 'tests hang on flaky selector',
      history: ['第1次处置——决定请求人工裁决'],
    })
    expect(built.h.claimInputs).toHaveLength(1) // 挂起停驻——零续领
    await built.driver.stop({ ownerSessionId: OWNER })
  })

  it('blocked 无 follow-up 且处置钩子缺席（S1c 前桩位缺省）：仅落盘续领——零 ⑧⑨⑩ 叙述，池态判词受阻收口', async () => {
    const built = build({
      claim: [claimed('2.5'), NO_TASK],
      stats: [
        statsOf({ pending: 1 }),
        statsOf({ in_progress: 1, blocked: 1 }),
        statsOf({ in_progress: 1, blocked: 1 }),
        statsOf({ blocked: 1 }),
        statsOf({ blocked: 1 }),
      ],
      query: [queryOf('blocked')],
    })
    blockedScript(built)
    built.h.lists.blocked = [card('feat-x', '2.5', { taskStatus: 'blocked' })] // ⑭ 阻塞清单数据源
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    const suspended = await untilSuspended(built.driver)
    // 缺席 = 静默续领：零处置叙述（⑧⑨⑩描述的动作未发生——不发）；blocked 无 pending 通路
    // → 池态判词机械接管 = ⑭ 受阻叙述 + 挂起待裁决（3b）
    expect(built.calls.some((c) => c.text.includes('[forge·自动处理]'))).toBe(false)
    expect(built.calls.some((c) => c.text.includes('没有可执行的任务，且有任务阻塞中'))).toBe(true)
    expect(suspended.escalation).toEqual({
      kind: 'deadlock',
      ownerSessionId: OWNER,
      source: SOURCE,
      blockedItems: [{ taskKey: '2.5', note: 'Task 2.5' }],
    })
    await built.driver.stop({ ownerSessionId: OWNER })
  })
})

// ─────────────────────────── S1c/S4 装配接线收口（1.11——真实钩子注册 + 身份载体 + 落盘缝） ───────────────────────────

describe('装配接线收口（SC4 端到端——真实 createTriageHook 注册进驱动器，非钩子注入单测）', () => {
  function blockedScript(built: Built): void {
    built.h.lists.created = [] // 无 worker 派生 fix（findFixTaskRef 落空 → followUp 缺席）
  }

  /** 决策输出的 triage 代理 spawn 桩（真实 createTriageHook 的 in-process spawn 面） */
  function triageSpawnWith(output: string): ReturnType<typeof trackedSpawn> {
    const triageSpawn = trackedSpawn()
    triageSpawn.setBehavior(async () => ({
      workerSessionId: 'triage-1',
      result: Promise.resolve({ stopReason: 'completed', output }),
      dispose: async () => {},
    }))
    return triageSpawn
  }

  it('blocked 无 follow-up → 处置代理真实 spawn（收窄工具面+parent 透传）→ 三动作决策宿主忠实执行（add-fix 链）', async () => {
    const parent = { agentTag: 'root-agent' }
    let triageSpawn: ReturnType<typeof trackedSpawn> | undefined
    const built = build({
      claim: [claimed('2.5'), NO_TASK],
      stats: [
        statsOf({ pending: 1 }),
        statsOf({ in_progress: 1, blocked: 1 }),
        statsOf({ in_progress: 1, blocked: 1 }),
        statsOf({ pending: 1, blocked: 1 }),
        statsOf({ pending: 1, blocked: 1 }),
      ],
      query: [queryOf('blocked')],
      triageHook: (h) => {
        triageSpawn = triageSpawnWith('分析过程略。\n{"action":"add-fix","title":"Fix: flaky selector","note":"修选择器等待"}')
        // 真钩子装配同形（src/index.ts）：tasks/spawn 服务面与驱动器同源
        return createTriageHook({ tasks: h.tasks, spawn: triageSpawn.spawn })
      },
    })
    blockedScript(built)
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent })
    await untilSettled(built.driver)
    // 处置代理真实 spawn（第二路 spawn——worker 之外唯一一路）：收窄工具面 + 每循环身份
    expect(built.spawn.requests).toHaveLength(1) // worker 一路；处置代理在独立 spawn 面
    expect(triageSpawn?.requests).toHaveLength(1)
    const req = triageSpawn?.requests[0] as SpawnWorkerRequest
    expect(req.label).toBe('feat-x/2.5 · 处置分析')
    expect(req.prompt).toContain('feat-x/2.5 Implement the thing')
    expect(req.prompt).toContain('tests hang on flaky selector') // reason 全文进处置输入
    for (const name of ['bash', 'read', 'write', 'addTask', 'submitTask', 'dispatchTask', 'queryTask']) {
      expect(req.toolFilter.deny).toContain(name)
    }
    expect(req.parent).toBe(parent) // 每循环 parent 载体经输入面绑定（非装配期烘焙）
    expect(req.signal).toBeInstanceOf(AbortSignal)
    expect(req.signal.aborted).toBe(false)
    // 三动作决策宿主忠实执行：add-fix → addTask(blockSource 链) → ⑧ 叙述 → 续领
    expect(built.h.addTaskInputs).toEqual([
      expect.objectContaining({
        projectId: PROJECT,
        source: SOURCE,
        title: 'Fix: flaky selector',
        type: 'coding-fix',
        sourceTask: { slug: 'feat-x', localId: '2.5' },
        blockSource: true,
      }),
    ])
    expect(built.calls.some((c) => c.text.includes('已自动分析原因并创建修复任务 fix-2（修选择器等待）'))).toBe(false)
  })

  it('每循环身份载体：ownerSessionId/parent 透传；signal = 循环控制器（stop 即取消在途处置）', async () => {
    const parent = { agentTag: 'root-agent' }
    let captured: LoopTriageInput | undefined
    const built = build({
      claim: [claimed('2.5')],
      stats: [statsOf({ pending: 1 }), statsOf({ in_progress: 1, blocked: 1 }), statsOf({ in_progress: 1, blocked: 1 })],
      query: [queryOf('blocked')],
      triage: async (input) => {
        captured = input
        return new Promise<LoopTriageDecision>(() => {}) // 在途处置——挂起等待停止信号
      },
    })
    blockedScript(built)
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent })
    await vi.waitFor(() => expect(captured).toBeDefined(), { timeout: 2000, interval: 5 })
    expect(captured?.ownerSessionId).toBe(OWNER)
    expect(captured?.parent).toBe(parent)
    expect(captured?.signal).toBeInstanceOf(AbortSignal)
    expect(captured?.signal.aborted).toBe(false)
    // 停止 = 循环控制器 abort——在途处置信号随载体被取消
    await built.driver.stop({ ownerSessionId: OWNER })
    expect(captured?.signal.aborted).toBe(true)
  })

  it('blocked 族落盘委派携带 projectId（解析缝载体——事件仓按项目解析容器目录）', async () => {
    const incidentInputs: unknown[] = []
    const built = build({
      claim: [claimed('2.5'), NO_TASK],
      stats: [
        statsOf({ pending: 1 }),
        statsOf({ in_progress: 1, blocked: 1 }),
        statsOf({ in_progress: 1, blocked: 1 }),
        statsOf({ pending: 1, blocked: 1 }),
        statsOf({ pending: 1, blocked: 1 }),
      ],
      query: [queryOf('blocked')],
      incidents: {
        record: (input) => {
          incidentInputs.push(input)
          return 'logs/feat-x/2.5/001-blocked/'
        },
      },
      triage: async () => ({ action: 'add-fix', title: 'Fix: flaky selector', note: '修选择器等待' }),
    })
    blockedScript(built)
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSettled(built.driver)
    expect(incidentInputs).toEqual([
      expect.objectContaining({
        projectId: PROJECT,
        sourceSlug: SOURCE.slug,
        taskKey: '2.5',
        eventType: 'blocked',
        error: 'tests hang on flaky selector',
      }),
    ])
    // 落盘在仓、消息面静默（loop-message-consolidation——自愈阻塞只投影不叙述）
    expect(built.calls.some((c) => c.text.includes('详情: logs/feat-x/2.5/001-blocked/'))).toBe(false)
  })
})

// ─────────────────────────── 第一层机械守卫（spawn 失败退避 / worker 异常终止） ───────────────────────────

describe('第一层机械守卫（decisions #11/#16）', () => {
  it('spawn 失败：⑪ 退避重试（间隔递增 attempt 1→2）→ 第 3 次失败 guard 粘住 → ⑬ 终局；同实例不复活、新实例 guard 复位', async () => {
    const built = build({
      claim: [claimed(), claimed(), claimed()],
      stats: [
        statsOf({ pending: 1 }),
        statsOf({ in_progress: 1 }),
        statsOf({ in_progress: 1 }),
        statsOf({ in_progress: 1 }),
        statsOf({ in_progress: 1 }),
      ],
    })
    built.spawn.setBehavior(async () => {
      throw new Error('subagent factory rejected')
    })
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSettled(built.driver)
    // 三次 spawn 尝试（每轮幂等重入同任务），⑪ ×2 零消息——重试计数进进度事件 note（重入零新通知）
    expect(built.spawn.requests).toHaveLength(3)
    const retryEvents = built.progressCalls.filter((e) => e.verb === 'retry')
    expect(retryEvents).toHaveLength(2)
    expect(retryEvents[0]?.note).toContain('第 1/3 次')
    expect(retryEvents[1]?.note).toContain('第 2/3 次')
    expect(built.calls.filter((c) => c.method !== 'settle')).toEqual([])
    const halted = built.calls.find((c) => c.method === 'settle')
    expect(halted?.text).toContain('启动子代理连续失败 3 次——已停止')
    expect(halted?.text).toContain('阶段: 启动子代理')
    expect(halted?.text).toMatch(/错误: .+subagent factory rejected/)
    expect(halted?.wakeup).toBe(true) // ⑬ 结算单点唤醒（AC）
    expect(halted?.text).toContain('提示用户"环境排查后重新开始 /run-dag-tasks feat-x"，并在问询中决定')
    // 同实例不自动复活（登记表已删、无定时器存活）；新实例 = 新 guard 计数（可正常跑完）
    const recovery = build({ claim: [claimed('2.9'), NO_TASK], stats: [statsOf({ pending: 1 }), statsOf({ in_progress: 1 }), statsOf({ in_progress: 1 }), statsOf({ completed: 1 }), statsOf({ completed: 1 })] })
    await recovery.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSettled(recovery.driver)
    expect(recovery.progressCalls.some((e) => e.verb === 'settle' && e.status === 'completed')).toBe(true)
  })

  it('worker 异常终止（结算失败）：⑫ bounded 立即重入（第 1/3…3/3）→ 超限挂起待裁决（3b）；零防线计数零 tool-error', async () => {
    const built = build({
      claim: [claimed(), claimed(), claimed(), claimed()],
      stats: [statsOf({ pending: 1 }), statsOf({ in_progress: 1 }), statsOf({ in_progress: 1 }), statsOf({ in_progress: 1 }), statsOf({ in_progress: 1 })],
    })
    built.spawn.setBehavior(async (n) => {
      // live 跟踪语义保持——句柄 result 拒绝 = worker 异常终止（基建面成功、执行面崩溃）
      return {
        workerSessionId: `worker-${n}`,
        result: Promise.reject(new Error('worker crashed mid-run')),
        dispose: async () => {},
      }
    })
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    const suspended = await untilSuspended(built.driver)
    // 四次运行（3 次 bounded 重入 + 第 4 次触发超限挂起），⑫ ×3 零消息——重试计数进进度事件 note
    expect(built.spawn.requests).toHaveLength(4)
    const retryEvents = built.progressCalls.filter((e) => e.verb === 'retry')
    expect(retryEvents).toHaveLength(3)
    expect(retryEvents[0]?.note).toContain('第 1/3 次')
    expect(retryEvents[2]?.note).toContain('第 3/3 次')
    expect(built.calls.filter((c) => c.method !== 'settle' && c.method !== 'followup')).toEqual([])
    expect(suspended.escalation).toEqual({
      kind: 'worker-abort-over-limit',
      ownerSessionId: OWNER,
      source: SOURCE,
      taskKey: 'feat-x/2.5',
      attempts: 4,
    })
    // 执行受阻 ≠ spawn 机制故障：零 guard 计数、零 tool-error 留档（循环自有 bounded 阶梯）
    expect(built.events.some((e) => e.type === 'tool-error')).toBe(false)
    await built.driver.stop({ ownerSessionId: OWNER })
  })
})

// ─────────────────────────── 流控失败分流（bug 63112ab2） ───────────────────────────

describe('流控失败分流（限流零重试——挂起返回主会话择时重派）', () => {
  it('worker 无结算终态（stopReason: error + 限流输出）：零重试直接挂起 rate-limit，reason 携带限流原文', async () => {
    const built = build({
      claim: [claimed()],
      stats: [statsOf({ pending: 1 }), statsOf({ in_progress: 1 }), statsOf({ in_progress: 1 }), statsOf({ in_progress: 1 })],
      query: [queryOf('in_progress')],
    })
    built.spawn.setBehavior(async (n) => ({
      workerSessionId: `worker-${n}`,
      result: Promise.resolve({ stopReason: 'error', output: 'provider error: 429 Too Many Requests, rate limit exceeded' }),
      dispose: async () => {},
    }))
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    const suspended = await untilSuspended(built.driver)
    // 限流窗口内重试必再撞限流——单次 spawn 不重试
    expect(built.spawn.requests).toHaveLength(1)
    expect(suspended.escalation).toEqual({
      kind: 'rate-limit',
      ownerSessionId: OWNER,
      source: SOURCE,
      taskKey: 'feat-x/2.5',
      reason: expect.stringContaining('rate limit exceeded'),
    })
    // 不走 ⑪/⑫ 自动重试叙述
    expect(built.calls.some((c) => c.text.includes('[forge·自动重试]'))).toBe(false)
    await built.driver.stop({ ownerSessionId: OWNER })
  })

  it('spawn 拒绝（限流文案）：零重试零退避，直接挂起 rate-limit', async () => {
    const built = build({
      claim: [claimed()],
      stats: [statsOf({ pending: 1 }), statsOf({ in_progress: 1 }), statsOf({ in_progress: 1 }), statsOf({ in_progress: 1 })],
    })
    built.spawn.setBehavior(async () => {
      throw new Error('provider rejected session start: 429 rate limit exceeded')
    })
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    const suspended = await untilSuspended(built.driver)
    expect(built.spawn.requests).toHaveLength(1)
    expect(suspended.escalation).toMatchObject({ kind: 'rate-limit', taskKey: 'feat-x/2.5' })
    expect(suspended.escalation.kind === 'rate-limit' && suspended.escalation.reason).toContain('429')
    expect(built.calls.some((c) => c.text.includes('启动子代理失败'))).toBe(false)
    await built.driver.stop({ ownerSessionId: OWNER })
  })

  it('非流控 spawn 失败不误判：照旧走退避重试阶梯至 halted（回归锚）', async () => {
    const built = build({
      claim: [claimed()],
      stats: [statsOf({ pending: 1 }), statsOf({ in_progress: 1 }), statsOf({ in_progress: 1 }), statsOf({ in_progress: 1 })],
    })
    built.spawn.setBehavior(async () => {
      throw new Error('subagent factory rejected')
    })
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSettled(built.driver)
    // 三次尝试 + ⑪ ×2 零消息——原阶梯行为不变（bug 63112ab2 只分流限流径）；重试计数进进度事件
    expect(built.spawn.requests).toHaveLength(3)
    expect(built.calls.filter((c) => c.text.includes('启动子代理失败'))).toHaveLength(0)
    expect(built.progressCalls.filter((e) => e.verb === 'retry' && e.scenario === 'retry/spawn-failed')).toHaveLength(2)
  })
})

describe('流控分类器 isRateLimitFailure', () => {
  it('命中限流族文案（429 / rate limit / throttled / Too Many Requests / 流控 / 限流）', () => {
    expect(isRateLimitFailure('provider error: 429 Too Many Requests')).toBe(true)
    expect(isRateLimitFailure('Rate limit exceeded, retry after 60s')).toBe(true)
    expect(isRateLimitFailure('request throttled by upstream')).toBe(true)
    expect(isRateLimitFailure('供应商流控触发，请稍后重试')).toBe(true)
    expect(isRateLimitFailure('触发限流窗口')).toBe(true)
  })

  it('不命中一般失败文案', () => {
    expect(isRateLimitFailure('subagent factory rejected')).toBe(false)
    expect(isRateLimitFailure('worker run ended without a settlement (stopReason: error)')).toBe(false)
    expect(isRateLimitFailure('')).toBe(false)
  })
})

// ─────────────────────────── 静默挂起径补录（⑱-㉑——唤醒 + forge/progress suspend 事件） ───────────────────────────

describe('静默挂起径补录（⑱-㉑——send(nextStep, true) 唤醒 + forge/progress suspend 事件）', () => {
  /** incident 仓记录桩（落盘委派观察——路径注入供唤醒消息指向断言） */
  function incidentStub(inputs: unknown[], path: string): IncidentStore {
    return {
      record: (input) => {
        inputs.push(input)
        return path
      },
    }
  }

  /** 四径共用断言：唤醒一条（form followup·wakeup true·原因摘要 + incident 子文件夹路径）
   *  + progress suspend 事件一枚（scenario 场景码 + note 携带原因）+ incident 落盘委派 */
  function expectWakeupAndProgress(
    built: ReturnType<typeof build>,
    input: { scenario: string; path: string; reasonPart: string; headlinePart: string },
  ): void {
    const wakeup = built.calls.filter((c) => c.form === 'followup' && c.wakeup)
    expect(wakeup).toHaveLength(1)
    expect(wakeup[0]?.text).toContain(input.headlinePart)
    expect(wakeup[0]?.text).toContain(input.path)
    const suspend = built.progressCalls.find((p) => p.verb === 'suspend')
    expect(suspend).toMatchObject({
      verb: 'suspend',
      status: 'blocked',
      taskKey: 'feat-x/2.5',
      scenario: input.scenario,
    })
    expect(suspend !== undefined && suspend.note?.includes(input.reasonPart)).toBe(true)
  }

  it('⑱ spawn-rate-limited：唤醒 + progress suspend（suspend/spawn-rate-limited）+ incident 落盘', async () => {
    const incidentInputs: unknown[] = []
    const built = build({
      claim: [claimed()],
      stats: [statsOf({ pending: 1 }), statsOf({ in_progress: 1 }), statsOf({ in_progress: 1 }), statsOf({ in_progress: 1 })],
      incidents: incidentStub(incidentInputs, 'logs/feat-x/2.5/001-spawn-rate-limited/'),
    })
    built.spawn.setBehavior(async () => {
      throw new Error('provider rejected session start: 429 rate limit exceeded')
    })
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    const suspended = await untilSuspended(built.driver)
    expect(suspended.escalation).toMatchObject({ kind: 'rate-limit', taskKey: 'feat-x/2.5' })
    expectWakeupAndProgress(built, {
      scenario: 'suspend/spawn-rate-limited',
      path: 'logs/feat-x/2.5/001-spawn-rate-limited/',
      reasonPart: '429',
      headlinePart: '启动被限流',
    })
    expect(incidentInputs).toEqual([expect.objectContaining({ eventType: 'spawn-rate-limited', taskKey: '2.5', projectId: PROJECT })])
    await built.driver.stop({ ownerSessionId: OWNER })
  })

  it('⑲ worker-rate-limited：唤醒 + progress suspend（suspend/worker-rate-limited）+ incident 落盘', async () => {
    const incidentInputs: unknown[] = []
    const built = build({
      claim: [claimed()],
      stats: [statsOf({ pending: 1 }), statsOf({ in_progress: 1 }), statsOf({ in_progress: 1 }), statsOf({ in_progress: 1 })],
      query: [queryOf('in_progress')],
      incidents: incidentStub(incidentInputs, 'logs/feat-x/2.5/001-worker-rate-limited/'),
    })
    built.spawn.setBehavior(async (n) => ({
      workerSessionId: `worker-${n}`,
      result: Promise.resolve({ stopReason: 'error', output: 'provider error: 429 Too Many Requests, rate limit exceeded' }),
      dispose: async () => {},
    }))
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    const suspended = await untilSuspended(built.driver)
    expect(suspended.escalation).toMatchObject({ kind: 'rate-limit', taskKey: 'feat-x/2.5' })
    expectWakeupAndProgress(built, {
      scenario: 'suspend/worker-rate-limited',
      path: 'logs/feat-x/2.5/001-worker-rate-limited/',
      reasonPart: 'rate limit exceeded',
      headlinePart: '执行被限流',
    })
    expect(incidentInputs).toEqual([expect.objectContaining({ eventType: 'worker-rate-limited', taskKey: '2.5' })])
    await built.driver.stop({ ownerSessionId: OWNER })
  })

  it('⑳ worker-abort-over-limit：唤醒 + progress suspend（suspend/abort-over-limit）+ incident 落盘', async () => {
    const incidentInputs: unknown[] = []
    const built = build({
      claim: [claimed(), claimed(), claimed(), claimed()],
      stats: [statsOf({ pending: 1 }), statsOf({ in_progress: 1 }), statsOf({ in_progress: 1 }), statsOf({ in_progress: 1 }), statsOf({ in_progress: 1 })],
      incidents: incidentStub(incidentInputs, 'logs/feat-x/2.5/001-abort-over-limit/'),
    })
    built.spawn.setBehavior(async (n) => ({
      workerSessionId: `worker-${n}`,
      result: Promise.reject(new Error('worker crashed mid-run')),
      dispose: async () => {},
    }))
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    const suspended = await untilSuspended(built.driver)
    expect(suspended.escalation).toMatchObject({ kind: 'worker-abort-over-limit', taskKey: 'feat-x/2.5' })
    expectWakeupAndProgress(built, {
      scenario: 'suspend/abort-over-limit',
      path: 'logs/feat-x/2.5/001-abort-over-limit/',
      reasonPart: 'worker crashed mid-run',
      headlinePart: '反复异常退出',
    })
    // 既有 worker-aborted 逐次落盘不回归（超限末次也照旧落盘）+ 超限径独立落盘一枚
    expect(incidentInputs.filter((i) => (i as { eventType: string }).eventType === 'worker-aborted')).toHaveLength(4)
    expect(incidentInputs.filter((i) => (i as { eventType: string }).eventType === 'worker-abort-over-limit')).toHaveLength(1)
    await built.driver.stop({ ownerSessionId: OWNER })
  })

  it('㉑ settle-landing-rejected：唤醒 + progress suspend（suspend/landing-rejected）+ incident 落盘', async () => {
    const incidentInputs: unknown[] = []
    const badLanding: CommitLandingVerifier = async () => ({ ok: false, branch: 'feat-x', commitBranches: ['main'] })
    const built = build({
      claim: [claimed('2.5'), claimed('should-not-claim')],
      stats: [statsOf({ pending: 1 }), statsOf({ in_progress: 1 }), statsOf({ interrupted: 1 })],
      query: [queryOf('completed')],
      commitLanding: badLanding,
      incidents: incidentStub(incidentInputs, 'logs/feat-x/2.5/001-landing-rejected/'),
    })
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {}, worktree: 'Z:\\wt' })
    const suspended = await untilSuspended(built.driver)
    expect(suspended.escalation).toMatchObject({ kind: 'settle-landing-rejected', taskKey: 'feat-x/2.5' })
    expectWakeupAndProgress(built, {
      scenario: 'suspend/landing-rejected',
      path: 'logs/feat-x/2.5/001-landing-rejected/',
      reasonPart: '[settle-cwd-pin]',
      headlinePart: '落点核验',
    })
    expect(incidentInputs).toEqual([expect.objectContaining({ eventType: 'settle-landing-rejected', taskKey: '2.5' })])
    await built.driver.stop({ ownerSessionId: OWNER })
  })
})

// ─────────────────────────── no-task 三态判词 ───────────────────────────

describe('no-task 三态判词（settled / 等待 / halted-受阻）', () => {
  it('deadlock-suspected：⑭ 受阻叙述 + 挂起待裁决（附阻塞清单，3b）', async () => {
    const built = build({
      claim: [NO_TASK],
      stats: [statsOf({ blocked: 2 }), statsOf({ blocked: 2 }), statsOf({ blocked: 2, completed: 4 })],
    })
    built.h.lists.blocked = [card('feat-x', '3.1', { taskStatus: 'blocked' }), card('feat-x', '4.1', { taskStatus: 'blocked' })]
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    const suspended = await untilSuspended(built.driver)
    const blocked = built.calls.find((c) => c.method === 'followup')
    expect(blocked?.text).toContain('没有可执行的任务，且有任务阻塞中')
    expect(blocked?.text).toContain('3.1（Task 3.1）· 4.1（Task 4.1）')
    // ⑭ 即时唤醒（AC）：send(nextStep, true)——阻塞清单上下文供主 agent 分析可解除性
    expect(blocked?.form).toBe('followup')
    expect(blocked?.wakeup).toBe(true)
    expect(suspended.escalation).toEqual({
      kind: 'deadlock',
      ownerSessionId: OWNER,
      source: SOURCE,
      blockedItems: [{ taskKey: '3.1', note: 'Task 3.1' }, { taskKey: '4.1', note: 'Task 4.1' }],
    })
    expect(built.h.claimInputs).toHaveLength(1)
    await built.driver.stop({ ownerSessionId: OWNER })
  })

  it('bounded patience：连续 wait 判词 3 轮封顶 → ⑮ 收口建议重派（claim 恰 3 次——不无限空转）', async () => {
    const wait = statsOf({ pending: 2, unmetPending: 2 })
    const built = build({
      claim: [NO_TASK],
      stats: [wait, wait, wait, wait, statsOf({ pending: 2, completed: 4 })],
    })
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSettled(built.driver)
    expect(built.h.claimInputs).toHaveLength(3) // 三轮等待判词后耐心耗尽
    const timeout = built.calls.find((c) => c.method === 'settle')
    expect(timeout?.text).toContain('结束（等待超时）')
    expect(timeout?.wakeup).toBe(true) // ⑮ 结算单点唤醒（AC）
    expect(timeout?.text).toContain('完成 4 · 阻塞 0 · 待处理 2')
    expect(timeout?.text).toContain('提示用户"稍后重新执行 /run-dag-tasks feat-x"')
  })
})

// ─────────────────────────── 生命周期入口（start/stop——S2 消费面） ───────────────────────────

describe('循环生命周期（⑧——供 S2 指令层调用）', () => {
  it('同源独占守卫（2026-10-12 多会话并行裁决）：同源再 start → loop-active 拒绝（附在役归属）；异源异会话并行可启；停止后新实例可启', async () => {
    const built = build({ claim: [claimed()] })
    built.spawn.setBehavior(parkedSpawn) // 永不结算——保持在飞（确定性）
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await vi.waitFor(
      () => {
        expect(built.driver.activeOf(OWNER)?.inFlight).toBeDefined()
      },
      { timeout: 2000, interval: 5 },
    )
    // 同源他会话再 start → 拒绝（同一任务源不能双派发——3b 起失败分支带 message/guidance/suspended 全形）
    const same = await built.driver.start({ source: SOURCE, ownerSessionId: 'session-2', parent: {} })
    expect(same).toEqual({
      ok: false,
      code: 'loop-active',
      activeSource: SOURCE,
      activeOwnerSessionId: OWNER,
      suspended: false,
      message: expect.any(String),
      guidance: [],
    })
    // 异源他会话 start → 并行放行（多会话各跑各源）
    const parallel = await built.driver.start({ source: { kind: 'proposal', slug: 'other' }, ownerSessionId: 'session-2', parent: {} })
    expect(parallel).toEqual({ ok: true, loopId: expect.any(String) })
    expect(built.driver.activeAll()).toHaveLength(2) // 两活循环并行在场
    await built.driver.stop({ ownerSessionId: 'session-2' })
    const stopped = await built.driver.stop({ ownerSessionId: OWNER })
    expect(stopped).toEqual({ ok: true, stopped: true, hadInFlight: true })
    const restarted = await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    expect(restarted).toEqual({ ok: true, loopId: expect.any(String) })
    await built.driver.stop({ ownerSessionId: OWNER })
  })

  it('stop：取消 in-flight + 真化 interrupted（S3 transitionTask 面）+ ⑰ 收口叙述 + 登记注销；他会话/无循环 = no-active-loop', async () => {
    const built = build({ claim: [claimed()] })
    built.spawn.setBehavior(parkedSpawn) // 永不结算
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await vi.waitFor(
      () => {
        expect(built.driver.activeOf(OWNER)?.inFlight).toBeDefined()
      },
      { timeout: 2000, interval: 5 },
    )
    // 他会话 stop ≠ 本会话循环（decisions #20——不误停、不暴露归属）
    expect(await built.driver.stop({ ownerSessionId: 'session-2' })).toEqual({ ok: false, code: 'no-active-loop' })
    const stopped = await built.driver.stop({ ownerSessionId: OWNER })
    expect(stopped).toEqual({ ok: true, stopped: true, hadInFlight: true })
    // in-flight 真化 interrupted（S3 面——人类转移通道）
    expect(built.h.transitions).toEqual([
      { projectId: PROJECT, taskId: 't-1', toStatus: 'interrupted', reason: '派发循环停止', actor: 'core' },
    ])
    // ⑰ 停止终局叙述（用户主动停止 = 不引导续跑，下一步动作 = 无）
    const stoppedNotice = built.calls.find((c) => c.method === 'settle')
    expect(stoppedNotice?.text).toContain('[forge·停止] 任务源: feat-x — 已按你的指令停止')
    expect(stoppedNotice?.text).toContain('执行中任务 feat-x/2.5 已标记为中断')
    expect(stoppedNotice?.text).toContain('下一步动作: 无')
    expect(stoppedNotice?.text).not.toContain('/run-dag-tasks')
    // ⑰ 结算单点唤醒（AC）：send(nextStep, true)
    expect(stoppedNotice?.form).toBe('settle')
    expect(stoppedNotice?.wakeup).toBe(true)
    // ⑰ 双面落会话日志（AC）：forge/progress stopped 事件载 inFlightTaskKey（与结算消息同事实两面）
    const stopProgress = built.progressCalls.find((e) => e.verb === 'stop')
    expect(stopProgress).toMatchObject({ verb: 'stop', status: 'interrupted', taskKey: 'feat-x/2.5', scenario: 'loop/stopped' })
    // 登记注销 + 再停 = no-op
    expect(built.driver.activeOf(OWNER)).toBeUndefined()
    expect(await built.driver.stop({ ownerSessionId: OWNER })).toEqual({ ok: false, code: 'no-active-loop' })
    // 停止径 = 主动终态：worker abort 经 killed 分类——零 tool-error（不进防线不发射）
    expect(built.events.some((e) => e.type === 'tool-error')).toBe(false)
  })

  it('dispose（fiber 卸载收口）：在飞循环同步终态注销 + 独占摘除 + 零真化零叙述（对账归下次装配 reconcile）+ 零异常 warn', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const built = build({ claim: [claimed()] })
      built.spawn.setBehavior(parkedSpawn) // 永不结算——两循环均挂在 await worker.result（卸载窗形态）
      await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
      await built.driver.start({ source: { kind: 'proposal', slug: 'other' }, ownerSessionId: 'session-2', parent: {} })
      await vi.waitFor(
        () => {
          expect(built.driver.activeAll()).toHaveLength(2)
          expect(built.driver.activeOf(OWNER)?.inFlight).toBeDefined()
        },
        { timeout: 2000, interval: 5 },
      )
      built.driver.dispose()
      // 同步终态：登记表清空 + S1c 独占注销（新 fiber 可再启）
      expect(built.driver.activeAll()).toEqual([])
      expect(exclusiveLoopSourceOf(SOURCE)).toBeUndefined()
      expect(exclusiveLoopSourceOf({ kind: 'proposal', slug: 'other' })).toBeUndefined()
      // 静默收口：不真化 in-flight（遗留对账归 reconcileInterrupted）；dispose 后零新增叙述（启动叙述除外）、零异常 warn
      expect(built.h.transitions).toEqual([])
      const callsAtDispose = built.calls.length
      await new Promise((r) => setTimeout(r, 20))
      expect(built.calls).toHaveLength(callsAtDispose)
      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('terminated abnormally'), expect.anything())
      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('The database connection is not open'))
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('停止竞态（领取进度读窗被叫停）：stop 面接管真化——循环醒来让渡，零 spawn 零续领', async () => {
    let stopPromise: Promise<unknown> | undefined
    const h = tasksHarness()
    h.setClaim([claimed()])
    const deps: LoopDriverDeps = {
      projectId: PROJECT,
      tasks: h.tasks,
      spawn: trackedSpawn().spawn,
      narrator: createNarrator({ channel: sendRecordingChannel([]) }),
      delays: { backoffBaseMs: 1, patiencePauseMs: 1 },
    }
    const driver = createLoopDriver(deps)
    // 竞态注入点改缝（loop-message-consolidation——claim 通知退出后）：领取进度事件的 stats
    // 读窗内敲 stop（此时 in-flight 已登记、spawn 未发生——原 claim 通知 await 窗同语义）
    const rawStats = h.tasks.taskStats.bind(h.tasks)
    ;(h.tasks as { taskStats: unknown }).taskStats = async (input: unknown) => {
      const result = await rawStats(input)
      if (stopPromise === undefined && h.statsInputs.length >= 2) stopPromise = driver.stop({ ownerSessionId: OWNER })
      return result
    }
    await driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSettled(driver)
    expect(await stopPromise).toEqual({ ok: true, stopped: true, hadInFlight: true })
    // 真化归 stop 面（stop 读数晚于 in-flight 登记——接管方）；循环径让渡
    expect(h.transitions).toEqual([{ projectId: PROJECT, taskId: 't-1', toStatus: 'interrupted', reason: '派发循环停止', actor: 'core' }])
    expect(h.claimInputs).toHaveLength(1) // 零续领
  })
})

// ─────────────────────────── S1c · 三层阶梯（第二层处置代理阶梯 + 第三层问询） ───────────────────────────

describe('S1c 退避序列与循环独占（第一层锚 + SC5 守卫）', () => {
  it('退避间隔递增序列（decisions #11——不立即重试，base×N）', () => {
    expect([1, 2, 3].map((n) => backoffDelayMs(10_000, n))).toEqual([10_000, 20_000, 30_000])
  })

  it('循环独占登记：start 即独占（源对在读）→ 终态/停止注销（幂等）', async () => {
    const built = build({ claim: [claimed(), NO_TASK], stats: [statsOf({ pending: 1 }), statsOf({ in_progress: 1 }), statsOf({ in_progress: 1 }), statsOf({ completed: 1 }), statsOf({ completed: 1 })] })
    const started = await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    expect(started.ok).toBe(true)
    const loopId = started.ok ? started.loopId : ''
    expect(exclusiveLoopSourceOf(SOURCE)).toEqual({ loopId })
    await untilSettled(built.driver)
    expect(exclusiveLoopSourceOf(SOURCE)).toBeUndefined() // 终态 finally 注销
  })

  it('停止注销独占登记（stop 面——归属校验同径）', async () => {
    const built = build({ claim: [claimed()] })
    built.spawn.setBehavior(parkedSpawn)
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await vi.waitFor(
      () => {
        expect(built.driver.activeOf(OWNER)?.inFlight).toBeDefined()
      },
      { timeout: 2000, interval: 5 },
    )
    expect(exclusiveLoopSourceOf(SOURCE)).toBeDefined()
    await built.driver.stop({ ownerSessionId: OWNER })
    expect(exclusiveLoopSourceOf(SOURCE)).toBeUndefined()
  })
})

describe('S1c 第二层处置阶梯（无效/越权计处置失败 + 同任务计数封顶 + 链深到顶）', () => {
  function blockedScript(built: Built): void {
    built.h.lists.created = [] // blocked 无 follow-up——处置阶梯径
  }

  it('处置重试超限：无效输出 ×3 → disposition-over-limit 挂起待裁决（附 reason 全文与处置历史，3b）', async () => {
    const built = build({
      claim: [claimed('2.5')],
      stats: [statsOf({ pending: 1 }), statsOf({ in_progress: 1, blocked: 1 }), statsOf({ in_progress: 1, blocked: 1 })],
      query: [queryOf('blocked')],
      triage: () => Promise.reject(new Error('invalid decision shape')),
    })
    blockedScript(built)
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    const suspended = await untilSuspended(built.driver)
    // 同结算内三次重试（处置上限 LOOP_TRIAGE_MAX_ATTEMPTS）——超限即挂起
    expect(built.h.claimInputs).toHaveLength(1)
    expect(suspended.escalation).toEqual({
      kind: 'disposition-over-limit',
      ownerSessionId: OWNER,
      source: SOURCE,
      task: expect.objectContaining({ localId: '2.5' }),
      reason: 'tests hang on flaky selector',
      attempts: LOOP_TRIAGE_MAX_ATTEMPTS,
      history: [
        '第1次处置——分析未得出结论',
        '第2次处置——分析未得出结论',
        '第3次处置——分析未得出结论',
      ],
    })
    // ⑩ 叙述（挂起后 owner 对话面处置）
    expect(built.calls.some((c) => c.text.includes('无法自动处理——已向你发起问询'))).toBe(true)
    await built.driver.stop({ ownerSessionId: OWNER })
  })

  it('处置失败后重试成功：前两次无效、第三次 add-fix → 宿主执行，零升级', async () => {
    let calls = 0
    const built = build({
      claim: [claimed('2.5'), NO_TASK],
      stats: [
        statsOf({ pending: 1 }),
        statsOf({ in_progress: 1, blocked: 1 }),
        statsOf({ in_progress: 1, blocked: 1 }),
        statsOf({ pending: 1, blocked: 1 }),
        statsOf({ pending: 1, blocked: 1 }),
      ],
      query: [queryOf('blocked')],
      triage: () => {
        calls += 1
        if (calls <= 2) return Promise.reject(new Error('越权动作——dispatch'))
        return Promise.resolve({ action: 'add-fix', title: 'Fix: flaky selector', note: '修选择器等待' })
      },
    })
    blockedScript(built)
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSettled(built.driver)
    expect(calls).toBe(3)
    expect(built.h.addTaskInputs).toHaveLength(1)
    expect(built.escalations).toEqual([])
    expect(built.calls.some((c) => c.text.includes('已自动分析原因并创建修复任务 fix-2'))).toBe(false)
  })

  it('同任务处置计数封顶跨结算：三次处置后，同任务第四次 blocked 不再处置直接升级', async () => {
    let calls = 0
    const built = build({
      claim: [claimed('2.5'), claimed('2.5'), claimed('2.5'), claimed('2.5')],
      stats: [
        statsOf({ pending: 1 }),
        statsOf({ in_progress: 1, blocked: 1 }),
        statsOf({ in_progress: 1, blocked: 1 }),
      ],
      query: [queryOf('blocked')],
      triage: () => {
        calls += 1
        return Promise.resolve({ action: 'add-fix', note: `第${calls}次修复` })
      },
    })
    blockedScript(built)
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    const suspended = await untilSuspended(built.driver)
    // 三次结算各处置一次（add-fix 续领后同任务再次 blocked）；第四次触簿即封顶——不再调模型
    expect(calls).toBe(LOOP_TRIAGE_MAX_ATTEMPTS)
    expect(built.h.claimInputs).toHaveLength(4)
    expect(suspended.escalation).toEqual({
      kind: 'disposition-over-limit',
      ownerSessionId: OWNER,
      source: SOURCE,
      task: expect.objectContaining({ localId: '2.5' }),
      reason: 'tests hang on flaky selector',
      attempts: LOOP_TRIAGE_MAX_ATTEMPTS,
      history: [
        '第1次处置——决定创建修复任务（第1次修复）',
        '第2次处置——决定创建修复任务（第2次修复）',
        '第3次处置——决定创建修复任务（第3次修复）',
      ],
    })
    await built.driver.stop({ ownerSessionId: OWNER })
  })

  it('fix 链深 ≤6 到顶：addTask ERR_CHAIN_DEPTH_EXCEEDED → fix-chain-over-limit 挂起待裁决（附深度/上限/历史，3b）', async () => {
    const built = build({
      claim: [claimed('2.5')],
      stats: [statsOf({ pending: 1 }), statsOf({ in_progress: 1, blocked: 1 }), statsOf({ in_progress: 1, blocked: 1 })],
      query: [queryOf('blocked')],
      triage: () => Promise.resolve({ action: 'add-fix', title: 'Fix: flaky selector', note: '修选择器等待' }),
    })
    blockedScript(built)
    built.h.tasks.addTask = async () => {
      throw Object.assign(new Error('fix 链深超限'), { code: 'ERR_CHAIN_DEPTH_EXCEEDED', data: { depth: 7, limit: 6 } })
    }
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    const suspended = await untilSuspended(built.driver)
    expect(built.h.claimInputs).toHaveLength(1)
    expect(suspended.escalation).toEqual({
      kind: 'fix-chain-over-limit',
      ownerSessionId: OWNER,
      source: SOURCE,
      task: expect.objectContaining({ localId: '2.5' }),
      reason: 'tests hang on flaky selector',
      depth: 7,
      limit: 6,
      history: ['第1次处置——决定创建修复任务（修选择器等待）', '第1次处置——修复任务创建被拒（修复链已达上限）'],
    })
    expect(built.calls.some((c) => c.text.includes('无法自动处理——已向你发起问询'))).toBe(true)
    await built.driver.stop({ ownerSessionId: OWNER })
  })

  it('第三层问询载荷含 reason 原文与处置历史；主会话叙述仅摘要（断言不含全文）', async () => {
    const fullReason = '第一行构建环境缺失\n第二行机密细节 SHADOW-SECRET-VALUE'
    const built = build({
      claim: [claimed('2.5')],
      stats: [statsOf({ pending: 1 }), statsOf({ in_progress: 1, blocked: 1 }), statsOf({ in_progress: 1, blocked: 1 })],
      // 结算 reason 源 = blocked submit 记录——fixture 直载全文（两行，摘要截断断言用）
      query: [
        {
          task: snapshot({ taskStatus: 'blocked' }),
          container: { kind: 'feature', slug: 'feat-x', title: 'feat-x' },
          records: [
            { verb: 'submit', toStatus: 'blocked', reason: fullReason, files: ['packages/x/src/changed.ts'], actor: 'plugin-tool', createdAt: '2026-10-11T01:00:00.000Z' },
          ],
        },
      ],
      triage: (input) => {
        expect(input.reason).toBe(fullReason) // 处置代理输入 = reason 全文
        return Promise.resolve({ action: 'ask-user' })
      },
    })
    blockedScript(built)
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    const suspended = await untilSuspended(built.driver)
    // 挂起载荷 = reason 原文（含第二行）
    expect(suspended.escalation).toEqual({
      kind: 'blocked-ask-user',
      ownerSessionId: OWNER,
      source: SOURCE,
      task: expect.objectContaining({ localId: '2.5' }),
      reason: fullReason,
      history: ['第1次处置——决定请求人工裁决'],
    })
    // 主会话叙述 = 摘要（首行截断）——全文零出现（decisions #24 分级呈现）
    const notice = built.calls.find((c) => c.text.includes('无法自动处理——已向你发起问询'))
    expect(notice?.text).toContain('第一行构建环境缺失')
    expect(notice?.text).not.toContain('SHADOW-SECRET-VALUE')
    await built.driver.stop({ ownerSessionId: OWNER })
  })
})

describe('S1c 第三层问询（halted/裁决升级事件的问询投递）', () => {
  it('spawn 连败 ×3 halted：⑬ 终局 + 第三层问询（reason 原文 = HALTED_REASON）', async () => {
    const built = build({
      claim: [claimed(), claimed(), claimed()],
      stats: [
        statsOf({ pending: 1 }),
        statsOf({ in_progress: 1 }),
        statsOf({ in_progress: 1 }),
        statsOf({ in_progress: 1 }),
        statsOf({ in_progress: 1 }),
      ],
    })
    built.spawn.setBehavior(async () => {
      throw new Error('subagent factory rejected')
    })
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSettled(built.driver)
    expect(built.escalations).toEqual([
      { kind: 'halted', ownerSessionId: OWNER, source: SOURCE, attempts: 3, reason: HALTED_REASON },
    ])
    const halted = built.calls.find((c) => c.method === 'settle')
    expect(halted?.text).toContain('启动子代理连续失败 3 次——已停止')
    expect(halted?.wakeup).toBe(true) // ⑬ 结算单点唤醒（AC）
    // 1.5 场景码：⑬ loop/halt（循环级进度事件）
    expect(built.progressCalls.find((e) => e.verb === 'halt')).toMatchObject({ verb: 'halt', status: 'blocked', scenario: 'loop/halt', note: HALTED_REASON })
  })
})

// ─────────────────────────── 1.5 发射点全场景覆盖（retry 族场景码） ───────────────────────────

describe('1.5 发射点扩展：retry 族场景码（⑪⑫——自动重试径进度事件）', () => {
  it('⑪ spawn 失败退避重试：retry/spawn-failed（任务标题 + 失败原因入 note）——退避后重试成功续跑', async () => {
    const built = build({
      claim: [claimed(), claimed(), NO_TASK],
      stats: [
        statsOf({ pending: 1 }),
        statsOf({ in_progress: 1 }),
        statsOf({ in_progress: 1 }),
        statsOf({ in_progress: 1 }),
        statsOf({ completed: 1 }),
        statsOf({ completed: 1 }),
      ],
    })
    let calls = 0
    built.spawn.setBehavior(async (n) => {
      calls += 1
      if (calls === 1) throw new Error('subagent factory rejected')
      return { workerSessionId: `worker-${n}`, result: Promise.resolve({ stopReason: 'end_turn', output: 'done' }), dispose: async () => {} }
    })
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSettled(built.driver)
    expect(built.progressCalls.find((e) => e.verb === 'retry')).toMatchObject({
      verb: 'retry',
      status: 'blocked',
      scenario: 'retry/spawn-failed',
      taskKey: 'feat-x/2.5',
      taskTitle: 'Implement the thing',
    })
    const retryEvt = built.progressCalls.find((e) => e.verb === 'retry')
    expect(retryEvt !== undefined && retryEvt.note?.includes('subagent factory rejected')).toBe(true)
  })

  it('⑫ worker 异常退出重入：retry/worker-aborted（worker 会话 id + 原因入 note）——重入后成功收口', async () => {
    const built = build({
      claim: [claimed(), claimed(), NO_TASK],
      stats: [
        statsOf({ pending: 1 }),
        statsOf({ in_progress: 1 }),
        statsOf({ in_progress: 1 }),
        statsOf({ in_progress: 1 }),
        statsOf({ completed: 1 }),
        statsOf({ completed: 1 }),
      ],
    })
    let calls = 0
    built.spawn.setBehavior(async (n) => {
      calls += 1
      if (calls === 1) return { workerSessionId: `worker-${n}`, result: Promise.reject(new Error('worker crashed mid-run')), dispose: async () => {} }
      return { workerSessionId: `worker-${n}`, result: Promise.resolve({ stopReason: 'end_turn', output: 'done' }), dispose: async () => {} }
    })
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSettled(built.driver)
    expect(built.progressCalls.find((e) => e.verb === 'retry')).toMatchObject({
      verb: 'retry',
      status: 'blocked',
      scenario: 'retry/worker-aborted',
      taskKey: 'feat-x/2.5',
      workerSessionId: 'worker-1',
    })
  })
})

// ─────────────────────────── S2 面（any-active 读数 + projectId 会话覆盖） ───────────────────────────

describe('S2 面：active() 单活读数与 projectId 覆盖（S2 指令层消费缝）', () => {
  it('activeAll()：启动后含登记行（任务源/主会话 id）；stop 后空（多会话并行的全量读数面）', async () => {
    const built = build({
      claim: [NO_TASK],
      stats: [statsOf({ completed: 1 }), statsOf({ completed: 1 })],
    })
    expect(built.driver.activeAll()).toEqual([])
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {}, projectId: PROJECT })
    const records = built.driver.activeAll()
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ source: SOURCE, ownerSessionId: OWNER })
    await built.driver.stop({ ownerSessionId: OWNER })
    expect(built.driver.activeAll()).toEqual([])
  })

  it('projectId 覆盖：input.projectId 优先于 deps（claim/list/stats 读携带会话工作区解析结果）', async () => {
    const built = build({
      claim: [claimed(), NO_TASK],
      stats: [
        statsOf({ pending: 1 }),
        statsOf({ in_progress: 1 }),
        statsOf({ in_progress: 1 }),
        statsOf({ completed: 1 }),
        statsOf({ completed: 1 }),
      ],
    })
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {}, projectId: 'p-override' })
    await untilSettled(built.driver)
    expect(built.h.claimInputs[0]).toMatchObject({ projectId: 'p-override' })
    for (const q of built.h.listInputs) expect(q.projectId).toBe('p-override')
  })

  it('projectId 双缺席（deps 与 input 均无）：start 拒绝（fail-loud——不落不可归属的循环）', async () => {
    const h = tasksHarness()
    const channel: NarrationChannel = { send: async () => {} }
    const driver = createLoopDriver({
      tasks: h.tasks,
      spawn: trackedSpawn().spawn,
      narrator: createNarrator({ channel }),
      delays: { backoffBaseMs: 1, patiencePauseMs: 1 },
    })
    await expect(driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })).rejects.toThrow(/projectId/)
  })
})

// ─────────────────────────── 1.17 循环进度事件（'forge/progress' 流内交错） ───────────────────────────

describe('1.17 进度事件发射（领取/结算/状态迁移点——非模型面零回合唤醒）', () => {
  it('全链形状：领取（claim + counts 快照）→ 结算成功（settle·completed）——数据形状五件齐（任务键/动词/状态/计数/时间戳）', async () => {
    const built = build({
      claim: [claimed(), NO_TASK],
      stats: [
        statsOf({ pending: 1 }), // 启动读
        statsOf({ in_progress: 1 }), // 领取通知读
        statsOf({ in_progress: 1 }), // 结算读
        statsOf({ completed: 1 }), // no-task 池读
        statsOf({ completed: 1 }), // ⑯ 收口读
      ],
    })
    const before = Date.now()
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSettled(built.driver)
    expect(built.progressCalls).toHaveLength(6)
    const [startupEvt, claimEvt, , spawnedEvt, settleEvt] = built.progressCalls
    // 启动点（1.5——① startup/from-scratch）：循环级事件，零任务键
    expect(startupEvt).toEqual({
      sourceSlug: 'feat-x',
      verb: 'startup',
      status: 'running',
      scenario: 'startup/from-scratch',
      at: expect.any(Number),
    })
    // 领取点：动词 claim + running + 任务键 + 任务标题 + 计数快照 + 场景码 + 时间戳界内
    expect(claimEvt).toEqual({
      sourceSlug: 'feat-x',
      verb: 'claim',
      status: 'running',
      scenario: 'claim/new',
      taskKey: 'feat-x/2.5',
      taskTitle: 'Implement the thing',
      counts: { pending: 0, running: 1, done: 0 },
      at: expect.any(Number),
    })
    expect(claimEvt!.at).toBeGreaterThanOrEqual(before)
    // 池级 pending 快照（1.16 用户裁决②——claim 后随发，无任务键，counts 承载待执行）
    expect(built.progressCalls[2]).toEqual({
      sourceSlug: 'feat-x',
      verb: 'loop',
      status: 'running',
      scenario: 'pool/pending',
      counts: { pending: 0, running: 1, done: 0 },
      at: expect.any(Number),
    })
    // 领取确认点（bug 3bd8b829——spawn 成功回填后补发，载荷带 workerSessionId 直跳锚）
    expect(spawnedEvt).toEqual({
      sourceSlug: 'feat-x',
      verb: 'claim',
      status: 'running',
      scenario: 'claim/spawned',
      taskKey: 'feat-x/2.5',
      taskTitle: 'Implement the thing',
      workerSessionId: 'worker-1',
      at: expect.any(Number),
    })
    // 结算点：动词 settle + completed + 任务键 + 任务标题 + worker 会话 id + ⑥ task/complete 场景码
    expect(settleEvt).toEqual({
      sourceSlug: 'feat-x',
      verb: 'settle',
      status: 'completed',
      scenario: 'task/complete',
      taskKey: 'feat-x/2.5',
      taskTitle: 'Implement the thing',
      workerSessionId: 'worker-1',
      at: expect.any(Number),
    })
    // ⑯ 结束（全部完成）——循环级进度事件（1.5）
    expect(built.progressCalls.find((e) => e.verb === 'finish-all')).toMatchObject({ verb: 'finish-all', status: 'completed', scenario: 'loop/finish-all' })
    // 纯 JSON（Session.append 契约——序列化往返无损）
    expect(JSON.parse(JSON.stringify(built.progressCalls))).toEqual(built.progressCalls)
  })

  it('bug 3bd8b829：spawn 成功后补发领取确认事件（claim/spawned——载荷含 taskKey/taskTitle/workerSessionId；claim 原事件时序语义不变）', async () => {
    const built = build({
      claim: [claimed(), NO_TASK],
      stats: [
        statsOf({ pending: 1 }), // 启动读
        statsOf({ in_progress: 1 }), // 领取通知读
        statsOf({ in_progress: 1 }), // 结算读
        statsOf({ completed: 1 }), // no-task 池读
        statsOf({ completed: 1 }), // ⑯ 收口读
      ],
    })
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSettled(built.driver)
    // 确认事件在 claim 原事件之后、结算事件之前（执行中窗口内面板即可取到跳转锚）
    const claimIdx = built.progressCalls.findIndex((e) => e.scenario === 'claim/new')
    const spawnedIdx = built.progressCalls.findIndex((e) => e.scenario === 'claim/spawned')
    const settleIdx = built.progressCalls.findIndex((e) => e.verb === 'settle')
    expect(claimIdx).toBeGreaterThanOrEqual(0)
    expect(spawnedIdx).toBeGreaterThan(claimIdx)
    expect(spawnedIdx).toBeLessThan(settleIdx)
    expect(built.progressCalls[spawnedIdx]).toMatchObject({
      verb: 'claim',
      status: 'running',
      scenario: 'claim/spawned',
      taskKey: 'feat-x/2.5',
      taskTitle: 'Implement the thing',
      workerSessionId: 'worker-1',
    })
  })

  it('adopt 恢复径：动词 claim-resume（⑤ 领取（恢复中断））', async () => {
    const built = build({
      claim: [claimed('2.5'), NO_TASK],
      stats: [
        statsOf({ pending: 1, interrupted: 1 }),
        statsOf({ pending: 0, interrupted: 0, in_progress: 1 }),
        statsOf({ pending: 0, in_progress: 1 }),
        statsOf({ completed: 1 }),
        statsOf({ completed: 1 }),
      ],
    })
    built.h.lists.interrupted = [card('feat-x', '2.5', { taskStatus: 'interrupted' })]
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSettled(built.driver)
    expect(built.progressCalls.find((e) => e.verb === 'claim-resume')).toMatchObject({ verb: 'claim-resume', status: 'running', taskKey: 'feat-x/2.5', scenario: 'claim/interrupted', taskTitle: 'Implement the thing' })
    expect(built.progressCalls.find((e) => e.verb === 'startup')).toMatchObject({ verb: 'startup', status: 'running', scenario: 'startup/resume-stopped', taskKey: 'feat-x/2.5', taskTitle: 'Task 2.5' })
  })

  it('停止真化：stop 面 in-flight → interrupted（状态迁移点——动词 stop + 中断任务键）', async () => {
    const built = build({ claim: [claimed()] })
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await vi.waitFor(
      () => {
        expect(built.driver.activeOf(OWNER)?.inFlight).toBeDefined()
      },
      { timeout: 2000, interval: 5 },
    )
    await built.driver.stop({ ownerSessionId: OWNER })
    expect(built.progressCalls.filter((e) => e.verb === 'stop')).toEqual([
      { sourceSlug: 'feat-x', verb: 'stop', status: 'interrupted', scenario: 'loop/stopped', taskKey: 'feat-x/2.5', taskTitle: 'Implement the thing', at: expect.any(Number) },
    ])
  })

  it('blocked 无 follow-up 处置径：wait-external 决策 → settle·blocked（状态迁移点）', async () => {
    const built = build({
      claim: [claimed(), NO_TASK],
      query: [queryOf('blocked')],
      triage: async () => ({ action: 'wait-external', externalSlug: 'feat-y' }),
      stats: [
        statsOf({ pending: 1 }),
        statsOf({ in_progress: 1 }),
        statsOf({ blocked: 1 }),
        statsOf({ blocked: 1 }),
        statsOf({ blocked: 1 }),
      ],
    })
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSuspended(built.driver) // 3b：wait-external 续领后池 blocked → deadlock 挂起
    expect(built.progressCalls.find((e) => e.verb === 'settle')).toMatchObject({ verb: 'settle', status: 'blocked', taskKey: 'feat-x/2.5', scenario: 'blocked/wait-external', note: '等待 feat-y 先完成' })
    await built.driver.stop({ ownerSessionId: OWNER })
  })

  it('面缺席 = 零发射 fail-soft（可选依赖——叙述四连零回归）', async () => {
    const h = tasksHarness()
    h.setClaim([claimed(), NO_TASK])
    h.setStats([statsOf({ pending: 1 }), statsOf({ in_progress: 1 }), statsOf({ in_progress: 1 }), statsOf({ completed: 1 }), statsOf({ completed: 1 })])
    const channel: NarrationChannel = { send: async () => {} }
    const driver = createLoopDriver({
      projectId: PROJECT,
      tasks: h.tasks,
      spawn: trackedSpawn().spawn,
      narrator: createNarrator({ channel }),
      delays: { backoffBaseMs: 1, patiencePauseMs: 1, quiescenceWindowMs: 1, quiescencePollMs: 1 },
      // progress 缺席——零发射不外溢
    })
    await driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSettled(driver)
    expect(driver.activeOf(OWNER)).toBeUndefined()
  })
})

// ─────────────────────────── 改进 6 · triage 错误处理信息闭环 ───────────────────────────

describe('改进 6 triage 错误处理信息闭环（回灌/分流/缓存重放/链深余量/slug 校验/升级载荷）', () => {
  function blockedScript(built: Built): void {
    built.h.lists.created = [] // blocked 无 follow-up——处置阶梯径
  }

  function queryOfBlocked(): QueryTaskResult {
    return {
      task: snapshot({ taskStatus: 'blocked' }),
      container: { kind: 'feature', slug: 'feat-x', title: 'feat-x' },
      records: [
        { verb: 'submit', toStatus: 'blocked', reason: 'tests hang on flaky selector', files: ['packages/x/src/changed.ts'], actor: 'plugin-tool', createdAt: '2026-10-11T01:00:00.000Z' },
      ],
    }
  }

  const BASE_STATS = [
    statsOf({ pending: 1 }),
    statsOf({ in_progress: 1, blocked: 1 }),
    statsOf({ in_progress: 1, blocked: 1 }),
  ]

  it('①失败回灌 + ⑥挂起载荷：无效输出 ×2 后 ask-user——重试输入携 rawSummary，处置历史行含各次输出摘要（3b 挂起）', async () => {
    const inputs: LoopTriageInput[] = []
    const built = build({
      claim: [claimed('2.5'), claimed('should-not-claim')],
      stats: BASE_STATS,
      query: [queryOfBlocked()],
      triage: async (input) => {
        inputs.push(input)
        if (inputs.length <= 2) throw new TriageDecisionInvalidError('输出不含 JSON 决策（封闭四动作契约）', 'RAW-MODEL-OUTPUT-SNIPPET')
        return { action: 'ask-user' }
      },
    })
    blockedScript(built)
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    const suspended = await untilSuspended(built.driver)
    // ① 回灌：第二次处置输入携上次失败摘要
    expect(inputs[0]?.lastFailure).toBeUndefined()
    expect(inputs[1]?.lastFailure).toContain('RAW-MODEL-OUTPUT-SNIPPET')
    // ⑥ 挂起载荷 history 行含各次原始输出摘要
    const history = (suspended.escalation as { kind: string; history: readonly string[] }).history
    expect(suspended.escalation.kind).toBe('blocked-ask-user')
    expect(history[0]).toContain('RAW-MODEL-OUTPUT-SNIPPET')
    expect(history[1]).toContain('RAW-MODEL-OUTPUT-SNIPPET')
    expect(history[2]).toContain('决定请求人工裁决')
    expect(built.h.claimInputs).toHaveLength(1)
    await built.driver.stop({ ownerSessionId: OWNER })
  })

  it('②错误类别分流（纯函数）：TriageDecisionInvalidError 判无效；摘要取 rawSummary 优先', () => {
    const invalid = new TriageDecisionInvalidError('决策 JSON 解析失败', 'raw-snippet')
    expect(isTriageInvalidOutput(invalid)).toBe(true)
    expect(isTriageInvalidOutput(new Error('spawn boom'))).toBe(false)
    expect(triageFailureSummary(invalid)).toBe('raw-snippet')
    expect(triageFailureSummary(new Error('spawn boom'))).toBe('spawn boom')
    expect(triageFailureSummary('flat')).toBe('flat')
  })

  it('②模型输出无效 → 立即重试（大退避基长下三连无效快速封顶升级——零 backoff 等待的机械证据）', async () => {
    const built = build({
      claim: [claimed('2.5'), claimed('should-not-claim')],
      stats: BASE_STATS,
      query: [queryOfBlocked()],
      triage: () => Promise.reject(new TriageDecisionInvalidError('输出不含 JSON 决策', 'bad output')),
      backoffBaseMs: 60_000, // 无效径若误走 backoff，本用例将超时——绿 = 立即重试
    })
    blockedScript(built)
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    const suspended = await untilSuspended(built.driver)
    expect(suspended.escalation).toMatchObject({ kind: 'disposition-over-limit', attempts: LOOP_TRIAGE_MAX_ATTEMPTS })
    await built.driver.stop({ ownerSessionId: OWNER })
  })

  it('②基建故障 → spawn 同款 backoff 退避（base×N 间隔——耗时 ≥ 退避序列和的机械证据）', async () => {
    const built = build({
      claim: [claimed('2.5'), claimed('should-not-claim')],
      stats: BASE_STATS,
      query: [queryOfBlocked()],
      triage: () => Promise.reject(new Error('subagent factory rejected')),
      backoffBaseMs: 60,
    })
    blockedScript(built)
    const startedAt = Date.now()
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSuspended(built.driver)
    const elapsed = Date.now() - startedAt
    expect(elapsed).toBeGreaterThanOrEqual(backoffDelayMs(60, 1) + backoffDelayMs(60, 2) + backoffDelayMs(60, 3) - 10)
    await built.driver.stop({ ownerSessionId: OWNER })
  })

  it('③决策缓存重放：add-fix 落库失败首次保缓存——再遇 blocked 重放执行（triage 零二调）不重跑分析', async () => {
    let triageCalls = 0
    let addTaskCalls = 0
    const built = build({
      claim: [claimed('2.5'), claimed('2.5'), NO_TASK],
      stats: [
        statsOf({ pending: 1 }),
        statsOf({ in_progress: 1, blocked: 1 }),
        statsOf({ in_progress: 1, blocked: 1 }),
        statsOf({ pending: 1, blocked: 1 }),
        statsOf({ pending: 1, blocked: 1 }),
        statsOf({ pending: 1, blocked: 1 }),
        statsOf({ pending: 1, blocked: 1 }),
      ],
      query: [queryOfBlocked()],
      triage: async () => {
        triageCalls += 1
        return { action: 'add-fix', title: 'Fix: flaky selector', note: '修选择器等待' }
      },
    })
    blockedScript(built)
    built.h.tasks.addTask = async (input: AddTaskInput) => {
      addTaskCalls += 1
      if (addTaskCalls === 1) throw new Error('db busy') // 首次落库失败——缓存保留
      return { taskId: 'fix-uuid', slug: input.source.slug, localId: 'fix-2', reused: false }
    }
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSettled(built.driver)
    // 分析恰好一次；执行两次（首败 + 重放成功）
    expect(triageCalls).toBe(1)
    expect(addTaskCalls).toBe(2)
    expect(built.calls.some((c) => c.text.includes('已自动分析原因并创建修复任务 fix-2'))).toBe(false)
    expect(built.escalations).toEqual([])
  })

  it('③重放再败有界收口：缓存清账 + 挂起待裁决（防无限重放同失败径，3b）', async () => {
    let triageCalls = 0
    const built = build({
      claim: [claimed('2.5'), claimed('2.5')],
      stats: BASE_STATS,
      query: [queryOfBlocked()],
      triage: async () => {
        triageCalls += 1
        return { action: 'add-fix', title: 'Fix: flaky selector', note: '修选择器等待' }
      },
    })
    blockedScript(built)
    built.h.tasks.addTask = async () => {
      throw new Error('db busy')
    }
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    const suspended = await untilSuspended(built.driver)
    expect(triageCalls).toBe(1)
    expect(suspended.escalation).toEqual({
      kind: 'blocked-ask-user',
      ownerSessionId: OWNER,
      source: SOURCE,
      task: expect.objectContaining({ localId: '2.5' }),
      reason: 'tests hang on flaky selector',
      history: [
        '第1次处置——决定创建修复任务（修选择器等待）',
        '重放已缓存处置决策（不重跑分析）——执行',
        '重放执行再次失败——缓存清账，交人工裁决',
      ],
    })
    await built.driver.stop({ ownerSessionId: OWNER })
  })

  it('④链深余量入参：triage 输入携带 depth/limit/remaining（沿 sourceTask 链上溯现算）', async () => {
    let captured: LoopTriageInput | undefined
    const built = build({
      claim: [claimed('2.5'), NO_TASK],
      stats: [statsOf({ pending: 1 }), statsOf({ in_progress: 1, blocked: 1 }), statsOf({ in_progress: 1, blocked: 1 }), statsOf({ pending: 0, blocked: 1 }), statsOf({ pending: 0, blocked: 1 })],
      query: [queryOfBlocked()],
      triage: async (input) => {
        captured = input
        return { action: 'wait-external', externalSlug: 'feat-y' }
      },
    })
    built.h.lists.created = [
      card('feat-x', '2.5', { sourceTask: { slug: 'feat-x', localId: '2.4' } }),
      card('feat-x', '2.4'),
    ]
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSuspended(built.driver) // 3b：wait-external 续领后池 blocked → deadlock 挂起
    expect(captured?.fixChain).toEqual({ depth: 2, limit: 6, remaining: 4 })
    await built.driver.stop({ ownerSessionId: OWNER })
  })

  it('④余量不足拒 add-fix：宿主前置校验计失败并回灌——不产 add-fix 执行（改选 ask-user 收口）', async () => {
    const inputs: LoopTriageInput[] = []
    const built = build({
      claim: [claimed('2.5'), claimed('should-not-claim')],
      stats: BASE_STATS,
      query: [queryOfBlocked()],
      triage: async (input) => {
        inputs.push(input)
        if (inputs.length === 1) return { action: 'add-fix', title: 'Fix: flaky selector' }
        return { action: 'ask-user' }
      },
    })
    // 六节点链（2.5→fix-1→…→fix-5）：remaining = 0——add-fix 结构性被拒
    built.h.lists.created = [
      card('feat-x', '2.5', { sourceTask: { slug: 'feat-x', localId: 'fix-1' } }),
      card('feat-x', 'fix-1', { sourceTask: { slug: 'feat-x', localId: 'fix-2' } }),
      card('feat-x', 'fix-2', { sourceTask: { slug: 'feat-x', localId: 'fix-3' } }),
      card('feat-x', 'fix-3', { sourceTask: { slug: 'feat-x', localId: 'fix-4' } }),
      card('feat-x', 'fix-4', { sourceTask: { slug: 'feat-x', localId: 'fix-5' } }),
      card('feat-x', 'fix-5'),
    ]
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    const suspended = await untilSuspended(built.driver)
    expect(inputs[0]?.fixChain).toEqual({ depth: 6, limit: 6, remaining: 0 })
    expect(inputs[1]?.lastFailure).toContain('余量不足')
    expect(built.h.addTaskInputs).toEqual([]) // add-fix 未被执行（宿主拒绝）
    expect(suspended.escalation.kind).toBe('blocked-ask-user')
    expect((suspended.escalation as { history: readonly string[] }).history[0]).toContain('余量不足')
    await built.driver.stop({ ownerSessionId: OWNER })
  })

  it('⑤externalSlug 存在性校验：编造 slug 计处置失败并回灌（有效 slug 照常执行）', async () => {
    const inputs: LoopTriageInput[] = []
    const built = build({
      claim: [claimed('2.5'), claimed('should-not-claim')],
      stats: BASE_STATS,
      query: [queryOfBlocked()],
      triage: async (input) => {
        inputs.push(input)
        if (inputs.length === 1) return { action: 'wait-external', externalSlug: 'ghost-slug' }
        return { action: 'wait-external', externalSlug: 'feat-real' }
      },
      knownContainers: async () => ['feat-x', 'feat-real', 'prop-b'],
    })
    blockedScript(built)
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSuspended(built.driver) // 3b：wait-external 有效续领后池 blocked → deadlock 挂起
    expect(inputs[1]?.lastFailure).toContain('ghost-slug')
    // 编造 slug 零执行；有效 slug 照常执行——两径均静默（R-Q4），进度事件投影
    expect(built.calls.some((c) => c.text.includes('等待 ghost-slug 先完成'))).toBe(false)
    expect(built.calls.some((c) => c.text.includes('等待 feat-real 先完成'))).toBe(false)
    expect(built.progressCalls.find((e) => e.verb === 'settle' && e.status === 'blocked')).toMatchObject({ scenario: 'blocked/wait-external', note: '等待 feat-real 先完成' })
    await built.driver.stop({ ownerSessionId: OWNER })
  })
})

// ─────────────────────────── 3b · 升级点挂起与 re-entry 回落（dispatch-loop-hardening 1.8） ───────────────────────────

describe('3b 挂起改造（suspendForVerdict 写 record.suspended + resume 清挂起回落续跑）', () => {
  it('升级点挂起：suspended 在场（升级事件全文 + since）、登记/独占保留、runLoop 停驻零续领；resume 清 suspended 从留存点续跑到 settled 收口', async () => {
    const built = build({
      claim: [claimed('2.5'), claimed('2.6'), NO_TASK],
      stats: [statsOf({ pending: 2 }), statsOf({ in_progress: 1 }), statsOf({ in_progress: 1 }), statsOf({ completed: 2 }), statsOf({ completed: 2 })],
      query: [queryOfBlockedNoProgress(), queryOf('completed')],
    })
    const started = await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    const loopId = started.ok ? started.loopId : ''
    const suspended = await untilSuspended(built.driver)
    // 写点①：挂起即投影挂起——升级事件全文 + 挂起时刻
    expect(suspended.escalation).toMatchObject({ kind: 'blocked-ask-user', reason: 'needs human verdict' })
    expect(suspended.since).toEqual(expect.any(Number))
    expect(built.driver.activeOf(OWNER)).toBeDefined() // 登记保留（挂起 ≠ 终局）
    expect(exclusiveLoopSourceOf(SOURCE)).toEqual({ loopId }) // S1c 独占保留
    expect(built.h.claimInputs).toHaveLength(1) // runLoop 停驻——零续领
    // re-entry（写点②）：清 suspended 回落 active，从留存点续跑
    expect(built.driver.resume({ loopId })).toEqual({ ok: true, loopId })
    expect(built.driver.activeOf(OWNER)?.suspended).toBeUndefined()
    await untilSettled(built.driver)
    expect(built.driver.activeOf(OWNER)).toBeUndefined() // 续跑后 settled 终局注销
    expect(built.h.claimInputs).toHaveLength(3) // 2.5（挂起前）→ 2.6 → no-task
    // 完成零消息（⑥ 退出消息面）——进度事件投影 + 结算单点收口（2.5 无进展 blocked 挂起，仅 2.6 完成）
    expect(built.progressCalls.filter((e) => e.verb === 'settle' && e.status === 'completed')).toHaveLength(1)
    expect(built.calls.at(-1)?.text).toContain('[forge·结束]')
  })

  it('resume 错误径：无活登记 = no-active-loop；未挂起（在飞运行中）= not-suspended；挂起态 stop 走终局径收口，resume 随后 no-active-loop', async () => {
    // 未挂起（在飞运行中）→ not-suspended
    const running = build({ claim: [claimed()] })
    running.spawn.setBehavior(parkedSpawn)
    const started = await running.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    const loopId = started.ok ? started.loopId : ''
    await vi.waitFor(
      () => {
        expect(running.driver.activeOf(OWNER)?.inFlight).toBeDefined()
      },
      { timeout: 2000, interval: 5 },
    )
    expect(running.driver.resume({ loopId })).toEqual({ ok: false, code: 'not-suspended' })
    // 无活登记 → no-active-loop
    expect(running.driver.resume({ loopId: 'ghost-loop' })).toEqual({ ok: false, code: 'no-active-loop' })
    await running.driver.stop({ ownerSessionId: OWNER })
    // 挂起态 stop：终局径收口（登记注销）→ resume no-active-loop
    const built = build({
      claim: [claimed('2.5')],
      stats: [statsOf({ pending: 1 }), statsOf({ in_progress: 1, blocked: 1 })],
      query: [queryOfBlockedNoProgress()],
    })
    const started2 = await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    const loopId2 = started2.ok ? started2.loopId : ''
    await untilSuspended(built.driver)
    expect(await built.driver.stop({ ownerSessionId: OWNER })).toEqual({ ok: true, stopped: true, hadInFlight: false })
    expect(built.driver.resume({ loopId: loopId2 })).toEqual({ ok: false, code: 'no-active-loop' })
  })

  it('resume 前置判 aborted（R2-minor⑤）：terminateRecord 异步窗口内 resume 拒绝（非误导性 ok:true）', async () => {
    const built = build({
      claim: [claimed('2.5')],
      stats: [statsOf({ pending: 1 }), statsOf({ in_progress: 1, blocked: 1 })],
      query: [queryOfBlockedNoProgress()],
    })
    const started = await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    const loopId = started.ok ? started.loopId : ''
    await untilSuspended(built.driver)
    // 不 await stop——terminateRecord 异步窗口：控制器已同步 abort、登记表尚未注销
    const stopping = built.driver.stop({ ownerSessionId: OWNER })
    expect(built.driver.resume({ loopId })).toEqual({ ok: false, code: 'aborted' })
    expect(await stopping).toEqual({ ok: true, stopped: true, hadInFlight: false })
    // 窗口闭合（登记注销）→ 常规 no-active-loop
    expect(built.driver.resume({ loopId })).toEqual({ ok: false, code: 'no-active-loop' })
  })
})

// ─────────────────────────── 1.18 · 落点核验失败强制处置（错分支提交不静默接受，bug d8029b20） ───────────────────────────

describe('落点核验失败强制处置（settle-cwd-pin——任务真化 interrupted + settle-landing-rejected 挂起）', () => {
  it('错分支提交闭环：核验失败 → 任务 completed→interrupted 真化 + 挂起升级；不走 worker-abort 阶梯、零续领、不 finished-all', async () => {
    const badLanding: CommitLandingVerifier = async () => ({ ok: false, branch: 'feat-x', commitBranches: ['main'] })
    const built = build({
      claim: [claimed('2.5'), claimed('should-not-claim')],
      stats: [statsOf({ pending: 1 }), statsOf({ in_progress: 1 }), statsOf({ interrupted: 1 })],
      query: [queryOf('completed')],
      commitLanding: badLanding,
    })
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {}, worktree: 'Z:\\wt' })
    const suspended = await untilSuspended(built.driver)
    // 显式处置②：挂起升级（settle-landing-rejected——非 worker-abort-over-limit）
    expect(suspended.escalation).toMatchObject({ kind: 'settle-landing-rejected', taskKey: 'feat-x/2.5' })
    expect(suspended.escalation.kind === 'settle-landing-rejected' && suspended.escalation.reason).toContain('[settle-cwd-pin]')
    // 显式处置①：任务从 completed 真化 interrupted（可恢复态——非 completed 挂死）
    expect(built.h.transitions).toEqual([
      { projectId: PROJECT, taskId: 't-1', toStatus: 'interrupted', reason: expect.stringContaining('[settle-cwd-pin]'), actor: 'core' },
    ])
    // 不走失败阶梯：零续领（worker-abort 径会立即重入 claim）、循环不终局（登记保留）
    expect(built.h.claimInputs).toHaveLength(1)
    expect(built.driver.activeOf(OWNER)).toBeDefined()
    await built.driver.stop({ ownerSessionId: OWNER })
  })
})

// ─────────────────────────── 3b③ 会话单活门控 + stopTaskLoop 定向停止 ───────────────────────────

describe('start 会话级单活门控（3b——用户裁决 2026-10-17：一会话一循环，含挂起中）', () => {
  /** 预置登记行（门控读数源——不经真实 runLoop） */
  function loopRecordOf(owner: string, over: Partial<LoopRecord> = {}): LoopRecord {
    return {
      id: 'loop-pre',
      source: { kind: 'feature', slug: 'feat-x' },
      ownerSessionId: owner,
      projectId: PROJECT,
      takeoverSessions: new Set<string>(),
      ...over,
    }
  }

  /** 预置登记表的驱动器（deps.registry 注入缝——门控读数源，不经真实 runLoop） */
  function driverWithRegistry(record: LoopRecord): { driver: LoopDriver; registry: ReturnType<typeof createLoopRegistry> } {
    const registry = createLoopRegistry()
    registry.register(record)
    const h = tasksHarness()
    const calls: NarrationCall[] = []
    const narrator: Narrator = createNarrator({
      channel: sendRecordingChannel(calls),
    })
    const driver = createLoopDriver({
      projectId: PROJECT,
      tasks: h.tasks,
      spawn: parkedSpawn as unknown as SpawnWorker,
      narrator,
      registry,
      delays: { backoffBaseMs: 1, patiencePauseMs: 1 },
    })
    return { driver, registry }
  }

  it('owner 已有活循环（他源）→ owner-active 拒绝：归属 + suspended=false + 人话/指引随行；登记未增', async () => {
    const { driver, registry } = driverWithRegistry(loopRecordOf(OWNER))
    const result = await driver.start({ source: { kind: 'feature', slug: 'feat-y' }, ownerSessionId: OWNER, parent: {} })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('owner-active')
      expect(result.activeSource).toEqual({ kind: 'feature', slug: 'feat-x' })
      expect(result.suspended).toBe(false)
      expect(result.message).toContain('one loop per session')
      expect(result.guidance.some((g) => g.includes('stopTaskLoop'))).toBe(true)
    }
    expect(registry.all()).toHaveLength(1)
  })

  it('挂起中的活循环同占会话名额：owner-active 且 suspended=true', async () => {
    const { driver } = driverWithRegistry(
      loopRecordOf(OWNER, {
        suspended: {
          escalation: { kind: 'deadlock', ownerSessionId: OWNER, source: { kind: 'feature', slug: 'feat-x' }, blockedItems: [] },
          since: 0,
        },
      }),
    )
    const result = await driver.start({ source: { kind: 'feature', slug: 'feat-y' }, ownerSessionId: OWNER, parent: {} })
    expect(result.ok).toBe(false)
    expect(result.ok ? undefined : result.suspended).toBe(true)
  })

  it('他源他会话并行不受限：owner 无活循环时正常启动（既有语义零回归）', async () => {
    const { driver } = driverWithRegistry(loopRecordOf('someone-else'))
    const result = await driver.start({ source: { kind: 'feature', slug: 'feat-y' }, ownerSessionId: OWNER, parent: {} })
    expect(result.ok).toBe(true)
  })
})

describe('stopLoop 定向停止（3b stopTaskLoop 消费面——双入口同 registry 判活 + 作用域裁决）', () => {
  it('无活循环 → no-active-loop（ownerSessionId 空形）', async () => {
    const built = build()
    expect(await built.driver.stopLoop({ loopId: 'ghost', requesterSessionId: 'x' })).toEqual({
      ok: false,
      code: 'no-active-loop',
      suspended: false,
      ownerSessionId: '',
    })
  })

  it('运行中：owner 可停（统一结束处理同径——真化 interrupted + ⑰ 收口叙述 + 终态注销）；非 owner 被拒', async () => {
    const built = build({ claim: [claimed()] })
    built.spawn.setBehavior(parkedSpawn)
    const started = await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    const loopId = started.ok ? started.loopId : ''
    await vi.waitFor(
      () => {
        expect(built.driver.activeOf(OWNER)?.inFlight).toBeDefined()
      },
      { timeout: 2000, interval: 5 },
    )
    // 非 owner → forbidden（owner 随行——自解释文案数据源）
    const denied = await built.driver.stopLoop({ loopId, requesterSessionId: 'other-session' })
    expect(denied).toEqual({ ok: false, code: 'forbidden', suspended: false, ownerSessionId: OWNER })
    // owner → 统一结束处理（stop() 同径单源）
    const stopped = await built.driver.stopLoop({ loopId, requesterSessionId: OWNER })
    expect(stopped).toEqual({ ok: true, stopped: true, hadInFlight: true })
    expect(built.driver.activeOf(OWNER)).toBeUndefined()
    expect(built.h.transitions.some((t) => t.toStatus === 'interrupted')).toBe(true)
    expect(built.calls.some((c) => c.method === 'settle' && c.text.includes('[forge·停止] 任务源: feat-x — 已按你的指令停止'))).toBe(true)
    expect(exclusiveLoopSourceOf(SOURCE)).toBeUndefined()
  })

  it('挂起态任意会话可停：非 owner 触达挂起循环 → 统一结束处理收口', async () => {
    /** 无进展 blocked 的结算记录（零 commit hash 零 files——硬停门直达挂起） */
    const queryBlockedNoProgress = (): QueryTaskResult => ({
      task: snapshot({ taskStatus: 'blocked' }),
      container: { kind: 'feature', slug: 'feat-x', title: 'feat-x' },
      records: [
        { verb: 'submit', toStatus: 'blocked', reason: 'needs human verdict', actor: 'plugin-tool', createdAt: '2026-10-11T01:00:00.000Z' },
      ],
    })
    const built = build({
      claim: [claimed('2.5')],
      stats: [statsOf({ pending: 1 }), statsOf({ in_progress: 1, blocked: 1 })],
      query: [queryBlockedNoProgress()],
    })
    const started = await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    const loopId = started.ok ? started.loopId : ''
    await untilSuspended(built.driver)
    const stopped = await built.driver.stopLoop({ loopId, requesterSessionId: 'takeover-session' })
    expect(stopped).toEqual({ ok: true, stopped: true, hadInFlight: false })
    expect(built.driver.activeOf(OWNER)).toBeUndefined()
    expect(exclusiveLoopSourceOf(SOURCE)).toBeUndefined()
  })
})

// ─────────────────────────── 3c · 续派静默窗（宽限窗）与终止条件全集（dispatch-loop-hardening 1.12） ───────────────────────────

describe('3c wait-for-quiescence 宽限窗（done 判词收口前——编排层新派任务窗内自动续派）', () => {
  it('宽限窗内编排层新派任务（pending 出现）→ 不收口，自动续派领取并完成新任务后才 settled 收口', async () => {
    const built = build({
      claim: [claimed(), NO_TASK, claimed('2.6'), NO_TASK],
      stats: [
        statsOf({ pending: 1 }), // 启动读
        statsOf({ in_progress: 1 }), // 领取通知读（2.5）
        statsOf({ in_progress: 1 }), // 结算读（2.5）
        statsOf({ completed: 1 }), // no-task 池读（done 判词）
        statsOf({ completed: 1 }), // 静默窗 poll #1（窗初——无新任务）
        statsOf({ pending: 1 }), // 静默窗 poll #2（编排层新派任务在窗内出现）
        statsOf({ in_progress: 1 }), // 领取通知读（2.6）
        statsOf({ in_progress: 1 }), // 结算读（2.6）
        statsOf({ completed: 2 }), // 次轮 no-task 池读（done 判词）
        statsOf({ completed: 2 }), // 次轮静默窗 poll（窗内无新任务）
        statsOf({ completed: 2 }), // ⑯ 收口读
      ],
    })
    const started = await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    expect(started).toEqual({ ok: true, loopId: expect.any(String) })
    await untilSettled(built.driver)
    // 四次领取：2.5 → no-task（宽限窗续派判定）→ 2.6 → no-task（窗内无新任务 → 收口）
    expect(built.h.claimInputs).toHaveLength(4)
    // 新任务被自动续派领取并完成（完成零消息——进度事件投影）
    expect(built.progressCalls.filter((e) => e.verb === 'settle' && e.status === 'completed')).toHaveLength(2)
    // 收口叙述恰好一次，且发生在新任务完成之后（settle 在 calls 尾部）
    const ends = built.calls.filter((c) => c.text.includes('[forge·结束]'))
    expect(ends).toHaveLength(1)
    expect(built.calls.at(-1)?.text).toContain('[forge·结束]')
  })

  it('宽限窗内无新任务 → 窗满照常 ⑯ 收口（现状保持——claim 不多领）', async () => {
    const built = build({
      claim: [claimed(), NO_TASK],
      stats: [
        statsOf({ pending: 1 }), // 启动读
        statsOf({ in_progress: 1 }), // 领取通知读
        statsOf({ in_progress: 1 }), // 结算读
        statsOf({ completed: 1 }), // no-task 池读（done 判词）
        statsOf({ completed: 1 }), // 静默窗 poll（窗内无新任务）
        statsOf({ completed: 1 }), // ⑯ 收口读
      ],
    })
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSettled(built.driver)
    expect(built.h.claimInputs).toHaveLength(2) // 2.5 + no-task（窗内零新领）
    expect(built.calls.filter((c) => c.text.includes('[forge·结束]'))).toHaveLength(1)
  })

  it('宽限窗内循环被叫停（用户终止窗径）→ 终局收口、零结束叙述（叙述归停止径）', async () => {
    const built = build({
      claim: [claimed(), NO_TASK],
      stats: [
        statsOf({ pending: 1 }),
        statsOf({ in_progress: 1 }),
        statsOf({ in_progress: 1 }),
        statsOf({ completed: 1 }), // no-task 池读（done 判词）→ 入宽限窗
        statsOf({ completed: 1 }), // 窗内 poll（大窗驻留，等待被 stop 打断）
      ],
      quiescenceWindowMs: 5_000,
    })
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    // 等待循环进入宽限窗（no-task 池读已完成 = 窗 poll 即将开始）
    await vi.waitFor(
      () => {
        expect(built.h.statsInputs.length).toBeGreaterThanOrEqual(4)
      },
      { timeout: 2000, interval: 5 },
    )
    expect(await built.driver.stop({ ownerSessionId: OWNER })).toEqual({ ok: true, stopped: true, hadInFlight: false })
    expect(built.driver.activeOf(OWNER)).toBeUndefined()
    // 窗内叫停：零 ⑯ 结束叙述（收口叙述归停止径 ⑰）
    expect(built.calls.some((c) => c.text.includes('[forge·结束]'))).toBe(false)
    expect(built.calls.some((c) => c.text.includes('[forge·停止]'))).toBe(true)
  })
})

describe('3c 终止条件全集（no-task/用户终止/死锁/超时/最大轮次——各有触发路径）', () => {
  it('最大轮次：连续成功轮达上限 → ⑮ 结束叙述（达到最大轮次上限），不再续领', async () => {
    const built = build({
      claim: [claimed('2.5'), claimed('2.6'), claimed('2.7'), claimed('2.8'), claimed('2.9')],
      stats: [statsOf({ pending: 1 }), statsOf({ in_progress: 1 }), statsOf({ in_progress: 1 }), statsOf({ in_progress: 1 })],
      limits: { maxRounds: 3 },
    })
    const started = await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    expect(started).toEqual({ ok: true, loopId: expect.any(String) })
    await untilSettled(built.driver)
    expect(built.h.claimInputs).toHaveLength(3) // 恰好 maxRounds 轮——不多领
    const end = built.calls.at(-1)
    expect(end?.text).toContain('[forge·结束]')
    expect(end?.text).toContain('达到最大轮次上限')
  })

  it('最大轮次计数为生命周期总量（ActiveLoop——resume 续用不清零）：挂起耗尽末轮，resume 即 ⑮ 收口零续领', async () => {
    const built = build({
      claim: [claimed('2.5'), claimed('should-not-claim')],
      stats: [
        statsOf({ pending: 1 }), // 启动读
        statsOf({ in_progress: 1, blocked: 1 }), // 领取通知读
        statsOf({ in_progress: 1, blocked: 1 }), // 结算读
        statsOf({ blocked: 1 }), // resume 径 ⑮ 收口读
      ],
      query: [queryOfBlockedNoProgress()],
      limits: { maxRounds: 1 },
    })
    const started = await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    const loopId = started.ok ? started.loopId : ''
    await untilSuspended(built.driver) // 第 1 轮（rounds=1）blocked 无进展 → 挂起
    expect(built.h.claimInputs).toHaveLength(1)
    expect(built.driver.resume({ loopId })).toEqual({ ok: true, loopId })
    await untilSettled(built.driver)
    // rounds 保留（resume 不清零）→ 达上限 ⑮ 结束叙述收口，零续领
    expect(built.h.claimInputs).toHaveLength(1)
    expect(built.calls.at(-1)?.text).toContain('达到最大轮次上限')
  })
})

describe('3c 回归：循环生命周期归属会话无关（host registry 独立——现状保持）', () => {
  it('owner 会话失活后挂起循环照常存活登记，resume（会话无关入口）续接至 settled 收口', async () => {
    /** 无进展 blocked 的结算记录（零 commit hash 零 files——硬停门直达挂起） */
    const queryBlockedNoProgress = (): QueryTaskResult => ({
      task: snapshot({ taskStatus: 'blocked' }),
      container: { kind: 'feature', slug: 'feat-x', title: 'feat-x' },
      records: [{ verb: 'submit', toStatus: 'blocked', reason: 'needs human verdict', actor: 'plugin-tool', createdAt: '2026-10-11T01:00:00.000Z' }],
    })
    const built = build({
      claim: [claimed('2.5'), claimed('2.6'), NO_TASK],
      stats: [statsOf({ pending: 2 }), statsOf({ in_progress: 1 }), statsOf({ in_progress: 1 }), statsOf({ completed: 2 })],
      query: [queryBlockedNoProgress(), queryOf('completed')],
    })
    const started = await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    const loopId = started.ok ? started.loopId : ''
    await untilSuspended(built.driver)
    // 会话关闭模拟（进程内无会话生命周期事件——登记与循环体不感知会话存续）：
    // 登记仍带原 owner 归属，resume 入口不携会话参数即可续接
    const record = built.driver.activeAll().find((r) => r.id === loopId)
    expect(record?.ownerSessionId).toBe(OWNER)
    expect(record?.suspended).toBeDefined()
    expect(built.driver.resume({ loopId })).toEqual({ ok: true, loopId })
    await untilSettled(built.driver)
    expect(built.driver.activeOf(OWNER)).toBeUndefined()
    expect(built.calls.at(-1)?.text).toContain('[forge·结束]')
  })
})

describe('cwd 钉定（1.14 判例修复——worker 会话未钉定 worktree、提交落 main）', () => {
  const PIN = 'Z:\\project\\dsh\\dsh-forge\\.forge\\worktrees\\feat-x'

  /** 无 commitHash 的 completed 结算读（落点核验无核销对象——收口不触 git） */
  const queryCompletedNoCommit = (): QueryTaskResult => ({
    task: snapshot({ taskStatus: 'completed' }),
    container: { kind: 'feature', slug: 'feat-x', title: 'feat-x' },
    records: [{ verb: 'submit', toStatus: 'completed', summary: 'did the thing', actor: 'plugin-tool', createdAt: '2026-10-11T01:00:00.000Z' }],
  })

  it('start 携带 worktree：LoopRecord.worktree 登记 + spawn 请求携带 workspaceCwd（钉定 = 发起循环的检出）', async () => {
    const built = build({
      claim: [claimed(), NO_TASK],
      stats: [statsOf({ pending: 1 }), statsOf({ in_progress: 1 }), statsOf({ in_progress: 1 }), statsOf({ completed: 1 }), statsOf({ completed: 1 })],
      query: [queryCompletedNoCommit()],
    })
    const start = await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: { tag: 'parent' }, worktree: PIN })
    expect(start).toEqual({ ok: true, loopId: expect.any(String) })
    await untilSettled(built.driver)
    expect(built.spawn.requests).toHaveLength(1)
    expect(built.spawn.requests[0]).toMatchObject({ workspaceCwd: PIN })
  })

  it('worktree 缺席：登记/spawn 请求均不携带键（行为零变化）', async () => {
    const built = build({
      claim: [claimed(), NO_TASK],
      stats: [statsOf({ pending: 1 }), statsOf({ in_progress: 1 }), statsOf({ in_progress: 1 }), statsOf({ completed: 1 }), statsOf({ completed: 1 })],
      query: [queryCompletedNoCommit()],
    })
    const start = await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    expect(start).toEqual({ ok: true, loopId: expect.any(String) })
    await untilSettled(built.driver)
    expect(built.spawn.requests[0]).toMatchObject({ label: 'feat-x/2.5 · Implement the thing' })
    expect('workspaceCwd' in built.spawn.requests[0]!).toBe(false)
  })
})

// ─────────────────────────── pauseTask 原语（task-pause-primitive 1.7） ───────────────────────────

describe('pauseTask 原语（task-pause-primitive）：pause 全链 / 归属守卫三径 / resume 批量恢复', () => {
  /** 等待在飞登记（pause 调用前置——串行循环 in-flight 恒 ≤1） */
  async function untilInFlight(driver: LoopDriver): Promise<void> {
    await vi.waitFor(
      () => {
        expect(driver.activeOf(OWNER)?.inFlight).toBeDefined()
      },
      { timeout: 2000, interval: 5 },
    )
  }

  /** 可中断 spawn 桩：kill 信号 abort 即 reject handle.result（模拟 worker 硬中断 → 结算 killed） */
  function abortableSpawnBehavior(s: ReturnType<typeof trackedSpawn>): void {
    s.setBehavior(async () => {
      const req = s.requests[s.requests.length - 1]!
      return {
        workerSessionId: 'worker-pause',
        result: new Promise<{ stopReason: string; output: string }>((_, reject) => {
          req.signal.addEventListener('abort', () => reject(new Error('worker aborted by pause')), { once: true })
        }),
        dispose: async () => {},
      }
    })
  }

  const PAUSE_REASON = '规格被裁决取代，需改写简报重派'

  it('TRIAGE_FIX_CHAIN_DEPTH_LIMIT 消费 contracts 单源（= FIX_CHAIN_DEPTH_LIMIT，对齐 core addTask）', () => {
    expect(TRIAGE_FIX_CHAIN_DEPTH_LIMIT).toBe(FIX_CHAIN_DEPTH_LIMIT)
    expect(FIX_CHAIN_DEPTH_LIMIT).toBe(6)
  })

  it('pause 全链：先摘 inFlight 再 abort、任务真化 suspended（reason 必带 + core actor）、循环挂起保留登记', async () => {
    const built = build({
      claim: [claimed()],
      stats: [statsOf({ pending: 1 }), statsOf({ in_progress: 1 }), statsOf({ in_progress: 1 })],
      spawnBehavior: abortableSpawnBehavior,
    })
    const started = await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    const loopId = started.ok ? started.loopId : ''
    await untilInFlight(built.driver)

    const paused = await built.driver.pause({ loopId, requesterSessionId: OWNER, reason: PAUSE_REASON })
    expect(paused).toEqual({ ok: true, paused: true, taskKey: 'feat-x/2.5' })
    // 任务真化 suspended（1.4 转移服务——reason 必带落时间线 + actor 'core' 自动化归因）
    expect(built.h.transitions).toContainEqual({
      projectId: PROJECT,
      taskId: 't-1',
      toStatus: 'suspended',
      reason: PAUSE_REASON,
      actor: 'core',
    })
    // 竞态收口序消费面：摘牌（inFlight 清位）+ 挂起投影（写点①）+ 登记保留（终局注销不触发）
    const record = built.driver.activeOf(OWNER)
    expect(record).toBeDefined()
    expect(record?.inFlight).toBeUndefined()
    expect(record?.suspended?.escalation).toMatchObject({
      kind: 'task-paused',
      taskKey: 'feat-x/2.5',
      reason: PAUSE_REASON,
    })
    // 进度事件（suspend 动词 + 任务键 + 原因注记）
    expect(built.progressCalls.some((e) => e.verb === 'suspend' && e.taskKey === 'feat-x/2.5' && e.note === PAUSE_REASON)).toBe(true)
    // 叙述面（暂停通知——含原因与恢复指引）
    expect(built.calls.at(-1)?.text).toContain('[forge·暂停]')
    expect(built.calls.at(-1)?.text).toContain('dispatchTask')
  })

  it('resume 批量恢复：容器内 suspended paused 卡以 core actor 批量恢复 pending，随后正常续跑收口', async () => {
    const built = build({
      claim: [claimed()],
      stats: [statsOf({ pending: 1 }), statsOf({ in_progress: 1 }), statsOf({ in_progress: 1 })],
      spawnBehavior: abortableSpawnBehavior,
    })
    const started = await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    const loopId = started.ok ? started.loopId : ''
    await untilInFlight(built.driver)
    await built.driver.pause({ loopId, requesterSessionId: OWNER, reason: PAUSE_REASON })

    // resume 序（runRound 前）批量恢复：suspended 卡 → pending（矩阵新边，'core' actor）
    built.h.lists.suspended = [card('feat-x', '2.5', { taskStatus: 'suspended' })]
    built.h.setClaim([NO_TASK])
    built.h.setStats([statsOf({ suspended: 1 }), statsOf({ completed: 1 }), statsOf({ completed: 1 })])
    expect(built.driver.resume({ loopId })).toEqual({ ok: true, loopId })
    await untilSettled(built.driver)
    expect(built.h.transitions).toContainEqual({
      projectId: PROJECT,
      taskId: 'card-feat-x-2.5',
      toStatus: 'pending',
      reason: LOOP_RESUME_RESTORE_REASON,
      actor: 'core',
    })
    expect(built.driver.activeOf(OWNER)).toBeUndefined()
  })

  it('归属守卫三径：运行中非 owner = forbidden；挂起态任意会话可接管（无在途对象 = no-in-progress-task）；无活循环 = no-active-loop；空 reason = reason-required', async () => {
    const built = build({
      claim: [claimed()],
      stats: [statsOf({ pending: 1 }), statsOf({ in_progress: 1 }), statsOf({ in_progress: 1 })],
      spawnBehavior: abortableSpawnBehavior,
    })
    const started = await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    const loopId = started.ok ? started.loopId : ''
    await untilInFlight(built.driver)

    // ① 运行中非 owner 调用 → typed 拒绝（与 stopTaskLoop 同权限面）
    expect(await built.driver.pause({ loopId, requesterSessionId: 'other-session', reason: '越权' })).toEqual({
      ok: false,
      code: 'forbidden',
      suspended: false,
      ownerSessionId: OWNER,
    })
    // ② owner 空 reason → reason-required（pauseTask 必带 reason）
    expect(await built.driver.pause({ loopId, requesterSessionId: OWNER, reason: '   ' })).toEqual({
      ok: false,
      code: 'reason-required',
      suspended: false,
      ownerSessionId: OWNER,
    })
    // owner pause → 挂起；③ 挂起态任意会话可接管（守卫放行）——无在途对象归 no-in-progress-task
    await built.driver.pause({ loopId, requesterSessionId: OWNER, reason: PAUSE_REASON })
    expect(await built.driver.pause({ loopId, requesterSessionId: 'other-session', reason: '接管' })).toEqual({
      ok: false,
      code: 'no-in-progress-task',
      suspended: true,
      ownerSessionId: OWNER,
    })
    // ④ 无活循环
    expect(await built.driver.pause({ loopId: 'no-such-loop', requesterSessionId: OWNER, reason: 'x' })).toEqual({
      ok: false,
      code: 'no-active-loop',
      suspended: false,
      ownerSessionId: '',
    })
  })
})
