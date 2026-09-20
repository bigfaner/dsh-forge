/**
 * runtime-file-policy.mjs — dsh-forge packaging trim policy.
 *
 * Adapted from the upstream deepseek-harness desktop packaging policy
 * (apps/desktop/scripts/runtime-file-policy.ts, pinned SHA c36ba648 — sole
 * authority for the trim *approach*). Upstream trims an installed production
 * node_modules closure; dsh-forge applies the same exclusion families to the
 * two trees staged into the installer (task 6.2):
 *
 *   1. desktopRuntimeFileExclusion — the vendored upstream projection plus
 *      (once Spike 2 lands) its installed dependency closure.
 *   2. nodeRuntimeFileExclusion — the standalone builtin Node distribution
 *      acquired by prepare-host-runtime.mjs (the host subprocess runtime).
 *
 * Both are pure functions over relative paths so they are unit-testable and
 * reusable by scripts/assemble-app-resources.mjs and CI (task 6.3).
 */

/** Package-manager metadata directories/files never needed at runtime. */
const PACKAGE_MANAGER_METADATA = new Set(['.bin', '.pnpm', '.modules.yaml', '.pnpm-workspace-state-v1.json', '.cache'])

/** Files inside the standalone Node distribution that the host never touches. */
const NODE_DIST_DROP_DIRS = new Set(['npm', 'node_modules', 'corepack', 'include'])
const NODE_DIST_DROP_FILES = new Set([
  'CHANGELOG.md', 'LICENSE', 'README.md', 'install_tools.bat', 'install_tools.sh',
])

/**
 * Exclusion families for the vendored desktop-host tree / dependency closure
 * (upstream runtime-file-policy approach, dsh-forge scope).
 * @param {string} path - Path relative to the staged vendor root.
 * @param {{ platform: string, arch: string }} target - Packaging target.
 * @returns {string | undefined} Exclusion reason; undefined = keep the entry.
 */
export function desktopRuntimeFileExclusion(path, target) {
  const parts = path.split(/[\\/]/u)
  if (parts.some(part => PACKAGE_MANAGER_METADATA.has(part))) return 'package-manager metadata'
  const file = parts.at(-1) ?? ''
  if (/\.(?:[cm]?[jt]s|css)\.map$/u.test(file)) return 'source map'
  if (/\.d\.[cm]?ts$/u.test(file)) return 'TypeScript declaration'
  if (/\.(?:tsbuildinfo|flow|coffee|markdown|md|coffee\.md)$/u.test(file)
    && !/LICENSE|NOTICE|README/iu.test(file)) {
    // Docs/build caches — keep license-bearing files for attribution.
    if (/\.(?:tsbuildinfo)$/u.test(file)) return 'TypeScript build cache'
    return 'documentation'
  }
  if (file === '.DS_Store' || file === 'Thumbs.db') return 'OS metadata'
  const packageParts = parts.slice(parts.lastIndexOf('node_modules') + 1)
  if (packageParts.length === 0 || parts.lastIndexOf('node_modules') < 0) return undefined
  const nameParts = packageParts[0]?.startsWith('@') ? 2 : 1
  const name = packageParts.slice(0, nameParts).join('/')
  const entry = packageParts.slice(nameParts).join('/')
  // node-pty ships prebuilds for every platform; keep only the target one and
  // strip debug symbols (upstream policy; Spike 1: 26.9MB → 2.65MB on linux).
  if (name === 'node-pty' && entry.startsWith('prebuilds/')) {
    const platform = packageParts[nameParts + 1]
    if (platform !== undefined && platform !== `${target.platform}-${target.arch}`) return 'node-pty other platform'
    if (file.endsWith('.pdb')) return 'node-pty debug symbols'
  }
  if (name === '@koromix/koffi-win32-x64' && entry === 'win32_x64/koffi.lib') return 'Koffi import library'
  return undefined
}

/**
 * Exclusions for the standalone builtin Node distribution staged as the host
 * runtime. The host spawns plain JS/TS entry files — npm, corepack, headers
 * and docs are dead weight in the installer.
 * @param {string} path - Path relative to the staged runtime root.
 * @returns {string | undefined} Exclusion reason; undefined = keep the entry.
 */
export function nodeRuntimeFileExclusion(path) {
  const parts = path.split(/[\\/]/u)
  const file = parts.at(-1) ?? ''
  if (parts.length > 1 && NODE_DIST_DROP_DIRS.has(parts[0])) return `node dist ${parts[0]}`
  if (parts.length === 1 && NODE_DIST_DROP_FILES.has(file)) return 'node dist metadata'
  // Windows distribution ships npm/corepack shims next to node.exe (root only —
  // the unix layout keeps everything under bin/).
  if (parts.length === 1
    && ['npm', 'npm.cmd', 'npm.ps1', 'npx', 'npx.cmd', 'npx.ps1', 'corepack', 'corepack.cmd', 'corepack.ps1'].includes(file)) {
    return 'node dist tool shim'
  }
  return undefined
}
