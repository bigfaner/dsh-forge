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
      { from: join(ROOT, 'release', 'staging'), to: '.', filter: ['runtime/**', 'web-dist/**', 'icon.png', 'staging-manifest.json'] },
    ])
  })

  it('Electron 精确 44.0.0（S1 指纹门）+ NSIS 离线开关 + 无更新通道', () => {
    expect(config.electronVersion).toBe('44.0.0')
    expect(config.win).toEqual({ target: ['nsis'], icon: 'build/icon.ico' })
    const nsis = config.nsis as Record<string, unknown>
    expect(nsis.differentialPackage).toBe(false)
    expect(nsis.oneClick).toBe(false)
    expect(nsis.perMachine).toBe(false)
    expect(config.publish).toBeNull()
    expect(config.appId).toBe('app.dshforge.desktop')
    expect(config.productName).toBe('dsh-forge')
    expect(config.artifactName).toContain('9.9.9')
  })

  it('应用图标三字段同源（fix-45）：win.icon + nsis.installerIcon/uninstallerIcon = build/icon.ico', () => {
    expect(config.win).toMatchObject({ icon: 'build/icon.ico' })
    const nsis = config.nsis as Record<string, unknown>
    expect(nsis.installerIcon).toBe('build/icon.ico')
    expect(nsis.uninstallerIcon).toBe('build/icon.ico')
    // shortcutIconName 缺省随 productName（不显式声明——漂移即在此红）
    expect(nsis.shortcutIconName).toBeUndefined()
  })
})

describe('fix-45 入仓图标资产自证（build/ 一次生成物）', () => {
  it('icon.svg：墨色烘焙 + 派生缩放在场（currentColor 位图语义不适用）', () => {
    const svg = readFileSync(join(ROOT, 'build', 'icon.svg'), 'utf8')
    expect(svg).toContain('#22314a')
    expect(svg).not.toContain('currentColor')
    expect(svg).toMatch(/<g transform="translate\([\d.]+ [\d.]+\) scale\([\d.]+\)">/)
  })

  it('icon.png：512×512 RGBA（BrowserWindow icon 消费位）', () => {
    const png = readFileSync(join(ROOT, 'build', 'icon.png'))
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(png.readUInt32BE(16)).toBe(512)
    expect(png.readUInt32BE(20)).toBe(512)
    expect(png[25]).toBe(6) // colorType RGBA（透明底承载）
  })

  it('icon.ico：6 帧 PNG 封装（16/32/48/64/128/256——256 记 0 字节惯例）+ 容器布局自洽', () => {
    const ico = readFileSync(join(ROOT, 'build', 'icon.ico'))
    expect(ico.readUInt16LE(0)).toBe(0) // reserved
    expect(ico.readUInt16LE(2)).toBe(1) // type: icon
    const count = ico.readUInt16LE(4)
    expect(count).toBe(6)
    let offset = 6
    const sizes: number[] = []
    for (let i = 0; i < count; i += 1) {
      const widthByte = ico[offset] ?? 0
      const heightByte = ico[offset + 1] ?? 0
      const width = widthByte === 0 ? 256 : widthByte
      const height = heightByte === 0 ? 256 : heightByte
      expect(width).toBe(height)
      const bytes = ico.readUInt32LE(offset + 8)
      const imageOffset = ico.readUInt32LE(offset + 12)
      // 帧体 = PNG 签名 + IHDR 尺寸与目录条目一致
      expect(ico.subarray(imageOffset, imageOffset + 8).toString('hex')).toBe('89504e470d0a1a0a')
      expect(ico.readUInt32BE(imageOffset + 16)).toBe(width)
      expect(ico.readUInt32BE(imageOffset + 20)).toBe(height)
      expect(imageOffset + bytes).toBeLessThanOrEqual(ico.length)
      sizes.push(width)
      offset += 16
    }
    expect(sizes).toEqual([16, 32, 48, 64, 128, 256])
    // 布局连续终止于文件尾（offset 自证无空洞/截断）
    const lastOffset = ico.readUInt32LE(6 + 16 * (count - 1) + 12)
    const lastBytes = ico.readUInt32LE(6 + 16 * (count - 1) + 8)
    expect(lastOffset + lastBytes).toBe(ico.length)
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
      name: string
      version: string
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

  it('关键文件口径覆盖四载体：anchor 清单 / 官方 metapackage+双 bundle / 产品插件（双包 skills 技能面）/ sqlite prebuild / 壳 dist / 窗口图标 / 装载器 / 真实 main / child 入口', () => {
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
      'runtime/node_modules/@dsh-forge/plugin-forge/dist/index.js',
      'runtime/node_modules/@dsh-forge/plugin-forge/skills/run-tasks/SKILL.md',
      // M3 3.8 packaging 三处同步（TECH-packaging-001）：plugin-forge-spec 新包——漏列 =
      // 打包形态 boot ESM 解析断裂（远征预设行装载失败，TECH-packaging-001 症状面）
      'runtime/node_modules/@dsh-forge/plugin-forge-spec/package.json',
      'runtime/node_modules/@dsh-forge/plugin-forge-spec/dist/index.js',
      // M3 3.2 规格技能迁移落地：spec skills 入物化清单与关键文件口径（3.8 曾注记
      // 「随 3.2 落地后补列」——缺席即远征组合技能面静默缺失）
      'runtime/node_modules/@dsh-forge/plugin-forge-spec/skills/write-prd/SKILL.md',
      'runtime/node_modules/better-sqlite3/prebuilds/win32-x64.node',
      'web-dist/index.html',
      'icon.png',
      'app/main.js',
      'app/package.json',
    ]
    for (const rel of must) expect(REQUIRED_KEY_FILES, `关键文件口径缺席 ${rel}`).toContain(rel)
  })
})

describe('产品插件 staging 闭包（@dsh-forge/* 运行时依赖随包物化——打包形态 boot child ESM 解析链）', () => {
  /** staging 口径内产品包集合（REQUIRED_KEY_FILES 路径提取——与 --check / PRODUCT_PACKAGES 同源漂移） */
  const stagedPackages = new Set(
    REQUIRED_KEY_FILES.flatMap((rel) => {
      const hit = /^runtime\/node_modules\/@dsh-forge\/([^/]+)\//.exec(rel)
      return hit === null ? [] : [hit[1]]
    }),
  )

  it('bug: 已 staging 产品包的 @dsh-forge/* 运行时依赖缺席 staging（boot child ESM 解析断裂→双服务灭→forge:* 通道全未注册）', () => {
    // Root cause 实证（安装版 Electron 实测）：core dist import '@dsh-forge/path-key' 落空——
    // runtime/node_modules 仅物化 PRODUCT_PACKAGES 硬编码三件，fix-30 新增的 path-key 漏列。
    const missing: string[] = []
    for (const name of [...stagedPackages].sort()) {
      const manifest = readJson(`packages/${name}/package.json`) as { dependencies?: Record<string, string> }
      for (const dep of Object.keys(manifest.dependencies ?? {})) {
        if (dep.startsWith('@dsh-forge/') && !stagedPackages.has(dep.slice('@dsh-forge/'.length))) {
          missing.push(`${name} → ${dep}`)
        }
      }
    }
    expect(missing, `staging 闭包缺口（PRODUCT_PACKAGES/REQUIRED_KEY_FILES 需补列）：${missing.join('; ')}`).toEqual([])
  })

  it('闭包成员物化口径完整：package.json + dist 双件随包（--check 断言可达）', () => {
    for (const name of [...stagedPackages].sort()) {
      expect(REQUIRED_KEY_FILES, `${name} package.json 口径缺席`).toContain(
        `runtime/node_modules/@dsh-forge/${name}/package.json`,
      )
      expect(REQUIRED_KEY_FILES, `${name} dist 入口口径缺席`).toContain(
        `runtime/node_modules/@dsh-forge/${name}/dist/index.js`,
      )
    }
  })

  it('M3 3.8+3.2：plugin-forge-spec 入闭包（PRODUCT_PACKAGES 物化 + --check 口径双件全 + skills 技能面（3.2 规格技能迁移落地补列））', () => {
    expect(stagedPackages.has('plugin-forge-spec'), 'plugin-forge-spec 缺席 staging 闭包（TECH-packaging-001：漏列即打包形态 boot ESM 解析断裂）').toBe(true)
    expect(REQUIRED_KEY_FILES, 'plugin-forge-spec skills 技能面口径缺席（远征组合 customSkillDirs[spec] 挂载源）').toContain(
      'runtime/node_modules/@dsh-forge/plugin-forge-spec/skills/write-prd/SKILL.md',
    )
  })
})
