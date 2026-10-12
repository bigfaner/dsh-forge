// MermaidDiagram —— mermaid 图渲染件（定位：业务——UF-2 文档 tab mermaid 段渲染）。
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

/**
 * mermaid 主题变量（1.8 方案 A——Codex 式内联观感，用户裁决 2026-10-11）。
 * 取值策略（证据驱动，mermaid 12.1.0 实证 + 2026-10-12 fresh 票据定性）：主题变量经 theme-base
 * calculate() → updateColors 的 khroma 色彩派生——**色彩槽位传 var() 即抛
 * 「Unsupported color format」整图回退**（实机复现 + headless 隔离复现双重实证；
 * fontFamily/fontSize 非色彩径，var() 纯透传安全）。故色彩族全部取官方静态令牌实值镜像
 * （--dsw-static-neutral-bluish-* / alias 静态实值，dsh-client-ui-theme 实值唯一来源，
 * dsw-raw 注记豁免；light 主题实值——主文档面）——与 primaryColor 族既有镜像策略同口径。
 * 中性灰阶低饱和 = 中性基色 × mermaid 自身派生数学。
 */
export const MERMAID_THEME_VARIABLES = {
  /** 透明背景（图即内容——不自带底色，1.8 AC） */
  background: 'transparent',
  /** 字体栈同源官方（--dsw-font-family 主题包实定义；inherit 回退同官方 css$7 var(--dsw-font,inherit) 形） */
  fontFamily: 'var(--dsw-font-family, inherit)',
  /** 字号对齐官方 14px 正文刻度（--dsw-font-s-14-font-size 实值 14px——CSS 纯透传，核心渲染零 JS 数值消费） */
  fontSize: 'var(--dsw-font-s-14-font-size)',
  // ── khroma 派生输入族（concrete 镜像官方静态调色板——var() 会破坏 updateColors 派生）──
  primaryColor: '#f1f3f5', // dsw-raw 官方 --dsw-static-neutral-bluish-75 实值（节点底/派生基色）
  secondaryColor: '#e9ecf2', // dsw-raw 官方 --dsw-static-neutral-bluish-150 实值（次级底）
  tertiaryColor: '#f9fafb', // dsw-raw 官方 --dsw-static-neutral-bluish-50 实值（簇底）
  noteBkgColor: '#f9fafb', // dsw-raw 官方 --dsw-static-neutral-bluish-50 实值（便签底——出厂黄退役）
  primaryTextColor: '#0f1115', // dsw-raw 官方 --dsw-static-neutral-bluish-1000 实值（节点内文字——落 concrete 亮底，双主题可读）
  // ── 显示面色彩族（khroma 消费——var() 禁入；官方 alias 令牌 light 实值镜像，主题联动由
  //    SVG <style> 内联值承载——暗主题跟随属后续面，失败回退语义不因取值降级）──
  textColor: '#0f1115', // dsw-raw 官方 --dsw-alias-label-primary 实值（= neutral-bluish-1000）
  secondaryTextColor: '#61666b', // dsw-raw 官方 --dsw-alias-label-secondary 实值（= neutral-bluish-700）
  tertiaryTextColor: '#81858c', // dsw-raw 官方 --dsw-alias-label-tertiary 实值（= neutral-bluish-600）
  primaryBorderColor: '#0000001f', // dsw-raw 官方 --dsw-alias-border-l3 实值
  secondaryBorderColor: '#0000001a', // dsw-raw 官方 --dsw-alias-border-l2 实值
  tertiaryBorderColor: '#0000001a', // dsw-raw 官方 --dsw-alias-border-l2 实值
  noteBorderColor: '#0000001a', // dsw-raw 官方 --dsw-alias-border-l2 实值
  lineColor: '#0000001f', // dsw-raw 官方 --dsw-alias-border-l3 实值
  arrowheadColor: '#0000001f', // dsw-raw 官方 --dsw-alias-border-l3 实值
  edgeLabelBackground: '#2631480f', // dsw-raw 官方 --dsw-alias-interactive-bg-hover 实值
  labelBackgroundColor: '#ffffff', // dsw-raw 官方 --dsw-alias-bg-base 实值（= neutral-bluish-00）
  activationBorderColor: '#0000001f', // dsw-raw 官方 --dsw-alias-border-l3 实值
  sequenceNumberColor: '#61666b', // dsw-raw 官方 --dsw-static-neutral-bluish-700 实值（khroma 派生禁 var()——回退缺陷定性 fix-8）
  loopTextColor: '#61666b', // dsw-raw 官方 --dsw-static-neutral-bluish-700 实值（同上）
} as const

let enginePromise: Promise<MermaidEngine> | undefined

/**
 * 懒加载唯一径（Hard Rule：禁同步 import mermaid——本函数的动态 import 是产品内唯一引用）。
 * 单次装载 + 单次 initialize（模块级 promise 缓存——多图共引擎）；securityLevel='strict'
 * 为安全边界字面量（禁放宽），startOnLoad=false（渲染恒经显式 render 调用）；
 * 1.8 主题化 = theme base + MERMAID_THEME_VARIABLES（单次 initialize 语义不动）。
 */
export function loadMermaidEngine(): Promise<MermaidEngine> {
  enginePromise ??= import('mermaid').then((mod) => {
    const engine = mod.default as MermaidEngine
    engine.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      themeVariables: MERMAID_THEME_VARIABLES,
    })
    return engine
  })
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
    return { ok: true, svg }
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
