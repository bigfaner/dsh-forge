// SC-2 机械自证（1.8 core 退役后口径钉死）：knowledge 包零 @dsh-forge/core 与零
// expert-squad 依赖——服务类型自有（src/service/types.ts，Interface 2 随迁），信封类型
// 经 contracts；expert-squad 装卸不改变 knowledge 行为。
// 构建图三面：package.json dependencies（发版运行期面）、src 非测试源（import 面）、
// tsconfig references（tsc 拓扑——设计裁定为「仅类型依赖」边，由 tests/structure pin）。
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const PKG_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('SC-2 插件零 core / 零 expert-squad 依赖（构建图机械自证）', () => {
  it('package.json dependencies 不含 @dsh-forge/core 与 expert-squad（发版运行期零边——可独立发版前提）', () => {
    const pkg = JSON.parse(readFileSync(join(PKG_DIR, 'package.json'), 'utf8')) as Record<
      string,
      Record<string, string> | undefined
    >
    for (const key of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
      const names = Object.keys(pkg[key] ?? {})
      expect(names, key).not.toContain('@dsh-forge/core')
      expect(names.filter((n) => n.includes('expert-squad')), key).toEqual([])
    }
  })

  it('src 非测试源零 @dsh-forge/core 与零 expert-squad import（服务类型自有 src/service/types.ts——零实现级依赖；注释提及不算依赖）', () => {
    const files: string[] = []
    const walk = (dir: string): void => {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, ent.name)
        if (ent.isDirectory()) walk(p)
        else if (ent.name.endsWith('.ts') && !ent.name.endsWith('.test.ts')) files.push(p)
      }
    }
    walk(join(PKG_DIR, 'src'))
    expect(files.length).toBeGreaterThan(0)
    // import 语句面（静态 import / export-from / 动态 import / require——注释与字符串文案不计）
    const importRe = /^\s*(?:import|export)[^;\n]*['"][^'"]*(?:@dsh-forge\/core|expert-squad)['"]/m
    const dynamicRe = /(?:import\s*\(\s*|require\s*\(\s*)['"][^'"]*(?:@dsh-forge\/core|expert-squad)['"]/
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      expect(src, f).not.toMatch(importRe)
      expect(src, f).not.toMatch(dynamicRe)
    }
  })

  it('tsconfig references = contracts+path-key（零 core / 零 expert-squad 边——build 面零外业务 import）', () => {
    const ts = JSON.parse(readFileSync(join(PKG_DIR, 'tsconfig.json'), 'utf8')) as {
      references?: { path: string }[]
    }
    const refs = (ts.references ?? []).map((r) => r.path)
    expect(refs).toContain('../../contracts')
    expect(refs).not.toContain('../../core')
    expect(refs.filter((r) => r.includes('expert-squad'))).toEqual([])
  })
})
