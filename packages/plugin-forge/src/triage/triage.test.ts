// S1c · 处置代理单测（run-tasks-host-command/1.5 验收面）：一次性 subagent 被 spawn（与
// worker 同款 in-process 形态——同一 SpawnWorker 面），提示词 = 任务简报/blocked reason 全文/
// 池快照/最近记录四件套 + 两信号（loop-recurrence-hardening §2.2.1），工具面只读放开
// （getBug/listBugs 放行、写面恒 deny）；终态 output 产出结构化四动作决策（含 escalate
// 升级载荷）；无效/越权输出 → TriageDecisionInvalidError（计处置失败）。
import { describe, expect, it } from 'vitest'
import type { ForgeSettingsService, ForgeTasksService, QueryTaskResult, TaskRecordEntry, TaskSnapshot, TaskStats, TaskStatus } from '@dsh-forge/contracts'
import { composeTriagePrompt } from './prompt.js'
import { createTriageHook } from './triage.js'
import type { TriageHookDeps } from './triage.js'
import { extractDecisionJson, parseTriageDecision, TriageDecisionInvalidError } from './decision.js'
import type { SpawnWorkerHandle, SpawnWorkerRequest } from '../dispatch-core/index.js'
import type { LoopTriageInput } from '../loop/index.js'

// ─────────────────────────── 夹具 ───────────────────────────

function snapshot(over: Partial<TaskSnapshot> = {}): TaskSnapshot {
  return {
    taskId: 't-1',
    slug: 'feat-x',
    localId: '3.2',
    source: { kind: 'feature', slug: 'feat-x' },
    title: '装配桩',
    taskType: 'coding-feature',
    taskStatus: 'blocked',
    taskDesc: 'pnpm 安装失败，编译环境缺失',
    acceptanceCriteria: ['[AC-1] 编译通过', '[AC-2] 测试绿'],
    breaking: false,
    complexity: 'medium',
    createdAt: '2026-10-11T00:00:00.000Z',
    updatedAt: '2026-10-11T00:00:00.000Z',
    ...over,
  }
}

function statsOf(): TaskStats {
  const byStatus: Record<TaskStatus, number> = {
    pending: 2,
    in_progress: 0,
    blocked: 1,
    completed: 3,
    skipped: 0,
    rejected: 0,
    suspended: 0,
    interrupted: 0,
  }
  return { total: 6, byStatus, unmetPending: 1 }
}

const RECORDS: TaskRecordEntry[] = [
  { verb: 'claim', toStatus: 'in_progress', actor: 'plugin-tool', createdAt: '2026-10-11T01:00:00.000Z' },
  {
    verb: 'submit',
    toStatus: 'blocked',
    reason: 'pnpm 安装失败，编译环境缺失',
    actor: 'plugin-tool',
    createdAt: '2026-10-11T02:00:00.000Z',
  },
]

function queryOf(): QueryTaskResult {
  return {
    task: snapshot(),
    container: { kind: 'feature', slug: 'feat-x', title: 'feat-x' },
    records: RECORDS,
  }
}

function triageInput(over: Partial<LoopTriageInput> = {}): LoopTriageInput {
  return {
    projectId: 'p-1',
    source: { kind: 'feature', slug: 'feat-x' },
    ownerSessionId: 'owner-1',
    parent: { agentTag: 'owner-root' },
    signal: new AbortController().signal,
    task: snapshot(),
    reason: 'pnpm 安装失败，编译环境缺失',
    settlement: { kind: 'spawned', outcome: 'blocked' },
    ...over,
  }
}

interface Built {
  hookDeps: TriageHookDeps
  requests: SpawnWorkerRequest[]
  tasksCalls: { stats: unknown[]; query: unknown[] }
  disposeCount(): number
  resolve(output: string): void
  reject(cause: unknown): void
}

function build(over: Partial<TriageHookDeps> = {}): Built {
  const requests: SpawnWorkerRequest[] = []
  const tasksCalls: { stats: unknown[]; query: unknown[] } = { stats: [], query: [] }
  let disposed = 0
  let settle!: (r: { stopReason: string; output: string }) => void
  let fail!: (cause: unknown) => void
  const result = new Promise<{ stopReason: string; output: string }>((res, rej) => {
    settle = res
    fail = rej
  })
  const handle: SpawnWorkerHandle = {
    workerSessionId: 'triage-1',
    result,
    dispose: async () => {
      disposed += 1
    },
  }
  const tasks = {
    taskStats: async (input: unknown) => {
      tasksCalls.stats.push(input)
      return statsOf()
    },
    queryTask: async (input: unknown) => {
      tasksCalls.query.push(input)
      return queryOf()
    },
  } as unknown as ForgeTasksService
  const hookDeps: TriageHookDeps = {
    tasks,
    spawn: async (req) => {
      requests.push(req)
      return handle
    },
    ...over,
  }
  return {
    hookDeps,
    requests,
    tasksCalls,
    disposeCount: () => disposed,
    resolve: (output) => settle({ stopReason: 'completed', output }),
    reject: (cause) => fail(cause),
  }
}

// ─────────────────────────── spawn 形态与输入四件套 ───────────────────────────

describe('处置代理被 spawn（与 worker 同款 in-process 形态）', () => {
  it('spawn 面收齐：提示词四件套全在 + 工具面全收窄 + label/parent 透传', async () => {
    const built = build()
    const done = createTriageHook(built.hookDeps).run(triageInput())
    built.resolve('{"action":"escalate"}')
    await done
    expect(built.requests).toHaveLength(1)
    const req = built.requests[0] as SpawnWorkerRequest
    // 四件套：任务简报（键/标题/说明/AC）+ reason 全文 + 池快照计数 + 最近记录
    expect(req.prompt).toContain('feat-x/3.2 装配桩')
    expect(req.prompt).toContain('pnpm 安装失败，编译环境缺失')
    expect(req.prompt).toContain('[AC-1] 编译通过')
    expect(req.prompt).toContain('待执行 2 · 执行中 0 · 阻塞 1 · 前置未满足 1')
    expect(req.prompt).toContain('[submit] → blocked — pnpm 安装失败')
    // 决策权与执行权分离：只读放开（getBug/listBugs 在场 = 不 deny——台账深挖面）+
    // 写面/任务域动词/shell 恒 deny（结构性不可达断言保留）
    for (const name of ['bash', 'read', 'write', 'addTask', 'submitTask', 'recordBug', 'resolveBug', 'dispatchTask', 'queryTask']) {
      expect(req.toolFilter.deny).toContain(name)
    }
    expect(req.toolFilter.deny).not.toContain('getBug')
    expect(req.toolFilter.deny).not.toContain('listBugs')
    expect(req.parent).toEqual({ agentTag: 'owner-root' })
    expect(req.label).toBe('feat-x/3.2 · 处置分析')
  })

  it('bug 989997bd：parent 真机工具面在场 = deny 与注册面求交（未注册名 bash 剔除）；缺席 = 全表兼容', async () => {
    // 真机形态：parent.ctx.tools.schemas() 投影已注册全局工具名（win 域无 bash）
    const parentWithFace = {
      ctx: { tools: { schemas: () => [{ name: 'pwsh' }, { name: 'read' }, { name: 'submitTask' }] } },
    }
    const builtFace = build()
    const doneFace = createTriageHook(builtFace.hookDeps).run(triageInput({ parent: parentWithFace }))
    builtFace.resolve('{"action":"escalate"}')
    await doneFace
    const denyFace = (builtFace.requests[0] as SpawnWorkerRequest).toolFilter.deny!
    expect(denyFace).not.toContain('bash')
    expect(denyFace).toContain('pwsh')
    expect(denyFace).toContain('submitTask')
    for (const name of denyFace) {
      expect(['pwsh', 'read', 'submitTask'], `${name} 应在注册面内`).toContain(name)
    }
    // 兼容形态：parent 无工具面（测试桩/极简 profile）= 全表 deny（既有 loud 语义不变）
    const builtPlain = build()
    const donePlain = createTriageHook(builtPlain.hookDeps).run(triageInput())
    builtPlain.resolve('{"action":"escalate"}')
    await donePlain
    expect((builtPlain.requests[0] as SpawnWorkerRequest).toolFilter.deny).toContain('bash')
  })

  it('身份载体每调用绑定（1.11 装配接线收口）：parent/signal 取自输入面，装配期烘焙无效', async () => {
    // 同一钩子面两次 run（不同 build 实例各自收请求）——spawn 请求身份各随各的输入
    const first = new AbortController()
    const second = new AbortController()
    const parentA = { agentTag: 'parent-a' }
    const parentB = { agentTag: 'parent-b' }
    const builtA = build()
    const builtB = build()
    const doneA = createTriageHook(builtA.hookDeps).run(triageInput({ ownerSessionId: 'owner-a', parent: parentA, signal: first.signal }))
    const doneB = createTriageHook(builtB.hookDeps).run(triageInput({ ownerSessionId: 'owner-b', parent: parentB, signal: second.signal }))
    builtA.resolve('{"action":"escalate"}')
    builtB.resolve('{"action":"escalate"}')
    await Promise.all([doneA, doneB])
    const reqA = builtA.requests[0] as SpawnWorkerRequest
    const reqB = builtB.requests[0] as SpawnWorkerRequest
    expect(reqA.parent).toBe(parentA)
    expect(reqA.signal).toBe(first.signal)
    expect(reqB.parent).toBe(parentB)
    expect(reqB.signal).toBe(second.signal)
  })

  it('输入现读两调（taskStats + queryTask records）——处置瞬间取数', async () => {
    const built = build()
    const done = createTriageHook(built.hookDeps).run(triageInput())
    built.resolve('{"action":"escalate"}')
    await done
    expect(built.tasksCalls.stats).toEqual([{ projectId: 'p-1', source: { kind: 'feature', slug: 'feat-x' } }])
    expect(built.tasksCalls.query).toEqual([
      { projectId: 'p-1', taskRef: { slug: 'feat-x', localId: '3.2' }, include: { records: true } },
    ])
  })

  it('spawn 拒绝（基建故障）原样上抛——宿主计处置失败', async () => {
    const failing = build({
      spawn: async () => {
        throw new Error('subagent factory rejected')
      },
    })
    await expect(createTriageHook(failing.hookDeps).run(triageInput())).rejects.toThrow('subagent factory rejected')
  })

  it('result 拒绝（执行面崩溃）原样上抛；dispose 收尾不漏', async () => {
    const built = build()
    const done = createTriageHook(built.hookDeps).run(triageInput())
    built.reject(new Error('triage agent crashed'))
    await expect(done).rejects.toThrow('triage agent crashed')
    expect(built.disposeCount()).toBe(1)
  })

  it('forgeSettings.worker 残值静默失效 + 档案缺席：agentOptions 键不携带（回退父继承——硬切退役回归）', async () => {
    const built = build({ settings: { get: async () => ({ worker: { provider: 'p', model: 'm', reasoning: 'high' } }) } as Pick<ForgeSettingsService, 'get'> })
    const done = createTriageHook(built.hookDeps).run(triageInput())
    built.resolve('{"action":"escalate"}')
    await done
    expect('agentOptions' in (built.requests[0] as SpawnWorkerRequest)).toBe(false)
  })

  it('档案 provider+model 成对在场 = 路由对进 agentOptions（experts 折叠路由——与 worker 同链）', async () => {
    const built = build({
      settings: { get: async () => ({}) } as Pick<ForgeSettingsService, 'get'>,
      resolveExpertProfile: async () => ({ name: 'triage-analyst', personaMd: '档案正文。', provider: 'deepseek-official', model: 'deepseek-flash' }),
    })
    const done = createTriageHook(built.hookDeps).run(triageInput())
    built.resolve('{"action":"escalate"}')
    await done
    const req = built.requests[0] as SpawnWorkerRequest
    expect(req.agentOptions).toEqual({ provider: 'deepseek-official', model: 'deepseek-flash' })
    expect(req.persona).toBeDefined() // 人格面照常——路由修复不回退 1.6 persona
  })

  it('档案仅 model 单独在场：无成对路由且无基座 = 整组省略（forgeSettings.worker 基座已退役）', async () => {
    const built = build({
      settings: { get: async () => ({}) } as Pick<ForgeSettingsService, 'get'>,
      resolveExpertProfile: async () => ({ name: 'triage-analyst', personaMd: '档案正文。', model: 'only-model' }),
    })
    const done = createTriageHook(built.hookDeps).run(triageInput())
    built.resolve('{"action":"escalate"}')
    await done
    expect('agentOptions' in (built.requests[0] as SpawnWorkerRequest)).toBe(false)
  })
})

// ─────────────────────────── persona 档案合成（expert-squad-forge-2 纳入 2） ───────────────────────────

describe('persona 档案合成（专家取用缝——缺档 fail-loud 同 worker 语义）', () => {
  const PROFILE = { name: 'triage-analyst', title: '处置分析专家', personaMd: '失败分类与修复派生纪律。' }

  it('spawn 请求携带档案人格段 persona；键 = settings experts.mapping.triage 覆盖优先', async () => {
    const seenKeys: string[] = []
    const built = build({
      settings: {
        get: async () => ({ experts: { mapping: { triage: 'my-triage' } } }),
      } as unknown as Pick<ForgeSettingsService, 'get'>,
      resolveExpertProfile: async (_taskType, key) => {
        seenKeys.push(key ?? '<missing>')
        return PROFILE
      },
    })
    const done = createTriageHook(built.hookDeps).run(triageInput())
    built.resolve('{"action":"escalate"}')
    await done
    expect(seenKeys).toEqual(['my-triage'])
    const req = built.requests[0] as SpawnWorkerRequest
    expect(req.persona).toContain('你是处置分析专家。')
    expect(req.persona).toContain('失败分类与修复派生纪律。')
    // 分层承载（S2 同径）：人格面不进任务提示词
    expect(req.prompt).not.toContain(req.persona!)
  })

  it('settings 无覆盖 = 预设 triage-analyst 键取档；title 缺席回落 name 身份头', async () => {
    const seenKeys: string[] = []
    const built = build({
      resolveExpertProfile: async (_taskType, key) => {
        seenKeys.push(key ?? '<missing>')
        return { name: 'triage-analyst', personaMd: '档案正文。' }
      },
    })
    const done = createTriageHook(built.hookDeps).run(triageInput())
    built.resolve('{"action":"escalate"}')
    await done
    expect(seenKeys).toEqual(['triage-analyst'])
    expect((built.requests[0] as SpawnWorkerRequest).persona).toContain('你是 triage-analyst。')
  })

  it('缺档 fail-loud：resolver 错误原样上抛（消息含键名），spawn 零调用', async () => {
    const built = build({
      resolveExpertProfile: async () => {
        throw new Error('expert not found: triage-analyst')
      },
    })
    await expect(createTriageHook(built.hookDeps).run(triageInput())).rejects.toThrow('expert not found: triage-analyst')
    expect(built.requests).toHaveLength(0)
  })

  it('取用缝缺席 = 形态兼容：spawn 请求不携带 persona 键（非显式 undefined 覆盖）', async () => {
    const built = build()
    const done = createTriageHook(built.hookDeps).run(triageInput())
    built.resolve('{"action":"escalate"}')
    await done
    expect('persona' in (built.requests[0] as SpawnWorkerRequest)).toBe(false)
  })
})

// ─────────────────────────── 结构化三动作决策 ───────────────────────────

describe('结构化三动作决策（封闭枚举——宿主忠实执行的解析面）', () => {
  it('add-fix：围栏 JSON（title/type/taskDesc/note 全参）', () => {
    const decision = parseTriageDecision(
      ['分析过程略。', '```json', '{"action":"add-fix","title":"修构建脚本","type":"coding-fix","taskDesc":"锁版本","note":"修构建脚本依赖版本"}', '```'].join('\n'),
    )
    expect(decision).toEqual({ action: 'add-fix', title: '修构建脚本', type: 'coding-fix', taskDesc: '锁版本', note: '修构建脚本依赖版本' })
  })

  it('add-fix：裸 JSON 缺省参（宿主补缺省——title/type/taskDesc/note 全可选）', () => {
    expect(parseTriageDecision('前置说明 {"action":"add-fix"} 后置说明')).toEqual({ action: 'add-fix' })
  })

  it('wait-external：externalSlug 必带（trim）', () => {
    expect(parseTriageDecision('{"action":"wait-external","externalSlug":" feature-b "}')).toEqual({
      action: 'wait-external',
      externalSlug: 'feature-b',
    })
  })

  it('escalate：无载荷（旧无载荷形态——payload 键缺席）', () => {
    expect(parseTriageDecision('{"action":"escalate"}')).toEqual({ action: 'escalate' })
  })
})

describe('无效/越权输出 → TriageDecisionInvalidError（计处置失败入重试上限）', () => {
  it('无 JSON 决策（纯散文）', () => {
    expect(() => parseTriageDecision('我建议人工介入。')).toThrowError(TriageDecisionInvalidError)
  })
  it('越权动作（封闭三动作枚举之外）', () => {
    expect(() => parseTriageDecision('{"action":"dispatch","slug":"x"}')).toThrowError(/越权动作/)  })
  it('wait-external 缺 externalSlug', () => {
    expect(() => parseTriageDecision('{"action":"wait-external"}')).toThrowError(/externalSlug/)
  })
  it('add-fix.type 越出任务类型全集', () => {
    expect(() => parseTriageDecision('{"action":"add-fix","type":"not-a-type"}')).toThrowError(/add-fix\.type/)
  })
  it('字段型错（title 数字）', () => {
    expect(() => parseTriageDecision('{"action":"add-fix","title":42}')).toThrowError(/add-fix\.title/)
  })
  it('决策非 JSON 对象（围栏数组→对象性拒绝；裸标量→无候选拒绝）', () => {
    expect(() => parseTriageDecision('```json\n["action"]\n```')).toThrowError(/JSON 对象/)
    expect(() => parseTriageDecision('"escalate"')).toThrowError(/不含 JSON 决策/)
  })
})

describe('决策 JSON 提取（围栏/裸对象/嵌套回溯，扫描窗口有界）', () => {
  it('围栏块优先（自尾向前）', () => {
    const raw = '```json\n{"action":"escalate"}\n```'
    expect(extractDecisionJson(raw)).toBe('{"action":"escalate"}')
  })
  it('裸对象：前后散文并存，命中最后一个平衡对象', () => {
    const raw = '注意 {"not":"decision"} 之类。结论：{"action":"wait-external","externalSlug":"feature-b"}'
    expect(extractDecisionJson(raw)).toBe('{"action":"wait-external","externalSlug":"feature-b"}')
  })
  it('无候选 = undefined', () => {
    expect(extractDecisionJson('完全没有对象')).toBeUndefined()
  })
})

describe('提示词组装（纯函数——决策规则与输出契约自释）', () => {
  it('四件套 + 四动作规则 + 分界指引 + 单行 JSON 契约；无记录 = 占位行', () => {
    const text = composeTriagePrompt({ task: snapshot({ taskDesc: undefined, acceptanceCriteria: undefined }), reason: 'r', pool: { pending: 0, inProgress: 0, blocked: 1, unmetPending: 0 }, records: [] })
    expect(text).toContain('"add-fix"')
    expect(text).toContain('"wait-external"')
    expect(text).toContain('"escalate"')
    expect(text).toContain('"split-remainder"')
    // 分界指引（split-remainder B）：窄因→add-fix；结构性剩余→split
    expect(text).toContain('窄因可解整个源任务')
    expect(text).toContain('add-fix（源任务恢复后续跑）')
    expect(text).toContain('结构性独立范围')
    expect(text).toContain('split-remainder')
    expect(text).toContain('{"action":"escalate"}')
    expect(text).toContain('{"action":"split-remainder"')
    expect(text).toContain('（无记录）')
    expect(text).not.toContain('undefined')
  })

  it('改进 6① 重试回灌：lastFailure 在场 = 失败摘要 + 封闭枚举重申节；缺席 = 零节', () => {
    const base = { task: snapshot(), reason: 'r', pool: { pending: 0, inProgress: 0, blocked: 1, unmetPending: 0 }, records: [] }
    const withFailure = composeTriagePrompt({ ...base, lastFailure: '越权动作——dispatch（RAW-SNIPPET）' })
    expect(withFailure).toContain('<last-failure>')
    expect(withFailure).toContain('RAW-SNIPPET')
    expect(withFailure).toContain('封闭四动作枚举')
    expect(composeTriagePrompt(base)).not.toContain('<last-failure>')
  })

  it('改进 6④ 链深余量：fixChain 在场 = 链深/上限/余量节；余量不足追加禁用 add-fix 指引', () => {
    const base = { task: snapshot(), reason: 'r', pool: { pending: 0, inProgress: 0, blocked: 1, unmetPending: 0 }, records: [] }
    const withChain = composeTriagePrompt({ ...base, fixChain: { depth: 2, limit: 6, remaining: 4 } })
    expect(withChain).toContain('fix 链深: 2（上限 6，剩余余量 4）')
    expect(withChain).not.toContain('禁止选择 add-fix')
    const exhausted = composeTriagePrompt({ ...base, fixChain: { depth: 6, limit: 6, remaining: 0 } })
    expect(exhausted).toContain('禁止选择 add-fix')
    expect(exhausted).toContain('split-remainder 或 escalate')
    expect(composeTriagePrompt(base)).not.toContain('<fix-chain>')
  })

  it('FAIL-2 修正：noProgress 在场 = 无进展信号节（零提交零文件改动）；缺席 = 零节', () => {
    const base = { task: snapshot(), reason: 'r', pool: { pending: 0, inProgress: 0, blocked: 1, unmetPending: 0 }, records: [] }
    const withNoProgress = composeTriagePrompt({ ...base, noProgress: true })
    expect(withNoProgress).toContain('<no-progress>')
    expect(withNoProgress).toContain('没有任何进展信号')
    expect(composeTriagePrompt(base)).not.toContain('<no-progress>')
  })

  it('改进 6①④ 钩子透传：triage 输入的 lastFailure/fixChain 进提示词（缺席零节）', async () => {
    const built = build()
    const done = createTriageHook(built.hookDeps).run(
      triageInput({ lastFailure: '输出摘要 RAW', fixChain: { depth: 5, limit: 6, remaining: 1 } }),
    )
    built.resolve('{"action":"escalate"}')
    await done
    const prompt = (built.requests[0] as SpawnWorkerRequest).prompt
    expect(prompt).toContain('RAW')
    expect(prompt).toContain('剩余余量 1')
  })

  it('FAIL-2 修正 钩子透传：triage 输入的 noProgress 进提示词（缺席零节）', async () => {
    const built = build()
    const done = createTriageHook(built.hookDeps).run(triageInput({ noProgress: true }))
    built.resolve('{"action":"escalate"}')
    await done
    expect((built.requests[0] as SpawnWorkerRequest).prompt).toContain('<no-progress>')
  })
})

// ─────────────────────────── 两信号 + 只读工具面（loop-recurrence-hardening §2.2.1 / AC11） ───────────────────────────

describe('两信号注入（blocked 归类 + recurrence 链——<signals> 节渲染）', () => {
  it('钩子组装两信号：blocked submit 记录归类 + 只读 face 现查链 → 提示词 <signals> 节', async () => {
    const recordsWithClassification: TaskRecordEntry[] = [
      ...RECORDS,
      {
        verb: 'submit',
        toStatus: 'blocked',
        reason: '又炸了',
        blockClassification: { kind: 'same-family-recurrence', recurrenceOf: 'bug-前驱' },
        actor: 'plugin-tool',
        createdAt: '2026-10-11T03:00:00.000Z',
      },
    ]
    const built = build({
      tasks: {
        taskStats: async () => statsOf(),
        queryTask: async () => ({ ...queryOf(), records: recordsWithClassification }),
      } as unknown as ForgeTasksService,
      findRecurrenceCandidates: async () => [{ bugId: 'bug-b2', summary: '复发②', chain: ['bug-root', 'bug-b1', 'bug-b2'] }],
    })
    const done = createTriageHook(built.hookDeps).run(triageInput())
    built.resolve('{"action":"escalate"}')
    await done
    const prompt = (built.requests[0] as SpawnWorkerRequest).prompt
    expect(prompt).toContain('<signals>')
    expect(prompt).toContain('阻塞归类: same-family-recurrence（自报前驱 bug-前驱）')
    expect(prompt).toContain('台账 recurrence 链: bug-root → bug-b1 → bug-b2（同缝计数 2）')
    // 防盲试条款（程序径——同缝 ≥ 2 渲染禁 add-fix 指引）
    expect(prompt).toContain('禁止选择 add-fix（盲试修复必被宿主守卫软拒绝）；请选择 escalate 上浮排查')
  })

  it('同缝 < 2：链信号在场但零禁 add-fix 指引', async () => {
    const built = build({
      findRecurrenceCandidates: async () => [{ bugId: 'bug-b1', summary: '复发①', chain: ['bug-root', 'bug-b1'] }],
    })
    const done = createTriageHook(built.hookDeps).run(triageInput())
    built.resolve('{"action":"escalate"}')
    await done
    const prompt = (built.requests[0] as SpawnWorkerRequest).prompt
    expect(prompt).toContain('<signals>')
    expect(prompt).not.toContain('禁止选择 add-fix（盲试修复必被宿主守卫软拒绝）')
  })

  it('face 缺席/故障 fail-soft：信号退化，提示词照常组装（零 <signals> 节）', async () => {
    const builtAbsent = build()
    const doneAbsent = createTriageHook(builtAbsent.hookDeps).run(triageInput())
    builtAbsent.resolve('{"action":"escalate"}')
    await doneAbsent
    expect((builtAbsent.requests[0] as SpawnWorkerRequest).prompt).not.toContain('<signals>')
    const builtFailing = build({
      findRecurrenceCandidates: () => {
        throw new Error('ledger down')
      },
    })
    const doneFailing = createTriageHook(builtFailing.hookDeps).run(triageInput())
    builtFailing.resolve('{"action":"escalate"}')
    await doneFailing
    expect((builtFailing.requests[0] as SpawnWorkerRequest).prompt).not.toContain('<signals>')
  })

  it('纯函数面：signals 渲染 + 防盲试 SOP 条款 + 台账查询指引恒在', () => {
    const base = { task: snapshot(), reason: 'r', pool: { pending: 0, inProgress: 0, blocked: 1, unmetPending: 0 }, records: [] }
    const withSignals = composeTriagePrompt({
      ...base,
      signals: { classification: { kind: 'new-problem' }, recurrence: { chain: ['a', 'b', 'c'], count: 2 } },
    })
    expect(withSignals).toContain('阻塞归类: new-problem')
    expect(withSignals).toContain('台账 recurrence 链: a → b → c（同缝计数 2）')
    const plain = composeTriagePrompt(base)
    // 台账查询指引与防盲试 SOP 条款恒在（不随 signals 缺席退化）
    for (const text of [withSignals, plain]) {
      expect(text).toContain('<ledger-tools>')
      expect(text).toContain('getBug(bug_id)')
      expect(text).toContain('listBugs(search/status/sort/offset/limit)')
      expect(text).toContain('防盲试条款')
      expect(text).toContain('自判为可形式化形态')
      // 「你没有任何工具」事实性矛盾断言清除
      expect(text).not.toContain('你没有任何工具')
    }
    expect(plain).not.toContain('<signals>')
  })

  it('提示词升级载荷四节指引 + escalate 语义标注（上浮主会话非问用户）', () => {
    const text = composeTriagePrompt({ task: snapshot(), reason: 'r', pool: { pending: 0, inProgress: 0, blocked: 1, unmetPending: 0 }, records: [] })
    expect(text).toContain('"escalate" —— 上浮主会话处置')
    expect(text).toContain('不是问用户的工具')
    expect(text).toContain('classification')
    expect(text).toContain('disposition')
    expect(text).toContain('delegateTarget')
    expect(text).toContain('evidencePointers')
  })
})

// ─────────────────────────── hook 返回形状（triage-progress-row 契约定形） ───────────────────────────

describe('hook 返回形状 { decision, workerSessionId? }（triage-progress-row——spawn 产物 handle 取数上浮）', () => {
  it('决策 + spawn 产物 handle.workerSessionId 一起返回', async () => {
    const built = build()
    const done = createTriageHook(built.hookDeps).run(triageInput())
    built.resolve('分析过程略。\n{"action":"add-fix","note":"修依赖版本"}')
    await expect(done).resolves.toEqual({
      decision: { action: 'add-fix', note: '修依赖版本' },
      workerSessionId: 'triage-1',
    })
    expect(built.disposeCount()).toBe(1)
  })
})
