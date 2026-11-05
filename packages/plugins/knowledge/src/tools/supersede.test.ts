// 单测 —— knowledge_supersede tool（fix-评审2：裁决 #1 修订——merge/revert 开为 agent tool；
// followups #1 重命名 2026-11-05：knowledge_merge → knowledge_supersede；
// 参数防御性收窄 + 描述面/参数 schema 契约锚，同 write.test.ts 口径；
// followups #3：补 execute 错误路径（unbound session / projectId 未绑定））。
import { describe, expect, it, vi } from 'vitest'
import type { KnowledgeMergeOutcome, KnowledgeService } from '../service/types.js'
import { createSupersedeTool, parseSupersedeArgs } from './supersede.js'
import { createProjectResolver } from './session.js'

function mergedOutcome(over: Record<string, unknown> = {}): KnowledgeMergeOutcome {
  return { outcome: 'merged', winnerId: 'kb-w', loserId: 'kb-l', demotedFromConfirmed: false, ...over } as KnowledgeMergeOutcome
}

function stubService(outcome: KnowledgeMergeOutcome = mergedOutcome()) {
  const calls: unknown[] = []
  const supersedeEntry = vi.fn(async (q: unknown) => {
    calls.push(q)
    return outcome
  })
  return { service: { supersedeEntry } as unknown as KnowledgeService, calls }
}

const deps = (service: KnowledgeService) => ({
  knowledge: service,
  resolveProjectId: createProjectResolver([{ wsPath: 'C:\\ws\\demo', projectId: 'p-1' }]),
})

/** exec 夹具：会话 sess-1 @ C:\ws\demo */
const exec = { agent: { session: { id: 'sess-1', header: { cwd: 'C:\\ws\\demo' } } } }

const validArgs = { winner_id: 'kb-w', loser_id: 'kb-l', reason: '同义异名', expected_loser_hash: 'a'.repeat(64) }

describe('描述面：tool 定义与参数 schema 契约锚', () => {
  const tool = createSupersedeTool(deps(stubService().service))

  it('tool 名 = knowledge_supersede；必填 = winner_id/loser_id', () => {
    expect(tool.name).toBe('knowledge_supersede')
    expect(tool.parameters.required).toEqual(['winner_id', 'loser_id'])
  })

  it('参数键集 = 必填两键 + 可选两键（snake_case agent 面）', () => {
    expect(Object.keys(tool.parameters.properties).sort()).toEqual(['expected_loser_hash', 'loser_id', 'reason', 'winner_id'])
    expect(tool.parameters.properties.winner_id?.type).toBe('string')
    expect(tool.parameters.properties.expected_loser_hash?.type).toBe('string')
  })

  it('描述面披露自动执行可回滚/hash 校验/CAS 语义', () => {
    expect(tool.description).toContain('reversible')
    expect(tool.description).toContain('content_hash')
    expect(tool.description).toContain('cas-failed')
  })
})

describe('parseSupersedeArgs（执行点防御性收窄）', () => {
  it('合法载荷通过；可选键缺省省略', () => {
    const out = parseSupersedeArgs(validArgs)
    expect(out).toEqual(validArgs)
    expect(parseSupersedeArgs({ winner_id: 'w', loser_id: 'l' })).toEqual({ winner_id: 'w', loser_id: 'l' })
  })

  it('类型违例逐一拒绝（非对象 / id 空 / 可选键类型不符）', () => {
    expect(() => parseSupersedeArgs('x')).toThrow(/must be an object/)
    expect(() => parseSupersedeArgs({ ...validArgs, winner_id: ' ' })).toThrow(/winner_id/)
    expect(() => parseSupersedeArgs({ ...validArgs, loser_id: 3 })).toThrow(/loser_id/)
    expect(() => parseSupersedeArgs({ ...validArgs, reason: 7 })).toThrow(/reason/)
    expect(() => parseSupersedeArgs({ ...validArgs, expected_loser_hash: 1 })).toThrow(/expected_loser_hash/)
  })
})

describe('execute：会话上下文解析 → 服务调用 → snake→camel 映射', () => {
  it('projectId/sessionId 注入 + expected_loser_hash camel 化透传', async () => {
    const { service, calls } = stubService()
    const tool = createSupersedeTool(deps(service))
    const out = await tool.execute(validArgs, exec)
    expect(out).toEqual(mergedOutcome())
    expect(calls).toEqual([
      {
        projectId: 'p-1',
        winnerId: 'kb-w',
        loserId: 'kb-l',
        reason: '同义异名',
        expectedLoserHash: 'a'.repeat(64),
      },
    ])
  })
})

describe('execute 错误路径：unbound session / projectId 未绑定（followups #3）', () => {
  it('无 agent 会话上下文（cwd undefined）→ no session workspace，服务零调用', async () => {
    const { service, calls } = stubService()
    const tool = createSupersedeTool(deps(service))
    await expect(tool.execute(validArgs, {})).rejects.toThrow(/no session workspace/)
    expect(calls).toHaveLength(0)
  })

  it('有会话但 cwd 不在绑定表（projectId 未绑定）→ not bound，服务零调用', async () => {
    const { service, calls } = stubService()
    const tool = createSupersedeTool(deps(service))
    const unboundExec = { agent: { session: { id: 'sess-2', header: { cwd: 'C:\\ws\\elsewhere' } } } }
    await expect(tool.execute(validArgs, unboundExec)).rejects.toThrow(/C:\\ws\\elsewhere[\s\S]*not bound to a registered project/)
    expect(calls).toHaveLength(0)
  })

  it('header.cwd 缺席回落顶层 cwd 同口径（sessionCwd 兼容位）', async () => {
    const { service, calls } = stubService()
    const tool = createSupersedeTool(deps(service))
    const bareSession = { agent: { session: { id: 'sess-3', cwd: 'C:\\ws\\demo' } } }
    const out = await tool.execute(validArgs, bareSession)
    expect(out).toEqual(mergedOutcome())
    expect(calls).toHaveLength(1)
  })
})

describe('render：回执 → 模型可见文本（三分支）', () => {
  it('merged / aborted / cas-failed 各自呈现 outcome 与拒因', async () => {
    const tool = createSupersedeTool(deps(stubService().service))
    const r = tool.output
    const merged = r.render({}, mergedOutcome())
    expect(merged[0]?.text).toContain('merged: kb-l -> kb-w')
    const aborted = r.render({}, { outcome: 'aborted', loserId: 'kb-l', reason: 'hash-mismatch', detail: '失配' })
    expect(aborted[0]?.text).toContain('aborted (hash-mismatch): 失配')
    const cas = r.render({}, { outcome: 'cas-failed', loserId: 'kb-l', reason: 'cross-project', detail: '跨项目' })
    expect(cas[0]?.text).toContain('cas-failed (cross-project): 跨项目')
  })
})
