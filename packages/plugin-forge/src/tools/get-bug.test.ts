// getBug tool 单测（bug-recurrence-chain——主 + worker 单条全卡/链上下文读径）：
// 参数防御收窄（空 bug_id 拒）+ 路由映射（bug_id 直透 GetBugQuery；projectId = cwd 绑定）+
// 双友好返回面（✓ 全卡键值 + 链时间线「this」标注 / 失败 DTO）。
import { describe, expect, it } from 'vitest'
import type { BugCard, GetBugResponse } from '@dsh-forge/contracts'
import type { ToolExecFace } from '../faces.js'
import { createGetBugTool, parseGetBugArgs } from './get-bug.js'
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
  tool: ReturnType<typeof createGetBugTool>
  captured: Array<{ projectId: string; bugId: string }>
  respond: (r: GetBugResponse) => void
} {
  const captured: Array<{ projectId: string; bugId: string }> = []
  let response: GetBugResponse = { card: bugCard('b-1', '游标漂移') }
  const bugs: ForgeBugsToolFace = {
    registerBug: async () => {
      throw new Error('not used')
    },
    resolveBug: async () => {
      throw new Error('not used')
    },
    listBugs: async () => [],
    getBug: async (q) => {
      captured.push(q)
      return response
    },
  }
  const deps: ForgeToolDeps = {
    tasks: {} as ForgeToolDeps['tasks'],
    proposals: {} as ForgeToolDeps['proposals'],
    bugs,
    checkpoints,
    resolveProjectId: (cwd: string) => (cwd.toLowerCase().includes('demo') ? 'p-1' : undefined),
  }
  return { tool: createGetBugTool(deps), captured, respond: (r) => (response = r) }
}

describe('parseGetBugArgs（防御收窄）', () => {
  it('bug_id 必填非空：空串/缺席/非 string 拒；非对象根拒', () => {
    expect(parseGetBugArgs({ bug_id: 'b-1' })).toEqual({ bug_id: 'b-1' })
    expect(() => parseGetBugArgs({ bug_id: '' })).toThrow(/bug_id must be a non-empty string/)
    expect(() => parseGetBugArgs({})).toThrow(/bug_id/)
    expect(() => parseGetBugArgs({ bug_id: 7 })).toThrow(/bug_id must be a string/)
    expect(() => parseGetBugArgs(null)).toThrow(/arguments must be an object/)
  })
})

describe('getBug execute（路由 + 链上下文透传）', () => {
  it('cwd → projectId；bug_id 直透 GetBugQuery；孤条响应 = card 仅键（chain 缺席）', async () => {
    const { tool, captured } = toolWithCapture()
    const result = (await tool.execute({ bug_id: 'b-1' }, EXEC)) as GetBugResponse
    expect(captured).toEqual([{ projectId: 'p-1', bugId: 'b-1' }])
    expect(result.card.bugId).toBe('b-1')
    expect(result.chain).toBeUndefined()
  })

  it('链上响应：card + chain 全形透传（core 展开聚合，本壳零加工）', async () => {
    const { tool, respond } = toolWithCapture()
    respond({
      card: { ...bugCard('b-2', '复发①'), recurrenceOf: 'b-1' },
      chain: {
        entries: [bugCard('b-1', '链根'), bugCard('b-2', '复发①')],
        currentIndex: 1,
        length: 2,
        rootBugId: 'b-1',
      },
    })
    const result = (await tool.execute({ bug_id: 'b-2' }, EXEC)) as GetBugResponse
    expect(result.chain).toMatchObject({ length: 2, rootBugId: 'b-1', currentIndex: 1 })
  })

  it('cwd 未绑定 → ERR_WORKSPACE_NOT_REGISTERED 失败 DTO', async () => {
    const { tool } = toolWithCapture()
    const result = await tool.execute({ bug_id: 'b-1' }, { agent: { session: { id: 'sess-2', header: { cwd: 'C:\\other' } } } })
    expect(result).toMatchObject({ ok: false, code: 'ERR_WORKSPACE_NOT_REGISTERED' })
  })

  it('渲染面：✓ 全卡键值 + 链时间线（当前条 this 标注 + recurrence of 行）', async () => {
    const { tool, respond } = toolWithCapture()
    respond({
      card: { ...bugCard('b-2', '复发①'), recurrenceOf: 'b-1' },
      chain: {
        entries: [bugCard('b-1', '链根'), bugCard('b-2', '复发①')],
        currentIndex: 1,
        length: 2,
        rootBugId: 'b-1',
      },
    })
    const value = await tool.execute({ bug_id: 'b-2' }, EXEC)
    const rendered = tool.output?.render?.({ bug_id: 'b-2' }, value)
    const text = (rendered as { type: string; text: string }[]).map((b) => b.text).join('\n')
    expect(text).toContain('✓ Bug b-2')
    expect(text).toContain('recurrence of: b-1')
    expect(text).toContain('recurrence count 1')
    expect(text).toContain('<-- this')
  })
})
