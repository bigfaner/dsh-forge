// 任务 4.1 结构 pin —— 安装包管线（electron-builder NSIS + extraResources + sqlite prebuilds）。
// 权威来源：tech-design「打包管线（Windows NSIS）」段 + 4.1 任务书 AC；本文件 pin 三件：
//   1. electron-builder 配置形状（asar:false / extraResources=staging / NSIS 离线开关 / Electron 44 pin）
//   2. profile.install 安装树清单 = 官方栈并集（RUNTIME_PACKAGES ∪ 模板 bundles ∪ core 原生依赖）
//      ——与 runtime-packages.ts 同源的漂移守卫（apps/host/package.json 已另有 pin）
//   3. 物化脚本纯函数（合成 anchor 清单 / deps-free app 清单 / 关键文件口径）
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { RUNTIME_PACKAGES } from '../../apps/host/src/profile/runtime-packages.js'
import { buildAppManifest, buildRuntimeAnchorManifest, REQUIRED_KEY_FILES } from '../../scripts/assemble-installer-resources.mjs'
import { createElectronBuilderConfig } from '../../electron-builder.config.mjs'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..')
const readJson = (p: string) => JSON.parse(readFileSync(join(ROOT, p), 'utf8')) as Record<string, unknown>

describe('AC1+AC2 electron-builder 配置形状（electron-builder.config.mjs）', () => {
  const config = createElectronBuilderConfig('9.9.9') as Record<string, unknown>

  it('asar: false + app 目录 = release/app 装载器形态（真实 main 在 extraResources runtime/host-dist）', () => {
    expect(config.asar).toBe(false)
    expect(config.directories).toEqual({ app: 'release/app', output: 'release/installer' })
    expect(config.files).toEqual(['main.js', 'package.json'])
  })

  it('extraResources 自 release/staging 显式 filter 嵌入（root 级 node_modules 剔除规避 + 内容边界自证）', () => {
    expect(config.extraResources).toEqual([
      { from: join(ROOT, 'release', 'staging'), to: '.', filter: ['runtime/**', 'web-dist/**', 'staging-manifest.json'] },
    ])
  })

  it('Electron 精确 44.0.0（S1 指纹门）+ NSIS 离线开关 + 无更新通道', () => {
    expect(config.electronVersion).toBe('44.0.0')
    expect(config.win).toEqual({ target: ['nsis'] })
    const nsis = config.nsis as Record<string, unknown>
    expect(nsis.differentialPackage).toBe(false)
    expect(nsis.oneClick).toBe(false)
    expect(nsis.perMachine).toBe(false)
    expect(config.publish).toBeNull()
    expect(config.appId).toBe('app.dshforge.desktop')
    expect(config.productName).toBe('dsh-forge')
    expect(config.artifactName).toContain('9.9.9')
  })
})

describe('AC2 profile.install 安装树清单 = 运行时并集（漂移守卫）', () => {
  const install = readJson('apps/host/profile.install/package.json') as { dependencies: Record<string, string> }
  const expected: Record<string, string> = {
    ...RUNTIME_PACKAGES,
    '@deepseek-ai/dsh-base': '0.2.0-rc.2', // profile 模板 bundles（tech-design「profile 组装与插件分发」）
    '@deepseek-ai/dsh-web-app': '0.2.0-rc.2',
    'better-sqlite3': '13.0.3', // @dsh-forge/core 原生依赖（prebuilds 随包分发）
    'gray-matter': '4.0.3',
  }
  const expectedSorted = Object.keys(expected).sort()

  it('依赖集 = RUNTIME_PACKAGES ∪ 模板 bundles ∪ core 原生依赖（精确版本一致）', () => {
    expect(Object.keys(install.dependencies).sort()).toEqual(expectedSorted)
    for (const [name, version] of Object.entries(expected)) {
      expect(install.dependencies[name], `${name} 版本漂移`).toBe(version)
    }
  })

  it('不声明 @dsh-forge/*（workspace link 无分发意义——物化脚本自 packages/* 真实拷贝）', () => {
    for (const name of Object.keys(install.dependencies)) expect(name).not.toContain('@dsh-forge')
  })

  it('workspace 形状：hoisted + autoInstallPeers true（打包树 peer 自足——探针实证 peer-only 包缺席即 ESM 链断）', () => {
    const yaml = readFileSync(join(ROOT, 'apps/host/profile.install/pnpm-workspace.yaml'), 'utf8')
    expect(yaml).toContain('nodeLinker: hoisted')
    expect(yaml).toContain('autoInstallPeers: true')
  })
})

describe('AC2+AC3 物化脚本纯函数（assemble-installer-resources.mjs）', () => {
  it('合成 anchor 清单：官方栈并集 ∪ @dsh-forge/* 真实版本，键排序稳定', () => {
    const install = { dependencies: { 'b-pkg': '1.0.0', 'a-pkg': '2.0.0' } }
    const anchor = buildRuntimeAnchorManifest(install, { '@dsh-forge/core': '0.1.0' }, '0.2.0') as {
      dependencies: Record<string, string>
    }
    expect(anchor.name).toBe('dsh-forge-runtime')
    expect(anchor.version).toBe('0.2.0')
    expect(Object.keys(anchor.dependencies)).toEqual(['@dsh-forge/core', 'a-pkg', 'b-pkg'])
    expect(anchor.dependencies['@dsh-forge/core']).toBe('0.1.0')
  })

  it('app 清单 deps-free：main = main.js 装载器 + ESM（electron-builder 无依赖可收）', () => {
    const app = buildAppManifest('0.2.0') as Record<string, unknown>
    expect(app.main).toBe('main.js')
    expect(app.type).toBe('module')
    expect(app.dependencies).toBeUndefined()
    expect(app.devDependencies).toBeUndefined()
  })

  it('关键文件口径覆盖四载体：anchor 清单 / 官方 metapackage+双 bundle / 产品三插件 / sqlite prebuild / 壳 dist / 装载器 / 真实 main / child 入口', () => {
    const must = [
      'runtime/package.json',
      'runtime/host-dist/main.js',
      'runtime/host-dist/boot/child.js',
      'runtime/node_modules/@deepseek-ai/dsh/package.json',
      'runtime/node_modules/@deepseek-ai/dsh-base/package.json',
      'runtime/node_modules/@deepseek-ai/dsh-web-app/package.json',
      'runtime/node_modules/@dsh-forge/core/dist/index.js',
      'runtime/node_modules/@dsh-forge/knowledge/dist/index.js',
      'runtime/node_modules/@dsh-forge/contracts/dist/index.js',
      'runtime/node_modules/better-sqlite3/prebuilds/win32-x64.node',
      'web-dist/index.html',
      'app/main.js',
      'app/package.json',
    ]
    for (const rel of must) expect(REQUIRED_KEY_FILES, `关键文件口径缺席 ${rel}`).toContain(rel)
  })
})
