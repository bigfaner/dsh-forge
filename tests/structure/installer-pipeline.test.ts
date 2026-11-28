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
import { buildAppManifest, buildRuntimeAnchorManifest, presetCarriedPlugins, requiredKeyFiles, stagedManifestParityViolations, stagedProductPackages, stagedPkgShort, STAGING_EXTRAS, stagingExtrasDrift } from '../../scripts/assemble-installer-resources.mjs'
import { PRODUCT_PLUGINS } from '@dsh-forge/lib-api/product-plugins'
import { createElectronBuilderConfig } from '../../electron-builder.config.mjs'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..')
const readJson = (p: string) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'))
/** 包居所解析（批5 表驱动基座——与 assemble 脚本 packageDirOf 同源单点）：
 *  contracts PRODUCT_PLUGINS dir 字段优先直取（expert-squad 载 'plugins/expert-squad'
 *  root 级树）；未声明 dir 的包消费 host 装载表 PRODUCT_PLUGIN_PACKAGE_DIRS 既有形态。 */
const pkgDirOf = (name: string): string | undefined =>
  PRODUCT_PLUGINS[name]?.dir ?? PRODUCT_PLUGIN_PACKAGE_DIRS[`@dsh-forge/${name}`]
/** staged 短名 + 居所 → 包清单相对路径（lib/ 子居所包名 lib-<目录名>——真名映射；
 *  dir 含 '/' = 完整子路径（contracts dir 表值 / PRODUCT_PLUGIN_PACKAGE_DIRS 根级 '/plugins' 与
 *  子居所形态统一——root:plugins/ 前缀键 = 仓库根级 plugins/ 树——project 包居 plugins/project）） */
const pkgManifestRelPath = (name: string, dir?: string): string => {
  if (name.startsWith('lib-')) return `lib/${name.slice('lib-'.length)}/package.json`
  if (dir?.startsWith('root:plugins/')) return `${dir.slice('root:'.length)}/package.json`
  if (dir?.startsWith('/')) return `${dir.slice(1)}/${name}/package.json` // 根级树（'/plugins' 前缀形态——先于完整子路径判）
  if (dir !== undefined && dir.includes('/')) return `${dir}/package.json` // contracts dir 表值完整子路径直取
  return `packages/${dir !== undefined ? `${dir}/` : ''}${name}/package.json`
}
/** staged 键 → [根目录名, 子路径]（与 assemble 脚本 pkgRootOf 同源映射——
 *  无前缀 'plugins/<name>' 键二义（packages/plugins/ 探测键与 root 级树表值键同形），
 *  以磁盘在场探测收口，pkgRootOf 同语义） */
const treeOf = (dir: string): [string, string] => {
  if (dir.startsWith('root:plugins/')) return ['.', dir.slice('root:'.length)]
  if (dir.startsWith('plugins/') && existsSync(join(ROOT, dir, 'package.json'))) return ['.', dir]
  return dir.startsWith('lib/') ? ['lib', dir.slice('lib/'.length)] : ['packages', dir]
}
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
    '@deepseek-ai/dsh-session': '0.2.0-rc.2', // profile 模板 bundles（tech-design「profile 组装与插件分发」）
    '@deepseek-ai/dsh-client-connection': '0.2.2-rc.5', // @dsh-forge/knowledge + project 原生依赖（053f3215 dsh 系统一 rc.5 升位——plugin 声明 0.2.2-rc.5，安装树同版即零漂移）
    'chokidar': '5.0.0', // @dsh-forge/expert-squad 原生依赖（bug 62211111 同类——档案热刷新 watch 面）
    'gray-matter': '4.0.3',
    // mammoth/mermaid/pdfjs-dist 已撤（markdown-kit 0.9.0 零运行时依赖——d00302ef 终局修：
    // 三引擎 esbuild bundling 进 dist，安装代声明闭包为空，peer validation 零 flags）
    '@deepseek-ai/schemastery': '3.18.4', // @dsh-forge/expert-squad 原生依赖（bug 62211111 同类——settings schema 校验面）
    '@deepseek-ai/dsh-typert-protocol': '0.2.2-rc.5', // @dsh-forge/project 原生依赖（bug 62211111 同类——typert 通道面；053f3215 dsh 系统一 rc.5 升位同版）
    'zod': '4.6.6', // @dsh-forge/project 原生依赖（bug 62211111 同类——schema 校验面）
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
      'runtime/node_modules/@dsh-forge/lib-api/dist/index.js',
      // knowledge 1.9 A5 重开放：用户层全局行 + skills/learn 技能面（customSkillDirs[knowledge]
      // 挂载源——STAGING_EXTRAS 承载）；stage② 1.5 增 skills/distill 整合技能（随包交付面同步）
      // knowledge 迁移批1.3：root 级 plugins/knowledge 三目录制——dist 入口随
      // exports/main 重锚 dist/host/index.js（双面包装载范式同 expert-squad）
      'runtime/node_modules/@dsh-forge/knowledge/dist/host/index.js',
      'runtime/node_modules/@dsh-forge/knowledge/skills/learn/SKILL.md',
      'runtime/node_modules/@dsh-forge/knowledge/skills/distill/SKILL.md',
      // spec 包技能面（1.9 迁入三技能——customSkillDirs[spec] 挂载源；缺席即远征组合技能面静默缺失；
      // loop-blocking 已退役——task-loop 域 rescue-task-loop 单入口承载）
      'runtime/node_modules/@dsh-forge/spec/skills/grilling/SKILL.md',
      'runtime/node_modules/@dsh-forge/spec/skills/fix-bug/SKILL.md',
      'runtime/node_modules/@dsh-forge/spec/skills/investigate-bug/SKILL.md',
      // 1.17 批二卸旧装新：host dist boot 链（child/run/m2-wiring/bindings）静态 import
      // 本包——缺席即打包主进程 ERR_MODULE_NOT_FOUND 启动即崩（staged:true 覆写物化；
      // 旧 @dsh-forge/git-worktree 包退役，staged 种子自 plugins/git-worktree 迁 plugins/project）
      'runtime/node_modules/@dsh-forge/project/package.json',
      'runtime/node_modules/@dsh-forge/project/dist/host/index.js',
      // 1.15 退役批：task-loop staging 闭包登记（project 同款——host dist boot 链静态 import；
      // skills/ = to-tasks 拆解技能 + 自 plugin-forge 迁入的 submit-task 结算技能 + 1.25 迁入更名的 rescue-task-loop 循环救援技能）
      'runtime/node_modules/@dsh-forge/task-loop/package.json',
      'runtime/node_modules/@dsh-forge/task-loop/dist/host/index.js',
      'runtime/node_modules/@dsh-forge/task-loop/skills/to-tasks/SKILL.md',
      'runtime/node_modules/@dsh-forge/task-loop/skills/submit-task/SKILL.md',
      'runtime/node_modules/@dsh-forge/task-loop/skills/rescue-task-loop/SKILL.md',
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

  it('插件条目配置派生：stagedProductPackages(PRODUCT_PLUGINS) 成员 = KEY_FILES 插件面全集（配置单一源——翻转布尔即两口径同步；lib/ 子居所经 stagedPkgShort 真名映射）', () => {
    const stagedNames = new Set(Object.keys(stagedProductPackages(PRODUCT_PLUGINS)).map((k) => stagedPkgShort(k)))
    const keyFileNames = new Set(
      KEY_FILES.flatMap((rel) => {
        const hit = /^runtime\/node_modules\/@dsh-forge\/([^/]+)\//.exec(rel)
        return hit === null ? [] : [hit[1]!]
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
      return hit === null ? [] : [hit[1]!]
    }),
  )

  it('staging 集合自动推导：种子（行插件 + 预设携带 + staged:true）∪ @dsh-forge/* 依赖闭包——闭包成员自动入场，新增产品包零配置', () => {
    // 预设携带面真源 = 底稿文件扫描（M1 阶段B 旧包退役后预设零插件携带行——md-mermaid
    // 迁居批 1.2 起 in-preset 行退役转用户层全局行——expert-squad/knowledge 同径）
    expect(presetCarriedPlugins()).toEqual([])
    // 闭包成员自动入场（e791a46 病理：闭包成员漏列致打包形态 ESM 解析断裂——推导制下
    // 结构性消除；path-key 旧包退役归并 lib/path，host dist 静态 import 面改指 lib-path）
    // project = staged:true 覆写种子（1.17 批二卸旧装新：host dist boot 链静态 import 面——
    // 自 plugins/git-worktree 种子迁入；旧包退役）
    // knowledge = userLayerRow 种子（1.9 A5 重开放——用户层全局行 + skills/learn 技能面）
    // lib/* = 闭包成员（plugin-project 1.2/1.6/1.7：core 依赖 lib-util/lib-diag/lib-path/lib-db，
    // 消费方改指后 lib/api 直入闭包（contracts 壳退役收口另批））
    // spec = staged:true 覆写种子（plugin-spec 1.10 docs 域收编：core dist 装配行静态 import
    // @dsh-forge/spec——forgeDocs factory 改指新包，缺席即 boot ESM 解析断裂）
    expect(Object.keys(stagedProductPackages(PRODUCT_PLUGINS)).sort()).toEqual(
      ['core', 'lib/api', 'lib/db', 'lib/diag', 'lib/git', 'lib/path', 'lib/util', 'plugins/expert-squad', 'plugins/knowledge', 'plugins/markdown-kit', 'plugins/spec', 'plugins/task-loop', 'root:plugins/project'].sort(),
    )
  })

  it('closure：预设携带插件 ⊆ staging 集合（发版新增产品插件 → 老用户升级自动补行闭环的 assemble 侧半——预设引用越界即红并报出插件名与来源预设文件）', () => {
    // staged 集合 = stagedProductPackages 推导（userLayerRow/预设种子/staged:true ∪ 闭包 −
    // kill-switch）；预设携带面真源 = 底稿文件逐文件扫描（与 presetCarriedPlugins 同口径，
    // 自扫为取「来源预设文件」用于 fail 报文）。M1 阶段B 后预设零插件携带行（携带面 =
    // stagedProductPackages 推导），本断言守「底稿一旦恢复携带行必须已入 staging 集合」。
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
    expect(orphans, `预设携带插件未入 staging 集合（预设/配置面漂移）：${orphans.join('; ')}`).toEqual([])
  })

  it('bug a1f13abf：声明 dsh.bundle.patch 的插件，组合 patch 文件必随包物化并入 --check 口径（loader 按声明读包内该文件——缺席即 overlay ENOENT）', () => {
    const staged = stagedProductPackages(PRODUCT_PLUGINS)
    // 声明面扫描：packages/*/package.json dsh.bundle.patch 指向的文件 ⊆ staging files
    for (const [dir, files] of Object.entries(staged)) {
      const [rootName, sub] = treeOf(dir)
      const manifest = JSON.parse(
        readFileSync(join(ROOT, rootName, sub, 'package.json'), 'utf8'),
      ) as {
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
    // 现值锚：expert-squad 声明者回归锚——声明面丢失即本断言红
    expect(staged['plugins/expert-squad']).toContain('cordis.patch.yml')
  })

  it('bug a2a54922（G5 约定目录结构扫描）：staged 包源目录含约定资源目录（experts/skills）→ 必在物化 files 集（漏配从人记变机械；skills-blitz 随 plugin-spec 1.9 退役出宇宙）', () => {
    const CONVENTION_DIRS = ['experts', 'skills']
    const staged = stagedProductPackages(PRODUCT_PLUGINS)
    const problems: string[] = []
    for (const [dir, files] of Object.entries(staged)) {
      const [rootName, sub] = treeOf(dir)
      for (const convention of CONVENTION_DIRS) {
        const sourceDir = join(ROOT, rootName, sub, convention)
        if (existsSync(sourceDir) && readdirSync(sourceDir).length > 0 && !files.includes(convention)) {
          problems.push(`packages/${dir}/${convention} 在场但未随包物化（STAGING_EXTRAS 漏列）`)
        }
      }
    }
    expect(problems, problems.join('\n')).toEqual([])
    // 现值锚：内置专家档案按插件域重组（expert-builtin-redistribution）——task-loop 22 档
    // 承接 a2a54922 病理面（plugin-forge 旧包已退役，experts 物化随迁出拆除）
    const taskLoopKey = Object.keys(staged).find((k) => k.endsWith('/task-loop') || k === 'task-loop')
    expect(typeof taskLoopKey, 'task-loop 未入 staging 闭包').toBe('string')
    expect(staged[taskLoopKey!]).toContain('experts')
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
      const dir = pkgDirOf(name)
      const manifest = readJson(pkgManifestRelPath(name, dir)) as { dependencies?: Record<string, string> }
      for (const [dep, version] of Object.entries(manifest.dependencies ?? {})) {
        if (dep.startsWith('@dsh-forge/')) continue
        if (installDeps[dep] === undefined) missing.push(`${name} → ${dep}@${version}`)
        else expect(installDeps[dep], `${dep} 版本漂移（${name} 声明 ${version}）`).toBe(version)
      }
    }
    expect(missing, `staged 插件外部依赖未入 profile.install（安装树缺席即 ERR_MODULE_NOT_FOUND）：${missing.join('; ')}`).toEqual([])
  })

  it('闭包自洽：已 staging 产品包的 @dsh-forge/* 运行时依赖均在场（kill-switch 误伤即红——boot child ESM 解析断裂→双服务灭→forge:* 通道全未注册）', () => {
    // Root cause 实证（安装版 Electron 实测）：core dist import 缺席的闭包成员落空——
    // 历史病理 = staging 硬编码清单漏列闭包成员；推导制下本断言守 kill-switch 不误伤。
    const missing: string[] = []
    for (const name of [...stagedPackages].sort()) {
      // 键可含 workspace 子路径（markdown-kit 居 root 级 plugins/、lib/* 居 lib/——子居所同源映射）
      const dir = pkgDirOf(name)
      const manifest = readJson(pkgManifestRelPath(name, dir)) as { dependencies?: Record<string, string> }
      for (const dep of Object.keys(manifest.dependencies ?? {})) {
        if (dep.startsWith('@dsh-forge/') && !stagedPackages.has(dep.slice('@dsh-forge/'.length))) {
          missing.push(`${name} → ${dep}`)
        }
      }
    }
    expect(missing, `staging 闭包缺口（staged:false kill-switch 误伤依赖成员？）：${missing.join('; ')}`).toEqual([])
  })

  it('闭包成员物化口径完整：package.json + dist 入口双件随包（--check 断言可达；入口路径自各包 manifest main 派生）', () => {
    for (const name of [...stagedPackages].sort()) {
      expect(KEY_FILES, `${name} package.json 口径缺席`).toContain(
        `runtime/node_modules/@dsh-forge/${name}/package.json`,
      )
      // dist 入口 = manifest main 单源（project 包 = dist/host/index.js；其余 = dist/index.js）
      const dir = pkgDirOf(name)
      const manifest = readJson(pkgManifestRelPath(name, dir)) as { main?: string }
      const entry = (manifest.main ?? 'dist/index.js').replace(/^\.\//, '')
      expect(KEY_FILES, `${name} dist 入口口径缺席`).toContain(
        `runtime/node_modules/@dsh-forge/${name}/${entry}`,
      )
    }
  })

  it('knowledge 重开放 pin（knowledge-stage1-foundation 1.9 A5：用户层全局行 + staging 种子随包 + skills/learn 技能面口径）', () => {
    expect(PRODUCT_PLUGINS['knowledge'], 'knowledge 配置应为开（userLayerRow:true + dir 居所声明）').toEqual({ userLayerRow: true, dir: 'plugins/knowledge' })
    expect(stagedPackages.has('knowledge'), 'knowledge 应在场 staging（userLayerRow 种子自动推导）').toBe(true)
    expect(KEY_FILES.some((rel) => rel.includes('@dsh-forge/knowledge')), '关键文件口径应含 knowledge 行（技能面 + dist）').toBe(true)
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

  it('Minor-1 钉死断言：STAGING_EXTRAS 声明集精确 pin（键集 + 代表插件 files/keyFiles 全集）——增删即红（评审 1.17）', () => {
    expect(Object.keys(STAGING_EXTRAS).sort(), 'STAGING_EXTRAS 键集漂移（新增/移除带技能面插件须同步本 pin）').toEqual(['expert-squad', 'knowledge', 'markdown-kit', 'project', 'spec', 'task-loop'])
    expect([...STAGING_EXTRAS['expert-squad'].files].sort(), 'expert-squad files 精确集漂移（experts 内置层已迁出——expert-builtin-redistribution）').toEqual(['cordis.patch.yml', 'skills'])
    expect([...STAGING_EXTRAS['expert-squad'].keyFiles].sort(), 'expert-squad keyFiles 精确集漂移').toEqual(['cordis.patch.yml', 'skills/roundtable/SKILL.md'])
    expect(STAGING_EXTRAS['markdown-kit'], 'markdown-kit 精确集漂移（md-mermaid 迁居批 1.2 改名随迁）').toEqual({ files: ['cordis.patch.yml'], keyFiles: ['cordis.patch.yml'] })
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

  // 【源码内窥锚点】以下 pin 直接断言 scripts/dist-win.mjs 的字面接线（内窥耦合）：
  // pin 找的是 electron-builder 成功之后的末端 --check 段。若 dist-win.mjs 内
  // spawnSync 调用换缩进/换变量名/重排结构导致 pin 失配，请按本注释回到该脚本
  // 的「electron-builder 成功 → 末端 --check 复核」段（现为 47-63 行附近）同步 pin。
  it('接线 pin：dist:win 末端 electron-builder 成功路径调用 --check，失败路径透传退出码 exit 1（bug b9c85cd5）', () => {
    const source = readFileSync(join(ROOT, 'scripts', 'dist-win.mjs'), 'utf8')
    // 成功路径：electron-builder status 为 0 之后才发起末端复核（--check 接线在成功段之后）
    const builderIdx = source.indexOf("spawnSync('pnpm exec electron-builder")
    const checkIdx = source.indexOf('node scripts/assemble-installer-resources.mjs --check')
    expect(builderIdx, 'electron-builder spawn 接线缺席').toBeGreaterThan(-1)
    expect(checkIdx, '末端 --check 接线缺席（封包成功后必须自动关键文件复核，bug b9c85cd5）').toBeGreaterThan(builderIdx)
    // 失败路径：check 非 0 → PACKAGING_CHECK_FAILED + process.exit 透传退出码（exit 1 接线在位）
    const failBranch = source.slice(checkIdx)
    expect(failBranch).toContain('PACKAGING_CHECK_FAILED')
    expect(failBranch).toContain('process.exit(check.status ?? 1)')
  })
})

// bug 539b7413 staged 副本 parity 守卫（stagedManifestParityViolations——版本 + dsh.bundle 对照仓内源）。
// 曾发病理：同名旧壳包（knowledge 旧位 0.30.2 无 dsh 字段）被误物化进安装包 runtime，
// desktop 通道 solo add 经 resolveBundleDir installation-first 读到无 dsh.bundle 副本判
// plain dependency 不进 dsh.profile.bundles——守卫把该类缺陷钉在物化/--check 两道缝。
describe('bug 539b7413 staged 副本 parity 守卫（stagedManifestParityViolations）', () => {
  /** fixture 根：临时目录 + 空 presets 目录 + staged 副本树挂点 */
  const makeFixtureRoot = () => {
    const root = mkdtempSync(join(tmpdir(), 'staging-parity-guard-'))
    mkdirSync(join(root, 'apps/host/src/profile/presets'), { recursive: true })
    return root
  }
  /** fixture 插件源包（userLayerRow 种子）+ staged 副本（默认同版本同 dsh 形状） */
  const makeFixture = (root: string, opts: { sourceDshBundle?: boolean; stagedVersion?: string; stagedDshBundle?: boolean; stagedMissing?: boolean }) => {
    const sourceDir = join(root, 'packages/plugins/fake-plugin')
    mkdirSync(sourceDir, { recursive: true })
    const dshShape = (bundle: boolean) => (bundle ? { bundle: { patch: './cordis.patch.yml' } } : undefined)
    writeFileSync(
      join(sourceDir, 'package.json'),
      JSON.stringify({ name: '@dsh-forge/fake-plugin', version: '0.1.0', ...(opts.sourceDshBundle === false ? {} : { dsh: dshShape(true) }) }),
      'utf8',
    )
    if (opts.stagedMissing !== true) {
      const stagedDir = join(root, 'release/staging/runtime/node_modules/@dsh-forge/fake-plugin')
      mkdirSync(stagedDir, { recursive: true })
      const dsh = opts.sourceDshBundle === false ? undefined : dshShape(opts.stagedDshBundle !== false)
      writeFileSync(
        join(stagedDir, 'package.json'),
        JSON.stringify({ name: '@dsh-forge/fake-plugin', version: opts.stagedVersion ?? '0.1.0', ...(dsh === undefined ? {} : { dsh }) }),
        'utf8',
      )
    }
  }
  const FIXTURE_PLUGINS = { 'fake-plugin': { userLayerRow: true } }
  const nmOf = (root: string) => join(root, 'release/staging/runtime/node_modules')

  it('正例：staged 副本与源同版本同 dsh.bundle → 零违例', () => {
    const root = makeFixtureRoot()
    try {
      makeFixture(root, {})
      expect(stagedManifestParityViolations(FIXTURE_PLUGINS, root, nmOf(root))).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('正例（无 bundle 源）：源不声明 dsh.bundle（纯依赖包如 contracts/core）→ 版本一致即零违例', () => {
    const root = makeFixtureRoot()
    try {
      makeFixture(root, { sourceDshBundle: false })
      expect(stagedManifestParityViolations(FIXTURE_PLUGINS, root, nmOf(root))).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('反例（版本漂移）：staged 副本版本 ≠ 仓内源 → 违例报出双版本（同名旧包遮蔽病理）', () => {
    const root = makeFixtureRoot()
    try {
      makeFixture(root, { stagedVersion: '0.0.9' })
      const violations = stagedManifestParityViolations(FIXTURE_PLUGINS, root, nmOf(root))
      expect(violations.some((p) => p.includes('fake-plugin') && p.includes('0.0.9') && p.includes('0.1.0')), violations.join('; ')).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('反例（dsh.bundle 丢失）：源声明 dsh.bundle 而 staged 副本缺字段 → 违例（plain-dependency 遮蔽病理）', () => {
    const root = makeFixtureRoot()
    try {
      makeFixture(root, { stagedDshBundle: false })
      const violations = stagedManifestParityViolations(FIXTURE_PLUGINS, root, nmOf(root))
      expect(violations.some((p) => p.includes('fake-plugin') && p.includes('dsh.bundle')), violations.join('; ')).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('反例（副本缺席）：staged 副本清单不在场 → 违例报缺席路径', () => {
    const root = makeFixtureRoot()
    try {
      makeFixture(root, { stagedMissing: true })
      const violations = stagedManifestParityViolations(FIXTURE_PLUGINS, root, nmOf(root))
      expect(violations.some((p) => p.includes('fake-plugin') && p.includes('缺席')), violations.join('; ')).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('接线 fail-loud：stage() 与 --check（check()）均消费 parity 守卫', () => {
    const source = readFileSync(join(ROOT, 'scripts', 'assemble-installer-resources.mjs'), 'utf8')
    const first = source.indexOf('assertManifestParity(plugins)')
    expect(first, 'stage() parity 接线缺席').toBeGreaterThan(-1)
    const stageCallSite = source.slice(source.indexOf('async function stage()'), first)
    expect(stageCallSite, 'parity 接线须在 stage() 体内').toContain('async function stage()')
    expect(
      source.indexOf('stagedManifestParityViolations(plugins, ROOT, join(root', first + 1),
      '--check parity 接线缺席',
    ).toBeGreaterThan(-1)
  })
})

// bug 167b5121：NSIS 安装器进程查杀改路径域——installer.nsh 接管 customCheckAppRunning 宏
//（app-builder-lib 模板 CHECK_APP_RUNNING 的 !ifmacrodef 分支），按名全机 taskkill 分支
// 因宏被接管而缺席。真机执行取证受硬禁令约束（GUI 运行期禁 NSIS 静默安装），此 pin 为
// 静态源码锚。
describe('fix-3 bug 167b5121：customCheckAppRunning 路径域查杀（installer.nsh 静态锚）', () => {
  const nsh = readFileSync(join(ROOT, 'build', 'installer.nsh'), 'utf8')

  it('customCheckAppRunning 宏在场 + 查/杀均按 $INSTDIR 路径前缀（Win32_Process Path.StartsWith）', () => {
    expect(nsh).toContain('!macro customCheckAppRunning')
    expect(nsh).toMatch(/Get-CimInstance -ClassName Win32_Process \| \? \{\$\$_\.Path -and \$\$_\.Path\.StartsWith\('\$INSTDIR', 'CurrentCultureIgnoreCase'\)\}\)\.Count -gt 0/)
    expect(nsh).toMatch(/Get-CimInstance -ClassName Win32_Process \| \? \{\$\$_\.Path -and \$\$_\.Path\.StartsWith\('\$INSTDIR', 'CurrentCultureIgnoreCase'\)\} \| % \{ Stop-Process -Id \$\$_\.ProcessId/)
  })

  it('按名查杀分支缺席：无 taskkill /IM、无 IMAGENAME tasklist 匹配（注释提及不算执行面）', () => {
    const code = nsh.replace(/#.*$/gm, '')
    expect(code).not.toContain('taskkill')
    expect(code).not.toContain('IMAGENAME')
  })

  it('PowerShell 不可用即拒绝安装（Quit），不降级按名查杀；getProcessInfo 自备（模板守卫不代劳）', () => {
    expect(nsh).toContain('!include "getProcessInfo.nsh"')
    const macroStart = nsh.indexOf('!macro customCheckAppRunning')
    const psUnavailableBranch = nsh.slice(nsh.lastIndexOf('!macro', macroStart), nsh.indexOf('!macroend', macroStart))
    expect(psUnavailableBranch).toContain('Quit')
  })
})

// bug 0ebcc9f8（167b5121 复发链）根因二查（fix-4，纯静态）：fix-3 静态全绿但真机无效——
// 三疑点裁定：①宏展开时序排除（builder-debug.yml 中 build/installer.nsh include 在全部
// CHECK_APP_RUNNING 插入点之前）；②un 上下文排除（下方 PPO 产物级断言）；③根因成立：
// 真机杀手 = app-builder-lib installUtil.nsh uninstallOldVersion 经 appId 派生 HKCU 卸载键
// 拉起机器注册的旧版卸载器（ExecWait '"$uninstallerFileName" /S ... _?=$installationDir'，
// installSection.nsh:52/56 插入）——旧二进制不受新宏修复约束，静默冒烟安装即对真机 GUI
// 本尊安装目录执行旧卸载器（查杀 + 反卸真机安装）。上游 Function 无宏缝可接管；真机执行
// 取证归 CI/停机窗口。仓内可控面 = 机器复位纪律禁跑卸载器（rmSync 直收）+ 展开产物级锚。
describe('fix-4 bug 0ebcc9f8：展开产物级静态锚（PPO 快照）+ 复位纪律禁跑卸载器', () => {
  // fixture = 14:51 构建最终 NSIS 脚本的 makensis -PPO 展开产物快照（un.checkAppRunning
  // 整段，纯预处理零执行；来源与生成方式见文件头 provenance 注释）
  const ppo = readFileSync(join(ROOT, 'tests', 'structure', 'fixtures', 'nsis-ppo-un-checkAppRunning.nsi'), 'utf8')

  it('展开产物（卸载器上下文）：customCheckAppRunning 本体真实出现在编译后脚本（非源文件级）', () => {
    expect(ppo).toContain('Function un.checkAppRunning')
    expect(ppo).toContain('StrCpy $DshfPsPath "$SYSDIR\\WindowsPowerShell\\v1.0\\powershell.exe"')
    expect(ppo).toContain('Call un._GetProcessInfo') // getProcessInfo BUILD_UNINSTALLER 分支
    expect(ppo).toMatch(/Win32_Process \| \? \{\$\$_\.Path -and \$\$_\.Path\.StartsWith\('\$INSTDIR', 'CurrentCultureIgnoreCase'\)\}\)\.Count -gt 0/)
    expect(ppo).toMatch(/Win32_Process \| \? \{\$\$_\.Path -and \$\$_\.Path\.StartsWith\('\$INSTDIR', 'CurrentCultureIgnoreCase'\)\} \| % \{ Stop-Process -Id \$\$_\.ProcessId/)
  })

  it('展开产物：PowerShell 不可用即 Quit（拒绝降级按名查杀）', () => {
    expect(ppo).toContain('MessageBox MB_OK|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDOK')
    expect(ppo).toMatch(/MessageBox[^\n]*\n\s*Quit/)
  })

  it('展开产物：全段零按名查杀（无 taskkill / IMAGENAME）', () => {
    expect(ppo).not.toContain('taskkill')
    expect(ppo).not.toContain('IMAGENAME')
  })

  it('复位纪律禁跑卸载器：两 e2e spec afterAll 无 Uninstall*.exe /S spawn（rmSync 直收）', () => {
    for (const spec of [
      join(ROOT, 'e2e', 'specs', 'p1mvp', 'installer-smoke.spec.ts'),
      join(ROOT, 'e2e', 'specs', 'blitz', 'probe-installer-composer.spec.ts'),
    ]) {
      const source = readFileSync(spec, 'utf8')
      const afterAll = source.slice(source.indexOf('test.afterAll'), source.indexOf('test.afterAll') + 1_200)
      expect(afterAll, `${spec} afterAll 不得依赖卸载器二进制`).not.toMatch(/Uninstall|uninstaller/)
      expect(afterAll, `${spec} afterAll 须 rmSync 直收`).toContain('rmSync(')
    }
  })

  it('根因留痕：uninstallOldVersion 拉起机器旧卸载器径（上游 installUtil.nsh ExecWait）——模板源级 pin，升版漂移即显性', () => {
    const installUtil = readFileSync(
      join(
        ROOT,
        'node_modules',
        '.pnpm',
        [...readdirSync(join(ROOT, 'node_modules', '.pnpm'))].find((d) => d.startsWith('app-builder-lib@'))!,
        'node_modules',
        'app-builder-lib',
        'templates',
        'nsis',
        'include',
        'installUtil.nsh',
      ),
      'utf8',
    )
    // 上游无宏缝可接管的直接证据：uninstallOldVersion 是 Function（非 custom 宏缝），由
    // installSection 无条件 !insertmacro 调用——app-builder-lib 升级若改此形态，本 pin 失配
    // 提示重估（本轮裁定：26.17.0 下仓内无法静态接管该径）。
    expect(installUtil).toContain('Function uninstallOldVersion')
    expect(installUtil).toMatch(/ExecWait '"\$uninstallerFileName(?:Temp)?" \/S \/KEEP_APP_DATA/)
  })
})
