// 聚合打包发布流水线（plugin-forge-combo 1.12——G1 打包门；forge-aggregate-bundle 1.7
// bundle 变体定形）。字段驱动纯物化器：读各包 package.json 的 dsh 声明字段 → 组装发布
// 树（六包共置）→ 重写 forge 依赖为相对 file: → manifest 版本清单 + 一致性机检 →
// 发布树字段自检（R3-dsh-dev②：对发布树副本逐包 patch 路径解析 + dsh.client 文件存在
// 性检查，出树前堵拷贝遗漏）→ zip。bundle 变体 = 发布树归一交付物（forge 六插行 patch
// + 五件 file: 依赖闭包——聚合 Bundle 主通道安装物）；solo 变体（CT-DISK-09 路 C 终态
// 安装物）：剥离五条相对 file: 依赖（五件自带插行语义在五件侧）。deep 单文件 tgz 变体
// 随 deep 通道退役删除（forge-aggregate-bundle 1.7）。
// freshness 自动编译门（自 deep-build.mjs 迁入——plugins/forge/scripts/freshness.mjs）
// 在 assembleRelease 入口前置：出树前逐件 run-once 自动编译五件 + forge + 代际双校验。
// run-once CLI：node scripts/package-release.mjs [--root <dir>] [--out <dir>] [--no-zip]
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runFreshnessGate } from '../plugins/forge/scripts/freshness.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_OUT = join(REPO_ROOT, 'release', 'forge-combo')
const FORGE_DIR_REL = join('plugins', 'forge')
const SOLO_REL = join('solo', 'forge')
// 自包含 bundle 交付目录（forge-aggregate-bundle 1.16——staging 孤立根除）：forge 壳 +
// members/<pkg> 五件全闭包内嵌，forge 依赖改 file:./members/<pkg>（in-tree 相对路径随目录
// 走）→ 交付目录任意复制/搬移/install 均 self-contained。发布树六包共置形态继续作为
// monorepo 开发态通道，两者并存机检分开。
const BUNDLE_REL = join('bundle', 'forge')
// bundle 交付目录依赖归一 overrides 退役（forge-aggregate-bundle 1.40——better-sqlite3
// 依赖零残留）：持久层已迁 node:sqlite（内置模块，零原生依赖、零 node-gyp），旧代际
// node-gyp 传递根因消失，overrides 与构建批准条目一并退役。
// 交付目录仍补发 pnpm-workspace.yaml（allowBuilds 空批准表）——独立目录无 workspace 上游，
// 保留 ignored-builds 门消音壳（闭包内零安装脚本即空表通过）。
// WYSIWYG 铁律（用户裁定 2026-11-22）：交付 cordis.patch.yml = forge 正本逐字节原样，
// 打包脚本零改写。正本自含 bundle 全量内容（六插行 + preset-forge + preset-headhunter
// + 双 preset 子树技能实例），本脚本对 patch 只做只读恒等校验；preset-headhunter 搬移、
// tool-exclude-office 行名重写、skills 行增补、成员非插行承带对账（NON_CARRY_EXEMPT/
// patchOutsideFirstInsertIds）等改写面已随形态全部退役（exclude 行退役判例 bug bfd37960）。
const SEMVER = /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/

export function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

/** cordis.patch.yml 裸名插行清单（insert 条目 name: 值——契约锚，零 YAML 依赖正则面） */
export function patchInsertNames(patchText) {
  return [...patchText.matchAll(/^\s*name:\s*['"]([^'"]+)['"]\s*$/gm)].map((m) => m[1])
}

/**
 * cordis.patch.yml 顶层 `- insert:` 块内的插行清单（单行自插断言用）：从 `- insert:`
 * 行起收集至下一顶层条目（非缩进行）止——块外 name: 行（skill-filesystem/preset 等
 * 非插行条目）不计入。
 */
export function patchInsertEntryNames(patchText) {
  const out = []
  let inBlock = false
  for (const line of patchText.split(/\r?\n/)) {
    if (!inBlock) {
      if (/^- insert:\s*$/.test(line)) inBlock = true
      continue
    }
    if (/^\S/.test(line)) break
    const m = line.match(/^\s*name:\s*['"]([^'"]+)['"]\s*$/)
    if (m !== null) out.push(m[1])
  }
  return out
}

/** 六包发现：forge package.json dependencies 的相对 file: 条目（字段驱动，零硬编码清单）。
 * 非成员依赖（组合目标插件 agent-preset/skill-filesystem 等 registry 条目）跳过——
 * 它们按 dependencies 原样进交付目录（generation 从 npm 解析，非 file: 闭包成员）。 */
export function discoverPackages(repoRoot) {
  const forgeDir = join(repoRoot, FORGE_DIR_REL)
  const forge = readJson(join(forgeDir, 'package.json'))
  const members = []
  for (const [name, spec] of Object.entries(forge.dependencies ?? {})) {
    if (!spec.startsWith('file:')) continue
    if (!/^file:\.\.[/\\]/.test(spec)) throw new Error(`forge dependencies 含非相对 file: 条目：${name} "${spec}"`)
    members.push({ name, sourceDir: resolve(forgeDir, spec.slice('file:'.length)) })
  }
  return [{ name: forge.name, sourceDir: forgeDir }, ...members]
}

/** client bundle 运行时声明路径全集：dsh.client.platform 相对路径形态 + exports["./client"] 运行时字段（types 不在装载面） */
export function clientBundlePaths(pkg) {
  const out = new Set()
  const platform = pkg.dsh?.client?.platform
  if (typeof platform === 'string' && platform.startsWith('./')) out.add(platform)
  const client = pkg.exports?.['./client']
  const fields = typeof client === 'string' ? { default: client } : (client ?? {})
  for (const field of ['default', 'import', 'require']) {
    const target = fields[field]
    if (typeof target === 'string' && target.startsWith('./')) out.add(target)
  }
  return [...out]
}

/** files[] 条目在源包目录的存在性清单（缺项即拷贝遗漏的判定基准） */
export function sourceFileEntries(sourceDir, pkg) {
  return (pkg.files ?? []).filter((entry) => existsSync(join(sourceDir, entry)))
}

/** 目录下全文件相对路径清单（递归——bundle members 闭包逐文件完整性核销基准） */
function listFilesRel(baseDir, rel = '') {
  const out = []
  for (const name of readdirSync(join(baseDir, rel), { withFileTypes: true })) {
    const child = rel === '' ? name.name : `${rel}/${name.name}`
    if (name.isDirectory()) out.push(...listFilesRel(baseDir, child))
    else out.push(child)
  }
  return out
}

function copyPackageToTree(sourceDir, treePkgDir, { deps } = {}) {
  const pkg = readJson(join(sourceDir, 'package.json'))
  // 发布树安装物 manifest：剥离 devDependencies（workspace:/link: 指向检出树，安装期
  // 不可解析）与 scripts（构建链属检出树）；其余字段原样保留。
  const { devDependencies: _dev, scripts: _scripts, ...rest } = pkg
  const manifest = { ...rest, ...(deps === undefined ? {} : { dependencies: deps }) }
  mkdirSync(treePkgDir, { recursive: true })
  for (const entry of sourceFileEntries(sourceDir, pkg)) {
    cpSync(join(sourceDir, entry), join(treePkgDir, entry), { recursive: true })
  }
  // dsh.bundle.patch 引用文件显式拷贝（files[] 之外的声明形态兜底）
  const patchRel = pkg.dsh?.bundle?.patch
  if (typeof patchRel === 'string' && existsSync(join(sourceDir, patchRel))) {
    mkdirSync(dirname(join(treePkgDir, patchRel)), { recursive: true })
    cpSync(join(sourceDir, patchRel), join(treePkgDir, patchRel))
  }
  writeFileSync(join(treePkgDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

/** solo 变体 dependencies：五条 file: 依赖全剥离（五插行语义在五件侧，forge 侧单行自插激活不变） */
export function soloDependencies(forgeManifest) {
  const deps = { ...forgeManifest.dependencies }
  for (const [name, spec] of Object.entries(deps)) {
    if (spec.startsWith('file:')) delete deps[name]
  }
  return deps
}

/** 相对 file: 重写：发布树兄弟布局下的跨包依赖归一（正斜杠 POSIX 形态） */
export function relativeFileDep(fromDir, toDir) {
  return `file:${relative(fromDir, toDir).replaceAll(sep, '/') || '.'}`
}

/** bundle 依赖重写：file: 依赖 → file:./members/<short>（自包含交付目录内嵌成员） */
export function bundleDependencies(forgeManifest) {
  return Object.fromEntries(
    Object.entries(forgeManifest.dependencies ?? {}).map(([name, spec]) => [
      name,
      spec.startsWith('file:') ? `file:./members/${name.slice('@dsh-forge/'.length)}` : spec,
    ]),
  )
}

/**
 * 聚合发布树组装（bundle 变体主通道）：freshness 门入口前置（五件 + forge 自动编译 +
 * 代际双校验——圆桌裁定迁移与删除同提交，freshness 门自 1.7 起归属本链）→ outDir 清空重建 → 六包共置
 * 拷贝（forge deps 重写为相对 file:）→ solo 变体产出 → manifest 落盘 → zip。
 * 返回 { treeDir, manifestPath, zipPath, warnings }。
 */
export function assembleRelease({ repoRoot = REPO_ROOT, outDir = DEFAULT_OUT, zip = true, freshness = true } = {}) {
  if (freshness) runFreshnessGate({ repoRoot, forgeDir: join(repoRoot, FORGE_DIR_REL) })
  const packages = discoverPackages(repoRoot)
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })
  const warnings = []
  const treeDirs = {}
  // 第一遍：五件成员拷贝（零依赖重写）+ forge 拷贝
  const forgeEntry = packages[0]
  const forgeTreeDir = join(outDir, 'forge')
  copyPackageToTree(forgeEntry.sourceDir, forgeTreeDir)
  treeDirs[forgeEntry.name] = forgeTreeDir
  const memberDeps = {}
  for (const entry of packages.slice(1)) {
    const treeDir = join(outDir, entry.name.slice('@dsh-forge/'.length))
    copyPackageToTree(entry.sourceDir, treeDir)
    treeDirs[entry.name] = treeDir
    memberDeps[entry.name] = relativeFileDep(forgeTreeDir, treeDir)
  }
  // 第二遍：forge deps 重写为发布树相对 file:（兄弟目录布局）
  const forgeManifest = readJson(join(forgeTreeDir, 'package.json'))
  forgeManifest.dependencies = Object.fromEntries(
    Object.entries(forgeManifest.dependencies ?? {}).map(([name, spec]) => [
      name,
      memberDeps[name] ?? (spec.startsWith('file:') ? relativeFileDep(forgeTreeDir, resolve(forgeTreeDir, spec.slice('file:'.length))) : spec),
    ]),
  )
  writeFileSync(join(forgeTreeDir, 'package.json'), `${JSON.stringify(forgeManifest, null, 2)}\n`)
  const versions = Object.fromEntries(
    Object.entries(treeDirs).map(([name, dir]) => [name, readJson(join(dir, 'package.json')).version]),
  )
  // solo 变体：forge 树副本 + 五条 file: 依赖剥离（五件自带插行语义在五件侧，forge patch 原样随副本）
  const soloDir = join(outDir, SOLO_REL)
  const soloManifest = { ...forgeManifest, dependencies: soloDependencies(forgeManifest) }
  cpSync(forgeTreeDir, soloDir, { recursive: true })
  writeFileSync(join(soloDir, 'package.json'), `${JSON.stringify(soloManifest, null, 2)}\n`)
  // 自包含 bundle 交付目录：forge 壳 + members/<pkg> 五件全闭包拷贝 + 依赖改指 file:./members/<pkg>
  const bundleDir = join(outDir, BUNDLE_REL)
  copyPackageToTree(forgeEntry.sourceDir, bundleDir)
  for (const entry of packages.slice(1)) {
    copyPackageToTree(entry.sourceDir, join(bundleDir, 'members', entry.name.slice('@dsh-forge/'.length)))
  }
  const bundleManifest = readJson(join(bundleDir, 'package.json'))
  bundleManifest.dependencies = bundleDependencies(forgeManifest)
  writeFileSync(join(bundleDir, 'package.json'), `${JSON.stringify(bundleManifest, null, 2)}\n`)
  // pnpm 构建批准表随交付目录补发（独立目录无 workspace 上游）——空批准表消
  // ignored-builds 门（闭包零安装脚本，1.40 起 better-sqlite3 条目退役）
  writeFileSync(
    join(bundleDir, 'pnpm-workspace.yaml'),
    '# 生成文件（scripts/package-release.mjs）——交付目录 pnpm 构建批准表：闭包零安装脚本（持久层 node:sqlite 内置模块），空表仅消 ignored-builds 门。\nallowBuilds: {}\n',
  )
  // WYSIWYG 只读恒等校验（正本自含化——交付 patch = forge 正本逐字节原样，零改写）：
  // 正本自含 bundle 全量（六插行 + preset-forge + preset-headhunter + 双 preset 子树
  // 技能实例），任何改写/增补面已退役；不等即红（出树前堵截）。前置断言（正本在场 +
  // 含 insert 块）并入恒等校验——基座断裂即不等即红。
  const bundlePatchPath = join(bundleDir, 'cordis.patch.yml')
  const forgePatchRel = readJson(join(forgeEntry.sourceDir, 'package.json')).dsh?.bundle?.patch
  if (typeof forgePatchRel !== 'string') throw new Error('交付恒等校验失败：forge dsh.bundle.patch 声明缺席')
  const sourcePatchPath = join(forgeEntry.sourceDir, forgePatchRel)
  if (!existsSync(sourcePatchPath)) throw new Error('交付恒等校验失败：forge 正本 patch 缺席')
  const sourcePatchText = readFileSync(sourcePatchPath, 'utf8')
  if (!/^- insert:/m.test(sourcePatchText)) throw new Error('交付恒等校验失败：forge 正本 patch 无 insert 块')
  if (!existsSync(bundlePatchPath) || readFileSync(bundlePatchPath, 'utf8') !== sourcePatchText) {
    throw new Error('交付恒等校验失败：交付 cordis.patch.yml ≢ forge 正本（WYSIWYG 铁律——逐字节一致断言红）')
  }
  // manifest 版本清单
  const manifest = {
    generator: 'scripts/package-release.mjs',
    generatedAt: new Date().toISOString(),
    channels: {
      bundle: { dir: BUNDLE_REL.replaceAll(sep, '/'), deps: bundleManifest.dependencies },
      solo: { dir: SOLO_REL.replaceAll(sep, '/'), deps: soloManifest.dependencies },
    },
    packages: Object.fromEntries(
      Object.entries(treeDirs).map(([name, dir]) => [name, { version: versions[name], dir: relative(outDir, dir).replaceAll(sep, '/') }]),
    ),
  }
  const manifestPath = join(outDir, 'manifest.json')
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  let zipPath
  if (zip) {
    zipPath = `${outDir}.zip`
    buildZip(outDir, zipPath)
  }
  return { treeDir: outDir, bundleDir, manifestPath, zipPath, warnings }
}

/** 发布树字段自检（R3-dsh-dev②）：单包 patch 路径解析 + dsh.client bundle 文件存在性 */
export function verifyPackageFields(pkgDir, label) {
  const violations = []
  const tag = (msg) => `${label}: ${msg}`
  let pkg
  try {
    pkg = readJson(join(pkgDir, 'package.json'))
  } catch {
    return [tag('package.json 不可解析（非法 JSON）')]
  }
  if (typeof pkg.version !== 'string' || !SEMVER.test(pkg.version)) return [tag(`version 非法：${String(pkg.version)}`)]
  const patchRel = pkg.dsh?.bundle?.patch
  if (typeof patchRel !== 'string' || patchRel === '') violations.push(tag('dsh.bundle.patch 缺声明'))
  else if (!existsSync(join(pkgDir, patchRel))) violations.push(tag(`patch 路径解析断裂：${patchRel}`))
  const client = pkg.dsh?.client
  if (client !== undefined && client !== null) {
    const bundles = clientBundlePaths(pkg)
    if (bundles.length === 0) violations.push(tag('dsh.client 已声明而 client bundle 路径缺席（platform/exports 零可解析指向）'))
    for (const rel of bundles) {
      if (!existsSync(join(pkgDir, rel))) violations.push(tag(`client bundle 文件缺席：${rel}`))
    }
  }
  return violations
}

/**
 * 发布树整树机检：逐包字段自检 + manifest 版本一致性 + files 拷贝完整性 +
 * forge bundle 六插行断言（forge 自插行 + 成员插行——六插行随成员清单单源）+
 * 五件各件自带插行断言（solo 语义在五件侧）+ forge file: 依赖快层契约断言
 * （指称恰落发布树兄弟目录且包名吻合）+ solo 变体 file: 剥离与 patch 正本一致。
 */
export function verifyReleaseTree(treeDir, { repoRoot = REPO_ROOT } = {}) {
  const violations = []
  const packages = discoverPackages(repoRoot)
  const manifestPath = join(treeDir, 'manifest.json')
  if (!existsSync(manifestPath)) return ['manifest.json 缺席']
  const manifest = readJson(manifestPath)
  const sourceByName = new Map(packages.map((p) => [p.name, p.sourceDir]))
  for (const entry of packages) {
    const short = entry.name.slice('@dsh-forge/'.length)
    const dir = join(treeDir, short)
    if (!existsSync(join(dir, 'package.json'))) {
      violations.push(`${entry.name}: 发布树包目录缺席 ${dir}`)
      continue
    }
    violations.push(...verifyPackageFields(dir, entry.name))
    // 拷贝完整性双向对账：①声明侧——源 files[] 逐项在场（缺失条目被
    // sourceFileEntries 静默过滤 = 拷贝遗漏隐患，判例 50bfbcec skills 静默丢弃）；
    // ②物侧——在场条目逐项落树
    const srcPkg = readJson(join(entry.sourceDir, 'package.json'))
    for (const rel of srcPkg.files ?? []) {
      if (!existsSync(join(entry.sourceDir, rel))) violations.push(`${entry.name}: files 声明条目源缺席（拷贝静默遗漏）：${rel}`)
    }
    for (const rel of sourceFileEntries(entry.sourceDir, srcPkg)) {
      if (!existsSync(join(dir, rel))) violations.push(`${entry.name}: files 条目拷贝遗漏：${rel}`)
    }
    // 五件各件自带插行断言（solo 语义在五件侧——plain dependency 不进层，五件单装
    // 靠自带插行激活；forge 单行自插后成员 patch 不得被误剥）
    if (entry !== packages[0]) {
      const memberPatchRel = srcPkg.dsh?.bundle?.patch
      if (typeof memberPatchRel === 'string' && existsSync(join(dir, memberPatchRel))) {
        const memberInserts = patchInsertEntryNames(readFileSync(join(dir, memberPatchRel), 'utf8'))
        if (!memberInserts.includes(entry.name)) violations.push(`${entry.name}: 自带插行缺席（成员 patch 须含本包 name 插行）`)
      }
    }
  }
  // manifest 版本一致性机检（清单 vs 树内实读逐包比对）
  for (const [name, meta] of Object.entries(manifest.packages ?? {})) {
    const dir = join(treeDir, meta.dir ?? '')
    if (!existsSync(join(dir, 'package.json'))) {
      violations.push(`${name}: manifest 目录悬空 ${meta.dir}`)
      continue
    }
    const actual = readJson(join(dir, 'package.json')).version
    if (actual !== meta.version) violations.push(`${name}: 版本不一致 manifest=${meta.version} tree=${actual}`)
  }
  for (const entry of packages) {
    if (manifest.packages?.[entry.name] === undefined) violations.push(`${entry.name}: manifest 版本清单缺条目`)
  }
  // forge bundle 六插行断言（forge-aggregate-bundle 形态：forge 自插行 + 成员插行，
  // 顺序随成员清单单源）+ file: 依赖快层契约断言（指称恰落发布树兄弟目录——file: 孤立
  // 风险快层落测，圆桌裁定双层落测之快层；e2e 副本独立存活归收口断言）
  const forgeTreeDir = join(treeDir, 'forge')
  const forgePkg = readJson(join(forgeTreeDir, 'package.json'))
  const patchRel = forgePkg.dsh?.bundle?.patch
  if (typeof patchRel !== 'string' || !existsSync(join(forgeTreeDir, patchRel))) {
    violations.push('forge: dsh.bundle.patch 缺声明或文件缺席')
  } else {
    const bundleInserts = patchInsertEntryNames(readFileSync(join(forgeTreeDir, patchRel), 'utf8'))
    const expectedInserts = packages.map((p) => p.name)
    // 成员包含性断言（preset/skills 行同入 insert 块——额外条目合法，成员缺席即红）
    const missing = expectedInserts.filter((name) => !bundleInserts.includes(name))
    if (missing.length > 0) {
      violations.push(`forge: bundle 插行清单漂移（成员缺席 ${JSON.stringify(missing)}，实际 ${JSON.stringify(bundleInserts.slice(0, 12))}…）`)
    }
    for (const [depName, spec] of Object.entries(forgePkg.dependencies ?? {})) {
      if (!spec.startsWith('file:')) continue
      if (!spec.startsWith('file:../')) violations.push(`forge: 依赖非发布树相对 file: 形态 ${depName} "${spec}"`)
      const depDir = resolve(forgeTreeDir, spec.slice('file:'.length))
      const depPkgPath = join(depDir, 'package.json')
      if (!existsSync(depPkgPath)) {
        violations.push(`forge: file: 依赖指称悬空 ${depName} "${spec}"（发布树 ${relative(treeDir, depDir)} 目录/package.json 缺席）`)
      } else if (readJson(depPkgPath).name !== depName) {
        violations.push(`forge: file: 依赖指称包名不吻合 ${depName} → "${spec}"（实际 ${readJson(depPkgPath).name}）`)
      }
    }
  }
  // solo 变体：五条 file: 全剥离 + forge patch 单行自插（与源正本一致）+ 字段自检
  const soloDir = join(treeDir, 'solo', 'forge')
  if (!existsSync(join(soloDir, 'package.json'))) {
    violations.push('solo 变体缺席（solo/forge）')
  } else {
    const soloPkg = readJson(join(soloDir, 'package.json'))
    const residual = Object.values(soloPkg.dependencies ?? {}).filter((spec) => spec.startsWith('file:'))
    if (residual.length > 0) violations.push(`solo: 残留 file: 依赖 ${residual.length} 条`)
    const soloPatchRel = soloPkg.dsh?.bundle?.patch
    if (typeof soloPatchRel !== 'string' || !existsSync(join(soloDir, soloPatchRel))) {
      violations.push('solo: dsh.bundle.patch 缺声明或文件缺席')
    } else {
    const soloNames = patchInsertEntryNames(readFileSync(join(soloDir, soloPatchRel), 'utf8'))
    const sourceForgeDir = sourceByName.get(forgePkg.name)
    const sourceForgePkg = sourceForgeDir !== undefined ? readJson(join(sourceForgeDir, 'package.json')) : undefined
    const sourcePatchRel = sourceForgePkg?.dsh?.bundle?.patch
    if (typeof sourcePatchRel !== 'string') {
      violations.push('solo: 源正本 patch 声明缺席（正本一致性比对无从进行）')
    } else {
      const sourceText = readFileSync(join(sourceForgeDir, sourcePatchRel), 'utf8')
      const soloText = readFileSync(join(soloDir, soloPatchRel), 'utf8')
      if (patchInsertEntryNames(sourceText).join('|') !== patchInsertEntryNames(soloText).join('|')) {
        violations.push(`solo: 插行清单与源正本漂移（源 [${patchInsertEntryNames(sourceText).join(', ')}] vs solo [${soloNames.join(', ')}]）`)
      }
    }
    }
    violations.push(...verifyPackageFields(soloDir, 'solo/forge'))
  }
  return violations
}

/**
 * 自包含 bundle 交付目录机检（闭包完整性断言）：forge 壳在场 + members/<pkg> 五件逐件
 * 在场（package.json + files[] 拷贝完整 + 字段自检 + 自带插行随包）+ forge file: 依赖
 * 全部 in-tree（恰 file:./members/<short> 形态、指称在场、包名吻合、零目录外指称）。
 */
export function verifyBundleClosure(bundleDir, { repoRoot = REPO_ROOT } = {}) {
  const violations = []
  const packages = discoverPackages(repoRoot)
  const forgePkgPath = join(bundleDir, 'package.json')
  if (!existsSync(forgePkgPath)) return [`bundle: forge 壳 package.json 缺席 ${bundleDir}`]
  const forgePkg = readJson(forgePkgPath)
  violations.push(...verifyPackageFields(bundleDir, 'bundle/forge'))
  for (const entry of packages.slice(1)) {
    const short = entry.name.slice('@dsh-forge/'.length)
    const dir = join(bundleDir, 'members', short)
    if (!existsSync(join(dir, 'package.json'))) {
      violations.push(`bundle: members/${short} 缺席（package.json）`)
      continue
    }
    violations.push(...verifyPackageFields(dir, `bundle/members/${short}`))
    // 拷贝完整性双向对账①声明侧（源 files[] 逐项在场——缺失条目静默过滤即隐患）
    const srcPkg = readJson(join(entry.sourceDir, 'package.json'))
    for (const rel of srcPkg.files ?? []) {
      if (!existsSync(join(entry.sourceDir, rel))) violations.push(`bundle: members/${short} files 声明条目源缺席（拷贝静默遗漏）：${rel}`)
    }
    // skills 锚目录在场（交付 patch skills 行 customSkillDirs 自锚 members/<pkg>/skills——目录缺席锚落空）
    if (!existsSync(join(dir, 'skills'))) violations.push(`bundle: members/${short} skills 锚目录缺席（交付 patch skills 行自锚落空）`)
    for (const relFile of listFilesRel(entry.sourceDir).filter((f) => (srcPkg.files ?? []).some((e) => f === e || f.startsWith(`${e}/`)))) {
      if (!existsSync(join(dir, relFile))) violations.push(`bundle: members/${short} 闭包拷贝遗漏：${relFile}`)
    }
    const memberPatchRel = srcPkg.dsh?.bundle?.patch
    if (typeof memberPatchRel === 'string' && existsSync(join(dir, memberPatchRel))) {
      const inserts = patchInsertEntryNames(readFileSync(join(dir, memberPatchRel), 'utf8'))
      if (!inserts.includes(entry.name)) violations.push(`bundle: members/${short} 自带插行缺席（solo 语义随包）`)
    }
  }
  const declared = new Set()
  for (const [depName, spec] of Object.entries(forgePkg.dependencies ?? {})) {
    if (!spec.startsWith('file:')) continue
    declared.add(depName)
    const short = depName.slice('@dsh-forge/'.length)
    if (spec !== `file:./members/${short}`) violations.push(`bundle: 依赖非 in-tree file:./members/ 形态 ${depName} "${spec}"`)
    const depDir = resolve(bundleDir, spec.slice('file:'.length))
    if (!depDir.startsWith(bundleDir + sep)) violations.push(`bundle: file: 依赖指向交付目录外 ${depName} "${spec}"`)
    const depPkgPath = join(depDir, 'package.json')
    if (!existsSync(depPkgPath)) {
      violations.push(`bundle: file: 依赖指称悬空 ${depName} "${spec}"（members/${short}/package.json 缺席）`)
    } else if (readJson(depPkgPath).name !== depName) {
      violations.push(`bundle: file: 依赖指称包名不吻合 ${depName} → "${spec}"（实际 ${readJson(depPkgPath).name}）`)
    }
  }
  for (const entry of packages.slice(1)) {
    if (!declared.has(entry.name)) violations.push(`bundle: forge 依赖缺成员条目 ${entry.name}`)
  }
  // overrides 退役（1.40——better-sqlite3 依赖零残留，发布树 pnpm.overrides 不复存在）
  if (forgePkg.pnpm?.overrides !== undefined) {
    violations.push(`bundle: pnpm.overrides 已退役仍残留（1.40 node:sqlite 迁移——期望无 overrides，实际 ${JSON.stringify(forgePkg.pnpm.overrides)}）`)
  }
  // 交付 patch 顶层禁承带 skills 行（forge-aggregate-bundle 1.34 技能预设独占收敛——
  // 五件顶层 skills 行退役为设计，标准模式零成员技能；技能走 preset 子树实例。判定区分
  // 顶层与子树嵌套：insert 块直接子行（缩进 ≤4）出现 `- id: skill-filesystem-<short>`
  // 即红，preset 子树嵌套实例（缩进 ≥6）不误伤）。
  const bundlePatchPath = join(bundleDir, 'cordis.patch.yml')
  if (!existsSync(bundlePatchPath)) return [...violations, 'bundle: 交付 patch cordis.patch.yml 缺席']
  const bundlePatchText = readFileSync(bundlePatchPath, 'utf8')
  for (const m of bundlePatchText.matchAll(/^(\s*)- id: (skill-filesystem-\S+)\s*$/gm)) {
    if (m[1].length <= 4) violations.push(`bundle: 交付 patch 顶层禁承带 skills 行（技能预设独占——preset 子树实例承载）：${m[2]}`)
  }
  // preset-forge 子树 skills 实例在场（正本自含——缺席即 Forge 预设技能落空）；
  // preset-headhunter 块在场（正本自含承带——WYSIWYG 铁律，猎头预设随交付 patch）
  if (bundlePatchText.includes('- id: preset-forge')) {
    if (!bundlePatchText.includes('- id: skill-filesystem-forge') || !bundlePatchText.includes('providerName: filesystem-forge')) {
      violations.push('bundle: preset-forge 子树 skills 实例缺席（skill-filesystem-forge / providerName filesystem-forge）')
    }
  }
  if (bundlePatchText.includes('- id: preset-headhunter')) {
    if (!bundlePatchText.includes('- id: skill-filesystem-expert-squad') || !bundlePatchText.includes('providerName: filesystem-expert-squad')) {
      violations.push('bundle: preset-headhunter 块 skills 实例缺席（正本自含承带断裂——猎头预设技能落空）')
    }
  }
  // WYSIWYG 只读恒等断言：交付 patch ≡ forge 正本逐字节一致（不等即红）
  {
    const srcPkg = readJson(join(packages[0].sourceDir, 'package.json'))
    const srcPatchRel = srcPkg.dsh?.bundle?.patch
    const srcPatchPath = typeof srcPatchRel === 'string' ? join(packages[0].sourceDir, srcPatchRel) : undefined
    if (typeof srcPatchRel !== 'string' || srcPatchPath === undefined || !existsSync(srcPatchPath)) {
      violations.push('bundle: forge 正本 patch 声明缺席或文件缺席（恒等断言无从进行）')
    } else if (readFileSync(srcPatchPath, 'utf8') !== bundlePatchText) {
      violations.push('bundle: 交付 patch ≢ forge 正本（WYSIWYG 铁律——逐字节一致断言红）')
    }
  }
  // exclude 行退役断言（bug bfd37960 回归根因）：零 tool-exclude-office 行 + preset 子树
  // 零 @dsh-forge/ 子路径 name（profile 根解析封锁——双预设 broken 判例；允许面 = 成员
  // 包裸名插行 name——随成员清单单源，fixture 仓同构）。
  const allowedBareNames = new Set(packages.map((p) => p.name))
  if (/^\s*- id: tool-exclude-office\s*$/m.test(bundlePatchText)) {
    violations.push('bundle: 交付 patch 残留 tool-exclude-office 行（exclude 行全通道退役——bug bfd37960）')
  }
  for (const m of bundlePatchText.matchAll(/^\s+name: ['"](@dsh-forge\/[^'"]+)['"]\s*$/gm)) {
    if (!allowedBareNames.has(m[1])) {
      violations.push(`bundle: preset 子树残留 @dsh-forge/ 子路径 name（profile 根解析封锁——预设 broken 判例）：${m[1]}`)
    }
  }
  const wsPath = join(bundleDir, 'pnpm-workspace.yaml')
  if (!existsSync(wsPath)) {
    violations.push('bundle: pnpm-workspace.yaml 缺席（allowBuilds 批准表未随交付目录补发）')
  } else {
    const wsText = readFileSync(wsPath, 'utf8')
    if (!/^allowBuilds:/m.test(wsText)) violations.push('bundle: pnpm-workspace.yaml 缺 allowBuilds 段')
  }
  return violations
}

/** zip 产出（bsdtar -a 按扩展名定 zip 形态——run-once，只收发布树目录本体） */
export function buildZip(treeDir, zipPath) {
  const r = spawnSync('tar', ['-a', '-c', '-f', zipPath, '-C', dirname(treeDir), basename(treeDir)], {
    encoding: 'utf8',
    windowsHide: true,
  })
  if (r.status !== 0) throw new Error(`zip 产出失败（exit ${r.status}）：${String(r.stderr ?? '').trim()}`)
  if (!existsSync(zipPath) || statSync(zipPath).size === 0) throw new Error(`zip 产物缺席或为空：${zipPath}`)
  return zipPath
}

function main(argv) {
  const flag = (name) => {
    const i = argv.indexOf(name)
    return i === -1 ? undefined : argv[i + 1]
  }
  const rootFlag = flag('--root')
  const outFlag = flag('--out')
  const zip = !argv.includes('--no-zip')
  const repoRoot = rootFlag !== undefined ? resolve(rootFlag) : REPO_ROOT
  const outDir = outFlag !== undefined ? resolve(outFlag) : DEFAULT_OUT
  const { treeDir, bundleDir, manifestPath, zipPath } = assembleRelease({ repoRoot, outDir, zip })
  const violations = [...verifyReleaseTree(treeDir, { repoRoot }), ...verifyBundleClosure(bundleDir, { repoRoot })]
  if (violations.length > 0) {
    console.error(`[package-release] 发布树机检 ${violations.length} 处违规：`)
    for (const v of violations) console.error(`  - ${v}`)
    process.exit(1)
  }
  console.log(`[package-release] 发布树机检全绿：${treeDir}`)
  console.log(`[package-release] manifest：${manifestPath}`)
  if (zipPath !== undefined) console.log(`[package-release] zip：${zipPath}`)
}

const isCli = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isCli) main(process.argv.slice(2))
