// 文档分段纯逻辑（定位：业务——UF-2 文档 tab：md 段与 mermaid 段的分段解析）。
// 职责：把 forgeDocs.read 返回的 markdown 全文切成 md 段 / mermaid 段交替序列——
// md 段经 MarkdownDoc（官方渲染器唯一径）、mermaid 段经 MermaidDiagram 懒加载渲染
// （tech-design Interface 4 注记：mermaid 段经文档 tab 分段渲染）。
// 口径：①fence 开行 = 行首 ≤3 空格 + ```/~~~ ≥3（CommonMark 同型）；②info 首词 =
// 'mermaid' 才入 mermaid 段（其余 fence 整体归 md 段——官方渲染器自渲代码块，且嵌套在
// 非 mermaid fence 内的 ```mermaid 文本不误分段：fence 内部为字面量，fence 不嵌套）；
//③未闭合 fence（无收尾行）视为正文原样归 md 段（不吞正文——与 MarkdownDoc
// stripMarkdownFrontmatter 同口径）；④零 mermaid 段 = 单 md 段原样（懒加载零触发的前提）。
// 纯函数零依赖（Node 单测面——renderToStaticMarkup 之外的可测层）。

/** 文档段（tagged：md 正文段 / mermaid 图源段） */
export type DocSegment =
  | { readonly kind: 'md'; readonly text: string }
  | { readonly kind: 'mermaid'; readonly source: string }

/** fence 开行（≤3 空格缩进 + ```/~~~ ≥3 + info 串；info 可含属性后缀） */
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/
/** fence 闭行（同字符 ≥开行长度 + 纯空白尾——闭行禁 info，CommonMark 同型） */
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/

/** info 首词是否 mermaid（`mermaid` / `mermaid title=…` 同入；空/其他语言 = 否） */
function isMermaidInfo(info: string): boolean {
  const first = info.trim().split(/\s+/)[0]
  return first === 'mermaid'
}

/** 开行是否本 fence 的闭行（同 fence 字符且长度 ≥ 开行长度） */
function isClosingFence(line: string, char: '`' | '~', length: number): boolean {
  const m = FENCE_CLOSE.exec(line)
  if (m === null) return false
  const marker = m[1] ?? ''
  return marker[0] === char && marker.length >= length
}

/** 进行中的 fence 采集态 */
interface FenceState {
  readonly char: '`' | '~'
  readonly length: number
  readonly mermaid: boolean
  /** 开行原文（未闭合回填 md 用） */
  readonly openLine: string
  readonly lines: string[]
}

/**
 * 文档分段（纯函数）：md 段 / mermaid 段交替序列；纯 md 文档 = 单 md 段。
 * md 段首尾空白行裁去（渲染面零语义的残段）；纯空白 md 段丢弃——不占段。
 */
export function splitDocSegments(content: string): readonly DocSegment[] {
  const segments: DocSegment[] = []
  let mdLines: string[] = []
  let fence: FenceState | undefined

  const flushMd = (): void => {
    let start = 0
    let end = mdLines.length
    while (start < end && (mdLines[start] ?? '').trim() === '') start += 1
    while (end > start && (mdLines[end - 1] ?? '').trim() === '') end -= 1
    if (end > start) segments.push({ kind: 'md', text: mdLines.slice(start, end).join('\n') })
    mdLines = []
  }

  for (const line of content.split('\n')) {
    if (fence === undefined) {
      const m = FENCE_OPEN.exec(line)
      if (m === null) {
        mdLines.push(line)
        continue
      }
      const marker = m[1] ?? ''
      const mermaid = isMermaidInfo(m[2] ?? '')
      if (mermaid) {
        // md 段收段推迟到 fence 确认闭合（未闭合 = 正文，md 行与 fence 行连续归一段）
        fence = { char: marker[0] as '`' | '~', length: marker.length, mermaid: true, openLine: line, lines: [] }
      } else {
        // 非 mermaid fence：开行/闭行/内容整体归 md（官方渲染器自渲代码块）
        mdLines.push(line)
        fence = { char: marker[0] as '`' | '~', length: marker.length, mermaid: false, openLine: line, lines: [] }
      }
    } else if (fence.mermaid) {
      if (isClosingFence(line, fence.char, fence.length)) {
        flushMd()
        segments.push({ kind: 'mermaid', source: fence.lines.join('\n') })
        fence = undefined
      } else {
        fence.lines.push(line)
      }
    } else {
      mdLines.push(line)
      if (isClosingFence(line, fence.char, fence.length)) fence = undefined
    }
  }

  // 未闭合 fence：视为正文原样归 md 段（不吞正文）
  if (fence !== undefined && fence.mermaid) {
    mdLines.push(fence.openLine, ...fence.lines)
  }
  flushMd()
  return segments
}

/** 是否含 mermaid 段（懒加载触发判据——false = 零动态 import） */
export function hasMermaidSegment(segments: readonly DocSegment[]): boolean {
  return segments.some((s) => s.kind === 'mermaid')
}
