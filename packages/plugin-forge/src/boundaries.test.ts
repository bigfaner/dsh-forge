// 3.2 单测（3.4 pin 修订——tech-design 边界 1）—— AC1 机械自证：deps =
// contracts + path-key + dsh 上游运行时包白名单（@deepseek-ai/dsh-subagent-in-process-driver
// ——dispatchTask spawn 通道；插件对 core 仍零实现级 import，纪律不破：driver 非 core）
// + 零 cordis 运行时依赖（knowledge 同型）。构建图四面：package.json dependencies
// （发版运行期面）、src 非测试源（import 面）、tsconfig references（tsc 拓扑——driver
// 为外部 npm 精确 pin 非工作区工程，不入 references）、运行时包名扫描（@deepseek-ai/*
// 白名单 + cordis）。
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const PKG_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')

/** dsh 上游运行时包白名单（tech-design 边界 1：boundaries pin 修订——「contracts +
 *  path-key + dsh 上游运行时包白名单」；新成员 = 契约面变更） */
const DSH_RUNTIME_ALLOWLIST = ['@deepseek-ai/dsh-subagent-in-process-driver'] as const

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

describe('AC1 插件依赖边界（构建图机械自证——3.4 修订：driver 白名单）', () => {
  it('package.json dependencies = contracts + path-key + driver 白名单恰三项（Hard Rule：禁 core 实现 / cordis 运行时）', () => {
    const pkg = JSON.parse(readFileSync(join(PKG_DIR, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
      optionalDependencies?: Record<string, string>
    }
    expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual([
      ...DSH_RUNTIME_ALLOWLIST,
      '@dsh-forge/contracts',
      '@dsh-forge/path-key',
    ])
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

  it('src 非测试源 @deepseek-ai import 仅白名单包、且仅 spawn 真绑定单点（driver import 面收口）', () => {
    const importers: string[] = []
    for (const f of srcFiles()) {
      const rel = relative(PKG_DIR, f).split('\\').join('/')
      const src = readFileSync(f, 'utf8')
      expect(src, `${rel} cordis`).not.toMatch(/['"]cordis['"]/)
      const specifiers = [...src.matchAll(/['"](@deepseek-ai\/[^'"]+)['"]/g)].map((m) => m[1] ?? '')
      const offending = specifiers.filter((s) => !(DSH_RUNTIME_ALLOWLIST as readonly string[]).includes(s))
      expect(offending, `${rel} 白名单外 @deepseek-ai import`).toEqual([])
      if (specifiers.length > 0) importers.push(rel)
    }
    expect(importers.sort()).toEqual(['src/spawn/in-process-driver.ts'])
  })

  it('tsconfig references = contracts + path-key（driver = 外部 npm 精确 pin，非工作区工程）', () => {
    const ts = JSON.parse(readFileSync(join(PKG_DIR, 'tsconfig.json'), 'utf8')) as {
      references?: { path: string }[]
    }
    const refs = (ts.references ?? []).map((r) => r.path)
    expect(refs.sort()).toEqual(['../contracts', '../path-key'])
  })
})
