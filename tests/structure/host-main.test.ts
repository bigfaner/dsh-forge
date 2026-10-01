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

describe('AC1 main 装配纪律（~100 行 + 仅编排）', () => {
  it('总行数 ≤ 110（~100 行纪律的上限容差）', () => {
    expect(lines.length).toBeLessThanOrEqual(110)
  })

  it('import 仅限：electron、node:url、四子模块 barrel（编排面无其他依赖）', () => {
    const imports = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1]!)
    for (const specifier of imports) {
      expect(
        specifier === 'electron' ||
          specifier === 'node:url' ||
          /^\.\/(?:boot|ipc|profile|window)\/index\.js$/.test(specifier),
        `main.ts 越界 import：${specifier}`,
      ).toBe(true)
    }
    // 四子模块 barrel 全部被编排（缺一即未装配）
    for (const barrel of ['./boot/index.js', './ipc/index.js', './profile/index.js', './window/index.js']) {
      expect(imports, `main.ts 未编排 ${barrel}`).toContain(barrel)
    }
  })

  it('ESM main 禁顶层 await whenReady（S1 实测死锁坑——boot 须入 void async）', () => {
    expect(source).toMatch(/void \(async \(\) => \{/)
    expect(source).not.toMatch(/^await app\.whenReady/m)
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

  it('host 子模块零业务漂移：不 import web/core/knowledge 源码（workspace 依赖仅为 profile 供给）', () => {
    const hostSrc = join(ROOT, 'apps/host/src')
    const files = walk(hostSrc)
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      for (const m of src.matchAll(/from '([^']+)'/g)) {
        const s = m[1]!
        expect(s.startsWith('@dsh-forge/core') || s.startsWith('@dsh-forge/knowledge'), `${rel(f)} 引入了产品插件：${s}`).toBe(false)
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
