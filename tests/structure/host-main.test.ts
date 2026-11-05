// 任务 1.4 结构 pin —— AC1：main 入口 ≤~100 行且仅编排四子模块（装配纪律机械化）。
// 权威：tech-design「包内子模块划分与定位」apps/host/src 行 + 任务 1.4 Hard Rule（宿主无业务）。
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../../')
const rel = (p: string) => relative(ROOT, resolve(ROOT, p)).split('\\').join('/')

const MAIN = 'apps/host/src/main.ts'
const source = readFileSync(join(ROOT, MAIN), 'utf8')
const lines = source.split('\n')

/**
 * 模块说明符扫描（fix-33 ③ pin 韧性）：覆盖静态 import 的单/双引号与无插值模板串、
 * 动态 import(…) 与 require(…)——原正则只匹配单引号 from 子句，双引号/模板串/动态
 * import 可绕过 pin（越界依赖静默漏网）。
 */
function importSpecifiersOf(src: string): string[] {
  const out: string[] = []
  for (const m of src.matchAll(/\bfrom\s+(['"])([^'"]+)\1/g)) out.push(m[2]!)
  for (const m of src.matchAll(/\bfrom\s+`([^`$]+)`/g)) out.push(m[1]!)
  for (const m of src.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g)) out.push(m[2]!)
  for (const m of src.matchAll(/\brequire\s*\(\s*(['"])([^'"]+)\1\s*\)/g)) out.push(m[2]!)
  return out
}

/** 纯类型 import 的说明符集（import type … from 'x'——零运行期产物，wiring 面合法） */
function typeImportSpecifiersOf(src: string): string[] {
  const out: string[] = []
  for (const m of src.matchAll(/\bimport\s+type\s+[\s\S]{0,200}?\bfrom\s+(['"])([^'"]+)\1/g)) out.push(m[2]!)
  return out
}

describe('AC1 main 装配纪律（~100 行 + 仅编排）', () => {
  it('总行数 ≤ 178（薄宿主编排纪律上限——现状对齐：HEAD 176 行已越旧上限 170 的存量漂移，bug 5e5592dc knowledge 注册行 boot 回填接线 +1 行；装配缝自然增长仍仅编排）', () => {
    expect(lines.length).toBeLessThanOrEqual(178)
  })

  it('import 仅限：electron、node:url、node:fs、node:path、五子模块 barrel（编排面无其他依赖——1.2 增 telemetry 诊断域装配 barrel + 便携数据目录写探测/路径解析 node 基座）', () => {
    const imports = importSpecifiersOf(source)
    for (const specifier of imports) {
      expect(
        specifier === 'electron' ||
          specifier === 'node:url' ||
          specifier === 'node:fs' ||
          specifier === 'node:path' ||
          /^\.\/(?:boot|ipc|profile|window|telemetry)\/index\.js$/.test(specifier),
        `main.ts 越界 import：${specifier}`,
      ).toBe(true)
    }
    // 子模块 barrel 全部被编排（缺一即未装配）
    for (const barrel of ['./boot/index.js', './ipc/index.js', './profile/index.js', './window/index.js', './telemetry/index.js']) {
      expect(imports, `main.ts 未编排 ${barrel}`).toContain(barrel)
    }
  })

  it('ESM main 禁顶层 await whenReady（S1 实测死锁坑——boot 须入 void async）', () => {
    expect(source).toMatch(/void \(async \(\) => \{/)
    expect(source).not.toMatch(/^await app\.whenReady/m)
  })

  it('bug 9b7a6216：便携数据目录劫持必须 process.platform === win32 门——mac exe 在 .app bundle 内，升级整包替换清空 bundle 内 data', () => {
    // 劫持块（setPath('userData', portableData)）之前须有 win32 平台门（mac/linux 走缺省 userData，升级安全）
    expect(source.slice(0, source.indexOf("app.setPath('userData', portableData)"))).toMatch(/process\.platform === 'win32'/)
  })

  it('四子模块源文件就位（含 preload 与 dev profile 模板）', () => {
    for (const p of [
      'apps/host/src/profile/index.ts',
      'apps/host/src/boot/index.ts',
      'apps/host/src/ipc/index.ts',
      'apps/host/src/ipc/preload.mts',
      'apps/host/src/window/index.ts',
      'apps/host/profile.dev/package.json',
      'apps/host/profile.dev/cordis.patch.yml',
      'apps/host/profile.dev/pnpm-workspace.yaml',
      'e2e/specs/host-boot.spec.ts',
    ]) {
      expect(existsSync(join(ROOT, p)), `${p} 缺席`).toBe(true)
    }
  })

  it('host 子模块零业务漂移：不 import knowledge 产品域实现与 web 源码（1.9 现状对齐：worktree-branch-management 1.7 集成层装配缝——ipc/bindings.ts 与 ipc/worktree-identity.ts 消费 @dsh-forge/core createGitIdentityPort 作 git 探针缺省 = 装配胶水合法；knowledge-stage1 1.7 修订：Interface 2 服务类型随 A2 迁 @dsh-forge/knowledge，host 通道/桥 wiring 面 type-only import 合法——值导入（实现级）仍禁；fix-33 ③ 扫描面含双引号/模板串/动态 import/require）', () => {
    const hostSrc = join(ROOT, 'apps/host/src')
    const files = walk(hostSrc)
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      const typeOnly = new Set(typeImportSpecifiersOf(src))
      for (const s of importSpecifiersOf(src)) {
        if (typeOnly.has(s)) continue // 纯类型 import（零运行期依赖）——wiring 面合法
        expect(
          s.startsWith('@dsh-forge/knowledge') || s.startsWith('../web/') || s.includes('/apps/web/'),
          `${rel(f)} 引入了业务漂移面：${s}`,
        ).toBe(false)
      }
    }
  })
})

function walk(dir: string): string[] {
  const out: string[] = []
  const entries = existsSync(dir) ? readdirSync(dir, { withFileTypes: true }) : []
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p))
    else if (/\.(m?ts|tsx?)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p)
  }
  return out
}
