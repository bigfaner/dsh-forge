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
  it('labels 缺省 = DEFAULT_MARKDOWN_LABELS（默认面钉：旧式 banner——零 CodeToolbar/块级 wrap 钮）', () => {
    const markup = renderToStaticMarkup(
      <MarkdownDoc text={'```ts\nconst a = 1\n```'} />,
    )
    expect(markup).toContain('data-code-block-banner') // 旧式代码横幅（默认 labels 无 toolbarLabels）
    expect(markup, '块级 wrap 钮不出（toolbarLabels 缺席 = 既有消费面 EntryDrawer 零变化；docs tab 1.4 起传 MD_PREVIEW_MARKDOWN_LABELS）').not.toContain(
      'aria-label="换行"',
    )
  })
  it('labels 透传（code.toolbarLabels 在场 = 官方 CodeToolbar 臂：语言名/块级 wrap/复制）', () => {
    const markup = renderToStaticMarkup(
      <MarkdownDoc
        text={'```\nconst a = 1\n```'}
        labels={{
          code: { copyLabel: '复制', copiedLabel: '已复制', toolbarLabels: { codeLabel: '代码', wrapLabel: '换行', unwrapLabel: '不换行' } },
          footnotes: '脚注',
        }}
      />,
    )
    expect(markup).toContain('aria-label="换行"')
    expect(markup).toContain('aria-label="复制"')
    expect(markup, '未知语言回退 codeLabel 文案（官方 CodeToolbar 同判）').toContain('代码')
  })
  it('streaming 透传（官方 streaming 臂——$$ 块结算前保持字面，KaTeX 不触面）', () => {
    const markup = renderToStaticMarkup(
      <MarkdownDoc text={'前段。\n\n$$E=mc^2$$\n\n尾段。'} streaming />,
    )
    expect(markup).toContain('E=mc^2')
    expect(markup, 'streaming 臂无 math 扩展（结算臂需浏览器 DOMParser——Node SSR 只锚本侧）').not.toContain('katex')
  })
  it('className 透传到包装节点（布局归消费方）', () => {
    expect(renderToStaticMarkup(<MarkdownDoc text="正文" className="dswf-drawer-body" />)).toContain(
      'dswf-drawer-body',
    )
  })
  it('pathImages 透传官方 MarkdownText（本地图片词表面——官方预览径 md body 供；相对目的地经词表改写）', () => {
    const markup = renderToStaticMarkup(
      <MarkdownDoc
        text="![徽标](logo.png)"
        pathImages={{ resolve: (value) => (value === 'logo.png' ? 'https://rewritten.example/logo.png' : undefined) }}
      />,
    )
    expect(markup).toContain('徽标')
    expect(markup, '词表 resolve 结果透传（渲染器重发前复检协议）').toContain('https://rewritten.example/logo.png')
  })
})
