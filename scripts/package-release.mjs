// 聚合打包发布流水线（plugin-forge-combo 收口批 1.12——G1 打包门主体）。
// 字段驱动纯物化器：读各包 package.json 的 dsh 声明字段 → 组装发布树（六包共置）→
// 重写 forge 依赖为相对 file: → manifest 版本清单 + 一致性机检 → 发布树字段自检
// （R3-dsh-dev②：对发布树副本逐包 patch 路径解析 + dsh.client 文件存在性检查，
// 出树前堵拷贝遗漏）→ zip。solo 变体（CT-DISK-09 路 C 终态安装物）：剥离五条相对
// file: 依赖（五插行语义在五件侧——各件自带插行随包收录，forge 侧 = 单行自插）。
// deep 变体（forge-deep-pack 1.9）：调用 plugins/forge/scripts/deep-build.mjs 同源
// 产出单文件 tgz（freshness 门自动编译/内联/审计全部由 deep-build 承担——零重复
// 实现），产物落 <outDir>/deep/。三通道并存：发布树 / solo / deep tgz。
// run-once CLI：node scripts/package-release.mjs [--root <dir>] [--out <dir>] [--no-zip] [--no-deep]
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_OUT = join(REPO_ROOT, 'release', 'forge-combo')
const FORGE_DIR_REL = join('plugins', 'forge')
const SOLO_REL = join('solo', 'forge')
const DEEP_REL = join('deep')
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

/**
 * deep 变体产出：调用 deep-build 同源产物（forge-deep-pack 1.9——freshness 门自动
 * 编译 / 五件 inline / tgz 组装与审计全部由 deep-build 承担，零重复实现）。run-once
 * 子进程（禁 watch），产物 = <outDir>/deep/{package, forge-deep-<version>.tgz}。
 */
export function buildDeepVariant({ repoRoot = REPO_ROOT, outDir = DEFAULT_OUT } = {}) {
  const script = join(repoRoot, 'plugins', 'forge', 'scripts', 'deep-build.mjs')
  if (!existsSync(script)) throw new Error(`deep-build 脚本缺席：${script}`)
  const deepDir = join(outDir, DEEP_REL)
  const r = spawnSync(process.execPath, [script, '--out', deepDir], { cwd: repoRoot, encoding: 'utf8', windowsHide: true })
  if (r.status !== 0) throw new Error(`deep-build 产出失败（exit ${r.status}）：${String(r.stderr ?? '').trim()}`)
  const pkg = readJson(join(repoRoot, FORGE_DIR_REL, 'package.json'))
  const tgzRel = join(DEEP_REL, `forge-deep-${pkg.version}.tgz`)
  if (!existsSync(join(outDir, tgzRel))) throw new Error(`deep tgz 产物缺席：${tgzRel}`)
  return { dir: DEEP_REL.replaceAll(sep, '/'), staging: join(DEEP_REL, 'package').replaceAll(sep, '/'), tgz: tgzRel.replaceAll(sep, '/'), version: pkg.version }
}

/**
 * 聚合发布树组装：outDir 清空重建 → 六包共置拷贝（forge deps 重写为相对 file:）→
 * solo 变体产出 → deep 变体产出（deep:true 时调 deep-build 同源产物）→ manifest 落盘
 * → zip。返回 { treeDir, manifestPath, zipPath, deep, warnings }。
 */
export function assembleRelease({ repoRoot = REPO_ROOT, outDir = DEFAULT_OUT, zip = true, deep = true } = {}) {
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
  // solo 变体：forge 树副本 + 五条 file: 依赖剥离（五插行语义在五件侧，forge patch 单行自插原样）
  const soloDir = join(outDir, SOLO_REL)
  const soloManifest = { ...forgeManifest, dependencies: soloDependencies(forgeManifest) }
  cpSync(forgeTreeDir, soloDir, { recursive: true })
  writeFileSync(join(soloDir, 'package.json'), `${JSON.stringify(soloManifest, null, 2)}\n`)
  // deep 变体：单文件 tgz 主通道（deep-build 同源产物——freshness 门自动编译在 deep-build 内置）
  const deepChannel = deep ? buildDeepVariant({ repoRoot, outDir }) : undefined
  // manifest 版本清单
  const manifest = {
    generator: 'scripts/package-release.mjs',
    generatedAt: new Date().toISOString(),
    channels: {
      aggregate: { dir: 'forge', deps: forgeManifest.dependencies },
      solo: { dir: SOLO_REL.replaceAll(sep, '/'), deps: soloManifest.dependencies },
      ...(deepChannel === undefined ? {} : { deep: deepChannel }),
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
  return { treeDir: outDir, manifestPath, zipPath, deep: deepChannel, warnings }
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
 * forge patch 单行自插断言（五件零插行——组合缝激活）+ 五件各件自带插行断言
 * （solo 语义在五件侧）+ solo 变体 file: 剥离与单行自插正本一致 + deep 通道齐备
 * （deep:true 时）。
 */
export function verifyReleaseTree(treeDir, { repoRoot = REPO_ROOT, deep = true } = {}) {
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
  // forge 单行自插断言（1.4 裁定：五件零插行、一律经 host apply 组合激活——
  // 原「插行↔file: 对应」机检随单行自插退役；file: 兄弟形态检查保留为树完整性锚）
  const forgeTreeDir = join(treeDir, 'forge')
  const forgePkg = readJson(join(forgeTreeDir, 'package.json'))
  const patchRel = forgePkg.dsh?.bundle?.patch
  if (typeof patchRel !== 'string' || !existsSync(join(forgeTreeDir, patchRel))) {
    violations.push('forge: dsh.bundle.patch 缺声明或文件缺席')
  } else {
    const bareNames = patchInsertEntryNames(readFileSync(join(forgeTreeDir, patchRel), 'utf8'))
    if (bareNames.length !== 1 || bareNames[0] !== forgePkg.name) {
      violations.push(`forge: patch 非单行自插（期望恰 ['${forgePkg.name}']，实际 [${bareNames.join(', ')}]）——五件零插行（组合缝激活）`)
    }
    for (const [depName, spec] of Object.entries(forgePkg.dependencies ?? {})) {
      if (spec.startsWith('file:') && !spec.startsWith('file:../')) violations.push(`forge: 依赖非发布树相对 file: 形态 ${depName} "${spec}"`)
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
      if (soloNames.length !== 1 || soloNames[0] !== soloPkg.name) {
        violations.push(`solo: forge patch 非单行自插（期望恰 ['${soloPkg.name}']，实际 [${soloNames.join(', ')}]）——裸名行形态退役`)
      } else {
        const sourceForgeDir = sourceByName.get(forgePkg.name)
        const sourceForgePkg = sourceForgeDir !== undefined ? readJson(join(sourceForgeDir, 'package.json')) : undefined
        const sourcePatchRel = sourceForgePkg?.dsh?.bundle?.patch
        if (typeof sourcePatchRel === 'string') {
          const sourceText = readFileSync(join(sourceForgeDir, sourcePatchRel), 'utf8')
          const soloText = readFileSync(join(soloDir, soloPatchRel), 'utf8')
          if (patchInsertEntryNames(sourceText).join('|') !== patchInsertEntryNames(soloText).join('|')) {
            violations.push('solo: 单行自插清单与源正本漂移')
          }
        }
      }
    }
    violations.push(...verifyPackageFields(soloDir, 'solo/forge'))
  }
  // deep 通道（deep:true 时齐备性机检——staging 依赖面零 file:/零 @dsh-forge/*，
  // 详审由 deep-build 内置审计承担，此处只做通道齐备与依赖面轻检）
  if (deep) {
    const deepDir = join(treeDir, DEEP_REL)
    const deepMeta = manifest.channels?.deep
    if (deepMeta === undefined) {
      violations.push('deep: manifest channels.deep 缺席（tgz 主通道未声明）')
    } else if (!existsSync(join(treeDir, deepMeta.tgz ?? ''))) {
      violations.push(`deep: tgz 产物缺席（${deepMeta.tgz}）`)
    }
    const stagingPkgPath = join(deepDir, 'package', 'package.json')
    if (!existsSync(stagingPkgPath)) {
      violations.push('deep: staging package.json 缺席（deep-build 产物未收录）')
    } else {
      const stagingPkg = readJson(stagingPkgPath)
      if (stagingPkg.version !== forgePkg.version) violations.push(`deep: 版本漂移 staging=${stagingPkg.version} vs forge=${forgePkg.version}`)
      for (const [name, spec] of Object.entries(stagingPkg.dependencies ?? {})) {
        if (spec.startsWith('file:')) violations.push(`deep: staging 残留 file: 依赖 ${name} "${spec}"`)
        if (name.startsWith('@dsh-forge/')) violations.push(`deep: staging 残留 @dsh-forge/* 依赖 ${name}（组合缝激活——plain dependency 不进层）`)
      }
      for (const rel of ['dist/host/index.js', 'dist/client.js', 'cordis.patch.yml']) {
        if (!existsSync(join(deepDir, 'package', rel))) violations.push(`deep: staging 文件缺席 ${rel}`)
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
  const deep = !argv.includes('--no-deep')
  const repoRoot = rootFlag !== undefined ? resolve(rootFlag) : REPO_ROOT
  const outDir = outFlag !== undefined ? resolve(outFlag) : DEFAULT_OUT
  const { treeDir, manifestPath, zipPath } = assembleRelease({ repoRoot, outDir, zip, deep })
  const violations = verifyReleaseTree(treeDir, { repoRoot, deep })
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
