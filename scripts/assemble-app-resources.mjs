#!/usr/bin/env node
/**
 * assemble-app-resources.mjs — task 6.2 packaging staging step.
 *
 * Stages the installer-embedded resources (vendored upstream tree + builtin
 * Node runtime) into apps/desktop/release/staging/, applying the
 * runtime-file-policy trim (scripts/runtime-file-policy.mjs — upstream
 * deepseek-harness approach) and writing a size manifest checked against the
 * interim ≤500MB/platform installer budget (tech-design open question).
 *
 * The electron-builder config (apps/desktop/build/electron-builder.config.mjs)
 * picks the staged tree up as extraResources; the packaged shell resolves the
 * host entry / web root / node executable from process.resourcesPath (see
 * apps/desktop/src/main/index.ts packaged wiring).
 *
 * Usage:
 *   node scripts/assemble-app-resources.mjs [--target linux|darwin|win32] [--arch x64|arm64]
 *     [--budget-mb 500] [--allow-overrun]
 *   node scripts/assemble-app-resources.mjs --check   (verify staging without writes)
 *
 * Exit 0 on success (or budget overrun with --allow-overrun); 1 on failure.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { desktopRuntimeFileExclusion, nodeRuntimeFileExclusion } from './runtime-file-policy.mjs'

const STAGING_ROOT = join('apps', 'desktop', 'release', 'staging')
const VENDOR_PACKAGE = join('packages', 'desktop-host-vendor')
const RUNTIME_ROOT = join(VENDOR_PACKAGE, 'runtime', 'node')

export function parseArgs(argv) {
  const args = { target: process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux', arch: process.arch, budgetMb: 500, allowOverrun: false, check: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--target') args.target = argv[++i]
    else if (argv[i] === '--arch') args.arch = argv[++i]
    else if (argv[i] === '--budget-mb') args.budgetMb = Number(argv[++i])
    else if (argv[i] === '--allow-overrun') args.allowOverrun = true
    else if (argv[i] === '--check') args.check = true
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2) }
  }
  if (!['linux', 'darwin', 'win32'].includes(args.target)) { console.error(`invalid --target: ${args.target}`); process.exit(2) }
  if (!Number.isFinite(args.budgetMb) || args.budgetMb <= 0) { console.error(`invalid --budget-mb: ${args.budgetMb}`); process.exit(2) }
  return args
}

/** Locate the acquired builtin runtime matching the packaging target. */
export function findBuiltinRuntime(target, arch) {
  if (!existsSync(RUNTIME_ROOT)) return undefined
  for (const entry of readdirSync(RUNTIME_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    try {
      const manifest = JSON.parse(readFileSync(join(RUNTIME_ROOT, entry.name, 'runtime.json'), 'utf8'))
      if (manifest.platform === target && manifest.arch === arch && manifest.source === 'nodejs-dist') {
        return { dir: join(RUNTIME_ROOT, entry.name), manifest }
      }
    } catch { /* no valid manifest — skip */ }
  }
  return undefined
}

function copyTree(sourceRoot, destinationRoot, exclude) {
  let keptFiles = 0
  let droppedFiles = 0
  let keptBytes = 0
  let droppedBytes = 0
  const dropReasons = new Map()
  const visit = (dir, rel) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const relPath = rel.length === 0 ? entry.name : `${rel}/${entry.name}`
      const reason = exclude(relPath, entry.isDirectory())
      if (reason !== undefined) {
        droppedFiles += 1
        droppedBytes += entry.isDirectory() ? 0 : statSync(join(dir, entry.name)).size
        dropReasons.set(reason, (dropReasons.get(reason) ?? 0) + 1)
        continue
      }
      const full = join(dir, entry.name)
      if (entry.isDirectory()) visit(full, relPath)
      else if (entry.isFile()) {
        const dest = join(destinationRoot, ...relPath.split('/'))
        mkdirSync(join(dest, '..'), { recursive: true })
        // Plain copy: the staged tree is an installer payload, never rebuilt.
        const bytes = readFileSync(full)
        writeFileSync(dest, bytes)
        keptFiles += 1
        keptBytes += bytes.length
      }
    }
  }
  visit(sourceRoot, '')
  return { keptFiles, droppedFiles, keptBytes, droppedBytes, dropReasons: Object.fromEntries(dropReasons) }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const report = { target: args.target, arch: args.arch, budgetMb: args.budgetMb, runtime: undefined, vendor: undefined, closureNotes: [], stagedBytes: 0, withinBudget: true }

  if (args.check) {
    const manifestPath = join(STAGING_ROOT, 'staging-manifest.json')
    if (!existsSync(manifestPath)) { console.error('CHECK FAILED: no staging manifest — run assemble first'); process.exit(1) }
    const saved = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const problems = []
    for (const required of ['runtime', 'vendor/vendored/.vendor-projection.json', 'vendor/vendored/apps/desktop-host/src/index.ts']) {
      if (!existsSync(join(STAGING_ROOT, required))) problems.push(`missing: ${required}`)
    }
    if (problems.length > 0) { console.error(`CHECK FAILED: ${problems.join('; ')}`); process.exit(1) }
    console.log(`STAGING_CHECK_OK ${JSON.stringify(saved)}`)
    return
  }

  const runtime = findBuiltinRuntime(args.target, args.arch)
  if (runtime === undefined) {
    console.error(`builtin Node runtime for ${args.target}-${args.arch} not acquired — run: node scripts/prepare-host-runtime.mjs --node-version 22.20.0 (on a ${args.target} host or CI runner)`)
    process.exit(1)
  }
  report.runtime = runtime.manifest

  if (!existsSync(join(VENDOR_PACKAGE, 'vendored', '.vendor-projection.json'))) {
    console.error('vendored projection missing — run: node scripts/vendor-project.mjs')
    process.exit(1)
  }

  rmSync(STAGING_ROOT, { recursive: true, force: true })
  mkdirSync(join(STAGING_ROOT, 'runtime'), { recursive: true })
  mkdirSync(join(STAGING_ROOT, 'vendor'), { recursive: true })

  report.runtimeTree = copyTree(runtime.dir, join(STAGING_ROOT, 'runtime'),
    (path, _isDir) => nodeRuntimeFileExclusion(path))
  report.vendorTree = copyTree(join(VENDOR_PACKAGE, 'vendored'), join(STAGING_ROOT, 'vendor', 'vendored'),
    (path, _isDir) => desktopRuntimeFileExclusion(path, { platform: args.target, arch: args.arch }))

  // Closure markers (Spike 2 pending): the host dependency closure and the
  // upstream web dist are installed into the vendored tree by build-time steps
  // that do not exist yet; record their absence so the size report is honest.
  for (const [label, marker] of [['host dependency closure (node_modules)', join(VENDOR_PACKAGE, 'vendored', 'apps', 'desktop-host', 'node_modules')], ['upstream web dist', join(VENDOR_PACKAGE, 'vendored', 'apps', 'web', 'dist')]]) {
    if (!existsSync(marker)) report.closureNotes.push(`${label} not installed yet (Spike 2 / closure install step pending) — staged without it`)
  }

  report.stagedBytes = report.runtimeTree.keptBytes + report.vendorTree.keptBytes
  const budgetBytes = args.budgetMb * 1024 * 1024
  // Interim budget applies to the installer payload (Electron + staged
  // resources); electron-builder reports the final artifact sizes after
  // packaging (scripts/verify-package.mjs). The staging check guards the
  // embedded half alone at half the budget as an early signal.
  const stagingBudgetBytes = budgetBytes / 2
  report.withinBudget = report.stagedBytes <= stagingBudgetBytes || args.allowOverrun

  writeFileSync(join(STAGING_ROOT, 'staging-manifest.json'), `${JSON.stringify(report, undefined, 2)}\n`)
  console.log(`STAGING_ASSEMBLED ${JSON.stringify({ target: report.target, arch: report.arch, runtimeId: report.runtime.runtimeId, stagedBytes: report.stagedBytes, withinBudget: report.withinBudget })}`)
  if (!report.withinBudget) {
    console.error(`staged resources exceed ${Math.round(stagingBudgetBytes / 1024 / 1024)}MB staging half-budget (interim installer budget ${args.budgetMb}MB) — record the deviation and trim, or pass --allow-overrun`)
    process.exit(1)
  }
}

main()
