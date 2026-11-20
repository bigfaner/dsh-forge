// validate 面真引擎集成测试（mermaid 12.1.0 headless parse——Node DOM shim 适配器内生效）。
// 实证基线：提案评审期探针（2026-10-13，全部用例经真引擎复现）。
import { describe, expect, it } from 'vitest'
import {
  ENGINE_REGISTRY,
  MD_MERMAID_VALIDATE_FENCE_RE,
  detectFormat,
  validateDocFences,
  validateSource,
} from './index.js'

// ---- 实证非法源（chatview-mermaid 评审四处 + 未引号括号第五例）----
const ILLEGAL_SOURCES = {
  // 一行双节点（`/` 分隔）
  twoNodesOneLine: 'flowchart LR\n  A --> B / C --> D',
  // sequenceDiagram 消息内 `;` 截断 ×2（实证 2026-10-13：行尾 `;` 合法——截断只发生在消息中段）
  semicolonInline: 'sequenceDiagram\n  participant A\n  participant B\n  A->>B: 你好; 世界',
  semicolonNoSpace: 'sequenceDiagram\n  participant A\n  participant B\n  A->>B: 你好;世界',
  // 未引号标签 `·`+`@` 组合文法不可组合
  dotAtLabel: 'flowchart LR\n  A[费用·金额] --> B[@user]',
  // 未引号括号（第五例，评审期新添）
  unquotedParens: 'flowchart LR\n  A[备注(草稿)] --> B[结束]',
} as const

const LEGAL_MIXED = {
  flowchart: 'flowchart LR\n  A[开始] --> B[结束]',
  sequence: 'sequenceDiagram\n  participant A\n  participant B\n  A->>B: 你好',
  state: 'stateDiagram-v2\n  [*] --> s1\n  s1 --> [*]',
} as const

describe('注册表 Record<format, adapter>', () => {
  it('结构成立且本期唯一成员 mermaid', () => {
    expect(Object.keys(ENGINE_REGISTRY)).toEqual(['mermaid'])
    expect(typeof ENGINE_REGISTRY.mermaid.parse).toBe('function')
  })

  it('未知 format 显式 unsupported（不假失败）', async () => {
    const r = await validateSource('PlantUML\n  A -> B', { format: 'plantuml' })
    expect(r.ok).toBe(false)
    expect((r as { unsupported?: boolean }).unsupported).toBe(true)
  })
})

describe('auto 首行头词探测', () => {
  it('flowchart/graph/sequenceDiagram 探测为 mermaid 引擎', () => {
    expect(detectFormat('flowchart LR\n  A --> B')).toBe('mermaid')
    expect(detectFormat('graph TD\n  A --> B')).toBe('mermaid')
    expect(detectFormat('sequenceDiagram\n  A->>B: hi')).toBe('mermaid')
  })

  it('空行与 YAML frontmatter 跳过后取头词', () => {
    expect(detectFormat('---\ntitle: x\n---\nflowchart LR\n  A --> B')).toBe('mermaid')
  })

  it('未知头词返回 null', () => {
    expect(detectFormat('plantuml\n  A -> B')).toBeNull()
  })

  it('fence 提取正则单源形状（全局 + 多行体）', () => {
    expect(MD_MERMAID_VALIDATE_FENCE_RE.flags).toContain('g')
    expect(MD_MERMAID_VALIDATE_FENCE_RE.source).toBe('```mermaid\\r?\\n([\\s\\S]*?)```')
  })
})

describe('source 模式（真引擎）', () => {
  it('混型合法集返回 ok:true + format:mermaid', async () => {
    for (const src of Object.values(LEGAL_MIXED)) {
      const r = await validateSource(src)
      expect(r).toMatchObject({ ok: true, format: 'mermaid' })
    }
  })

  it('五处实证非法源全部命中（ok:false + line + message）', async () => {
    for (const [name, src] of Object.entries(ILLEGAL_SOURCES)) {
      const r = await validateSource(src)
      expect(r.ok, `${name} 应非法`).toBe(false)
      expect((r as { line?: number }).line, `${name} 应含行号`).toBeGreaterThan(0)
      expect((r as { message?: string }).message?.length ?? 0, `${name} 应含 message`).toBeGreaterThan(0)
    }
  })

  it('空源/纯空白快速失败', async () => {
    expect((await validateSource('')).ok).toBe(false)
    expect((await validateSource('   \n\t\n')).ok).toBe(false)
  })

  it('未知头词显式 unsupported', async () => {
    const r = await validateSource('plantuml\n  A -> B')
    expect(r.ok).toBe(false)
    expect((r as { unsupported?: boolean }).unsupported).toBe(true)
    expect((r as { message?: string }).message).toContain('plantuml')
  })
})

describe('docRel 模式（真引擎）', () => {
  const DOC = [
    '# 标题',
    '',
    '前文。',
    '',
    '```mermaid',
    'flowchart LR',
    '  A[开始] --> B[结束]',
    '```',
    '',
    '中段。',
    '',
    '```mermaid',
    'flowchart LR',
    '  A --> B / C --> D',
    '```',
    '',
    '```mermaid',
    'plantuml',
    '  A -> B',
    '```',
    '',
  ].join('\n')

  it('多 fence 逐枚裁决，行号 = fence 起始行', async () => {
    const r = await validateDocFences(DOC)
    expect(r.fences).toHaveLength(3)
    expect(r.fences[0]).toMatchObject({ line: 5, format: 'mermaid', ok: true })
    expect(r.fences[1]).toMatchObject({ line: 12, format: 'mermaid', ok: false })
    expect(r.fences[1].message?.length ?? 0).toBeGreaterThan(0)
  })

  it('未知头词 fence 显式 unsupported', async () => {
    const r = await validateDocFences(DOC)
    expect(r.fences[2]).toMatchObject({ line: 17, ok: false, unsupported: true })
  })

  it('空源/纯空白 fence 快速失败', async () => {
    const doc = '```mermaid\n   \n```'
    const r = await validateDocFences(doc)
    expect(r.fences).toHaveLength(1)
    expect(r.fences[0].ok).toBe(false)
  })

  it('无 mermaid fence 文档返回空集', async () => {
    expect((await validateDocFences('# 空文档\n\n```ts\nconst x = 1\n```\n')).fences).toEqual([])
  })

  it('未闭合 mermaid fence 显式 invalid（bug b3b92a1c：不静默假绿）', async () => {
    const r = await validateDocFences('# t\n```mermaid\nflowchart TD\n A-->B\n')
    expect(r.fences).toHaveLength(1)
    expect(r.fences[0]).toMatchObject({ line: 2, format: 'mermaid', ok: false })
    expect(r.fences[0].message).toContain('未闭合')
  })

  it('闭合 fence 与未闭合 fence 共存：各得裁决', async () => {
    const doc = '```mermaid\nflowchart TD\n A-->B\n```\n\n后文\n\n```mermaid\nflowchart TD\n A-->B\n'
    const r = await validateDocFences(doc)
    expect(r.fences).toHaveLength(2)
    expect(r.fences[0]).toMatchObject({ line: 1, ok: true })
    expect(r.fences[1]).toMatchObject({ line: 8, ok: false })
    expect(r.fences[1].message).toContain('未闭合')
  })
})

describe('flowchart 第一公民专项矩阵（真引擎）', () => {
  const LEGAL = [
    'graph TD\n  A --> B', // graph 旧语法
    // 中文 id：stateDiagram 状态名支持中文 id（实证 2026-10-13：flowchart 裸中文 id 在
    // mermaid 12.1 一律 lexical error——中文在 flowchart 只能经引号标签承载）
    'stateDiagram-v2\n  [*] --> 开始\n  开始 --> [*]',
    'flowchart LR\n  A["开始"] --> B["结束"]', // 中文引号标签
    'flowchart LR\n  A["带:冒号"] --> B["结束"]', // 引号标签
    'flowchart LR\n  A["第一行<br/>第二行"] --> B', // <br/>
    'flowchart LR\n  A["路径/分支"] --> B', // `/` 字符位（引号内）
    'flowchart LR\n  subgraph SA["组"]\n    A --> B\n  end\n  B --> C', // subgraph
  ]
  const ILLEGAL = [
    ILLEGAL_SOURCES.twoNodesOneLine,
    ILLEGAL_SOURCES.dotAtLabel,
    'A --> B', // 缺头残源
  ]

  it('合法集逐条通过', async () => {
    for (const src of LEGAL) {
      expect(await validateSource(src)).toMatchObject({ ok: true, format: 'mermaid' })
    }
  })

  it('非法集逐条命中且错误含行号', async () => {
    for (const src of ILLEGAL) {
      const r = await validateSource(src)
      expect(r.ok).toBe(false)
      expect((r as { line?: number }).line).toBeGreaterThan(0)
      expect((r as { message?: string }).message?.length).toBeGreaterThan(0)
    }
  })
})
