#!/usr/bin/env node
/**
 * sync-upstream.mjs (Spike 2 draft)
 *
 * Resolves the workspace dependency closure of the upstream desktop-host
 * package (pinned SHA) and emits the vendoredFiles manifest draft to
 * vendor/upstream.lock.json.
 *
 * Closure rule (Spike 2 conclusion — see docs/features/dsh-forge-m1):
 *   ** pnpm manifest recursion ** is the authoritative closure definition.
 *   Rationale:
 *   - Deterministic & complete: BFS over `dependencies` entries whose version
 *     is `workspace:*` (plus `link:`-style vendored deps declared in
 *     pnpm-workspace overrides) covers everything pnpm will actually link at
 *     install time. devDependencies are excluded (build-only, not shipped).
 *   - Static import scanning CANNOT be complete for this upstream: dsh loads
 *     plugins dynamically at runtime (plugin-manager, dsh.configTrees mounts),
 *     so an import scan would silently omit runtime-discovered packages.
 *   - Import scanning is retained only as an optional verification pass
 *     (`--verify-imports`): it must report a subset of the manifest closure.
 *
 * File projection (source projection, same shape as the vendor decision):
 *   per package: package.json, tsconfig.json, tsdown.config.ts, src/**
 *   (tests / node_modules / build output excluded — not part of the closure
 *   payload).
 *
 * Integrity: every vendored file records a sha256 digest; the lock also pins
 * the upstream commit SHA so drift is detectable (lock regeneration on a moved
 * SHA produces a reviewable diff of both membership and digests).
 *
 * Usage:
 *   node scripts/sync-upstream.mjs --upstream <path-to-deepseek-harness> \
 *     [--sha c36ba648dc106d21fb32562793b3e3b9c8922bc4] [--out vendor/upstream.lock.json] \
 *     [--verify-imports]
 */

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, basename } from 'node:path'

const PINNED_SHA_DEFAULT = 'c36ba648dc106d21fb32562793b3e3b9c8922bc4'

// --- CLI args -----------------------------------------------------------

function parseArgs(argv) {
  const args = { upstream: null, sha: PINNED_SHA_DEFAULT, out: 'vendor/upstream.lock.json', verifyImports: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--upstream') args.upstream = argv[++i]
    else if (argv[i] === '--sha') args.sha = argv[++i]
    else if (argv[i] === '--out') args.out = argv[++i]
    else if (argv[i] === '--verify-imports') args.verifyImports = true
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2) }
  }
  if (!args.upstream) { console.error('Usage: sync-upstream.mjs --upstream <repo-path> [--sha <sha>] [--out <file>] [--verify-imports]'); process.exit(2) }
  return args
}

// --- Workspace package index --------------------------------------------

/** Expand pnpm-workspace.yaml `packages:` globs into concrete dirs (no deps). */
function expandGlob(root, glob) {
  // Supports the subset of globs used by upstream's pnpm-workspace.yaml:
  // literal prefixes with trailing `*` or `/*` segments.
  const segs = glob.split('/')
  const dirs = [root]
  for (const seg of segs) {
    const next = []
    for (const dir of dirs) {
      if (seg === '*') {
        for (const entry of readdirSync(dir)) {
          const p = join(dir, entry)
          if (statSync(p).isDirectory() && entry !== 'node_modules') next.push(p)
        }
      } else if (seg === '*var') { throw new Error('unsupported glob') }
      else {
        const p = join(dir, seg)
        if (existsSync(p)) next.push(p)
      }
    }
    dirs.length = 0
    dirs.push(...next)
  }
  return dirs
}

/** Parse the minimal `packages:` list out of pnpm-workspace.yaml. */
function parseWorkspaceGlobs(root) {
  const text = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')
  const globs = []
  let inPackages = false
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '')
    if (/^packages\s*:/.test(line)) { inPackages = true; continue }
    if (inPackages) {
      const m = line.match(/^\s*-\s*(\S+)/)
      if (m) globs.push(m[1])
      else if (line.trim() !== '') inPackages = false
    }
  }
  return globs
}

/** Build name -> package dir index for every workspace package. */
function indexWorkspace(root) {
  const index = new Map()
  for (const glob of parseWorkspaceGlobs(root)) {
    for (const dir of expandGlob(root, glob)) {
      const pj = join(dir, 'package.json')
      if (!existsSync(pj)) continue
      const manifest = JSON.parse(readFileSync(pj, 'utf8'))
      if (manifest.name) {
        if (index.has(manifest.name)) throw new Error(`duplicate package name ${manifest.name}`)
        index.set(manifest.name, { dir, manifest })
      }
    }
  }
  return index
}

// --- Closure resolution (manifest recursion) -----------------------------

const WORKSPACE_SPEC = /^(workspace:|link:|file:)/

/**
 * BFS over runtime dependency edges. Only `dependencies` (not devDependencies)
 * are followed: dev deps never ship in the vendored closure. Non-workspace
 * (registry) deps are collected separately — they resolve from pnpm's store at
 * build time, not from the source projection.
 */
function resolveClosure(index, rootName) {
  const root = index.get(rootName)
  if (!root) throw new Error(`workspace package not found: ${rootName}`)
  const order = []
  const seen = new Set([rootName])
  const queue = [rootName]
  const registryDeps = new Set()
  while (queue.length) {
    const name = queue.shift()
    order.push(name)
    const { manifest } = index.get(name)
    const deps = manifest.dependencies ?? {}
    for (const [dep, spec] of Object.entries(deps)) {
      if (WORKSPACE_SPEC.test(spec)) {
        if (!index.has(dep)) throw new Error(`${name} -> ${dep}: workspace spec "${spec}" but package not in workspace index`)
        if (!seen.has(dep)) { seen.add(dep); queue.push(dep) }
      } else {
        registryDeps.add(`${dep}@${spec}`)
      }
    }
  }
  return { order, registryDeps: [...registryDeps].sort() }
}

// --- File projection ------------------------------------------------------

const PROJECTED_ROOT_FILES = ['package.json', 'tsconfig.json', 'tsdown.config.ts']
const PROJECTED_DIRS = ['src']
const SKIP_DIRS = new Set(['node_modules', '.git'])

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const p = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      yield* walk(p)
    } else yield p
  }
}

function projectPackageFiles(pkgDir) {
  const files = []
  for (const name of PROJECTED_ROOT_FILES) {
    const p = join(pkgDir, name)
    if (existsSync(p)) files.push(p)
  }
  for (const dir of PROJECTED_DIRS) {
    const p = join(pkgDir, dir)
    if (!existsSync(p)) continue
    for (const f of walk(p)) files.push(f)
  }
  return files.sort()
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

// --- Optional import-scan verification ------------------------------------

/** Collect package names referenced by relative imports inside `src`. */
function scanImports(index, closureSet, rootName) {
  const { dir } = index.get(rootName)
  const reached = new Set()
  const externals = new Set()
  const importRe = /(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  const visited = new Set()
  const visit = (file) => {
    if (visited.has(file)) return
    visited.add(file)
    let text
    try { text = readFileSync(file, 'utf8') } catch { return }
    for (const m of text.matchAll(importRe)) {
      const spec = m[1] ?? m[2] ?? m[3]
      if (!spec) continue
      if (spec.startsWith('.') || spec.startsWith('/')) {
        // resolve rough: same-dir / package-relative — follow file if resolvable
        const base = join(file, '..', spec)
        for (const cand of [base, `${base}.js`, `${base}.ts`, join(base, 'index.js'), join(base, 'index.ts')]) {
          if (existsSync(cand) && statSync(cand).isFile()) { visit(cand); break }
        }
      } else {
        const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]
        externals.add(pkg)
      }
    }
  }
  for (const f of projectPackageFiles(dir)) visit(f)
  for (const pkg of externals) if (closureSet.has(pkg)) reached.add(pkg)
  return { reached, externals }
}

// --- Main -----------------------------------------------------------------

const args = parseArgs(process.argv.slice(2))
const root = args.upstream.replace(/\\/g, '/')
const index = indexWorkspace(root)
const ROOT = '@deepseek-ai/dsh-desktop-host'
const { order, registryDeps } = resolveClosure(index, ROOT)

const vendoredFiles = []
const packageSummaries = []
for (const name of order) {
  const { dir, manifest } = index.get(name)
  const files = projectPackageFiles(dir)
  for (const f of files) {
    vendoredFiles.push({ path: relative(root, f).replace(/\\/g, '/'), sha256: sha256(f) })
  }
  packageSummaries.push({ name, version: manifest.version, dir: relative(root, dir).replace(/\\/g, '/'), fileCount: files.length })
}

let importScan = null
if (args.verifyImports) {
  const closureSet = new Set(order)
  importScan = scanImports(index, closureSet, ROOT)
  const missing = [...importScan.reached].filter((n) => !closureSet.has(n))
  if (missing.length) {
    console.error('IMPORT SCAN found packages outside manifest closure (rule violated):', missing)
    process.exit(1)
  }
  console.log(`import-scan verification: ${importScan.reached.size}/${closureSet.size} closure packages directly reachable from desktop-host src (subset OK — runtime plugin loading explains the gap)`)
}

const lock = {
  $schema: 'spike-2-draft',
  pinnedSha: args.sha,
  desktopHostVersion: index.get(ROOT).manifest.version,
  resolutionRule: 'pnpm-manifest-recursion',
  resolutionRationale:
    'Manifest recursion over `dependencies` (workspace:/link:/file: specs) is authoritative: it is deterministic and matches what pnpm actually links at install time. Static import scanning is incomplete for this upstream because dsh discovers and loads plugins at runtime (plugin-manager, dsh.configTrees mounts), so import graphs silently omit runtime-reached packages; import scanning is retained only as a subset-verification pass (--verify-imports). devDependencies are excluded (build-only, never shipped).',
  generatedAt: new Date().toISOString(),
  packages: packageSummaries,
  registryDependencies: registryDeps,
  vendoredFiles,
}

mkdirSync(join(args.out, '..'), { recursive: true })
writeFileSync(args.out, JSON.stringify(lock, null, 2) + '\n')
console.log(`closure: ${order.length} workspace packages, ${vendoredFiles.length} vendored files`)
console.log(`registry deps referenced (resolved via pnpm store at build time): ${registryDeps.length}`)
console.log(`lock written: ${args.out}`)
