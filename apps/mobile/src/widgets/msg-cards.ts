/**
 * 消息卡家族：Projection → DOM（mockup 屏①②③ 视觉基准）。
 *
 * 三层级视觉：气泡（user 蓝 / agent 灰）· 活动卡（thinking/tool 左缘无气泡，
 * 行语言对齐桌面 ui-tool 刻度：24px 行高 / 16px 图标位 / 2px 点隔符 /
 * ioCard 双段展开卡）· 系统层（循环卡/chip 居中）。
 *
 * 纯函数面（单测主战场）：配对、工具状态、shell 判别、折叠空间纪律、loop kind。
 */
import type { Projection, TextPart } from '../core/wire.ts'

// ---------------------------------------------------------------------------
// 纯函数：工具卡配对 / 状态 / shell 判别
// ---------------------------------------------------------------------------

export type ToolCardState = 'running' | 'done' | 'error'

export interface ToolCallProjection {
  readonly kind: 'tool-call'
  readonly seq: number
  readonly callId: string
  readonly name: string
  readonly arguments: string
}

export interface ToolResultProjection {
  readonly kind: 'tool-result'
  readonly seq: number
  readonly callId: string
  readonly isError: boolean
  readonly text: string
}

export interface ToolActivity {
  readonly call: ToolCallProjection
  readonly result?: ToolResultProjection
  readonly state: ToolCardState
}

/** tool/call + tool/result 按 data.message.toolCallId 配对（AD-4 A 档配对键）。 */
export function pairToolActivity(projections: readonly Projection[]): ToolActivity[] {
  const calls: ToolCallProjection[] = []
  const resultByCallId = new Map<string, ToolResultProjection>()
  for (const projection of projections) {
    if (projection.kind === 'tool-call') calls.push(projection)
    else if (projection.kind === 'tool-result') resultByCallId.set(projection.callId, projection)
  }
  return calls.map((call) => {
    const result = resultByCallId.get(call.callId)
    const state: ToolCardState =
      result === undefined ? 'running' : result.isError ? 'error' : 'done'
    return result === undefined ? { call, state } : { call, result, state }
  })
}

/** shell 类工具 = 终端风格块；其余 = ioCard 双段分段卡（mockup 图例）。 */
const SHELL_TOOL_NAMES = new Set(['shell', 'pwsh', 'bash', 'cmd', 'powershell', 'zsh'])

export function isShellTool(name: string): boolean {
  return SHELL_TOOL_NAMES.has(name.toLowerCase())
}

/**
 * 收起态标签（用户裁决 2026-10-22：命令工具收起 = 「运行命令 {description}」，对齐桌面
 * ui-tool 行）。shell 族 label 恒「运行命令」、preview 取入参 description（缺席回退参数
 * 原文）；非 shell 工具维持「工具名 + 参数预览」现状。
 */
export function toolCollapsedLabel(name: string, args: string): { readonly label: string; readonly preview: string } {
  if (!isShellTool(name)) return { label: name, preview: args }
  try {
    const parsed = JSON.parse(args) as { description?: unknown }
    if (typeof parsed.description === 'string' && parsed.description !== '') {
      return { label: '运行命令', preview: parsed.description }
    }
  } catch {
    /* 参数非 JSON——回退原文 */
  }
  return { label: '运行命令', preview: args }
}

// ---------------------------------------------------------------------------
// 纯函数：折叠空间纪律
// ---------------------------------------------------------------------------

export const COLLAPSE_LINE_THRESHOLD = 8
/** 收起预览最小高度（mockup .msg.collapsed .body max-height:96px）。 */
const PREVIEW_MIN_PX = 96
/** 长行折行估宽（14px 中文气泡内容 ≈ 44 列）。 */
const WRAP_COLUMNS = 44

/** 渲染行数估算：显式换行 + 长行折行。 */
export function estimateLineCount(text: string, columns = WRAP_COLUMNS): number {
  return text.split('\n').reduce((total, line) => total + Math.max(1, Math.ceil(line.length / columns)), 0)
}

/** 折叠判据：> ~8 行收起为预览（mockup 长消息折叠图例）。 */
export function shouldCollapseMessage(text: string): boolean {
  return estimateLineCount(text) > COLLAPSE_LINE_THRESHOLD
}

/** 预览高度 = 排版行高整数倍（≥96px），避免文字被拦腰截断（mockup 取舍说明）。 */
export function collapseMaxHeight(lineHeightPx: number, minPx = PREVIEW_MIN_PX): number {
  return Math.ceil(minPx / lineHeightPx) * lineHeightPx
}

// ---------------------------------------------------------------------------
// 纯函数：loop 卡 kind 色条（dispatch 蓝 / followup 浅蓝 / state 灰 / done 绿）
// ---------------------------------------------------------------------------

export type LoopKind = 'dispatch' | 'followup' | 'state' | 'done'

/**
 * verb → kind 色条映射（R10-F3：值集单源 = plugin-forge loop/driver.ts emitProgress
 * verb 全集 claim / claim-resume / settle / stop；旧叙述别名 dispatch/followup 兼容保留）。
 * done 状态优先；settle(blocked)/stop(interrupted)/未知 → state 灰。
 */
export function loopKindOf(verb: string, status: string): LoopKind {
  if (status === 'done' || status === 'completed' || status === '已完成') return 'done'
  switch (verb) {
    case 'claim':
    case 'dispatch':
    case '派发':
      return 'dispatch'
    case 'claim-resume':
    case 'followup':
    case '续跑':
    case 'inject':
      return 'followup'
    default:
      return 'state'
  }
}

/** 状态徽标文案/档位（同任务面板色板：run/paused/blocked/done）。 */
export function loopBadge(status: string): { readonly text: string; readonly tone: 'run' | 'paused' | 'blocked' | 'done' } {
  switch (status) {
    case 'running':
    case '运行中':
      return { text: '运行中', tone: 'run' }
    case 'paused':
    case '暂停':
      return { text: '已暂停', tone: 'paused' }
    case 'blocked':
    case '阻塞':
      return { text: '阻塞', tone: 'blocked' }
    default:
      return { text: '已完成', tone: 'done' }
  }
}

// ---------------------------------------------------------------------------
// DOM 基元
// ---------------------------------------------------------------------------

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className !== undefined) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

/** 共享 SVG symbol sprite（use href 引用；Chat 装配时注入一次）。 */
export const ICON_SPRITE_ID = 'm-icon-sprite'

export function ensureIconSprite(root: HTMLElement): void {
  if (document.getElementById(ICON_SPRITE_ID) !== null) return
  const holder = document.createElement('div')
  holder.id = ICON_SPRITE_ID
  holder.style.display = 'none'
  holder.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">
    <symbol id="i-menu" viewBox="0 0 24 24"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="14" y2="12"/></symbol>
    <symbol id="i-new" viewBox="0 0 24 24"><path d="M12 3a9 9 0 019 9 9 9 0 01-9 9 9 9 0 01-4.3-1.1L3 21l1.1-4.7A9 9 0 0112 3z"/><line x1="12" y1="8.5" x2="12" y2="15.5"/><line x1="8.5" y1="12" x2="15.5" y2="12"/></symbol>
    <symbol id="i-mode" viewBox="0 0 24 24"><path d="M12 3l2.4 4.9L20 9l-4 3.9.9 5.6L12 15.9 7.1 18.5 8 12.9 4 9l5.6-1.1z"/></symbol>
    <symbol id="i-branch" viewBox="0 0 24 24"><circle cx="7" cy="5" r="2.2"/><circle cx="7" cy="19" r="2.2"/><circle cx="17" cy="9" r="2.2"/><path d="M7 7.2v9.6"/><path d="M17 11.2c0 3.5-4 4-7 4.6"/></symbol>
    <symbol id="i-chev" viewBox="0 0 24 24"><path d="M8 10l4 4 4-4"/></symbol>
    <symbol id="i-chev-r" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></symbol>
    <symbol id="i-send" viewBox="0 0 24 24"><path d="M5 12h13"/><path d="M12 6l6 6-6 6"/></symbol>
    <symbol id="i-down" viewBox="0 0 24 24"><path d="M6 10l6 6 6-6"/></symbol>
    <symbol id="i-loop" viewBox="0 0 24 24"><path d="M17 4v5h-5"/><path d="M7 20v-5h5"/><path d="M17 9a7 7 0 0 0-12-2M7 15a7 7 0 0 0 12 2"/></symbol>
    <symbol id="i-think" viewBox="0 0 24 24"><path d="M12 3a6.5 6.5 0 0 0-4.3 11.4c.6.5 1 1.2 1 2v.6h6.6v-.6c0-.8.4-1.5 1-2A6.5 6.5 0 0 0 12 3z"/><path d="M9.5 20.5h5"/></symbol>
    <symbol id="i-tool" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 9l2.5 2.5L7 14"/><path d="M12.5 14h4.5"/></symbol>
    <symbol id="i-check" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></symbol>
    <symbol id="i-warn" viewBox="0 0 24 24"><path d="M12 8v5"/><circle cx="12" cy="16.5" r="0.5"/><path d="M12 3l9.5 16.5h-19z"/></symbol>
    <symbol id="i-sub" viewBox="0 0 24 24"><circle cx="8" cy="12" r="3"/><circle cx="17" cy="7" r="2.2"/><circle cx="17" cy="17" r="2.2"/><path d="M10.7 10.8l4.3-2.6M10.7 13.2l4.3 2.6"/></symbol>
    <symbol id="i-job" viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="13" rx="2"/><path d="M9 6V4h6v2M4 10h16"/></symbol>
    <symbol id="i-sliders" viewBox="0 0 24 24"><path d="M4 7h9"/><path d="M17 7h3"/><circle cx="15" cy="7" r="1.8"/><path d="M4 17h3"/><path d="M11 17h9"/><circle cx="9" cy="17" r="1.8"/></symbol>
    <symbol id="i-doc" viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></symbol>
    <symbol id="i-folder" viewBox="0 0 24 24"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></symbol>
    <symbol id="i-pin" viewBox="0 0 24 24"><path d="M9 3h6l-1 7 3 3H7l3-3z"/><path d="M12 13v7"/></symbol>
  </svg>`
  root.prepend(holder)
}

function svgIcon(symbolId: string, className = 'ic'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('class', className)
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
  use.setAttribute('href', `#${symbolId}`)
  svg.appendChild(use)
  return svg
}

// ---------------------------------------------------------------------------
// 轻量 md 渲染（纯 DOM 构造，零 innerHTML 注入用户文本）
// ---------------------------------------------------------------------------

/** 行内 span：`code` 高亮 / @mention / /cmd / http(s) 链接（mockup mention 词汇）。 */
export function renderInline(parent: HTMLElement, text: string): void {
  const pattern = /(`[^`]+`)|(https?:\/\/\S+)|(@[\w/-]+)|(\/[\w-]+)|(\*\*[^*]+\*\*)/g
  let cursor = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > cursor) parent.appendChild(el('span', undefined, text.slice(cursor, index)))
    const [raw] = match
    if (raw.startsWith('`')) {
      parent.appendChild(el('code', undefined, raw.slice(1, -1)))
    } else if (raw.startsWith('http')) {
      const link = el('a', undefined, raw)
      link.href = raw
      link.target = '_blank'
      link.rel = 'noopener'
      parent.appendChild(link)
    } else if (raw.startsWith('@')) {
      parent.appendChild(el('span', 'mention', raw))
    } else if (raw.startsWith('/')) {
      parent.appendChild(el('span', 'mention', raw))
    } else {
      parent.appendChild(el('b', undefined, raw.slice(2, -2)))
    }
    cursor = index + raw.length
  }
  if (cursor < text.length) parent.appendChild(el('span', undefined, text.slice(cursor)))
}

/** 段落级 md：空行分段 + ``` 代码块（零依赖轻量语义，样式对齐 mockup）。 */
export function renderMarkdown(text: string): HTMLElement {
  const container = el('div', 'md')
  const blocks = text.split(/```/)
  blocks.forEach((block, blockIndex) => {
    if (blockIndex % 2 === 1) {
      const pre = el('pre')
      pre.textContent = block.replace(/^\w*\n/, '').replace(/\n$/, '')
      container.appendChild(pre)
      return
    }
    for (const paragraph of block.split(/\n{2,}/)) {
      const trimmed = paragraph.trim()
      if (trimmed === '') continue
      const p = el('p')
      renderInline(p, trimmed)
      container.appendChild(p)
    }
  })
  return container
}

// ---------------------------------------------------------------------------
// 卡片渲染
// ---------------------------------------------------------------------------

function textPreview(text: string): string {
  const firstLine = text.split('\n').find((line) => line.trim() !== '') ?? ''
  return firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine
}

/** thinking 活动卡（reasoning 摘要 + 展开 body）。展开/收起 = details 点击（用户裁决：无 ▶ 指示）。 */
export function renderThinkCard(reasoning: string): HTMLElement {
  const details = el('details', 'think')
  const summary = el('summary')
  summary.appendChild(svgIcon('i-think', 'ic act-ic'))
  summary.appendChild(el('span', undefined, '思考中'))
  summary.appendChild(el('span', 'act-dot'))
  summary.appendChild(el('span', 'act-sum', textPreview(reasoning)))
  const body = el('div', 'think-body')
  body.textContent = reasoning
  details.append(summary, body)
  return details
}

function toolSummary(activity: ToolActivity): HTMLElement {
  const summary = el('summary')
  const symbol =
    activity.state === 'error' ? 'i-warn' : activity.state === 'done' ? 'i-check' : 'i-tool'
  const iconClass = activity.state === 'error' ? 'ic act-ic st-err' : activity.state === 'done' ? 'ic act-ic st-done' : 'ic act-ic'
  summary.appendChild(svgIcon(symbol, iconClass))
  // 用户裁决 2026-10-22：收起态标签经 toolCollapsedLabel（命令工具 = 「运行命令 {description}」）
  const { label, preview } = toolCollapsedLabel(activity.call.name, activity.call.arguments)
  summary.appendChild(el('span', undefined, label))
  summary.appendChild(el('span', 'act-dot'))
  summary.appendChild(
    el('span', 'act-sum', activity.result === undefined ? textPreview(preview) : textPreview(activity.result.text)),
  )
  // 用户裁决：无 ▶ 指示——展开/收起 = summary 点击（details 原生语义不变）
  return summary
}

/** shell 工具终端块：首行 $ 命令，其后输出；错误红显。 */
function terminalBlock(activity: ToolActivity): HTMLElement {
  const term = el('div', 'term')
  term.appendChild(el('span', 'cmd', activity.call.arguments))
  if (activity.result !== undefined) {
    term.appendChild(el('span', activity.result.isError ? 'out err' : 'out', activity.result.text))
  } else {
    term.appendChild(el('span', 'out', '运行中……'))
  }
  return term
}

/** 非 shell 工具 = ioCard 双段分段卡（收起 = 结果段 ~3 行预览渐隐；展开 = 调用段在上方撑开）。 */
function ioCardSections(activity: ToolActivity): HTMLElement {
  const body = el('div', 'tool-body')
  const callSection = el('div', 'tsec call')
  callSection.appendChild(el('div', 'lab', '调用'))
  const callPre = el('pre')
  callPre.textContent = activity.call.arguments
  callSection.appendChild(callPre)
  body.appendChild(callSection)
  body.appendChild(el('div', 'tdiv'))
  const resultSection = el('div', 'tsec result')
  const lab = el('div', activity.result?.isError === true ? 'lab err' : 'lab', '结果')
  resultSection.appendChild(lab)
  const resultPre = el('pre')
  resultPre.textContent = activity.result?.text ?? '运行中……'
  resultSection.appendChild(resultPre)
  body.appendChild(resultSection)
  return body
}

export function renderToolCard(activity: ToolActivity): HTMLElement {
  const details = el('details', 'tool')
  details.dataset.state = activity.state
  if (activity.state === 'running') details.open = true
  details.appendChild(toolSummary(activity))
  const shell = isShellTool(activity.call.name)
  if (shell) {
    const body = el('div', 'tool-body')
    body.appendChild(terminalBlock(activity))
    details.appendChild(body)
  } else {
    details.appendChild(ioCardSections(activity))
  }
  return details
}

/** 长消息折叠：>~8 行收起（预览高 = 行高整数倍），「展开全部」原位解除。 */
export function renderAssistantBubble(text: string, opts?: { readonly streaming?: boolean; readonly interrupted?: boolean }): HTMLElement {
  const bubble = el('div', 'msg agent')
  const body = el('div', 'body')
  body.appendChild(renderMarkdown(text))
  bubble.appendChild(body)
  if (opts?.interrupted === true) bubble.appendChild(el('div', 'interrupted-line', '— 已中断 —'))
  if (shouldCollapseMessage(text)) {
    bubble.classList.add('collapsed')
    body.style.maxHeight = `${collapseMaxHeight(22)}px`
    const expand = el('button', 'expand', '展开全部 ▾')
    expand.addEventListener('click', () => {
      bubble.classList.remove('collapsed')
      body.style.removeProperty('max-height')
      expand.remove()
    })
    bubble.appendChild(expand)
  }
  if (opts?.streaming === true) bubble.appendChild(el('span', 'streaming'))
  return bubble
}

function statusBadge(status: string): HTMLElement {
  const badge = loopBadge(status)
  return el('span', `st ${badge.tone}`, badge.text)
}

// ---------------------------------------------------------------------------
// 循环叙述卡（forge-loop，1.19）+ 同 runId 退化 chip
// ---------------------------------------------------------------------------

export type NarrativeProjection = Extract<Projection, { kind: 'loop-narrative' }>

const NARRATIVE_STATE_LABELS: Readonly<Record<string, string>> = {
  dispatch: '派发',
  followup: '续跑',
}

/**
 * 同 runId 聚合：每组 runId 仅最新（seq 最大）保持完整叙述卡，其余退化为单行 chip。
 * 纯函数返回退化 seq 集——渲染按原位替换，时间线不重排。
 */
export function degradedNarrativeSeqs(projections: readonly Projection[]): ReadonlySet<number> {
  const latestByRun = new Map<string, number>()
  for (const projection of projections) {
    if (projection.kind !== 'loop-narrative') continue
    latestByRun.set(projection.runId, Math.max(latestByRun.get(projection.runId) ?? -1, projection.seq))
  }
  const degraded = new Set<number>()
  for (const projection of projections) {
    if (projection.kind === 'loop-narrative' && projection.seq !== latestByRun.get(projection.runId)) {
      degraded.add(projection.seq)
    }
  }
  return degraded
}

/** 循环叙述卡（source.kind forge-loop —— 非蓝气泡，循环族色条 + 状态词徽标）。 */
export function renderNarrativeCard(projection: NarrativeProjection): HTMLElement {
  const kind = loopKindOf(projection.state, '')
  const card = el('div', `loop ${kind} narrative`)
  const hd = el('div', 'hd')
  hd.appendChild(svgIcon('i-loop'))
  hd.appendChild(el('span', undefined, '任务循环'))
  hd.appendChild(el('span', 'st run', NARRATIVE_STATE_LABELS[projection.state] ?? projection.state ?? '注入'))
  card.append(hd, el('div', 'bd', projection.text))
  return card
}

/** 同 runId 非最新退化：单行 chip 原位替换（时间线不重排）。 */
export function renderNarrativeChip(projection: NarrativeProjection): HTMLElement {
  const chip = el('div', 'loop-chip')
  chip.appendChild(svgIcon('i-loop'))
  chip.appendChild(el('span', undefined, textPreview(projection.text)))
  chip.appendChild(el('span', 'n', '循环'))
  return chip
}

/** forge 循环卡（kind 定色条）+ 循环 chip + 系统 chip/行。 */
export function renderLoopCard(projection: Extract<Projection, { kind: 'loop-progress' }>): HTMLElement {
  const kind = loopKindOf(projection.verb, projection.status)
  const card = el('div', `loop ${kind}`)
  const hd = el('div', 'hd')
  hd.appendChild(svgIcon('i-loop'))
  hd.appendChild(el('span', undefined, `任务循环 · ${projection.sourceSlug}`))
  hd.appendChild(statusBadge(projection.status))
  const counts = Object.entries(projection.counts)
    .map(([key, value]) => `${key} ${value}`)
    .join(' · ')
  const bd = el('div', 'bd', `${projection.verb} ${projection.taskKey}${counts === '' ? '' : ` · ${counts}`}`)
  card.append(hd, bd)
  return card
}

export function renderCommandChip(projection: Extract<Projection, { kind: 'command-chip' }>): HTMLElement {
  const chip = el('div', 'loop-chip')
  chip.appendChild(svgIcon('i-loop'))
  chip.appendChild(el('span', undefined, `${projection.name}${projection.args === '' ? '' : ` · ${projection.args}`}`))
  chip.appendChild(
    el('span', 'n', projection.done === undefined ? '进行中' : projection.done.kind),
  )
  return chip
}

function docBadgeOf(path: string): { readonly badge: string; readonly tone: string } {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    case 'md':
      return { badge: 'MD', tone: 'md' }
    case 'csv':
      return { badge: 'CSV', tone: 'csv' }
    case 'html':
    case 'htm':
      return { badge: 'HTM', tone: 'html' }
    case 'txt':
      return { badge: 'TXT', tone: 'txt' }
    default:
      return { badge: 'WWW', tone: 'link' }
  }
}

/** 文档卡文件名（正/反斜杠路径末段——mockup 屏⑨ 徽标卡口径）。 */
export function docFileName(path: string): string {
  const normalized = path.replaceAll('\\', '/')
  const name = normalized.split('/').pop() ?? ''
  return name === '' ? path : name
}

/** size 人类可读（mockup 屏⑨ 刻度：B / KB 一位小数 / MB）。 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * 文档卡（deliverables/presented 五类识别 md/txt/csv/html/链接；文件名 + size 右对齐 › 前）。
 * size 缺席 = 卡上留空，resolveSize 异步回填（forge:proxy/file manifest——fail-soft 留空）。
 */
export function renderDocCard(
  file: { readonly description?: string; readonly path: string; readonly size?: number },
  onOpen?: (path: string) => void,
  resolveSize?: (path: string) => Promise<number | undefined>,
): HTMLElement {
  const { badge, tone } = docBadgeOf(file.path)
  const card = el('div', 'fcard')
  card.title = file.description ?? file.path
  card.appendChild(el('span', `fic ${tone}`, badge))
  const copy = el('span', 'fc-copy')
  copy.appendChild(el('span', 'fc-name', docFileName(file.path)))
  card.appendChild(copy)
  const sizeCell = el('span', 'fc-size', file.size === undefined ? '' : formatSize(file.size))
  card.appendChild(sizeCell)
  const chev = el('span', 'chev-r')
  chev.appendChild(svgIcon('i-chev-r'))
  card.appendChild(chev)
  if (resolveSize !== undefined && file.size === undefined) {
    void resolveSize(file.path).then((size) => {
      if (typeof size === 'number') sizeCell.textContent = formatSize(size)
    }).catch(() => {})
  }
  if (onOpen !== undefined) card.addEventListener('click', () => onOpen(file.path))
  return card
}

export function renderApprovalCard(projection: Extract<Projection, { kind: 'approval-card' }>): HTMLElement {
  const card = el('div', 'loop state')
  const hd = el('div', 'hd')
  hd.appendChild(svgIcon(projection.phase === 'decided' && projection.outcome === 'approved' ? 'i-check' : 'i-warn'))
  hd.appendChild(el('span', undefined, projection.toolName ?? '审批'))
  hd.appendChild(
    projection.phase === 'asked'
      ? el('span', 'st paused', '等待审批')
      : el('span', projection.outcome === 'approved' ? 'st done' : 'st blocked', projection.outcome ?? '已裁决'),
  )
  card.appendChild(hd)
  if (projection.reason !== undefined) card.appendChild(el('div', 'bd', projection.reason))
  return card
}

/**
 * 单条 Projection → DOM。未知 kind 由编译期穷举保证；error-card 不静默吞。
 * streaming 尾标 + interrupted 标记由 chat 流式层经 opts 传入（assistant-message）。
 */
export interface RenderCardOptions {
  readonly streamingSeq?: number
  readonly onOpenDoc?: (path: string) => void
  /** 文档卡 size 异步回填（forge:proxy/file manifest——装配层注入）。 */
  readonly resolveDocSize?: (path: string) => Promise<number | undefined>
  /** loop-narrative 同 runId 非最新 → 退化单行 chip（时间线不重排）。 */
  readonly degradedNarrative?: boolean
}

export function renderCard(projection: Projection, opts: RenderCardOptions = {}): HTMLElement {
  switch (projection.kind) {
    case 'user-bubble': {
      const bubble = el('div', 'msg user')
      renderInline(bubble, projection.text)
      return bubble
    }
    case 'assistant-message': {
      // bug 9053cfbe：纯 tool-call 载体轮零渲染——hidden 占位保 appendChild 面
      if (isEmptyAssistantTurn(projection, opts.streamingSeq)) {
        const stub = el('div')
        stub.hidden = true
        return stub
      }
      return renderAssistantBubble(projection.text, {
        ...(projection.interrupted ? { interrupted: true } : {}),
        ...(opts.streamingSeq === projection.seq ? { streaming: true } : {}),
      })
    }
    case 'tool-call':
    case 'tool-result':
      // 未配对的散卡不渲染——由 pairToolActivity 配对后经 renderToolCard 输出
      return el('div', 'sys-line', '')
    case 'loop-narrative':
      return opts.degradedNarrative === true ? renderNarrativeChip(projection) : renderNarrativeCard(projection)
    case 'model-selection-chip': {
      const chip = el('div', 'loop-chip')
      chip.appendChild(svgIcon('i-mode'))
      chip.appendChild(el('span', undefined, `${projection.provider} · ${projection.model}`))
      return chip
    }
    case 'plan-mode-chip': {
      const chip = el('div', 'loop-chip')
      chip.appendChild(svgIcon('i-check'))
      chip.appendChild(el('span', undefined, projection.active ? '计划模式开启' : '计划模式关闭'))
      return chip
    }
    case 'loop-progress':
      return renderLoopCard(projection)
    case 'command-chip':
      return renderCommandChip(projection)
    case 'approval-card':
      return renderApprovalCard(projection)
    case 'compaction-summary-line': {
      const line = el('div', 'sys-line', textPreview(projection.text))
      return line
    }
    case 'deliverables-card': {
      const wrap = el('div', 'doc-stack')
      for (const file of projection.files) wrap.appendChild(renderDocCard(file, opts.onOpenDoc, opts.resolveDocSize))
      return wrap
    }
    case 'neutral-line':
      return el('div', 'sys-line', projection.type)
    case 'error-card':
      return el('div', 'sys-line err', `未投影事件：${projection.type}`)
  }
}

/** thinking 独立投影（assistant-message 仅 reasoning 无正文时）。 */
export function isReasoningOnly(
  projection: Projection,
): projection is Extract<Projection, { kind: 'assistant-message' }> {
  return projection.kind === 'assistant-message' && projection.text === '' && projection.reasoning !== ''
}

/** bug 9053cfbe：纯 tool-call 载体轮判定——零文本零思考非 interrupted 非 streaming 尾，
 *  渲染层跳过（否则渲染空灰气泡噪音条）。 */
export function isEmptyAssistantTurn(
  projection: Extract<Projection, { kind: 'assistant-message' }>,
  streamingSeq?: number,
): boolean {
  return (
    projection.text === '' &&
    projection.reasoning === '' &&
    projection.interrupted !== true &&
    streamingSeq !== projection.seq
  )
}

export type { TextPart }
