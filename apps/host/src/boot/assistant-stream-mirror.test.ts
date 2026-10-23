// assistant-stream-mirror 单测：帧映射 / 会话身份收敛 / fail-soft 退订
import { describe, expect, it } from 'vitest'
import {
  ASSISTANT_STREAM_MIRROR_TYPE,
  assistantStreamSessionIdOf,
  subscribeAssistantStreamMirror,
} from './assistant-stream-mirror.js'

describe('assistantStreamSessionIdOf', () => {
  it('agent.session.id 收敛', () => {
    expect(assistantStreamSessionIdOf({ agent: { session: { id: 's-1' } }, frame: {} })).toBe('s-1')
  })
  it('缺 agent / 缺 session / 非字符串 id = undefined', () => {
    expect(assistantStreamSessionIdOf({ frame: {} })).toBeUndefined()
    expect(assistantStreamSessionIdOf({ agent: {} })).toBeUndefined()
    expect(assistantStreamSessionIdOf({ agent: { session: { id: 7 } } })).toBeUndefined()
    expect(assistantStreamSessionIdOf(null)).toBeUndefined()
  })
})

describe('subscribeAssistantStreamMirror', () => {
  it('帧镜像为 {sessionId, frame} 载荷', () => {
    const emitted: unknown[] = []
    const handlers: Array<(payload: unknown) => void> = []
    const off = subscribeAssistantStreamMirror({
      ctxOn: (name, handler) => {
        expect(name).toBe('agent/assistant-stream')
        handlers.push(handler)
        return () => {}
      },
      emit: (event) => emitted.push(event),
      diag: () => {},
    })
    expect(handlers).toHaveLength(1)
    handlers[0]!({ agent: { session: { id: 's-9' } }, frame: { type: 'chunk', attemptId: 'a-1' } })
    expect(emitted).toEqual([
      {
        type: ASSISTANT_STREAM_MIRROR_TYPE,
        payload: { sessionId: 's-9', frame: { type: 'chunk', attemptId: 'a-1' } },
        at: expect.any(Number),
      },
    ])
    off()
  })

  it('无会话身份帧丢弃并落 diag；ctx.on 拒绝 = 空退订 fail-soft', () => {
    const diags: string[] = []
    const emitted: unknown[] = []
    const handlers: Array<(payload: unknown) => void> = []
    const off = subscribeAssistantStreamMirror({
      ctxOn: (_name, handler) => {
        handlers.push(handler)
        return undefined
      },
      emit: (event) => emitted.push(event),
      diag: (line) => diags.push(line),
    })
    handlers[0]!({ frame: { type: 'start' } })
    expect(emitted).toHaveLength(0)
    expect(diags.some((line) => line.includes('缺会话身份'))).toBe(true)
    expect(() => off()).not.toThrow()
  })
})
