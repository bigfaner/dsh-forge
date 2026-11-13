// 3b③ 单测 —— dispatchTask 循环入口契约（dispatch-loop-hardening 改进 3b③）：
// source 对成对必填（无池级盲选）/ 去 job 模式（无 run_in_background 通道）/ 三态自解释
// （started · running 状态摘要 · suspended 挂起摘要 + re-entry）/ 守卫拒绝（归属 + 入口）/
// 会话单活 owner-active 拒绝 / 接管集写点 / description↔P1 协议同源 pin。
// 循环核心全桩（LoopDriver/LoopRegistry 缝——真 registry + 驱动器录制桩）；纯函数面
// （池三分/收窄矩阵/agentOptions）单测保留（dispatch-core 单源再导出）。
import { describe, expect, it, vi } from 'vitest'
import type { ForgePluginEvent, ForgeTasksService, TaskStats, TaskStatus } from '@dsh-forge/contracts'
import { TASK_TYPES, WORKER_FORGE_TOOLS } from '@dsh-forge/contracts'
import { createUnionToolNamesProbe, platformShellToolName, probeIsSubdomain } from '@dsh-forge/contracts'
import type { ToolExecFace } from '../faces.js'
import type { ForgeEventSink } from '../events/sink.js'
import {
  deriveTriageToolFilter,
  globalToolNamesOfToolsFace,
  WORKER_EXPERT_RELEASABLE_DENY,
  WORKER_PIPELINE_ESSENTIAL_TOOLS,
} from '../dispatch-core/assemble.js'
import { createLoopRegistry } from '../loop/index.js'
import type { LoopDriver, LoopEscalation, LoopRecord, LoopRegistry } from '../loop/index.js'
import { payloadOf, renderP1 } from '../loop/injection.js'
import { FORGE_TOOL_NAMES, type ForgeToolDeps } from './index.js'

const checkpoints: ForgeToolDeps['checkpoints'] = {
  appendCheckpoint: async () => {
    throw new Error('not used')
  },
  listCheckpoints: async () => [],
  ensureCheckpoint: async () => {
    throw new Error('not used')
  },
}
import type { DispatchTaskToolDeps } from './dispatch-task.js'
import {
  classifyPool,
  createDispatchTaskTool,
  deriveWorkerToolFilter,
  parseDispatchTaskArgs,
  poolOf,
  reconcileWorkerReasoning,
} from './dispatch-task.js'

// ─────────────────────────── 夹具 ───────────────────────────

/** 会话唯一后缀（跨用例零污染） */
let sessionSeq = 0
function execOf(): ToolExecFace {
  sessionSeq += 1
  return { agent: { session: { id: `dispatch-${sessionSeq}`, header: { cwd: 'C:\\ws\\demo' } } } }
}

function statsOf(over: Partial<Record<TaskStatus, number>> & { unmetPending?: number; gatedPending?: number } = {}): TaskStats {
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
  return { total: 1, byStatus, unmetPending: over.unmetPending ?? 0, gatedPending: over.gatedPending ?? 0 }
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
  let statsResult: TaskStats = statsOf({ pending: 1, blocked: 1, unmetPending: 2, gatedPending: 0 })
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
    checkpoints,
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
/** 显式 re-entry（挂起冻结守卫——resume=true 才续接） */
const ARGS_RESUME = { source_kind: 'feature', source_slug: 'feat-x', resume: true } as const

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
    expect(poolOf(statsOf({ pending: 3, in_progress: 1, blocked: 2, unmetPending: 4, gatedPending: 0 }))).toEqual({
      pending: 3,
      inProgress: 1,
      blocked: 2,
      unmetPending: 4,
      gatedPending: 0,
    })
  })

  it('三分：全终态收工 / blocked 无通路疑似死锁 / 其余等待', () => {
    expect(classifyPool({ pending: 0, inProgress: 0, blocked: 0, unmetPending: 0, gatedPending: 0 })).toBe('done')
    expect(classifyPool({ pending: 0, inProgress: 0, blocked: 2, unmetPending: 0, gatedPending: 0 })).toBe('deadlock-suspected')
    expect(classifyPool({ pending: 0, inProgress: 1, blocked: 0, unmetPending: 0, gatedPending: 0 })).toBe('wait')
    expect(classifyPool({ pending: 2, inProgress: 0, blocked: 0, unmetPending: 2, gatedPending: 0 })).toBe('wait')
    // pending>0 且全满足（claim 空转竞态）→ 等待兜底
    expect(classifyPool({ pending: 1, inProgress: 0, blocked: 0, unmetPending: 0, gatedPending: 0 })).toBe('wait')
  })
})

describe('deriveWorkerToolFilter（taskType → 收窄矩阵 → toolFilter）', () => {
  it('当前名表（5.1 全表——OQ#2 上游 standard 组合枚举）：全局拒绝集 + forge 闭环 + 族收窄逐型', () => {
    // 全局十 + forge 闭环（FORGE_TOOL_NAMES − WORKER_FORGE_TOOLS + validateMermaid，含 3b
    // stopTaskLoop）为共同底座；族收窄增量 = 名表五上游族按矩阵逐格进 deny
    const base = [
      'aggregateBugs',
      'ask_user_question',
      'createProposal',
      'create_goal',
      'dispatchTask',
      'get_goal',
      'interrupt_agent',
      'knowledge_reinstate',
      'knowledge_supersede',
      'list_agents',
      'listBugs',
      'listImplCheckpoints',
      'listTasks',
      'pauseTask',
      'present',
      'addTask',
      'queryImplCheckpoint',
      'queryTask',
      'recordImplCheckpoint',
      'send_message',
      'stopTaskLoop',
      'subagent_fork',
      'taskStats',
      'transitionFeature',
      'transitionProposal',
      'unblockTask',
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

  it('forge 闭环同步守护：FORGE_TOOL_NAMES − WORKER_FORGE_TOOLS 全覆盖入 deny（worker 与 triage 两面——含 3b stopTaskLoop；addTask triage 放行为用户裁决 2026-11-02）', () => {
    const workerDeny = new Set(deriveWorkerToolFilter('doc').deny)
    const triageDeny = new Set(deriveTriageToolFilter().deny)
    for (const name of FORGE_TOOL_NAMES) {
      if ((WORKER_FORGE_TOOLS as readonly string[]).includes(name)) continue
      expect(workerDeny.has(name), `${name} 应入 worker deny（forge 族四动词之外不可见）`).toBe(true)
      // triage 放行面（§2.2.1 只读两具 + addTask 处置派生径 + 目录查询双只读径——
      // forge-dirs-query-tool §2.3 零副作用 + aggregateBugs 聚合读径 recurrence-signal-tiering）：
      // getBug/listBugs/aggregateBugs/addTask/forgeDirs/forgeResolvePath 不入 triage deny
      if (name !== 'getBug' && name !== 'listBugs' && name !== 'aggregateBugs' && name !== 'addTask' && name !== 'forgeDirs' && name !== 'forgeResolvePath') {
        expect(triageDeny.has(name), `${name} 应入 triage deny（写面/任务域动词仅主 agent）`).toBe(true)
      }
    }
    expect(workerDeny.has('submitTask')).toBe(false)
    expect(workerDeny.has('addTask')).toBe(true)
    // fix-bug 两 bug 写径 + 链上下文读径：worker 面（forge 族四动词）+ triage 面（仅决策不执行）分治
    expect(workerDeny.has('recordBug')).toBe(false)
    expect(workerDeny.has('resolveBug')).toBe(false)
    expect(workerDeny.has('getBug')).toBe(false)
    // listBugs 台账查询面分治：worker deny（仅主 agent）；triage 只读放开（§2.2.1）
    expect(workerDeny.has('listBugs')).toBe(true)
    // aggregateBugs 聚合读径（recurrence-signal-tiering）：worker deny；triage 放开（量化判据 SOP）
    expect(workerDeny.has('aggregateBugs')).toBe(true)
    expect(triageDeny.has('aggregateBugs')).toBe(false)
    expect(triageDeny.has('recordBug')).toBe(true)
    expect(triageDeny.has('resolveBug')).toBe(true)
    // triage 放行三工具：只读深挖两具（§2.2.1）+ addTask（处置派生径——用户裁决 2026-11-02）
    expect(triageDeny.has('getBug')).toBe(false)
    expect(triageDeny.has('listBugs')).toBe(false)
    expect(triageDeny.has('addTask')).toBe(false)
  })

  it('validateMermaid deny（md-mermaid 插件工具仅主 agent——全 taskType + triage 全收窄形）', () => {
    for (const t of TASK_TYPES) {
      expect(deriveWorkerToolFilter(t).deny, `${t} worker deny 应含 validateMermaid`).toContain('validateMermaid')
    }
    expect(deriveTriageToolFilter().deny).toContain('validateMermaid')
  })

  // ───────── knowledge 归并双 tool 裁决（knowledge-stage2-followups #2——用户裁决 2026-11-05） ─────────

  /** distill 专属专家档案 tools 白名单（项目层 .dsh/experts/distill.md 正本——本常量 = 结构测试钉死面） */
  const DISTILL_EXPERT_TOOLS = [
    'knowledge_supersede',
    'knowledge_reinstate',
    'knowledge_write',
    'knowledge_read',
    'knowledge_search',
    'knowledge_read_abstract',
    'read',
    'glob',
    'grep',
  ] as const

  it('knowledge 双 tool 默认 deny：一切 spawn worker 面不见（档案缺席 = 双 tool 在 deny、allow 不携带）；triage 同拒（处置代理不执行归并）', () => {
    expect([...WORKER_EXPERT_RELEASABLE_DENY].sort()).toEqual(['knowledge_reinstate', 'knowledge_supersede'])
    for (const t of TASK_TYPES) {
      const { deny, allow } = deriveWorkerToolFilter(t)
      expect(deny, `${t} worker deny 应含 knowledge_supersede`).toContain('knowledge_supersede')
      expect(deny, `${t} worker deny 应含 knowledge_reinstate`).toContain('knowledge_reinstate')
      expect(allow).toBeUndefined()
    }
    expect(deriveTriageToolFilter().deny).toContain('knowledge_supersede')
    expect(deriveTriageToolFilter().deny).toContain('knowledge_reinstate')
  })

  it('distill 专家面显式放行：档案 tools 白名单 → 双 tool 入 allow 且从 deny 剔除（allow∩deny 保持零交集）', () => {
    const { allow, deny } = deriveWorkerToolFilter('doc', undefined, [...DISTILL_EXPERT_TOOLS])
    for (const name of DISTILL_EXPERT_TOOLS) {
      expect(allow, `distill allow 应含 ${name}`).toContain(name)
    }
    expect(deny).not.toContain('knowledge_supersede')
    expect(deny).not.toContain('knowledge_reinstate')
    expect(allow!.filter((n) => deny.includes(n))).toEqual([])
  })

  it('可放行面收窄钉死：其余 deny 名不随档案解锁（addTask/validateMermaid 即便写入档案 tools 仍在 deny）；未列双 tool 的普通档案默认 deny 不失守', () => {
    const { deny } = deriveWorkerToolFilter('doc', undefined, ['addTask', 'validateMermaid', ...DISTILL_EXPERT_TOOLS])
    expect(deny).toContain('addTask')
    expect(deny).toContain('validateMermaid')
    const plain = deriveWorkerToolFilter('doc', undefined, ['read', 'grep'])
    expect(plain.deny).toContain('knowledge_supersede')
    expect(plain.deny).toContain('knowledge_reinstate')
    expect(plain.allow).not.toContain('knowledge_supersede')
  })

  it('bug 989997bd：triage deny 表与真机注册面求交——未注册名（win 域无 bash）不入 deny；注册面缺席 = 全表兼容', () => {
    // 真机 Windows 宿主全局工具面样本（retest-1.13-r2 hostlog 已知名表——无 bash）
    const registered = [
      'addTask', 'ask_user_question', 'createProposal', 'dispatchTask', 'edit', 'exit_plan_mode',
      'getBug', 'glob', 'grep', 'job_kill', 'job_list', 'job_output', 'listBugs', 'listTasks',
      'present', 'pwsh', 'queryTask', 'read', 'read_image', 'recordBug', 'resolveBug',
      'send_message', 'skill', 'submitTask', 'subagent_fork', 'todo_write', 'updateTask',
      'validateMermaid', 'web_fetch', 'web_search', 'workflow', 'write',
      'stopTaskLoop', 'taskStats', 'list_agents', 'interrupt_agent', 'create_goal', 'get_goal',
      'update_goal', 'recordImplCheckpoint', 'queryImplCheckpoint', 'listImplCheckpoints',
      'transitionProposal',
    ]
    const filtered = deriveTriageToolFilter(registered)
    expect(filtered.deny).not.toContain('bash') // 真机未注册名——restrict loud 校验必拆 spawn
    for (const name of filtered.deny) {
      expect(registered, `${name} 应在真机注册面内`).toContain(name)
    }
    // 收窄语义不回退：真机在场的 forge 动词与 shell（pwsh）仍全 deny
    expect(filtered.deny).toContain('pwsh')
    expect(filtered.deny).toContain('submitTask')
    expect(filtered.deny).toContain('validateMermaid')
    // 注册面缺席 = 既有全表形态（行为兼容——loud fail 面保持）
    expect(deriveTriageToolFilter().deny).toContain('bash')
  })

  it('contracts 矩阵单源：WORKER_FORGE_TOOLS 六员（submitTask + 两 bug 写径 + getBug 读径 + forgeDirs/forgeResolvePath 目录查询双只读径——forge-dirs-query-tool；addTask 不入 worker 面）——bug-recurrence-chain worker 放行钉住', () => {
    expect([...WORKER_FORGE_TOOLS]).toEqual(['submitTask', 'recordBug', 'resolveBug', 'getBug', 'forgeDirs', 'forgeResolvePath'])
  })
})

describe('workerAgentOptionsOf + reconcileWorkerReasoning（experts 服务折叠路由 → agentOptions）', () => {
  // workerAgentOptionsOf 四级链 16 组合与 reasoning 三级合成的穷举面收口在
  // dispatch-core/assemble.test.ts（expert-squad-default-routing 1.2）；本文件保留
  // 档位兼容收口（reconcileWorkerReasoning）回归面。

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

describe('execute · 挂起态（挂起冻结守卫：触碰零副作用 + 显式 resume:true 才 re-entry + 接管集写点）', () => {
  // 挂起冻结守卫（fix-17 · bug 8fb77b41）：挂起待裁决期间，被唤醒模型回合对 dispatchTask 的
  // 触碰（无 resume:true）不得自动续接循环——否则 worker-abort-over-limit 挂起的冻结窗内
  // 即出现第 5 次 claim 重入（挂起投影「零第 5 次重入」被模型自主 re-entry 击穿）。
  it('owner 触碰（无 resume）：零续接（driver.resume 零调用）+ resumed=false + resume-not-requested + 挂起摘要（P3 全文）+ 续跑指引', async () => {
    const h = harness()
    h.addRecord(recordOf(h.sessionId, { suspended: suspensionOf() }))
    const out = (await h.tool.execute(ARGS, h.exec)) as {
      kind: string
      summary: string
      resumed: boolean
      resumeRejectedCode?: string
      takenOver: boolean
    }
    expect(h.driver.resume).not.toHaveBeenCalled()
    expect(out.kind).toBe('suspended')
    expect(out.resumed).toBe(false)
    expect(out.resumeRejectedCode).toBe('resume-not-requested')
    expect(out.takenOver).toBe(false)
    // 挂起摘要 = P3 模板同源（payloadOf(record) 渲染——丢失兜底读径）
    expect(out.summary).toContain('任务循环挂起')
    expect(out.summary).toContain('tests hang on flaky selector')
    expect(out.summary).toContain(`dispatchTask(source_kind='feature', source_slug='feat-x', resume: true)`)
    const text = h_render(h, out)
    expect(text).toContain('任务循环挂起')
    expect(text).toContain('re-entry NOT requested')
    expect(text).toContain('resume: true')
    expect(text).not.toContain('re-entry accepted')
  })

  it('owner 显式 re-entry（resume:true）：resume 调用（loopId 锚）+ resumed=true + 续接说明', async () => {
    const h = harness()
    h.addRecord(recordOf(h.sessionId, { suspended: suspensionOf() }))
    const out = (await h.tool.execute(ARGS_RESUME, h.exec)) as { kind: string; resumed: boolean; takenOver: boolean }
    expect(out.kind).toBe('suspended')
    expect(out.resumed).toBe(true)
    expect(out.takenOver).toBe(false)
    expect(h.driver.resume).toHaveBeenCalledWith({ loopId: 'loop-1' })
    const text = h_render(h, out)
    expect(text).toContain('resumes from where it suspended (completed tasks are not re-run)')
  })

  it('非 owner 首触（无 resume）：接管集写入（唯一工具侧写点）+ takenOver=true + 零续接（守卫同守）', async () => {
    const h = harness()
    const record = recordOf('owner-x', { suspended: suspensionOf() })
    h.addRecord(record)
    const out = (await h.tool.execute(ARGS, h.exec)) as { kind: string; takenOver: boolean; resumed: boolean }
    expect(out.takenOver).toBe(true)
    expect(out.resumed).toBe(false)
    expect(h.driver.resume).not.toHaveBeenCalled()
    expect(record.takeoverSessions.has(h.sessionId)).toBe(true)
    expect(h_render(h, out)).toContain('joined the takeover set')
  })

  it('显式 re-entry 并发竞态（resume not-suspended）：resumed=false + 渲染 already resumed（零动作不误报）', async () => {
    const h = harness()
    h.addRecord(recordOf(h.sessionId, { suspended: suspensionOf() }))
    h.driver.resume.mockReturnValue({ ok: false, code: 'not-suspended' })
    const out = await h.tool.execute(ARGS_RESUME, h.exec)
    expect(out).toMatchObject({ resumed: false, resumeRejectedCode: 'not-suspended' })
    expect(h_render(h, out)).toContain('already resumed')
  })

  it('显式 re-entry 挂起期循环已被叫停（resume aborted）：resumeRejectedCode=aborted + 渲染与 not-suspended 可分辨（terminated while suspended，非并发竞态）', async () => {
    const h = harness()
    h.addRecord(recordOf(h.sessionId, { suspended: suspensionOf() }))
    h.driver.resume.mockReturnValue({ ok: false, code: 'aborted' })
    const out = await h.tool.execute(ARGS_RESUME, h.exec)
    expect(out).toMatchObject({ resumed: false, resumeRejectedCode: 'aborted' })
    const text = h_render(h, out)
    expect(text).toContain("code 'aborted'")
    expect(text).toContain('terminated while suspended')
    expect(text).not.toContain('already resumed') // 与 not-suspended 文案可分辨
  })
})

describe('execute · 池快照读数失败标注（R2-minor⑤——零值为兜底非实况）', () => {
  it('taskStats 故障：零值兜底 + readFailed=true + 渲染警示行（非全零误导模型判容器已清空）', async () => {
    const h = harness()
    h.failStats('task_stats read failed')
    const out = (await h.tool.execute(ARGS, h.exec)) as { kind: string; pool: { pending: number; readFailed?: boolean } }
    expect(out.kind).toBe('started')
    expect(out.pool).toEqual({ pending: 0, inProgress: 0, blocked: 0, unmetPending: 0, gatedPending: 0, readFailed: true })
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
    expect(d).toContain('resume: true') // 挂起冻结守卫——re-entry 需显式确认（fix-17 · bug 8fb77b41）
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

// ─────────────────────────── expert-squad-forge 1.4：allow 并集公式 ───────────────────────────

describe('deriveWorkerToolFilter allow 并集公式（expert-squad-forge 1.4——allow = 档案 tools ∪ 管线必备用具集）', () => {
  it('必备用具集单源：forge 四动词（WORKER_FORGE_TOOLS 单源；addTask 不保底）+ todo_write', () => {
    expect([...WORKER_PIPELINE_ESSENTIAL_TOOLS].sort()).toEqual([...WORKER_FORGE_TOOLS, 'todo_write'].sort())
  })

  it('穷举 20 任务类型：档案白名单不含管线工具时，必备用具恒在 allow 内且 allow∩deny 零交集', () => {
    const profileTools = ['custom-lint', 'spec-writer'] // 刻意不含任何管线必备/已知名
    expect(TASK_TYPES).toHaveLength(20)
    for (const taskType of TASK_TYPES) {
      const { allow, deny } = deriveWorkerToolFilter(taskType, undefined, profileTools)
      expect(allow, `${taskType} allow 在场`).toBeDefined()
      for (const name of WORKER_PIPELINE_ESSENTIAL_TOOLS) {
        expect(allow!, `${taskType} allow 保底 ${name}`).toContain(name)
      }
      for (const name of profileTools) expect(allow!, `${taskType} allow 档案 ${name}`).toContain(name)
      expect(allow!.filter((n) => deny.includes(n)), `${taskType} allow∩deny 空`).toEqual([])
    }
  })

  it('档案 tools 缺席 = allow 不携带（keep-only 不启用，行为与 1.4 前逐字节等价）；含未知名原样携带（loud 校验归上游创建窗口）', () => {
    expect('allow' in deriveWorkerToolFilter('coding-fix')).toBe(false)
    const withGhost = deriveWorkerToolFilter('coding-fix', undefined, ['ghost-unknown-tool'])
    expect(withGhost.allow).toContain('ghost-unknown-tool')
  })

  // ───────────────── bug 3cb118cf worker 面：allow/deny 与真机注册面求交 ─────────────────

  describe('registeredTools 求交（bug 3cb118cf：档案 pwsh 落 Mac 拆 worker spawn——989997bd worker 面同族缺口）', () => {
    // 真机 Windows 宿主全局工具面样本（retest-1.13-r2 hostlog 已知名表——无 bash）+ forge-dirs-query-tool 双查询工具
    const macRegistered = ['read', 'write', 'edit', 'glob', 'grep', 'bash', 'web_fetch', 'web_search', 'job_list', 'job_output', 'job_kill', 'read_image', 'todo_write', 'submitTask', 'addTask', 'recordBug', 'resolveBug', 'getBug', 'forgeDirs', 'forgeResolvePath', 'ask_user_question', 'subagent_fork', 'list_agents', 'send_message', 'interrupt_agent', 'workflow', 'present', 'create_goal', 'get_goal', 'update_goal']

    it('bug: 档案 allow 含 pwsh 且真机未注册 pwsh 时，解析为在场的同族 shell（bash）', () => {
      const { allow } = deriveWorkerToolFilter('coding-fix', undefined, ['read', 'pwsh'], macRegistered)
      expect(allow).toContain('bash')
      expect(allow).not.toContain('pwsh')
    })

    it('bug: allow 含真机不存在的非 shell 名 fail-soft 剔除；未知名不得入 allow（restrict loud 必拆 spawn）', () => {
      const { allow } = deriveWorkerToolFilter('coding-fix', undefined, ['ghost-unknown-tool', 'pwsh'], macRegistered)
      expect(allow).not.toContain('ghost-unknown-tool')
      expect(allow).toContain('bash')
    })

    it('bug e6669a50-G2 改判：管线必备在注册面在场时恒入 allow（求交不得剔除；未注册则走 fail-loud 断言用例）', () => {
      const { allow } = deriveWorkerToolFilter('coding-fix', undefined, ['read'], macRegistered)
      expect(allow).toContain('todo_write')
      expect(allow).toContain('submitTask')
    })

    it('deny 与注册面求交：未注册名不入 deny（win 域 bash 同族先例 989997bd worker 面）', () => {
      const { deny } = deriveWorkerToolFilter('doc', undefined, undefined, macRegistered)
      // doc 族拒绝 jobs/read-image/web——诸名 Mac 在场仍 deny；shell 族放行故 pwsh/bash 本就不在 deny
      expect(deny).toContain('job_list')
      expect(deny.every((n) => macRegistered.includes(n))).toBe(true)
    })

    it('bug e6669a50-G2: essentials 未注册 fail-loud（静默剔除 = worker 结算链瘫——submitTask 缺席不允许放行）', () => {
      const withoutSubmit = macRegistered.filter((n) => n !== 'submitTask' && n !== 'todo_write')
      expect(() =>
        deriveWorkerToolFilter('coding-fix', undefined, ['read'], withoutSubmit),
      ).toThrow(/pipeline essential/)
    })

    it('registeredTools 缺席 = 不裁剪（与既有 loud 行为逐字节等价）', () => {
      const before = deriveWorkerToolFilter('coding-fix', undefined, ['ghost', 'pwsh'])
      const after = deriveWorkerToolFilter('coding-fix', undefined, ['ghost', 'pwsh'], undefined)
      expect(after.allow).toEqual(before.allow)
      expect(after.allow).toContain('pwsh')
    })

    it('bug 92d642c2：globalToolNamesOfToolsFace——官方面无作用域直读全局名表；形状漂移/抛错 = undefined 回落', () => {
      const faceOk = { schemas: () => [{ name: 'read' }, { name: 'submitTask' }] }
      expect(globalToolNamesOfToolsFace(faceOk)).toEqual(['read', 'submitTask'])
      expect(globalToolNamesOfToolsFace({})).toBeUndefined() // schemas 缺席
      expect(globalToolNamesOfToolsFace({ schemas: () => ({ nope: 1 }) })).toBeUndefined() // 非数组
      expect(globalToolNamesOfToolsFace({ schemas: () => [{ noName: 1 }] })).toBeUndefined() // 条目无名
      expect(
        globalToolNamesOfToolsFace({
          schemas: () => {
            throw new Error('registry unavailable')
          },
        }),
      ).toBeUndefined()
      expect(globalToolNamesOfToolsFace(undefined)).toBeUndefined()
      expect(globalToolNamesOfToolsFace('garbage')).toBeUndefined()
    })
  })

  // ───────────────── bug a5b12254：求交基准探针改接跨 preset 并集面 + shell 平台兜底 ─────────────────

  describe('createUnionToolNamesProbe 跨 preset 并集（bug a5b12254——global 单层投影只剩 expert 域名）', () => {
    /** global 层仅 expert 域 10 名形态（bug e3b045dc 已定谳）——官方工具全随 preset 装 preset scope 层 */
    const globalExpertOnly = [
      { name: 'recruit_expert' },
      { name: 'update_expert' },
      { name: 'rename_expert' },
      { name: 'enable_expert' },
      { name: 'disable_expert' },
      { name: 'list_experts' },
      { name: 'delegate_expert' },
      { name: 'list_tools' },
      { name: 'list_skills' },
      { name: 'expert_misc' },
    ]
    const officialMacView = [
      { name: 'read' }, { name: 'write' }, { name: 'edit' }, { name: 'bash' },
      { name: 'todo_write' }, { name: 'submitTask' }, { name: 'recordBug' },
      { name: 'resolveBug' }, { name: 'getBug' }, { name: 'web_search' },
      // forge-dirs-query-tool 并入：forge 族六员入 worker 面（contracts WORKER_FORGE_TOOLS）
      { name: 'forgeDirs' }, { name: 'forgeResolvePath' },
    ]
    /** ScopedLayers 双层 tools 面：无参 = global 单层；携 scope key = 该 preset 装配面视图 */
    function toolsFaceOf(scopeViews: Map<object, readonly { name: string }[]>) {
      return {
        schemas: (scope?: object) =>
          scope === undefined ? [...globalExpertOnly] : [...(scopeViews.get(scope) ?? [])],
      }
    }

    it('并集含 read 金丝雀与 bash：探针可信 → 档案 pwsh 经 intersectAllowNames 解析为 bash（不再放行未注册 pwsh 拆 Mac spawn）', async () => {
      // 单 preset 全官方工具视图：acquireScope → schemas(scope) → 合并
      const scopedViews = new Map<object, readonly { name: string }[]>()
      const presets = {
        list: async () => [{ id: 'default' }],
        acquireScope: async () => {
          const key = {}
          scopedViews.set(key, officialMacView)
          return { key, [Symbol.asyncDispose]: async () => {} }
        },
      }
      const probe = createUnionToolNamesProbe((scope?: object) => toolsFaceOf(scopedViews).schemas(scope), () => presets)
      const union = await probe()
      expect(union).toBeDefined()
      expect(union!).toContain('read') // 金丝雀在场 → probeIsSubdomain false → 可信
      expect(union!).toContain('bash')
      expect(union!).toContain('recruit_expert') // global 层并入
      expect(probeIsSubdomain(union!)).toBe(false)
      const { allow } = deriveWorkerToolFilter('coding-fix', undefined, ['read', 'pwsh'], union)
      expect(allow).toContain('bash')
      expect(allow).not.toContain('pwsh')
    })

    it('agentPresets 缺席/形状漂移 = fail-soft 降级 global 单层（金丝雀守卫判不可信 → 不裁剪）', async () => {
      const probe = createUnionToolNamesProbe((scope?: object) => toolsFaceOf(new Map()).schemas(scope), () => undefined)
      const union = await probe()
      expect(union).toEqual(globalExpertOnly.map((s) => s.name))
      const { allow } = deriveWorkerToolFilter('coding-fix', undefined, ['read', 'pwsh'], union)
      // 子域投影守卫：不含金丝雀 = 不可信 → 不裁剪（allow 原样携带 pwsh——不借守卫扩大裁剪面）
      expect(allow).toContain('pwsh')
    })

    it('agentPresets.list 抛错 = global 单层降级；单 preset acquireScope 失败不外溢（部分并集）；租约 asyncDispose 释放', async () => {
      const disposed: string[] = []
      const scopedViews = new Map<object, readonly { name: string }[]>()
      const presets = {
        list: async () => [{ id: 'ok' }, { id: 'bad' }],
        acquireScope: async (id: string) => {
          if (id === 'bad') throw new Error('lease denied')
          const key = {}
          scopedViews.set(key, officialMacView)
          return { key, [Symbol.asyncDispose]: async () => { disposed.push(id) } }
        },
      }
      const probe = createUnionToolNamesProbe((scope?: object) => toolsFaceOf(scopedViews).schemas(scope), () => presets)
      const union = await probe()
      expect(union).toContain('read')
      expect(union).toContain('bash')
      expect(disposed).toEqual(['ok']) // 成功租约释放；失败租约无泄漏
      const probeListThrow = createUnionToolNamesProbe((scope?: object) => toolsFaceOf(scopedViews).schemas(scope), () => ({
        list: async () => {
          throw new Error('registry down')
        },
        acquireScope: async () => {
          throw new Error('unreachable')
        },
      }))
      expect(await probeListThrow()).toEqual(globalExpertOnly.map((s) => s.name))
    })

    it('tools 面缺席/形状漂移 = undefined（调用方回落 parent 探针）', async () => {
      const probe = createUnionToolNamesProbe(() => undefined, () => ({ list: async () => [] , acquireScope: async () => ({ key: Symbol('scope') }) as never }))
      expect(await probe()).toBeUndefined()
      const probeMalformed = createUnionToolNamesProbe(() => ({ schemas: () => 'garbage' }) as never, () => undefined)
      expect(await probeMalformed()).toBeUndefined()
    })
  })

  describe('shell 平台确定性兜底（bug a5b12254 附加要求——探针不可信/缺席时按平台解析 shell 同族名）', () => {
    it('platformShellToolName：win32 → pwsh、其余平台 → bash（与官方装配面一致）', () => {
      expect(platformShellToolName('win32')).toBe('pwsh')
      expect(platformShellToolName('darwin')).toBe('bash')
      expect(platformShellToolName('linux')).toBe('bash')
    })

    it('探针缺席 + 档案 allow 含 pwsh 落非 win 平台 → 兜底解析为 bash（spawn 不炸）；win32 反向同证', () => {
      const mac = deriveWorkerToolFilter('coding-fix', undefined, ['read', 'pwsh'], undefined, 'darwin')
      expect(mac.allow).toContain('bash')
      expect(mac.allow).not.toContain('pwsh')
      const win = deriveWorkerToolFilter('coding-fix', undefined, ['read', 'bash'], undefined, 'win32')
      expect(win.allow).toContain('pwsh')
      expect(win.allow).not.toContain('bash')
    })

    it('兜底仅作用于 shell 同族名：其余未知名探针缺席时仍原样放行（不借兜底扩大裁剪面）', () => {
      const mac = deriveWorkerToolFilter('coding-fix', undefined, ['ghost-unknown-tool', 'pwsh'], undefined, 'darwin')
      expect(mac.allow).toContain('ghost-unknown-tool')
      expect(mac.allow).toContain('bash')
      expect(mac.allow).not.toContain('pwsh')
    })

    it('探针不可信（子域投影置 undefined）→ 平台兜底同样生效；platform 缺席 = 既有原样放行（行为零变化）', () => {
      const subdomain = globalExpertOnlyNamesOf()
      const mac = deriveWorkerToolFilter('coding-fix', undefined, ['read', 'pwsh'], subdomain, 'darwin')
      expect(mac.allow).toContain('bash')
      expect(mac.allow).not.toContain('pwsh')
      const noPlatform = deriveWorkerToolFilter('coding-fix', undefined, ['read', 'pwsh'], undefined)
      expect(noPlatform.allow).toContain('pwsh')
    })

    it('探针可信时按在场者互换优先（平台兜底不介入）', () => {
      // forge-dirs-query-tool 并入：essentials 断言面含 forgeDirs/forgeResolvePath，夹具随注
      const macRegistered = ['read', 'bash', 'todo_write', 'submitTask', 'recordBug', 'resolveBug', 'getBug', 'forgeDirs', 'forgeResolvePath']
      const { allow } = deriveWorkerToolFilter('coding-fix', undefined, ['pwsh'], macRegistered, 'darwin')
      expect(allow).toContain('bash')
    })
  })
})

/** expert 域子域投影名表（守卫不可信判据用例夹具——复用上方 describe 的 global 单层形态） */
function globalExpertOnlyNamesOf(): readonly string[] {
  return [
    'recruit_expert', 'update_expert', 'rename_expert', 'enable_expert', 'disable_expert',
    'list_experts', 'delegate_expert', 'list_tools', 'list_skills', 'expert_misc',
  ]
}
