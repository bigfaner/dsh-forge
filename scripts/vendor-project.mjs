#!/usr/bin/env node
/**
 * vendor-project.mjs
 *
 * Materializes the vendored upstream source projection into
 * packages/desktop-host-vendor/vendored/, strictly driven by
 * vendor/upstream.lock.json (pinned SHA c36ba648).
 *
 * Rules:
 *   - Every file in `lock.vendoredFiles` is copied from the upstream checkout
 *     into `<target>/<upstream-relative-path>` after verifying its sha256
 *     against the lock. A mismatch aborts the whole run (no partial trees).
 *   - Files under `<target>` that are not in the lock are pruned, so the tree
 *     is a pure function of (upstream checkout, lock) — idempotent projection.
 *   - `--check` verifies an already-materialized tree without writing.
 *
 * Usage:
 *   node scripts/vendor-project.mjs --upstream <path-to-deepseek-harness> \
 *     [--lock vendor/upstream.lock.json] \
 *     [--target packages/desktop-host-vendor/vendored] [--check]
 */

import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

export function parseArgs(argv) {
  const args = {
    upstream: null,
    lock: 'vendor/upstream.lock.json',
    target: 'packages/desktop-host-vendor/vendored',
    check: false,
  }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--upstream') args.upstream = argv[++i]
    else if (argv[i] === '--lock') args.lock = argv[++i]
    else if (argv[i] === '--target') args.target = argv[++i]
    else if (argv[i] === '--check') args.check = true
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2) }
  }
  if (!args.upstream) {
    console.error('Usage: vendor-project.mjs --upstream <repo-path> [--lock <file>] [--target <dir>] [--check]')
    process.exit(2)
  }
  return args
}

export function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

/**
 * Verify the upstream checkout against the lock (source side of the projection).
 * Pure: returns a report instead of throwing.
 */
export function verifyUpstreamSources(lock, upstreamRoot) {
  const problems = []
  for (const entry of lock.vendoredFiles) {
    const source = join(upstreamRoot, entry.path)
    if (!existsSync(source)) {
      problems.push(`upstream file missing: ${entry.path}`)
      continue
    }
    const digest = sha256Buffer(readFileSync(source))
    if (digest !== entry.sha256) problems.push(`upstream sha256 mismatch: ${entry.path} lock=${entry.sha256} disk=${digest}`)
  }
  return { ok: problems.length === 0, problems, checked: lock.vendoredFiles.length }
}

/**
 * Verify an already-materialized vendored tree against the lock.
 * Reports missing / extra / corrupted files relative to the target dir.
 */
export function verifyVendoredTree(lock, targetDir) {
  const problems = []
  const expected = new Map(lock.vendoredFiles.map((f) => [f.path, f.sha256]))
  const present = new Set()
  if (existsSync(targetDir)) {
    for (const file of walkFiles(targetDir)) {
      const rel = relative(targetDir, file).replace(/\\/g, '/')
      present.add(rel)
      if (!expected.has(rel)) { problems.push(`extra vendored file (not in lock): ${rel}`); continue }
      const digest = sha256Buffer(readFileSync(file))
      if (digest !== expected.get(rel)) problems.push(`vendored sha256 mismatch: ${rel} lock=${expected.get(rel)} disk=${digest}`)
    }
  }
  for (const path of expected.keys()) {
    if (!present.has(path)) problems.push(`missing vendored file: ${path}`)
  }
  return { ok: problems.length === 0, problems, checked: expected.size }
}

export function* walkFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue // projection metadata, not vendored payload
    const p = join(dir, entry.name)
    if (entry.isDirectory()) yield* walkFiles(p)
    else yield p
  }
}

/**
 * Materialize the projection: copy every locked file from the upstream
 * checkout into the target tree (digest-verified), pruning stale entries.
 * Performed into a clean re-write of exactly the locked set — the target
 * ends up containing precisely the locked paths.
 */
export function materializeProjection(lock, upstreamRoot, targetDir) {
  const staging = `${targetDir}.staging`
  rmSync(staging, { recursive: true, force: true })
  mkdirSync(staging, { recursive: true })
  try {
    for (const entry of lock.vendoredFiles) {
      const source = join(upstreamRoot, entry.path)
      const digest = sha256Buffer(readFileSync(source))
      if (digest !== entry.sha256) throw new Error(`upstream sha256 mismatch, refusing to project: ${entry.path}`)
      const dest = join(staging, entry.path)
      mkdirSync(dirname(dest), { recursive: true })
      writeFileSync(dest, readFileSync(source))
    }
    rmSync(targetDir, { recursive: true, force: true })
    mkdirSync(dirname(targetDir), { recursive: true })
    cpSync(staging, targetDir, { recursive: true })
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
  // Pin metadata inside the tree so consumers can detect drift cheaply.
  writeFileSync(
    join(targetDir, '.vendor-projection.json'),
    `${JSON.stringify({ pinnedSha: lock.pinnedSha, desktopHostVersion: lock.desktopHostVersion, fileCount: lock.vendoredFiles.length }, undefined, 2)}\n`,
  )
  return { projected: lock.vendoredFiles.length, pinnedSha: lock.pinnedSha }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const upstreamRoot = args.upstream.replace(/\\/g, '/')
  if (!existsSync(args.lock)) { console.error(`lock file not found: ${args.lock}`); process.exit(1) }
  const lock = JSON.parse(readFileSync(args.lock, 'utf8'))

  if (args.check) {
    const tree = verifyVendoredTree(lock, args.target)
    if (!tree.ok) {
      console.error(`VENDORED TREE CHECK FAILED (${tree.problems.length} problems):`)
      for (const p of tree.problems.slice(0, 50)) console.error(`  - ${p}`)
      if (tree.problems.length > 50) console.error(`  ... and ${tree.problems.length - 50} more`)
      process.exit(1)
    }
    console.log(`vendored tree OK: ${tree.checked} files match lock (pinned ${lock.pinnedSha.slice(0, 8)})`)
    return
  }

  const sources = verifyUpstreamSources(lock, upstreamRoot)
  if (!sources.ok) {
    console.error(`UPSTREAM CHECKOUT does not match lock (${sources.problems.length} problems) — sync first:`)
    for (const p of sources.problems.slice(0, 50)) console.error(`  - ${p}`)
    process.exit(1)
  }
  const result = materializeProjection(lock, upstreamRoot, args.target)
  const verify = verifyVendoredTree(lock, args.target)
  if (!verify.ok) { console.error(`post-projection verification failed: ${verify.problems.length} problems`); process.exit(1) }
  console.log(`projected ${result.projected} files (pinned ${result.pinnedSha.slice(0, 8)}) -> ${args.target}`)
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) {
  main()
}
