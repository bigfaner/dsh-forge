// Vendored upstream desktop-host projection + adapter seam.
//
// The vendored tree under `vendored/` is materialized by
// scripts/vendor-project.mjs from the upstream checkout, strictly driven by
// vendor/upstream.lock.json (pinned SHA c36ba648). This module is the stable
// import surface the Electron shell (apps/desktop) programs against; it never
// re-exports upstream code directly — the shell reaches the vendored host
// entry only through the resolved paths exposed here, so the projection
// layout can evolve without touching the shell.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const VENDORED_UPSTREAM_SHA = 'c36ba648dc106d21fb32562793b3e3b9c8922bc4'

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

/** Root of the materialized vendored projection (upstream-relative paths live under it). */
export const VENDORED_ROOT = join(PACKAGE_ROOT, 'vendored')

/** Upstream desktop-host child-process entry (spawned under the builtin Node runtime). */
export const HOST_ENTRY_PATH = join(VENDORED_ROOT, 'apps/desktop-host/src/index.ts')

export interface DesktopHostVendorInfo {
  readonly pinnedSha: string
  readonly projected: boolean
  readonly vendoredFileCount: number | undefined
}

/** Projection metadata written by scripts/vendor-project.mjs next to the payload. */
interface VendorProjectionMeta {
  readonly pinnedSha: string
  readonly desktopHostVersion: string
  readonly fileCount: number
}

function readProjectionMeta(): VendorProjectionMeta | undefined {
  try {
    const value = JSON.parse(readFileSync(join(VENDORED_ROOT, '.vendor-projection.json'), 'utf8')) as Partial<VendorProjectionMeta>
    if (typeof value.pinnedSha !== 'string' || typeof value.fileCount !== 'number') return undefined
    return value as VendorProjectionMeta
  } catch {
    return undefined
  }
}

export function describeVendor(): DesktopHostVendorInfo {
  const meta = readProjectionMeta()
  if (meta === undefined || meta.pinnedSha !== VENDORED_UPSTREAM_SHA) {
    return { pinnedSha: VENDORED_UPSTREAM_SHA, projected: false, vendoredFileCount: undefined }
  }
  return { pinnedSha: VENDORED_UPSTREAM_SHA, projected: true, vendoredFileCount: meta.fileCount }
}

// --- Builtin upstream Node runtime (build-time acquisition) ----------------
//
// The host subprocess must NOT run under Electron's embedded Node (upstream
// production decision inherited via tech-design). scripts/prepare-host-runtime.mjs
// acquires a pinned standalone Node distribution into `runtime/node/<id>/`
// (gitignored — build-time artifact, never committed) and writes a manifest.
// The shell resolves the executable through `resolveBuiltinNode()` below.

export interface BuiltinRuntimeManifest {
  readonly runtimeId: string
  readonly nodeVersion: string
  readonly platform: string
  readonly arch: string
  readonly source: 'nodejs-dist' | 'local-path'
}

const RUNTIME_ROOT = join(PACKAGE_ROOT, 'runtime', 'node')

function readRuntimeManifest(runtimeRoot: string): BuiltinRuntimeManifest | undefined {
  try {
    const value = JSON.parse(readFileSync(join(runtimeRoot, 'runtime.json'), 'utf8')) as Partial<BuiltinRuntimeManifest>
    if (typeof value.runtimeId !== 'string' || typeof value.nodeVersion !== 'string'
      || typeof value.platform !== 'string' || typeof value.arch !== 'string'
      || (value.source !== 'nodejs-dist' && value.source !== 'local-path')) return undefined
    return value as BuiltinRuntimeManifest
  } catch {
    return undefined
  }
}

/** List acquired builtin runtimes (manifest-validated; empty until prepare-host-runtime ran). */
export function listBuiltinRuntimes(): BuiltinRuntimeManifest[] {
  if (!existsSync(RUNTIME_ROOT)) return []
  const runtimes: BuiltinRuntimeManifest[] = []
  for (const entry of readdirSync(RUNTIME_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const manifest = readRuntimeManifest(join(RUNTIME_ROOT, entry.name))
    if (manifest !== undefined) runtimes.push(manifest)
  }
  return runtimes
}

/** Directory of an acquired runtime by id, or null. */
export function builtinRuntimeDir(runtimeId: string): string | null {
  const dir = join(RUNTIME_ROOT, runtimeId)
  return readRuntimeManifest(dir) !== undefined ? dir : null
}

export interface ResolvedBuiltinNode {
  readonly nodeExecutable: string
  readonly manifest: BuiltinRuntimeManifest
}

/**
 * Resolve the Node executable the host subprocess must be spawned with.
 * @param runtimeId - Acquired runtime id (defaults to the single installed one).
 * @throws When no (or ambiguous) builtin runtime is installed — with the
 *   remediation command, so the shell can surface an actionable error.
 */
export function resolveBuiltinNode(runtimeId?: string): ResolvedBuiltinNode {
  const runtimes = listBuiltinRuntimes()
  if (runtimes.length === 0) {
    throw new Error('builtin Node runtime not acquired — run: node scripts/prepare-host-runtime.mjs (or pass --node-path <local-node>)')
  }
  let selected: BuiltinRuntimeManifest | undefined
  if (runtimeId !== undefined) selected = runtimes.find(r => r.runtimeId === runtimeId)
  else if (runtimes.length === 1) selected = runtimes[0]
  if (selected === undefined) {
    throw new Error(runtimeId === undefined
      ? `ambiguous builtin runtimes (${runtimes.map(r => r.runtimeId).join(', ')}) — pass one explicitly`
      : `unknown builtin runtime id: ${runtimeId}`)
  }
  const dir = builtinRuntimeDir(selected.runtimeId)
  if (dir === null) throw new Error(`builtin runtime ${selected.runtimeId} has no valid manifest`)
  const nodeExecutable = process.platform === 'win32' ? join(dir, 'node.exe') : join(dir, 'bin', 'node')
  if (!existsSync(nodeExecutable)) {
    throw new Error(`builtin runtime ${selected.runtimeId} is broken: node executable missing at ${nodeExecutable}`)
  }
  return { nodeExecutable, manifest: selected }
}
