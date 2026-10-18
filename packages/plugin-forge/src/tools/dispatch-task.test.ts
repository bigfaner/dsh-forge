// 3b③ 单测 —— dispatchTask 循环入口契约（dispatch-loop-hardening 改进 3b③）：
// source 对成对必填（无池级盲选）/ 去 job 模式（无 run_in_background 通道）/ 三态自解释
// （started · running 状态摘要 · suspended 挂起摘要 + re-entry）/ 守卫拒绝（归属 + 入口）/
// 会话单活 owner-active 拒绝 / 接管集写点 / description↔P1 协议同源 pin。
// 循环核心全桩（LoopDriver/LoopRegistry 缝——真 registry + 驱动器录制桩）；纯函数面
// （池三分/收窄矩阵/agentOptions）单测保留（dispatch-core 单源再导出）。
import { describe, expect, it, vi } from 'vitest'
import type { ForgePluginEvent, ForgeTasksService, TaskStats, TaskStatus } from '@dsh-forge/contracts'
import { TASK_TYPES, WORKER_FORGE_TOOLS } from '@dsh-forge/contracts'
import type { ToolExecFace } from '../faces.js'
import type { ForgeEventSink } from '../events/sink.js'
import { deriveTriageToolFilter } from '../dispatch-core/assemble.js'
import { createLoopRegistry } from '../loop/index.js'
import type { LoopDriver, LoopEscalation, LoopRecord, LoopRegistry } from '../loop/index.js'
import { payloadOf, renderP1 } from '../loop/injection.js'
import { FORGE_TOOL_NAMES } from './index.js'
import type { DispatchTaskToolDeps } from './dispatch-task.js'
import {
  classifyPool,
  createDispatchTaskTool,
  deriveWorkerToolFilter,
  parseDispatchTaskArgs,
  poolOf,
  reconcileWorkerReasoning,
  workerAgentOptionsOf,
} from './dispatch-task.js'

// ─────────────────────────── 夹具 ───────────────────────────

/** 会话唯一后缀（跨用例零污染） */
let sessionSeq = 0
function execOf(): ToolExecFace {
  sessionSeq += 1
  return { agent: { session: { id: `dispatch-${sessionSeq}`, header: { cwd: 'C:\\ws\\demo' } } } }
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

/** 挂起载荷（升级事件全文——P3 渲染源） */
function suspensionOf(): NonNullable<LoopRecord['suspended']> {
  const escalation: LoopEscalation = {
    kind: 'blocked-ask-user',
    ownerSessionId: 'owner-x',
    source: { kind: 'feature', slug: 'feat-x' },
    task: {
      taskId: 't-1',
      slug: 'feat-x',
      localId: '2.5',
      source: { kind: 'feature', slug: 'feat-x' },
      title: 'Implement the thing',
      taskType: 'coding-fix',
      taskStatus: 'blocked',
      breaking: false,
      complexity: 'high',
      createdAt: '2026-10-17T00:00:00.000Z',
      updatedAt: '2026-10-17T00:00:00.000Z',
    },
    reason: 'tests hang on flaky selector',
    history: ['第1次处置——决定请求人工裁决'],
  }
  return { escalation, since: 1_700_000_000_000 }
}

/** 活循环登记行（守卫/摘要/re-entry 用例源） */
function recordOf(sessionId: string, over: Partial<LoopRecord> = {}): LoopRecord {
  return {
    id: 'loop-1',
    source: { kind: 'feature', slug: 'feat-x' },
    ownerSessionId: sessionId,
    projectId: 'p-1',
    takeoverSessions: new Set<string>(),
    ...over,
  }
}

interface Harness {
  tool: ReturnType<typeof createDispatchTaskTool>
  exec: ToolExecFace
  sessionId: string
  events: ForgePluginEvent[]
  calls: { stats: number }
  statsInputs: unknown[]
  registry: LoopRegistry
  driver: { start: ReturnType<typeof vi.fn>; resume: ReturnType<typeof vi.fn>; stopLoop: ReturnType<typeof vi.fn> }
  addRecord(record: LoopRecord): void
  setStats(stats: TaskStats): void
  /** 池读故障注入（taskStats 拒绝——readFailed 标注用例源） */
  failStats(message: string): void
}

function harness(): Harness {
  const exec = execOf()
  const sessionId = (exec.agent as { session: { id: string } }).session.id
  const { sink, events } = sinkStub()
  const calls = { stats: 0 }
  const statsInputs: unknown[] = []
  let statsResult: TaskStats = statsOf({ pending: 1, blocked: 1, unmetPending: 2 })
  let statsError: Error | undefined
  const tasks = {
    taskStats: async (input: unknown) => {
      statsInputs.push(input)
      calls.stats += 1
      if (statsError !== undefined) throw statsError
      return statsResult
    },
  } as unknown as ForgeTasksService
  const registry = createLoopRegistry()
  const driver = {
    start: vi.fn(async (_input: unknown) => ({ ok: true as const, loopId: 'loop-1' })),
    resume: vi.fn((_input: unknown) => ({ ok: true as const, loopId: 'loop-1' })),
    stopLoop: vi.fn(async (_input: unknown) => ({ ok: true as const, stopped: true as const, hadInFlight: false })),
  }
  const deps: DispatchTaskToolDeps = {
    tasks,
    proposals: {} as DispatchTaskToolDeps['proposals'],
    bugs: {} as DispatchTaskToolDeps['bugs'],
    resolveProjectId: (cwd) => (cwd.toLowerCase().includes('demo') ? 'p-1' : undefined),
    events: sink,
    loop: { driver: driver as unknown as LoopDriver, registry },
  }
  return {
    tool: createDispatchTaskTool(deps),
    exec,
    sessionId,
    events,
    calls,
    statsInputs,
    registry,
    driver,
    addRecord: (record) => registry.register(record),
    setStats: (s) => {
      statsResult = s
    },
    failStats: (message) => {
      statsError = new Error(message)
    },
  }
}

/** 渲染快捷 */
function h_render(h: Harness, value: unknown): string {
  return h.tool.output.render({}, value)[0]?.text ?? ''
}

const ARGS = { source_kind: 'feature', source_slug: 'feat-x' } as const

// ─────────────────────────── 参数契约（成对必填——无池级盲选） ───────────────────────────

describe('parseDispatchTaskArgs（3b 契约：source 对成对必填，缺失即拒绝）', () => {
  it('成对解析为 ContainerRef；退役键 run_in_background/context_slug 落未知键零效应', () => {
    expect(parseDispatchTaskArgs(ARGS)).toEqual({ source: { kind: 'feature', slug: 'feat-x' } })
    expect(parseDispatchTaskArgs({ source_kind: 'proposal', source_slug: 'pa', run_in_background: true })).toEqual({
      source: { kind: 'proposal', slug: 'pa' },
    })
    expect(() => parseDispatchTaskArgs(null)).toThrow(/must be an object/)
  })

  it('缺失/半对即拒（schema required 同面——无池级盲选形态）', () => {
    expect(() => parseDispatchTaskArgs({})).toThrow(/both required/)
    expect(() => parseDispatchTaskArgs({ source_kind: 'feature' })).toThrow(/both required/)
    expect(() => parseDispatchTaskArgs({ source_slug: 'feat-x' })).toThrow(/both required/)
    expect(() => parseDispatchTaskArgs({ source_kind: 'widget', source_slug: 'fa' })).toThrow(
      /source_kind must be one of \[feature, proposal\]/,
    )
  })
})

// ─────────────────────────── 纯函数面（dispatch-core 单源——保留既有单测） ───────────────────────────

describe('poolOf + classifyPool（池态三分）', () => {
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
    // 全局十 + forge 闭环（FORGE_TOOL_NAMES − WORKER_FORGE_TOOLS + validateMermaid，含 3b
    // stopTaskLoop）为共同底座；族收窄增量 = 名表五上游族按矩阵逐格进 deny
    const base = [
      'ask_user_question',
      'createProposal',
      'create_goal',
      'dispatchTask',
      'get_goal',
      'interrupt_agent',
      'list_agents',
      'listBugs',
      'listTasks',
      'present',
      'queryTask',
      'send_message',
      'stopTaskLoop',
      'subagent_fork',
      'taskStats',
      'transitionProposal',
      'update_goal',
      'updateTask',
      'validateMermaid',
      'workflow',
    ]
    // coding：web ✗（fs/shell/jobs/read-image ✓）——fix-bug 两 bug 写径（recordBug/resolveBug）
    // + getBug 链上下文读径 coding-fix worker 放行（forge 族 ✓——收窄面不含 deny 三工具）
    const codingFixDeny = deriveWorkerToolFilter('coding-fix').deny.sort()
    expect(codingFixDeny).toEqual([...base, 'web_fetch', 'web_search'].sort())
    expect(codingFixDeny).not.toContain('recordBug')
    expect(codingFixDeny).not.toContain('resolveBug')
    expect(codingFixDeny).not.toContain('getBug')
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

  it('forge 闭环同步守护：FORGE_TOOL_NAMES − WORKER_FORGE_TOOLS 全覆盖入 deny（worker 与 triage 两面——含 3b stopTaskLoop）', () => {
    const workerDeny = new Set(deriveWorkerToolFilter('doc').deny)
    const triageDeny = new Set(deriveTriageToolFilter().deny)
    for (const name of FORGE_TOOL_NAMES) {
      if ((WORKER_FORGE_TOOLS as readonly string[]).includes(name)) continue
      expect(workerDeny.has(name), `${name} 应入 worker deny（forge 族五动词之外不可见）`).toBe(true)
      expect(triageDeny.has(name), `${name} 应入 triage deny（仅主 agent 面）`).toBe(true)
    }
    expect(workerDeny.has('submitTask')).toBe(false)
    expect(workerDeny.has('addTask')).toBe(false)
    // fix-bug 两 bug 写径 + 链上下文读径：worker 面（forge 族五动词）+ triage 面（仅决策不执行——deny）分治
    expect(workerDeny.has('recordBug')).toBe(false)
    expect(workerDeny.has('resolveBug')).toBe(false)
    expect(workerDeny.has('getBug')).toBe(false)
    // listBugs 台账查询面分治：仅主 agent——worker/triage 两面均 deny
    expect(workerDeny.has('listBugs')).toBe(true)
    expect(triageDeny.has('recordBug')).toBe(true)
    expect(triageDeny.has('resolveBug')).toBe(true)
    expect(triageDeny.has('getBug')).toBe(true)
  })

  it('validateMermaid deny（md-mermaid 插件工具仅主 agent——全 taskType + triage 全收窄形）', () => {
    for (const t of TASK_TYPES) {
      expect(deriveWorkerToolFilter(t).deny, `${t} worker deny 应含 validateMermaid`).toContain('validateMermaid')
    }
    expect(deriveTriageToolFilter().deny).toContain('validateMermaid')
  })

  it('contracts 矩阵单源：WORKER_FORGE_TOOLS 五动词（submitTask/addTask + 两 bug 写径 + getBug 读径）——bug-recurrence-chain worker 放行钉住', () => {
    expect([...WORKER_FORGE_TOOLS]).toEqual(['submitTask', 'addTask', 'recordBug', 'resolveBug', 'getBug'])
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

// ─────────────────────────── execute 三态全场景表（3b 契约） ───────────────────────────

describe('execute · started（无活循环 → driver.start——指令同源同一循环核心）', () => {
  it('启动回执：start 收 source/ownerSessionId/parent/projectId + 池快照容器口径 + 渲染启动/停止指引', async () => {
    const h = harness()
    const out = (await h.tool.execute(ARGS, h.exec)) as { kind: string; loopId: string; source: unknown }
    expect(out).toMatchObject({ kind: 'started', loopId: 'loop-1', source: { kind: 'feature', slug: 'feat-x' } })
    expect(h.driver.start).toHaveBeenCalledWith({
      source: { kind: 'feature', slug: 'feat-x' },
      ownerSessionId: h.sessionId,
      parent: h.exec.agent,
      projectId: 'p-1',
      worktree: 'C:\\ws\\demo', // 1.14 cwd 钉定归属——发起会话检出透传
    })
    expect(h.statsInputs).toEqual([{ projectId: 'p-1', source: { kind: 'feature', slug: 'feat-x' } }])
    const text = h_render(h, out)
    expect(text).toContain('dispatch loop started for feat-x')
    expect(text).toContain('stopTaskLoop')
    expect(text).toContain('- pool: pending 1 · in_progress 0 · blocked 1 · unmet-pending 2')
  })

  it('start owner-active（会话单活拒绝）：失败 DTO——人话 + 指引逐行 + tool-error 事件', async () => {
    const h = harness()
    h.driver.start.mockResolvedValue({
      ok: false,
      code: 'owner-active',
      activeSource: { kind: 'proposal', slug: 'pa' },
      activeOwnerSessionId: h.sessionId,
      suspended: true,
      message: 'M-OWNER-ACTIVE',
      guidance: ['G-ONE', 'G-TWO'],
    })
    const out = (await h.tool.execute(ARGS, h.exec)) as { ok: boolean; code: string; message: string; violations: string[] }
    expect(out.ok).toBe(false)
    expect(out.code).toBe('ERR_SPAWN_FAILED')
    expect(out.message).toBe('M-OWNER-ACTIVE')
    expect(out.violations).toEqual(['G-ONE', 'G-TWO'])
    const text = h_render(h, out)
    expect(text.startsWith('✗ ERR_SPAWN_FAILED — M-OWNER-ACTIVE')).toBe(true)
    expect(h.events.map((e) => e.type)).toEqual(['tool-error'])
    expect(h.events[0]).toMatchObject({ type: 'tool-error', payload: { verb: 'dispatchTask', code: 'ERR_SPAWN_FAILED' } })
  })

  it('start loop-active（竞态窗口）：同守卫拒绝径（独占指引随行）', async () => {
    const h = harness()
    h.driver.start.mockResolvedValue({
      ok: false,
      code: 'loop-active',
      activeSource: { kind: 'feature', slug: 'feat-x' },
      activeOwnerSessionId: 'other',
      suspended: false,
      message: 'M-LOOP-ACTIVE',
      guidance: [],
    })
    const out = (await h.tool.execute(ARGS, h.exec)) as { ok: boolean; code: string; message: string; violations: string[] }
    expect(out.ok).toBe(false)
    expect(out.message).toBe('M-LOOP-ACTIVE')
    expect(out.violations.length).toBeGreaterThan(0)
    expect(out.violations.some((v) => v.includes('stopTaskLoop'))).toBe(true)
  })
})

describe('execute · 守卫拒绝（他人运行中循环——归属 + 正确入口）', () => {
  it('失败 DTO：message 含循环归属（loop id + owner session）+ 指引含 stopTaskLoop/观察入口；start 零触达', async () => {
    const h = harness()
    h.addRecord(recordOf('other-session'))
    const out = (await h.tool.execute(ARGS, h.exec)) as { ok: boolean; code: string; message: string; violations: string[] }
    expect(out.ok).toBe(false)
    expect(out.code).toBe('ERR_SPAWN_FAILED')
    expect(out.message).toContain('owner session other-session')
    expect(out.message).toContain('feat-x')
    expect(out.violations.some((v) => v.includes('stopTaskLoop'))).toBe(true)
    expect(out.violations.some((v) => v.includes('queryTask'))).toBe(true)
    const text = h_render(h, out)
    expect(text.startsWith('✗ ERR_SPAWN_FAILED — dispatch rejected: task source feat-x')).toBe(true)
    expect(h.driver.start).not.toHaveBeenCalled()
    expect(h.events.map((e) => e.type)).toEqual(['tool-error'])
  })
})

describe('execute · owner 运行中重调（状态摘要——非拒绝）', () => {
  it('running 摘要：taskKey 随行（in-flight 在场）+ 渲染「status summary, no new loop」；start 零触达', async () => {
    const h = harness()
    h.addRecord(
      recordOf(h.sessionId, {
        inFlight: { taskRef: { slug: 'feat-x', localId: '2.5' }, taskKey: 'feat-x/2.5', taskId: 't-1', title: 'Implement the thing' },
      }),
    )
    const out = (await h.tool.execute(ARGS, h.exec)) as { kind: string; ownerSessionId: string; taskKey?: string }
    expect(out).toMatchObject({ kind: 'running', ownerSessionId: h.sessionId, taskKey: 'feat-x/2.5' })
    const text = h_render(h, out)
    expect(text).toContain('status summary, no new loop started')
    expect(text).toContain('- current task: feat-x/2.5')
    expect(text).toContain('stopTaskLoop')
    expect(h.driver.start).not.toHaveBeenCalled()
  })

  it('轮间窗口（in-flight 缺席）：taskKey 键缺席 + 渲染 between rounds', async () => {
    const h = harness()
    h.addRecord(recordOf(h.sessionId))
    const out = (await h.tool.execute(ARGS, h.exec)) as { kind: string; taskKey?: string }
    expect(out.kind).toBe('running')
    expect(out).not.toHaveProperty('taskKey')
    expect(h_render(h, out)).toContain('between rounds')
  })
})

describe('execute · 挂起态（P3 摘要兜底 + re-entry 幂等续接 + 接管集写点）', () => {
  it('owner 重调：resume 调用（loopId 锚）+ 响应必带挂起摘要（P3 全文）+ resumed=true + 续接说明', async () => {
    const h = harness()
    h.addRecord(recordOf(h.sessionId, { suspended: suspensionOf() }))
    const out = (await h.tool.execute(ARGS, h.exec)) as { kind: string; summary: string; resumed: boolean; takenOver: boolean }
    expect(out.kind).toBe('suspended')
    expect(out.resumed).toBe(true)
    expect(out.takenOver).toBe(false)
    expect(h.driver.resume).toHaveBeenCalledWith({ loopId: 'loop-1' })
    // 挂起摘要 = P3 模板同源（payloadOf(record) 渲染——丢失兜底读径）
    expect(out.summary).toContain('任务循环挂起')
    expect(out.summary).toContain('tests hang on flaky selector')
    expect(out.summary).toContain(`dispatchTask(source_kind='feature', source_slug='feat-x')`)
    const text = h_render(h, out)
    expect(text).toContain('任务循环挂起')
    expect(text).toContain('resumes from where it suspended (completed tasks are not re-run)')
  })

  it('非 owner 首触：接管集写入（唯一工具侧写点）+ takenOver=true + 同摘要；resume 照常续接', async () => {
    const h = harness()
    const record = recordOf('owner-x', { suspended: suspensionOf() })
    h.addRecord(record)
    const out = (await h.tool.execute(ARGS, h.exec)) as { kind: string; takenOver: boolean; resumed: boolean }
    expect(out.takenOver).toBe(true)
    expect(out.resumed).toBe(true)
    expect(record.takeoverSessions.has(h.sessionId)).toBe(true)
    expect(h_render(h, out)).toContain('joined the takeover set')
  })

  it('并发竞态（resume not-suspended）：resumed=false + 渲染 already resumed（零动作不误报）', async () => {
    const h = harness()
    h.addRecord(recordOf(h.sessionId, { suspended: suspensionOf() }))
    h.driver.resume.mockReturnValue({ ok: false, code: 'not-suspended' })
    const out = (await h.tool.execute(ARGS, h.exec)) as { resumed: boolean }
    expect(out.resumed).toBe(false)
    expect(h_render(h, out)).toContain('already resumed')
  })
})

describe('execute · 池快照读数失败标注（R2-minor⑤——零值为兜底非实况）', () => {
  it('taskStats 故障：零值兜底 + readFailed=true + 渲染警示行（非全零误导模型判容器已清空）', async () => {
    const h = harness()
    h.failStats('task_stats read failed')
    const out = (await h.tool.execute(ARGS, h.exec)) as { kind: string; pool: { pending: number; readFailed?: boolean } }
    expect(out.kind).toBe('started')
    expect(out.pool).toEqual({ pending: 0, inProgress: 0, blocked: 0, unmetPending: 0, readFailed: true })
    const text = h_render(h, out)
    expect(text).toContain('pool read FAILED')
    expect(text).toContain('not actual counts')
  })
})

// ─────────────────────────── 协议 pin（description ↔ P1 同源） ───────────────────────────

describe('协议 pin（description 完整承载调用协议 ↔ 注入模板同源锚）', () => {
  it('description 关键句：成对必填 / 无 job 通道 / 循环语义 / 停止入口 / 单活门控 / 挂起摘要', () => {
    const d = harness().tool.description
    expect(d).toContain('source_kind and source_slug are BOTH required')
    expect(d).toContain('no pool-wide mode')
    expect(d).toContain('no run_in_background/job_output/job_kill')
    expect(d).toContain('same loop core as the /run-dag-tasks instruction')
    expect(d).toContain('stopTaskLoop')
    expect(d).toContain('at most one loop at a time')
    expect(d).toContain('suspension summary')
    expect(d).toContain('idempotent re-entry')
  })

  it('description ↔ P1 驻留模板同源：停止入口 stopTaskLoop 双面一致（pin 锚——模板漂移即断言失败）', () => {
    const d = harness().tool.description
    const p1 = renderP1(payloadOf(recordOf('any')))
    expect(d).toContain('stopTaskLoop')
    expect(p1).toContain('stopTaskLoop')
  })

  it('output schema：三成功分支（started/running/suspended）+ 失败 DTO 变体', () => {
    const h = harness()
    const schema = h.tool.output.schema as { oneOf: [{ oneOf: Array<{ properties?: Record<string, unknown>; required?: string[] }> }, object] }
    const branches = schema.oneOf[0]!.oneOf
    expect(branches).toHaveLength(3)
    expect(branches[0]!.required).toEqual(['kind', 'loopId', 'source', 'pool'])
    expect(branches[1]!.required).toEqual(['kind', 'source', 'ownerSessionId', 'pool'])
    expect(branches[2]!.required).toEqual(['kind', 'loopId', 'source', 'summary', 'resumed', 'takenOver', 'pool'])
    // parameters 面成对必填（schema 强制——缺失即拒绝的数据面）
    const params = h.tool.parameters as { required?: string[] }
    expect(params.required).toEqual(['source_kind', 'source_slug'])
  })
})

// ─────────────────────────── 事件归属 ───────────────────────────

describe('事件归属（tool-error——attribution 槽）', () => {
  it('typed 错误（cwd 未绑定）→ tool-error + 失败 DTO（归属容器语境——source 对已解析）', async () => {
    const h = harness()
    const out = (await h.tool.execute(ARGS, { agent: { session: { id: 's-x', header: { cwd: 'C:\\ws\\other' } } } })) as {
      ok: boolean
      code: string
    }
    expect(out.code).toBe('ERR_WORKSPACE_NOT_REGISTERED')
    expect(h.events.map((e) => e.type)).toEqual(['tool-error'])
    expect(h.events[0]).toMatchObject({ slug: 'feat-x', payload: { verb: 'dispatchTask', code: 'ERR_WORKSPACE_NOT_REGISTERED' } })
  })
})
