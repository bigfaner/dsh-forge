// 1.3 AC4 + Hard Rule —— 契约层定位铁律的机械自证：纯类型与常量，零逻辑零依赖。
// - 零逻辑：src 非 test 文件禁函数体（function 关键字 / 箭头 / class 均为逻辑载体）
// - 零依赖：import 仅限包内相对路径（不出现任何包名导入）
// （package.json 依赖段为空已由 tests/structure/scaffold.test.ts pin，此处不重复。）
// 例外（bug a5b12254 集中化裁决）：tool-projection.ts = 中立域纯逻辑模块（工具注册面
// 投影/求交族单源）——携带函数体；对官方包仅 type-only import（@deepseek-ai/dsh-
// agent-preset-registry，AGENTS §1.5），运行期零依赖。其余文件铁律不变。
// 例外扩员（架构裁决 verification-report §5.1 ⑤ 最小增量）：subagent-assemble.ts =
// 子会话组装内核纯逻辑模块（persona 合成 / agentOptions 折叠族单源）——仅包内相对
// type-only import（dto/forge ReasoningEffortLevel），零官方包导入、运行期零依赖。
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '.')

/** 集中化裁决例外文件（纯逻辑模块——函数体与官方 type-only import 豁免） */
const LOGIC_MODULES = ['tool-projection.ts', 'subagent-assemble.ts']

function isLogicModule(rel: string): boolean {
  return LOGIC_MODULES.includes(rel)
}

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

  it('零逻辑：非 test 源文件无函数体载体（function / 箭头 / class）——tool-projection 纯逻辑模块豁免', () => {
    for (const file of SOURCE_FILES) {
      const rel = file.slice(SRC_ROOT.length + 1)
      if (isLogicModule(rel)) continue
      const content = readFileSync(file, 'utf8')
      expect(content, `${rel} 含 function`).not.toMatch(/\bfunction\b/)
      expect(content, `${rel} 含箭头`).not.toMatch(/=>/)
      expect(content, `${rel} 含 class`).not.toMatch(/\bclass\b/)
    }
  })

  it('零依赖：import 仅限包内相对路径（无任何包名导入）——tool-projection 官方 type-only 豁免', () => {
    const importRe = /^\s*import\b[^;]*?from\s+['"]([^'"]+)['"]/gm
    for (const file of SOURCE_FILES) {
      const content = readFileSync(file, 'utf8')
      const rel = file.slice(SRC_ROOT.length + 1)
      for (const match of content.matchAll(importRe)) {
        const specifier = match[1]
        if (isLogicModule(rel) && specifier.startsWith('@deepseek-ai/')) continue
        expect(specifier, `${rel} 导入非相对路径 ${specifier}`).toMatch(/^\./)
      }
    }
  })

  it('纯逻辑模块官方包导入恒 type-only（运行期零依赖——值导入即违规）', () => {
    for (const name of LOGIC_MODULES) {
      const content = readFileSync(join(SRC_ROOT, name), 'utf8')
      for (const match of content.matchAll(/^\s*import\s+(type\s+)?[^;]*?from\s+['"](@deepseek-ai\/[^'"]+)['"]/gm)) {
        expect((match[1] ?? '').trim(), `${match[2]} 必须 type-only import`).toBe('type')
      }
    }
  })
})
