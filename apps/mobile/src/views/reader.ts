/**
 * 全屏阅读页（屏⑩⑪——mockup .reader 视觉基准）：← 退出 + 文件名 + 「渲染｜文本」胶囊。
 *
 * 五类识别（F8）：md / csv / html 默认渲染可切纯文本；txt 恒纯文本（无胶囊）；
 * 链接走内置浏览器（window.open）。csv/md 表格居中（样式令牌）。
 * md 渲染 = 轻量 rich md 函数（官方 markdown() 语义照搬：标签白名单/块级结构/inline 规则，
 * 样式以原型 DESIGN.md 令牌为准）+ mermaid DOM 增强器动态 import（@dsh-forge/md-mermaid/web
 * ——懒加载纪律：无 mermaid fence 零引擎装载）。
 * 数据通道 = forge:proxy/file（loadProxyFileText：manifest + 逐块 base64）。
 */
import { loadProxyFileText, type RemoteRpc } from '../core/rpc.ts'
import { docFileName, el, renderInline } from '../widgets/msg-cards.ts'

export type DocKind = 'md' | 'csv' | 'html' | 'txt' | 'link'

/** 五类识别：http(s) 链接优先，其余按扩展名（未知扩展 = txt 恒纯文本兜底）。 */
export function docKindOf(path: string): DocKind {
  if (/^https?:\/\//i.test(path)) return 'link'
  switch (path.split('.').pop()?.toLowerCase() ?? '') {
    case 'md':
      return 'md'
    case 'csv':
      return 'csv'
    case 'html':
    case 'htm':
      return 'html'
    default:
      return 'txt'
  }
}

/** 渲染/文本双态胶囊适用类（txt 恒纯文本 → 无胶囊）。 */
export function hasRenderToggle(kind: DocKind): boolean {
  return kind === 'md' || kind === 'csv' || kind === 'html'
}

// ---------------------------------------------------------------------------
// CSV → 居中表格
// ---------------------------------------------------------------------------

/** 单行 CSV 切分（双引号包裹单元含逗号/转义引号）。 */
export function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (let index = 0; index < line.length; index++) {
    const char = line[index]
    if (quoted) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"'
          index++
        } else quoted = false
      } else current += char
    } else if (char === '"') quoted = true
    else if (char === ',') {
      cells.push(current)
      current = ''
    } else current += char
  }
  cells.push(current)
  return cells
}

export function parseCsvTable(text: string): string[][] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line, index, all) => !(line === '' && index === all.length - 1))
    .map(parseCsvLine)
}

export function csvTableElement(text: string): HTMLElement {
  const rows = parseCsvTable(text)
  const table = el('table', 'csv-table')
  rows.forEach((cells, rowIndex) => {
    const tr = el('tr')
    for (const cell of cells) {
      const tag = rowIndex === 0 ? 'th' : 'td'
      const node = el(tag, undefined, cell)
      tr.appendChild(node)
    }
    table.appendChild(tr)
  })
  return table
}

// ---------------------------------------------------------------------------
// rich md（官方 markdown() 语义照搬：fence/标题/列表/引用/表格/段落 + renderInline）
// ---------------------------------------------------------------------------

export interface RichMarkdown {
  readonly root: HTMLElement
  readonly hasMermaid: boolean
}

const MERMAID_LANG = 'mermaid'

function renderBlockLines(container: HTMLElement, lines: readonly string[]): void {
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? ''
    const trimmed = line.trim()
    if (trimmed === '') continue
    // 标题（# ~ ######）
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed)
    if (heading !== null) {
      const level = heading[1]?.length ?? 1
      const node = el(`h${Math.min(level, 6)}` as 'h1')
      renderInline(node, heading[2] ?? '')
      container.appendChild(node)
      continue
    }
    // 水平线
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      container.appendChild(el('hr'))
      continue
    }
    // 引用
    if (trimmed.startsWith('>')) {
      const quote = el('blockquote')
      while (index < lines.length && (lines[index] ?? '').trim().startsWith('>')) {
        const p = el('p')
        renderInline(p, (lines[index] ?? '').trim().replace(/^>\s?/, ''))
        quote.appendChild(p)
        index++
      }
      index--
      container.appendChild(quote)
      continue
    }
    // 无序列表
    if (/^[-*]\s+/.test(trimmed)) {
      const list = el('ul')
      while (index < lines.length && /^[-*]\s+/.test((lines[index] ?? '').trim())) {
        const li = el('li')
        renderInline(li, (lines[index] ?? '').trim().replace(/^[-*]\s+/, ''))
        list.appendChild(li)
        index++
      }
      index--
      container.appendChild(list)
      continue
    }
    // 有序列表
    if (/^\d+[.)]\s+/.test(trimmed)) {
      const list = el('ol')
      while (index < lines.length && /^\d+[.)]\s+/.test((lines[index] ?? '').trim())) {
        const li = el('li')
        renderInline(li, (lines[index] ?? '').trim().replace(/^\d+[.)]\s+/, ''))
        list.appendChild(li)
        index++
      }
      index--
      container.appendChild(list)
      continue
    }
    // 表格（| a | b | 形，第二行 = 分隔行）
    if (trimmed.startsWith('|') && /^\|?[\s:-]+\|/.test((lines[index + 1] ?? '').trim()) && (lines[index + 1] ?? '').includes('-')) {
      const splitRow = (row: string): string[] =>
        row
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((cell) => cell.trim())
      const table = el('table', 'md-table')
      const header = splitRow(lines[index] ?? '')
      const thead = el('thead')
      const headTr = el('tr')
      for (const cell of header) headTr.appendChild(el('th', undefined, cell))
      thead.appendChild(headTr)
      table.appendChild(thead)
      const tbody = el('tbody')
      index += 2
      while (index < lines.length && (lines[index] ?? '').trim().startsWith('|')) {
        const tr = el('tr')
        for (const cell of splitRow(lines[index] ?? '')) tr.appendChild(el('td', undefined, cell))
        tbody.appendChild(tr)
        index++
      }
      index--
      table.appendChild(tbody)
      container.appendChild(table)
      continue
    }
    // 段落（单换行续行并入同段）
    const paragraphLines: string[] = []
    while (
      index < lines.length &&
      (lines[index] ?? '').trim() !== '' &&
      !/^(#{1,6}\s|[-*]\s|\d+[.)]\s|>|\|)/.test((lines[index] ?? '').trim())
    ) {
      paragraphLines.push((lines[index] ?? '').trim())
      index++
    }
    index--
    const p = el('p')
    renderInline(p, paragraphLines.join(' '))
    container.appendChild(p)
  }
}

/** rich md 渲染：fence（```lang）为 .md-code-block，mermaid fence 携 content 锚（增强器门控输入）。 */
export function renderRichMarkdown(text: string): RichMarkdown {
  const container = el('div', 'md rich')
  let hasMermaid = false
  const blocks = text.replace(/\r\n?/g, '\n').split(/```/)
  blocks.forEach((block, blockIndex) => {
    if (blockIndex % 2 === 1) {
      const newline = block.indexOf('\n')
      const lang = (newline === -1 ? block : block.slice(0, newline)).trim().toLowerCase()
      const source = newline === -1 ? '' : block.slice(newline + 1).replace(/\n$/, '')
      const codeBlock = el('div', 'md-code-block')
      const pre = el('pre')
      pre.setAttribute('data-code-block-content', '')
      pre.textContent = source
      codeBlock.appendChild(pre)
      container.appendChild(codeBlock)
      if (lang === MERMAID_LANG) hasMermaid = true
      return
    }
    renderBlockLines(container, block.split('\n'))
  })
  return { root: container, hasMermaid }
}

// ---------------------------------------------------------------------------
// 阅读页装配
// ---------------------------------------------------------------------------

/** mermaid 增强器缺省实现：动态 import（引擎懒加载唯一径）+ 单次 scan（安全降级不外溢）。 */
async function defaultEnhanceMermaid(container: HTMLElement): Promise<void> {
  const web = (await import('@dsh-forge/md-mermaid/web')) as {
    createMermaidEnhancer: (opts?: { root?: unknown }) => { scan(): Promise<void> }
  }
  const enhancer = web.createMermaidEnhancer({ root: container })
  await enhancer.scan().catch(() => {})
}

export interface ReaderDeps {
  readonly path: string
  readonly rpc: RemoteRpc
  readonly onExit: () => void
  /** mermaid 增强（缺省 = @dsh-forge/md-mermaid/web 动态 import + scan）。 */
  readonly enhanceMermaid?: (container: HTMLElement) => Promise<void>
  /** 文本装载（缺省 = forge:proxy/file；测试注入）。 */
  readonly load?: (path: string) => Promise<{ readonly text: string; readonly size: number }>
}

export interface ReaderHandle {
  readonly root: HTMLElement
  /** 渲染|文本当前态（测试/装配观测面）。 */
  mode(): 'rendered' | 'plain'
  destroy(): void
}

export function createReader(deps: ReaderDeps): ReaderHandle {
  const kind = docKindOf(deps.path)
  const root = el('div', 'reader')

  // ---- 顶行：← 退出 + 文件名 + 渲染|文本胶囊 ----
  const bar = el('div', 'rt')
  const back = el('button', 'rt-bk')
  back.setAttribute('aria-label', '退出阅读')
  const backIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  backIcon.setAttribute('class', 'ic')
  backIcon.style.transform = 'rotate(90deg)'
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
  use.setAttribute('href', '#i-chev')
  backIcon.appendChild(use)
  back.appendChild(backIcon)
  const title = el('div', 't', docFileName(deps.path))
  bar.append(back)

  const toggle = el('div', 'rtog')
  const renderedTab = el('span', 'on', '渲染')
  const plainTab = el('span', undefined, '文本')
  toggle.append(renderedTab, plainTab)
  bar.appendChild(title)
  if (hasRenderToggle(kind)) bar.appendChild(toggle)
  root.appendChild(bar)

  const body = el('div', 'body')
  body.appendChild(el('div', 'sys-line', '加载中……'))
  root.appendChild(body)

  let currentMode: 'rendered' | 'plain' = 'rendered'
  let loaded: { readonly text: string } | null = null

  function syncToggle(): void {
    renderedTab.classList.toggle('on', currentMode === 'rendered')
    plainTab.classList.toggle('on', currentMode === 'plain')
  }

  function renderBody(): void {
    const text = loaded?.text ?? ''
    body.textContent = ''
    if (currentMode === 'plain' || kind === 'txt') {
      // txt 恒纯文本（无胶囊——kind 判据优先于模式态）
      const pre = el('pre', 'plain')
      pre.textContent = text
      body.appendChild(pre)
      return
    }
    if (kind === 'csv') {
      body.appendChild(csvTableElement(text))
      return
    }
    if (kind === 'html') {
      const frame = el('iframe', 'html-frame')
      frame.setAttribute('sandbox', '')
      frame.setAttribute('srcdoc', text)
      body.appendChild(frame)
      return
    }
    const rich = renderRichMarkdown(text)
    body.appendChild(rich.root)
    if (rich.hasMermaid) {
      void (deps.enhanceMermaid ?? defaultEnhanceMermaid)(rich.root).catch(() => {})
    }
  }

  function setMode(mode: 'rendered' | 'plain'): void {
    if (currentMode === mode) return
    currentMode = mode
    syncToggle()
    renderBody()
  }
  renderedTab.addEventListener('click', () => setMode('rendered'))
  plainTab.addEventListener('click', () => setMode('plain'))
  back.addEventListener('click', () => deps.onExit())

  if (kind === 'link') {
    body.textContent = ''
    body.appendChild(el('div', 'sys-line', '正在打开链接……'))
    window.open(deps.path, '_blank', 'noopener')
    deps.onExit()
  } else {
    const load = deps.load ?? ((path: string) => loadProxyFileText(deps.rpc, path))
    void load(deps.path)
      .then((file) => {
        loaded = { text: file.text }
        renderBody()
      })
      .catch((error: unknown) => {
        body.textContent = ''
        body.appendChild(
          el('div', 'sys-line err', `读取失败：${error instanceof Error ? error.message : String(error)}`),
        )
      })
  }

  return {
    root,
    mode: () => currentMode,
    destroy() {
      root.remove()
    },
  }
}
