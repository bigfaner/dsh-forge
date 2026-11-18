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
const readScripts = () => readJson('package.json').scripts as Record<string, unknown> // 测试类型门收窄（fix-33 ⑩）
const rel = (p: string) => relative(ROOT, resolve(ROOT, p)).split('\\').join('/')

describe('AC1 workspace 工件与 references 拓扑', () => {
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
    ['plugins/knowledge', '@dsh-forge/knowledge'],
    ['packages/path-key', '@dsh-forge/path-key'],
    // M2 3.2：第六工件 plugin-forge（tool 半身 + forge:pipeline 系统提示段）
    ['packages/plugin-forge', '@dsh-forge/plugin-forge'],
    // M3 3.1：第八工件 plugin-forge-spec（spec 三 tool + forge:spec 系统提示段——仅远征组合装配）
    ['packages/plugin-forge-spec', '@dsh-forge/plugin-forge-spec'],
  ] as const

  it.each(artifacts)('%s 包名 %s 就位', (dir, name) => {
    expect(readJson(join(dir, 'package.json')).name).toBe(name)
  })

  it('contracts 兼容面依赖收敛（plugin-project 1.7：DTO/词汇/错误码/通道常量本体迁 @dsh-forge/lib-api，dependencies 仅允许该兼容面边；devDependencies 仅允许 @types/node 与官方包 type-only——dsh-agent-preset-registry）', () => {
    const pkg = readJson('packages/contracts/package.json')
    expect(Object.keys((pkg.dependencies as Record<string, unknown>) ?? {})).toEqual(['@dsh-forge/lib-api'])
    for (const key of ['peerDependencies', 'optionalDependencies']) {
      expect(Object.keys((pkg[key] as Record<string, unknown>) ?? {})).toHaveLength(0)
    }
    expect(
      Object.keys((pkg.devDependencies as Record<string, unknown>) ?? {}).every(
        (k) => k === '@types/node' || k === '@deepseek-ai/dsh-agent-preset-registry',
      ),
    ).toBe(true)
  })

  it('根 solution tsconfig references 十五工件（tsc -b 全拓扑入口；fix-30 增 path-key；M2 3.2 增 plugin-forge；M3 3.1 增 plugin-forge-spec；plugin-spec 建位 plugins/spec——提示段迁入批；md-mermaid/input-history/expert-squad/quote-reference/super-composer/mobile-bridge 先后入 packages/plugins/ 子居所；1.17 批二 git-worktree 旧包退役）', () => {
    const refs = ((readJson('tsconfig.json').references ?? []) as { path: string }[]).map((r) => rel(r.path))
    expect([...refs].sort()).toEqual(
      [
        'apps/host',
        'apps/web',
        // lib 公共包群（plugin-project 1.2 建位 + 1.6 path 归并到位）
        'lib/api',
        'lib/db',
        'lib/diag',
        'lib/path',
        // plugin-spec-roadmaps 1.1：泛型状态机公共包入拓扑
        'lib/status-machine',
        'lib/util',
        'packages/contracts',
        'packages/core',
        // plugin-project：project 插件包（1.3 建位——tsc -b 全拓扑入口补记）
        'plugins/project',
        // plugin-task-loop 1.5 包骨架入拓扑（引用面随包建位补记——1.13 欠账校正）
        'plugins/task-loop',
        // plugin-spec：spec 插件包（提示段迁入批建位——forge:pipeline/forge:doc-style 段归属）
        'plugins/spec',
        'plugins/knowledge',
        'packages/path-key',
        'packages/plugin-forge',
        'packages/plugin-forge-spec',
        'plugins/expert-squad',
        'packages/plugins/input-history',
        'packages/plugins/md-mermaid',
        'packages/plugins/mobile-bridge',
        'packages/plugins/quote-reference',
        'packages/plugins/super-composer',
      ].sort(),
    )
  })

  it.each([
    // plugin-project 1.7：api/db 归并——contracts 兼容面引 lib/api；core 兼容面引 lib/db
    ['packages/contracts', ['lib/api']],
    // knowledge-stage1 1.8：core 知识域退役——过渡型 plugins/knowledge 引用随迁收口
    // plugin-project 1.6：path-key 归并 lib/path——core refs 改指 lib/path（path-key 退役待删）
    ['packages/core', ['lib/db', 'lib/diag', 'lib/path', 'lib/util', 'packages/contracts']],
    // fix-33 ⑯：knowledge ../core 引用删除——build 面零 core import（残留引用无消费）；
    // 测试面 core 源相对引入由 tsconfig.test.json 承载（不经 references）
    // knowledge 迁移批1.3：root 级 plugins/knowledge 三目录制——references 增 client 面
    // （tsconfig.client.json，exports["./client"] 类型链）
    ['plugins/knowledge', ['plugins/knowledge/tsconfig.client.json', 'packages/contracts', 'packages/path-key']],
    // M2 3.2：plugin-forge 同 knowledge 型（deps 仅 contracts + path-key——零 core 边）
    // plugin-project 1.7：bug tool 壳消费 lib/api——增 lib/api 引用
    // typert 迁移 1.3：project tsconfig.json 改双 face solution 壳——composite 消费面直指 host 叶
    ['packages/plugin-forge', ['lib/api', 'packages/contracts', 'packages/path-key', 'plugins/project/tsconfig.host.json']],
    // M3 3.1：plugin-forge-spec 同型（deps 仅 contracts + path-key——零 core/跨插件边）
    ['packages/plugin-forge-spec', ['packages/contracts', 'packages/path-key']],
    // plugin-task-loop 1.14：host tasks 域改指 @dsh-forge/task-loop——plugins/task-loop host 叶入 references
    ['apps/host', ['packages/contracts', 'packages/core', 'plugins/knowledge', 'plugins/project/tsconfig.host.json', 'plugins/task-loop/tsconfig.host.json']],
    // 1.6：web normalize/path-key 消费改指 @dsh-forge/lib-path/path-key——增 lib/path 引用
    // 1.14 UI 迁入：add-project/bug-refs 组件本体消费 @dsh-forge/project client ui
    // 1.17 批二：git-worktree 旧包退役——web 引用面收 project 单源
    ['apps/web', ['lib/path', 'packages/contracts', 'packages/plugins/md-mermaid', 'plugins/project/tsconfig.host.json']],
  ] as const)('%s references 拓扑 = %j（composite 联通）', (dir, expected) => {
    const ts = readJson(join(dir, 'tsconfig.json')) as {
      compilerOptions?: { composite?: boolean }
      extends?: string
      references?: { path: string }[]
    }
    expect(ts.compilerOptions?.composite).toBe(true)
    expect(ts.extends).toBe(dir.startsWith('packages/plugins/') ? '../../../tsconfig.base.json' : '../../tsconfig.base.json')
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
      'apps/web/src/components/**',
      'apps/web/src/rpc/**',
      'apps/web/src/styles/**',
      'packages/core/src/db/**',
      // 铁律③ 同级业务互禁（web 双视图——knowledge 视图迁 @dsh-forge/knowledge 后余 session 单侧）
      'apps/web/src/views/session/**',
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
    expect(String(readScripts().lint)).toContain('lint:imports')
  })

  it('renderer 运行期边界就位（web 禁 import core/knowledge 包）', () => {
    const imp = read('scripts/lint-imports.mjs')
    expect(imp).toContain('@dsh-forge')
    expect(imp).toContain('(?:core|knowledge)')
  })

  it('令牌 lint 脚本就位且入 G0（pnpm lint 串）', () => {
    expect(existsSync(join(ROOT, 'scripts/lint-tokens.mjs'))).toBe(true)
    expect(readScripts()).toMatchObject({
      'lint:tokens': 'node scripts/lint-tokens.mjs',
    })
    expect(String(readScripts().lint)).toContain('lint:tokens')
  })

  it('负样例自证脚本就位（种植 → 拦截断言 → 清理）且入 G0', () => {
    expect(existsSync(join(ROOT, 'scripts/lint-selftest.mjs'))).toBe(true)
    expect(String(readScripts().lint)).toContain('lint:selftest')
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

  it('bug 0459d067: dev.mjs 冷启动序——electron 拉起前先 run-once vite 全量构建（竞态收口）', () => {
    const dev = readFileSync(join(ROOT, 'scripts/dev.mjs'), 'utf8')
    const runOnceIdx = dev.indexOf("['-C', 'apps/web', 'run', 'build:vite']")
    const watchStartIdx = dev.indexOf("start('vite'")
    const electronIdx = dev.indexOf('electronSpawnExe, [HOST_DIR')
    // run-once 构建先于 watch 起跑，watch 起跑先于 electron 拉起
    expect(runOnceIdx).toBeGreaterThanOrEqual(0)
    expect(watchStartIdx).toBeGreaterThan(runOnceIdx)
    expect(electronIdx).toBeGreaterThan(watchStartIdx)
    // fail-soft：run-once 构建失败不拦 dev，但须显性告警（不静默）
    expect(dev).toContain('vite 初始构建失败')
  })
})

describe('Hard Rule 2 子模块占位（按设计定位标注建立）', () => {
  const submodules = [
    'apps/host/src/profile',
    'apps/host/src/boot',
    'apps/host/src/ipc',
    'apps/host/src/window',
    'apps/web/src/shell',
    'apps/web/src/components',
    'apps/web/src/rpc',
    'apps/web/src/styles',
    'apps/web/src/views/session',
    'plugins/project/ui/add-project',
    'packages/core/src/db',
    'packages/core/src/forge',
    'plugins/knowledge/host/tools',
    'plugins/knowledge/host/prompt',
    'packages/plugin-forge/src/tools',
    // plugin-spec 1.8 提示段迁入——plugin-forge src/prompt 退役，prompt 定位归 plugins/spec/host/prompt
    'plugins/spec/host/prompt',
    'packages/plugin-forge-spec/src/tools',
    'packages/plugin-forge-spec/src/prompt',
    'packages/contracts/src/dto',
  ] as const

  it.each(submodules)('%s/ 定位标注 README 就位', (dir) => {
    expect(existsSync(join(ROOT, dir, 'README.md'))).toBe(true)
  })

  it('五工件入口占位与 vite 入口就位（无业务代码）', () => {
    for (const f of [
      'apps/host/src/main.ts',
      'apps/web/src/main.ts',
      'apps/web/index.html',
      'apps/web/vite.config.ts',
      'packages/contracts/src/index.ts',
      'packages/core/src/index.ts',
      'plugins/knowledge/host/index.ts',
      'packages/plugin-forge/src/index.ts',
      'plugins/spec/host/index.ts',
      'packages/plugin-forge-spec/src/index.ts',
    ]) {
      expect(existsSync(join(ROOT, f))).toBe(true)
    }
  })
})
