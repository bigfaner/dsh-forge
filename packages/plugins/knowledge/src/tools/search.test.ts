// 3.4 单测 —— knowledge_search tool（agentic search 编排层：全域检索 → rerank 前
// limit 条 → 零命中弃域重试一次 → hint 单条动作指引（retry 语义：首查可换词重试一次，
// retry=true 仍零命中则明示不要再检索）；执行链 = 会话解析 → 编排调用）。
// stage④ 1.4：keywords 调用参数退役——schema 键集收敛 domain_prefix/text/limit/retry。
import { describe, expect, it, vi } from 'vitest'
import type { KnowledgeService, SearchHit, SearchQuery } from '../service/types.js'
import { createSearchTool, parseSearchArgs } from './search.js'
import type { SearchOutcome } from './search.js'
import { createProjectResolver } from './session.js'

/** 命中夹具（SearchHit 七字段——摘要先行 + 四档 rank） */
function hit(over: Partial<SearchHit> = {}): SearchHit {
  return { entryId: 7, frontmatterId: 'kb-001', title: '安全编码规范', summary: '输入校验基线', domainPath: '后端', score: 0.92, effectiveRank: 1.0, ...over }
}

/** 服务桩：按调用序回放预设命中批（脚本队列，越界回空）；hint 回填面记账 */
function stubService(script: SearchHit[][] = [[hit()]]) {
  const calls: SearchQuery[] = []
  const search = vi.fn(async (q: SearchQuery) => {
    calls.push(q)
    return script[Math.min(calls.length - 1, script.length - 1)] ?? []
  })
  const annotateSearchHint = vi.fn()
  return { service: { search, annotateSearchHint } as unknown as KnowledgeService, calls, annotateSearchHint }
}

/** 绑定夹具：cwd C:\ws\demo → p-1 */
const deps = (service: KnowledgeService) => ({
  knowledge: service,
  resolveProjectId: createProjectResolver([{ wsPath: 'C:\\ws\\demo', projectId: 'p-1' }]),
})

/** exec 夹具：会话 sess-1 @ C:\ws\demo */
const exec = { agent: { session: { id: 'sess-1', header: { cwd: 'C:\\ws\\demo' } } } }

describe('AC1 参数 schema 键集（domain_prefix/text/limit/retry，全可选——keywords 退役）', () => {
  const tool = createSearchTool(deps(stubService().service))

  it('tool 名 = knowledge_search；参数键集与类型映射；keywords 键不在集（退役断言）', () => {
    expect(tool.name).toBe('knowledge_search')
    expect(Object.keys(tool.parameters.properties).sort()).toEqual(['domain_prefix', 'limit', 'retry', 'text'])
    expect(Object.keys(tool.parameters.properties)).not.toContain('keywords')
    expect(tool.parameters.required).toBeUndefined()
    const p = tool.parameters.properties
    expect(p.domain_prefix?.type).toBe('string')
    expect(p.text?.type).toBe('string')
    expect(p.limit?.type).toBe('integer')
    expect(p.retry?.type).toBe('boolean')
  })
})

describe('parseSearchArgs（执行点防御性收窄）', () => {
  it('合法全参/空对象均通过', () => {
    expect(parseSearchArgs({})).toEqual({})
    expect(
      parseSearchArgs({ domain_prefix: '后端', text: '网关', limit: 5, retry: true }),
    ).toEqual({ domain_prefix: '后端', text: '网关', limit: 5, retry: true })
  })

  it('keywords 退役参数被忽略（透传不产键——调用方残留不炸）', () => {
    expect(parseSearchArgs({ keywords: ['api'] })).toEqual({})
  })

  it('类型违例逐一拒绝（非对象/limit 非正整数/retry 非布尔）', () => {
    expect(() => parseSearchArgs('x')).toThrow(/must be an object/)
    expect(() => parseSearchArgs({ limit: 0 })).toThrow(/limit/)
    expect(() => parseSearchArgs({ limit: 1.5 })).toThrow(/limit/)
    expect(() => parseSearchArgs({ text: 3 })).toThrow(/text/)
    expect(() => parseSearchArgs({ retry: 'yes' })).toThrow(/retry/)
  })
})

describe('execute：全域检索 → rerank 精选（agentic 编排）', () => {
  it('单 query 直传（text 词面 + 域前缀 + limit 恒携带缺省 3——服务面截断与落账同源）', async () => {
    const { service, calls } = stubService([[hit({ entryId: 1, score: 0.5 })]])
    const tool = createSearchTool(deps(service))
    const out = (await tool.execute({ domain_prefix: '后端', text: '网关' }, exec)) as SearchOutcome
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({ projectId: 'p-1', sessionId: 'sess-1', callId: expect.any(String), text: '网关', domainPrefix: '后端', limit: 3 })
    expect(out.hits).toEqual([hit({ entryId: 1, score: 0.5 })])
    expect(out.hint).toBeNull()
  })

  it('limit 显式传参透传服务面 query（弃域重试同 call 同 limit）', async () => {
    const { service, calls } = stubService([[], [hit({ entryId: 9 })]])
    const tool = createSearchTool(deps(service))
    await tool.execute({ domain_prefix: '后端', limit: 5 }, exec)
    expect(calls[0]?.limit).toBe(5)
    expect(calls[1]?.limit).toBe(5)
    expect(calls[0]?.callId).toBe(calls[1]?.callId)
  })

  it('rerank 截前 limit 条（默认 3；limit 显式传参生效）', async () => {
    const batch = [1, 2, 3, 4, 5].map((id) => hit({ entryId: id, score: id }))
    const { service } = stubService([batch])
    const out = (await createSearchTool(deps(service)).execute({}, exec)) as SearchOutcome
    expect(out.hits).toHaveLength(3)
    expect(out.hits.map((h) => h.score)).toEqual([5, 4, 3])
    const { service: s2 } = stubService([batch])
    const out2 = (await createSearchTool(deps(s2)).execute({ limit: 4 }, exec)) as SearchOutcome
    expect(out2.hits).toHaveLength(4)
  })

  it('零命中 + 指定了域 → 弃域重试一次（第二批 query 无 domainPrefix），命中后 hint 注明弃域', async () => {
    const { service, calls } = stubService([[], [hit({ entryId: 9 })]])
    const tool = createSearchTool(deps(service))
    const out = (await tool.execute({ domain_prefix: '后端' }, exec)) as SearchOutcome
    expect(calls).toHaveLength(2)
    expect(calls[1]?.domainPrefix).toBeUndefined()
    expect(out.hits).toHaveLength(1)
    expect(typeof out.hint).toBe('string')
    expect(out.hint).toContain('was dropped after zero hits')
    expect(out.hint).toContain('all domains')
  })

  it('首查零命中（含弃域后仍零）→ hint 提示可换词重试一次（retry=true）', async () => {
    const { service } = stubService([[], []])
    const out = (await createSearchTool(deps(service)).execute({ domain_prefix: '后端' }, exec)) as SearchOutcome
    // hint 单条承载弃域事实 + 动作指引
    expect(out.hint).toContain('was dropped after zero hits')
    expect(out.hint).toContain('You may reword once and retry with retry=true')
    const { service: s2 } = stubService([[]])
    const out2 = (await createSearchTool(deps(s2)).execute({}, exec)) as SearchOutcome
    expect(out2.hint).toBe('zero hits. You may reword once and retry with retry=true.')
  })

  it('retry=true 仍零命中 → hint 明示不要再检索（断言无此内容、回退原始文件）', async () => {
    const { service } = stubService([[]])
    const out = (await createSearchTool(deps(service)).execute({ retry: true }, exec)) as SearchOutcome
    expect(out.hits).toEqual([])
    expect(out.hint).toContain('do not search again')
    expect(out.hint).toContain('no such content')
  })

  it('零命中但未指定域 → 不弃域重试（单批）；text 直传供数', async () => {
    const { service, calls } = stubService([[]])
    const tool = createSearchTool(deps(service))
    await tool.execute({ text: '原子幂等' }, exec)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.text).toBe('原子幂等')
  })

  it('会话无 cwd / cwd 未绑定项目 → 抛可读错误（不静默空命中）', async () => {
    const { service } = stubService()
    const tool = createSearchTool(deps(service))
    await expect(tool.execute({}, {})).rejects.toThrow(/no session workspace/)
    await expect(tool.execute({}, { agent: { session: { id: 's', header: { cwd: 'C:\\elsewhere' } } } })).rejects.toThrow(/not bound/)
  })
})

describe('output.render（hint 行在前 + 摘要先行命中行）', () => {
  it('hint 行在前（hint: 前缀），命中行含域/标题/slug id/得分/摘要（slug 恒在场——无 #N 伪装形态）', () => {
    const { service } = stubService()
    const tool = createSearchTool(deps(service))
    const outcome = {
      hint: 'domain "后端" was dropped after zero hits; retried across all domains — 1 hit(s) found.',
      hits: [hit(), hit({ entryId: 8, frontmatterId: 'kb-002', title: '网关', domainPath: '后端/api', score: 0.5, effectiveRank: 0.6 })],
    }
    const blocks = tool.output.render({}, outcome)
    const text = blocks[0]?.text ?? ''
    expect(text.indexOf('hint: domain')).toBeLessThan(text.indexOf('[后端] 安全编码规范'))
    expect(text).toContain('[后端] 安全编码规范 (kb-001, score 0.92, rank 1.0) — 输入校验基线')
    expect(text).toContain('[后端/api] 网关 (kb-002, score 0.50, rank 0.6)')
    expect(text).not.toContain('#')
  })

  it('零命中且无 hint → 诚实空回执（回显 + zero hits + 零兜底）；有 hint → 回显跟在 hint 后', () => {
    const { service } = stubService()
    const tool = createSearchTool(deps(service))
    const empty = tool.output.render({ domain_prefix: '后端', text: '原子幂等', limit: 5 }, { hint: null, hits: [] })
    const emptyText = empty[0]?.text ?? ''
    expect(emptyText).toContain('No knowledge entries matched')
    expect(emptyText).toContain('domain_prefix="后端"')
    expect(emptyText).toContain('text="原子幂等"')
    expect(emptyText).toContain('zero hits')
    expect(emptyText).not.toMatch(/try|suggest|such as grep/i)
    const guided = tool.output.render({ text: '原子幂等' }, { hint: 'zero hits. You may reword once and retry with retry=true.', hits: [] })
    const guidedText = guided[0]?.text ?? ''
    expect(guidedText).toContain('hint: zero hits')
    expect(guidedText).toContain('Query: text="原子幂等"')
    expect(guidedText).not.toContain('No knowledge entries matched')
  })
})
