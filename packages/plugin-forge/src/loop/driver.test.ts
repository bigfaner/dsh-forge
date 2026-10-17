// S1b · 宿主派发循环驱动器单测（run-tasks-host-command/1.4 验收面）：
// runRound 状态机全链（领取→领取通知→spawn→结算→结果通知→判定→续派）宿主代码驱动、
// 任意时刻 in-flight ≤1（串行跟踪）、no-task 三态判词（settled 收口/等待 patience/halted）、
// adopt 逐个恢复重入、blocked 有 fix 机械续领 / 无 fix 处置钩子桩（三动作）、spawn 失败
// 退避 ×3 halted 粘性、worker 异常终止 bounded 重入超限升级、停止（in-flight 真化
// interrupted + ⑰ 收口）、v1 单活守卫。spawn/tasks/narrator 通道全桩（真 narrator 渲染 +
// 录制通道；incident 仓缺目录 = 零 I/O）。
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
import { createLoopDriver } from './driver.js'
import { createLoopRegistry } from './registry.js'
import type { LoopDriver, LoopDriverDeps, LoopEscalation, LoopTriageDecision, LoopTriageHook, LoopTriageInput } from './driver.js'
import type { LoopRecord } from './registry.js'
import { backoffDelayMs, isTriageInvalidOutput, LOOP_TRIAGE_MAX_ATTEMPTS, triageFailureSummary } from './driver.js'
import { createNarrator } from '../notify/index.js'
import type { IncidentStore, NarrationChannel, Narrator } from '../notify/index.js'
import type { ForgeProgressEventData } from '../progress/index.js'
import type { ForgeEventSink } from '../events/sink.js'
import { createTriageHook, TriageDecisionInvalidError } from '../triage/index.js'
import { exclusiveLoopSourceOf, HALTED_REASON, resetExclusiveLoopSources } from '../dispatch-core/index.js'
import type { SpawnWorker, SpawnWorkerHandle, SpawnWorkerRequest } from '../dispatch-core/index.js'

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
  const lists: Record<'interrupted' | 'in_progress' | 'blocked' | 'created', TaskCard[]> = {
    interrupted: [],
    in_progress: [],
    blocked: [],
    created: [],
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
      return lists.created
    },
    queryTask: async () => shift(queryQueue),
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

type NarrationCall = { readonly method: 'notice' | 'followup'; readonly sessionId: string; readonly text: string }

interface Built {
  driver: LoopDriver
  calls: NarrationCall[]
  events: ForgePluginEvent[]
  h: ReturnType<typeof tasksHarness>
  spawn: ReturnType<typeof trackedSpawn>
  escalations: LoopEscalation[]
  /** 1.17 进度事件录制面（'forge/progress' append 形状观察） */
  progressCalls: ForgeProgressEventData[]
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
} = {}): Built {
  const h = tasksHarness()
  if (options.claim !== undefined) h.setClaim(options.claim)
  if (options.stats !== undefined) h.setStats(options.stats)
  if (options.query !== undefined) h.setQuery(options.query)
  const calls: NarrationCall[] = []
  const channel: NarrationChannel = {
    notice: async (sessionId, text) => {
      calls.push({ method: 'notice', sessionId, text })
    },
    followup: async (sessionId, text) => {
      calls.push({ method: 'followup', sessionId, text })
    },
  }
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
    escalation: {
      escalate: async (e) => {
        escalations.push(e)
      },
    },
    delays: { backoffBaseMs: options.backoffBaseMs ?? 1, patiencePauseMs: 1 },
  }
  return { driver: createLoopDriver(deps), calls, events, h, spawn, escalations, progressCalls }
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
    // 叙述四连：①启动（notice）/ ④领取（notice）/ ⑥完成（notice）/ ⑯结束·全部完成（followup）
    expect(built.calls.map((c) => c.method)).toEqual(['notice', 'notice', 'notice', 'followup'])
    expect(built.calls[0]?.text).toContain('[forge·启动] 任务源: feat-x（feature）')
    expect(built.calls[0]?.text).toContain('待执行 1')
    expect(built.calls[1]?.text).toContain('[forge·领取] 任务源: feat-x')
    expect(built.calls[1]?.text).toContain('任务: 2.5 Implement the thing')
    expect(built.calls[1]?.text).not.toContain('执行中 1') // 2026-10-12「去掉状态计数」——剩余行移除
    expect(built.calls[2]?.text).toContain('[forge·完成] 任务源: feat-x')
    expect(built.calls[2]?.text).toContain('摘要: did the thing')
    expect(built.calls[3]?.text).toContain('[forge·结束] 任务源: feat-x — 全部任务已完成')
    expect(built.calls[3]?.text).toContain('完成 1 · 阻塞 0')
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
    // ② 启动接续 + ⑤ 领取（恢复中断——恢复注记进任务行）
    expect(built.calls[0]?.text).toContain('接续执行 — 发现未完成任务 2.5')
    expect(built.calls[1]?.text).toContain('[forge·领取] 任务源: feat-x')
    expect(built.calls[1]?.text).toContain('恢复自中断')
    expect(built.calls[1]?.text).not.toContain('中断 1') // 2026-10-12「去掉状态计数」——剩余行移除
  })

  it('in_progress 遗留（skill 路线）而无 interrupted：③ 启动接续在飞——claim 无可领 → wait 判词 → patience 耗尽 ⑮ 收口', async () => {
    const built = build({
      claim: [NO_TASK],
      stats: [statsOf({ in_progress: 2 }), statsOf({ in_progress: 2 }), statsOf({ in_progress: 2 }), statsOf({ in_progress: 2 }), statsOf({ in_progress: 2, completed: 3 })],
    })
    built.h.lists.in_progress = [card('feat-x', '2.7', { taskStatus: 'in_progress' })]
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSettled(built.driver)
    expect(built.calls[0]?.text).toContain('接续执行 — 任务 2.7 正在执行，等它完成后继续')
    expect(built.calls.at(-1)?.text).toContain('结束（等待超时）')
    expect(built.calls.at(-1)?.text).toContain('提示用户"稍后重新执行 /run-dag-tasks feat-x"')
  })

  it('干净任务源：① 启动从头执行（pending 计数）', async () => {
    const built = build({
      claim: [NO_TASK],
      stats: [statsOf({ pending: 6 }), statsOf({ pending: 6 }), statsOf({ pending: 6 }), statsOf({ pending: 6 })],
    })
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSettled(built.driver)
    expect(built.calls[0]?.text).toContain('[forge·启动] 任务源: feat-x（feature）')
    expect(built.calls[0]?.text).toContain('从头执行 — 按依赖顺序逐个执行（待执行 6）')
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
    // 直达挂起：blocked-ask-user + 无进展处置历史（跳过阶梯的机械证据）进挂起载荷
    expect(suspended.escalation).toEqual({
      kind: 'blocked-ask-user',
      ownerSessionId: OWNER,
      source: SOURCE,
      task: expect.objectContaining({ localId: '2.5' }),
      reason: 'tests hang on flaky selector',
      history: ['无进展硬停——结算零 commit hash 且零 files 增量，跳过处置阶梯直达问人'],
    })
    expect(suspended.since).toEqual(expect.any(Number))
    expect(built.h.claimInputs).toHaveLength(1) // 挂起停驻——零续领
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
    expect(built.calls.some((c) => c.text.includes('等待 feature-b 先完成，先执行其它任务'))).toBe(true)
    await built.driver.stop({ ownerSessionId: OWNER })
  })

  it('blocked 且结算携带 followUp → ⑦ 叙述 + 机械续领 fix（不升级）', async () => {
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
    // ⑦ 阻塞（已带修复任务——reason 摘要进叙述，续领 fix）
    const blockedNotice = built.calls.find((c) => c.text.includes('[forge·阻塞]'))
    expect(blockedNotice?.text).toContain('任务: 2.5 Implement the thing — 阻塞 — tests hang on flaky selector')
    expect(blockedNotice?.text).toContain('已自动创建修复任务 fix-1（完成后本任务自动恢复），继续执行')
    // 续领次序：2.5 → fix-1（fix ready 自然被领——零智能介入）
    expect(built.h.claimInputs[1]?.source).toEqual(SOURCE)
    expect(built.spawn.requests[1]?.label).toContain('feat-x/fix-1')
    // 处置钩子未注入时 blocked-with-fix 不触发（fix 链已在 worker 侧机械闭合）
    expect(built.calls.some((c) => c.text.includes('[forge·自动处理]'))).toBe(false)
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
    // 死后继不静默：blocked-with-fix notice 零出现，blocked-ask-user followup + 挂起在场
    expect(built.calls.some((c) => c.text.includes('[forge·阻塞]'))).toBe(false)
    expect(built.calls.some((c) => c.text.includes('无法自动处理——已向你发起问询'))).toBe(true)
    expect(suspended.escalation.kind).toBe('blocked-ask-user')
    expect(built.h.claimInputs).toHaveLength(1) // 挂起停驻——零续领
    await built.driver.stop({ ownerSessionId: OWNER })
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
    expect(built.calls.some((c) => c.text.includes('[forge·阻塞]'))).toBe(false)
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
    // 非阻塞 notify 在场：reason 摘要 + 活后继键（fix-2，递归穿越 blocked 后继）
    const blockedNotice = built.calls.find((c) => c.text.includes('[forge·阻塞]'))
    expect(blockedNotice?.text).toContain('tests hang on flaky selector')
    expect(blockedNotice?.text).toContain('fix-2')
    // 零 blocked-ask-user 挂起（静默径——挂起为 deadlock 族）
    expect(built.driver.activeOf(OWNER)?.suspended?.escalation.kind).toBe('deadlock')
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
    // ⑧ 阻塞（已自动分析并创建修复任务——用户视角文案，机制词零出现）
    const fixed = built.calls.find((c) => c.text.includes('[forge·自动处理]'))
    expect(fixed?.text).toContain('已自动分析原因并创建修复任务 fix-2（修选择器等待），继续执行')
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
    // ⑧b 分割叙述：源任务键（任务行）+ 继任任务键 + reason 摘要纪律
    const split = built.calls.find((c) => c.text.includes('[forge·自动处理]'))
    expect(split?.text).toContain('任务: 2.5 Implement the thing — 阻塞 — tests hang on flaky selector')
    expect(split?.text).toContain('已创建继任任务 fix-2 承接剩余范围（本任务保持阻塞，不再重跑），继续执行——已完成 A/B')
    expect(split?.text).not.toContain('处置历史')
    // 循环续领：分割后继续 claim（pending 继任路径在场——池态判词不误报）
    expect(built.h.claimInputs.length).toBeGreaterThanOrEqual(2)
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
    expect(built.calls.some((c) => c.text.includes('等待 feature-b 先完成，先执行其它任务'))).toBe(true)
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
    expect(built.calls.some((c) => c.text.includes('已自动分析原因并创建修复任务 fix-2（修选择器等待）'))).toBe(true)
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
    // 详情行回到叙述（装配面 incidents 在场——blocked 族叙述恢复详情子文件夹路径）
    expect(built.calls.some((c) => c.text.includes('详情: logs/feat-x/2.5/001-blocked/'))).toBe(true)
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
    // 三次 spawn 尝试（每轮幂等重入同任务），⑪ ×2（attempt 1/2），第 3 次败 → ⑬ 终局
    expect(built.spawn.requests).toHaveLength(3)
    const retries = built.calls.filter((c) => c.text.includes('[forge·自动重试]') && c.text.includes('启动子代理失败'))
    expect(retries).toHaveLength(2)
    expect(retries[0]?.text).toContain('启动子代理失败（第 1 次）')
    expect(retries[1]?.text).toContain('启动子代理失败（第 2 次）')
    const halted = built.calls.find((c) => c.method === 'followup')
    expect(halted?.text).toContain('启动子代理连续失败 3 次——已停止')
    expect(halted?.text).toContain('提示用户"环境排查后重新开始 /run-dag-tasks feat-x"，并在问询中决定')
    // 同实例不自动复活（登记表已删、无定时器存活）；新实例 = 新 guard 计数（可正常跑完）
    const recovery = build({ claim: [claimed('2.9'), NO_TASK], stats: [statsOf({ pending: 1 }), statsOf({ in_progress: 1 }), statsOf({ in_progress: 1 }), statsOf({ completed: 1 }), statsOf({ completed: 1 })] })
    await recovery.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSettled(recovery.driver)
    expect(recovery.calls.some((c) => c.text.includes('[forge·完成]'))).toBe(true)
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
    // 四次运行（3 次 bounded 重入 + 第 4 次触发超限挂起），⑫ ×3
    expect(built.spawn.requests).toHaveLength(4)
    const retries = built.calls.filter((c) => c.text.includes('子代理异常退出'))
    expect(retries).toHaveLength(3)
    expect(retries[0]?.text).toContain('自动重新执行（第 1/3 次）')
    expect(retries[2]?.text).toContain('自动重新执行（第 3/3 次）')
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
    const timeout = built.calls.find((c) => c.method === 'followup')
    expect(timeout?.text).toContain('结束（等待超时）')
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
      { projectId: PROJECT, taskId: 't-1', toStatus: 'interrupted', reason: '派发循环停止' },
    ])
    // ⑰ 停止终局叙述
    const stoppedNotice = built.calls.find((c) => c.method === 'followup')
    expect(stoppedNotice?.text).toContain('[forge·停止] 任务源: feat-x — 已按你的指令停止')
    expect(stoppedNotice?.text).toContain('执行中任务 feat-x/2.5 已标记为中断')
    expect(stoppedNotice?.text).toContain('提示用户"继续执行 /run-dag-tasks feat-x"')
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

  it('停止竞态（claim 通知窗口被叫停）：stop 面接管真化——循环醒来让渡，零 spawn 零续领', async () => {
    let stopPromise: Promise<unknown> | undefined
    const channelCalls: NarrationCall[] = []
    const channel: NarrationChannel = {
      notice: async (sessionId, text) => {
        channelCalls.push({ method: 'notice', sessionId, text })
        // 竞态注入点：领取通知 await 窗口内敲 stop（此时 in-flight 已登记、spawn 未发生）
        if (text.includes('[forge·领取]') && stopPromise === undefined) {
          stopPromise = driver.stop({ ownerSessionId: OWNER })
        }
      },
      followup: async (sessionId, text) => {
        channelCalls.push({ method: 'followup', sessionId, text })
      },
    }
    const h = tasksHarness()
    h.setClaim([claimed()])
    const deps: LoopDriverDeps = {
      projectId: PROJECT,
      tasks: h.tasks,
      spawn: trackedSpawn().spawn,
      narrator: createNarrator({ channel }),
      delays: { backoffBaseMs: 1, patiencePauseMs: 1 },
    }
    const driver = createLoopDriver(deps)
    await driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSettled(driver)
    expect(await stopPromise).toEqual({ ok: true, stopped: true, hadInFlight: true })
    // 真化归 stop 面（stop 读数晚于 in-flight 登记——接管方）；循环径让渡
    expect(h.transitions).toEqual([{ projectId: PROJECT, taskId: 't-1', toStatus: 'interrupted', reason: '派发循环停止' }])
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
    expect(built.calls.some((c) => c.text.includes('已自动分析原因并创建修复任务 fix-2'))).toBe(true)
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
    const halted = built.calls.find((c) => c.method === 'followup')
    expect(halted?.text).toContain('启动子代理连续失败 3 次——已停止')
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
    const channel: NarrationChannel = { notice: async () => {}, followup: async () => {} }
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
    expect(built.progressCalls).toHaveLength(2)
    const [claimEvt, settleEvt] = built.progressCalls
    // 领取点：动词 claim + running + 任务键 + 计数快照 + 时间戳界内
    expect(claimEvt).toEqual({
      sourceSlug: 'feat-x',
      verb: 'claim',
      status: 'running',
      taskKey: 'feat-x/2.5',
      counts: { pending: 0, running: 1, done: 0 },
      at: expect.any(Number),
    })
    expect(claimEvt!.at).toBeGreaterThanOrEqual(before)
    // 结算点：动词 settle + completed + 同任务键（零计数——claim 后快照过期不虚报）
    expect(settleEvt).toEqual({
      sourceSlug: 'feat-x',
      verb: 'settle',
      status: 'completed',
      taskKey: 'feat-x/2.5',
      at: expect.any(Number),
    })
    // 纯 JSON（Session.append 契约——序列化往返无损）
    expect(JSON.parse(JSON.stringify(built.progressCalls))).toEqual(built.progressCalls)
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
    expect(built.progressCalls[0]).toMatchObject({ verb: 'claim-resume', status: 'running', taskKey: 'feat-x/2.5' })
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
      { sourceSlug: 'feat-x', verb: 'stop', status: 'interrupted', taskKey: 'feat-x/2.5', at: expect.any(Number) },
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
    expect(built.progressCalls[1]).toMatchObject({ verb: 'settle', status: 'blocked', taskKey: 'feat-x/2.5' })
    await built.driver.stop({ ownerSessionId: OWNER })
  })

  it('面缺席 = 零发射 fail-soft（可选依赖——叙述四连零回归）', async () => {
    const h = tasksHarness()
    h.setClaim([claimed(), NO_TASK])
    h.setStats([statsOf({ pending: 1 }), statsOf({ in_progress: 1 }), statsOf({ in_progress: 1 }), statsOf({ completed: 1 }), statsOf({ completed: 1 })])
    const channel: NarrationChannel = { notice: async () => {}, followup: async () => {} }
    const driver = createLoopDriver({
      projectId: PROJECT,
      tasks: h.tasks,
      spawn: trackedSpawn().spawn,
      narrator: createNarrator({ channel }),
      delays: { backoffBaseMs: 1, patiencePauseMs: 1 },
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
    expect(built.calls.some((c) => c.text.includes('已自动分析原因并创建修复任务 fix-2'))).toBe(true)
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
    // 编造 slug 零执行（零等待叙述）；有效 slug 照常等待叙述
    expect(built.calls.some((c) => c.text.includes('等待 ghost-slug 先完成'))).toBe(false)
    expect(built.calls.some((c) => c.text.includes('等待 feat-real 先完成'))).toBe(true)
    await built.driver.stop({ ownerSessionId: OWNER })
  })
})

// ─────────────────────────── 3b · 升级点挂起与 re-entry 回落（dispatch-loop-hardening 1.8） ───────────────────────────

describe('3b 挂起改造（suspendForVerdict 写 record.suspended + resume 清挂起回落续跑）', () => {
  /** 无进展 blocked 的结算记录（零 commit hash 零 files——硬停门直达挂起） */
  function queryOfBlockedNoProgress(): QueryTaskResult {
    return {
      task: snapshot({ taskStatus: 'blocked' }),
      container: { kind: 'feature', slug: 'feat-x', title: 'feat-x' },
      records: [
        { verb: 'submit', toStatus: 'blocked', reason: 'needs human verdict', actor: 'plugin-tool', createdAt: '2026-10-11T01:00:00.000Z' },
      ],
    }
  }

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
    expect(built.calls.some((c) => c.text.includes('[forge·完成]'))).toBe(true)
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
      channel: {
        notice: async (sessionId, text) => {
          calls.push({ method: 'notice', sessionId, text })
        },
        followup: async (sessionId, text) => {
          calls.push({ method: 'followup', sessionId, text })
        },
      },
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
    expect(built.calls.some((c) => c.method === 'followup' && c.text.includes('继续执行 /run-dag-tasks feat-x'))).toBe(true)
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
