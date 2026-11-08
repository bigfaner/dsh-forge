// 3.4 单测 —— knowledge_read_abstract tool（AC1：与 readAbstract 同构；slug 键——与
// knowledge_read 同键，全工具身份面统一；场景⑤口径：返回不含正文；会话解析 → 服务调用透传）。
import { describe, expect, it, vi } from 'vitest'
import type { EntryAbstract, KnowledgeService, ReadAbstractQuery } from '../service/types.js'
import { createReadAbstractTool, parseReadAbstractArgs } from './read-abstract.js'
import { createProjectResolver } from './session.js'

const abstract: EntryAbstract = {
  entryId: 7,
  frontmatterId: 'kb-001',
  title: '安全编码规范',
  summary: '服务端输入校验与输出编码基线',
  keywords: ['security', 'backend'],
  status: 'published',
  domainPath: '后端',
}

function stubService() {
  const calls: ReadAbstractQuery[] = []
  const readAbstract = vi.fn(async (q: ReadAbstractQuery) => {
    calls.push(q)
    return abstract
  })
  return {
    service: { readAbstract } as unknown as KnowledgeService,
    calls,
  }
}

const deps = (service: KnowledgeService) => ({
  knowledge: service,
  resolveProjectId: createProjectResolver([{ wsPath: 'C:\\ws\\demo', projectId: 'p-1' }]),
})

const exec = { agent: { session: { id: 'sess-1', header: { cwd: 'C:\\ws\\demo' } } } }

describe('AC1 参数 schema 与 ReadAbstractQuery 同构（仅 id，必填）', () => {
  const tool = createReadAbstractTool(deps(stubService().service))

  it('tool 名 = knowledge_read_abstract；参数键集 = id（string，required）', () => {
    expect(tool.name).toBe('knowledge_read_abstract')
    expect(Object.keys(tool.parameters.properties)).toEqual(['id'])
    expect(tool.parameters.required).toEqual(['id'])
    expect(tool.parameters.properties.id?.type).toBe('string')
  })
})

describe('parseReadAbstractArgs（执行点防御性收窄）', () => {
  it('非空字符串 id 通过', () => {
    expect(parseReadAbstractArgs({ id: 'kb-001' })).toEqual({ id: 'kb-001' })
  })

  it('类型违例拒绝（非对象/id 缺失/空串/非串）', () => {
    expect(() => parseReadAbstractArgs('x')).toThrow(/must be an object/)
    expect(() => parseReadAbstractArgs({})).toThrow(/id must be a non-empty string/)
    expect(() => parseReadAbstractArgs({ id: '' })).toThrow(/id must be a non-empty string/)
    expect(() => parseReadAbstractArgs({ id: 7 })).toThrow(/id must be a non-empty string/)
  })
})

describe('execute：会话上下文解析 → 服务调用 → DTO 透传', () => {
  it('解析 projectId/sessionId 注入 query，id 原样透传', async () => {
    const { service, calls } = stubService()
    const out = await createReadAbstractTool(deps(service)).execute({ id: 'kb-001' }, exec)
    expect(calls).toEqual([{ projectId: 'p-1', sessionId: 'sess-1', id: 'kb-001' }])
    expect(out).toEqual(abstract)
  })

  it('会话无 cwd / cwd 未绑定项目 → 抛可读错误（不静默）', async () => {
    const { service } = stubService()
    const tool = createReadAbstractTool(deps(service))
    await expect(tool.execute({ id: 'kb-001' }, {})).rejects.toThrow(/no session workspace/)
    await expect(tool.execute({ id: 'kb-001' }, { agent: { session: { id: 's', header: { cwd: 'C:\\elsewhere' } } } })).rejects.toThrow(/not bound/)
  })
})

describe('output.render（摘要块 + 元数据，正文永不出现）', () => {
  it('标题带 slug、域/keywords/status 齐备', () => {
    const { service } = stubService()
    const tool = createReadAbstractTool(deps(service))
    const blocks = tool.output.render({}, abstract)
    const text = blocks[0]?.text ?? ''
    expect(text).toContain('# 安全编码规范 (kb-001)')
    expect(text).toContain('- domain: 后端')
    expect(text).toContain('- keywords: security, backend')
    expect(text).toContain('- status: published')
  })
})
