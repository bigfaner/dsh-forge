// components/MarkdownDoc 单测 —— MarkdownText 族唯一包装入口（架构基线渲染纪律）。
// 断言锚点 = 任务 2.6 AC-2 + UF-6「正文区不含 frontmatter 字段（e2e 断言）」+ tech-design
// Security·Mitigations（不可信 GFM 沙淀经官方 MarkdownText——产品不自建渲染器）。
// 渲染面用 react-dom/server（SSR 直渲，仓库既有形态）；交互与计算样式面归 e2e（3.6/3.7）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MarkdownDoc, stripMarkdownFrontmatter } from './MarkdownDoc.js'

const doc = [
  '---',
  'title: 安全编码规范',
  'summary: 后端服务安全基线',
  'keywords:',
  '  - security',
  '  - backend',
  '---',
  '',
  '# 安全基线',
  '',
  '正文第一段。',
].join('\n')

describe('stripMarkdownFrontmatter（正文与元数据分离的纯逻辑）', () => {
  it('剥离开头的 frontmatter 块（--- 闭合），保留正文（吞收尾 fence 后一个换行，gray-matter 同型）', () => {
    expect(stripMarkdownFrontmatter(doc)).toBe('# 安全基线\n\n正文第一段。')
  })
  it('`...` 闭合的 frontmatter 同样剥离（gray-matter 同型）', () => {
    expect(stripMarkdownFrontmatter('---\nsummary: s\n...\n正文')).toBe('正文')
  })
  it('CRLF 行尾同样剥离', () => {
    expect(stripMarkdownFrontmatter('---\r\nsummary: s\r\n---\r\n正文')).toBe('正文')
  })
  it('无 frontmatter 原样返回；未闭合 fence 不误剥（视为正文 hr）', () => {
    expect(stripMarkdownFrontmatter('# 标题\n正文')).toBe('# 标题\n正文')
    expect(stripMarkdownFrontmatter('---\nsummary: s\n正文')).toBe('---\nsummary: s\n正文')
    expect(stripMarkdownFrontmatter('---\n---\n正文')).toBe('正文') // 空 frontmatter 块
  })
  it('正文中的 --- 分隔线不受影响（仅剥离开头块）', () => {
    const text = '# 标题\n\n---\n\n正文'
    expect(stripMarkdownFrontmatter(text)).toBe(text)
  })
})

describe('MarkdownDoc 组件（唯一包装入口）', () => {
  it('variant=body 渲染正文且不含 frontmatter 字段（UF-6 Validation：正文区不得混入 frontmatter）', () => {
    const markup = renderToStaticMarkup(<MarkdownDoc text={doc} />)
    expect(markup).toContain('安全基线')
    expect(markup).toContain('正文第一段。')
    expect(markup).not.toContain('summary')
    expect(markup).not.toContain('keywords')
    expect(markup).not.toContain('security')
  })
  it('variant 缺省 = body；包装锚点 data-dswf-markdown 承载 variant（e2e/装配锚）', () => {
    expect(renderToStaticMarkup(<MarkdownDoc text="正文" />)).toContain('data-dswf-markdown="body"')
  })
  it('variant=compact 透传官方 MarkdownText（M4 嵌入预览预留；锚点切换）', () => {
    const markup = renderToStaticMarkup(<MarkdownDoc text="正文" variant="compact" />)
    expect(markup).toContain('data-dswf-markdown="compact"')
  })
  it('代码围栏携带默认 labels（复制按钮文案 = 包装内供，消费方零配置）', () => {
    const markup = renderToStaticMarkup(
      <MarkdownDoc text={'```ts\nconst a = 1\n```'} />,
    )
    expect(markup).toContain('复制')
  })
  it('className 透传到包装节点（布局归消费方）', () => {
    expect(renderToStaticMarkup(<MarkdownDoc text="正文" className="dswf-drawer-body" />)).toContain(
      'dswf-drawer-body',
    )
  })
})
