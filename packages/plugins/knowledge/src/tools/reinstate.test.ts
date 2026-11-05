// 单测 —— knowledge_reinstate tool（fix-评审2：裁决 #1 修订；followups #1 重命名
// 2026-11-05：knowledge_revert → knowledge_reinstate；同 supersede.test.ts 口径；
// followups #3：补 execute 错误路径（unbound session / projectId 未绑定））。
import { describe, expect, it, vi } from 'vitest'
import type { KnowledgeRevertOutcome, KnowledgeService } from '../service/types.js'
import { createReinstateTool, parseReinstateArgs } from './reinstate.js'
import { createProjectResolver } from './session.js'

function revertedOutcome(over: Record<string, unknown> = {}): KnowledgeRevertOutcome {
  return { outcome: 'reverted', loserId: 'kb-l', winnerId: 'kb-w', restoredStatus: 'confirmed', ...over } as KnowledgeRevertOutcome
}

function stubService(outcome: KnowledgeRevertOutcome = revertedOutcome()) {
  const calls: unknown[] = []
  const reinstateEntry = vi.fn(async (q: unknown) => {
    calls.push(q)
    return outcome
  })
  return { service: { reinstateEntry } as unknown as KnowledgeService, calls }
}

const deps = (service: KnowledgeService) => ({
  knowledge: service,
  resolveProjectId: createProjectResolver([{ wsPath: 'C:\\ws\\demo', projectId: 'p-1' }]),
})

/** exec 夹具：会话 sess-1 @ C:\ws\demo */
const exec = { agent: { session: { id: 'sess-1', header: { cwd: 'C:\\ws\\demo' } } } }

const validArgs = { loser_id: 'kb-l', winner_id: 'kb-w', reason: '人工复核：非重复对', expected_loser_hash: 'b'.repeat(64) }

describe('描述面：tool 定义与参数 schema 契约锚', () => {
  const tool = createReinstateTool(deps(stubService().service))

  it('tool 名 = knowledge_reinstate；必填 = loser_id', () => {
    expect(tool.name).toBe('knowledge_reinstate')
    expect(tool.parameters.required).toEqual(['loser_id'])
  })

  it('参数键集 = 必填一键 + 可选三键（snake_case agent 面）', () => {
    expect(Object.keys(tool.parameters.properties).sort()).toEqual(['expected_loser_hash', 'loser_id', 'reason', 'winner_id'])
    expect(tool.parameters.properties.loser_id?.type).toBe('string')
    expect(tool.parameters.properties.expected_loser_hash?.type).toBe('string')
  })

  it('描述面披露可逆语义/台账 actor=human/不可凭空回滚', () => {
    expect(tool.description).toContain('actor=human')
    expect(tool.description).toContain('no reinstating out of thin air')
    expect(tool.description).toContain('content_hash')
  })
})

describe('parseReinstateArgs（执行点防御性收窄）', () => {
  it('合法载荷通过；可选键缺省省略', () => {
    expect(parseReinstateArgs(validArgs)).toEqual(validArgs)
    expect(parseReinstateArgs({ loser_id: 'kb-l' })).toEqual({ loser_id: 'kb-l' })
  })

  it('类型违例逐一拒绝（非对象 / id 空 / 可选键类型不符）', () => {
    expect(() => parseReinstateArgs('x')).toThrow(/must be an object/)
    expect(() => parseReinstateArgs({ ...validArgs, loser_id: ' ' })).toThrow(/loser_id/)
    expect(() => parseReinstateArgs({ ...validArgs, winner_id: 3 })).toThrow(/winner_id/)
    expect(() => parseReinstateArgs({ ...validArgs, reason: 1 })).toThrow(/reason/)
    expect(() => parseReinstateArgs({ ...validArgs, expected_loser_hash: true })).toThrow(/expected_loser_hash/)
  })
})

describe('execute：会话上下文解析 → 服务调用 → snake→camel 映射', () => {
  it('projectId/sessionId 注入 + winner_id/expected_loser_hash camel 化透传', async () => {
    const { service, calls } = stubService()
    const tool = createReinstateTool(deps(service))
    const out = await tool.execute(validArgs, exec)
    expect(out).toEqual(revertedOutcome())
    expect(calls).toEqual([
      {
        projectId: 'p-1',
        loserId: 'kb-l',
        winnerId: 'kb-w',
        reason: '人工复核：非重复对',
        expectedLoserHash: 'b'.repeat(64),
      },
    ])
  })
})

describe('execute 错误路径：unbound session / projectId 未绑定（followups #3）', () => {
  it('无 agent 会话上下文（cwd undefined）→ no session workspace，服务零调用', async () => {
    const { service, calls } = stubService()
    const tool = createReinstateTool(deps(service))
    await expect(tool.execute(validArgs, {})).rejects.toThrow(/no session workspace/)
    expect(calls).toHaveLength(0)
  })

  it('有会话但 cwd 不在绑定表（projectId 未绑定）→ not bound，服务零调用', async () => {
    const { service, calls } = stubService()
    const tool = createReinstateTool(deps(service))
    const unboundExec = { agent: { session: { id: 'sess-2', header: { cwd: 'C:\\ws\\elsewhere' } } } }
    await expect(tool.execute(validArgs, unboundExec)).rejects.toThrow(/C:\\ws\\elsewhere[\s\S]*not bound to a registered project/)
    expect(calls).toHaveLength(0)
  })

  it('header.cwd 缺席回落顶层 cwd 同口径（sessionCwd 兼容位）', async () => {
    const { service, calls } = stubService()
    const tool = createReinstateTool(deps(service))
    const bareSession = { agent: { session: { id: 'sess-3', cwd: 'C:\\ws\\demo' } } }
    const out = await tool.execute(validArgs, bareSession)
    expect(out).toEqual(revertedOutcome())
    expect(calls).toHaveLength(1)
  })
})

describe('render：回执 → 模型可见文本（三分支，含 aborted/hash-mismatch 对称口径）', () => {
  it('reverted / aborted / rejected 各自呈现 outcome 与拒因', async () => {
    const tool = createReinstateTool(deps(stubService().service))
    const r = tool.output
    const reverted = r.render({}, revertedOutcome())
    expect(reverted[0]?.text).toContain('reverted: kb-l redirect released')
    const aborted = r.render({}, { outcome: 'aborted', loserId: 'kb-l', reason: 'hash-mismatch', detail: '失配' })
    expect(aborted[0]?.text).toContain('aborted (hash-mismatch): 失配')
    const rejected = r.render({}, { outcome: 'rejected', loserId: 'kb-l', reason: 'ledger-missing', detail: '无账' })
    expect(rejected[0]?.text).toContain('rejected (ledger-missing): 无账')
  })
})
