// md 预览扩展渲染器 body 单测 —— 官方预览径 md mermaid 扩展面：erDiagram 分段渲染（md 段
// MarkdownDoc + mermaid 段 MermaidDiagram 挂载占位锚）、跨页半开 fence（首页文本未闭合归
// 正文 → 页补齐自动成图）、非法 mermaid 源透传不外溢、非 text 相位渲染 null + wrap 偏好
// 容器 class 切换、useTabInfo/useResource 元数据递达与缺席降级、图片解析纯函数对齐内建
// （query/fragment 剔除 + URL escape 解码一次 + HTTP(S)/data 保持原 URL + base 校验面）。
// 口径沿 docs/index.test.tsx 先例：renderToStaticMarkup 静态面——effect 胶水（mermaid
// 懒加载渲染相位）不属单测面，锚挂载占位即止。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { MdPreviewBody, mdPreviewImageUrl, mdPreviewPathImages } from './md-preview-body.js'

const WEB_BASE = 'http://127.0.0.1:19536/'
const DOC_PATH = 'Z:/ws/demo/docs/features/m2/design/tech-design.md'

const ER_DOC_TEXT = ['# 设计', '', '前置段落。', '', '```mermaid', 'erDiagram', '    PROPOSALS ||--o{ FEATURES : "proposal_id"', '```', '', '收尾段落。'].join('\n')

function render(node: ReactNode): string {
  return renderToStaticMarkup(node) as unknown as string
}

/** owner 面（slot owner 递达切片——scrollport/addResource/setResources 本件零消费，占位即可） */
const ownerBase = {
  resourceAddress: 'dsh-resource://file/session-1/docs/x.md',
  wrap: true,
  scrollportRef: (): void => {},
  addResource: (): void => {},
  setResources: (): void => {},
}

/** 官方钩子替身（seat inject + standard 面生产形——useResource 捕获读取键） */
function fakeHooks(absolutePath: string | undefined): {
  readonly useTabInfo: () => { readonly tab: { readonly contentId: string } }
  readonly useResource: (address: string) => { readonly value?: { readonly absolutePath?: string } | undefined }
  readonly reads: readonly string[]
} {
  const reads: string[] = []
  return {
    useTabInfo: () => ({ tab: { contentId: 'addr-1' } }),
    useResource: (address: string) => {
      reads.push(address)
      return absolutePath === undefined ? { value: undefined } : { value: { absolutePath } }
    },
    reads,
  }
}

describe('MdPreviewBody（分段渲染）', () => {
  it('erDiagram 源：md 段 MarkdownDoc 锚 + mermaid 段 MermaidDiagram 挂载占位锚（分页前缀直渲）', () => {
    const hooks = fakeHooks(DOC_PATH)
    const markup = render(
      <MdPreviewBody
        {...ownerBase}
        useTabInfo={hooks.useTabInfo}
        useResource={hooks.useResource}
        content={{ kind: 'text', text: ER_DOC_TEXT }}
      />,
    )
    expect(hooks.reads).toEqual(['addr-1']) // useResource(tab.contentId) 元数据读取键
    expect(markup).toContain('data-dswf-md-preview-body')
    expect(markup).toContain('data-dswf-markdown') // md 段经 MarkdownDoc
    expect(markup).toContain('前置段落。')
    expect(markup).toContain('data-dswf-doc-mermaid-pending') // MermaidDiagram 挂载（effect 渲染相位前占位）
    const mdAt = markup.indexOf('前置段落。')
    const mermaidAt = markup.indexOf('data-dswf-doc-mermaid')
    const tailAt = markup.indexOf('收尾段落。')
    expect(mdAt).toBeGreaterThan(-1)
    expect(mermaidAt).toBeGreaterThan(mdAt)
    expect(tailAt).toBeGreaterThan(mermaidAt)
  })

  it('跨页半开 fence：首页未闭合 ```mermaid 归正文（代码文本呈现）；页补齐 props 变化重渲成 mermaid 段', () => {
    const hooks = fakeHooks(DOC_PATH)
    const page1 = ['# 设计', '', '前置段落。', '', '```mermaid', 'erDiagram'].join('\n')
    const first = render(
      <MdPreviewBody
        {...ownerBase}
        useTabInfo={hooks.useTabInfo}
        useResource={hooks.useResource}
        content={{ kind: 'text', text: page1 }}
      />,
    )
    expect(first).toContain('data-dswf-markdown')
    expect(first).toContain('erDiagram') // 未闭合 fence 归正文——fence 体以代码文本呈现（官方渲染器代码块）
    expect(first).not.toContain('data-dswf-doc-mermaid')
    const second = render(
      <MdPreviewBody
        {...ownerBase}
        useTabInfo={hooks.useTabInfo}
        useResource={hooks.useResource}
        content={{ kind: 'text', text: ER_DOC_TEXT }}
      />,
    )
    expect(second).toContain('data-dswf-doc-mermaid-pending') // 页补齐自动成图
  })

  it('非法 mermaid 源：MermaidDiagram 挂载透传（回退语义归 MermaidDiagram——mermaid-diagram 单测全量）+ 异常不外溢', () => {
    const hooks = fakeHooks(DOC_PATH)
    const bad = ['# 图', '', '```mermaid', 'not a valid diagram @@@', '```', '', '尾段。'].join('\n')
    const markup = render(
      <MdPreviewBody
        {...ownerBase}
        useTabInfo={hooks.useTabInfo}
        useResource={hooks.useResource}
        content={{ kind: 'text', text: bad }}
      />,
    )
    expect(markup).toContain('data-dswf-doc-mermaid-pending') // 分段照切、渲染件照挂
    expect(markup).toContain('尾段。') // 源非法不影响相邻段——异常不外溢
  })

  it("content.kind!=='text' 渲染 null（bytes/renderer 相位防御面）", () => {
    expect(render(<MdPreviewBody {...ownerBase} content={{ kind: 'bytes' }} />)).toBe('')
    expect(render(<MdPreviewBody {...ownerBase} content={{ kind: 'renderer' }} />)).toBe('')
  })

  it('wrap 偏好：容器 class 切换（true = 既有正文族；false = dswf-mdp-nowrap 追加）', () => {
    const on = render(<MdPreviewBody {...ownerBase} wrap content={{ kind: 'text', text: '正文' }} />)
    expect(on).toContain('data-dswf-md-preview-body')
    expect(on).not.toContain('dswf-mdp-nowrap')
    const off = render(<MdPreviewBody {...ownerBase} wrap={false} content={{ kind: 'text', text: '正文' }} />)
    expect(off).toContain('dswf-mdp-nowrap')
  })

  it('钩子缺席（非壳载体/单测假体）= 降级渲染照常（图片词表 inert——不在场即不解析）', () => {
    const markup = render(<MdPreviewBody {...ownerBase} content={{ kind: 'text', text: '正文' }} />)
    expect(markup).toContain('data-dswf-md-preview-body')
    expect(markup).toContain('data-dswf-markdown')
  })
})

describe('mdPreviewImageUrl（官方 path-images 口径对齐——纯函数）', () => {
  it('相对目的地并入文档目录 → 认证 /api/file 路由（全路径 encodeURIComponent）', () => {
    expect(mdPreviewImageUrl(WEB_BASE, DOC_PATH, 'img/a.png')).toBe(
      `${WEB_BASE}api/file?path=${encodeURIComponent('Z:/ws/demo/docs/features/m2/design/img/a.png')}`,
    )
  })

  it('绝对路径（POSIX/盘符）直取，零 documentPath 依赖；UNC 双开头分隔 = 官方 fileMediaUrl 拒绝面', () => {
    expect(mdPreviewImageUrl(WEB_BASE, undefined, 'Z:/ws/abs.png')).toBe(
      `${WEB_BASE}api/file?path=${encodeURIComponent('Z:/ws/abs.png')}`,
    )
    expect(mdPreviewImageUrl(WEB_BASE, undefined, '/etc/abs.png')).toBe(
      `${WEB_BASE}api/file?path=${encodeURIComponent('/etc/abs.png')}`,
    )
    expect(mdPreviewImageUrl(WEB_BASE, undefined, '\\\\srv\\share\\a.png')).toBeUndefined()
  })

  it('相对目的地且 absolutePath 未报（元数据未达）= undefined（等待 Host 绝对路径——不猜）', () => {
    expect(mdPreviewImageUrl(WEB_BASE, undefined, 'img/a.png')).toBeUndefined()
  })

  it('HTTP(S)/data 等外部协议保持原 URL 不改写（resolve = undefined → 渲染器保留原 destination）', () => {
    expect(mdPreviewImageUrl(WEB_BASE, DOC_PATH, 'https://example.com/a.png')).toBeUndefined()
    expect(mdPreviewImageUrl(WEB_BASE, DOC_PATH, 'data:image/png;base64,AAA')).toBeUndefined()
  })

  it('query/fragment 剔除（非文件名成分）+ URL escape 解码一次（畸形 escape = undefined）', () => {
    expect(mdPreviewImageUrl(WEB_BASE, DOC_PATH, 'img/a.png?v=2#frag')).toBe(
      `${WEB_BASE}api/file?path=${encodeURIComponent('Z:/ws/demo/docs/features/m2/design/img/a.png')}`,
    )
    expect(mdPreviewImageUrl(WEB_BASE, DOC_PATH, 'a%20b.png')).toBe(
      `${WEB_BASE}api/file?path=${encodeURIComponent('Z:/ws/demo/docs/features/m2/design/a b.png')}`,
    )
    expect(mdPreviewImageUrl(WEB_BASE, DOC_PATH, 'a%.png')).toBeUndefined()
  })

  it('空目的地 = undefined；base 非 HTTP(S)/dsh-app 应用面 = undefined（Node SSR document 缺席同路 inert）', () => {
    expect(mdPreviewImageUrl(WEB_BASE, DOC_PATH, '')).toBeUndefined()
    expect(mdPreviewImageUrl('', DOC_PATH, 'img/a.png')).toBeUndefined()
    expect(mdPreviewImageUrl('about:blank', DOC_PATH, 'img/a.png')).toBeUndefined()
    expect(mdPreviewImageUrl('dsh-app://app/', DOC_PATH, 'img/a.png')).toBe(
      'dsh-app://app/api/file?path=' + encodeURIComponent('Z:/ws/demo/docs/features/m2/design/img/a.png'),
    )
  })
})

describe('mdPreviewPathImages（官方 MarkdownBody pathImages memo 同型——词表工厂）', () => {
  it('resolve 闭包绑定 base + absolutePath；绝对目的地直出认证路由', () => {
    const faces = mdPreviewPathImages(WEB_BASE, DOC_PATH)
    expect(faces.resolve('img/a.png')).toBe(
      `${WEB_BASE}api/file?path=${encodeURIComponent('Z:/ws/demo/docs/features/m2/design/img/a.png')}`,
    )
    expect(faces.resolve('https://example.com/a.png')).toBeUndefined()
  })
})
