// 3.4 单测 —— knowledge.read-abstract tool（AC1：与 readAbstract 同构；
// 场景⑤口径：返回不含正文；AC4 前置：会话解析 → 服务调用透传）。
import { describe, expect, it, vi } from 'vitest'
import type { EntryAbstract, KnowledgeService, ReadAbstractQuery } from '@dsh-forge/contracts'
import { createReadAbstractTool, parseReadAbstractArgs } from './read-abstract.js'
import { createProjectResolver } from './session.js'

const abstract: EntryAbstract = {
  entryId: 7,
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
  return { service: { readAbstract } as unknown as KnowledgeService, calls }
}

const deps = (service: KnowledgeService) => ({
  knowledge: service,
  resolveProjectId: createProjectResolver([{ wsPath: 'C:\\ws\\demo', projectId: 'p-1' }]),
})
const exec = { agent: { session: { id: 'sess-1', header: { cwd: 'C:\\ws\\demo' } } } }

describe('AC1 参数 schema 与 ReadAbstractQuery 同构（仅 entry_id，必填）', () => {
  const tool = createReadAbstractTool(deps(stubService().service))

  it('tool 名 = knowledge.read-abstract；参数 = entry_id（integer，required）', () => {
    expect(tool.name).toBe('knowledge.read-abstract')
    expect(Object.keys(tool.parameters.properties)).toEqual(['entry_id'])
    expect(tool.parameters.properties.entry_id?.type).toBe('integer')
    expect(tool.parameters.required).toEqual(['entry_id'])
  })
})

describe('parseReadAbstractArgs', () => {
  it('整数 entry_id 通过；非整数/缺失/非对象拒绝', () => {
    expect(parseReadAbstractArgs({ entry_id: 7 })).toEqual({ entry_id: 7 })
    expect(() => parseReadAbstractArgs({})).toThrow(/entry_id/)
    expect(() => parseReadAbstractArgs({ entry_id: '7' })).toThrow(/entry_id/)
    expect(() => parseReadAbstractArgs(3)).toThrow(/must be an object/)
  })
})

describe('execute：会话解析 → readAbstract → EntryAbstract 透传', () => {
  it('query 注入 projectId/sessionId + entryId；返回 contracts DTO', async () => {
    const { service, calls } = stubService()
    const out = await createReadAbstractTool(deps(service)).execute({ entry_id: 7 }, exec)
    expect(calls).toEqual([{ projectId: 'p-1', sessionId: 'sess-1', entryId: 7 }])
    expect(out).toEqual(abstract)
  })

  it('未绑定/无 cwd → 抛可读错误（同 search 口径）', async () => {
    const tool = createReadAbstractTool(deps(stubService().service))
    await expect(tool.execute({ entry_id: 7 }, {})).rejects.toThrow(/no session workspace/)
    await expect(
      tool.execute({ entry_id: 7 }, { agent: { session: { id: 's', header: { cwd: 'C:\\x' } } } }),
    ).rejects.toThrow(/not bound/)
  })
})

describe('output.render（摘要块 + 元数据；正文永不出现）', () => {
  it('渲染 title/summary/domain/keywords/status 且无 body 字段位', () => {
    const tool = createReadAbstractTool(deps(stubService().service))
    const blocks = tool.output.render({ entry_id: 7 }, abstract)
    expect(blocks).toHaveLength(1)
    const text = blocks[0]?.text ?? ''
    expect(text).toContain('# 安全编码规范')
    expect(text).toContain('服务端输入校验与输出编码基线')
    expect(text).toContain('domain: 后端')
    expect(text).toContain('keywords: security, backend')
    expect(text).toContain('status: published')
    expect(text).not.toContain('body')
  })
})
