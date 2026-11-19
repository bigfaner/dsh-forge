// forge npm 通道仓外副本变体构造器（plugin-forge-combo fix-17——bug 63a9a2b8）。
// 根因实锚（fix-17/001-repro 双极性取证）：npm 通道 link: add 不安装 link 目标的依赖
// 闭包——五件成员与外部依赖必须从成员 dist 真实路径经 Node node_modules 上溯解析；
// workspace 源形态绿 = 检出树自身 node_modules 闭包在场（workspace install），仓外
// 副本（raw copy / 1.12 发布树聚合）零闭包 → 五件 entry 解析缺席（boot 面
// ERR_MODULE_NOT_FOUND；兄弟路径 junction 不构成 node_modules 解析闭包）。
// 本构造器 = 修复归属裁定「e2e 支撑件构造方式」：出发布树 + 物化 Node 解析闭包
// （合成 workspace 根清单 union 全量依赖 + pnpm install），可选剥离 forge patch
// config 段（CT-NPM-05 config 缺失回落变体）。验证锚装载/解析行为面（冷启动 Node
// 解析 + boot 装载），不锚物化布局（e2e/support/forge-combo.ts bundleResolutionGaps）。
// run-once CLI：node scripts/build-forge-copy-variant.mjs [--root <dir>] [--out <dir>]
//               [--strip-config] [--no-install]
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { assembleRelease, discoverPackages } from './package-release.mjs'

const REPO_ROOT = join(import.meta.dirname, '..')

/**
 * 副本根级依赖 union（六包源正本 manifests 的 dependencies/devDependencies/
 * peerDependencies 全量并集）：排除闭包键（@dsh-forge/*——由发布树兄弟闭包承载）
 * 与检出树协议 spec（workspace:/file:——仓外不可解析）。devDependencies 必须入
 * union：server bundle 对 @deepseek-ai/* 运行时 external（实锚：copy-agg 无 devDeps
 * 时 project import 缺 @deepseek-ai/dsh-session、expert-squad 缺 dsh-storage-domain）。
 */
export function copyVariantRootDeps(repoRoot) {
  const union = {}
  for (const pkg of discoverPackages(repoRoot)) {
    const manifest = JSON.parse(readFileSync(join(pkg.sourceDir, 'package.json'), 'utf8'))
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
      for (const [name, spec] of Object.entries(manifest[field] ?? {})) {
        if (name.startsWith('@dsh-forge/')) continue
        if (spec.startsWith('workspace:') || spec.startsWith('file:')) continue
        union[name] = spec
      }
    }
  }
  return Object.fromEntries(Object.entries(union).sort(([a], [b]) => (a < b ? -1 : 1)))
}

/**
 * 剥离 cordis.patch.yml 五条 insert 行的 config 段（CT-NPM-05 变体——裸名插行与
 * 五件装载面原样，仅去除 patch config 下发）。缩进机械判据：`config:` 行及其更深
 * 缩进的后继行（含 !!js 折叠块）整段移除，下一同级缩进行起保留。
 */
export function stripPatchConfig(patchText) {
  const lines = patchText.split(/\r?\n/)
  const indentOf = (line) => line.match(/^(\s*)/)[1].length
  const out = []
  let skipIndent = -1
  for (const line of lines) {
    if (skipIndent >= 0) {
      if (line.trim() === '' || indentOf(line) > skipIndent) continue
      skipIndent = -1
    }
    const m = line.match(/^(\s*)config:\s*$/)
    if (m !== null) {
      skipIndent = m[1].length
      continue
    }
    out.push(line)
  }
  return out.join('\n')
}

/**
 * 仓外副本变体组装：出聚合发布树（--no-zip 语义）→ 可选 strip-config 变体改写 →
 * 合成 workspace 根（pnpm-workspace.yaml + union 根清单）→ pnpm install 物化解析
 * 闭包（装机可离线失败面：installOk=false 时调用侧 fail-loud）。
 */
export function assembleCopyVariant({ repoRoot = REPO_ROOT, outDir, stripPatchConfig: strip = false, install = true } = {}) {
  if (outDir === undefined) throw new Error('assembleCopyVariant：outDir 必填（仓外副本目标目录）')
  const { treeDir } = assembleRelease({ repoRoot, outDir, zip: false })
  const packages = discoverPackages(repoRoot)
  const memberIds = packages.slice(1).map((p) => p.name.slice('@dsh-forge/'.length))
  writeFileSync(
    join(treeDir, 'pnpm-workspace.yaml'),
    `packages:\n  - forge\n${memberIds.map((id) => `  - '${id}'`).join('\n')}\n`,
  )
  writeFileSync(
    join(treeDir, 'package.json'),
    `${JSON.stringify({ name: 'forge-copy-variant', private: true, dependencies: copyVariantRootDeps(repoRoot), pnpm: { onlyBuiltDependencies: ['better-sqlite3'] } }, null, 2)}\n`,
  )
  if (strip) {
    const patchPath = join(treeDir, 'forge', 'cordis.patch.yml')
    writeFileSync(patchPath, stripPatchConfig(readFileSync(patchPath, 'utf8')))
  }
  let installStatus
  if (install) {
    const run = spawnSync('pnpm install', { cwd: treeDir, encoding: 'utf8', windowsHide: true, shell: process.platform === 'win32' })
    const stderr = `${run.stdout ?? ''}\n${run.stderr ?? ''}`
    // IGNORED_BUILDS 非净收容忍：better-sqlite3 走 in-package prebuilds（win32/darwin/
    // linux 全平台在场），构建脚本缺席不影响运行期装载（fix-17/001-repro GREEN 取证同径）。
    const ignoredBuilds = /ERR_PNPM_IGNORED_BUILDS|Ignored build scripts/.test(stderr)
    if (run.status !== 0 && !ignoredBuilds) {
      installStatus = { exitCode: run.status, stderr: stderr.slice(-800) }
    } else {
      installStatus = { exitCode: 0, stderr: ignoredBuilds ? 'ignored-builds tolerated (prebuilds in package)' : '' }
    }
  }
  return { copyDir: treeDir, forgeDir: join(treeDir, 'forge'), manifestPath: join(treeDir, 'manifest.json'), installStatus }
}

function main(argv) {
  const flag = (name) => {
    const i = argv.indexOf(name)
    return i === -1 ? undefined : argv[i + 1]
  }
  const repoRoot = flag('--root') !== undefined ? resolve(flag('--root')) : REPO_ROOT
  const outDir = flag('--out')
  const strip = argv.includes('--strip-config')
  const install = !argv.includes('--no-install')
  const { copyDir, forgeDir, installStatus } = assembleCopyVariant({ repoRoot, outDir, stripPatchConfig: strip, install })
  console.log(`[forge-copy-variant] 副本出树：${copyDir}`)
  console.log(`[forge-copy-variant] forge 条目：${forgeDir}（strip-config=${String(strip)}）`)
  if (installStatus !== undefined) {
    if (installStatus.exitCode !== 0) {
      console.error(`[forge-copy-variant] pnpm install 未净收（exit ${installStatus.exitCode}）——检查 IGNORED_BUILDS 提示（prebuilds 在场即可用）stderr=${installStatus.stderr}`)
      process.exit(1)
    }
    console.log('[forge-copy-variant] 解析闭包物化完成（pnpm install）')
  }
}

const isCli = process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replaceAll('\\', '/')}`).href
if (isCli) main(process.argv.slice(2))
