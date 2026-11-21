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
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
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
// bundle 交付目录依赖归一 overrides（forge-aggregate-bundle 1.19——旧代际 node-gyp 根除）：
// task-loop 老依赖树传递拖入旧代际 better-sqlite3@11.x（带 node-gyp install 脚本），staging
// 安装即崩；pnpm 全树强制单版本 13.0.3（自带 prebuilds 无安装脚本），node-gyp 路径消失。
const BUNDLE_OVERRIDES = { 'better-sqlite3': '13.0.3' }
// bundle 目录 pnpm 构建批准表（pnpm 11 ignored-builds 门消音——13.0.3 零安装脚本，
// prebuilds/ 随包分发；同主仓 pnpm-workspace.yaml allowBuilds 语义，仅消门无编译动作）
const BUNDLE_ALLOW_BUILDS = { 'better-sqlite3': true }
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
  // node JSON 往返注入 overrides（package.json 变更唯一正道）
  bundleManifest.pnpm = { ...bundleManifest.pnpm, overrides: { ...BUNDLE_OVERRIDES } }
  writeFileSync(join(bundleDir, 'package.json'), `${JSON.stringify(bundleManifest, null, 2)}\n`)
  // pnpm 构建批准表随交付目录补发（独立目录无 workspace 上游——无此文件 pnpm 11
  // ignored-builds 门以 exit 1 判安装失败）
  writeFileSync(
    join(bundleDir, 'pnpm-workspace.yaml'),
    `# 生成文件（scripts/package-release.mjs）——交付目录 pnpm 构建批准表：13.0.3 零安装\n# 脚本（prebuilds/ 随包分发），此表仅消 ignored-builds 门，无编译动作。\nallowBuilds:\n${Object.entries(BUNDLE_ALLOW_BUILDS).map(([name, allow]) => `  '${name}': ${allow}`).join('\n')}\n`,
  )
  // 交付目录 patch 增补段（bug：bundle 通道成员 patch 不装载——「谁带谁自持」仅
  // solo/发布树成立；bundle 通道技能行/预设行必须由 forge patch 携带）。
  // 行形态铁律（architect P1#2 定谳 + CLI dump-config 实验）：全部行必须 insert 块
  // 包裹——顶层非 insert 行被 loader 按 entry 解析 → entry not found 静默跳过
  // （官方形态 = expert-squad preset-headhunter 第二 insert 块）。组合目标插件
  // （agent-preset/skill-filesystem）由宿主运行时供服，无需 profile 安装。
  const memberNames = packages.slice(1).map((entry) => entry.name.slice('@dsh-forge/'.length))
  const skillRows = memberNames.flatMap((name) => {
    const anchor = `process.getBuiltinModule('node:module').createRequire(baseUrl).resolve('@dsh-forge/${name}/package.json')`
    const joinExpr = `process.getBuiltinModule('node:path').join(process.getBuiltinModule('node:path').dirname(${anchor}), 'skills')`
    return [
      `- id: skill-filesystem-${name}`,
      `  name: '@deepseek-ai/dsh-skill-filesystem'`,
      `  config:`,
      `    providerName: filesystem-${name}`,
      `    customSkillDirs:`,
      `      - !!js ${anchor} && ${joinExpr}`,
    ]
  })
  // preset-headhunter 行块搬移（expert-squad patch 第二 insert 块逐字——bundle 通道
  // 成员 patch 非插行语义的唯一等价承载，猎头模式预设恢复）。字段驱动：expert-squad
  // 为成员时才搬移（源 patch 经成员 sourceDir + dsh.bundle.patch 声明定位）；非成员
  // （合成仓 fixture）跳过——块承载语义随成员在场性走。
  const squadEntry = packages.find((entry) => entry.name === '@dsh-forge/expert-squad')
  let headhunterBlock = ''
  if (squadEntry !== undefined) {
    const squadPkg = readJson(join(squadEntry.sourceDir, 'package.json'))
    const squadPatchRel = squadPkg.dsh?.bundle?.patch
    if (typeof squadPatchRel !== 'string') throw new Error('交付增补失败：expert-squad dsh.bundle.patch 声明缺席')
    const hl = readFileSync(join(squadEntry.sourceDir, squadPatchRel), 'utf8').split('\n')
    const insertStarts = []
    hl.forEach((l, idx) => { if (l.trim() === '- insert:') insertStarts.push(idx) })
    const hhStart = insertStarts[1]
    if (hhStart === undefined) throw new Error('交付增补失败：expert-squad patch 第二 insert 块（preset-headhunter）缺席')
    headhunterBlock = hl.slice(hhStart).filter((l) => l.trim() !== '').join('\n')
  }
  appendFileSync(join(bundleDir, 'cordis.patch.yml'), `\n${['- insert:', ...skillRows.map((l) => '  ' + l)].join('\n')}\n${headhunterBlock}\n`)
  // manifest 版本清单
  const manifest = {
    generator: 'scripts/package-release.mjs',
    generatedAt: new Date().toISOString(),
    channels: {
      bundle: { dir: BUNDLE_REL.replaceAll(sep, '/'), deps: bundleManifest.dependencies, overrides: bundleManifest.pnpm?.overrides },
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
    // 拷贝完整性：源 files[] 在场条目逐项落树
    const srcPkg = readJson(join(entry.sourceDir, 'package.json'))
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
    const srcPkg = readJson(join(entry.sourceDir, 'package.json'))
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
  // overrides 生成断言（闭包机检长期把守——依赖代际错配家族复发即红）
  const actualOverrides = forgePkg.pnpm?.overrides
  if (JSON.stringify(actualOverrides) !== JSON.stringify(BUNDLE_OVERRIDES)) {
    violations.push(`bundle: pnpm.overrides 生成断言漂移（期望 ${JSON.stringify(BUNDLE_OVERRIDES)}，实际 ${JSON.stringify(actualOverrides ?? null)}）`)
  }
  // 交付 patch 五行 skills 行断言（bundle 通道成员 patch 不装载——技能行必须由 forge patch 携带）
  const bundlePatchText = readFileSync(join(bundleDir, 'cordis.patch.yml'), 'utf8')
  for (const short of packages.slice(1).map((entry) => entry.name.slice('@dsh-forge/'.length))) {
    if (!bundlePatchText.includes(`- id: skill-filesystem-${short}`) || !bundlePatchText.includes(`providerName: filesystem-${short}`)) {
      violations.push(`bundle: 交付 patch 缺 skills 行 skill-filesystem-${short}（providerName filesystem-${short}）`)
    }
  }
  const wsPath = join(bundleDir, 'pnpm-workspace.yaml')
  if (!existsSync(wsPath)) {
    violations.push('bundle: pnpm-workspace.yaml 缺席（allowBuilds 批准表未随交付目录补发）')
  } else {
    const wsText = readFileSync(wsPath, 'utf8')
    if (!/^allowBuilds:/m.test(wsText)) violations.push('bundle: pnpm-workspace.yaml 缺 allowBuilds 段')
    for (const [name, allow] of Object.entries(BUNDLE_ALLOW_BUILDS)) {
      if (!new RegExp(`^\\s{2}'?${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'?:\\s*${allow}\\s*$`, 'm').test(wsText)) {
        violations.push(`bundle: pnpm-workspace.yaml allowBuilds 缺批准项 ${name}: ${allow}`)
      }
    }
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
