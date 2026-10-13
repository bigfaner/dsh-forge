// 3.4 单测 —— dispatchTask 复合派发动词全场景表（tech-design Interface 2 + 图 2/3/4）：
// 四分支（spawned·success/blocked、no-task 池态三分、halted 粘住、spawn 失败）+
// 组装序（矩阵→toolFilter、forgeSettings→agentOptions 两态、dispatchPrompt 全文透传）+
// 池快照附载 + 事件发射（task-claimed/spawned/worker-done/no-ready-task/tool-error，
// dispatchDigest 双记）+ 计数器行为（3 连败粘住/成功清零/冷启动重置）。
// spawn 面全桩（SpawnWorker 缝——真绑定 spawn/in-process-driver.ts 由 boot 冒烟联证）。
import { afterEach, describe, expect, it, vi } from 'vitest'
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
import { TASK_TYPES, WORKER_FORGE_TOOLS } from '@dsh-forge/contracts'
import { adaptDispatchJobs } from '../faces.js'
import type { DispatchJobHooks, DispatchJobSpec, DispatchJobsFace, DispatchJobsRegistryFace, ToolExecFace } from '../faces.js'
import type { ForgeEventSink } from '../events/sink.js'
import { deriveTriageToolFilter } from '../dispatch-core/assemble.js'
import { FORGE_TOOL_NAMES } from './index.js'
import {
  classifyPool,
  createDispatchTaskTool,
  deriveWorkerToolFilter,
  parseDispatchTaskArgs,
  poolOf,
  reconcileWorkerReasoning,
  workerAgentOptionsOf,
  type DispatchTaskResult,
  type SpawnWorkerHandle,
  type SpawnWorkerRequest,
} from './dispatch-task.js'
import type { DispatchTaskToolDeps } from './dispatch-task.js'

// ─────────────────────────── 夹具 ───────────────────────────

/** 会话唯一后缀（模块级计数器——SPAWN_FAILURES 会话作用域，跨用例零污染） */
let sessionSeq = 0
function execOf(): ToolExecFace {
  sessionSeq += 1
  return { agent: { session: { id: `dispatch-${sessionSeq}`, header: { cwd: 'C:\\ws\\demo' } } } }
}

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
    createdAt: '2026-10-07T00:00:00.000Z',
    updatedAt: '2026-10-07T00:00:00.000Z',
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

/** 事件捕获 sink 桩（零 I/O；prepare no-op） */
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

/** 成功 spawn 桩句柄 */
function okHandle(): SpawnWorkerHandle {
  return {
    workerSessionId: 'worker-1',
    result: Promise.resolve({ stopReason: 'completed', output: 'done' }),
    dispose: async () => {},
  }
}

interface Harness {
  tool: ReturnType<typeof createDispatchTaskTool>
  exec: ToolExecFace
  events: ForgePluginEvent[]
  calls: { claim: number; stats: number; query: number; list: number; submit: number; dispose: number }
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
  const exec = execOf()
  const { sink, events } = sinkStub()
  const calls = { claim: 0, stats: 0, query: 0, list: 0, submit: 0, dispose: 0 }
  const claimInputs: unknown[] = []
  const statsInputs: unknown[] = []
  const spawnRequests: SpawnWorkerRequest[] = []
  let claimResult: ClaimTaskResult = { task: snapshot(), dispatchPrompt: 'PERSONA + <task-context>', persona: 'PERSONA-MATRIX', digest: 'digestabc123', reclaimed: false }
  let queryResult: QueryTaskResult = {
    task: snapshot({ taskStatus: 'completed' }),
    container: { kind: 'feature', slug: 'feat-x', title: 'feat-x' },
    records: [
      { verb: 'submit', toStatus: 'completed', summary: 'did the thing', commitHash: 'abc1234', actor: 'plugin-tool', createdAt: '2026-10-07T01:00:00.000Z' },
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
      throw new Error('dispatchTask must not submit on any path (spawn failure leaves in_progress)')
    },
  } as unknown as ForgeTasksService
  const deps: DispatchTaskToolDeps = {
    tasks,
    proposals: {} as DispatchTaskToolDeps['proposals'],
    bugs: {} as DispatchTaskToolDeps['bugs'],
    resolveProjectId: (cwd) => (cwd.toLowerCase().includes('demo') ? 'p-1' : undefined),
    events: sink,
    ...(options.settings !== undefined ? { settings: options.settings as DispatchTaskToolDeps['settings'] } : {}),
    ...(options.resolveModelReasoning !== undefined ? { resolveModelReasoning: options.resolveModelReasoning } : {}),
    ...(options.jobs !== undefined ? { jobs: options.jobs } : {}),
    spawn: (req) => spawnImpl(req),
  }
  return {
    tool: createDispatchTaskTool(deps),
    exec,
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

/** jobs 面桩（后台径用例——spec/hooks/logLines 三面捕获；jobId 递增签发） */
interface JobsStub {
  jobs: DispatchJobsFace
  specs: DispatchJobSpec[]
  hooks: DispatchJobHooks[]
  logLines: string[]
}

function jobsStub(): JobsStub {
  const specs: DispatchJobSpec[] = []
  const hooks: DispatchJobHooks[] = []
  const logLines: string[] = []
  let seq = 0
  return {
    specs,
    hooks,
    logLines,
    jobs: {
      start: (spec) => {
        seq += 1
        specs.push(spec)
        hooks.push(spec.run({ appendLog: (line) => logLines.push(line) }))
        return { jobId: `forge-dispatch-${seq}` }
      },
    },
  }
}

/** 可控终态句柄桩（后台径——result 由测试手动 resolve/reject） */
interface ControlledHandle extends SpawnWorkerHandle {
  release(result: { stopReason: string; output: string }): void
  reject(cause: unknown): void
}

function controlledHandle(workerSessionId = 'worker-bg'): ControlledHandle {
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

afterEach(() => {
  vi.resetModules()
})

// ─────────────────────────── 参数与纯函数 ───────────────────────────

describe('parseDispatchTaskArgs（防御收窄）', () => {
  it('零参合法；退役参数 context_slug 落未知键零效应；类型收窄', () => {
    expect(parseDispatchTaskArgs({})).toEqual({})
    // context_slug 已退役（无任务事件归属由 source 对兼任）——未知键零效应
    expect(parseDispatchTaskArgs({ context_slug: 'feat-x' })).toEqual({})
    expect(() => parseDispatchTaskArgs(null)).toThrow(/must be an object/)
  })

  it('source 对（容器限定认领）：成对解析为 ContainerRef', () => {
    expect(parseDispatchTaskArgs({ source_kind: 'proposal', source_slug: 'pa' })).toEqual({
      source: { kind: 'proposal', slug: 'pa' },
    })
    expect(() => parseDispatchTaskArgs({ source_kind: 'feature', source_slug: 3 })).toThrow(/source_slug must be a string/)
  })

  it('source 对半对即拒（both or neither）；kind 词表收窄', () => {
    expect(() => parseDispatchTaskArgs({ source_kind: 'feature' })).toThrow(/source_kind and source_slug must be given together/)
    expect(() => parseDispatchTaskArgs({ source_slug: 'fa' })).toThrow(/source_kind and source_slug must be given together/)
    expect(() => parseDispatchTaskArgs({ source_kind: 'widget', source_slug: 'fa' })).toThrow(
      /source_kind must be one of \[feature, proposal\]/,
    )
  })

  it('run_in_background 解析：布尔透传（含 false 显式值）；缺省零键；非布尔拒', () => {
    expect(parseDispatchTaskArgs({ run_in_background: true })).toEqual({ run_in_background: true })
    expect(parseDispatchTaskArgs({ run_in_background: false })).toEqual({ run_in_background: false })
    expect(parseDispatchTaskArgs({})).not.toHaveProperty('run_in_background')
    expect(() => parseDispatchTaskArgs({ run_in_background: 'yes' })).toThrow(/run_in_background must be a boolean/)
  })
})

describe('poolOf + classifyPool（池态三分——图 3 节点 C）', () => {
  it('poolOf：byStatus 四键 + unmetPending 投影', () => {
    expect(poolOf(statsOf({ pending: 3, in_progress: 1, blocked: 2, unmetPending: 4 }))).toEqual({
      pending: 3,
      inProgress: 1,
      blocked: 2,
      unmetPending: 4,
    })
  })

  it('三分：全终态收工 / blocked 无通路疑似死锁 / 其余等待', () => {
    expect(classifyPool({ pending: 0, inProgress: 0, blocked: 0, unmetPending: 0 })).toBe('done')
    expect(classifyPool({ pending: 0, inProgress: 0, blocked: 2, unmetPending: 0 })).toBe('deadlock-suspected')
    expect(classifyPool({ pending: 0, inProgress: 1, blocked: 0, unmetPending: 0 })).toBe('wait')
    expect(classifyPool({ pending: 2, inProgress: 0, blocked: 0, unmetPending: 2 })).toBe('wait')
    // pending>0 且全满足（claim 空转竞态）→ 等待兜底
    expect(classifyPool({ pending: 1, inProgress: 0, blocked: 0, unmetPending: 0 })).toBe('wait')
  })
})

describe('deriveWorkerToolFilter（taskType → 收窄矩阵 → toolFilter）', () => {
  it('当前名表（5.1 全表——OQ#2 上游 standard 组合枚举）：全局拒绝集 + forge 闭环 + 族收窄逐型', () => {
    // 全局十 + forge 闭环八（FORGE_TOOL_NAMES − WORKER_FORGE_TOOLS + validateMermaid）为共同底座；
    // 族收窄增量 = 名表五上游族按矩阵逐格进 deny（web 仅验证放行 → 四型全 deny）
    const base = [
      'ask_user_question',
      'createProposal',
      'create_goal',
      'dispatchTask',
      'get_goal',
      'interrupt_agent',
      'list_agents',
      'listTasks',
      'present',
      'queryTask',
      'send_message',
      'subagent_fork',
      'taskStats',
      'transitionProposal',
      'update_goal',
      'updateTask',
      'validateMermaid',
      'workflow',
    ]
    // coding：web ✗（fs/shell/jobs/read-image ✓）——fix-bug 两 bug 写径（recordBug/resolveBug）
    // coding-fix worker 放行（forge 族 ✓——收窄面不含 deny 两工具）
    const codingFixDeny = deriveWorkerToolFilter('coding-fix').deny.sort()
    expect(codingFixDeny).toEqual([...base, 'web_fetch', 'web_search'].sort())
    expect(codingFixDeny).not.toContain('recordBug')
    expect(codingFixDeny).not.toContain('resolveBug')
    // doc：jobs ✗ / read-image ✗ / web ✗
    expect(deriveWorkerToolFilter('doc').deny.sort()).toEqual(
      [...base, 'job_kill', 'job_list', 'job_output', 'read_image', 'web_fetch', 'web_search'].sort(),
    )
    // gate：read-image ✗ / web ✗（jobs ✓）
    expect(deriveWorkerToolFilter('gate').deny.sort()).toEqual(
      [...base, 'read_image', 'web_fetch', 'web_search'].sort(),
    )
    // validation：全族放行——仅全局拒绝 + forge 闭环
    expect(deriveWorkerToolFilter('validation-ux').deny.sort()).toEqual([...base].sort())
  })

  it('注入名表证矩阵消费（5.1 扩名表零改动激活）：族拒绝才 deny、族放行不 deny', () => {
    const nameFamily = { 'web-search': 'web', 'jobs-run': 'jobs', screenshot: 'read-image' } as const
    // doc 族：jobs ✗ / read-image ✗ / web ✗
    expect(deriveWorkerToolFilter('doc', nameFamily).deny).toEqual(expect.arrayContaining(['web-search', 'jobs-run', 'screenshot']))
    // gate 族：jobs ✓ / read-image ✗ / web ✗
    expect(deriveWorkerToolFilter('gate', nameFamily).deny).toEqual(expect.arrayContaining(['web-search', 'screenshot']))
    expect(deriveWorkerToolFilter('gate', nameFamily).deny).not.toContain('jobs-run')
    // coding 族：read-image ✓ / jobs ✓ / web ✗
    expect(deriveWorkerToolFilter('coding-feature', nameFamily).deny).toEqual(expect.arrayContaining(['web-search']))
    expect(deriveWorkerToolFilter('coding-feature', nameFamily).deny).not.toContain('jobs-run')
    expect(deriveWorkerToolFilter('coding-feature', nameFamily).deny).not.toContain('screenshot')
    // validation 族：全放——仅全局拒绝 + forge 闭环
    expect(deriveWorkerToolFilter('validation-code', nameFamily).deny).not.toContain('web-search')
  })

  it('forge 闭环同步守护：FORGE_TOOL_NAMES ∪ dispatchTask − WORKER_FORGE_TOOLS 全覆盖入 deny（worker 与 triage 两面）', () => {
    const workerDeny = new Set(deriveWorkerToolFilter('doc').deny)
    const triageDeny = new Set(deriveTriageToolFilter().deny)
    for (const name of FORGE_TOOL_NAMES) {
      if ((WORKER_FORGE_TOOLS as readonly string[]).includes(name)) continue
      expect(workerDeny.has(name), `${name} 应入 worker deny（forge 族四动词之外不可见）`).toBe(true)
      expect(triageDeny.has(name), `${name} 应入 triage deny（仅主 agent 面）`).toBe(true)
    }
    expect(workerDeny.has('submitTask')).toBe(false)
    expect(workerDeny.has('addTask')).toBe(false)
    // fix-bug 两 bug 写径：worker 面（forge 族四动词）+ triage 面（仅决策不执行——deny）分治
    expect(workerDeny.has('recordBug')).toBe(false)
    expect(workerDeny.has('resolveBug')).toBe(false)
    expect(triageDeny.has('recordBug')).toBe(true)
    expect(triageDeny.has('resolveBug')).toBe(true)
  })

  it('validateMermaid deny（md-mermaid 插件工具仅主 agent——全 taskType + triage 全收窄形）', () => {
    for (const t of TASK_TYPES) {
      expect(deriveWorkerToolFilter(t).deny, `${t} worker deny 应含 validateMermaid`).toContain('validateMermaid')
    }
    expect(deriveTriageToolFilter().deny).toContain('validateMermaid')
  })

  it('contracts 矩阵单源：WORKER_FORGE_TOOLS 四动词（submitTask/addTask + 两 bug 写径）——fix-bug worker 放行钉住', () => {
    expect([...WORKER_FORGE_TOOLS]).toEqual(['submitTask', 'addTask', 'recordBug', 'resolveBug'])
  })
})

describe('workerAgentOptionsOf + reconcileWorkerReasoning（forgeSettings → agentOptions）', () => {
  it('未配置/服务缺席 = undefined（不携带——回退父会话继承）；配置 = reasoning→effort 直映射', () => {
    expect(workerAgentOptionsOf(undefined)).toBeUndefined()
    expect(workerAgentOptionsOf({})).toBeUndefined()
    expect(
      workerAgentOptionsOf({ worker: { provider: 'deepseek', model: 'reasoner', reasoning: 'high' } }),
    ).toEqual({ provider: 'deepseek', model: 'reasoner', reasoningEffort: 'high' })
  })

  it("reasoning='default'（默认值档）：携带 provider/model 但不下发 effort", () => {
    expect(workerAgentOptionsOf({ worker: { provider: 'zai-coding-cn', model: 'glm-5.3-flash', reasoning: 'default' } })).toEqual({
      provider: 'zai-coding-cn',
      model: 'glm-5.3-flash',
    })
  })

  it('reconcile：目录已知且档位受支持 → 原样；不支持 → 剥离 effort（无法兼容就不设置）', async () => {
    const kept = { provider: 'p', model: 'm', reasoningEffort: 'high' as const }
    const dropped = { provider: 'p', model: 'm', reasoningEffort: 'medium' as const }
    await expect(reconcileWorkerReasoning(kept, async () => ['low', 'high', 'max'])).resolves.toEqual(kept)
    await expect(reconcileWorkerReasoning(dropped, async () => ['low', 'high', 'max'])).resolves.toEqual({
      provider: 'p',
      model: 'm',
    })
  })

  it('reconcile：目录不可知（undefined/解析拒绝/解析器缺席）→ 原样携带不判', async () => {
    const options = { provider: 'p', model: 'm', reasoningEffort: 'medium' as const }
    await expect(reconcileWorkerReasoning(options, undefined)).resolves.toBe(options)
    await expect(reconcileWorkerReasoning(options, async () => undefined)).resolves.toBe(options)
    await expect(reconcileWorkerReasoning(options, async () => { throw new Error('resolve failed') })).resolves.toBe(options)
  })

  it('reconcile：effort 缺席（default 档/未配置）→ 恒原样（无需判）', async () => {
    const options = { provider: 'p', model: 'm' }
    await expect(reconcileWorkerReasoning(options, async () => [])).resolves.toBe(options)
    await expect(reconcileWorkerReasoning(undefined, async () => [])).resolves.toBeUndefined()
  })
})

// ─────────────────────────── 四分支全场景表 ───────────────────────────

describe('execute 四分支（AC1）', () => {
  it('spawned·success：结算字段齐备 + 池快照附载 + 渲染 ✓ 行', async () => {
    const h = harness()
    const out = (await h.tool.execute({}, h.exec)) as Exclude<DispatchTaskResult, { ok: false }>
    expect(out).toMatchObject({
      kind: 'spawned',
      outcome: 'success',
      taskRef: { slug: 'feat-x', localId: '2.5' },
      title: 'Implement the thing',
      type: 'coding-fix',
      digest: 'digestabc123',
      summary: 'did the thing',
      commitHash: 'abc1234',
      pool: { pending: 1, inProgress: 0, blocked: 1, unmetPending: 2 },
    })
    const text = h.tool.output.render({}, out)[0]?.text ?? ''
    expect(text).toContain('✓ feat-x/2.5 completed — coding-fix · did the thing · commit abc1234')
    expect(text).toContain('- pool: pending 1 · in_progress 0 · blocked 1 · unmet-pending 2')
  })

  it('spawned·blocked：原因行 + followUp（最新 fix 任务）+ 渲染 ⚑ 行', async () => {
    const h = harness()
    h.setClaim({ task: snapshot({ localId: '2.4' }), dispatchPrompt: 'P', persona: 'PERSONA-MATRIX', digest: 'd42', reclaimed: false })
    h.setQuery({
      task: snapshot({ localId: '2.4', taskStatus: 'blocked', blockedReason: 'missing API key' }),
      container: { kind: 'feature', slug: 'feat-x', title: 'feat-x' },
      records: [{ verb: 'submit', toStatus: 'blocked', reason: 'missing API key', actor: 'plugin-tool', createdAt: '2026-10-07T01:00:00.000Z' }],
    })
    // listTasks(sort:'created') 服务契约 = 最新在前——桩按服务序给卡（fix-2 最新）
    h.setCards([
      { slug: 'feat-x', localId: 'fix-2', sourceTask: { slug: 'feat-x', localId: '2.4' } },
      { slug: 'feat-x', localId: 'fix-1', sourceTask: { slug: 'feat-x', localId: '2.4' } },
    ])
    const out = (await h.tool.execute({}, h.exec)) as Exclude<DispatchTaskResult, { ok: false }>
    expect(out).toMatchObject({ kind: 'spawned', outcome: 'blocked', reason: 'missing API key' })
    // created 降序 → 首个命中 = 最新 fix-2
    expect((out as { followUp?: { localId: string } }).followUp).toEqual({ slug: 'feat-x', localId: 'fix-2' })
    const text = h.tool.output.render({}, out)[0]?.text ?? ''
    expect(text).toContain('⚑ feat-x/2.4 blocked — missing API key')
    expect(text).toContain('- follow-up fix task: feat-x/fix-2 (dispatchable)')
  })

  it('no-task：池快照 + no-ready-task 事件（source 对容器归属——载荷 contextSlug = source_slug）+ 渲染 · 行带三分判词', async () => {
    const h = harness()
    h.setClaim({ task: null, dispatchPrompt: '', persona: 'PERSONA-MATRIX', digest: '', reclaimed: false })
    h.setStats(statsOf({ pending: 3, blocked: 1, unmetPending: 2 }))
    const out = (await h.tool.execute({ source_kind: 'feature', source_slug: 'feat-x' }, h.exec)) as Exclude<DispatchTaskResult, { ok: false }>
    expect(out).toEqual({ kind: 'no-task', pool: { pending: 3, inProgress: 0, blocked: 1, unmetPending: 2 } })
    const text = h.tool.output.render({}, out)[0]?.text ?? ''
    expect(text).toContain('· no ready task (pool: pending 3 · in_progress 0 · blocked 1 · unmet-pending 2)')
    expect(text).toContain('retry later')
    expect(h.events.map((e) => e.type)).toEqual(['no-ready-task'])
    expect(h.events[0]).toMatchObject({ slug: 'feat-x', payload: { contextSlug: 'feat-x' } })
  })

  it('no-task 无 source 对：归属回落 _pool', async () => {
    const h = harness()
    h.setClaim({ task: null, dispatchPrompt: '', persona: 'PERSONA-MATRIX', digest: '', reclaimed: false })
    h.setStats(statsOf())
    await h.tool.execute({}, h.exec)
    expect(h.events[0]).toMatchObject({ slug: '_pool', payload: {} })
    const text = h.tool.output.render({}, { kind: 'no-task', pool: { pending: 0, inProgress: 0, blocked: 0, unmetPending: 0 } })[0]?.text ?? ''
    expect(text).toContain('pool all settled — wrap up')
  })

  it('no-task 三分渲染：疑似死锁判词', () => {
    const text =
      h_render({ kind: 'no-task', pool: { pending: 0, inProgress: 0, blocked: 2, unmetPending: 0 } })
    expect(text).toContain('suspected deadlock')
  })

  it('spawn 失败：ERR_SPAWN_FAILED 失败 DTO + 人话 + 指引（带 taskRef 重入/人工转移）+ tool-error 事件', async () => {
    const h = harness()
    h.setSpawn(async () => {
      throw new Error('child creation rejected')
    })
    const out = (await h.tool.execute({}, h.exec)) as { ok: boolean; code: string; message: string; violations: string[] }
    expect(out.ok).toBe(false)
    expect(out.code).toBe('ERR_SPAWN_FAILED')
    expect(out.message).toContain('worker spawn failed for feat-x/2.5')
    expect(out.message).toContain('child creation rejected')
    expect(out.violations.some((v) => v.includes('feat-x/2.5') && v.includes('re-enter'))).toBe(true)
    expect(out.violations.some((v) => v.includes('manually'))).toBe(true)
    const text = h.tool.output.render({}, out)[0]?.text ?? ''
    expect(text.startsWith('✗ ERR_SPAWN_FAILED — ')).toBe(true)
    expect(h.events.map((e) => e.type)).toEqual(['task-claimed', 'tool-error'])
    expect(h.events[1]).toMatchObject({ type: 'tool-error', payload: { verb: 'dispatchTask', code: 'ERR_SPAWN_FAILED' } })
  })

  it('spawn 失败不走 submit-blocked：任务留 in_progress（零 submitTask 调用）', async () => {
    const h = harness()
    h.setSpawn(async () => {
      throw new Error('boom')
    })
    await h.tool.execute({}, h.exec)
    expect(h.calls.submit).toBe(0)
  })

  it('worker run 完成但无结算（refusal/漏提交）：同 spawn 失败径（执行受阻语义）', async () => {
    const h = harness()
    h.setSpawn(async (req) => {
      h.spawnRequests.push(req)
      return {
        workerSessionId: 'worker-9',
        result: Promise.resolve({ stopReason: 'refusal', output: '' }),
        dispose: async () => {},
      }
    })
    h.setQuery({
      task: snapshot({ taskStatus: 'in_progress' }),
      container: { kind: 'feature', slug: 'feat-x', title: 'feat-x' },
    })
    const out = (await h.tool.execute({}, h.exec)) as { code: string; message: string }
    expect(out.code).toBe('ERR_SPAWN_FAILED')
    expect(out.message).toContain('without a settlement (stopReason: refusal)')
    expect(h.calls.submit).toBe(0)
  })

  it('run.result 拒绝（基建故障）：同 spawn 失败径', async () => {
    const h = harness()
    h.setSpawn(async (req) => {
      h.spawnRequests.push(req)
      return {
        workerSessionId: 'worker-8',
        result: Promise.reject(new Error('infra fault')),
        dispose: async () => {},
      }
    })
    const out = (await h.tool.execute({}, h.exec)) as { code: string }
    expect(out.code).toBe('ERR_SPAWN_FAILED')
  })
})

// ─────────────────────────── run_in_background 降级守卫（async-dispatch §7 任务 1.2） ───────────────────────────

describe('run_in_background 降级守卫（jobs 面可选——缺席 = 拒绝并提示，events/settings 同型降级）', () => {
  it('jobs 缺席：后台调用被拒绝并提示——失败 DTO（人话 + 指引）+ tool-error 事件；claim/spawn 零触达（拒绝在领任务前）', async () => {
    const h = harness()
    const out = (await h.tool.execute({ run_in_background: true }, h.exec)) as {
      ok: boolean
      code: string
      message: string
      violations: string[]
    }
    expect(out.ok).toBe(false)
    expect(out.code).toBe('ERR_SPAWN_FAILED')
    expect(out.message).toContain('run_in_background')
    expect(out.message).toContain('jobs service')
    expect(out.violations.some((v) => v.includes('without run_in_background'))).toBe(true)
    expect(out.violations.some((v) => v.includes('jobs service'))).toBe(true)
    expect(h.calls.claim).toBe(0)
    expect(h.spawnRequests).toHaveLength(0)
    expect(h.events.map((e) => e.type)).toEqual(['tool-error'])
    // 渲染面（TECH-error-004）：✗ code + 人话 + 违规清单逐行
    const text = h.tool.output.render({}, out)[0]?.text ?? ''
    expect(text.startsWith('✗ ERR_SPAWN_FAILED — ')).toBe(true)
    expect(text).toContain('without run_in_background')
  })

  it('拒绝不入 spawn 失败防线计数：三次后台拒绝后前台派发照常（非 halted——装配降级非 spawn 失败）', async () => {
    const h = harness()
    for (let i = 0; i < 3; i += 1) {
      const rejected = (await h.tool.execute({ run_in_background: true }, h.exec)) as { ok: boolean }
      expect(rejected.ok).toBe(false)
    }
    const out = (await h.tool.execute({}, h.exec)) as { kind: string }
    expect(out.kind).toBe('spawned')
  })

  it('jobs 面在场：后台调用过守卫走 dispatched 分支（deps.jobs 注入即启用后台形态——1.2 直通已被 1.3 dispatched 分支接续）', async () => {
    const js = jobsStub()
    const h = harness({ jobs: js.jobs })
    const out = (await h.tool.execute({ run_in_background: true }, h.exec)) as { kind: string }
    expect(out.kind).toBe('dispatched')
  })
})

// ─────────────────────────── 后台形态（async-dispatch §4.1/4.2/4.4——任务 1.3） ───────────────────────────

describe('dispatched 分支（AC1：立即返回四键回执——不 await worker 终态）', () => {
  it('run_in_background=true：spawn 后立即回执 taskRef/workerSessionId/jobId/pool——pending result 零阻塞、结算读零触达', async () => {
    const js = jobsStub()
    const h = harness({ jobs: js.jobs })
    h.setSpawn(async (req) => {
      h.spawnRequests.push(req)
      return { workerSessionId: 'worker-bg', result: new Promise(() => {}), dispose: async () => {} } // 永不结算
    })
    const sessionId = (h.exec.agent as { session: { id: string } }).session.id
    const out = (await h.tool.execute({ run_in_background: true }, h.exec)) as {
      kind: string
      taskRef: { slug: string; localId: string }
      title: string
      type: string
      workerSessionId: string
      jobId: string
      pool: { pending: number; inProgress: number; blocked: number; unmetPending: number }
    }
    expect(out).toEqual({
      kind: 'dispatched',
      taskRef: { slug: 'feat-x', localId: '2.5' },
      title: 'Implement the thing',
      type: 'coding-fix',
      workerSessionId: 'worker-bg',
      jobId: 'forge-dispatch-1',
      pool: { pending: 1, inProgress: 0, blocked: 1, unmetPending: 2 },
    })
    // 立即返回的结构证据：worker 未终态（pending）而结算读零调用
    expect(h.calls.query).toBe(0)
    // job spec：kind/label/owner（派发会话 id——F7 owner 销毁自动取消）+ 负向 pin：禁声明 output 拉取源
    expect(js.specs).toHaveLength(1)
    expect(js.specs[0]).toMatchObject({
      kind: 'forge-dispatch',
      label: 'feat-x/2.5 · Implement the thing',
      owner: sessionId,
    })
    expect(js.specs[0]).not.toHaveProperty('output')
  })

  it('no-task 分支不建 job（§5——无任务零注册，no-task 回执原样）', async () => {
    const js = jobsStub()
    const h = harness({ jobs: js.jobs })
    h.setClaim({ task: null, dispatchPrompt: '', persona: 'PERSONA-MATRIX', digest: '', reclaimed: false })
    const out = (await h.tool.execute({ run_in_background: true }, h.exec)) as { kind: string }
    expect(out.kind).toBe('no-task')
    expect(js.specs).toHaveLength(0)
  })
})

describe('结算后置交付（AC2：JobOutcome.result = 前台 spawned 分支字段面原样投影）', () => {
  it('success：status=completed + result JSON 与同夹具前台结果深等（kind: spawned 全字段）', async () => {
    const js = jobsStub()
    const h = harness({ jobs: js.jobs })
    const handle = controlledHandle()
    h.setSpawn(async (req) => {
      h.spawnRequests.push(req)
      return handle
    })
    const receipt = (await h.tool.execute({ run_in_background: true }, h.exec)) as { kind: string }
    expect(receipt.kind).toBe('dispatched')
    // 同夹具前台对照（新会话——零防线串扰）
    const fg = harness()
    const fgOut = (await fg.tool.execute({}, fg.exec)) as object
    handle.release({ stopReason: 'completed', output: 'done' })
    const done = await js.hooks[0]!.done
    expect(done.status).toBe('completed')
    expect(JSON.parse(done.result ?? 'null')).toEqual({ kind: 'spawned', ...fgOut })
  })

  it('blocked：reason/followUp 原样投影 + done:blocked 里程碑', async () => {
    const js = jobsStub()
    const h = harness({ jobs: js.jobs })
    h.setClaim({ task: snapshot({ localId: '2.4' }), dispatchPrompt: 'P', persona: 'PERSONA-MATRIX', digest: 'd42', reclaimed: false })
    h.setQuery({
      task: snapshot({ localId: '2.4', taskStatus: 'blocked', blockedReason: 'missing API key' }),
      container: { kind: 'feature', slug: 'feat-x', title: 'feat-x' },
      records: [{ verb: 'submit', toStatus: 'blocked', reason: 'missing API key', actor: 'plugin-tool', createdAt: '2026-10-07T01:00:00.000Z' }],
    })
    h.setCards([{ slug: 'feat-x', localId: 'fix-2', sourceTask: { slug: 'feat-x', localId: '2.4' } }])
    const handle = controlledHandle()
    h.setSpawn(async (req) => {
      h.spawnRequests.push(req)
      return handle
    })
    await h.tool.execute({ run_in_background: true }, h.exec)
    handle.release({ stopReason: 'completed', output: 'done' })
    const done = await js.hooks[0]!.done
    expect(done.status).toBe('completed')
    expect(JSON.parse(done.result ?? 'null')).toMatchObject({
      kind: 'spawned',
      outcome: 'blocked',
      reason: 'missing API key',
      followUp: { slug: 'feat-x', localId: 'fix-2' },
    })
    const phases = h.events.filter((e) => e.type === 'task-progress').map((e) => (e.payload as { phase: string }).phase)
    expect(phases).toContain('done:blocked')
  })
})

describe('job 内防线（AC3：无结算 failed + kill taxonomy + 3 连败粘住）', () => {
  it('无结算径：job=failed + 诊断进 detail + tool-error 留档（任务留 in_progress）', async () => {
    const js = jobsStub()
    const h = harness({ jobs: js.jobs })
    h.setQuery({
      task: snapshot({ taskStatus: 'in_progress' }),
      container: { kind: 'feature', slug: 'feat-x', title: 'feat-x' },
    })
    const handle = controlledHandle()
    h.setSpawn(async (req) => {
      h.spawnRequests.push(req)
      return handle
    })
    await h.tool.execute({ run_in_background: true }, h.exec)
    handle.release({ stopReason: 'refusal', output: '' })
    const done = await js.hooks[0]!.done
    expect(done.status).toBe('failed')
    expect(done.detail).toContain('without a settlement (stopReason: refusal)')
    expect(h.events.some((e) => e.type === 'tool-error')).toBe(true)
  })

  it('run.result 拒绝（非 kill 基建故障）：job=failed + 诊断进 detail', async () => {
    const js = jobsStub()
    const h = harness({ jobs: js.jobs })
    const handle = controlledHandle()
    h.setSpawn(async (req) => {
      h.spawnRequests.push(req)
      return handle
    })
    await h.tool.execute({ run_in_background: true }, h.exec)
    handle.reject(new Error('infra fault'))
    const done = await js.hooks[0]!.done
    expect(done.status).toBe('failed')
    expect(done.detail).toContain('infra fault')
  })

  it('kill=killed 不进防线计数：cancel→abort 后 done=killed（零 tool-error）；3 连 kill 后前台照常派发', async () => {
    const js = jobsStub()
    const h = harness({ jobs: js.jobs })
    for (let i = 0; i < 3; i += 1) {
      const handle = controlledHandle(`worker-k${i}`)
      h.setSpawn(async (req) => {
        h.spawnRequests.push(req)
        return handle
      })
      await h.tool.execute({ run_in_background: true }, h.exec)
      js.hooks[js.hooks.length - 1]!.cancel('operator kill') // abort → 驱动器中止 worker
      handle.reject(new Error('worker aborted by kill')) // 驱动器对 abort 的反应形态
      const done = await js.hooks[js.hooks.length - 1]!.done
      expect(done.status).toBe('killed')
    }
    expect(h.events.some((e) => e.type === 'tool-error')).toBe(false) // kill 非失败——零留档
    // 3 连 kill 未入防线：前台派发照常（非 halted）
    h.setSpawn(async (req) => {
      h.spawnRequests.push(req)
      return okHandle()
    })
    const out = (await h.tool.execute({}, h.exec)) as { kind: string }
    expect(out.kind).toBe('spawned')
  })

  it('AggregateError 例外：即使 aborted 也归 failed（F6 taxonomy 细枝——进防线计数）', async () => {
    const js = jobsStub()
    const h = harness({ jobs: js.jobs })
    const handle = controlledHandle()
    h.setSpawn(async (req) => {
      h.spawnRequests.push(req)
      return handle
    })
    await h.tool.execute({ run_in_background: true }, h.exec)
    js.hooks[0]!.cancel('kill')
    handle.reject(new AggregateError([new Error('parallel failure')], 'aggregate'))
    const done = await js.hooks[0]!.done
    expect(done.status).toBe('failed')
    expect(done.detail).toContain('aggregate')
  })

  it('3 连败 halt 粘住：job 内失败按结算序回灌 → 后续派发同步入口 halted（不再 claim）', async () => {
    const js = jobsStub()
    const h = harness({ jobs: js.jobs })
    let latest!: ControlledHandle
    h.setSpawn(async (req) => {
      h.spawnRequests.push(req)
      latest = controlledHandle() // 每轮新句柄
      return latest
    })
    for (let i = 0; i < 3; i += 1) {
      void (await h.tool.execute({ run_in_background: true }, h.exec))
      latest.reject(new Error('bg boom'))
      const done = await js.hooks[i]!.done
      expect(done.status).toBe('failed')
    }
    const claimsBefore = h.calls.claim
    const out = (await h.tool.execute({}, h.exec)) as { kind: string; reason: string }
    expect(out.kind).toBe('halted')
    expect(out.reason).toContain('3 consecutive')
    expect(h.calls.claim).toBe(claimsBefore)
  })

  it('成功结算清零 streak（结算序）：2 败 → 1 成 → 2 败 → 前台照常（未粘住）', async () => {
    const js = jobsStub()
    const h = harness({ jobs: js.jobs })
    let latest!: ControlledHandle
    h.setSpawn(async (req) => {
      h.spawnRequests.push(req)
      latest = controlledHandle()
      return latest
    })
    const fail = async (): Promise<void> => {
      void (await h.tool.execute({ run_in_background: true }, h.exec))
      latest.reject(new Error('boom'))
      await js.hooks[js.hooks.length - 1]!.done
    }
    const succeed = async (): Promise<void> => {
      void (await h.tool.execute({ run_in_background: true }, h.exec))
      latest.release({ stopReason: 'completed', output: 'done' })
      await js.hooks[js.hooks.length - 1]!.done
    }
    await fail()
    await fail()
    await succeed() // 清零
    await fail()
    await fail()
    h.setSpawn(async (req) => {
      h.spawnRequests.push(req)
      return okHandle()
    })
    const out = (await h.tool.execute({}, h.exec)) as { kind: string }
    expect(out.kind).toBe('spawned')
  })

  it('jobs.start 同步段故障：句柄 dispose + ERR_SPAWN_FAILED DTO（job 未注册——无回执可交付）', async () => {
    let disposed = 0
    const h = harness({
      jobs: {
        start: () => {
          throw new Error('registry down')
        },
      },
    })
    h.setSpawn(async (req) => {
      h.spawnRequests.push(req)
      return { workerSessionId: 'worker-x', result: new Promise(() => {}), dispose: async () => void (disposed += 1) }
    })
    const out = (await h.tool.execute({ run_in_background: true }, h.exec)) as { ok: boolean; code: string; message: string }
    expect(out.ok).toBe(false)
    expect(out.code).toBe('ERR_SPAWN_FAILED')
    expect(out.message).toContain('registry down')
    expect(disposed).toBe(1) // worker 无 job 观测面——收尾取消剩余工作
  })
})

describe('后台径进度双写（§4.2①/§4.3——appendLog + task-progress 同源双写，前台零发射）', () => {
  it('里程碑序 claimed→spawned→running→settled:reading→done:success：log 行逐里程碑 + 事件载荷 taskKey/ts', async () => {
    const js = jobsStub()
    const h = harness({ jobs: js.jobs })
    const handle = controlledHandle()
    h.setSpawn(async (req) => {
      h.spawnRequests.push(req)
      return handle
    })
    await h.tool.execute({ run_in_background: true }, h.exec)
    handle.release({ stopReason: 'completed', output: 'done' })
    await js.hooks[0]!.done
    const progresses = h.events.filter((e) => e.type === 'task-progress') as unknown as Array<{
      slug: string
      payload: { taskKey: string; phase: string; ts: number }
    }>
    expect(progresses.map((e) => e.payload.phase)).toEqual(['claimed', 'spawned', 'running', 'settled:reading', 'done:success'])
    expect(js.logLines).toHaveLength(progresses.length) // 同源双写：每里程碑一行 log
    for (const e of progresses) {
      expect(e.slug).toBe('feat-x')
      expect(e.payload.taskKey).toBe('feat-x/2.5')
      expect(typeof e.payload.ts).toBe('number')
    }
    // 前台零污染：本会话此前无 task-progress 之外的源——全事件序即证
    expect(h.events[0]!.type).toBe('task-claimed')
  })
})

// ─────────────────────────── 后台径 ring 通道值域（负向 pin 生产者面——async-dispatch §6/F4） ───────────────────────────

describe('后台径 ring 通道值域（负向 pin 生产者面——appendLog 单点硬编码经 adaptDispatchJobs 全链）', () => {
  /** 原始环捕获注册表（上游注册表结构面——append(text, options) 原样记账，不经任何收窄） */
  function ringCaptureRegistry(): {
    registry: DispatchJobsRegistryFace
    ring: { text: string; channel: string | undefined }[]
    hooks: DispatchJobHooks[]
  } {
    const ring: { text: string; channel: string | undefined }[] = []
    const hooks: DispatchJobHooks[] = []
    let seq = 0
    const registry: DispatchJobsRegistryFace = {
      start(spec) {
        seq += 1
        hooks.push(
          spec.run({
            append: (text, options) => {
              ring.push({ text, channel: options?.channel })
            },
          }),
        )
        return `forge-dispatch-${seq}`
      },
    }
    return { registry, ring, hooks }
  }

  it('forge-dispatch job 环块 channel 值域 ⊆ {"log"}；模型消费面投影零进度字节（上游滤 log 行为钉死于 tests/contract/pin-16）', async () => {
    const { registry, ring, hooks } = ringCaptureRegistry()
    const h = harness({ jobs: adaptDispatchJobs(registry) })
    const handle = controlledHandle()
    h.setSpawn(async (req) => {
      h.spawnRequests.push(req)
      return handle
    })
    await h.tool.execute({ run_in_background: true }, h.exec)
    handle.release({ stopReason: 'completed', output: 'done' })
    await hooks[0]!.done

    // 值域断言：五里程碑环块 channel 全 = 'log'——channel 值调用面不可达（DispatchJobRunHandle
    // 唯一成员 appendLog），单点硬编码于 faces.ts adaptDispatchJobs，拼错通道结构性不可能
    expect(ring).toHaveLength(5)
    expect(new Set(ring.map((c) => c.channel))).toEqual(new Set(['log']))
    // 里程碑行齐全（观察者面 = jobs 面板 live 流全程可见，不受 outputLimitBytes 截留）
    const joined = ring.map((c) => c.text).join('\n')
    expect(joined).toContain('claimed feat-x/2.5')
    expect(joined).toContain('spawned worker worker-bg')
    expect(joined).toContain('worker executing')
    expect(joined).toContain('reading settlement')
    expect(joined).toContain('settlement ready')
    // 模型消费面投影（上游 renderModelDelta 同判别：channel !== 'log' 可见）= 零字节
    const modelFace = ring.filter((c) => c.channel !== 'log').map((c) => c.text).join('')
    expect(modelFace).toBe('')
  })

  it('blocked 结算同域：done:blocked 里程碑环块亦全 log（值域断言与结算解耦）', async () => {
    const { registry, ring, hooks } = ringCaptureRegistry()
    const h = harness({ jobs: adaptDispatchJobs(registry) })
    h.setClaim({ task: snapshot({ localId: '2.4' }), dispatchPrompt: 'P', persona: 'PERSONA-MATRIX', digest: 'd42', reclaimed: false })
    h.setQuery({
      task: snapshot({ localId: '2.4', taskStatus: 'blocked', blockedReason: 'missing API key' }),
      container: { kind: 'feature', slug: 'feat-x', title: 'feat-x' },
      records: [{ verb: 'submit', toStatus: 'blocked', reason: 'missing API key', actor: 'plugin-tool', createdAt: '2026-10-07T01:00:00.000Z' }],
    })
    const handle = controlledHandle('worker-bg')
    h.setSpawn(async (req) => {
      h.spawnRequests.push(req)
      return handle
    })
    await h.tool.execute({ run_in_background: true }, h.exec)
    handle.release({ stopReason: 'completed', output: 'done' })
    await hooks[0]!.done

    expect(ring.length).toBeGreaterThanOrEqual(5)
    expect(new Set(ring.map((c) => c.channel))).toEqual(new Set(['log']))
    expect(ring.at(-1)?.text).toContain('settlement ready')
    const modelFace = ring.filter((c) => c.channel !== 'log').map((c) => c.text).join('')
    expect(modelFace).toBe('')
  })
})

describe('dispatched 渲染与 schema（AC5：五态 + oneOf 增支）', () => {
  const receipt = {
    kind: 'dispatched',
    taskRef: { slug: 'feat-x', localId: '2.5' },
    title: 'Implement the thing',
    type: 'coding-fix',
    workerSessionId: 'worker-1',
    jobId: 'forge-dispatch-7',
    pool: { pending: 1, inProgress: 0, blocked: 1, unmetPending: 2 },
  } as const

  it('渲染 ▸ 行 + job_output/job_kill 指引 + 池行', () => {
    const text = h_render(receipt)
    expect(text.startsWith('▸ dispatched feat-x/2.5 — job forge-dispatch-7')).toBe(true)
    expect(text).toContain('job_output forge-dispatch-7')
    expect(text).toContain('job_kill forge-dispatch-7')
    expect(text).toContain('- pool: pending 1 · in_progress 0 · blocked 1 · unmet-pending 2')
  })

  it('output schema oneOf 四支：dispatched 支 required 含四键（jobId/workerSessionId/taskRef/pool）', () => {
    const h = harness()
    const schema = h.tool.output.schema as { oneOf: [ { oneOf: Array<{ required?: string[] }> }, object ] }
    const branches = schema.oneOf[0]!.oneOf
    expect(branches).toHaveLength(4)
    expect(branches[1]!.required).toEqual(['kind', 'taskRef', 'title', 'type', 'workerSessionId', 'jobId', 'pool'])
  })
})

/** 渲染快捷（no-task 分支） */
function h_render(value: unknown): string {
  const h = harness()
  return h.tool.output.render({}, value)[0]?.text ?? ''
}

// ─────────────────────────── halted 机械防线（AC4） ───────────────────────────

describe('halted 防线（连续失败 ×3 粘住/成功清零/冷启动重置）', () => {
  it('第 3 次连续失败返回 halted；其后粘住（不再 claim）', async () => {
    const h = harness()
    h.setSpawn(async () => {
      throw new Error('boom')
    })
    const r1 = (await h.tool.execute({}, h.exec)) as { code: string }
    const r2 = (await h.tool.execute({}, h.exec)) as { code: string }
    expect(r1.code).toBe('ERR_SPAWN_FAILED')
    expect(r2.code).toBe('ERR_SPAWN_FAILED')
    const r3 = (await h.tool.execute({}, h.exec)) as { kind: string; reason: string }
    expect(r3.kind).toBe('halted')
    expect(r3.reason).toContain('3 consecutive')
    // 粘住：第 4 次调用入口即拒——claim 零调用
    const claimsBefore = h.calls.claim
    const r4 = (await h.tool.execute({}, h.exec)) as { kind: string }
    expect(r4.kind).toBe('halted')
    expect(h.calls.claim).toBe(claimsBefore)
    expect(h.tool.output.render({}, r3)[0]?.text).toMatch(/^✗ dispatch halted — /)
  })

  it('成功结算即清零：败×2 → 成功 → 再败仍 ERR_SPAWN_FAILED（未粘住）', async () => {
    const h = harness()
    h.setSpawn(async () => {
      throw new Error('boom')
    })
    await h.tool.execute({}, h.exec)
    await h.tool.execute({}, h.exec)
    // 成功一轮（spawn 恢复 + 结算 completed）
    h.setSpawn(async (req) => {
      h.spawnRequests.push(req)
      return okHandle()
    })
    const ok = (await h.tool.execute({}, h.exec)) as { kind: string }
    expect(ok.kind).toBe('spawned')
    h.setSpawn(async () => {
      throw new Error('boom again')
    })
    const after = (await h.tool.execute({}, h.exec)) as { code: string }
    expect(after.code).toBe('ERR_SPAWN_FAILED')
  })

  it('冷启动重置：fresh 模块副本同会话可派发（计数器易失）', async () => {
    const h = harness()
    h.setSpawn(async () => {
      throw new Error('boom')
    })
    await h.tool.execute({}, h.exec)
    await h.tool.execute({}, h.exec)
    const halted = (await h.tool.execute({}, h.exec)) as { kind: string }
    expect(halted.kind).toBe('halted')
    // 模块重载 = 冷启动：计数器清空，同会话恢复可派发
    vi.resetModules()
    const fresh = await import('./dispatch-task.js')
    const events: ForgePluginEvent[] = []
    const tasks = {
      claimTask: async () => ({ task: snapshot(), dispatchPrompt: 'P', digest: 'd', reclaimed: false }),
      taskStats: async () => statsOf(),
      queryTask: async () => ({ task: snapshot({ taskStatus: 'completed' }), container: { kind: 'feature', slug: 'feat-x', title: 'f' } }),
      listTasks: async () => [],
    } as unknown as ForgeTasksService
    const freshTool = fresh.createDispatchTaskTool({
      tasks,
      proposals: {} as DispatchTaskToolDeps['proposals'],
    bugs: {} as DispatchTaskToolDeps['bugs'],
      resolveProjectId: () => 'p-1',
      events: { emit: (e) => events.push(e), prepare: async () => {}, dirOf: () => undefined, remember: () => {} },
      spawn: async () => okHandle(),
    })
    const out = (await freshTool.execute({}, h.exec)) as { kind: string }
    expect(out.kind).toBe('spawned')
  })

  it('会话作用域：他址会话不受本会话粘住影响', async () => {
    const h = harness()
    h.setSpawn(async () => {
      throw new Error('boom')
    })
    for (let i = 0; i < 3; i += 1) await h.tool.execute({}, h.exec)
    // 新会话（execOf 新 id）正常派发
    h.setSpawn(async (req) => {
      h.spawnRequests.push(req)
      return okHandle()
    })
    const other = harness()
    const out = (await other.tool.execute({}, other.exec)) as { kind: string }
    expect(out.kind).toBe('spawned')
  })
})

// ─────────────────────────── 组装序与事件（AC2/AC3/AC5） ───────────────────────────

describe('组装序落面（AC2：矩阵→toolFilter / settings→agentOptions / dispatchPrompt 全文透传）', () => {
  it('spawn 请求携带：全文 prompt + 矩阵 deny + label = 任务键 · 任务名（子会话标题——用户裁决 2026-10-10）+ parent/signal', async () => {
    const h = harness()
    await h.tool.execute({}, h.exec)
    expect(h.spawnRequests).toHaveLength(1)
    const req = h.spawnRequests[0]!
    expect(req.prompt).toBe('PERSONA + <task-context>') // 全文直达 worker——零转述
    expect(req.label).toBe('feat-x/2.5 · Implement the thing')
    expect(req.parent).toBe(h.exec.agent)
    expect(req.signal).toBeInstanceOf(AbortSignal)
    expect(req.toolFilter.deny).toEqual(expect.arrayContaining(['ask_user_question', 'subagent_fork', 'queryTask', 'dispatchTask']))
  })

  it('forgeSettings 已配置：agentOptions 显式携带（effort 直映射）', async () => {
    const h = harness({ settings: { get: async () => ({ worker: { provider: 'deepseek', model: 'reasoner', reasoning: 'high' } }) } })
    await h.tool.execute({}, h.exec)
    expect(h.spawnRequests[0]?.agentOptions).toEqual({ provider: 'deepseek', model: 'reasoner', reasoningEffort: 'high' })
  })

  it("forgeSettings reasoning='default'：agentOptions 无 effort 键（不下发——provider 默认档）", async () => {
    const h = harness({
      settings: { get: async () => ({ worker: { provider: 'zai-coding-cn', model: 'glm-5.3-flash', reasoning: 'default' } }) },
    })
    await h.tool.execute({}, h.exec)
    expect(h.spawnRequests[0]?.agentOptions).toEqual({ provider: 'zai-coding-cn', model: 'glm-5.3-flash' })
  })

  it('档位兼容收口：目录已知且配置档位不支持 → 剥离 effort 携带 provider/model（组装面）', async () => {
    const h = harness({
      settings: { get: async () => ({ worker: { provider: 'zai-coding-cn', model: 'glm-5.3-flash', reasoning: 'medium' } }) },
      resolveModelReasoning: async () => ['low', 'high', 'max'],
    })
    await h.tool.execute({}, h.exec)
    expect(h.spawnRequests[0]?.agentOptions).toEqual({ provider: 'zai-coding-cn', model: 'glm-5.3-flash' })
  })

  it('档位兼容收口：目录已知且受支持 → 原样携带（组装面）', async () => {
    const h = harness({
      settings: { get: async () => ({ worker: { provider: 'zai-coding-cn', model: 'glm-5.3-flash', reasoning: 'high' } }) },
      resolveModelReasoning: async () => ['low', 'high', 'max'],
    })
    await h.tool.execute({}, h.exec)
    expect(h.spawnRequests[0]?.agentOptions).toEqual({ provider: 'zai-coding-cn', model: 'glm-5.3-flash', reasoningEffort: 'high' })
  })

  it('档位兼容收口：目录不可知（解析器缺席）→ 原样携带（无法验证不判）', async () => {
    const h = harness({
      settings: { get: async () => ({ worker: { provider: 'zai-coding-cn', model: 'glm-5.3-flash', reasoning: 'medium' } }) },
    })
    await h.tool.execute({}, h.exec)
    expect(h.spawnRequests[0]?.agentOptions).toEqual({ provider: 'zai-coding-cn', model: 'glm-5.3-flash', reasoningEffort: 'medium' })
  })

  it('forgeSettings 未配置（worker 键缺席）：不携带 agentOptions（回退父会话继承）', async () => {
    const h = harness({ settings: { get: async () => ({}) } })
    await h.tool.execute({}, h.exec)
    expect(h.spawnRequests[0]?.agentOptions).toBeUndefined()
  })

  it('forgeSettings 服务缺席（deps.settings 无键）：不携带 agentOptions', async () => {
    const h = harness()
    await h.tool.execute({}, h.exec)
    expect(h.spawnRequests[0]?.agentOptions).toBeUndefined()
  })
})

describe('claim 入参透传（M3 2.4 容器限定接线）', () => {
  it('source 对在场：claimTask 收 source 引用（容器限定盲选激活）', async () => {
    const h = harness()
    await h.tool.execute({ source_kind: 'proposal', source_slug: 'pa' }, h.exec)
    expect(h.claimInputs).toEqual([
      { projectId: 'p-1', sessionId: expect.any(String), source: { kind: 'proposal', slug: 'pa' } },
    ])
  })

  it('source 对缺席：claimTask 不含 source 键（全库盲选——缺省行为零变化）', async () => {
    const h = harness()
    await h.tool.execute({}, h.exec)
    expect(h.claimInputs[0]).not.toHaveProperty('source')
  })
})

/** 通用 tasks 桩（事件用例复用：claim→task / query→completed / stats） */
function bareTasks(): ForgeTasksService {
  return {
    claimTask: async () => ({ task: snapshot(), dispatchPrompt: 'P', digest: 'd', reclaimed: false }),
    taskStats: async () => statsOf(),
    queryTask: async () => ({
      task: snapshot({ taskStatus: 'completed' }),
      container: { kind: 'feature', slug: 'feat-x', title: 'f' },
    }),
    listTasks: async () => [],
  } as unknown as ForgeTasksService
}

describe('事件发射（AC5：→ 3.3 总线；dispatchDigest 双记）', () => {
  it('spawned 全链：task-claimed → task-spawned → task-worker-done（信封 sessionId = 派发会话）', async () => {
    const h = harness()
    await h.tool.execute({}, h.exec)
    expect(h.events.map((e) => e.type)).toEqual(['task-claimed', 'task-spawned', 'task-worker-done'])
    const [claimed, spawned, done] = h.events as unknown as [
      { payload: { taskKey: string; dispatchDigest: string; taskType: string } },
      { payload: { workerSessionId: string; toolFilter: string[]; model: string } },
      { payload: { durationMs: number; outcome: string } },
    ]
    expect(claimed.payload).toMatchObject({ taskKey: 'feat-x/2.5', taskType: 'coding-fix', dispatchDigest: 'digestabc123' })
    // 双记：事件 digest = claimTask 返回 digest（task_records.claim 行同值）
    expect(claimed.payload.dispatchDigest).toBe('digestabc123')
    expect(spawned.payload).toMatchObject({ workerSessionId: 'worker-1', model: 'inherit' })
    expect(spawned.payload.toolFilter).toEqual(expect.arrayContaining(['ask_user_question', 'queryTask']))
    expect(done.payload).toMatchObject({ outcome: 'success', workerSessionId: 'worker-1' })
    expect(done.payload.durationMs).toBeGreaterThanOrEqual(0)
    for (const e of h.events) {
      expect(e.sessionId).toBe((h.exec.agent ?? { session: { id: '' } }).session.id)
      expect(e.slug).toBe('feat-x')
    }
  })

  it('agentOptions 携带时 task-spawned.model = 显式 model', async () => {
    const h = harness()
    const tool = createDispatchTaskTool({
      tasks: bareTasks(),
      proposals: {} as DispatchTaskToolDeps['proposals'],
    bugs: {} as DispatchTaskToolDeps['bugs'],
      resolveProjectId: () => 'p-1',
      events: { emit: (e) => h.events.push(e), prepare: async () => {}, dirOf: () => undefined, remember: () => {} },
      settings: { get: async () => ({ worker: { provider: 'deepseek', model: 'reasoner', reasoning: 'low' } }) },
      spawn: async () => okHandle(),
    })
    await tool.execute({}, h.exec)
    const spawned = h.events.find((e) => e.type === 'task-spawned') as unknown as { payload: { model: string } }
    expect(spawned.payload.model).toBe('reasoner')
  })

  it('claim 前 typed 错误（cwd 未绑定）→ tool-error + 失败 DTO', async () => {
    const h = harness()
    const out = (await h.tool.execute({}, { agent: { session: { id: 's-x', header: { cwd: 'C:\\ws\\other' } } } })) as {
      ok: boolean
      code: string
    }
    expect(out.code).toBe('ERR_WORKSPACE_NOT_REGISTERED')
    expect(h.events.map((e) => e.type)).toEqual(['tool-error'])
    expect(h.events[0]).toMatchObject({ slug: '_pool', payload: { verb: 'dispatchTask', code: 'ERR_WORKSPACE_NOT_REGISTERED' } })
  })

  it('deps.events 缺席 = 零事件降级（四分支照常）', async () => {
    const h = harness()
    const tool = createDispatchTaskTool({
      tasks: bareTasks(),
      proposals: {} as DispatchTaskToolDeps['proposals'],
    bugs: {} as DispatchTaskToolDeps['bugs'],
      resolveProjectId: () => 'p-1',
      spawn: async () => okHandle(),
    })
    const out = (await tool.execute({}, h.exec)) as { kind: string }
    expect(out.kind).toBe('spawned')
  })
})

// ─────────────────────────── scoped 池快照 + 重入回执（run-tasks-host-command/1.10） ───────────────────────────

describe('scoped 池快照 + 重入回执（1.10：快照口径分流 + 重入标识渲染 + schema 可选 reEntered）', () => {
  it('scoped 调用：taskStats 查询携带 source（容器口径快照——no-task 收据全池数字不再出现的数据源）', async () => {
    const h = harness()
    h.setClaim({ task: null, dispatchPrompt: '', persona: 'PERSONA-MATRIX', digest: '', reclaimed: false })
    await h.tool.execute({ source_kind: 'feature', source_slug: 'feat-x' }, h.exec)
    expect(h.statsInputs).toEqual([{ projectId: 'p-1', source: { kind: 'feature', slug: 'feat-x' } }])
    const text = h.tool.output.render({}, { kind: 'no-task', pool: { pending: 9, inProgress: 1, blocked: 0, unmetPending: 2 } })[0]?.text ?? ''
    expect(text).toContain('pool: pending 9 · in_progress 1 · blocked 0 · unmet-pending 2') // 容器数字即收据数字
  })

  it('非 scoped 调用：taskStats 查询不含 source 键（全池口径零变化）', async () => {
    const h = harness()
    h.setClaim({ task: null, dispatchPrompt: '', persona: 'PERSONA-MATRIX', digest: '', reclaimed: false })
    await h.tool.execute({}, h.exec)
    expect(h.statsInputs).toHaveLength(1)
    expect(h.statsInputs[0]).not.toHaveProperty('source')
  })

  it('重入回执：claim reclaimed=true → dispatched 回执 reEntered=true + 渲染 re-entered 标识与等待指引', async () => {
    const js = jobsStub()
    const h = harness({ jobs: js.jobs })
    h.setSpawn(async (req) => {
      h.spawnRequests.push(req)
      return { workerSessionId: 'worker-bg', result: new Promise(() => {}), dispose: async () => {} } // 永不结算
    })
    h.setClaim({ task: snapshot(), dispatchPrompt: 'P', persona: 'PERSONA-MATRIX', digest: 'd2', reclaimed: true })
    const out = (await h.tool.execute({ run_in_background: true }, h.exec)) as { kind: string; reEntered?: boolean }
    expect(out.kind).toBe('dispatched')
    expect(out.reEntered).toBe(true)
    const text = h.tool.output.render({}, out)[0]?.text ?? ''
    expect(text.startsWith('▸ re-entered dispatched feat-x/2.5 — job forge-dispatch-1')).toBe(true)
    expect(text).toContain('already in flight')
    expect(text).toContain('do NOT dispatchTask')
    expect(text).toContain('wait for')
    expect(text).toContain('job_output forge-dispatch-1') // 既有指引行保留
    expect(text).toContain('- pool: pending 1 · in_progress 0 · blocked 1 · unmet-pending 2')
  })

  it('新领取回执零重入键（toEqual 全形不变）+ 渲染 ▸ 原样', async () => {
    const js = jobsStub()
    const h = harness({ jobs: js.jobs })
    const out = (await h.tool.execute({ run_in_background: true }, h.exec)) as object
    expect(out).toEqual({
      kind: 'dispatched',
      taskRef: { slug: 'feat-x', localId: '2.5' },
      title: 'Implement the thing',
      type: 'coding-fix',
      workerSessionId: 'worker-1',
      jobId: 'forge-dispatch-1',
      pool: { pending: 1, inProgress: 0, blocked: 1, unmetPending: 2 },
    })
    const text = h.tool.output.render({}, out)[0]?.text ?? ''
    expect(text.startsWith('▸ dispatched feat-x/2.5 — job forge-dispatch-1')).toBe(true)
    expect(text).not.toContain('re-entered')
  })

  it('output schema：dispatched 支 properties 增 reEntered（可选——required 面不变）', () => {
    const h = harness()
    const schema = h.tool.output.schema as {
      oneOf: [ { oneOf: Array<{ properties?: Record<string, unknown>; required?: string[] }> }, object ]
    }
    const dispatched = schema.oneOf[0]!.oneOf[1]!
    expect(dispatched.properties).toHaveProperty('reEntered')
    expect(dispatched.required).not.toContain('reEntered')
    expect(dispatched.required).toEqual(['kind', 'taskRef', 'title', 'type', 'workerSessionId', 'jobId', 'pool'])
  })
})
