// user-questions-bridge 单测：镜像/回灌/中止透传/重复 callId 防重入
import { describe, expect, it } from 'vitest'
import { createUserQuestionsBridge, uqCallIdOf, uqSessionIdOf } from './user-questions-bridge.js'

const emitBox = () => {
  const emitted: Array<{ type: string; payload: unknown }> = []
  return { emitted, emit: (event: { type: string; payload: unknown }) => { emitted.push(event) } }
}
const noopDiag = (): ((line: string) => void) => () => {}

describe('uqCallIdOf / uqSessionIdOf', () => {
  it('wait.callId 优先 → callId → 序号合成', () => {
    expect(uqCallIdOf({ wait: { callId: 'w1' } }, 3)).toBe('w1')
    expect(uqCallIdOf({ callId: 'c1' }, 3)).toBe('c1')
    expect(uqCallIdOf({}, 7)).toBe('uq-7')
  })
  it('agent.session.id 收敛', () => {
    expect(uqSessionIdOf({ agent: { session: { id: 's-1' } } })).toBe('s-1')
    expect(uqSessionIdOf({})).toBeUndefined()
  })
})

describe('createUserQuestionsBridge', () => {
  it('handle：镜像 {sessionId, callId, questions} 并挂起等待回灌', async () => {
    const { emitted, emit } = emitBox()
    const bridge = createUserQuestionsBridge({ emit, diag: noopDiag(), pushCount: () => 1 })
    const request = { questions: [{ id: 'q1' }], agent: { session: { id: 's-9' } }, wait: { callId: 'call-1' } }
    const waiting = bridge.handle(request, async () => 'from-next')
    expect(bridge.pendingCount()).toBe(1)
    expect(emitted).toEqual([{ type: 'user-questions/request', payload: { sessionId: 's-9', callId: 'call-1', questions: [{ id: 'q1' }] }, at: expect.any(Number) }])
    expect(bridge.resolve('call-1', { answers: [{ id: 'q1', selected: ['蓝'] }] })).toBe(true)
    await expect(waiting).resolves.toEqual({ answers: [{ id: 'q1', selected: ['蓝'] }] })
    expect(bridge.pendingCount()).toBe(0)
  })

  it('signal 中止：透传 next（桌面同语义——无桥侧超时）', async () => {
    const controller = new AbortController()
    const bridge = createUserQuestionsBridge({ emit: emitBox().emit, diag: noopDiag() })
    const waiting = bridge.handle({ questions: [], signal: controller.signal }, async () => 'passed-next')
    controller.abort()
    await expect(waiting).resolves.toBe('passed-next')
    expect(bridge.pendingCount()).toBe(0)
  })

  it('resolve 未知 callId = false；重复 callId 透传 next', async () => {
    const bridge = createUserQuestionsBridge({ emit: emitBox().emit, diag: noopDiag() })
    expect(bridge.resolve('nope', {})).toBe(false)
    const first = bridge.handle({ wait: { callId: 'same' } }, async () => 'x')
    const second = await bridge.handle({ wait: { callId: 'same' } }, async () => 'second-answered')
    expect(second).toBe('second-answered')
    bridge.resolve('same', { answers: [] })
    await expect(first).resolves.toEqual({ answers: [] })
  })
})
