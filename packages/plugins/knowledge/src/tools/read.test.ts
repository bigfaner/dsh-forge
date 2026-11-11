// 单测 —— knowledge_read tool（参数防御性收窄 + 描述面/参数 schema 契约锚——
// 交叉评审 Question：tools 层单测缺口补齐）。
import { describe, expect, it, vi } from 'vitest'
import type { KnowledgeReadOutcome, KnowledgeService } from '../service/types.js'
import { createReadTool, parseReadArgs } from './read.js'
import { createProjectResolver } from './session.js'

/** 服务桩：记录收到的 query，回预设回执 */
function stubService(outcome: KnowledgeReadOutcome = { outcome: 'denied', message: 'denied' }) {
  const calls: unknown[] = []
  const read = vi.fn(async (q: unknown) => {
    calls.push(q)
    return outcome
  })
  return { service: { read } as unknown as KnowledgeService, calls }
}

const deps = (service: KnowledgeService) => ({
  knowledge: service,
  resolveProjectId: createProjectResolver([{ wsPath: 'C:\\ws\\demo', projectId: 'p-1' }]),
})

/** exec 夹具：会话 sess-1 @ C:\ws\demo */
const exec = { agent: { session: { id: 'sess-1', header: { cwd: 'C:\\ws\\demo' } } } }

describe('描述面：tool 定义与参数 schema 契约锚', () => {
  const tool = createReadTool(deps(stubService().service))

  it('tool 名 = knowledge_read；唯一参数 id 必填', () => {
    expect(tool.name).toBe('knowledge_read')
    expect(Object.keys(tool.parameters.properties)).toEqual(['id'])
    expect(tool.parameters.properties.id?.type).toBe('string')
    expect(tool.parameters.required).toEqual(['id'])
  })

  it('描述面披露准入语义（confirmed/unconfirmed/superseded 曾审全可读）', () => {
    expect(tool.description).toContain('confirmed')
    expect(tool.description).toContain('unconfirmed')
    expect(tool.description).toContain('all fully readable')
  })
})

describe('parseReadArgs（执行点防御性收窄）', () => {
  it('合法 id 通过', () => {
    expect(parseReadArgs({ id: 'kb-001' })).toEqual({ id: 'kb-001' })
  })

  it('类型违例逐一拒绝（非对象 / id 缺席 / id 非串 / id 空白）', () => {
    expect(() => parseReadArgs('x')).toThrow(/must be an object/)
    expect(() => parseReadArgs({})).toThrow(/id must be a non-empty string/)
    expect(() => parseReadArgs({ id: 7 })).toThrow(/id must be a non-empty string/)
    expect(() => parseReadArgs({ id: '   ' })).toThrow(/id must be a non-empty string/)
  })
})

describe('execute：会话上下文解析 → 服务调用 → 透传', () => {
  it('projectId/sessionId 注入 query，id 原样透传；read 回执全文承载', async () => {
    const full: KnowledgeReadOutcome = {
      outcome: 'read', id: 'kb-001', title: '安全编码规范', status: 'confirmed', versionTs: '2026-01-01T00:00:00.000Z', body: '# 全文',
    }
    const { service, calls } = stubService(full)
    const tool = createReadTool(deps(service))
    const out = await tool.execute({ id: 'kb-001' }, exec)
    expect(calls).toEqual([{ projectId: 'p-1', sessionId: 'sess-1', id: 'kb-001' }])
    expect(out).toEqual(full)
    // render 面：read 全文渲染携带 title/id/status 锚
    const text = tool.output.render({ id: 'kb-001' }, full)
    expect(text[0]?.text).toContain('# 安全编码规范 (kb-001, confirmed,')
    expect(text[0]?.text).toContain('# 全文')
  })

  it('denied 回执渲染 = 通用拒读文案（不露存在性）', () => {
    const tool = createReadTool(deps(stubService().service))
    const denied: KnowledgeReadOutcome = { outcome: 'denied', message: 'knowledge_read denied: entry not found or its source file is not readable' }
    const text = tool.output.render({}, denied)
    expect(text[0]?.text).toBe(denied.message)
  })
})
