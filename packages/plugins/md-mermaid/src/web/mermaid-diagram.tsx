// MermaidDiagram —— mermaid 图渲染件（定位：业务——UF-2 文档 tab mermaid 段渲染）。
// 自 apps/web/src/views/docs/mermaid-diagram.tsx 原样迁入（退役归 1.8，本件为 ./web 出口）。
// 安全边界（tech-design Dependencies + Mitigations ⑦，Hard Rule）：
//   ①懒加载——引擎唯一动态 import 径（禁同步 import；本组件零 mermaid 块不挂载 =
//     零加载，DocsFrame 按 doc-segments 分段挂载）；
//   ②securityLevel='strict'（库默认 sanitize；禁 click 回调交互——交互绑定面恒不接）；
//   ③渲染失败/非法源回退纯文本占位卡（源码 + 回退注记），异常不外溢（render/import
//     失败一律归一 fail 态，不炸文档 tab）。
// erDiagram = 验收锚，全图型同库渲染——本件零图型分支（源原样入 engine.render）。
// 分层：装载/渲染管线 = 可测纯异步面（loader 注入）；useEffect 仅编排；
// 内联图/回退卡 = 纯呈现（1.8 方案 A：成功态内联无头「图即内容」，回退卡形制原样保留）。
import { useEffect, useState, type ReactNode } from 'react'

import { applyOpenArrowheads } from './arrowheads.js'
import { MERMAID_THEME_VARIABLES } from './theme.js'

/** mermaid 引擎窄面（消费的最小 API——真身类型经动态 import 推断，此处收敛调用面） */
export interface MermaidEngine {
  initialize(config: {
    startOnLoad?: boolean
    securityLevel?: string
    theme?: string
    themeVariables?: Record<string, string>
  }): unknown
  render(id: string, text: string): Promise<{ svg: string }>
}

let enginePromise: Promise<MermaidEngine> | undefined

/**
 * 懒加载唯一径（Hard Rule：禁同步 import mermaid——本函数的动态 import 是产品内唯一引用）。
 * 单次装载 + 单次 initialize（模块级 promise 缓存——多图共引擎）；securityLevel='strict'
 * 为安全边界字面量（禁放宽），startOnLoad=false（渲染恒经显式 render 调用）；
 * 1.8 主题化 = theme base + MERMAID_THEME_VARIABLES（单次 initialize 语义不动）。
 * 装载瞬时失败（页面存活期间 dist 重建 chunk 404 等）**不粘住**：reject 即清缓存，
 * 下次挂载重试——不清则被拒 promise 永久缓存 = 该页一切图恒回退（2026-10-13 宿主
 * renderer 页内取证定性：源/引擎/环境全绿仍整会话回退的唯一解释径）。
 */
export function loadMermaidEngine(): Promise<MermaidEngine> {
  enginePromise ??= import('mermaid').then(
    (mod) => {
      const engine = mod.default as MermaidEngine
      engine.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'base',
        themeVariables: MERMAID_THEME_VARIABLES,
      })
      return engine
    },
    (err: unknown) => {
      enginePromise = undefined
      throw err
    },
  )
  return enginePromise
}

/** 渲染结果（ok = SVG 在场；fail = 回退占位） */
export type MermaidRenderOutcome = { readonly ok: true; readonly svg: string } | { readonly ok: false }

/**
 * 渲染管线（纯异步面——loader 注入：真身 loadMermaidEngine / 测试替身）。
 * 失败一律归一 { ok: false }（异常不外溢——import 失败/render 抛错/形状非法同路回退）。
 */
export async function renderMermaidDiagram(
  load: () => Promise<MermaidEngine>,
  source: string,
  id: string,
): Promise<MermaidRenderOutcome> {
  try {
    const engine = await load()
    const { svg } = await engine.render(id, source)
    if (typeof svg !== 'string' || svg.length === 0) return { ok: false }
    // 1.14 管线单点收口：SVG 后处理（箭头开放化）后再返回——React 件与 DOM 增强器两消费
    // 面均经本函数，自动继承。零命中（上游改几何）原样返回——安全回归实心箭头。
    // 生产面 marker id 经 nextMermaidId 每渲染唯一，无同文档 -open 后缀去重需求（预览页双拷贝工件，注记即可）。
    return { ok: true, svg: applyOpenArrowheads(svg) }
  } catch {
    return { ok: false }
  }
}

let renderSeq = 0

/** 渲染 id 序（mermaid 临时元素锚——多图不撞） */
export function nextMermaidId(): string {
  renderSeq += 1
  return `dswf-mermaid-${renderSeq}`
}

/** 组件态：rendering（装载/渲染在途）→ rendered | fallback */
type MermaidDiagramState = { readonly phase: 'rendering' } | { readonly phase: 'rendered'; readonly svg: string } | { readonly phase: 'fallback' }

export interface MermaidDiagramProps {
  /** mermaid 源（doc-segments 切出的 fence 体，原样入引擎） */
  readonly source: string
}

/** 回退占位卡（纯呈现：源码 + 回退注记——Mitigations ⑦ 异常不外溢的 UI 面） */
export function MermaidFallbackCard({ source }: MermaidDiagramProps): ReactNode {
  return (
    <figure className="dswf-doc-mermaid dswf-doc-mermaid-fallback" data-dswf-doc-mermaid="" data-dswf-doc-mermaid-fallback="">
      <figcaption className="dswf-doc-mermaid-head">图渲染回退</figcaption>
      <pre className="dswf-doc-mermaid-src">
        <code>{source}</code>
      </pre>
      <p className="dswf-doc-mermaid-note">mermaid 渲染失败或源非法——已回退为源码展示（异常不外溢）</p>
    </figure>
  )
}

/**
 * 内联图（纯呈现——1.8 方案 A：标题条退役，图直接落文档流「图即内容」；
 * SVG 注入：securityLevel='strict' 下库内 sanitize（DOMPurify）先行——strict 面唯一注径）。
 */
export function MermaidFigure({ svg }: { readonly svg: string }): ReactNode {
  return (
    <figure className="dswf-doc-mermaid" data-dswf-doc-mermaid="" data-dswf-doc-mermaid-svg="">
      <div className="dswf-doc-mermaid-canvas" dangerouslySetInnerHTML={{ __html: svg }} />
    </figure>
  )
}

/**
 * mermaid 图渲染件（挂载即懒加载 + 渲染；失败回退占位卡；成功/在途均内联无头形态）。
 */
export function MermaidDiagram({ source }: MermaidDiagramProps): ReactNode {
  const [state, setState] = useState<MermaidDiagramState>({ phase: 'rendering' })

  useEffect(() => {
    let alive = true
    setState({ phase: 'rendering' })
    void renderMermaidDiagram(loadMermaidEngine, source, nextMermaidId()).then((outcome) => {
      if (!alive) return
      setState(outcome.ok ? { phase: 'rendered', svg: outcome.svg } : { phase: 'fallback' })
    })
    return () => {
      alive = false
    }
  }, [source])

  if (state.phase === 'rendered') {
    return <MermaidFigure svg={state.svg} />
  }
  if (state.phase === 'fallback') {
    return <MermaidFallbackCard source={source} />
  }
  return (
    <figure className="dswf-doc-mermaid" data-dswf-doc-mermaid="" data-dswf-doc-mermaid-pending="" aria-busy="true">
      <div className="dswf-doc-mermaid-canvas">图渲染中…</div>
    </figure>
  )
}
