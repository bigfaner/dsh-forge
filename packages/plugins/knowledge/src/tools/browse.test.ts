// knowledge-browse-tool 1.1 单测 —— knowledge_browse tool：depth 封顶 / keyword 过滤
//（域路径段 + 简介子串不区分大小写，子域随前缀连带保留）/ 零命中诚实空回 / 简介渲染
//（NULL → 无简介）/ 路径字典序 / 零召回写入断言（工作面动词不触 recall 写法）。
import { describe, expect, it, vi } from 'vitest'
import type { KnowledgeService } from '../service/types.js'
import type { DomainBrowseRow } from '../service/types.js'
import { createBrowseTool, filterDomainRows, parseBrowseArgs } from './browse.js'
import { createProjectResolver } from './session.js'

/** 域行夹具（DomainBrowseRow 四字段） */
function row(domainPath: string, entryCount = 1, description: string | null = null): DomainBrowseRow {
  return { domainPath, depth: domainPath.split('/').length, entryCount, description }
}

/** 服务桩：记录收到的 query（只暴露 browseDomains——零召回写入断言的桩面） */
function stubService(rows: DomainBrowseRow[]) {
  const calls: { projectId: string }[] = []
  const browseDomains = vi.fn(async (q: { projectId: string }) => {
    calls.push(q)
    return rows
  })
  // search/readAbstract 若被触即炸（工作面动词零召回写入——断言工具面只走 browseDomains）
  const service = {
    browseDomains,
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

/** 夹具行集（conventions 工程纪律 25 + conventions/testing 4 + testing/unit 1 +
 *  lessons/windows 12 + facts 3——覆盖 depth 1..3 三层） */
const fixture = (): DomainBrowseRow[] => [
  row('conventions', 25, '工程纪律'),
  row('conventions/testing', 4, '测试分层'),
  row('conventions/testing/unit', 1, null),
  row('facts', 3, null),
  row('lessons', 12, null),
  row('lessons/windows', 12, 'Windows 平台教训'),
]

describe('AC1 参数 schema 与 parseBrowseArgs（执行点防御性收窄）', () => {
  const tool = createBrowseTool(deps(stubService([]).service))

  it('tool 名 = knowledge_browse；参数键集 = depth/keyword（全可选）', () => {
    expect(tool.name).toBe('knowledge_browse')
    expect(Object.keys(tool.parameters.properties).sort()).toEqual(['depth', 'keyword'])
    expect(tool.parameters.required).toBeUndefined()
  })

  it('depth/keyword 类型映射：integer / string', () => {
    const p = tool.parameters.properties
    expect(p.depth?.type).toBe('integer')
    expect(p.keyword?.type).toBe('string')
  })

  it('合法全参/空对象均通过', () => {
    expect(parseBrowseArgs({})).toEqual({})
    expect(parseBrowseArgs({ depth: 1, keyword: 'api' })).toEqual({ depth: 1, keyword: 'api' })
  })

  it('类型违例逐一拒绝（非对象 / depth 非 1..3 整数 / keyword 非串）', () => {
    expect(() => parseBrowseArgs('x')).toThrow(/must be an object/)
    expect(() => parseBrowseArgs({ depth: 0 })).toThrow(/depth/)
    expect(() => parseBrowseArgs({ depth: 4 })).toThrow(/depth/)
    expect(() => parseBrowseArgs({ depth: 1.5 })).toThrow(/depth/)
    expect(() => parseBrowseArgs({ keyword: 3 })).toThrow(/keyword/)
  })
})

describe('AC1 depth 封顶与 keyword 过滤（filterDomainRows 纯函数）', () => {
  it('depth=1 只出顶域；depth=2/3 逐层封顶；缺省（undefined）= 封顶 3 全目录', () => {
    const rows = fixture()
    expect(filterDomainRows(rows, 1, undefined).map((r) => r.domainPath).sort()).toEqual(['conventions', 'facts', 'lessons'])
    expect(filterDomainRows(rows, 2, undefined)).toHaveLength(5)
    expect(filterDomainRows(rows, 3, undefined)).toHaveLength(6)
    expect(filterDomainRows(rows, undefined, undefined)).toHaveLength(6)
  })

  it('keyword 域路径段命中（不区分大小写），命中域与其子域保留', () => {
    const kept = filterDomainRows(fixture(), undefined, 'CONVENTIONS')
    expect(kept.map((r) => r.domainPath).sort()).toEqual(['conventions', 'conventions/testing', 'conventions/testing/unit'])
  })

  it('keyword 域简介子串命中（不区分大小写），命中域保留（子域随前缀连带；父域不连带）', () => {
    const kept = filterDomainRows(fixture(), undefined, 'windows 平台')
    expect(kept.map((r) => r.domainPath)).toEqual(['lessons/windows'])
  })

  it('零命中诚实空回（空数组，零兜底）', () => {
    expect(filterDomainRows(fixture(), undefined, 'no-such-thing')).toEqual([])
  })

  it('keyword 空白串视同无过滤（全目录返回）', () => {
    expect(filterDomainRows(fixture(), undefined, '  ')).toHaveLength(6)
  })
})

describe('AC1 execute：会话解析 → browseDomains → 过滤 + 字典序', () => {
  it('解析 projectId 注入查询，输出按域路径字典序重排', async () => {
    const { service, calls } = stubService(fixture())
    const out = await createBrowseTool(deps(service)).execute({}, exec)
    expect(calls).toEqual([{ projectId: 'p-1' }])
    expect(out.map((r) => r.domainPath)).toEqual([
      'conventions',
      'conventions/testing',
      'conventions/testing/unit',
      'facts',
      'lessons',
      'lessons/windows',
    ])
  })

  it('depth/keyword 透传过滤（snake→工具内消费，不落服务查询）', async () => {
    const { service, calls } = stubService(fixture())
    const out = await createBrowseTool(deps(service)).execute({ depth: 2, keyword: 'testing' }, exec)
    expect(calls).toEqual([{ projectId: 'p-1' }])
    expect(out.map((r) => r.domainPath)).toEqual(['conventions/testing'])
  })

  it('未绑定会话拒绝（无 cwd / cwd 未绑定项目）', async () => {
    const { service } = stubService([])
    const tool = createBrowseTool(deps(service))
    await expect(tool.execute({}, {})).rejects.toThrow(/no session workspace/)
    await expect(tool.execute({}, { agent: { session: { id: 's', header: { cwd: 'C:\\elsewhere' } } } })).rejects.toThrow(/not bound/)
  })
})

describe('AC1/AC4 output.render：简介渲染 + 零命中诚实空回', () => {
  const tool = createBrowseTool(deps(stubService([]).service))

  it('输出行「域路径（N 条）— 简介」；简介 NULL → 无简介', () => {
    const blocks = tool.output.render({}, [row('conventions', 25, '工程纪律'), row('facts', 3, null)])
    const text = blocks[0]?.text ?? ''
    expect(text).toContain('conventions（25 条）— 工程纪律')
    expect(text).toContain('facts（3 条）— 无简介')
  })

  it('零命中诚实空回：回显过滤条件 + 未命中明示 + 零兜底', () => {
    const empty = tool.output.render({ depth: 1, keyword: 'zzz' }, [])
    const text = empty[0]?.text ?? ''
    expect(text).toContain('No domains matched')
    expect(text).toContain('depth=1')
    expect(text).toContain('keyword="zzz"')
    expect(text).toContain('zero hits')
    expect(text).not.toMatch(/try|suggest|such as grep/i)
    const bare = tool.output.render({}, [])
    expect(bare[0]?.text).toContain('no filters (all domains)')
  })
})
