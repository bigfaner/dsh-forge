// 3.2 单测 —— AC4 会话上下文解析与 cwd 路由（sessionContextOf / createProjectResolver /
// requireProjectId / WorkspaceNotRegisteredError / requireSessionId）。
// 口径：官方 sessionCwd 同型（header.cwd 为读取位）；绑定表归一整串相等
//（win32 大小写/斜杠不敏感——path-key 单源）；未命中 = typed
// ERR_WORKSPACE_NOT_REGISTERED（knowledge 可回落文案 vs forge 无回落原语的分野）。
// bindingsFile 动态面（Implementation Notes：cwd 匹配用 fixture bindingsFile 单测——生产端 3.4）。
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { normalizeFsPath } from '@dsh-forge/path-key'
import { ERROR_CODES } from '@dsh-forge/contracts'
import type { ToolExecFace } from '../faces.js'
import {
  createProjectResolver,
  isWorkspaceNotRegisteredError,
  requireProjectId,
  requireSessionId,
  sessionContextOf,
  WorkspaceNotRegisteredError,
} from './session.js'

describe('sessionContextOf', () => {
  it('无 agent 上下文 → sessionId 空串 + cwd undefined', () => {
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
  it('归一后整串相等命中：反斜杠/尾分隔符/win32 大小写不敏感（path-key 同源）', () => {
    const resolver = createProjectResolver([{ wsPath: 'C:\\WS\\Demo', projectId: 'p-1' }])
    expect(resolver('C:\\ws\\demo')).toBe('p-1')
    expect(resolver('c:/ws/demo/')).toBe('p-1')
  })

  it('非整串相等（子目录/超集）不命中——会话 cwd = 工作区根口径', () => {
    const resolver = createProjectResolver([{ wsPath: 'C:\\ws\\demo', projectId: 'p-1' }])
    expect(resolver('C:\\ws\\demo\\sub')).toBeUndefined()
    expect(resolver('C:\\ws\\other')).toBeUndefined()
  })

  it('posix 下大小写敏感（归一仅 win32 降大小写）', () => {
    const resolver = createProjectResolver([{ wsPath: '/ws/Demo', projectId: 'p-1' }])
    const expected = process.platform === 'win32' ? 'p-1' : undefined
    expect(resolver('/ws/demo')).toBe(expected)
  })

  it('变体拼写矩阵与 core 归一同源（normalizeFsPath 键等价即命中）', () => {
    const resolver = createProjectResolver([{ wsPath: 'Z:\\learn', projectId: 'p-learn' }])
    for (const variant of ['z:\\learn\\', 'Z:/LEARN', 'z:\\Learn']) {
      expect(normalizeFsPath(variant)).toBe(normalizeFsPath('Z:\\learn'))
      if (process.platform === 'win32') expect(resolver(variant)).toBe('p-learn')
    }
  })
})

describe('createProjectResolver（bindingsFile 动态面——cwd 数据缝）', () => {
  let dir: string
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'dsh-forge-pf-bindings-'))
  })
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('文件条目命中（执行点惰性读取——host 注册后增量刷新，无需重建解析器）', () => {
    const file = join(dir, 'b1.json')
    writeFileSync(file, JSON.stringify({ version: 1, projects: [{ wsPath: 'C:\\ws\\live', projectId: 'p-live' }] }), 'utf8')
    const resolver = createProjectResolver([], file)
    expect(resolver('C:\\ws\\live')).toBe('p-live')
    // 装配方刷新（3.4 生产端）后下一次 exec 即见新绑定
    writeFileSync(file, JSON.stringify({ version: 1, projects: [{ wsPath: 'C:\\ws\\new', projectId: 'p-new' }] }), 'utf8')
    expect(resolver('C:\\ws\\new')).toBe('p-new')
    expect(resolver('C:\\ws\\live')).toBeUndefined()
  })

  it('文件条目优先于静态表（装配方最新事实）；文件无该条 → 回落静态', () => {
    const file = join(dir, 'b2.json')
    writeFileSync(file, JSON.stringify({ version: 1, projects: [{ wsPath: 'C:\\ws\\a', projectId: 'p-dyn' }] }), 'utf8')
    const resolver = createProjectResolver(
      [
        { wsPath: 'C:\\ws\\a', projectId: 'p-static' },
        { wsPath: 'C:\\ws\\b', projectId: 'p-static-b' },
      ],
      file,
    )
    expect(resolver('C:\\ws\\a')).toBe('p-dyn')
    expect(resolver('C:\\ws\\b')).toBe('p-static-b')
  })

  it('读失败/形状非法 → fail-soft 回落静态表（不抛）', () => {
    const missing = join(dir, 'nope.json')
    const resolver = createProjectResolver([{ wsPath: 'C:\\ws\\s', projectId: 'p-s' }], missing)
    expect(resolver('C:\\ws\\s')).toBe('p-s')
    const bad = join(dir, 'bad.json')
    writeFileSync(bad, '{"version": 9, "projects": []}', 'utf8')
    expect(createProjectResolver([{ wsPath: 'C:\\ws\\s', projectId: 'p-s' }], bad)('C:\\ws\\s')).toBe('p-s')
    writeFileSync(bad, 'not json', 'utf8')
    expect(createProjectResolver([{ wsPath: 'C:\\ws\\s', projectId: 'p-s' }], bad)('C:\\ws\\s')).toBe('p-s')
  })

  it('文件行形状防御：非对象行/字段缺型跳过（不炸整表）', () => {
    const file = join(dir, 'b3.json')
    writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        projects: ['nope', { wsPath: 1, projectId: 'x' }, { wsPath: 'C:\\ws\\ok', projectId: 'p-ok' }],
      }),
      'utf8',
    )
    expect(createProjectResolver([], file)('C:\\ws\\ok')).toBe('p-ok')
  })
})

describe('requireProjectId（六 tool 共用路由口——AC4 未命中口径）', () => {
  const resolver = createProjectResolver([{ wsPath: 'C:\\ws\\demo', projectId: 'p-1' }])

  it('命中 → projectId（→ core 动词路由键）', () => {
    expect(requireProjectId(resolver, { sessionId: 's', cwd: 'C:\\ws\\demo' })).toBe('p-1')
  })

  it('cwd 未命中 → WorkspaceNotRegisteredError（code = ERR_WORKSPACE_NOT_REGISTERED，data 带 cwd）', () => {
    expect(() => requireProjectId(resolver, { sessionId: 's', cwd: 'C:\\ws\\other' })).toThrow(
      WorkspaceNotRegisteredError,
    )
    try {
      requireProjectId(resolver, { sessionId: 's', cwd: 'C:\\ws\\other' })
    } catch (e) {
      expect(isWorkspaceNotRegisteredError(e)).toBe(true)
      expect((e as WorkspaceNotRegisteredError).code).toBe('ERR_WORKSPACE_NOT_REGISTERED')
      expect(ERROR_CODES).toContain((e as WorkspaceNotRegisteredError).code) // contracts 锚
      expect((e as WorkspaceNotRegisteredError).data).toEqual({ cwd: 'C:\\ws\\other' })
      expect((e as WorkspaceNotRegisteredError).message).toContain('C:\\ws\\other')
    }
  })

  it('cwd 缺席（非 agent 会话）→ 同码拒绝（data 无 cwd + 差异化文案）', () => {
    try {
      requireProjectId(resolver, { sessionId: '', cwd: undefined })
      expect.unreachable('should throw')
    } catch (e) {
      expect(isWorkspaceNotRegisteredError(e)).toBe(true)
      expect((e as WorkspaceNotRegisteredError).data).toEqual({})
      expect((e as WorkspaceNotRegisteredError).message).toContain('no session workspace')
    }
  })
})

describe('requireSessionId（claim/submit 执行会话键——防御收窄）', () => {
  it('有 agent 会话 → sessionId 透传（actor = plugin-tool 通道推断的会话锚）', () => {
    expect(requireSessionId({ sessionId: 'sess-9', cwd: 'C:\\ws\\demo' })).toBe('sess-9')
  })

  it('空会话（无 agent 上下文）→ 拒（空键会落不可归属的 links/records 行）', () => {
    expect(() => requireSessionId({ sessionId: '', cwd: undefined })).toThrow(/no agent session/)
  })
})
