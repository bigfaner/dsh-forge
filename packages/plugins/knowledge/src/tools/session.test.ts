// 3.4 单测 —— 会话上下文解析（sessionContextOf / createProjectResolver / unboundSessionError）。
// 口径：官方 sessionCwd 同型（header.cwd 为读取位）；sessionId 缺省空串 = 无会话上下文
//（contracts SearchQuery.sessionId 注释）；绑定表归一整串相等（win32 大小写/斜杠不敏感）。
// 4.2：bindingsFile 动态面（host 装配方维护——执行点惰性读取，条目优先于静态表）。
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { normalizeFsPath } from '@dsh-forge/path-key'
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

  // fix-30 同源口径 pin：绑定表解析与 core 注册链共消费 @dsh-forge/path-key——
  // 同一变体拼写（盘符大小写/正反斜杠/尾分隔符）core 命中既有行 ⟺ 此处命中绑定行
  it('变体拼写矩阵与 core 归一同源（normalizeFsPath 键等价即命中）', () => {
    const resolver = createProjectResolver([{ wsPath: 'Z:\\learn', projectId: 'p-learn' }])
    for (const variant of ['z:\\learn\\', 'Z:/LEARN', 'z:\\Learn']) {
      // 键等价断言（口径单一来源本体）+ 解析命中断言（消费面）双钉
      expect(normalizeFsPath(variant)).toBe(normalizeFsPath('Z:\\learn'))
      if (process.platform === 'win32') expect(resolver(variant)).toBe('p-learn')
    }
  })
})

describe('createProjectResolver（bindingsFile 动态面——4.2）', () => {
  let dir: string
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'dsh-forge-kn-bindings-'))
  })
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('文件条目命中（执行点惰性读取——写入后无需重建解析器）', () => {
    const file = join(dir, 'b1.json')
    writeFileSync(file, JSON.stringify({ version: 1, projects: [{ wsPath: 'C:\\ws\\live', projectId: 'p-live' }] }), 'utf8')
    const resolver = createProjectResolver([], file)
    expect(resolver('C:\\ws\\live')).toBe('p-live')
    // 装配方刷新后（host registerProject 增量锚）下一次 exec 即见新绑定
    writeFileSync(file, JSON.stringify({ version: 1, projects: [{ wsPath: 'C:\\ws\\new', projectId: 'p-new' }] }), 'utf8')
    expect(resolver('C:\\ws\\new')).toBe('p-new')
    expect(resolver('C:\\ws\\live')).toBeUndefined()
  })

  it('文件条目优先于静态表（装配方最新事实）；文件无该条 → 回落静态', () => {
    const file = join(dir, 'b2.json')
    writeFileSync(file, JSON.stringify({ version: 1, projects: [{ wsPath: 'C:\\ws\\a', projectId: 'p-dyn' }] }), 'utf8')
    const resolver = createProjectResolver([{ wsPath: 'C:\\ws\\a', projectId: 'p-static' }, { wsPath: 'C:\\ws\\b', projectId: 'p-static-b' }], file)
    expect(resolver('C:\\ws\\a')).toBe('p-dyn')
    expect(resolver('C:\\ws\\b')).toBe('p-static-b')
  })

  it('读失败/形状非法 → fail-soft 回落静态表（不抛）', () => {
    const missing = join(dir, 'nope.json')
    const resolver = createProjectResolver([{ wsPath: 'C:\\ws\\s', projectId: 'p-s' }], missing)
    expect(resolver('C:\\ws\\s')).toBe('p-s')
    const bad = join(dir, 'bad.json')
    writeFileSync(bad, '{"version": 9, "projects": [{"wsPath": "C:\\ws\\x", "projectId": "p-x"}]}', 'utf8')
    expect(createProjectResolver([{ wsPath: 'C:\\ws\\s', projectId: 'p-s' }], bad)('C:\\ws\\x')).toBeUndefined()
    writeFileSync(bad, 'not json', 'utf8')
    expect(createProjectResolver([{ wsPath: 'C:\\ws\\s', projectId: 'p-s' }], bad)('C:\\ws\\s')).toBe('p-s')
  })

  it('文件行形状防御：非对象行/字段缺型跳过（不炸整表）', () => {
    const file = join(dir, 'b3.json')
    writeFileSync(
      file,
      JSON.stringify({ version: 1, projects: ['nope', { wsPath: 1, projectId: 'x' }, { wsPath: 'C:\\ws\\ok', projectId: 'p-ok' }] }),
      'utf8',
    )
    const resolver = createProjectResolver([], file)
    expect(resolver('C:\\ws\\ok')).toBe('p-ok')
  })
})

describe('unboundSessionError（未绑定失败口径——agent 回落检索原语触发点）', () => {
  it('无 cwd 与有 cwd 两种信息都指明「无法定位知识库」', () => {
    expect(unboundSessionError({ sessionId: '', cwd: undefined }).message).toContain('no session workspace')
    expect(unboundSessionError({ sessionId: 's', cwd: 'C:\\ws\\x' }).message).toContain('C:\\ws\\x')
    expect(unboundSessionError({ sessionId: 's', cwd: 'C:\\ws\\x' }).message).toContain('not bound')
  })
})
