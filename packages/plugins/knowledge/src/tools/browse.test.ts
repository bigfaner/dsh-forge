// knowledge-browse-tool 1.3 单测 —— knowledge_browse tool：domain 必填（域内条目清单，
// 域目录树已由动态域索引段每 turn 注入系统提示词——树查询形态退役）/ confirmed 优先默认
// 序参数透传 / offset+limit 分页 / 零命中诚实空回 / 零召回写入断言。
import { describe, expect, it, vi } from 'vitest'
import type { BrowseEntryItem, KnowledgeService } from '../service/types.js'
import { createBrowseTool, parseBrowseArgs } from './browse.js'
import { createProjectResolver } from './session.js'

/** 条目夹具（BrowseEntryItem 六字段——身份键 slug） */
function entry(over: Partial<BrowseEntryItem> = {}): BrowseEntryItem {
  return { frontmatterId: 'kb-001', title: '安全编码规范', summary: '输入校验基线', keywords: ['api', 'security'], status: 'confirmed', domainPath: 'lessons', ...over }
}

/** 服务桩：记录收到的 query，回预设条目批（search/readAbstract 若被触即炸——零召回写入） */
function stubService(items: BrowseEntryItem[] = [entry()]) {
  const calls: { projectId: string; domain: string; offset?: number; limit?: number; order?: string }[] = []
  const browseEntries = vi.fn(async (q: { projectId: string; domain: string }) => {
    calls.push(q)
    return items
  })
  const service = {
    browseEntries,
    search: () => {
      throw new Error('recall verb must not be invoked by knowledge_browse')
    },
    readAbstract: () => {
      throw new Error('recall verb must not be invoked by knowledge_browse')
    },
  } as unknown as KnowledgeService
  return { service, calls }
}

/** 绑定夹具：cwd C:\ws\demo → p-1（search 同款） */
const deps = (service: KnowledgeService) => ({
  knowledge: service,
  resolveProjectId: createProjectResolver([{ wsPath: 'C:\\ws\\demo', projectId: 'p-1' }]),
})

/** exec 夹具：会话 sess-1 @ C:\ws\demo */
const exec = { agent: { session: { id: 'sess-1', header: { cwd: 'C:\\ws\\demo' } } } }

describe('AC1 参数 schema 与 parseBrowseArgs（执行点防御性收窄）', () => {
  const tool = createBrowseTool(deps(stubService().service))

  it('tool 名 = knowledge_browse；参数键集 = domain/limit/offset/order；domain 必填', () => {
    expect(tool.name).toBe('knowledge_browse')
    expect(Object.keys(tool.parameters.properties).sort()).toEqual(['domain', 'limit', 'offset', 'order'])
    expect(tool.parameters.required).toEqual(['domain'])
    expect(tool.parameters.properties.domain?.type).toBe('string')
    expect(tool.parameters.properties.offset?.type).toBe('integer')
    expect(tool.parameters.properties.limit?.type).toBe('integer')
    expect(tool.parameters.properties.order?.type).toBe('string')
  })

  it('合法全参/仅 domain 均通过', () => {
    expect(parseBrowseArgs({ domain: 'lessons/windows', offset: 5, limit: 10, order: 'created' })).toEqual({
      domain: 'lessons/windows',
      offset: 5,
      limit: 10,
      order: 'created',
    })
    expect(parseBrowseArgs({ domain: 'lessons' })).toEqual({ domain: 'lessons' })
  })

  it('类型违例逐一拒绝（非对象 / domain 缺失/空串/非串 / offset 负 / limit 越界 / order 非法）', () => {
    expect(() => parseBrowseArgs('x')).toThrow(/must be an object/)
    expect(() => parseBrowseArgs({})).toThrow(/domain must be a non-empty string/)
    expect(() => parseBrowseArgs({ domain: '' })).toThrow(/domain must be a non-empty string/)
    expect(() => parseBrowseArgs({ domain: 3 })).toThrow(/domain must be a non-empty string/)
    expect(() => parseBrowseArgs({ domain: 'lessons', offset: -1 })).toThrow(/offset/)
    expect(() => parseBrowseArgs({ domain: 'lessons', limit: 0 })).toThrow(/limit/)
    expect(() => parseBrowseArgs({ domain: 'lessons', limit: 51 })).toThrow(/limit/)
    expect(() => parseBrowseArgs({ domain: 'lessons', order: 'relevance' })).toThrow(/order/)
  })
})

describe('execute：会话解析 → browseEntries 透传（slug 身份键在场）', () => {
  it('domain/分页/排序参数透传 browseEntries（缺省键省略——服务端默认 offset 0 / limit 5 / order status）', async () => {
    const { service, calls } = stubService()
    const tool = createBrowseTool(deps(service))
    const out = (await tool.execute({ domain: 'lessons/windows', offset: 5, limit: 10, order: 'created' }, exec)) as readonly BrowseEntryItem[]
    expect(calls).toEqual([{ projectId: 'p-1', sessionId: 'sess-1', domain: 'lessons/windows', offset: 5, limit: 10, order: 'created' }])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ frontmatterId: 'kb-001', title: '安全编码规范', status: 'confirmed' })
    const { service: s2, calls: c2 } = stubService()
    await createBrowseTool(deps(s2)).execute({ domain: 'lessons' }, exec)
    expect(c2).toEqual([{ projectId: 'p-1', sessionId: 'sess-1', domain: 'lessons' }])
  })

  it('未绑定会话拒绝（无 cwd / cwd 未绑定项目）', async () => {
    const { service } = stubService()
    const tool = createBrowseTool(deps(service))
    await expect(tool.execute({ domain: 'lessons' }, {})).rejects.toThrow(/no session workspace/)
    await expect(tool.execute({ domain: 'lessons' }, { agent: { session: { id: 's', header: { cwd: 'C:\\elsewhere' } } } })).rejects.toThrow(/not bound/)
  })
})

describe('output.render：条目清单渲染 + 零命中诚实空回', () => {
  const tool = createBrowseTool(deps(stubService().service))

  it('输出行「(slug) 标题 [状态] — 摘要｜keywords: …」；keywords 空不带段', () => {
    const blocks = tool.output.render({ domain: 'lessons' }, [entry(), entry({ frontmatterId: 'kb-002', title: '无键条目', keywords: [] })])
    const text = blocks[0]?.text ?? ''
    expect(text).toContain('(kb-001) 安全编码规范 [confirmed] — 输入校验基线｜keywords: api, security')
    expect(text).toContain('(kb-002) 无键条目 [confirmed] — 输入校验基线')
    expect(text.split('\n').filter((l) => l.includes('kb-002')).every((l) => !l.includes('keywords:'))).toBe(true)
  })

  it('零命中诚实空回：回显过滤条件 + 未命中明示 + 零兜底', () => {
    const empty = tool.output.render({ domain: 'lessons', order: 'created' }, [])
    const text = empty[0]?.text ?? ''
    expect(text).toContain('No entries matched')
    expect(text).toContain('domain="lessons"')
    expect(text).toContain('order="created"')
    expect(text).toContain('zero hits')
    expect(text).not.toMatch(/try|suggest|such as grep/i)
  })
})
