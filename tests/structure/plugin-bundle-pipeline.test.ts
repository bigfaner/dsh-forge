// 结构 pin——产品 client 插件 bundle 保障链对齐（bug 5598f86b 回归守卫）。
// 事实源 = apps/web/vite.config.ts 的 assertPluginManifest/emitPluginBundle 清单：
// 清单里的每个插件包必须同时在场于三处保障面，缺一处 = dist 被清后构建期
// req.resolve 炸 raw 错误（expert-squad 判例：接了 vite 清单、漏了全部三处）。
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PRODUCT_PLUGINS } from '../../packages/contracts/src/product-plugins.js'
import { presetCarriedPlugins } from '../../scripts/assemble-installer-resources.mjs'

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

// ── dev 形态装载面守卫：profile.dev 装载行 ↔ PRODUCT_PLUGINS / 预设携带集 漂移对账 ──
// 事故类别 bc89637c：新增产品插件（userLayerRow）忘在 profile.dev/cordis.patch.yml 加
// 装载行 → dev 实例该插件 404。本组断言对账四条装载通道：
//   · profile.dev 用户层 insert 行（手维文件，dev 直读）；
//   · profile.dev bundle 声明（package.json dsh.profile.bundles——插件自带
//     cordis.patch.yml insert 行装载，dsh.client.inject 装配边随 bundle 生效）；
//   · boot overlay 在场门注行（apps/host/src/boot/overlay.ts——git-worktree 等门控行）；
//   · 预设底稿携带行（presets/*.patch.yml——boot overlay 每启注行，dev 同径）。
// 期望集 = PRODUCT_PLUGINS 全部 staged（非 staged:false kill-switch）插件 ∪ 预设携带插件。
// staged:false（如 knowledge）不进期望集但允许 dev 行在场（产品裁决：dev 形态全量可用）。

/** dev/overlay 文本中的插件装载行短名（name: '@dsh-forge/<短名>'；跳过 # 注释行）。 */
function pluginLoadRowShorts(text: string): string[] {
  const shorts = new Set<string>()
  for (const line of text.split('\n')) {
    if (line.trimStart().startsWith('#')) continue
    for (const m of line.matchAll(/\bname:\s*['"]@dsh-forge\/([\w-]+)['"]/g)) shorts.add(m[1]!)
  }
  return [...shorts].sort()
}

/** profile.dev bundle 声明通道（package.json dsh.profile.bundles 的 @dsh-forge/<短名>）。 */
function devBundleShorts(): string[] {
  const pkg = JSON.parse(read('apps/host/profile.dev/package.json')) as {
    dsh?: { profile?: { bundles?: string[] } }
  }
  return (pkg.dsh?.profile?.bundles ?? [])
    .map((b) => /@dsh-forge\/([\w-]+)/.exec(b)?.[1])
    .filter((s): s is string => s !== undefined)
}

/** 期望集（staged 非 kill-switch ∪ 预设携带）与实际集（profile.dev 行 ∪ overlay 注行）的对账差异。 */
function devLoadDrift(expected: ReadonlySet<string>, actual: ReadonlySet<string>): { missing: string[]; ghost: string[] } {
  const missing = [...expected].filter((s) => !actual.has(s)).sort()
  const ghost = [...actual].filter((s) => !expected.has(s)).sort()
  return { missing, ghost }
}

describe('dev profile 装载行漂移守护（bug bc89637c 类别回归守卫）', () => {
  it('bug: 新增产品插件忘在 profile.dev 加装载行——staged ∪ 预设携带插件必须被 dev 三装载通道之一覆盖，缺行/幽灵行 fail-loud 报差异清单', () => {
    const devText = read('apps/host/profile.dev/cordis.patch.yml')
    const devRows = new Set(pluginLoadRowShorts(devText))
    // bundle 声明通道并入实际集（expert-squad 判例：经自身 bundle 装载，用户层零行）
    const bundleRows = new Set(devBundleShorts())
    const devAll = new Set([...devRows, ...bundleRows])
    expect(devAll.size, 'profile.dev 应有 @dsh-forge/* 装载行/声明（扫描失效即假绿）').toBeGreaterThan(0)

    // overlay 在场门注行（源码字面量扫描——与 overlay.ts 同源，行改名即红）
    const overlayRows = new Set(pluginLoadRowShorts(read('apps/host/src/boot/overlay.ts')))
    expect(overlayRows.has('git-worktree'), 'overlay 注行扫描应命中 git-worktree（扫描失效即假绿）').toBe(true)

    const presetNames = new Set(presetCarriedPlugins())
    // 预设通道本体 = presets/*.patch.yml 携带行（overlay 每启消费同一底稿注行，dev 同径）
    const presetsDir = resolve(ROOT, 'apps/host/src/profile/presets')
    const presetRows = new Set(
      readdirSync(presetsDir)
        .filter((f) => f.endsWith('.patch.yml'))
        .flatMap((f) => pluginLoadRowShorts(readFileSync(resolve(presetsDir, f), 'utf8'))),
    )
    const stagedNames = new Set(
      Object.entries(PRODUCT_PLUGINS)
        .filter(([, sw]) => sw.staged !== false)
        .map(([name]) => name),
    )

    const expected = new Set([...stagedNames, ...presetNames])
    const actual = new Set([...devAll, ...overlayRows, ...presetRows])
    const { missing } = devLoadDrift(expected, actual)
    expect(missing, `staged/预设携带插件在 dev 无任何装载通道（dev 实例 404——补 profile.dev 行或 overlay/预设行）：${missing.join(', ')}`).toEqual([])

    // 幽灵行：profile.dev 行既不在 PRODUCT_PLUGINS 也不在预设/overlay 通道——名字漂移（typo/退役残留）
    const known = new Set([...Object.keys(PRODUCT_PLUGINS), ...presetNames, ...overlayRows])
    const ghostRows = [...devRows].filter((s) => !known.has(s))
    expect(ghostRows, `profile.dev 存在无主装载行（PRODUCT_PLUGINS/预设/overlay 均不含）：${ghostRows.join(', ')}`).toEqual([])

    // 收敛自证：对账函数本身 fail-loud（合成的缺行/幽灵行必须被报出）
    expect(devLoadDrift(new Set(['a']), new Set(['b']))).toEqual({ missing: ['a'], ghost: ['b'] })
  })

  it('fail-loud 演练：新增 userLayerRow 插件而 profile.dev 无对应行——对账必须红并指名该插件', () => {
    const devRows = new Set(pluginLoadRowShorts(read('apps/host/profile.dev/cordis.patch.yml')))
    const overlayRows = new Set(pluginLoadRowShorts(read('apps/host/src/boot/overlay.ts')))

    // 模拟「contracts 新增 userLayerRow 插件、profile.dev 忘加行」的未来漂移态
    const drifted: typeof PRODUCT_PLUGINS = { ...PRODUCT_PLUGINS, 'future-plugin': { userLayerRow: true } }
    const stagedNames = new Set(Object.entries(drifted).filter(([, sw]) => sw.staged !== false).map(([name]) => name))
    const { missing } = devLoadDrift(stagedNames, new Set([...devRows, ...overlayRows]))

    expect(missing, '合成的 userLayerRow 新插件必须被对账报为缺失').toContain('future-plugin')
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
