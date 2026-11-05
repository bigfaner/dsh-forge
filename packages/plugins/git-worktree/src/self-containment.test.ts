// 产物自含守卫（bug 9083f0f0）：外部 dsh 宿主经插件管理器安装（file: 依赖，workspace:*
// 依赖被丢弃、无 @dsh-forge 发布渠道）后，dist 任一 .js 携带 @dsh-forge 字面量即
// 激活期 ERR_MODULE_NOT_FOUND。type-only 依赖必须整句 import type（verbatimModuleSyntax
// 下 inline type 修饰残留空壳 import 仍做模块解析——rpc-service 判例）。dist 未构建
// （纯 src 测试树）时跳过——CI/本地 build 后恒在场。
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..')

function scanJs(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) scanJs(p, out)
    else if (f.endsWith('.js')) out.push(p)
  }
  return out
}

describe('产物自含守卫（独立安装形态——零 dsh-forge 依赖声明在 dist 面成立）', () => {
  // 模块说明符面匹配（from/import/require 后跟 @dsh-forge 说明符）——注释里的包名
  // 字样（文件头归属注释等）不是运行期引用，不算断链。
  const SPECIFIER = /(?:\bfrom\s*|\bimport\s*|\brequire\(\s*)["']@dsh-forge\//

  it('dist 全部 .js 零 @dsh-forge 模块引用（含空壳 import）', () => {
    const distDir = join(pkgDir, 'dist')
    if (!existsSync(distDir)) return
    const offenders: string[] = []
    for (const f of scanJs(distDir)) {
      if (SPECIFIER.test(readFileSync(f, 'utf8'))) offenders.push(f)
    }
    expect(offenders, `dist 残留 @dsh-forge 模块引用（外部宿主装载即断链）：${offenders.join('; ')}`).toEqual([])
  })

  it('dependencies 恒空（零运行时依赖声明面——新增依赖须经产物自含评估）', () => {
    const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> }
    expect(Object.keys(pkg.dependencies ?? {})).toEqual([])
  })
})
