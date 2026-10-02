// 3.4 单测 —— 会话上下文解析（sessionContextOf / createProjectResolver / unboundSessionError）。
// 口径：官方 sessionCwd 同型（header.cwd 为读取位）；sessionId 缺省空串 = 无会话上下文
//（contracts SearchQuery.sessionId 注释）；绑定表归一整串相等（win32 大小写/斜杠不敏感）。
import { describe, expect, it } from 'vitest'
import type { ToolExecFace } from './faces.js'
import { createProjectResolver, sessionContextOf, unboundSessionError } from './session.js'

describe('sessionContextOf', () => {
  it('无 agent 上下文 → sessionId 空串 + cwd undefined（不进任何会话 tab）', () => {
    expect(sessionContextOf({} as ToolExecFace)).toEqual({ sessionId: '', cwd: undefined })
  })

  it('官方读取位：agent.session.header.cwd（dsh-tool-fs sessionCwd 同型）', () => {
    const exec = { agent: { session: { id: 'sess-1', header: { cwd: 'C:\\ws\\demo' } } } }
    expect(sessionContextOf(exec)).toEqual({ sessionId: 'sess-1', cwd: 'C:\\ws\\demo' })
  })

  it('header 缺席时回落顶层 cwd 兼容位；两者皆无 → cwd undefined', () => {
    expect(sessionContextOf({ agent: { session: { id: 's', cwd: '/ws/a' } } })).toEqual({ sessionId: 's', cwd: '/ws/a' })
    expect(sessionContextOf({ agent: { session: { id: 's' } } })).toEqual({ sessionId: 's', cwd: undefined })
  })
})

describe('createProjectResolver（cwd → projectId 绑定表）', () => {
  it('归一后整串相等命中：反斜杠/尾分隔符/win32 大小写不敏感', () => {
    const resolver = createProjectResolver([{ wsPath: 'C:\\WS\\Demo', projectId: 'p-1' }])
    expect(resolver('C:\\ws\\demo')).toBe('p-1')
    expect(resolver('c:/ws/demo/')).toBe('p-1')
  })

  it('非整串相等（子目录/超集）不命中——会话 cwd = 工作区根口径', () => {
    const resolver = createProjectResolver([{ wsPath: 'C:\\ws\\demo', projectId: 'p-1' }])
    expect(resolver('C:\\ws\\demo\\sub')).toBeUndefined()
    expect(resolver('C:\\ws\\other')).toBeUndefined()
  })

  it('空绑定表 → 恒 undefined；多绑定各自命中', () => {
    const empty = createProjectResolver([])
    expect(empty('/ws/a')).toBeUndefined()
    const multi = createProjectResolver([
      { wsPath: '/ws/a', projectId: 'p-a' },
      { wsPath: '/ws/b', projectId: 'p-b' },
    ])
    expect(multi('/ws/b')).toBe('p-b')
  })

  it('posix 下大小写敏感（归一仅 win32 降大小写）', () => {
    const resolver = createProjectResolver([{ wsPath: '/ws/Demo', projectId: 'p-1' }])
    const expected = process.platform === 'win32' ? 'p-1' : undefined
    expect(resolver('/ws/demo')).toBe(expected)
  })
})

describe('unboundSessionError（未绑定失败口径——agent 回落检索原语触发点）', () => {
  it('无 cwd 与有 cwd 两种信息都指明「无法定位知识库」', () => {
    expect(unboundSessionError({ sessionId: '', cwd: undefined }).message).toContain('no session workspace')
    expect(unboundSessionError({ sessionId: 's', cwd: 'C:\\ws\\x' }).message).toContain('C:\\ws\\x')
    expect(unboundSessionError({ sessionId: 's', cwd: 'C:\\ws\\x' }).message).toContain('not bound')
  })
})
