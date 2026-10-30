// 结构 pin——产品 client 插件 bundle 保障链对齐（bug 5598f86b 回归守卫）。
// 事实源 = apps/web/vite.config.ts 的 assertPluginManifest/emitPluginBundle 清单：
// 清单里的每个插件包必须同时在场于三处保障面，缺一处 = dist 被清后构建期
// req.resolve 炸 raw 错误（expert-squad 判例：接了 vite 清单、漏了全部三处）。
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../../')
const read = (p: string) => readFileSync(join2(ROOT, p), 'utf8')
const join2 = (a: string, b: string) => a + '/' + b

/** vite.config.ts 中挂到 emit/assert 清单的插件包短名（@dsh-forge/<short>）。 */
function wiredPluginShorts(): string[] {
  const vite = read('apps/web/vite.config.ts')
  const shorts = new Set<string>()
  for (const m of vite.matchAll(/\b(?:assertPluginManifest|emitPluginBundle)\('@dsh-forge\/([\w-]+)'/g)) {
    shorts.add(m[1]!)
  }
  return [...shorts].sort()
}

describe('dev 启动 ensure 清单通用覆盖（bug 021d2655 回归守卫）', () => {
  it('bug: dev ensure 清单硬编码漏包——启动重建序列必须覆盖 packages/plugins/* 全部含 build 的插件包 + plugin-forge 本体', async () => {
    // 事实源 = scripts/dev-ensure-packages.mjs 的扫描函数（dev.mjs 启动期 ensure 消费同一清单）
    const { ensurePackages } = await import('../../scripts/dev-ensure-packages.mjs')
    const ensured = ensurePackages(ROOT)

    const pluginsDir = resolve(ROOT, 'packages/plugins')
    const expected = readdirSync(pluginsDir)
      .filter((name) => {
        const pkg = resolve(pluginsDir, name, 'package.json')
        if (!existsSync(pkg)) return false
        const scripts = (JSON.parse(readFileSync(pkg, 'utf8')) as { scripts?: Record<string, string> }).scripts
        return Boolean(scripts?.build)
      })
      .map((name) => `packages/plugins/${name}`)
    expected.push('packages/plugin-forge')

    const missing = expected.filter((pkg) => !ensured.includes(pkg))
    expect(missing).toEqual([])

    // dev.mjs 必须消费同一扫描清单（防回退到硬编码名单）
    const devMjs = read('scripts/dev.mjs')
    expect(devMjs).toContain('dev-ensure-packages.mjs')
    expect(devMjs).not.toMatch(/for \(const plugin of \[/)
  })
})

describe('产品 client 插件 bundle 保障链对齐（vite 清单 → dev/build/依赖三处）', () => {
  it('bug: expert-squad 缺席保障链——vite 发射/断言清单中的每个插件包必须在 dev ensure 数组、根 build 链、apps/web 依赖三处同席', async () => {
    const shorts = wiredPluginShorts()
    expect(shorts.length).toBeGreaterThan(0)

    const { ensurePackages } = await import('../../scripts/dev-ensure-packages.mjs')
    const devSet = new Set(ensurePackages(ROOT).map((pkg) => pkg.replace('packages/plugins/', '')))

    const rootPkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> }
    const buildScript = rootPkg.scripts['build'] ?? ''

    const webPkg = JSON.parse(read('apps/web/package.json')) as { dependencies: Record<string, string> }

    const missing: string[] = []
    for (const short of shorts) {
      if (!devSet.has(short)) missing.push(`${short}: scripts/dev.mjs ensure 数组缺席`)
      if (!buildScript.includes(`packages/plugins/${short} build`)) missing.push(`${short}: 根 build 链缺席`)
      if (!(('@dsh-forge/' + short) in webPkg.dependencies)) missing.push(`${short}: apps/web dependencies 缺席`)
    }
    expect(missing).toEqual([])
  })
})
