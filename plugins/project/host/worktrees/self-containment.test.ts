// 产物自含守卫（bug 9083f0f0；fix-5 收紧；fix-6 逐 bundle 文件全量扫描 + 丢 chunk
// 结构拦截）：外部 dsh 宿主经插件管理器安装（file: 依赖，workspace:* 依赖被 pnpm
// runner 丢弃、无 @dsh-forge 发布渠道）后，dist 任一运行期 .js 携带 @dsh-forge/* 裸
// import 即激活期 ERR_MODULE_NOT_FOUND（lib-util 判例）；exports 可达文件相对引用悬空
// 即丢 chunk 断链（extension-points chunk 判例）。因此断言面 = dist/host/** 与
// dist/client/** 每个产物文件（含 index.js 与全部子目录）+ exports 每个 ./dist 路径
// 存在性——判别实验（bundle 后 tsc -b 覆写）两处断裂态均被本守卫抓住。审计逻辑正本 =
// scripts/self-containment.mjs（bundle 脚本离手门同源）。dist 未构建（纯 src 测试树）
// 时跳过——CI/本地 build 后恒在场。
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { auditDist, walkJs } from '../../scripts/self-containment.mjs'

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

describe('产物自含守卫（独立安装形态——零 dsh-forge 依赖声明在 dist 面成立）', () => {
  it('dist 逐 bundle 文件全量审计：零 @dsh-forge/* 引用 + 相对引用闭包 + exports 路径在场', () => {
    const distDir = join(pkgDir, 'dist')
    if (!existsSync(distDir)) return // 纯 src 测试树跳过
    const files = walkJs(distDir)
    expect(files.length, 'dist 存在但零运行期 .js——bundle 产物缺席').toBeGreaterThan(0)
    const violations = auditDist(pkgDir)
    expect(
      violations,
      `dist 自含审计违规（@dsh-forge/* 裸引用 / 相对引用悬空 / exports 路径缺席——独立安装形态即断链）：\n${violations.join('\n')}`,
    ).toEqual([])
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
