// 任务 3.1 测试 —— frontmatter 契约解析执行面（tech-design §frontmatter 最小契约）。
// 契约常量归 @dsh-forge/contracts（1.3），本处验证执行：必填口径 / 缺省规则 / 类型容错 /
// 域深校验（≤ FRONTMATTER_DOMAIN_MAX_DEPTH）/ digest 内容摘要。纯单元——零文件系统零库。
import { describe, expect, it } from 'vitest'
import { FRONTMATTER_DOMAIN_MAX_DEPTH, FRONTMATTER_STATUS_DEFAULT } from '@dsh-forge/contracts'
import { parseKnowledgeFile } from './parser.js'

const MTIME = new Date('2026-03-04T05:06:07.890Z')

function parse(overrides: Record<string, unknown> = {}) {
  return parseKnowledgeFile({
    relPath: '编程/java/泛型.md',
    domainPath: '编程/java',
    domainDepth: 2,
    content: [
      '---',
      'title: Java 泛型',
      'summary: 泛型机制摘要',
      'keywords: [java, generics]',
      'status: published',
      'id: kb-001',
      'authors: 张三',
      'updated: 2026-01-02',
      '---',
      '',
      '正文内容',
    ].join('\n'),
    mtime: MTIME,
    ...overrides,
  })
}

describe('合法条目（契约全字段）', () => {
  it('全字段透传 + 域随目录派生', () => {
    const r = parse()
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.entry.frontmatter).toEqual({
      title: 'Java 泛型',
      summary: '泛型机制摘要',
      keywords: ['java', 'generics'],
      status: 'published',
      id: 'kb-001',
      authors: '张三',
      updated: '2026-01-02T00:00:00.000Z', // js-yaml 将未引号日期解析为 Date——解析器统一 ISO 化
    })
    expect(r.entry.domainPath).toBe('编程/java')
  })

  it('digest = 全文内容摘要（sha256 hex）：同内容稳定、异内容相异', () => {
    const a = parse()
    const b = parse() // 同输入重放
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    expect(b.entry.digest).toBe(a.entry.digest)
    expect(a.entry.digest).toMatch(/^[0-9a-f]{64}$/)

    const changed = parseKnowledgeFile({
      relPath: '编程/java/泛型.md',
      domainPath: '编程/java',
      domainDepth: 2,
      content: [
        '---',
        'title: Java 泛型',
        'summary: 摘要改版',
        'keywords: [java, generics]',
        '---',
        '',
        '正文内容（外部修改）',
      ].join('\n'),
      mtime: MTIME,
    })
    expect(changed.ok).toBe(true)
    if (changed.ok && a.ok) expect(changed.entry.digest).not.toBe(a.entry.digest)
  })
})

describe('缺省规则（可选字段）', () => {
  it('title 缺省 = 文件名去扩展名（AC1；仅缺 title 仍可入——AC2）', () => {
    const r = parse({
      content: '---\nsummary: 摘要\nkeywords: [a]\n---\n正文',
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.entry.frontmatter.title).toBe('泛型')
  })

  it('title 空串视同缺省', () => {
    const r = parse({ content: '---\ntitle: ""\nsummary: s\nkeywords: []\n---\nb' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.entry.frontmatter.title).toBe('泛型')
  })

  it('status 缺省 draft（FRONTMATTER_STATUS_DEFAULT）', () => {
    const r = parse({ content: '---\nsummary: s\nkeywords: [a]\n---\nb' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.entry.frontmatter.status).toBe(FRONTMATTER_STATUS_DEFAULT)
      expect(FRONTMATTER_STATUS_DEFAULT).toBe('draft')
    }
  })

  it('updated 缺省取文件 mtime（ISO-8601）', () => {
    const r = parse({ content: '---\nsummary: s\nkeywords: [a]\n---\nb' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.entry.frontmatter.updated).toBe(MTIME.toISOString())
  })

  it('id / authors 缺失或非字符串 → undefined（存而不强求）', () => {
    const r = parse({
      content: '---\nsummary: s\nkeywords: [a]\nid: 42\nauthors: [张三]\n---\nb',
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.entry.frontmatter.id).toBeUndefined()
      expect(r.entry.frontmatter.authors).toBeUndefined()
    }
  })
})

describe('容错口径（不合格不入结果，M4 才硬拒——AC2）', () => {
  it('缺 summary → reject', () => {
    const r = parse({ content: '---\nkeywords: [a]\n---\nb' })
    expect(r).toMatchObject({ ok: false, reason: 'summary' })
  })

  it('summary 空串 / 非字符串 → reject', () => {
    expect(parse({ content: '---\nsummary: ""\nkeywords: [a]\n---\nb' })).toMatchObject({ ok: false, reason: 'summary' })
    expect(parse({ content: '---\nsummary: 42\nkeywords: [a]\n---\nb' })).toMatchObject({ ok: false, reason: 'summary' })
  })

  it('缺 keywords → reject', () => {
    const r = parse({ content: '---\nsummary: s\n---\nb' })
    expect(r).toMatchObject({ ok: false, reason: 'keywords' })
  })

  it('keywords 非数组 / 元素非字符串 → reject（空数组合法）', () => {
    expect(parse({ content: '---\nsummary: s\nkeywords: java\n---\nb' })).toMatchObject({ ok: false, reason: 'keywords' })
    expect(parse({ content: '---\nsummary: s\nkeywords: [a, 42]\n---\nb' })).toMatchObject({ ok: false, reason: 'keywords' })
    expect(parse({ content: '---\nsummary: s\nkeywords: []\n---\nb' }).ok).toBe(true)
  })

  it('无 frontmatter 块（纯正文）→ reject（必填无从满足）', () => {
    const r = parse({ content: '# 直接正文\n无分隔块' })
    expect(r.ok).toBe(false)
  })

  it('坏 YAML → reject（解析器不硬拒，报告计数）', () => {
    const r = parse({ content: '---\ntitle: [unclosed\nsummary: s\nkeywords: [a]\n---\nb' })
    expect(r.ok).toBe(false)
  })
})

describe('域深校验（≤3 层，超层标 invalid——AC2）', () => {
  it(`深度 ${FRONTMATTER_DOMAIN_MAX_DEPTH} 合法`, () => {
    const r = parse({ domainPath: 'a/b/c', domainDepth: 3 })
    expect(r.ok).toBe(true)
  })

  it(`深度 ${FRONTMATTER_DOMAIN_MAX_DEPTH + 1} → reject`, () => {
    const r = parse({ domainPath: 'a/b/c/d', domainDepth: 4 })
    expect(r).toMatchObject({ ok: false, reason: 'domain-depth' })
  })
})
