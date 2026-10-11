// 共享 md 文档 body 件（定位：业务——md 文档正文渲染单源，proposal md-preview-mermaid 1.5）。
// 三入口一致（用户裁决 2026-10-11「不同入口都要保持一致」）：官方预览径（md-preview-body）、
// dock 文档 tab（index.tsx DocBody）、知识抽屉正文（knowledge/EntryDrawer）的 md body 渲染
// 全部经本件——分段管线（doc-segments splitDocSegments）+ md 段 MarkdownDoc（官方渲染器
// 唯一径，variant=body + labels=MD_PREVIEW_MARKDOWN_LABELS[1.3 预览径冻结常量上移单源——
// code.toolbarLabels 递达 = 代码块升级官方 CodeToolbar：语言名 + 块级 wrap + 复制]）+
// mermaid 段 MermaidDiagram（懒加载/strict/失败回退全既有——本件零 mermaid 引擎引用，
// Hard Rule：禁静态 import mermaid，动态 import 唯一径 = mermaid-diagram.tsx）。
// 容器归消费方（滚动所有权三入口刻意不同，容器节点不进本件）：官方同形容器刻度
// （white-space:normal + font-family 重置 + css$7 inset 10px 12px + 图卡块级 16px 节奏）
// 单源在 docs.css 三容器同组规则（.dswf-mdp-body / .dswf-doc-body / .dswf-kn-md-body——
// 预览径纯块级[滚动归官方共享 body]、抽屉纯块级[滚动归抽屉内容区]、dock tab 自持滚动）。
// 预览径专属面（pathImages 图片词表 / streaming=!eof 增量渲染）经 props 透传；dock tab /
// 抽屉缺省 = 全量结算渲染（MarkdownDoc 既有缺省语义，行为零变化）。
// 分层：纯呈现组件（renderToStaticMarkup 可测——effect 胶水[mermaid 懒加载渲染相位]不在
// 本件不在单测面）。
import type { ReactNode } from 'react'
import type { MarkdownLabels, MarkdownPathImages } from '@deepseek-ai/dsh-client-ui-primitives'
import { DEFAULT_MARKDOWN_LABELS, MarkdownDoc } from '../../components/index.js'
import { splitDocSegments } from './doc-segments.js'
import { MermaidDiagram } from './mermaid-diagram.js'
import './docs.css'

/**
 * 预览径 labels（模块级冻结常量——引用稳定纪律同 DEFAULT_MARKDOWN_LABELS，新身份会废弃
 * 流式渲染缓存）：官方 MarkdownBody 同形（client.js L1557-1581——code.toolbarLabels 递达 =
 * 代码块 CodeToolbar；文案 = 产品中文面，复制/脚注沿 DEFAULT_MARKDOWN_LABELS 单源展开）。
 * 1.5 起为本件单源（原 md-preview-body.tsx 定义上移）——三入口共享同一身份。
 */
export const MD_PREVIEW_MARKDOWN_LABELS: MarkdownLabels = Object.freeze({
  code: Object.freeze({
    ...DEFAULT_MARKDOWN_LABELS.code,
    toolbarLabels: Object.freeze({ codeLabel: '代码', wrapLabel: '换行', unwrapLabel: '不换行' }),
  }),
  footnotes: DEFAULT_MARKDOWN_LABELS.footnotes,
}) as MarkdownLabels

export interface MdSegmentsBodyProps {
  /** markdown 全文（分段器切片——md 段/mermaid 段交替序列） */
  readonly content: string
  /** 本地图片词表（预览径专属透传——缺省 undefined = 图片保持原样，dock tab/抽屉零变化） */
  readonly pathImages?: MarkdownPathImages
  /** 增量渲染旗（预览径 !eof 透传——缺省 undefined = 全量结算渲染） */
  readonly streaming?: boolean
}

/**
 * md 文档正文分段渲染（三入口单源）：md 段 MarkdownDoc（variant=body + 冻结 labels +
 * 可选 pathImages/streaming 透传）、mermaid 段 MermaidDiagram（挂载即懒加载——零 mermaid
 * 段零挂载 = 零装载）。纯段列表无容器节点——容器与滚动所有权归三入口各自语境。
 */
export function MdSegmentsBody({ content, pathImages, streaming }: MdSegmentsBodyProps): ReactNode {
  const segments = splitDocSegments(content)
  return (
    <>
      {segments.map((segment, i) =>
        segment.kind === 'md' ? (
          <MarkdownDoc
            key={i}
            text={segment.text}
            variant="body"
            pathImages={pathImages}
            labels={MD_PREVIEW_MARKDOWN_LABELS}
            streaming={streaming}
          />
        ) : (
          <MermaidDiagram key={i} source={segment.source} />
        ),
      )}
    </>
  )
}
