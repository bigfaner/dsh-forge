// 产物自含守卫（bug 9083f0f0，expert-squad bundle-structure / git-worktree
// self-containment 同族）：官方 dsh-plugin-manager 安装 = 拷源目录进 generation/source/
// 后以 file: 依赖 pnpm 安装，workspace:* 依赖被丢弃——外部宿主无 @dsh-forge 发布
// 渠道，入口面携带其字面量即激活期 ERR_MODULE_NOT_FOUND。本包经 scripts/bundle-host.mjs
// 将 @dsh-forge/* 值依赖（contracts/path-key，均运行期零外部依赖）构建期内联。
// dist 未构建（纯 src 测试树）时产物面跳过——声明面断言恒跑。
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('产物自含守卫（独立安装形态）', () => {
  it('dependencies 零 workspace/file 协议 + @dsh-forge/* 禁入（devDependencies 只作类型/构建面）', () => {
    const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    for (const [name, range] of Object.entries(pkg.dependencies ?? {})) {
      expect(range, `${name} 使用 workspace/file 协议，独立安装形态断链`).not.toMatch(/^(workspace|file|link):/)
      expect(
        name.startsWith('@dsh-forge/'),
        '@dsh-forge/* private 包不可 registry 解析，不得入 dependencies',
      ).toBe(false)
    }
    expect(Object.keys(pkg.devDependencies ?? {})).toContain('@dsh-forge/contracts')
    expect(Object.keys(pkg.devDependencies ?? {})).toContain('@dsh-forge/path-key')
  })

  it('host bundle 入口自含：@dsh-forge 模块引用零残留 + 官方机械外置保留', () => {
    const distEntry = join(pkgDir, 'dist', 'index.js')
    if (!existsSync(distEntry)) return // 未构建（纯 src 测试树）
    const bundled = readFileSync(distEntry, 'utf8')
    // 模块说明符面匹配——注释里的包名字样不是运行期引用
    expect(
      bundled,
      '入口残留 @dsh-forge 模块引用（外部宿主装载即断链）',
    ).not.toMatch(/(?:\bfrom\s*|\bimport\s*|\brequire\(\s*)["']@dsh-forge\//)
    expect(bundled).toMatch(/["']@deepseek-ai\//) // 官方机械外置（内联第二副本分裂单例语义）
  })
})
