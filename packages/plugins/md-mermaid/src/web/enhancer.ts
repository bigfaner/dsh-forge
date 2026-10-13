// DOM 渐进增强器 —— 凡 .md-code-block DOM 即扫描增强（提案 §渲染层 + 附录 B/C）。
// 机制：MutationObserver（防抖合并）全 DOM 扫描 → 内容门控（首行图型关键字 + 可选
// YAML frontmatter——复用 ./validate detectFormat 单源）→ 触发 loadMermaidEngine（./web
// 引擎懒加载唯一径）→ parse 确认 → render 成功旁插图容器并隐藏原 content（不删官方
// 节点）。失败 / 门控不过 / 流式残源 / 探测锚缺席 = 维持官方代码块现状（安全降级，
// 异常不外溢）。幂等：data 标记 + 源 hash——官方重渲重建后按标记去重，同源不重复渲染。
// infostring 渲染后不可观测（附录 B）——判据纯内容。
// 懒加载纪律：门控先行——无关键字块零引擎装载（零动态 import 触发）。
//
// DOM 面收敛为结构化窄接口（EnhancerElement/EnhancerDocument/MutationObserverLike）：
// 浏览器原生 DOM 即合法实现；测试以最小 DOM 替身驱动（仓内零 jsdom）。
import { detectFormat } from '../validate/index.js'
import { loadMermaidEngine, nextMermaidId, renderMermaidDiagram, type MermaidEngine } from './mermaid-diagram.js'

/** 增强标记（原块上：值 = 已渲染源 hash——幂等去重锚） */
export const MD_MERMAID_BLOCK_FLAG = 'data-dswf-md-mermaid-enhanced'
/** 图容器标记（旁插 figure 上：值 = 对应源 hash） */
export const MD_MERMAID_FIGURE_FLAG = 'data-dswf-md-mermaid'

const BLOCK_SELECTOR = '.md-code-block'
const CONTENT_ANCHOR = '[data-code-block-content]'
const CANVAS_SELECTOR = '.dswf-doc-mermaid-canvas'

/** 最小元素面（增强器实际触达的 DOM 收敛集） */
export interface EnhancerElement {
  getAttribute(name: string): string | null
  hasAttribute(name: string): boolean
  setAttribute(name: string, value: string): void
  querySelector(selectors: string): EnhancerElement | null
  readonly parentElement: EnhancerElement | null
  readonly nextElementSibling: EnhancerElement | null
  insertBefore(child: EnhancerElement, ref: EnhancerElement | null): EnhancerElement
  appendChild(child: EnhancerElement): EnhancerElement
  readonly textContent: string
  readonly style: { display?: string }
  innerHTML: string
}

/** 最小文档面 */
export interface EnhancerDocument {
  querySelectorAll(selectors: string): ArrayLike<EnhancerElement>
  createElement(tagName: string): EnhancerElement
  readonly body: EnhancerElement | null
  readonly documentElement: EnhancerElement | null
}

/**
 * mermaid 引擎最小面（./web MermaidEngine + parse 确认可选缺席——缺席时由 render 兜底归一）。
 */
export interface MermaidEngineLike extends MermaidEngine {
  parse?(text: string): Promise<unknown>
}

type MutationObserverLike = { observe(target: unknown, options: unknown): void; disconnect(): void }

export interface MermaidEnhancerOptions {
  /** 承载文档（生产 = window.document） */
  doc: EnhancerDocument
  /** 引擎装载（缺省 ./web 懒加载唯一径） */
  load: () => Promise<MermaidEngineLike>
  /** 防抖窗口（ms，缺省 120） */
  debounceMs: number
  /** 防抖调度（缺省全局 setTimeout/clearTimeout——测试注入假钟） */
  schedule: (fn: () => void, ms: number) => () => void
  /** observer 工厂（缺省全局 MutationObserver——测试注入替身） */
  createObserver: (cb: () => void) => MutationObserverLike
  /** 观察根（缺省 doc.body ?? doc.documentElement） */
  root: EnhancerElement
}

/** FNV-1a 32 位源 hash（幂等去重锚——内容判据，非节点身份） */
function hashSource(source: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < source.length; i++) {
    h ^= source.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}

/** 内容门控：首行图型关键字（含可选 YAML frontmatter 首行）——./validate detectFormat 单源 */
export function isMermaidCandidate(source: string): boolean {
  return detectFormat(source) === 'mermaid'
}

/** 源恢复（附录 B 探测锚：内容锚 + pre textContent；锚缺席 = null → 跳过） */
function extractBlockSource(block: EnhancerElement): string | null {
  const content = block.querySelector(CONTENT_ANCHOR)
  if (content === null) return null
  const pre = content.querySelector('pre') ?? content
  return pre.textContent
}

function defaultSchedule(): MermaidEnhancerOptions['schedule'] {
  const g = globalThis as { setTimeout?: typeof setTimeout; clearTimeout?: typeof clearTimeout }
  if (typeof g.setTimeout !== 'function' || typeof g.clearTimeout !== 'function') {
    throw new Error('md-mermaid enhancer：环境缺 setTimeout/clearTimeout——请注入 schedule')
  }
  const setTimeoutFn = g.setTimeout
  const clearTimeoutFn = g.clearTimeout
  return (fn, ms) => {
    const t = setTimeoutFn(fn, ms)
    return () => clearTimeoutFn(t)
  }
}

function defaultCreateObserver(): MermaidEnhancerOptions['createObserver'] {
  const MO = (globalThis as { MutationObserver?: new (cb: () => void) => MutationObserverLike }).MutationObserver
  if (typeof MO !== 'function') throw new Error('md-mermaid enhancer：环境缺 MutationObserver——请注入 createObserver')
  return (cb) => new MO(cb)
}

export interface MermaidEnhancer {
  /** 全量扫描（可直接调用；MutationObserver 回调经防抖合并后亦走此径） */
  scan(): Promise<void>
  /** 开始观察（幂等；随调用方生命周期） */
  start(): void
  /** 停止观察并取消在途防抖扫描 */
  stop(): void
}

export function createMermaidEnhancer(opts: Partial<MermaidEnhancerOptions> = {}): MermaidEnhancer {
  const docOption = opts.doc ?? (globalThis as { document?: EnhancerDocument }).document
  if (docOption === undefined) throw new Error('md-mermaid enhancer：环境缺 document——请注入 doc')
  const doc: EnhancerDocument = docOption
  const load = opts.load ?? loadMermaidEngine
  const debounceMs = opts.debounceMs ?? 120
  const schedule = opts.schedule ?? defaultSchedule()
  const createObserver = opts.createObserver ?? defaultCreateObserver()
  const root = opts.root ?? doc.body ?? doc.documentElement

  /**
   * 增强单块：门控 → parse 确认 → render → 旁插/更新 figure + 隐藏原块 + 打标记。
   * 返回是否发生了增强；任何失败路径返回 false（维持官方代码块现状）。
   */
  async function enhanceBlock(block: EnhancerElement): Promise<boolean> {
    const source = extractBlockSource(block)
    if (source === null || source.trim() === '') return false
    // 门控先行（懒加载纪律：无关键字块零引擎装载）
    if (!isMermaidCandidate(source)) return false
    const hash = hashSource(source)
    // 幂等：同节点同源已增强——不重复渲染
    if (block.getAttribute(MD_MERMAID_BLOCK_FLAG) === hash) return false

    // parse 确认（流式残源在此回退；引擎装载亦在此首次触发）
    const engine: MermaidEngineLike = await load()
    if (typeof engine.parse === 'function') {
      try {
        await engine.parse(source)
      } catch {
        return false
      }
    }
    const outcome = await renderMermaidDiagram(load, source, nextMermaidId())
    if (!outcome.ok) return false

    // 旁插图容器（源变化复用既有 figure 更新，不叠插）
    const next = block.nextElementSibling
    let figure = next !== null && next.hasAttribute(MD_MERMAID_FIGURE_FLAG) ? next : null
    if (figure === null) {
      figure = doc.createElement('figure')
      figure.setAttribute(MD_MERMAID_FIGURE_FLAG, hash)
      const canvas = doc.createElement('div')
      canvas.setAttribute('class', 'dswf-doc-mermaid-canvas')
      figure.appendChild(canvas)
      block.parentElement?.insertBefore(figure, block.nextElementSibling)
    }
    figure.setAttribute(MD_MERMAID_FIGURE_FLAG, hash)
    const canvas = figure.querySelector(CANVAS_SELECTOR)
    if (canvas !== null) canvas.innerHTML = outcome.svg
    // 隐藏原 content（不删官方节点）+ 打标记
    block.style.display = 'none'
    block.setAttribute(MD_MERMAID_BLOCK_FLAG, hash)
    return true
  }

  async function scan(): Promise<void> {
    const blocks: EnhancerElement[] = []
    const found = doc.querySelectorAll(BLOCK_SELECTOR)
    for (let i = 0; i < found.length; i++) {
      const b = found[i]
      if (b !== undefined) blocks.push(b)
    }
    for (const block of blocks) {
      // 安全降级：单块任何异常不外溢——维持官方代码块现状
      try {
        await enhanceBlock(block)
      } catch {
        /* 降级为官方代码块 */
      }
    }
  }

  let cancelScheduled: (() => void) | null = null
  let observer: MutationObserverLike | null = null

  function requestScan(): void {
    cancelScheduled?.()
    cancelScheduled = schedule(() => {
      cancelScheduled = null
      void scan()
    }, debounceMs)
  }

  return {
    scan,
    start() {
      if (observer !== null) return
      observer = createObserver(requestScan)
      observer.observe(root, { childList: true, subtree: true })
    },
    stop() {
      observer?.disconnect()
      observer = null
      cancelScheduled?.()
      cancelScheduled = null
    },
  }
}
