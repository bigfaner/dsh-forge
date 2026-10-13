// MarkdownDoc —— MarkdownText 族唯一包装入口（定位：基础；tech-design Security·Mitigations：
// 不可信 GFM 沙淀经官方渲染器，产品不自建渲染器；Hard Rule：产品内禁止直接使用裸渲染器，
// 一切 Markdown 渲染经本件——见 tests/structure/web-shell.test.ts 机械 pin）。
// 职责：①正文与元数据分离（剥离开头 frontmatter 块——UF-6「正文区不含 frontmatter 字段」；
// frontmatter 是通用 Markdown 约定，非业务语义）②供默认 labels（引用稳定——官方要求逐 locale
// 修订记忆化，新身份会废弃流式渲染缓存）③variant 透传（body = 详情抽屉正文 / compact = M4
// 嵌入预览预留，官方 MarkdownText 原生双形态，不发明平行模式）④pathImages 可选透传（官方
// MarkdownText 原生本地图片词表面——官方预览径 md body 供；缺省 undefined = 零变化）⑤labels /
// streaming 可选透传（官方 MarkdownText 原生面——官方预览径供 code.toolbarLabels[代码块
// CodeToolbar] 与 streaming=!eof 增量渲染；缺省 = 现行为零变化，既有消费面不动）。
// 布局归消费方（className 透传）。
import { MarkdownText, type MarkdownLabels, type MarkdownPathImages } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ReactNode } from 'react'

/** 包装形态（官方 MarkdownText 原生 variant 面，不扩形态） */
export type MarkdownDocVariant = 'body' | 'compact'

/** 默认 labels（模块级冻结常量——引用稳定；文案随产品中文面） */
export const DEFAULT_MARKDOWN_LABELS: MarkdownLabels = Object.freeze({
  code: Object.freeze({ copyLabel: '复制', copiedLabel: '已复制' }),
  footnotes: '脚注',
}) as MarkdownLabels

/**
 * 文档正文 labels（模块级冻结常量——引用稳定纪律同 DEFAULT_MARKDOWN_LABELS，新身份会废弃
 * 流式渲染缓存）：官方 MarkdownBody 同形（client.js L1557-1581——code.toolbarLabels 递达 =
 * 代码块升级官方 CodeToolbar：语言名 + 块级 wrap + 复制；文案 = 产品中文面，复制/脚注沿
 * DEFAULT_MARKDOWN_LABELS 单源展开）。
 */
export const MD_PREVIEW_MARKDOWN_LABELS: MarkdownLabels = Object.freeze({
  code: Object.freeze({
    ...DEFAULT_MARKDOWN_LABELS.code,
    toolbarLabels: Object.freeze({ codeLabel: '代码', wrapLabel: '换行', unwrapLabel: '不换行' }),
  }),
  footnotes: DEFAULT_MARKDOWN_LABELS.footnotes,
}) as MarkdownLabels

const FRONTMATTER_OPEN = /^---\r?\n/
const FRONTMATTER_CLOSE = /^(?:---|\.\.\.)\r?$/

/**
 * 剥离开头的 YAML frontmatter 块（`---` 开 + `---`/`...` 闭，gray-matter 同型），返回余下正文。
 * 未闭合 fence（无收尾行）视为正文主题分割线，原样返回——不吞正文。
 */
export function stripMarkdownFrontmatter(text: string): string {
  if (!FRONTMATTER_OPEN.test(text)) return text
  const lines = text.split('\n')
  // lines[0] = 开 fence；找收尾 fence（跳过首行，允许空 frontmatter 块）
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (FRONTMATTER_CLOSE.test(line)) {
      return lines.slice(i + 1).join('\n').replace(/^\r?\n/, '')
    }
  }
  return text
}

export interface MarkdownDocProps {
  /** Markdown 源文本（可含开头 frontmatter 块——包装内剥离，正文不含元数据字段） */
  readonly text: string
  /** 渲染形态：body（默认，正文排版）/ compact（紧凑，M4 嵌入预览预留） */
  readonly variant?: MarkdownDocVariant
  /** 布局类名（透传包装节点；间距与排版刻度归消费方/官方令牌） */
  readonly className?: string
  /**
   * 本地图片词表（官方 MarkdownText 原生 pathImages 面——类型 re-export 自
   * dsh-client-ui-primitives）：所有方把未能过远程 URL 白名单的本地目的地映射到可展示
   * URL。缺省 undefined = 现行为零变化（既有用例不动）。
   */
  readonly pathImages?: MarkdownPathImages
  /**
   * 文档 chrome 文案（官方 MarkdownText 原生 labels 面——code.toolbarLabels 在场 =
   * 代码块升级官方 CodeToolbar[语言名 + 块级 wrap + 复制]）。缺省 = DEFAULT_MARKDOWN_LABELS
   * （现行为零变化）。引用稳定要求同官方：逐 locale 修订记忆化，新身份废弃流式渲染缓存——
   * 消费方供模块级冻结常量。
   */
  readonly labels?: MarkdownLabels
  /** 增量渲染旗（官方 MarkdownText 原生 streaming 面——流式臂冻结已结算块，尾段增量重析）。缺省 undefined = 全量结算渲染（现行为）。 */
  readonly streaming?: boolean
}

/** Markdown 渲染唯一包装入口（产品内一切 Markdown 经本件，禁直用 MarkdownText）。 */
export function MarkdownDoc({ text, variant = 'body', className, pathImages, labels, streaming }: MarkdownDocProps): ReactNode {
  const cls = className === undefined ? 'dswf-markdown' : `dswf-markdown ${className}`
  return (
    <div className={cls} data-dswf-markdown={variant}>
      <MarkdownText
        text={stripMarkdownFrontmatter(text)}
        labels={labels ?? DEFAULT_MARKDOWN_LABELS}
        variant={variant}
        {...(pathImages !== undefined ? { pathImages } : {})}
        {...(streaming !== undefined ? { streaming } : {})}
      />
    </div>
  )
}
