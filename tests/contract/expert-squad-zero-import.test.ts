// t-ac7 机械自证测试：task-loop / spec / knowledge / forge / project 五件 host 源
// 零 @dsh-forge/expert-squad import——配方照 knowledge 包 SC-2 零依赖 pin 测试
// （plugins/knowledge/tests/boundaries.test.ts 的 import 扫描段）。
// 口径：expert-squad 自身除外豁免；forge 为 bundle 聚合包，package.json 依赖面
// 天然含 expert-squad（file:../expert-squad 聚合安装），不在依赖面断言范围——
// 本测试只钉 host 非测试源 import 面（完整说明符 @dsh-forge/expert-squad；
// 注释、字符串文案与同名值字面量不计——同名值字面量判例）。
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const PKG_DIR: Record<string, string> = {
  'task-loop': join(REPO_ROOT, 'plugins', 'task-loop'),
  spec: join(REPO_ROOT, 'plugins', 'spec'),
  knowledge: join(REPO_ROOT, 'plugins', 'knowledge'),
  forge: join(REPO_ROOT, 'plugins', 'forge'),
  project: join(REPO_ROOT, 'plugins', 'project'),
}

describe('t-ac7 五件 host 源零 @dsh-forge/expert-squad import（机械自证，配方照 knowledge SC-2）', () => {
  it.each(Object.keys(PKG_DIR))('%s：host 非测试源零 expert-squad import', (name) => {
    const files: string[] = []
    const walk = (dir: string): void => {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, ent.name)
        if (ent.isDirectory()) walk(p)
        else if (ent.name.endsWith('.ts') && !ent.name.endsWith('.test.ts')) files.push(p)
      }
    }
    walk(join(PKG_DIR[name]!, 'host'))
    expect(files.length, `${name} host 源非空`).toBeGreaterThan(0)
    // import 语句面（静态 import / export-from / 动态 import / require——完整包说明符匹配）
    const importRe = /^\s*(?:import|export)[^;\n]*from\s*['"]@dsh-forge\/expert-squad(?:\/[^'"]*)?['"]/m
    const sideEffectRe = /^\s*import\s*['"]@dsh-forge\/expert-squad(?:\/[^'"]*)?['"]/m
    const dynamicRe = /(?:import\s*\(\s*|require\s*\(\s*)['"]@dsh-forge\/expert-squad(?:\/[^'"]*)?['"]/
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      expect(src, f).not.toMatch(importRe)
      expect(src, f).not.toMatch(sideEffectRe)
      expect(src, f).not.toMatch(dynamicRe)
    }
  })
})
