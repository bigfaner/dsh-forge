// S2 指令单测 —— /run-dag-tasks handler（run-tasks-host-command proposal S2 + SC1 +
// decisions #19/#20；问询用桩注入）。覆盖：无参单查询枚举双轨候选→问询→选中即启动；
// 带参直通；跑动中再触发→查看/停止/替换问询（停止走本会话作用域——跨会话隔离在
// driver 层已有 pin，此处 pin handler 恒以敲指令会话 id 调 stop）；启动成功后的派发
// 指令单行提交（fix-1——known command 零转录的 producer 补位，/plan 先例）。
import { describe, expect, it, vi } from 'vitest'
import type { ContainerRef, ForgeTasksService, ListTasksQuery, TaskCard, TaskStatus } from '@dsh-forge/contracts'
import type { LoopDriver, LoopRecord, LoopStartInput, LoopStopResult } from '../loop/index.js'
import { createRunDagTasksHandler } from './run-dag-tasks.js'

// ─────────────────────────── 桩与夹具 ───────────────────────────

const CWD = 'C:\\ws\\demo'
const PROJECT = 'p-9'
const SESSION = 's-main'

/** followup 提交记录（fix-1 断言径——已知命令零转录，指令单行由 producer 显式提交） */
interface followupedMessage {
  readonly role: unknown
  readonly text: unknown
  readonly sourceKind: unknown
}

/** agent 桩（session 身份 + 可选 followup 记录器——followup 缺席形态 = fail-soft 分支靶） */
function agentOf(
  sessionId = SESSION,
  cwd: string | undefined = CWD,
  followup?: (message: unknown) => void,
): { session: { id: string; header?: { cwd?: string } }; followup?: (message: unknown) => void } {
  return {
    session: {
      id: sessionId,
      ...(cwd !== undefined ? { header: { cwd } } : {}),
    },
    ...(followup !== undefined ? { followup } : {}),
  }
}

/** followup 记录器（消息形状窄读——role/text/source.kind 三键断言面） */
function followupRecorder(): { followuped: followupedMessage[]; fn: (message: unknown) => void } {
  const followuped: followupedMessage[] = []
  return {
    followuped,
    fn: (message: unknown) => {
      const m = message as { role?: unknown; content?: { type?: unknown; text?: unknown }[]; source?: { kind?: unknown } }
      followuped.push({
        role: m?.role,
        text: m?.content?.[0]?.text,
        sourceKind: m?.source?.kind,
      })
    },
  }
}

function card(source: ContainerRef, localId: string, taskStatus: TaskStatus, over: Partial<TaskCard> = {}): TaskCard {
  return {
    taskId: `${source.slug}-${localId}`,
    slug: source.slug,
    localId,
    title: `任务 ${localId}`,
    taskType: 'coding-feature',
    taskStatus,
    prerequisites: [],
    sessionCount: 0,
    source,
    ...over,
  }
}

/** driver 桩（按 owner 语义的最小登记表——跨会话隔离的 handler 侧观察径） */
function driverStub(options: { activeRecord?: LoopRecord; startCode?: 'loop-active' } = {}) {
  const loops = new Map<string, LoopRecord>()
  const startInputs: LoopStartInput[] = []
  const stopInputs: { ownerSessionId: string }[] = []
  if (options.activeRecord !== undefined) loops.set(options.activeRecord.ownerSessionId, options.activeRecord)
  const recordOf = (ownerSessionId: string, slug: string): LoopRecord => ({
    id: `loop-${ownerSessionId}`,
    source: { kind: 'feature', slug },
    ownerSessionId,
    projectId: PROJECT,
  })
  const driver: LoopDriver = {
    start: vi.fn(async (input: LoopStartInput) => {
      startInputs.push(input)
      // 同源竞态脚本：start 恒拒绝（占用读数后的启动窗口模拟）
      if (options.startCode === 'loop-active') {
        return {
          ok: false as const,
          code: 'loop-active' as const,
          activeSource: { kind: 'feature' as const, slug: input.source.slug },
          activeOwnerSessionId: 's-race',
        }
      }
      // 同源独占（2026-10-12 多会话并行裁决）：同 kind+slug 已在跑才拒；他源他 session 并行放行
      for (const record of loops.values()) {
        if (record.source.kind === input.source.kind && record.source.slug === input.source.slug) {
          return { ok: false as const, code: 'loop-active' as const, activeSource: record.source, activeOwnerSessionId: record.ownerSessionId }
        }
      }
      loops.set(input.ownerSessionId, recordOf(input.ownerSessionId, input.source.slug))
      return { ok: true as const, loopId: 'loop-new' }
    }),
    stop: vi.fn(async (input: { ownerSessionId: string }): Promise<LoopStopResult> => {
      stopInputs.push(input)
      // decisions #20 作用域：仅停同会话循环（他会话活循环不受影响）
      if (!loops.has(input.ownerSessionId)) return { ok: false, code: 'no-active-loop' }
      loops.delete(input.ownerSessionId)
      return { ok: true, stopped: true, hadInFlight: false }
    }),
    activeOf: vi.fn((ownerSessionId: string) => loops.get(ownerSessionId)),
    activeAll: vi.fn(() => [...loops.values()]),
    dispose: vi.fn(() => {}),
  }
  return { driver, startInputs, stopInputs, loops, recordOf }
}

/** tasks 桩（listTasks 单查询记录 + 卡集脚本） */
function tasksStub(cards: TaskCard[] = [], behavior?: (q: ListTasksQuery) => never) {
  const listInputs: ListTasksQuery[] = []
  const tasks = {
    listTasks: async (q: ListTasksQuery) => {
      listInputs.push(q)
      if (behavior !== undefined) behavior(q)
      return cards
    },
  } as unknown as ForgeTasksService
  return { tasks, listInputs }
}

/** 问询桩（记录请求 + 脚本应答/故障） */
function askStub(answer?: (request: unknown) => unknown, reject?: Error) {
  const requests: unknown[] = []
  return {
    requests,
    face: {
      ask: async (request: unknown) => {
        requests.push(request)
        if (reject !== undefined) throw reject
        return answer?.(request) ?? { answers: [] }
      },
    },
  }
}

function answerLabel(label: string) {
  // 回读真实问询 id（handler 按 id 取 answers——桩逐字对齐该协议）
  return (request: unknown) => {
    const id = (request as { questions: { id: string }[] }).questions[0]?.id
    return { answers: [{ id, selected: [label] }] }
  }
}

/** 依赖组（缺省 = 已注册工作区 + 空池 + 无问询 + 无活根解析） */
function depsOf(options: {
  cards?: TaskCard[]
  driver?: LoopDriver
  ask?: ReturnType<typeof askStub>['face']
  cwd?: string
  listThrows?: Error
  resolveAgent?: (ownerSessionId: string) => unknown
  enterAgent?: (ownerSessionId: string) => Promise<unknown>
}) {
  const driver = options.driver ?? driverStub().driver
  const tasks = tasksStub(options.cards ?? [], options.listThrows !== undefined ? (() => { throw options.listThrows }) as never : undefined)
  return {
    handler: createRunDagTasksHandler({
      driver,
      tasks: tasks.tasks,
      resolveProjectId: (c: string) => (c === CWD ? PROJECT : undefined),
      ...(options.ask !== undefined ? { ask: options.ask } : {}),
      ...(options.resolveAgent !== undefined ? { resolveAgent: options.resolveAgent } : {}),
      ...(options.enterAgent !== undefined ? { enterAgent: options.enterAgent } : {}),
    }),
    driver,
    listInputs: tasks.listInputs,
  }
}

const ACTIVE: LoopRecord = {
  id: 'loop-A',
  source: { kind: 'feature', slug: 'feat-x' },
  ownerSessionId: SESSION,
  projectId: PROJECT,
  inFlight: { taskRef: { slug: 'feat-x', localId: '2.5' }, taskKey: 'feat-x/2.5', taskId: 't-1', title: 'Implement the thing' },
}

// ─────────────────────────── 无参枚举（单查询→双轨候选→问询） ───────────────────────────

describe('无参路径：单查询枚举「尚有非终态任务的任务源」→问询→启动（AC）', () => {
  const cards = [
    card({ kind: 'feature', slug: 'feat-x' }, '2.5', 'pending'),
    card({ kind: 'feature', slug: 'feat-x' }, '2.6', 'blocked'),
    card({ kind: 'feature', slug: 'all-done' }, '1.0', 'completed'),
    card({ kind: 'proposal', slug: 'blitz-y' }, '1.1', 'interrupted'),
    card({ kind: 'proposal', slug: 'blitz-y' }, '1.2', 'pending'),
  ]

  it('双轨候选入问询（feature + 提案；全终态源被排除）；listTasks 恰一次单查询（{projectId} 无 source）', async () => {
    const ask = askStub()
    const d = depsOf({ cards, ask: ask.face })
    const out = await d.handler({ agent: agentOf() as never, rawInput: '' })
    expect(out.kind).toBe('success')
    expect(d.listInputs).toEqual([{ projectId: PROJECT }]) // 单查询
    expect(ask.requests).toHaveLength(1)
    const question = (ask.requests[0] as { questions: { options?: { label: string; description?: string }[] }[] }).questions[0]
    expect(question?.options?.map((o) => o.label)).toEqual(['blitz-y', 'feat-x']) // 全终态 all-done 排除；同量按 slug 稳定决胜
    expect(question?.options?.[0]?.description).toContain('提案')
    expect(question?.options?.[1]?.description).toContain('feature')
  })

  it('ask 请求携带 invocation.agent（活根定向——无主 waterfall 无应答器接受 NO_PROVIDER 面板不弹）', async () => {
    const ask = askStub()
    const d = depsOf({ cards, ask: ask.face })
    const agent = agentOf() as never
    await d.handler({ agent, rawInput: '' })
    expect(ask.requests).toHaveLength(1)
    expect((ask.requests[0] as { agent?: unknown }).agent).toBe(agent)
  })

  it('选中即启动：driver.start 收到 任务源/主会话 id/parent/projectId；回执 success 带 slug', async () => {
    const ask = askStub(answerLabel('blitz-y'))
    const stub = driverStub()
    const d = depsOf({ cards, driver: stub.driver, ask: ask.face })
    const agent = agentOf(SESSION, CWD, () => {}) as never // 1.20：提交成功 = 启动前提（followup 在场）
    const out = await d.handler({ agent, rawInput: '' })
    expect(stub.startInputs).toEqual([
      { source: { kind: 'proposal', slug: 'blitz-y' }, ownerSessionId: SESSION, parent: agent, projectId: PROJECT },
    ])
    expect(out).toMatchObject({ kind: 'success' })
    expect((out as { text?: string }).text).toContain('blitz-y')
  })

  it('零候选（全终态/空池）：不问询不启动，success「没有未完成的任务」', async () => {
    const ask = askStub(answerLabel('x'))
    const stub = driverStub()
    const d = depsOf({ cards: [card({ kind: 'feature', slug: 'done' }, '1.0', 'completed')], driver: stub.driver, ask: ask.face })
    const out = await d.handler({ agent: agentOf() as never, rawInput: '' })
    expect(ask.requests).toHaveLength(0)
    expect(stub.startInputs).toHaveLength(0)
    expect(out).toEqual({ kind: 'success', text: '没有未完成的任务，无需派发' })
  })

  it('未选择（空应答）：success「未选择任务源」，不启动', async () => {
    const ask = askStub() // answers 空 = 关闭问询面板
    const stub = driverStub()
    const d = depsOf({ cards, driver: stub.driver, ask: ask.face })
    const out = await d.handler({ agent: agentOf() as never, rawInput: '' })
    expect(stub.startInputs).toHaveLength(0)
    expect((out as { text?: string }).text).toContain('未选择任务源')
  })

  it('用户取消（ASK_ABORTED）：success「未选择任务源」含 slug 直通指引，不启动', async () => {
    const ask = askStub(undefined, new Error('ASK_ABORTED'))
    const stub = driverStub()
    const d = depsOf({ cards, driver: stub.driver, ask: ask.face })
    const out = await d.handler({ agent: agentOf() as never, rawInput: '' })
    expect(stub.startInputs).toHaveLength(0)
    expect(out.kind).toBe('success')
    expect((out as { text?: string }).text).toContain('未选择任务源')
    expect((out as { text?: string }).text).toContain('/run-dag-tasks <slug>')
  })

  it('问询通道故障（NO_PROVIDER/异常）：error 回执带原因与 slug 指引，不启动不静默', async () => {
    const ask = askStub(undefined, new Error('no user-questions answerer accepted the request'))
    const stub = driverStub()
    const d = depsOf({ cards, driver: stub.driver, ask: ask.face })
    const out = await d.handler({ agent: agentOf() as never, rawInput: '' })
    expect(stub.startInputs).toHaveLength(0)
    expect(out.kind).toBe('error')
    expect((out as { text: string }).text).toContain('问询通道故障')
    expect((out as { text: string }).text).toContain('no user-questions answerer accepted the request')
    expect((out as { text: string }).text).toContain('/run-dag-tasks <slug>')
  })

  it('非活根（assertLiveRoot 拒绝 CALLER_NOT_LIVE）：归故障路 error 回执，原因码不静默', async () => {
    const ask = askStub(undefined, new Error('CALLER_NOT_LIVE: ask caller is not the live root'))
    const stub = driverStub()
    const d = depsOf({ cards, driver: stub.driver, ask: ask.face })
    const out = await d.handler({ agent: agentOf() as never, rawInput: '' })
    expect(stub.startInputs).toHaveLength(0)
    expect(out.kind).toBe('error')
    expect((out as { text: string }).text).toContain('CALLER_NOT_LIVE')
  })

  it('问询面缺席（装配降级）：指引带参直通文本，不抛', async () => {
    const stub = driverStub()
    const d = depsOf({ cards, driver: stub.driver })
    const out = await d.handler({ agent: agentOf() as never, rawInput: '' })
    expect(out.kind).toBe('success')
    expect((out as { text?: string }).text).toContain('/run-dag-tasks')
  })
})

// ─────────────────────────── 带参直通 ───────────────────────────

describe('带参 <slug> 直通（AC）', () => {
  const cards = [
    card({ kind: 'feature', slug: 'feat-x' }, '2.5', 'pending'),
    card({ kind: 'proposal', slug: 'blitz-y' }, '1.1', 'pending'),
  ]

  it('slug 命中提案轨：零问询直通启动', async () => {
    const ask = askStub(answerLabel('不应被触达'))
    const stub = driverStub()
    const d = depsOf({ cards, driver: stub.driver, ask: ask.face })
    const agent = agentOf(SESSION, CWD, () => {}) as never // 1.20：提交成功 = 启动前提
    const out = await d.handler({ agent, rawInput: ' blitz-y ' }) // 原样入参含空白——handler trim
    expect(ask.requests).toHaveLength(0)
    expect(stub.startInputs).toEqual([
      { source: { kind: 'proposal', slug: 'blitz-y' }, ownerSessionId: SESSION, parent: agent, projectId: PROJECT },
    ])
    expect(out.kind).toBe('success')
  })

  it('未知 slug：error 回执带指引，不启动', async () => {
    const stub = driverStub()
    const d = depsOf({ cards, driver: stub.driver })
    const out = await d.handler({ agent: agentOf() as never, rawInput: 'ghost' })
    expect(out.kind).toBe('error')
    expect((out as { text: string }).text).toContain('ghost')
    expect(stub.startInputs).toHaveLength(0)
  })
})

// ─────────────────────────── 带参模糊过滤（子串包含） ───────────────────────────

describe('带参 <slug> 模糊过滤（子串包含；精确优先，命中即启动/弹选项/报错）', () => {
  const cards = [
    card({ kind: 'feature', slug: 'dsh-forge-m2-pipeline' }, '2.5', 'pending'),
    card({ kind: 'feature', slug: 'dsh-forge-m3-ui' }, '3.1', 'pending'),
    card({ kind: 'proposal', slug: 'legacy-eval' }, '1.1', 'pending'),
  ]

  it('唯一子串命中：零问询直通启动（如 m3 → dsh-forge-m3-ui）', async () => {
    const ask = askStub(answerLabel('不应被触达'))
    const stub = driverStub()
    const d = depsOf({ cards, driver: stub.driver, ask: ask.face })
    const agent = agentOf(SESSION, CWD, () => {}) as never
    const out = await d.handler({ agent, rawInput: 'm3' })
    expect(ask.requests).toHaveLength(0)
    expect(stub.startInputs).toEqual([
      { source: { kind: 'feature', slug: 'dsh-forge-m3-ui' }, ownerSessionId: SESSION, parent: agent, projectId: PROJECT },
    ])
    expect(out.kind).toBe('success')
  })

  it('多命中：弹选项列出命中源，选中即启动', async () => {
    const ask = askStub(answerLabel('legacy-eval'))
    const stub = driverStub()
    const d = depsOf({ cards, driver: stub.driver, ask: ask.face })
    const agent = agentOf(SESSION, CWD, () => {}) as never
    const out = await d.handler({ agent, rawInput: 'e' }) // 命中 dsh-forge-m2-pipeline / legacy-eval…（含 m3-ui）
    expect(ask.requests).toHaveLength(1)
    const question = (ask.requests[0] as { questions: { options?: { label: string }[] }[] }).questions[0]
    expect(question?.options?.map((o) => o.label)).toEqual(['dsh-forge-m2-pipeline', 'dsh-forge-m3-ui', 'legacy-eval']) // 候选序 = 未完成量降序 + slug 稳定决胜
    expect(stub.startInputs).toEqual([
      { source: { kind: 'proposal', slug: 'legacy-eval' }, ownerSessionId: SESSION, parent: agent, projectId: PROJECT },
    ])
    expect(out.kind).toBe('success')
  })

  it('多命中但问询缺席：error 回执列出命中 slug，不启动', async () => {
    const stub = driverStub()
    const d = depsOf({ cards, driver: stub.driver })
    const out = await d.handler({ agent: agentOf() as never, rawInput: 'dsh-forge' })
    expect(out.kind).toBe('error')
    const text = (out as { text: string }).text
    expect(text).toContain('dsh-forge-m2-pipeline')
    expect(text).toContain('dsh-forge-m3-ui')
    expect(stub.startInputs).toHaveLength(0)
  })

  it('精确命中优先于模糊（同串精确存在时零模糊路径）', async () => {
    const ask = askStub(answerLabel('不应被触达'))
    const stub = driverStub()
    const d = depsOf({ cards, driver: stub.driver, ask: ask.face })
    const agent = agentOf(SESSION, CWD, () => {}) as never
    const out = await d.handler({ agent, rawInput: 'dsh-forge-m2-pipeline' })
    expect(ask.requests).toHaveLength(0)
    expect(stub.startInputs[0]?.source).toEqual({ kind: 'feature', slug: 'dsh-forge-m2-pipeline' })
    expect(out.kind).toBe('success')
  })
})

// ─────────────────────────── 跑动中再触发（查看/停止/替换问询） ───────────────────────────

describe('跑动中再触发→查看/停止/替换问询（AC；decisions #20 停止作用域）', () => {
  const cards = [card({ kind: 'feature', slug: 'feat-x' }, '2.5', 'pending')]

  it('活循环在场：问询恰三选项 查看/停止/替换', async () => {
    const ask = askStub()
    const stub = driverStub({ activeRecord: ACTIVE })
    const d = depsOf({ cards, driver: stub.driver, ask: ask.face })
    await d.handler({ agent: agentOf() as never, rawInput: '' })
    const question = (ask.requests[0] as { questions: { options?: { label: string }[] }[] }).questions[0]
    expect(question?.options?.map((o) => o.label)).toEqual(['查看', '停止', '替换'])
  })

  it('查看：success 文本含任务源与在飞任务；stop/start 零触达', async () => {
    const ask = askStub(answerLabel('查看'))
    const stub = driverStub({ activeRecord: ACTIVE })
    const d = depsOf({ cards, driver: stub.driver, ask: ask.face })
    const out = await d.handler({ agent: agentOf() as never, rawInput: '' })
    expect(stub.stopInputs).toHaveLength(0)
    expect(stub.startInputs).toHaveLength(0)
    const text = (out as { text: string }).text
    expect(text).toContain('feat-x')
    expect(text).toContain('2.5')
  })

  it('停止（本会话循环）：stop 以敲指令会话 id 调用；success 已停止；不启动', async () => {
    const ask = askStub(answerLabel('停止'))
    const stub = driverStub({ activeRecord: ACTIVE })
    const d = depsOf({ cards, driver: stub.driver, ask: ask.face })
    const out = await d.handler({ agent: agentOf(SESSION, CWD, () => {}) as never, rawInput: '' })
    expect(stub.stopInputs).toEqual([{ ownerSessionId: SESSION }])
    expect(stub.startInputs).toHaveLength(0)
    expect((out as { text: string }).text).toContain('已停止')
  })

  it('他会话占源 + 无参（候选全被过滤）：零问询、零 stop/start 触达——success 回执明示已派发中与并行口径', async () => {
    const foreign: LoopRecord = { ...ACTIVE, ownerSessionId: 's-other' }
    const ask = askStub(answerLabel('停止'))
    const stub = driverStub({ activeRecord: foreign })
    const d = depsOf({ cards, driver: stub.driver, ask: ask.face })
    const out = await d.handler({ agent: agentOf() as never, rawInput: '' })
    expect(ask.requests).toHaveLength(0) // 唯一候选源已在跑——问询不弹（假所有权面板不再出现）
    expect(stub.stopInputs).toHaveLength(0)
    expect(stub.startInputs).toHaveLength(0)
    expect(stub.loops.has('s-other')).toBe(true) // 他会话循环不受影响
    expect(out.kind).toBe('success')
    const text = (out as { text: string }).text
    expect(text).toContain('其余任务源均已派发中（feat-x）')
    expect(text).toContain('并行派发')
  })

  it('替换（带参）：先停本会话循环再直通新任务源', async () => {
    const ask = askStub(answerLabel('替换'))
    const stub = driverStub({ activeRecord: ACTIVE })
    const d = depsOf({ cards, driver: stub.driver, ask: ask.face })
    const out = await d.handler({ agent: agentOf(SESSION, CWD, () => {}) as never, rawInput: 'feat-x' })
    expect(stub.stopInputs).toEqual([{ ownerSessionId: SESSION }])
    expect(stub.startInputs).toHaveLength(1)
    expect(stub.startInputs[0]?.source).toEqual({ kind: 'feature', slug: 'feat-x' })
    expect(out.kind).toBe('success')
  })

  it('替换（无参）：先停再入枚举问询启动', async () => {
    const ask = askStub((request) => {
      const question = (request as { questions: { id: string; options?: { label: string }[] }[] }).questions[0]
      if (question === undefined) return { answers: [] }
      const isRunning = question.options?.some((o) => o.label === '替换') === true
      return { answers: [{ id: question.id, selected: isRunning ? ['替换'] : ['feat-x'] }] }
    })
    const stub = driverStub({ activeRecord: ACTIVE })
    const d = depsOf({ cards, driver: stub.driver, ask: ask.face })
    const out = await d.handler({ agent: agentOf(SESSION, CWD, () => {}) as never, rawInput: '' })
    expect(stub.stopInputs).toEqual([{ ownerSessionId: SESSION }])
    expect(stub.startInputs).toHaveLength(1)
    expect(stub.startInputs[0]?.source).toEqual({ kind: 'feature', slug: 'feat-x' })
    expect(out.kind).toBe('success')
  })

  it('他会话占源 + 带参直通同源：不触 start——回执明示同源不可双派发与所请求 slug 未启动', async () => {
    const foreign: LoopRecord = { ...ACTIVE, ownerSessionId: 's-other' }
    const ask = askStub(answerLabel('替换'))
    const stub = driverStub({ activeRecord: foreign })
    const d = depsOf({ cards, driver: stub.driver, ask: ask.face })
    const out = await d.handler({ agent: agentOf() as never, rawInput: 'feat-x' })
    expect(ask.requests).toHaveLength(0)
    expect(stub.loops.has('s-other')).toBe(true)
    expect(stub.startInputs).toHaveLength(0) // 同源占用前置判定——start 不空触
    expect(out.kind).toBe('success')
    const text = (out as { text: string }).text
    expect(text).toContain('已由其它会话运行')
    expect(text).toContain('不能同时被两个会话派发')
    expect(text).toContain('feat-x 未启动')
  })

  it('未选择操作：success 文本「未选择操作」，循环保持', async () => {
    const ask = askStub()
    const stub = driverStub({ activeRecord: ACTIVE })
    const d = depsOf({ cards, driver: stub.driver, ask: ask.face })
    const out = await d.handler({ agent: agentOf() as never, rawInput: '' })
    expect((out as { text: string }).text).toContain('未选择操作')
    expect(stub.loops.has(SESSION)).toBe(true)
  })

  it('问询通道故障（1.12 同径拆分）：error 回执带原因与替代指引，循环保持不动', async () => {
    const ask = askStub(undefined, new Error('no user-questions answerer accepted the request'))
    const stub = driverStub({ activeRecord: ACTIVE })
    const d = depsOf({ cards, driver: stub.driver, ask: ask.face })
    const out = await d.handler({ agent: agentOf() as never, rawInput: '' })
    expect(out.kind).toBe('error')
    expect((out as { text: string }).text).toContain('问询通道故障')
    expect((out as { text: string }).text).toContain('/stop-dag-tasks')
    expect(stub.loops.has(SESSION)).toBe(true) // 循环原样保持
    expect(stub.stopInputs).toHaveLength(0)
  })
})

// ─────────────────────────── 多会话并行（2026-10-12 裁决：一会话一循环；同源不可双派发；异源异会话并行） ───────────────────────────

describe('多会话并行：同源独占 + 异源异会话并行放行', () => {
  const cards = [
    card({ kind: 'feature', slug: 'feat-x' }, '2.5', 'pending'),
    card({ kind: 'feature', slug: 'feat-y' }, '1.1', 'pending'),
  ]

  it('他会话在跑 feat-x + 本会话带参启动 feat-y：正常启动（异源并行不受限）', async () => {
    const foreign: LoopRecord = { ...ACTIVE, ownerSessionId: 's-other', source: { kind: 'feature', slug: 'feat-x' } }
    const stub = driverStub({ activeRecord: foreign })
    const d = depsOf({ cards, driver: stub.driver })
    const out = await d.handler({ agent: agentOf(SESSION, CWD, () => {}) as never, rawInput: 'feat-y' })
    expect(out.kind).toBe('success')
    expect((out as { text: string }).text).toContain('已启动')
    expect(stub.startInputs).toHaveLength(1)
    expect(stub.startInputs[0]?.source).toEqual({ kind: 'feature', slug: 'feat-y' })
    expect(stub.loops.has('s-other')).toBe(true) // 他会话循环原样
    expect(stub.loops.has(SESSION)).toBe(true) // 本会话新循环并行在场
  })

  it('无参候选过滤：他会话在跑 feat-x → 问询仅列 feat-y', async () => {
    const foreign: LoopRecord = { ...ACTIVE, ownerSessionId: 's-other', source: { kind: 'feature', slug: 'feat-x' } }
    const ask = askStub(answerLabel('feat-y'))
    const stub = driverStub({ activeRecord: foreign })
    const d = depsOf({ cards, driver: stub.driver, ask: ask.face })
    const out = await d.handler({ agent: agentOf(SESSION, CWD, () => {}) as never, rawInput: '' })
    const question = (ask.requests[0] as { questions: { options?: { label: string }[] }[] }).questions[0]
    expect(question?.options?.map((o) => o.label)).toEqual(['feat-y']) // 在跑源不入候选
    expect(out.kind).toBe('success')
    expect(stub.startInputs[0]?.source).toEqual({ kind: 'feature', slug: 'feat-y' })
  })

  it('零候选且非空池：新回执明示其余任务源均已派发中（含在跑源清单）', async () => {
    const foreign: LoopRecord = { ...ACTIVE, ownerSessionId: 's-other', source: { kind: 'feature', slug: 'feat-x' } }
    const single = [cards[0]!] // 仅 feat-x——过滤后零候选
    const stub = driverStub({ activeRecord: foreign })
    const d = depsOf({ cards: single, driver: stub.driver })
    const out = await d.handler({ agent: agentOf() as never, rawInput: '' })
    expect(out.kind).toBe('success')
    const text = (out as { text: string }).text
    expect(text).toContain('其余任务源均已派发中（feat-x）')
    expect(text).not.toContain('没有未完成的任务') // 与真空池文案区分
  })
})

// ─────────────────────────── 派发指令单行提交（fix-1） ───────────────────────────

describe('派发指令单行提交（fix-1 + 1.14/1.20——提交成功 = 会话创建成功判据：先提交后启动，失败不启动循环）', () => {
  const cards = [card({ kind: 'feature', slug: 'feat-x' }, '2.5', 'pending')]

  it('带参直通启动成功：agent.followup 恰一次收 `/run-dag-tasks feat-x` user 消息（role/content/source.kind）', async () => {
    const rec = followupRecorder()
    const stub = driverStub()
    const d = depsOf({ cards, driver: stub.driver })
    const out = await d.handler({ agent: agentOf(SESSION, CWD, rec.fn) as never, rawInput: 'feat-x' })
    expect(out.kind).toBe('success')
    expect(rec.followuped).toEqual([
      { role: 'user', text: '/run-dag-tasks feat-x', sourceKind: 'user' },
    ])
  })

  it('无参选中启动：同一提交径（选中源 = 问询回读 label）', async () => {
    const rec = followupRecorder()
    const ask = askStub(answerLabel('feat-x'))
    const stub = driverStub()
    const d = depsOf({ cards, driver: stub.driver, ask: ask.face })
    const out = await d.handler({ agent: agentOf(SESSION, CWD, rec.fn) as never, rawInput: '' })
    expect(out.kind).toBe('success')
    expect(rec.followuped).toEqual([
      { role: 'user', text: '/run-dag-tasks feat-x', sourceKind: 'user' },
    ])
  })

  it('启动被拒（单活竞态 loop-active）：提交已先行（1.14 物化序）——回执说明未重复启动，零重复提交', async () => {
    const rec = followupRecorder()
    const stub = driverStub({ startCode: 'loop-active' })
    const d = depsOf({ cards, driver: stub.driver })
    const out = await d.handler({ agent: agentOf(SESSION, CWD, rec.fn) as never, rawInput: 'feat-x' })
    expect(out.kind).toBe('success')
    expect((out as { text?: string }).text).toContain('已在运行')
    // 1.14 序：提交先行（followup 开 turn 物化会话）→ start 被竞态拒绝——单行已落，无重复提交
    expect(rec.followuped).toHaveLength(1)
  })

  it('1.14 物化序（带参直通）：followup 提交先于 driver.start（先落实会话，再启动循环）', async () => {
    const trace: string[] = []
    const rec = followupRecorder()
    const base = driverStub()
    const driver: LoopDriver = {
      ...base.driver,
      start: async (input) => {
        trace.push('start')
        return base.driver.start(input)
      },
    }
    const d = depsOf({ cards, driver })
    const wrapped = agentOf(SESSION, CWD, (message: unknown) => {
      trace.push('followup')
      rec.fn(message)
    })
    const out = await d.handler({ agent: wrapped as never, rawInput: 'feat-x' })
    expect(out.kind).toBe('success')
    expect(trace).toEqual(['followup', 'start'])
  })

  it('1.14 物化序（无参问询径同治）：选中启动同走先提交后启动链', async () => {
    const trace: string[] = []
    const rec = followupRecorder()
    const base = driverStub()
    const driver: LoopDriver = {
      ...base.driver,
      start: async (input) => {
        trace.push('start')
        return base.driver.start(input)
      },
    }
    const ask = askStub(answerLabel('feat-x'))
    const d = depsOf({ cards, driver, ask: ask.face })
    const wrapped = agentOf(SESSION, CWD, (message: unknown) => {
      trace.push('followup')
      rec.fn(message)
    })
    const out = await d.handler({ agent: wrapped as never, rawInput: '' })
    expect(out.kind).toBe('success')
    expect(trace).toEqual(['followup', 'start'])
    expect(rec.followuped).toEqual([{ role: 'user', text: '/run-dag-tasks feat-x', sourceKind: 'user' }])
  })

  it('未启动径（未知 slug）：零提交', async () => {
    const rec = followupRecorder()
    const stub = driverStub()
    const d = depsOf({ cards, driver: stub.driver })
    await d.handler({ agent: agentOf(SESSION, CWD, rec.fn) as never, rawInput: 'ghost' })
    expect(rec.followuped).toEqual([])
  })

  it('followup 面缺席（1.20 门控）：会话未落实 → error 回执，循环不启动', async () => {
    const stub = driverStub()
    const d = depsOf({ cards, driver: stub.driver })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const out = await d.handler({ agent: agentOf() as never, rawInput: 'feat-x' }) // agentOf 无 followup 位
      expect(out.kind).toBe('error')
      expect((out as { text?: string }).text).toContain('未派发')
      expect((out as { text?: string }).text).toContain('提交失败')
      expect((out as { text?: string }).text).toContain('循环未启动')
      expect(stub.loops.has(SESSION)).toBe(false)
      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('followup 投递抛错（1.20 门控）：告警不外抛，error 回执附原因，循环不启动', async () => {
    const stub = driverStub()
    const d = depsOf({ cards, driver: stub.driver })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const out = await d.handler({
        agent: agentOf(SESSION, CWD, () => {
          throw new Error('inbox closed')
        }) as never,
        rawInput: 'feat-x',
      })
      expect(out.kind).toBe('error')
      expect((out as { text?: string }).text).toContain('未派发')
      expect((out as { text?: string }).text).toContain('inbox closed')
      expect((out as { text?: string }).text).toContain('循环未启动')
      expect(stub.loops.has(SESSION)).toBe(false)
      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})

// ─────────────────────────── 1.18 followup 目标活根化 ───────────────────────────

describe('1.18 followup 目标经 agentsRegistry 活根解析（真机 undefined.send 定罪修复）', () => {
  const cards = [card({ kind: 'feature', slug: 'feat-x' }, '2.5', 'pending')]

  it('registry 命中：followup 落在 registry 活根（非 ctx.parent——invocation 把手零触达）', async () => {
    const reg = followupRecorder()
    const parent = followupRecorder()
    const stub = driverStub()
    const d = depsOf({ cards, driver: stub.driver, resolveAgent: (id) => (id === SESSION ? { followup: reg.fn } : undefined) })
    const out = await d.handler({ agent: agentOf(SESSION, CWD, parent.fn) as never, rawInput: 'feat-x' })
    expect(out.kind).toBe('success')
    expect((out as { text?: string }).text).toContain('已启动')
    expect(reg.followuped).toEqual([{ role: 'user', text: '/run-dag-tasks feat-x', sourceKind: 'user' }]) // 活根收件
    expect(parent.followuped).toEqual([]) // ctx.parent 不再是 followup 目标
  })

  it('registry 未命中 + fallback followup 在：fallback 提交成功（向后兼容），success 回执', async () => {
    const parent = followupRecorder()
    const stub = driverStub()
    const d = depsOf({ cards, driver: stub.driver, resolveAgent: () => undefined })
    const out = await d.handler({ agent: agentOf(SESSION, CWD, parent.fn) as never, rawInput: 'feat-x' })
    expect(out.kind).toBe('success')
    expect((out as { text?: string }).text).not.toContain('提交失败')
    expect(parent.followuped).toHaveLength(1)
    expect(stub.loops.has(SESSION)).toBe(true)
  })

  it('registry 未命中 + fallback followup 缺席：error 回执带激活指引，循环不启动（1.20 门控）', async () => {
    const stub = driverStub()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const d = depsOf({ cards, driver: stub.driver, resolveAgent: () => undefined })
      const out = await d.handler({ agent: agentOf() as never, rawInput: 'feat-x' })
      expect(out.kind).toBe('error')
      const text = (out as { text: string }).text
      expect(text).toContain('未派发')
      expect(text).toContain('提交失败')
      expect(text).toContain('循环未启动')
      expect(text).toContain('发送任意消息')
      expect(stub.loops.has(SESSION)).toBe(false)
      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('resolveAgent 缺席（旧装配形态）：恒走 ctx.parent fallback（向后兼容两态之命中态）', async () => {
    const parent = followupRecorder()
    const stub = driverStub()
    const d = depsOf({ cards, driver: stub.driver })
    const out = await d.handler({ agent: agentOf(SESSION, CWD, parent.fn) as never, rawInput: 'feat-x' })
    expect(out.kind).toBe('success')
    expect(parent.followuped).toHaveLength(1)
  })
})

// ─────────────────────────── 1.19 未进入态先进入再提交（sessionController 激活面） ───────────────────────────

describe('1.19 未进入态处理：先进入（sessionController.resolveAgent）再提交再启动', () => {
  const cards = [card({ kind: 'feature', slug: 'feat-x' }, '2.5', 'pending')]

  it('registry 未命中 + 激活成功：进入先于提交，followup 落在进入后的活根，success 回执零告警', async () => {
    const rec = followupRecorder()
    const order: string[] = []
    let live: unknown // 激活后才「进入」——registry 活根在此之后才可解析
    const stub = driverStub()
    const d = depsOf({
      cards,
      driver: stub.driver,
      resolveAgent: () => live,
      enterAgent: async () => {
        order.push('enter')
        live = { followup: (m: unknown) => {
          order.push('followup')
          rec.fn(m)
        } }
        return live
      },
    })
    const out = await d.handler({ agent: agentOf() as never, rawInput: 'feat-x' })
    expect(out.kind).toBe('success')
    expect((out as { text?: string }).text).toContain('已启动')
    expect((out as { text?: string }).text).not.toContain('提交失败')
    expect(order).toEqual(['enter', 'followup']) // 先进入再提交（undefined.send 根因面不再触达）
    expect(rec.followuped).toEqual([{ role: 'user', text: '/run-dag-tasks feat-x', sourceKind: 'user' }])
    expect(stub.loops.has(SESSION)).toBe(true)
  })

  it('registry 未命中 + 激活失败（error 路 undefined）：error 回执激活指引，循环不启动（1.20 门控）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const stub = driverStub()
      let activations = 0
      const d = depsOf({
        cards,
        driver: stub.driver,
        resolveAgent: () => undefined,
        enterAgent: async () => {
          activations += 1
          return undefined
        },
      })
      const out = await d.handler({ agent: agentOf() as never, rawInput: 'feat-x' })
      expect(activations).toBe(1)
      expect(out.kind).toBe('error')
      const text = (out as { text: string }).text
      expect(text).toContain('未派发')
      expect(text).toContain('提交失败')
      expect(text).toContain('循环未启动')
      expect(stub.loops.has(SESSION)).toBe(false)
      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('激活面抛错：fail-soft（warn 留痕不外抛），落入 registryMissed 回执路，循环不启动', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const stub = driverStub()
      const d = depsOf({
        cards,
        driver: stub.driver,
        resolveAgent: () => undefined,
        enterAgent: async () => {
          throw new Error('persistence locked')
        },
      })
      const out = await d.handler({ agent: agentOf() as never, rawInput: 'feat-x' })
      expect(out.kind).toBe('error')
      expect((out as { text: string }).text).toContain('提交失败')
      expect(stub.loops.has(SESSION)).toBe(false)
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('persistence locked'))
    } finally {
      warn.mockRestore()
    }
  })

  it('1.21 活根定向：registry 陈旧把手（followup 抛 undefined.send）+ 激活返回真活根 → followup 落在激活活根，success 回执', async () => {
    const live = followupRecorder()
    const stale = followupRecorder()
    stale.fn = () => {
      throw new TypeError("Cannot read properties of undefined (reading 'send')")
    }
    const stub = driverStub()
    const d = depsOf({
      cards,
      driver: stub.driver,
      resolveAgent: (id) => (id === SESSION ? { followup: stale.fn } : undefined), // 陈旧把手（内件未初始化）
      enterAgent: async () => ({ followup: live.fn }), // sessionController 激活活根
    })
    const out = await d.handler({ agent: agentOf() as never, rawInput: 'feat-x' })
    expect(out.kind).toBe('success')
    expect(live.followuped).toHaveLength(1) // 提交目标 = 激活活根（registry 陈旧把手未被使用）
    expect(stale.followuped).toHaveLength(0)
    expect(stub.loops.has(SESSION)).toBe(true)
  })

  it('激活面缺席 + registry 命中：registry 把手照用（向后兼容——1.18 装配形态）', async () => {
    const reg = followupRecorder()
    const stub = driverStub()
    const d = depsOf({
      cards,
      driver: stub.driver,
      resolveAgent: (id) => (id === SESSION ? { followup: reg.fn } : undefined),
    })
    const out = await d.handler({ agent: agentOf() as never, rawInput: 'feat-x' })
    expect(out.kind).toBe('success')
    expect(reg.followuped).toHaveLength(1)
    expect(stub.loops.has(SESSION)).toBe(true)
  })

  it('激活面缺席（1.18 装配形态）：语义原样——registryMissed error 回执指引激活，循环不启动', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const stub = driverStub()
      const d = depsOf({ cards, driver: stub.driver, resolveAgent: () => undefined })
      const out = await d.handler({ agent: agentOf() as never, rawInput: 'feat-x' })
      expect(out.kind).toBe('error')
      expect((out as { text: string }).text).toContain('发送任意消息激活会话')
      expect(stub.loops.has(SESSION)).toBe(false)
    } finally {
      warn.mockRestore()
    }
  })
})

// ─────────────────────────── 1.22 当且仅当新会话才 followup ───────────────────────────

describe('1.22 新会话门控：既有会话零 followup 直接启动（防活 agent 读令自跑）', () => {
  const cards = [card({ kind: 'feature', slug: 'feat-x' }, '2.5', 'pending')]
  /** 既有会话桩（回合事件在场——真实 Session.ownEvents 鸭子形） */
  function existingAgent(followup?: (m: unknown) => void): Record<string, unknown> {
    return {
      ...agentOf(SESSION, CWD, followup),
      session: { id: SESSION, header: { cwd: CWD }, ownEvents: () => [{ type: 'user/message', seq: 0 }] },
    }
  }
  /** 新会话桩（自有事件空——blank 相位真实形） */
  function newAgent(followup?: (m: unknown) => void): Record<string, unknown> {
    return {
      ...agentOf(SESSION, CWD, followup),
      session: { id: SESSION, header: { cwd: CWD }, ownEvents: () => [] },
    }
  }
  /**
   * fix-7 回归形（UI 派发径真实态）：fresh 派发会话自有事件仅含 command 面 artifact
   * （UI autosend 经 slash 仲裁先落 command/run 再进 handler）——零回合事件 = 新会话。
   */
  function commandOnlyAgent(followup?: (m: unknown) => void): Record<string, unknown> {
    return {
      ...agentOf(SESSION, CWD, followup),
      session: {
        id: SESSION,
        header: { cwd: CWD },
        ownEvents: () => [
          { type: 'command/run', seq: 0 },
          { type: 'agent/inbox/spliced', seq: 1 },
          { type: 'forge/progress', seq: 2 },
        ],
      },
    }
  }

  it('既有会话（回合事件在场）：零 followup 零激活，循环直接启动，success 回执', async () => {
    const rec = followupRecorder()
    const stub = driverStub()
    const d = depsOf({ cards, driver: stub.driver, resolveAgent: () => { throw new Error('既有会话不应触达激活/解析面') } })
    const out = await d.handler({ agent: existingAgent(rec.fn) as never, rawInput: 'feat-x' })
    expect(out.kind).toBe('success')
    expect((out as { text: string }).text).toContain('已启动')
    expect(rec.followuped).toEqual([]) // 当且仅当新会话才 followup
    expect(stub.loops.has(SESSION)).toBe(true) // 循环照常启动
  })

  it('新会话（自有事件空）：followup 照常（1.14 物化语义原样）', async () => {
    const rec = followupRecorder()
    const stub = driverStub()
    const d = depsOf({ cards, driver: stub.driver })
    const out = await d.handler({ agent: newAgent(rec.fn) as never, rawInput: 'feat-x' })
    expect(out.kind).toBe('success')
    expect(rec.followuped).toEqual([{ role: 'user', text: '/run-dag-tasks feat-x', sourceKind: 'user' }])
    expect(stub.loops.has(SESSION)).toBe(true)
  })

  it('fix-7 回归形（仅 command 面 artifact 自有事件——UI 派发径 fresh 会话）：按新会话物化（followup 照常）', async () => {
    const rec = followupRecorder()
    const stub = driverStub()
    const d = depsOf({ cards, driver: stub.driver })
    const out = await d.handler({ agent: commandOnlyAgent(rec.fn) as never, rawInput: 'feat-x' })
    expect(out.kind).toBe('success')
    expect(rec.followuped).toEqual([{ role: 'user', text: '/run-dag-tasks feat-x', sourceKind: 'user' }])
    expect(stub.loops.has(SESSION)).toBe(true)
  })

  it('判定面缺席（旧桩/旧装配）：恒新会话路径——followup 向后兼容', async () => {
    const rec = followupRecorder()
    const stub = driverStub()
    const d = depsOf({ cards, driver: stub.driver })
    const out = await d.handler({ agent: agentOf(SESSION, CWD, rec.fn) as never, rawInput: 'feat-x' })
    expect(out.kind).toBe('success')
    expect(rec.followuped).toHaveLength(1)
  })

  it('判定抛错（ownEvents throw）：fail-soft 按新会话——激活+followup 最保守路径', async () => {
    const rec = followupRecorder()
    const stub = driverStub()
    const d = depsOf({ cards, driver: stub.driver })
    const agent = {
      ...agentOf(SESSION, CWD, rec.fn),
      session: { id: SESSION, header: { cwd: CWD }, ownEvents: () => { throw new Error('log locked') } },
    }
    const out = await d.handler({ agent: agent as never, rawInput: 'feat-x' })
    expect(out.kind).toBe('success')
    expect(rec.followuped).toHaveLength(1)
  })

  it('既有会话径零触达激活面：enterAgent 不被调用（既有会话无需进入）', async () => {
    let enterCalls = 0
    const rec = followupRecorder()
    const stub = driverStub()
    const d = depsOf({
      cards,
      driver: stub.driver,
      enterAgent: async () => { enterCalls++; return undefined },
    })
    await d.handler({ agent: existingAgent(rec.fn) as never, rawInput: 'feat-x' })
    expect(enterCalls).toBe(0)
    expect(stub.loops.has(SESSION)).toBe(true)
  })

  it('fix-7 回归形（仅 command 面 artifact）：激活面照常进入（新会话径激活先行——1.21）', async () => {
    let enterCalls = 0
    const rec = followupRecorder()
    const stub = driverStub()
    const d = depsOf({
      cards,
      driver: stub.driver,
      enterAgent: async () => { enterCalls++; return undefined },
    })
    await d.handler({ agent: commandOnlyAgent(rec.fn) as never, rawInput: 'feat-x' })
    expect(enterCalls).toBe(1)
    expect(stub.loops.has(SESSION)).toBe(true)
  })
})

// ─────────────────────────── 防线下探（工作区/读面故障/单活竞态） ───────────────────────────

describe('防线下探', () => {
  it('工作区未注册（cwd 无绑定）：error 回执，listTasks 零触达', async () => {
    const d = depsOf({ cwd: 'C:\\ws\\unknown' })
    const out = await d.handler({ agent: agentOf(SESSION, 'C:\\ws\\unknown') as never, rawInput: '' })
    expect(out.kind).toBe('error')
    expect(d.listInputs).toHaveLength(0)
  })

  it('listTasks 故障：error 回执（枚举失败），不外抛', async () => {
    const d = depsOf({ listThrows: new Error('db locked') })
    const out = await d.handler({ agent: agentOf() as never, rawInput: '' })
    expect(out.kind).toBe('error')
    expect((out as { text: string }).text).toContain('db locked')
  })

  it('直通径单活竞态兜底：start 返回 loop-active → success「已在运行」（active() 读数与 start 间窗口）', async () => {
    const stub = driverStub({ startCode: 'loop-active' }) // active() 无读数、start 恒拒绝（竞态窗口模拟）
    const d = depsOf({ cards: [card({ kind: 'feature', slug: 'feat-x' }, '2.5', 'pending')], driver: stub.driver })
    const out = await d.handler({ agent: agentOf(SESSION, CWD, () => {}) as never, rawInput: 'feat-x' })
    expect(out.kind).toBe('success')
    expect((out as { text: string }).text).toContain('已在运行')
  })
})
