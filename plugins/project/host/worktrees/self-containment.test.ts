// 产物自含守卫（bug 9083f0f0；fix-5 收紧）：外部 dsh 宿主经插件管理器安装（file: 依赖，
// workspace:* 依赖被 pnpm runner 丢弃、无 @dsh-forge 发布渠道）后，dist 任一运行期 .js
// 携带 @dsh-forge/* 裸 import 即激活期 ERR_MODULE_NOT_FOUND（lib-util 判例：tsc 中间
// 产物残留在 exports 次级入口路径上，装载即断链）。因此断言面 = dist 全量 .js——
// lib-* 命名形态不做白名单豁免，装载契约由 bundle 期 esbuild 全量内联承担。
// type-only 依赖必须整句 import type（verbatimModuleSyntax 下 inline type 修饰残留
// 空壳 import 仍做模块解析——rpc-service 判例）；.d.ts 类型面 import 不属运行期引用，
// 不在断言面。dist 未构建（纯 src 测试树）时跳过——CI/本地 build 后恒在场。
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function walkJs(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name)
    if (name.isDirectory()) out.push(...walkJs(p))
    else if (name.name.endsWith('.js')) out.push(p)
  }
  return out
}

describe('产物自含守卫（独立安装形态——零 dsh-forge 依赖声明在 dist 面成立）', () => {
  // 模块说明符面匹配（from/import/require 后跟 @dsh-forge 说明符）——注释里的包名
  // 字样（文件头归属注释等）不是运行期引用，不算断链。
  const SPECIFIER = /(?:\bfrom\s*|\bimport\s*|\brequire\(\s*)["']@dsh-forge\//

  it('dist 全量运行期 .js 零 @dsh-forge/* 模块引用（含 lib-* 形态，无白名单豁免）', () => {
    const distDir = join(pkgDir, 'dist')
    const files = existsSync(distDir) ? walkJs(distDir) : []
    const offenders = files.filter((f) => SPECIFIER.test(readFileSync(f, 'utf8')))
    expect(offenders, `dist 运行期 .js 残留 @dsh-forge/* 模块引用（外部宿主装载即断链）：${offenders.join('; ')}`).toEqual([])
  })

  it('dependencies 零 @dsh-forge/* 声明（workspace 包不可 registry 解析——运行期声明面必须为空）', () => {
    const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    // @dsh-forge/* 仅允许存在 devDependencies（构建期类型/内联解析面，独立安装被
    // pnpm runner 丢弃不产生运行期断链）；dependencies（运行期声明面）必须零
    // @dsh-forge/*，registry 可解析依赖（better-sqlite3 判例 0.10.1）不受限。
    expect(Object.keys(pkg.dependencies ?? {}).filter((n) => n.startsWith('@dsh-forge/'))).toEqual([])
  })
})
