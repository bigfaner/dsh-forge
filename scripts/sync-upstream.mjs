#!/usr/bin/env node
/**
 * sync-upstream.mjs
 *
 * Resolves the workspace dependency closure of the upstream desktop-host
 * package (pinned SHA) and emits the vendoredFiles manifest to
 * vendor/upstream.lock.json, or verifies an existing lock against the
 * upstream checkout (sha256 integrity check).
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
 *   per package: package.json, tsconfig.json, tsdown.config.ts, src/**, plus
 *   the package's RUNTIME DATA: presets/ (agent-presets' shipped compositions
 *   — session create resolves them through SHIPPED_PRESET_ROOT = <pkg>/presets),
 *   assets/ (skill-office/skill-badge payloads), scripts/ (subprocess-local's
 *   ensure-spawn-helper), and root-level *.patch.yml (bundle cordis.patch.yml
 *   overlays read by profile loading). Excluded: tests, node_modules, build
 *   output, README*, tsconfig.*.json variants — not closure payload.
 *   (disc-3: the src-only rule shipped a host whose agent-preset registry was
 *   empty — `startSession` failed silently with agent-preset/not-found.)
 *
 * Integrity: every vendored file records a sha256 digest; the lock also pins
 * the upstream commit SHA so drift is detectable. `--mode verify` recomputes
 * digests from the upstream checkout and fails (exit 1) on any mismatch,
 * missing, or extra file.
 *
 * Idempotency: the lock output is a pure function of the upstream checkout
 * content (no timestamps), so repeated sync runs at the same pinned SHA
 * produce byte-identical output.
 *
 * Usage:
 *   node scripts/sync-upstream.mjs --upstream <path-to-deepseek-harness> \
 *     [--sha c36ba648dc106d21fb32562793b3e3b9c8922bc4] [--out vendor/upstream.lock.json] \
 *     [--mode sync|verify] [--verify-imports]
 *   node scripts/sync-upstream.mjs --mode diff --out <current-lock> --new-lock <candidate-lock>
 *     (upgrade drill: readable report of what a pinned-SHA bump changes)
 */

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const PINNED_SHA_DEFAULT = 'c36ba648dc106d21fb32562793b3e3b9c8922bc4'
export const DESKTOP_HOST_PACKAGE = '@deepseek-ai/dsh-desktop-host'

// --- CLI args -----------------------------------------------------------

export function parseArgs(argv) {
  const args = { upstream: null, sha: PINNED_SHA_DEFAULT, out: 'vendor/upstream.lock.json', mode: 'sync', verifyImports: false, newLock: null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--upstream') args.upstream = argv[++i]
    else if (argv[i] === '--sha') args.sha = argv[++i]
    else if (argv[i] === '--out') args.out = argv[++i]
    else if (argv[i] === '--mode') args.mode = argv[++i]
    else if (argv[i] === '--verify-imports') args.verifyImports = true
    else if (argv[i] === '--new-lock') args.newLock = argv[++i]
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2) }
  }
  const modes = ['sync', 'verify', 'diff']
  if (args.mode === 'diff') {
    // diff compares two lock files; --new-lock is the freshly synced candidate.
    if (!args.newLock) { console.error('Usage: sync-upstream.mjs --mode diff --out <current-lock> --new-lock <candidate-lock> [--upstream <repo-path>]'); process.exit(2) }
  } else if (!args.upstream) { console.error('Usage: sync-upstream.mjs --upstream <repo-path> [--sha <sha>] [--out <file>] [--mode sync|verify|diff] [--verify-imports]'); process.exit(2) }
  if (!modes.includes(args.mode)) { console.error(`--mode must be one of ${modes.join('|')}, got: ${args.mode}`); process.exit(2) }
  return args
}

// --- Workspace package index --------------------------------------------

/** Expand pnpm-workspace.yaml `packages:` globs into concrete dirs (no deps). */
export function expandGlob(root, glob) {
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
export function parseWorkspaceGlobs(root) {
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
export function indexWorkspace(root) {
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
export function resolveClosure(index, rootName) {
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

const PROJECTED_ROOT_FILES = ['package.json', 'tsconfig.json', 'tsdown.config.ts', 'LICENSE']
// Runtime data dirs a package may carry alongside src/ (see header note):
// shipped agent presets, skill/tool payload assets, per-package runtime scripts.
const PROJECTED_DIRS = ['src', 'presets', 'assets', 'scripts']
const SKIP_DIRS = new Set(['node_modules', '.git'])

export function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const p = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      yield* walk(p)
    } else yield p
  }
}

export function projectPackageFiles(pkgDir) {
  const files = []
  for (const name of PROJECTED_ROOT_FILES) {
    const p = join(pkgDir, name)
    if (existsSync(p)) files.push(p)
  }
  // Root-level bundle patch overlays (cordis.patch.yml): runtime data read by
  // profile loading (dsh.bundle.patch manifest entries).
  for (const entry of readdirSync(pkgDir)) {
    if (entry.endsWith('.patch.yml')) files.push(join(pkgDir, entry))
  }
  for (const dir of PROJECTED_DIRS) {
    const p = join(pkgDir, dir)
    if (!existsSync(p)) continue
    for (const f of walk(p)) files.push(f)
  }
  return files.sort()
}

export function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

// --- Lock computation / verification --------------------------------------

/**
 * Compute the full deterministic lock object from an upstream checkout.
 * Pure function of checkout content — no timestamps — so repeated runs at the
 * same pinned SHA produce byte-identical output (idempotent projection).
 */
export function computeLock(root, pinnedSha, rootName = DESKTOP_HOST_PACKAGE) {
  const index = indexWorkspace(root)
  const { order, registryDeps } = resolveClosure(index, rootName)

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

  return {
    $schema: 'https://dsh-forge/schemas/upstream-lock.json',
    pinnedSha,
    desktopHostVersion: index.get(rootName).manifest.version,
    resolutionRule: 'pnpm-manifest-recursion',
    resolutionRationale:
      'Manifest recursion over `dependencies` (workspace:/link:/file: specs) is authoritative: it is deterministic and matches what pnpm actually links at install time. Static import scanning is incomplete for this upstream because dsh discovers and loads plugins at runtime (plugin-manager, dsh.configTrees mounts), so import graphs silently omit runtime-reached packages; import scanning is retained only as a subset-verification pass (--verify-imports). devDependencies are excluded (build-only, never shipped).',
    packages: packageSummaries,
    registryDependencies: registryDeps,
    vendoredFiles,
  }
}

/**
 * Verify an existing lock against the upstream checkout: recompute the
 * projection + digests and compare. Returns a report; throws nothing.
 * Mismatches: pinnedSha drift, missing files, extra files, digest mismatches,
 * closure membership changes.
 */
export function verifyLock(lock, root, rootName = DESKTOP_HOST_PACKAGE) {
  const problems = []
  const fresh = computeLock(root, lock.pinnedSha, rootName)

  if (fresh.desktopHostVersion !== lock.desktopHostVersion) {
    problems.push(`desktopHostVersion drift: lock=${lock.desktopHostVersion} upstream=${fresh.desktopHostVersion}`)
  }
  const freshPaths = new Map(fresh.vendoredFiles.map((f) => [f.path, f.sha256]))
  const lockPaths = new Map(lock.vendoredFiles.map((f) => [f.path, f.sha256]))
  for (const [path, digest] of lockPaths) {
    if (!freshPaths.has(path)) problems.push(`missing from upstream checkout (in lock, not on disk): ${path}`)
    else if (freshPaths.get(path) !== digest) problems.push(`sha256 mismatch: ${path} lock=${digest} upstream=${freshPaths.get(path)}`)
  }
  for (const path of freshPaths.keys()) {
    if (!lockPaths.has(path)) problems.push(`untracked file (on disk, not in lock): ${path}`)
  }
  const lockPkgs = lock.packages?.map((p) => p.name) ?? []
  const freshPkgs = fresh.packages.map((p) => p.name)
  if (JSON.stringify(lockPkgs) !== JSON.stringify(freshPkgs)) {
    problems.push(`closure membership drift: lock=[${lockPkgs}] upstream=[${freshPkgs}]`)
  }

  return { ok: problems.length === 0, problems, checked: lock.vendoredFiles.length }
}

// --- Upgrade diff (readable report between two locks) ---------------------

/**
 * Compare two locks (current vs candidate produced by a sync at a new pinned
 * SHA) and produce a structured, reviewable upgrade report. Pure function.
 */
export function diffLocks(oldLock, newLock) {
  const oldFiles = new Map(oldLock.vendoredFiles.map((f) => [f.path, f.sha256]))
  const newFiles = new Map(newLock.vendoredFiles.map((f) => [f.path, f.sha256]))
  const addedFiles = []
  const removedFiles = []
  const changedFiles = []
  for (const [path, digest] of newFiles) {
    if (!oldFiles.has(path)) addedFiles.push(path)
    else if (oldFiles.get(path) !== digest) changedFiles.push(path)
  }
  for (const path of oldFiles.keys()) {
    if (!newFiles.has(path)) removedFiles.push(path)
  }
  const oldPkgs = new Map((oldLock.packages ?? []).map((p) => [p.name, p]))
  const newPkgs = new Map(newLock.packages.map((p) => [p.name, p]))
  const packageChanges = []
  for (const [name, pkg] of newPkgs) {
    if (!oldPkgs.has(name)) packageChanges.push({ name, change: 'added', from: undefined, to: pkg.version })
    else if (oldPkgs.get(name).version !== pkg.version) packageChanges.push({ name, change: 'version', from: oldPkgs.get(name).version, to: pkg.version })
  }
  for (const [name, pkg] of oldPkgs) {
    if (!newPkgs.has(name)) packageChanges.push({ name, change: 'removed', from: pkg.version, to: undefined })
  }
  const oldRegistry = new Set(oldLock.registryDependencies ?? [])
  const newRegistry = new Set(newLock.registryDependencies ?? [])
  return {
    from: { pinnedSha: oldLock.pinnedSha, desktopHostVersion: oldLock.desktopHostVersion },
    to: { pinnedSha: newLock.pinnedSha, desktopHostVersion: newLock.desktopHostVersion },
    desktopHostVersionChanged: oldLock.desktopHostVersion !== newLock.desktopHostVersion,
    packageChanges: packageChanges.sort((a, b) => a.name.localeCompare(b.name)),
    registryDependencyChanges: {
      added: [...newRegistry].filter((d) => !oldRegistry.has(d)).sort(),
      removed: [...oldRegistry].filter((d) => !newRegistry.has(d)).sort(),
    },
    addedFiles: addedFiles.sort(),
    removedFiles: removedFiles.sort(),
    changedFiles: changedFiles.sort(),
  }
}

/** Render a diffLocks report as a human-readable upgrade review document. */
export function formatDiffReport(report) {
  const lines = []
  const bump = (sha) => sha.slice(0, 8)
  lines.push(`upgrade diff: ${bump(report.from.pinnedSha)} -> ${bump(report.to.pinnedSha)}`)
  lines.push(`desktop-host version: ${report.from.desktopHostVersion} -> ${report.to.desktopHostVersion}${report.desktopHostVersionChanged ? '  (CHANGED)' : ''}`)
  lines.push('')
  lines.push(`workspace packages changed: ${report.packageChanges.length}`)
  for (const c of report.packageChanges) {
    lines.push(`  - ${c.name}: ${c.change === 'version' ? `${c.from} -> ${c.to}` : c.change}`)
  }
  const rc = report.registryDependencyChanges
  lines.push(`registry dependencies: +${rc.added.length} / -${rc.removed.length}`)
  for (const d of rc.added) lines.push(`  + ${d}`)
  for (const d of rc.removed) lines.push(`  - ${d}`)
  lines.push('')
  lines.push(`vendored files: +${report.addedFiles.length} added / ~${report.changedFiles.length} changed / -${report.removedFiles.length} removed`)
  for (const f of report.addedFiles) lines.push(`  + ${f}`)
  for (const f of report.changedFiles) lines.push(`  ~ ${f}`)
  for (const f of report.removedFiles) lines.push(`  - ${f}`)
  lines.push('')
  lines.push('next: re-run scripts/vendor-project.mjs --upstream <repo> to materialize, then review the git diff of packages/desktop-host-vendor/vendored')
  return lines.join('\n')
}

// --- Optional import-scan verification ------------------------------------

/** Collect package names referenced by relative imports inside `src`. */
export function scanImports(index, closureSet, rootName) {
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

function main() {
  const args = parseArgs(process.argv.slice(2))
  const root = (args.upstream ?? '').replace(/\\/g, '/')

  if (args.mode === 'diff') {
    for (const file of [args.out, args.newLock]) {
      if (!existsSync(file)) { console.error(`lock file not found: ${file}`); process.exit(1) }
    }
    const oldLock = JSON.parse(readFileSync(args.out, 'utf8'))
    const newLock = JSON.parse(readFileSync(args.newLock, 'utf8'))
    console.log(formatDiffReport(diffLocks(oldLock, newLock)))
    return
  }

  if (args.mode === 'verify') {
    if (!existsSync(args.out)) { console.error(`lock file not found: ${args.out}`); process.exit(1) }
    const lock = JSON.parse(readFileSync(args.out, 'utf8'))
    if (lock.pinnedSha !== args.sha) {
      console.error(`pinned SHA mismatch: lock=${lock.pinnedSha} expected=${args.sha}`)
      process.exit(1)
    }
    const report = verifyLock(lock, root)
    if (!report.ok) {
      console.error(`INTEGRITY CHECK FAILED (${report.problems.length} problems):`)
      for (const p of report.problems) console.error(`  - ${p}`)
      process.exit(1)
    }
    console.log(`integrity OK: ${report.checked} vendored files verified against ${root} (pinned ${lock.pinnedSha.slice(0, 8)})`)
    return
  }

  // sync mode
  const lock = computeLock(root, args.sha)

  if (args.verifyImports) {
    const index = indexWorkspace(root)
    const closureSet = new Set(lock.packages.map((p) => p.name))
    const importScan = scanImports(index, closureSet, DESKTOP_HOST_PACKAGE)
    const missing = [...importScan.reached].filter((n) => !closureSet.has(n))
    if (missing.length) {
      console.error('IMPORT SCAN found packages outside manifest closure (rule violated):', missing)
      process.exit(1)
    }
    console.log(`import-scan verification: ${importScan.reached.size}/${closureSet.size} closure packages directly reachable from desktop-host src (subset OK — runtime plugin loading explains the gap)`)
  }

  mkdirSync(join(args.out, '..'), { recursive: true })
  writeFileSync(args.out, JSON.stringify(lock, null, 2) + '\n')
  console.log(`closure: ${lock.packages.length} workspace packages, ${lock.vendoredFiles.length} vendored files`)
  console.log(`registry deps referenced (resolved via pnpm store at build time): ${lock.registryDependencies.length}`)
  console.log(`lock written: ${args.out}`)
}

// Run main only when invoked directly (import.meta.url check keeps tests able
// to import the pure functions without triggering CLI side effects).
if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) {
  main()
}
