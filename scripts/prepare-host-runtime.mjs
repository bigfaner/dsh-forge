#!/usr/bin/env node
/**
 * prepare-host-runtime.mjs
 *
 * Build-time acquisition of the builtin upstream Node runtime that the
 * desktop-host subprocess runs under (Electron's embedded Node must NOT be
 * used — upstream production decision inherited via tech-design).
 *
 * Modes:
 *   download (default)  Fetch the pinned standalone Node distribution from
 *                       nodejs.org/dist (sha256 verified against the official
 *                       SHA256SUMS.txt), extract it into
 *                       packages/desktop-host-vendor/runtime/node/<runtimeId>/
 *                       and write a runtime.json manifest. The runtime tree is
 *                       a build artifact — gitignored, never committed.
 *   --node-path <exe>   Local-path mode for restricted environments / quick
 *                       wiring verification: copies the given node executable
 *                       into the runtime dir, records its version, and marks
 *                       source=local-path in the manifest.
 *   --check             Verify an acquired runtime (manifest + executable +
 *                       reported version) without network or writes.
 *
 * Usage:
 *   node scripts/prepare-host-runtime.mjs [--node-version 22.20.0] [--cache-dir <dir>]
 *   node scripts/prepare-host-runtime.mjs --node-path C:/path/to/node.exe
 *   node scripts/prepare-host-runtime.mjs --check
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const DEFAULT_NODE_VERSION = '22.20.0'
const VENDOR_PACKAGE = 'packages/desktop-host-vendor'
const RUNTIME_ROOT = join(VENDOR_PACKAGE, 'runtime', 'node')
const DIST_BASE = 'https://nodejs.org/dist'

export function parseArgs(argv) {
  const args = { mode: 'download', nodeVersion: DEFAULT_NODE_VERSION, nodePath: null, cacheDir: '.cache/node-dist', check: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--node-version') args.nodeVersion = argv[++i]
    else if (argv[i] === '--node-path') { args.nodePath = argv[++i]; args.mode = 'local' }
    else if (argv[i] === '--cache-dir') args.cacheDir = argv[++i]
    else if (argv[i] === '--check') args.check = true
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2) }
  }
  if (!/^\d+\.\d+\.\d+$/.test(args.nodeVersion)) { console.error(`invalid --node-version: ${args.nodeVersion}`); process.exit(2) }
  return args
}

export function distArchiveName(nodeVersion, platform, arch) {
  const os = platform === 'win32' ? 'win' : platform === 'darwin' ? 'darwin' : 'linux'
  const ext = platform === 'win32' ? 'zip' : 'tar.gz'
  return `node-v${nodeVersion}-${os}-${arch}.${ext}`
}

export function runtimeId(nodeVersion, platform, arch, source) {
  return `node-${nodeVersion}-${platform}-${arch}${source === 'local-path' ? '-local' : ''}`
}

export function writeRuntimeManifest(dir, manifest) {
  writeFileSync(join(dir, 'runtime.json'), `${JSON.stringify(manifest, undefined, 2)}\n`)
}

/** Verify a digest against the official SHA256SUMS for the release. */
export async function verifyDistDigest(nodeVersion, archiveName, archiveBuffer, fetchImpl = fetch) {
  const response = await fetchImpl(`${DIST_BASE}/v${nodeVersion}/SHASUMS256.txt`)
  if (!response.ok) throw new Error(`cannot fetch SHASUMS256.txt (HTTP ${response.status})`)
  const text = await response.text()
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([0-9a-f]{64})\s+\*?(\S+)$/)
    if (match && match[2] === archiveName) {
      const digest = createHash('sha256').update(archiveBuffer).digest('hex')
      if (digest !== match[1]) throw new Error(`sha256 mismatch for ${archiveName}: expected ${match[1]}, got ${digest}`)
      return match[1]
    }
  }
  throw new Error(`${archiveName} not listed in SHASUMS256.txt for v${nodeVersion}`)
}

/** Extract an archive into dir, flattening the single top-level dist folder. zip (win32) goes through PowerShell Expand-Archive (bsdtar is not assumed present); tar.gz uses tar. */
export function extractArchive(archive, dir) {
  mkdirSync(dir, { recursive: true })
  const staging = `${dir}.extract`
  rmSync(staging, { recursive: true, force: true })
  mkdirSync(staging, { recursive: true })
  try {
    if (archive.endsWith('.zip')) {
      execFileSync('powershell', ['-NoProfile', '-Command', 'Expand-Archive', '-LiteralPath', archive, '-DestinationPath', staging], { stdio: 'ignore' })
    } else {
      execFileSync('tar', ['-xf', archive, '-C', staging], { stdio: 'ignore' })
    }
    const entries = readdirSync(staging)
    const inner = entries.length === 1 ? join(staging, entries[0]) : staging
    for (const entry of readdirSync(inner)) {
      renameSync(join(inner, entry), join(dir, entry))
    }
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

function nodeExecutablePath(dir, platform) {
  return platform === 'win32' ? join(dir, 'node.exe') : join(dir, 'bin', 'node')
}

function reportVersion(executable) {
  return execFileSync(executable, ['--version'], { encoding: 'utf8' }).trim()
}

async function acquireDownload(args) {
  const platform = process.platform
  const arch = process.arch
  const archiveName = distArchiveName(args.nodeVersion, platform, arch)
  const id = runtimeId(args.nodeVersion, platform, arch, 'nodejs-dist')
  const target = join(RUNTIME_ROOT, id)

  const cachePath = join(args.cacheDir, archiveName)
  let buffer
  if (existsSync(cachePath)) {
    buffer = readFileSync(cachePath)
    console.log(`using cached dist: ${cachePath}`)
  } else {
    const url = `${DIST_BASE}/v${args.nodeVersion}/${archiveName}`
    console.log(`downloading ${url} ...`)
    const response = await fetch(url)
    if (!response.ok) throw new Error(`download failed (HTTP ${response.status})`)
    buffer = Buffer.from(await response.arrayBuffer())
    mkdirSync(args.cacheDir, { recursive: true })
    writeFileSync(cachePath, buffer)
    console.log(`cached ${buffer.length} bytes -> ${cachePath}`)
  }
  const digest = await verifyDistDigest(args.nodeVersion, archiveName, buffer)
  console.log(`dist sha256 verified: ${digest.slice(0, 16)}...`)

  rmSync(target, { recursive: true, force: true })
  extractArchive(cachePath, target)
  const executable = nodeExecutablePath(target, platform)
  if (platform !== 'win32') chmodSync(executable, 0o755)
  if (!existsSync(executable)) throw new Error(`extraction did not produce node executable at ${executable}`)
  const reported = reportVersion(executable)
  if (reported !== `v${args.nodeVersion}`) throw new Error(`unexpected node version: ${reported} (wanted v${args.nodeVersion})`)

  writeRuntimeManifest(target, {
    runtimeId: id,
    nodeVersion: args.nodeVersion,
    platform,
    arch,
    source: 'nodejs-dist',
  })
  console.log(`builtin runtime acquired: ${id} (${reported}) -> ${target}`)
  console.log('smoke: node scripts/smoke-host-entry.mjs')
}

function acquireLocal(args) {
  if (!args.nodePath || !existsSync(args.nodePath)) throw new Error(`--node-path not found: ${args.nodePath}`)
  const platform = process.platform
  const arch = process.arch
  const nodeVersion = reportVersion(args.nodePath).replace(/^v/, '')
  const id = runtimeId(nodeVersion, platform, arch, 'local-path')
  const target = join(RUNTIME_ROOT, id)
  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })
  if (platform === 'win32') cpSync(args.nodePath, join(target, 'node.exe'))
  else {
    mkdirSync(join(target, 'bin'), { recursive: true })
    cpSync(args.nodePath, join(target, 'bin', 'node'))
    chmodSync(join(target, 'bin', 'node'), 0o755)
  }
  writeRuntimeManifest(target, { runtimeId: id, nodeVersion, platform, arch, source: 'local-path' })
  console.log(`builtin runtime (local-path) acquired: ${id} -> ${target}`)
  console.log('NOTE: local-path mode copies a pre-existing node binary for wiring verification; production builds must use the download mode.')
}

function check() {
  const dir = join(VENDOR_PACKAGE, 'runtime', 'node')
  if (!existsSync(dir)) { console.error('no builtin runtime acquired (run without --check first)'); process.exit(1) }
  let found = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const target = join(dir, entry.name)
    let manifest
    try { manifest = JSON.parse(readFileSync(join(target, 'runtime.json'), 'utf8')) } catch { console.error(`invalid manifest: ${entry.name}`); process.exit(1) }
    const executable = nodeExecutablePath(target, manifest.platform)
    if (!existsSync(executable)) { console.error(`missing executable: ${executable}`); process.exit(1) }
    console.log(`runtime OK: ${manifest.runtimeId} (${reportVersion(executable)}, source=${manifest.source})`)
    found++
  }
  if (found === 0) { console.error('no builtin runtime acquired'); process.exit(1) }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.check) { check(); return }
  if (args.mode === 'local') { acquireLocal(args); return }
  await acquireDownload(args)
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) {
  await main()
}
