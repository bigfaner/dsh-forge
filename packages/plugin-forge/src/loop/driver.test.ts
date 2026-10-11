// S1b · 宿主派发循环驱动器单测（run-tasks-host-command/1.4 验收面）：
// runRound 状态机全链（领取→领取通知→spawn→结算→结果通知→判定→续派）宿主代码驱动、
// 任意时刻 in-flight ≤1（串行跟踪）、no-task 三态判词（settled 收口/等待 patience/halted）、
// adopt 逐个恢复重入、blocked 有 fix 机械续领 / 无 fix 处置钩子桩（三动作）、spawn 失败
// 退避 ×3 halted 粘性、worker 异常终止 bounded 重入超限升级、停止（in-flight 真化
// interrupted + ⑰ 收口）、v1 单活守卫。spawn/tasks/narrator 通道全桩（真 narrator 渲染 +
// 录制通道；incident 仓缺目录 = 零 I/O）。
import { describe, expect, it, vi } from 'vitest'
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
import type { LoopDriver, LoopDriverDeps, LoopEscalation, LoopTriageDecision, LoopTriageInput } from './driver.js'
import { createNarrator } from '../notify/index.js'
import type { NarrationChannel, Narrator } from '../notify/index.js'
import type { ForgeEventSink } from '../events/sink.js'
import type { SpawnWorker, SpawnWorkerHandle, SpawnWorkerRequest } from '../dispatch-core/index.js'

// ─────────────────────────── 夹具 ───────────────────────────

const OWNER = 'owner-session-1'
const PROJECT = 'p-1'
const SOURCE = { kind: 'feature', slug: 'feat-x' } as const

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

const NO_TASK: ClaimTaskResult = { task: null, dispatchPrompt: '', digest: '', reclaimed: false }

/** 永不结算的 spawn 桩（生命周期用例——在飞保持确定性） */
function parkedSpawn(_n: number): Promise<SpawnWorkerHandle> {
  return Promise.resolve({
    workerSessionId: 'worker-parked',
    result: new Promise(() => {}),
    dispose: async () => {},
  })
}

function claimed(localId = '2.5', digest = 'digestabc123'): ClaimTaskResult {
  return { task: snapshot({ localId }), dispatchPrompt: 'PERSONA + <task-context>', digest, reclaimed: false }
}

function queryOf(status: TaskStatus, over: Partial<TaskSnapshot> = {}): QueryTaskResult {
  return {
    task: snapshot({ taskStatus: status, ...over }),
    container: { kind: 'feature', slug: 'feat-x', title: 'feat-x' },
    records:
      status === 'completed'
        ? [{ verb: 'submit', toStatus: 'completed', summary: 'did the thing', commitHash: 'abc1234', actor: 'plugin-tool', createdAt: '2026-10-11T01:00:00.000Z' }]
        : status === 'blocked'
          ? [{ verb: 'submit', toStatus: 'blocked', reason: 'tests hang on flaky selector', actor: 'plugin-tool', createdAt: '2026-10-11T01:00:00.000Z' }]
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
}

function build(options: {
  claim?: ClaimTaskResult[]
  stats?: TaskStats[]
  query?: QueryTaskResult[]
  triage?: (input: LoopTriageInput) => Promise<LoopTriageDecision>
  spawnBehavior?: (h: ReturnType<typeof trackedSpawn>) => void
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
  const narrator: Narrator = createNarrator({ channel }) // incident 仓缺目录解析 = 零 I/O fail-soft
  const events: ForgePluginEvent[] = []
  const sink: ForgeEventSink = {
    emit: (e) => events.push(e),
    prepare: async () => {},
    dirOf: () => undefined,
  }
  const spawn = trackedSpawn()
  if (options.spawnBehavior !== undefined) options.spawnBehavior(spawn)
  const escalations: LoopEscalation[] = []
  const deps: LoopDriverDeps = {
    projectId: PROJECT,
    tasks: h.tasks,
    spawn: spawn.spawn,
    narrator,
    events: sink,
    ...(options.triage !== undefined ? { triage: { run: options.triage } } : {}),
    escalation: {
      escalate: async (e) => {
        escalations.push(e)
      },
    },
    delays: { backoffBaseMs: 1, patiencePauseMs: 1 },
  }
  return { driver: createLoopDriver(deps), calls, events, h, spawn, escalations }
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
    expect(built.calls[1]?.text).toContain('执行中 1')
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
    expect(built.calls[1]?.text).toContain('中断 1')
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

  it('blocked 无 follow-up + 处置钩子 wait-external → ⑨ 叙述 → 续领', async () => {
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
    await untilSettled(built.driver)
    expect(built.calls.some((c) => c.text.includes('等待 feature-b 先完成，先执行其它任务'))).toBe(true)
  })

  it('blocked 无 follow-up + 处置钩子 ask-user → ⑩ 叙述 + 第三层裁决钩子触发 → 循环终局（不再续领）', async () => {
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
    await untilSettled(built.driver)
    expect(built.calls.some((c) => c.text.includes('无法自动处理——已向你发起问询'))).toBe(true)
    expect(built.escalations).toEqual([
      { kind: 'blocked-ask-user', source: SOURCE, task: expect.objectContaining({ localId: '2.5' }), reason: 'tests hang on flaky selector' },
    ])
    expect(built.h.claimInputs).toHaveLength(1) // 终局——零续领
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
    await untilSettled(built.driver)
    // 缺席 = 静默续领：零处置叙述（⑧⑨⑩描述的动作未发生——不发）；blocked 无 pending 通路
    // → 池态判词机械接管 = ⑭ 受阻终局 + 第三层裁决钩子
    expect(built.calls.some((c) => c.text.includes('[forge·自动处理]'))).toBe(false)
    expect(built.calls.some((c) => c.text.includes('没有可执行的任务，且有任务阻塞中'))).toBe(true)
    expect(built.escalations).toEqual([{ kind: 'deadlock', source: SOURCE, blockedItems: [{ taskKey: '2.5', note: 'Task 2.5' }] }])
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

  it('worker 异常终止（结算失败）：⑫ bounded 立即重入（第 1/3…3/3）→ 超限第三层裁决钩子 → 终局；零防线计数零 tool-error', async () => {
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
    await untilSettled(built.driver)
    // 四次运行（3 次 bounded 重入 + 第 4 次触发超限升级），⑫ ×3
    expect(built.spawn.requests).toHaveLength(4)
    const retries = built.calls.filter((c) => c.text.includes('子代理异常退出'))
    expect(retries).toHaveLength(3)
    expect(retries[0]?.text).toContain('自动重新执行（第 1/3 次）')
    expect(retries[2]?.text).toContain('自动重新执行（第 3/3 次）')
    expect(built.escalations).toEqual([
      { kind: 'worker-abort-over-limit', source: SOURCE, taskKey: 'feat-x/2.5', attempts: 4 },
    ])
    // 执行受阻 ≠ spawn 机制故障：零 guard 计数、零 tool-error 留档（循环自有 bounded 阶梯）
    expect(built.events.some((e) => e.type === 'tool-error')).toBe(false)
  })
})

// ─────────────────────────── no-task 三态判词 ───────────────────────────

describe('no-task 三态判词（settled / 等待 / halted-受阻）', () => {
  it('deadlock-suspected：⑭ 受阻终局叙述 + 第三层裁决钩子（附阻塞清单）→ 终局', async () => {
    const built = build({
      claim: [NO_TASK],
      stats: [statsOf({ blocked: 2 }), statsOf({ blocked: 2 }), statsOf({ blocked: 2, completed: 4 })],
    })
    built.h.lists.blocked = [card('feat-x', '3.1', { taskStatus: 'blocked' }), card('feat-x', '4.1', { taskStatus: 'blocked' })]
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSettled(built.driver)
    const blocked = built.calls.find((c) => c.method === 'followup')
    expect(blocked?.text).toContain('没有可执行的任务，且有任务阻塞中')
    expect(blocked?.text).toContain('3.1（Task 3.1）· 4.1（Task 4.1）')
    expect(built.escalations).toEqual([
      { kind: 'deadlock', source: SOURCE, blockedItems: [{ taskKey: '3.1', note: 'Task 3.1' }, { taskKey: '4.1', note: 'Task 4.1' }] },
    ])
    expect(built.h.claimInputs).toHaveLength(1)
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
  it('v1 单活守卫：活循环在场再 start → loop-active 拒绝（附在役循环归属）；停止后新实例可启', async () => {
    const built = build({ claim: [claimed()] })
    built.spawn.setBehavior(parkedSpawn) // 永不结算——保持在飞（确定性）
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await vi.waitFor(
      () => {
        expect(built.driver.activeOf(OWNER)?.inFlight).toBeDefined()
      },
      { timeout: 2000, interval: 5 },
    )
    const again = await built.driver.start({ source: { kind: 'proposal', slug: 'other' }, ownerSessionId: 'session-2', parent: {} })
    expect(again).toEqual({ ok: false, code: 'loop-active', activeSource: SOURCE, activeOwnerSessionId: OWNER })
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
