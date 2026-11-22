// 门控头词表双向判决单测（mermaid@12.1.0 包本体 detector 全量重抽的可红守卫）。
// 三层：
//   ① 全表参数化：MERMAID_HEAD_WORDS 逐词经 detectFormat 门控接受 + validateSource
//      零 unsupported 误报（c4dynamic / usecase-beta / venn-beta / flowchart-elk 等
//      代表样本作语义标注——非裸词占位）。
//   ② 真引擎 headless parse 逐词 × 门控判决一致性对照：verdict.ok === 引擎 parse ok
//      （门控拒 ↔ 引擎不认，门控受 ↔ 引擎受理——受理后语法失败是引擎级判决，不属
//      门控缺口）。
//   ③ 未知头词反判：zenuml（12.1.0 已退役图型）显式 unsupported + flowchart 基线回归
//      （子图/形状/连线——补齐不得伤既有判决）。
import { describe, expect, it } from 'vitest'
import { MERMAID_HEAD_WORDS, detectFormat, validateSource } from '../../../host/validate/index.js'
import { parseMermaidSource } from '../../../host/validate/mermaid-engine.js'

/** 逐词代表样本（首行头词 = 表词的规范拼写；engineOk = 预期真引擎 parse 通过） */
const WORD_SAMPLES: ReadonlyArray<{ word: string; source: string; engineOk?: boolean }> = [
  { word: 'flowchart', source: 'flowchart LR\n  A["开始"] --> B', engineOk: true },
  { word: 'graph', source: 'graph TD\n  A --> B', engineOk: true },
  { word: 'flowchart-elk', source: 'flowchart-elk LR\n  A --> B', engineOk: true },
  { word: 'sequencediagram', source: 'sequenceDiagram\n  A->>B: hi', engineOk: true },
  { word: 'classdiagram', source: 'classDiagram\n  class A', engineOk: true },
  { word: 'statediagram', source: 'stateDiagram-v2\n  [*] --> s1', engineOk: true },
  { word: 'statediagram-v2', source: 'stateDiagram-v2\n  [*] --> s1', engineOk: true },
  { word: 'erdiagram', source: 'erDiagram\n  A ||--o{ B : has', engineOk: true },
  { word: 'requirement', source: 'requirementDiagram\n  requirement R {\n    id: 1\n    text: t\n    risk: low\n    verifymethod: analysis\n  }', engineOk: true },
  { word: 'requirementdiagram', source: 'requirementDiagram\n  requirement R {\n    id: 1\n    text: t\n    risk: low\n    verifymethod: analysis\n  }', engineOk: true },
  { word: 'gantt', source: 'gantt\n  title T\n  A :a1, 2024-01-01, 10d', engineOk: true },
  { word: 'journey', source: 'journey\n  title T\n  section S\n  Go: 1: A', engineOk: true },
  { word: 'pie', source: 'pie title T\n  "A": 42', engineOk: true },
  { word: 'timeline', source: 'timeline\n  title T\n  2024 : A', engineOk: true },
  { word: 'quadrantchart', source: 'quadrantChart\n  title T\n  x-axis Low --> High\n  y-axis Low --> High\n  A: [0.2, 0.3]', engineOk: true },
  { word: 'mindmap', source: 'mindmap\n  root((R))\n    A', engineOk: true },
  { word: 'kanban', source: 'kanban\n  T1["Task"]', engineOk: true },
  { word: 'gitgraph', source: 'gitGraph\n  commit id: "a"', engineOk: true },
  { word: 'c4context', source: 'C4Context\n  System(sys, "S")', engineOk: true },
  { word: 'c4container', source: 'C4Container\n  Container(app, "A", "t")', engineOk: true },
  { word: 'c4component', source: 'C4Component\n  Component(c, "C", "t")', engineOk: true },
  { word: 'c4dynamic', source: 'C4Dynamic\n  Rel(a, b, "x")', engineOk: true },
  { word: 'c4deployment', source: 'C4Deployment\n  Deployment_Node(dn, "N", "t")', engineOk: true },
  { word: 'sankey', source: 'sankey-beta\nA,B,10', engineOk: true },
  { word: 'sankey-beta', source: 'sankey-beta\nA,B,10', engineOk: true },
  { word: 'xychart', source: 'xychart-beta\n  title "T"\n  x-axis [a, b]\n  y-axis 1 --> 10\n  bar [1, 2]', engineOk: true },
  { word: 'xychart-beta', source: 'xychart-beta\n  title "T"\n  x-axis [a, b]\n  y-axis 1 --> 10\n  bar [1, 2]', engineOk: true },
  { word: 'block', source: 'block-beta\n  columns 1\n  a["A"]', engineOk: true },
  { word: 'block-beta', source: 'block-beta\n  columns 1\n  a["A"]', engineOk: true },
  { word: 'packet', source: 'packet-beta\n  0-15: "a"', engineOk: true },
  { word: 'packet-beta', source: 'packet-beta\n  0-15: "a"', engineOk: true },
  { word: 'radar-beta', source: 'radar-beta\n  axis a, b\n  curve c{10, 20}', engineOk: true },
  { word: 'architecture', source: 'architecture-beta\n  group g(logos)[G]\n  service s(logos)[S] in g', engineOk: true },
  { word: 'architecture-beta', source: 'architecture-beta\n  group g(logos)[G]\n  service s(logos)[S] in g', engineOk: true },
  { word: 'venn-beta', source: 'venn-beta\n  set A\n  set B\n  union A,B', engineOk: true },
  { word: 'treemap', source: 'treemap\n  "Branch"\n  "Leaf"', engineOk: true },
  { word: 'treeview-beta', source: 'treeView-beta\n  Root\n  Child', engineOk: true },
  { word: 'usecase-beta', source: 'usecase-beta\n  actor User\n  actor Admin\n  User --> Admin', engineOk: true },
  { word: 'agentflow-beta', source: 'agentflow-beta\n  flow TD\n  A --> B' },
  { word: 'swimlane-beta', source: 'swimlane-beta\n  lane L\n  A --> B' },
  { word: 'cynefin-beta', source: 'cynefin-beta\n  domain D' },
  { word: 'wardley-beta', source: 'wardley-beta\n  title T\n  a->b' },
  { word: 'ishikawa', source: 'ishikawa\n  Problem\n  Cause C' },
  { word: 'ishikawa-beta', source: 'ishikawa-beta\n  Problem\n  Cause C' },
  { word: 'eventmodeling', source: 'eventmodeling\n  title T' },
  { word: 'info', source: 'info\n  title T' },
  { word: 'railroad-beta', source: 'railroad-beta\n  root A' },
  { word: 'railroad-ebnf-beta', source: 'railroad-ebnf-beta\n  root A' },
  { word: 'railroad-abnf-beta', source: 'railroad-abnf-beta\n  root A' },
  { word: 'railroad-peg-beta', source: 'railroad-peg-beta\n  root A' },
]

describe('全表参数化：表 = 12.1.0 detector 全量重抽（无遗漏词）', () => {
  it('样本表覆盖 MERMAID_HEAD_WORDS 全集（每词恰一样本——新增词漏样本即红）', () => {
    expect(WORD_SAMPLES.map((s) => s.word).sort()).toEqual([...MERMAID_HEAD_WORDS].sort())
  })

  it('表规模 ≥ 40（12.1.0 重抽基线——不得回退到旧 24 词形态）', () => {
    expect(MERMAID_HEAD_WORDS.size).toBeGreaterThanOrEqual(40)
  })
})

describe('全表参数化：门控接受 + 零 unsupported 误报 + 引擎一致性对照', () => {
  it.each(WORD_SAMPLES)('$word：门控接受 → 真引擎判决一致', async ({ source }) => {
    // 门控层：头词被接受（非 null），validateSource 零 unsupported 误报
    expect(detectFormat(source), `门控应接受头词样本: ${source.split('\n')[0]}`).toBe('mermaid')
    const verdict = await validateSource(source)
    expect(verdict.unsupported, `零 unsupported 误报: ${source.split('\n')[0]}`).toBeUndefined()
    // 引擎一致性：门控判决 === 真引擎 headless parse 判决
    const engine = await parseMermaidSource(source)
    expect(verdict.ok, `门控↔引擎判决一致: ${source.split('\n')[0]}（engine=${JSON.stringify(engine)}）`).toBe(engine.ok)
    // 引擎受理后失败 = 引擎级语法判决（带 message），非「不认图型」门控缺口
    if (!engine.ok) {
      expect(engine.message).not.toMatch(/diagram type|unknown diagram/i)
    }
  })

  it('代表样本（flowchart/elk/c4dynamic/usecase-beta/venn-beta）真引擎 parse ok:true（语义标注——非裸词占位）', async () => {
    for (const word of ['flowchart', 'flowchart-elk', 'c4dynamic', 'usecase-beta', 'venn-beta']) {
      const sample = WORD_SAMPLES.find((s) => s.word === word)!
      const verdict = await validateSource(sample.source)
      expect(verdict, `${word} 代表样本应出引擎 ok 判决`).toMatchObject({ ok: true, format: 'mermaid' })
    }
  })
})

describe('未知头词反判（显式 unsupported——不假失败）', () => {
  it('zenuml：12.1.0 已退役图型——门控拒绝 + validateSource 显式 unsupported', async () => {
    expect(detectFormat('zenuml\n  @A\n  A->B: hi')).toBeNull()
    const r = await validateSource('zenuml\n  @A\n  A->B: hi')
    expect(r.ok).toBe(false)
    expect(r.unsupported).toBe(true)
    expect(r.format).toBe('zenuml')
  })
})

describe('flowchart 基线回归（子图/形状/连线——补齐不得伤既有判决）', () => {
  const BASELINE = [
    'flowchart LR\n  subgraph SA["组"]\n    A --> B\n  end\n  B --> C', // 子图
    'flowchart LR\n  A([圆角]) --> B{判定} --> C[(数据库)] --> D((圆))', // 节点形状
    'flowchart TD\n  A -- 文本连线 --> B\n  A -. 虚线 .-> C\n  A ==> D', // 连线族
    'graph LR\n  A --> B', // graph 旧语法
  ]
  it.each(BASELINE)('基线样本判决 ok 零回归：%s', async (src) => {
    expect(await validateSource(src)).toMatchObject({ ok: true, format: 'mermaid' })
  })
})
