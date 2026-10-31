#!/usr/bin/env node
/**
 * assemble-installer-resources.mjs — 4.1 安装包资源物化（M1 assemble-app-resources 模式继承）。
 *
 * 将安装包运行时自足资源物化到 release/staging/，electron-builder
 * （electron-builder.config.mjs）以 extraResources（filter: runtime/** 等显式清单）
 * 整体嵌入安装包：
 *
 *   release/staging/
 *     runtime/                运行时容器（node_modules 嵌一层——electron-builder 拷贝
 *                             filter 硬编码剔除拷贝源根级 node_modules，M1 同款嵌套规避）
 *       package.json          运行时合成 anchor 清单（并集 deps）——打包形态 installAnchor
 *                             （resolveHostPaths：{resources}/runtime/package.json）；
 *                             dsh-app-boot resolution BFS 以它为根遍历出全量 entries
 *       node_modules/         完整 hoisted 真实文件运行时树（源 = apps/host/profile.install，
 *                             autoInstallPeers: true 补全 peer-only 包）+ @dsh-forge/* 产品插件
 *                             真实拷贝（成员 = contracts PRODUCT_PLUGINS staged 门配置派生——
 *                             knowledge 暂不含：知识库功能不完整，打包形态不开放）
 *       host-dist/            apps/host/dist 拷贝——boot child 真实文件入口（ELECTRON_RUN_AS_NODE
 *                             派生进程无法读 asar；且 ESM 解析沿目录上溯，host-dist 须与
 *                             node_modules 同容器相邻——run.ts resolveChildEntry 消费）
 *     web-dist/               apps/web/dist 拷贝（壳静态资产）
 *     mobile-dist/            apps/mobile/dist 拷贝（/remote 移动视图静态资产——
 *                             resolveMobileDistDir 打包形态默认 {resources}/mobile-dist）
 *     icon.png                窗口图标（fix-45——BrowserWindow icon 打包形态解析位）
 *     staging-manifest.json   物化清单（节文件数/字节 + 关键文件自证 + sqlite prebuild 证据）
 *   release/app/              electron-builder 应用目录（asar: false）：main.js 装载器
 *                             （apps/host/installer/app-loader.mjs）+ deps-free package.json
 *                             ——宿主 dist 运行期 import @dsh-forge/contracts（6 处），
 *                             真实 main 须在 runtime/host-dist（node_modules 解析邻接）
 *
 * 产物含 4.3 冒烟脚本挂点：staging-manifest.json 随包分发（resources/ 下可直接校验），
 * 且 --check 模式可对安装后 resources 目录做同一套关键文件断言。
 *
 * Usage:
 *   node scripts/assemble-installer-resources.mjs                    # 全量物化（先 rm 再拷，确定性）
 *   node scripts/assemble-installer-resources.mjs --check            # 只校验 release/staging（退出码 0/1）
 *   node scripts/assemble-installer-resources.mjs --check <resources-dir>  # 对安装后 resources 根同口径校验（4.3）
 *
 * Exit 0 成功；1 前置缺失/校验失败；2 参数错。
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const STAGING = join(ROOT, 'release', 'staging')
const RUNTIME = join(STAGING, 'runtime')
const APP_DIR = join(ROOT, 'release', 'app')
const INSTALL_NM = join(ROOT, 'apps', 'host', 'profile.install', 'node_modules')
/**
 * 产品插件物化 = 配置意图开关 + 自动推导（单一源 = @dsh-forge/contracts
 * PRODUCT_PLUGINS——本脚本零硬编码插件清单，新增产品包零配置）：
 *   staging 集合 = 种子（userLayerRow 插件 ∪ 预设底稿携带插件 ∪ staged:true 覆写）
 *   的 @dsh-forge/* 运行时依赖闭包（packages/<dir>/package.json BFS），剔除
 *   staged:false kill-switch。contracts/path-key 等闭包成员自动随包——「忘列」
 *   类缺陷（e791a46 path-key）结构性消除。
 * 每包必物化内容（源 = packages/<dir>）：清单 + 构建产物（不携带 src/测试）；
 * 带技能面的插件另携 skills/——customSkillDirs 物理挂载源（boot overlay 注
 * skill-filesystem 行），缺席即技能面静默缺失，故必物化 fail-loud（STAGING_EXTRAS）。
 * README.md 全员可选（contracts 无 README——携带与否不影响运行）。
 * 现值注记：knowledge kill-switch——知识库功能不完整，打包形态暂不开放（dev 形态
 * profile.dev 仍含；重开放 = 改 contracts PRODUCT_PLUGINS）。
 * 守护测试：tests/structure/installer-pipeline.test.ts staging 闭包段。
 */
/** 带技能面插件的附加物化/口径（键 = 包短名；skills = 技能面物化 + 关键文件；
 *  skills-blitz = plugin-forge 包内突击专属技能旁目录——blitz 预设 customSkillDirs 挂载源） */
const STAGING_EXTRAS = {
  // plugin-forge experts/ = 内置专家档案层（FORGE_EXPERTS_ROOT_DIR 相对 dist 解析——
  // 缺席即安装版专家团零 forge 档案，bug a2a54922；随包覆盖由 a2a54922 约定目录扫描守卫）
  'plugin-forge': { files: ['skills', 'skills-blitz', 'experts'], keyFiles: ['skills/submit-task/SKILL.md', 'skills-blitz/grilling/SKILL.md', 'experts/feature-builder.md'] },
  'plugin-forge-spec': { files: ['skills'], keyFiles: ['skills/write-prd/SKILL.md'] },
  // expert-squad 内置专家层目录（scan.ts resolvePluginExpertsRoot 相对 dist 的
  // ../../experts 解析；bundle-structure 测试钉「随包 ≥1 档案」——缺席即内置层静默缺失）
  // + 组合装配行本体 cordis.patch.yml（package.json dsh.bundle.patch 声明指向——loader
  // 按声明读包内该文件触发 apply 注册，缺席即 ENOENT，bug a1f13abf）
  'expert-squad': { files: ['experts', 'cordis.patch.yml'], keyFiles: ['experts/code-reviewer.md', 'cordis.patch.yml'] },
}
const PRODUCT_OPTIONAL_FILES = ['README.md']

/** 包短名 → packages/ 子路径（平铺优先；plugins/ 子居所探测——md-mermaid 先例；缺席 undefined） */
function packageDirOf(root, short) {
  if (existsSync(join(root, 'packages', short, 'package.json'))) return short
  if (existsSync(join(root, 'packages', 'plugins', short, 'package.json'))) return `plugins/${short}`
  return undefined
}

/** 预设底稿携带插件（apps/host/src/profile/presets/*.patch.yml `name: '@dsh-forge/<短名>'` 行扫描——预设组合装载面真源） */
export function presetCarriedPlugins(root = ROOT) {
  const dir = join(root, 'apps', 'host', 'src', 'profile', 'presets')
  const names = new Set()
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.yml')) continue
    for (const hit of readFileSync(join(dir, file), 'utf8').matchAll(/'@dsh-forge\/([a-z0-9-]+)'/g)) names.add(hit[1])
  }
  return [...names].sort()
}

/**
 * staging 插件物化清单（自动推导，key = packages/ 子路径 → 必物化文件集）：
 * 种子 = userLayerRow 插件 ∪ 预设携带插件 ∪ staged:true 覆写 → @dsh-forge/* 依赖
 * 闭包 BFS → 剔除 staged:false。插件缺席 packages/ 树（配置误写/包未建）= fail-loud。
 */
export function stagedProductPackages(plugins, root = ROOT) {
  const seeds = new Set(
    Object.entries(plugins)
      .filter(([, toggle]) => toggle.userLayerRow || toggle.staged === true)
      .map(([name]) => name),
  )
  for (const name of presetCarriedPlugins(root)) seeds.add(name)
  const stagedDirs = new Map() // packages 子路径 → 短名
  const queue = [...seeds]
  while (queue.length > 0) {
    const short = queue.shift()
    if ([...stagedDirs.values()].includes(short)) continue
    const dir = packageDirOf(root, short)
    if (dir === undefined) {
      if (Object.hasOwn(plugins, short) && plugins[short].staged === true) {
        fail(`PRODUCT_PLUGINS staged:true 覆写指向缺席的包：packages/${short}（或 packages/plugins/${short}）不存在`)
      }
      continue // 预设/依赖扫描到的非包名（如已被 kill-switch 的引用目标）静默跳过
    }
    stagedDirs.set(dir, short)
    const manifest = JSON.parse(readFileSync(join(root, 'packages', dir, 'package.json'), 'utf8'))
    for (const dep of Object.keys(manifest.dependencies ?? {})) {
      if (dep.startsWith('@dsh-forge/')) queue.push(dep.slice('@dsh-forge/'.length))
    }
  }
  const out = {}
  for (const [dir, short] of [...stagedDirs].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (Object.hasOwn(plugins, short) && plugins[short].staged === false) continue // kill-switch
    out[dir] = ['package.json', 'dist', ...(STAGING_EXTRAS[short]?.files ?? [])]
  }
  return out
}

/**
 * --check 断言的安装包关键文件（resources 相对路径；4.3 冒烟对安装后 resources 同口径
 * 复用）。插件条目 = stagedProductPackages 推导：package.json + dist 入口 +
 * STAGING_EXTRAS 附加关键文件（技能面）。
 */
export function requiredKeyFiles(plugins) {
  const files = [
    'runtime/package.json',
    'web-dist/index.html',
    'mobile-dist/index.html',
    'icon.png',
    'app/main.js',
    'app/package.json',
    'runtime/host-dist/main.js',
    'runtime/host-dist/boot/child.js',
    'runtime/node_modules/@deepseek-ai/dsh/package.json',
    'runtime/node_modules/@deepseek-ai/dsh-base/package.json',
    'runtime/node_modules/@deepseek-ai/dsh-web-app/package.json',
    'runtime/node_modules/better-sqlite3/package.json',
    'runtime/node_modules/better-sqlite3/prebuilds/win32-x64.node',
  ]
  for (const [dir] of Object.entries(stagedProductPackages(plugins))) {
    const short = dir.split('/').pop()
    files.push(
      `runtime/node_modules/@dsh-forge/${short}/package.json`,
      `runtime/node_modules/@dsh-forge/${short}/dist/index.js`,
      ...(STAGING_EXTRAS[short]?.keyFiles ?? []).map((f) => `runtime/node_modules/@dsh-forge/${short}/${f}`),
    )
  }
  return files
}

/** 产品插件启停配置装载（单一源 = contracts dist；前置 = pnpm build——本就 fail-loud 前置） */
async function loadProductPlugins() {
  try {
    const contracts = await import('../packages/contracts/dist/index.js')
    if (contracts.PRODUCT_PLUGINS === undefined) throw new Error('PRODUCT_PLUGINS 未导出')
    return contracts.PRODUCT_PLUGINS
  } catch (cause) {
    fail(`产品插件配置装载失败（packages/contracts/dist——先执行：pnpm build（tsc -b 全拓扑））：${String(cause)}`)
  }
}

export function parseArgs(argv) {
  const args = { check: false, root: undefined }
  for (const arg of argv) {
    if (arg === '--check') args.check = true
    else if (args.check && args.root === undefined) args.root = resolve(arg)
    else {
      console.error(`Unknown argument: ${arg}`)
      process.exit(2)
    }
  }
  return args
}

/** 合成运行时 anchor 清单：profile.install deps（官方栈并集）∪ @dsh-forge/*（真实版本号）。 */
export function buildRuntimeAnchorManifest(installManifest, productVersions, rootVersion) {
  const dependencies = { ...installManifest.dependencies }
  for (const [name, version] of Object.entries(productVersions)) dependencies[name] = version
  return {
    name: 'dsh-forge-runtime',
    private: true,
    // Root cause (bug f27619a2)：同容器 host-dist/ 全为 ESM（tsc 产物），缺席 type 字段
    // 使 Node 先按 CJS 解析失败再重解析——每启 MODULE_TYPELESS 警告（error 级）+ 双解析开销。
    type: 'module',
    version: rootVersion,
    description:
      'dsh-forge packaged runtime anchor (synthetic dsh installation manifest; drives dsh-app-boot resolution BFS — see scripts/assemble-installer-resources.mjs).',
    dependencies: Object.fromEntries(Object.entries(dependencies).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
  }
}

/** electron-builder 应用目录清单：deps-free + main = 装载器（真实 main 在 runtime/host-dist）。 */
export function buildAppManifest(rootVersion) {
  return {
    name: 'dsh-forge',
    productName: 'dsh-forge',
    author: 'dsh-forge', // electron-builder 必填校验面（缺失仅告警，补齐消除）
    version: rootVersion,
    private: true,
    type: 'module',
    description:
      'dsh-forge host app loader entry (real main + runtime tree + web dist ship as extraResources under resources/runtime).',
    main: 'main.js',
  }
}

function readJson(path, what) {
  if (!existsSync(path)) {
    fail(`missing ${what}: ${path}`)
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    fail(`unreadable ${what}: ${path}: ${String(error)}`)
  }
}

function fail(message) {
  console.error(`ASSEMBLE FAILED: ${message}`)
  process.exit(1)
}

/** 物化前置：workspace 构建产物 + 打包安装树就位（错即停，提示补救命令）。
 *  插件产物前置 = stagedProductPackages 派生（dist 入口 + STAGING_EXTRAS 关键文件——
 *  配置翻转后前置面随之增减，无硬编码插件行）。 */
function assertPreconditions(plugins) {
  const wants = [
    [join(ROOT, 'apps/host/dist/main.js'), 'pnpm build（tsc -b 全拓扑）'],
    [join(ROOT, 'apps/host/dist/boot/child.js'), 'pnpm build（tsc -b 全拓扑）'],
    [join(ROOT, 'apps/web/dist/index.html'), 'pnpm build（vite 壳 dist）'],
    [join(ROOT, 'apps/mobile/dist/index.html'), 'pnpm build:mobile（/remote 移动视图 dist——打包形态物化到 {resources}/mobile-dist）'],
    [join(INSTALL_NM, '@deepseek-ai/dsh/package.json'), 'pnpm -C apps/host/profile.install install'],
    [join(INSTALL_NM, '@deepseek-ai/dsh-base/package.json'), 'pnpm -C apps/host/profile.install install'],
    [join(INSTALL_NM, '@deepseek-ai/dsh-web-app/package.json'), 'pnpm -C apps/host/profile.install install'],
    [join(INSTALL_NM, 'better-sqlite3/prebuilds/win32-x64.node'), 'pnpm -C apps/host/profile.install install（prebuilds 随包分发，缺席即包损坏）'],
    [join(ROOT, 'build', 'icon.png'), 'node tmp-ui-review/gen-whale-brand-v3.mjs --emit icon（fix-45 应用图标——窗口图标打包形态随包）'],
  ]
  for (const [key, files] of Object.entries(stagedProductPackages(plugins))) {
    wants.push([join(ROOT, 'packages', key, 'dist', 'index.js'), `pnpm build（tsc -b 全拓扑——packages/${key} staged 插件产物）`])
    for (const file of files.filter((f) => f !== 'dist' && f !== 'package.json')) {
      wants.push([join(ROOT, 'packages', key, file), `packages/${key} 技能面（customSkillDirs 挂载源——缺席即技能面静默缺失）`])
    }
  }
  for (const [path, remedy] of wants) if (!existsSync(path)) fail(`${path} 未就位 —— 先执行：${remedy}`)
}

/** 拷贝一棵子树并返回文件数/字节（供 manifest 记账）。 */
function copyTree(source, destination) {
  cpSync(source, destination, { recursive: true, dereference: true })
  return measureTree(destination)
}

function measureTree(root) {
  const stat = statSync(root)
  if (stat.isFile()) return { files: 1, bytes: stat.size }
  let files = 0
  let bytes = 0
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile()) {
        files += 1
        bytes += statSync(path).size
      }
    }
  }
  visit(root)
  return { files, bytes }
}

async function stage() {
  const plugins = await loadProductPlugins()
  assertPreconditions(plugins)
  const productPackages = stagedProductPackages(plugins)
  const rootVersion = readJson(join(ROOT, 'package.json'), 'root manifest').version ?? '0.0.0'
  const installManifest = readJson(join(ROOT, 'apps/host/profile.install/package.json'), 'profile.install manifest')
  const productVersions = {}
  for (const name of Object.keys(productPackages)) {
    // 键可含 packages/ 子路径（plugins/md-mermaid）——dest/版本键取 basename 短名
    const short = name.split('/').pop()
    const manifest = readJson(join(ROOT, 'packages', name, 'package.json'), `packages/${name} manifest`)
    productVersions[`@dsh-forge/${short}`] = manifest.version ?? '0.0.0'
  }

  // Windows 删除竞态（本机实证）：rmSync 递归删数万文件 staging 树偶发 ENOTEMPTY
  // （瞬时句柄——Defender/索引器延迟释放；Z: 非 NTFS 本地盘时更频发）。Node 文档
  // 明示 maxRetries/retryDelay 专治 Windows 上 ENOTEMPTY/EBUSY/EPERM，故两处
  // 清场调用统一带重试，否则每次重打包都会在首行清场即崩。
  const rmOptions = { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }
  rmSync(STAGING, rmOptions)
  rmSync(APP_DIR, rmOptions)
  mkdirSync(join(RUNTIME, 'node_modules'), { recursive: true })

  // 1) 运行时树：profile.install hoisted 全量真实文件（@dsh-forge 不在其中安装——
  //    见其 package.json description），叠加产品插件真实拷贝（每包必物化集 + 可选 README）
  const sections = {}
  copyTree(INSTALL_NM, join(RUNTIME, 'node_modules'))
  mkdirSync(join(RUNTIME, 'node_modules', '@dsh-forge'), { recursive: true })
  for (const [key, requiredFiles] of Object.entries(productPackages)) {
    const short = key.split('/').pop()
    const dest = join(RUNTIME, 'node_modules', '@dsh-forge', short)
    mkdirSync(dest, { recursive: true })
    for (const file of [...requiredFiles, ...PRODUCT_OPTIONAL_FILES]) {
      const source = join(ROOT, 'packages', key, file)
      if (!existsSync(source)) {
        if (requiredFiles.includes(file)) fail(`${source} 未就位 —— 先执行：pnpm build`)
        continue // 可选件（README.md 等）缺席静默跳过
      }
      cpSync(source, join(dest, file), { recursive: true, dereference: true })
    }
  }
  sections.runtimeNodeModules = measureTree(join(RUNTIME, 'node_modules'))

  // 2) 合成 anchor 清单（installAnchor = {resources}/runtime/package.json）
  const anchor = buildRuntimeAnchorManifest(installManifest, productVersions, rootVersion)
  writeFileSync(join(RUNTIME, 'package.json'), `${JSON.stringify(anchor, null, 2)}\n`, 'utf8')

  // 3) boot child 真实文件入口（与 node_modules 同容器——ESM 上溯解析邻接；见文件头注记）
  sections.hostDist = copyTree(join(ROOT, 'apps/host/dist'), join(RUNTIME, 'host-dist'))

  // 4) 壳 dist
  sections.webDist = copyTree(join(ROOT, 'apps/web/dist'), join(STAGING, 'web-dist'))

  // 4a) /remote 移动视图 dist（bug：打包产物缺席 mobile-dist——resolveMobileDistDir 打包
  //     形态默认 {resources}/mobile-dist，缺席即 host 落 mobile-dist-missing 提示页。
  //     与 web-dist 同构物化；前置已 assert apps/mobile/dist/index.html）
  sections.mobileDist = copyTree(join(ROOT, 'apps/mobile/dist'), join(STAGING, 'mobile-dist'))

  // 4b) 窗口图标（fix-45）：build/icon.png 归位 resources 根——BrowserWindow icon 打包
  //     形态解析位（resolveWindowIconPath {resources}/icon.png）。实测裁决注记：Windows
  //     exe 内嵌图标（electron-builder win.icon）已覆盖任务栏/Alt-Tab，此物化服务窗口
  //     标题栏与运行期 BrowserWindow icon 兜底——两口径同源 build/ 单源
  sections.icon = copyTree(join(ROOT, 'build', 'icon.png'), join(STAGING, 'icon.png'))

  // 5) electron-builder 应用目录（asar: false；deps-free）：装载器 + 清单——真实 main
  //    在 runtime/host-dist（宿主 dist 运行期 import @dsh-forge/contracts，须与
  //    node_modules 同容器；见 apps/host/installer/app-loader.mjs 注记）
  const loader = join(ROOT, 'apps/host/installer/app-loader.mjs')
  if (!existsSync(loader)) fail(`${loader} 未就位（安装包应用装载器）`)
  cpSync(loader, join(APP_DIR, 'main.js'))
  writeFileSync(join(APP_DIR, 'package.json'), `${JSON.stringify(buildAppManifest(rootVersion), null, 2)}\n`, 'utf8')
  sections.appLoader = { files: 1, bytes: statSync(loader).size }

  // 6) 关键文件自证 + manifest 落盘（口径 = requiredKeyFiles(plugins) 配置派生）
  const problems = checkKeyFiles(STAGING, join(APP_DIR), requiredKeyFiles(plugins))
  const manifest = {
    generatedAt: new Date().toISOString(),
    sections,
    sqlitePrebuild: statFileSync(join(RUNTIME, 'node_modules/better-sqlite3/prebuilds/win32-x64.node')),
    keyFilesOk: problems.length === 0,
  }
  writeFileSync(join(STAGING, 'staging-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  if (problems.length > 0) {
    fail(`staging 关键文件缺失（物化后自证失败）：${problems.join('; ')}`)
  }
  const totalFiles =
    sections.runtimeNodeModules.files + sections.hostDist.files + sections.webDist.files
    + sections.mobileDist.files + sections.appLoader.files + sections.icon.files
  console.log(`STAGE_OK files=${totalFiles} manifest=release/staging/staging-manifest.json`)
}

function statFileSync(path) {
  if (!existsSync(path)) return { present: false }
  const stat = statSync(path)
  return { present: true, bytes: stat.size }
}

/** --check：对 staging（或安装后 resources 目录，经位置参数传入）断言关键文件。
 *  app/* 条目解析到 appDistRoot——staging 形态 = release/app（同级），安装形态 = {root}/app。 */
function checkKeyFiles(root, appDistRoot, keyFiles) {
  const problems = []
  for (const rel of keyFiles) {
    const path = rel.startsWith('app/') ? join(appDistRoot, rel.slice('app/'.length)) : join(root, rel)
    if (!existsSync(path)) problems.push(rel)
  }
  return problems
}

async function check(root = STAGING, appDistRoot = join(ROOT, 'release', 'app')) {
  const problems = checkKeyFiles(root, appDistRoot, requiredKeyFiles(await loadProductPlugins()))
  if (problems.length > 0) {
    console.error(`CHECK FAILED: ${problems.join('; ')}`)
    process.exit(1)
  }
  const manifestPath = join(root, 'staging-manifest.json')
  if (existsSync(manifestPath)) {
    const saved = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (saved.keyFilesOk !== true) {
      console.error('CHECK FAILED: staging-manifest.json 记录 keyFilesOk != true')
      process.exit(1)
    }
    console.log(`STAGING_CHECK_OK generatedAt=${saved.generatedAt} sqlitePrebuild=${saved.sqlitePrebuild.bytes}B`)
    return
  }
  console.log('STAGING_CHECK_OK (no manifest — external resources root)')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.check) {
    // 默认对 release/staging 自校验；位置参数 = 安装后 resources 根（4.3 冒烟复用）
    if (args.root !== undefined) await check(args.root, join(args.root, 'app'))
    else await check()
  } else await stage()
}

// CLI 直跑才执行（被 vitest 结构测试 import 时仅取导出，无副作用）
if (process.argv[1] === fileURLToPath(import.meta.url)) void main()
