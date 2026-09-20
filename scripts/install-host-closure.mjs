#!/usr/bin/env node
/**
 * install-host-closure.mjs — task disc-2: host dependency closure install.
 *
 * Installs the runtime dependency closure (registry deps + workspace links)
 * into the vendored upstream tree (packages/desktop-host-vendor/vendored) so
 * the desktop-host child process can actually boot. Scope decision (honest):
 *
 *   - The vendored projection contains the `dependencies`-only closure of the
 *     desktop-host (+ apps/web) per vendor/upstream.lock.json — devDependencies
 *     are deliberately excluded by the lock (build-only, never shipped), so we
 *     install with `pnpm install --prod` at the vendored root. A full
 *     (dev-inclusive) install is impossible here: 424 workspace devDependency
 *     references point at packages that are intentionally not vendored.
 *   - pnpm needs a workspace manifest at the vendored root; it is GENERATED
 *     here from the lock's package dirs (never committed — gitignored) and a
 *     minimal root package.json carrying the node-pty patchedDependency (the
 *     only upstream patch in the prod closure) plus the link: vendor overrides
 *     the upstream root lockfile applies.
 *   - Registry resolution is fresh (no lockfile): the upstream pnpm-lock.yaml
 *     covers the full upstream workspace and cannot validate against the
 *     pruned projection. The generated vendored pnpm-lock.yaml is a build
 *     artifact (gitignored) that pins the resolution for staging.
 *
 * Usage:
 *   node scripts/install-host-closure.mjs            (install; idempotent)
 *   node scripts/install-host-closure.mjs --check    (verify markers only)
 *
 * Exit 0 on success; 1 on failure.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, cpSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const LOCK_PATH = 'vendor/upstream.lock.json'
const VENDORED_ROOT = join('packages', 'desktop-host-vendor', 'vendored')
const UPSTREAM_DEFAULT = 'Z:/project/github/deepseek-harness'
// Only upstream patch whose target sits in the prod closure (node-pty);
// the other two upstream patches (osx-sign, pkg) are packaging/dev-only.
const PATCHES = ['node-pty@1.2.0-beta.15.patch']

const parseArgs = (argv) => {
  const args = { check: false, upstream: process.env.DSH_FORGE_UPSTREAM ?? UPSTREAM_DEFAULT }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--check') args.check = true
    else if (argv[i] === '--upstream') args.upstream = argv[++i]
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2) }
  }
  return args
}

const markerPaths = () => [
  join(VENDORED_ROOT, 'apps', 'desktop-host', 'node_modules'),
  join(VENDORED_ROOT, 'node_modules'),
  join(VENDORED_ROOT, 'packages', 'skill', 'skill-office', 'assets'),
]

export function checkClosure() {
  const problems = []
  for (const marker of markerPaths()) {
    if (!existsSync(marker)) problems.push(`missing: ${marker}`)
  }
  if (problems.length > 0) { console.error(`CLOSURE_CHECK_FAILED ${problems.join('; ')}`); return false }
  console.log('CLOSURE_CHECK_OK host dependency closure present in vendored tree')
  return true
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.check) { process.exit(checkClosure() ? 0 : 1) }

  const lock = JSON.parse(readFileSync(LOCK_PATH, 'utf8'))
  const dirs = lock.packages.map(p => p.dir)

  // 0b. Office-skills asset tree (disc-2): hard host-boot requirement of the
  //     upstream office plugin (assetRoot = dirname(argv[4])/office-skills).
  //     The lock's src-file projection excludes package assets/, so project
  //     them from the upstream checkout like the lib/ artifacts (gitignored).
  const officeAssetsSource = join(args.upstream, 'packages', 'skill', 'skill-office', 'assets')
  const officeAssetsTarget = join(VENDORED_ROOT, 'packages', 'skill', 'skill-office', 'assets')
  if (existsSync(officeAssetsSource)) {
    rmSync(officeAssetsTarget, { recursive: true, force: true })
    cpSync(officeAssetsSource, officeAssetsTarget, { recursive: true })
    console.log('OFFICE_SKILLS_PROJECTED packages/skill/skill-office/assets')
  } else {
    console.warn(`WARN: office-skills assets not found in the upstream checkout (${officeAssetsSource}) — host boot will fail at the office plugin`)
  }

  // 0. Runtime peer closure supplement. The lock's manifest recursion follows
  //    `dependencies` only, but upstream's built lib/ artifacts import their
  //    workspace PEERS at runtime (pnpm auto-installs peers upstream, and the
  //    packaged desktop ships them) — 25+ peer-only packages are therefore
  //    absent from the vendored projection. They are supplemented here from
  //    the upstream checkout (src + built lib + manifest) into a gitignored
  //    .closure-supplements/ dir registered as extra workspace projects.
  //    Lock-gap follow-up: teach sync-upstream's recursion to follow workspace
  //    peers so the supplement becomes tracked projection content.
  const supplementRoot = join(VENDORED_ROOT, '.closure-supplements')
  const readManifests = (root, dirList) => {
    const byDir = new Map()
    for (const dir of dirList) {
      const p = join(root, ...dir.split('/'), 'package.json')
      if (existsSync(p)) { try { byDir.set(dir, JSON.parse(readFileSync(p, 'utf8'))) } catch {} }
    }
    return byDir
  }
  const upstreamNameToDir = new Map()
  const scanUpstreamNames = () => {
    const globs = ['apps', 'packages', 'vendor', 'native/system/packages']
    const visit = (dir, depth) => {
      let entries
      try { entries = readdirSync(join(args.upstream, ...dir.split('/')), { withFileTypes: true }) } catch { return }
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name === 'lib') continue
        const rel = `${dir}/${entry.name}`
        const manifest = join(args.upstream, ...rel.split('/'), 'package.json')
        if (existsSync(manifest)) {
          try { upstreamNameToDir.set(JSON.parse(readFileSync(manifest, 'utf8')).name, rel) } catch {}
        }
        if (depth < 2) visit(rel, depth + 1)
      }
    }
    for (const g of globs) visit(g, g === 'native/system/packages' ? 1 : 0)
  }
  scanUpstreamNames()
  const supplementDirs = [] // entries: { name, upstreamDir, localDir }
  const supplementNames = new Set()
  for (let round = 0; round < 10; round++) {
    const manifests = readManifests(VENDORED_ROOT, [...dirs, ...supplementDirs.map(s => s.localDir)])
    const missing = new Set()
    for (const manifest of manifests.values()) {
      for (const section of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
        for (const [name, spec] of Object.entries(manifest[section] ?? {})) {
          if (typeof spec === 'string' && spec.startsWith('workspace:') && !upstreamNameToDir.has(name)) continue
          if (typeof spec === 'string' && spec.startsWith('workspace:')
            && !lock.packages.some(p => p.name === name) && !supplementNames.has(name)) missing.add(name)
        }
      }
    }
    if (missing.size === 0) break
    for (const name of missing) {
      const upstreamDir = upstreamNameToDir.get(name)
      if (upstreamDir === undefined) { console.warn(`WARN: runtime peer ${name} not found in upstream checkout — skipped`); supplementNames.add(name); continue }
      supplementNames.add(name)
      supplementDirs.push({ name, upstreamDir, localDir: `.closure-supplements/${name.replace(/^@/u, '').replace(/\//gu, '__')}` })
    }
  }
  rmSync(supplementRoot, { recursive: true, force: true })
  for (const s of supplementDirs) {
    const target = join(VENDORED_ROOT, ...s.localDir.split('/'))
    mkdirSync(target, { recursive: true })
    for (const part of ['package.json', 'src', 'tsconfig.json']) {
      const from = join(args.upstream, ...s.upstreamDir.split('/'), part)
      if (existsSync(from)) cpSync(from, join(target, part), { recursive: true })
    }
  }
  if (supplementDirs.length > 0) console.log(`CLOSURE_SUPPLEMENTS projected=${supplementDirs.length} (${supplementDirs.map(s => s.name).join(', ')})`)

  const allDirs = [...dirs, ...supplementDirs.map(s => s.localDir)]

  // 1. Generated (gitignored) pnpm workspace manifest at the vendored root.
  const workspaceYaml = ['# GENERATED by scripts/install-host-closure.mjs — do not commit', 'packages:']
  for (const dir of allDirs.sort()) workspaceYaml.push(`  - ${dir}`)
  // Registry deps in the prod closure with native/binary install scripts
  // (pnpm >=10 reads onlyBuiltDependencies from the workspace manifest).
  workspaceYaml.push('onlyBuiltDependencies:', ...['koffi', 'node-pty', 'protobufjs', '@google/genai', 'sharp', '@vscode/ripgrep', 'esbuild'].map(name => `  - '${name}'`))
  // pnpm >=11 allowBuilds map (explicit per-dependency approval).
  const allowNames = ['koffi', 'node-pty', 'protobufjs', '@google/genai', 'sharp', '@vscode/ripgrep', 'esbuild']
  workspaceYaml.push('allowBuilds:')
  for (const name of allowNames) workspaceYaml.push(`  '${name}': true`)
  writeFileSync(join(VENDORED_ROOT, 'pnpm-workspace.yaml'), `${workspaceYaml.join('\n')}\n`)

  // 2. Minimal root package.json: node-pty patch + upstream link overrides.
  mkdirSync(join(VENDORED_ROOT, 'patches'), { recursive: true })
  const patchedDependencies = {}
  for (const patch of PATCHES) {
    copyFileSync(join(args.upstream, 'patches', patch), join(VENDORED_ROOT, 'patches', patch))
    const name = patch.slice(0, patch.indexOf('@', 1))
    const version = patch.slice(patch.indexOf('@', 1) + 1).replace(/\.patch$/, '')
    patchedDependencies[`${name}@${version}`] = `patches/${patch}`
  }
  writeFileSync(join(VENDORED_ROOT, 'package.json'), `${JSON.stringify({
    name: '@dsh-forge/vendored-host-closure',
    version: '0.0.0',
    private: true,
    pnpm: {
      patchedDependencies,
      overrides: {
        '@deepseek-ai/cosmokit': 'link:vendor/cosmokit',
        '@deepseek-ai/schemastery': 'link:vendor/schemastery',
      },
    },
  }, undefined, 2)}\n`)

  // 3a. Stage install-time helper scripts the file projection omits: the
  //     subprocess-local postinstall (chmod node-pty's prebuilt spawn-helper)
  //     exists only in the upstream checkout — the lock projects src files,
  //     not per-package scripts/. Copied in (gitignored), not committed.
  //     Same for the bundles' cordis.patch.yml overlay files: runtime data
  //     read by profile loading (dsh.bundle.patch manifest entries), outside
  //     the lock's src-file projection.
  const helperScripts = [
    ['packages/subprocess/subprocess-local/scripts/ensure-spawn-helper.mjs', 'packages/subprocess/subprocess-local/scripts/ensure-spawn-helper.mjs'],
  ]
  for (const dir of allDirs) {
    const upstreamDir = supplementDirs.find(s => s.localDir === dir)?.upstreamDir ?? dir
    const upstreamPkgDir = join(args.upstream, ...upstreamDir.split('/'))
    let entries
    try { entries = readdirSync(upstreamPkgDir) } catch { continue }
    for (const entry of entries.filter(name => name.endsWith('.patch.yml'))) {
      copyFileSync(join(upstreamPkgDir, entry), join(VENDORED_ROOT, ...dir.split('/'), entry))
    }
  }
  for (const [from, to] of helperScripts) {
    const target = join(VENDORED_ROOT, ...to.split('/'))
    mkdirSync(join(target, '..'), { recursive: true })
    copyFileSync(join(args.upstream, ...from.split('/')), target)
  }

  // 3. Temporarily strip devDependencies (and workspace peers pointing at
  //    packages outside the projection) from the vendored manifests: pnpm
  //    validates workspace: specifiers in ALL sections even under --prod, and
  //    the lock's dev-exclusion means ~424 such references are unresolvable
  //    here. Originals are backed up and restored after the install window.
  const workspaceNames = new Set([...lock.packages.map(p => p.name), ...supplementDirs.map(s => s.name)])
  const backupDir = join(VENDORED_ROOT, '.closure-install-backup')
  const manifestPaths = allDirs.map(dir => join(VENDORED_ROOT, ...dir.split('/'), 'package.json')).filter(p => existsSync(p))
  rmSync(backupDir, { recursive: true, force: true })
  mkdirSync(backupDir, { recursive: true })
  const stripManifest = (path) => {
    const original = readFileSync(path, 'utf8')
    writeFileSync(join(backupDir, Buffer.from(path).toString('base64url')), original)
    const json = JSON.parse(original)
    delete json.devDependencies
    for (const section of ['peerDependencies', 'optionalDependencies']) {
      if (json[section] === undefined) continue
      for (const name of Object.keys(json[section])) {
        const spec = json[section][name]
        if (typeof spec === 'string' && spec.startsWith('workspace:') && !workspaceNames.has(name)) delete json[section][name]
      }
      if (Object.keys(json[section]).length === 0) delete json[section]
    }
    writeFileSync(path, `${JSON.stringify(json, undefined, 2)}\n`)
  }
  const restoreManifests = () => {
    for (const path of manifestPaths) {
      const backup = join(backupDir, Buffer.from(path).toString('base64url'))
      if (existsSync(backup)) copyFileSync(backup, path)
    }
  }
  for (const path of manifestPaths) stripManifest(path)

  // 4. Fresh prod-only install at the vendored root.
  let installStatus = -1
  try {
    const install = spawnSync('pnpm', ['install', '--prod'], { cwd: VENDORED_ROOT, stdio: 'inherit', shell: process.platform === 'win32' })
    installStatus = install.status ?? -1
  } finally {
    restoreManifests()
    rmSync(backupDir, { recursive: true, force: true })
  }
  if (installStatus !== 0) { console.error('closure install failed (vendored manifests restored)'); process.exit(1) }

  if (!checkClosure()) process.exit(1)

  // 5. Project built workspace lib/ artifacts from the upstream checkout:
  //    the vendored manifests' exports point at lib/*.js (upstream ships
  //    built packages), so the host entry — which imports workspace packages
  //    through node_modules links — cannot resolve anything without them.
  //    The vendored tree cannot build them itself (devDeps are excluded by
  //    the lock), so the upstream checkout's build output (build:lib host +
  //    client faces) is projected in as a build artifact, like the web dist.
  let libPackages = 0
  let libBytes = 0
  for (const dir of allDirs) {
    const upstreamDir = supplementDirs.find(s => s.localDir === dir)?.upstreamDir ?? dir
    const sourceLib = join(args.upstream, ...upstreamDir.split('/'), 'lib')
    if (!existsSync(sourceLib)) continue
    const targetLib = join(VENDORED_ROOT, ...dir.split('/'), 'lib')
    cpSync(sourceLib, targetLib, { recursive: true })
    libPackages += 1
    const size = (d) => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const full = join(d, entry.name)
        if (entry.isDirectory()) size(full)
        else if (entry.isFile()) libBytes += statSync(full).size
      }
    }
    size(targetLib)
  }
  console.log(`WORKSPACE_LIBS_PROJECTED packages=${libPackages} bytes=${libBytes} (${(libBytes / 1024 / 1024).toFixed(1)}MB)`)


  // 4. Closure size report (staging budget signal).
  let closureBytes = 0
  let closureFiles = 0
  const measure = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) measure(full)
      else if (entry.isFile()) { closureFiles += 1; closureBytes += statSync(full).size }
    }
  }
  for (const marker of markerPaths()) measure(marker)
  console.log(`CLOSURE_INSTALLED files=${closureFiles} bytes=${closureBytes} (${(closureBytes / 1024 / 1024).toFixed(1)}MB)`)
}

main()
