// 3.4 单测 —— knowledge.search tool（AC1：参数/返回与 KnowledgeService.search 同构，
// DTO 复用 contracts 不自定形状；AC4 前置：执行链 = 会话解析 → 服务调用，透传不记账）。
import { describe, expect, it, vi } from 'vitest'
import type { KnowledgeService, SearchHit, SearchQuery } from '@dsh-forge/contracts'
import { createSearchTool, parseSearchArgs } from './search.js'
import { createProjectResolver } from './session.js'

/** 命中夹具（contracts SearchHit 全六字段——摘要先行） */
function hit(over: Partial<SearchHit> = {}): SearchHit {
  return { entryId: 7, frontmatterId: 'kb-001', title: '安全编码规范', summary: '输入校验基线', domainPath: '后端', score: 0.92, ...over }
}

/** 服务桩：记录收到的 query，回预设 hits */
function stubService(hits: SearchHit[] = [hit()]) {
  const calls: SearchQuery[] = []
  const search = vi.fn(async (q: SearchQuery) => {
    calls.push(q)
    return hits
  })
  return { service: { search } as unknown as KnowledgeService, calls }
}

/** 绑定夹具：cwd C:\ws\demo → p-1 */
const deps = (service: KnowledgeService) => ({
  knowledge: service,
  resolveProjectId: createProjectResolver([{ wsPath: 'C:\\ws\\demo', projectId: 'p-1' }]),
})

/** exec 夹具：会话 sess-1 @ C:\ws\demo */
const exec = { agent: { session: { id: 'sess-1', header: { cwd: 'C:\\ws\\demo' } } } }

describe('AC1 参数 schema 与 SearchQuery 同构（去会话解析双键 projectId/sessionId）', () => {
  const tool = createSearchTool(deps(stubService().service))

  it('tool 名 = knowledge.search；参数键集 = domain_prefix/keywords/text/limit（全可选）', () => {
    expect(tool.name).toBe('knowledge.search')
    expect(Object.keys(tool.parameters.properties).sort()).toEqual(['domain_prefix', 'keywords', 'limit', 'text'])
    expect(tool.parameters.required).toBeUndefined()
  })

  it('参数类型映射：string / string[] / string / integer', () => {
    const p = tool.parameters.properties
    expect(p.domain_prefix?.type).toBe('string')
    expect(p.keywords?.type).toBe('array')
    expect(p.keywords?.items?.type).toBe('string')
    expect(p.text?.type).toBe('string')
    expect(p.limit?.type).toBe('integer')
  })
})

describe('parseSearchArgs（执行点防御性收窄）', () => {
  it('合法全参/空对象均通过，键名映射 snake→DTO camel 由 execute 承担', () => {
    expect(parseSearchArgs({})).toEqual({})
    expect(
      parseSearchArgs({ domain_prefix: '后端', keywords: ['api'], text: '网关', limit: 5 }),
    ).toEqual({ domain_prefix: '后端', keywords: ['api'], text: '网关', limit: 5 })
  })

  it('类型违例逐一拒绝（非对象/keywords 非串数组/limit 非正整数）', () => {
    expect(() => parseSearchArgs('x')).toThrow(/must be an object/)
    expect(() => parseSearchArgs({ keywords: ['a', 1] })).toThrow(/keywords/)
    expect(() => parseSearchArgs({ limit: 0 })).toThrow(/limit/)
    expect(() => parseSearchArgs({ limit: 1.5 })).toThrow(/limit/)
    expect(() => parseSearchArgs({ text: 3 })).toThrow(/text/)
  })
})

describe('execute：会话上下文解析 → 服务调用 → DTO 透传', () => {
  it('解析 projectId/sessionId 注入 query，其余参数原样映射（snake→camel）', async () => {
    const { service, calls } = stubService()
    const tool = createSearchTool(deps(service))
    const out = await tool.execute({ domain_prefix: '后端', keywords: ['api'], limit: 3 }, exec)
    expect(calls).toEqual([
      { projectId: 'p-1', sessionId: 'sess-1', domainPrefix: '后端', keywords: ['api'], limit: 3 },
    ])
    // 返回 = contracts SearchHit[]（同构透传，不自定形状）
    expect(out).toEqual([hit()])
  })

  it('未传的可选参数不出现在 query（省略 = 全域）', async () => {
    const { service, calls } = stubService([])
    await createSearchTool(deps(service)).execute({}, exec)
    expect(calls[0]).toEqual({ projectId: 'p-1', sessionId: 'sess-1' })
  })

  it('会话无 cwd / cwd 未绑定项目 → 抛可读错误（不静默空命中）', async () => {
    const { service } = stubService()
    const tool = createSearchTool(deps(service))
    await expect(tool.execute({}, {})).rejects.toThrow(/no session workspace/)
    await expect(tool.execute({}, { agent: { session: { id: 's', header: { cwd: 'C:\\elsewhere' } } } })).rejects.toThrow(/not bound/)
  })

  it('无 agent 上下文（sessionId 空串口径）在 cwd 缺席下同样拒绝——P1 不支持无会话调用', async () => {
    const { service } = stubService()
    await expect(createSearchTool(deps(service)).execute({}, {})).rejects.toBeInstanceOf(Error)
  })
})

describe('output.render（摘要先行投影）', () => {
  it('命中行含域/标题/id/得分/摘要；零命中显式回落指引', () => {
    const { service } = stubService()
    const tool = createSearchTool(deps(service))
    const blocks = tool.output.render({}, [hit(), hit({ entryId: 8, frontmatterId: null, title: '网关', domainPath: '后端/api', score: 0.5 })])
    expect(blocks).toHaveLength(1)
    const text = blocks[0]?.text ?? ''
    expect(text).toContain('[后端] 安全编码规范 (kb-001, score 0.92) — 输入校验基线')
    expect(text).toContain('[后端/api] 网关 (#8, score 0.50)')
    const empty = tool.output.render({}, [])
    expect(empty[0]?.text).toContain('no knowledge entries matched')
    expect(empty[0]?.text).toContain('grep')
  })
})
