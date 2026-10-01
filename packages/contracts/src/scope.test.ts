// 1.3 AC4 + Hard Rule —— 契约层定位铁律的机械自证：纯类型与常量，零逻辑零依赖。
// - 零逻辑：src 非 test 文件禁函数体（function 关键字 / 箭头 / class 均为逻辑载体）
// - 零依赖：import 仅限包内相对路径（不出现任何包名导入）
// （package.json 依赖段为空已由 tests/structure/scaffold.test.ts pin，此处不重复。）
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '.')

function collectSourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...collectSourceFiles(p))
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push(p)
  }
  return out
}

const SOURCE_FILES = collectSourceFiles(SRC_ROOT)

describe('AC4 定位铁律：零逻辑零依赖', () => {
  it('src 有非 test 源文件可供扫描（防扫描面退化为空）', () => {
    expect(SOURCE_FILES.length).toBeGreaterThanOrEqual(6)
  })

  it('零逻辑：非 test 源文件无函数体载体（function / 箭头 / class）', () => {
    for (const file of SOURCE_FILES) {
      const content = readFileSync(file, 'utf8')
      const rel = file.slice(SRC_ROOT.length + 1)
      expect(content, `${rel} 含 function`).not.toMatch(/\bfunction\b/)
      expect(content, `${rel} 含箭头`).not.toMatch(/=>/)
      expect(content, `${rel} 含 class`).not.toMatch(/\bclass\b/)
    }
  })

  it('零依赖：import 仅限包内相对路径（无任何包名导入）', () => {
    const importRe = /^\s*import\b[^;]*?from\s+['"]([^'"]+)['"]/gm
    for (const file of SOURCE_FILES) {
      const content = readFileSync(file, 'utf8')
      const rel = file.slice(SRC_ROOT.length + 1)
      for (const match of content.matchAll(importRe)) {
        const specifier = match[1]
        expect(specifier, `${rel} 导入非相对路径 ${specifier}`).toMatch(/^\./)
      }
    }
  })
})
