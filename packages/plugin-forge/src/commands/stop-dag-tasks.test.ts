// S2 指令单测 —— /stop-dag-tasks handler（run-tasks-host-command decisions #20：
// 无参直停同一会话（ownerSessionId=敲指令会话）启动的活循环；本会话无活循环 = no-op
// 文本「本会话没有派发任务」，不附归属、不误停其它会话循环）。问询/叙述零参与——
// 驱动器面（跨会话隔离的真判定）另有 driver 层 pin，此处 pin handler 语义。
import { describe, expect, it, vi } from 'vitest'
import type { LoopDriver, LoopRecord, LoopStopResult } from '../loop/index.js'
import { createStopDagTasksHandler, NO_ACTIVE_LOOP_TEXT, STOP_DAG_TASKS_NAME } from './stop-dag-tasks.js'

const SESSION = 's-main'

function agentOf(sessionId = SESSION): { session: { id: string; header: { cwd: string } } } {
  return { session: { id: sessionId, header: { cwd: 'C:\\ws\\demo' } } }
}

/** driver 桩（按 owner 语义的最小登记表——他会话活循环在本会话 stop 下必须原样） */
function driverStub(activeRecord?: LoopRecord) {
  const loops = new Map<string, LoopRecord>()
  const stopInputs: { ownerSessionId: string }[] = []
  if (activeRecord !== undefined) loops.set(activeRecord.ownerSessionId, activeRecord)
  const driver: LoopDriver = {
    start: vi.fn(async () => {
      throw new Error('stop handler must never start')
    }),
    stop: vi.fn(async (input: { ownerSessionId: string }): Promise<LoopStopResult> => {
      stopInputs.push(input)
      if (!loops.has(input.ownerSessionId)) return { ok: false, code: 'no-active-loop' }
      loops.delete(input.ownerSessionId)
      return { ok: true, stopped: true, hadInFlight: false }
    }),
    activeOf: vi.fn((ownerSessionId: string) => loops.get(ownerSessionId)),
    activeAll: vi.fn(() => [...loops.values()]),
    resume: vi.fn(() => ({ ok: false, code: 'no-active-loop' }) as const),
    stopLoop: vi.fn(async () => ({ ok: false, code: 'no-active-loop', suspended: false, ownerSessionId: '' }) as const),
    pause: vi.fn(async (_input: { readonly loopId: string; readonly requesterSessionId: string; readonly reason: string }) => ({ ok: false, code: 'no-active-loop', suspended: false, ownerSessionId: '' }) as const),
    dispose: vi.fn(() => {}),
  }
  return { driver, stopInputs, loops }
}

const OWN: LoopRecord = {
  id: 'loop-A',
  source: { kind: 'proposal', slug: 'blitz-y' },
  ownerSessionId: SESSION,
  projectId: 'p-9',
  takeoverSessions: new Set<string>(),
}

describe('stop-dag-tasks handler（decisions #20 作用域）', () => {
  it(`指令名 pin：${STOP_DAG_TASKS_NAME}（无 input 描述符——无参指令）`, () => {
    expect(STOP_DAG_TASKS_NAME).toBe('stop-dag-tasks')
  })

  it('本会话活循环：stop 以敲指令会话 id 调用；success 已停止 + 任务源', async () => {
    const stub = driverStub(OWN)
    const handler = createStopDagTasksHandler({ driver: stub.driver })
    const out = await handler({ agent: agentOf() as never, rawInput: '' })
    expect(stub.stopInputs).toEqual([{ ownerSessionId: SESSION }])
    expect(out.kind).toBe('success')
    expect((out as { text: string }).text).toContain('blitz-y')
    expect(stub.loops.has(SESSION)).toBe(false)
  })

  it('本会话无活循环：success 文本恰「本会话没有派发任务」——零归属信息', async () => {
    const stub = driverStub() // 空登记表
    const handler = createStopDagTasksHandler({ driver: stub.driver })
    const out = await handler({ agent: agentOf() as never, rawInput: '' })
    expect(out).toEqual({ kind: 'success', text: NO_ACTIVE_LOOP_TEXT })
    expect(NO_ACTIVE_LOOP_TEXT).toBe('本会话没有派发任务')
    expect((out as { text: string }).text).not.toContain('s-')
    expect((out as { text: string }).text).not.toContain('会话 s')
  })

  it('他会话活循环不受影响（隔离）：stop 恒以本会话 id 调用→no-op 文本；他循环原样在册', async () => {
    const stub = driverStub({ ...OWN, ownerSessionId: 's-other' })
    const handler = createStopDagTasksHandler({ driver: stub.driver })
    const out = await handler({ agent: agentOf() as never, rawInput: '' })
    expect(stub.stopInputs).toEqual([{ ownerSessionId: SESSION }])
    expect(stub.loops.has('s-other')).toBe(true)
    expect(out).toEqual({ kind: 'success', text: '本会话没有派发任务' })
  })

  it('在途模型轮存在时 stop 仍在窗口内出回执（bug a098e20c）：handler 先以官方 cancel 打断在途轮（keepInbox 保留 queued/steering）再收口 stop', async () => {
    const loopsRecord: LoopRecord = { ...OWN, inFlight: { taskRef: { slug: 'blitz-y', localId: '1.1' }, taskKey: 'blitz-y/1.1', taskId: 't-2', title: 'T' } }
    const stub = driverStub(loopsRecord)
    const cancels: { cause: unknown; options: unknown }[] = []
    const agent = {
      ...agentOf(),
      status: 'running',
      cancel: vi.fn((cause: unknown, options: unknown) => {
        cancels.push({ cause, options })
      }),
    }
    const handler = createStopDagTasksHandler({
      driver: {
        ...stub.driver,
        stop: async (input) => {
          expect(cancels).toHaveLength(1) // 打断先于 stop 收口
          return stub.driver.stop(input)
        },
      },
    })
    const out = await handler({ agent: agent as never, rawInput: '' })
    expect(cancels).toEqual([{ cause: { kind: 'user' }, options: { keepInbox: true } }])
    expect(out.kind).toBe('success')
    expect((out as { text: string }).text).toContain('已停止')
  })

  it('agent 空闲时零 cancel（官方 cancel 空闲 no-op 语义不在 handler 侧触发）', async () => {
    const stub = driverStub(OWN)
    const cancel = vi.fn()
    const agent = { ...agentOf(), status: 'idle', cancel }
    const handler = createStopDagTasksHandler({ driver: stub.driver })
    await handler({ agent: agent as never, rawInput: '' })
    expect(cancel).not.toHaveBeenCalled()
  })

  it('in-flight 在飞：回执说明在飞任务去向（停止径由驱动器真化与叙述）', async () => {
    const loopsRecord: LoopRecord = { ...OWN, inFlight: { taskRef: { slug: 'blitz-y', localId: '1.1' }, taskKey: 'blitz-y/1.1', taskId: 't-2', title: 'T' } }
    const stub = driverStub(loopsRecord)
    const driver: LoopDriver = {
      ...stub.driver,
      stop: vi.fn(async () => ({ ok: true as const, stopped: true as const, hadInFlight: true })),
    }
    const handler = createStopDagTasksHandler({ driver })
    const out = await handler({ agent: agentOf() as never, rawInput: '' })
    expect((out as { text: string }).text).toContain('继续')
  })
})
