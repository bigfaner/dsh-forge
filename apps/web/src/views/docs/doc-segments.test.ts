// doc-segments 单测 —— AC1/AC4 分段解析：md 段/mermaid 段切分、info 首词判据、
// 非 mermaid fence 整体归 md（嵌套 ```mermaid 文本不误分段）、未闭合 fence 不吞正文、
// 零 mermaid 段 = 单 md 段（懒加载零触发前提）。
import { describe, expect, it } from 'vitest'
import { hasMermaidSegment, splitDocSegments } from './doc-segments.js'

describe('splitDocSegments（分段解析）', () => {
  it('纯 md 文档 = 单 md 段原样（零 mermaid 段）', () => {
    const content = '# 标题\n\n正文段落。\n'
    expect(splitDocSegments(content)).toEqual([{ kind: 'md', text: '# 标题\n\n正文段落。' }])
  })

  it('md 段与 mermaid 段交替（前后正文各成段，fence 体 = source）', () => {
    const content = ['前文', '', '```mermaid', 'graph TD', '  A-->B', '```', '', '后文'].join('\n')
    expect(splitDocSegments(content)).toEqual([
      { kind: 'md', text: '前文' },
      { kind: 'mermaid', source: 'graph TD\n  A-->B' },
      { kind: 'md', text: '后文' },
    ])
  })

  it('erDiagram 源（验收锚）整段入 mermaid 段', () => {
    const content = '```mermaid\nerDiagram\n    PROPOSALS ||--o{ FEATURES : "proposal_id"\n```'
    expect(splitDocSegments(content)).toEqual([
      { kind: 'mermaid', source: 'erDiagram\n    PROPOSALS ||--o{ FEATURES : "proposal_id"' },
    ])
  })

  it('连续两个 mermaid 块 = 两段（中间零碎空白 md 段丢弃）', () => {
    const content = ['```mermaid', 'graph TD', 'A-->B', '```', '', '```mermaid', 'sequenceDiagram', '```'].join('\n')
    expect(splitDocSegments(content)).toEqual([
      { kind: 'mermaid', source: 'graph TD\nA-->B' },
      { kind: 'mermaid', source: 'sequenceDiagram' },
    ])
  })

  it('info 首词判据：`mermaid title=x` 入段；`mermaidfoo`/```ts/空 info 不入', () => {
    const content = [
      '```mermaid title=关系图',
      'graph TD',
      '```',
      '~~~mermaid',
      'graph LR',
      '~~~',
      '```mermaidfoo',
      'x',
      '```',
      '```ts',
      'const a = 1',
      '```',
    ].join('\n')
    const segments = splitDocSegments(content)
    expect(segments.filter((s) => s.kind === 'mermaid')).toEqual([
      { kind: 'mermaid', source: 'graph TD' },
      { kind: 'mermaid', source: 'graph LR' },
    ])
    // 非 mermaid fence（含 ```mermaidfoo）整体归 md 段
    const md = segments.filter((s) => s.kind === 'md').map((s) => s.text).join('\n')
    expect(md).toContain('```mermaidfoo')
    expect(md).toContain('const a = 1')
  })

  it('嵌套防误分：非 mermaid fence 内的 ```mermaid 文本是字面量（fence 不嵌套；相邻 md 连续归一段）', () => {
    const content = ['````md', '```mermaid', 'graph TD', '```', '````', '正文'].join('\n')
    const segments = splitDocSegments(content)
    expect(hasMermaidSegment(segments)).toBe(false)
    expect(segments).toEqual([{ kind: 'md', text: '````md\n```mermaid\ngraph TD\n```\n````\n正文' }])
  })

  it('未闭合 mermaid fence 视为正文原样归 md 段（不吞正文）', () => {
    const content = ['前文', '```mermaid', 'graph TD', 'A-->B'].join('\n')
    expect(splitDocSegments(content)).toEqual([{ kind: 'md', text: '前文\n```mermaid\ngraph TD\nA-->B' }])
  })

  it('闭行须同字符且长度 ≥ 开行（短 fence 行 = 源内行；~~~ 不被 ``` 关）', () => {
    const backtick = ['````mermaid', 'graph TD', '```', 'A-->B', '````'].join('\n')
    expect(splitDocSegments(backtick)).toEqual([{ kind: 'mermaid', source: 'graph TD\n```\nA-->B' }])
    const tilde = ['~~~mermaid', 'graph TD', '```', '~~~'].join('\n')
    expect(splitDocSegments(tilde)).toEqual([{ kind: 'mermaid', source: 'graph TD\n```' }])
  })

  it('行首 ≤3 空格缩进的 fence 生效；fence 体原样保留（不去缩进）', () => {
    const content = ['   ```mermaid', '  graph TD', '   ```'].join('\n')
    expect(splitDocSegments(content)).toEqual([{ kind: 'mermaid', source: '  graph TD' }])
  })

  it('空内容/纯空白 = 零段（渲染面无内容不占段）', () => {
    expect(splitDocSegments('')).toEqual([])
    expect(splitDocSegments('\n\n  \n')).toEqual([])
  })
})

describe('hasMermaidSegment（懒加载触发判据）', () => {
  it('含 mermaid 段 = true；纯 md = false（零块零加载的前提）', () => {
    expect(hasMermaidSegment(splitDocSegments('# t\n\n```mermaid\ngraph TD\n```\n'))).toBe(true)
    expect(hasMermaidSegment(splitDocSegments('# t\n\n```ts\nconst a = 1\n```\n'))).toBe(false)
    expect(hasMermaidSegment([])).toBe(false)
  })
})
