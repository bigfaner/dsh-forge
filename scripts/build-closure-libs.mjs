#!/usr/bin/env node
/**
 * build-closure-libs.mjs — fresh host-face build of ONLY the vendored closure
 * packages, inside the upstream checkout (fix-3 companion).
 *
 * Why not `pnpm run build:lib:host` (repo-wide)? It is the source of truth,
 * but a long-lived checkout accumulates partially-stale build state in
 * packages OUTSIDE our closure (observed: session-persistence-jsonl,
 * session-persistence-sqlite, dsh-root) and one stale package fails the whole
 * repo-wide tsdown run. This script runs the same two steps scoped to the
 * lock's closure set (+ install-time .closure-supplements):
 *   1. `tsc -b tsconfig.host.json` at the upstream root — incremental, also
 *      builds closure dependencies outside the lock set; must succeed.
 *   2. per package: `tsdown --env.DSH_BUILD_FACE host` (skipped when the
 *      package has no tsdown.config.ts). Any failure fails the run (no silent
 *      skips — install-host-closure's canary depends on this).
 *
 * Usage:
 *   node scripts/build-closure-libs.mjs [--upstream <path>]
 * Env: DSH_FORGE_UPSTREAM overrides the checkout path.
 * Exit 0 on success; 1 on failure.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const UPSTREAM_DEFAULT = 'Z:/project/github/deepseek-harness'
const args = process.argv.slice(2)
let upstream = process.env.DSH_FORGE_UPSTREAM ?? UPSTREAM_DEFAULT
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--upstream') upstream = args[++i]
}
const repoRoot = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const lock = JSON.parse(readFileSync(join(repoRoot, 'vendor', 'upstream.lock.json'), 'utf8'))
const run = (command, cmdArgs, cwd, label) => {
  const result = spawnSync(command, cmdArgs, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.status !== 0) { console.error(`${label} failed (exit ${String(result.status)})`); process.exit(1) }
}

// Closure package dirs: lock packages + install-time supplements (mapped by
// package name to their upstream dir, same scan as install-host-closure).
const dirs = [...lock.packages.map(p => p.dir)]
const nameToDir = new Map()
const scan = (dir, depth) => {
  let entries
  try { entries = readdirSync(join(upstream, ...dir.split('/')), { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name === 'lib') continue
    const rel = `${dir}/${entry.name}`
    const manifest = join(upstream, ...rel.split('/'), 'package.json')
    if (existsSync(manifest)) {
      try { nameToDir.set(JSON.parse(readFileSync(manifest, 'utf8')).name, rel) } catch { /* unreadable manifest — skip */ }
    }
    if (depth < 2) scan(rel, depth + 1)
  }
}
for (const g of ['apps', 'packages', 'vendor', 'native/system/packages']) scan(g, g === 'native/system/packages' ? 1 : 0)
const supplementRoot = join(repoRoot, 'packages', 'desktop-host-vendor', 'vendored', '.closure-supplements')
if (existsSync(supplementRoot)) {
  for (const entry of readdirSync(supplementRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const name = `@${entry.name.replace('__', '/').replace('/', '-ai/')}`.replace(/^@@/, '@')
    // Directory naming from install-host-closure: scope__name → @scope/name
    const parts = entry.name.split('__')
    const pkgName = parts.length === 2 ? `@${parts[0]}/${parts[1]}` : entry.name
    const upstreamDir = nameToDir.get(pkgName)
    if (upstreamDir !== undefined) dirs.push(upstreamDir)
  }
}

// 1. Incremental type build (host face) — also refreshes lib/types inputs.
run('node', ['./node_modules/typescript/bin/tsc', '-b', 'tsconfig.host.json'], upstream, 'tsc -b tsconfig.host.json')

// 2. Per-package tsdown. Face rule: env-face configs (host/client branches)
//    build with --env.DSH_BUILD_FACE host; single-face "staticLinked" client
//    configs reject the env flag — retry plain tsdown for those. Both failing
//    is a real failure.
let built = 0
let skipped = 0
const failed = []
for (const dir of dirs) {
  const pkgDir = join(upstream, ...dir.split('/'))
  if (!existsSync(join(pkgDir, 'tsdown.config.ts'))) { skipped += 1; continue }
  const host = spawnSync('pnpm', ['exec', 'tsdown', '--env.DSH_BUILD_FACE', 'host'], { cwd: pkgDir, shell: process.platform === 'win32' })
  if (host.status === 0) { built += 1; continue }
  const plain = spawnSync('pnpm', ['exec', 'tsdown'], { cwd: pkgDir, shell: process.platform === 'win32' })
  if (plain.status === 0) { built += 1; continue }
  failed.push(dir)
  console.error(`TSDOWN_FAILED ${dir}`)
}
if (failed.length > 0) { console.error(`closure lib build failed for ${String(failed.length)} packages`); process.exit(1) }
console.log(`CLOSURE_LIBS_BUILT packages=${String(built)} skipped(no config)=${String(skipped)} (tsc -b incremental OK)`)
