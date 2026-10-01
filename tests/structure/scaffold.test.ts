// 任务 1.2 结构化 pin 测试 —— Monorepo 五工件骨架 + G0–G2 质量门基建。
// 权威来源：docs/features/dsh-forge-p1-mvp/design/tech-design.md「Monorepo 工程规范与协作机制」
// /「样式风格纪律」/「Testing Strategy」。业务实现自 2.x 起，本文件只 pin 骨架形状。
import { existsSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../../')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const readJson = (p: string) => JSON.parse(read(p)) as Record<string, unknown>
const rel = (p: string) => relative(ROOT, resolve(ROOT, p)).split('\\').join('/')

describe('AC1 五工件 workspace 与 references 拓扑', () => {
  it('pnpm-workspace.yaml 收敛 apps/* 与 packages/*', () => {
    const yaml = read('pnpm-workspace.yaml')
    expect(yaml).toMatch(/^\s*-\s+apps\/\*\s*$/m)
    expect(yaml).toMatch(/^\s*-\s+packages\/\*\s*$/m)
  })

  const artifacts = [
    ['apps/host', '@dsh-forge/host'],
    ['apps/web', '@dsh-forge/web'],
    ['packages/contracts', '@dsh-forge/contracts'],
    ['packages/core', '@dsh-forge/core'],
    ['packages/knowledge', '@dsh-forge/knowledge'],
  ] as const

  it.each(artifacts)('%s 包名 %s 就位', (dir, name) => {
    expect(readJson(join(dir, 'package.json')).name).toBe(name)
  })

  it('contracts 零依赖（契约层零运行时依赖）', () => {
    const pkg = readJson('packages/contracts/package.json')
    for (const key of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      expect(Object.keys((pkg[key] as Record<string, unknown>) ?? {})).toHaveLength(0)
    }
  })

  it('根 solution tsconfig references 五工件（tsc -b 全拓扑入口）', () => {
    const refs = ((readJson('tsconfig.json').references ?? []) as { path: string }[]).map((r) => rel(r.path))
    expect([...refs].sort()).toEqual(
      ['apps/host', 'apps/web', 'packages/contracts', 'packages/core', 'packages/knowledge'].sort(),
    )
  })

  it.each([
    ['packages/contracts', []],
    ['packages/core', ['packages/contracts']],
    ['packages/knowledge', ['packages/contracts', 'packages/core']],
    ['apps/host', ['packages/contracts', 'packages/core', 'packages/knowledge']],
    ['apps/web', ['packages/contracts']],
  ] as const)('%s references 拓扑 = %j（composite 联通）', (dir, expected) => {
    const ts = readJson(join(dir, 'tsconfig.json')) as {
      compilerOptions?: { composite?: boolean }
      extends?: string
      references?: { path: string }[]
    }
    expect(ts.compilerOptions?.composite).toBe(true)
    expect(ts.extends).toBe('../../tsconfig.base.json')
    const refs = (ts.references ?? []).map((r) => rel(join(dir, r.path)))
    expect([...refs].sort()).toEqual([...expected].sort())
  })

  it('tsconfig.base.json 严格模式（strict 家族）', () => {
    const base = readJson('tsconfig.base.json').compilerOptions as Record<string, unknown>
    expect(base.strict).toBe(true)
    expect(base.noUncheckedIndexedAccess).toBe(true)
    expect(base.verbatimModuleSyntax).toBe(true)
  })
})

describe('AC2–AC4 G0 规则面（oxlint 三铁律 + SC2 watch 禁令 + 令牌 lint）', () => {
  const ox = read('oxlint.config.ts')

  it('三条依赖铁律的 override 文件域全部就位', () => {
    for (const scope of [
      // 铁律① 基础 ↛ 业务（web 基础子模块 / core db）
      'apps/web/src/shell/**',
      'apps/web/src/zones/**',
      'apps/web/src/components/**',
      'apps/web/src/rpc/**',
      'apps/web/src/styles/**',
      'packages/core/src/db/**',
      // 铁律③ 同级业务互禁（core 双域 / web 双视图）
      'packages/core/src/forge/**',
      'packages/core/src/knowledge/**',
      'apps/web/src/views/session/**',
      'apps/web/src/views/knowledge/**',
    ]) {
      expect(ox).toContain(scope)
    }
    expect(ox).toContain("'no-restricted-imports'")
  })

  it('SC2 watch 回流禁令就位（fs.watch/watchFile / chokidar 类，import-lint 执行）', () => {
    const imp = read('scripts/lint-imports.mjs')
    expect(imp).toContain('chokidar')
    expect(imp).toContain('watchFile')
    expect(imp).toMatch(/fs\\?\.(?:watch|watchFile)/)
    expect(String(readJson('package.json').scripts.lint)).toContain('lint:imports')
  })

  it('renderer 运行期边界就位（web 禁 import core/knowledge 包）', () => {
    const imp = read('scripts/lint-imports.mjs')
    expect(imp).toContain('@dsh-forge')
    expect(imp).toContain('(?:core|knowledge)')
  })

  it('令牌 lint 脚本就位且入 G0（pnpm lint 串）', () => {
    expect(existsSync(join(ROOT, 'scripts/lint-tokens.mjs'))).toBe(true)
    expect(readJson('package.json').scripts).toMatchObject({
      'lint:tokens': 'node scripts/lint-tokens.mjs',
    })
    expect(String(readJson('package.json').scripts.lint)).toContain('lint:tokens')
  })

  it('负样例自证脚本就位（种植 → 拦截断言 → 清理）且入 G0', () => {
    expect(existsSync(join(ROOT, 'scripts/lint-selftest.mjs'))).toBe(true)
    expect(String(readJson('package.json').scripts.lint)).toContain('lint:selftest')
  })
})

describe('AC5 G0–G2 门脚本与测试基座', () => {
  it('pnpm lint / test / test:e2e = G0 / G1+单测 / G2 门入口', () => {
    const scripts = readJson('package.json').scripts as Record<string, string>
    expect(scripts.test).toBe('vitest run')
    expect(scripts['test:e2e']).toContain('playwright')
    // G0 = oxlint + 令牌 lint + 规则自证 + tsc（project references 全拓扑）
    expect(scripts.lint).toContain('lint:ox')
    expect(scripts.lint).toContain('lint:types')
  })

  it('vitest 基座与 Playwright _electron 基座就位', () => {
    expect(existsSync(join(ROOT, 'vitest.config.ts'))).toBe(true)
    expect(existsSync(join(ROOT, 'e2e/playwright.config.ts'))).toBe(true)
    expect(existsSync(join(ROOT, 'e2e/specs/000-canary.spec.ts'))).toBe(true)
  })

  it('dev 工作流脚本就位（vite + tsc -b --watch + electron 指 dev profile）', () => {
    const scripts = readJson('package.json').scripts as Record<string, string>
    expect(scripts.dev).toContain('scripts/dev.mjs')
    expect(existsSync(join(ROOT, 'scripts/dev.mjs'))).toBe(true)
  })
})

describe('Hard Rule 2 子模块占位（按设计定位标注建立）', () => {
  const submodules = [
    'apps/host/src/profile',
    'apps/host/src/boot',
    'apps/host/src/ipc',
    'apps/host/src/window',
    'apps/web/src/shell',
    'apps/web/src/zones',
    'apps/web/src/components',
    'apps/web/src/rpc',
    'apps/web/src/styles',
    'apps/web/src/views/session',
    'apps/web/src/views/knowledge',
    'apps/web/src/flows/add-project',
    'packages/core/src/db',
    'packages/core/src/forge',
    'packages/core/src/knowledge',
    'packages/knowledge/src/tools',
    'packages/knowledge/src/prompt',
    'packages/contracts/src/dto',
  ] as const

  it.each(submodules)('%s/ 定位标注 README 就位', (dir) => {
    expect(existsSync(join(ROOT, dir, 'README.md'))).toBe(true)
  })

  it('五工件入口占位与 vite 入口就位（无业务代码）', () => {
    for (const f of [
      'apps/host/src/main.ts',
      'apps/web/src/main.tsx',
      'apps/web/index.html',
      'apps/web/vite.config.ts',
      'packages/contracts/src/index.ts',
      'packages/core/src/service.ts',
      'packages/knowledge/src/index.ts',
    ]) {
      expect(existsSync(join(ROOT, f))).toBe(true)
    }
  })
})
