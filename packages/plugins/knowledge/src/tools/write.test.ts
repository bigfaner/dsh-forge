// 单测 —— knowledge_write tool（参数防御性收窄 + 描述面/参数 schema 契约锚——
// 交叉评审 Question：tools 层单测缺口补齐）。
import { describe, expect, it, vi } from 'vitest'
import type { KnowledgeService, KnowledgeWriteOutcome } from '../service/types.js'
import { createWriteTool, parseWriteArgs } from './write.js'
import { createProjectResolver } from './session.js'

/** 写入成功回执夹具（最小面） */
function written(over: Record<string, unknown> = {}): KnowledgeWriteOutcome {
  return {
    outcome: 'written',
    id: 'kb-001',
    versionTs: '2026-01-01T00:00:00.000Z',
    filePath: 'C:\\ws\\.knowledge\\kb-001-x.md',
    typeJudged: 'conventions',
    typePending: false,
    mergeSuggestions: [],
    ...over,
  } as KnowledgeWriteOutcome
}

/** 服务桩：记录收到的 query，回预设回执 */
function stubService() {
  const calls: unknown[] = []
  const write = vi.fn(async (q: unknown) => {
    calls.push(q)
    return written()
  })
  return { service: { write } as unknown as KnowledgeService, calls }
}

const deps = (service: KnowledgeService) => ({
  knowledge: service,
  resolveProjectId: createProjectResolver([{ wsPath: 'C:\\ws\\demo', projectId: 'p-1' }]),
})

/** exec 夹具：会话 sess-1 @ C:\ws\demo */
const exec = { agent: { session: { id: 'sess-1', header: { cwd: 'C:\\ws\\demo' } } } }

/** 合法最小载荷（三问全过） */
const validArgs = {
  title: '安全编码规范',
  summary: '输入校验基线',
  keywords: ['security'],
  body: '# 正文',
  'necessity.stable': true,
  'necessity.non_trivial': true,
  'necessity.value': true,
}

describe('描述面：tool 定义与参数 schema 契约锚', () => {
  const tool = createWriteTool(deps(stubService().service))

  it('tool 名 = knowledge_write；必填键含三问平铺三布尔', () => {
    expect(tool.name).toBe('knowledge_write')
    expect(tool.parameters.required).toEqual(['title', 'summary', 'keywords', 'body', 'necessity.stable', 'necessity.non_trivial', 'necessity.value'])
  })

  it('参数键集 = 基本四键 + 可选六键（snake_case agent 面）', () => {
    expect(Object.keys(tool.parameters.properties).sort()).toEqual(
      ['body', 'domain', 'keywords', 'necessity.non_trivial', 'necessity.reason', 'necessity.stable', 'necessity.value', 'procedure', 'slug_hint', 'summary', 'title', 'type', 'version_of'].sort(),
    )
    const p = tool.parameters.properties
    expect(p.title?.type).toBe('string')
    expect(p.keywords?.type).toBe('array')
    expect(p.keywords?.items?.type).toBe('string')
    expect(p.procedure?.type).toBe('boolean')
    expect(p['necessity.stable']?.type).toBe('boolean')
    expect(p.version_of?.type).toBe('string')
  })

  it('描述面披露严契约语义（三问闸 / version_of 版本化 / 查重不拒收）', () => {
    expect(tool.description).toContain('necessity gate')
    expect(tool.description).toContain('version_of')
    expect(tool.description).toContain('merge suggestions')
  })
})

describe('parseWriteArgs（执行点防御性收窄）', () => {
  it('合法最小载荷通过：三问平铺三布尔聚合为 NecessityAnswers', () => {
    const out = parseWriteArgs(validArgs)
    expect(out.necessity).toEqual({ stable: true, nonTrivial: true, value: true })
    expect(out.title).toBe('安全编码规范')
    expect(out.keywords).toEqual(['security'])
  })

  it('necessity.reason 可选随行；procedure 仅 true 显式携带', () => {
    const out = parseWriteArgs({ ...validArgs, 'necessity.reason': '判据', procedure: true })
    expect(out.necessity.reason).toBe('判据')
    expect(out.procedure).toBe(true)
    const noProc = parseWriteArgs(validArgs)
    expect(noProc.procedure).toBeUndefined()
  })

  it('类型违例逐一拒绝（非对象 / 三问缺答 / keywords 非串数组 / title 空 / 可选键类型不符）', () => {
    expect(() => parseWriteArgs('x')).toThrow(/must be an object/)
    expect(() => parseWriteArgs({ ...validArgs, 'necessity.stable': 'yes' })).toThrow(/necessity/)
    expect(() => parseWriteArgs({ ...validArgs, 'necessity.value': undefined })).toThrow(/necessity/)
    expect(() => parseWriteArgs({ ...validArgs, keywords: 'security' })).toThrow(/keywords/)
    expect(() => parseWriteArgs({ ...validArgs, keywords: ['a', 1] })).toThrow(/keywords/)
    expect(() => parseWriteArgs({ ...validArgs, title: '  ' })).toThrow(/title/)
    expect(() => parseWriteArgs({ ...validArgs, body: '' })).toThrow(/body/)
    expect(() => parseWriteArgs({ ...validArgs, domain: 3 })).toThrow(/domain/)
    expect(() => parseWriteArgs({ ...validArgs, version_of: 7 })).toThrow(/version_of/)
    expect(() => parseWriteArgs({ ...validArgs, procedure: 'yes' })).toThrow(/procedure/)
  })
})

describe('execute：会话上下文解析 → 服务调用 → snake→camel 映射', () => {
  it('projectId/sessionId 注入 + slug_hint/version_of camel 化透传', async () => {
    const { service, calls } = stubService()
    const tool = createWriteTool(deps(service))
    const out = await tool.execute({ ...validArgs, slug_hint: 'secure-coding', version_of: 'kb-000' }, exec)
    expect(out).toEqual(written())
    expect(calls).toEqual([
      {
        projectId: 'p-1',
        sessionId: 'sess-1',
        title: '安全编码规范',
        summary: '输入校验基线',
        keywords: ['security'],
        body: '# 正文',
        slugHint: 'secure-coding',
        versionOf: 'kb-000',
        necessity: { stable: true, nonTrivial: true, value: true },
      },
    ])
  })
})
