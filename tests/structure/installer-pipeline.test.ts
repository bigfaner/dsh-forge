// 任务 4.1 结构 pin —— 安装包管线（electron-builder NSIS + extraResources + sqlite prebuilds）。
// 权威来源：tech-design「打包管线（Windows NSIS）」段 + 4.1 任务书 AC；本文件 pin 三件：
//   1. electron-builder 配置形状（asar:false / extraResources=staging / NSIS 离线开关 / Electron 44 pin）
//   2. profile.install 安装树清单 = 官方栈并集（RUNTIME_PACKAGES ∪ 模板 bundles ∪ core 原生依赖）
//      ——与 runtime-packages.ts 同源的漂移守卫（apps/host/package.json 已另有 pin）
//   3. 物化脚本纯函数（合成 anchor 清单 / deps-free app 清单 / 关键文件口径）
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { RUNTIME_PACKAGES, PRODUCT_PLUGIN_PACKAGE_DIRS } from '../../apps/host/src/profile/runtime-packages.js'
import { buildAppManifest, buildRuntimeAnchorManifest, presetCarriedPlugins, requiredKeyFiles, stagedProductPackages, stagingExtrasDrift } from '../../scripts/assemble-installer-resources.mjs'
import { PRODUCT_PLUGINS } from '../../packages/contracts/src/product-plugins.js'
import { createElectronBuilderConfig } from '../../electron-builder.config.mjs'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..')
const readJson = (p: string) => JSON.parse(readFileSync(join(ROOT, p), 'utf8')) as Record<string, unknown>
/** 关键文件口径（配置派生——与 stage/--check 运行期同源 PRODUCT_PLUGINS） */
const KEY_FILES = requiredKeyFiles(PRODUCT_PLUGINS)

describe('AC1+AC2 electron-builder 配置形状（electron-builder.config.mjs）', () => {
  const config = createElectronBuilderConfig('9.9.9') as Record<string, unknown>

  it('asar: false + app 目录 = release/app 装载器形态（真实 main 在 extraResources runtime/host-dist）', () => {
    expect(config.asar).toBe(false)
    expect(config.directories).toEqual({ app: 'release/app', output: 'release/installer' })
    expect(config.files).toEqual(['main.js', 'package.json'])
  })

  it('extraResources 自 release/staging 显式 filter 嵌入（root 级 node_modules 剔除规避 + 内容边界自证）', () => {
    expect(config.extraResources).toEqual([
      { from: join(ROOT, 'release', 'staging'), to: '.', filter: ['runtime/**', 'web-dist/**', 'mobile-dist/**', 'icon.png', 'staging-manifest.json'] },
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
  it('icon.svg：bluish 强调色烘焙 + 派生缩放在场（currentColor 位图语义不适用）', () => {
    const svg = readFileSync(join(ROOT, 'build', 'icon.svg'), 'utf8')
    expect(svg).toContain('#4176e6') // 2026-10-13 提亮：墨 #22314a → deepseek-500（用户走查「太暗」，README 既有回退执行）
    expect(svg).not.toContain('#22314a')
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

describe('dev 启动器控制台编码归一（bug: electron 日志中文乱码）', () => {
  const devSource = readFileSync(join(ROOT, 'scripts', 'dev.mjs'), 'utf8')

  it('electron 拉起前将控制台代码页归一到 UTF-8（chcp 65001）——Chromium stderr 恒写 UTF-8，CP936 控制台直读即乱码（UTF-8 的「绑定失配」经 GBK 解码呈「缁戝畾澶遍厤」）', () => {
    expect(devSource, 'dev.mjs 缺 chcp 65001 归一步（bug 在场——dev:debug 中文日志乱码）').toContain('chcp')
    expect(devSource).toContain('65001')
  })

  it('归一步在 electron spawn 之前执行（时序 pin——后置则首屏日志仍乱码）', () => {
    const chcpAt = devSource.indexOf('65001')
    const spawnAt = devSource.indexOf('spawn(electronSpawnExe')
    expect(chcpAt).toBeGreaterThan(-1)
    expect(spawnAt).toBeGreaterThan(-1)
    expect(chcpAt, 'chcp 归一须先于 electron spawn').toBeLessThan(spawnAt)
  })
})

describe('AC2 profile.install 安装树清单 = 运行时并集（漂移守卫）', () => {
  const install = readJson('apps/host/profile.install/package.json') as { dependencies: Record<string, string> }
  const expected: Record<string, string> = {
    ...RUNTIME_PACKAGES,
    '@deepseek-ai/dsh-base': '0.2.0-rc.2', // profile 模板 bundles（tech-design「profile 组装与插件分发」）
    '@deepseek-ai/dsh-web-app': '0.2.0-rc.2',
    '@deepseek-ai/dsh-session': '0.2.0-rc.2', // @dsh-forge/plugin-forge 原生依赖（bug 62211111 同类——progress/dist 静态 import 面）
    'better-sqlite3': '13.0.3', // @dsh-forge/core 原生依赖（prebuilds 随包分发）
    'chokidar': '5.0.0', // @dsh-forge/expert-squad 原生依赖（bug 62211111 同类——档案热刷新 watch 面）
    'gray-matter': '4.0.3',
    'mermaid': '12.1.0', // @dsh-forge/md-mermaid 原生依赖（bug 62211111——staging 闭包只追 @dsh-forge/*，外部依赖经本清单随包物化）
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
      type?: string
      dependencies: Record<string, string>
    }
    expect(anchor.name).toBe('dsh-forge-runtime')
    expect(anchor.version).toBe('0.2.0')
    expect(Object.keys(anchor.dependencies)).toEqual(['@dsh-forge/core', 'a-pkg', 'b-pkg'])
    expect(anchor.dependencies['@dsh-forge/core']).toBe('0.1.0')
  })

  it('bug f27619a2：anchor 清单必须携带 type:module——host-dist 全 ESM，缺席即每启 MODULE_TYPELESS 重解析警告（error 级日志噪音）', () => {
    const anchor = buildRuntimeAnchorManifest({ dependencies: {} }, {}, '0.2.0') as { type?: string }
    expect(anchor.type, 'runtime/package.json 缺 type:module（bug 在场）').toBe('module')
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
      'runtime/node_modules/@dsh-forge/contracts/dist/index.js',
      // knowledge 暂不含（产品裁决：知识库功能不完整，打包形态不开放——dev 形态仍含；
      // 重开放 = 翻转 contracts PRODUCT_PLUGINS staged 布尔，本口径随之派生）
      'runtime/node_modules/@dsh-forge/plugin-forge/dist/index.js',
      'runtime/node_modules/@dsh-forge/plugin-forge/skills/submit-task/SKILL.md',
      // blitz 专属技能面（plugin-forge 包内 skills-blitz 旁目录——blitz 预设 customSkillDirs
      // 挂载源；缺席即突击组合技能面静默缺失）
      'runtime/node_modules/@dsh-forge/plugin-forge/skills-blitz/grilling/SKILL.md',
      // M3 3.8 packaging 三处同步（TECH-packaging-001）：plugin-forge-spec 新包——漏列 =
      // 打包形态 boot ESM 解析断裂（远征预设行装载失败，TECH-packaging-001 症状面）
      'runtime/node_modules/@dsh-forge/plugin-forge-spec/package.json',
      'runtime/node_modules/@dsh-forge/plugin-forge-spec/dist/index.js',
      // M3 3.2 规格技能迁移落地：spec skills 入物化清单与关键文件口径（3.8 曾注记
      // 「随 3.2 落地后补列」——缺席即远征组合技能面静默缺失）
      'runtime/node_modules/@dsh-forge/plugin-forge-spec/skills/write-prd/SKILL.md',
      // 2026-10-18 安装版启动崩 fix：host dist ipc/worktree-rpc 静态 import——缺席即
      // 打包主进程 ERR_MODULE_NOT_FOUND 启动即崩（staged:true 覆写物化）
      'runtime/node_modules/@dsh-forge/git-worktree/package.json',
      'runtime/node_modules/@dsh-forge/git-worktree/dist/index.js',
      'runtime/node_modules/better-sqlite3/prebuilds/win32-x64.node',
      'web-dist/index.html',
      'icon.png',
      'app/main.js',
      'app/package.json',
    ]
    for (const rel of must) expect(KEY_FILES, `关键文件口径缺席 ${rel}`).toContain(rel)
  })

  it('bug: 打包产物必含 mobile-dist——/remote 移动视图打包形态 dist 根 = {resources}/mobile-dist（resolveMobileDistDir），物化/口径/filter 任一缺席即 mobile-dist-missing 提示页', () => {
    expect(KEY_FILES, '关键文件口径缺席 mobile-dist/index.html（--check 不可达）').toContain('mobile-dist/index.html')
  })

  it('插件条目配置派生：stagedProductPackages(PRODUCT_PLUGINS) 成员 = KEY_FILES 插件面全集（配置单一源——翻转布尔即两口径同步）', () => {
    const stagedNames = new Set(Object.keys(stagedProductPackages(PRODUCT_PLUGINS)).map((k) => k.split('/').pop()))
    const keyFileNames = new Set(
      KEY_FILES.flatMap((rel) => {
        const hit = /^runtime\/node_modules\/@dsh-forge\/([^/]+)\//.exec(rel)
        return hit === null ? [] : [hit[1]]
      }),
    )
    expect([...stagedNames].sort()).toEqual([...keyFileNames].sort())
  })
})

describe('产品插件 staging 闭包（@dsh-forge/* 运行时依赖随包物化——打包形态 boot child ESM 解析链）', () => {
  /** staging 口径内产品包集合（KEY_FILES 路径提取——与 --check / stagedProductPackages 同源漂移） */
  const stagedPackages = new Set(
    KEY_FILES.flatMap((rel) => {
      const hit = /^runtime\/node_modules\/@dsh-forge\/([^/]+)\//.exec(rel)
      return hit === null ? [] : [hit[1]]
    }),
  )

  it('staging 集合自动推导：种子（行插件 + 预设携带 + staged:true）∪ @dsh-forge/* 依赖闭包——contracts/path-key 闭包成员自动入场，新增产品包零配置', () => {
    // 预设携带面真源 = 底稿文件扫描（plugin-forge/-spec/md-mermaid——远征/突击组合行；
    // expert-squad 不在预设底稿——用户层全局行装载，见 PRODUCT_PLUGINS expert-squad 行）
    expect(presetCarriedPlugins()).toEqual(['md-mermaid', 'plugin-forge', 'plugin-forge-spec'])
    // 闭包成员自动入场（e791a46 病理：path-key 漏列致打包形态 ESM 解析断裂——推导制下结构性消除）
    // git-worktree = staged:true 覆写种子（2026-10-18 安装版启动崩 fix：host dist 静态 import 面）
    expect(Object.keys(stagedProductPackages(PRODUCT_PLUGINS)).sort()).toEqual(
      ['contracts', 'core', 'path-key', 'plugin-forge', 'plugin-forge-spec', 'plugins/expert-squad', 'plugins/git-worktree', 'plugins/md-mermaid'].sort(),
    )
  })

  it('closure：预设携带插件 ⊆ staging 集合（发版新增产品插件 → 老用户升级自动补行闭环的 assemble 侧半——预设引用越界即红并报出插件名与来源预设文件）', () => {
    // staged 集合 = stagedProductPackages 推导（userLayerRow/预设种子/staged:true ∪ 闭包 −
    // kill-switch）；预设携带面真源 = 底稿文件逐文件扫描（与 presetCarriedPlugins 同口径，
    // 自扫为取「来源预设文件」用于 fail 报文）。
    const presetsDir = join(ROOT, 'apps', 'host', 'src', 'profile', 'presets')
    const stagedShorts = new Set(Object.keys(stagedProductPackages(PRODUCT_PLUGINS)).map((k) => k.split('/').pop()))
    const orphans: string[] = []
    for (const file of readdirSync(presetsDir)) {
      if (!file.endsWith('.yml')) continue
      const text = readFileSync(join(presetsDir, file), 'utf8')
      for (const hit of text.matchAll(/'@dsh-forge\/([a-z0-9-]+)'/g)) {
        const short = hit[1]!
        if (!stagedShorts.has(short)) orphans.push(`${short}（来源 presets/${file}）`)
      }
    }
    expect(presetCarriedPlugins().length, '预设扫描面失效即假绿（扫描到 0 个携带插件）').toBeGreaterThan(0)
    expect(orphans, `预设携带插件未入 staging 集合（预设/配置面漂移）：${orphans.join('; ')}`).toEqual([])
  })

  it('bug a1f13abf：声明 dsh.bundle.patch 的插件，组合 patch 文件必随包物化并入 --check 口径（loader 按声明读包内该文件——缺席即 overlay ENOENT）', () => {
    const staged = stagedProductPackages(PRODUCT_PLUGINS)
    // 声明面扫描：packages/*/package.json dsh.bundle.patch 指向的文件 ⊆ staging files
    for (const [dir, files] of Object.entries(staged)) {
      const manifest = JSON.parse(readFileSync(join(ROOT, 'packages', dir, 'package.json'), 'utf8')) as {
        dsh?: { bundle?: { patch?: string } }
      }
      const declared = manifest.dsh?.bundle?.patch
      if (declared === undefined) continue
      const rel = declared.replace(/^\.\//, '')
      expect(files, `${dir} 声明 dsh.bundle.patch=${declared} 但未随包物化`).toContain(rel)
      expect(
        KEY_FILES,
        `关键文件口径缺席 runtime/node_modules/@dsh-forge/${dir.split('/').pop()}/${rel}（--check 不可达）`,
      ).toContain(`runtime/node_modules/@dsh-forge/${dir.split('/').pop()}/${rel}`)
    }
    // 现值锚：expert-squad 是当前唯一声明者（回归锚——声明面丢失即本断言红）
    expect(staged['plugins/expert-squad']).toContain('cordis.patch.yml')
  })

  it('bug a2a54922（G5 约定目录结构扫描）：staged 包源目录含约定资源目录（experts/skills/skills-blitz）→ 必在物化 files 集（漏配从人记变机械）', () => {
    const CONVENTION_DIRS = ['experts', 'skills', 'skills-blitz']
    const staged = stagedProductPackages(PRODUCT_PLUGINS)
    const problems: string[] = []
    for (const [dir, files] of Object.entries(staged)) {
      for (const convention of CONVENTION_DIRS) {
        const sourceDir = join(ROOT, 'packages', dir, convention)
        if (existsSync(sourceDir) && readdirSync(sourceDir).length > 0 && !files.includes(convention)) {
          problems.push(`packages/${dir}/${convention} 在场但未随包物化（STAGING_EXTRAS 漏列）`)
        }
      }
    }
    expect(problems, problems.join('\n')).toEqual([])
    // 现值锚：plugin-forge experts/（34 份内置专家档案——bug a2a54922 病理面）
    expect(staged['plugin-forge']).toContain('experts')
  })

  it('bug: host dist 静态 @dsh-forge/* import 面 ⊆ staging 闭包（打包形态主进程 ESM 上溯 runtime/node_modules——漏包即 ERR_MODULE_NOT_FOUND 启动崩，2026-10-18 安装版实证 git-worktree）', () => {
    // Root cause 病理：host 主进程新增静态 import（worktree-rpc → @dsh-forge/git-worktree）
    // 而包未入 staging 种子（userLayerRow/预设/依赖闭包三径均不可达——零依赖叶子）。
    // 推导制只看「行/预设/闭包引用」，host dist import 面不在其宇宙——本断言补上该缝。
    const distDir = join(ROOT, 'apps', 'host', 'dist')
    expect(existsSync(join(distDir, 'main.js')), `apps/host/dist 缺席（先 pnpm build——结构测试前置）：${distDir}`).toBe(true)
    const imported = new Set<string>()
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) walk(path)
        else if (entry.name.endsWith('.js')) {
          for (const hit of readFileSync(path, 'utf8').matchAll(/from '(@dsh-forge\/[a-z0-9-]+)'/g)) imported.add(hit[1]!)
        }
      }
    }
    walk(distDir)
    expect(imported.size, 'host dist 应有 @dsh-forge/* 静态 import（扫描面失效即假绿）').toBeGreaterThan(0)
    const stagedFullNames = new Set([...stagedPackages].map((name) => `@dsh-forge/${name}`))
    const missing = [...imported].filter((name) => !stagedFullNames.has(name)).sort()
    expect(missing, `host dist 静态 import 未入 staging 闭包（安装版启动即崩——staged:true 覆写或闭包补径）：${missing.join('; ')}`).toEqual([])
  })

  it('bug 62211111：staged 插件的外部（非 @dsh-forge/*）运行时依赖 ⊆ profile.install 依赖——staging 闭包 BFS 只追 @dsh-forge/*，外部依赖缺席安装树即插件运行期 ERR_MODULE_NOT_FOUND（md-mermaid → mermaid 实证）', () => {
    const installDeps = (readJson('apps/host/profile.install/package.json') as { dependencies: Record<string, string> }).dependencies
    const missing: string[] = []
    for (const name of [...stagedPackages].sort()) {
      const dir = PRODUCT_PLUGIN_PACKAGE_DIRS[`@dsh-forge/${name}`]
      const manifest = readJson(`packages/${dir !== undefined ? `${dir}/` : ''}${name}/package.json`) as { dependencies?: Record<string, string> }
      for (const [dep, version] of Object.entries(manifest.dependencies ?? {})) {
        if (dep.startsWith('@dsh-forge/')) continue
        if (installDeps[dep] === undefined) missing.push(`${name} → ${dep}@${version}`)
        else expect(installDeps[dep], `${dep} 版本漂移（${name} 声明 ${version}）`).toBe(version)
      }
    }
    expect(missing, `staged 插件外部依赖未入 profile.install（安装树缺席即 ERR_MODULE_NOT_FOUND）：${missing.join('; ')}`).toEqual([])
  })

  it('闭包自洽：已 staging 产品包的 @dsh-forge/* 运行时依赖均在场（kill-switch 误伤即红——boot child ESM 解析断裂→双服务灭→forge:* 通道全未注册）', () => {
    // Root cause 实证（安装版 Electron 实测）：core dist import '@dsh-forge/path-key' 落空——
    // 历史病理 = staging 硬编码清单漏列闭包成员；推导制下本断言守 kill-switch 不误伤。
    const missing: string[] = []
    for (const name of [...stagedPackages].sort()) {
      // 键可含 packages/ 子路径（md-mermaid 居 packages/plugins/——runtime-packages 同源映射）
      const dir = PRODUCT_PLUGIN_PACKAGE_DIRS[`@dsh-forge/${name}`]
      const manifest = readJson(`packages/${dir !== undefined ? `${dir}/` : ''}${name}/package.json`) as { dependencies?: Record<string, string> }
      for (const dep of Object.keys(manifest.dependencies ?? {})) {
        if (dep.startsWith('@dsh-forge/') && !stagedPackages.has(dep.slice('@dsh-forge/'.length))) {
          missing.push(`${name} → ${dep}`)
        }
      }
    }
    expect(missing, `staging 闭包缺口（staged:false kill-switch 误伤依赖成员？）：${missing.join('; ')}`).toEqual([])
  })

  it('闭包成员物化口径完整：package.json + dist 双件随包（--check 断言可达）', () => {
    for (const name of [...stagedPackages].sort()) {
      expect(KEY_FILES, `${name} package.json 口径缺席`).toContain(
        `runtime/node_modules/@dsh-forge/${name}/package.json`,
      )
      expect(KEY_FILES, `${name} dist 入口口径缺席`).toContain(
        `runtime/node_modules/@dsh-forge/${name}/dist/index.js`,
      )
    }
  })

  it('M3 3.8+3.2：plugin-forge-spec 入闭包（PRODUCT_PACKAGES 物化 + --check 口径双件全 + skills 技能面（3.2 规格技能迁移落地补列））', () => {
    expect(stagedPackages.has('plugin-forge-spec'), 'plugin-forge-spec 缺席 staging 闭包（TECH-packaging-001：漏列即打包形态 boot ESM 解析断裂）').toBe(true)
    expect(KEY_FILES, 'plugin-forge-spec skills 技能面口径缺席（远征组合 customSkillDirs[spec] 挂载源）').toContain(
      'runtime/node_modules/@dsh-forge/plugin-forge-spec/skills/write-prd/SKILL.md',
    )
  })

  it('knowledge 暂不开放 pin（产品裁决：知识库功能不完整，打包形态不开放——dev 形态 profile.dev 仍含；重开放 = 改 contracts PRODUCT_PLUGINS knowledge 行，本 pin 同步反转）', () => {
    expect(PRODUCT_PLUGINS['knowledge'], 'knowledge 配置应为关（userLayerRow:false + staged:false kill-switch）').toEqual({ userLayerRow: false, staged: false })
    expect(stagedPackages.has('knowledge'), 'knowledge 应暂缺席 staging（推导制下无种子 + kill-switch 双保险）').toBe(false)
    expect(KEY_FILES.some((rel) => rel.includes('@dsh-forge/knowledge')), '关键文件口径不应含 knowledge 行（暂不开放）').toBe(false)
  })
})

/**
 * extraResources filter ↔ staging sections 一致性守护（packaging-guard-hardening 1.2）。
 *
 * 病理先例（mobile-dist）：assemble 侧新增 staging section（物化新目录到 release/staging/）
 * 而 electron-builder.config.mjs extraResources filter 漏列 → 整段静默缺席安装包，
 * 打包产物内该面缺失（mobile-dist 缺席即 /remote 落提示页）。既有 AC1 测试只 pin
 * filter 字面量（两侧同改即假绿），本守护独立断言「filter 覆盖 staging sections 宇宙」：
 *   - sections 宇宙 = assemble 脚本物化到 staging 的顶层段（runtime/web-dist/mobile-dist/
 *     icon.png/staging-manifest.json）+ release/app 段（electron-builder files 口径）；
 *   - 正例：现值 filter 下每段可达；
 *   - fail-loud 反例：新增 section 而 filter 未覆盖（以剔除 mobile-dist/** 的突变 filter
 *     验证匹配器判不可达）——防再演「忘改 filter」类缺陷。
 */
describe('extraResources filter ⊇ staging sections 一致性守护（忘改 filter 即 fail-loud）', () => {
  /** assemble 脚本物化到 release/staging/ 的顶层段宇宙（+ release/app 装载器段） */
  const STAGING_SECTIONS = [
    'runtime/**', // 运行时容器（node_modules + host-dist + anchor package.json）
    'web-dist/**', // 壳静态资产
    'mobile-dist/**', // /remote 移动视图静态资产（resolveMobileDistDir 打包形态默认位）
    'icon.png', // fix-45 窗口图标（{resources}/icon.png 解析位）
    'staging-manifest.json', // 物化清单（4.3 冒烟自证挂点）
    'app/**', // electron-builder 应用目录（release/app：main.js 装载器 + 清单）
  ]

  /** electron-builder minimatch 风格 filter 规则 → 路径匹配（`**` 跨段 / `*` 单段） */
  const filterMatches = (filters: readonly string[], relPath: string): boolean =>
    filters.some((filter) => {
      const GLOB_STAR = '@@glob-star@@' // 占位 token：`**` 先换出，防 `*` 单段语义误替换
      const pattern = filter
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, GLOB_STAR)
        .replace(/\*/g, '[^/]*')
        .split(GLOB_STAR)
        .join('.*')
      return new RegExp(`^${pattern}$`).test(relPath)
    })

  /** extraResources 配置 → 相对 staging 根的可达性判定（段 → 布尔） */
  const coverageOf = (builderConfig: Record<string, unknown>, extraResources: unknown): Record<string, boolean> => {
    const entry = (extraResources as Array<{ from: string; to: string; filter: string[] }>)[0]!
    const toPrefix = entry.to === '.' ? '' : `${entry.to}/`
    return Object.fromEntries(
      STAGING_SECTIONS.map((section) => {
        // app 段物理居 release/app（electron-builder files 口径收 main.js/package.json）
        if (section === 'app/**') {
          const files = (builderConfig.files as string[]) ?? []
          return [section, ['main.js', 'package.json'].every((f) => files.includes(f))]
        }
        const sample = `${toPrefix}${section.replace('/**', '/index.html')}`
        const exact = section === 'icon.png' || section === 'staging-manifest.json' ? `${toPrefix}${section}` : undefined
        return [
          section,
          filterMatches(entry.filter, sample) || (exact !== undefined && filterMatches(entry.filter, exact)),
        ]
      }),
    )
  }

  it('正例：现值 filter 覆盖 staging 全部 section（runtime/web-dist/mobile-dist/icon/staging-manifest/app 段均可达）', () => {
    const builder = createElectronBuilderConfig('9.9.9') as Record<string, unknown>
    const covered = coverageOf(builder, builder.extraResources)
    const gaps = STAGING_SECTIONS.filter((section) => covered[section] !== true)
    expect(gaps, `extraResources filter 未覆盖的 staging section（整段漏进安装包）：${gaps.join('; ')}`).toEqual([])
  })

  it('filter 规则自证：匹配器对 `**`/精确名语义正确（正反样本各半——假绿防线）', () => {
    expect(filterMatches(['runtime/**'], 'runtime/node_modules/a/b.js')).toBe(true)
    expect(filterMatches(['icon.png'], 'icon.png')).toBe(true)
    expect(filterMatches(['icon.png'], 'web-dist/icon.png')).toBe(false)
    expect(filterMatches(['runtime/**'], 'web-dist/index.html')).toBe(false)
    expect(filterMatches(['web-dist/**'], 'web-dist/sub/x.js')).toBe(true)
    expect(filterMatches(['runtime/*'], 'runtime/a/b.js')).toBe(false) // 单 `*` 不跨段
  })

  it('fail-loud 反例：新增 staging section（模拟 mobile-dist 病理——filter 剔除该段）→ 覆盖判定判不可达', () => {
    const mutated = [
      { from: join(ROOT, 'release', 'staging'), to: '.', filter: ['runtime/**', 'web-dist/**', 'icon.png', 'staging-manifest.json'] },
    ]
    const covered = coverageOf(createElectronBuilderConfig('9.9.9') as Record<string, unknown>, mutated)
    expect(covered['mobile-dist/**'], 'filter 漏列 mobile-dist/** 时守护必须红（病理回归锚）').toBe(false)
    expect(covered['web-dist/**']).toBe(true) // 其余段不受影响（守卫精度）
  })
})

describe('STAGING_EXTRAS 白名单自动比对守卫（stagingExtrasDrift——stage()/--check 双接线 fail-loud）', () => {
  /** fixture 根：临时目录 + 空 presets 目录（presetCarriedPlugins 扫描域） */
  const makeFixtureRoot = () => {
    const root = mkdtempSync(join(tmpdir(), 'staging-extras-guard-'))
    mkdirSync(join(root, 'apps/host/src/profile/presets'), { recursive: true })
    return root
  }
  /** fixture 插件包（userLayerRow 种子——绕开预设底稿扫描） */
  const makePlugin = (root: string, opts: { skills?: boolean; patchDeclared?: boolean; patchFile?: boolean }) => {
    const dir = join(root, 'packages/plugins/fake-plugin')
    mkdirSync(dir, { recursive: true })
    if (opts.skills === true) {
      mkdirSync(join(dir, 'skills', 'demo'), { recursive: true })
      writeFileSync(join(dir, 'skills', 'demo', 'SKILL.md'), 'demo\n', 'utf8')
    }
    if (opts.patchDeclared === true) {
      if (opts.patchFile !== false) writeFileSync(join(dir, 'cordis.patch.yml'), 'services:\n', 'utf8')
    }
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        name: '@dsh-forge/fake-plugin',
        version: '0.1.0',
        ...(opts.patchDeclared === true ? { dsh: { bundle: { patch: './cordis.patch.yml' } } } : {}),
      }),
      'utf8',
    )
  }
  const FIXTURE_PLUGINS = { 'fake-plugin': { userLayerRow: true } }

  it('正例：已声明插件（skills/ + dsh.bundle.patch 文件均在 STAGING_EXTRAS 登记）→ 零漂移', () => {
    const root = makeFixtureRoot()
    try {
      makePlugin(root, { skills: true, patchDeclared: true })
      const drift = stagingExtrasDrift(FIXTURE_PLUGINS, root, {
        'fake-plugin': { files: ['skills', 'cordis.patch.yml'], keyFiles: ['skills/demo/SKILL.md'] },
      })
      expect(drift).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('反例（漏声明）：未声明插件带 skills/ 面 → 漂移报出包名与遗漏路径（bug c85c157c/dd76f14c 病理面）', () => {
    const root = makeFixtureRoot()
    try {
      makePlugin(root, { skills: true, patchDeclared: true })
      const drift = stagingExtrasDrift(FIXTURE_PLUGINS, root, {})
      expect(drift.some((p) => p.includes('fake-plugin') && p.includes('skills')), `实际存在 skills/ 未声明：${drift.join('; ')}`).toBe(true)
      expect(drift.some((p) => p.includes('fake-plugin') && p.includes('cordis.patch.yml')), `dsh.bundle.patch 未声明：${drift.join('; ')}`).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('反例（声明失真）：STAGING_EXTRAS 声明指向不存在的目录/文件 → 漂移报出缺失路径', () => {
    const root = makeFixtureRoot()
    try {
      makePlugin(root, {})
      const drift = stagingExtrasDrift(FIXTURE_PLUGINS, root, {
        'fake-plugin': { files: ['experts'], keyFiles: ['experts/ghost.md'] },
      })
      expect(drift.some((p) => p.includes('files 声明 experts') && p.includes('不存在')), drift.join('; ')).toBe(true)
      expect(drift.some((p) => p.includes('keyFiles 声明 experts/ghost.md') && p.includes('不存在')), drift.join('; ')).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('反例（patch 失真）：dsh.bundle.patch 声明指向的文件盘上缺席 → 漂移（且 patch 未声明入 files 时漏随包条目同时在案）', () => {
    const root = makeFixtureRoot()
    try {
      makePlugin(root, { patchDeclared: true, patchFile: false })
      const drift = stagingExtrasDrift(FIXTURE_PLUGINS, root, { 'fake-plugin': { files: ['cordis.patch.yml'], keyFiles: [] } })
      expect(drift.some((p) => p.includes('cordis.patch.yml') && p.includes('不存在')), drift.join('; ')).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('现值绿锚：真实仓 staged 集零漂移（stagedProductPackages × STAGING_EXTRAS 现值自洽）', () => {
    expect(stagingExtrasDrift(PRODUCT_PLUGINS)).toEqual([])
  })

  it('接线 fail-loud：stage()（assertPreconditions）与 --check（check()）均消费守卫', () => {
    const source = readFileSync(join(ROOT, 'scripts', 'assemble-installer-resources.mjs'), 'utf8')
    const callAt = (from: number) => source.indexOf('  assertExtrasDrift(plugins)', from) // 两空格缩进——排除 stagingExtrasDrift 子串误配
    const first = callAt(0)
    const second = callAt(first + 1)
    expect(first, '守卫接线缺席').toBeGreaterThan(-1)
    expect(second, 'stage 与 --check 须双接线（只接一处即另一路径漏守）').toBeGreaterThan(-1)
    const stageCallSite = source.slice(source.indexOf('function assertPreconditions'), first)
    const checkCallSite = source.slice(source.indexOf('async function check('), second)
    expect(stageCallSite).toContain('function assertPreconditions')
    expect(checkCallSite).toContain('async function check(')
  })
})
