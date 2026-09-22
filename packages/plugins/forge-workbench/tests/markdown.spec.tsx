// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  MarkdownView, decodeHtmlEntities, resolveDocHref,
} from '../src/client/components/common/MarkdownView.tsx'

// Task 5.2 — the shared read-only markdown renderer (tech-design T3
// mitigation). Two matrices are the meat: the SUBSET matrix (the whitelisted
// doc grammar renders correctly) and the INJECTION matrix (every classic XSS
// vector degrades to inert literal text — raw HTML, script/style tags, on*
// handlers, javascript:/data:/vbscript: links, entity/case/tab-smuggled
// schemes, images). The readonly sweep proves the render area contains zero
// interactive elements, and the perf case quantifies the 万行级 budget.

afterEach(() => cleanup())

// The LAST matching root: tests that render a second document in one body
// must observe the newest render, not the first.
const root = () => document.querySelectorAll('[data-dsh-forge-markdown]')[document.querySelectorAll('[data-dsh-forge-markdown]').length - 1] as HTMLElement

/** Render and hand back the root element. */
const view = (markdown: string): HTMLElement => {
  render(<MarkdownView markdown={markdown} />)
  return root()
}

// ---------------------------------------------------------------------------
// resolveDocHref — the default-deny URL gate (unit level)
// ---------------------------------------------------------------------------

describe('resolveDocHref: default-deny protocol whitelist', () => {
  it('normalizes and passes the three whitelisted protocols', () => {
    expect(resolveDocHref('https://a.example/x?b=1')).toBe('https://a.example/x?b=1')
    expect(resolveDocHref('http://a.example')).toBe('http://a.example/')
    // Scheme case-insensitive; WHATWG normalizes host case and keeps path case.
    expect(resolveDocHref('HTTPS://A.EXAMPLE/X')).toBe('https://a.example/X')
    expect(resolveDocHref('mailto:a@b.example')).toBe('mailto:a@b.example')
  })

  it('denies every non-whitelisted scheme, relative form, and malformed input', () => {
    const denied = [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',      // case evasion
      'java\tscript:alert(1)',    // tab smuggling — WHATWG strips, scheme survives, denied
      ' javascript:alert(1)',     // leading whitespace
      'data:text/html;base64,PHNjcmlwdD4=',
      'vbscript:msgbox(1)',
      'ftp://files.example/x',
      'file:///etc/passwd',
      '//proto-relative.example/x', // scheme-relative
      './relative.md',
      '#fragment',
      'no-scheme-at-all',
      '&#106;avascript:alert(1)',  // entity-smuggled scheme (decoded, then denied)
      '&#x6A;avascript:alert(1)',  // hex entity form
    ]
    for (const href of denied) expect(resolveDocHref(href), href).toBeNull()
  })

  it('fails closed on non-strings, empties, and oversize hrefs', () => {
    expect(resolveDocHref(undefined)).toBeNull()
    expect(resolveDocHref(123 as unknown)).toBeNull()
    expect(resolveDocHref({} as unknown)).toBeNull()
    expect(resolveDocHref('')).toBeNull()
    expect(resolveDocHref('   ')).toBeNull()
    expect(resolveDocHref('https://ok.example/'.concat('a'.repeat(3000)))).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// decodeHtmlEntities — the shared decoder (display text + href vetting)
// ---------------------------------------------------------------------------

describe('decodeHtmlEntities', () => {
  it('decodes named, decimal, and hex references', () => {
    expect(decodeHtmlEntities('a &amp; b')).toBe('a & b')
    expect(decodeHtmlEntities('&lt;tag&gt;')).toBe('<tag>')
    expect(decodeHtmlEntities('&#42;')).toBe('*')
    expect(decodeHtmlEntities('&#x2A;')).toBe('*')
    expect(decodeHtmlEntities('&#106;avascript')).toBe('javascript')
    // Semicolon optional (browsers accept it in attributes) — decode anyway.
    expect(decodeHtmlEntities('&#106avascript')).toBe('javascript')
  })

  it('keeps unknown entities literal and replaces undisplayable code points', () => {
    expect(decodeHtmlEntities('&nosuchentity;')).toBe('&nosuchentity;')
    expect(decodeHtmlEntities('&#0;')).toContain('�')
    expect(decodeHtmlEntities('&#1114112;')).toContain('�')
  })
})

// ---------------------------------------------------------------------------
// AC1 — subset matrix: the whitelisted grammar renders correctly
// ---------------------------------------------------------------------------

describe('MarkdownView: subset rendering matrix (AC1)', () => {
  it('renders h1-h6 headings with content', () => {
    const el = view('# 一\n## 二\n### 三\n#### 四\n##### 五\n###### 六')
    for (const level of [1, 2, 3, 4, 5, 6]) {
      const heading = el.querySelector(`h${level}`)
      expect(heading, `h${level}`).not.toBeNull()
      expect(heading?.textContent).toBe('一二三四五六'[level - 1])
    }
  })

  it('renders unordered, nested, ordered (start), and task lists', () => {
    const el = view([
      '- one',
      '- two',
      '  - nested',
      '',
      '5. five',
      '6. six',
      '',
      '- [ ] todo',
      '- [x] done',
    ].join('\n'))
    const lists = el.querySelectorAll('ul')
    expect(lists).toHaveLength(3) // top level, nested, task list
    expect(lists[0].children[0].textContent).toBe('one')
    expect(lists[1].children[0].textContent).toBe('nested') // the nested list's own li
    const ordered = el.querySelector('ol')
    expect(ordered?.getAttribute('start')).toBe('5')
    expect(ordered?.children[0].textContent).toContain('five')
    const items = [...lists[2].children].map(li => li.textContent)
    expect(items[0]).toBe('[ ] todo') // literal glyphs — never interactive checkboxes
    expect(items[1]).toBe('[x] done')
    expect(el.querySelector('input')).toBeNull()
  })

  it('renders GFM tables with header row and per-column alignment', () => {
    const el = view('| a | b | c |\n|:--|:-:|--:|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |')
    const ths = [...el.querySelectorAll('thead th')]
    expect(ths.map(th => th.textContent)).toEqual(['a', 'b', 'c'])
    expect(ths.map(th => th.style.textAlign)).toEqual(['left', 'center', 'right'])
    const rows = [...el.querySelectorAll('tbody tr')]
    expect(rows).toHaveLength(2)
    expect(rows[0].querySelectorAll('td')).toHaveLength(3)
    expect(rows[1].textContent).toBe('456')
  })

  it('renders fenced code as plain text — payload strings stay visible and inert', () => {
    const el = view('```ts\nconst a = "<script>alert(1)</script>";\nconst e = "x &amp; y";\n```')
    const code = el.querySelector('pre code')
    expect(code?.textContent).toContain('<script>alert(1)</script>')
    expect(el.querySelector('script')).toBeNull()
    // Code blocks do not decode entities (CommonMark display semantics).
    expect(code?.textContent).toContain('x &amp; y')
    expect((el.querySelector('pre') as HTMLElement).style.fontFamily).toContain('SF Mono')
  })

  it('renders blockquotes containing paragraphs and lists', () => {
    const el = view('> quoted\n> - item')
    const quote = el.querySelector('blockquote')
    expect(quote?.querySelector('p')?.textContent).toBe('quoted')
    expect(quote?.querySelector('ul li')?.textContent).toBe('item')
  })

  it('renders inline emphasis, code, hard breaks, escapes, and degraded strikethrough', () => {
    const el = view('**bold** *em* `code` ~~gone~~ \\*literal\\*\n\nline1  \nline2\n\n---')
    expect(el.querySelector('strong')?.textContent).toBe('bold')
    expect(el.querySelector('em')?.textContent).toBe('em')
    const inlineCode = el.querySelector('p code')
    expect(inlineCode?.textContent).toBe('code')
    // Strikethrough is outside the doc subset: content kept, no <del>.
    expect(el.textContent).toContain('gone')
    expect(el.querySelector('del')).toBeNull()
    expect(el.textContent).toContain('*literal*')
    expect(el.querySelector('br')).not.toBeNull()
    expect(el.querySelector('hr')).not.toBeNull()
  })

  it('renders whitelisted links as non-navigating labeled text with the URL on hover', () => {
    const el = view('[site](https://example.com/a?b=1) [mail](mailto:x@y.example) <https://auto.example> www.auto.example')
    const spans = [...el.querySelectorAll('span[title]')]
    expect(spans.map(span => span.title)).toEqual([
      'https://example.com/a?b=1',
      'mailto:x@y.example',
      'https://auto.example/',    // gate normalization adds the empty path
      'http://www.auto.example/',
    ])
    expect(spans.map(span => span.textContent)).toEqual(['site', 'mail', 'https://auto.example', 'www.auto.example'])
    expect(el.querySelector('a')).toBeNull()
  })

  it('decodes entities for display — prose and code spans (code blocks stay literal)', () => {
    const el = view('a &amp; b &#42; and `x &amp; y`')
    expect(el.querySelector('p').textContent).toBe('a & b * and x & y')
    expect(el.querySelector('p code').textContent).toBe('x & y')
  })

  it('renders empty and whitespace-only documents as an empty root; tolerates non-string input', () => {
    expect(view('').children).toHaveLength(0)
    expect(view('\n\n \n').children).toHaveLength(0)
    expect(view(undefined as unknown as string).children).toHaveLength(0)
  })

  it('passes className through and exposes the data hook', () => {
    const { container } = render(<MarkdownView markdown="hi" className="uf3-desc" />)
    expect(container.querySelector('.uf3-desc')?.className).toContain('uf3-desc')
    expect(root().getAttribute('data-dsh-forge-markdown')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// AC2 — injection matrix: every T3 vector asserted inert
// ---------------------------------------------------------------------------

/** The whole rendered tree must contain no on* handler attribute whatsoever. */
const expectZeroHandlerAttributes = (el: HTMLElement): void => {
  for (const element of el.querySelectorAll('*')) {
    for (const attribute of element.getAttributeNames()) {
      expect(attribute.startsWith('on'), `${element.tagName} ${attribute}`).toBe(false)
    }
  }
}

describe('MarkdownView: injection payload matrix (AC2)', () => {
  it('neutralizes block-level <script> into literal text', () => {
    const el = view('<script>alert(1)</script>')
    expect(el.querySelector('script')).toBeNull()
    expect(el.textContent).toContain('<script>alert(1)</script>')
    expectZeroHandlerAttributes(el)
  })

  it('neutralizes inline <img src=x onerror=…> into literal text', () => {
    const el = view('before <img src=x onerror=alert(1)> after')
    expect(el.querySelector('img')).toBeNull()
    expect(el.querySelector('[src]')).toBeNull()
    expect(el.textContent).toContain('<img src=x onerror=alert(1)>')
    expectZeroHandlerAttributes(el)
  })

  it('neutralizes javascript:, data:, and vbscript: links to bare label text', () => {
    const el = view('[a](javascript:alert(1)) [b](data:text/html;base64,PHNjcmlwdD4=) [c](vbscript:msgbox(1))')
    expect(el.querySelectorAll('span[title]')).toHaveLength(0)
    expect(el.querySelectorAll('a, [href]')).toHaveLength(0)
    expect(el.textContent).toBe('a b c')
    expectZeroHandlerAttributes(el)
  })

  it('neutralizes entity-smuggled, case-flipped, angle-bracket, and tab-smuggled javascript: schemes', () => {
    const el = view([
      '[x](&#106;avascript:alert(1))',
      '[y](JaVaScRiPt:alert(1))',
      '[z](<javascript:alert(1)>)',
    ].join(' '))
    expect(el.querySelectorAll('span[title]')).toHaveLength(0)
    expect(el.textContent).toBe('x y z')
    // A raw tab inside an inline destination breaks link parsing entirely —
    // the payload stays literal source text, which is inert too.
    const tabEl = view('[w](java\tscript:alert(1))')
    expect(tabEl.querySelectorAll('span[title], a')).toHaveLength(0)
    expect(tabEl.textContent).toContain('[w](java')
  })

  it('neutralizes raw <a>/<span> HTML with handlers into literal text — zero anchors', () => {
    const el = view('<a href="https://evil.example" onclick="steal()">click</a> and <span onmouseover=alert(1)>hover</span>')
    expect(el.querySelectorAll('a, span[title]')).toHaveLength(0)
    expect(el.querySelector('a')).toBeNull()
    expect(el.textContent).toContain('<a href="https://evil.example" onclick="steal()">click</a>')
    expect(el.textContent).toContain('<span onmouseover=alert(1)>hover</span>')
    expectZeroHandlerAttributes(el)
  })

  it('renders image tokens as alt text only — no <img>, no remote fetch, no onerror face', () => {
    const el = view('![alt text](javascript:alert(1)) ![remote](https://x.example/p.png "t")')
    expect(el.querySelector('img')).toBeNull()
    expect(el.querySelector('[src]')).toBeNull()
    expect(el.textContent).toContain('alt text')
    expect(el.textContent).toContain('remote')
  })

  it('neutralizes <style>/<iframe> blocks into literal text', () => {
    const el = view('<style>body{background:red}</style>\n\n<iframe src="https://evil.example"></iframe>')
    expect(el.querySelector('style')).toBeNull()
    expect(el.querySelector('iframe')).toBeNull()
    expect(el.textContent).toContain('<style>body{background:red}</style>')
    expect(el.textContent).toContain('<iframe src="https://evil.example"></iframe>')
  })

  it('runs reference links through the same gate — javascript: definition denied', () => {
    const el = view('[x][1]\n\n\n[1]: javascript:alert(1)')
    expect(el.querySelectorAll('span[title], a')).toHaveLength(0)
    expect(el.textContent).toContain('x')
  })

  it('keeps quote-smuggled whitelisted URLs safely inside the title attribute', () => {
    const el = view('[x](https://x.example/"onmouseover="alert(1))')
    const span = el.querySelector('span[title]')
    expect(span).not.toBeNull()
    // WHATWG normalization percent-encodes the quotes — nothing attribute-shaped
    // survives into the title.
    expect(span.title).toBe('https://x.example/%22onmouseover=%22alert(1)')
    expectZeroHandlerAttributes(el)
  })

  it('survives a dense mixed-payload kitchen sink with zero live elements', () => {
    const el = view([
      '# <img src=x onerror=alert(1)> heading',
      '',
      '| <script> | b |',
      '|---|---|',
      '| [x](javascript:1) | <iframe src=x> |',
      '',
      '> <style>*{}</style> quote',
      '',
      '```html',
      '<script>alert(1)</script>',
      '```',
      '',
      '[ok](https://ok.example) [bad](data:text/html,x) ![i](https://e/x.png)',
    ].join('\n'))
    expect(el.querySelectorAll('script, style, iframe, img, a, [href], [src]')).toHaveLength(0)
    expectZeroHandlerAttributes(el)
    // The whitelisted link survived as inert labeled text.
    expect(el.querySelector('span[title]')?.title).toBe('https://ok.example/')
  })
})

// ---------------------------------------------------------------------------
// AC3 — strictly read-only: zero interactive elements in the render area
// ---------------------------------------------------------------------------

describe('MarkdownView: read-only surface (AC3)', () => {
  it('exposes no interactive element, handler, or navigation affordance', () => {
    const el = view([
      '[site](https://example.com) <https://auto.example>',
      '',
      '- [ ] task item',
    ].join('\n'))
    expect(el.querySelectorAll([
      'a', 'button', 'img', 'iframe', 'form', 'input', 'select', 'textarea',
      'video', 'audio', 'details', '[contenteditable]', '[tabindex]', '[href]', '[src]',
    ].join(', '))).toHaveLength(0)
    expectZeroHandlerAttributes(el)
    // Clicking the link-shaped span does nothing — it is not an anchor.
    const linkSpan = el.querySelector('span[title]') as HTMLSpanElement
    expect(linkSpan.click).toBeDefined()
    fireEvent.click(linkSpan)
    expect(document.querySelector('a')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// AC5 — dual-theme styling via semantic aliases, zero stylesheet injection
// ---------------------------------------------------------------------------

describe('MarkdownView: theme + style discipline (AC5)', () => {
  it('styles code blocks, tables, and prose through theme variables (no global sheet)', () => {
    const el = view('```\ncode\n```\n\n| h |\n|---|\n| c |')
    const pre = el.querySelector('pre') as HTMLElement
    expect(pre.style.background).toContain('var(')
    expect(pre.style.border).toContain('var(')
    const th = el.querySelector('th') as HTMLElement
    expect(th.style.background).toContain('var(')
    expect(el.style.color).toContain('--dsw-alias-label-primary')
    expect(el.style.fontSize).toBe('14px')
    expect(el.style.lineHeight).toBe('22px')
    // Hard Rule (rail.spec discipline): the plugin injects NO stylesheet.
    expect(document.querySelectorAll('style')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// AC4 — long-document budget (quantified; chunked per-block memoization)
// ---------------------------------------------------------------------------

describe('MarkdownView: 万行级 budget (AC4)', () => {
  /** 10,000 lines of realistic doc grammar: heading/para/list/code/table mix. */
  const buildTenThousandLines = (): string => {
    const parts: string[] = []
    let lines = 0
    for (let section = 1; ; section++) {
      parts.push(`## Section ${section}`, '', `Paragraph ${section} with **bold**, \`code\`, and [link](https://x.example/${section}).`, '', '- [ ] task', `- item ${section}a`, `- item ${section}b`, '', '```ts', `const v${section} = ${section};`, '```', '', '| a | b |', '|---|:-:|', `| ${section} | x |`, '')
      lines += 16
      if (lines + 16 > 10000) break
    }
    return parts.join('\n')
  }

  it('renders a 10,000-line document inside the recorded budget', () => {
    const doc = buildTenThousandLines()
    expect(doc.split('\n').length).toBeGreaterThanOrEqual(9999)
    const started = performance.now()
    const { rerender } = render(<MarkdownView markdown={doc} />)
    const mountMs = performance.now() - started
    // Budget (jsdom): mount ≤ 5000ms, memoized re-render ≤ 1500ms. Recorded on
    // this suite's machine (2026-09-22): mount=1012ms solo / ~2.8s while the
    // full 57-file suite runs in parallel, rerender=6ms across 625 blocks /
    // 10k lines — the re-render sits ~170x under mount because the single
    // tokenization + per-block memo chunks re-create nothing. The thresholds
    // stay far below any quadratic-freeze signature while tolerating that
    // parallel-load variance.
    expect(mountMs).toBeLessThan(5000)
    const rerenderStarted = performance.now()
    rerender(<MarkdownView markdown={doc} className="second-pass" />)
    const rerenderMs = performance.now() - rerenderStarted
    expect(rerenderMs).toBeLessThan(1500)
    // Completeness: every section heading made it into the tree.
    const sections = document.querySelectorAll('[data-dsh-forge-markdown] h2')
    expect(sections.length).toBeGreaterThan(600)
    console.log(`[perf] 10k-line mount=${Math.round(mountMs)}ms rerender=${Math.round(rerenderMs)}ms blocks=${sections.length} h2`)
  })
})
