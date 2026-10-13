// S1a · dispatch-core 独立单测（可拆卸壳分层验收项——「不依赖工具面装配」）：
// dispatchCore(deps, exec, args) 直调——零 createDispatchTaskTool / 零 args 解析 /
// 零 ToolExecFace。覆盖 claim→组装→spawn→事件发射主链 + guard 机械的 guardKey
// 参数化（decisions #18：粘性载体 = guard 键而非会话 id——工具壳填会话 id、循环填
// LoopInstanceId，两消费者互不污染）+ 后台 dispatched 回执与 job 内防线回灌。
// spawn 面全桩（SpawnWorker 缝）；工具壳侧行为由 tools/dispatch-task.test.ts 既有套件守护。
import { describe, expect, it } from 'vitest'
import type {
  ClaimTaskResult,
  ForgePluginEvent,
  ForgeTasksService,
  QueryTaskResult,
  TaskSnapshot,
  TaskStats,
  TaskStatus,
  TaskType,
} from '@dsh-forge/contracts'
import { dispatchCore } from './core.js'
import type { DispatchCoreArgs, DispatchCoreDeps, DispatchCoreExec } from './core.js'
import type { ForgeEventSink } from '../events/sink.js'
import type { DispatchJobsFace, DispatchJobSpec, DispatchJobHooks } from '../faces.js'
import type { SpawnWorkerHandle, SpawnWorkerRequest } from './spawn.js'

// ─────────────────────────── 夹具 ───────────────────────────

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

/** 事件捕获 sink 桩（零 I/O；prepare 不入核心面——核心面仅 emit） */
function sinkStub(): { sink: ForgeEventSink; events: ForgePluginEvent[] } {
  const events: ForgePluginEvent[] = []
  return {
    events,
    sink: {
      emit: (e) => events.push(e),
      prepare: async () => {},
      dirOf: () => undefined,
      remember: () => {},
    },
  }
}

function okHandle(workerSessionId = 'worker-1'): SpawnWorkerHandle {
  return {
    workerSessionId,
    result: Promise.resolve({ stopReason: 'completed', output: 'done' }),
    dispose: async () => {},
  }
}

interface Harness {
  deps: DispatchCoreDeps
  events: ForgePluginEvent[]
  calls: { claim: number; stats: number; query: number; list: number; submit: number }
  claimInputs: unknown[]
  statsInputs: unknown[]
  spawnRequests: SpawnWorkerRequest[]
  setClaim(result: ClaimTaskResult): void
  setQuery(result: QueryTaskResult): void
  setStats(stats: TaskStats): void
  setCards(cards: { slug: string; localId: string; sourceTask?: { slug: string; localId: string } }[]): void
  setSpawn(impl: (req: SpawnWorkerRequest) => Promise<SpawnWorkerHandle>): void
}

function harness(
  options: {
    settings?: { get(): Promise<unknown> }
    resolveModelReasoning?: (provider: string, model: string) => Promise<readonly string[] | undefined>
    jobs?: DispatchJobsFace
  } = {},
): Harness {
  const { sink, events } = sinkStub()
  const calls = { claim: 0, stats: 0, query: 0, list: 0, submit: 0 }
  const claimInputs: unknown[] = []
  const statsInputs: unknown[] = []
  const spawnRequests: SpawnWorkerRequest[] = []
  let claimResult: ClaimTaskResult = { task: snapshot(), dispatchPrompt: 'PERSONA + <task-context>', persona: 'PERSONA-MATRIX', digest: 'digestabc123', reclaimed: false }
  let queryResult: QueryTaskResult = {
    task: snapshot({ taskStatus: 'completed' }),
    container: { kind: 'feature', slug: 'feat-x', title: 'feat-x' },
    records: [
      { verb: 'submit', toStatus: 'completed', summary: 'did the thing', commitHash: 'abc1234', actor: 'plugin-tool', createdAt: '2026-10-11T01:00:00.000Z' },
    ],
  }
  let statsResult: TaskStats = statsOf({ pending: 1, blocked: 1, unmetPending: 2 })
  let cards: { slug: string; localId: string; sourceTask?: { slug: string; localId: string } }[] = []
  let spawnImpl: (req: SpawnWorkerRequest) => Promise<SpawnWorkerHandle> = async (req) => {
    spawnRequests.push(req)
    return okHandle()
  }
  const tasks = {
    claimTask: async (input: unknown) => {
      claimInputs.push(input)
      calls.claim += 1
      return claimResult
    },
    taskStats: async (input: unknown) => {
      statsInputs.push(input)
      calls.stats += 1
      return statsResult
    },
    queryTask: async () => {
      calls.query += 1
      return queryResult
    },
    listTasks: async () => {
      calls.list += 1
      return cards.map((c) => ({
        taskId: `card-${c.localId}`,
        slug: c.slug,
        localId: c.localId,
        title: `Task ${c.localId}`,
        taskType: 'coding-fix' as TaskType,
        taskStatus: 'pending' as TaskStatus,
        prerequisites: [],
        sessionCount: 0,
        ...(c.sourceTask !== undefined ? { sourceTask: c.sourceTask } : {}),
      }))
    },
    submitTask: async () => {
      calls.submit += 1
      throw new Error('dispatchCore must not submit on any path (spawn failure leaves in_progress)')
    },
  } as unknown as ForgeTasksService
  const deps: DispatchCoreDeps = {
    tasks,
    events: sink,
    ...(options.settings !== undefined ? { settings: options.settings as DispatchCoreDeps['settings'] } : {}),
    ...(options.resolveModelReasoning !== undefined ? { resolveModelReasoning: options.resolveModelReasoning } : {}),
    ...(options.jobs !== undefined ? { jobs: options.jobs } : {}),
    spawn: (req) => spawnImpl(req),
  }
  return {
    deps,
    events,
    calls,
    claimInputs,
    statsInputs,
    spawnRequests,
    setClaim: (r) => {
      claimResult = r
    },
    setQuery: (r) => {
      queryResult = r
    },
    setStats: (s) => {
      statsResult = s
    },
    setCards: (c) => {
      cards = c
    },
    setSpawn: (impl2) => {
      spawnImpl = impl2
    },
  }
}

/** 核心执行上下文（循环形态：parent = 真 Agent 透传位；attribution 槽由调用方持有） */
function execOf(): { exec: DispatchCoreExec; attribution: { slug?: string } } {
  const attribution: { slug?: string } = {}
  return {
    attribution,
    exec: { attribution, parent: { agentTag: 'parent-session' }, signal: undefined, verb: 'dispatchTask' },
  }
}

/** 循环形态入参（S1 循环驱动器的未来调用形状：主会话真实 id + loopSourced + 实例键） */
function loopArgs(over: Partial<DispatchCoreArgs> = {}): DispatchCoreArgs {
  return {
    identity: { sessionId: 'loop-owner-1', loopSourced: true },
    guardKey: 'loop-instance-1',
    projectId: 'p-1',
    ...(over.source !== undefined ? { source: over.source } : {}),
    ...(over.runInBackground !== undefined ? { runInBackground: over.runInBackground } : {}),
    ...over,
  }
}

/** jobs 面桩（后台径——spec/hooks 捕获；jobId 递增签发） */
function jobsStub(): { jobs: DispatchJobsFace; specs: DispatchJobSpec[]; hooks: DispatchJobHooks[] } {
  const specs: DispatchJobSpec[] = []
  const hooks: DispatchJobHooks[] = []
  let seq = 0
  return {
    specs,
    hooks,
    jobs: {
      start: (spec) => {
        seq += 1
        specs.push(spec)
        hooks.push(spec.run({ appendLog: () => {} }))
        return { jobId: `forge-dispatch-${seq}` }
      },
    },
  }
}

/** 可控终态句柄桩（后台径——result 由测试手动 resolve/reject） */
function controlledHandle(workerSessionId = 'worker-bg'): SpawnWorkerHandle & {
  release(result: { stopReason: string; output: string }): void
  reject(cause: unknown): void
} {
  let settle!: (r: { stopReason: string; output: string }) => void
  let fail!: (cause: unknown) => void
  const result = new Promise<{ stopReason: string; output: string }>((resolve, reject) => {
    settle = resolve
    fail = reject
  })
  return {
    workerSessionId,
    result,
    dispose: async () => {},
    release: settle,
    reject: fail,
  }
}

// ─────────────────────────── 主链：claim → 组装 → spawn → 事件发射 ───────────────────────────

describe('dispatchCore 主链（claim→组装→spawn→事件发射）', () => {
  it('spawned·success：claim 入参（真实会话 id + source 透传）+ spawn 组装（全文 prompt/label/toolFilter/parent）+ 事件三连（信封 = identity.sessionId）', async () => {
    const h = harness()
    const { exec, attribution } = execOf()
    const parent = { agentTag: 'parent-session' }
    const out = await dispatchCore(h.deps, { ...exec, parent }, loopArgs({ source: { kind: 'feature', slug: 'feat-x' } }))
    // claim：身份 = identity.sessionId（主会话真实 id——非合成身份）；source 对透传；
    // S3 落地：loopSourced=true → claimTask 携带标记位（claim 记录 loop_sourced 持久痕迹）
    expect(h.claimInputs).toEqual([
      {
        projectId: 'p-1',
        sessionId: 'loop-owner-1',
        source: { kind: 'feature', slug: 'feat-x' },
        loopSourced: true,
      },
    ])
    // spawn 组装：全文 prompt + label（任务键 · 任务名）+ 收窄 deny + parent 透传
    expect(h.spawnRequests).toHaveLength(1)
    const req = h.spawnRequests[0]!
    expect(req.prompt).toBe('PERSONA + <task-context>')
    expect(req.label).toBe('feat-x/2.5 · Implement the thing')
    // S2 分层承载：persona = compose 产出（taskType+complexity 消费）经 persona 字段透传；
    // 任务面/人格面分层——personaText 不进 prompt（AC-4）
    expect(req.persona).toBe('PERSONA-MATRIX')
    expect(req.prompt).not.toContain(req.persona!)
    expect(req.parent).toBe(parent)
    expect(req.signal).toBeInstanceOf(AbortSignal)
    expect(req.toolFilter.deny).toEqual(expect.arrayContaining(['ask_user_question', 'subagent_fork', 'queryTask', 'dispatchTask']))
    // 事件发射：三连信封 sessionId = identity.sessionId、slug = 任务容器
    expect(h.events.map((e) => e.type)).toEqual(['task-claimed', 'task-spawned', 'task-worker-done'])
    const [claimed, spawned, done] = h.events as unknown as [
      { sessionId: string; slug: string; payload: { taskKey: string; dispatchDigest: string; taskType: string } },
      { payload: { workerSessionId: string; model: string } },
      { payload: { outcome: string; durationMs: number } },
    ]
    expect(claimed.sessionId).toBe('loop-owner-1')
    expect(claimed.slug).toBe('feat-x')
    expect(claimed.payload).toMatchObject({ taskKey: 'feat-x/2.5', taskType: 'coding-fix', dispatchDigest: 'digestabc123' })
    expect(spawned.payload).toMatchObject({ workerSessionId: 'worker-1', model: 'inherit' })
    expect(done.payload).toMatchObject({ outcome: 'success' })
    expect(done.payload.durationMs).toBeGreaterThanOrEqual(0)
    // 结果 + 归属槽（claim 后 = 任务容器——壳失败回调可见性）
    expect(out).toMatchObject({
      kind: 'spawned',
      outcome: 'success',
      taskRef: { slug: 'feat-x', localId: '2.5' },
      digest: 'digestabc123',
      pool: { pending: 1, inProgress: 0, blocked: 1, unmetPending: 2 },
    })
    expect(attribution.slug).toBe('feat-x')
  })

  it('组装落面：forgeSettings → agentOptions 显式携带；档位不受支持 → 剥离 effort（组装面兼容收口）', async () => {
    const h = harness({
      settings: { get: async () => ({ worker: { provider: 'deepseek', model: 'reasoner', reasoning: 'medium' } }) },
      resolveModelReasoning: async () => ['low', 'high', 'max'],
    })
    const { exec } = execOf()
    await dispatchCore(h.deps, exec, loopArgs())
    expect(h.spawnRequests[0]?.agentOptions).toEqual({ provider: 'deepseek', model: 'reasoner' }) // medium 不在支持集 → 剥离
  })

  it('no-task：池快照 + no-ready-task 事件（source 对归属）+ 归属槽保持 source 语境', async () => {
    const h = harness()
    const { exec, attribution } = execOf()
    h.setClaim({ task: null, dispatchPrompt: '', persona: 'PERSONA-MATRIX', digest: '', reclaimed: false })
    h.setStats(statsOf({ pending: 3, blocked: 1, unmetPending: 2 }))
    const out = await dispatchCore(h.deps, exec, loopArgs({ source: { kind: 'proposal', slug: 'pa' } }))
    expect(out).toEqual({ kind: 'no-task', pool: { pending: 3, inProgress: 0, blocked: 1, unmetPending: 2 } })
    expect(h.events).toHaveLength(1)
    expect(h.events[0]).toMatchObject({ type: 'no-ready-task', sessionId: 'loop-owner-1', slug: 'pa', payload: { contextSlug: 'pa' } })
    expect(attribution.slug).toBe('pa')
  })
})

// ─────────────────────────── S3：adopt 定向领取 + 循环来源标记（恢复径接线） ───────────────────────────

describe('dispatchCore S3 接线（adopt + loopSourced → claimTask）', () => {
  it('adopt 在场：claimTask 携带 adopt 引用 + loopSourced（循环恢复径——定向领 earliest interrupted）', async () => {
    const h = harness()
    const { exec } = execOf()
    await dispatchCore(
      h.deps,
      exec,
      loopArgs({ adopt: { slug: 'feat-x', localId: '2.5' } }),
    )
    expect(h.claimInputs).toEqual([
      {
        projectId: 'p-1',
        sessionId: 'loop-owner-1',
        adopt: { slug: 'feat-x', localId: '2.5' },
        loopSourced: true,
      },
    ])
  })

  it('工具壳形态（loopSourced=false、无 adopt）：claimTask 零新键（dispatchTask schema 与外部语义零变化）', async () => {
    const h = harness()
    const { exec, attribution } = execOf()
    await dispatchCore(h.deps, exec, {
      identity: { sessionId: 's-shell', loopSourced: false },
      guardKey: 's-shell',
      projectId: 'p-1',
    })
    expect(h.claimInputs).toEqual([{ projectId: 'p-1', sessionId: 's-shell' }])
    expect(attribution.slug).toBe('feat-x') // claim 后归属槽 = 任务容器（默认桩领取 feat-x/2.5）
  })

  it('loopSourced=true 无 adopt（循环常规领取）：仅标记位落面——就绪盲选语义零变化', async () => {
    const h = harness()
    const { exec } = execOf()
    await dispatchCore(h.deps, exec, loopArgs())
    expect(h.claimInputs).toEqual([
      { projectId: 'p-1', sessionId: 'loop-owner-1', loopSourced: true },
    ])
  })
})

// ─────────────────────────── guard 机械（guardKey 参数化——decisions #18） ───────────────────────────

describe('dispatchCore guard 机械（guardKey 参数化）', () => {
  it('3 连败粘住 guardKey：第 3 次返回 halted + 入口检查冻结 claim；同会话换 guardKey 即恢复（粘性载体 = guard 键非会话）', async () => {
    const h = harness()
    const { exec } = execOf()
    h.setSpawn(async () => {
      throw new Error('boom')
    })
    const r1 = await dispatchCore(h.deps, exec, loopArgs({ guardKey: 'loop-A' }))
    const r2 = await dispatchCore(h.deps, exec, loopArgs({ guardKey: 'loop-A' }))
    expect(r1).toMatchObject({ ok: false, code: 'ERR_SPAWN_FAILED' })
    expect(r2).toMatchObject({ ok: false, code: 'ERR_SPAWN_FAILED' })
    const r3 = await dispatchCore(h.deps, exec, loopArgs({ guardKey: 'loop-A' }))
    expect(r3).toEqual({ kind: 'halted', reason: expect.stringContaining('3 consecutive') })
    const claimsBefore = h.calls.claim
    const r4 = await dispatchCore(h.deps, exec, loopArgs({ guardKey: 'loop-A' }))
    expect(r4).toEqual({ kind: 'halted', reason: expect.stringContaining('3 consecutive') })
    expect(h.calls.claim).toBe(claimsBefore) // 粘住：入口即拒，不再 claim
    // 同一身份会话、另一循环实例键：零波及（循环实例 guard 与会话/他实例互不污染）
    h.setSpawn(async (req) => {
      h.spawnRequests.push(req)
      return okHandle()
    })
    const other = await dispatchCore(h.deps, exec, loopArgs({ guardKey: 'loop-B' }))
    expect(other).toMatchObject({ kind: 'spawned', outcome: 'success' })
  })

  it('成功结算即清零 streak：败×2 → 成功 → 再败仍 ERR_SPAWN_FAILED（未粘住）', async () => {
    const h = harness()
    const { exec } = execOf()
    const key = { guardKey: 'loop-streak-1' }
    h.setSpawn(async () => {
      throw new Error('boom')
    })
    await dispatchCore(h.deps, exec, loopArgs(key))
    await dispatchCore(h.deps, exec, loopArgs(key))
    h.setSpawn(async (req) => {
      h.spawnRequests.push(req)
      return okHandle()
    })
    const ok = await dispatchCore(h.deps, exec, loopArgs(key))
    expect(ok).toMatchObject({ kind: 'spawned', outcome: 'success' })
    h.setSpawn(async () => {
      throw new Error('boom again')
    })
    const after = await dispatchCore(h.deps, exec, loopArgs(key))
    expect(after).toMatchObject({ ok: false, code: 'ERR_SPAWN_FAILED' }) // streak 已清零
  })
})

// ─────────────────────────── 后台径（jobs 包装 + 结算后置 + job 内防线回灌） ───────────────────────────

describe('dispatchCore 后台径（dispatched 回执 + job 内回灌进 guardKey streak）', () => {
  it('runInBackground=true：立即返回四键回执（结算读零触达）；job done 后回灌——同 guardKey 前台再败 ×2 即 halted', async () => {
    const js = jobsStub()
    const h = harness({ jobs: js.jobs })
    const { exec } = execOf()
    const key = { guardKey: 'loop-bg-1' }
    let latest!: ReturnType<typeof controlledHandle>
    h.setSpawn(async (req) => {
      h.spawnRequests.push(req)
      latest = controlledHandle()
      return latest
    })
    const out = await dispatchCore(h.deps, exec, loopArgs({ ...key, runInBackground: true }))
    expect(out).toEqual({
      kind: 'dispatched',
      taskRef: { slug: 'feat-x', localId: '2.5' },
      title: 'Implement the thing',
      type: 'coding-fix',
      workerSessionId: 'worker-bg',
      jobId: 'forge-dispatch-1',
      pool: { pending: 1, inProgress: 0, blocked: 1, unmetPending: 2 },
    })
    expect(h.calls.query).toBe(0) // 立即返回：结算读零触达
    latest.reject(new Error('bg boom'))
    const done = await js.hooks[0]!.done
    expect(done.status).toBe('failed') // job 内回灌 #1（guardKey streak）
    // 前台再败 ×2：同 guardKey 结算序 streak 达 3 → halted 粘住
    h.setSpawn(async () => {
      throw new Error('fg boom')
    })
    const f1 = await dispatchCore(h.deps, exec, loopArgs({ ...key, runInBackground: false }))
    expect(f1).toMatchObject({ ok: false, code: 'ERR_SPAWN_FAILED' })
    const f2 = await dispatchCore(h.deps, exec, loopArgs(key))
    expect(f2).toEqual({ kind: 'halted', reason: expect.stringContaining('3 consecutive') })
  })
})

// ─────────────────────────── scoped 池快照口径 + 重入标识（run-tasks-host-command/1.10） ───────────────────────────

describe('scoped 池快照口径 + 重入标识（1.10：快照分流 taskStats(source) + claimed.reclaimed → reEntered）', () => {
  it('scoped 调用：taskStats 查询携带 source（四计数 = 容器口径）——no-task 读与结算 spawned 读同口径', async () => {
    // no-task 读
    const h = harness()
    h.setClaim({ task: null, dispatchPrompt: '', persona: 'PERSONA-MATRIX', digest: '', reclaimed: false })
    await dispatchCore(h.deps, execOf().exec, loopArgs({ source: { kind: 'proposal', slug: 'pa' } }))
    expect(h.statsInputs).toEqual([{ projectId: 'p-1', source: { kind: 'proposal', slug: 'pa' } }])
    // 结算 spawned 读（settle 结算核）
    const h2 = harness()
    await dispatchCore(h2.deps, execOf().exec, loopArgs({ source: { kind: 'feature', slug: 'feat-x' } }))
    expect(h2.statsInputs).toEqual([{ projectId: 'p-1', source: { kind: 'feature', slug: 'feat-x' } }])
  })

  it('后台 dispatched 读同口径：runInBackground=true 的池快照读亦携带 source', async () => {
    const js = jobsStub()
    const h = harness({ jobs: js.jobs })
    h.setSpawn(async (req) => {
      h.spawnRequests.push(req)
      return { workerSessionId: 'worker-bg', result: new Promise(() => {}), dispose: async () => {} } // 永不结算
    })
    await dispatchCore(h.deps, execOf().exec, loopArgs({ source: { kind: 'feature', slug: 'feat-x' }, runInBackground: true }))
    expect(h.statsInputs).toEqual([{ projectId: 'p-1', source: { kind: 'feature', slug: 'feat-x' } }])
  })

  it('非 scoped 调用：taskStats 查询不含 source 键（全池口径零变化）', async () => {
    const h = harness()
    h.setClaim({ task: null, dispatchPrompt: '', persona: 'PERSONA-MATRIX', digest: '', reclaimed: false })
    await dispatchCore(h.deps, execOf().exec, loopArgs())
    expect(h.statsInputs).toHaveLength(1)
    expect(h.statsInputs[0]).not.toHaveProperty('source')
  })

  it('重入标识：claim reclaimed=true → dispatched 回执携带 reEntered=true；新领取零 reEntered 键', async () => {
    const js = jobsStub()
    const h = harness({ jobs: js.jobs })
    h.setSpawn(async (req) => {
      h.spawnRequests.push(req)
      return { workerSessionId: 'worker-bg', result: new Promise(() => {}), dispose: async () => {} } // 永不结算——回执即证
    })
    h.setClaim({ task: snapshot(), dispatchPrompt: 'P', persona: 'PERSONA-MATRIX', digest: 'd2', reclaimed: true })
    const reentered = await dispatchCore(h.deps, execOf().exec, loopArgs({ runInBackground: true }))
    expect(reentered).toMatchObject({ kind: 'dispatched', reEntered: true })
    // 新领取（reclaimed=false）：回执零重入键
    h.setClaim({ task: snapshot(), dispatchPrompt: 'P', persona: 'PERSONA-MATRIX', digest: 'd3', reclaimed: false })
    const fresh = await dispatchCore(h.deps, execOf().exec, loopArgs({ runInBackground: true }))
    expect(fresh).toMatchObject({ kind: 'dispatched', jobId: 'forge-dispatch-2' })
    expect(fresh).not.toHaveProperty('reEntered')
  })
})
