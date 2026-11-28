// 1.3 AC4 + Hard Rule —— 契约基座定位铁律的机械自证：lib/api/src 允许携带逻辑的文件 = 显式
// 清单；清单外文件保持原契约层口径——纯类型与常量、零逻辑零依赖。
// - 零逻辑：非 test 源文件禁函数体（function 关键字 / 箭头 / class 均为逻辑载体）
// - 零依赖：import 仅限包内相对路径（不出现任何包名导入）
// 允许携带逻辑的显式清单与依据（逐文件，lib/api 当前事实核对 2026-11-28）：
// - tool-projection.ts —— 中立域纯逻辑模块（工具注册面投影/求交族单源）；对官方包仅
//   type-only import（@deepseek-ai/dsh-agent-preset-registry，AGENTS §1.5），运行期零依赖。
// - subagent-assemble.ts —— 子会话组装内核纯逻辑模块（persona 合成 / agentOptions 折叠族
//   单源）；仅包内相对导入，零官方包导入、运行期零依赖。
// - tools/args.ts —— tool 入参防衍收窄共享原语（parseXxxArgs 族 + ToolArgsError，纯函数）。
// - tools/doc-style.ts —— doc-style 系统提示段渲染单源（模板块文本合成纯函数）。
// - tools/forge-paths.ts —— Spec 文档落盘路径派生单源（specDocRelPath 纯函数 + 常量）。
// - tools/format.ts —— tool 返回面双友好格式化模板单源（formatOk/formatErr 纯函数族）。
// 归属待裁决项（不在本卡移动）：tools/ 目录四文件为「业务 tool 面共享原语」，逻辑语义上
// 已超出契约基座——寄居 lib/api 基座是 plugin-spec 1.4 的既定落位，如需归位到独立 lib 包
// 另行裁决。
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '.')

/** 集中化裁决例外文件（允许携带逻辑——函数体与官方 type-only import 豁免） */
const LOGIC_MODULES = [
  'tool-projection.ts',
  'subagent-assemble.ts',
  'tools/args.ts',
  'tools/doc-style.ts',
  'tools/forge-paths.ts',
  'tools/format.ts',
]

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

describe('AC4 定位铁律：清单外零逻辑零依赖', () => {
  it('src 有非 test 源文件可供扫描（防扫描面退化为空）', () => {
    expect(SOURCE_FILES.length).toBeGreaterThanOrEqual(6)
  })

  it('逻辑模块清单恰好命中当前事实（清单外新增携带函数体的文件即红）', () => {
    expect(SOURCE_FILES.length).toBeGreaterThan(LOGIC_MODULES.length)
    for (const rel of LOGIC_MODULES) {
      expect(SOURCE_FILES.map((f) => f.slice(SRC_ROOT.length + 1).replaceAll('\\', '/')), `逻辑模块 ${rel} 缺席`).toContain(rel)
    }
  })

  it('零逻辑：非 test 源文件无函数体载体（function / 箭头 / class）——逻辑模块清单豁免', () => {
    for (const file of SOURCE_FILES) {
      const rel = file.slice(SRC_ROOT.length + 1).replaceAll('\\', '/')
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
      const rel = file.slice(SRC_ROOT.length + 1).replaceAll('\\', '/')
      for (const match of content.matchAll(importRe)) {
        const specifier = match[1]
        if (isLogicModule(rel) && specifier!.startsWith('@deepseek-ai/')) continue
        expect(specifier, `${rel} 导入非相对路径 ${specifier}`).toMatch(/^\./)
      }
    }
  })

  it('逻辑模块官方包导入恒 type-only（运行期零依赖——值导入即违规）', () => {
    for (const name of LOGIC_MODULES) {
      const content = readFileSync(join(SRC_ROOT, name), 'utf8')
      for (const match of content.matchAll(/^\s*import\s+(type\s+)?[^;]*?from\s+['"](@deepseek-ai\/[^'"]+)['"]/gm)) {
        expect((match[1] ?? '').trim(), `${match[2]} 必须 type-only import`).toBe('type')
      }
    }
  })
})
