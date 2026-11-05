// stage③ C2 单测——提示词两段函数化（提案 §2.2 裁决 #3/#9 + §7 审核稿）：
// 静态瘦身段（XML 标签制、零工具说明）+ 动态域索引段（行格式/降级/截断）。
import { describe, expect, it } from 'vitest'
import { FRONTMATTER_DOMAIN_MAX_DEPTH } from '@dsh-forge/contracts'
import {
  KNOWLEDGE_DOMAINS_MAX_ROWS,
  KNOWLEDGE_DOMAINS_SECTION_NAME,
  KNOWLEDGE_DOMAINS_SECTION_ORDER,
  KNOWLEDGE_SECTION_NAME,
  KNOWLEDGE_SECTION_ORDER,
  renderKnowledgeDomainsSection,
  renderKnowledgeStaticSection,
} from './index.js'
import type { TopDomainStat } from '../service/internal.js'

describe('段常量（提案 §7 审核稿定死）', () => {
  it('两段名 forge:knowledge / forge:knowledge-domains，order 910/911（900 与官方 FILE_REFERENCE 撞位上移）', () => {
    expect(KNOWLEDGE_SECTION_NAME).toBe('forge:knowledge')
    expect(KNOWLEDGE_SECTION_ORDER).toBe(910)
    expect(KNOWLEDGE_DOMAINS_SECTION_NAME).toBe('forge:knowledge-domains')
    expect(KNOWLEDGE_DOMAINS_SECTION_ORDER).toBe(911)
    expect(KNOWLEDGE_DOMAINS_MAX_ROWS).toBe(10)
  })
})

describe('renderKnowledgeStaticSection（§7 审核稿逐字——固定文本）', () => {
  const text = renderKnowledgeStaticSection()

  it('XML 标签制 + 摘要先行 + 零命中诚实 + domain_prefix 指引 + 与 <knowledge-domains> 互指', () => {
    expect(text).toContain('<knowledge-base>')
    expect(text).toContain('summary-first')
    expect(text).toContain('Zero hits means zero hits')
    expect(text).toContain('Pass one as domain_prefix')
    expect(text).toContain('<knowledge-domains> block below')
  })

  it('零工具说明（renderToolUsage 退役——工具加载由 dsh 机械承载）', () => {
    for (const name of ['knowledge_search', 'knowledge_read_abstract', 'knowledge_read', 'knowledge_write', 'knowledge_supersede', 'knowledge_reinstate', 'entry_id', 'domain_prefix (']) {
      expect(text).not.toContain(name)
    }
  })

  it('契约事实取自 contracts 常量（域层级上限插值——单一来源）', () => {
    expect(text).toContain(`up to ${String(FRONTMATTER_DOMAIN_MAX_DEPTH)} levels`)
  })

  it('段文本禁用裸 {{（SystemPrompt 默认插值，未知引用会炸渲染）', () => {
    expect(text).not.toContain('{{')
  })
})

describe('renderKnowledgeDomainsSection（行格式/降级/截断）', () => {
  const stat = (domain: string, entryCount: number, description: string | null = null): TopDomainStat => ({ domain, entryCount, description })

  it('行格式 `域名(N entries) — 简介`；计数单数 entry；空行集空返 \'\'（段退场）', () => {
    expect(renderKnowledgeDomainsSection([])).toBe('')
    const text = renderKnowledgeDomainsSection([stat('conventions', 44, '声明性约束与惯例'), stat('pitfalls', 1, '预防性警告')])
    expect(text).toContain('<knowledge-domains>')
    expect(text).toContain('- conventions(44 entries) — 声明性约束与惯例')
    expect(text).toContain('- pitfalls(1 entry) — 预防性警告')
    expect(text).toContain('</knowledge-domains>')
  })

  it('简介缺席降级行 `域名(N entries) — <无简介>`', () => {
    const text = renderKnowledgeDomainsSection([stat('examples', 22, null)])
    expect(text).toContain('- examples(22 entries) — <无简介>')
  })

  it('count ≤ 0 域隐去（空域行保留于表、段内自然隐去）', () => {
    const text = renderKnowledgeDomainsSection([stat('kept', 3, 'x'), stat('empty', 0, '人工简介在表')])
    expect(text).toContain('- kept(3 entries)')
    expect(text).not.toContain('empty')
    // 全部归零 → 空串
    expect(renderKnowledgeDomainsSection([stat('zero', 0)])).toBe('')
  })

  it('>10 顶域截断：只列 10 行 + `… and N more domains (search with domain_prefix)` 计数枚举行', () => {
    const many: TopDomainStat[] = Array.from({ length: 13 }, (_, i) => stat(`d${String(i).padStart(2, '0')}`, 13 - i))
    const text = renderKnowledgeDomainsSection(many)
    const lines = text.split('\n')
    // 块首尾 + 10 行 + 1 截断行
    expect(lines).toHaveLength(13)
    expect(lines[0]).toBe('<knowledge-domains>')
    expect(lines[10]).toBe('- d09(4 entries) — <无简介>')
    expect(lines[11]).toBe('… and 3 more domains (search with domain_prefix)')
    expect(lines[12]).toBe('</knowledge-domains>')
    expect(text).not.toContain('d10(')
    // 恰 10 个顶域不截断
    const exact = renderKnowledgeDomainsSection(many.slice(0, 10))
    expect(exact).toContain('- d09(')
    expect(exact).not.toContain('more domains')
  })
})
