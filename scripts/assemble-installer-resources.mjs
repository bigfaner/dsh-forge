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
 *                             真实拷贝（packages/{contracts,core,knowledge} 的 package.json+dist）
 *       host-dist/            apps/host/dist 拷贝——boot child 真实文件入口（ELECTRON_RUN_AS_NODE
 *                             派生进程无法读 asar；且 ESM 解析沿目录上溯，host-dist 须与
 *                             node_modules 同容器相邻——run.ts resolveChildEntry 消费）
 *     web-dist/               apps/web/dist（壳静态资产）
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
const PRODUCT_PACKAGES = ['contracts', 'core', 'knowledge']
/** 产品插件物化内容（源 = packages/<name>）：清单 + 说明 + 构建产物（不携带 src/测试） */
const PRODUCT_PACKAGE_FILES = ['package.json', 'README.md', 'dist']

/** --check 断言的安装包关键文件（resources 相对路径；4.3 冒烟对安装后 resources 同口径复用） */
export const REQUIRED_KEY_FILES = [
  'runtime/package.json',
  'web-dist/index.html',
  'icon.png',
  'app/main.js',
  'app/package.json',
  'runtime/host-dist/main.js',
  'runtime/host-dist/boot/child.js',
  'runtime/node_modules/@deepseek-ai/dsh/package.json',
  'runtime/node_modules/@deepseek-ai/dsh-base/package.json',
  'runtime/node_modules/@deepseek-ai/dsh-web-app/package.json',
  'runtime/node_modules/@dsh-forge/contracts/package.json',
  'runtime/node_modules/@dsh-forge/contracts/dist/index.js',
  'runtime/node_modules/@dsh-forge/core/package.json',
  'runtime/node_modules/@dsh-forge/core/dist/index.js',
  'runtime/node_modules/@dsh-forge/knowledge/package.json',
  'runtime/node_modules/@dsh-forge/knowledge/dist/index.js',
  'runtime/node_modules/better-sqlite3/package.json',
  'runtime/node_modules/better-sqlite3/prebuilds/win32-x64.node',
]

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

/** 物化前置：workspace 构建产物 + 打包安装树就位（错即停，提示补救命令）。 */
function assertPreconditions() {
  const wants = [
    [join(ROOT, 'apps/host/dist/main.js'), 'pnpm build（tsc -b 全拓扑）'],
    [join(ROOT, 'apps/host/dist/boot/child.js'), 'pnpm build（tsc -b 全拓扑）'],
    [join(ROOT, 'apps/web/dist/index.html'), 'pnpm build（vite 壳 dist）'],
    [join(ROOT, 'packages/contracts/dist/index.js'), 'pnpm build（tsc -b 全拓扑）'],
    [join(ROOT, 'packages/core/dist/index.js'), 'pnpm build（tsc -b 全拓扑）'],
    [join(ROOT, 'packages/knowledge/dist/index.js'), 'pnpm build（tsc -b 全拓扑）'],
    [join(INSTALL_NM, '@deepseek-ai/dsh/package.json'), 'pnpm -C apps/host/profile.install install'],
    [join(INSTALL_NM, '@deepseek-ai/dsh-base/package.json'), 'pnpm -C apps/host/profile.install install'],
    [join(INSTALL_NM, '@deepseek-ai/dsh-web-app/package.json'), 'pnpm -C apps/host/profile.install install'],
    [join(INSTALL_NM, 'better-sqlite3/prebuilds/win32-x64.node'), 'pnpm -C apps/host/profile.install install（prebuilds 随包分发，缺席即包损坏）'],
    [join(ROOT, 'build', 'icon.png'), 'node tmp-ui-review/gen-whale-brand-v3.mjs --emit icon（fix-45 应用图标——窗口图标打包形态随包）'],
  ]
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

function stage() {
  assertPreconditions()
  const rootVersion = readJson(join(ROOT, 'package.json'), 'root manifest').version ?? '0.0.0'
  const installManifest = readJson(join(ROOT, 'apps/host/profile.install/package.json'), 'profile.install manifest')
  const productVersions = {}
  for (const name of PRODUCT_PACKAGES) {
    const manifest = readJson(join(ROOT, 'packages', name, 'package.json'), `packages/${name} manifest`)
    productVersions[`@dsh-forge/${name}`] = manifest.version ?? '0.0.0'
  }

  rmSync(STAGING, { recursive: true, force: true })
  rmSync(APP_DIR, { recursive: true, force: true })
  mkdirSync(join(RUNTIME, 'node_modules'), { recursive: true })

  // 1) 运行时树：profile.install hoisted 全量真实文件（@dsh-forge 不在其中安装——
  //    见其 package.json description），叠加产品插件真实拷贝
  const sections = {}
  copyTree(INSTALL_NM, join(RUNTIME, 'node_modules'))
  mkdirSync(join(RUNTIME, 'node_modules', '@dsh-forge'), { recursive: true })
  for (const name of PRODUCT_PACKAGES) {
    const dest = join(RUNTIME, 'node_modules', '@dsh-forge', name)
    mkdirSync(dest, { recursive: true })
    for (const file of PRODUCT_PACKAGE_FILES) {
      const source = join(ROOT, 'packages', name, file)
      // README.md 等文档件可选（contracts 无 README——携带与否不影响运行）
      if (file !== 'package.json' && file !== 'dist' && !existsSync(source)) continue
      if (!existsSync(source)) fail(`${source} 未就位 —— 先执行：pnpm build`)
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

  // 6) 关键文件自证 + manifest 落盘
  const problems = checkKeyFiles(STAGING, join(APP_DIR))
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
    + sections.appLoader.files + sections.icon.files
  console.log(`STAGE_OK files=${totalFiles} manifest=release/staging/staging-manifest.json`)
}

function statFileSync(path) {
  if (!existsSync(path)) return { present: false }
  const stat = statSync(path)
  return { present: true, bytes: stat.size }
}

/** --check：对 staging（或安装后 resources 目录，经位置参数传入）断言关键文件。
 *  app/* 条目解析到 appDistRoot——staging 形态 = release/app（同级），安装形态 = {root}/app。 */
function checkKeyFiles(root, appDistRoot) {
  const problems = []
  for (const rel of REQUIRED_KEY_FILES) {
    const path = rel.startsWith('app/') ? join(appDistRoot, rel.slice('app/'.length)) : join(root, rel)
    if (!existsSync(path)) problems.push(rel)
  }
  return problems
}

function check(root = STAGING, appDistRoot = join(ROOT, 'release', 'app')) {
  const problems = checkKeyFiles(root, appDistRoot)
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

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.check) {
    // 默认对 release/staging 自校验；位置参数 = 安装后 resources 根（4.3 冒烟复用）
    if (args.root !== undefined) check(args.root, join(args.root, 'app'))
    else check()
  } else stage()
}

// CLI 直跑才执行（被 vitest 结构测试 import 时仅取导出，无副作用）
if (process.argv[1] === fileURLToPath(import.meta.url)) main()
