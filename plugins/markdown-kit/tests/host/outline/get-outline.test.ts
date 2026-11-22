// getOutline 单测（契约 get-outline.md GO-1/GO-2/GO-3 + goal 双向判决面）：
// - 纯逻辑单源（parseMarkdownOutline）：嵌套树/行号锚/跳级/空文档/围栏零误判/
//   setext 显式标注/depth 双向截断
// - 壳（createGetOutlineTool）：schema 收窄 typed error 闭环 + cwd 锚 + 注入 fs 缝 +
//   lossless JSON 整值边界（判例 223ba5b3——可选键 undefined 剔除）
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseMarkdownOutline } from '../../../host/outline/index.js'
import {
  GET_MD_OUTLINE,
  MD_OUTLINE_EVENT,
  MD_OUTLINE_FAIL_EVENT,
  createGetOutlineTool,
  GetOutlineError,
  isGetOutlineError,
  parseGetOutlineArgs,
  renderOutline,
} from '../../../host/tools/get-outline.js'
import { createMemoryFs } from '../convert/memory-fs.js'
import type { ToolExecFace } from '../../../host/faces.js'

const FIXTURE = readFileSync(fileURLToPath(new URL('fixtures/outline-sample.md', import.meta.url)), 'utf8')
const FIXTURE_HEADING_LINES = [1, 3, 5, 7, 9, 16]
const WS = 'Z:\\ws'
const wsFile = (rel: string): string => resolve(WS, rel)

const execWithCwd = (cwd: string): ToolExecFace => ({ agent: { session: { header: { cwd } } } })

/** 收集树内全部行号（按 line 集合断言——契约 GO 锚面） */
function linesOf(nodes: ReturnType<typeof parseMarkdownOutline>['nodes']): number[] {
  const out: number[] = []
  const walk = (list: typeof nodes): void => {
    for (const n of list) {
      out.push(n.line)
      walk(n.children)
    }
  }
  walk(nodes)
  return out.sort((a, b) => a - b)
}

describe('parseMarkdownOutline（纯逻辑单源）', () => {
  it('GO-1 大纲树 + 行号锚：节点数 6，h1 下 3 个 h2，层级关系与行号逐值精确', () => {
    const r = parseMarkdownOutline(FIXTURE)
    expect(r.nodes).toHaveLength(1)
    const h1 = r.nodes[0]
    expect(h1.title).toBe('Doc Title')
    expect(h1.level).toBe(1)
    expect(h1.line).toBe(1)
    expect(h1.children.map((c) => [c.title, c.level, c.line])).toEqual([
      ['Section Alpha', 2, 3],
      ['Section Beta', 2, 9],
      ['Section Gamma', 2, 16],
    ])
    const alpha = h1.children[0]
    expect(alpha.children.map((c) => [c.title, c.level, c.line])).toEqual([['Detail One', 3, 5]])
    expect(alpha.children[0].children.map((c) => [c.title, c.level, c.line])).toEqual([['Sub Detail', 4, 7]])
    expect(linesOf(r.nodes)).toEqual(FIXTURE_HEADING_LINES)
    expect(r.setextUnsupportedLines).toBeUndefined()
  })

  it('GO-2 代码块内 # 零误判：line 集合精确等于真实标题行（不含 L12 及围栏内行）', () => {
    expect(linesOf(parseMarkdownOutline(FIXTURE).nodes)).toEqual([1, 3, 5, 7, 9, 16])
  })

  it('GO-3 depth 截断双向：depth 2 → [1,3,9,16]（树关系保持）；depth 1 → [1]', () => {
    const d2 = parseMarkdownOutline(FIXTURE, { depth: 2 })
    expect(linesOf(d2.nodes)).toEqual([1, 3, 9, 16])
    expect(d2.nodes[0].children.map((c) => c.title)).toEqual(['Section Alpha', 'Section Beta', 'Section Gamma'])
    expect(d2.nodes[0].children.every((c) => c.children.length === 0)).toBe(true)
    const d1 = parseMarkdownOutline(FIXTURE, { depth: 1 })
    expect(linesOf(d1.nodes)).toEqual([1])
    expect(d1.nodes[0].children).toEqual([])
  })

  it('嵌套跳级：h1 直接跟 h3/h4 不丢节点（宽松挂靠最近更浅层）；回退 h2 挂回 h1', () => {
    const r = parseMarkdownOutline('# A\n### C\n#### D\n## B\n')
    expect(r.nodes).toHaveLength(1)
    expect(r.nodes[0].children.map((c) => [c.title, c.level])).toEqual([
      ['C', 3],
      ['B', 2],
    ])
    expect(r.nodes[0].children[0].children.map((c) => c.title)).toEqual(['D'])
    expect(linesOf(r.nodes)).toEqual([1, 2, 3, 4])
  })

  it('空文档：nodes 为空数组（非 undefined）', () => {
    const r = parseMarkdownOutline('')
    expect(r.nodes).toEqual([])
    expect(r.setextUnsupportedLines).toBeUndefined()
  })

  it('setext 下划线标题：不进树，显式标注下划线行号（非静默跳过）', () => {
    const doc = 'Title Text\n===========\n\nafter\n\nSub Text\n---\n'
    const r = parseMarkdownOutline(doc)
    expect(r.nodes).toEqual([])
    expect(r.setextUnsupportedLines).toEqual([2, 7])
  })

  it('围栏状态机：成对 ``` 开合，列表项单 `-` 不误判为 setext', () => {
    const doc = '# H\n\n```\n## fake\n```\n\n- item\n'
    expect(linesOf(parseMarkdownOutline(doc).nodes)).toEqual([1])
  })
})

describe('getOutline 壳（schema 收窄 + cwd 锚 + fs 缝 + typed error + diag）', () => {
  it('工具名常量字面量单源 + description/parameters 形状', () => {
    expect(GET_MD_OUTLINE).toBe('getOutline')
    const tool = createGetOutlineTool()
    expect(tool.name).toBe(GET_MD_OUTLINE)
    expect(tool.parameters.required).toEqual(['docRel'])
    expect(tool.parameters.properties.depth?.type).toBe('integer')
  })

  it('契约 GO-1/GO-2：fs 缝注入读取 fixture，节点 title/level/line/children 恒在场', async () => {
    const mem = createMemoryFs({ [wsFile('doc.md')]: Buffer.from(FIXTURE) })
    const tool = createGetOutlineTool({ fs: mem.fs })
    const value = (await tool.execute({ docRel: 'doc.md' }, execWithCwd(WS))) as ReturnType<typeof parseMarkdownOutline>
    expect(linesOf(value.nodes)).toEqual([1, 3, 5, 7, 9, 16])
    // lossless JSON 整值边界（判例 223ba5b3）：setext 未触发 → 键彻底剔除（非 undefined 属性残留）
    expect(Object.keys(value)).toEqual(['nodes'])
    expect(JSON.stringify(value)).not.toContain('null')
    // 叶节点 children 恒在场（空数组，非缺键）
    expect(JSON.parse(JSON.stringify(value)).nodes[0].children).toEqual(expect.any(Array))
  })

  it('setext 标注随结果透出（键仅在有 setext 时在场——undefined 剔除）', async () => {
    const doc = 'Title\n=====\n'
    const mem = createMemoryFs({ [wsFile('doc.md')]: Buffer.from(doc) })
    const tool = createGetOutlineTool({ fs: mem.fs })
    const value = (await tool.execute({ docRel: 'doc.md' }, execWithCwd(WS))) as ReturnType<typeof parseMarkdownOutline>
    expect(value.setextUnsupportedLines).toEqual([2])
    expect(Object.keys(value).sort()).toEqual(['nodes', 'setextUnsupportedLines'])
    expect(renderOutline(value)[0].text).toContain('setext-style headings are not supported')
  })

  it('ERR_INVALID_ARGS：docRel 缺席/空、depth 非整数或越界', async () => {
    const tool = createGetOutlineTool()
    for (const args of [undefined, {}, { docRel: '' }, { docRel: 'a.md', depth: 0 }, { docRel: 'a.md', depth: 7 }, { docRel: 'a.md', depth: 1.5 }, { docRel: 'a.md', depth: '2' }]) {
      await expect(tool.execute(args, execWithCwd(WS))).rejects.toSatisfy((e: unknown) => isGetOutlineError(e) && e.code === 'ERR_INVALID_ARGS')
    }
    expect(parseGetOutlineArgs({ docRel: 'a.md', depth: 3 })).toEqual({ docRel: 'a.md', depth: 3 })
  })

  it('cwd 缺席 → ERR_IO 拒绝（不猜测根、零读取）；路径穿越/绝对路径 → ERR_IO', async () => {
    const mem = createMemoryFs({ [wsFile('a.md')]: Buffer.from('# H\n') })
    const tool = createGetOutlineTool({ fs: mem.fs })
    await expect(tool.execute({ docRel: 'a.md' }, undefined)).rejects.toSatisfy((e: unknown) => isGetOutlineError(e) && e.code === 'ERR_IO')
    expect(mem.writtenPaths).toEqual([])
    await expect(tool.execute({ docRel: '../outside.md' }, execWithCwd(WS))).rejects.toSatisfy((e: unknown) => isGetOutlineError(e) && e.code === 'ERR_IO')
    await expect(tool.execute({ docRel: 'C:\\abs.md' }, execWithCwd(WS))).rejects.toSatisfy((e: unknown) => isGetOutlineError(e) && e.code === 'ERR_IO')
    // 拒绝先于任何读取消耗：内存 fs 未被触（无读取计数面，以内容原样在场对账）
    expect(mem.files.get(wsFile('a.md'))?.toString()).toBe('# H\n')
  })

  it('文件不可读 → ERR_INVALID_ARGS + cannot read document 语义（validateMermaid 既有口径）', async () => {
    const tool = createGetOutlineTool({ fs: createMemoryFs().fs })
    const err = await tool.execute({ docRel: 'missing.md' }, execWithCwd(WS)).catch((e: unknown) => e)
    expect(isGetOutlineError(err)).toBe(true)
    expect((err as GetOutlineError).code).toBe('ERR_INVALID_ARGS')
    expect((err as GetOutlineError).message).toContain('cannot read document')
  })

  it('emitDiag md-outline 前缀：成功 info / 失败 error 双路径发射', async () => {
    const diag: Array<{ event: string; level: string }> = []
    const emit = (payload: { event: string; level: string }): void => {
      diag.push({ event: payload.event, level: payload.level })
    }
    const okTool = createGetOutlineTool({ fs: createMemoryFs({ [wsFile('a.md')]: Buffer.from('# H\n') }).fs, emit })
    await okTool.execute({ docRel: 'a.md' }, execWithCwd(WS))
    const failTool = createGetOutlineTool({ fs: createMemoryFs().fs, emit })
    await expect(failTool.execute({ docRel: 'nope.md' }, execWithCwd(WS))).rejects.toBeTruthy()
    expect(diag.map((d) => d.event)).toEqual([MD_OUTLINE_EVENT, MD_OUTLINE_FAIL_EVENT])
    expect(diag[0].level).toBe('info')
    expect(diag[1].level).toBe('error')
    expect(MD_OUTLINE_EVENT).toBe('md-outline')
  })

  it('depth 截断经壳透传：depth 1 → 仅 h1 节点', async () => {
    const mem = createMemoryFs({ [wsFile('doc.md')]: Buffer.from(FIXTURE) })
    const tool = createGetOutlineTool({ fs: mem.fs })
    const value = (await tool.execute({ docRel: 'doc.md', depth: 1 }, execWithCwd(WS))) as ReturnType<typeof parseMarkdownOutline>
    expect(linesOf(value.nodes)).toEqual([1])
  })
})
