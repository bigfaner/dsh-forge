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
import { WORKER_FORGE_TOOLS } from '@dsh-forge/contracts'
import type { ToolExecFace } from '../faces.js'
import type { ForgeEventSink } from '../events/sink.js'
import { FORGE_TOOL_NAMES } from './index.js'
import {
  classifyPool,
  createDispatchTaskTool,
  deriveWorkerToolFilter,
  parseDispatchTaskArgs,
  poolOf,
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
  spawnRequests: SpawnWorkerRequest[]
  setClaim(result: ClaimTaskResult): void
  setQuery(result: QueryTaskResult): void
  setStats(stats: TaskStats): void
  setCards(cards: { slug: string; localId: string; sourceTask?: { slug: string; localId: string } }[]): void
  setSpawn(impl: (req: SpawnWorkerRequest) => Promise<SpawnWorkerHandle>): void
}

function harness(options: { settings?: { get(): Promise<unknown> } } = {}): Harness {
  const exec = execOf()
  const { sink, events } = sinkStub()
  const calls = { claim: 0, stats: 0, query: 0, list: 0, submit: 0, dispose: 0 }
  const spawnRequests: SpawnWorkerRequest[] = []
  let claimResult: ClaimTaskResult = { task: snapshot(), dispatchPrompt: 'PERSONA + <task-context>', digest: 'digestabc123', reclaimed: false }
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
    claimTask: async () => {
      calls.claim += 1
      return claimResult
    },
    taskStats: async () => {
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
    resolveProjectId: (cwd) => (cwd.toLowerCase().includes('demo') ? 'p-1' : undefined),
    events: sink,
    ...(options.settings !== undefined ? { settings: options.settings as DispatchTaskToolDeps['settings'] } : {}),
    spawn: (req) => spawnImpl(req),
  }
  return {
    tool: createDispatchTaskTool(deps),
    exec,
    events,
    calls,
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

afterEach(() => {
  vi.resetModules()
})

// ─────────────────────────── 参数与纯函数 ───────────────────────────

describe('parseDispatchTaskArgs（防御收窄）', () => {
  it('零参合法（contextSlug 事件归属可选）；snake_case 单参；类型收窄', () => {
    expect(parseDispatchTaskArgs({})).toEqual({})
    expect(parseDispatchTaskArgs({ context_slug: 'feat-x' })).toEqual({ context_slug: 'feat-x' })
    expect(() => parseDispatchTaskArgs({ context_slug: 3 })).toThrow(/context_slug must be a string/)
    expect(() => parseDispatchTaskArgs(null)).toThrow(/must be an object/)
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
    // 全局八 + forge 闭环四（FORGE_TOOL_NAMES − WORKER_FORGE_TOOLS）为共同底座；
    // 族收窄增量 = 名表五上游族按矩阵逐格进 deny（web 仅验证放行 → 四型全 deny）
    const base = [
      'ask_user_question',
      'createProposal',
      'dispatchTask',
      'interrupt_agent',
      'list_agents',
      'present',
      'queryTask',
      'send_message',
      'subagent_fork',
      'todo_write',
      'transitionProposal',
      'workflow',
    ]
    // coding：web ✗（fs/shell/jobs/read-image ✓）
    expect(deriveWorkerToolFilter('coding-fix').deny.sort()).toEqual(
      [...base, 'web_fetch', 'web_search'].sort(),
    )
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

  it('forge 闭环同步守护：FORGE_TOOL_NAMES − WORKER_FORGE_TOOLS ⊆ deny', () => {
    const deny = new Set(deriveWorkerToolFilter('doc').deny)
    for (const name of FORGE_TOOL_NAMES) {
      if ((WORKER_FORGE_TOOLS as readonly string[]).includes(name)) continue
      expect(deny.has(name), `${name} 应入 worker deny（forge 族只给 submitTask+addTask）`).toBe(true)
    }
    expect(deny.has('submitTask')).toBe(false)
    expect(deny.has('addTask')).toBe(false)
  })
})

describe('workerAgentOptionsOf（forgeSettings → agentOptions 两态）', () => {
  it('未配置/服务缺席 = undefined（不携带——回退父会话继承）；配置 = reasoning→effort 直映射', () => {
    expect(workerAgentOptionsOf(undefined)).toBeUndefined()
    expect(workerAgentOptionsOf({})).toBeUndefined()
    expect(
      workerAgentOptionsOf({ worker: { provider: 'deepseek', model: 'reasoner', reasoning: 'high' } }),
    ).toEqual({ provider: 'deepseek', model: 'reasoner', reasoningEffort: 'high' })
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
    h.setClaim({ task: snapshot({ localId: '2.4' }), dispatchPrompt: 'P', digest: 'd42', reclaimed: false })
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

  it('no-task：池快照 + no-ready-task 事件（contextSlug 归属）+ 渲染 · 行带三分判词', async () => {
    const h = harness()
    h.setClaim({ task: null, dispatchPrompt: '', digest: '', reclaimed: false })
    h.setStats(statsOf({ pending: 3, blocked: 1, unmetPending: 2 }))
    const out = (await h.tool.execute({ context_slug: 'feat-x' }, h.exec)) as Exclude<DispatchTaskResult, { ok: false }>
    expect(out).toEqual({ kind: 'no-task', pool: { pending: 3, inProgress: 0, blocked: 1, unmetPending: 2 } })
    const text = h.tool.output.render({}, out)[0]?.text ?? ''
    expect(text).toContain('· no ready task (pool: pending 3 · in_progress 0 · blocked 1 · unmet-pending 2)')
    expect(text).toContain('retry later')
    expect(h.events.map((e) => e.type)).toEqual(['no-ready-task'])
    expect(h.events[0]).toMatchObject({ slug: 'feat-x', payload: { contextSlug: 'feat-x' } })
  })

  it('no-task 无 contextSlug：归属回落 _pool', async () => {
    const h = harness()
    h.setClaim({ task: null, dispatchPrompt: '', digest: '', reclaimed: false })
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
      resolveProjectId: () => 'p-1',
      events: { emit: (e) => events.push(e), prepare: async () => {}, dirOf: () => undefined },
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
  it('spawn 请求携带：全文 prompt + 矩阵 deny + label = 任务键 + parent/signal', async () => {
    const h = harness()
    await h.tool.execute({}, h.exec)
    expect(h.spawnRequests).toHaveLength(1)
    const req = h.spawnRequests[0]!
    expect(req.prompt).toBe('PERSONA + <task-context>') // 全文直达 worker——零转述
    expect(req.label).toBe('feat-x/2.5')
    expect(req.parent).toBe(h.exec.agent)
    expect(req.signal).toBeInstanceOf(AbortSignal)
    expect(req.toolFilter.deny).toEqual(expect.arrayContaining(['ask_user_question', 'subagent_fork', 'queryTask', 'dispatchTask']))
  })

  it('forgeSettings 已配置：agentOptions 显式携带（effort 直映射）', async () => {
    const h = harness({ settings: { get: async () => ({ worker: { provider: 'deepseek', model: 'reasoner', reasoning: 'high' } }) } })
    await h.tool.execute({}, h.exec)
    expect(h.spawnRequests[0]?.agentOptions).toEqual({ provider: 'deepseek', model: 'reasoner', reasoningEffort: 'high' })
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
      resolveProjectId: () => 'p-1',
      events: { emit: (e) => h.events.push(e), prepare: async () => {}, dirOf: () => undefined },
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
      resolveProjectId: () => 'p-1',
      spawn: async () => okHandle(),
    })
    const out = (await tool.execute({}, h.exec)) as { kind: string }
    expect(out.kind).toBe('spawned')
  })
})
