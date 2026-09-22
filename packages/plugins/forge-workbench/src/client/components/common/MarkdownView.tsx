/**
 * The workbench's shared READ-ONLY markdown renderer (task 5.2, tech-design
 * T3 mitigation / ui-design 全局规则「markdown 只读渲染(防注入)」). One
 * component serves every prose surface: task descriptions (5.7), execution
 * records (5.7), and the five feature doc kinds (5.9). Docs arrive via IPC as
 * plain text and must be treated as adversarial input.
 *
 * Security model — default-deny whitelist (task Hard Rule: 白名单制,不得黑名单):
 *
 * 1. No HTML string is ever built. `dangerouslySetInnerHTML` does not exist
 *    in this file. marked's LEXER turns the source into a token tree and this
 *    module maps tokens onto a FIXED vocabulary of inert React elements
 *    (h1-h6, p, ul/ol/li, blockquote, pre/code, table/thead/tbody/tr/th/td,
 *    hr, br, strong, em, code, span + text). Elements outside that vocabulary
 *    (a[href], img, iframe, script, style, form controls, …) are not
 *    producible by construction — there is no code path from content to an
 *    element name or attribute name.
 * 2. Raw HTML (block or inline) is never parsed: `html`/`tag` tokens degrade
 *    to their literal source text, so script/style/on* payloads stay visible
 *    inert text (剥离或转义为纯文本).
 * 3. The single URL gate is {@link resolveDocHref}: entity-decode → length
 *    cap → WHATWG URL parse → protocol must be http/https/mailto. Everything
 *    else — javascript:, data:, vbscript:, ftp:, file:, protocol-relative,
 *    relative, malformed, entity-smuggled (`&#106;avascript:`), tab-smuggled
 *    (`java\tscript:`) — fails closed to plain text with no URL anywhere.
 * 4. Links never navigate away from the app: a whitelisted link renders as a
 *    span (label visible, safe URL on `title` hover) — the render area keeps
 *    zero interactive elements (渲染区不含交互元素).
 * 5. Images are outside the doc subset: an image token renders its alt text —
 *    no <img>, so no remote fetch and no onerror face exists at all.
 * 6. Code blocks are plain text. No highlight engine, nothing executes
 *    (task Hard Rule: 不得依赖任何执行型插件).
 *
 * Long-document behavior (AC 万行级): the source is tokenized once per string
 * identity (`useMemo`), each block is memoized as its own element chunk
 * ({@link MarkdownBlockView}), so a re-render of an unchanged doc re-creates
 * nothing — the quantified budget lives in tests/markdown.spec.tsx.
 *
 * Upstream reuse was evaluated and declined (task note): the SPA's chat
 * MarkdownText is a streaming chat renderer (delegate links, katex, file
 * mentions) whose pinned alpha.2 npm copy would be what tests exercise while
 * the vendored tree is what runs — the drift gap would hollow out exactly the
 * injection guarantees this task exists to prove.
 */
import { memo, useMemo } from 'react'
import type { CSSProperties } from 'react'
import type { ReactNode } from 'react'
import { marked } from 'marked'
import type { Token, Tokens } from 'marked'

/** Whitelisted link protocols — the entire allowlist; everything else denied. */
export const DOC_LINK_PROTOCOLS = ['http:', 'https:', 'mailto:'] as const

/** Refuse absurd hrefs before URL parsing (defensive length cap). */
export const DOC_HREF_MAX_LENGTH = 2048

/**
 * Decode the HTML entity forms a browser would honor inside an attribute or
 * text node: the five named entities doc tooling actually emits plus numeric
 * decimal/hex references (trailing semicolon optional — browsers accept
 * `&#106` in attributes). Used both to vet hrefs before the protocol check
 * (an entity-smuggled scheme must be judged post-decode) and to display text
 * tokens correctly (marked leaves `&amp;` literal; React text nodes do not
 * decode). Over-decoding only ever denies harder or shows a literal char.
 */
export function decodeHtmlEntities(input: string): string {
  // Branch order matters: decimal digits first (so `&#106a` stops at `106`,
  // exactly where a browser's parser stops), hex only behind an explicit
  // x/X prefix, named entities last.
  return input.replace(/&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);?/g, (whole, body: string) => {
    if (body.startsWith('#')) {
      const hex = body[1] === 'x' || body[1] === 'X'
      const value = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10)
      // Replacement char for anything a text node cannot hold (lone
      // surrogates, out-of-range, NUL).
      if (!Number.isInteger(value) || value < 9 || value > 0x10ffff) return '�'
      return String.fromCodePoint(value)
    }
    switch (body) {
      case 'amp': return '&'
      case 'lt': return '<'
      case 'gt': return '>'
      case 'quot': return '"'
      case 'apos': return "'"
      case 'nbsp': return ' '
      default: return whole // unknown named entity stays literal
    }
  })
}

/**
 * The URL gate (default-deny). Returns the normalized absolute URL when the
 * href is whitelisted, `null` for everything else. Non-strings, empties,
 * oversize, unparsable, and non-whitelisted protocols all fail closed.
 * WHATWG parsing lowercases schemes, strips ASCII tabs/newlines, and rejects
 * scheme-less input without a base — the classic evasion vectors resolve to
 * a denial here rather than through string matching.
 */
export function resolveDocHref(href: unknown): string | null {
  if (typeof href !== 'string') return null
  const decoded = decodeHtmlEntities(href).trim()
  if (decoded.length === 0 || decoded.length > DOC_HREF_MAX_LENGTH) return null
  let parsed: URL
  try {
    parsed = new URL(decoded)
  } catch {
    return null
  }
  return (DOC_LINK_PROTOCOLS as readonly string[]).includes(parsed.protocol) ? parsed.href : null
}

/** DESIGN.md 代码 font stack (deliberately no bare monospace tail — CJK fallback). */
const MONO_FONT = "'SF Mono', 'JetBrains Mono', 'Fira Code', Consolas, 'Liberation Mono', Menlo, Courier, 'PingFang SC', 'Microsoft YaHei'"

/** Prose typography (DESIGN.md: 正文 14/22, 标题 16/24 w500), theme via aliases. */
const rootStyle = {
  color: 'var(--dsw-alias-label-primary, inherit)',
  display: 'flex',
  flexDirection: 'column',
  font: '14px/22px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  gap: '8px',
  minWidth: 0,
} as const

const headingStyle = {
  color: 'var(--dsw-alias-label-primary, inherit)',
  fontWeight: 500,
  letterSpacing: '0.01em',
  margin: 0,
} as const

/** Heading scale: h1 16/24, h2-h6 14/22 (doc prose inside a panel, not a page). */
const HEADING_STYLES: Record<number, CSSProperties> = {
  1: { ...headingStyle, fontSize: '16px', lineHeight: '24px' },
  2: { ...headingStyle, fontSize: '15px', lineHeight: '22px' },
  3: { ...headingStyle, fontSize: '14px', lineHeight: '22px' },
  4: { ...headingStyle, fontSize: '14px', lineHeight: '22px' },
  5: { ...headingStyle, fontSize: '14px', lineHeight: '22px' },
  6: { ...headingStyle, fontSize: '14px', lineHeight: '22px' },
}

const paragraphStyle = { margin: 0 } as const

/** 代码块: plain text, theme-riding fill + border (no highlight, nothing runs). */
const codeBlockStyle = {
  background: 'var(--dsh-interactive-bg-hover, rgba(128, 128, 128, 0.12))',
  border: '1px solid var(--dsh-border-color, rgba(128, 128, 128, 0.25))',
  borderRadius: '8px',
  fontFamily: MONO_FONT,
  fontSize: '12px',
  lineHeight: '18px',
  margin: 0,
  overflowX: 'auto',
  padding: '8px 12px',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
} as const

const inlineCodeStyle = {
  background: 'var(--dsh-interactive-bg-hover, rgba(128, 128, 128, 0.12))',
  borderRadius: '4px',
  fontFamily: MONO_FONT,
  fontSize: '12px',
  padding: '0 4px',
} as const

const listStyle = {
  margin: 0,
  paddingLeft: '20px',
} as const

const listItemStyle = { margin: '1px 0' } as const

const quoteStyle = {
  borderLeft: '3px solid var(--dsh-border-color, rgba(128, 128, 128, 0.35))',
  color: 'var(--dsw-alias-label-secondary, inherit)',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  margin: 0,
  padding: '2px 0 2px 12px',
} as const

/** 表格: theme-riding borders; the wrapper keeps wide tables scrollable in place. */
const tableWrapStyle = {
  margin: 0,
  maxWidth: '100%',
  overflowX: 'auto',
} as const

const tableStyle = {
  borderCollapse: 'collapse',
  fontSize: '13px',
  lineHeight: '20px',
  margin: 0,
  maxWidth: '100%',
} as const

const cellStyle = {
  border: '1px solid var(--dsh-border-color, rgba(128, 128, 128, 0.25))',
  padding: '4px 10px',
  textAlign: 'left',
  verticalAlign: 'top',
} as const

const headCellStyle = {
  ...cellStyle,
  background: 'var(--dsh-interactive-bg-hover, rgba(128, 128, 128, 0.12))',
  fontWeight: 500,
} as const

const ruleStyle = {
  border: 'none',
  borderTop: '1px solid var(--dsh-border-color, rgba(128, 128, 128, 0.25))',
  margin: 0,
} as const

/** A whitelisted link: the label in link color, the URL on hover — never an anchor. */
const docLinkStyle = {
  color: 'var(--dsw-alias-link, inherit)',
  cursor: 'default',
} as const

/** Literal raw-HTML text is shown in mono so readers see it is source, not UI. */
const rawTextStyle = {
  fontFamily: MONO_FONT,
  fontSize: '12px',
  margin: 0,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
} as const

/** Literal text of a token's text-bearing field (entities decoded for display). */
const tokenText = (token: Token): string => {
  const text = (token as { text?: unknown }).text
  return typeof text === 'string' ? decodeHtmlEntities(text) : ''
}

/** Render an inline token list; null for empty/absent. */
const renderInlineTokens = (tokens: Token[] | undefined, key: string): ReactNode => {
  if (tokens === undefined || tokens.length === 0) return null
  return tokens.map((token, index) => renderInlineToken(token, `${key}.${index}`))
}

/**
 * Map one inline token onto inert React. The `default` arm is the default-deny
 * itself: any token type this renderer has no explicit case for degrades to
 * plain text (or nothing), never to an element.
 */
function renderInlineToken(token: Token, key: string): ReactNode {
  switch (token.type) {
    case 'text': {
      const text = token as Tokens.Text
      // Text tokens nest inline content inside strong/em/link labels.
      return text.tokens !== undefined && text.tokens.length > 0
        ? <span key={key}>{renderInlineTokens(text.tokens, key)}</span>
        : <span key={key}>{tokenText(text)}</span>
    }
    case 'escape':
      // Backslash escapes: marked hands us the escaped char in `text`.
      return <span key={key}>{tokenText(token)}</span>
    case 'strong':
      return <strong key={key} style={{ fontWeight: 600 }}>{renderInlineTokens((token as Tokens.Strong).tokens, key)}</strong>
    case 'em':
      return <em key={key}>{renderInlineTokens((token as Tokens.Em).tokens, key)}</em>
    case 'del':
      // Strikethrough is outside the doc subset — keep the content, drop the styling.
      return <span key={key}>{renderInlineTokens((token as Tokens.Del).tokens, key)}</span>
    case 'codespan':
      return <code key={key} style={inlineCodeStyle}>{tokenText(token)}</code>
    case 'br':
      return <br key={key} />
    case 'link': {
      const link = token as Tokens.Link
      const safeHref = resolveDocHref(link.href)
      const label = renderInlineTokens(link.tokens, key)
      // Denied href → label as plain text; whitelisted → text + hover URL.
      // There is no anchor anywhere, so nothing navigates away from the app.
      return safeHref === null
        ? <span key={key}>{label}</span>
        : <span key={key} style={docLinkStyle} title={safeHref}>{label}</span>
    }
    case 'url': {
      // GFM autolinks (bare http(s)://… and www.…) arrive pre-resolved to http(s).
      const auto = token as Tokens.Generic
      const safeHref = resolveDocHref(auto.href)
      const label = tokenText(auto)
      return safeHref === null
        ? <span key={key}>{label}</span>
        : <span key={key} style={docLinkStyle} title={safeHref}>{label}</span>
    }
    case 'image': {
      // Images are outside the doc subset: alt text only — no <img>, no fetch,
      // no onerror face. The alt text is display text like any other.
      return <span key={key}>{tokenText(token)}</span>
    }
    case 'html':
      // Inline raw HTML: literal source text, never parsed into elements.
      return <span key={key} style={rawTextStyle}>{(token as Tokens.HTML).text}</span>
    default:
      // Unknown inline token type: degrade to text if it carries any.
      return <span key={key}>{tokenText(token)}</span>
  }
}

/**
 * Map one block token onto inert React. Same default-deny arm as inline: an
 * unknown block type degrades to text or nothing — never to an element.
 */
function renderBlockToken(token: Token, key: string): ReactNode {
  switch (token.type) {
    case 'space':
    case 'def':
      // Blank separators and link-reference definitions are consumed silently.
      return null
    case 'heading': {
      const heading = token as Tokens.Heading
      const depth = Math.min(Math.max(Math.trunc(heading.depth) || 1, 1), 6)
      const style = HEADING_STYLES[depth] ?? HEADING_STYLES[6]
      const Tag = `h${depth}` as 'h1'
      return <Tag key={key} style={style}>{renderInlineTokens(heading.tokens, key)}</Tag>
    }
    case 'paragraph':
      return <p key={key} style={paragraphStyle}>{renderInlineTokens((token as Tokens.Paragraph).tokens, key)}</p>
    case 'code':
      return <pre key={key} style={codeBlockStyle}><code>{(token as Tokens.Code).text}</code></pre>
    case 'blockquote':
      return (
        <blockquote key={key} style={quoteStyle}>
          {(token as Tokens.Blockquote).tokens.map((child, index) => renderBlockToken(child, `${key}.${index}`))}
        </blockquote>
      )
    case 'list': {
      const list = token as Tokens.List
      const Tag = list.ordered ? 'ol' : 'ul'
      return (
        <Tag key={key} style={listStyle} start={list.ordered && typeof list.start === 'number' && list.start !== 1 ? list.start : undefined}>
          {list.items.map((item, index) => (
            <li key={`${key}.${index}`} style={listItemStyle}>
              {/* Task checkboxes are literal glyphs — never interactive inputs. */}
              {item.task === true ? (item.checked === true ? '[x] ' : '[ ] ') : null}
              {item.tokens.map((child, childIndex) => renderBlockToken(child, `${key}.${index}.${childIndex}`))}
            </li>
          ))}
        </Tag>
      )
    }
    case 'table': {
      const table = token as Tokens.Table
      const align = (index: number): 'left' | 'center' | 'right' => table.align[index] ?? 'left'
      return (
        <div key={key} style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                {table.header.map((cell, index) => (
                  <th key={index} style={{ ...headCellStyle, textAlign: align(index) }}>{renderInlineTokens(cell.tokens, `${key}.h.${index}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} style={{ ...cellStyle, textAlign: align(cellIndex) }}>{renderInlineTokens(cell.tokens, `${key}.r${rowIndex}.c${cellIndex}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
    case 'hr':
      return <hr key={key} style={ruleStyle} />
    case 'html':
      // Block raw HTML: literal source text — script/style/iframe payloads
      // stay visible inert text (转义为纯文本).
      return <p key={key} style={rawTextStyle}>{(token as Tokens.HTML).text}</p>
    case 'text': {
      // Block-position text (tight list items, blockquote bodies): inline body.
      const text = token as Tokens.Text
      return text.tokens !== undefined && text.tokens.length > 0
        ? <span key={key}>{renderInlineTokens(text.tokens, key)}</span>
        : <span key={key}>{tokenText(text)}</span>
    }
    default:
      return <p key={key} style={paragraphStyle}>{tokenText(token)}</p>
  }
}

/**
 * One block as a memoized element chunk: an unchanged token object (the
 * `useMemo` tokenization keeps identities stable per markdown string) renders
 * zero times on re-render — the long-document chunking unit.
 */
const MarkdownBlockView = memo(function MarkdownBlockView(props: { token: Token }) {
  return <>{renderBlockToken(props.token, '')}</>
})

/** Inputs of {@link MarkdownView}. */
export interface MarkdownViewProps {
  /** The markdown source, exactly as it arrived over IPC (plain text). */
  readonly markdown: string
  /** Optional consumer class for the root element (layout ownership stays outside). */
  readonly className?: string
}

/**
 * Read-only markdown view. Renders the whitelisted doc subset — headings,
 * ordered/unordered/task lists, GFM tables, fenced code, quotes, whitelisted
 * http(s)/mailto links as non-navigating text — with every injection face
 * (raw HTML, script/style, on* handlers, javascript:/data: URLs, images)
 * degraded to inert literal text by construction.
 */
export function MarkdownView(props: MarkdownViewProps) {
  // Adversarial-input tolerance: a non-string payload renders as empty rather
  // than reaching the lexer.
  const source = typeof props.markdown === 'string' ? props.markdown : ''
  const tokens = useMemo(
    () => marked.lexer(source, { gfm: true, breaks: false }),
    [source],
  )
  const blocks = useMemo(
    () => tokens.map((token, index) => <MarkdownBlockView key={index} token={token} />),
    [tokens],
  )
  return (
    <div className={props.className} data-dsh-forge-markdown="" style={rootStyle}>
      {blocks}
    </div>
  )
}
