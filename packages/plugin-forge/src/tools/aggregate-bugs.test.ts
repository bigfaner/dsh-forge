// aggregateBugs tool 单测（recurrence-signal-tiering 聚合统计）：参数防御收窄
// （errorType 可选）+ 路由映射（projectId = cwd 绑定解析；errorType 子串过滤工具层承载）+
// 双友好返回面（✓ 组数 + 逐行计数表 / 失败 DTO）。
import { describe, expect, it } from 'vitest'
import type { ToolExecFace } from '../faces.js'
import { createAggregateBugsTool, parseAggregateBugsArgs } from './aggregate-bugs.js'
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

const GROUPS = [
  { errorType: 'stale-anchor', total: 3, open: 1, fixed: 2, lastSeenAt: '2026-11-03T00:00:00.000Z' },
  { errorType: 'encoding-corruption', total: 1, open: 0, fixed: 1, lastSeenAt: '2026-10-01T00:00:00.000Z' },
]

function toolWithCapture(): {
  tool: ReturnType<typeof createAggregateBugsTool>
  captured: string[]
} {
  const captured: string[] = []
  const bugs: ForgeBugsToolFace = {
    registerBug: async () => {
      throw new Error('not used')
    },
    resolveBug: async () => {
      throw new Error('not used')
    },
    listBugs: async () => [],
    findRecurrenceCandidates: async () => [],
    getBug: async () => {
      throw new Error('not used')
    },
    aggregateByErrorType: async (projectId) => {
      captured.push(projectId)
      return GROUPS
    },
  }
  const deps: ForgeToolDeps = {
    tasks: {} as ForgeToolDeps['tasks'],
    proposals: {} as ForgeToolDeps['proposals'],
    bugs,
    checkpoints,
    resolveProjectId: (cwd: string) => (cwd.toLowerCase().includes('demo') ? 'p-1' : undefined),
  }
  return { tool: createAggregateBugsTool(deps), captured }
}

describe('parseAggregateBugsArgs（防御收窄）', () => {
  it('缺省 = 空对象；errorType 解析；非 string 拒；非对象根拒', () => {
    expect(parseAggregateBugsArgs({})).toEqual({})
    expect(parseAggregateBugsArgs({ errorType: 'stale' })).toEqual({ errorType: 'stale' })
    expect(() => parseAggregateBugsArgs({ errorType: 7 })).toThrow(/errorType must be a string/)
    expect(() => parseAggregateBugsArgs(null)).toThrow(/arguments must be an object/)
  })
})

describe('aggregateBugs execute（路由 + 组级过滤）', () => {
  it('cwd → projectId；全缺省 = 全分组透传（core 服务序）', async () => {
    const { tool, captured } = toolWithCapture()
    const result = (await tool.execute({}, EXEC)) as { groups: typeof GROUPS }
    expect(captured).toEqual(['p-1'])
    expect(result.groups).toEqual(GROUPS)
  })

  it('errorType 子串过滤（case-insensitive，组级）', async () => {
    const { tool } = toolWithCapture()
    const result = (await tool.execute({ errorType: 'STALE' }, EXEC)) as { groups: typeof GROUPS }
    expect(result.groups.map((g) => g.errorType)).toEqual(['stale-anchor'])
  })

  it('过滤零命中 = 空 groups（非失败）', async () => {
    const { tool } = toolWithCapture()
    const result = (await tool.execute({ errorType: 'zzz' }, EXEC)) as { groups: unknown[] }
    expect(result.groups).toEqual([])
  })

  it('cwd 未绑定 → ERR_WORKSPACE_NOT_REGISTERED 失败 DTO', async () => {
    const { tool } = toolWithCapture()
    const result = await tool.execute({}, { agent: { session: { id: 'sess-2', header: { cwd: 'C:\\other' } } } })
    expect(result).toMatchObject({ ok: false, code: 'ERR_WORKSPACE_NOT_REGISTERED' })
  })

  it('渲染面：✓ 组数 + 逐行计数表（含 total/open/fixed 行）', async () => {
    const { tool } = toolWithCapture()
    const result = await tool.execute({}, EXEC)
    const text = tool.output!.render({}, result).map((b) => b.text).join('\n')
    expect(text).toContain('2 errorType group(s)')
    expect(text).toContain('- stale-anchor: total 3 / open 1 / fixed 2')
  })
})
