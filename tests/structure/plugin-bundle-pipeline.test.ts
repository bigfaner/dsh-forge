// 结构 pin——产品 client 插件 bundle 保障链对齐（bug 5598f86b 回归守卫）。
// 事实源 = apps/web/vite.config.ts 的 assertPluginManifest/emitPluginBundle 清单：
// 清单里的每个插件包必须同时在场于三处保障面，缺一处 = dist 被清后构建期
// req.resolve 炸 raw 错误（expert-squad 判例：接了 vite 清单、漏了全部三处）。
import { readFileSync } from 'node:fs'
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

describe('产品 client 插件 bundle 保障链对齐（vite 清单 → dev/build/依赖三处）', () => {
  it('bug: expert-squad 缺席保障链——vite 发射/断言清单中的每个插件包必须在 dev ensure 数组、根 build 链、apps/web 依赖三处同席', () => {
    const shorts = wiredPluginShorts()
    expect(shorts.length).toBeGreaterThan(0)

    const devMjs = read('scripts/dev.mjs')
    const devEnsure = devMjs.match(/for \(const plugin of \[([^\]]*)\]\)/)
    expect(devEnsure).toBeTruthy()
    const devSet = new Set([...devEnsure![1]!.matchAll(/'([\w-]+)'/g)].map((m) => m[1]!))

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
