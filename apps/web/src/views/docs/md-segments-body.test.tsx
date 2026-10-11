// 共享 md 文档 body 件单测 —— 三入口单源（官方预览径 / dock 文档 tab / 知识抽屉正文）：
// md/mermaid 分段交替序（挂载占位锚——effect 渲染相位不属单测面）、labels 单源递达
// （MD_PREVIEW_MARKDOWN_LABELS → 代码块官方 CodeToolbar）、streaming/pathImages 透传
// （预览径专属面，缺省零变化）、零 mermaid 段零挂载（懒加载零触发前提）、冻结常量身份。
// 口径沿 docs/index.test.tsx 先例：renderToStaticMarkup 静态面。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { MD_PREVIEW_MARKDOWN_LABELS, MdSegmentsBody } from './md-segments-body.js'

const ER_DOC = ['# 设计', '', '前置段落。', '', '```mermaid', 'erDiagram', '    PROPOSALS ||--o{ FEATURES : "proposal_id"', '```', '', '收尾段落。'].join('\n')

function render(node: ReactNode): string {
  return renderToStaticMarkup(node) as unknown as string
}

describe('MdSegmentsBody（分段渲染单源）', () => {
  it('md/mermaid 交替序：md 段 MarkdownDoc（variant=body）→ mermaid 段挂载占位 → 收尾 md 段', () => {
    const markup = render(<MdSegmentsBody content={ER_DOC} />)
    expect(markup).toContain('data-dswf-markdown="body"') // md 段 variant=body
    expect(markup).toContain('前置段落。')
    expect(markup).toContain('data-dswf-doc-mermaid-pending') // MermaidDiagram 挂载（effect 前占位）
    const mdAt = markup.indexOf('前置段落。')
    const mermaidAt = markup.indexOf('data-dswf-doc-mermaid')
    const tailAt = markup.indexOf('收尾段落。')
    expect(mdAt).toBeGreaterThan(-1)
    expect(mermaidAt).toBeGreaterThan(mdAt)
    expect(tailAt).toBeGreaterThan(mermaidAt)
  })

  it('labels 单源递达：代码块升级官方 CodeToolbar（块级 wrap/复制——三入口同一冻结常量）', () => {
    const markup = render(<MdSegmentsBody content={'```ts\nconst a = 1\n```'} />)
    expect(markup).toContain('md-code-block') // 官方稳定全局类（零哈希引用纪律）
    expect(markup).toContain('data-code-block-banner') // CodeToolbar 横幅锚（toolbarLabels 在场 = CodeToolbar 臂）
    expect(markup).toContain(`aria-label="${MD_PREVIEW_MARKDOWN_LABELS.code.toolbarLabels?.wrapLabel}"`)
    expect(markup).toContain('aria-label="换行"')
    expect(markup).toContain('aria-label="复制"')
  })

  it('零 mermaid 段零挂载（懒加载零触发前提）+ 纯文单段', () => {
    const markup = render(<MdSegmentsBody content={'# 纯文\n\n零 mermaid 块。'} />)
    expect(markup).toContain('data-dswf-markdown')
    expect(markup).not.toContain('data-dswf-doc-mermaid')
  })

  it('streaming 透传：!eof streaming 臂（数学保持字面——官方 parseGfm 零 math 扩展锚）', () => {
    const streaming = render(<MdSegmentsBody content={'前段。\n\n$$E=mc^2$$\n\n尾段。'} streaming />)
    expect(streaming).toContain('E=mc^2')
    expect(streaming, 'streaming 臂数学保持字面').not.toContain('katex')
  })

  it('pathImages 透传：本地图片目的地经注入词表改写（预览径专属面——缺省 undefined = 零变化）', () => {
    const rewritten = render(
      <MdSegmentsBody content={'![图](img/a.png)'} pathImages={{ resolve: (value) => `http://x.test/r/${value}` }} />,
    )
    expect(rewritten).toContain('x.test/r/img/a.png')
  })

  it('MD_PREVIEW_MARKDOWN_LABELS 冻结常量身份（引用稳定——新身份会废弃流式渲染缓存）', () => {
    expect(Object.isFrozen(MD_PREVIEW_MARKDOWN_LABELS)).toBe(true)
    expect(MD_PREVIEW_MARKDOWN_LABELS.code.toolbarLabels).toEqual({
      codeLabel: '代码',
      wrapLabel: '换行',
      unwrapLabel: '不换行',
    })
  })
})
