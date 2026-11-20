// md-mermaid 迁居批 1.2 结构 pin——包居所拓扑守卫（迁移批圆桌修正 #2/#7）：
//   ① 旧居所禁入：packages/plugins/ 下 md-mermaid 子居所路径字面在代码/配置/锁文件
//     中零命中（范围 = 仓库全部文本工件，显式含 tsconfig 与 tests/；注释与文档指称
//     白名单豁免——守卫由本 pin 沉淀承担，不靠验收期一次性 grep）。
//   ② 新居所在场：根 tsconfig reference / apps/web tsconfig reference / vitest 项目
//     include / profile.dev link 指新路径（兼承零用例假绿防护——路径断链即红）。
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../../')
// 旧路径字面量分段拼装——本守卫文件自身不含旧路径完整字面（自命中豁免面归零）
const OLD_PATH = ['packages', 'plugins', 'md-mermaid'].join('/')
const NEW_PATH = 'plugins/md-mermaid'

// 注释与文档指称白名单（圆桌裁决 2026-11-19）：历史叙事/对照指称不构成解析面——
// 命中文件按行过滤后剩余命中才算违规。
const WHITELIST_MARKERS = [
  'docs/',
  'README',
  'e2e/specs/blitz/md-mermaid-plugin.spec.ts',
  'scripts/assemble-installer-resources.mjs',
  'scripts/dev-ensure-packages.mjs',
  'scripts/dev.mjs',
  'scripts/ensure-host-dist.mjs',
  'scripts/workspace-plugin-dirs.mjs',
  'plugins/expert-squad/tests/panel-filter.test.ts',
  'plugins/task-loop/ui/dock-tabs/docs/index.tsx',
  'plugins/project/ui/dock-tabs/docs/index.tsx',
  'apps/web/src/views/docs/README.md',
  'apps/host/src/profile/template.ts',
  'packages/plugin-forge/src/dispatch-core/assemble.ts',
]

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.git' || name === '.forge') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* walk(p)
    else yield p
  }
}

describe('md-mermaid 包居所拓扑守卫（迁居批 1.2）', () => {
  it(`旧居所禁入：${OLD_PATH} 代码/配置/锁文件零命中（白名单指称豁免）`, () => {
    const offenders: string[] = []
    for (const file of walk(ROOT)) {
      if (!/\.(ts|tsx|mjs|cjs|js|json|ya?ml|md)$/.test(file)) continue
      const rel = file.slice(ROOT.length + 1).replaceAll('\\', '/')
      if (WHITELIST_MARKERS.some((m) => rel === m || rel.startsWith(m))) continue
      const text = readFileSync(file, 'utf8')
      if (text.includes(OLD_PATH)) offenders.push(rel)
    }
    expect(offenders, `旧包居所残留（迁居批 1.2 应零命中）: ${offenders.join(', ')}`).toEqual([])
  })

  it('新居所在场：solution/web tsconfig reference + vitest include + profile.dev link 指新路径', () => {
    const rootTs = readFileSync(join(ROOT, 'tsconfig.json'), 'utf8')
    expect(rootTs).toContain(`"path": "${NEW_PATH}"`)
    const webTs = readFileSync(join(ROOT, 'apps/web/tsconfig.json'), 'utf8')
    expect(webTs).toContain(`"path": "../../${NEW_PATH}"`)
    const vitest = readFileSync(join(ROOT, 'vitest.config.ts'), 'utf8')
    expect(vitest).toContain(`'${NEW_PATH}/tests/**/*.test.{ts,tsx}'`)
    expect(vitest).toContain(`'${NEW_PATH}/ui/**/*.test.{ts,tsx}'`)
    const devPkg = readFileSync(join(ROOT, 'apps/host/profile.dev/package.json'), 'utf8')
    expect(devPkg).toContain(`"link:../../../${NEW_PATH}"`)
    expect(readFileSync(join(ROOT, NEW_PATH, 'package.json'), 'utf8')).toBeDefined()
  })
})
