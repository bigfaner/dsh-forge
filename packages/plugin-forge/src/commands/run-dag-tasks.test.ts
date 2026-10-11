// S2 指令单测 —— /run-dag-tasks handler（run-tasks-host-command proposal S2 + SC1 +
// decisions #19/#20；问询用桩注入）。覆盖：无参单查询枚举双轨候选→问询→选中即启动；
// 带参直通；跑动中再触发→查看/停止/替换问询（停止走本会话作用域——跨会话隔离在
// driver 层已有 pin，此处 pin handler 恒以敲指令会话 id 调 stop）。
import { describe, expect, it, vi } from 'vitest'
import type { ContainerRef, ForgeTasksService, ListTasksQuery, TaskCard, TaskStatus } from '@dsh-forge/contracts'
import type { LoopDriver, LoopRecord, LoopStartInput, LoopStopResult } from '../loop/index.js'
import { createRunDagTasksHandler } from './run-dag-tasks.js'

// ─────────────────────────── 桩与夹具 ───────────────────────────

const CWD = 'C:\\ws\\demo'
const PROJECT = 'p-9'
const SESSION = 's-main'

function agentOf(sessionId = SESSION, cwd: string | undefined = CWD): { session: { id: string; header?: { cwd?: string } } } {
  return {
    session: {
      id: sessionId,
      ...(cwd !== undefined ? { header: { cwd } } : {}),
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
      // 单活竞态脚本：start 恒拒绝（active() 读数后的启动窗口模拟）
      if (options.startCode === 'loop-active') {
        return {
          ok: false as const,
          code: 'loop-active' as const,
          activeSource: { kind: 'feature' as const, slug: input.source.slug },
          activeOwnerSessionId: 's-race',
        }
      }
      // v1 单活：任一活循环在场即拒绝（owner 无关——进程级守卫）
      for (const record of loops.values()) {
        return { ok: false as const, code: 'loop-active' as const, activeSource: record.source, activeOwnerSessionId: record.ownerSessionId }
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
    active: vi.fn(() => {
      for (const record of loops.values()) return record
      return undefined
    }),
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

/** 依赖组（缺省 = 已注册工作区 + 空池 + 无问询） */
function depsOf(options: {
  cards?: TaskCard[]
  driver?: LoopDriver
  ask?: ReturnType<typeof askStub>['face']
  cwd?: string
  listThrows?: Error
}) {
  const driver = options.driver ?? driverStub().driver
  const tasks = tasksStub(options.cards ?? [], options.listThrows !== undefined ? (() => { throw options.listThrows }) as never : undefined)
  return {
    handler: createRunDagTasksHandler({
      driver,
      tasks: tasks.tasks,
      resolveProjectId: (c: string) => (c === CWD ? PROJECT : undefined),
      ...(options.ask !== undefined ? { ask: options.ask } : {}),
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

  it('选中即启动：driver.start 收到 任务源/主会话 id/parent/projectId；回执 success 带 slug', async () => {
    const ask = askStub(answerLabel('blitz-y'))
    const stub = driverStub()
    const d = depsOf({ cards, driver: stub.driver, ask: ask.face })
    const agent = agentOf() as never
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

  it('问询故障（服务拒绝）：fail-soft 未启动不抛', async () => {
    const ask = askStub(undefined, new Error('ASK_ABORTED'))
    const stub = driverStub()
    const d = depsOf({ cards, driver: stub.driver, ask: ask.face })
    const out = await d.handler({ agent: agentOf() as never, rawInput: '' })
    expect(stub.startInputs).toHaveLength(0)
    expect(out.kind).toBe('success')
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

describe('带参 <source-slug> 直通（AC）', () => {
  const cards = [
    card({ kind: 'feature', slug: 'feat-x' }, '2.5', 'pending'),
    card({ kind: 'proposal', slug: 'blitz-y' }, '1.1', 'pending'),
  ]

  it('slug 命中提案轨：零问询直通启动', async () => {
    const ask = askStub(answerLabel('不应被触达'))
    const stub = driverStub()
    const d = depsOf({ cards, driver: stub.driver, ask: ask.face })
    const agent = agentOf() as never
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
    const out = await d.handler({ agent: agentOf() as never, rawInput: '' })
    expect(stub.stopInputs).toEqual([{ ownerSessionId: SESSION }])
    expect(stub.startInputs).toHaveLength(0)
    expect((out as { text: string }).text).toContain('已停止')
  })

  it('停止（他会话循环——跨会话隔离）：stop 恒以本会话 id 调用被作用域拒绝→文本恰「本会话没有派发任务」，他会话循环原样', async () => {
    const foreign: LoopRecord = { ...ACTIVE, ownerSessionId: 's-other' }
    const ask = askStub(answerLabel('停止'))
    const stub = driverStub({ activeRecord: foreign })
    const d = depsOf({ cards, driver: stub.driver, ask: ask.face })
    const out = await d.handler({ agent: agentOf() as never, rawInput: '' })
    expect(stub.stopInputs).toEqual([{ ownerSessionId: SESSION }]) // 永远只报本会话
    expect(stub.loops.has('s-other')).toBe(true) // 他会话循环不受影响
    expect(out).toEqual({ kind: 'success', text: '本会话没有派发任务' })
  })

  it('替换（带参）：先停本会话循环再直通新任务源', async () => {
    const ask = askStub(answerLabel('替换'))
    const stub = driverStub({ activeRecord: ACTIVE })
    const d = depsOf({ cards, driver: stub.driver, ask: ask.face })
    const out = await d.handler({ agent: agentOf() as never, rawInput: 'feat-x' })
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
    const out = await d.handler({ agent: agentOf() as never, rawInput: '' })
    expect(stub.stopInputs).toEqual([{ ownerSessionId: SESSION }])
    expect(stub.startInputs).toHaveLength(1)
    expect(stub.startInputs[0]?.source).toEqual({ kind: 'feature', slug: 'feat-x' })
    expect(out.kind).toBe('success')
  })

  it('替换（他会话循环）：stop 被作用域拒绝→start 单活拒绝→success「已在运行」（未误停、未误启）', async () => {
    const foreign: LoopRecord = { ...ACTIVE, ownerSessionId: 's-other' }
    const ask = askStub(answerLabel('替换'))
    const stub = driverStub({ activeRecord: foreign })
    const d = depsOf({ cards, driver: stub.driver, ask: ask.face })
    const out = await d.handler({ agent: agentOf() as never, rawInput: 'feat-x' })
    expect(stub.loops.has('s-other')).toBe(true)
    expect(stub.startInputs).toHaveLength(1) // start 被触达但被单活守卫拒绝
    expect(out.kind).toBe('success')
    expect((out as { text: string }).text).toContain('已在运行')
  })

  it('未选择操作：success 文本「未选择操作」，循环保持', async () => {
    const ask = askStub()
    const stub = driverStub({ activeRecord: ACTIVE })
    const d = depsOf({ cards, driver: stub.driver, ask: ask.face })
    const out = await d.handler({ agent: agentOf() as never, rawInput: '' })
    expect((out as { text: string }).text).toContain('未选择操作')
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
    const out = await d.handler({ agent: agentOf() as never, rawInput: 'feat-x' })
    expect(out.kind).toBe('success')
    expect((out as { text: string }).text).toContain('已在运行')
  })
})
