// 3.4 单测 —— AC3 机械自证：插件仅依赖 forgeKnowledge 服务类型，零实现级 import。
// 构建图三面：package.json dependencies（发版运行期面）、src 非测试源（import 面）、
// tsconfig references（tsc 拓扑——设计裁定为「仅类型依赖」边，由 tests/structure pin）。
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const PKG_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('AC3 插件仅依赖 forgeKnowledge 服务类型（构建图机械自证）', () => {
  it('package.json dependencies 不含 @dsh-forge/core（发版运行期零 core 边——可独立发版前提）', () => {
    const pkg = JSON.parse(readFileSync(join(PKG_DIR, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    expect(Object.keys(pkg.dependencies ?? {})).not.toContain('@dsh-forge/core')
  })

  it('src 非测试源零 @dsh-forge/core import（服务类型出自 contracts 单一来源）', () => {
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
    for (const f of files) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/@dsh-forge\/core/)
    }
  })

  it('tsconfig references = contracts+path-key（core 边已除——fix-33：build 面零 core import，残留引用无消费）', () => {
    const ts = JSON.parse(readFileSync(join(PKG_DIR, 'tsconfig.json'), 'utf8')) as {
      references?: { path: string }[]
    }
    const refs = (ts.references ?? []).map((r) => r.path)
    expect(refs).toContain('../contracts')
    // fix-33：../core 引用删除——knowledge build 面零 core import（类型经 contracts 引入）；
    // 测试面 core 源相对引入（integration-core）由 tsconfig.test.json 承载（不经 references）
    expect(refs).not.toContain('../core')
  })
})
