// stage③ C2 单测——提示词两段函数化（提案 §2.2 裁决 #3/#9 + §7 审核稿；域细分改造
// 2026-11-05：静态段中文归档规则 + 动态段目录树渲染/双限截断）。
import { describe, expect, it } from 'vitest'
import { FRONTMATTER_DOMAIN_MAX_DEPTH } from '@dsh-forge/contracts'
import {
  KNOWLEDGE_DOMAINS_MAX_ROWS,
  KNOWLEDGE_DOMAINS_ROWS_PER_TOP,
  KNOWLEDGE_DOMAINS_SECTION_NAME,
  KNOWLEDGE_DOMAINS_SECTION_ORDER,
  KNOWLEDGE_SECTION_NAME,
  KNOWLEDGE_SECTION_ORDER,
  renderKnowledgeDomainsSection,
  renderKnowledgeStaticSection,
} from './index.js'
import type { DomainIndexRow } from '../service/internal.js'

describe('段常量（提案 §7 审核稿定死）', () => {
  it('两段名 forge:knowledge / forge:knowledge-domains，order 910/911（900 与官方 FILE_REFERENCE 撞位上移）', () => {
    expect(KNOWLEDGE_SECTION_NAME).toBe('forge:knowledge')
    expect(KNOWLEDGE_SECTION_ORDER).toBe(910)
    expect(KNOWLEDGE_DOMAINS_SECTION_NAME).toBe('forge:knowledge-domains')
    expect(KNOWLEDGE_DOMAINS_SECTION_ORDER).toBe(911)
    expect(KNOWLEDGE_DOMAINS_MAX_ROWS).toBe(28)
    expect(KNOWLEDGE_DOMAINS_ROWS_PER_TOP).toBe(6)
  })
})

describe('renderKnowledgeStaticSection（固定文本——中文 + 归档规则块）', () => {
  const text = renderKnowledgeStaticSection()

  it('XML 标签制 + 摘要先行 + domain_prefix 指引 + 与 <knowledge-domains> 互指', () => {
    expect(text).toContain('<knowledge-base>')
    expect(text).toContain('作为 domain_prefix 传入')
    expect(text).toContain('<knowledge-domains> 块')
  })

  it('何时检索/何时回退双段齐备（检索触发场景 + 正本优先与零命中回退）', () => {
    expect(text).toContain('何时检索知识库')
    expect(text).toContain('避免凭记忆重推或复犯已知错误')
    expect(text).toContain('何时退回原始文件')
    expect(text).toContain('以仓库源码与文档正本为准')
    expect(text).toContain('零命中时同样退回原始文件查找')
  })

  it('检索方法段齐备（agentic search 三步 SOP：定域拆词 / hint 反应 / 精读）', () => {
    expect(text).toContain('检索方法（agentic search 三步')
    expect(text).toContain('第 1 步 定域与拆词')
    expect(text).toContain('同义词/近义词组作为检索 keywords')
    expect(text).toContain('第 2 步 检索')
    expect(text).toContain('先读 hint 再看命中')
    expect(text).toContain('hint 明示不要再检索时立即停止')
    expect(text).toContain('第 3 步 精读')
    expect(text).toContain('结合摘要与 score 挑选文档')
    expect(text).toContain('回答内容以正文为准')
    expect(text).not.toContain('hints')
    // 只指示 agent 要做什么——服务端/工具内部机制不进提示词（用户裁决 2026-11-11）
    expect(text).not.toContain('服务端')
    expect(text).not.toContain('rerank')
    expect(text).not.toContain('并集')
    expect(text).not.toContain('弃域')
    // 检索主流程不经 read_abstract（命中行已带摘要——用户裁决 2026-11-11）
    expect(text).not.toContain('knowledge_read_abstract')
    // browse 指认行移除（域目录树由动态段承载——用户裁决 2026-11-11）
    expect(text).not.toContain('knowledge_browse')
  })

  it('归档规则块五条齐备（最深既有子域 / 自释名 / 满额分裂 / 犹豫归父 / 补简介）', () => {
    expect(text).toContain('归档规则（每次写入均须遵循）：')
    expect(text).toContain('最深既有子域')
    expect(text).toContain('子域名须自释义')
    expect(text).toContain('禁止预建空架子')
    expect(text).toContain('归父域')
    expect(text).toContain('补写简介')
  })

  it('写入面零工具说明（renderToolUsage 退役——工具加载由 dsh 机械承载；检索面 knowledge_search/read 为指针行除外）', () => {
    for (const name of ['knowledge_write', 'knowledge_supersede', 'knowledge_reinstate', 'entry_id']) {
      expect(text).not.toContain(name)
    }
  })

  it('契约事实取自 contracts 常量（域层级上限插值——单一来源）', () => {
    expect(text).toContain(`最多 ${String(FRONTMATTER_DOMAIN_MAX_DEPTH)} 级`)
  })

  it('段文本禁用裸 {{（SystemPrompt 默认插值，未知引用会炸渲染）', () => {
    expect(text).not.toContain('{{')
  })
})

describe('renderKnowledgeDomainsSection（目录树形态/简介省略/双限截断）', () => {
  const row = (domainPath: string, entryCount: number, description: string | null = null): DomainIndexRow => ({
    domainPath,
    entryCount,
    depth: domainPath.split('/').length,
    description,
  })

  it('空行集空返 \'\'（段退场）；count ≤ 0 域隐去', () => {
    expect(renderKnowledgeDomainsSection([])).toBe('')
    expect(renderKnowledgeDomainsSection([row('zero', 0)])).toBe('')
    const text = renderKnowledgeDomainsSection([row('kept', 3, 'x'), row('kept/sub', 0)])
    expect(text).toContain('kept(3 篇) — x')
    expect(text).not.toContain('sub')
  })

  it('顶域行顶格 `域名(N 篇) — 简介`；简介缺席降级 `<无简介>`', () => {
    const text = renderKnowledgeDomainsSection([row('examples', 22)])
    expect(text).toContain('<knowledge-domains>')
    expect(text).toContain('examples(22 篇) — <无简介>')
    expect(text).toContain('</knowledge-domains>')
    const described = renderKnowledgeDomainsSection([row('conventions', 44, '声明性约束与惯例')])
    expect(described).toContain('conventions(44 篇) — 声明性约束与惯例')
  })

  it('子域树行：两空格缩进 + ├─/└─ 连接符 + 叶名；简介有则附、无则省；末子域 └─', () => {
    const text = renderKnowledgeDomainsSection([
      row('conventions', 25, '工程纪律'),
      row('conventions/windows', 12),
      row('conventions/assembly', 8, '装配/守卫类判据'),
    ])
    expect(text).toContain('conventions(25 篇) — 工程纪律')
    // 子域展示序 = 计数降序（windows 12 → ├─ 首、assembly 8 → └─ 末）
    expect(text).toContain('├─ windows(12 篇)')
    expect(text).toContain('└─ assembly(8 篇) — 装配/守卫类判据')
    // 简介缺席的子域行不带「 — 」段
    const lines = text.split('\n').filter((l) => l.includes('windows(12 篇)'))
    expect(lines.every((l) => !l.includes(' — '))).toBe(true)
  })

  it('段尾指认行固定：归档规则指认 + 子域 prefix 构成规则；树体包 fenced code block + 标签内侧空行（断 HTML block 吞行）', () => {
    const text = renderKnowledgeDomainsSection([row('a', 1)])
    expect(text).toContain('归档规则：见上文 knowledge-base 块。子域 domain_prefix = 父路径/名称。')
    expect(text).toContain('<knowledge-domains>\n\n```text\n')
    expect(text.endsWith('```\n\n</knowledge-domains>')).toBe(true)
  })

  it('单顶域超配额：子域按计数降序截至 5 + `… 还有 N 个子域` 行', () => {
    const children = Array.from({ length: 8 }, (_, i) => row(`t/c${String(i)}`, 10 - i))
    const text = renderKnowledgeDomainsSection([row('t', 100), ...children])
    expect(text).toContain('t(100 篇) — <无简介>')
    expect(text).toContain('├─ c0(10 篇)') // 计数最高者保留
    expect(text).not.toContain('c6(')
    expect(text).toContain('… 还有 3 个子域')
  })

  it('总量 28 行超限：超容顶域整块截 + `… 还有 N 个域（用 domain_prefix 检索）` 行', () => {
    // 10 个顶域 × (1 主行 + 5 子行) = 60 行 > 28 → 只装得下 4 块（24 行），余 6 块截
    const rows: DomainIndexRow[] = []
    for (let t = 0; t < 10; t += 1) {
      rows.push(row(`t${String(t)}`, 50 - t))
      for (let c = 0; c < 5; c += 1) rows.push(row(`t${String(t)}/c${String(c)}`, 5 - c))
    }
    const text = renderKnowledgeDomainsSection(rows)
    const bodyLines = text.split('\n').filter((l) => l !== '<knowledge-domains>' && l !== '</knowledge-domains>' && l !== '```text' && l !== '```' && l !== '')
    // 4 块 × 6 行 + 截断行 + 指认行 = 26（另加 fence 首尾两行不计内容行）
    expect(bodyLines).toHaveLength(26)
    expect(text).toContain('… 还有 6 个域（用 domain_prefix 检索）')
    expect(text).not.toContain('t4(46 篇)')
  })

  it('根域文件不入树（domainPath 空 = 供数面已裁——渲染面防御性再滤）', () => {
    const text = renderKnowledgeDomainsSection([row('a', 1)])
    expect(text).toContain('a(1 篇) — <无简介>')
  })
})
