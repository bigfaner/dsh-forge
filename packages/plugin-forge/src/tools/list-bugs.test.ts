// listBugs tool 单测（bug-recurrence-chain——主 agent 台账查询面）：参数防御收窄
//（search/status/sort/offset/limit——offset/limit 边界拒）+ 路由映射（直透 core
// ListBugsQuery；projectId = cwd 绑定解析）+ 双友好返回面（✓ 计数 + 逐行 / 失败 DTO）。
import { describe, expect, it } from 'vitest'
import type { BugCard } from '@dsh-forge/contracts'
import type { ToolExecFace } from '../faces.js'
import { createListBugsTool, parseListBugsArgs } from './list-bugs.js'
import type { ForgeBugsToolFace, ForgeToolDeps } from './index.js'

const checkpoints: ForgeToolDeps['checkpoints'] = {
  appendCheckpoint: async () => {
    throw new Error('not used')
  },
  listCheckpoints: async () => [],
  ensureCheckpoint: async () => {
    throw new Error('not used')
  },
}

const EXEC: ToolExecFace = { agent: { session: { id: 'sess-1', header: { cwd: 'C:\\ws\\demo' } } } }

function bugCard(bugId: string, summary: string): BugCard {
  return {
    bugId,
    summary,
    bugDesc: 'd',
    triggerDesc: 't',
    expected: 'e',
    actual: 'a',
    bugStatus: 'open',
    reporter: 'faner',
    createdAt: '2026-10-16T00:00:00.000Z',
    updatedAt: '2026-10-16T00:00:00.000Z',
  }
}

function toolWithCapture(): {
  tool: ReturnType<typeof createListBugsTool>
  captured: Array<{ projectId: string } & Record<string, unknown>>
} {
  const captured: Array<{ projectId: string } & Record<string, unknown>> = []
  const bugs: ForgeBugsToolFace = {
    registerBug: async () => {
      throw new Error('not used')
    },
    resolveBug: async () => {
      throw new Error('not used')
    },
    listBugs: async (q) => {
      captured.push(q as { projectId: string } & Record<string, unknown>)
      return [bugCard('b-1', '游标漂移')]
    },
    getBug: async () => {
      throw new Error('not used')
    },
  }
  const deps: ForgeToolDeps = {
    tasks: {} as ForgeToolDeps['tasks'],
    proposals: {} as ForgeToolDeps['proposals'],
    bugs,
    checkpoints,
    resolveProjectId: (cwd: string) => (cwd.toLowerCase().includes('demo') ? 'p-1' : undefined),
  }
  return { tool: createListBugsTool(deps), captured }
}

describe('parseListBugsArgs（防御收窄）', () => {
  it('全参解析：search/status/sort/offset/limit 齐备；全缺省 = 空对象', () => {
    expect(
      parseListBugsArgs({ search: '游标', status: ['open', 'fixed'], sort: 'created', offset: 2, limit: 10 }),
    ).toEqual({ search: '游标', status: ['open', 'fixed'], sort: 'created', offset: 2, limit: 10 })
    expect(parseListBugsArgs({})).toEqual({})
  })

  it('offset/limit 边界拒：负数/非整数/非 number/limit 0', () => {
    expect(() => parseListBugsArgs({ offset: -1 })).toThrow(/offset must be a non-negative integer/)
    expect(() => parseListBugsArgs({ offset: 1.5 })).toThrow(/offset must be a non-negative integer/)
    expect(() => parseListBugsArgs({ offset: '2' })).toThrow(/offset must be a non-negative integer/)
    expect(() => parseListBugsArgs({ limit: 0 })).toThrow(/limit must be a positive integer/)
    expect(() => parseListBugsArgs({ limit: -3 })).toThrow(/limit must be a non-negative integer/)
    expect(() => parseListBugsArgs({ limit: 2.5 })).toThrow(/limit must be a non-negative integer/)
  })

  it('status 词表外拒；sort 词表外拒；非对象根拒', () => {
    expect(() => parseListBugsArgs({ status: ['done'] })).toThrow(/status must only contain/)
    expect(() => parseListBugsArgs({ sort: 'newest' })).toThrow(/sort must be one of/)
    expect(() => parseListBugsArgs(null)).toThrow(/arguments must be an object/)
  })
})

describe('listBugs execute（路由 + 查询直透）', () => {
  it('cwd → projectId；四参直透 ListBugsQuery（键缺席式）', async () => {
    const { tool, captured } = toolWithCapture()
    const result = await tool.execute({ search: '游标', status: ['open'], sort: 'created', offset: 2, limit: 10 }, EXEC)
    expect(captured[0]).toEqual({ projectId: 'p-1', search: '游标', status: ['open'], sort: 'created', offset: 2, limit: 10 })
    expect(result).toMatchObject({ bugs: [{ bugId: 'b-1' }] })
  })

  it('全缺省 = 仅 projectId 查询（全库全量）', async () => {
    const { tool, captured } = toolWithCapture()
    await tool.execute({}, EXEC)
    expect(captured[0]).toEqual({ projectId: 'p-1' })
  })

  it('cwd 未绑定 → ERR_WORKSPACE_NOT_REGISTERED 失败 DTO；渲染面 ✓ 计数', async () => {
    const { tool } = toolWithCapture()
    const result = await tool.execute({}, { agent: { session: { id: 'sess-2', header: { cwd: 'C:\\other' } } } })
    expect(result).toMatchObject({ ok: false, code: 'ERR_WORKSPACE_NOT_REGISTERED' })
    const rendered = tool.output?.render?.({}, { bugs: [{ ...bugCard('b-1', 's'), recurrenceOf: 'b-0' }] })
    expect((rendered as { type: string; text: string }[])[0]!.text).toContain('✓ 1 bug(s) matched')
    expect((rendered as { type: string; text: string }[])[0]!.text).toContain('recurrence of: b-0')
  })
})
