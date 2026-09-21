#!/usr/bin/env node
/**
 * verify-package.mjs — task 6.2 size + offline-self-containment verification.
 *
 * Checks the electron-builder output directory (apps/desktop/release):
 *   1. every produced installer artifact (.exe/.dmg/.AppImage) is reported
 *      and checked against the interim ≤500MB/platform installer budget;
 *   2. an unpacked app tree (win-unpacked / linux-unpacked / mac/*.app) embeds
 *      the staged resources the shell resolves at runtime — builtin Node
 *      runtime, vendored host entry, staging manifest — i.e. the install and
 *      first launch need zero network downloads (SC2 install side).
 *
 * Usage: node scripts/verify-package.mjs [--budget-mb 500] [--platform win32|linux|darwin]
 * Exit 0 within budget and self-contained; 1 otherwise.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const RELEASE = join('apps', 'desktop', 'release')

const INSTALLER_EXTENSIONS = new Set(['.exe', '.dmg', '.appimage'])

function parseArgs(argv) {
  const args = { budgetMb: 500, platform: process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux' }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--budget-mb') args.budgetMb = Number(argv[++i])
    else if (argv[i] === '--platform') args.platform = argv[++i]
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2) }
  }
  return args
}

function artifactSizeMb(path) {
  return Math.round(statSync(path).size / 1024 / 1024)
}

function findUnpackedResources(platform) {
  if (platform === 'darwin') {
    const macDir = join(RELEASE, 'mac')
    if (!existsSync(macDir)) return undefined
    const app = readdirSync(macDir).find(entry => entry.endsWith('.app'))
    return app === undefined ? undefined : join(macDir, app, 'Contents', 'Resources')
  }
  const dir = join(RELEASE, platform === 'win32' ? 'win-unpacked' : 'linux-unpacked')
  return existsSync(dir) ? join(dir, 'resources') : undefined
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const budgetBytes = args.budgetMb * 1024 * 1024
  const problems = []
  const artifacts = []

  if (!existsSync(RELEASE)) { console.error('VERIFY FAILED: no electron-builder output directory (apps/desktop/release)'); process.exit(1) }
  for (const entry of readdirSync(RELEASE, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    const ext = entry.name.toLowerCase().match(/(\.[^.]+)$/)?.[1]
    if (ext !== undefined && INSTALLER_EXTENSIONS.has(ext)) {
      const path = join(RELEASE, entry.name)
      artifacts.push({ name: entry.name, sizeMb: artifactSizeMb(path) })
      if (statSync(path).size > budgetBytes) problems.push(`${entry.name} exceeds the ${args.budgetMb}MB interim installer budget`)
    }
  }
  if (artifacts.length === 0) problems.push('no installer artifact produced for this platform')

  const resources = findUnpackedResources(args.platform)
  if (resources === undefined) {
    problems.push(`no unpacked app tree for ${args.platform} — cannot verify embedded resources`)
  } else {
    const nodeExe = join(resources, 'runtime', args.platform === 'win32' ? 'node.exe' : 'bin/node')
    for (const required of [nodeExe, join(resources, 'vendor', 'vendored', 'apps', 'desktop-host', 'src', 'index.ts'), join(resources, 'staging-manifest.json')]) {
      if (!existsSync(required)) problems.push(`unpacked app missing embedded resource: ${required}`)
    }
    // ui-plugin-foundation task 6: the plugin tree's config and every tarball
    // it references must be embedded — the packaged pre-seeding leg must be
    // self-contained (offline NFR).
    const bundlesConfigPath = join(resources, 'plugin-bundles.json')
    if (!existsSync(bundlesConfigPath)) {
      problems.push(`unpacked app missing embedded resource: ${bundlesConfigPath}`)
    } else {
      try {
        const bundles = JSON.parse(readFileSync(bundlesConfigPath, 'utf8')).bundles ?? []
        for (const entry of bundles) {
          if (typeof entry?.source !== 'string' || !entry.source.startsWith('tarball:')) continue
          const tarball = join(resources, entry.source.slice('tarball:'.length))
          if (!existsSync(tarball)) problems.push(`unpacked app missing staged plugin tarball for ${String(entry.name)}: ${tarball}`)
        }
      } catch (error) {
        problems.push(`embedded plugin-bundles.json is not readable: ${String(error)}`)
      }
    }
  }

  const report = { platform: args.platform, budgetMb: args.budgetMb, artifacts, selfContained: problems.length === 0, problems }
  console.log(`PACKAGE_VERIFY ${JSON.stringify(report)}`)
  if (problems.length > 0) {
    for (const problem of problems) console.error(`VERIFY FAILED: ${problem}`)
    process.exit(1)
  }
}

main()
