// knowledge-journeys 旅程 spec 共享夹具（非测试文件——include 只收 *.test.ts）。
// 定位：frontmatter 最小读写面（扁平 key: value + 单行 keywords 列表——本旅程族夹具
// 与断言所用的子集），避免 tests/ 树对包级依赖（gray-matter）的越界解析；
// YAML 全量 round-trip 语义归包内单测（service/write.ts ⑧ 段）。
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface FmView {
  readonly data: Record<string, string>
  readonly content: string
}

/** 解析 `---\n<yaml>\n---\n<body>` 的扁平子集（key: value / key: [a, b]） */
export function parseFm(text: string): FmView {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
  if (m === null) return { data: {}, content: text }
  const data: Record<string, string> = {}
  for (const line of m[1]!.split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line)
    if (kv === null) continue
    let v = kv[2]!.trim()
    if (v.startsWith('[') && v.endsWith(']')) {
      v = v.slice(1, -1).split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).join(', ')
    } else {
      v = v.replace(/^['"]|['"]$/g, '')
    }
    data[kv[1]!] = v
  }
  return { data, content: m[2]! }
}

/** 在 frontmatter 块内追加/覆盖一个扁平字段（保留其余行逐字不变） */
export function withFmField(text: string, key: string, value: string): string {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
  if (m === null) throw new Error('withFmField: frontmatter 块缺席')
  const lines = m[1]!.split(/\r?\n/).filter((l) => !new RegExp(`^${key}:`).test(l))
  lines.push(`${key}: ${value}`)
  return `---\n${lines.join('\n')}\n---\n${m[2]!}`
}

/** 手工落盘夹具文件（frontmatter 行 + 正文） */
export function craftFile(dir: string, name: string, fmLines: readonly string[], body: string): string {
  const file = join(dir, name)
  writeFileSync(file, `---\n${fmLines.join('\n')}\n---\n\n${body}\n`, 'utf8')
  return file
}
