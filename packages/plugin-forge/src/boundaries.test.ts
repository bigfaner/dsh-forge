// 3.2 单测 —— AC1 机械自证：deps 仅 contracts + path-key，零 cordis/dsh 运行时依赖
//（knowledge 同型）+ 零 core import（Hard Rule：cwd 数据缝经 bindingsFile config 注入）。
// 构建图四面：package.json dependencies（发版运行期面）、src 非测试源（import 面）、
// tsconfig references（tsc 拓扑）、运行时包名扫描（@deepseek-ai/* 与 cordis）。
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const PKG_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')

function srcFiles(): string[] {
  const files: string[] = []
  const walk = (dir: string): void => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, ent.name)
      if (ent.isDirectory()) walk(p)
      else if (ent.name.endsWith('.ts') && !ent.name.endsWith('.test.ts')) files.push(p)
    }
  }
  walk(join(PKG_DIR, 'src'))
  return files
}

describe('AC1 插件依赖边界（构建图机械自证）', () => {
  it('package.json dependencies = contracts + path-key 恰两项（Hard Rule：禁 core 实现 / cordis 运行时）', () => {
    const pkg = JSON.parse(readFileSync(join(PKG_DIR, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
      optionalDependencies?: Record<string, string>
    }
    expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual(['@dsh-forge/contracts', '@dsh-forge/path-key'])
    for (const face of ['peerDependencies', 'optionalDependencies']) {
      expect(Object.keys(pkg[face as keyof typeof pkg] ?? {}), face).toHaveLength(0)
    }
  })

  it('src 非测试源零 @dsh-forge/core import（cwd 数据缝经 bindingsFile config——服务类型出自 contracts）', () => {
    const files = srcFiles()
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/@dsh-forge\/core/)
    }
  })

  it('src 非测试源零运行时栈 import（@deepseek-ai/* 与 cordis——结构化最小面纪律，可独立发版前提）', () => {
    // 匹配 import 说明符（引号限界）——注释中的包名提及不算越界
    for (const f of srcFiles()) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/['"]@deepseek-ai\//)
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/['"]cordis['"]/)
    }
  })

  it('tsconfig references = contracts + path-key', () => {
    const ts = JSON.parse(readFileSync(join(PKG_DIR, 'tsconfig.json'), 'utf8')) as {
      references?: { path: string }[]
    }
    const refs = (ts.references ?? []).map((r) => r.path)
    expect(refs.sort()).toEqual(['../contracts', '../path-key'])
  })
})
