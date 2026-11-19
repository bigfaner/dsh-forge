// 聚合打包发布流水线（plugin-forge-combo 收口批 1.12——G1 打包门主体）。
// 字段驱动纯物化器：读各包 package.json 的 dsh 声明字段 → 组装发布树（六包共置）→
// 重写 forge 依赖为相对 file: → manifest 版本清单 + 一致性机检 → 发布树字段自检
// （R3-dsh-dev②：对发布树副本逐包 patch 路径解析 + dsh.client 文件存在性检查，
// 出树前堵拷贝遗漏）→ zip。solo 变体（CT-DISK-09 路 C 终态安装物）：剥离五条相对
// file: 依赖 + 保留 cordis.patch.yml 裸名插行原文（逐件通道：五件先装、forge solo 收口）。
// 聚合/solo 双通道交付物齐备（desktop staging 单目录拷贝裁定——contract.md 修订留痕）。
// run-once CLI：node scripts/package-release.mjs [--root <dir>] [--out <dir>] [--no-zip]
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_OUT = join(REPO_ROOT, 'release', 'forge-combo')
const FORGE_DIR_REL = join('plugins', 'forge')
const SOLO_REL = join('solo', 'forge')
const SEMVER = /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/

export function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

/** cordis.patch.yml 裸名插行清单（insert 条目 name: 值——契约锚，零 YAML 依赖正则面） */
export function patchInsertNames(patchText) {
  return [...patchText.matchAll(/^\s*name:\s*['"]([^'"]+)['"]\s*$/gm)].map((m) => m[1])
}

/** 六包发现：forge package.json dependencies 的相对 file: 条目（字段驱动，零硬编码清单） */
export function discoverPackages(repoRoot) {
  const forgeDir = join(repoRoot, FORGE_DIR_REL)
  const forge = readJson(join(forgeDir, 'package.json'))
  const members = []
  for (const [name, spec] of Object.entries(forge.dependencies ?? {})) {
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

/** solo 变体 dependencies：五条 file: 依赖全剥离（裸名插行激活面不变） */
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

/**
 * 聚合发布树组装：outDir 清空重建 → 六包共置拷贝（forge deps 重写为相对 file:）→
 * solo 变体产出 → manifest 落盘 → zip。返回 { treeDir, manifestPath, zipPath, warnings }。
 */
export function assembleRelease({ repoRoot = REPO_ROOT, outDir = DEFAULT_OUT, zip = true } = {}) {
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
  // solo 变体：forge 树副本 + 五条 file: 依赖剥离（patch 裸名行原样保留）
  const soloDir = join(outDir, SOLO_REL)
  const soloManifest = { ...forgeManifest, dependencies: soloDependencies(forgeManifest) }
  cpSync(forgeTreeDir, soloDir, { recursive: true })
  writeFileSync(join(soloDir, 'package.json'), `${JSON.stringify(soloManifest, null, 2)}\n`)
  // manifest 版本清单
  const manifest = {
    generator: 'scripts/package-release.mjs',
    generatedAt: new Date().toISOString(),
    channels: {
      aggregate: { dir: 'forge', deps: forgeManifest.dependencies },
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
  return { treeDir: outDir, manifestPath, zipPath, warnings }
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
 * forge 依赖相对 file: 形态与插行对应 + solo 变体 file: 剥离与裸名插行保留。
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
  // forge 聚合依赖：相对 file: 兄弟形态 + 与 patch 裸名插行一一对应
  const forgeTreeDir = join(treeDir, 'forge')
  const forgePkg = readJson(join(forgeTreeDir, 'package.json'))
  const patchRel = forgePkg.dsh?.bundle?.patch
  if (typeof patchRel !== 'string' || !existsSync(join(forgeTreeDir, patchRel))) {
    violations.push('forge: dsh.bundle.patch 缺声明或文件缺席')
  } else {
    const bareNames = patchInsertNames(readFileSync(join(forgeTreeDir, patchRel), 'utf8'))
    const fileDeps = Object.entries(forgePkg.dependencies ?? {}).filter(([, spec]) => spec.startsWith('file:'))
    for (const bare of bareNames) {
      if (!fileDeps.some(([depName]) => depName === bare)) violations.push(`forge: file: 依赖缺裸名插行对应项 ${bare}`)
    }
    for (const [depName, spec] of fileDeps) {
      if (!spec.startsWith('file:../')) violations.push(`forge: 依赖非发布树相对 file: 形态 ${depName} "${spec}"`)
      if (!bareNames.includes(depName)) violations.push(`forge: file: 依赖无插行对应 ${depName}`)
    }
  }
  // solo 变体：五条 file: 全剥离 + patch 裸名行与源正本一致 + 字段自检
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
      const sourceForgeDir = sourceByName.get(forgePkg.name)
      const sourceForgePkg = sourceForgeDir !== undefined ? readJson(join(sourceForgeDir, 'package.json')) : undefined
      const sourcePatchRel = sourceForgePkg?.dsh?.bundle?.patch
      if (typeof sourcePatchRel === 'string') {
        const sourceText = readFileSync(join(sourceForgeDir, sourcePatchRel), 'utf8')
        const soloText = readFileSync(join(soloDir, soloPatchRel), 'utf8')
        if (patchInsertNames(sourceText).join('|') !== patchInsertNames(soloText).join('|')) {
          violations.push('solo: 裸名插行清单与源正本漂移')
        }
      }
    }
    violations.push(...verifyPackageFields(soloDir, 'solo/forge'))
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
  const { treeDir, manifestPath, zipPath } = assembleRelease({ repoRoot, outDir, zip })
  const violations = verifyReleaseTree(treeDir, { repoRoot })
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
