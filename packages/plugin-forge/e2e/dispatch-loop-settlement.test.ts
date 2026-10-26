// e2e dogfood · 派发循环 settlement 形态回放取证（dispatch-loop-hardening 3b④ / 提案 AC 8·9·11）。
// 回放脚本驱动、零模型参与（不依赖模型服从性）：真循环驱动器 + 真注入投影 + 真工具壳 +
// 真结算通道适配，tasks/spawn/agentsRegistry 全桩。取证面五件：
// ① 发起后系统提示词含 P1；② 终局后零残留（section 清零）+ 结算通知 settlement 形态
// （dispatch-loop-settled source + P8 四重点逐字在文）；③ 守卫拒绝响应含归属与入口；
// ④ 挂起摘要可经重调获取（owner 与任意接管会话同径）；⑤ owner 会话失活：不投死信 +
// 必达告警，挂起循环任意会话凭 slug 认领处置。
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
import { createLoopDriver } from '../src/loop/driver.js'
import type { LoopDriver, LoopDriverDeps } from '../src/loop/driver.js'
import { createLoopRegistry } from '../src/loop/registry.js'
import type { LoopRecord, LoopRegistry } from '../src/loop/registry.js'
import { renderInjection } from '../src/loop/injection.js'
import { adaptAgentNarrationChannel } from '../src/faces.js'
import type { ToolExecFace } from '../src/faces.js'
import type { ForgeEventSink } from '../src/events/sink.js'
import type { NarrationChannel, Narrator } from '../src/notify/index.js'
import { createNarrator } from '../src/notify/index.js'
import type { SpawnWorker, SpawnWorkerHandle, SpawnWorkerRequest } from '../src/dispatch-core/index.js'
import { resetExclusiveLoopSources } from '../src/dispatch-core/index.js'
import { createDispatchTaskTool } from '../src/tools/dispatch-task.js'
import type { DispatchTaskToolDeps, DispatchLoopResult } from '../src/tools/dispatch-task.js'

// ─────────────────────────── 桩面（driver.test 同源夹具——回放脚本驱动） ───────────────────────────

const OWNER = 'owner-session-1'
const OTHER = 'other-session-2'
const PROJECT = 'p-1'
const SOURCE = { kind: 'feature', slug: 'feat-x' } as const

afterEach(() => {
  resetExclusiveLoopSources()
  vi.restoreAllMocks()
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

const NO_TASK: ClaimTaskResult = { task: null, dispatchPrompt: '', persona: 'PERSONA-MATRIX', digest: '', reclaimed: false }

function claimed(localId = '2.5'): ClaimTaskResult {
  return { task: snapshot({ localId }), dispatchPrompt: 'PERSONA + <task-context>', persona: 'PERSONA-MATRIX', digest: 'digestabc123', reclaimed: false }
}

function queryOf(status: TaskStatus, over: Partial<{ commitHash: string; files: string[] }> = {}): QueryTaskResult {
  return {
    task: snapshot({ taskStatus: status }),
    container: { kind: 'feature', slug: 'feat-x', title: 'feat-x' },
    records:
      status === 'completed'
        ? [{ verb: 'submit' as const, toStatus: 'completed' as const, summary: 'did the thing', commitHash: 'abc1234', actor: 'plugin-tool', createdAt: '2026-10-11T01:00:00.000Z' }]
        : status === 'blocked'
          ? [
              {
                verb: 'submit' as const,
                toStatus: 'blocked' as const,
                reason: 'tests hang on flaky selector',
                ...(over.commitHash !== undefined ? { commitHash: over.commitHash } : {}),
                ...(over.files !== undefined ? { files: over.files } : {}),
                actor: 'plugin-tool',
                createdAt: '2026-10-11T01:00:00.000Z',
              },
            ]
          : [],
  }
}

/** tasks 服务桩（脚本队列 shift-末项重复——driver.test 同源） */
function tasksHarness() {
  let claimQueue: ClaimTaskResult[] = [claimed()]
  let statsQueue: TaskStats[] = [statsOf({ pending: 1 })]
  let queryQueue: QueryTaskResult[] = [queryOf('completed')]
  const lists: Record<'interrupted' | 'in_progress' | 'blocked' | 'created', TaskCard[]> = { interrupted: [], in_progress: [], blocked: [], created: [] }
  const shift = <T,>(queue: T[]): T => (queue.length > 1 ? (queue.shift() as T) : (queue[0] as T))
  const tasks = {
    claimTask: async (_input: ClaimTaskInput) => shift(claimQueue),
    taskStats: async () => shift(statsQueue),
    listTasks: async (q: ListTasksQuery) => {
      const bucket = q.statusFilter?.[0]
      if (bucket === 'interrupted') return lists.interrupted
      if (bucket === 'in_progress') return lists.in_progress
      if (bucket === 'blocked') return lists.blocked
      return lists.created
    },
    queryTask: async () => shift(queryQueue),
    addTask: async (input: AddTaskInput) => {
      void input
      return { taskId: 'fix-uuid', slug: input.source.slug, localId: 'fix-2', reused: false }
    },
    transitionTask: async (input: TransitionTaskInput) => {
      void input
      return snapshot({ taskStatus: input.toStatus })
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

/** spawn 桩：delayMs<0 = 永不结算（在飞驻留——取证窗确定性载体）；否则 microtask 结算 */
function settlingSpawn(delayMs = 5): SpawnWorker {
  return async (req: SpawnWorkerRequest): Promise<SpawnWorkerHandle> => {
    const result = new Promise<{ stopReason: string; output: string }>((resolve) => {
      if (delayMs >= 0) queueMicrotask(() => resolve({ stopReason: 'completed', output: '' }))
    })
    return { workerSessionId: `worker-${req.prompt.length}`, result, dispose: async () => {} }
  }
}

type Call = {
  readonly method: 'notice' | 'followup' | 'settle'
  readonly sessionId: string
  readonly text: string
  /** probe-1 口径：唤醒径判别（true = 即时唤醒主 agent；false/缺席 = 写入不唤醒整批积压） */
  readonly wakeup?: boolean
}

interface Built {
  driver: LoopDriver
  registry: LoopRegistry
  calls: Call[]
}

/** 回放装配：真 narrator（settle 通道录制）+ 真 registry 注入 + 真驱动器 */
function build(options: { claim?: ClaimTaskResult[]; stats?: TaskStats[]; query?: QueryTaskResult[]; spawnDelayMs?: number } = {}): Built {
  const h = tasksHarness()
  if (options.claim !== undefined) h.setClaim(options.claim)
  if (options.stats !== undefined) h.setStats(options.stats)
  if (options.query !== undefined) h.setQuery(options.query)
  const calls: Call[] = []
  // 结算通道真实现形态：send(form settle, wakeup=true) 单点唤醒（settlement 形态可判别）
  const channel: NarrationChannel = {
    send: async (sessionId, text, options) => {
      const method = options?.form === 'settle' ? 'settle' : options?.wakeup === true ? 'followup' : 'notice'
      calls.push({ method, sessionId, text, ...(options?.wakeup === true ? { wakeup: true } : {}) })
    },
  }
  const narrator: Narrator = createNarrator({ channel })
  const events: ForgePluginEvent[] = []
  const sink: ForgeEventSink = { emit: (e) => events.push(e), prepare: async () => {}, dirOf: () => undefined, remember: () => {} }
  const registry = createLoopRegistry()
  const deps: LoopDriverDeps = {
    projectId: PROJECT,
    tasks: h.tasks,
    spawn: settlingSpawn(options.spawnDelayMs ?? 5),
    narrator,
    events: sink,
    registry,
    // Root cause: 3c 终局 wait-for-quiescence 生产缺省 30s/5s——测试装配必须同缝注入小值，
    // 否则终局落在生产窗内不 registry.remove，untilSettled 超时。
    delays: { backoffBaseMs: 1, patiencePauseMs: 1, quiescenceWindowMs: 1, quiescencePollMs: 1 },
  }
  return { driver: createLoopDriver(deps), registry, calls }
}

async function untilSettled(driver: LoopDriver): Promise<void> {
  await vi.waitFor(
    () => {
      expect(driver.activeOf(OWNER)).toBeUndefined()
    },
    { timeout: 2000, interval: 5 },
  )
}

async function untilSuspended(driver: LoopDriver): Promise<NonNullable<LoopRecord['suspended']>> {
  await vi.waitFor(
    () => {
      expect(driver.activeOf(OWNER)?.suspended).toBeDefined()
    },
    { timeout: 2000, interval: 5 },
  )
  return driver.activeOf(OWNER)!.suspended!
}

/** dispatchTask 工具壳（真驱动器 + 真 registry——守卫/摘要/重调取证面） */
function dispatchToolOf(driver: LoopDriver, registry: LoopRegistry): ReturnType<typeof createDispatchTaskTool> {
  const deps = {
    tasks: { taskStats: async () => statsOf({}) } as unknown as ForgeTasksService,
    proposals: {},
    bugs: {},
    resolveProjectId: (cwd: string) => (cwd.toLowerCase().includes('demo') ? PROJECT : undefined),
    loop: { driver, registry },
  } as unknown as DispatchTaskToolDeps
  return createDispatchTaskTool(deps)
}

function execOf(sessionId: string): ToolExecFace {
  return { agent: { session: { id: sessionId, header: { cwd: 'C:\\ws\\demo' } } } }
}

function renderedText(tool: ReturnType<typeof createDispatchTaskTool>, value: unknown): string {
  const blocks = typeof tool.output.render === 'function' ? tool.output.render({}, value) : []
  return blocks[0]?.text ?? ''
}

const ARGS = { source_kind: 'feature', source_slug: 'feat-x' } as const

/** 挂起回放脚本（无进展硬停——blocked 结算零 commit 零 files；NO_TASK 尾 = re-entry 后自然收敛到超时收口） */
function suspendedBuild(): Built {
  return build({
    claim: [claimed('2.5'), claimed('should-not-claim'), NO_TASK],
    stats: [statsOf({ pending: 1 }), statsOf({ in_progress: 1, blocked: 1 }), statsOf({ in_progress: 1, blocked: 1 })],
    query: [queryOf('blocked'), queryOf('completed')],
  })
}

/** 等待登记表清空（re-entry 收敛后的终局信号） */
async function untilRegistryEmpty(registry: LoopRegistry): Promise<void> {
  await vi.waitFor(
    () => {
      expect(registry.all()).toEqual([])
    },
    { timeout: 2000, interval: 5 },
  )
}

// P8 评审指示四重点（injection-templates.md 逐字——AC 11 机制断言面）
const P8_FOCUS_LINES = [
  '- 架构是否被破坏——分层、依赖方向、模块边界是否仍然成立。',
  '- 实际改动是否超出各任务声明的范围。',
  '- 各模块与包的职责边界是否清晰（core 保持纯状态层，plugin-forge 保持装配与编排）。',
  '- 业务逻辑是否混入公共或基础包。',
]

// ─────────────────────────── 回放取证 ───────────────────────────

describe('e2e dogfood · 发起后系统提示词含 P1', () => {
  it('start 后 section 投影携带 P1 协作规则全文（slug 已替换、零占位符）', async () => {
    const built = build({ spawnDelayMs: -1 })
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await vi.waitFor(() => {
      expect(built.driver.activeOf(OWNER)).toBeDefined()
    })
    const prompt = renderInjection(OWNER, built.registry)
    expect(prompt).toContain('【任务循环协作规则】')
    expect(prompt).toContain('你已启动 feat-x 的任务循环')
    expect(prompt).toContain('stopTaskLoop')
    expect(prompt).not.toMatch(/<[^<>\n]+>/)
    // 非协作会话零注入（零固定税）
    expect(renderInjection(OTHER, built.registry)).toBe('')
    await built.driver.stop({ ownerSessionId: OWNER })
  })
})

describe('e2e dogfood · 终局 settlement + 零残留（AC 8/11）', () => {
  it('no-task 且 done：结算通知 settlement 形态——P8 四重点逐字在文 + 终局后 section 零残留', async () => {
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
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSettled(built.driver)

    // 结算通知 = settle 通道（非 followup）——settlement 形态可判别
    const settle = built.calls.find((c) => c.method === 'settle')
    expect(settle).toBeDefined()
    expect(settle?.sessionId).toBe(OWNER)
    // 结算单点唤醒（loop-event-delivery §结算径）：全循环仅此一次 wakeup=true；
    // 其余事件径投递一律写入不唤醒（next-step 积压整批消费形态——probe-1 口径 B）
    const wakeups = built.calls.filter((c) => c.wakeup === true)
    expect(wakeups).toEqual([settle])
    // 整批消费形态（probe-1 A/B）：中段事件（领取/完成）零唤醒静默积压，仅结算唤醒一次整批消费
    const notices = built.calls.filter((c) => c.method === 'notice')
    expect(notices.length).toBeGreaterThan(0)
    for (const n of notices) expect(n.wakeup).toBeUndefined()
    expect(settle?.text).toContain('[forge·结束] 任务源: feat-x — 全部任务已完成')
    // P8 评审指示段追加（四重点逐字在文——机制断言）
    expect(settle?.text).toContain('【代码评审指示】')
    for (const focus of P8_FOCUS_LINES) expect(settle?.text).toContain(focus)
    expect(settle?.text).toContain('用 recordBug 登记 bug，再用 addTask 添加修复任务')
    // 时间行收尾（叙述骨架纪律——LocalDateTime 本地时区）
    expect(settle?.text).toMatch(/时间: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)

    // 终局后零残留：登记表注销 → section 投影空串（与无此插件逐字节一致）
    expect(built.registry.all()).toEqual([])
    expect(renderInjection(OWNER, built.registry)).toBe('')
  })
})

describe('e2e dogfood · 守卫拒绝响应含归属与入口（AC 8）', () => {
  it('他源会话对活循环容器 dispatchTask：失败 DTO 响应含 owner 会话 id + stopTaskLoop 入口', async () => {
    const built = build({ spawnDelayMs: -1 })
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await vi.waitFor(() => {
      expect(built.driver.activeOf(OWNER)).toBeDefined()
    })
    const tool = dispatchToolOf(built.driver, built.registry)
    const result = await tool.execute(ARGS, execOf(OTHER))
    expect(result).toMatchObject({ ok: false, code: 'ERR_SPAWN_FAILED' })
    const text = renderedText(tool, result)
    expect(text).toContain(OWNER) // 归属（发起会话）
    expect(text).toContain('feat-x') // 容器
    expect(text).toContain('stopTaskLoop') // 正确入口
    expect(text).toContain('a suspended loop may be stopped by any session') // 降级认领入口
    await built.driver.stop({ ownerSessionId: OWNER })
  })
})

describe('e2e dogfood · 挂起摘要可经重调获取（AC 8/9）', () => {
  it('无进展硬停挂起后：owner 重调 dispatchTask 返回挂起摘要全文（P3 同源）+ re-entry', async () => {
    const built = suspendedBuild()
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSuspended(built.driver)

    const tool = dispatchToolOf(built.driver, built.registry)
    const result = (await tool.execute(ARGS, execOf(OWNER))) as DispatchLoopResult
    expect(result.kind).toBe('suspended')
    if (result.kind === 'suspended') {
      expect(result.summary).toContain('【任务循环挂起】')
      expect(result.summary).toContain('feat-x/2.5 以 blocked 结束')
      expect(result.summary).toContain('tests hang on flaky selector')
      expect(result.resumed).toBe(true)
    }
    await untilRegistryEmpty(built.registry) // re-entry 后循环自然收敛（超时收口）——终局 settlement 形态
    expect(built.calls.some((c) => c.method === 'settle' && c.text.includes('等待超时'))).toBe(true)
  })

  it('任意会话凭 slug 认领：非 owner 重调同获挂起摘要 + 接管集写点（owner 失活降级认领径）', async () => {
    const built = suspendedBuild()
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSuspended(built.driver)

    const tool = dispatchToolOf(built.driver, built.registry)
    const result = (await tool.execute(ARGS, execOf(OTHER))) as DispatchLoopResult
    expect(result.kind).toBe('suspended')
    if (result.kind === 'suspended') {
      expect(result.summary).toContain('【任务循环挂起】')
      expect(result.takenOver).toBe(true)
    }
    // 接管写点落登记行（takenOver=true 即接管集写点完成——挂起投影 P3+P9 对接管会话可见，
    // 投影面由 injection 单测与挂起态守卫测试覆盖）
    expect(result.kind === 'suspended' && result.takenOver).toBe(true)
    await untilRegistryEmpty(built.registry)
    // 挂起态任意会话可停语义（stopLoop 作用域）由 driver/工具单测承载——此处 re-entry 已收敛
  })
})

describe('e2e dogfood · owner 会话失活：不投死信 + 必达告警（AC 9）', () => {
  it('结算投递到失活会话：零投递动作 + 必达告警（降级为任意会话凭 slug 认领）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const agents = new Map<string, unknown>()
    const channel = adaptAgentNarrationChannel({ get: (id) => agents.get(id) })
    await channel.send('sess-gone', '【任务循环结束】\n- feat-x 没有可领取的任务。全部任务已完成。', { form: 'settle', wakeup: true })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('必达告警')
    expect(warn.mock.calls[0]?.[0]).toContain('sess-gone')
    expect(warn.mock.calls[0]?.[0]).toContain('凭容器 slug 认领')

    // 活根会话：send(msg, next-step, true) 单点唤醒 + dispatch-loop-settled source（持久 user message）
    const sent: { message: unknown; target: string; wakeup?: boolean }[] = []
    agents.set('sess-idle', {
      send: (message: unknown, target: string, wakeup?: boolean) => sent.push({ message, target, wakeup }),
    })
    await channel.send('sess-idle', 'settle-text', { form: 'settle', wakeup: true })
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ target: 'next-step', wakeup: true })
    expect(sent[0]?.message).toMatchObject({ role: 'user', source: { kind: 'dispatch-loop-settled' } })
  })
})

describe('e2e dogfood · stopTaskLoop 统一结束处理 settlement（AC 9）', () => {
  it('挂起态任意会话可停：收口走 settle 通道 + 登记零残留', async () => {
    const built = suspendedBuild()
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {} })
    await untilSuspended(built.driver)
    const loopId = built.driver.activeAll()[0]!.id
    expect(await built.driver.stopLoop({ loopId, requesterSessionId: OTHER })).toEqual({ ok: true, stopped: true, hadInFlight: false })
    const settle = built.calls.find((c) => c.method === 'settle')
    expect(settle?.text).toContain('已按你的指令停止')
    await untilSettled(built.driver)
    expect(renderInjection(OTHER, built.registry)).toBe('')
  })
})
