// 会话上下文解析单测（sessionContextOf / createProjectResolver / createWsPathResolver /
// unboundSessionError）。口径：官方 sessionCwd 同型（header.cwd 为读取位）；sessionId
// 缺省空串 = 无会话上下文（SearchQuery.sessionId 注释）；绑定表归一整串相等（win32
// 大小写/斜杠不敏感）。1.7 Q19：绑定表 = 纯 config 静态注入（bindingsFile 动态面退役）；
// 两级解析（projectId→wsPath→注册行）第一级 = createWsPathResolver，第二级联合
// storage/registry（canonical 键命中）在本文件末组钉两级链路。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { normalizeFsPath } from '@dsh-forge/path-key'
import { createKnowledgeRegistry, openKnowledgeDatabase } from '../storage/index.js'
import type { ToolExecFace } from './faces.js'
import { createProjectResolver, createWsPathResolver, sessionContextOf, unboundSessionError } from './session.js'

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

describe('createProjectResolver（cwd → projectId 静态绑定表——Q19 纯 config）', () => {
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

  // fix-30 同源口径 pin：绑定表解析与注册链共消费 @dsh-forge/path-key——同一变体拼写
  //（盘符大小写/正反斜杠/尾分隔符）注册链命中既有行 ⟺ 此处命中绑定行
  it('变体拼写矩阵与归一化同源（normalizeFsPath 键等价即命中）', () => {
    const resolver = createProjectResolver([{ wsPath: 'Z:\\learn', projectId: 'p-learn' }])
    for (const variant of ['z:\\learn\\', 'Z:/LEARN', 'z:\\Learn']) {
      // 键等价断言（口径单一来源本体）+ 解析命中断言（消费面）双钉
      expect(normalizeFsPath(variant)).toBe(normalizeFsPath('Z:\\learn'))
      if (process.platform === 'win32') expect(resolver(variant)).toBe('p-learn')
    }
  })
})

describe('createWsPathResolver（projectId → wsPath——两级解析第一级）', () => {
  it('静态表反向命中：projectId → wsPath；未命中 → undefined', () => {
    const resolver = createWsPathResolver([
      { wsPath: '/ws/a', projectId: 'p-a' },
      { wsPath: '/ws/b', projectId: 'p-b' },
    ])
    expect(resolver('p-a')).toBe('/ws/a')
    expect(resolver('p-b')).toBe('/ws/b')
    expect(resolver('p-x')).toBeUndefined()
  })

  it('空表 → 恒 undefined（服务面 requireProject fail-loud 收口）', () => {
    expect(createWsPathResolver([])('p-1')).toBeUndefined()
  })
})

describe('两级解析链（projectId→wsPath→注册行——Q19 服务面解析缝）', () => {
  let dir: string
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
  })

  it('config 绑定行 + 注册表 canonical 行 → 两级命中注册行；任一级缺席 → 未命中', () => {
    dir = mkdtempSync(join(tmpdir(), 'dsh-forge-kn-resolve-'))
    const db = openKnowledgeDatabase(join(dir, 'knowledge.db'))
    const registry = createKnowledgeRegistry(db)
    const wsDir = join(dir, 'ws')
    registry.upsert(wsDir, join(wsDir, '.knowledge'))

    const resolveWsPath = createWsPathResolver([{ wsPath: wsDir, projectId: 'p-1' }])
    // 两级全链：projectId → wsPath → 注册行（realpath canonical 键——临时目录 8.3 短名/junction 展开后仍命中）
    const row = registry.findByWsPath(resolveWsPath('p-1')!)
    expect(row).toBeDefined()
    expect(row!.knowledgeDir).toBe(join(wsDir, '.knowledge'))

    // 第一级缺席（projectId 不在静态表）：解析出 undefined——服务面按项目不存在 fail-loud
    expect(resolveWsPath('p-unknown')).toBeUndefined()
    // 第二级缺席（wsPath 在表、注册行不在）：findByWsPath undefined
    const unregistered = createWsPathResolver([{ wsPath: join(dir, 'no-reg'), projectId: 'p-2' }])
    expect(registry.findByWsPath(unregistered('p-2')!)).toBeUndefined()
    db.close()
  })
})

describe('unboundSessionError（未绑定失败口径——agent 回落检索原语触发点）', () => {
  it('无 cwd 与有 cwd 两种信息都指明「无法定位知识库」', () => {
    expect(unboundSessionError({ sessionId: '', cwd: undefined }).message).toContain('no session workspace')
    expect(unboundSessionError({ sessionId: 's', cwd: 'C:\\ws\\x' }).message).toContain('C:\\ws\\x')
    expect(unboundSessionError({ sessionId: 's', cwd: 'C:\\ws\\x' }).message).toContain('not bound')
  })
})

// ── stage④ 1.5 会话归因派生（roundtable2 B2——核销卷 review/session-events-verification.md） ──
import type { DiagEventPayload } from '@dsh-forge/contracts'
import type { SessionEventFace, ToolSessionEventsFace } from './faces.js'
import { deriveTurnContext } from './session.js'

/** 事件面构造（shape = faces SessionEventFace） */
function ev(type: string, data: unknown): SessionEventFace {
  return { type, data }
}

function eventsFaceOf(events: readonly SessionEventFace[]): ToolSessionEventsFace {
  return { snapshotEvents: () => events }
}

/** 一轮标准事件流：turn/start(7) → queued 人话 → inject 合成上下文 → step 事件 → assistant */
const standardTurn: SessionEventFace[] = [
  ev('user/message', { source: { kind: 'user' }, content: [{ type: 'text', text: '上一轮的话' }] }),
  ev('turn/start', { turn: 7 }),
  ev('user/message', { source: { kind: 'user' }, content: [{ type: 'text', text: '查一下 knowledge 的热读口径' }] }),
  ev('user/message', { source: { kind: 'system-prompt', form: 'notice', summary: 'AGENTS.md 变更' }, content: [{ type: 'text', text: '注入上下文——不得作触发输入' }] }),
  ev('step/start', { turn: 7, step: 1 }),
  ev('assistant/message', { turn: 7, step: 1, message: {} }),
]

describe('deriveTurnContext（session 事件日志归因派生——纯函数）', () => {
  it('最近 turn/start 的 turn 序 + 该轮首个 queued（kind=user）message 原文', () => {
    expect(deriveTurnContext(standardTurn)).toEqual({ turnSeq: 7, triggerText: '查一下 knowledge 的热读口径' })
  })

  it('多轮递进：锚定最近一轮（现派生零缓存——无 stale 锚）', () => {
    const events = [...standardTurn, ev('turn/end', { turn: 7, reason: 'completed' }), ev('turn/start', { turn: 8 }), ev('user/message', { source: { kind: 'user' }, content: [{ type: 'text', text: '第二轮' }] })]
    expect(deriveTurnContext(events)).toEqual({ turnSeq: 8, triggerText: '第二轮' })
  })

  it('inject/goal 等合成上下文（非 kind=user）不作触发输入；仅 turn 序可得时单键产出', () => {
    const events = [ev('turn/start', { turn: 3 }), ev('user/message', { source: { kind: 'system-prompt' }, content: [{ type: 'text', text: '注入' }] })]
    expect(deriveTurnContext(events)).toEqual({ turnSeq: 3 })
  })

  it('无 turn/start → 空产物（键缺席式——禁显式 undefined）', () => {
    const out = deriveTurnContext([ev('user/message', { source: { kind: 'user' }, content: [] })])
    expect(out).toEqual({})
    expect('turnSeq' in out).toBe(false)
    expect('triggerText' in out).toBe(false)
  })

  it('turn/start 后无 queued 人话 → 仅 turnSeq；空文本块不产触发输入', () => {
    expect(deriveTurnContext([ev('turn/start', { turn: 1 })])).toEqual({ turnSeq: 1 })
    expect(deriveTurnContext([ev('turn/start', { turn: 1 }), ev('user/message', { source: { kind: 'user' }, content: [{ type: 'text', text: '' }] })])).toEqual({ turnSeq: 1 })
  })
})

describe('sessionContextOf 归因派生集成（fail-soft 双 NULL + warn diag——bug 0520cbaf 禁静默）', () => {
  const collect: DiagEventPayload[] = []
  const emit = (p: DiagEventPayload): void => {
    collect.push(p)
  }

  it('events 子面在场 → 派生 turnSeq/triggerText；零 diag（正常派生路径）', () => {
    const before = collect.length
    const exec = { agent: { session: { id: 's1', header: { cwd: '/ws' }, events: eventsFaceOf(standardTurn) } } }
    const ctx = sessionContextOf(exec as ToolExecFace, emit)
    expect(ctx.sessionId).toBe('s1')
    expect(ctx.turnSeq).toBe(7)
    expect(ctx.triggerText).toContain('热读口径')
    expect(collect.length).toBe(before)
  })

  it('真机 Session 形状（官方 snapshotEvents 直挂 session、无 events 属性）→ 派生取数缝命中（bug 派生缝缺失修复 pin）', () => {
    const before = collect.length
    const exec = {
      agent: {
        session: {
          id: 's1b',
          header: { cwd: '/ws' },
          // 官方 dsh-session Session 形状：snapshotEvents 为 session 方法（eventsSnapshot private）
          snapshotEvents: () => standardTurn,
        },
      },
    }
    const ctx = sessionContextOf(exec as unknown as ToolExecFace, emit)
    expect(ctx.sessionId).toBe('s1b')
    expect(ctx.turnSeq).toBe(7)
    expect(ctx.triggerText).toContain('热读口径')
    expect(collect.length).toBe(before)
  })

  it('events 子面缺席（有 session）→ 双 NULL + warn diag（knowledge-recall-derive）', () => {
    const before = collect.length
    const exec = { agent: { session: { id: 's2', header: { cwd: '/ws' } } } }
    const ctx = sessionContextOf(exec as ToolExecFace, emit)
    expect(ctx.turnSeq).toBeUndefined()
    expect(ctx.triggerText).toBeUndefined()
    expect(collect.length).toBe(before + 1)
    expect(collect[collect.length - 1]).toMatchObject({ level: 'warn', event: 'knowledge-recall-derive' })
  })

  it('派生抛异常 → 双 NULL + warn diag（召回主链不受阻——sessionContextOf 不 throw）', () => {
    const before = collect.length
    const exec = {
      agent: {
        session: {
          id: 's3',
          header: { cwd: '/ws' },
          events: { snapshotEvents: () => { throw new Error('log unavailable') } },
        },
      },
    }
    const ctx = sessionContextOf(exec as ToolExecFace, emit)
    expect(ctx.sessionId).toBe('s3')
    expect(ctx.turnSeq).toBeUndefined()
    expect(collect.length).toBe(before + 1)
    expect(collect[collect.length - 1]).toMatchObject({ level: 'warn', event: 'knowledge-recall-derive' })
  })

  it('无 session（web/RPC 径）→ 恒双 NULL、零 warn（正常降级词义）', () => {
    const before = collect.length
    const ctx = sessionContextOf({} as ToolExecFace, emit)
    expect(ctx).toEqual({ sessionId: '', cwd: undefined })
    expect(collect.length).toBe(before)
  })

  it('每调用期现派生零缓存：snapshotEvents 每次调用被重新求值（不供 stale turn）', () => {
    let calls = 0
    const live: SessionEventFace[] = [...standardTurn]
    const exec = {
      agent: {
        session: {
          id: 's4',
          header: { cwd: '/ws' },
          events: { snapshotEvents: () => { calls += 1; return [...live] } },
        },
      },
    }
    sessionContextOf(exec as ToolExecFace)
    expect(calls).toBe(1)
    live.push(ev('turn/end', { turn: 7, reason: 'completed' }), ev('turn/start', { turn: 9 }), ev('user/message', { source: { kind: 'user' }, content: [{ type: 'text', text: '新一轮' }] }))
    const ctx = sessionContextOf(exec as ToolExecFace)
    expect(calls).toBe(2)
    expect(ctx.turnSeq).toBe(9)
    expect(ctx.triggerText).toBe('新一轮')
  })
})
