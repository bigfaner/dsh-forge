// 3.4 单测 —— forge:knowledge 段渲染（AC2 文本三部分 / AC5 契约内容源渲染单一来源）。
// 单一来源口径：工具名/描述/参数说明机械取自 tool 定义对象（改定义 → 文本跟随，
// 插件不私藏副本）；域层级上限等契约事实取自 contracts 常量。
import { describe, expect, it } from 'vitest'
import { FRONTMATTER_DOMAIN_MAX_DEPTH } from '@dsh-forge/contracts'
import { KNOWLEDGE_SECTION_NAME, KNOWLEDGE_SECTION_ORDER, renderKnowledgeSection } from './index.js'
import { createKnowledgeTools } from '../tools/index.js'
import { createProjectResolver } from '../tools/session.js'
import type { KnowledgeService } from '@dsh-forge/contracts'

const tools = createKnowledgeTools({
  knowledge: {} as KnowledgeService, // 渲染纯消费定义形状，不触服务
  resolveProjectId: createProjectResolver([]),
})

describe('AC2 段常量（Interface 3 定死）', () => {
  it('段名 forge:knowledge / order 500', () => {
    expect(KNOWLEDGE_SECTION_NAME).toBe('forge:knowledge')
    expect(KNOWLEDGE_SECTION_ORDER).toBe(500)
  })
})

describe('renderKnowledgeSection（三部分在场）', () => {
  const text = renderKnowledgeSection(tools)

  it('① 知识库存在声明（知识库 + 摘要先行 + 域分类声明）', () => {
    expect(text).toContain('Project knowledge base')
    expect(text.toLowerCase()).toContain('knowledge base')
    expect(text).toContain('summary-first')
    expect(text).toContain('domain classification')
  })

  it('② agentic search 流程指引（先 search 相应域 / 摘要先行 / 按需 read-abstract / 与 grep、glob 同位编排 + 零命中回落）', () => {
    expect(text).toContain('agentic search')
    expect(text).toContain('domain_prefix yourself')
    expect(text).toContain('omit it to search all domains')
    expect(text).toContain("hit's entry_id")
    expect(text).toContain('alongside grep/glob')
    expect(text).toContain('fall back to regular file retrieval')
  })

  it('③ 两 tool 用法：名称/描述/参数说明均机械取自定义对象', () => {
    expect(text).toContain(tools.search.name)
    expect(text).toContain(tools.search.description)
    expect(text).toContain(tools.readAbstract.name)
    expect(text).toContain(tools.readAbstract.description)
    expect(text).toContain('domain_prefix (string, optional)')
    expect(text).toContain('entry_id (integer, required)')
  })

  it('契约事实取自 contracts 常量（域层级上限插值）', () => {
    expect(text).toContain(`at most ${String(FRONTMATTER_DOMAIN_MAX_DEPTH)} levels`)
  })

  it('段文本禁用裸 {{（SystemPrompt 默认插值，未知引用会炸渲染）', () => {
    expect(text).not.toContain('{{')
  })
})

describe('AC5 单一来源：定义变更 → 文本跟随（无副本语义）', () => {
  it('改写 tool 描述与参数说明后，段文本同步呈现改写值', () => {
    const mutated = createKnowledgeTools({
      knowledge: {} as KnowledgeService,
      resolveProjectId: createProjectResolver([]),
    })
    // 定义对象对外只读（注册面纪律）；本用例以可变视图改写以证渲染无副本
    const searchView = mutated.search as unknown as { description: string }
    const entryIdView = mutated.readAbstract.parameters.properties.entry_id as unknown as { description: string }
    const original = searchView.description
    searchView.description = 'MUTATED-DESC'
    entryIdView.description = 'MUTATED-PARAM'
    const text = renderKnowledgeSection(mutated)
    expect(text).toContain('MUTATED-DESC')
    expect(text).toContain('MUTATED-PARAM')
    expect(text).not.toContain(original)
    // 还原（对象为夹具内新建，无跨用例污染）
    searchView.description = original
  })
})
